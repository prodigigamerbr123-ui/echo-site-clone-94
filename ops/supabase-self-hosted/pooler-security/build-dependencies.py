"""Build a separate Supavisor dependency candidate; never deploy production."""
import hashlib
import json
import os
import pathlib
import re
import subprocess

ROOT = pathlib.Path('/home/ubuntu/workout-pooler-dependencies-20261014')
BASE = pathlib.Path('/home/ubuntu/workout-pooler-security-20261014')
BUILDER = 'sha256:150f2164836cd3c4202241bd6827b8ec604d89605882ab7f433271566d88dff7'
RUNTIME = 'sha256:a6e02352900874aa9bd76bb0089610fb6dd3fbe285dc3131876e07dd4222b8f6'
VERSIONS = {'cowboy': '2.20.0', 'cowlib': '2.21.0', 'hpax': '1.0.4', 'mint': '1.10.2',
            'phoenix': '1.7.24', 'phoenix_live_view': '1.0.19', 'plug': '1.20.3',
            'req': '0.6.3', 'tesla': '1.18.3', 'finch': '0.22.0'}
os.umask(0o077)


def main():
    ROOT.mkdir(mode=0o700, exist_ok=True)
    state_path = ROOT / 'build-state.json'
    assert not state_path.exists(), 'Preserve the previous attempt first'
    run = lambda args: subprocess.check_output(args, text=True).strip()
    assert json.loads(run(['docker', 'image', 'inspect', BUILDER]))[0]['Id'] == BUILDER
    assert json.loads(run(['docker', 'image', 'inspect', 'workout-supavisor:2.9.12-trixie-candidate1']))[0]['Id'] == RUNTIME
    proof = json.loads((BASE / 'builder-provenance.json').read_text())
    assert proof['builder_image'] == BUILDER and proof['mix_lock_unchanged']
    subprocess.run(['docker', 'tag', BUILDER, 'workout-pooler-builder:2.9.12-reviewed'], check=True)
    source = BASE / 'supavisor-e8719d9ac5a43604c46d2d9e15bb34c76dea8f12'
    lock = (source / 'mix.lock').read_bytes()
    assert hashlib.sha256(lock).hexdigest() == '1e40fd2c5a91b747874470f77ed8651dcab592fad83a4d37ebe0481e7c5d41a2'
    original = (source / 'mix.exs').read_text()
    patched = original
    for name, version in VERSIONS.items():
        pattern = r'\{:' + re.escape(name) + r', "[^"\n]+"\}'
        replacement = '{:' + name + ', "== ' + version + '"}'
        patched, count = re.subn(pattern, lambda _: replacement, patched)
        assert count <= 1, 'Ambiguous dependency declaration'
        if count == 0:
            head, separator, tail = patched.partition('defp deps do\n    [\n')
            assert separator, 'Upstream dependency structure changed'
            patched = head + separator + '      ' + replacement + ',\n' + tail
    (ROOT / 'mix.exs').write_text(patched)
    (ROOT / 'mix.exs.original').write_text(original)
    (ROOT / 'limits.sh').write_bytes((source / 'limits.sh').read_bytes())
    (ROOT / 'Dockerfile').write_bytes((ROOT / 'Dockerfile.dependencies').read_bytes())
    (ROOT / '.dockerignore').write_text('*\n!Dockerfile\n!mix.exs\n!limits.sh\n')
    state = {'phase': 'building', 'builder': BUILDER, 'runtime_parent': RUNTIME,
             'source_commit': 'e8719d9ac5a43604c46d2d9e15bb34c76dea8f12', 'pinned_versions': VERSIONS}
    state_path.write_text(json.dumps(state, indent=2))
    try:
        with (ROOT / 'build.log').open('w') as log:
            subprocess.run(['nice', '-n', '10', 'docker', 'build', '--memory', '3g',
                            '--cpu-period', '100000', '--cpu-quota', '200000',
                            '-t', 'workout-supavisor:2.9.12-dependencies-candidate3', str(ROOT)],
                           stdout=log, stderr=log, check=True)
        state['image'] = json.loads(run(['docker', 'image', 'inspect',
                                        'workout-supavisor:2.9.12-dependencies-candidate3']))[0]['Id']
        image = state['image']
        subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--memory', '128m',
                        '--entrypoint', '/app/limits.sh', image, '/bin/true'],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        files = run(['docker', 'run', '--rm', '--network', 'none', '--memory', '256m',
                     '--entrypoint', 'sh', image, '-c', 'printf "%s\\n" /app/lib/*']).splitlines()
        for name, version in VERSIONS.items():
            found = [pathlib.Path(f).name for f in files if pathlib.Path(f).name.startswith(name + '-')]
            assert found == [name + '-' + version], 'Obsolete or unexpected dependency copies: ' + name
        lock = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none',
                                       '--memory', '256m', '--entrypoint', 'cat', image, '/app/release-mix.lock'])
        (ROOT / 'resolved-mix.lock').write_bytes(lock)
        def hex_versions(data):
            return {name: version for name, version in re.findall(
                r'"([^"\n]+)": \{:hex, :[^,]+, "([^"\n]+)"', data.decode())}
        old_versions, new_versions = hex_versions((source / 'mix.lock').read_bytes()), hex_versions(lock)
        assert set(new_versions) == set(old_versions), 'Unexpected package additions or removals'
        assert all(new_versions[name] == version for name, version in old_versions.items()
                   if name not in VERSIONS), 'Unrelated package versions changed'
        old_git = [line.strip() for line in (source / 'mix.lock').read_text().splitlines() if ': {:git,' in line]
        new_git = [line.strip() for line in lock.decode().splitlines() if ': {:git,' in line]
        assert old_git == new_git, 'Pinned Git dependencies changed'
        (ROOT / 'dependency-proof.json').write_text(json.dumps({
            'installed_versions': VERSIONS, 'single_copy_each': True,
            'other_hex_versions_preserved': True, 'git_dependencies_preserved': True,
            'lock_sha256': hashlib.sha256(lock).hexdigest()}, indent=2))
        state['phase'] = 'scanning'
        state_path.write_text(json.dumps(state, indent=2))
        with (ROOT / 'scan.log').open('w') as log:
            subprocess.run(['/home/ubuntu/workout-security-scan/trivy', 'image',
                            '--cache-dir', '/home/ubuntu/workout-security-scan/cache', '--image-src', 'docker',
                            '--scanners', 'vuln', '--parallel', '1', '--skip-java-db-update', '--timeout', '15m',
                            '--format', 'json', '--output', str(ROOT / 'scan.json'), state['image']],
                           stdout=log, stderr=log, check=True)
        counts = {}
        for result in json.loads((ROOT / 'scan.json').read_text()).get('Results', []):
            for vulnerability in result.get('Vulnerabilities', []):
                severity = vulnerability['Severity']
                counts[severity] = counts.get(severity, 0) + 1
        state.update(phase='scanned', counts=counts)
        (ROOT / 'scanner-database.json').write_bytes(pathlib.Path('/home/ubuntu/workout-security-scan/cache/db/metadata.json').read_bytes())
    except Exception as error:
        state.update(phase='failed', error_type=type(error).__name__)
        raise
    finally:
        state_path.write_text(json.dumps(state, indent=2))


if __name__ == '__main__':
    main()
