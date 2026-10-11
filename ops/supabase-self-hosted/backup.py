#!/usr/bin/env python3
"""Run as root on the Workout VM; archives contain secrets and personal data."""
import datetime
import json
import os
import pathlib
import pwd
import shutil
import subprocess

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
    capture(['docker', 'exec', DB, 'pg_dumpall', '-U', 'supabase_admin',
             '--roles-only'], folder / 'roles.sql')
    capture(['tar', '-czf', '-', '-C', str(STACK), '.env', '.env.functions',
             'docker-compose.yml', 'public-gateway.conf', '.supabase-version',
             'volumes/functions', 'volumes/storage'], folder / 'runtime.tar.gz')
    capture(['docker', 'exec', DB, 'tar', '-czf', '-', '-C', '/etc',
             'postgresql-custom'], folder / 'database-config.tar.gz')
    # Validate the archive catalog without restoring over production.
    with (folder / 'database.dump').open('rb') as source:
        result = subprocess.run(['docker', 'exec', '-i', DB, 'pg_restore', '-l'],
                                stdin=source, stdout=subprocess.DEVNULL,
                                stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Unreadable database archive')
    manifest = {'created_utc': stamp, 'files': {
        f.name: f.stat().st_size for f in folder.iterdir() if f.is_file()
    }}
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
