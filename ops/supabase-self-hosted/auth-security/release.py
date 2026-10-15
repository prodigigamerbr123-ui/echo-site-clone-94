"""Guarded Auth release, preserving password hashes and existing client sessions.

Private inputs, state and backups must stay outside Git. This release is bound to
the 2026-10-15 deployment and refuses unrelated images or compose changes.
"""
import datetime
import gzip
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

import yaml

ROOT = pathlib.Path('/home/ubuntu/workout-auth-release-20261015')
EVIDENCE = pathlib.Path('/home/ubuntu/workout-auth-security-20261014')
STACK = pathlib.Path('/opt/workout-supabase')
NAME = 'workout-supabase-auth'
OLD = 'sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232'
TAG = 'workout-auth:2.196.0-security1'
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
      'passwords',(SELECT md5(string_agg(id::text||encrypted_password,'|' ORDER BY id)) FROM auth.users),
      'identities',(SELECT md5(string_agg(concat_ws(':',id,user_id,provider,provider_id),'|' ORDER BY id)) FROM auth.identities),
      'migrations',(SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM auth.schema_migrations),
      'schema_digest',(SELECT md5(string_agg(concat_ws(':',n.nspname,c.relname,a.attname,a.atttypid,a.attnotnull),'|' ORDER BY n.nspname,c.relname,a.attnum))
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','auth','storage') AND a.attnum>0 AND NOT a.attisdropped),
      'functions_digest',(SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','auth','storage') AND p.prokind IN ('f','p')));"""))


def sessions():
    return set(sql('SELECT id FROM auth.sessions ORDER BY id;').splitlines())


def request(path, method='GET', body=None, token=None):
    item = inspect(NAME)
    networks = item['NetworkSettings']['Networks']
    ip = next(v['IPAddress'] for v in networks.values() if v['IPAddress'])
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request('http://' + ip + ':9999' + path,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers=headers)
    try:
        response = urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=12)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = response.read()
        return response.status, json.loads(data) if data else None


def verify(state, hardened):
    item = inspect(NAME)
    checks = {'healthy': item['State'].get('Health', {}).get('Status') == 'healthy',
              'health_endpoint': request('/health')[0] == 200,
              'missing_auth_denied': request('/user')[0] == 401,
              'data_and_schema_preserved': inventory() == state['inventory_before'],
              'previous_client_sessions_preserved': set(state['client_sessions_before']).issubset(sessions())}
    session_path = ROOT / 'audit-session.json'
    session = json.loads(session_path.read_text())
    code, user = request('/user', token=session['access_token'])
    checks['existing_access_works'] = code == 200 and user.get('id') == session['user']['id']
    code, refreshed = request('/token?grant_type=refresh_token', 'POST', {'refresh_token': session['refresh_token']})
    checks['existing_refresh_works'] = code == 200 and refreshed.get('user', {}).get('id') == session['user']['id']
    if checks['existing_refresh_works']:
        session_path.write_text(json.dumps(refreshed))
    else:
        raise RuntimeError('Audit refresh failed; preserve private session and inspect Auth')
    gateway = dict(value.split('=', 1) for value in inspect('workout-supabase-envoy')['Config']['Env'])
    response = run(['docker', 'exec', 'workout-supabase-public', 'curl', '-sS', '--max-time', '10',
                    '-w', '\n%{http_code}', '-H', 'Host: backend.workoutsaas.dpdns.org',
                    '-H', 'Origin: https://workoutsaas.dpdns.org', '-H', 'User-Agent: Mozilla/5.0',
                    '-H', 'apikey: ' + gateway['ANON_KEY'], '-H', 'Authorization: Bearer ' + refreshed['access_token'],
                    'http://127.0.0.1:8080/rest/v1/rpc/get_workout_dashboard'])
    body, status = response.rsplit('\n', 1)
    checks['auth_issued_token_dashboard'] = status == '200' and {'stats', 'actions', 'agenda'}.issubset(json.loads(body))
    for name in ('workout-supabase-rest', 'workout-supabase-storage', 'workout-supabase-pooler'):
        checks[name + '_healthy'] = inspect(name)['State'].get('Health', {}).get('Status') == 'healthy'
    if hardened:
        fields = dict(line.split(':', 1) for line in run(['docker', 'exec', NAME, 'cat', '/proc/1/status']).splitlines() if ':' in line)
        checks.update(image_pinned=item['Image'] == state['new_image'], non_root=item['Config']['User'] == '1000:1000',
                      readonly=item['HostConfig']['ReadonlyRootfs'], caps_dropped=item['HostConfig']['CapDrop'] == ['ALL'],
                      capabilities_zero=int(fields['CapEff'].strip(), 16) == 0,
                      no_new_privileges=fields['NoNewPrivs'].strip() == '1', seccomp=fields['Seccomp'].strip() == '2',
                      pids_bounded=item['HostConfig']['PidsLimit'] == 256)
    assert all(checks.values()), 'Auth production checks failed: ' + ','.join(k for k,v in checks.items() if not v)
    return checks


def recreate():
    run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'up', '-d', '--no-deps', '--pull', 'never', 'auth'])


def ready():
    for _ in range(45):
        if inspect(NAME)['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Auth did not become healthy')


def rollback(state):
    assert digest(STACK / 'docker-compose.yml') == state['compose_after_sha256']
    assert inspect('supabase/gotrue:v2.196.0')['Id'] == OLD
    (STACK / 'docker-compose.yml').write_bytes((ROOT / 'compose.before.yml').read_bytes())
    recreate()
    ready()
    assert inspect(NAME)['Image'] == OLD
    if (ROOT / 'audit-session.json').exists():
        checks = verify(state, False)
    else:
        assert state.get('audit_session_cleaned'), 'Missing session without recorded cleanup'
        checks = {'health_endpoint': request('/health')[0] == 200,
                  'missing_auth_denied': request('/user')[0] == 401,
                  'data_and_schema_preserved': inventory() == state['inventory_before'],
                  'previous_client_sessions_preserved': set(state['client_sessions_before']).issubset(sessions()),
                  'own_session_previously_cleaned': True}
        assert all(checks.values())
    state.update(phase='rolled_back', rollback_checks=checks)
    save(state)


def main():
    phase = sys.argv[1]
    if phase == 'prepare':
        assert not (ROOT / 'state.json').exists()
        build = json.loads((EVIDENCE / 'build-state.json').read_text())
        validation = json.loads((EVIDENCE / 'validation.json').read_text())
        assert build['phase'] == 'scanned' and build['migrations_unchanged']
        assert not build['counts'].get('CRITICAL', 0)
        assert all(v['id'] == 'CVE-2026-32286' and v['package'] == 'github.com/jackc/pgproto3/v2' for v in build['candidate']['high_critical'])
        assert validation['image'] == build['image'] and len(validation['checks']) == 42 and all(validation['checks'].values())
        patch = json.loads((EVIDENCE / 'build-output/parser-patch.json').read_text())
        assert patch['original_sha256'] != patch['patched_sha256'] and patch['version_metadata_preserved']
        assert all(json.loads((EVIDENCE / 'cleanup.json').read_text()).values())
        assert inspect(NAME)['Image'] == OLD
        before = inventory()
        clients = sorted(sessions())
        credentials = ROOT / 'login-input.json'
        code, session = request('/token?grant_type=password', 'POST', json.loads(credentials.read_text()))
        assert code == 200 and session.get('access_token'), 'Authorized audit login failed'
        (ROOT / 'audit-session.json').write_text(json.dumps(session))
        credentials.unlink()
        state = {'phase': 'preparing', 'new_image': build['image'], 'inventory_before': before, 'client_sessions_before': clients}
        save(state)
        state['before_checks'] = verify(state, False)
        (ROOT / 'container.before.json').write_text(json.dumps(inspect(NAME), indent=2))
        (ROOT / 'compose.before.yml').write_bytes((STACK / 'docker-compose.yml').read_bytes())
        run(['python3', str(STACK / 'backup.py')])
        stamp = pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip()
        backup = pathlib.Path('/home/ubuntu/workout-backups') / stamp
        assert (backup / 'complete').exists()
        with (ROOT / 'runtime-image.tar.gz').open('wb') as destination:
            with gzip.GzipFile(fileobj=destination, mode='wb') as compressed:
                with subprocess.Popen(['docker', 'image', 'save', build['image']], stdout=subprocess.PIPE) as export:
                    shutil.copyfileobj(export.stdout, compressed)
                    assert export.wait() == 0
        state.update(phase='prepared', backup_stamp=stamp,
                     proof={'backup': {name: digest(backup / name) for name in FILES},
                            'release': {name: digest(ROOT / name) for name in ('container.before.json', 'compose.before.yml', 'runtime-image.tar.gz')}})
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
        assert inspect(NAME)['Image'] == OLD
        verify(state, False)
        before = json.loads(run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'config', '--format', 'json']))
        config = yaml.safe_load((ROOT / 'compose.before.yml').read_text())
        assert config['services']['auth']['image'] == 'supabase/gotrue:v2.196.0'
        config['services']['auth'].update(image=TAG, user='1000:1000', read_only=True, cap_drop=['ALL'], security_opt=['no-new-privileges:true'], pids_limit=256)
        run(['docker', 'tag', state['new_image'], TAG])
        temporary = STACK / '.compose-auth.tmp'
        temporary.write_text(yaml.safe_dump(config, sort_keys=False))
        temporary.replace(STACK / 'docker-compose.yml')
        state.update(phase='applying', compose_after_sha256=digest(STACK / 'docker-compose.yml'))
        save(state)
        try:
            after = json.loads(run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'config', '--format', 'json']))
            assert all(after['services'][name] == value for name,value in before['services'].items() if name != 'auth')
            recreate()
            ready()
            state['checks'] = verify(state, True)
            run(['docker', 'restart', NAME])
            ready()
            state['restart_checks'] = verify(state, True)
            state.update(phase='published', inventory_after=inventory())
            save(state)
            print(json.dumps({'phase': 'published', 'checks': len(state['checks']), 'restart_passed': True}))
        except Exception:
            rollback(state)
            raise
    elif phase == 'cleanup-session':
        state = json.loads((ROOT / 'state.json').read_text())
        assert state['phase'] in ('published', 'rolled_back')
        session_file = ROOT / 'audit-session.json'
        session = json.loads(session_file.read_text())
        assert request('/logout?scope=local', 'POST', token=session['access_token'])[0] == 204
        assert request('/token?grant_type=refresh_token', 'POST', {'refresh_token': session['refresh_token']})[0] in (400, 401)
        assert set(state['client_sessions_before']).issubset(sessions())
        session_file.unlink()
        state['audit_session_cleaned'] = True
        save(state)
        print('Own audit session removed; previous client sessions preserved')
    elif phase == 'rollback':
        rollback(json.loads((ROOT / 'state.json').read_text()))
    else:
        raise ValueError('Unknown phase')


if __name__ == '__main__':
    main()
