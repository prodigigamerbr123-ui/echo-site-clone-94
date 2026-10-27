"""Create/remove an ephemeral visual QA account exclusively in staging."""
import json, pathlib, subprocess, sys, urllib.request
ROOT = pathlib.Path('/opt/workout-stage-security-20261012')
credentials = json.loads((ROOT/'credentials.json').read_text())
state = ROOT/'visual-qa-account.json'
headers = {'apikey':credentials['service'], 'Authorization':'Bearer '+credentials['service'], 'Content-Type':'application/json'}
if sys.argv[1] == 'create':
    if state.exists():
        raise RuntimeError('Visual fixture already exists; inspect before reusing')
    body = {'email':'visual-qa-20261013@workout.test', 'password':'Workout-Visual-QA-20261013!', 'email_confirm':True}
    request = urllib.request.Request('http://127.0.0.1:18090/auth/v1/admin/users', data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(request) as response:
        user = json.load(response)
    state.write_text(json.dumps({'id':user['id']}))
    statement = "INSERT INTO public.staff_members(user_id,role) VALUES ('" + user['id'] + "','admin');"
    subprocess.run(['docker','exec','-i','workout-stage-full-20261012-db','psql','-U','stage_bootstrap','-d','postgres','-v','ON_ERROR_STOP=1','-q'],input=statement.encode(),check=True)
    print('VISUAL_FIXTURE_CREATED')
elif sys.argv[1] == 'remove':
    user = json.loads(state.read_text())
    request = urllib.request.Request('http://127.0.0.1:18090/auth/v1/admin/users/'+user['id'],method='DELETE', headers=headers)
    with urllib.request.urlopen(request): pass
    state.unlink()
    print('VISUAL_FIXTURE_REMOVED')
else:
    raise RuntimeError('Unknown phase')
