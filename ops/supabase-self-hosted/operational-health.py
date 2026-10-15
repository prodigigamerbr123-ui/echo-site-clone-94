"""Read-only local checks. No messages, AI calls, retries or credential changes.

Run as root on the VM. Output contains counts and check labels, never credentials
or student/message content. Exit 1 means an operational alert needs review.
"""
import argparse
import datetime
import json
import pathlib
import shutil
import subprocess

ESSENTIAL = (
    'workout-supabase-db', 'workout-supabase-auth', 'workout-supabase-rest',
    'workout-supabase-storage', 'workout-supabase-pooler',
    'workout-supabase-edge-functions', 'realtime-dev.supabase-realtime',
    'workout-supabase-envoy', 'workout-supabase-public',
    'evolution-go', 'evolution-postgres', 'evolution-api-gateway', 'evolution-cloudflared',
)
QUERY = """SELECT jsonb_build_object(
 'queue',(SELECT coalesce(jsonb_object_agg(status,c),'{}') FROM
   (SELECT status,count(*) c FROM scheduled_messages GROUP BY status)t),
 'overdue_pending',(SELECT count(*) FROM scheduled_messages WHERE status='pending'
   AND scheduled_for < now()-interval '15 minutes'),
 'stale_processing',(SELECT count(*) FROM scheduled_messages WHERE status='processing'
   AND updated_at < now()-interval '10 minutes'),
 'failed_with_dispatch',(SELECT count(*) FROM scheduled_messages
   WHERE status='failed' AND dispatch_started_at IS NOT NULL),
 'failed_with_sent_receipt',(SELECT count(*) FROM scheduled_messages s
   WHERE s.status='failed' AND EXISTS(SELECT 1 FROM messages m
      WHERE m.scheduled_message_id=s.id AND m.status='sent')),
 'duplicate_provider_receipts',(SELECT count(*) FROM (SELECT provider_message_id
   FROM messages WHERE provider_message_id IS NOT NULL GROUP BY provider_message_id
   HAVING count(*)>1)t),
 'active_jobs',(SELECT count(*) FROM cron.job WHERE active),
 'recent_cron_failures',(SELECT count(*) FROM cron.job_run_details
   WHERE start_time > now()-interval '15 minutes' AND status='failed'),
 'worker_last_started',(SELECT max(start_time) FROM cron.job_run_details d
   JOIN cron.job j USING(jobid) WHERE j.jobname='process-scheduled-messages-every-minute'),
 'worker_recent',(SELECT coalesce(max(start_time)>now()-interval '5 minutes',false)
   FROM cron.job_run_details d JOIN cron.job j USING(jobid)
   WHERE j.jobname='process-scheduled-messages-every-minute'),
 'recent_http_response_ok',(SELECT coalesce((SELECT status_code=200 AND error_msg IS NULL
   AND created>now()-interval '5 minutes' FROM net._http_response ORDER BY created DESC LIMIT 1),false)),
 'daily_last',(SELECT jsonb_build_object('status',status,'finished_at',finished_at,
   'started_at',started_at) FROM automation_runs ORDER BY started_at DESC LIMIT 1),
 'daily_recent_success',(SELECT coalesce(bool_or(status='success'
   AND finished_at>now()-interval '27 hours'),false) FROM automation_runs));"""


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Local check failed')
    return result.stdout


def collect():
    checks, alerts = {}, []
    containers = json.loads(run(['docker', 'inspect', *ESSENTIAL]))
    for container in containers:
        state = container['State']
        checks[container['Name'].lstrip('/')] = bool(state['Running'] and
            state.get('Health', {}).get('Status', 'healthy') == 'healthy')
    storage = next(c for c in containers if c['Name'] == '/workout-supabase-storage')
    storage_environment = dict(value.split('=', 1) for value in storage['Config']['Env'])
    imgproxy = json.loads(run(['docker', 'inspect', 'workout-supabase-imgproxy']))[0]
    if storage_environment.get('ENABLE_IMAGE_TRANSFORMATION', '').lower() == 'true':
        checks['image_processing_policy'] = bool(imgproxy['State']['Running'] and
            imgproxy['State'].get('Health', {}).get('Status', 'healthy') == 'healthy')
    else:
        checks['image_processing_policy'] = (not imgproxy['State']['Running'] and
            imgproxy['HostConfig']['RestartPolicy']['Name'] == 'no')
    edge = next(c for c in containers if c['Name'] == '/workout-supabase-edge-functions')
    environment = dict(value.split('=', 1) for value in edge['Config']['Env'])
    # curl receives credentials on stdin, never in the process argument list.
    config = 'url = ' + json.dumps(environment['EVOLUTION_API_URL'].rstrip('/') + '/instance/status') + '\n'
    config += 'header = ' + json.dumps('apikey: ' + environment['EVOLUTION_INSTANCE_TOKEN']) + '\n'
    provider = json.loads(run(['docker', 'exec', '-i', 'evolution-api-gateway',
        'curl', '--fail', '--silent', '--show-error', '--max-time', '15', '--config', '-'], config))
    provider = provider.get('data', provider)
    checks['whatsapp_connected'] = bool(provider.get('Connected', provider.get('connected')) and
        provider.get('LoggedIn', provider.get('loggedIn')))
    database = json.loads(run(['docker', 'exec', '-i', 'workout-supabase-db', 'psql',
        '-X', '-U', 'supabase_admin', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], QUERY))
    checks['queue_not_stalled'] = database['overdue_pending'] == database['stale_processing'] == 0
    checks['cron_recent'] = bool(database['worker_recent']) and database['recent_cron_failures'] == 0
    checks['recent_http_response_ok'] = bool(database['recent_http_response_ok'])
    checks['daily_recent_success'] = bool(database['daily_recent_success'])
    checks['jobs_active'] = database['active_jobs'] == 2
    checks['no_duplicate_provider_receipts'] = database['duplicate_provider_receipts'] == 0
    checks['no_conflicting_failed_receipts'] = database['failed_with_sent_receipt'] == 0
    root = pathlib.Path('/home/ubuntu/workout-backups')
    stamp = (root / 'latest').read_text().strip()
    snapshot = root / stamp
    if snapshot.resolve().parent != root.resolve():
        raise RuntimeError('Unexpected backup path')
    manifest = json.loads((snapshot / 'manifest.json').read_text())
    created = datetime.datetime.strptime(stamp, '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
    age = (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds()
    expected = {'database.dump', 'pooler.dump', 'roles.sql', 'runtime.tar.gz', 'database-config.tar.gz'}
    checks['backup_complete_recent'] = (0 <= age < 27*3600 and
        (snapshot / 'complete').read_text().strip() == 'true' and
        set(manifest['files']) == expected and set(manifest['sha256']) == expected and
        all((snapshot / name).stat().st_size == manifest['files'][name] for name in expected) and
        manifest.get('evolution_backup_format') == 1)
    checks['backup_timer_active'] = run(['systemctl', 'is-active', 'workout-supabase-backup.timer']).strip() == 'active'
    checks['disk_space'] = shutil.disk_usage('/').free / shutil.disk_usage('/').total > 0.15
    for name in ('evolution-postgres-before-security1-20261015', 'evolution-cloudflared-before-security1-20261015'):
        probe = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True, timeout=15)
        if probe.returncode == 0:
            previous = json.loads(probe.stdout)[0]
            checks[name + '_dormant'] = (not previous['State']['Running'] and
                previous['HostConfig']['RestartPolicy']['Name'] == 'no')
    for name, passed in checks.items():
        if not passed:
            alerts.append(name)
    # Historical failures are explicitly reported, never replayed automatically.
    return {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'checks': checks, 'alerts': alerts, 'database': database,
        'backup_stamp': stamp, 'backup_age_hours': round(age/3600, 2),
        'historical_failed_messages': database['queue'].get('failed', 0),
        'provider_connection_not_checked': False, 'real_sends': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    try:
        report = collect()
    except Exception as error:
        report = {'alerts': ['check_execution_failed'], 'error_type': type(error).__name__}
    if args.output:
        temporary = args.output.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, indent=2))
        temporary.chmod(0o600)
        temporary.replace(args.output)
    print(json.dumps(report))
    raise SystemExit(1 if report['alerts'] else 0)
