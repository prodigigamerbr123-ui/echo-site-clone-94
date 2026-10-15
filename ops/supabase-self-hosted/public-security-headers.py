"""Dated, guarded Nginx header release; run as root on the Workout VM."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path('/home/ubuntu/workout-public-headers-20261015')
CONFIG = pathlib.Path('/opt/workout-supabase/public-gateway.conf')
NAME = 'workout-supabase-public'
QA = 'workout-public-headers-qa-20261015'
HEADERS = {
    'Strict-Transport-Security': 'max-age=15552000',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
}
os.umask(0o077)


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode:
        (ROOT / 'command-error.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect the private error log')
    return result.stdout


def inspect():
    return json.loads(run(['docker', 'inspect', NAME]))[0]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_headers(container, path, status):
    raw = run(['docker', 'exec', container, 'curl', '-sS', '--max-time', '10',
               '-D', '-', '-o', '/dev/null', 'http://127.0.0.1:8080' + path])
    lines = raw.splitlines()
    if int(lines[0].split()[1]) != status:
        raise RuntimeError('Unexpected HTTP status in header validation')
    received = {}
    for line in lines[1:]:
        if ':' in line:
            key, value = line.split(':', 1)
            received.setdefault(key.lower(), []).append(value.strip())
    for key, value in HEADERS.items():
        if received.get(key.lower()) != [value]:
            raise RuntimeError('Missing or duplicated response header: ' + key)


def prepare():
    if ROOT.exists():
        raise RuntimeError('Evidence directory already exists; inspect before retrying')
    ROOT.mkdir(mode=0o700)
    before = inspect()
    original = CONFIG.read_bytes()
    source = original.decode()
    if source.count('server {') != 1 or 'add_header' in source:
        raise RuntimeError('Unexpected gateway configuration; review inheritance manually')
    addition = ''.join(' add_header ' + key + ' "' + value + '" always;\n'
                       for key, value in HEADERS.items())
    updated = source.replace('server {', 'server {\n' + addition, 1).encode()
    (ROOT / 'before.conf').write_bytes(original)
    (ROOT / 'after.conf').write_bytes(updated)
    # No production upstream is reachable by this fixture, even accidentally.
    candidate = updated.decode().replace('http://api-gw:8000', 'http://127.0.0.1:65535')
    if 'api-gw' in candidate:
        raise RuntimeError('Unreplaced production upstream')
    candidate = candidate.replace('server {',
        'server {\n location = /header-fixture { return 200 "ok"; }', 1)
    fixture = ROOT / 'fixture.conf'
    fixture.write_text(candidate)
    fixture.chmod(0o644)
    if subprocess.run(['docker', 'inspect', QA], capture_output=True).returncode == 0:
        raise RuntimeError('QA container already exists')
    try:
        run(['docker', 'run', '-d', '--name', QA, '--network', 'none', '--read-only',
             '--user', '101:101',
             '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
             '--tmpfs', '/tmp:rw,nosuid,nodev', '--tmpfs', '/var/cache/nginx:rw,nosuid,nodev,uid=101,gid=101',
             '--tmpfs', '/var/run:rw,nosuid,nodev,uid=101,gid=101', '-v',
             str(fixture) + ':/etc/nginx/conf.d/default.conf:ro', before['Image']])
        for attempt in range(20):
            try:
                verify_headers(QA, '/header-fixture', 200)
                break
            except RuntimeError:
                if attempt == 19:
                    raise
                time.sleep(0.2)
        run(['docker', 'exec', QA, 'nginx', '-t'])
        verify_headers(QA, '/project/default', 404)
        verify_headers(QA, '/auth/v1/health', 502)
    finally:
        logs = subprocess.run(['docker', 'logs', QA], capture_output=True, text=True)
        (ROOT / 'fixture.log').write_text(logs.stdout + logs.stderr)
        run(['docker', 'rm', '-f', QA])
    state = {'container_id': before['Id'], 'image_id': before['Image'],
             'before_sha256': digest(original), 'after_sha256': digest(updated),
             'isolated_checks': ['200_headers', '404_headers', '502_headers', 'nginx_config'],
             'fixture_removed': True}
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))
    print(json.dumps(state))


def apply(rollback=False):
    state = json.loads((ROOT / 'state.json').read_text())
    before = inspect()
    if before['Id'] != state['container_id'] or before['Image'] != state['image_id']:
        raise RuntimeError('Container changed since validation')
    old, new = ('after', 'before') if rollback else ('before', 'after')
    if digest(CONFIG.read_bytes()) != state[old + '_sha256']:
        raise RuntimeError('Configuration changed; refusing to overwrite')
    target = (ROOT / (new + '.conf')).read_bytes()
    if digest(target) != state[new + '_sha256']:
        raise RuntimeError('Release artifact changed')
    # Keep the inode: this file is already bind-mounted into the running container.
    CONFIG.write_bytes(target)
    try:
        run(['docker', 'exec', NAME, 'nginx', '-t'])
        run(['docker', 'exec', NAME, 'nginx', '-s', 'reload'])
        if not rollback:
            for attempt in range(20):
                try:
                    verify_headers(NAME, '/project/default', 404)
                    verify_headers(NAME, '/auth/v1/health', 401)
                    break
                except RuntimeError:
                    if attempt == 19:
                        raise
                    time.sleep(0.2)
    except Exception:
        CONFIG.write_bytes((ROOT / (old + '.conf')).read_bytes())
        run(['docker', 'exec', NAME, 'nginx', '-t'])
        run(['docker', 'exec', NAME, 'nginx', '-s', 'reload'])
        raise
    if inspect()['Id'] != before['Id']:
        raise RuntimeError('Unexpected container recreation')
    state['rolled_back' if rollback else 'applied'] = True
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))
    print(json.dumps({'rollback': rollback, 'configuration_verified': True,
                      'container_preserved': True, 'sha256': digest(CONFIG.read_bytes())}))


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare()
    elif sys.argv[1] in ('apply', 'rollback'):
        apply(sys.argv[1] == 'rollback')
    else:
        raise SystemExit('Use prepare, apply or rollback')
