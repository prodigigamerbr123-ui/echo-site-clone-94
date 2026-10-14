"""Validate the candidate on the existing isolated VM staging stack."""
import base64, concurrent.futures, hashlib, hmac, json, os, pathlib, secrets
import subprocess, tarfile, time, urllib.error, urllib.request, uuid

os.umask(0o077)
ROOT = pathlib.Path("/opt/workout-stage-security-20261012")
PACKAGE = pathlib.Path("/home/ubuntu/workout-message-enqueue-20261014")
PREFIX = "workout-stage-full-20261012"
checks = []
credentials = json.loads((ROOT/"credentials.json").read_text())

def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        (PACKAGE/"stage-error.log").write_bytes(result.stdout + result.stderr)
        raise RuntimeError("Staging operation failed; inspect restricted stage-error.log")
    return result.stdout

def sql(statement):
    return run(["docker","exec","-i",PREFIX+"-db","psql","-U","stage_bootstrap","-d","postgres",
                "-Atq","-v","ON_ERROR_STOP=1","-f","-"], statement.encode()).decode().strip()

def check(name, valid):
    if not valid: raise RuntimeError("Staging check failed: " + name)
    checks.append(name)

def sign(role):
    enc=lambda value:base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=")
    payload=enc({"alg":"HS256","typ":"JWT"})+b"."+enc({"role":role,"iss":"supabase","iat":int(time.time()),"exp":int(time.time())+7200})
    return (payload+b"."+base64.urlsafe_b64encode(hmac.new(credentials["jwt"].encode(),payload,hashlib.sha256).digest()).rstrip(b"=")).decode()

anon, service = sign("anon"), sign("service_role")
def call(path, body=None, token=None, method="POST", extra=None):
    headers={"apikey":anon,"Content-Type":"application/json"}
    if token: headers["Authorization"]="Bearer "+token
    headers.update(extra or {})
    data=None if body is None else json.dumps(body).encode()
    request=urllib.request.Request("http://127.0.0.1:18090"+path,data=data,headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            raw=response.read()
            return response.status,json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw=error.read()
        try: value=json.loads(raw)
        except ValueError: value={"error":"non-JSON"}
        return error.code,value

check("internal_network",json.loads(run(["docker","network","inspect",PREFIX+"-net"]))[0]["Internal"])
edge=json.loads(run(["docker","inspect",PREFIX+"-edge"]))[0]
env=dict(value.split("=",1) for value in edge["Config"]["Env"] if "=" in value)
check("no_provider_credentials",not any(env.get(key) for key in
      ["EVOLUTION_API_URL","EVOLUTION_INSTANCE_TOKEN","GEMINI_API_KEY","LOVABLE_API_KEY","GOOGLE_API_KEY"]))
manifest=json.loads((PACKAGE/"runtime-manifest.json").read_text())
before={}
baseline_sql="SELECT count(*) FROM students; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM auth.users;"
baseline=sql(baseline_sql)
check("no_previous_candidate_schema", sql("SELECT to_regclass('public.message_enqueue_requests') IS NULL;")=="t")
original_insert=sql("SELECT has_table_privilege('authenticated','public.scheduled_messages','INSERT');")=="t"
original_policy=sql("SELECT coalesce((SELECT with_check FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_messages' AND policyname='queue_create'),'');")
uid=None
student=str(uuid.uuid4())
schema_applied=False
try:
    with tarfile.open(PACKAGE/"runtime.tar.gz") as archive:
        for name,expected in manifest.items():
            member=archive.getmember(name)
            path=pathlib.PurePosixPath(name)
            check("safe_"+name, member.isfile() and not path.is_absolute() and ".." not in path.parts)
            content=archive.extractfile(member).read()
            check("hash_"+name, hashlib.sha256(content).hexdigest()==expected)
            target=ROOT/"functions"/name
            before[name]=target.read_bytes() if target.exists() else None
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(content)
    sql("BEGIN;"+(PACKAGE/"enqueue.sql").read_text()+"COMMIT;")
    schema_applied=True
    sql((PACKAGE/"restrict.sql").read_text())
    sql("NOTIFY pgrst, 'reload schema';")
    run(["docker","restart",PREFIX+"-edge"])
    run(["docker","exec",PREFIX+"-gateway","nginx","-s","reload"])
    email="enqueue-"+uuid.uuid4().hex+"@workout.test"
    password=secrets.token_urlsafe(32)
    status,user=call("/auth/v1/admin/users",{"email":email,"password":password,"email_confirm":True},service)
    check("fixture_created",status==200)
    uid=str(uuid.UUID(user["id"]))
    sql("INSERT INTO staff_members(user_id,role) VALUES ('"+uid+"','admin'); INSERT INTO students(id,name,phone) VALUES ('"+student+"','Aluno ficticio de homologacao','00000000000');")
    status,login=call("/auth/v1/token?grant_type=password",{"email":email,"password":password})
    check("fixture_authenticated",status==200)
    token=login["access_token"]
    request_id=str(uuid.uuid4())
    payload={"_request_id":request_id,"_student_ids":[student],"_content":"Teste {nome}",
      "_schedule":{"kind":"custom","date":"2090-01-01","time":"10:00","intervals":[{"days":7,"count":4},{"days":14,"count":2}]}}
    for _ in range(20):
        if call("/rest/v1/rpc/enqueue_messages_tx",{},token)[0]!=404: break
        time.sleep(.2)
    def enqueue(_): return call("/rest/v1/rpc/enqueue_messages_tx",payload,token)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        outcomes=list(pool.map(enqueue,range(20)))
    check("concurrent_all_success",all(code==200 and result.get("queued")==5 for code,result in outcomes))
    check("concurrent_exactly_one_execution",sum(result["replayed"] is False for _,result in outcomes)==1)
    check("concurrent_nineteen_replays",sum(result["replayed"] is True for _,result in outcomes)==19)
    check("exactly_five_queue_rows",sql("SELECT count(*) FROM scheduled_messages WHERE student_id='"+student+"';")=="5")
    check("exactly_one_quota_consumed",sql("SELECT request_count FROM staff_request_quotas WHERE user_id='"+uid+"' AND operation='send-whatsapp' AND window_seconds=600;")=="1")
    check("whitespace_rejected",call("/rest/v1/rpc/enqueue_messages_tx",dict(payload,_request_id=str(uuid.uuid4()),_content="\n\t"),token)[0]==400)
    check("payload_conflict_denied",call("/rest/v1/rpc/enqueue_messages_tx",dict(payload,_content="Changed"),token)[0]==400)
    check("partial_batch_rejected",call("/rest/v1/rpc/enqueue_messages_tx",dict(payload,_request_id=str(uuid.uuid4()),_student_ids=[student,str(uuid.uuid4())]),token)[0]==400)
    check("anon_denied",call("/rest/v1/rpc/enqueue_messages_tx",payload,anon)[0] in [401,403])
    check("ledger_denied",call("/rest/v1/message_enqueue_requests?select=request_id",token=token,method="GET")[0]==403)
    check("direct_insert_denied",call("/rest/v1/scheduled_messages",{"student_id":student,"content":"Bypass","scheduled_for":"2090-01-01T12:00:00Z"},token)[0]==403)
    body={"request_id":str(uuid.uuid4()),"message":"Teste {nome}","students":[{"id":student,"name":"Forged"}]}
    first=call("/functions/v1/send-whatsapp",body,token)
    second=call("/functions/v1/send-whatsapp",body,token)
    check("compatibility_rpc_success",first[0]==200 and first[1].get("summary",{}).get("queued")==1)
    check("compatibility_replay",second[0]==200 and second[1].get("replayed") is True)
    legacy={"request_id":str(uuid.uuid4()),"action":"schedule_message","userConfirmation":True,
      "params":{"student_id":student,"content":"Legacy fixture","scheduled_for":"2090-01-03T12:00:00Z"}}
    check("legacy_uses_rpc",call("/functions/v1/ai-database-actions",legacy,token)[0]==200)
    check("legacy_replay",call("/functions/v1/ai-database-actions",legacy,token)[1].get("data",{}).get("replayed") is True)
    sql("UPDATE staff_request_quotas SET request_count=30 WHERE user_id='"+uid+"' AND operation='send-whatsapp' AND window_seconds=600;")
    check("fresh_request_quota_429",call("/rest/v1/rpc/enqueue_messages_tx",dict(payload,_request_id=str(uuid.uuid4())),token)[0]==429)
    check("replay_after_quota",enqueue(0)[0]==200)
    check("no_partial_writes",sql("SELECT count(*) FROM scheduled_messages WHERE student_id='"+student+"';")=="7")
finally:
    try:
        sql("DELETE FROM students WHERE id='"+student+"';")
        if uid:
            status,_=call("/auth/v1/admin/users/"+uid,token=service,method="DELETE")
            check("fixture_removed",status==200)
    finally:
        if schema_applied:
            sql("DROP TRIGGER IF EXISTS guard_queue_nonblank_content ON public.scheduled_messages; DROP FUNCTION IF EXISTS public.guard_queue_nonblank_content(); DROP FUNCTION public.enqueue_messages_tx(uuid,uuid[],text,jsonb); DROP TABLE public.message_enqueue_requests;")
            if original_insert: sql("GRANT INSERT ON public.scheduled_messages TO authenticated;")
            if original_policy:
                sql("DROP POLICY IF EXISTS queue_create ON public.scheduled_messages; CREATE POLICY queue_create ON public.scheduled_messages FOR INSERT TO authenticated WITH CHECK ("+original_policy+");")
            sql("NOTIFY pgrst, 'reload schema';")
        for name,content in before.items():
            target=ROOT/"functions"/name
            if content is None: target.unlink(missing_ok=True)
            else: target.write_bytes(content)
        run(["docker","restart",PREFIX+"-edge"])
        run(["docker","exec",PREFIX+"-gateway","nginx","-s","reload"])
    check("baseline_restored",sql(baseline_sql)==baseline)
    check("runtime_restored",all((ROOT/"functions"/name).read_bytes()==value if value is not None else not (ROOT/"functions"/name).exists() for name,value in before.items()))
result={"checks":checks,"production_changed":False,"real_provider_calls":0,"runtime_restored":True,
        "runtime_manifest_sha256":hashlib.sha256((PACKAGE/"runtime-manifest.json").read_bytes()).hexdigest(),
        "runtime_archive_sha256":hashlib.sha256((PACKAGE/"runtime.tar.gz").read_bytes()).hexdigest(),
        "migration_sha256":hashlib.sha256((PACKAGE/"enqueue.sql").read_bytes()).hexdigest(),
        "restriction_sha256":hashlib.sha256((PACKAGE/"restrict.sql").read_bytes()).hexdigest()}
(PACKAGE/"stage-result.json").write_text(json.dumps(result,indent=2))
print(json.dumps(result))
