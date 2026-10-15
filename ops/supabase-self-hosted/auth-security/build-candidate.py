"""Build the pinned Auth source with reviewed dependency and parser corrections."""
import collections
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import urllib.request

ROOT = pathlib.Path('/home/ubuntu/workout-auth-security-20261014')
OLD = 'sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232'
COMMIT = '0204331ca41a5b49f076b6fa3dc6c0d20b996590'
TAG = 'workout-auth:2.196.0-security1-candidate'
BUILDER = 'workout-auth:2.196.0-builder1'
TRIVY = '/home/ubuntu/workout-security-scan/trivy'
CACHE = pathlib.Path('/home/ubuntu/workout-security-scan/cache')
os.umask(0o077)


def command(args, log):
    with (ROOT / log).open('w') as destination:
        subprocess.run(args, stdout=destination, stderr=destination, check=True)


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def scan(image, name):
    path = ROOT / (name + '-scan.json')
    command(['nice', '-n', '10', TRIVY, 'image', '--image-src', 'docker', '--cache-dir', str(CACHE),
             '--skip-db-update', '--skip-java-db-update', '--scanners', 'vuln', '--parallel', '1',
             '--timeout', '15m', '--format', 'json', '--output', str(path), image], name + '-scan.log')
    report = json.loads(path.read_text())
    findings = [v for result in report.get('Results', []) for v in result.get('Vulnerabilities', [])]
    return {'counts': dict(collections.Counter(v['Severity'] for v in findings)),
            'high_critical': [{'id': v['VulnerabilityID'], 'package': v['PkgName'], 'version': v['InstalledVersion']}
                              for v in findings if v['Severity'] in ('HIGH', 'CRITICAL')],
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def migrations(container):
    data = subprocess.check_output(['docker', 'cp', container + ':/usr/local/etc/auth/migrations/.', '-'])
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        return {p.name.removeprefix('./'): hashlib.sha256(archive.extractfile(p).read()).hexdigest()
                for p in archive.getmembers() if p.isfile()}


def modules(path):
    content, decoder, result = path.read_text(), json.JSONDecoder(), {}
    while content.strip():
        item, end = decoder.raw_decode(content.lstrip())
        result[item['Path']] = item.get('Version')
        content = content.lstrip()[end:]
    return result


def main():
    if sys.argv[1:] == ['--resume-build']:
        state = json.loads((ROOT / 'build-state.json').read_text())
        assert state['phase'] == 'building' and state['source_commit'] == COMMIT
        assert hashlib.sha256((ROOT / 'source.tar.gz').read_bytes()).hexdigest() == state['source_archive_sha256']
        assert inspect('workout-supabase-auth')['Image'] == OLD
    else:
        assert not sys.argv[1:]
        assert not (ROOT / 'build-state.json').exists(), 'Preserve previous attempts'
        assert inspect('workout-supabase-auth')['Image'] == OLD
        state = {'phase': 'downloading', 'source_commit': COMMIT, 'original_image': OLD}
        (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))
        source_url = 'https://codeload.github.com/supabase/auth/tar.gz/' + COMMIT
        with urllib.request.urlopen(source_url, timeout=60) as response:
            archive = response.read()
        (ROOT / 'source.tar.gz').write_bytes(archive)
        state['source_archive_sha256'] = hashlib.sha256(archive).hexdigest()
        extracted = ROOT / 'extract'
        extracted.mkdir(mode=0o700)
        with tarfile.open(fileobj=io.BytesIO(archive)) as source:
            source.extractall(extracted, filter='data')
        children = list(extracted.iterdir())
        assert len(children) == 1 and children[0].is_dir()
        children[0].rename(ROOT / 'source')
        (ROOT / '.dockerignore').write_text('*\n!Dockerfile\n!source/\n!source/**\n!patch-parser.py\n!parser-security_test.go\n')
        command([TRIVY, 'image', '--cache-dir', str(CACHE), '--download-db-only'], 'database.log')
        (ROOT / 'database.json').write_bytes((CACHE / 'db/metadata.json').read_bytes())
        state['original'] = scan(OLD, 'original')
        state['phase'] = 'building'
        (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))
    command(['nice', '-n', '10', 'docker', 'build', '--memory', '1536m', '--target', 'builder',
             '-t', BUILDER, str(ROOT)], 'builder.log')
    output = ROOT / 'build-output'
    output.mkdir(mode=0o700)
    temporary = 'workout-auth-build-evidence-20261014'
    assert subprocess.run(['docker', 'inspect', temporary], capture_output=True).returncode != 0
    subprocess.run(['docker', 'create', '--name', temporary, BUILDER], stdout=subprocess.DEVNULL, check=True)
    try:
        for name in ('go.mod', 'go.sum', 'modules-before.json', 'modules.json', 'parser-before.txt',
                     'parser-after.txt', 'parser-fuzz.txt', 'parser-patch.json', 'build-info.txt'):
            subprocess.run(['docker', 'cp', temporary + ':/out/' + name, str(output / name)], check=True)
    finally:
        subprocess.run(['docker', 'rm', temporary], stdout=subprocess.DEVNULL, check=True)
    before, after = modules(output / 'modules-before.json'), modules(output / 'modules.json')
    state['module_changes'] = {key: {'before': before.get(key), 'after': after.get(key)}
                               for key in before.keys() | after.keys() if before.get(key) != after.get(key)}
    assert after['github.com/jackc/pgproto3/v2'] == 'v2.3.3'
    for key, version in {'golang.org/x/crypto': 'v0.57.0', 'golang.org/x/net': 'v0.60.0',
                         'golang.org/x/mod': 'v0.41.0', 'google.golang.org/grpc': 'v1.83.2'}.items():
        assert after[key] == version
    assert 'go1.26.9' in (output / 'build-info.txt').read_text()
    command(['nice', '-n', '10', 'docker', 'build', '--memory', '512m', '-t', TAG, str(ROOT)], 'runtime.log')
    image = inspect(TAG)
    state.update(phase='scanning', image=image['Id'], size=image['Size'])
    (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))
    assert image['Config']['User'] == '1000:1000'
    temporary = 'workout-auth-runtime-evidence-20261014'
    assert subprocess.run(['docker', 'inspect', temporary], capture_output=True).returncode != 0
    subprocess.run(['docker', 'create', '--name', temporary, image['Id']], stdout=subprocess.DEVNULL, check=True)
    try:
        old_migrations, new_migrations = migrations('workout-supabase-auth'), migrations(temporary)
        assert old_migrations == new_migrations, 'Auth migration contents differ; block publication'
        (ROOT / 'migration-manifest.json').write_text(json.dumps(new_migrations, indent=2))
    finally:
        subprocess.run(['docker', 'rm', temporary], stdout=subprocess.DEVNULL, check=True)
    state['migrations_unchanged'] = True
    state['candidate'] = scan(image['Id'], 'candidate')
    assert (CACHE / 'db/metadata.json').read_bytes() == (ROOT / 'database.json').read_bytes()
    assert inspect('workout-supabase-auth')['Image'] == OLD
    state.update(phase='scanned', counts=state['candidate']['counts'], production_unchanged=True)
    (ROOT / 'build-state.json').write_text(json.dumps(state, indent=2))


if __name__ == '__main__':
    main()
