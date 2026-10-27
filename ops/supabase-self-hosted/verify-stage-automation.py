#!/usr/bin/env python3
"""Validate daily automation only in the existing isolated staging stack."""
import json, pathlib, subprocess, urllib.request, urllib.error, uuid, time

ROOT = pathlib.Path('/opt/workout-stage-security-20261012')
PREFIX = 'workout-stage-full-20261012'
DB = PREFIX + '-db'
checks = []

def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        (ROOT/'automation-validation-error.log').write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Staging command failed; inspect restricted validation log')
    return result.stdout

def sql(statement):
    return run(['docker', 'exec', '-i', DB, 'psql', '-U', 'stage_bootstrap',
                '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], statement.encode()).decode().strip()

def check(name, passed):
    if not passed:
        raise RuntimeError('Staging assertion failed: ' + name)
    checks.append(name)

def call(secret):
    request = urllib.request.Request('http://127.0.0.1:18090/functions/v1/daily-automation',
        data=b'{}', headers={'Content-Type': 'application/json', 'apikey': credentials['anon'],
        'Authorization': 'Bearer ' + credentials['anon'], 'x-cron-secret': secret})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

if __name__ == '__main__':
    edge = json.loads(run(['docker', 'inspect', PREFIX + '-edge']))[0]
    environment = dict(value.split('=', 1) for value in edge['Config']['Env'])
    check('no_external_provider_credentials', not any(environment.get(key) for key in
        ['EVOLUTION_API_URL', 'EVOLUTION_INSTANCE_TOKEN', 'GEMINI_API_KEY', 'LOVABLE_API_KEY']))
    network = json.loads(run(['docker', 'network', 'inspect', PREFIX + '-net']))[0]
    check('internal_network', network['Internal'] is True)
    if sql("SELECT to_regclass('public.automation_runs') IS NULL") == 't':
        sql((ROOT/'automation-history.sql').read_text())
    check('exclusive_index_installed', sql("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='automation_runs_single_running_idx'") == '1')
    check('no_running_fixture', sql("SELECT count(*) FROM automation_runs WHERE status='running'") == '0')
    history_count = int(sql('SELECT count(*) FROM automation_runs'))
    success_count = int(sql("SELECT count(*) FROM automation_runs WHERE status='success' AND finished_at IS NOT NULL AND summary->>'inserted'='0'"))
    sql("NOTIFY pgrst, 'reload schema';")
    credentials = json.loads((ROOT/'credentials.json').read_text())
    settings = json.loads(sql("SELECT coalesce(json_agg(json_build_object('key',key,'enabled',enabled,'params',params)),'[]') FROM automation_settings"))
    students = json.loads(sql("SELECT coalesce(json_agg(json_build_object('id',id,'status',status)),'[]') FROM students"))
    before_count = sql('SELECT count(*) FROM scheduled_messages')
    original_function = ROOT/'functions/daily-automation/index.ts'
    backup = original_function.read_bytes()
    fixture = str(uuid.uuid4())
    fixture_ids = [str(uuid.uuid4()) for _ in range(1005)]
    fixture_list = ','.join("'" + value + "'" for value in fixture_ids)
    try:
        sql('UPDATE automation_settings SET enabled=false;')
        original_function.write_bytes((ROOT/'automation-index.ts').read_bytes())
        run(['docker', 'restart', PREFIX + '-edge'])
        run(['docker', 'exec', PREFIX + '-gateway', 'nginx', '-s', 'reload'])
        for attempt in range(30):
            try:
                status, body = call('invalid-test-secret')
                if status == 401:
                    break
            except (OSError, ValueError):
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError('Staging edge not ready')
        check('invalid_cron_rejected', status == 401)
        sql("INSERT INTO automation_runs(id) VALUES ('" + fixture + "');")
        status, body = call(environment['CRON_SECRET'])
        check('second_execution_skipped', status == 202 and body.get('skipped') is True)
        check('skipped_creates_no_history', int(sql('SELECT count(*) FROM automation_runs')) == history_count + 1)
        sql("UPDATE automation_runs SET status='failed',finished_at=now() WHERE id='" + fixture + "';")
        status, body = call(environment['CRON_SECRET'])
        check('disabled_automations_success', status == 200 and body.get('inserted') == 0)
        check('success_recorded_without_messages', int(sql("SELECT count(*) FROM automation_runs WHERE status='success' AND finished_at IS NOT NULL AND summary->>'inserted'='0'")) == success_count + 1)
        check('slot_released', sql("SELECT count(*) FROM automation_runs WHERE status='running'") == '0')
        check('queue_unchanged', sql('SELECT count(*) FROM scheduled_messages') == before_count)
        sql("UPDATE students SET status='inactive';")
        # More than the REST row cap proves the engine reads every page both
        # when creating and when checking the pending/history sets on retry.
        values = ','.join("('" + value + "','Aluno ficticio automacao','fixture-" + value + "','active',(now() AT TIME ZONE 'America/Sao_Paulo')::date)" for value in fixture_ids)
        sql('INSERT INTO students(id,name,phone,status,birth_date) VALUES ' + values + ';')
        sql("UPDATE automation_settings SET enabled=true,params='{}' WHERE key='birthday';")
        status, body = call(environment['CRON_SECRET'])
        check('birthday_all_pages_created', status == 200 and body.get('inserted') == len(fixture_ids))
        check('birthday_queue_pending', int(sql("SELECT count(*) FROM scheduled_messages WHERE student_id IN (" + fixture_list + ") AND message_type='birthday' AND status='pending'")) == len(fixture_ids))
        status, body = call(environment['CRON_SECRET'])
        check('repeated_run_no_duplicates', status == 200 and body.get('inserted') == 0)
        check('history_and_pending_pagination', int(sql('SELECT count(*) FROM scheduled_messages WHERE student_id IN (' + fixture_list + ')')) == len(fixture_ids))
        sql("UPDATE automation_settings SET enabled=false; UPDATE students SET status='inactive' WHERE id IN (" + fixture_list + ");")
        sql("UPDATE students SET status='active',birth_date=NULL,payment_due_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date WHERE id='" + fixture_ids[0] + "';")
        sql("UPDATE students SET status='active',birth_date=NULL,payment_due_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date-10 WHERE id IN ('" + fixture_ids[1] + "','" + fixture_ids[2] + "');")
        sql("UPDATE automation_settings SET enabled=true,params='{\"daily_limit\":1,\"days_before\":3}' WHERE key='payment_reminder'; UPDATE automation_settings SET enabled=true,params='{\"days_after_due\":1,\"repeat_every_days\":7}' WHERE key='payment_overdue';")
        status, body = call(environment['CRON_SECRET'])
        check('shared_payment_cap', status == 200 and body.get('inserted') == 1 and body.get('payment_due') == 1 and body.get('payment_overdue') == 0)
        check('no_delivery_history', sql('SELECT count(*) FROM messages WHERE student_id IN (' + fixture_list + ')') == '0')
        result = {'checks_passed': checks, 'production_changed': False, 'provider_requests': 0}
        (ROOT/'automation-validation.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
    finally:
        sql('DELETE FROM scheduled_messages WHERE student_id IN (' + fixture_list + '); DELETE FROM students WHERE id IN (' + fixture_list + ');')
        for student in students:
            state = student['status'].replace("'", "''")
            sql("UPDATE students SET status='" + state + "' WHERE id='" + student['id'] + "';")
        for setting in settings:
            key = setting['key'].replace("'", "''")
            params = json.dumps(setting['params']).replace("'", "''")
            sql("UPDATE automation_settings SET enabled=" + ('true' if setting['enabled'] else 'false') + ",params='" + params + "'::jsonb WHERE key='" + key + "';")
        original_function.write_bytes(backup)
        run(['docker', 'restart', PREFIX + '-edge'])
        run(['docker', 'exec', PREFIX + '-gateway', 'nginx', '-s', 'reload'])
