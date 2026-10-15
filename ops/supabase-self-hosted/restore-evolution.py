"""Offline data/configuration recovery check; never starts Evolution or connects WhatsApp."""
import hashlib
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import time

from evolution_backup import table_counts

ROOT = pathlib.Path('/home/ubuntu/workout-evolution-restore-20261015')
NAME = 'workout-evolution-restore-20261015-db'
USER = 'restore_bootstrap'
os.umask(0o077)


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, timeout=180)
    if result.returncode:
        (ROOT / 'command-error.log').write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Recovery command failed; inspect private evidence')
    return result.stdout


def sql(query, database='restore_catalog'):
    return run(['docker', 'exec', '-i', NAME, 'psql', '-X', '-U', USER, '-d', database,
                '-qAt', '-v', 'ON_ERROR_STOP=1'], query.encode()).decode().strip()


def main(archive, database_image=None):
    if ROOT.exists():
        raise RuntimeError('Recovery directory exists; preserve evidence before retrying')
    if subprocess.run(['docker', 'inspect', NAME], capture_output=True).returncode == 0:
        raise RuntimeError('Recovery container exists')
    ROOT.mkdir(mode=0o700)
    source = pathlib.Path(archive)
    with tarfile.open(source) as package:
        members = [m for m in package.getmembers() if m.name == 'evolution' or m.name.startswith('evolution/')]
        if not members or any(not (m.isdir() or m.isfile()) for m in members):
            raise RuntimeError('Unexpected archive entry')
        for member in members:
            if not (ROOT / member.name).resolve().is_relative_to(ROOT.resolve()):
                raise RuntimeError('Archive entry escapes recovery directory')
        package.extractall(ROOT, members=members, filter='data')
    metadata = json.loads((ROOT / 'evolution/metadata.json').read_text())
    if database_image:
        import re
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', database_image):
            raise RuntimeError('Candidate database requires an immutable local image ID')
        run(['docker', 'image', 'inspect', database_image])
        metadata['postgres_image'] = database_image
    if metadata['format'] != 1 or not metadata['dbdata_empty']:
        raise RuntimeError('Unsupported recovery format')
    configs = json.loads((ROOT / 'evolution/containers.json').read_text())
    if {c['name'] for c in configs} != {
            'evolution-go', 'evolution-postgres', 'evolution-api-gateway', 'evolution-cloudflared'}:
        raise RuntimeError('Missing runtime configuration')
    required = ['roles.sql', 'deployment/credentials.env', 'deployment/tunnel.yml',
                'deployment/proxy/default.conf']
    if not all((ROOT / 'evolution' / name).is_file() for name in required):
        raise RuntimeError('Missing deployment artifacts')
    evidence = {'source_sha256': hashlib.file_digest(source.open('rb'), 'sha256').hexdigest(),
                'databases': [], 'configuration_files_present': True,
                'provider_started': False, 'network': 'none'}
    created = False
    data_directory = ROOT / 'pgdata'
    data_directory.mkdir(mode=0o700)
    try:
        run(['docker', 'run', '-d', '--name', NAME, '--network', 'none',
             '--memory', '1g', '--cpus', '1', '--pids-limit', '256',
             '-v', str(data_directory) + ':/var/lib/postgresql/data',
             '-e', 'POSTGRES_USER=' + USER, '-e', 'POSTGRES_DB=restore_catalog',
             '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', metadata['postgres_image'],
             'postgres', '-c', 'shared_preload_libraries=', '-c', 'max_worker_processes=0'])
        created = True
        for attempt in range(60):
            ready = subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-U', USER,
                                    '-d', 'restore_catalog'], capture_output=True)
            if ready.returncode == 0:
                break
            if attempt == 59:
                raise RuntimeError('Recovery PostgreSQL did not start')
            time.sleep(0.5)
        state = json.loads(run(['docker', 'inspect', NAME]))[0]
        if state['HostConfig']['NetworkMode'] != 'none' or state['HostConfig']['PortBindings']:
            raise RuntimeError('Recovery is not isolated')
        for index, database in enumerate(metadata['databases']):
            name = 'recovery_' + str(index)
            sql('CREATE DATABASE ' + name + ';')
            dump = ROOT / 'evolution' / database['file']
            if dump.parent != ROOT / 'evolution' or dump.suffix != '.dump':
                raise RuntimeError('Unexpected dump path')
            run(['docker', 'exec', '-i', NAME, 'pg_restore', '-U', USER, '-d', name,
                 '--no-owner', '--no-privileges', '--exit-on-error'], dump.read_bytes())
            counts = table_counts(USER, name, NAME)
            if not database['counts_stable'] or counts != database['counts_before']:
                raise RuntimeError('Recovered row counts differ from the stable backup baseline')
            evidence['databases'].append({'tables': len(counts), 'rows': sum(counts.values()),
                                          'counts_match': True})
            if sql("SELECT count(*) FROM pg_extension WHERE extname IN ('pg_cron','pg_net')", name) != '0':
                raise RuntimeError('Unexpected background extension')
        run(['docker', 'restart', NAME])
        for attempt in range(60):
            if subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-U', USER,
                               '-d', 'restore_catalog'], capture_output=True).returncode == 0:
                break
            if attempt == 59:
                raise RuntimeError('Recovery restart failed')
            time.sleep(0.5)
        for index, database in enumerate(metadata['databases']):
            if table_counts(USER, 'recovery_' + str(index), NAME) != database['counts_before']:
                raise RuntimeError('Recovered data changed across restart')
        evidence['restart_verified'] = True
        evidence['success'] = True
    finally:
        if created:
            run(['docker', 'rm', '-f', NAME])
            evidence['container_removed'] = subprocess.run(
                ['docker', 'inspect', NAME], capture_output=True).returncode != 0
            if data_directory.resolve().parent != ROOT.resolve() or data_directory.is_symlink():
                raise RuntimeError('Refusing unexpected temporary data path')
            shutil.rmtree(data_directory)
            evidence['temporary_database_removed'] = True
        (ROOT / 'result.json').write_text(json.dumps(evidence, indent=2))
    print(json.dumps(evidence))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    parser.add_argument('attempt', type=int, nargs='?')
    parser.add_argument('--database-image')
    options = parser.parse_args()
    if options.attempt is not None:
        attempt = options.attempt
        if not 1 <= attempt <= 999:
            raise SystemExit('Attempt must be between 1 and 999')
        ROOT = ROOT.with_name(ROOT.name + '-attempt-' + str(attempt))
        NAME += '-' + str(attempt)
    main(options.archive, options.database_image)
