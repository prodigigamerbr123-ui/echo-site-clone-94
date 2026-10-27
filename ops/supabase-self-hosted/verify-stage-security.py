#!/usr/bin/env python3
"""Validate real staged Auth + PostgREST + Edge Runtime; print counts only."""
import datetime, json, pathlib, runpy, secrets, time, urllib.request, urllib.error, urllib.parse, uuid
ROOT=pathlib.Path('/opt/workout-stage-security-20261012')
g=runpy.run_path(str(ROOT/'stage-security.py'))
sql=g['sql']; creds=json.loads((ROOT/'credentials.json').read_text())
BASE='http://127.0.0.1:18090'; checks=[]
def request(path, body=None, token=None, method='POST'):
    data=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(BASE+path,data=data,method=method,headers={'Content-Type':'application/json','apikey':creds['anon'],'Authorization':'Bearer '+(token or creds['anon'])})
    try:
        with urllib.request.urlopen(req,timeout=20) as r: return r.status,json.loads(r.read() or 'null')
    except urllib.error.HTTPError as e:
        raw=e.read()
        try: payload=json.loads(raw)
        except: payload=None
        return e.code,payload

def expect(name, actual, expected):
    if actual!=expected: raise RuntimeError(name+': expected '+str(expected)+', got '+str(actual))
    checks.append(name)

for _ in range(30):
    try:
        status,_=request('/auth/v1/health',method='GET')
        if status==200: break
    except: pass
    time.sleep(.5)
else: raise RuntimeError('Staged Auth did not become healthy')
admin_id=sql("SELECT user_id FROM public.staff_members WHERE role='admin' AND active;").decode().strip()
pw=secrets.token_urlsafe(30)
status,_=request('/auth/v1/admin/users/'+admin_id,{'password':pw,'email_confirm':True},creds['service'],'PUT')
expect('staging_admin_password',status,200)
users={'admin':{'id':admin_id,'email':'admin@admin.com'}}
for key,role in [('reception','recepcao'),('evaluator','avaliador'),('stranger',None)]:
    existing=creds.get('users',{}).get(key)
    if existing:
        status,data=request('/auth/v1/admin/users/'+existing['id'],{'password':pw,'email_confirm':True},creds['service'],'PUT')
    else:
        status,data=request('/auth/v1/admin/users',{'email':key+'@stage.test','password':pw,'email_confirm':True},creds['service'])
    expect('create_'+key,status,200)
    uid=data.get('id') or data['user']['id']; users[key]={'id':uid,'email':key+'@stage.test'}
    if role: sql("INSERT INTO staff_members(user_id,role) VALUES ('"+uid+"','"+role+"') ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,active=true;")
for key,u in users.items():
    status,data=request('/auth/v1/token?grant_type=password',{'email':u['email'],'password':pw})
    expect('login_'+key,status,200); u['token']=data['access_token']
creds['fixture_password']=pw; creds['users']=users
(ROOT/'credentials.json').write_text(json.dumps(creds))
for key,expected in [('admin','admin'),('reception','recepcao'),('evaluator','avaliador'),('stranger',None)]:
    status,data=request('/rest/v1/rpc/current_staff_role',{},users[key]['token'])
    expect('role_http_'+key,status,200); expect('role_value_'+key,data,expected)
status,data=request('/rest/v1/students?select=id,name',token=users['stranger']['token'],method='GET')
expect('stranger_select',status,200); expect('stranger_rows',len(data),0)
status,data=request('/rest/v1/students?select=id,name',token=users['admin']['token'],method='GET')
expect('admin_select',status,200); student=data[0]
status,_=request('/rest/v1/students',{'name':'Forbidden staging insert','phone':'43990009998'},users['evaluator']['token'])
expect('evaluator_insert_denied',status,403)
fixture_student=str(uuid.uuid4()); fixture_eval=str(uuid.uuid4())
status,_=request('/rest/v1/students',{'id':fixture_student,'name':'Aluno RPC staging','phone':'439'+str(secrets.randbelow(100000000)).zfill(8)},users['reception']['token'])
expect('reception_create_student',status,201)
future=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=95)).isoformat()
status,_=request('/rest/v1/rpc/mutate_evaluation_tx',{'_action':'create','_evaluation_id':fixture_eval,'_student_id':fixture_student,'_scheduled_at':future,'_messages':[],'_allow_conflict':True},users['evaluator']['token'])
expect('evaluator_create_rpc',status,200)
status,_=request('/rest/v1/evaluations?id=eq.'+fixture_eval,{'status':'completed'},users['evaluator']['token'],'PATCH')
expect('direct_status_denied',status,403)
status,_=request('/rest/v1/evaluations?id=eq.'+fixture_eval,{'notes':'Nota de staging'},users['evaluator']['token'],'PATCH')
expect('notes_update_allowed',status,204)
status,_=request('/rest/v1/rpc/mutate_evaluation_tx',{'_action':'cancel','_evaluation_id':fixture_eval},users['reception']['token'])
expect('reception_cancel_rpc',status,200)
past_eval=str(uuid.uuid4())
sql("INSERT INTO public.evaluations(id,student_id,scheduled_at,status) VALUES ('"+past_eval+"','"+fixture_student+"',now()-interval '1 day','scheduled');")
status,_=request('/rest/v1/rpc/complete_evaluation_tx',{'_evaluation_id':past_eval},users['evaluator']['token'])
expect('evaluator_complete_rpc',status,204)
status,data=request('/rest/v1/students?id=eq.'+fixture_student+'&select=had_evaluation,last_evaluation_date',token=users['admin']['token'],method='GET')
expect('summary_read',status,200); expect('summary_derived',data[0]['had_evaluation'],True)
for name in ['send-whatsapp','ai-database-actions','daily-briefing','ai-assistant','whatsapp-status','whatsapp-diagnostic','whatsapp-contacts']:
    status,_=request('/functions/v1/'+name,{},creds['anon'])
    expect(name+'_anon',status,401)
    status,_=request('/functions/v1/'+name,{},users['stranger']['token'])
    expect(name+'_stranger',status,403)
    if name!='whatsapp-status':
        status,_=request('/functions/v1/'+name,{},users['evaluator']['token'])
        expect(name+'_evaluator',status,403)
marker='Staging '+secrets.token_hex(8)+' '
status,data=request('/functions/v1/send-whatsapp',{'message':marker+'{nome}','students':[{'id':student['id'],'name':'Forged','phone':'00000000000'}]},users['reception']['token'])
expect('enqueue_real_services',status,200); expect('enqueue_count',data['summary']['queued'],1)
status,data=request('/rest/v1/scheduled_messages?select=content&content=eq.'+urllib.parse.quote(marker+student['name']),token=users['reception']['token'],method='GET')
expect('queue_verify',status,200); expect('queue_resolved_name',len(data),1)
status,_=request('/functions/v1/ai-database-actions',{'action':'create_student','params':{'name':'Denied'},'userConfirmation':'false'},users['admin']['token'])
expect('boolean_confirmation',status,403)
status,_=request('/functions/v1/whatsapp-status',{'action':'logout'},users['evaluator']['token'])
expect('logout_denied',status,403)
sql("UPDATE staff_members SET active=false WHERE user_id='"+users['reception']['id']+"';")
status,_=request('/functions/v1/send-whatsapp',{'message':'Revoked','students':[{'id':student['id']}]},users['reception']['token'])
expect('revoke_same_token',status,403)
sql("UPDATE staff_members SET active=true WHERE user_id='"+users['reception']['id']+"';")
result={'checks_passed':len(checks),'services':['PostgreSQL','Auth','PostgREST','Edge Runtime'],'external_sends':0,'network':'internal','gateway':'loopback:18090'}
(ROOT/'validation.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result))

