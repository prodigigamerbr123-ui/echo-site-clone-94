"""Deploy the 27/10 overdue safety fixes without schema changes.

Phases: prepare (pause workers, maintenance page, verified backup), apply
(changed Edge files only), resume,
rollback. Adapted from release-agenda-recovery.py. Run as root on the VM.
"""
import datetime, hashlib, ipaddress, json, os, pathlib, re, shutil, subprocess, sys, tarfile, time, urllib.error, urllib.request
os.umask(0o077)
STACK=pathlib.Path("/opt/workout-supabase")
ROOT=pathlib.Path("/opt/workout-releases/20261027-overdue-safety")
PACKAGE=pathlib.Path("/home/ubuntu/workout-release-20261027-safety")
DB="workout-supabase-db"
EDGE="workout-supabase-edge-functions"
MIGRATIONS=[]
ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
STATE=ROOT/"state.json"

def run(args,data=None):
    result=subprocess.run(args,input=data,capture_output=True)
    if result.returncode:
        with (ROOT/"release-error.log").open("ab") as handle: handle.write(result.stdout+result.stderr)
        raise RuntimeError("Release operation failed; inspect restricted release-error.log")
    return result.stdout

def sql(statement,user="supabase_admin"):
    return run(["docker","exec","-i",DB,"psql","-U",user,"-d","postgres","-Atq","-v","ON_ERROR_STOP=1","-f","-"],statement.encode()).decode().strip()

def save(state):
    STATE.write_text(json.dumps(state,indent=2))

def digest(path):
    with path.open("rb") as handle: return hashlib.file_digest(handle,"sha256").hexdigest()

def verify_candidate():
    candidate=json.loads((PACKAGE/"candidate.json").read_text())
    if not candidate.get("local_checks_ok"): raise RuntimeError("Candidate lacks local validation")
    for filename,key in [("runtime.tar.gz","runtime_archive_sha256"),("runtime-manifest.json","runtime_manifest_sha256")]:
        if digest(PACKAGE/filename)!=candidate[key]: raise RuntimeError("Candidate changed after review")
    return candidate

def resume(state):
    before=ROOT/"public-gateway.before.conf"
    if before.exists():
        shutil.copyfile(before,STACK/"public-gateway.conf")
        run(["docker","exec","workout-supabase-public","nginx","-t"])
        run(["docker","exec","workout-supabase-public","nginx","-s","reload"])
    for job in state.get("jobs",[]):
        sql("UPDATE cron.job SET active="+("true" if job["active"] else "false")+" WHERE jobid="+str(int(job["id"]))+";")

def rollback(state):
    # Migrations are additive and committed atomically; a failed apply leaves none of them.
    # Reverting an applied schema requires restoring the verified backup, not this script.
    if state.get("runtime_changed"):
        with tarfile.open(ROOT/"runtime-before.tar.gz") as archive:
            for name, existed in state["runtime_existed"].items():
                target=STACK/"volumes/functions"/name
                if existed: target.write_bytes(archive.extractfile(name).read())
                else: target.unlink(missing_ok=True)
        run(["docker","restart",EDGE])
    resume(state)
    state["phase"]="rolled_back"
    save(state)

def unauthenticated_smoke():
    container=json.loads(run(["docker","inspect",EDGE]))[0]
    address=next(value["IPAddress"] for value in container["NetworkSettings"]["Networks"].values() if value.get("IPAddress"))
    if not ipaddress.ip_address(address).is_private: raise RuntimeError("Unexpected runtime address")
    checks=[]
    # daily-automation responde 401 sem o segredo do cron; outro código indica falha ao compilar a versão nova.
    for endpoint in ["daily-automation","send-whatsapp","send-oneshot","ai-database-actions","daily-briefing","ai-assistant"]:
        ready=False
        for _ in range(15):
            request=urllib.request.Request("http://"+address+":9000/"+endpoint,data=b"{}",headers={"Content-Type":"application/json"})
            try:
                with urllib.request.urlopen(request,timeout=10) as response: status=response.status
            except urllib.error.HTTPError as error:
                status=error.code
                error.read()
            except urllib.error.URLError:
                status=0
            if status==401: ready=True;break
            time.sleep(.5)
        if not ready: raise RuntimeError("Runtime authentication smoke failed: "+endpoint)
        checks.append(endpoint+"_401")
    return checks

phase=sys.argv[1]
if phase=="prepare":
    if STATE.exists(): raise RuntimeError("Release already has state; inspect before retrying")
    verify_candidate()
    manifest=json.loads((PACKAGE/"runtime-manifest.json").read_text())
    for name in manifest:
        parts=pathlib.PurePosixPath(name)
        if parts.is_absolute() or ".." in parts.parts or not name.endswith(".ts") or parts.parts[0]=="main":
            raise RuntimeError("Unsafe runtime member")
    jobs=json.loads(sql("SELECT coalesce(json_agg(json_build_object('id',jobid,'active',active)),'[]'::json) FROM cron.job WHERE jobname IN ('process-scheduled-messages-every-minute','daily-automation');"))
    state={"phase":"preparing","jobs":jobs,"prepared_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"runtime_changed":False}
    save(state)
    try:
        sql("UPDATE cron.job SET active=false WHERE jobname IN ('process-scheduled-messages-every-minute','daily-automation');")
        idle=0
        for _ in range(65):
            busy=int(sql("SELECT (SELECT count(*) FROM scheduled_messages WHERE status='processing')+(SELECT count(*) FROM whatsapp_delivery_lease WHERE token IS NOT NULL AND leased_until>now());"))
            idle=idle+1 if busy==0 else 0
            if idle>=3: break
            time.sleep(2)
        else: raise RuntimeError("Worker did not become idle")
        shutil.copyfile(STACK/"public-gateway.conf",ROOT/"public-gateway.before.conf")
        existed={}
        with tarfile.open(ROOT/"runtime-before.tar.gz","w:gz") as archive:
            for name in manifest:
                target=STACK/"volumes/functions"/name
                existed[name]=target.is_file()
                if existed[name]: archive.add(target,arcname=name)
        state["runtime_existed"]=existed
        save(state)
        (STACK/"public-gateway.conf").write_text("server { listen 8080; server_tokens off; location / { add_header Retry-After 120 always; return 503; } }\n")
        run(["docker","exec","workout-supabase-public","nginx","-t"])
        run(["docker","exec","workout-supabase-public","nginx","-s","reload"])
        run(["python3",str(STACK/"backup.py")])
        stamp=pathlib.Path("/home/ubuntu/workout-backups/latest").read_text().strip()
        if not re.fullmatch(r"\d{8}T\d{6}Z",stamp): raise RuntimeError("Invalid backup stamp")
        folder=pathlib.Path("/home/ubuntu/workout-backups")/stamp
        files=json.loads((folder/"manifest.json").read_text())["files"]
        hashes={}
        for name,size in files.items():
            target=folder/name
            if target.resolve().parent!=folder.resolve() or target.stat().st_size!=size: raise RuntimeError("Backup manifest mismatch")
            if name.endswith(".gz"): run(["gzip","-t",str(target)])
            if name.endswith(".dump"): run(["docker","exec","-i",DB,"pg_restore","--list"],target.read_bytes())
            hashes[name]=digest(target)
        state.update(phase="prepared",backup=stamp,backup_sha256=hashes)
        save(state)
        print(json.dumps({"phase":"prepared","backup":stamp,"files_verified":len(hashes),"backup_sha256":hashes,"workers_paused":True}))
    except Exception:
        rollback(state)
        raise
elif phase=="apply":
    state=json.loads(STATE.read_text())
    if state["phase"]!="prepared": raise RuntimeError("Unexpected apply phase")
    try:
        verify_candidate()
        candidate=verify_candidate()
        for name,expected in candidate["previous_sha256"].items():
            if digest(STACK/"volumes/functions"/name)!=expected:
                raise RuntimeError("Installed function changed since review")
        manifest=json.loads((PACKAGE/"runtime-manifest.json").read_text())
        state["runtime_changed"]=True
        save(state)
        with tarfile.open(PACKAGE/"runtime.tar.gz") as archive:
            for name,expected in manifest.items():
                content=archive.extractfile(name).read()
                if hashlib.sha256(content).hexdigest()!=expected: raise RuntimeError("Runtime content mismatch")
                target=STACK/"volumes/functions"/name
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(content)
        run(["docker","restart",EDGE])
        state["smoke_checks"]=unauthenticated_smoke()
        state["phase"]="backend_applied"
        save(state)
        print(json.dumps({"phase":"backend_applied","migrations":[v for v,_ in MIGRATIONS],"smoke_checks":state["smoke_checks"]}))
    except Exception:
        rollback(state)
        raise
elif phase=="resume":
    state=json.loads(STATE.read_text())
    if state["phase"]!="backend_applied": raise RuntimeError("Backend has not been validated")
    resume(state)
    state["phase"]="resumed"
    state["resumed_at"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
    save(state)
    print(json.dumps({"phase":"resumed","backup":state["backup"],"jobs_restored":len(state["jobs"])}))
elif phase=="rollback":
    state=json.loads(STATE.read_text())
    rollback(state)
    print(json.dumps({"phase":"rolled_back"}))
else:
    raise RuntimeError("Unknown release phase")
