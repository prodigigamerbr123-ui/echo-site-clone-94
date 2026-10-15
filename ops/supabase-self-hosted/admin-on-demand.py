"""Guarded 2026-10-15 release: Studio/Meta run only for explicit maintenance.

Private compose files, credentials and release state must remain outside Git.
"""
import base64
import copy
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import shutil
import subprocess
import sys
import time

import yaml

STACK = pathlib.Path('/opt/workout-supabase')
ROOT = pathlib.Path('/home/ubuntu/workout-admin-on-demand-20261015')
STAGE = pathlib.Path('/opt/workout-stage-security-20261012')
NET = 'workout-stage-full-20261012-net'
QA = 'workout-admin-optional-qa-20261015'
ADMINS = ('workout-supabase-studio', 'workout-supabase-meta')
FILES = ('database.dump', 'pooler.dump', 'roles.sql', 'runtime.tar.gz', 'database-config.tar.gz')
os.umask(0o077)


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, timeout=120)
    if result.returncode:
        (ROOT / 'command-error.log').write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect private evidence')
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def compose(path, profiles=True):
    args = ['docker', 'compose', '--project-directory', str(STACK),
            '--project-name', 'workout-supabase', '--env-file', str(STACK / '.env'), '-f', str(path)]
    if profiles:
        args += ['--profile', 'admin']
    return json.loads(run(args + ['config', '--format', 'json']))


def expected(config):
    updated = copy.deepcopy(config)
    for service in ('studio', 'meta'):
        updated['services'][service]['profiles'] = ['admin']
        updated['services'][service]['restart'] = 'no'
    updated['services']['studio']['depends_on'] = {
        'meta': {'condition': 'service_started', 'required': True}}
    updated['services']['api-gw']['depends_on'] = {
        'db': {'condition': 'service_healthy', 'required': True}}
    return updated


def identity(name):
    item = inspect(name)
    return {'id': item['Id'], 'image': item['Image'], 'running': item['State']['Running'],
            'started': item['State']['StartedAt'], 'restart': item['HostConfig']['RestartPolicy']['Name']}


def fingerprint():
    query = """BEGIN READ ONLY;
    SELECT jsonb_build_object(
      'students',(SELECT count(*) FROM students),
      'evaluations',(SELECT count(*) FROM evaluations),
      'messages',(SELECT count(*) FROM messages),
      'scheduled',(SELECT count(*) FROM scheduled_messages),
      'students_hash',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM students t),
      'evaluations_hash',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM evaluations t),
      'auth_users',(SELECT count(*) FROM auth.users),
      'passwords_hash',(SELECT md5(string_agg(id::text||encrypted_password,'|' ORDER BY id)) FROM auth.users),
      'buckets',(SELECT count(*) FROM storage.buckets),
      'objects',(SELECT count(*) FROM storage.objects)); COMMIT;"""
    return json.loads(run(['docker', 'exec', '-i', 'workout-supabase-db', 'psql', '-X',
                          '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], query.encode()))


def signed(secret, role):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    body = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({
        'role': role, 'iss': 'supabase', 'iat': int(time.time()), 'exp': int(time.time()) + 1800})
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


def call(container, base, path, key=None, bearer=None):
    args = ['docker', 'exec', container, 'curl', '-sS', '--max-time', '15', '-w', '\n%{http_code}']
    if key:
        args += ['-H', 'apikey: ' + key]
    if bearer:
        args += ['-H', 'Authorization: Bearer ' + bearer]
    args += [base + path]
    body, status = run(args).decode().rsplit('\n', 1)
    return int(status), body


def isolated():
    if not json.loads(run(['docker', 'network', 'inspect', NET]))[0]['Internal']:
        raise RuntimeError('Staging network must be internal')
    if subprocess.run(['docker', 'inspect', QA], capture_output=True).returncode == 0:
        raise RuntimeError('QA container already exists')
    stage = json.loads((STAGE / 'credentials.json').read_text())
    anon, service = signed(stage['jwt'], 'anon'), signed(stage['jwt'], 'service_role')
    directory = ROOT / 'isolated'
    directory.mkdir()
    gateway = inspect('workout-supabase-envoy')
    for mount in gateway['Mounts']:
        shutil.copyfile(mount['Source'], directory / pathlib.Path(mount['Destination']).name)
    (directory / 'docker-entrypoint.sh').chmod(0o755)
    mappings = {'auth': 'workout-stage-full-20261012-auth', 'rest': 'workout-stage-full-20261012-rest',
        'realtime-dev.supabase-realtime': 'workout-stage-full-20261012-realtime',
        'storage': 'workout-stage-full-20261012-storage', 'functions': 'workout-stage-full-20261012-edge',
        'studio': 'workout-deliberately-absent-studio', 'meta': 'workout-deliberately-absent-meta'}
    clusters = (directory / 'cds.yaml').read_text()
    for old, new in mappings.items():
        clusters = clusters.replace('address: ' + old + '\n', 'address: ' + new + '\n')
    (directory / 'cds.yaml').write_text(clusters)
    environment = {'ANON_KEY': anon, 'SERVICE_ROLE_KEY': service, 'ANON_KEY_ASYMMETRIC': '',
        'SERVICE_ROLE_KEY_ASYMMETRIC': '', 'SUPABASE_PUBLISHABLE_KEY': '', 'SUPABASE_SECRET_KEY': '',
        'SUPABASE_PUBLIC_URL': 'http://' + QA + ':8000', 'DASHBOARD_USERNAME': 'qa',
        'DASHBOARD_PASSWORD': secrets.token_urlsafe(24)}
    args = ['docker', 'run', '-d', '--name', QA, '--network', NET, '--memory', '512m', '--cpus', '1',
            '--entrypoint', '/bin/sh']
    for key, value in environment.items():
        args += ['-e', key + '=' + value]
    for name in ('envoy.yaml', 'cds.yaml', 'lds.template.yaml'):
        args += ['-v', str(directory / name) + ':/etc/envoy/' + name + ':ro']
    args += ['-v', str(directory / 'docker-entrypoint.sh') + ':/docker-entrypoint.sh:ro',
             gateway['Image'], '/docker-entrypoint.sh', '--concurrency', '1']
    checks = []
    try:
        run(args)
        # Existing isolated Storage contains Node; requests stay inside staging.
        def request(path, key, bearer=None):
            script = "const r=await fetch(process.env.QA_URL,{headers:JSON.parse(process.env.QA_HEADERS)});console.log(JSON.stringify({status:r.status}));"
            headers = {'apikey': key}
            if bearer:
                headers['Authorization'] = 'Bearer ' + bearer
            out = run(['docker', 'exec', '-e', 'QA_URL=http://' + QA + ':8000' + path,
                       '-e', 'QA_HEADERS=' + json.dumps(headers),
                       'workout-stage-full-20261012-storage', 'node', '--input-type=module', '-e', script])
            return json.loads(out)['status']
        for cycle in range(2):
            if cycle:
                run(['docker', 'restart', QA])
            for attempt in range(30):
                try:
                    if request('/auth/v1/health', anon) == 200:
                        break
                except RuntimeError:
                    pass
                if attempt == 29:
                    raise RuntimeError('Gateway failed without Studio/Meta')
                time.sleep(0.5)
            for path, key, bearer, statuses in (
                ('/auth/v1/settings', anon, None, (200,)),
                ('/rest/v1/students?select=id&limit=1', anon, anon, (401, 403)),
                ('/rest/v1/students?select=id&limit=1', service, service, (200,)),
                ('/storage/v1/bucket', service, service, (200,)),
                ('/functions/v1/daily-automation', anon, anon, (401, 403)),
            ):
                if request(path, key, bearer) not in statuses:
                    raise RuntimeError('Isolated core route check failed')
                checks.append({'cycle': cycle, 'path': path.split('?')[0], 'passed': True})
    finally:
        logs = subprocess.run(['docker', 'logs', QA], capture_output=True)
        (ROOT / 'isolated-gateway.log').write_bytes(logs.stdout + logs.stderr)
        run(['docker', 'rm', '-f', QA])
    return checks


def prepare():
    if ROOT.exists():
        raise RuntimeError('Release evidence exists; inspect before retrying')
    ROOT.mkdir(mode=0o700)
    path = STACK / 'docker-compose.yml'
    original = path.read_bytes()
    before = compose(path)
    raw = yaml.safe_load(original)
    for name in ('studio', 'meta'):
        raw['services'][name]['profiles'] = ['admin']
        raw['services'][name]['restart'] = 'no'
    raw['services']['studio']['depends_on'] = {'meta': {'condition': 'service_started'}}
    raw['services']['api-gw']['depends_on'] = {'db': {'condition': 'service_healthy'}}
    candidate = ROOT / 'compose.after.yml'
    candidate.write_text(yaml.safe_dump(raw, sort_keys=False))
    if compose(candidate) != expected(before):
        raise RuntimeError('Unexpected effective compose changes')
    default = compose(candidate, False)
    if {'studio', 'meta'} & set(default['services']):
        raise RuntimeError('Administrative services still enabled by default')
    (ROOT / 'compose.before.yml').write_bytes(original)
    checks = isolated()
    names = [service['container_name'] for service in before['services'].values()]
    state = {'before_sha256': digest(original), 'after_sha256': digest(candidate.read_bytes()),
             'containers': {name: identity(name) for name in names},
             'fingerprint': fingerprint(), 'isolated_checks': checks,
             'default_services': sorted(default['services']), 'profile_verified': True}
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))
    print(json.dumps({'prepared': True, 'isolated_checks': len(checks),
                      'default_services': state['default_services']}))


def verify(state):
    checks = {}
    for name, before in state['containers'].items():
        after = identity(name)
        checks[name] = (after['id'] == before['id'] and after['image'] == before['image'] and
            (not after['running'] and after['restart'] == 'no' if name in ADMINS else after == before))
    checks['data_and_passwords_preserved'] = fingerprint() == state['fingerprint']
    defaults = compose(STACK / 'docker-compose.yml', False)['services']
    checks['default_profile_excludes_admin'] = not ({'studio', 'meta'} & set(defaults))
    gateway = inspect('workout-supabase-envoy')
    env = dict(value.split('=', 1) for value in gateway['Config']['Env'])
    anon, service = env['ANON_KEY'], env['SERVICE_ROLE_KEY']
    for label, path, key, bearer, expected_status in (
        ('auth_health', '/auth/v1/health', anon, None, (200,)),
        ('rest_service', '/rest/v1/students?select=id&limit=1', service, service, (200,)),
        ('rest_anon_denied', '/rest/v1/students?select=id&limit=1', anon, anon, (401, 403)),
        ('storage_read', '/storage/v1/bucket', service, service, (200,)),
        ('edge_anon_denied', '/functions/v1/daily-automation', anon, anon, (401, 403)),
        ('admin_not_public', '/project/default', None, None, (404,)),
    ):
        checks[label] = call('workout-supabase-public', 'http://127.0.0.1:8080', path, key, bearer)[0] in expected_status
    if not all(checks.values()):
        (ROOT / 'failed-checks.json').write_text(json.dumps(checks, indent=2))
        raise RuntimeError('Production verification failed')
    (ROOT / 'checks.json').write_text(json.dumps(checks, indent=2))
    return checks


def rollback(state):
    path = STACK / 'docker-compose.yml'
    if digest(path.read_bytes()) != state['after_sha256']:
        raise RuntimeError('Compose changed after this release; rollback refused')
    for name, before in state['containers'].items():
        if identity(name)['id'] != before['id']:
            raise RuntimeError('Containers changed; rollback needs review')
    original = (ROOT / 'compose.before.yml').read_bytes()
    if digest(original) != state['before_sha256']:
        raise RuntimeError('Original artifact changed')
    path.write_bytes(original)
    for name in ADMINS:
        run(['docker', 'update', '--restart=' + state['containers'][name]['restart'], name])
        if state['containers'][name]['running']:
            run(['docker', 'start', name])
    state['rolled_back'] = True
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))


def apply(stamp):
    state = json.loads((ROOT / 'state.json').read_text())
    path = STACK / 'docker-compose.yml'
    if not stamp.isalnum() or len(stamp) != 16:
        raise RuntimeError('Invalid backup stamp')
    backup = pathlib.Path('/home/ubuntu/workout-backups') / stamp
    manifest = json.loads((backup / 'manifest.json').read_text())
    if manifest['created_utc'] != stamp or (backup / 'complete').read_text().strip() != 'true':
        raise RuntimeError('Incomplete backup')
    for name in FILES:
        if digest((backup / name).read_bytes()) != manifest['sha256'][name]:
            raise RuntimeError('Backup checksum mismatch')
    if digest(path.read_bytes()) != state['before_sha256']:
        raise RuntimeError('Compose changed since preparation')
    for name, before in state['containers'].items():
        if identity(name) != before:
            raise RuntimeError('Runtime changed since preparation')
    candidate = ROOT / 'compose.after.yml'
    if digest(candidate.read_bytes()) != state['after_sha256']:
        raise RuntimeError('Candidate changed')
    path.write_bytes(candidate.read_bytes())
    try:
        for name in ADMINS:
            run(['docker', 'update', '--restart=no', name])
        run(['docker', 'stop', '--time', '30', *ADMINS])
        checks = verify(state)
    except Exception:
        rollback(state)
        raise
    state['applied'] = True
    state['backup_stamp'] = stamp
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))
    print(json.dumps({'applied': True, 'production_checks': len(checks), 'only_admin_stopped': True}))


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare()
    elif sys.argv[1] == 'apply':
        apply(sys.argv[2])
    elif sys.argv[1] == 'verify':
        checks = verify(json.loads((ROOT / 'state.json').read_text()))
        print(json.dumps({'checks': len(checks), 'passed': True}))
    elif sys.argv[1] == 'rollback':
        rollback(json.loads((ROOT / 'state.json').read_text()))
    else:
        raise SystemExit('Use prepare, apply STAMP, verify or rollback')
