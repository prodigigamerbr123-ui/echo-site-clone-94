"""Scan and integration-test the completed candidate; never changes production."""
import collections
import hashlib
import json
import os
import pathlib
import subprocess

os.umask(0o077)
ROOT = pathlib.Path('/home/ubuntu/workout-storage-dependencies-20261014')
SCANNER = '/home/ubuntu/workout-security-scan/trivy'
CACHE = '/home/ubuntu/workout-security-scan/cache'
IMAGE = 'workout-storage:1.74.0-security2'
BASE = 'sha256:527e41281258698d48648b9d2e6f881956393028f18a09967ec6bc9e2c115e42'


def write(name, value):
    (ROOT / name).write_text(json.dumps(value, indent=2))


def image_id(reference):
    return subprocess.check_output(['docker', 'image', 'inspect', reference, '--format', '{{.Id}}'], text=True).strip()


state = {'phase': 'starting'}
try:
    assert 'Successfully tagged' in (ROOT / 'build.log').read_text()
    assert image_id('workout-storage:1.74.0-security1') == BASE
    current = subprocess.check_output(['docker', 'inspect', 'workout-supabase-storage', '--format', '{{.Image}}'], text=True).strip()
    assert current == BASE, 'Production baseline changed during validation'
    candidate = image_id(IMAGE)
    write('candidate.json', {'image': candidate, 'base': BASE, 'tag': IMAGE})
    versions = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none',
        '-v', str(ROOT / 'verify-dependencies.cjs') + ':/tmp/verify-dependencies.cjs:ro',
        '--entrypoint', 'node', IMAGE, '/tmp/verify-dependencies.cjs'], text=True)
    write('dependency-versions.json', json.loads(versions))
    lock = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', IMAGE,
        '-e', "process.stdout.write(require('fs').readFileSync('/app/package-lock.json'))"])
    (ROOT / 'package-lock.resolved.json').write_bytes(lock)
    state.update(phase='scanning', image=candidate)
    write('validation-state.json', state)
    with (ROOT / 'hardened-scan.log').open('w') as log:
        subprocess.run(['nice', '-n', '10', SCANNER, 'image', '--image-src', 'docker', '--cache-dir', CACHE,
                        '--skip-db-update', '--skip-java-db-update', '--scanners', 'vuln', '--parallel', '1',
                        '--timeout', '15m', '--format', 'json', '--output', str(ROOT / 'hardened-scan.json'), candidate],
                       stdout=log, stderr=log, check=True)
    report = json.loads((ROOT / 'hardened-scan.json').read_text())
    counts = dict(collections.Counter(v['Severity'] for r in report.get('Results', []) for v in r.get('Vulnerabilities', [])))
    write('hardened-summary.json', {'image': candidate, 'counts': counts,
          'database': json.loads((pathlib.Path(CACHE) / 'db/metadata.json').read_text()),
          'scan_sha256': hashlib.sha256((ROOT / 'hardened-scan.json').read_bytes()).hexdigest()})
    assert counts.get('CRITICAL', 0) == 0 and counts.get('HIGH', 0) == 0, 'Candidate still has high/critical findings'
    state.update(phase='stage_validation', counts=counts)
    write('validation-state.json', state)
    with (ROOT / 'stage.log').open('w') as log:
        subprocess.run(['python3', str(ROOT / 'verify-stage.py')], stdout=log, stderr=log, check=True)
    state.update(phase='passed', checks=json.loads((ROOT / 'stage-validation.json').read_text())['checks'])
    write('validation-state.json', state)
except Exception as error:
    state.update(phase='failed', error_type=type(error).__name__, reason=str(error))
    write('validation-state.json', state)
    raise
