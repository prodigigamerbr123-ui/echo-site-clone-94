#!/usr/bin/env python3
"""Controlled same-instance update. No message sends, license cloning or DB restores."""
import copy,datetime,hashlib,http.client,json,os,pathlib,socket,subprocess,sys,time,urllib.request
ROOT=pathlib.Path('/home/ubuntu/workout-evolution-release-20261013')
OLD='sha256:e8ed22400352063d8d134d70b388c4ce582c6464fc35a58706b2830770a6bba8'
NEW='sha256:8e1022c8b5ed34eede17d9449329fc330c746439d3844d51f2d1bd0be518665a'
NAME='evolution-go';PREVIOUS='evolution-go-previous-security-20261013';NETWORK='evolution-net'
JOBS="'process-scheduled-messages-every-minute','daily-automation'"
os.umask(0o077);ROOT.mkdir(mode=0o700,exist_ok=True)
def run(args,data=None):
 p=subprocess.run(args,input=data,capture_output=True)
 if p.returncode:
  (ROOT/'command-error.log').write_bytes(p.stdout+p.stderr)
  raise RuntimeError('Command failed; inspect restricted log')
 return p.stdout.decode().strip()
def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
def sql(s):return run(['docker','exec','-i','workout-supabase-db','psql','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],s.encode())
def save(s):(ROOT/'state.json').write_text(json.dumps(s,indent=2))
def state():return json.loads((ROOT/'state.json').read_text())
def request(path,key=None):
 req=urllib.request.Request('http://127.0.0.1:4000'+path,headers={'apikey':key} if key else {})
 with urllib.request.urlopen(req,timeout=12) as r:return json.load(r)
def connected(key):
 d=request('/instance/status',key);d=d.get('data',d)
 return d.get('Connected',d.get('connected')) is True and d.get('LoggedIn',d.get('loggedIn')) is True
def keys():
 c=inspect(NAME);env=dict(x.split('=',1) for x in c['Config']['Env'])
 edge=dict(x.split('=',1) for x in inspect('workout-supabase-edge-functions')['Config']['Env'])
 return env['GLOBAL_API_KEY'],edge['EVOLUTION_INSTANCE_TOKEN']
def restore_jobs(s):
 for j in s['jobs']:sql('UPDATE cron.job SET active='+('true' if j['active'] else 'false')+' WHERE jobid='+str(j['id'])+';')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class DockerConnection(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(30);self.sock.connect('/var/run/docker.sock')
def create_candidate(before):
 config=copy.deepcopy(before['Config']);config['Image']=NEW;config['Hostname']=NAME
 config['HostConfig']=copy.deepcopy(before['HostConfig'])
 aliases=[a for a in before['NetworkSettings']['Networks'][NETWORK].get('Aliases',[]) or [] if a not in [before['Id'],before['Id'][:12],before['Config']['Hostname']]]
 if NAME not in aliases:aliases.append(NAME)
 config['NetworkingConfig']={'EndpointsConfig':{NETWORK:{'Aliases':aliases}}}
 conn=DockerConnection('localhost');conn.request('POST','/containers/create?name='+NAME,body=json.dumps(config),headers={'Content-Type':'application/json'})
 response=conn.getresponse();body=response.read();conn.close()
 if response.status!=201:
  (ROOT/'create-error.log').write_bytes(body);raise RuntimeError('Candidate creation failed')
 return json.loads(body)['Id']
def rollback(s):
 old=inspect(PREVIOUS) if subprocess.run(['docker','inspect',PREVIOUS],capture_output=True).returncode==0 else None
 if old:
  if subprocess.run(['docker','inspect',NAME],capture_output=True).returncode==0:
   current=inspect(NAME)
   if current['Image']!=NEW:raise RuntimeError('Refuse to remove unexpected container')
   run(['docker','rm','-f',NAME])
  if NETWORK not in inspect(PREVIOUS)['NetworkSettings']['Networks']:
   run(['docker','network','connect','--alias',NAME,NETWORK,PREVIOUS])
  run(['docker','rename',PREVIOUS,NAME]);run(['docker','start',NAME])
 else:
  current=inspect(NAME)
  if current['Image']!=OLD:raise RuntimeError('Previous image unavailable')
  if not current['State']['Running']:run(['docker','start',NAME])
 ready=False
 for _ in range(45):
  try:
   admin,key=keys()
   if request('/license/status').get('status')=='active' and connected(key):ready=True;break
  except Exception:pass
  time.sleep(2)
 s['phase']='restored' if ready else 'restore_needs_attention';save(s)
 if ready:restore_jobs(s)
 else:raise RuntimeError('Previous runtime needs attention; jobs remain paused')
phase=sys.argv[1]
if phase=='preflight':
 c=inspect(NAME);assert c['Image']==OLD and c['State']['Running']
 assert set(c['NetworkSettings']['Networks'])=={NETWORK}
 assert all(m['Type']=='volume' for m in c['Mounts']) and not c['HostConfig']['Privileged']
 assert json.loads(run(['docker','image','inspect',NEW]))[0]['Id']==NEW
 admin,key=keys();assert request('/license/status').get('status')=='active' and connected(key)
 assert isinstance(request('/instance/all',admin).get('data'),list)
 assert sql('SELECT count(*) FROM cron.job WHERE jobname IN ('+JOBS+');')=='2'
 assert subprocess.run(['docker','inspect',PREVIOUS],capture_output=True).returncode!=0
 print(json.dumps({'preflight':'passed','license_active':True,'whatsapp_connected':True,'instance_count':len(request('/instance/all',admin)['data'])}))
elif phase=='prepare':
 assert not (ROOT/'state.json').exists()
 c=inspect(NAME);assert c['Image']==OLD
 jobs=json.loads(sql("SELECT json_agg(json_build_object('id',jobid,'active',active)) FROM cron.job WHERE jobname IN ("+JOBS+");"));assert len(jobs)==2
 admin,key=keys();count=len(request('/instance/all',admin)['data'])
 s={'phase':'pausing','jobs':jobs,'instance_count':count,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat()};save(s)
 try:
  sql('UPDATE cron.job SET active=false WHERE jobname IN ('+JOBS+');')
  for _ in range(30):
   if sql("SELECT (SELECT count(*) FROM scheduled_messages WHERE status='processing')+(SELECT count(*) FROM whatsapp_delivery_lease WHERE token IS NOT NULL)+(SELECT count(*) FROM net.http_request_queue);")=='0':break
   time.sleep(2)
  else:raise RuntimeError('Workers not idle')
  (ROOT/'container.before.json').write_text(json.dumps(c,indent=2))
  run(['docker','stop','--time','30',NAME])
  pg=inspect('evolution-postgres');env=dict(x.split('=',1) for x in pg['Config']['Env']);user=env.get('POSTGRES_USER','postgres')
  for db in ['evogo_auth','evogo_users']:
   with (ROOT/(db+'.dump')).open('wb') as f:
    p=subprocess.run(['docker','exec','evolution-postgres','pg_dump','-U',user,'-Fc','-d',db],stdout=f,stderr=subprocess.PIPE)
    if p.returncode:raise RuntimeError('Evolution database backup failed')
  mounts={m['Destination']:m['Source'] for m in c['Mounts']}
  assert set(mounts)=={'/app/dbdata','/app/logs'}
  import tarfile
  with tarfile.open(ROOT/'volumes.tar.gz','w:gz') as t:
   for dest,source in mounts.items():t.add(source,arcname='dbdata' if dest=='/app/dbdata' else 'logs')
  s['backup_sha256']={n:digest(ROOT/n) for n in ['evogo_auth.dump','evogo_users.dump','volumes.tar.gz','container.before.json']}
  s['phase']='prepared';save(s);print(json.dumps({'phase':'prepared','backup_sha256':s['backup_sha256']}))
 except Exception:
  rollback(s);raise
elif phase=='apply':
 s=state();assert s['phase']=='prepared'
 proof=json.loads(sys.argv[2]);assert proof==s['backup_sha256']
 assert all(digest(ROOT/n)==h for n,h in proof.items())
 try:
  before=json.loads((ROOT/'container.before.json').read_text())
  run(['docker','rename',NAME,PREVIOUS]);run(['docker','network','disconnect',NETWORK,PREVIOUS])
  s['candidate_id']=create_candidate(before);save(s);run(['docker','start',NAME])
  for _ in range(60):
   try:
    admin,key=keys()
    if request('/license/status').get('status')=='active' and len(request('/instance/all',admin)['data'])==s['instance_count'] and connected(key):break
   except Exception:pass
   time.sleep(2)
  else:raise RuntimeError('Candidate failed live verification')
  assert inspect(NAME)['Image']==NEW
  s['phase']='candidate_verified';s['validation']={'license_active':True,'instance_count_preserved':True,'whatsapp_connected':True,'message_sends':0};save(s)
  print(json.dumps({'phase':s['phase'],'validation':s['validation']}))
 except Exception:
  rollback(s);raise
elif phase=='resume':
 s=state();assert s['phase']=='candidate_verified'
 admin,key=keys();assert request('/license/status').get('status')=='active' and connected(key)
 restore_jobs(s);s['phase']='resumed';s['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();save(s)
 print(json.dumps({'phase':'resumed','active_jobs':int(sql('SELECT count(*) FROM cron.job WHERE jobname IN ('+JOBS+') AND active;'))}))
elif phase=='rollback':rollback(state());print('PREVIOUS_RUNTIME_RESTORED')
else:raise RuntimeError('Unknown phase')
