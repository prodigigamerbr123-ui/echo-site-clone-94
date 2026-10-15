"""Private Evolution database/configuration snapshot, embedded in runtime.tar.gz.

This never starts Evolution or sends messages. Run only on the named Workout VM.
"""
import json
import os
import pathlib
import shutil
import subprocess


NAMES = ('evolution-go', 'evolution-postgres', 'evolution-api-gateway', 'evolution-cloudflared')
DEPLOYMENT = pathlib.Path('/home/ubuntu/evolution-go')
DATA = pathlib.Path('/var/lib/docker/volumes/evolution_data/_data')


def output(args, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=180)
    if result.returncode:
        # Tool errors can include database connection credentials; never echo them.
        raise RuntimeError('Evolution backup command failed; no complete snapshot published')
    return result.stdout


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def table_counts(user, database, container='evolution-postgres'):
    prefix = ['docker', 'exec', '-i', container, 'psql', '-X', '-U', user,
              '-d', database, '-qAt', '-v', 'ON_ERROR_STOP=1']
    query = ("SELECT coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename)), '[]') "
             "FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")
    tables = json.loads(output(prefix, query.encode()))
    statements = []
    for schema, table in tables:
        qualified = identifier(schema) + '.' + identifier(table)
        # Table names are read from trusted catalogs, quoted as both identifier and literal.
        literal = qualified.replace("'", "''")
        statements.append("SELECT jsonb_build_object('table','" + literal +
                          "','rows',count(*)) FROM " + qualified + ';')
    if not statements:
        return {}
    rows = output(prefix, ('BEGIN READ ONLY;\n' + '\n'.join(statements) + '\nCOMMIT;').encode())
    parsed = [json.loads(line) for line in rows.splitlines()]
    return {row['table']: row['rows'] for row in parsed}


def backup_evolution(parent):
    os.umask(0o077)
    root = parent / 'evolution'
    root.mkdir(mode=0o700)
    inspected = json.loads(output(['docker', 'inspect', *NAMES]))
    by_name = {item['Name'].lstrip('/'): item for item in inspected}
    mounts = {m['Destination']: pathlib.Path(m['Source']) for m in by_name['evolution-go']['Mounts']}
    if mounts.get('/app/dbdata') != DATA or not DATA.is_dir():
        raise RuntimeError('Review unexpected Evolution data mount')
    # Current deployment stores authentication/users in PostgreSQL. Do not silently
    # copy live SQLite files if a future provider version changes that arrangement.
    if any(DATA.iterdir()):
        raise RuntimeError('Evolution data volume changed; review its consistent backup procedure')
    (root / 'dbdata').mkdir()
    runtime = [{
        'name': name, 'image_id': by_name[name]['Image'],
        'config': by_name[name]['Config'], 'host_config': by_name[name]['HostConfig'],
        'mounts': by_name[name]['Mounts'],
        'networks': list(by_name[name]['NetworkSettings']['Networks']),
    } for name in NAMES]
    # Contains tokens/passwords/license settings. Only the private archive may hold this.
    (root / 'containers.json').write_text(json.dumps(runtime, indent=2))
    deployment = root / 'deployment'
    deployment.mkdir()
    for name in ('credentials.env', 'tunnel.yml', 'proxy', 'cloudflared'):
        source = DEPLOYMENT / name
        if source.resolve().parent != DEPLOYMENT.resolve() or source.is_symlink():
            raise RuntimeError('Unexpected Evolution deployment source')
        if source.is_dir():
            if any(p.is_symlink() for p in source.rglob('*')):
                raise RuntimeError('Review symlinks in Evolution configuration')
            shutil.copytree(source, deployment / name)
        else:
            shutil.copyfile(source, deployment / name)
    environment = dict(item.split('=', 1) for item in by_name['evolution-postgres']['Config']['Env'])
    user = environment.get('POSTGRES_USER', 'postgres')
    databases = json.loads(output(['docker', 'exec', 'evolution-postgres', 'psql', '-X',
        '-U', user, '-d', 'postgres', '-qAtc',
        "SELECT jsonb_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate"]))
    (root / 'roles.sql').write_bytes(output(['docker', 'exec', 'evolution-postgres',
        'pg_dumpall', '-U', user, '--roles-only']))
    image = json.loads(output(['docker', 'image', 'inspect', by_name['evolution-postgres']['Image']]))[0]
    metadata = {'format': 1, 'postgres_image': by_name['evolution-postgres']['Image'],
                'postgres_reference': by_name['evolution-postgres']['Config']['Image'],
                'postgres_repo_digests': image.get('RepoDigests', []),
                'databases': [], 'dbdata_empty': True,
                'cross_database_atomic_snapshot': False}
    for index, database in enumerate(databases):
        before = table_counts(user, database)
        filename = 'database-' + str(index) + '.dump'
        (root / filename).write_bytes(output(['docker', 'exec', 'evolution-postgres',
            'pg_dump', '-U', user, '-d', database, '-Fc', '--no-owner', '--no-privileges']))
        output(['docker', 'exec', '-i', 'evolution-postgres', 'pg_restore', '-l'],
               (root / filename).read_bytes())
        after = table_counts(user, database)
        metadata['databases'].append({'name': database, 'file': filename,
            'counts_before': before, 'counts_after': after, 'counts_stable': before == after})
    (root / 'metadata.json').write_text(json.dumps(metadata, indent=2))
    return metadata
