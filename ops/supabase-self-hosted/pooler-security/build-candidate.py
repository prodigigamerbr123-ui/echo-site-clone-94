"""Build/scan a pooler candidate only; never start or replace production services."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import tarfile
import urllib.request

ROOT = pathlib.Path('/home/ubuntu/workout-pooler-security-20261014')
COMMIT = 'e8719d9ac5a43604c46d2d9e15bb34c76dea8f12'
SOURCE_SHA256 = '8b883bd6cc72db080ac4e6abfa90f11ba433bae41e3e8e5e4618ff49199ab098'
TAG = 'workout-supavisor:2.9.12-trixie-candidate1'
os.umask(0o077)


def main():
    ROOT.mkdir(mode=0o700, exist_ok=True)
    state_path = ROOT / 'build-state.json'
    if state_path.exists():
        raise RuntimeError('Existing attempt: preserve it before another build')
    state = {'source_commit': COMMIT, 'phase': 'downloading',
             'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}

    def save():
        state_path.write_text(json.dumps(state, indent=2))

    save()
    try:
        archive = ROOT / 'source.tar.gz'
        with urllib.request.urlopen('https://codeload.github.com/supabase/supavisor/tar.gz/' + COMMIT) as response:
            archive.write_bytes(response.read())
        state['source_archive_sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
        assert state['source_archive_sha256'] == SOURCE_SHA256, 'Source archive differs from reviewed archive'
        with tarfile.open(archive) as source:
            source.extractall(ROOT, filter='data')
        context = ROOT / ('supavisor-' + COMMIT)
        (context / 'Dockerfile').write_bytes((ROOT / 'Dockerfile').read_bytes())
        state['phase'] = 'building'
        save()
        with (ROOT / 'build.log').open('w') as log:
            subprocess.run(['nice', '-n', '10', 'docker', 'build', '--memory', '3g',
                            '--cpu-period', '100000', '--cpu-quota', '200000',
                            '-t', TAG, str(context)], stdout=log, stderr=log, check=True)
        image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', TAG]))[0]['Id']
        state.update(phase='scanning', image=image)
        save()
        with (ROOT / 'scan.log').open('w') as log:
            subprocess.run(['/home/ubuntu/workout-security-scan/trivy', 'image',
                            '--cache-dir', '/home/ubuntu/workout-security-scan/cache',
                            '--image-src', 'docker', '--scanners', 'vuln', '--parallel', '1',
                            '--skip-java-db-update', '--timeout', '15m', '--format', 'json',
                            '--output', str(ROOT / 'scan.json'), image],
                           stdout=log, stderr=log, check=True)
        report = json.loads((ROOT / 'scan.json').read_text())
        database = pathlib.Path('/home/ubuntu/workout-security-scan/cache/db/metadata.json')
        (ROOT / 'scanner-database.json').write_bytes(database.read_bytes())
        counts = {}
        for result in report.get('Results', []):
            for vulnerability in result.get('Vulnerabilities', []):
                severity = vulnerability['Severity']
                counts[severity] = counts.get(severity, 0) + 1
        state.update(phase='scanned', counts=counts, os=report.get('Metadata', {}).get('OS'))
    except Exception as error:
        state.update(phase='failed', error_type=type(error).__name__)
        raise
    finally:
        save()


if __name__ == '__main__':
    main()
