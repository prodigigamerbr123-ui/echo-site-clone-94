#!/usr/bin/env python3
"""Run as root on the Workout VM; archives contain secrets and personal data."""
import datetime
import hashlib
import json
import os
import pathlib
import pwd
import shutil
import subprocess
import tarfile
import tempfile

from evolution_backup import backup_evolution

ROOT = pathlib.Path('/home/ubuntu/workout-backups')
STACK = pathlib.Path('/opt/workout-supabase')
DB = 'workout-supabase-db'


def capture(args, destination):
    with destination.open('wb') as out:
        os.chmod(destination, 0o600)
        result = subprocess.run(args, stdout=out, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Backup failed: ' + destination.name)


def main():
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    user = pwd.getpwnam('ubuntu')
    os.chown(ROOT, user.pw_uid, user.pw_gid)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder = ROOT / stamp
    folder.mkdir(mode=0o700)
    capture(['docker', 'exec', DB, 'pg_dump', '-U', 'supabase_admin', '-d',
             'postgres', '-Fc'], folder / 'database.dump')
    capture(['docker', 'exec', DB, 'pg_dump', '-U', 'supabase_admin', '-d',
             '_supabase', '-Fc'], folder / 'pooler.dump')
    capture(['docker', 'exec', DB, 'pg_dumpall', '-U', 'supabase_admin',
             '--roles-only'], folder / 'roles.sql')
    cache = pathlib.Path(subprocess.check_output([
        'docker', 'inspect', '--format',
        '{{range .Mounts}}{{if eq .Destination "/root/.cache/deno"}}{{.Source}}{{end}}{{end}}',
        'workout-supabase-edge-functions'], text=True).strip())
    expected_cache = pathlib.Path('/var/lib/docker/volumes/workout-supabase_deno-cache/_data')
    if cache.resolve() != expected_cache or not cache.is_dir():
        raise RuntimeError('Review unexpected Edge dependency cache mount before backup')
    with tempfile.TemporaryDirectory(prefix='workout-evolution-backup-', dir='/home/ubuntu') as temporary:
        backup_evolution(pathlib.Path(temporary))
        capture(['tar', '-czf', '-', '-C', str(STACK), '.env', '.env.functions',
                 'docker-compose.yml', 'public-gateway.conf', '.supabase-version',
                 'volumes/functions', 'volumes/storage', 'volumes/pooler',
                 'volumes/api/envoy', '--transform=s,^_data,volumes/deno-cache,',
                 '-C', str(cache.parent), cache.name, '-C', temporary, 'evolution'],
                folder / 'runtime.tar.gz')
    capture(['docker', 'exec', DB, 'tar', '-czf', '-', '-C', '/etc',
             'postgresql-custom'], folder / 'database-config.tar.gz')
    # Validate the archive catalog without restoring over production.
    for name in ('database.dump', 'pooler.dump'):
        with (folder / name).open('rb') as source:
            result = subprocess.run(['docker', 'exec', '-i', DB, 'pg_restore', '-l'],
                                    stdin=source, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Unreadable database archive: ' + name)
    with tarfile.open(folder / 'runtime.tar.gz') as runtime:
        members = set(runtime.getnames())
    required = {'volumes/pooler/pooler.exs', 'volumes/api/envoy/envoy.yaml',
                'volumes/api/envoy/cds.yaml', 'volumes/api/envoy/lds.template.yaml',
                'volumes/api/envoy/docker-entrypoint.sh',
                'volumes/functions/deno.jsonc', 'volumes/functions/main/index.ts'}
    if not required.issubset(members):
        raise RuntimeError('Runtime archive is missing required pooler/gateway configuration')
    if not any(name.startswith('volumes/deno-cache/') for name in members):
        raise RuntimeError('Runtime archive is missing Edge dependency cache')
    if not {'evolution/metadata.json', 'evolution/containers.json', 'evolution/roles.sql',
            'evolution/deployment/credentials.env', 'evolution/deployment/tunnel.yml',
            'evolution/database-0.dump'}.issubset(members):
        raise RuntimeError('Runtime archive is missing Evolution databases/configuration')
    files = sorted(f for f in folder.iterdir() if f.is_file())
    checksums = {}
    for item in files:
        with item.open('rb') as source:
            checksums[item.name] = hashlib.file_digest(source, 'sha256').hexdigest()
    manifest = {'created_utc': stamp, 'evolution_backup_format': 1,
                'files': {f.name: f.stat().st_size for f in files},
                'sha256': checksums}
    (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    (folder / 'complete').write_text('true\n')
    for item in [folder, *folder.iterdir()]:
        os.chown(item, user.pw_uid, user.pw_gid)
    (ROOT / 'latest').write_text(stamp + '\n')
    os.chown(ROOT / 'latest', user.pw_uid, user.pw_gid)
    # Keep fourteen complete snapshots. Failed snapshots remain for diagnosis.
    folders = sorted(f for f in ROOT.iterdir()
                     if f.is_dir() and (f / 'complete').exists())
    for old in folders[:-14]:
        assert old.resolve().parent == ROOT.resolve()
        shutil.rmtree(old)
    print('Workout backup complete: ' + stamp)


if __name__ == '__main__':
    main()
