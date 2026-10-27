#!/usr/bin/env python3
"""Add real Realtime and Storage to the isolated staging network."""
import json,pathlib,runpy,secrets,subprocess
ROOT=pathlib.Path('/opt/workout-stage-security-20261012')
g=runpy.run_path(str(ROOT/'stage-security.py')); run=g['run']; sql=g['sql']; start=g['start']; DB=g['DB']; PREFIX=g['PREFIX']
c=json.loads((ROOT/'credentials.json').read_text()); pw=c['password']
sql("ALTER ROLE supabase_admin PASSWORD '"+pw+"'; ALTER ROLE supabase_storage_admin PASSWORD '"+pw+"'; CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin; CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;")
if sql("SELECT count(*) FROM pg_tables WHERE schemaname='storage';").decode().strip()=='0':
 run(['docker','exec','-i',DB,'pg_restore','-U','stage_bootstrap','-d','postgres','--exit-on-error','--schema=storage'],g['BACKUP'].read_bytes(),'storage-restore.log')
sql('GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role; GRANT ALL ON SCHEMA storage TO supabase_storage_admin;')
# Fixed runtime settings come from the existing deployment; secrets are new.
rt_env={'PORT':'4000','APP_NAME':'realtime','DB_HOST':'db','DB_PORT':'5432','DB_USER':'supabase_admin','DB_PASSWORD':pw,
 'DB_NAME':'postgres','DB_AFTER_CONNECT_QUERY':'SET search_path TO _realtime','DB_ENC_KEY':secrets.token_hex(8),
 'API_JWT_SECRET':c['jwt'],'METRICS_JWT_SECRET':c['jwt'],'SECRET_KEY_BASE':secrets.token_hex(32),
 'ERL_AFLAGS':'-proto_dist inet_tcp','RLIMIT_NOFILE':'10000','SEED_SELF_HOST':'true','RUN_JANITOR':'true',
 'DNS_NODES':"''",'DISABLE_HEALTHCHECK_LOGGING':'true','SLOT_NAME_SUFFIX':'stage_security'}
if subprocess.run(['docker','inspect',PREFIX+'-realtime'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
 start('realtime','supabase/realtime:v2.134.10',rt_env,extra=('--network-alias','realtime'))
(ROOT/'storage-files').mkdir(exist_ok=True)
st_env={'ANON_KEY':c['anon'],'SERVICE_KEY':c['service'],'AUTH_JWT_SECRET':c['jwt'],
 'POSTGREST_URL':'http://rest:3000','DATABASE_URL':'postgres://supabase_storage_admin:'+pw+'@db:5432/postgres',
 'FILE_SIZE_LIMIT':'52428800','STORAGE_BACKEND':'file','FILE_STORAGE_BACKEND_PATH':'/var/lib/storage',
 'TENANT_ID':'stub','REGION':'stub','GLOBAL_S3_BUCKET':'stub','ENABLE_IMAGE_TRANSFORMATION':'false',
 'REQUEST_ALLOW_X_FORWARDED_PATH':'true','STORAGE_PUBLIC_URL':'http://127.0.0.1:18090/storage/v1'}
if subprocess.run(['docker','inspect',PREFIX+'-storage'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
 start('storage','supabase/storage-api:v1.74.0',st_env,extra=('--network-alias','storage','-v',str(ROOT/'storage-files')+':/var/lib/storage'))
p=ROOT/'nginx.conf'; config=p.read_text()
if 'location /realtime/v1/' not in config:
 config=config.replace('location /auth/v1/', '''location /realtime/v1/ { proxy_pass http://realtime:4000/socket/; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host "realtime-dev"; proxy_set_header X-Forwarded-Host "realtime-dev"; }
location /storage/v1/ { proxy_pass http://storage:5000/; }
location /auth/v1/'''); p.write_text(config)
run(['docker','exec',PREFIX+'-gateway','nginx','-t'])
run(['docker','exec',PREFIX+'-gateway','nginx','-s','reload'])
print('STAGING_REALTIME_STORAGE_STARTED')
