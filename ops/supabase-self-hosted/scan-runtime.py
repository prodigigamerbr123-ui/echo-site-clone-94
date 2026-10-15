"""Read-only production image inventory and serial vulnerability scans. Run on VM."""
import collections
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import subprocess

os.umask(0o077)
ROOT = pathlib.Path('/home/ubuntu/workout-runtime-20261014')
SCANNER = pathlib.Path('/home/ubuntu/workout-security-scan/trivy')
CACHE = '/home/ubuntu/workout-security-scan/cache'
NAMES = (
    'workout-supabase-storage', 'workout-supabase-edge-functions',
    'workout-supabase-studio', 'workout-supabase-auth', 'realtime-dev.supabase-realtime',
    'workout-supabase-meta', 'workout-supabase-pooler', 'workout-supabase-rest',
    'workout-supabase-db', 'workout-supabase-imgproxy', 'evolution-cloudflared',
    'evolution-postgres', 'evolution-go', 'workout-supabase-public',
    'evolution-api-gateway', 'workout-supabase-envoy',
)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write(name, value):
    temporary = ROOT / (name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2))
    temporary.replace(ROOT / name)


def run(args):
    return subprocess.check_output(args, text=True)


def main():
    global ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=pathlib.Path, default=ROOT,
                        help='New private evidence directory; existing inventory is never replaced.')
    ROOT = parser.parse_args().output_dir
    ROOT.mkdir(mode=0o700, exist_ok=True)
    if (ROOT / 'inventory.json').exists():
        raise RuntimeError('Existing inventory; preserve prior evidence instead of overwriting')
    version = json.loads(run([str(SCANNER), 'version', '--format', 'json']))
    # Never save raw container inspection (Config.Env contains credentials).
    containers = json.loads(run(['docker', 'inspect', *NAMES]))
    inventory = [{
        'name': item['Name'].lstrip('/'), 'image_ref': item['Config']['Image'], 'image_id': item['Image'],
        'running': item['State']['Running'], 'health': item['State'].get('Health', {}).get('Status'),
        'published_ports': item['NetworkSettings']['Ports'],
    } for item in containers]
    write('inventory.json', {'at': now(), 'containers': inventory})
    write('scanner.json', {'version': version, 'binary_sha256': hashlib.sha256(SCANNER.read_bytes()).hexdigest()})
    state = {'started_at': now(), 'phase': 'updating_database', 'completed': 0, 'results': []}
    write('state.json', state)
    try:
        with (ROOT / 'database.log').open('w') as log:
            subprocess.run(['nice', '-n', '10', str(SCANNER), 'image', '--cache-dir', CACHE, '--download-db-only'],
                           stdout=log, stderr=log, check=True)
        database = pathlib.Path(CACHE) / 'db' / 'metadata.json'
        write('database.json', json.loads(database.read_text()))
        images = list(dict.fromkeys(item['image_id'] for item in inventory))
        state['total'] = len(images)
        for image in images:
            state.update(phase='scanning', current_image=image)
            write('state.json', state)
            stem = image.split(':')[1][:16]
            output = ROOT / (stem + '.json')
            command = ['nice', '-n', '10', str(SCANNER), 'image', '--image-src', 'docker', '--cache-dir', CACHE,
                       '--skip-db-update', '--skip-java-db-update', '--scanners', 'vuln', '--parallel', '1',
                       '--timeout', '15m', '--format', 'json', '--output', str(output), image]
            with (ROOT / (stem + '.log')).open('w') as log:
                subprocess.run(command, stdout=log, stderr=log, check=True)
            report = json.loads(output.read_text())
            findings = [v for result in report.get('Results', []) for v in result.get('Vulnerabilities', [])]
            state['results'].append({
                'image_id': image, 'containers': [i['name'] for i in inventory if i['image_id'] == image],
                'counts': dict(collections.Counter(v['Severity'] for v in findings)),
                'fixable_critical_high': sum(v['Severity'] in ('CRITICAL', 'HIGH') and bool(v.get('FixedVersion')) for v in findings),
                'report_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                'os': report.get('Metadata', {}).get('OS'),
            })
            state['completed'] += 1
            write('state.json', state)
        after = json.loads(run(['docker', 'inspect', *NAMES]))
        state['images_unchanged'] = {i['Name'].lstrip('/'): i['Image'] for i in after} == {i['name']: i['image_id'] for i in inventory}
        state.update(phase='complete', finished_at=now())
        write('state.json', state)
        write('summary.json', state)
    except Exception as error:
        state.update(phase='failed', error_type=type(error).__name__, failed_at=now())
        write('state.json', state)
        raise


if __name__ == '__main__':
    main()
