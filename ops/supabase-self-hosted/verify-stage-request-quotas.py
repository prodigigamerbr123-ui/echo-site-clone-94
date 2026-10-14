"""Validate the candidate on the existing isolated VM staging stack."""
import base64, concurrent.futures, hashlib, hmac, json, os, pathlib, secrets
import subprocess, tarfile, time, urllib.error, urllib.request, uuid

os.umask(0o077)
ROOT = pathlib.Path("/opt/workout-stage-security-20261012")
PACKAGE = pathlib.Path("/home/ubuntu/workout-security-20261014")
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
uid=None
try:
    with tarfile.open(PACKAGE/"runtime.tar.gz") as archive:
        for name, expected in manifest.items():
            member=archive.getmember(name)
            path=pathlib.PurePosixPath(name)
            if not member.isfile() or path.is_absolute() or ".." in path.parts: raise RuntimeError("Unsafe runtime archive")
            content=archive.extractfile(member).read()
            check("hash_"+name,hashlib.sha256(content).hexdigest()==expected)
            target=ROOT/"functions"/name
            before[name]=target.read_bytes() if target.exists() else None
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(content)
    if sql("SELECT to_regclass('public.staff_request_quotas') IS NULL;")=="t":
        sql("BEGIN;\n"+(PACKAGE/"quota.sql").read_text()+"\nCOMMIT;")
    check("quota_schema_ready",sql("SELECT to_regprocedure('public.consume_staff_request_quota(text)') IS NOT NULL;")=="t")
    expected_body=(PACKAGE/"quota.sql").read_text().split("AS $$",1)[1].split("$$;",1)[0].strip()
    actual_body=sql("SELECT prosrc FROM pg_proc WHERE oid='public.consume_staff_request_quota(text)'::regprocedure;")
    check("quota_function_matches_package",actual_body.strip()==expected_body)
    sql("NOTIFY pgrst, 'reload schema';")
    run(["docker","restart",PREFIX+"-edge"])
    run(["docker","exec",PREFIX+"-gateway","nginx","-s","reload"])
    for _ in range(20):
        if call("/functions/v1/send-whatsapp",{})[0]==401: break
        time.sleep(.5)
    else: raise RuntimeError("Candidate runtime not ready")
    email="quota-"+uuid.uuid4().hex+"@workout.test"
    password=secrets.token_urlsafe(32)
    status, user=call("/auth/v1/admin/users",{"email":email,"password":password,"email_confirm":True},service)
    check("fixture_created",status==200)
    uid=str(uuid.UUID(user["id"]))
    sql("INSERT INTO staff_members(user_id,role) VALUES ('"+uid+"','admin');")
    status,login=call("/auth/v1/token?grant_type=password",{"email":email,"password":password})
    check("fixture_authenticated",status==200)
    token=login["access_token"]
    def consume(_):
        code,value=call("/rest/v1/rpc/consume_staff_request_quota",{"_operation":"ai-assistant"},token)
        if code!=200: raise RuntimeError("Quota RPC failed")
        return value
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        values=list(pool.map(consume,range(30)))
    check("concurrent_exactly_20_allowed",values.count(0)==20)
    check("concurrent_10_rejected",sum(isinstance(value,int) and value>0 for value in values)==10)
    status,result=call("/functions/v1/ai-assistant",{"messages":[{"role":"user","content":"Quota fixture"}]},token)
    check("assistant_429",status==429 and result.get("retryAfter",0)>0)
    check("counter_direct_access_denied",call("/rest/v1/staff_request_quotas?select=user_id",token=token,method="GET")[0]==403)
    check("anon_rpc_denied",call("/rest/v1/rpc/consume_staff_request_quota",{"_operation":"ai-assistant"},anon)[0] in [401,403])
    check("invalid_scope_rejected",call("/rest/v1/rpc/consume_staff_request_quota",{"_operation":"unlimited"},token)[0]==400)
    for operation,limit in [("daily-briefing",10),("ai-database-actions",60),("send-whatsapp",30)]:
        sql("INSERT INTO staff_request_quotas VALUES ('"+uid+"','"+operation+"',600,to_timestamp(floor(extract(epoch FROM now())/600)*600),"+str(limit)+");")
        body={"action":"create_student","params":{"name":"Fixture"},"userConfirmation":True,
              "students":[{"id":str(uuid.uuid4())}],"message":"Quota fixture"}
        code,result=call("/functions/v1/"+operation,body,token)
        check(operation+"_429",code==429 and result.get("retryAfter",0)>0)
    check("send_null_rejected",call("/functions/v1/send-whatsapp",None,token)[0]==400)
    check("send_large_body_rejected",call("/functions/v1/send-whatsapp",{"message":"x"*70000},token)[0]==413)
    check("oneshot_no_secret",call("/functions/v1/send-oneshot",{})[0]==401)
    cron={"x-cron-secret":env["CRON_SECRET"]}
    check("oneshot_invalid_text",call("/functions/v1/send-oneshot",{"phone":"43999999999","text":""},extra=cron)[0]==400)
    check("oneshot_large_body",call("/functions/v1/send-oneshot",{"phone":"43999999999","text":"x"*9000},extra=cron)[0]==413)
    check("oneshot_wrong_method",call("/functions/v1/send-oneshot",method="GET",extra=cron)[0]==405)
    check("no_data_writes",sql("SELECT count(*) FROM students; SELECT count(*) FROM scheduled_messages;")==baseline.rsplit("\n",1)[0])
finally:
    try:
        if uid:
            status,_=call("/auth/v1/admin/users/"+uid,token=service,method="DELETE")
            check("fixture_removed",status==200)
    finally:
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
        "migration_sha256":hashlib.sha256((PACKAGE/"quota.sql").read_bytes()).hexdigest()}
(PACKAGE/"stage-result.json").write_text(json.dumps(result,indent=2))
print(json.dumps(result))
