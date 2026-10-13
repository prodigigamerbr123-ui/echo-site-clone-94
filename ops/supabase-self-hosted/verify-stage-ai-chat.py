#!/usr/bin/env python3
"""Exercise durable chat with a local offline provider in the isolated stack."""
import datetime,hashlib,json,pathlib,secrets,subprocess,sys,tarfile,urllib.error,urllib.request,uuid
ROOT=pathlib.Path('/opt/workout-stage-security-20261012')
PREFIX='workout-stage-full-20261012'
DB=PREFIX+'-db'
credentials=json.loads((ROOT/'credentials.json').read_text())
checks=[]
offline_count=0
offline_created=False
OFFLINE=PREFIX+'-chat-offline'
def run(args,data=None):
    r=subprocess.run(args,input=data,capture_output=True)
    if r.returncode:
        (ROOT/'ai-chat-error.log').write_bytes(r.stdout+r.stderr)
        raise RuntimeError('Staging command failed; inspect restricted log')
    return r.stdout
def sql(statement):
    return run(['docker','exec','-i',DB,'psql','-U','stage_bootstrap','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-f','-'],statement.encode()).decode().strip()
def check(name,ok):
    if not ok: raise RuntimeError('Chat check failed: '+name)
    checks.append(name)
def call(path,body=None,token=None,method=None):
    headers={'apikey':credentials['anon'],'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request('http://127.0.0.1:18090'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=45) as response:
            raw=response.read();return response.status,json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        return error.code,json.loads(error.read())
fixture_phone='fixture-'+uuid.uuid4().hex[:12]
def provider_requests():
    return json.loads(run(['docker','exec',PREFIX+'-gateway','wget','-qO-','http://chat-offline:9000/stats']))['calls']

network=json.loads(run(['docker','network','inspect',PREFIX+'-net']))[0]
check('internal_network',network['Internal'])
env=dict(item.split('=',1) for item in json.loads(run(['docker','inspect',PREFIX+'-edge']))[0]['Config']['Env'])
check('no_real_provider_credentials',not any(env.get(k) for k in ['EVOLUTION_API_URL','EVOLUTION_INSTANCE_TOKEN','GEMINI_API_KEY','LOVABLE_API_KEY']))
baseline_statement='SELECT count(*) FROM public.students; SELECT count(*) FROM public.scheduled_messages; SELECT count(*) FROM public.ai_conversations; SELECT count(*) FROM public.ai_messages; SELECT count(*) FROM auth.users; SELECT count(*) FROM public.ai_pending_actions;'
baseline=sql(baseline_statement)
before={}
users=[]
conversations=[]
provider_path=ROOT/'functions/_shared/aiProvider.ts'
provider_before=provider_path.read_bytes()
try:
    if subprocess.run(['docker','inspect',OFFLINE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
        raise RuntimeError('Offline fixture container already exists; review before reusing')
    fixture_dir=ROOT/'offline-ai-provider';fixture_dir.mkdir(exist_ok=True)
    stub="""const calls: string[] = [];
Deno.serve(async req => {
  if (new URL(req.url).pathname === '/stats') return Response.json({calls});
  const body = await req.json();
  const last = [...(body.messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? '';
  calls.push(last);
  const message = last === 'CHAT_FIXTURE_PROPOSAL' ? {
    role: 'assistant', content: 'Confirme esta proposta de teste offline.',
    tool_calls: [{id: 'fixture-call',type: 'function',function: {name: 'create_student',
      arguments: JSON.stringify({name: 'Fixture chat offline',phone: PHONE})}}]
  } : {role: 'assistant',content: 'Resposta do provedor offline de staging.'};
  return Response.json({choices:[{message}]});
});
""".replace('PHONE',json.dumps(fixture_phone))
    (fixture_dir/'index.ts').write_text(stub)
    image=json.loads(run(['docker','inspect',PREFIX+'-edge']))[0]['Config']['Image']
    run(['docker','run','-d','--name',OFFLINE,'--network',PREFIX+'-net','--network-alias','chat-offline','--memory','256m','--cpus','0.5',
      '-v',str(fixture_dir)+':/home/deno/functions/main:ro',image,'start','--main-service','/home/deno/functions/main'])
    offline_created=True
    manifest=json.loads((ROOT/'ai-chat-package.json').read_text())
    allowed={'_shared/database.types.ts','_shared/aiChatContracts.ts','_shared/aiContracts.ts','_shared/contracts.ts',
      '_shared/evaluations.ts','_shared/messageTemplates.ts','_shared/templateResolver.ts','ai-assistant/index.ts','chat.sql'}
    if set(manifest)!=allowed: raise RuntimeError('Unexpected package files')
    with tarfile.open(ROOT/'ai-chat-package.tar.gz') as archive:
        for name,expected in manifest.items():
            member=archive.getmember(name)
            if not member.isfile() or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts: raise RuntimeError('Unsafe package')
            content=archive.extractfile(member).read();check('hash_'+name,hashlib.sha256(content).hexdigest()==expected)
            target=ROOT/'chat.sql' if name=='chat.sql' else ROOT/'functions'/name
            if name!='chat.sql': before[name]=target.read_bytes() if target.exists() else None
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
    if sql("SELECT to_regprocedure('public.get_ai_conversation_history(uuid)') IS NULL")=='t':
        sql((ROOT/'chat.sql').read_text())
        (ROOT/'ai-chat-schema.sha256').write_text(manifest['chat.sql'])
    elif '--resume-schema' in sys.argv:
        check('existing_schema_signature',sql("SELECT to_regprocedure('public.append_ai_message_tx(uuid,uuid,text,text,uuid,uuid)') IS NOT NULL AND to_regprocedure('public.reject_ai_action_tx(uuid,uuid)') IS NOT NULL")=='t')
        marker=ROOT/'ai-chat-schema.sha256'
        if marker.exists() and marker.read_text()!=manifest['chat.sql']: raise RuntimeError('Staging schema source differs')
        marker.write_text(manifest['chat.sql'])
    else:
        raise RuntimeError('Chat migration already applied; review state')
    sql("NOTIFY pgrst,'reload schema';")
    provider_path.write_text('export function getAIProvider(_model: string) { return '+json.dumps({'apiKey':'offline-fixture','url':'http://chat-offline:9000','model':'staging-offline'})+'; }\n')
    run(['docker','restart',PREFIX+'-edge']);run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
    tokens=[]
    for role in ['admin','recepcao']:
        email='chat-'+str(uuid.uuid4())+'@workout.test';password=secrets.token_urlsafe(32)
        status,user=call('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},credentials['service'])
        check('auth_fixture_'+role,status==200);user_id=str(uuid.UUID(user['id']));users.append(user_id)
        sql("INSERT INTO public.staff_members(user_id,role) VALUES ('"+user_id+"','"+role+"');")
        status,login=call('/auth/v1/token?grant_type=password',{'email':email,'password':password})
        check('login_'+role,status==200);tokens.append(login['access_token'])
    token=tokens[0]
    conv=str(uuid.uuid4());conversations.append(conv)
    status,_=call('/rest/v1/ai_conversations',{'id':conv,'title':'Fixture chat offline'},token)
    check('conversation_created',status==201)
    def append(id,role,content,action=None,reply_to=None):
        return call('/rest/v1/rpc/append_ai_message_tx',{'_id':id,'_conversation_id':conv,'_role':role,'_content':content,'_action_id':action,'_reply_to':reply_to},token)
    def history():
        status,h=call('/rest/v1/rpc/get_ai_conversation_history',{'_conversation_id':conv},token)
        check('history_read',status==200);return h['messages']
    status,_=call('/rest/v1/rpc/get_ai_conversation_history',{'_conversation_id':conv})
    check('anonymous_history_blocked',status in (401,403))
    status,_=call('/rest/v1/rpc/get_ai_conversation_history',{'_conversation_id':conv},tokens[1])
    check('other_owner_history_blocked',status==403)
    question=str(uuid.uuid4());response=str(uuid.uuid4())
    check('question_saved',append(question,'user','CHAT_FIXTURE_PROPOSAL')[0]==200)
    check('question_retry_idempotent',append(question,'user','CHAT_FIXTURE_PROPOSAL')[0]==200 and len(history())==1)
    request={'conversationId':conv,'requestMessageId':question,'responseMessageId':response,
      'messages':[{'role':'user','content':'Forged browser context'}]}
    status,result=call('/functions/v1/ai-assistant',request,token)
    if not (status==200 and result.get('pendingAction',{}).get('tool')=='create_student'):
        (ROOT/'ai-chat-diagnostic.json').write_text(json.dumps({'status':status,'response':result,'offline_calls':len(provider_requests())}))
    check('offline_proposal_generated',status==200 and result.get('pendingAction',{}).get('tool')=='create_student')
    check('saved_history_is_authoritative',provider_requests()[-1]=='CHAT_FIXTURE_PROPOSAL')
    check('assistant_saved_before_response',result.get('historySaved') is True)
    action=result['pendingAction']['id']
    check('pending_card_restored',any(m['id']==response and m['pendingAction']['id']==action and m['actionState']=='pending' and m['replyTo']==question for m in history()))
    count=len(provider_requests())
    status,recovered=call('/functions/v1/ai-assistant',request,token)
    check('saved_response_retry_no_provider_call',status==200 and recovered['pendingAction']['id']==action and len(provider_requests())==count)
    wrong_question=str(uuid.uuid4());append(wrong_question,'user','Outra pergunta')
    status,_=call('/functions/v1/ai-assistant',{**request,'requestMessageId':wrong_question},token)
    check('response_id_cannot_change_request',status==400 and len(provider_requests())==count)
    cancel_response=str(uuid.uuid4())
    status,cancel=call('/functions/v1/ai-assistant',{'conversationId':conv,'requestMessageId':response,
      'responseMessageId':cancel_response,'rejectedAction':{'id':action}},token)
    check('cancel_persisted',status==200 and cancel.get('actionState')=='rejected' and cancel.get('historySaved') is True)
    check('cancel_survives_reload',next(m for m in history() if m['id']==response)['actionState']=='rejected')
    status,_=call('/functions/v1/ai-assistant',{'conversationId':conv,'requestMessageId':response,
      'responseMessageId':str(uuid.uuid4()),'confirmedAction':{'id':action}},token)
    check('cancelled_proposal_cannot_execute',status==409 and sql("SELECT count(*) FROM public.students WHERE phone='"+fixture_phone+"'")=='0')
    new_question=str(uuid.uuid4());new_response=str(uuid.uuid4());append(new_question,'user','CHAT_FIXTURE_PROPOSAL')
    status,proposal=call('/functions/v1/ai-assistant',{'conversationId':conv,'requestMessageId':new_question,'responseMessageId':new_response},token)
    check('second_offline_proposal',status==200 and proposal.get('historySaved') is True)
    action2=proposal['pendingAction']['id'];completed_response=str(uuid.uuid4())
    execution={'conversationId':conv,'requestMessageId':new_response,'responseMessageId':completed_response,'confirmedAction':{'id':action2}}
    status,completed=call('/functions/v1/ai-assistant',execution,token)
    check('confirmation_persists_result',status==200 and completed.get('actionState')=='completed' and completed.get('historySaved') is True)
    check('completed_card_restored',next(m for m in history() if m['id']==new_response)['actionState']=='completed')
    count=len(provider_requests());status,_=call('/functions/v1/ai-assistant',execution,token)
    check('confirmation_retry_no_duplicate',status==200 and len(provider_requests())==count and sql("SELECT count(*) FROM public.students WHERE phone='"+fixture_phone+"'")=='1')
    failed_action=str(uuid.uuid4());failed_card=str(uuid.uuid4())
    sql("INSERT INTO public.ai_pending_actions(id,owner_id,conversation_id,tool,args,description) VALUES ('"+failed_action+"','"+users[0]+"','"+conv+"','create_student','{\"name\":42}','Invalid fixture');")
    check('invalid_proposal_fixture_linked',append(failed_card,'assistant','Fixture inválida',failed_action,new_question)[0]==200)
    status,failed=call('/functions/v1/ai-assistant',{'conversationId':conv,'requestMessageId':failed_card,
      'responseMessageId':str(uuid.uuid4()),'confirmedAction':{'id':failed_action}},token)
    check('http_200_failure_has_failed_state',status==200 and failed.get('actionState')=='failed' and failed.get('historySaved') is True)
    check('failed_card_restored',next(m for m in history() if m['id']==failed_card)['actionState']=='failed')
    check('queue_unchanged',sql('SELECT count(*) FROM public.scheduled_messages')==baseline.splitlines()[1])
finally:
    try:
        sql("DELETE FROM public.students WHERE phone='"+fixture_phone+"';")
        if conversations:
            sql("UPDATE public.ai_pending_actions SET state='failed' WHERE conversation_id=ANY('{"+','.join(conversations)+"}'::uuid[]) AND state='executing'; DELETE FROM public.ai_conversations WHERE id=ANY('{"+','.join(conversations)+"}'::uuid[]);")
        for user_id in users:
            status,_=call('/auth/v1/admin/users/'+user_id,token=credentials['service'],method='DELETE')
            check('auth_fixture_removed',status==200)
    finally:
        provider_path.write_bytes(provider_before)
        for name,content in before.items():
            target=ROOT/'functions'/name
            if content is None: target.unlink(missing_ok=True)
            else: target.write_bytes(content)
        run(['docker','restart',PREFIX+'-edge']);run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
        if offline_created:
            try: offline_count=len(provider_requests())
            finally: run(['docker','rm','-f',OFFLINE])
    check('baseline_restored',sql(baseline_statement)==baseline)
    check('provider_source_restored',provider_path.read_bytes()==provider_before)
    check('runtime_restored',all((ROOT/'functions'/n).read_bytes()==c if c is not None else not (ROOT/'functions'/n).exists() for n,c in before.items()))
result={'checks':checks,'real_provider_calls':0,'offline_provider_calls':offline_count,'production_changed':False,'runtime_restored':True}
(ROOT/'ai-chat-validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
