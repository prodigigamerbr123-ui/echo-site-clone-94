#!/usr/bin/env python3
"""One allowlisted live WhatsApp send through the isolated staging worker."""
import concurrent.futures, datetime, json, pathlib, runpy, secrets, subprocess, time, urllib.request, urllib.error, uuid
ROOT=pathlib.Path('/opt/workout-stage-security-20261012'); g=runpy.run_path(str(ROOT/'stage-security.py')); sql=g['sql']; run=g['run']; start=g['start']; PREFIX=g['PREFIX']
c=json.loads((ROOT/'credentials.json').read_text()); prod=json.loads(run(['docker','inspect','workout-supabase-edge-functions']))[0]
if (ROOT/'whatsapp-attempt.json').exists(): raise RuntimeError('Live test already attempted; inspect its result without sending again')
p=dict(v.split('=',1) for v in prod['Config']['Env'])
number=c['whatsapp_test_number']; marker='Teste do sistema Workout: validação da fila concluída (staging '+secrets.token_hex(4)+').'
proxy_token=secrets.token_hex(32); sends=0
net=json.loads(run(['docker','network','inspect',PREFIX+'-access']))[0]; host=net['IPAM']['Config'][0]['Gateway']
gateway_path=ROOT/'nginx.conf'; gateway_original=gateway_path.read_text()
gateway_path.write_text(gateway_original.replace('location /auth/v1/', 'location /test-provider/ { proxy_pass http://test-provider:18100/; }\nlocation /auth/v1/'))
proxy_settings={'token':proxy_token,'number':number,'text':marker,'url':p['EVOLUTION_API_URL'].rstrip('/'),'key':p['EVOLUTION_INSTANCE_TOKEN']}
(ROOT/'proxy-settings.json').write_text(json.dumps(proxy_settings))
node_source="""
const fs=require('fs'); const http=require('http'); const c=JSON.parse(fs.readFileSync('/settings.json'));
http.createServer(async(req,res)=>{
 if(req.headers.apikey!==c.token){res.writeHead(401);res.end();return;}
 let body=''; for await(const b of req) body+=b;
 if(req.method==='POST'){
  let d;try{d=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
  if(req.url!=='/send/text'||d.number!==c.number||d.text!==c.text){res.writeHead(403);res.end();return;}
  try{fs.writeFileSync('/state/whatsapp-attempt.json',JSON.stringify({reserved:new Date().toISOString()}),{flag:'wx',mode:384});}catch{res.writeHead(409);res.end();return;}
 }else if(req.method!=='GET'||req.url!=='/instance/status'){res.writeHead(403);res.end();return;}
 try{let r=await fetch(c.url+req.url,{method:req.method,headers:{apikey:c.key,'Content-Type':'application/json','User-Agent':'WorkoutSaaS/1.0'},body:req.method==='POST'?body:undefined,signal:AbortSignal.timeout(17000)});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());}
 catch{res.writeHead(502);res.end(JSON.stringify({error:'Delivery uncertain'}));}
}).listen(18100,'0.0.0.0');
"""
(ROOT/'proxy.js').write_text(node_source)
proxy_name=PREFIX+'-test-provider'
run(['docker','create','--name',proxy_name,'--network',PREFIX+'-access','--memory','128m','-v',str(ROOT/'proxy.js')+':/proxy.js:ro','-v',str(ROOT/'proxy-settings.json')+':/settings.json:ro','-v',str(ROOT)+':/state','node:22-alpine','node','/proxy.js'])
run(['docker','network','connect','--alias','test-provider',g['NETWORK'],proxy_name]); run(['docker','start',proxy_name])
checks=[]
def call(path,body,token,extra=None,method='POST'):
 req=urllib.request.Request('http://127.0.0.1:18090'+path,data=json.dumps(body).encode(),method=method,headers={'Authorization':'Bearer '+token,'apikey':c['anon'],'Content-Type':'application/json',**(extra or {})})
 with urllib.request.urlopen(req,timeout=45) as r: return json.loads(r.read() or 'null')
def check(name,condition):
 if not condition: raise RuntimeError('Staging check failed: '+name)
 checks.append(name)
# Disarm the restored queue before enabling this allowlisted proxy.
sql("SET session_replication_role=replica; UPDATE scheduled_messages SET status='cancelled',dispatch_started_at=NULL WHERE status IN ('pending','processing'); SET session_replication_role=origin;")
edgeenv=dict(line.split('=',1) for line in (ROOT/'edge.env').read_text().splitlines())
original=edgeenv.copy(); edgeenv.update(EVOLUTION_API_URL='http://gateway:8080/test-provider',EVOLUTION_INSTANCE_TOKEN=proxy_token)
def recreate(values):
 run(['docker','rm','-f',PREFIX+'-edge'])
 start('edge','supabase/edge-runtime:v1.76.2',values,extra=('--network-alias','edge','-v',str(ROOT/'functions')+':/home/deno/functions:ro','-v',str(ROOT/'deno-cache')+':/root/.cache/deno'),command=('start','--main-service','/home/deno/functions/main'))
 run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
 for _ in range(30):
  try:
   with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:18090/functions/v1/send-whatsapp',method='GET'),timeout=2) as r:
    if r.status==200: return
  except urllib.error.HTTPError as e:
   if e.code==401: return
  except Exception: pass
  time.sleep(.3)
 raise RuntimeError('Staging edge did not become ready')
try:
 recreate(edgeenv)
 probe=urllib.request.Request('http://127.0.0.1:18090/test-provider/instance/status',headers={'apikey':proxy_token})
 with urllib.request.urlopen(probe,timeout=15) as r:
  status_data=json.load(r); d=status_data.get('data',status_data)
  print('PROXY_STATUS',r.status, bool(d.get('Connected',d.get('connected'))), bool(d.get('LoggedIn',d.get('loggedIn'))))
 student=sql("SELECT id FROM students WHERE phone='"+number+"' LIMIT 1;").decode().strip(); admin=c['users']['admin']['token']
 if not student:
  student=str(uuid.uuid4())
  call('/rest/v1/students',{'id':student,'name':'Teste autorizado Workout','phone':number,'status':'active'},c['service'])
 # Cancel one queued message and verify a worker invocation sends nothing.
 call('/functions/v1/send-whatsapp',{'message':'Teste cancelado de staging','students':[{'id':student}]},admin)
 ids=sql("SELECT id FROM scheduled_messages WHERE student_id='"+student+"' AND status='pending';").decode().strip().splitlines()
 result=call('/rest/v1/rpc/cancel_scheduled_messages_tx',{'_ids':ids,'_whole_series':False},admin)
 check('cancellation',result['cancelled']==1)
 cron={'x-cron-secret':edgeenv['CRON_SECRET']}
 result=call('/functions/v1/process-scheduled-messages',{},c['anon'],cron)
 check('cancelled_message_not_sent',result.get('sent')==0 and sends==0)
 call('/functions/v1/send-whatsapp',{'message':marker,'students':[{'id':student}]},admin)
 queue=sql("SELECT id FROM scheduled_messages WHERE student_id='"+student+"' AND status='pending';").decode().strip()
 call('/rest/v1/scheduled_messages?id=eq.'+queue,{'scheduled_for':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=5)).isoformat()},c['service'],method='PATCH')
 # The worker deliberately applies a global cooldown even after an empty run.
 time.sleep(5.2)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  results=list(pool.map(lambda _:call('/functions/v1/process-scheduled-messages',{},c['anon'],cron),range(2)))
 sends=int((ROOT/'whatsapp-attempt.json').exists()); print('WORKER_COUNTS',json.dumps(results))
 check('single_provider_request',sends==1)
 check('concurrent_worker_single_send',sum(r.get('sent',0) for r in results)==1)
 check('queue_sent',sql("SELECT status FROM scheduled_messages WHERE id='"+queue+"';").decode().strip()=='sent')
 check('single_history_entry',sql("SELECT count(*) FROM messages WHERE scheduled_message_id='"+queue+"' AND provider_message_id IS NOT NULL;").decode().strip()=='1')
 result=call('/functions/v1/process-scheduled-messages',{},c['anon'],cron)
 check('repeat_worker_no_duplicate',result.get('sent')==0 and sends==1)
 result={'checks_passed':len(checks),'provider_requests':sends,'cancelled_not_sent':True,'history_entries':1,'production_database_changed':False}
 (ROOT/'whatsapp-e2e.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result))
finally:
 gateway_path.write_text(gateway_original); recreate(original); run(['docker','rm','-f',proxy_name]); (ROOT/'proxy-settings.json').unlink(missing_ok=True)



