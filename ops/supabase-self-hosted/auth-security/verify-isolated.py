"""Exercise old-to-new Auth login/session compatibility without production data."""
import base64
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

ROOT = pathlib.Path('/home/ubuntu/workout-auth-security-20261014')
PREFIX = 'workout-auth-check-20261014'
DB, AUTH, NET = PREFIX + '-db', PREFIX + '-auth', PREFIX + '-net'
OLD = 'sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232'
os.umask(0o077)


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        (ROOT / 'validation-error.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect private validation-error.log')
    return result.stdout.strip()


def sql(query):
    return run(['docker', 'exec', '-i', DB, 'psql', '-U', 'fixture_bootstrap', '-d',
                'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], query)


def signed(secret, role):
    encode = lambda obj: base64.urlsafe_b64encode(json.dumps(obj, separators=(',', ':')).encode()).rstrip(b'=')
    payload = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({
        'role': role, 'aud': 'authenticated', 'iss': 'supabase',
        'iat': int(time.time()), 'exp': int(time.time()) + 3600})
    return (payload + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), payload, hashlib.sha256).digest()).rstrip(b'=')).decode()


def main():
    build = json.loads((ROOT / 'build-state.json').read_text())
    assert build['phase'] == 'scanned' and build['migrations_unchanged']
    assert build['counts'].get('CRITICAL', 0) == 0
    high = build['candidate']['high_critical']
    assert all(v['id'] == 'CVE-2026-32286' and v['package'] == 'github.com/jackc/pgproto3/v2' for v in high)
    patch = json.loads((ROOT / 'build-output/parser-patch.json').read_text())
    assert patch['original_sha256'] != patch['patched_sha256'] and patch['version_metadata_preserved']
    assert not (ROOT / 'validation.json').exists()
    for name in (DB, AUTH):
        assert subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0
    assert subprocess.run(['docker', 'network', 'inspect', NET], capture_output=True).returncode != 0
    password, jwt_secret = secrets.token_hex(24), secrets.token_hex(32)
    alice_password, bob_password, replacement = (secrets.token_urlsafe(24) for _ in range(3))
    alice_email, bob_email = 'alice-audit@example.invalid', 'bob-audit@example.invalid'
    checks, created = {}, []
    env = ROOT / 'fixture.env'

    def check(name, condition):
        checks[name] = bool(condition)
        assert condition, name

    def request(path, method='GET', body=None, credential=None):
        item = json.loads(run(['docker', 'inspect', AUTH]))[0]
        ip = item['NetworkSettings']['Networks'][NET]['IPAddress']
        headers = {'Content-Type': 'application/json'}
        if credential:
            headers['Authorization'] = 'Bearer ' + credential
        req = urllib.request.Request('http://' + ip + ':9999' + path,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     method=method, headers=headers)
        try:
            response = urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=12)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read()
            parsed = json.loads(data) if data else None
            with (ROOT / 'fixture-http.log').open('a') as trace:
                trace.write(json.dumps({'path': path, 'method': method, 'status': response.status,
                                        'error_code': parsed.get('error_code') if isinstance(parsed, dict) else None}) + '\n')
            return response.status, parsed

    def login(email, supplied_password):
        return request('/token?grant_type=password', 'POST', {'email': email, 'password': supplied_password})

    def refresh(value):
        return request('/token?grant_type=refresh_token', 'POST', {'refresh_token': value})

    def start(image):
        restrictions = [] if image == OLD else ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--pids-limit', '256']
        run(['docker', 'run', '-d', '--name', AUTH, '--network', NET, '--memory', '384m', '--cpus', '1',
             '--env-file', str(env), *restrictions, image])
        for _ in range(60):
            try:
                if request('/health')[0] == 200:
                    return
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                pass
            time.sleep(1)
        raise RuntimeError('Fixture Auth failed to become ready')

    try:
        run(['docker', 'network', 'create', '--internal', NET])
        check('internal_network', json.loads(run(['docker', 'network', 'inspect', NET]))[0]['Internal'])
        run(['docker', 'run', '-d', '--name', DB, '--network', NET, '--network-alias', 'db',
             '--memory', '512m', '--cpus', '1', '--tmpfs', '/tmp:rw,size=512m,mode=1777', '--user', 'postgres',
             '--entrypoint', 'bash', 'supabase/postgres:17.6.1.136', '-c',
             "initdb -D /tmp/auth-fixture -U fixture_bootstrap --auth-local=trust --auth-host=scram-sha-256 >/tmp/init.log 2>&1 && echo 'host all all 0.0.0.0/0 scram-sha-256' >> /tmp/auth-fixture/pg_hba.conf && exec postgres -D /tmp/auth-fixture -c listen_addresses='*' -c shared_preload_libraries="])
        created.append(DB)
        for _ in range(45):
            if subprocess.run(['docker', 'exec', DB, 'pg_isready', '-U', 'fixture_bootstrap'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Fixture PostgreSQL not ready')
        sql("CREATE ROLE supabase_auth_admin LOGIN CREATEROLE PASSWORD '" + password + "';"
            "CREATE ROLE postgres NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;"
            "GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_auth_admin;"
            "CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;"
            "ALTER ROLE supabase_auth_admin SET search_path TO auth,public;"
            "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";")
        values = {'GOTRUE_API_HOST': '0.0.0.0', 'GOTRUE_API_PORT': '9999',
                  'API_EXTERNAL_URL': 'http://fixture.invalid', 'GOTRUE_SITE_URL': 'http://fixture.invalid',
                  'GOTRUE_DB_DRIVER': 'postgres', 'GOTRUE_DB_DATABASE_URL': 'postgres://supabase_auth_admin:' + password + '@db:5432/postgres?sslmode=disable',
                  'GOTRUE_DB_NAMESPACE': 'auth', 'GOTRUE_JWT_SECRET': jwt_secret, 'GOTRUE_JWT_EXP': '3600',
                  'GOTRUE_JWT_AUD': 'authenticated', 'GOTRUE_JWT_DEFAULT_GROUP_NAME': 'authenticated',
                  'GOTRUE_JWT_ADMIN_ROLES': 'service_role', 'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true',
                  'GOTRUE_EXTERNAL_PHONE_ENABLED': 'false', 'GOTRUE_MAILER_AUTOCONFIRM': 'true',
                  'GOTRUE_DISABLE_SIGNUP': 'false', 'GOTRUE_PASSWORD_MIN_LENGTH': '8',
                  'GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED': 'true',
                  'GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL': '1', 'GOTRUE_RATE_LIMIT_TOKEN_REFRESH': '1000'}
        env.write_text('\n'.join(k + '=' + v for k, v in values.items()) + '\n')
        created.append(AUTH)
        start(OLD)
        check('original_ready', request('/health')[0] == 200)
        check('invalid_email_denied', request('/signup', 'POST', {'email': 'invalid', 'password': alice_password})[0] in (400, 422))
        check('short_password_denied', request('/signup', 'POST', {'email': alice_email, 'password': 'short'})[0] in (400, 422))
        code, signup = request('/signup', 'POST', {'email': alice_email, 'password': alice_password})
        check('original_signup', code == 200 and bool(signup.get('access_token')))
        alice_id = signup['user']['id']
        code, old_session = login(alice_email, alice_password)
        check('original_password_login', code == 200 and old_session['user']['id'] == alice_id)
        service = signed(jwt_secret, 'service_role')
        code, bob = request('/admin/users', 'POST', {'email': bob_email, 'password': bob_password, 'email_confirm': True}, service)
        check('original_admin_creates_fixture', code in (200, 201) and bool(bob.get('id')))
        migrations = sql("SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM auth.schema_migrations;")
        password_hash = sql("SELECT md5(encrypted_password) FROM auth.users WHERE id='" + alice_id + "';")
        run(['docker', 'rm', '-f', AUTH])
        start(build['image'])
        item = json.loads(run(['docker', 'inspect', AUTH]))[0]
        check('candidate_image_pinned', item['Image'] == build['image'])
        check('no_published_ports', not item['HostConfig'].get('PortBindings'))
        check('non_root', item['Config']['User'] == '1000:1000')
        check('readonly_rootfs', item['HostConfig']['ReadonlyRootfs'])
        check('caps_dropped', item['HostConfig']['CapDrop'] == ['ALL'])
        check('pids_bounded', item['HostConfig']['PidsLimit'] == 256)
        fields = dict(line.split(':', 1) for line in run(['docker', 'exec', AUTH, 'cat', '/proc/1/status']).splitlines() if ':' in line)
        check('capabilities_zero', int(fields['CapEff'].strip(), 16) == 0)
        check('no_new_privileges', fields['NoNewPrivs'].strip() == '1')
        check('seccomp_active', fields['Seccomp'].strip() == '2')
        check('upgrade_migrations_unchanged', migrations == sql("SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM auth.schema_migrations;"))
        check('upgrade_password_hash_unchanged', password_hash == sql("SELECT md5(encrypted_password) FROM auth.users WHERE id='" + alice_id + "';"))
        check('upgrade_users_preserved', sql('SELECT count(*) FROM auth.users;') == '2')
        code, user = request('/user', credential=old_session['access_token'])
        check('old_access_token_valid', code == 200 and user['id'] == alice_id)
        code, rotated = refresh(old_session['refresh_token'])
        check('old_refresh_token_valid', code == 200 and rotated['user']['id'] == alice_id)
        check('refresh_rotates_token', rotated['refresh_token'] != old_session['refresh_token'])
        check('missing_auth_denied', request('/user')[0] == 401)
        invalid_code, invalid_body = request('/user', credential=signed('wrong-key' * 8, 'authenticated'))
        check('invalid_signature_denied', invalid_code in (401, 403) and invalid_body.get('error_code') == 'bad_jwt')
        check('non_admin_list_denied', request('/admin/users', credential=rotated['access_token'])[0] in (401, 403))
        check('non_admin_other_user_denied', request('/admin/users/' + bob['id'], credential=rotated['access_token'])[0] in (401, 403))
        check('admin_list_allowed', request('/admin/users', credential=service)[0] == 200)
        wrong, absent = login(alice_email, 'incorrect-password'), login('absent-audit@example.invalid', alice_password)
        check('wrong_password_denied', wrong[0] in (400, 422))
        check('missing_user_not_enumerated', absent[0] == wrong[0] and absent[1].get('error_code') == wrong[1].get('error_code'))
        check('invalid_refresh_denied', refresh('nonexistent-fixture-token')[0] in (400, 401))
        code, rejected = request('/user', 'PUT', {'role': 'service_role', 'app_metadata': {'role': 'service_role'}}, rotated['access_token'])
        check('privileged_fields_update_denied', code == 403 and rejected.get('error_code') == 'not_admin')
        check('user_cannot_escalate_role', sql("SELECT role FROM auth.users WHERE id='" + alice_id + "';") == 'authenticated')
        check('user_cannot_set_app_metadata', sql("SELECT coalesce(raw_app_meta_data->>'role','') FROM auth.users WHERE id='" + alice_id + "';") == '')
        code, updated = request('/user', 'PUT', {'password': replacement, 'data': {'name': 'Avaliação José'}}, rotated['access_token'])
        check('password_and_metadata_update', code == 200 and updated['id'] == alice_id)
        check('old_password_rejected_after_change', login(alice_email, alice_password)[0] in (400, 422))
        code, alice_current = login(alice_email, replacement)
        check('new_password_login', code == 200 and alice_current['user']['id'] == alice_id)
        code, bob_session = login(bob_email, bob_password)
        check('second_user_login', code == 200 and bob_session['user']['id'] == bob['id'])
        check('logout_local', request('/logout?scope=local', 'POST', credential=alice_current['access_token'])[0] == 204)
        check('logged_out_refresh_denied', refresh(alice_current['refresh_token'])[0] in (400, 401))
        code, bob_rotated = refresh(bob_session['refresh_token'])
        check('other_user_session_preserved', code == 200 and bob_rotated['user']['id'] == bob['id'])
        run(['docker', 'rm', '-f', AUTH])
        start(build['image'])
        code, final_session = refresh(bob_rotated['refresh_token'])
        check('restart_refresh_works', code == 200 and final_session['user']['id'] == bob['id'])
        check('restart_no_new_migration', migrations == sql("SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM auth.schema_migrations;"))
        result = {'phase': 'functional_passed', 'image': build['image'], 'checks': checks,
                  'synthetic_accounts_only': True, 'production_credentials_read': False,
                  'external_providers_started': False}
    finally:
        if AUTH in created and subprocess.run(['docker', 'inspect', AUTH], capture_output=True).returncode == 0:
            logs = subprocess.run(['docker', 'logs', AUTH], capture_output=True, text=True)
            (ROOT / 'auth-fixture.log').write_text(logs.stdout + logs.stderr)
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
