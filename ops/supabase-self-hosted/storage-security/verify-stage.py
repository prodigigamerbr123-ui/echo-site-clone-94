#!/usr/bin/env python3
"""Exercise unchanged Storage application with a hardened runtime in isolated staging."""
import base64, hashlib, hmac, json, os, pathlib, subprocess, time, uuid
os.umask(0o077)
ROOT=pathlib.Path('/home/ubuntu/workout-storage-security-20261013')
STAGE=pathlib.Path('/opt/workout-stage-security-20261012')
ORIGINAL='workout-stage-full-20261012-storage'
CANDIDATE='workout-storage-security-qa-20261013'
DB='workout-stage-full-20261012-db'
NET='workout-stage-full-20261012-net'
IMAGE='workout-storage:1.74.0-security1'
checks=[]
def run(args,data=None):
 p=subprocess.run(args,input=data,capture_output=True)
 if p.returncode:
  (ROOT/'stage-error.log').write_bytes(p.stdout+p.stderr)
  raise RuntimeError('Command failed; inspect restricted stage-error.log')
 return p.stdout.decode().strip()
def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
def check(name,ok):
 if not ok:raise RuntimeError('Failed: '+name)
 checks.append(name)
def sql(q):return run(['docker','exec',DB,'psql','-U','stage_bootstrap','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-c',q])
def digest(image):
 code="const fs=require('fs'),crypto=require('crypto'),p=require('path');let a=[];function walk(d){for(const f of fs.readdirSync(d).sort()){let n=p.join(d,f),s=fs.lstatSync(n);if(s.isDirectory())walk(n);else if(s.isFile())a.push(n+':'+crypto.createHash('sha256').update(fs.readFileSync(n)).digest('hex'));}}for(let d of ['dist','migrations','node_modules'])walk(d);console.log(crypto.createHash('sha256').update(a.join('\\n')).digest('hex'));"
 return run(['docker','run','--rm','--network','none','--entrypoint','node',image,'-e',code])
check('network_internal',json.loads(run(['docker','network','inspect',NET]))[0]['Internal'])
if subprocess.run(['docker','inspect',CANDIDATE],capture_output=True).returncode==0:raise RuntimeError('Existing candidate')
old=inspect(ORIGINAL);check('stage_running',old['State']['Running'])
check('application_dependencies_migrations_identical',digest(old['Image'])==digest(IMAGE))
creds=json.loads((STAGE/'credentials.json').read_text())
def token(role):
 def enc(v):return base64.urlsafe_b64encode(json.dumps(v,separators=(',',':')).encode()).rstrip(b'=').decode()
 claims={'role':role,'iss':'supabase','iat':int(time.time())-10,'exp':int(time.time())+3600}
 if role=='authenticated':claims['sub']=str(uuid.uuid4())
 msg=enc({'alg':'HS256','typ':'JWT'})+'.'+enc(claims)
 return msg+'.'+base64.urlsafe_b64encode(hmac.new(creds['jwt'].encode(),msg.encode(),hashlib.sha256).digest()).rstrip(b'=').decode()
service=token('service_role');anon=token('anon');user=token('authenticated')
node="""const fs=require('fs');(async()=>{let q=JSON.parse(fs.readFileSync(0,'utf8'));let r=await fetch(q.url,{method:q.method,headers:q.headers,body:q.body===null?undefined:Buffer.from(q.body,'base64')});console.log(JSON.stringify({status:r.status,body:Buffer.from(await r.arrayBuffer()).toString('base64'),headers:Object.fromEntries(r.headers)}))})().catch(()=>process.exit(1));"""
def call(path,method='GET',body=None,key=service,mime='application/json',headers=None):
 h={'Authorization':'Bearer '+key,'apikey':key,'Content-Type':mime};h.update(headers or {})
 data=body if isinstance(body,bytes) else json.dumps(body).encode() if body is not None else None
 q={'url':'http://'+CANDIDATE+':5000'+path,'method':method,'headers':h,'body':base64.b64encode(data).decode() if data is not None else None}
 r=json.loads(run(['docker','exec','-i',ORIGINAL,'node','-e',node],json.dumps(q).encode()))
 raw=base64.b64decode(r['body'])
 try:value=json.loads(raw)
 except ValueError:value=raw
 return r['status'],value,r['headers']
files=ROOT/('stage-files-'+str(uuid.uuid4()));files.mkdir()
check('fixture_directory_empty',not any(files.iterdir()))
args=['docker','run','-d','--name',CANDIDATE,'--network',NET,'--memory','768m','--cpus','1','-v',str(files)+':/var/lib/storage']
image_env={s.split('=',1)[0] for s in json.loads(run(['docker','image','inspect',old['Image']]))[0]['Config'].get('Env',[])}
# Keep configured variables; exclude base-image defaults.
for entry in old['Config']['Env']:
 k=entry.split('=',1)[0]
 if k not in image_env:args+=['-e',entry]
args += [IMAGE]
before=sql("select md5(string_agg(id::text||name,',' order by id)) from storage.migrations")
bucket='security-'+str(uuid.uuid4());created=False;started=False
try:
 run(args);started=True
 for _ in range(30):
  try:
   if call('/status')[0]==200:break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('Candidate health failed')
 check('candidate_health',True)
 check('private_bucket_create',call('/bucket','POST',{'id':bucket,'name':bucket,'public':False})[0]==200);created=True
 payload=b'Workout isolated Storage runtime verification'
 check('upload',call('/object/'+bucket+'/check.txt','POST',payload,mime='text/plain')[0]==200)
 check('duplicate_upload_rejected',call('/object/'+bucket+'/check.txt','POST',payload,mime='text/plain')[0]>=400)
 check('download_exact',call('/object/authenticated/'+bucket+'/check.txt')[1]==payload)
 check('anonymous_private_download_denied',call('/object/authenticated/'+bucket+'/check.txt',key=anon)[0]>=400)
 check('unassigned_login_private_download_denied',call('/object/authenticated/'+bucket+'/check.txt',key=user)[0]>=400)
 check('anonymous_upload_denied',call('/object/'+bucket+'/forbidden.txt','POST',payload,key=anon,mime='text/plain')[0]>=400)
 status,deleted,_=call('/object/'+bucket,'DELETE',{'prefixes':['check.txt']},key=user)
 check('unassigned_login_delete_denied',status>=400 or deleted==[])
 check('private_object_preserved_after_denied_delete',call('/object/authenticated/'+bucket+'/check.txt')[1]==payload)
 status,listing,_=call('/object/list/'+bucket,'POST',{'prefix':'','limit':10})
 check('list_uploaded_object',status==200 and any(x['name']=='check.txt' for x in listing))
 check('object_copy',call('/object/copy','POST',{'bucketId':bucket,'sourceKey':'check.txt','destinationKey':'copy.txt'})[0]==200)
 check('object_move',call('/object/move','POST',{'bucketId':bucket,'sourceKey':'copy.txt','destinationKey':'moved.txt'})[0]==200)
 check('copy_content_exact',call('/object/authenticated/'+bucket+'/moved.txt')[1]==payload)
 status,signed,_=call('/object/sign/'+bucket+'/check.txt','POST',{'expiresIn':60})
 check('signed_url_created',status==200 and bool(signed.get('signedURL')))
 check('signed_download_exact',call(signed['signedURL'],key=anon)[1]==payload)
 check('upsert',call('/object/'+bucket+'/check.txt','POST',payload+b' updated',mime='text/plain',headers={'x-upsert':'true'})[0]==200)
 check('upsert_content_exact',call('/object/authenticated/'+bucket+'/check.txt')[1]==payload+b' updated')
 check('no_schema_migration',before==sql("select md5(string_agg(id::text||name,',' order by id)) from storage.migrations"))
finally:
 try:
  if created:
   check('fixture_objects_removed',call('/object/'+bucket,'DELETE',{'prefixes':['check.txt','moved.txt']})[0]==200)
   check('fixture_bucket_removed',call('/bucket/'+bucket,'DELETE')[0]==200)
 finally:
  if started:run(['docker','rm','-f',CANDIDATE])
check('original_storage_preserved',inspect(ORIGINAL)['Id']==old['Id'] and inspect(ORIGINAL)['State']['Running'])
# Remove only empty fixture directories, retaining any unexpected file for diagnosis.
for directory in sorted((p for p in files.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):directory.rmdir()
files.rmdir()
(ROOT/'stage-validation.json').write_text(json.dumps({'image':json.loads(run(['docker','image','inspect',IMAGE]))[0]['Id'],'checks':checks},indent=2))
print(json.dumps({'passed':len(checks),'checks':checks}))
