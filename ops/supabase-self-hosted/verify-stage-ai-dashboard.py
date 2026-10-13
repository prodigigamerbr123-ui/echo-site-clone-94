#!/usr/bin/env python3
"""Run as root on the isolated VM staging stack; no provider requests."""
import json, pathlib, subprocess, urllib.request, urllib.error, uuid, secrets, shutil

ROOT = pathlib.Path('/opt/workout-stage-security-20261012')
PACKAGE = pathlib.Path('/home/ubuntu/ai-dashboard-review')
PREFIX = 'workout-stage-full-20261012'
credentials = json.loads((ROOT/'credentials.json').read_text())
checks = []
def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        (ROOT/'ai-dashboard-error.log').write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect restricted log')
    return result.stdout.decode().strip()
def sql(statement):
    return run(['docker','exec','-i',PREFIX+'-db','psql','-U','stage_bootstrap','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'], statement.encode())
def check(name, ok):
    if not ok: raise RuntimeError('Check failed: '+name)
    checks.append(name)
def call(path, body=None, token=None, method=None):
    headers = {'apikey':credentials['anon'],'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    request = urllib.request.Request('http://127.0.0.1:18090'+path,
        data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request,timeout=30) as response: return response.status,json.load(response)
    except urllib.error.HTTPError as error: return error.code,json.loads(error.read())

network=json.loads(run(['docker','network','inspect',PREFIX+'-net']))[0]
check('internal_network',network['Internal'])
environment=dict(x.split('=',1) for x in json.loads(run(['docker','inspect',PREFIX+'-edge']))[0]['Config']['Env'])
check('no_provider_credentials',not any(environment.get(k) for k in ['EVOLUTION_API_URL','EVOLUTION_INSTANCE_TOKEN','GEMINI_API_KEY','LOVABLE_API_KEY']))
paths=['_shared/aiDashboard.ts','_shared/dashboardContracts.ts','_shared/contracts.ts','_shared/database.types.ts','_shared/aiChatContracts.ts','_shared/aiContracts.ts','_shared/evaluations.ts','_shared/messageTemplates.ts','_shared/templateResolver.ts','ai-assistant/index.ts']
before={name:(ROOT/'functions'/name).read_bytes() if (ROOT/'functions'/name).exists() else None for name in paths}
qa=ROOT/'functions/ai-dashboard-review'
if qa.exists(): raise RuntimeError('Existing QA function; inspect first')
user_id=None
baseline=sql('SELECT count(*) FROM students; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM ai_messages; SELECT count(*) FROM auth.users;')
try:
    for name in paths:
        shutil.copyfile(PACKAGE/name,ROOT/'functions'/name)
    qa.mkdir()
    (qa/'index.ts').write_text('''import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAssistantDashboard } from "../_shared/aiDashboard.ts";
Deno.serve(async req => {
  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,
    {global:{headers:{Authorization:req.headers.get("Authorization") ?? ""}}});
  try { return Response.json(await getAssistantDashboard(() => client.rpc("get_workout_dashboard"))); }
  catch { return Response.json({error:"snapshot unavailable"},{status:403}); }
});
''')
    run(['docker','restart',PREFIX+'-edge'])
    run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
    email='dashboard-'+str(uuid.uuid4())+'@workout.test';password=secrets.token_urlsafe(32)
    status,user=call('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},credentials['service'])
    check('fixture_created',status==200);user_id=str(uuid.UUID(user['id']))
    sql("INSERT INTO staff_members(user_id,role) VALUES ('"+user_id+"','admin');")
    status,login=call('/auth/v1/token?grant_type=password',{'email':email,'password':password})
    check('fixture_login',status==200);token=login['access_token']
    status,raw=call('/rest/v1/rpc/get_workout_dashboard',{},token)
    check('caller_snapshot',status==200)
    status,result=call('/functions/v1/ai-dashboard-review',{},token)
    check('helper_http_success',status==200)
    check('identical_complete_counts',all(result[k]==v for k,v in raw['stats'].items()))
    check('day_matches_snapshot',result['day']==raw['day'])
    check('birthday_sample_labelled',result['birthdayNamesLimited']==(raw['stats']['birthdaysToday']>len(raw['birthdayNames'])))
    status,_=call('/functions/v1/ai-dashboard-review',{},credentials['anon'])
    check('anonymous_denied',status!=200)
    status,_=call('/functions/v1/ai-assistant',{},credentials['anon'])
    check('assistant_imports_and_denies_anonymous',status==401)
finally:
    if user_id:
        status,_=call('/auth/v1/admin/users/'+user_id,token=credentials['service'],method='DELETE')
        check('fixture_removed',status==200)
    for name,content in before.items():
        target=ROOT/'functions'/name
        if content is None: target.unlink(missing_ok=True)
        else: target.write_bytes(content)
    if qa.exists(): shutil.rmtree(qa)
    run(['docker','restart',PREFIX+'-edge'])
    run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
    check('baseline_preserved',sql('SELECT count(*) FROM students; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM ai_messages; SELECT count(*) FROM auth.users;')==baseline)
result={'checks':checks,'production_changed':False,'real_provider_calls':0,'whatsapp_sends':0,'runtime_restored':True}
(ROOT/'ai-dashboard-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
