"""Exercise session/transaction pooling against a disposable, private PostgreSQL."""
import argparse
import concurrent.futures
import json
import os
import pathlib
import secrets
import subprocess
import time

ROOT = pathlib.Path('/home/ubuntu/workout-pooler-security-20261014')
PREFIX = 'workout-pooler-check-20261014'
DB = PREFIX + '-db'
POOL = PREFIX + '-pool'
NET = PREFIX + '-net'
os.umask(0o077)


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, text=True)
    if result.returncode:
        (ROOT / 'validation-error.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect private validation-error.log')
    return result.stdout.strip()


def main():
    global ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', choices=['baseline', 'dependencies', 'hardened'], default='baseline')
    parser.add_argument('--functional-only', action='store_true',
                        help='Test this private fixture even when the image scan blocks production promotion')
    args = parser.parse_args()
    if args.candidate == 'dependencies':
        ROOT = pathlib.Path('/home/ubuntu/workout-pooler-dependencies-20261014')
    elif args.candidate == 'hardened':
        ROOT = pathlib.Path('/home/ubuntu/workout-pooler-runtime-20261014')
    state = json.loads((ROOT / 'build-state.json').read_text())
    assert state['phase'] == 'scanned'
    image_scan_clear = state['counts'].get('CRITICAL', 0) == 0 and state['counts'].get('HIGH', 0) == 0
    assert image_scan_clear or args.functional_only, 'Image scan blocks promotion; isolated functional testing needs --functional-only'
    image = state['image']
    for name in (DB, POOL):
        if subprocess.run(['docker', 'inspect', name], capture_output=True).returncode == 0:
            raise RuntimeError('Existing fixture; preserve before another attempt')
    assert subprocess.run(['docker', 'network', 'inspect', NET], capture_output=True).returncode != 0
    checks = {}
    password = secrets.token_hex(24)
    created = []

    def check(name, ok):
        checks[name] = bool(ok)
        assert ok, name

    def sql(query, database='postgres'):
        return run(['docker', 'exec', '-i', DB, 'psql', '-U', 'stage_bootstrap',
                    '-d', database, '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], query)

    def client(query, port=6543, credential=None):
        return run(['docker', 'exec', '-i', '-e', 'PGCONNECT_TIMEOUT=5', '-e', 'PGPASSWORD=' + (credential or password),
                    DB, 'psql', '-h', 'pool', '-p', str(port), '-U', 'fixture_workout.audit',
                    '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], query)

    values = {'POSTGRES_HOST': 'db', 'POSTGRES_PORT': '5432', 'POSTGRES_DB': 'postgres',
              'POSTGRES_PASSWORD': password, 'DATABASE_URL': 'ecto://postgres:' + password + '@db:5432/_supabase',
              'POOLER_TENANT_ID': 'audit', 'POOLER_MAX_CLIENT_CONN': '30', 'POOLER_DEFAULT_POOL_SIZE': '3',
              'POOLER_POOL_MODE': 'transaction', 'DB_POOL_SIZE': '2', 'PORT': '4000',
              'SECRET_KEY_BASE': secrets.token_hex(64), 'VAULT_ENC_KEY': secrets.token_hex(16),
              'API_JWT_SECRET': secrets.token_hex(32), 'METRICS_JWT_SECRET': secrets.token_hex(32),
              'REGION': 'local', 'CLUSTER_POSTGRES': 'true', 'ERL_AFLAGS': '-proto_dist inet_tcp',
              'ERL_FLAGS': '+S 2:2', 'ECTO_IPV6': 'false', 'NODE_IP': '127.0.0.1'}
    if args.candidate == 'hardened':
        values['RELEASE_TMP'] = '/tmp/release'
    env = ROOT / 'fixture.env'
    env.write_text('\n'.join(k + '=' + v for k, v in values.items()) + '\n')
    config = ROOT / 'fixture.exs'
    config.write_text('''{:ok, _} = Application.ensure_all_started(:supavisor)
{:ok, version} = Supavisor.Helpers.parse_pg_version(Supavisor.Repo.query!("select version()").rows |> hd() |> hd())
params = %{"external_id" => "audit", "db_host" => "db", "db_port" => 5432,
  "db_database" => "postgres", "require_user" => false,
  "auth_query" => "SELECT * FROM pgbouncer.get_auth($1)",
  "default_max_clients" => 30, "default_pool_size" => 3,
  "default_parameter_status" => %{"server_version" => version},
  "users" => [%{"db_user" => "pgbouncer", "db_password" => System.fetch_env!("POSTGRES_PASSWORD"),
    "mode_type" => "transaction", "pool_size" => 3, "is_manager" => true}]}
if !Supavisor.Tenants.get_tenant_by_external_id("audit") do
  {:ok, _} = Supavisor.Tenants.create_tenant(params)
end
''')
    if args.candidate == 'hardened':
        # This file contains fixture code and environment lookups, never secrets.
        config.chmod(0o644)

    def start_pool(selected_image=None):
        selected_image = selected_image or image
        restrictions = []
        if args.candidate == 'hardened' and selected_image == image:
            restrictions = ['--read-only', '--cap-drop', 'ALL', '--security-opt',
                            'no-new-privileges=true', '--pids-limit', '256',
                            '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=128m,mode=1777']
        run(['docker', 'run', '-d', '--name', POOL, '--network', NET, '--network-alias', 'pool',
             '--memory', '768m', '--cpus', '1', '--env-file', str(env),
             *restrictions, '-v', str(config) + ':/etc/pooler/pooler.exs:ro', selected_image, '/bin/sh', '-c',
             '/app/bin/migrate && /app/bin/supavisor eval "$(cat /etc/pooler/pooler.exs)" && /app/bin/server'])
        for _ in range(90):
            result = subprocess.run(['docker', 'exec', POOL, 'curl', '-fsS', '--max-time', '2',
                                     'http://127.0.0.1:4000/api/health'], capture_output=True)
            if result.returncode == 0:
                return
            time.sleep(1)
        (ROOT / 'pool-start.log').write_text(run(['docker', 'logs', POOL]))
        raise RuntimeError('Fixture pooler did not become ready')

    try:
        run(['docker', 'network', 'create', '--internal', NET])
        check('network_internal', json.loads(run(['docker', 'network', 'inspect', NET]))[0]['Internal'])
        run(['docker', 'run', '-d', '--name', DB, '--network', NET, '--network-alias', 'db',
             '--memory', '512m', '--cpus', '1', '--tmpfs', '/tmp:rw,size=512m,mode=1777',
             '--user', 'postgres', '--entrypoint', 'bash', 'supabase/postgres:17.6.1.136', '-c',
             "initdb -D /tmp/pool-check -U stage_bootstrap --auth-local=trust --auth-host=trust >/tmp/init.log 2>&1 && echo 'host all all 0.0.0.0/0 scram-sha-256' >> /tmp/pool-check/pg_hba.conf && exec postgres -D /tmp/pool-check -c listen_addresses='*' -c shared_preload_libraries="])
        created.append(DB)
        for _ in range(45):
            if subprocess.run(['docker', 'exec', DB, 'pg_isready', '-U', 'stage_bootstrap'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        sql("CREATE ROLE postgres SUPERUSER LOGIN PASSWORD '" + password + "'; CREATE DATABASE _supabase OWNER postgres;")
        sql('CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '_supabase')
        sql("CREATE ROLE pgbouncer LOGIN PASSWORD '" + password + "'; CREATE ROLE fixture_workout LOGIN PASSWORD '" + password + "';"
            "CREATE SCHEMA pgbouncer; REVOKE ALL ON SCHEMA pgbouncer FROM PUBLIC; GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer;"
            "CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text,password text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT usename::text,passwd::text FROM pg_shadow WHERE usename=p_usename $$;"
            "REVOKE ALL ON FUNCTION pgbouncer.get_auth(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(text) TO pgbouncer;"
            "CREATE TABLE public.pool_fixture(id integer primary key); GRANT SELECT,INSERT ON public.pool_fixture TO fixture_workout;")
        created.append(POOL)
        if args.candidate == 'hardened':
            old = 'sha256:464b93a60ba8c96bc06dad7f241562d6613b2a994922307717b05f432ae415c2'
            start_pool(old)
            for _ in range(20):
                try:
                    if client('SELECT 1;') == '1':
                        break
                except RuntimeError:
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('Original image did not become SQL-ready')
            old_migrations = sql("SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM _supavisor.schema_migrations;", '_supabase')
            old_users = sql("SELECT md5(string_agg(row_to_json(u)::text,'|' ORDER BY id)) FROM _supavisor.users u;", '_supabase')
            run(['docker', 'rm', '-f', POOL])
        start_pool()
        inspected = json.loads(run(['docker', 'inspect', POOL]))[0]
        check('immutable_image', inspected['Image'] == image)
        check('no_published_ports', not inspected['HostConfig'].get('PortBindings'))
        if args.candidate == 'hardened':
            check('non_root_uid', run(['docker', 'exec', POOL, 'id', '-u']) == '65534')
            check('root_filesystem_readonly', inspected['HostConfig']['ReadonlyRootfs'])
            check('capabilities_dropped', inspected['HostConfig']['CapDrop'] == ['ALL'])
            check('pids_bounded', inspected['HostConfig']['PidsLimit'] == 256)
            status = run(['docker', 'exec', POOL, 'cat', '/proc/1/status'])
            fields = dict(line.split(':', 1) for line in status.splitlines() if ':' in line)
            check('effective_capabilities_zero', int(fields['CapEff'].strip(), 16) == 0)
            check('no_new_privileges_active', fields['NoNewPrivs'].strip() == '1')
            check('seccomp_filter_active', fields['Seccomp'].strip() == '2')
            rejected = subprocess.run(['docker', 'exec', POOL, 'touch', '/app/.audit-write-probe'], capture_output=True)
            check('application_write_rejected', rejected.returncode != 0)
            run(['docker', 'exec', POOL, 'sh', '-c', 'touch /tmp/.audit-write-probe && rm /tmp/.audit-write-probe'])
            check('temporary_write_allowed', True)
            check('upgrade_migrations_unchanged', old_migrations == sql("SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM _supavisor.schema_migrations;", '_supabase'))
            check('upgrade_encrypted_users_preserved', old_users == sql("SELECT md5(string_agg(row_to_json(u)::text,'|' ORDER BY id)) FROM _supavisor.users u;", '_supabase'))
        # Wait for the SQL endpoint as well as the HTTP health endpoint.
        for attempt in range(20):
            try:
                if client('SELECT 1;') == '1':
                    break
            except RuntimeError:
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Pool SQL endpoint did not become ready')
        check('sql_ready', True)
        check('transaction_select', client('SELECT 42;') == '42')
        check('session_select', client('SELECT 43;', 5432) == '43')
        check('transaction_write_rollback', client('BEGIN; INSERT INTO pool_fixture VALUES(1); ROLLBACK; SELECT count(*) FROM pool_fixture;').splitlines()[-1] == '0')
        check('transaction_write_commit', client('BEGIN; INSERT INTO pool_fixture VALUES(2); COMMIT; SELECT count(*) FROM pool_fixture;').splitlines()[-1] == '1')
        check('session_prepared_statement', client('PREPARE audit_stmt AS SELECT 44; EXECUTE audit_stmt; DEALLOCATE audit_stmt;', 5432).splitlines()[-1] == '44')
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            check('concurrent_clients', all(v == '45' for v in executor.map(lambda _: client('SELECT 45;'), range(12))))
        try:
            client('SELECT 1;', credential='incorrect-fixture-password')
        except RuntimeError:
            check('wrong_password_rejected', True)
        else:
            check('wrong_password_rejected', False)
        try:
            client('SELECT passwd FROM pg_shadow;')
        except RuntimeError:
            check('privileged_catalog_denied', True)
        else:
            check('privileged_catalog_denied', False)
        if args.candidate in ('dependencies', 'hardened'):
            # Plug adapter keeps the real Req/JIT helper entirely inside this fixture.
            code = '''
adapter = fn status, body -> fn conn ->
  ["Bearer fixture-token"] = Plug.Conn.get_req_header(conn, "authorization")
  {:ok, input, conn} = Plug.Conn.read_body(conn)
  %{"role" => "postgres", "rhost" => "127.0.0.1"} = Jason.decode!(input)
  conn |> Plug.Conn.put_resp_content_type("application/json") |> Plug.Conn.send_resp(status, Jason.encode!(body))
end end
call = fn status, body ->
  Supavisor.Helpers.check_user_has_jit_role("http://fixture.invalid", "fixture-token", "postgres", "127.0.0.1", plug: adapter.(status, body), retry: false)
end
tests = %{
  "jit_allowed" => call.(200, %{"user_role" => %{"role" => "postgres"}}) == {:ok, true},
  "jit_wrong_role" => call.(200, %{"user_role" => %{"role" => "other"}}) == {:ok, false},
  "jit_bad_body" => match?({:error, {:invalid_response_format, _}}, call.(200, %{})),
  "jit_unauthorized" => call.(401, %{}) == {:error, :unauthorized_or_forbidden},
  "jit_forbidden" => call.(403, %{}) == {:error, :unauthorized_or_forbidden},
  "jit_server_error" => call.(500, %{}) == {:error, {:unexpected_status, 500}}
}
defmodule WorkoutHeaderFixture do
  def init(req, mode) do
    headers = if mode == :invalid, do: %{"x-audit" => "ok\\r\\nx-injected: yes"}, else: %{"x-audit" => "ok"}
    {:ok, :cowboy_req.reply(200, headers, "ok", req), mode}
  end
end
dispatch = :cowboy_router.compile([{:_, [{"/valid", WorkoutHeaderFixture, :valid}, {"/invalid", WorkoutHeaderFixture, :invalid}]}])
{:ok, _} = :cowboy.start_clear(:workout_header_fixture, %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, 8088}]}, %{env: %{dispatch: dispatch}})
header_safe = try do
  {:ok, %Req.Response{status: 200}} = Req.get("http://127.0.0.1:8088/valid", retry: false)
  case Req.get("http://127.0.0.1:8088/invalid", retry: false) do
    {:ok, response} -> response.status in [400, 500] and not Map.has_key?(response.headers, "x-injected")
    {:error, %Req.TransportError{reason: reason}} -> reason in [:closed, :econnreset]
    _ -> false
  end
after
  :cowboy.stop_listener(:workout_header_fixture)
end
tests = Map.put(tests, "cowboy_rejects_header_injection", header_safe)
IO.puts("WORKOUT_JIT_CHECKS=" <> Jason.encode!(tests))
'''
            output = run(['docker', 'exec', POOL, '/app/bin/supavisor', 'rpc', code])
            line = next(line for line in output.splitlines() if line.startswith('WORKOUT_JIT_CHECKS='))
            for name, passed in json.loads(line.split('=', 1)[1]).items():
                check(name, passed)
        migrations = sql('SELECT md5(string_agg(version::text,\',\' ORDER BY version)) FROM _supavisor.schema_migrations;', '_supabase')
        run(['docker', 'rm', '-f', POOL])
        start_pool()
        check('restart_connection', client('SELECT count(*) FROM pool_fixture;') == '1')
        check('restart_no_new_migration', migrations == sql('SELECT md5(string_agg(version::text,\',\' ORDER BY version)) FROM _supavisor.schema_migrations;', '_supabase'))
        result = {'phase': 'functional_passed', 'image': image, 'checks': checks,
                  'image_scan_clear': image_scan_clear, 'application_dependency_review': 'pending',
                  'production_promotion': 'blocked'}
    finally:
        if POOL in created:
            logs = subprocess.run(['docker', 'logs', POOL], capture_output=True, text=True)
            (ROOT / 'validation-pool.log').write_text(logs.stdout + logs.stderr)
        for name in reversed(created):
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', NET], capture_output=True)
        env.unlink(missing_ok=True)
        cleanup = {
            'containers_removed': all(subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0 for name in created),
            'network_removed': subprocess.run(['docker', 'network', 'inspect', NET], capture_output=True).returncode != 0,
            'secret_file_removed': not env.exists(),
        }
        (ROOT / 'cleanup.json').write_text(json.dumps(cleanup, indent=2))
        (ROOT / 'validation-checks.json').write_text(json.dumps(checks, indent=2))
        assert all(cleanup.values()), 'Private fixture cleanup incomplete; inspect cleanup.json'
    (ROOT / 'validation.json').write_text(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
