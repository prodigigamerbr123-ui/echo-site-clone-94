"""Date-specific pooler credential separation; run as root on the reviewed VM."""
import datetime
import hashlib
import json
import os
import pathlib
import secrets
import subprocess
import sys
import time
from urllib.parse import urlparse

import yaml

ROOT = pathlib.Path('/home/ubuntu/workout-pooler-roles-release-20261014')
FIXTURE = pathlib.Path('/home/ubuntu/workout-pooler-roles-20261014')
STACK = pathlib.Path('/opt/workout-supabase')
POOL = 'workout-supabase-pooler'
DB = 'workout-supabase-db'
IMAGE = 'sha256:1f3562efb570cd78c131771e2ab64ca8db2c71f40d5dd5efe5d6dba976d5c2a6'
FILES = ('database.dump', 'pooler.dump', 'roles.sql', 'runtime.tar.gz', 'database-config.tar.gz')
os.umask(0o077)
ROOT.mkdir(mode=0o700, exist_ok=True)


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        (ROOT / 'command-error.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect private command-error.log')
    return result.stdout.strip()


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def sql(query, database='postgres'):
    return run(['docker', 'exec', '-i', DB, 'psql', '-U', 'supabase_admin', '-d',
                database, '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], query)


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def save(state):
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))


def inventory():
    result = json.loads(sql("SELECT json_build_object('students',(SELECT count(*) FROM public.students),"
                            "'auth_users',(SELECT count(*) FROM auth.users),'crons',(SELECT count(*) FROM cron.job WHERE active));"))
    result['metadata'] = json.loads(sql("SELECT json_build_object('users',(SELECT count(*) FROM _supavisor.users),"
                                      "'tenants',(SELECT count(*) FROM _supavisor.tenants),"
                                      "'migrations',(SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM _supavisor.schema_migrations));", '_supabase'))
    return result


def compose_config():
    return json.loads(run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'config', '--format', 'json']))


def recreate():
    run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'up', '-d',
         '--no-deps', '--pull', 'never', 'supavisor'])


def verify(restricted):
    item = inspect(POOL)
    env = dict(value.split('=', 1) for value in item['Config']['Env'])
    checks = {'healthy': item['State'].get('Health', {}).get('Status') == 'healthy',
              'image_unchanged': item['Image'] == IMAGE,
              'non_root': item['Config']['User'] == '65534:65534',
              'readonly': item['HostConfig']['ReadonlyRootfs'],
              'caps_dropped': item['HostConfig']['CapDrop'] == ['ALL']}
    if restricted:
        checks['automatic_migrations_disabled'] = '/app/bin/migrate' not in ' '.join(item['Config']['Cmd'])
    manager = sql('SELECT db_user FROM _supavisor.users WHERE is_manager;', '_supabase')
    for port in ('5432', '6543'):
        checks['sql_' + port] = run(['docker', 'exec', '-e', 'PGPASSWORD=' + env['POSTGRES_PASSWORD'],
                                    '-e', 'PGCONNECT_TIMEOUT=5', DB, 'psql', '-h', POOL, '-p', port,
                                    '-U', manager + '.' + env['POOLER_TENANT_ID'], '-d', env['POSTGRES_DB'],
                                    '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1;']) == '1'
    gateway = dict(v.split('=', 1) for v in inspect('workout-supabase-envoy')['Config']['Env'])
    for path, name, allowed, key in [('/auth/v1/health', 'auth', (200,), gateway['ANON_KEY']),
                                     ('/rest/v1/students?select=id&limit=1', 'anonymous_denied', (401, 403), gateway['ANON_KEY']),
                                     ('/storage/v1/bucket', 'storage', (200,), gateway['SERVICE_ROLE_KEY'])]:
        response = run(['docker', 'exec', 'workout-supabase-public', 'curl', '-sS', '--max-time', '10',
                        '-o', '/dev/null', '-w', '%{http_code}', '-H', 'Host: backend.workoutsaas.dpdns.org',
                        '-H', 'apikey: ' + key, '-H', 'Authorization: Bearer ' + key,
                        'http://127.0.0.1:8080' + path])
        checks[name] = int(response) in allowed
    if restricted:
        admin = dict(v.split('=', 1) for v in inspect(DB)['Config']['Env'])['POSTGRES_PASSWORD']
        checks.update(metadata_role=urlparse(env['DATABASE_URL']).username == 'workout_pooler_meta',
                      manager_role=manager == 'workout_pooler_manager',
                      admin_secret_absent=not any(admin in value for value in env.values()),
                      credentials_independent=urlparse(env['DATABASE_URL']).password != env['POSTGRES_PASSWORD'],
                      auth_query_restricted=sql('SELECT auth_query FROM _supavisor.tenants;', '_supabase') == 'SELECT * FROM pgbouncer.workout_pooler_auth($1)')
        checks['roles_unprivileged'] = sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('workout_pooler_meta','workout_pooler_manager') AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls);") == '2'
        checks['metadata_connection_observed'] = int(sql("SELECT count(*) FROM pg_stat_activity WHERE usename='workout_pooler_meta' AND datname='_supabase';")) > 0
        checks['no_admin_metadata_connections'] = sql("SELECT count(*) FROM pg_stat_activity WHERE usename='supabase_admin' AND application_name='supavisor_meta';") == '0'
        checks['no_role_memberships'] = sql("SELECT count(*) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('workout_pooler_meta','workout_pooler_manager'));") == '0'
        checks['metadata_schema_creation_denied'] = sql("SELECT has_schema_privilege('workout_pooler_meta','_supavisor','USAGE') AND NOT has_schema_privilege('workout_pooler_meta','_supavisor','CREATE');", '_supabase') == 't'
        for role, password in [('workout_pooler_meta', urlparse(env['DATABASE_URL']).password),
                               ('workout_pooler_manager', env['POSTGRES_PASSWORD'])]:
            for name, query in [('students', 'SELECT id FROM public.students LIMIT 1;'),
                                ('password_catalog', 'SELECT rolpassword FROM pg_authid LIMIT 1;')]:
                denied = subprocess.run(['docker', 'exec', '-e', 'PGPASSWORD=' + password, DB,
                                         'psql', '-h', '127.0.0.1', '-U', role, '-d', 'postgres',
                                         '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query], capture_output=True, text=True)
                checks[role + '_' + name + '_denied'] = denied.returncode != 0 and 'permission denied' in denied.stderr
        for forbidden in ('supabase_admin', 'postgres', 'pgbouncer', 'workout_pooler_meta'):
            answer = run(['docker', 'exec', '-e', 'PGPASSWORD=' + env['POSTGRES_PASSWORD'], DB,
                          'psql', '-h', '127.0.0.1', '-U', 'workout_pooler_manager', '-d', 'postgres',
                          '-Atq', '-v', 'ON_ERROR_STOP=1', '-c',
                          'SELECT count(*) FROM pgbouncer.workout_pooler_auth(' + quote(forbidden) + ');'])
            checks['auth_helper_excludes_' + forbidden] = answer == '0'
    return checks


def wait(restricted):
    for _ in range(45):
        try:
            checks = verify(restricted)
            if all(checks.values()):
                return checks
        except RuntimeError:
            pass
        time.sleep(2)
    raise RuntimeError('Pooler post-change checks failed')


def rollback(state):
    assert digest(STACK / 'docker-compose.yml') == state['compose_after_sha256']
    assert digest(STACK / 'volumes/pooler/pooler.exs') == state['config_after_sha256']
    before = json.loads((ROOT / 'metadata.before.json').read_text())
    user, tenant = before['user'], before['tenant']
    sql('BEGIN; UPDATE _supavisor.users SET db_user=' + quote(user['db_user'])
        + ',db_user_alias=' + quote(user['db_user_alias']) + ',db_pass_encrypted=decode(' + quote(user['db_pass_encrypted'][2:]) + ",'hex'),updated_at="
        + quote(user['updated_at']) + ' WHERE id=' + quote(user['id'])
        + '; UPDATE _supavisor.tenants SET auth_query=' + quote(tenant['auth_query'])
        + ',updated_at=' + quote(tenant['updated_at']) + ' WHERE id=' + quote(tenant['id']) + '; COMMIT;', '_supabase')
    (STACK / 'docker-compose.yml').write_bytes((ROOT / 'compose.before.yml').read_bytes())
    (STACK / 'volumes/pooler/pooler.exs').write_bytes((ROOT / 'pooler.before.exs').read_bytes())
    recreate()
    state.update(phase='rolled_back', rollback_checks=wait(False))
    # Leave new roles disabled for diagnosis; don't DROP OWNED across live databases.
    sql('ALTER ROLE workout_pooler_meta NOLOGIN; ALTER ROLE workout_pooler_manager NOLOGIN;')
    save(state)


def main():
    phase = sys.argv[1]
    if phase == 'prepare':
        assert not (ROOT / 'state.json').exists()
        result = json.loads((FIXTURE / 'validation.json').read_text())
        assert result['image'] == IMAGE and len(result['checks']) == 56 and all(result['checks'].values())
        assert digest(ROOT / 'database-roles.sql') == digest(FIXTURE / 'database-roles.sql')
        assert all(json.loads((FIXTURE / 'cleanup.json').read_text()).values())
        assert inspect(POOL)['Image'] == IMAGE and all(verify(False).values())
        assert sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('workout_pooler_meta','workout_pooler_manager');") == '0'
        assert sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pgbouncer' AND proname='workout_pooler_auth';") == '0'
        assert inventory()['metadata']['users'] == 1 and inventory()['metadata']['tenants'] == 1
        before = json.loads(sql("SELECT json_build_object('user',(SELECT row_to_json(u) FROM _supavisor.users u), 'tenant',(SELECT row_to_json(t) FROM _supavisor.tenants t));", '_supabase'))
        assert before['user']['db_user'] == 'pgbouncer' and before['user']['db_user_alias'] == 'pgbouncer'
        (ROOT / 'metadata.before.json').write_text(json.dumps(before))
        (ROOT / 'compose.before.yml').write_bytes((STACK / 'docker-compose.yml').read_bytes())
        (ROOT / 'pooler.before.exs').write_bytes((STACK / 'volumes/pooler/pooler.exs').read_bytes())
        run(['python3', str(STACK / 'backup.py')])
        stamp = pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip()
        backup = pathlib.Path('/home/ubuntu/workout-backups') / stamp
        assert (backup / 'complete').exists()
        state = {'phase': 'prepared', 'backup_stamp': stamp, 'inventory_before': inventory(),
                 'proof': {'backup': {name: digest(backup / name) for name in FILES},
                           'release': {name: digest(ROOT / name) for name in ('compose.before.yml', 'pooler.before.exs', 'metadata.before.json')}}}
        save(state)
        print(json.dumps({'phase': state['phase'], 'backup_stamp': stamp, 'files': 8}))
    elif phase == 'apply':
        state = json.loads((ROOT / 'state.json').read_text())
        assert state['phase'] == 'prepared'
        assert digest(ROOT / 'database-roles.sql') == digest(FIXTURE / 'database-roles.sql')
        assert json.loads(pathlib.Path(sys.argv[2]).read_text()) == state['proof']
        created = datetime.datetime.strptime(state['backup_stamp'], '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
        assert 0 <= (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds() < 3600
        assert all(digest(ROOT / name) == value for name, value in state['proof']['release'].items())
        assert digest(STACK / 'docker-compose.yml') == state['proof']['release']['compose.before.yml']
        assert digest(STACK / 'volumes/pooler/pooler.exs') == state['proof']['release']['pooler.before.exs']
        assert inspect(POOL)['Image'] == IMAGE and inventory() == state['inventory_before']
        assert not any(line.split()[-2].rsplit(':', 1)[-1] in ('5433', '6543') for line in run(['ss', '-Hnt', 'state', 'established']).splitlines())
        meta_password, manager_password = secrets.token_hex(32), secrets.token_hex(32)
        before = compose_config()
        config = yaml.safe_load((ROOT / 'compose.before.yml').read_text())
        env = config['services']['supavisor']['environment']
        old_url = urlparse(env['DATABASE_URL'])
        assert old_url.username == 'supabase_admin' and old_url.path == '/_supabase'
        env.update(DATABASE_URL='ecto://workout_pooler_meta:' + meta_password + '@' + old_url.netloc.split('@', 1)[1] + old_url.path,
                   POSTGRES_PASSWORD=manager_password, POOLER_MANAGER_USER='workout_pooler_manager')
        command = config['services']['supavisor']['command']
        assert isinstance(command, list) and command[-1].count('/app/bin/migrate && ') == 1
        command[-1] = command[-1].replace('/app/bin/migrate && ', '')
        source = (ROOT / 'pooler.before.exs').read_text()
        assert source.count('"db_user" => "pgbouncer"') == 1
        source = source.replace('"db_user" => "pgbouncer"',
                                '"db_user" => System.fetch_env!("POOLER_MANAGER_USER")')
        assert source.count('SELECT * FROM pgbouncer.get_auth($1)') == 1
        source = source.replace('SELECT * FROM pgbouncer.get_auth($1)', 'SELECT * FROM pgbouncer.workout_pooler_auth($1)')
        temporary = STACK / '.compose-pooler-roles.tmp'
        temporary.write_text(yaml.safe_dump(config, sort_keys=False))
        state.update(phase='applying', compose_after_sha256=digest(temporary),
                     config_after_sha256=hashlib.sha256(source.encode()).hexdigest())
        try:
            sql("CREATE ROLE workout_pooler_meta LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD " + quote(meta_password) + ';'
            + "CREATE ROLE workout_pooler_manager LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD " + quote(manager_password) + ';')
            sql((ROOT / 'database-roles.sql').read_text())
        except Exception:
            for role in ('workout_pooler_meta', 'workout_pooler_manager'):
                if sql("SELECT count(*) FROM pg_roles WHERE rolname=" + quote(role) + ';') == '1':
                    sql('ALTER ROLE ' + role + ' NOLOGIN;')
            state.update(phase='setup_failed')
            save(state)
            raise
        # Establish both guarded rollback file identities before changing metadata.
        temporary.replace(STACK / 'docker-compose.yml')
        (STACK / 'volumes/pooler/pooler.exs').write_text(source)
        save(state)
        try:
            expression = '''{:ok, _} = Application.ensure_all_started(:ssl)
{:ok, _} = Application.ensure_all_started(:ecto_sql)
{:ok, _} = Application.ensure_all_started(:cloak_ecto)
{:ok, _} = Supavisor.Vault.start_link([])
{:ok, _} = Supavisor.Repo.start_link([])
user = Supavisor.Repo.get_by!(Supavisor.Tenants.User, is_manager: true)
{:ok, _} = Supavisor.Tenants.update_user(user, %{"db_user" => "workout_pooler_manager",
  "db_user_alias" => "workout_pooler_manager", "db_password" => System.fetch_env!("WORKOUT_MANAGER_PASSWORD")})
tenant = Supavisor.Repo.get_by!(Supavisor.Tenants.Tenant, external_id: user.tenant_external_id)
Supavisor.Repo.update!(Ecto.Changeset.change(tenant, auth_query: "SELECT * FROM pgbouncer.workout_pooler_auth($1)"))'''
            run(['docker', 'exec', '-e', 'WORKOUT_MANAGER_PASSWORD=' + manager_password,
                 POOL, '/app/bin/supavisor', 'eval', expression])
            after = compose_config()
            assert all(after['services'][name] == value for name, value in before['services'].items() if name != 'supavisor')
            recreate()
            checks = wait(True)
            assert inventory() == state['inventory_before']
            run(['docker', 'restart', POOL])
            assert all(wait(True).values())
            state.update(phase='published', checks=checks, restart_passed=True, inventory_after=inventory())
            save(state)
            print(json.dumps({'phase': state['phase'], 'checks': len(checks), 'restart_passed': True}))
        except Exception:
            rollback(state)
            raise
    elif phase == 'rollback':
        rollback(json.loads((ROOT / 'state.json').read_text()))
    else:
        raise ValueError('Unknown release phase')


if __name__ == '__main__':
    main()
