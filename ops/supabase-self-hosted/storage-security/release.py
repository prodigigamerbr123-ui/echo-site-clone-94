#!/usr/bin/env python3
"""Replace only Storage runtime, with local backup proof and image-only rollback."""
import datetime,hashlib,json,os,pathlib,subprocess,sys,time
ROOT=pathlib.Path('/home/ubuntu/workout-storage-release-20261013')
EVIDENCE=pathlib.Path('/home/ubuntu/workout-storage-security-20261013')
STACK=pathlib.Path('/opt/workout-supabase')
NAME='workout-supabase-storage'
OLD='sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85'
NEW='sha256:527e41281258698d48648b9d2e6f881956393028f18a09967ec6bc9e2c115e42'
os.umask(0o077);ROOT.mkdir(mode=0o700,exist_ok=True)
def run(a,data=None):
 r=subprocess.run(a,input=data,capture_output=True)
 if r.returncode:
  (ROOT/'command-error.log').write_bytes(r.stdout+r.stderr)
  raise RuntimeError('Command failed; inspect restricted log')
 return r.stdout.decode().strip()
def inspect(n):return json.loads(run(['docker','inspect',n]))[0]
def sql(q):return run(['docker','exec','workout-supabase-db','psql','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-c',q])
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(s):(ROOT/'state.json').write_text(json.dumps(s,indent=2))
def inventory():
 return json.loads(sql("select json_build_object('buckets',(select count(*) from storage.buckets),'objects',(select count(*) from storage.objects),'migrations',(select md5(string_agg(id::text||name,',' order by id)) from storage.migrations),'students',(select count(*) from public.students),'users',(select count(*) from auth.users),'active_cron',(select count(*) from cron.job where active));"))
def call(path,key,token=None):
 a=['docker','exec','workout-supabase-public','curl','-sS','--max-time','15','-w','\n%{http_code}','-H','Host: backend.workoutsaas.dpdns.org','-H','apikey: '+key]
 if token:a+=['-H','Authorization: Bearer '+token]
 a+=['http://127.0.0.1:8080'+path]
 body,status=run(a).rsplit('\n',1)
 return int(status)
def verify():
 e=dict(x.split('=',1) for x in inspect('workout-supabase-envoy')['Config']['Env'])
 return {'storage_health':inspect(NAME)['State'].get('Health',{}).get('Status')=='healthy','bucket_read':call('/storage/v1/bucket',e['SERVICE_ROLE_KEY'],e['SERVICE_ROLE_KEY'])==200,'anonymous_database_denied':call('/rest/v1/students?select=id&limit=1',e['ANON_KEY'],e['ANON_KEY']) in [401,403],'auth_health':call('/auth/v1/health',e['ANON_KEY'])==200}
def compose():run(['docker','compose','-f',str(STACK/'docker-compose.yml'),'up','-d','--no-deps','--pull','never','storage'])
def wait():
 for _ in range(45):
  try:
   checks=verify()
   if all(checks.values()):return checks
  except Exception:pass
  time.sleep(2)
 raise RuntimeError('Post-release health failed')
def rollback(s):
 assert sha(STACK/'docker-compose.yml')==s['compose_after_sha256'],'Compose changed after release; review before rollback'
 (STACK/'docker-compose.yml').write_bytes((ROOT/'compose.before.yml').read_bytes());compose()
 checks=wait();assert inspect(NAME)['Image']==OLD
 s.update(phase='rolled_back',rollback_checks=checks);save(s)
phase=sys.argv[1]
if phase=='prepare':
 assert not (ROOT/'state.json').exists()
 assert inspect(NAME)['Image']==OLD
 validation=json.loads((EVIDENCE/'stage-validation.json').read_text());assert validation['image']==NEW and len(validation['checks'])==26
 scan=json.loads((EVIDENCE/'hardened-summary.json').read_text());assert scan['image']==NEW and scan['counts'].get('CRITICAL',0)==0
 checks=verify();assert all(checks.values()),checks
 before=inspect(NAME)
 (ROOT/'container.before.json').write_text(json.dumps(before,indent=2))
 (ROOT/'compose.before.yml').write_bytes((STACK/'docker-compose.yml').read_bytes())
 inv=inventory();assert inv['buckets']==0 and inv['objects']==0
 run(['python3',str(STACK/'backup.py')])
 stamp=pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip();backup=pathlib.Path('/home/ubuntu/workout-backups')/stamp
 s={'phase':'prepared','started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inventory_before':inv,'backup_stamp':stamp,'proof':{'backup':{n:sha(backup/n) for n in ['database.dump','runtime.tar.gz']},'release':{n:sha(ROOT/n) for n in ['container.before.json','compose.before.yml']}}}
 save(s);print(json.dumps(s))
elif phase=='apply':
 s=json.loads((ROOT/'state.json').read_text());assert s['phase']=='prepared'
 assert json.loads(pathlib.Path(sys.argv[2]).read_text())==s['proof'],'Independent local backup hashes required'
 assert all(sha(ROOT/n)==h for n,h in s['proof']['release'].items())
 assert sha(STACK/'docker-compose.yml')==s['proof']['release']['compose.before.yml']
 assert inspect(NAME)['Image']==OLD and inventory()==s['inventory_before']
 assert json.loads(run(['docker','image','inspect','workout-storage:1.74.0-security1']))[0]['Id']==NEW
 text=(ROOT/'compose.before.yml').read_text();assert text.count('image: supabase/storage-api:v1.74.0')==1
 updated=text.replace('image: supabase/storage-api:v1.74.0','image: workout-storage:1.74.0-security1')
 (STACK/'docker-compose.yml').write_text(updated)
 s['compose_after_sha256']=sha(STACK/'docker-compose.yml');s['phase']='applying';save(s)
 try:
  compose();checks=wait();assert inspect(NAME)['Image']==NEW
  assert inventory()==s['inventory_before'],'Inventory or migration changed'
  s.update(phase='published',checks=checks,inventory_after=inventory(),image=NEW);save(s);print(json.dumps(s))
 except Exception:
  rollback(s);raise
elif phase=='rollback':rollback(json.loads((ROOT/'state.json').read_text()))
else:raise ValueError('Unknown phase')
