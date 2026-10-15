"""Dated tunnel update, preserving routes/credentials and a stopped return image.

prepare starts a second connector of the existing tunnel; apply switches names
only after readiness. No new tunnel, route, credential or permission is created.
"""
import copy
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import time

os.umask(0o077)
ROOT = pathlib.Path('/home/ubuntu/workout-remaining-runtime-20261015')
STATE = ROOT / 'cloudflared-release.json'
NAME = 'evolution-cloudflared'
QA = 'evolution-cloudflared-candidate-20261015'
OLD = 'evolution-cloudflared-before-security1-20261015'
spec = importlib.util.spec_from_file_location('runtime_release', ROOT / 'release.py')
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
run, inspect = common.run, common.inspect


def exists(name):
    return subprocess.run(['docker', 'inspect', name], capture_output=True).returncode == 0


def save(state):
    STATE.write_text(json.dumps(state, indent=2))


def ready(name):
    for _ in range(60):
        logs = subprocess.run(['docker', 'logs', name], capture_output=True)
        content = (logs.stdout + logs.stderr).decode(errors='replace')
        (ROOT / 'cloudflared-private.log').write_text(content)
        match = re.search(r'Starting metrics server on .*?:(\d+)/metrics', content)
        if match:
            result = subprocess.run(['docker', 'exec', name, 'wget', '-qO-',
                'http://127.0.0.1:' + match.group(1) + '/ready'], capture_output=True)
            if result.returncode == 0:
                return
        time.sleep(1)
    raise RuntimeError('Tunnel readiness not confirmed; preserve private log')


def public_health():
    envoy = inspect('workout-supabase-envoy')
    environment = dict(value.split('=', 1) for value in envoy['Config']['Env'])
    config = 'url = "https://backend.workoutsaas.dpdns.org/auth/v1/health"\n'
    config += 'user-agent = "WorkoutSaaS/1.0"\nheader = ' + json.dumps('apikey: '+environment['ANON_KEY']) + '\n'
    result = run(['docker', 'exec', '-i', 'workout-supabase-public', 'curl',
        '-4', '-fsS', '--max-time', '20', '--config', '-'], config.encode())
    assert isinstance(json.loads(result), dict)


def rollback(state):
    if exists(OLD):
        assert inspect(OLD)['Id'] == state['original']['Id']
        if exists(NAME):
            assert inspect(NAME)['Image'] == state['image']
            run(['docker', 'stop', NAME])
            run(['docker', 'rename', NAME, QA])
        run(['docker', 'rename', OLD, NAME])
        run(['docker', 'update', '--restart='+state['restart'], NAME])
        run(['docker', 'start', NAME])
    elif exists(NAME):
        assert inspect(NAME)['Id'] == state['original']['Id']
    if exists(QA):
        run(['docker', 'rm', '-f', QA])
    state['rolled_back'] = True
    save(state)
    print('TUNNEL_ROLLED_BACK_WITHOUT_CHANGING_ROUTES')


if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'prepare':
        assert not STATE.exists() and not exists(QA) and not exists(OLD)
        candidate = json.loads((ROOT/'cloudflared-candidate.json').read_text())
        assert not candidate['counts'].get('CRITICAL', 0) and not candidate['counts'].get('HIGH', 0)
        original = inspect(NAME)
        assert original['Image'] == 'sha256:9b49eed8f62806d5d45ddf59ecefb5710429598ea6d3fcccd2af938f621b2b07'
        assert not original['HostConfig'].get('PortBindings')
        command = original['Config']['Cmd']
        assert '--config' in command
        path = command[command.index('--config')+1]
        args = ['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cloudflared']
        for mount in original['Mounts']:
            assert mount['Type'] == 'bind'
            args += ['-v', mount['Source']+':'+mount['Destination']+':ro']
        args += [candidate['image'], 'tunnel', '--config', path, 'ingress', 'validate']
        run(args)
        stamp = pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip()
        assert pathlib.Path('/home/ubuntu/workout-backups', stamp, 'complete').read_text().strip() == 'true'
        state = {'image': candidate['image'], 'original': original,
            'restart': original['HostConfig']['RestartPolicy']['Name'],
            'backup_stamp': stamp, 'applied': False}
        save(state)
        try:
            temporary = copy.deepcopy(original)
            temporary['HostConfig']['RestartPolicy'] = {'Name': 'no', 'MaximumRetryCount': 0}
            for details in temporary['NetworkSettings']['Networks'].values():
                details['Aliases'] = [QA]
            common.create_container(temporary, candidate['image'], QA)
            run(['docker', 'start', QA])
            ready(QA)
            run(['docker', 'restart', QA])
            ready(QA)
            state['configuration_validated_offline'] = True
            state['readiness_and_restart'] = True
            save(state)
            print('TUNNEL_CANDIDATE_READY_OLD_CONNECTOR_PRESERVED')
        except Exception:
            rollback(state)
            raise
    elif action == 'apply':
        state = json.loads(STATE.read_text())
        assert not state['applied'] and state['readiness_and_restart']
        assert inspect(NAME)['Id'] == state['original']['Id'] and inspect(QA)['Image'] == state['image']
        try:
            ready(QA)
            run(['docker', 'update', '--restart=no', NAME])
            run(['docker', 'stop', NAME])
            run(['docker', 'rename', NAME, OLD])
            run(['docker', 'rename', QA, NAME])
            run(['docker', 'update', '--restart='+state['restart'], NAME])
            ready(NAME)
            time.sleep(5)
            public_health()
            current = inspect(NAME)
            state['credentials_and_routes_preserved'] = (current['Config']['Env'] == state['original']['Config']['Env'] and
                current['Config']['Cmd'] == state['original']['Config']['Cmd'] and
                current['HostConfig']['Binds'] == state['original']['HostConfig']['Binds'])
            assert state['credentials_and_routes_preserved']
            state['applied'] = True
            save(state)
            print('TUNNEL_PUBLISHED_READY_PUBLIC_AUTH_HEALTH_PASSED')
        except Exception:
            rollback(state)
            raise
    elif action == 'rollback':
        rollback(json.loads(STATE.read_text()))
    else:
        raise RuntimeError('Use prepare, apply or rollback')
