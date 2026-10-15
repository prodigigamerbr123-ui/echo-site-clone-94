"""Restore a complete backup into a disposable, externally disconnected stack.

Run as root on the VM: python3 restore-integrated.py SNAPSHOT ATTEMPT_NUMBER.
Uses only backup files for application data, code, files and dependency cache.
Existing locally cached service images are prerequisites, not a cold-host restore.
"""
import base64
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

os.umask(0o077)
BASE = pathlib.Path('/home/ubuntu/workout-integrated-restore-20261015')
FINGERPRINT = """SELECT json_build_object(
 'students',(SELECT count(*) FROM public.students),
 'evaluations',(SELECT count(*) FROM public.evaluations),
 'messages',(SELECT count(*) FROM public.messages),
 'scheduled_messages',(SELECT count(*) FROM public.scheduled_messages),
 'students_digest',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM public.students t),
 'evaluations_digest',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM public.evaluations t),
 'auth_users',(SELECT count(*) FROM auth.users),
 'passwords_digest',(SELECT md5(string_agg(id::text||encrypted_password,'|' ORDER BY id)) FROM auth.users),
 'storage_objects',(SELECT count(*) FROM storage.objects),
 'storage_buckets',(SELECT count(*) FROM storage.buckets),
 'migrations_digest',(SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM auth.schema_migrations),
 'functions_digest',(SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')));
"""


def signed(secret, role):
    encode = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(',', ':')).encode()).rstrip(b'=')
    body = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({
        'role': role, 'aud': 'authenticated', 'iss': 'supabase',
        'iat': int(time.time()), 'exp': int(time.time()) + 3600})
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


def main():
    stamp, attempt = sys.argv[1:]
    assert re.fullmatch(r'\d{8}T\d{6}Z', stamp) and re.fullmatch(r'[1-9]\d{0,2}', attempt)
    root = BASE / ('attempt-' + attempt)
    root.mkdir(parents=True, mode=0o700, exist_ok=False)
    prefix = 'workout-dr-20261015-' + attempt
    net, db = prefix + '-net', prefix + '-db'
    backup = pathlib.Path('/home/ubuntu/workout-backups') / stamp
    checks, created = {}, []
    started = time.monotonic()
    result = {'phase': 'preparing', 'backup_stamp': stamp, 'attempt': attempt}

    def save():
        (root / 'state.json').write_text(json.dumps({**result, 'checks': checks}, indent=2))

    def check(name, condition):
        checks[name] = bool(condition)
        save()
        assert condition, name

    def run(args, data=None):
        value = subprocess.run(args, input=data, capture_output=True)
        if value.returncode:
            (root / 'command-error.log').write_bytes(value.stdout + value.stderr)
            raise RuntimeError('Command failed; inspect private command-error.log')
        return value.stdout.decode().strip()

    def inspect(name):
        return json.loads(run(['docker', 'inspect', name]))[0]

    def sql(statement, database='postgres', container=db):
        user = 'supabase_admin' if container == 'workout-supabase-db' else 'restore_bootstrap'
        return run(['docker', 'exec', '-i', container, 'psql', '-U', user, '-d', database,
                    '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], statement.encode())

    def start(name, image, values, extra=(), command=()):
        full = prefix + '-' + name
        assert subprocess.run(['docker', 'inspect', full], capture_output=True).returncode != 0
        env = root / (name + '.env')
        env.write_text('\n'.join(k + '=' + v for k, v in values.items()) + '\n')
        run(['docker', 'run', '-d', '--name', full, '--network', net, '--network-alias', name,
             '--memory', '512m', '--cpus', '1', '--env-file', str(env), *extra, image, *command])
        created.append(full)
        return full

    def call(service, port, path, method='GET', body=None, credential=None, raw=False, content_type='application/json'):
        ip = inspect(prefix + '-' + service)['NetworkSettings']['Networks'][net]['IPAddress']
        headers = {'Content-Type': content_type}
        if credential:
            headers['Authorization'] = 'Bearer ' + credential
        data = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request('http://' + ip + ':' + str(port) + path, data=data, method=method, headers=headers)
        try:
            response = urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read()
            return response.status, data if raw else json.loads(data) if data else None

    def wait(service, port, path):
        for _ in range(60):
            try:
                if call(service, port, path, raw=True)[0] == 200:
                    return
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                pass
            time.sleep(1)
        raise RuntimeError('Restored service not ready: ' + service)

    assert (backup / 'complete').read_text().strip() == 'true'
    manifest = json.loads((backup / 'manifest.json').read_text())
    assert manifest['created_utc'] == stamp
    for name in ('database.dump', 'pooler.dump', 'roles.sql', 'runtime.tar.gz', 'database-config.tar.gz'):
        with (backup / name).open('rb') as source:
            check('backup_hash_' + name, hashlib.file_digest(source, 'sha256').hexdigest() == manifest['sha256'][name])
    production_before = json.loads(sql(FINGERPRINT, container='workout-supabase-db'))
    result['production_before'] = production_before
    images = {service: inspect(name)['Image'] for service, name in {
        'db': 'workout-supabase-db', 'auth': 'workout-supabase-auth', 'rest': 'workout-supabase-rest',
        'storage': 'workout-supabase-storage', 'edge': 'workout-supabase-edge-functions',
        'gateway': 'workout-supabase-public'}.items()}
    result['images'] = images
    extracted = root / 'restored'
    extracted.mkdir(mode=0o700)
    with tarfile.open(backup / 'runtime.tar.gz') as archive:
        archive.extractall(extracted, filter='data')
        expected_files = {m.name: hashlib.sha256(archive.extractfile(m).read()).hexdigest()
                          for m in archive.getmembers() if m.isfile() and m.name.startswith(('volumes/functions/', 'volumes/storage/', 'volumes/deno-cache/'))}
    check('restored_runtime_file_hashes', all(hashlib.sha256((extracted / name).read_bytes()).hexdigest() == digest for name, digest in expected_files.items()))
    check('dependency_cache_restored', any(name.startswith('volumes/deno-cache/') for name in expected_files))
    result['restored_file_counts'] = {section: sum(n.startswith('volumes/' + section + '/') for n in expected_files)
                                     for section in ('functions', 'storage', 'deno-cache')}
    config_root = root / 'database-config'
    config_root.mkdir(mode=0o700)
    with tarfile.open(backup / 'database-config.tar.gz') as archive:
        archive.extractall(config_root, filter='data')
    # Root-key backup remains private; no production container/config is mounted.
    postgres_uid = run(['docker', 'exec', 'workout-supabase-db', 'id', '-u', 'postgres'])
    postgres_gid = run(['docker', 'exec', 'workout-supabase-db', 'id', '-g', 'postgres'])
    assert postgres_uid.isdigit() and postgres_gid.isdigit()
    run(['chown', '-R', postgres_uid + ':' + postgres_gid, str(config_root)])
    password, jwt = secrets.token_hex(24), secrets.token_hex(32)
    anon, service = signed(jwt, 'anon'), signed(jwt, 'service_role')
    try:
        assert subprocess.run(['docker', 'network', 'inspect', net], capture_output=True).returncode != 0
        run(['docker', 'network', 'create', '--internal', net])
        check('internal_network', json.loads(run(['docker', 'network', 'inspect', net]))[0]['Internal'])
        run(['docker', 'run', '-d', '--name', db, '--network', net, '--network-alias', 'db', '--memory', '1024m', '--cpus', '1',
             '--tmpfs', '/tmp:rw,size=768m,mode=1777', '--user', 'postgres',
             '-v', str(config_root / 'postgresql-custom') + ':/etc/postgresql-custom:ro',
             '--entrypoint', 'bash', images['db'], '-c',
             "initdb -D /tmp/recovery -U restore_bootstrap --auth-local=trust --auth-host=scram-sha-256 >/tmp/init.log 2>&1 && echo 'host all all 0.0.0.0/0 scram-sha-256' >> /tmp/recovery/pg_hba.conf && exec postgres -D /tmp/recovery -c listen_addresses='*' -c shared_preload_libraries=pg_cron,pgsodium,pg_net -c cron.launch_active_jobs=off -c cron.database_name=postgres -c pg_net.batch_size=0 -c pg_net.database_name=template1 -c pg_net.username=restore_bootstrap -c wal_level=logical"])
        created.append(db)
        for _ in range(60):
            if not inspect(db)['State']['Running']:
                raise RuntimeError('Disposable database exited; inspect private container log')
            if subprocess.run(['docker', 'exec', db, 'pg_isready', '-U', 'restore_bootstrap'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Disposable database not ready')
        check('cron_disabled_before_restore', sql('SHOW cron.launch_active_jobs;') == 'off')
        check('http_worker_not_processing_restore', sql('SHOW pg_net.batch_size;') == '0' and sql('SHOW pg_net.database_name;') == 'template1')
        roles = (backup / 'roles.sql').read_text()
        roles = re.sub(r" PASSWORD '(?:[^']|'')*'", '', roles)
        roles = re.sub(r' GRANTED BY \w+', '', roles)
        check('production_role_passwords_removed', not re.search(r'\bPASSWORD\b', roles))
        sql(roles)
        run(['docker', 'exec', '-i', db, 'pg_restore', '-U', 'restore_bootstrap', '-d', 'postgres', '--exit-on-error'], (backup / 'database.dump').read_bytes())
        run(['docker', 'exec', db, 'createdb', '-U', 'restore_bootstrap', '-T', 'template0', '-O', 'postgres', '_supabase'])
        run(['docker', 'exec', '-i', db, 'pg_restore', '-U', 'restore_bootstrap', '-d', '_supabase', '--exit-on-error'], (backup / 'pooler.dump').read_bytes())
        restored = json.loads(sql(FINGERPRINT))
        result['restored_before_fixture'] = restored
        check('application_auth_storage_fingerprint', restored == production_before)
        check('pooler_metadata_restored', int(sql('SELECT count(*) FROM _supavisor.tenants;', '_supabase')) > 0)
        sql('UPDATE cron.job SET active=false;')
        check('all_restored_jobs_disabled', sql('SELECT count(*) FROM cron.job WHERE active;') == '0')
        for role in ('supabase_auth_admin', 'authenticator', 'supabase_storage_admin'):
            sql("ALTER ROLE " + role + " PASSWORD '" + password + "';")
        hardening = ('--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--pids-limit', '256')
        start('auth', images['auth'], {'GOTRUE_API_HOST': '0.0.0.0', 'GOTRUE_API_PORT': '9999',
              'API_EXTERNAL_URL': 'http://gateway:8080', 'GOTRUE_SITE_URL': 'http://restore.invalid',
              'GOTRUE_DB_DRIVER': 'postgres', 'GOTRUE_DB_DATABASE_URL': 'postgres://supabase_auth_admin:' + password + '@db:5432/postgres',
              'GOTRUE_JWT_SECRET': jwt, 'GOTRUE_JWT_EXP': '3600', 'GOTRUE_JWT_AUD': 'authenticated',
              'GOTRUE_JWT_DEFAULT_GROUP_NAME': 'authenticated', 'GOTRUE_JWT_ADMIN_ROLES': 'service_role',
              'GOTRUE_DISABLE_SIGNUP': 'true', 'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true', 'GOTRUE_MAILER_AUTOCONFIRM': 'true'}, extra=hardening)
        start('rest', images['rest'], {'PGRST_DB_URI': 'postgres://authenticator:' + password + '@db:5432/postgres',
              'PGRST_DB_SCHEMAS': 'public', 'PGRST_DB_ANON_ROLE': 'anon', 'PGRST_JWT_SECRET': jwt,
              'PGRST_DB_EXTRA_SEARCH_PATH': 'public,extensions', 'PGRST_SERVER_HOST': '0.0.0.0',
              'PGRST_ADMIN_SERVER_PORT': '3001'}, extra=hardening)
        wait('auth', 9999, '/health')
        wait('rest', 3001, '/ready')
        storage_files = extracted / 'volumes/storage'
        storage_files.mkdir(exist_ok=True)
        start('storage', images['storage'], {'ANON_KEY': anon, 'SERVICE_KEY': service, 'AUTH_JWT_SECRET': jwt,
              'POSTGREST_URL': 'http://rest:3000', 'DATABASE_URL': 'postgres://supabase_storage_admin:' + password + '@db:5432/postgres',
              'FILE_SIZE_LIMIT': '52428800', 'STORAGE_BACKEND': 'file', 'FILE_STORAGE_BACKEND_PATH': '/var/lib/storage',
              'TENANT_ID': 'stub', 'REGION': 'stub', 'GLOBAL_S3_BUCKET': 'stub',
              'ENABLE_IMAGE_TRANSFORMATION': 'false', 'REQUEST_ALLOW_X_FORWARDED_PATH': 'true'},
              extra=('-v', str(storage_files) + ':/var/lib/storage'))
        gateway_config = root / 'gateway.conf'
        gateway_config.write_text('events {}\nhttp {server {listen 8080; location /auth/v1/ {proxy_pass http://auth:9999/;} location /rest/v1/ {proxy_pass http://rest:3000/;} location /storage/v1/ {proxy_pass http://storage:5000/;} location /functions/v1/ {proxy_pass http://edge:9000/;} }}')
        edge_values = {'SUPABASE_URL': 'http://gateway:8080', 'SUPABASE_PUBLIC_URL': 'http://restore.invalid',
                       'SUPABASE_ANON_KEY': anon, 'SUPABASE_SERVICE_ROLE_KEY': service,
                       'SUPABASE_PUBLISHABLE_KEYS': json.dumps({'default': anon}), 'SUPABASE_SECRET_KEYS': json.dumps({'default': service}),
                       'JWT_SECRET': jwt, 'VERIFY_JWT': 'false', 'CRON_SECRET': secrets.token_hex(32)}
        start('edge', images['edge'], edge_values,
              extra=('-v', str(extracted / 'volumes/functions') + ':/home/deno/functions:ro',
                     '-v', str(extracted / 'volumes/deno-cache') + ':/root/.cache/deno'),
              command=('start', '--main-service', '/home/deno/functions/main'))
        start('gateway', images['gateway'], {}, extra=('-v', str(gateway_config) + ':/etc/nginx/nginx.conf:ro'))
        wait('gateway', 8080, '/auth/v1/health')
        check('restored_auth_ready', True)
        email, fixture_password = 'restore-audit@example.invalid', secrets.token_urlsafe(24)
        code, user = call('auth', 9999, '/admin/users', 'POST', {'email': email, 'password': fixture_password, 'email_confirm': True}, service)
        check('restored_auth_create_fixture', code == 200 and bool(user.get('id')))
        sql("INSERT INTO public.staff_members(user_id,role) VALUES ('" + user['id'] + "','admin');")
        code, session = call('auth', 9999, '/token?grant_type=password', 'POST', {'email': email, 'password': fixture_password})
        check('restored_password_login', code == 200 and bool(session.get('access_token')))
        token = session['access_token']
        code, data = call('rest', 3000, '/students?select=id&order=id', credential=token)
        check('restored_students_authorized', code == 200 and len(data) == production_before['students'])
        check('restored_students_anon_denied', call('rest', 3000, '/students?select=id', credential=anon)[0] in (401, 403))
        code, data = call('rest', 3000, '/rpc/get_workout_dashboard', 'POST', {}, token)
        check('restored_dashboard_rpc', code == 200 and {'stats', 'actions', 'agenda'}.issubset(data))
        wait('storage', 5000, '/status')
        bucket = 'restore-fixture-' + attempt
        check('restored_storage_create_bucket', call('storage', 5000, '/bucket', 'POST', {'id': bucket, 'name': bucket, 'public': False}, service)[0] in (200, 201))
        payload = b'Workout isolated restore check'
        check('restored_storage_upload', call('storage', 5000, '/object/' + bucket + '/fixture.txt', 'POST', payload, service, content_type='text/plain')[0] in (200, 201))
        code, data = call('storage', 5000, '/object/' + bucket + '/fixture.txt', credential=service, raw=True)
        check('restored_storage_download', code == 200 and data == payload)
        check('restored_private_storage_denied', call('storage', 5000, '/object/' + bucket + '/fixture.txt', credential=anon, raw=True)[0] in (400, 401, 403, 404))
        # GET stops after auth/role checks and before quota/model calls.
        code, _ = call('gateway', 8080, '/functions/v1/daily-briefing', credential=token)
        check('restored_function_loads_and_checks_role', code == 405)
        code, _ = call('gateway', 8080, '/functions/v1/daily-briefing')
        check('restored_function_anonymous_denied', code == 401)
        action_body = {'action': 'get_students_needing_followup', 'params': {}, 'userConfirmation': True}
        code, action_result = call('gateway', 8080, '/functions/v1/ai-database-actions', 'POST', action_body, token)
        expected_followups = int(sql("SELECT count(*) FROM public.students WHERE created_at < now()-interval '7 days' AND last_evaluation_date IS NULL;"))
        check('restored_function_reads_application_data', code == 200 and action_result.get('success') is True and len(action_result.get('data', [])) == expected_followups)
        code, _ = call('gateway', 8080, '/functions/v1/ai-database-actions', 'POST', {**action_body, 'userConfirmation': False}, token)
        check('restored_function_confirmation_boundary', code == 403)
        for service_name in ('auth', 'rest', 'storage', 'edge', 'gateway'):
            check('no_published_ports_' + service_name, not inspect(prefix + '-' + service_name)['HostConfig'].get('PortBindings'))
        check('no_provider_credentials', not any(k in edge_values for k in ('GEMINI_API_KEY', 'LOVABLE_API_KEY', 'EVOLUTION_API_URL', 'EVOLUTION_INSTANCE_TOKEN')))
        for name in ('auth', 'storage', 'edge'):
            run(['docker', 'restart', prefix + '-' + name])
        wait('auth', 9999, '/health')
        wait('storage', 5000, '/status')
        code, refreshed = call('auth', 9999, '/token?grant_type=refresh_token', 'POST', {'refresh_token': session['refresh_token']})
        check('restored_refresh_after_restart', code == 200 and refreshed['user']['id'] == user['id'])
        code, data = call('gateway', 8080, '/functions/v1/ai-database-actions', 'POST', action_body, refreshed['access_token'])
        check('restored_function_after_restart', code == 200 and data.get('success') is True)
        code, data = call('storage', 5000, '/object/' + bucket + '/fixture.txt', credential=service, raw=True)
        check('restored_file_after_restart', code == 200 and data == payload)
        check('cron_remains_disabled', sql('SHOW cron.launch_active_jobs;') == 'off' and sql('SELECT count(*) FROM cron.job WHERE active;') == '0')
        check('production_unchanged', json.loads(sql(FINGERPRINT, container='workout-supabase-db')) == production_before)
        result.update(phase='passed', duration_seconds=round(time.monotonic() - started, 2),
                      scope='warm-image isolated core backend recovery; no DNS/TLS, Realtime, pooler runtime or external providers',
                      backup_data_only=True, production_role_passwords_copied=False)
    except Exception:
        result.update(phase='failed', duration_seconds=round(time.monotonic() - started, 2))
        raise
    finally:
        for name in reversed(created):
            value = subprocess.run(['docker', 'logs', name], capture_output=True)
            (root / (name + '.log')).write_bytes(value.stdout + value.stderr)
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', net], capture_output=True)
        for path in root.glob('*.env'):
            path.unlink()
        cleanup = {'containers_removed': all(subprocess.run(['docker', 'inspect', n], capture_output=True).returncode != 0 for n in created),
                   'network_removed': subprocess.run(['docker', 'network', 'inspect', net], capture_output=True).returncode != 0,
                   'temporary_env_removed': not list(root.glob('*.env'))}
        result['cleanup'] = cleanup
        save()
        assert all(cleanup.values()), 'Restore fixture cleanup failed'
    print(json.dumps({'phase': result['phase'], 'checks': len(checks), 'duration_seconds': result['duration_seconds']}))


if __name__ == '__main__':
    main()
