#!/usr/bin/env python3
"""Release only Envoy and two Nginx proxies; no schema or provider runtime changes."""
import copy,datetime,hashlib,http.client,json,os,pathlib,socket,subprocess,sys,time,urllib.request,urllib.error
ROOT=pathlib.Path('/home/ubuntu/workout-gateway-release-20261013');STACK=pathlib.Path('/opt/workout-supabase')
NGINX='sha256:c598465d07202c35b0b8dd2d466510aaa53a148441145c5714b59146b6a1e1b6';ENVOY='sha256:74bd4eb5629708d3fadca1a5e6b85d208f338d7bb54e06b69565905c5294cc01'
OLD_NGINX='sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236';OLD_ENVOY='sha256:57e14a549d7bd43c8d3f6d03e8cfa653e037d4b38e133acd9b54f38c524401b4'
NAMES=['workout-supabase-envoy','workout-supabase-public','evolution-api-gateway'];PREVIOUS='evolution-api-gateway-previous-20261013';NET='evolution-net'
JOBS="'process-scheduled-messages-every-minute','daily-automation'"
os.umask(0o077);ROOT.mkdir(mode=0o700,exist_ok=True)
def run(args,data=None):
 p=subprocess.run(args,input=data,capture_output=True)
 if p.returncode:
  (ROOT/'command-error.log').write_bytes(p.stdout+p.stderr);raise RuntimeError('Command failed; inspect restricted log')
 return p.stdout.decode().strip()
def inspect(n):return json.loads(run(['docker','inspect',n]))[0]
def sql(s):return run(['docker','exec','-i','workout-supabase-db','psql','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],s.encode())
def save(s):(ROOT/'state.json').write_text(json.dumps(s,indent=2))
def load():return json.loads((ROOT/'state.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def compose():run(['docker','compose','-f',str(STACK/'docker-compose.yml'),'up','-d','--no-deps','--pull','never','api-gw','public-gateway'])
def restore_jobs(s):
 for j in s['jobs']:sql('UPDATE cron.job SET active='+('true' if j['active'] else 'false')+' WHERE jobid='+str(j['id'])+';')
def env(n):return dict(x.split('=',1) for x in inspect(n)['Config']['Env'])
def call(path,key=None,token=None,base='https://backend.workoutsaas.dpdns.org'):
 if base=='https://backend.workoutsaas.dpdns.org':
  args=['docker','exec','workout-supabase-public','curl','-sS','--max-time','15','-w','\n%{http_code}','-H','Host: backend.workoutsaas.dpdns.org']
  if key:args+=['-H','apikey: '+key]
  if token:args+=['-H','Authorization: Bearer '+token]
  args+=['http://127.0.0.1:8080'+path]
  raw=run(args);body,status=raw.rsplit('\n',1)
  try:body=json.loads(body)
  except ValueError:body=None
  return int(status),body
 headers={}
 if key:headers['apikey']=key
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(base+path,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=15) as r:status=r.status;body=r.read()
 except urllib.error.HTTPError as e:status=e.code;body=e.read()
 try:body=json.loads(body)
 except ValueError:body=None
 return status,body
def verify():
 cfg=env('workout-supabase-envoy');anon=cfg['ANON_KEY'];service=cfg['SERVICE_ROLE_KEY']
 checks={}
 checks['auth_health']=call('/auth/v1/health',anon)[0]==200
 checks['anonymous_data_denied']=call('/rest/v1/students?select=id&limit=1',anon,anon)[0] in [401,403]
 checks['service_database_allowed']=call('/rest/v1/students?select=id&limit=1',service,service)[0]==200
 checks['storage_buckets_readable']=call('/storage/v1/bucket',service,service)[0]==200
 checks['admin_route_not_public']=call('/project/default')[0]==404
 edge=env('workout-supabase-edge-functions');key=edge['EVOLUTION_INSTANCE_TOKEN']
 status,body=call('/instance/status',key,base='http://127.0.0.1:4001');d=body.get('data',body) if isinstance(body,dict) else {}
 checks['evolution_status_connected']=status==200 and d.get('Connected',d.get('connected')) is True and d.get('LoggedIn',d.get('loggedIn')) is True
 checks['evolution_no_key_denied']=call('/instance/status',base='http://127.0.0.1:4001')[0]==401
 checks['evolution_admin_route_blocked']=call('/instance/all',base='http://127.0.0.1:4001')[0]==404
 return checks
class DockerConnection(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(30);self.sock.connect('/var/run/docker.sock')
def create_proxy(before):
 config=copy.deepcopy(before['Config']);config['Image']=NGINX;config['Hostname']='evolution-api-gateway'
 previous_defaults=dict(x.split('=',1) for x in json.loads(run(['docker','image','inspect',before['Image']]))[0]['Config'].get('Env',[]))
 current_defaults=dict(x.split('=',1) for x in json.loads(run(['docker','image','inspect',NGINX]))[0]['Config'].get('Env',[]))
 overrides={k:v for k,v in dict(x.split('=',1) for x in before['Config']['Env']).items() if previous_defaults.get(k)!=v}
 current_defaults.update(overrides);config['Env']=[k+'='+v for k,v in current_defaults.items()]
 config['HostConfig']=copy.deepcopy(before['HostConfig'])
 aliases=[a for a in before['NetworkSettings']['Networks'][NET].get('Aliases',[]) or [] if a not in [before['Id'],before['Id'][:12],before['Config']['Hostname']]]
 if 'evolution-api-gateway' not in aliases:aliases.append('evolution-api-gateway')
 config['NetworkingConfig']={'EndpointsConfig':{NET:{'Aliases':aliases}}}
 conn=DockerConnection('localhost');conn.request('POST','/containers/create?name=evolution-api-gateway',json.dumps(config),{'Content-Type':'application/json'})
 response=conn.getresponse();body=response.read();conn.close()
 if response.status!=201:(ROOT/'create-error.log').write_bytes(body);raise RuntimeError('Proxy creation failed')
 return json.loads(body)['Id']
def rollback(s):
 (STACK/'docker-compose.yml').write_bytes((ROOT/'docker-compose.before.yml').read_bytes());compose()
 if subprocess.run(['docker','inspect',PREVIOUS],capture_output=True).returncode==0:
  if subprocess.run(['docker','inspect','evolution-api-gateway'],capture_output=True).returncode==0:
   assert inspect('evolution-api-gateway')['Image']==NGINX;run(['docker','rm','-f','evolution-api-gateway'])
  if NET not in inspect(PREVIOUS)['NetworkSettings']['Networks']:run(['docker','network','connect','--alias','evolution-api-gateway',NET,PREVIOUS])
  run(['docker','rename',PREVIOUS,'evolution-api-gateway']);run(['docker','start','evolution-api-gateway'])
 good=False
 for _ in range(20):
  try:
   if all(verify().values()):good=True;break
  except Exception:pass
  time.sleep(2)
 s['phase']='restored' if good else 'restore_needs_attention';save(s)
 if good:restore_jobs(s)
 else:raise RuntimeError('Rollback requires attention; jobs remain paused')
phase=sys.argv[1]
if phase=='preflight':
 assert subprocess.run(['docker','inspect',PREVIOUS],capture_output=True).returncode!=0
 assert inspect(NAMES[0])['Image']==OLD_ENVOY
 assert all(inspect(n)['Image']==OLD_NGINX for n in NAMES[1:])
 for im in [NGINX,ENVOY]:assert json.loads(run(['docker','image','inspect',im]))[0]['Id']==im
 checks=verify();assert all(checks.values()),checks
 assert json.loads((pathlib.Path('/home/ubuntu/workout-infra-security-20261013')/'stage-validation.json').read_text())['production_changed'] is False
 print(json.dumps({'preflight':'passed','checks':checks}))
elif phase=='prepare':
 assert not (ROOT/'state.json').exists()
 jobs=json.loads(sql("SELECT json_agg(json_build_object('id',jobid,'active',active)) FROM cron.job WHERE jobname IN ("+JOBS+");"));assert len(jobs)==2
 s={'phase':'pausing','jobs':jobs,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat()};save(s)
 try:
  sql('UPDATE cron.job SET active=false WHERE jobname IN ('+JOBS+');')
  for _ in range(30):
   if sql("SELECT (SELECT count(*) FROM scheduled_messages WHERE status='processing')+(SELECT count(*) FROM whatsapp_delivery_lease WHERE token IS NOT NULL)+(SELECT count(*) FROM net.http_request_queue);")=='0':break
   time.sleep(2)
  else:raise RuntimeError('Workers not idle')
  before={name:inspect(name) for name in NAMES};(ROOT/'containers.before.json').write_text(json.dumps(before,indent=2))
  (ROOT/'docker-compose.before.yml').write_bytes((STACK/'docker-compose.yml').read_bytes())
  configs={m['Source']:digest(pathlib.Path(m['Source'])) for c in before.values() for m in c['Mounts']}
  (ROOT/'config-hashes.json').write_text(json.dumps(configs,indent=2))
  import tarfile
  with tarfile.open(ROOT/'gateway-configs.tar.gz','w:gz') as t:
   for i,src in enumerate(configs):t.add(src,arcname=str(i)+'-'+pathlib.Path(src).name)
  run(['python3',str(STACK/'backup.py')]);stamp=pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip();s['backup_stamp']=stamp
  backup=pathlib.Path('/home/ubuntu/workout-backups')/stamp
  s['backup_sha256']={n:digest(backup/n) for n in ['database.dump','runtime.tar.gz']}
  s['release_sha256']={n:digest(ROOT/n) for n in ['containers.before.json','docker-compose.before.yml','gateway-configs.tar.gz','config-hashes.json']}
  s['phase']='prepared';save(s);print(json.dumps({'phase':'prepared','backup_stamp':stamp,'backup_sha256':s['backup_sha256'],'release_sha256':s['release_sha256']}))
 except Exception:
  restore_jobs(s);s['phase']='aborted_before_apply';save(s);raise
elif phase=='apply':
 s=load();assert s['phase']=='prepared';proof=json.loads(sys.argv[2]);assert proof=={'backup':s['backup_sha256'],'release':s['release_sha256']}
 assert all(digest(ROOT/n)==h for n,h in s['release_sha256'].items())
 assert all(digest(pathlib.Path(n))==h for n,h in json.loads((ROOT/'config-hashes.json').read_text()).items())
 text=(ROOT/'docker-compose.before.yml').read_text()
 assert text.count('image: envoyproxy/envoy:v1.39.1')==1 and text.count('image: nginx:1.28-alpine')==1
 text=text.replace('image: envoyproxy/envoy:v1.39.1','image: envoyproxy/envoy:v1.39.4@'+ENVOY).replace('image: nginx:1.28-alpine','image: workout-nginx:1.30.5-security1')
 try:
  (STACK/'docker-compose.yml').write_text(text);run(['docker','compose','-f',str(STACK/'docker-compose.yml'),'config','--quiet']);compose()
  before=json.loads((ROOT/'containers.before.json').read_text())['evolution-api-gateway']
  run(['docker','stop','--time','15','evolution-api-gateway']);run(['docker','rename','evolution-api-gateway',PREVIOUS]);run(['docker','network','disconnect',NET,PREVIOUS])
  s['proxy_candidate_id']=create_proxy(before);save(s);run(['docker','start','evolution-api-gateway'])
  for _ in range(20):
   try:
    checks=verify()
    if all(checks.values()):break
   except Exception:pass
   time.sleep(2)
  else:raise RuntimeError('Gateway live verification failed')
  assert inspect(NAMES[0])['Image']==ENVOY and all(inspect(n)['Image']==NGINX for n in NAMES[1:])
  s['phase']='verified';s['validation']=checks;save(s);print(json.dumps({'phase':'verified','checks':checks}))
 except Exception:
  rollback(s);raise
elif phase=='resume':
 s=load();assert s['phase']=='verified';assert all(verify().values());restore_jobs(s);s['phase']='resumed';s['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();save(s)
 print(json.dumps({'phase':'resumed','active_jobs':int(sql('SELECT count(*) FROM cron.job WHERE jobname IN ('+JOBS+') AND active;'))}))
elif phase=='rollback':rollback(load());print('PREVIOUS_GATEWAYS_RESTORED')
else:raise RuntimeError('Unknown phase')
