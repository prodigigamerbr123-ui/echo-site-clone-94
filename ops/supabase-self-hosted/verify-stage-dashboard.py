#!/usr/bin/env python3
"""Read-only dashboard RPC checks with disposable rows in isolated staging."""
import hashlib,json,pathlib,secrets,subprocess,tarfile,urllib.error,urllib.request,uuid
ROOT=pathlib.Path('/opt/workout-stage-security-20261012')
PREFIX='workout-stage-full-20261012'
DB=PREFIX+'-db'
credentials=json.loads((ROOT/'credentials.json').read_text())
checks=[]
def run(args,data=None):
    result=subprocess.run(args,input=data,capture_output=True)
    if result.returncode:
        (ROOT/'dashboard-error.log').write_bytes(result.stdout+result.stderr)
        raise RuntimeError('Staging command failed; inspect restricted log')
    return result.stdout
def sql(statement):
    return run(['docker','exec','-i',DB,'psql','-U','stage_bootstrap','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-f','-'],statement.encode()).decode().strip()
def check(name,ok):
    if not ok: raise RuntimeError('Dashboard check failed: '+name)
    checks.append(name)
def call(path,body=None,token=None):
    headers={'apikey':credentials['anon'],'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request('http://127.0.0.1:18090'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=30) as response:
            return response.status,json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code,json.loads(error.read())

check('internal_network',json.loads(run(['docker','network','inspect',PREFIX+'-net']))[0]['Internal'])
env=dict(item.split('=',1) for item in json.loads(run(['docker','inspect',PREFIX+'-edge']))[0]['Config']['Env'])
check('no_provider_credentials',not any(env.get(k) for k in ['EVOLUTION_API_URL','EVOLUTION_INSTANCE_TOKEN','GEMINI_API_KEY','LOVABLE_API_KEY']))
baseline=sql('SELECT count(*) FROM public.students; SELECT count(*) FROM public.scheduled_messages; SELECT count(*) FROM public.evaluations; SELECT count(*) FROM auth.users;')
before={}
user_id=None
fixture_ids=[]
try:
    manifest=json.loads((ROOT/'dashboard-package.json').read_text())
    allowed={'_shared/database.types.ts','_shared/messageTemplates.ts','_shared/templateResolver.ts',
             '_shared/dashboardContracts.ts','_shared/contracts.ts','_shared/aiContracts.ts','daily-briefing/index.ts','dashboard.sql'}
    if set(manifest)!=allowed: raise RuntimeError('Unexpected package files')
    with tarfile.open(ROOT/'dashboard-package.tar.gz') as archive:
        for name,expected in manifest.items():
            member=archive.getmember(name)
            if not member.isfile() or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts: raise RuntimeError('Unsafe archive')
            content=archive.extractfile(member).read()
            check('hash_'+name,hashlib.sha256(content).hexdigest()==expected)
            if name=='dashboard.sql':
                target=ROOT/'dashboard.sql'
            else:
                target=ROOT/'functions'/name
                before[name]=target.read_bytes() if target.exists() else None
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(content)
    if sql("SELECT to_regprocedure('public.get_workout_dashboard()') IS NULL")=='t':
        sql((ROOT/'dashboard.sql').read_text())
    else:
        raise RuntimeError('Dashboard function already exists; review before reapplying')
    sql("NOTIFY pgrst,'reload schema';")
    run(['docker','restart',PREFIX+'-edge'])
    run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
    suffix=str(uuid.uuid4())
    email='dashboard-'+suffix+'@workout.test'
    password=secrets.token_urlsafe(32)
    status,user=call('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},credentials['service'])
    check('fixture_auth',status==200)
    user_id=str(uuid.UUID(user['id']))
    sql("INSERT INTO public.staff_members(user_id,role) VALUES ('"+user_id+"','admin');")
    status,login=call('/auth/v1/token?grant_type=password',{'email':email,'password':password})
    check('fixture_login',status==200)
    token=login['access_token']
    status,_=call('/rest/v1/rpc/get_workout_dashboard',{})
    check('anonymous_rpc_blocked',status in (401,403))
    status,initial=call('/rest/v1/rpc/get_workout_dashboard',{},token)
    check('authenticated_rpc',status==200 and initial['version']==1)
    fixture_ids=[str(uuid.uuid4()) for _ in range(1005)]
    values=','.join("('"+id+"','Dashboard fixture','fixture-"+id+"','active',(now() AT TIME ZONE 'America/Sao_Paulo')::date,(now() AT TIME ZONE 'America/Sao_Paulo')::date-1)" for id in fixture_ids)
    sql('INSERT INTO public.students(id,name,phone,status,birth_date,payment_due_date) VALUES '+values+';')
    status,result=call('/rest/v1/rpc/get_workout_dashboard',{},token)
    check('count_beyond_rest_cap',status==200 and result['stats']['totalStudents']==initial['stats']['totalStudents']+1005)
    check('birthdays_beyond_rest_cap',result['stats']['birthdaysToday']==initial['stats']['birthdaysToday']+1005)
    check('active_payment_count',result['stats']['paymentOverdueCount']==initial['stats']['paymentOverdueCount']+1005)
    check('complete_actions',len([a for a in result['actions'] if a['id'] in fixture_ids and a['type']=='birthday'])==1005)
    check('explicit_name_sample',len(result['birthdayNames'])==20)
    sql("UPDATE public.staff_members SET role='avaliador' WHERE user_id='"+user_id+"';")
    status,evaluator=call('/rest/v1/rpc/get_workout_dashboard',{},token)
    check('evaluator_keeps_student_counts',status==200 and evaluator['stats']['totalStudents']==result['stats']['totalStudents'])
    check('evaluator_message_counts_unavailable',evaluator['stats']['messagesSentToday'] is None and evaluator['stats']['messagesToSendToday'] is None)
    check('evaluator_has_no_messaging_actions',evaluator['actions']==[])
    sql("UPDATE public.staff_members SET active=false WHERE user_id='"+user_id+"';")
    status,_=call('/rest/v1/rpc/get_workout_dashboard',{},token)
    check('inactive_staff_blocked',status==403)
finally:
    if fixture_ids: sql("DELETE FROM public.students WHERE id=ANY('{"+','.join(fixture_ids)+"}'::uuid[]);")
    if user_id:
        req=urllib.request.Request('http://127.0.0.1:18090/auth/v1/admin/users/'+user_id,method='DELETE',headers={'apikey':credentials['anon'],'Authorization':'Bearer '+credentials['service']})
        with urllib.request.urlopen(req,timeout=30) as response: check('fixture_auth_removed',response.status==200)
    for name,content in before.items():
        target=ROOT/'functions'/name
        if content is None: target.unlink(missing_ok=True)
        else: target.write_bytes(content)
    run(['docker','restart',PREFIX+'-edge'])
    run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
    check('baseline_restored',sql('SELECT count(*) FROM public.students; SELECT count(*) FROM public.scheduled_messages; SELECT count(*) FROM public.evaluations; SELECT count(*) FROM auth.users;')==baseline)
    check('runtime_restored',all((ROOT/'functions'/n).read_bytes()==c if c is not None else not (ROOT/'functions'/n).exists() for n,c in before.items()))
result={'checks':checks,'production':False,'provider_calls':0,'fixture_students':1005,'runtime_restored':True}
(ROOT/'dashboard-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
