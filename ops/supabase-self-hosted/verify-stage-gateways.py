#!/usr/bin/env python3
"""Candidate gateways against existing isolated staging and a mock Evolution upstream."""
import base64,hashlib,json,os,pathlib,secrets,shutil,subprocess,time,urllib.parse,uuid,re
ROOT=pathlib.Path('/home/ubuntu/workout-infra-security-20261013')
STAGE=pathlib.Path('/opt/workout-stage-security-20261012');PREFIX='workout-infra-security-qa-20261013';NET='workout-stage-full-20261012-net'
NGINX='sha256:c598465d07202c35b0b8dd2d466510aaa53a148441145c5714b59146b6a1e1b6';ENVOY='sha256:74bd4eb5629708d3fadca1a5e6b85d208f338d7bb54e06b69565905c5294cc01'
os.umask(0o077);checks=[];created=[];bucket=None;user_id=None;function_created=False
creds=json.loads((STAGE/'credentials.json').read_text());root=ROOT/'stage';root.mkdir(exist_ok=True)
def run(args,data=None):
 p=subprocess.run(args,input=data,capture_output=True)
 if p.returncode:
  (ROOT/'stage-command-error.log').write_bytes(('exit='+str(p.returncode)+' command='+str(args[:3])+'\n').encode()+p.stdout+p.stderr);raise RuntimeError('Command failed; inspect restricted log')
 return p.stdout.decode().strip()
def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
def check(name,ok):
 if not ok:raise RuntimeError('Check failed: '+name)
 checks.append(name)
def call(path,method='GET',body=None,key=None,token=None,container=None,content_type='application/json'):
 args=['docker','exec','-i',container or PREFIX+'-public','curl','-sS','--max-time','15','-w','\n%{http_code}','-X',method,'-H','Content-Type: '+content_type]
 if key:args+=['-H','apikey: '+key]
 if token:args+=['-H','Authorization: Bearer '+token]
 if body is not None:args+=['--data-binary','@-']
 args+=['http://127.0.0.1:8080'+path]
 data=body if isinstance(body,bytes) else json.dumps(body).encode() if body is not None else None
 raw=run(args,data);payload,status=raw.rsplit('\n',1)
 try:payload=json.loads(payload)
 except ValueError:pass
 return int(status),payload
check('internal_network',json.loads(run(['docker','network','inspect',NET]))[0]['Internal'])
e=inspect('workout-stage-full-20261012-edge');env=dict(x.split('=',1) for x in e['Config']['Env'])
check('no_provider_credentials',not any(env.get(x) for x in ['EVOLUTION_API_URL','EVOLUTION_INSTANCE_TOKEN','GEMINI_API_KEY','LOVABLE_API_KEY']))
for suffix in ['envoy','public','evolution','mock']:
 if subprocess.run(['docker','inspect',PREFIX+'-'+suffix],capture_output=True).returncode==0:raise RuntimeError('Existing QA container')
# Copy static production templates; use only new/fictitious stage values for secrets.
before=inspect('workout-supabase-envoy')
for m in before['Mounts']:
 dest=pathlib.PurePosixPath(m['Destination']).name
 shutil.copyfile(m['Source'],root/dest)
(root/'docker-entrypoint.sh').chmod(0o755)
cds=(root/'cds.yaml').read_text()
for old,new in [('realtime-dev.supabase-realtime','workout-stage-full-20261012-realtime'),('functions','workout-stage-full-20261012-edge')]:
 cds=cds.replace('address: '+old,'address: '+new)
(root/'cds.yaml').write_text(cds)
public=inspect('workout-supabase-public');(root/'public.conf').write_text(pathlib.Path(public['Mounts'][0]['Source']).read_text().replace('http://api-gw:8000','http://'+PREFIX+'-envoy:8000'))
evolution=inspect('evolution-api-gateway')
evolution_config=pathlib.Path(evolution['Mounts'][0]['Source']).read_text()
fixture_api=secrets.token_urlsafe(24)
fixture_basic='Basic '+base64.b64encode(('qa:'+secrets.token_urlsafe(24)).encode()).decode()
evolution_config=re.sub(r'(map \$http_apikey \$evolution_authorized \{\s*default 0;\s*)"[^"]+"',lambda m:m[1]+'"'+fixture_api+'"',evolution_config)
evolution_config=re.sub(r'"Basic [^"]+"','"'+fixture_basic+'"',evolution_config)
(root/'evolution.conf').write_text(evolution_config.replace('http://evolution-go:4000','http://'+PREFIX+'-mock:4000'))
(root/'mock.conf').write_text('server { listen 4000; location / { default_type application/json; return 200 \'{"fixture":true,"state":"open"}\'; } }')
qa=STAGE/'functions/infra-gateway-review'
if qa.exists():raise RuntimeError('Existing QA function')
def start(suffix,image,args):
 name=PREFIX+'-'+suffix
 run(['docker','run','-d','--name',name,'--network',NET,'--memory','512m','--cpus','1']+args+(['--entrypoint','/bin/sh'] if suffix=='envoy' else [])+[image]+(['/docker-entrypoint.sh','--concurrency','1'] if suffix=='envoy' else []));created.append(name)
try:
 qa.mkdir();function_created=True;(qa/'index.ts').write_text('Deno.serve(() => Response.json({fixture:true}));')
 stageenv={'ANON_KEY':creds['anon'],'SERVICE_ROLE_KEY':creds['service'],'ANON_KEY_ASYMMETRIC':'','SERVICE_ROLE_KEY_ASYMMETRIC':'','SUPABASE_PUBLISHABLE_KEY':'','SUPABASE_SECRET_KEY':'','SUPABASE_PUBLIC_URL':'http://'+PREFIX+'-public:8080','DASHBOARD_USERNAME':'qa','DASHBOARD_PASSWORD':secrets.token_urlsafe(24)}
 args=[]
 for k,v in stageenv.items():args+=['-e',k+'='+v]
 for fn in ['envoy.yaml','cds.yaml','lds.template.yaml']:args+=['-v',str(root/fn)+':/etc/envoy/'+fn+':ro']
 args+=['-v',str(root/'docker-entrypoint.sh')+':/docker-entrypoint.sh:ro']
 start('envoy',ENVOY,args)
 for suffix in ['mock','public','evolution']:
  start(suffix,NGINX,['-v',str(root/(suffix+'.conf'))+':/etc/nginx/conf.d/default.conf:ro'])
 for suffix in ['public','evolution']:check(suffix+'_nginx_config',bool(run(['docker','exec',PREFIX+'-'+suffix,'nginx','-t']) is not None))
 for _ in range(30):
  try:
   status,result=call('/auth/v1/health',key=creds['anon'])
   if status==200:break
  except Exception:pass
  time.sleep(2)
 else:raise RuntimeError('Candidate upstream health failed')
 check('auth_health',status==200)
 check('public_root_blocked',call('/')[0]==404)
 check('database_anonymous_denied',call('/rest/v1/students?select=id&limit=1',key=creds['anon'],token=creds['anon'])[0] in [401,403])
 check('database_service_allowed',call('/rest/v1/students?select=id&limit=1',key=creds['service'],token=creds['service'])[0]==200)
 status,user=call('/auth/v1/admin/users','POST',{'email':'infra-'+str(uuid.uuid4())+'@workout.test','password':secrets.token_urlsafe(32),'email_confirm':True},creds['service'],creds['service'])
 check('auth_fixture_created',status==200);user_id=user['id']
 status,result=call('/functions/v1/infra-gateway-review','POST',{},creds['service'],creds['service'])
 check('edge_fixture_forwarded',status==200 and result.get('fixture') is True)
 bucket='infra-'+str(uuid.uuid4())
 check('private_bucket_created',call('/storage/v1/bucket','POST',{'id':bucket,'name':bucket,'public':False},creds['service'],creds['service'])[0]==200)
 payload=b'Workout gateway isolated fixture'
 check('storage_upload',call('/storage/v1/object/'+bucket+'/check.txt','POST',payload,creds['service'],creds['service'],content_type='text/plain')[0]==200)
 status,result=call('/storage/v1/object/authenticated/'+bucket+'/check.txt',key=creds['service'],token=creds['service'])
 check('storage_download_exact',status==200 and result==payload.decode())
 check('private_object_anonymous_denied',call('/storage/v1/object/authenticated/'+bucket+'/check.txt',key=creds['anon'],token=creds['anon'])[0]!=200)
 # WebSocket handshake only, through both new gateways. No database subscriptions or sends.
 ws_script="""const key=process.env.QA_ANON;const ws=new WebSocket('ws://"""+PREFIX+"""-public:8080/realtime/v1/websocket?apikey='+encodeURIComponent(key)+'&vsn=1.0.0');const timer=setTimeout(()=>{console.error('timeout');process.exit(1)},15000);ws.onopen=()=>{clearTimeout(timer);console.log('WEBSOCKET_OPEN');ws.close()};ws.onerror=()=>{clearTimeout(timer);process.exit(1)};"""
 out=run(['docker','exec','-e','QA_ANON='+creds['anon'],'workout-stage-full-20261012-storage','node','-e',ws_script])
 check('realtime_websocket_upgrade','WEBSOCKET_OPEN' in out)
 status,result=call('/instance/status',key=fixture_api,container=PREFIX+'-evolution')
 check('evolution_mock_status',status==200 and result.get('fixture') is True)
 check('evolution_key_required',call('/instance/status',container=PREFIX+'-evolution')[0]==401)
 check('evolution_method_restricted',call('/instance/status','POST',{},key=fixture_api,container=PREFIX+'-evolution')[0]==405)
 check('evolution_admin_route_blocked',call('/instance/all',container=PREFIX+'-evolution')[0]==404)
 check('evolution_payload_limit',call('/send/text','POST',b'x'*70000,key=fixture_api,container=PREFIX+'-evolution')[0]==413)
finally:
 if bucket:
  call('/storage/v1/object/'+bucket,'DELETE',{'prefixes':['check.txt']},creds['service'],creds['service'])
  status,_=call('/storage/v1/bucket/'+bucket,'DELETE',key=creds['service'],token=creds['service'])
  check('bucket_removed',status in [200,404])
 if user_id:
  status,_=call('/auth/v1/admin/users/'+user_id,'DELETE',key=creds['service'],token=creds['service']);check('auth_fixture_removed',status==200)
 if function_created:(qa/'index.ts').unlink();qa.rmdir()
 for name in reversed(created):
  logs=subprocess.run(['docker','logs',name],capture_output=True)
  (ROOT/(name+'.log')).write_bytes(logs.stdout+logs.stderr)
  run(['docker','rm','-f',name])
result={'checks':checks,'production_changed':False,'whatsapp_sends':0,'provider_calls':0,'storage_image_changed':False}
(ROOT/'stage-validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
