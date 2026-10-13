#!/usr/bin/env python3
"""Verify endpoint hardening on isolated staging, without invoking workers/providers."""
import json, pathlib, subprocess, urllib.request, urllib.error, uuid, secrets, shutil, time
ROOT=pathlib.Path('/opt/workout-stage-security-20261012')
PACKAGE=pathlib.Path('/home/ubuntu/endpoint-security-review')
PREFIX='workout-stage-full-20261012'
credentials=json.loads((ROOT/'credentials.json').read_text())
checks=[]
def run(args,data=None):
    r=subprocess.run(args,input=data,capture_output=True)
    if r.returncode:
        (ROOT/'endpoint-security-error.log').write_bytes(r.stdout+r.stderr)
        raise RuntimeError('Command failed; inspect restricted log')
    return r.stdout.decode().strip()
def sql(s):
    return run(['docker','exec','-i',PREFIX+'-db','psql','-U','stage_bootstrap','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],s.encode())
def check(name,ok):
    if not ok: raise RuntimeError('Check failed: '+name)
    checks.append(name)
def call(path,body=None,token=None,method=None):
    headers={'apikey':credentials['anon'],'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request('http://127.0.0.1:18090'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
    for attempt in range(10):
        try:
            with urllib.request.urlopen(req,timeout=30) as r: return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            raw=e.read()
            if e.code in (502,503) and attempt<9:
                time.sleep(2); continue
            try: payload=json.loads(raw)
            except ValueError: payload={'error':'non-JSON response'}
            return e.code,payload
check('internal_network',json.loads(run(['docker','network','inspect',PREFIX+'-net']))[0]['Internal'])
env=dict(x.split('=',1) for x in json.loads(run(['docker','inspect',PREFIX+'-edge']))[0]['Config']['Env'])
check('no_provider_credentials',not any(env.get(k) for k in ['EVOLUTION_API_URL','EVOLUTION_INSTANCE_TOKEN','GEMINI_API_KEY','LOVABLE_API_KEY']))
paths=['_shared/contracts.ts','_shared/evolution.ts','_shared/auth.ts','ai-database-actions/index.ts','whatsapp-diagnostic/index.ts']
before={n:(ROOT/'functions'/n).read_bytes() if (ROOT/'functions'/n).exists() else None for n in paths}
qa=ROOT/'functions/endpoint-security-review'
if qa.exists(): raise RuntimeError('QA route already exists')
uid=None
baseline=sql('SELECT count(*) FROM students; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM auth.users;')
try:
    for n in paths: shutil.copyfile(PACKAGE/n,ROOT/'functions'/n)
    qa.mkdir()
    (qa/'index.ts').write_text('''import { requireCronSecret } from "../_shared/auth.ts";
Deno.serve(() => {
 const secret=Deno.env.get("CRON_SECRET")!;
 return Response.json({
   configured:Boolean(secret),
   headerAccepted:requireCronSecret(new Request("http://localhost",{headers:{"x-cron-secret":secret}}))===null,
   queryRejected:requireCronSecret(new Request("http://localhost/?cron_secret="+encodeURIComponent(secret)))?.status===401,
   wrongRejected:requireCronSecret(new Request("http://localhost",{headers:{"x-cron-secret":"invalid-fixture"}}))?.status===401,
   missingRejected:requireCronSecret(new Request("http://localhost"))?.status===401
 });
});''')
    run(['docker','restart',PREFIX+'-edge'])
    run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
    status,result=call('/functions/v1/endpoint-security-review',{})
    check('cron_contract',status==200 and all(result.get(k) is True for k in ['configured','headerAccepted','queryRejected','wrongRejected','missingRejected']))
    status,_=call('/functions/v1/daily-automation?cron_secret=invalid-fixture',{})
    check('actual_daily_rejects_query',status==401)
    email='security-'+str(uuid.uuid4())+'@workout.test';password=secrets.token_urlsafe(32)
    status,user=call('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},credentials['service'])
    check('fixture_created',status==200);uid=str(uuid.UUID(user['id']))
    sql("INSERT INTO staff_members(user_id,role) VALUES ('"+uid+"','admin');")
    status,login=call('/auth/v1/token?grant_type=password',{'email':email,'password':password})
    check('fixture_login',status==200);token=login['access_token']
    status,result=call('/functions/v1/ai-database-actions',{'action':'private-failure-marker','params':{},'userConfirmation':True},token)
    print(json.dumps({'legacy_status':status,'response_keys':list(result),'generic_error':result.get('error')=='Erro interno do servidor'}))
    check('legacy_failure_sanitized',status==500 and result=={'error':'Erro interno do servidor'})
    status,_=call('/functions/v1/whatsapp-diagnostic',{},token)
    check('diagnostic_imports_no_provider',status==500)
    for endpoint in ['ai-database-actions','whatsapp-diagnostic']:
        status,_=call('/functions/v1/'+endpoint,{},credentials['anon'])
        check(endpoint+'_anonymous_denied',status==401)
finally:
    if uid:
        status,_=call('/auth/v1/admin/users/'+uid,token=credentials['service'],method='DELETE')
        check('fixture_removed',status==200)
    for n,content in before.items():
        if content is None: (ROOT/'functions'/n).unlink(missing_ok=True)
        else: (ROOT/'functions'/n).write_bytes(content)
    if qa.exists(): shutil.rmtree(qa)
    run(['docker','restart',PREFIX+'-edge'])
    run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
    check('baseline_preserved',sql('SELECT count(*) FROM students; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM auth.users;')==baseline)
result={'checks':checks,'production_changed':False,'provider_calls':0,'whatsapp_sends':0,'runtime_restored':True}
(ROOT/'endpoint-security-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
