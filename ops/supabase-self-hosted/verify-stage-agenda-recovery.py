"""Validate the candidate on the existing isolated VM staging stack."""
import base64, concurrent.futures, hashlib, hmac, json, os, pathlib, secrets
import subprocess, tarfile, time, urllib.error, urllib.request, uuid

os.umask(0o077)
ROOT = pathlib.Path("/opt/workout-stage-security-20261012")
PACKAGE = pathlib.Path("/home/ubuntu/workout-agenda-recovery-20261014")
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
baseline_sql="SELECT count(*) FROM students; SELECT count(*) FROM evaluations; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM auth.users;"
baseline=sql(baseline_sql)
check("new_schema_absent",sql("SELECT to_regprocedure('public.evaluation_schedule_conflicts(uuid,timestamptz,uuid)') IS NULL;")=="t")
uid=None
student,other,appointment=[str(uuid.uuid4()) for _ in range(3)]
schema_applied=False
try:
    with tarfile.open(PACKAGE/"runtime.tar.gz") as archive:
        for name,expected in manifest.items():
            member=archive.getmember(name)
            path=pathlib.PurePosixPath(name)
            if not member.isfile() or path.is_absolute() or ".." in path.parts: raise RuntimeError("Unsafe runtime archive")
            content=archive.extractfile(member).read()
            check("hash_"+name,hashlib.sha256(content).hexdigest()==expected)
            target=ROOT/"functions"/name
            before[name]=target.read_bytes() if target.exists() else None
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(content)
    sql("BEGIN;"+(PACKAGE/"agenda.sql").read_text()+"COMMIT;")
    schema_applied=True
    sql("NOTIFY pgrst, 'reload schema';")
    run(["docker","restart",PREFIX+"-edge"])
    run(["docker","exec",PREFIX+"-gateway","nginx","-s","reload"])
    email="agenda-"+uuid.uuid4().hex+"@workout.test"
    password=secrets.token_urlsafe(32)
    status,user=call("/auth/v1/admin/users",{"email":email,"password":password,"email_confirm":True},service)
    check("fixture_created",status==200)
    uid=str(uuid.UUID(user["id"]))
    sql("INSERT INTO staff_members(user_id,role) VALUES ('"+uid+"','admin'); INSERT INTO students(id,name,phone) VALUES ('"+student+"','Fixture A','00000000000'),('"+other+"','Fixture B','00000000001');")
    status,login=call("/auth/v1/token?grant_type=password",{"email":email,"password":password})
    check("fixture_authenticated",status==200)
    token=login["access_token"]
    payload={"_student_id":student,"_scheduled_at":"2090-01-01T15:00:00Z"}
    def preflight(values=payload,auth=token): return call("/rest/v1/rpc/evaluation_schedule_conflicts",values,auth)
    for _ in range(20):
        outcome=preflight()
        if outcome[0]!=404: break
        time.sleep(.2)
    check("empty_agenda",outcome==(200,{"duplicate":None,"conflict":None}))
    sql("INSERT INTO evaluations(student_id,scheduled_at,status) SELECT '"+other+"','2080-01-01'::timestamptz+make_interval(mins=>i),'scheduled' FROM generate_series(1,1500) i; INSERT INTO evaluations(id,student_id,scheduled_at,status) VALUES ('"+appointment+"','"+other+"','2090-01-01T15:00:00Z','scheduled');")
    check("beyond_1500_rows",preflight()[1].get("conflict",{}).get("evaluation_id")==appointment)
    check("anonymous_denied",preflight(auth=anon)[0] in [401,403])
    check("invalid_ignore_denied",preflight(dict(payload,_ignore_evaluation_id=appointment))[0]==400)
    check("mutation_rechecks_after_preflight",call("/rest/v1/rpc/mutate_evaluation_tx",{"_action":"create","_evaluation_id":str(uuid.uuid4()),"_student_id":student,"_scheduled_at":payload["_scheduled_at"],"_messages":[]},token)[0]==400)
    sql("UPDATE evaluations SET scheduled_at='2090-01-01T15:30:00Z' WHERE id='"+appointment+"';")
    check("thirty_minute_boundary",preflight()[1].get("conflict") is None)
    sql("UPDATE evaluations SET student_id='"+student+"',scheduled_at='2090-01-01T15:00:00Z' WHERE id='"+appointment+"';")
    check("duplicate_detected",preflight()[1].get("duplicate",{}).get("evaluation_id")==appointment)
    check("reschedule_self_excluded",preflight(dict(payload,_ignore_evaluation_id=appointment))[1]=={"duplicate":None,"conflict":None})
    sql("UPDATE staff_members SET role='avaliador' WHERE user_id='"+uid+"';")
    check("evaluator_allowed",preflight()[0]==200)
    sql("DELETE FROM staff_members WHERE user_id='"+uid+"';")
    check("revoked_staff_denied",preflight()[0]==403)
    check("edge_imports_boot",call("/functions/v1/ai-assistant",{})[0]==401)
finally:
    try:
        sql("DELETE FROM students WHERE id IN ('"+student+"','"+other+"');")
        if uid:
            status,_=call("/auth/v1/admin/users/"+uid,token=service,method="DELETE")
            check("fixture_removed",status==200)
    finally:
        if schema_applied:
            sql("DROP FUNCTION public.evaluation_schedule_conflicts(uuid,timestamptz,uuid); NOTIFY pgrst, 'reload schema';")
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
        "migration_sha256":hashlib.sha256((PACKAGE/"agenda.sql").read_bytes()).hexdigest()}
(PACKAGE/"stage-result.json").write_text(json.dumps(result,indent=2))
print(json.dumps(result))
