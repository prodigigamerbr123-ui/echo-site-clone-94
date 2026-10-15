"""Guarded dated runtime release. Private build-state/configuration stay on VM.

Usage: release.py prepare BACKUP_STAMP | apply | observe | rollback
Never restores a database or sends messages. Only reviewed local candidate IDs.
"""
import copy
import hashlib
import http.client
import json
import os
import pathlib
import socket
import subprocess
import sys
import time

import yaml

os.umask(0o077)
ROOT = pathlib.Path('/home/ubuntu/workout-remaining-runtime-20261015')
STACK = pathlib.Path('/opt/workout-supabase')
COMPOSE = STACK / 'docker-compose.yml'
STATE = ROOT / 'release-state.json'
OLD_EVOLUTION = 'evolution-postgres-before-security1-20261015'
SERVICES = {'database': 'db', 'edge': 'functions', 'realtime': 'realtime'}
FINGERPRINT = """SELECT jsonb_build_object(
 'students',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM students t),
 'evaluations',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM evaluations t),
 'templates',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM predefined_messages t),
 'passwords',(SELECT md5(string_agg(id::text||encrypted_password,'|' ORDER BY id)) FROM auth.users),
 'functions',(SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.oid))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')),
 'messages',(SELECT count(*) FROM messages), 'queue',(SELECT count(*) FROM scheduled_messages));"""


def run(args, data=None, timeout=180):
    p = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    if p.returncode:
        (ROOT / 'release-command-error.log').write_bytes(p.stdout + p.stderr)
        raise RuntimeError('Release command failed; inspect private evidence')
    return p.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def sql(statement):
    return run(['docker', 'exec', '-i', 'workout-supabase-db', 'psql', '-X', '-U',
        'supabase_admin', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], statement.encode()).decode().strip()


def compose(path, args):
    return run(['docker', 'compose', '--project-directory', str(STACK), '--project-name',
        'workout-supabase', '--env-file', str(STACK / '.env'), '-f', str(path), '--profile', 'admin', *args])


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(state):
    STATE.write_text(json.dumps(state, indent=2))


def wait(name):
    for _ in range(90):
        c = inspect(name)
        if c['State']['Running'] and c['State'].get('Health', {}).get('Status', 'healthy') == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Container not healthy: ' + name)


class DockerSocket(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')


def create_evolution(original, image):
    create_container(original, image, 'evolution-postgres')


def create_container(original, image, name):
    body = copy.deepcopy(original['Config'])
    body.update(Image=image, Hostname='', HostConfig=original['HostConfig'])
    body['NetworkingConfig'] = {'EndpointsConfig': {
        net: {'Aliases': [a for a in details.get('Aliases') or [] if a != original['Id'][:12]]}
        for net, details in original['NetworkSettings']['Networks'].items()}}
    connection = DockerSocket('localhost', timeout=30)
    connection.request('POST', '/v1.47/containers/create?name=' + name,
        body=json.dumps(body), headers={'Content-Type': 'application/json'})
    response = connection.getresponse()
    if response.status != 201:
        (ROOT / 'docker-create-error.json').write_bytes(response.read())
        raise RuntimeError('Replacement container could not be created')
    response.read()
    connection.close()


def prepare(stamp):
    if STATE.exists():
        raise RuntimeError('Release state already exists; preserve it')
    folder = pathlib.Path('/home/ubuntu/workout-backups') / stamp
    if folder.resolve().parent != pathlib.Path('/home/ubuntu/workout-backups').resolve():
        raise RuntimeError('Unexpected backup path')
    manifest = json.loads((folder / 'manifest.json').read_text())
    assert manifest['created_utc'] == stamp and (folder / 'complete').read_text().strip() == 'true'
    for name, checksum in manifest['sha256'].items():
        assert pathlib.Path(name).name == name and digest(folder / name) == checksum
    assert sql("SELECT count(*) FROM scheduled_messages WHERE status IN ('pending','processing');") == '0'
    build = {r['kind']: r for r in json.loads((ROOT / 'build-state.json').read_text()) if r['container']}
    for item in build.values():
        assert inspect(item['container'])['Image'] == item['before']
        run(['docker', 'image', 'inspect', item['image']])
    assert all(json.loads((ROOT / 'binary-checks.json').read_text()).values())
    restore = json.loads(pathlib.Path('/home/ubuntu/workout-integrated-restore-20261015/attempt-7/state.json').read_text())
    assert restore['phase'] == 'passed' and all(restore['checks'].values()) and all(restore['cleanup'].values())
    assert json.loads((ROOT / 'realtime-validation.json').read_text())['tenant_health_http']
    assert json.loads(pathlib.Path('/home/ubuntu/workout-evolution-restore-20261015-attempt-3/result.json').read_text())['temporary_database_removed']
    raw = yaml.safe_load(COMPOSE.read_text())
    before = json.loads(compose(COMPOSE, ['config', '--format', 'json']))
    wanted = copy.deepcopy(before)
    for kind, service in SERVICES.items():
        raw['services'][service]['image'] = build[kind]['image']
        wanted['services'][service]['image'] = build[kind]['image']
    candidate = ROOT / 'compose.candidate.yml'
    candidate.write_text(yaml.safe_dump(raw, sort_keys=False))
    assert json.loads(compose(candidate, ['config', '--format', 'json'])) == wanted
    original = inspect('evolution-postgres')
    (ROOT / 'evolution-container.before.json').write_text(json.dumps(original))
    (ROOT / 'compose.before.yml').write_bytes(COMPOSE.read_bytes())
    state = {'backup_stamp': stamp, 'before_sha256': digest(COMPOSE), 'after_sha256': digest(candidate),
        'build': build, 'fingerprint': json.loads(sql(FINGERPRINT)), 'prepared': True,
        'original_evolution_id': original['Id'], 'applied': False}
    save(state)
    print(json.dumps({'prepared': True, 'backup': stamp, 'only_four_images_change': True}))


def observe(state):
    checks = {'compose_expected': digest(COMPOSE) == state['after_sha256'],
        'data_passwords_functions_preserved': json.loads(sql(FINGERPRINT)) == state['fingerprint']}
    for item in state['build'].values():
        wait(item['container'])
        checks[item['kind'] + '_image'] = inspect(item['container'])['Image'] == item['image']
    original = json.loads((ROOT / 'evolution-container.before.json').read_text())
    current = inspect('evolution-postgres')
    checks['evolution_data_mounts_preserved'] = sorted((m['Source'], m['Destination']) for m in current['Mounts']) == sorted((m['Source'], m['Destination']) for m in original['Mounts'])
    checks['evolution_environment_preserved'] = current['Config']['Env'] == original['Config']['Env']
    checks['evolution_restart_policy_preserved'] = current['HostConfig']['RestartPolicy'] == original['HostConfig']['RestartPolicy']
    p = subprocess.run(['python3', '/home/ubuntu/workout-operational-health-20261015.py'], capture_output=True)
    health = json.loads(p.stdout)
    checks['operational_health'] = p.returncode == 0 and not health['alerts']
    (ROOT / 'production-health.json').write_text(json.dumps(health, indent=2))
    (ROOT / 'production-checks.json').write_text(json.dumps(checks, indent=2))
    if not all(checks.values()):
        raise RuntimeError('Post-release validation failed')
    state['observed'] = True
    save(state)
    print(json.dumps({'checks': checks, 'operational_checks': len(health['checks']), 'real_sends': False}))


def rollback(state):
    if digest(COMPOSE) != state['after_sha256']:
        raise RuntimeError('Compose changed after release; rollback requires review')
    for item in state['build'].values():
        exists = subprocess.run(['docker', 'inspect', item['container']], capture_output=True).returncode == 0
        if not exists and item['kind'] == 'evolution-database':
            if subprocess.run(['docker', 'inspect', OLD_EVOLUTION], capture_output=True).returncode == 0:
                continue
        if not exists:
            raise RuntimeError('Required container missing; rollback requires review')
        if inspect(item['container'])['Image'] not in (item['image'], item['before']):
            raise RuntimeError('Unexpected image; rollback requires review')
    previous = ROOT / 'compose.before.yml'
    assert digest(previous) == state['before_sha256']
    COMPOSE.write_bytes(previous.read_bytes())
    for kind, service in SERVICES.items():
        compose(COMPOSE, ['up', '-d', '--no-deps', service])
        wait(state['build'][kind]['container'])
    if subprocess.run(['docker', 'inspect', OLD_EVOLUTION], capture_output=True).returncode == 0:
        old = inspect(OLD_EVOLUTION)
        assert old['Id'] == state['original_evolution_id']
        if subprocess.run(['docker', 'inspect', 'evolution-postgres'], capture_output=True).returncode == 0:
            run(['docker', 'rm', '-f', 'evolution-postgres'])
        run(['docker', 'rename', OLD_EVOLUTION, 'evolution-postgres'])
        original = json.loads((ROOT / 'evolution-container.before.json').read_text())
        run(['docker', 'update', '--restart='+original['HostConfig']['RestartPolicy']['Name'], 'evolution-postgres'])
        run(['docker', 'start', 'evolution-postgres'])
        wait('evolution-postgres')
    state['rolled_back'] = True
    save(state)
    print(json.dumps({'rolled_back': True, 'database_restored': False}))


def apply(state):
    assert not state['applied'] and digest(COMPOSE) == state['before_sha256']
    assert json.loads(sql(FINGERPRINT)) == state['fingerprint']
    for item in state['build'].values():
        assert inspect(item['container'])['Image'] == item['before']
    assert subprocess.run(['docker', 'inspect', OLD_EVOLUTION], capture_output=True).returncode != 0
    COMPOSE.write_bytes((ROOT / 'compose.candidate.yml').read_bytes())
    try:
        for kind, service in SERVICES.items():
            compose(COMPOSE, ['up', '-d', '--no-deps', service])
            wait(state['build'][kind]['container'])
        original = json.loads((ROOT / 'evolution-container.before.json').read_text())
        run(['docker', 'stop', '--time', '60', 'evolution-postgres'])
        run(['docker', 'rename', 'evolution-postgres', OLD_EVOLUTION])
        run(['docker', 'update', '--restart=no', OLD_EVOLUTION])
        create_evolution(original, state['build']['evolution-database']['image'])
        run(['docker', 'start', 'evolution-postgres'])
        wait('evolution-postgres')
        state['applied'] = True
        save(state)
        # Allow clients to reconnect; no worker invocation or message replay.
        time.sleep(10)
        observe(state)
    except Exception:
        rollback(state)
        raise


if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'prepare':
        prepare(sys.argv[2])
    else:
        state = json.loads(STATE.read_text())
        {'apply': apply, 'observe': observe, 'rollback': rollback}[action](state)
