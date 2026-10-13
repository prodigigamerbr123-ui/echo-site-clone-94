#!/usr/bin/env python3
"""Workout 13 October release. Explicit phases; never restores a live database."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys, time

CONTRACTS = '--contracts' in sys.argv
DASHBOARD = '--dashboard' in sys.argv
CHAT = '--chat' in sys.argv
if sum([CONTRACTS,DASHBOARD,CHAT])>1:
    raise RuntimeError('Choose one release kind')
if CONTRACTS:
    sys.argv.remove('--contracts')
if DASHBOARD:
    sys.argv.remove('--dashboard')
if CHAT:
    sys.argv.remove('--chat')
ROOT = pathlib.Path('/opt/workout-releases/20261013-chat' if CHAT else '/opt/workout-releases/20261013-dashboard' if DASHBOARD else
                    '/opt/workout-releases/20261013-contracts' if CONTRACTS else '/opt/workout-releases/20261013-automations')
STACK = pathlib.Path('/opt/workout-supabase')
DB = 'workout-supabase-db'
VERSION = '20261013030000' if CHAT else '20261013020000' if DASHBOARD else '20261013010000'
FILES = (['_shared/database.types.ts','_shared/aiChatContracts.ts','ai-assistant/index.ts'] if CHAT else
         ['_shared/database.types.ts', '_shared/messageTemplates.ts', '_shared/templateResolver.ts',
          '_shared/dashboardContracts.ts', '_shared/contracts.ts', '_shared/aiContracts.ts', 'daily-briefing/index.ts'] if DASHBOARD else
         ['_shared/database.types.ts', '_shared/evaluations.ts', '_shared/evolution.ts',
          '_shared/messageTemplates.ts', '_shared/aiContracts.ts', '_shared/contracts.ts',
          'ai-assistant/index.ts', 'ai-database-actions/index.ts', 'daily-automation/index.ts',
          'daily-briefing/index.ts', 'whatsapp-status/index.ts'] if CONTRACTS else
         ['daily-automation/index.ts', '_shared/phone.ts', '_shared/database.types.ts'])
JOBS = "'process-scheduled-messages-every-minute','daily-automation'"
os.umask(0o077)

def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        (ROOT/'error.log').write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Command failed; inspect restricted error.log')
    return result.stdout

def sql(statement, user='supabase_admin'):
    return run(['docker', 'exec', '-i', DB, 'psql', '-U', user, '-d', 'postgres',
                '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], statement.encode()).decode().strip()

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(state):
    temp = ROOT/'state.tmp'
    temp.write_text(json.dumps(state, indent=2))
    temp.replace(ROOT/'state.json')

def restore_jobs(state):
    for job in state['jobs']:
        sql('UPDATE cron.job SET active=' + ('true' if job['active'] else 'false') +
            ' WHERE jobid=' + str(job['id']) + ';')

def gateway(maintenance):
    if maintenance:
        (STACK/'public-gateway.conf').write_text(
            'server { listen 8080; server_tokens off; location / { add_header Retry-After 120 always; return 503; } }\n')
    else:
        shutil.copyfile(ROOT/'gateway.before.conf', STACK/'public-gateway.conf')
    run(['docker', 'exec', 'workout-supabase-public', 'nginx', '-t'])
    run(['docker', 'exec', 'workout-supabase-public', 'nginx', '-s', 'reload'])

def verify_package():
    manifest = json.loads((ROOT/'package.json').read_text())
    for name, expected in manifest['sha256'].items():
        if digest(ROOT/name) != expected:
            raise RuntimeError('Package hash mismatch: ' + name)
    return manifest

phase = sys.argv[1]
if phase == 'preflight':
    manifest = verify_package()
    if sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261012010000'") != '1':
        raise RuntimeError('Required previous migration absent')
    history_missing = sql("SELECT to_regclass('public.automation_runs') IS NULL") == 't'
    if history_missing == (CONTRACTS or DASHBOARD or CHAT):
        raise RuntimeError('Unexpected automation history schema; inspect release state')
    if (CONTRACTS or DASHBOARD or CHAT) and sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261013010000'") != '1':
        raise RuntimeError('Required automation history migration absent')
    if CHAT and sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261013020000'") != '1':
        raise RuntimeError('Required dashboard migration absent')
    for name in FILES:
        target = STACK/'volumes/functions'/name
        before = target.read_bytes().replace(b'\r\n', b'\n') if target.exists() else None
        actual = hashlib.sha256(before).hexdigest() if before is not None else None
        if actual != manifest['before_sha256'][name]:
            raise RuntimeError('Production runtime differs from reviewed predecessor: ' + name)
    jobs = json.loads(sql('SELECT json_agg(json_build_object(\'id\',jobid,\'active\',active,\'name\',jobname)) FROM cron.job WHERE jobname IN ('+JOBS+');'))
    if not jobs or len(jobs) != 2:
        raise RuntimeError('Unexpected cron configuration')
    print(json.dumps({'preflight': 'passed', 'jobs': jobs,
                      'students': int(sql('SELECT count(*) FROM public.students')),
                      'users': int(sql('SELECT count(*) FROM auth.users'))}))
elif phase == 'prepare':
    if (ROOT/'state.json').exists():
        raise RuntimeError('Release already prepared')
    verify_package()
    jobs = json.loads(sql('SELECT json_agg(json_build_object(\'id\',jobid,\'active\',active)) FROM cron.job WHERE jobname IN ('+JOBS+');'))
    if not jobs or len(jobs) != 2:
        raise RuntimeError('Unexpected cron configuration')
    state = {'phase': 'pausing', 'jobs': jobs,
             'release_kind': 'chat' if CHAT else 'dashboard' if DASHBOARD else 'contracts' if CONTRACTS else 'automation_history',
             'new_files': [],
             'prepared_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(state)
    sql('UPDATE cron.job SET active=false WHERE jobname IN ('+JOBS+');')
    try:
        for attempt in range(30):
            pending = int(sql('SELECT count(*) FROM public.scheduled_messages WHERE status=\'processing\';'))
            lease = int(sql('SELECT count(*) FROM public.whatsapp_delivery_lease WHERE token IS NOT NULL;'))
            requests = int(sql('SELECT count(*) FROM net.http_request_queue;'))
            if pending == 0 and lease == 0 and requests == 0:
                break
            time.sleep(2)
        else:
            raise RuntimeError('Workers not idle; no runtime files changed')
        # Backup the normal gateway configuration; pause only scheduling jobs.
        run(['python3', str(STACK/'backup.py')])
        state['backup'] = pathlib.Path('/home/ubuntu/workout-backups/latest').read_text().strip()
        state['backup_sha256'] = {name: digest(pathlib.Path('/home/ubuntu/workout-backups')/state['backup']/name)
                                   for name in ['database.dump', 'runtime.tar.gz']}
        shutil.copyfile(STACK/'public-gateway.conf', ROOT/'gateway.before.conf')
        for name in FILES:
            before = ROOT/'before'/name
            before.parent.mkdir(parents=True, exist_ok=True)
            source = STACK/'volumes/functions'/name
            if source.exists():
                shutil.copyfile(source, before)
            else:
                state['new_files'].append(name)
        gateway(True)
        state['phase'] = 'prepared'
        save(state)
        print(json.dumps({'phase': state['phase'], 'backup': state['backup'], 'backup_sha256': state['backup_sha256']}))
    except Exception:
        if (ROOT/'gateway.before.conf').exists():
            gateway(False)
        restore_jobs(state)
        state['phase'] = 'aborted_before_apply'
        save(state)
        raise
elif phase == 'apply':
    state = json.loads((ROOT/'state.json').read_text())
    if state['phase'] != 'prepared':
        raise RuntimeError('Unexpected release phase')
    # Operator supplies hashes from the independently copied local backup.
    if sys.argv[2:4] != [state['backup_sha256']['database.dump'], state['backup_sha256']['runtime.tar.gz']]:
        raise RuntimeError('Independent backup verification missing')
    verify_package()
    if not CONTRACTS:
        migration = (ROOT/('chat.sql' if CHAT else 'dashboard.sql' if DASHBOARD else 'automation-history.sql')).read_text()
        migration = migration.replace('BEGIN;', 'BEGIN;\nSET LOCAL ROLE postgres;', 1)
        migration_name = 'durable_ai_chat' if CHAT else 'dashboard_snapshot' if DASHBOARD else 'automation_run_history'
        migration = migration.replace('COMMIT;', "RESET ROLE;\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('"+VERSION+"','"+migration_name+"');\nCOMMIT;")
        sql(migration)
        state['phase'] = 'migration_applied'
        save(state)
    for name in FILES:
        target = STACK/'volumes/functions'/name
        temp = target.with_suffix(target.suffix+'.release')
        shutil.copyfile(ROOT/'runtime'/name, temp)
        temp.replace(target)
    run(['docker', 'restart', 'workout-supabase-edge-functions'])
    sql("NOTIFY pgrst, 'reload schema';")
    for attempt in range(20):
        status = run(['docker','inspect','--format','{{.State.Health.Status}}','workout-supabase-edge-functions']).decode().strip()
        if status == 'healthy':
            break
        time.sleep(2)
    else:
        raise RuntimeError('Edge health check did not pass; keep maintenance until recovery')
    state['phase'] = 'backend_applied'
    save(state)
    print('BACKEND_APPLIED')
elif phase == 'open_api':
    state = json.loads((ROOT/'state.json').read_text())
    if state['phase'] != 'backend_applied':
        raise RuntimeError('Backend not applied')
    gateway(False)
    state['phase'] = 'api_open_jobs_paused'
    save(state)
    print('API_OPEN_JOBS_PAUSED')
elif phase == 'resume':
    state = json.loads((ROOT/'state.json').read_text())
    if state['phase'] != 'api_open_jobs_paused':
        raise RuntimeError('Verify API before resuming')
    restore_jobs(state)
    state['phase'] = 'resumed'
    state['resumed_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save(state)
    print('PRODUCTION_RESUMED')
elif phase == 'restore_backend':
    # Additive history table remains. Never delete queue/history or restore database.
    state = json.loads((ROOT/'state.json').read_text())
    if sql('SELECT count(*) FROM cron.job WHERE jobname IN ('+JOBS+') AND active;') != '0':
        raise RuntimeError('Pause cron jobs before restoring runtime')
    for name in FILES:
        source = ROOT/'before'/name
        target = STACK/'volumes/functions'/name
        if source.exists():
            shutil.copyfile(source, target)
        elif name in state.get('new_files', []):
            target.unlink(missing_ok=True)
    run(['docker','restart','workout-supabase-edge-functions'])
    gateway(False)
    restore_jobs(state)
    state['phase'] = 'backend_restored'
    save(state)
    print('PREVIOUS_BACKEND_RESTORED')
else:
    raise RuntimeError('Unknown phase')
