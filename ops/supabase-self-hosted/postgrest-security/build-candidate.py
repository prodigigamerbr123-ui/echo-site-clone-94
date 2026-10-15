"""Build and scan a runtime-only PostgREST candidate; never change production."""
import collections
import hashlib
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path('/home/ubuntu/workout-postgrest-security-20261014')
OLD = 'sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c'
BINARY = '4eee06ead8d14318fd02ea182f919cca0c9487b01a4780dffe9532664155e8c8'
TAG = 'workout-postgrest:14.17-security1-candidate'
TRIVY = '/home/ubuntu/workout-security-scan/trivy'
CACHE = '/home/ubuntu/workout-security-scan/cache'
os.umask(0o077)


def command(args, log):
    with (ROOT / log).open('w') as output:
        subprocess.run(args, stdout=output, stderr=output, check=True)


def scan(image, prefix):
    output = ROOT / (prefix + '-scan.json')
    command(['nice', '-n', '10', TRIVY, 'image', '--image-src', 'docker', '--cache-dir', CACHE,
             '--skip-db-update', '--skip-java-db-update', '--scanners', 'vuln', '--parallel', '1',
             '--timeout', '15m', '--format', 'json', '--output', str(output), image], prefix + '-scan.log')
    report = json.loads(output.read_text())
    findings = [v for result in report.get('Results', []) for v in result.get('Vulnerabilities', [])]
    return {'counts': dict(collections.Counter(v['Severity'] for v in findings)),
            'os': report.get('Metadata', {}).get('OS'),
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}


def main():
    ROOT.mkdir(mode=0o700, exist_ok=True)
    assert not (ROOT / 'build-state.json').exists(), 'Preserve previous evidence'
    inspect = json.loads(subprocess.check_output(['docker', 'inspect', 'workout-supabase-rest']))[0]
    assert inspect['Image'] == OLD
    state = {'phase': 'scanning_original', 'original_image': OLD, 'binary_sha256': BINARY}
    (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))
    command(['nice', '-n', '10', TRIVY, 'image', '--cache-dir', CACHE, '--download-db-only'], 'database.log')
    database = pathlib.Path(CACHE) / 'db/metadata.json'
    (ROOT / 'database.json').write_bytes(database.read_bytes())
    state['original'] = scan(OLD, 'original')
    (ROOT / '.dockerignore').write_text('*\n!Dockerfile\n')
    state['phase'] = 'building'
    (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))
    command(['nice', '-n', '10', 'docker', 'build', '--memory', '512m',
             '-t', TAG, str(ROOT)], 'build.log')
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', TAG]))[0]
    state.update(phase='scanning_candidate', image=image['Id'], size=image['Size'])
    (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))
    for flag, args in [('version', ['postgrest', '--version']),
                       ('binary', ['sha256sum', '/usr/bin/postgrest']),
                       ('linkage', ['ldd', '/usr/bin/postgrest'])]:
        result = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--read-only',
                                          '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true',
                                          image['Id'], *args], text=True)
        (ROOT / (flag + '.txt')).write_text(result)
        if flag == 'version':
            assert result.strip() == 'PostgREST 14.17'
        if flag == 'binary':
            assert result.split()[0] == BINARY
        if flag == 'linkage':
            assert 'not found' not in result
    state['candidate'] = scan(image['Id'], 'candidate')
    assert database.read_bytes() == (ROOT / 'database.json').read_bytes(), 'Scanner database changed during comparison'
    state.update(phase='scanned', counts=state['candidate']['counts'],
                 production_unchanged=json.loads(subprocess.check_output(['docker', 'inspect', 'workout-supabase-rest']))[0]['Image'] == OLD)
    (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))


if __name__ == '__main__':
    main()
