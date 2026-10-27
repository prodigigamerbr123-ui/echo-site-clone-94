#!/usr/bin/env python3
"""Create an isolated Auth/PostgREST/Edge Runtime copy on the Workout VM.
Run as root after uploading functions.tar.gz and the staff migration to STAGE.
Never publishes external ports, copies production passwords, or starts workers.
"""
import base64, hashlib, hmac, json, os, pathlib, re, secrets, shutil, subprocess, time
STAGE = pathlib.Path('/opt/workout-stage-security-20261012')
PREFIX = 'workout-stage-full-20261012'
DB = PREFIX + '-db'
NETWORK = PREFIX + '-net'
BACKUP = pathlib.Path('/home/ubuntu/workout-backups/20261012T034915Z/database.dump')
os.umask(0o077)

def run(args, data=None, log='operations.log'):
    r = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode:
        with (STAGE/log).open('ab') as f: f.write(r.stdout+r.stderr)
        raise RuntimeError('Staging command failed; restricted log: '+log)
    return r.stdout

def sql(text):
    return run(['docker','exec','-i',DB,'psql','-U','stage_bootstrap','-d','postgres','-v','ON_ERROR_STOP=1','-Atq','-f','-'],text.encode(), 'database.log')

def token(role, secret):
    enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=')
    p=enc(json.dumps({'alg':'HS256','typ':'JWT'}).encode())+b'.'+enc(json.dumps({'role':role,'iss':'supabase','iat':int(time.time()),'exp':int(time.time())+86400}).encode())
    return (p+b'.'+enc(hmac.new(secret.encode(),p,hashlib.sha256).digest())).decode()

def envfile(name, values):
    p=STAGE/(name+'.env'); p.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n'); return str(p)

def start(name, image, values, extra=(), command=()):
    run(['docker','run','-d','--name',PREFIX+'-'+name,'--network',NETWORK,'--memory','512m','--cpus','1','--env-file',envfile(name,values),*extra,image,*command])

if __name__ == '__main__':
    if subprocess.run(['docker','inspect',DB],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
        raise RuntimeError('Staging already exists; inspect it rather than overwrite')
    if subprocess.run(['docker','network','inspect',NETWORK],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
        run(['docker','network','create','--internal',NETWORK])
    run(['tar','-xzf',str(STAGE/'functions.tar.gz'),'-C',str(STAGE)])
    shutil.copytree('/opt/workout-supabase/volumes/functions/main',STAGE/'functions/main',dirs_exist_ok=True)
    shutil.copy('/opt/workout-supabase/volumes/functions/deno.jsonc',STAGE/'functions/deno.jsonc')
    # Copy only the runtime module cache, never the production environment.
    c=json.loads(run(['docker','inspect','workout-supabase-edge-functions']))[0]
    cache=next(m['Source'] for m in c['Mounts'] if m['Destination']=='/root/.cache/deno')
    shutil.copytree(cache,STAGE/'deno-cache',dirs_exist_ok=True)
    run(['docker','run','-d','--name',DB,'--network',NETWORK,'--network-alias','db','--memory','1536m','--cpus','1.5','--tmpfs','/tmp:rw,size=1g,mode=1777','--user','postgres','--entrypoint','bash','supabase/postgres:17.6.1.136','-c',"initdb -D /tmp/stage -U stage_bootstrap --auth-local=trust --auth-host=trust >/tmp/init.log 2>&1 && echo 'host all all 0.0.0.0/0 scram-sha-256' >> /tmp/stage/pg_hba.conf && exec postgres -D /tmp/stage -c listen_addresses='*' -c shared_preload_libraries= -c wal_level=logical -c max_connections=60"])
    for _ in range(60):
        if subprocess.run(['docker','exec',DB,'pg_isready','-U','stage_bootstrap'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0: break
        time.sleep(.5)
    else: raise RuntimeError('Staging database not ready')
    # Preserve production role flags/ownership but never copy role passwords.
    role_sql=run(['docker','exec','workout-supabase-db','pg_dumpall','-U','supabase_admin','--roles-only','--no-role-passwords'])
    # Rebuild equivalent memberships under the staging bootstrap grantor.
    sql(re.sub(r' GRANTED BY \w+', '', role_sql.decode()))
    sql('CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin; CREATE SCHEMA extensions; CREATE SCHEMA supabase_migrations AUTHORIZATION postgres; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE PUBLICATION supabase_realtime;')
    run(['docker','exec','-i',DB,'pg_restore','-U','stage_bootstrap','-d','postgres','--exit-on-error','--schema=public','--schema=auth','--schema=extensions','--schema=supabase_migrations'],BACKUP.read_bytes(),'restore.log')
    # Schema ACL entries are not included by pg_restore --schema selection.
    # Match the verified production USAGE grants required by auth.uid triggers.
    sql('GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;')
    sql("SET session_replication_role=replica; UPDATE public.students s SET name='Aluno de staging '||left(s.id::text,8),phone=(43990000000+x.n)::text,cpf=NULL FROM (SELECT id,row_number() OVER (ORDER BY id) n FROM public.students) x WHERE s.id=x.id; UPDATE public.evaluations SET notes='Staging'; UPDATE public.messages SET content='Mensagem de staging'; UPDATE public.scheduled_messages SET content='Mensagem de staging'; UPDATE public.ai_messages SET content='Conversa de staging'; UPDATE public.ai_conversations SET title='Conversa de staging'; SET session_replication_role=origin;")
    sql((STAGE/'staff.sql').read_text())
    password=secrets.token_hex(24); jwt=secrets.token_hex(32)
    anon=token('anon',jwt); service=token('service_role',jwt)
    sql("ALTER ROLE authenticator PASSWORD '"+password+"'; ALTER ROLE supabase_auth_admin PASSWORD '"+password+"';")
    start('auth','supabase/gotrue:v2.196.0',{
        'GOTRUE_API_HOST':'0.0.0.0','GOTRUE_API_PORT':'9999','API_EXTERNAL_URL':'http://127.0.0.1:18090',
        'GOTRUE_SITE_URL':'http://127.0.0.1:18091','GOTRUE_URI_ALLOW_LIST':'http://127.0.0.1:18091',
        'GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgres://supabase_auth_admin:'+password+'@db:5432/postgres',
        'GOTRUE_JWT_SECRET':jwt,'GOTRUE_JWT_EXP':'3600','GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated',
        'GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_EXTERNAL_EMAIL_ENABLED':'true',
        'GOTRUE_MAILER_AUTOCONFIRM':'true','GOTRUE_EXTERNAL_PHONE_ENABLED':'false','GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED':'false',
    },extra=('--network-alias','auth'))
    start('rest','postgrest/postgrest:v14.17',{
        'PGRST_DB_URI':'postgres://authenticator:'+password+'@db:5432/postgres','PGRST_DB_SCHEMAS':'public',
        'PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':jwt,'PGRST_DB_EXTRA_SEARCH_PATH':'public,extensions','PGRST_DB_MAX_ROWS':'1000',
    },extra=('--network-alias','rest'))
    edge_env={'SUPABASE_URL':'http://gateway:8080','SUPABASE_PUBLIC_URL':'http://127.0.0.1:18090','SUPABASE_ANON_KEY':anon,
      'SUPABASE_SERVICE_ROLE_KEY':service,'SUPABASE_PUBLISHABLE_KEYS':json.dumps({'default':anon}),
      'SUPABASE_SECRET_KEYS':json.dumps({'default':service}),'JWT_SECRET':jwt,'VERIFY_JWT':'false',
      'CRON_SECRET':secrets.token_hex(32)}
    start('edge','supabase/edge-runtime:v1.76.2',edge_env,
      extra=('--network-alias','edge','-v',str(STAGE/'functions')+':/home/deno/functions:ro','-v',str(STAGE/'deno-cache')+':/root/.cache/deno'),
      command=('start','--main-service','/home/deno/functions/main'))
    config='''events {}\nhttp { server { listen 8080;\nproxy_hide_header Access-Control-Allow-Origin;\nproxy_hide_header Access-Control-Allow-Headers;\nadd_header Access-Control-Allow-Origin "http://127.0.0.1:18091" always;\nadd_header Access-Control-Allow-Headers "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,x-cron-secret,content-profile,accept-profile" always;\nadd_header Access-Control-Allow-Methods "GET,POST,PATCH,PUT,DELETE,OPTIONS" always;\nadd_header Access-Control-Expose-Headers "Content-Range,Range-Unit" always;\nif ($request_method = OPTIONS) { return 204; }
location /auth/v1/ { proxy_pass http://auth:9999/; proxy_set_header Host $host; }
location /rest/v1/ { proxy_pass http://rest:3000/; }
location /functions/v1/ { proxy_pass http://edge:9000/; }
} }\n'''
    (STAGE/'nginx.conf').write_text(config)
    start('gateway','nginx:1.28-alpine',{},extra=('--network-alias','gateway','-p','127.0.0.1:18090:8080','-v',str(STAGE/'nginx.conf')+':/etc/nginx/nginx.conf:ro'))
    access=PREFIX+'-access'
    run(['docker','network','create',access])
    run(['docker','network','connect',access,PREFIX+'-gateway'])
    (STAGE/'credentials.json').write_text(json.dumps({'anon':anon,'service':service,'password':password,'jwt':jwt}))
    print('STAGING_CORE_SERVICES_STARTED; loopback=18090; internal_network=true; workers_not_started=true')



