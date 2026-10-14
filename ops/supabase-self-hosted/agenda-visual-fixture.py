"""Run on the VM: disposable UI fixture, restricted to the existing isolated stage."""
import json
import os
import pathlib
import subprocess
import sys
import urllib.request
import uuid

os.umask(0o077)
ROOT = pathlib.Path('/opt/workout-stage-security-20261012')
PACKAGE = pathlib.Path('/home/ubuntu/workout-agenda-ui-20261014')
STATE = PACKAGE / 'fixture.json'
DB = 'workout-stage-full-20261012-db'


def sql(statement):
    result = subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-U', 'stage_bootstrap',
                             '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'],
                            input=statement, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('Stage SQL failed; inspect fixture privately')
    return result.stdout.strip()


credentials = json.loads((ROOT / 'credentials.json').read_text())
headers = {'apikey': credentials['service'], 'Authorization': 'Bearer ' + credentials['service'],
           'Content-Type': 'application/json'}


def auth(path, body=None, method='POST'):
    request = urllib.request.Request('http://127.0.0.1:18090/auth/v1/admin/users' + path,
                                    data=json.dumps(body).encode() if body is not None else None,
                                    headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        value = response.read()
        return json.loads(value) if value else None


if sys.argv[1] == 'prepare':
    if STATE.exists():
        raise RuntimeError('Fixture state already exists; inspect before retrying')
    network = json.loads(subprocess.check_output(['docker', 'network', 'inspect', 'workout-stage-full-20261012-net']))[0]
    if not network['Internal']:
        raise RuntimeError('Stage must have an internal network')
    edge = json.loads(subprocess.check_output(['docker', 'inspect', 'workout-stage-full-20261012-edge']))[0]
    env = dict(value.split('=', 1) for value in edge['Config']['Env'] if '=' in value)
    if any(env.get(key) for key in ('EVOLUTION_API_URL', 'EVOLUTION_INSTANCE_TOKEN', 'GEMINI_API_KEY', 'LOVABLE_API_KEY', 'GOOGLE_API_KEY')):
        raise RuntimeError('Stage must have no provider credentials')
    has_cron = sql("SELECT to_regclass('cron.job') IS NOT NULL;") == 't'
    if has_cron and sql('SELECT count(*) FROM cron.job WHERE active;') != '0':
        raise RuntimeError('Stage jobs must be inactive')
    if sql("SELECT count(*) FROM pg_proc WHERE proname='evaluation_schedule_conflicts' AND pronamespace='public'::regnamespace;") != '0':
        raise RuntimeError('Expected the documented stage baseline without conflict lookup')
    PACKAGE.mkdir(mode=0o700, exist_ok=True)
    state = {'student': str(uuid.uuid4()), 'user': None, 'lookup_added': False,
             'baseline': sql('SELECT count(*) FROM students; SELECT count(*) FROM evaluations; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM auth.users;')}
    STATE.write_text(json.dumps(state))
    # Track ownership before each mutation so cleanup remains possible after interruption.
    state['lookup_added'] = True
    STATE.write_text(json.dumps(state))
    sql('BEGIN;\n' + (PACKAGE / 'lookup.sql').read_text() + "\nNOTIFY pgrst, 'reload schema'; COMMIT;")
    user = auth('', {'email': 'agenda-ui-20261014@workout.test', 'password': 'Workout-Agenda-UI-20261014!', 'email_confirm': True})
    state['user'] = user['id']
    STATE.write_text(json.dumps(state))
    sql("BEGIN; INSERT INTO public.staff_members(user_id,role) VALUES ('" + state['user'] + "','admin'); "
        "INSERT INTO public.students(id,name,phone,status,had_evaluation) VALUES ('" + state['student'] +
        "','QA Agenda 20261014','5599990000014','active',false); COMMIT;")
    print('STAGE_FIXTURE_READY: isolated, providers absent, jobs inactive')
elif sys.argv[1] == 'cleanup':
    state = json.loads(STATE.read_text())
    student = str(uuid.UUID(state['student']))
    sql("BEGIN; DELETE FROM scheduled_messages WHERE student_id='" + student + "'; "
        "DELETE FROM evaluations WHERE student_id='" + student + "'; "
        "DELETE FROM students WHERE id='" + student + "'; COMMIT;")
    if state['user']:
        auth('/' + str(uuid.UUID(state['user'])), method='DELETE')
    if state['lookup_added']:
        sql("DROP FUNCTION IF EXISTS public.evaluation_schedule_conflicts(uuid,timestamptz,uuid); NOTIFY pgrst, 'reload schema';")
    after = sql('SELECT count(*) FROM students; SELECT count(*) FROM evaluations; SELECT count(*) FROM scheduled_messages; SELECT count(*) FROM auth.users;')
    if after != state['baseline']:
        raise RuntimeError('Stage baseline counts differ; preserve state for inspection')
    STATE.rename(PACKAGE / 'fixture.cleaned.json')
    print('STAGE_FIXTURE_REMOVED_AND_BASELINE_COUNTS_VERIFIED')
else:
    raise RuntimeError('Use prepare or cleanup')
