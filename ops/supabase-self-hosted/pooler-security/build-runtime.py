"""Build a non-root pooler candidate; no production deployment or package removal."""
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path('/home/ubuntu/workout-pooler-runtime-20261014')
PARENT = 'sha256:22783b18ac629a3f6ec2147954e92720f7b214ff07402b962c9bbc86a2193561'
TAG = 'workout-supavisor:2.9.12-runtime-candidate1'
os.umask(0o077)


def main():
    ROOT.mkdir(mode=0o700, exist_ok=True)
    state_path = ROOT / 'build-state.json'
    assert not state_path.exists(), 'Preserve previous evidence before another attempt'
    image_info = json.loads(subprocess.check_output([
        'docker', 'image', 'inspect', 'workout-supavisor:2.9.12-dependencies-candidate3']))[0]
    assert image_info['Id'] == PARENT
    (ROOT / '.dockerignore').write_text('*\n!Dockerfile.runtime\n')
    state = {'phase': 'building', 'parent': PARENT}
    state_path.write_text(json.dumps(state, indent=2))
    try:
        with (ROOT / 'build.log').open('w') as log:
            subprocess.run(['nice', '-n', '10', 'docker', 'build', '--memory', '512m',
                            '-f', str(ROOT / 'Dockerfile.runtime'), '-t', TAG, str(ROOT)],
                           stdout=log, stderr=log, check=True)
        image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', TAG]))[0]
        assert image['Config']['User'] == '65534:65534'
        permissions = subprocess.check_output([
            'docker', 'run', '--rm', '--network', 'none', '--user', '0', '--memory', '128m',
            '--entrypoint', 'sh', image['Id'], '-c',
            'find / -xdev -type f -perm /6000 -print'], text=True)
        assert not permissions.strip(), 'Unexpected setuid/setgid files'
        state.update(phase='scanning', image=image['Id'], privileged_files_absent=True)
        state_path.write_text(json.dumps(state, indent=2))
        with (ROOT / 'scan.log').open('w') as log:
            subprocess.run(['/home/ubuntu/workout-security-scan/trivy', 'image',
                            '--cache-dir', '/home/ubuntu/workout-security-scan/cache',
                            '--image-src', 'docker', '--scanners', 'vuln', '--parallel', '1',
                            '--skip-java-db-update', '--timeout', '15m', '--format', 'json',
                            '--output', str(ROOT / 'scan.json'), image['Id']],
                           stdout=log, stderr=log, check=True)
        counts = {}
        for result in json.loads((ROOT / 'scan.json').read_text()).get('Results', []):
            for vulnerability in result.get('Vulnerabilities', []):
                severity = vulnerability['Severity']
                counts[severity] = counts.get(severity, 0) + 1
        state.update(phase='scanned', counts=counts)
        (ROOT / 'scanner-database.json').write_bytes(pathlib.Path(
            '/home/ubuntu/workout-security-scan/cache/db/metadata.json').read_bytes())
    except Exception as error:
        state.update(phase='failed', error_type=type(error).__name__)
        raise
    finally:
        state_path.write_text(json.dumps(state, indent=2))


if __name__ == '__main__':
    main()
