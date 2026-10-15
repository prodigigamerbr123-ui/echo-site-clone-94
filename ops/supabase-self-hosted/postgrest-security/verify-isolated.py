"""Validate PostgREST HTTP/RLS contracts using only disposable synthetic records."""
import base64
import concurrent.futures
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import subprocess
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path('/home/ubuntu/workout-postgrest-security-20261014')
PREFIX = 'workout-postgrest-check-20261014'
DB, REST, NET = PREFIX + '-db', PREFIX + '-rest', PREFIX + '-net'
ALICE = '11111111-1111-4111-8111-111111111111'
BOB = '22222222-2222-4222-8222-222222222222'
STUDENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
STUDENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
CREATED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
os.umask(0o077)


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        (ROOT / 'validation-error.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect private validation-error.log')
    return result.stdout.strip()


def sql(query):
    return run(['docker', 'exec', '-i', DB, 'psql', '-U', 'fixture_admin', '-d', 'postgres',
                '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], query)


def token(secret, role='authenticated', sub=ALICE, expires=None):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    body = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({
        'role': role, 'sub': sub, 'iat': int(time.time()) - 60,
        'exp': expires if expires is not None else int(time.time()) + 1800})
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


def main():
    state = json.loads((ROOT / 'build-state.json').read_text())
    assert state['phase'] == 'scanned' and state['production_unchanged']
    assert state['counts'].get('CRITICAL', 0) == 0 and state['counts'].get('HIGH', 0) == 0, 'Review residual findings before testing a different candidate'
    assert not (ROOT / 'validation.json').exists()
    for name in (DB, REST):
        assert subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0
    assert subprocess.run(['docker', 'network', 'inspect', NET], capture_output=True).returncode != 0
    password, secret = secrets.token_hex(24), secrets.token_hex(32)
    checks, created = {}, []
    env = ROOT / 'fixture.env'

    def check(name, condition):
        checks[name] = bool(condition)
        assert condition, name

    try:
        run(['docker', 'network', 'create', '--internal', NET])
        check('internal_network', json.loads(run(['docker', 'network', 'inspect', NET]))[0]['Internal'])
        run(['docker', 'run', '-d', '--name', DB, '--network', NET, '--network-alias', 'db',
             '--memory', '512m', '--cpus', '1', '--tmpfs', '/tmp:rw,size=512m,mode=1777',
             '--user', 'postgres', '--entrypoint', 'bash', 'supabase/postgres:17.6.1.136', '-c',
             "initdb -D /tmp/rest-fixture -U fixture_admin --auth-local=trust --auth-host=scram-sha-256 >/tmp/init.log 2>&1 && echo 'host all all 0.0.0.0/0 scram-sha-256' >> /tmp/rest-fixture/pg_hba.conf && exec postgres -D /tmp/rest-fixture -c listen_addresses='*' -c shared_preload_libraries="])
        created.append(DB)
        for _ in range(45):
            if subprocess.run(['docker', 'exec', DB, 'pg_isready', '-U', 'fixture_admin'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Fixture database not ready')
        sql("CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '" + password + "';"
            "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;"
            "GRANT anon,authenticated,service_role TO authenticator;"
            "CREATE SCHEMA auth; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;"
            "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;"
            "CREATE TABLE public.students(id uuid PRIMARY KEY,owner uuid NOT NULL,name text NOT NULL);"
            "ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;"
            "CREATE POLICY student_owner ON public.students TO authenticated USING(owner=auth.uid()) WITH CHECK(owner=auth.uid());"
            "GRANT SELECT,INSERT,UPDATE,DELETE ON public.students TO authenticated,service_role;"
            "INSERT INTO public.students VALUES('" + STUDENT_A + "','" + ALICE + "','Alice fixture'),('" + STUDENT_B + "','" + BOB + "','Bob fixture');"
            "CREATE SCHEMA app_private; CREATE TABLE app_private.requests(id bigint GENERATED ALWAYS AS IDENTITY,role text);"
            "CREATE FUNCTION public.audit_pre_request() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM set_config('workout.fixture_hook_seen','yes',true); END $$;"
            "REVOKE ALL ON FUNCTION public.audit_pre_request() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.audit_pre_request() TO anon,authenticated,service_role;"
            "CREATE FUNCTION public.student_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$ SELECT jsonb_build_object('count',count(*),'hook_seen',current_setting('workout.fixture_hook_seen',true)) FROM public.students $$;"
            "REVOKE ALL ON FUNCTION public.student_snapshot() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.student_snapshot() TO authenticated,service_role;")
        values = {'PGRST_DB_URI': 'postgresql://authenticator:' + password + '@db:5432/postgres',
                  'PGRST_DB_SCHEMAS': 'public', 'PGRST_DB_ANON_ROLE': 'anon', 'PGRST_JWT_SECRET': secret,
                  'PGRST_DB_PRE_REQUEST': 'public.audit_pre_request', 'PGRST_DB_POOL': '5',
                  'PGRST_DB_PREPARED_STATEMENTS': 'true', 'PGRST_SERVER_PORT': '3000', 'PGRST_SERVER_HOST': '0.0.0.0',
                  'PGRST_ADMIN_SERVER_PORT': '3001'}
        env.write_text('\n'.join(k + '=' + v for k, v in values.items()) + '\n')

        def start():
            run(['docker', 'run', '-d', '--name', REST, '--network', NET, '--memory', '384m', '--cpus', '1',
                 '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true',
                 '--pids-limit', '256', '--env-file', str(env), state['image']])
            for _ in range(45):
                ready = subprocess.run(['docker', 'exec', REST, 'postgrest', '--ready'], capture_output=True)
                if ready.returncode == 0:
                    return
                (ROOT / 'readiness.log').write_bytes(ready.stdout + ready.stderr)
                time.sleep(1)
            raise RuntimeError('Candidate REST service not ready')

        created.append(REST)
        start()
        item = json.loads(run(['docker', 'inspect', REST]))[0]
        check('immutable_image', item['Image'] == state['image'])
        check('no_published_ports', not item['HostConfig'].get('PortBindings'))
        check('non_root', item['Config']['User'] == '1000:1000')
        check('readonly_rootfs', item['HostConfig']['ReadonlyRootfs'])
        check('caps_dropped', item['HostConfig']['CapDrop'] == ['ALL'])
        check('pids_bounded', item['HostConfig']['PidsLimit'] == 256)
        status = run(['docker', 'exec', REST, 'cat', '/proc/1/status'])
        fields = dict(line.split(':', 1) for line in status.splitlines() if ':' in line)
        check('capabilities_zero', int(fields['CapEff'].strip(), 16) == 0)
        check('no_new_privileges', fields['NoNewPrivs'].strip() == '1')
        check('seccomp_active', fields['Seccomp'].strip() == '2')
        check('binary_preserved', run(['docker', 'exec', REST, 'sha256sum', '/usr/bin/postgrest']).split()[0] == state['binary_sha256'])
        check('no_privileged_files', not run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--user', '0', '--entrypoint', 'find', state['image'], '/', '-xdev', '-type', 'f', '-perm', '/6000', '-print']))
        check('no_build_headers', subprocess.run(['docker', 'exec', REST, 'test', '-e', '/usr/include/linux'], capture_output=True).returncode != 0)
        check('no_compiler', subprocess.run(['docker', 'exec', REST, 'test', '-e', '/usr/bin/gcc'], capture_output=True).returncode != 0)
        check('no_unused_pebble', subprocess.run(['docker', 'exec', REST, 'test', '-e', '/usr/bin/pebble'], capture_output=True).returncode != 0)

        def request(path, credential=None, method='GET', body=None, extra=None):
            ip = json.loads(run(['docker', 'inspect', REST]))[0]['NetworkSettings']['Networks'][NET]['IPAddress']
            headers = {'Content-Type': 'application/json', **(extra or {})}
            if credential:
                headers['Authorization'] = 'Bearer ' + credential
            req = urllib.request.Request('http://' + ip + ':3000' + path,
                                         data=json.dumps(body).encode() if body is not None else None,
                                         headers=headers, method=method)
            try:
                response = urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=10)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                data = response.read()
                parsed = json.loads(data) if data else None
                with (ROOT / 'fixture-http.log').open('a') as trace:
                    trace.write(json.dumps({'path': path, 'method': method, 'status': response.status, 'body': parsed}) + '\n')
                return response.status, parsed, {k.lower(): v for k, v in response.headers.items()}

        alice, bob, service = token(secret), token(secret, sub=BOB), token(secret, role='service_role')
        check('anonymous_table_denied', request('/students')[0] in (401, 403))
        check('anonymous_rpc_denied', request('/rpc/student_snapshot')[0] in (401, 403))
        check('invalid_signature_denied', request('/students', token('wrong-key' * 8))[0] == 401)
        check('expired_token_denied', request('/students', token(secret, expires=int(time.time()) - 120))[0] == 401)
        check('ungranted_role_denied', request('/students', token(secret, role='fixture_admin'))[0] in (401, 403))
        code, rows, _ = request('/students?select=id,name&order=id', alice)
        check('authenticated_own_row', code == 200 and len(rows) == 1 and rows[0]['id'] == STUDENT_A)
        code, rows, _ = request('/students?select=id&order=id', bob)
        check('other_user_isolated', code == 200 and rows == [{'id': STUDENT_B}])
        code, rows, _ = request('/students?id=eq.' + STUDENT_A, bob)
        check('cross_user_read_empty', code == 200 and rows == [])
        code, _, headers = request('/students?select=id&order=id', service, extra={'Range': '0-0', 'Prefer': 'count=exact'})
        check('pagination_exact_count', code in (200, 206) and headers.get('content-range') == '0-0/2')
        check('head_count', request('/students', alice, method='HEAD', extra={'Prefer': 'count=exact'})[2].get('content-range') == '0-0/1')
        code, data, _ = request('/rpc/student_snapshot', alice)
        check('rpc_respects_rls', code == 200 and data == {'count': 1, 'hook_seen': 'yes'})
        check('service_rpc_bypass_explicit', request('/rpc/student_snapshot', service)[1] == {'count': 2, 'hook_seen': 'yes'})
        code, rows, _ = request('/students', alice, method='POST', body={'id': CREATED, 'owner': ALICE, 'name': 'Created fixture'}, extra={'Prefer': 'return=representation'})
        check('insert_owned_record', code == 201 and rows[0]['id'] == CREATED)
        check('insert_other_owner_denied', request('/students', alice, method='POST', body={'id': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'owner': BOB, 'name': 'Rejected fixture'})[0] == 403)
        code, rows, _ = request('/students?id=eq.' + CREATED, alice, method='PATCH', body={'name': 'Avaliação José 🏋️'}, extra={'Prefer': 'return=representation'})
        check('update_owned_record', code == 200 and rows[0]['name'] == 'Avaliação José 🏋️')
        code, rows, _ = request('/students?id=eq.' + CREATED, bob, method='PATCH', body={'name': 'Forbidden fixture'}, extra={'Prefer': 'return=representation'})
        check('cross_user_update_empty', code == 200 and rows == [])
        check('cross_user_update_preserves_record', request('/students?id=eq.' + CREATED, alice)[1][0]['name'] == 'Avaliação José 🏋️')
        check('duplicate_insert_conflict', request('/students', alice, method='POST', body={'id': CREATED, 'owner': ALICE, 'name': 'Duplicate'})[0] == 409)
        check('hidden_schema_denied', request('/requests', service, extra={'Accept-Profile': 'app_private'})[0] == 406)
        check('invalid_filter_rejected', request('/students?id=not-a-filter', alice)[0] == 400)
        code, _, _ = request('/students?id=eq.' + CREATED, alice, method='DELETE')
        check('delete_owned_record', code == 204 and request('/rpc/student_snapshot', alice)[1] == {'count': 1, 'hook_seen': 'yes'})
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: request('/rpc/student_snapshot', alice), range(12)))
        check('concurrent_prepared_queries', all(code == 200 and data == {'count': 1, 'hook_seen': 'yes'} for code, data, _ in results))
        check('pre_request_hook_executed', request('/rpc/student_snapshot', alice)[1]['hook_seen'] == 'yes')
        run(['docker', 'rm', '-f', REST])
        start()
        check('restart_ready', request('/rpc/student_snapshot', alice)[1] == {'count': 1, 'hook_seen': 'yes'})
        check('restart_rls_preserved', request('/students?id=eq.' + STUDENT_A, bob)[1] == [])
        check('fixture_rows_preserved', sql('SELECT count(*) FROM public.students;') == '2')
        result = {'phase': 'functional_passed', 'image': state['image'], 'checks': checks,
                  'synthetic_records_only': True, 'production_credentials_read': False}
    finally:
        if REST in created and subprocess.run(['docker', 'inspect', REST], capture_output=True).returncode == 0:
            logs = subprocess.run(['docker', 'logs', REST], capture_output=True, text=True)
            (ROOT / 'rest-fixture.log').write_text(logs.stdout + logs.stderr)
        for name in reversed(created):
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', NET], capture_output=True)
        env.unlink(missing_ok=True)
        cleanup = {'containers_removed': all(subprocess.run(['docker', 'inspect', n], capture_output=True).returncode != 0 for n in created),
                   'network_removed': subprocess.run(['docker', 'network', 'inspect', NET], capture_output=True).returncode != 0,
                   'secret_file_removed': not env.exists()}
        (ROOT / 'validation-checks.json').write_text(json.dumps(checks, indent=2))
        (ROOT / 'cleanup.json').write_text(json.dumps(cleanup, indent=2))
        assert all(cleanup.values())
    (ROOT / 'validation.json').write_text(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
