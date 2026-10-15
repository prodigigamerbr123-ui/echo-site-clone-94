"""Restore only the pooler metadata backup in a disposable networkless PostgreSQL."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import time

ROOT = pathlib.Path('/home/ubuntu/workout-pooler-runtime-20261014')
NAME = 'workout-pooler-restore-20261014-db'
FINGERPRINT = """SELECT json_build_object(
'users',(SELECT count(*) FROM _supavisor.users),
'tenants',(SELECT count(*) FROM _supavisor.tenants),
'migrations',(SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM _supavisor.schema_migrations),
'users_digest',(SELECT md5(string_agg(row_to_json(u)::text,'|' ORDER BY id)) FROM _supavisor.users u),
'tenants_digest',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM _supavisor.tenants t));"""
os.umask(0o077)


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        (ROOT / 'metadata-restore-error.log').write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Restore command failed; inspect private metadata-restore-error.log')
    return result.stdout


def main():
    global ROOT, NAME
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stamp')
    parser.add_argument('--scope', choices=['runtime', 'roles'], default='runtime')
    args = parser.parse_args()
    if args.scope == 'roles':
        ROOT = pathlib.Path('/home/ubuntu/workout-pooler-roles-restore-20261014')
        NAME = 'workout-pooler-roles-restore-20261014-db'
        ROOT.mkdir(mode=0o700, exist_ok=True)
    stamp = args.stamp
    assert re.fullmatch(r'\d{8}T\d{6}Z', stamp)
    backup = pathlib.Path('/home/ubuntu/workout-backups') / stamp
    assert (backup / 'complete').exists()
    dump = backup / 'pooler.dump'
    assert not (ROOT / 'metadata-restore.json').exists()
    assert subprocess.run(['docker', 'inspect', NAME], capture_output=True).returncode != 0
    before = json.loads(run(['docker', 'exec', 'workout-supabase-db', 'psql', '-U',
                             'supabase_admin', '-d', '_supabase', '-Atq', '-c', FINGERPRINT]))
    created = False
    try:
        run(['docker', 'run', '-d', '--name', NAME, '--network', 'none', '--memory', '512m',
             '--cpus', '1', '--tmpfs', '/tmp:rw,size=512m,mode=1777', '--user', 'postgres',
             '--entrypoint', 'bash', 'supabase/postgres:17.6.1.136', '-c',
             "initdb -D /tmp/metadata -U pool_restore_bootstrap --auth-local=trust >/tmp/init.log 2>&1 && exec postgres -D /tmp/metadata -c listen_addresses='' -c shared_preload_libraries="])
        created = True
        for _ in range(45):
            if subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-U', 'pool_restore_bootstrap'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Disposable PostgreSQL not ready')
        roles = run(['docker', 'exec', 'workout-supabase-db', 'pg_dumpall', '-U',
                     'supabase_admin', '--roles-only', '--no-role-passwords'])
        roles = re.sub(rb' GRANTED BY \w+', b'', roles)
        run(['docker', 'exec', '-i', NAME, 'psql', '-U', 'pool_restore_bootstrap', '-d',
             'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'], roles)
        run(['docker', 'exec', NAME, 'createdb', '-U', 'pool_restore_bootstrap', '-O', 'postgres', '_supabase'])
        run(['docker', 'exec', '-i', NAME, 'pg_restore', '-U', 'pool_restore_bootstrap',
             '-d', '_supabase', '--exit-on-error'], dump.read_bytes())
        restored = json.loads(run(['docker', 'exec', NAME, 'psql', '-U', 'pool_restore_bootstrap',
                                  '-d', '_supabase', '-Atq', '-c', FINGERPRINT]))
        assert before == restored, 'Restored metadata differs from live read-only fingerprint'
        state = {'phase': 'passed', 'backup_stamp': stamp,
                 'dump_sha256': hashlib.sha256(dump.read_bytes()).hexdigest(),
                 'fingerprints_equal': True, 'users': restored['users'], 'tenants': restored['tenants'],
                 'migrations_digest': restored['migrations'], 'network': 'none',
                 'production_role_passwords_copied': False, 'application_workers_started': False}
    finally:
        if created:
            subprocess.run(['docker', 'rm', '-f', NAME], capture_output=True)
        removed = subprocess.run(['docker', 'inspect', NAME], capture_output=True).returncode != 0
        (ROOT / 'metadata-restore-cleanup.json').write_text(json.dumps({'container_removed': removed}))
        assert removed, 'Metadata fixture cleanup failed'
    (ROOT / 'metadata-restore.json').write_text(json.dumps(state, indent=2))


if __name__ == '__main__':
    main()
