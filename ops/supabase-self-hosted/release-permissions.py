#!/usr/bin/env python3
"""Coordinated authorized production release. Run as root, one phase at a time."""
import datetime, json, pathlib, re, shutil, subprocess, sys, time
STACK=pathlib.Path('/opt/workout-supabase'); ROOT=pathlib.Path('/opt/workout-releases/20261012-permissions'); DB='workout-supabase-db'
def run(args,data=None):
 r=subprocess.run(args,input=data,capture_output=True)
 if r.returncode:
  with (ROOT/'release-error.log').open('ab') as f:f.write(r.stdout+r.stderr)
  raise RuntimeError('Release command failed; inspect restricted release-error.log')
 return r.stdout
def sql(text,user='supabase_admin'):
 return run(['docker','exec','-i',DB,'psql','-U',user,'-d','postgres','-v','ON_ERROR_STOP=1','-Atq','-f','-'],text.encode())
def save(state):(ROOT/'state.json').write_text(json.dumps(state,indent=2))
phase=sys.argv[1]
if phase=='prepare':
 if (ROOT/'state.json').exists():raise RuntimeError('Release already prepared: inspect state')
 jobs=json.loads(sql("SELECT json_agg(json_build_object('id',jobid,'active',active)) FROM cron.job WHERE jobname IN ('process-scheduled-messages-every-minute','daily-automation');").decode())
 state={'prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'jobs':jobs,'old_commit':'2b2a8895bd53691f8fe8f4c70b6a69516fa248c5','new_commit':'fe02bcf33b4f58a263b1a97b8442bec2fa2f9f3a','phase':'preparing'}; save(state)
 sql("UPDATE cron.job SET active=false WHERE jobname IN ('process-scheduled-messages-every-minute','daily-automation');")
 for _ in range(40):
  inflight=int(sql("SELECT count(*) FROM public.scheduled_messages WHERE status='processing';").decode())
  if inflight==0:break
  time.sleep(2)
 else:raise RuntimeError('Workers still processing; deployment paused')
 # Return 503 instead of accepting writes during the deployment window.
 shutil.copy(STACK/'public-gateway.conf',ROOT/'public-gateway.before.conf')
 (STACK/'public-gateway.conf').write_text('server { listen 8080; server_tokens off; location / { add_header Retry-After 120 always; return 503; } }\n')
 run(['docker','exec','workout-supabase-public','nginx','-t']);run(['docker','exec','workout-supabase-public','nginx','-s','reload'])
 run(['python3',str(STACK/'backup.py')])
 state['backup']=pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip();state['phase']='prepared'; save(state); print('RELEASE_PREPARED backup='+state['backup'])
elif phase=='apply':
 state=json.loads((ROOT/'state.json').read_text())
 if state['phase']!='prepared':raise RuntimeError('Unexpected release phase')
 for file,version,name in [('staff.sql','20261011030000','staff_authorization'),('ai.sql','20261012010000','persist_ai_confirmations')]:
  exists=sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+version+"';").decode().strip()
  if exists!='0':raise RuntimeError('Migration already recorded; inspect state')
  sql((ROOT/file).read_text(),user='postgres')
  sql("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('"+version+"','"+name+"');")
  state['applied_migration']=version;save(state)
 # Install only runtime files; preserve main service and import map.
 target=ROOT/'unpacked';target.mkdir(exist_ok=True)
 run(['tar','-xzf',str(ROOT/'functions.tar.gz'),'-C',str(target)])
 source=target/'functions';destination=STACK/'volumes/functions'
 for folder in source.iterdir():
  if folder.is_dir() and folder.name not in ['main']:shutil.copytree(folder,destination/folder.name,dirs_exist_ok=True)
 env=STACK/'.env.functions';value=env.read_text();value=re.sub(r'^GEMINI_MODEL=.*$', 'GEMINI_MODEL=gemini-3.6-flash',value,flags=re.M);env.write_text(value)
 sql("NOTIFY pgrst, 'reload schema';")
 run(['docker','compose','-f',str(STACK/'docker-compose.yml'),'--project-directory',str(STACK),'up','-d','--no-deps','functions'])
 state['phase']='backend_applied';save(state);print('BACKEND_APPLIED migrations=2 model=gemini-3.6-flash')
elif phase=='resume':
 state=json.loads((ROOT/'state.json').read_text())
 if state['phase']!='backend_applied':raise RuntimeError('Backend not applied')
 shutil.copy(ROOT/'public-gateway.before.conf',STACK/'public-gateway.conf')
 run(['docker','exec','workout-supabase-public','nginx','-t']);run(['docker','exec','workout-supabase-public','nginx','-s','reload'])
 for job in state['jobs']:sql('UPDATE cron.job SET active='+('true' if job['active'] else 'false')+' WHERE jobid='+str(job['id'])+';')
 state['phase']='resumed';state['resumed_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save(state);print('PRODUCTION_RESUMED')
else:raise RuntimeError('Unknown release phase')
