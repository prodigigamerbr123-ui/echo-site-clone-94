"""Publish the reviewed non-root pooler with verified backups and compose rollback."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

import yaml

ROOT = pathlib.Path('/home/ubuntu/workout-pooler-runtime-release-20261014')
EVIDENCE = pathlib.Path('/home/ubuntu/workout-pooler-runtime-20261014')
STACK = pathlib.Path('/opt/workout-supabase')
NAME = 'workout-supabase-pooler'
OLD = 'sha256:464b93a60ba8c96bc06dad7f241562d6613b2a994922307717b05f432ae415c2'
NEW = 'sha256:1f3562efb570cd78c131771e2ab64ca8db2c71f40d5dd5efe5d6dba976d5c2a6'
NEW_REF = 'workout-supavisor:2.9.12-security1'
BACKUP_FILES = ('database.dump', 'pooler.dump', 'roles.sql', 'runtime.tar.gz', 'database-config.tar.gz')
RESIDUAL_CVES = {'CVE-2026-76642', 'CVE-2026-78408', 'CVE-2026-78409', 'CVE-2026-78410',
                 'CVE-2026-12064', 'CVE-2026-8458', 'CVE-2026-54369', 'CVE-2025-69720',
                 'CVE-2026-16742', 'CVE-2026-9538'}
os.umask(0o077)
ROOT.mkdir(mode=0o700, exist_ok=True)


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        (ROOT / 'command-error.log').write_text(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect restricted command-error.log')
    return result.stdout.strip()


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def recent_backup(stamp):
    created = datetime.datetime.strptime(stamp, '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
    age = (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds()
    assert 0 <= age <= 3600, 'A new verified backup and metadata restore are required'


def save(state):
    (ROOT / 'state.json').write_text(json.dumps(state, indent=2))


def sql(query, database='postgres'):
    return run(['docker', 'exec', 'workout-supabase-db', 'psql', '-U', 'supabase_admin',
                '-d', database, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query])


def inventory():
    main = json.loads(sql("SELECT json_build_object('students',(SELECT count(*) FROM public.students),'users',(SELECT count(*) FROM auth.users),'active_cron',(SELECT count(*) FROM cron.job WHERE active));"))
    main['pooler'] = json.loads(sql("SELECT json_build_object('users',(SELECT count(*) FROM _supavisor.users),'tenants',(SELECT count(*) FROM _supavisor.tenants),'migrations',(SELECT md5(string_agg(version::text,',' ORDER BY version)) FROM _supavisor.schema_migrations),'users_digest',(SELECT md5(string_agg(row_to_json(u)::text,'|' ORDER BY id)) FROM _supavisor.users u));", '_supabase'))
    return main


def compose_config():
    return json.loads(run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'config', '--format', 'json']))


def call(path, key, token=None):
    args = ['docker', 'exec', 'workout-supabase-public', 'curl', '-sS', '--max-time', '15',
            '-w', '\n%{http_code}', '-H', 'Host: backend.workoutsaas.dpdns.org', '-H', 'apikey: ' + key]
    if token:
        args += ['-H', 'Authorization: Bearer ' + token]
    return int(run(args + ['http://127.0.0.1:8080' + path]).rsplit('\n', 1)[1])


def verify(hardened=False):
    item = inspect(NAME)
    env = dict(value.split('=', 1) for value in inspect('workout-supabase-envoy')['Config']['Env'])
    checks = {'pooler_healthy': item['State'].get('Health', {}).get('Status') == 'healthy',
              'auth_healthy': call('/auth/v1/health', env['ANON_KEY']) == 200,
              'anonymous_students_denied': call('/rest/v1/students?select=id&limit=1', env['ANON_KEY'], env['ANON_KEY']) in (401, 403),
              'storage_read_allowed': call('/storage/v1/bucket', env['SERVICE_ROLE_KEY'], env['SERVICE_ROLE_KEY']) == 200}
    pool_env = dict(value.split('=', 1) for value in item['Config']['Env'])
    manager = sql('SELECT db_user FROM _supavisor.users LIMIT 1;', '_supabase')
    for port, label in (('5432', 'session_sql'), ('6543', 'transaction_sql')):
        answer = run(['docker', 'exec', '-e', 'PGPASSWORD=' + pool_env['POSTGRES_PASSWORD'],
                      '-e', 'PGCONNECT_TIMEOUT=5', 'workout-supabase-db', 'psql', '-h', NAME,
                      '-p', port, '-U', manager + '.' + pool_env['POOLER_TENANT_ID'],
                      '-d', pool_env['POSTGRES_DB'], '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1;'])
        checks[label] = answer == '1'
    if hardened:
        fields = dict(line.split(':', 1) for line in run(['docker', 'exec', NAME, 'cat', '/proc/1/status']).splitlines() if ':' in line)
        checks.update(non_root=run(['docker', 'exec', NAME, 'id', '-u']) == '65534',
                      rootfs_readonly=item['HostConfig']['ReadonlyRootfs'],
                      caps_dropped=item['HostConfig']['CapDrop'] == ['ALL'],
                      capabilities_zero=int(fields['CapEff'].strip(), 16) == 0,
                      no_new_privileges=fields['NoNewPrivs'].strip() == '1',
                      seccomp_active=fields['Seccomp'].strip() == '2')
    return checks


def compose():
    run(['docker', 'compose', '-f', str(STACK / 'docker-compose.yml'), 'up', '-d',
         '--no-deps', '--pull', 'never', 'supavisor'])


def wait(hardened):
    for _ in range(45):
        try:
            checks = verify(hardened)
            if all(checks.values()):
                return checks
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError('Post-release checks failed')


def rollback(state):
    assert sha(STACK / 'docker-compose.yml') == state['compose_after_sha256']
    assert inspect('supabase/supavisor:2.9.12')['Id'] == OLD
    (STACK / 'docker-compose.yml').write_bytes((ROOT / 'compose.before.yml').read_bytes())
    compose()
    checks = wait(False)
    assert inspect(NAME)['Image'] == OLD
    state.update(phase='rolled_back', rollback_checks=checks)
    save(state)


phase = sys.argv[1]
if phase == 'prepare':
    assert not (ROOT / 'state.json').exists()
    assert inspect(NAME)['Image'] == OLD and inspect('supabase/supavisor:2.9.12')['Id'] == OLD
    assert inspect('workout-supavisor:2.9.12-runtime-candidate1')['Id'] == NEW
    validation = json.loads((EVIDENCE / 'validation.json').read_text())
    assert validation['image'] == NEW and len(validation['checks']) == 32 and all(validation['checks'].values())
    assert all(json.loads((EVIDENCE / 'cleanup.json').read_text()).values())
    scan = json.loads((EVIDENCE / 'scan.json').read_text())
    findings = [value for result in scan.get('Results', []) for value in result.get('Vulnerabilities', [])]
    assert not any(value['Severity'] == 'CRITICAL' for value in findings)
    assert {value['VulnerabilityID'] for value in findings if value['Severity'] == 'HIGH'} == RESIDUAL_CVES
    assert sum(value['Severity'] == 'HIGH' for value in findings) == 48
    applicable = json.loads((EVIDENCE / 'component-applicability.json').read_text())
    assert not applicable['systemd_homed_present'] and not applicable['archive_tar_loadable']
    assert applicable['production_health_fixed_http'] and not applicable['source_curl_calls']
    assert not applicable['source_decimal_calls'] and applicable['production_metadata_numeric_columns'] == 0
    restored = json.loads((EVIDENCE / 'metadata-restore.json').read_text())
    assert restored['phase'] == 'passed' and restored['fingerprints_equal']
    recent_backup(restored['backup_stamp'])
    backup = pathlib.Path('/home/ubuntu/workout-backups') / restored['backup_stamp']
    assert (backup / 'complete').exists() and sha(backup / 'pooler.dump') == restored['dump_sha256']
    assert all(verify().values())
    before = inspect(NAME)
    (ROOT / 'container.before.json').write_text(json.dumps(before, indent=2))
    (ROOT / 'compose.before.yml').write_bytes((STACK / 'docker-compose.yml').read_bytes())
    state = {'phase': 'prepared', 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'backup_stamp': restored['backup_stamp'], 'inventory_before': inventory(),
             'risk_review': {'residual_cves': sorted(RESIDUAL_CVES), 'package_warnings_retained': True,
                             'runtime_controls_validated': True, 'decimal_patch_pending': True},
             'proof': {'backup': {name: sha(backup / name) for name in BACKUP_FILES},
                       'release': {name: sha(ROOT / name) for name in ('container.before.json', 'compose.before.yml')},
                       'image': {'runtime-image.tar.gz': sha(EVIDENCE / 'runtime-image.tar.gz')}}}
    save(state)
    print(json.dumps(state))
elif phase == 'apply':
    state = json.loads((ROOT / 'state.json').read_text())
    assert state['phase'] == 'prepared'
    recent_backup(state['backup_stamp'])
    assert json.loads(pathlib.Path(sys.argv[2]).read_text()) == state['proof'], 'Independent local hashes required'
    assert all(sha(ROOT / name) == value for name, value in state['proof']['release'].items())
    assert inspect(NAME)['Image'] == OLD and inventory() == state['inventory_before']
    assert sha(STACK / 'docker-compose.yml') == state['proof']['release']['compose.before.yml']
    sockets = run(['ss', '-Hnt', 'state', 'established'])
    assert not any(line.split()[-2].rsplit(':', 1)[-1] in ('5433', '6543') for line in sockets.splitlines()), 'Active published SQL client; reschedule pooler recreation'
    before = compose_config()
    config = yaml.safe_load((ROOT / 'compose.before.yml').read_text())
    service = config['services']['supavisor']
    assert service['image'] == 'supabase/supavisor:2.9.12' and isinstance(service['environment'], dict)
    service.update(image=NEW_REF, user='65534:65534', read_only=True, cap_drop=['ALL'],
                   security_opt=['no-new-privileges:true'], pids_limit=256,
                   tmpfs=['/tmp:rw,noexec,nosuid,nodev,size=128m,mode=1777'])
    service['environment'].update(RELEASE_TMP='/tmp/release', NODE_IP='127.0.0.1')
    run(['docker', 'tag', NEW, NEW_REF])
    assert inspect(NEW_REF)['Id'] == NEW
    temporary = STACK / '.compose-pooler-runtime.tmp'
    temporary.write_text(yaml.safe_dump(config, sort_keys=False))
    temporary.replace(STACK / 'docker-compose.yml')
    state['compose_after_sha256'] = sha(STACK / 'docker-compose.yml')
    state['phase'] = 'applying'
    save(state)
    try:
        after = compose_config()
        assert all(after['services'][name] == value for name, value in before['services'].items() if name != 'supavisor')
        compose()
        checks = wait(True)
        assert inspect(NAME)['Image'] == NEW and inventory() == state['inventory_before']
        state.update(phase='published', checks=checks, image=NEW, inventory_after=inventory())
        save(state)
        print(json.dumps(state))
    except Exception:
        rollback(state)
        raise
elif phase == 'rollback':
    rollback(json.loads((ROOT / 'state.json').read_text()))
else:
    raise ValueError('Unknown release phase')
