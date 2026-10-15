"""Guarded PostgREST runtime release; retain private backups and exact rollback."""
import base64
import datetime
import gzip
import hashlib
import hmac
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

import yaml

ROOT = pathlib.Path('/home/ubuntu/workout-postgrest-release-20261014')
EVIDENCE = pathlib.Path('/home/ubuntu/workout-postgrest-security-20261014')
STACK = pathlib.Path('/opt/workout-supabase')
NAME = 'workout-supabase-rest'
OLD = 'sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c'
NEW = 'sha256:dc990d07c8ce83f1e676959e37e55845b4337bdb2ad65c6079e9522a658edcf1'
TAG = 'workout-postgrest:14.17-security1'
FILES = ('database.dump', 'pooler.dump', 'roles.sql', 'runtime.tar.gz', 'database-config.tar.gz')
os.umask(0o077)
ROOT.mkdir(mode=0o700, exist_ok=True)


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        (ROOT / 'command-error.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect private command-error.log')
    return result.stdout.strip()


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def save(state):
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))


def sql(query):
    return run(['docker', 'exec', 'workout-supabase-db', 'psql', '-U', 'supabase_admin',
                '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query])


def inventory():
    return json.loads(sql("""SELECT json_build_object(
      'students',(SELECT count(*) FROM public.students),
      'auth_users',(SELECT count(*) FROM auth.users),
      'evaluations',(SELECT count(*) FROM public.evaluations),
      'messages',(SELECT count(*) FROM public.messages),
      'scheduled_messages',(SELECT count(*) FROM public.scheduled_messages),
      'active_cron',(SELECT count(*) FROM cron.job WHERE active),
      'schema_digest',(SELECT md5(string_agg(concat_ws(':',n.nspname,c.relname,a.attname,a.atttypid,a.attnotnull),'|' ORDER BY n.nspname,c.relname,a.attnum))
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','auth','storage') AND a.attnum>0 AND NOT a.attisdropped),
      'functions_digest',(SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','auth','storage') AND p.prokind IN ('f','p')));"""))


def jwt(secret, user_id):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    body = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({
        'sub': user_id, 'role': 'authenticated', 'aud': 'authenticated', 'iss': 'supabase',
        'iat': int(time.time()) - 5, 'exp': int(time.time()) + 600})
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


def call(path, key, credential):
    response = run(['docker', 'exec', 'workout-supabase-public', 'curl', '-sS', '--max-time', '10',
                    '-w', '\n%{http_code}', '-H', 'Host: backend.workoutsaas.dpdns.org',
                    '-H', 'Origin: https://workoutsaas.dpdns.org', '-H', 'User-Agent: Mozilla/5.0',
                    '-H', 'apikey: ' + key, '-H', 'Authorization: Bearer ' + credential,
                    'http://127.0.0.1:8080' + path])
    body, code = response.rsplit('\n', 1)
    return int(code), json.loads(body) if body else None


def verify(hardened):
    item = inspect(NAME)
    gateway = dict(value.split('=', 1) for value in inspect('workout-supabase-envoy')['Config']['Env'])
    rest = dict(value.split('=', 1) for value in item['Config']['Env'])
    user_id = sql("SELECT user_id FROM public.staff_members WHERE active AND role='admin' ORDER BY user_id LIMIT 1;")
    assert user_id
    credential = jwt(rest['PGRST_JWT_SECRET'], user_id)
    code, rows = call('/rest/v1/students?select=id&order=id', gateway['ANON_KEY'], credential)
    checks = {'ready': subprocess.run(['docker', 'exec', NAME, 'postgrest', '--ready'], capture_output=True).returncode == 0,
              'authenticated_students_read': code == 200 and isinstance(rows, list) and len(rows) == int(sql('SELECT count(*) FROM public.students;')),
              'anonymous_students_denied': call('/rest/v1/students?select=id', gateway['ANON_KEY'], gateway['ANON_KEY'])[0] in (401, 403),
              'auth_healthy': call('/auth/v1/health', gateway['ANON_KEY'], gateway['ANON_KEY'])[0] == 200,
              'storage_healthy': call('/storage/v1/bucket', gateway['SERVICE_ROLE_KEY'], gateway['SERVICE_ROLE_KEY'])[0] == 200,
              'pooler_healthy': inspect('workout-supabase-pooler')['State']['Health']['Status'] == 'healthy'}
    code, body = call('/rest/v1/rpc/get_workout_dashboard', gateway['ANON_KEY'], credential)
    checks['real_dashboard_rpc'] = code == 200 and isinstance(body, dict) and {'stats', 'actions', 'agenda', 'birthdayNames'}.issubset(body)
    checks['service_dashboard_denied'] = call('/rest/v1/rpc/get_workout_dashboard', gateway['SERVICE_ROLE_KEY'], gateway['SERVICE_ROLE_KEY'])[0] == 403
    if hardened:
        fields = dict(line.split(':', 1) for line in run(['docker', 'exec', NAME, 'cat', '/proc/1/status']).splitlines() if ':' in line)
        checks.update(image_pinned=item['Image'] == NEW,
                      non_root=item['Config']['User'] == '1000:1000',
                      rootfs_readonly=item['HostConfig']['ReadonlyRootfs'],
                      caps_dropped=item['HostConfig']['CapDrop'] == ['ALL'],
                      capabilities_zero=int(fields['CapEff'].strip(), 16) == 0,
                      no_new_privileges=fields['NoNewPrivs'].strip() == '1',
                      seccomp_active=fields['Seccomp'].strip() == '2',
                      pids_bounded=item['HostConfig']['PidsLimit'] == 256,
                      binary_preserved=run(['docker', 'exec', NAME, 'sha256sum', '/usr/bin/postgrest']).split()[0] == '4eee06ead8d14318fd02ea182f919cca0c9487b01a4780dffe9532664155e8c8')
    return checks


def wait(hardened):
    for _ in range(45):
        try:
            checks = verify(hardened)
            if all(checks.values()):
                return checks
        except RuntimeError:
            pass
        time.sleep(2)
    raise RuntimeError('PostgREST verification failed')


def compose_config():
    return json.loads(run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'config', '--format', 'json']))


def recreate():
    run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'up', '-d', '--no-deps', '--pull', 'never', 'rest'])


def rollback(state):
    assert digest(STACK / 'docker-compose.yml') == state['compose_after_sha256']
    assert inspect('postgrest/postgrest:v14.17')['Id'] == OLD
    (STACK / 'docker-compose.yml').write_bytes((ROOT / 'compose.before.yml').read_bytes())
    recreate()
    assert inspect(NAME)['Image'] == OLD
    state.update(phase='rolled_back', rollback_checks=wait(False))
    save(state)


def main():
    phase = sys.argv[1]
    if phase == 'prepare':
        assert not (ROOT / 'state.json').exists()
        build = json.loads((EVIDENCE / 'build-state.json').read_text())
        assert build['phase'] == 'scanned' and build['image'] == NEW
        assert build['counts'].get('CRITICAL', 0) == 0 and build['counts'].get('HIGH', 0) == 0
        validation = json.loads((EVIDENCE / 'validation.json').read_text())
        assert validation['image'] == NEW and len(validation['checks']) == 41 and all(validation['checks'].values())
        assert all(json.loads((EVIDENCE / 'cleanup.json').read_text()).values())
        assert inspect(NAME)['Image'] == OLD and all(verify(False).values())
        (ROOT / 'container.before.json').write_text(json.dumps(inspect(NAME), indent=2))
        (ROOT / 'compose.before.yml').write_bytes((STACK / 'docker-compose.yml').read_bytes())
        run(['python3', str(STACK / 'backup.py')])
        stamp = pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip()
        backup = pathlib.Path('/home/ubuntu/workout-backups') / stamp
        assert (backup / 'complete').exists()
        with (ROOT / 'runtime-image.tar.gz').open('wb') as destination:
            with gzip.GzipFile(fileobj=destination, mode='wb') as compressed:
                with subprocess.Popen(['docker', 'image', 'save', NEW], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as export:
                    shutil.copyfileobj(export.stdout, compressed)
                    assert export.wait() == 0
        state = {'phase': 'prepared', 'backup_stamp': stamp, 'inventory_before': inventory(),
                 'proof': {'backup': {name: digest(backup / name) for name in FILES},
                           'release': {name: digest(ROOT / name) for name in ('container.before.json', 'compose.before.yml', 'runtime-image.tar.gz')}}}
        save(state)
        print(json.dumps({'phase': 'prepared', 'backup_stamp': stamp, 'files': 8}))
    elif phase == 'apply':
        state = json.loads((ROOT / 'state.json').read_text())
        assert state['phase'] == 'prepared'
        assert json.loads(pathlib.Path(sys.argv[2]).read_text()) == state['proof']
        created = datetime.datetime.strptime(state['backup_stamp'], '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
        assert 0 <= (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds() < 3600
        assert all(digest(ROOT / name) == value for name, value in state['proof']['release'].items())
        assert digest(STACK / 'docker-compose.yml') == state['proof']['release']['compose.before.yml']
        assert inspect(NAME)['Image'] == OLD and inventory() == state['inventory_before']
        assert all(verify(False).values())
        before = compose_config()
        config = yaml.safe_load((ROOT / 'compose.before.yml').read_text())
        service = config['services']['rest']
        assert service['image'] == 'postgrest/postgrest:v14.17'
        service.update(image=TAG, user='1000:1000', read_only=True, cap_drop=['ALL'],
                       security_opt=['no-new-privileges:true'], pids_limit=256)
        run(['docker', 'tag', NEW, TAG])
        assert inspect(TAG)['Id'] == NEW
        temporary = STACK / '.compose-postgrest.tmp'
        temporary.write_text(yaml.safe_dump(config, sort_keys=False))
        temporary.replace(STACK / 'docker-compose.yml')
        state.update(phase='applying', compose_after_sha256=digest(STACK / 'docker-compose.yml'))
        save(state)
        try:
            after = compose_config()
            assert all(after['services'][name] == value for name, value in before['services'].items() if name != 'rest')
            recreate()
            checks = wait(True)
            assert inventory() == state['inventory_before']
            run(['docker', 'restart', NAME])
            assert all(wait(True).values())
            state.update(phase='published', checks=checks, restart_passed=True, inventory_after=inventory())
            save(state)
            print(json.dumps({'phase': 'published', 'checks': len(checks), 'restart_passed': True}))
        except Exception:
            rollback(state)
            raise
    elif phase == 'observe':
        checks = verify(inspect(NAME)['Image'] == NEW)
        print(json.dumps({'checks': checks, 'all_passed': all(checks.values())}))
        assert all(checks.values())
    elif phase == 'rollback':
        rollback(json.loads((ROOT / 'state.json').read_text()))
    else:
        raise ValueError('Unknown release phase')


if __name__ == '__main__':
    main()
