#!/usr/bin/env python3
"""Isolated candidate smoke checks. Never mount production data or session keys."""
import json,pathlib,secrets,subprocess,time,urllib.request,urllib.error,re
ROOT=pathlib.Path('/home/ubuntu/workout-evolution-security-20261013')
PREFIX='workout-evolution-security-qa-20261013'
IMAGE='workout-evolution:0.7.2-security1'
checks=[]
def run(args):
 r=subprocess.run(args,capture_output=True,text=True)
 if r.returncode:
  (ROOT/'stage-command-error.log').write_text(r.stdout+r.stderr)
  raise RuntimeError('Command failed; inspect restricted stage log')
 return r.stdout.strip()
def check(name,value):
 if not value:raise RuntimeError('Check failed: '+name)
 checks.append(name)
def call(path,key=None):
 args=['docker','exec',PREFIX+'-app','wget','-S','-O','-','-T','3']
 if key:args+=['--header','apikey: '+key]
 args+=['http://127.0.0.1:4000'+path]
 result=subprocess.run(args,capture_output=True,text=True)
 status=re.findall(r'HTTP/\S+ (\d{3})',result.stderr)
 if not status:raise RuntimeError('Candidate HTTP not ready')
 try:payload=json.loads(result.stdout)
 except ValueError:payload={}
 return int(status[-1]),payload
# Refuse to replace unrelated or previously interrupted resources.
for name in [PREFIX+'-db',PREFIX+'-app']:
 r=subprocess.run(['docker','inspect',name],capture_output=True)
 if r.returncode==0:raise RuntimeError('Existing QA container: '+name)
r=subprocess.run(['docker','network','inspect',PREFIX],capture_output=True)
if r.returncode==0:raise RuntimeError('Existing QA network')
password=secrets.token_urlsafe(32);key=secrets.token_urlsafe(32)
dsn='postgres://qa:'+password+'@'+PREFIX+'-db:5432/workout_qa?sslmode=disable'
created=[];network=False
try:
 run(['docker','network','create','--internal',PREFIX]);network=True
 check('internal_network',json.loads(run(['docker','network','inspect',PREFIX]))[0]['Internal'])
 run(['docker','run','-d','--name',PREFIX+'-db','--network',PREFIX,'--memory','512m','--cpus','1','--tmpfs','/var/lib/postgresql/data:rw',
  '-e','POSTGRES_USER=qa','-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_DB=workout_qa',
  'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea']);created.append(PREFIX+'-db')
 for _ in range(60):
  r=subprocess.run(['docker','exec',PREFIX+'-db','pg_isready','-U','qa','-d','workout_qa'],capture_output=True)
  if r.returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('QA PostgreSQL not ready')
 env={'SERVER_PORT':'4000','POSTGRES_USERS_DB':dsn,'POSTGRES_AUTH_DB':dsn,'DATABASE_SAVE_MESSAGES':'false','GLOBAL_API_KEY':key,'CONNECT_ON_STARTUP':'false','LOG_TYPE':'console','MINIO_ENABLED':'false','AMQP_GLOBAL_ENABLED':'false','NATS_GLOBAL_ENABLED':'false','GIN_MODE':'release'}
 args=['docker','run','-d','--name',PREFIX+'-app','--network',PREFIX,'--memory','1g','--cpus','2','--tmpfs','/app/dbdata:rw','--tmpfs','/app/logs:rw']
 for k,v in env.items():args+=['-e',k+'='+v]
 run(args+[IMAGE]);created.append(PREFIX+'-app')
 for _ in range(60):
  try:
   status,result=call('/server/ok')
   if status==200 or (status==503 and result.get('code')=='LICENSE_REQUIRED'):break
  except Exception:pass
  time.sleep(1)
 else:
  (ROOT/'stage-app.log').write_text(run(['docker','logs',PREFIX+'-app']))
  raise RuntimeError('Candidate failed readiness')
 check('server_ready',status in (200,503))
 license_status,license_result=call('/license/status')
 check('license_status_readable',license_status==200)
 license_inactive=license_result.get('status')=='inactive'
 for path in ['/instance/all','/instance/status']:
  check(path+'_anonymous_denied',call(path)[0]==(503 if license_inactive else 401))
  check(path+'_wrong_key_denied',call(path,'invalid-fixture')[0]==(503 if license_inactive else 401))
 status,result=call('/instance/all',key)
 check('license_gate_enforced' if license_inactive else 'admin_database_query',status==(503 if license_inactive else 200))
 check('no_instances_connected',not json.loads(run(['docker','exec',PREFIX+'-db','psql','-U','qa','-d','workout_qa','-Atqc','SELECT count(*) FROM instances;'])))
 check('postgres_migrations_created_tables',int(run(['docker','exec',PREFIX+'-db','psql','-U','qa','-d','workout_qa','-Atqc',"SELECT count(*) FROM pg_tables WHERE schemaname='public';"]))>0)
 info=run(['docker','exec',PREFIX+'-app','cat','/app/workout-build-info.txt'])
 check('go_patch_applied','go1.25.14' in info)
 check('pgx_patch_applied','github.com/jackc/pgx/v5\tv5.9.2' in info)
 check('amqp_patch_applied','github.com/rabbitmq/amqp091-go\tv1.13.0' in info)
 inspect=json.loads(run(['docker','inspect',PREFIX+'-app']))[0]
 check('only_isolated_network',list(inspect['NetworkSettings']['Networks'])==[PREFIX])
 check('no_production_mounts',all(not m.get('Source','').startswith('/var/lib/docker/volumes/evolution_') for m in inspect['Mounts']))
 (ROOT/'stage-app.log').write_text(run(['docker','logs',PREFIX+'-app']))
finally:
 for name in reversed(created):run(['docker','rm','-f',name])
 if network:run(['docker','network','rm',PREFIX])
result={'checks':checks,'production_changed':False,'external_network':False,'whatsapp_sends':0,'fixtures_removed':True,'license_inactive':license_inactive,'authenticated_api_validated':not license_inactive}
(ROOT/'stage-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
