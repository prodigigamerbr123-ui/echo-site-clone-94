"""Disposable template CRUD fixture on the named isolated staging stack only."""
import base64
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path('/home/ubuntu/workout-template-qa-20261015')
STAGE = pathlib.Path('/opt/workout-stage-security-20261012')
DB = 'workout-stage-full-20261012-db'
os.umask(0o077)


def sql(query):
    result = subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-X', '-U', 'stage_bootstrap',
        '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True,
        capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Staging query failed')
    return result.stdout.strip()


def baseline():
    return json.loads(sql("""SELECT jsonb_build_object(
      'users',(SELECT count(*) FROM auth.users), 'staff',(SELECT count(*) FROM staff_members),
      'models',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM predefined_messages t),
      'settings',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY key)) FROM automation_settings t),
      'students',(SELECT count(*) FROM students), 'evaluations',(SELECT count(*) FROM evaluations),
      'queue',(SELECT count(*) FROM scheduled_messages));"""))


def signed(secret, role):
    encode = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(',', ':')).encode()).rstrip(b'=')
    data = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({
        'role': role, 'iss': 'supabase', 'iat': int(time.time()), 'exp': int(time.time()) + 900})
    return (data + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), data, hashlib.sha256).digest()).rstrip(b'=')).decode()


def main():
    if ROOT.exists():
        raise RuntimeError('QA evidence exists; inspect before retrying')
    ROOT.mkdir(mode=0o700)
    network = json.loads(subprocess.check_output(['docker', 'network', 'inspect',
        'workout-stage-full-20261012-net'], text=True))[0]
    edge = json.loads(subprocess.check_output(['docker', 'inspect', 'workout-stage-full-20261012-edge'], text=True))[0]
    environment = dict(value.split('=', 1) for value in edge['Config']['Env'])
    if not network['Internal'] or any(environment.get(key) for key in (
            'EVOLUTION_API_URL', 'EVOLUTION_INSTANCE_TOKEN', 'GEMINI_API_KEY', 'LOVABLE_API_KEY')):
        raise RuntimeError('Staging must be isolated without provider credentials')
    credentials = json.loads((STAGE / 'credentials.json').read_text())
    service, anon = signed(credentials['jwt'], 'service_role'), signed(credentials['jwt'], 'anon')
    def call(path, method='GET', body=None, token=None):
        key = anon if token else service
        req = urllib.request.Request('http://127.0.0.1:18090' + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'apikey': key, 'Authorization': 'Bearer ' + (token or service),
                     'Content-Type': 'application/json', 'Prefer': 'return=representation'})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                status, data = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, data = error.code, error.read()
        return status, json.loads(data) if data else None
    initial = baseline()
    user_id = None
    model_id, missing = str(uuid.uuid4()), str(uuid.uuid4())
    result = {'checks': [], 'environment': 'isolated-staging', 'real_sends': False}
    def check(name, condition):
        if not condition:
            raise RuntimeError('Staging check failed: ' + name)
        result['checks'].append(name)
    try:
        email = 'template-' + uuid.uuid4().hex + '@workout.test'
        password = secrets.token_urlsafe(24)
        status, user = call('/auth/v1/admin/users', 'POST', {'email': email, 'password': password, 'email_confirm': True})
        check('fixture_user_created', status == 200)
        user_id = str(uuid.UUID(user['id']))
        sql("INSERT INTO staff_members(user_id,role) VALUES ('" + user_id + "','admin');")
        status, session = call('/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': password})
        check('fixture_user_login', status == 200)
        token = session['access_token']
        path = '/rest/v1/predefined_messages'
        body = {'id': model_id, 'title': 'Template QA 15/10', 'content': 'Olá {nome}, texto de teste isolado.'}
        status, rows = call(path + '?select=id,title,content,created_at', 'POST', body, token)
        check('insert_returns_confirmed_row', status == 201 and len(rows) == 1 and rows[0]['id'] == model_id)
        status, error = call(path, 'POST', body, token)
        check('repeated_identity_is_unique_conflict', status == 409 and error.get('code') == '23505')
        status, rows = call(path + '?id=eq.' + model_id, token=token)
        check('repeated_identity_readable_for_recovery', status == 200 and len(rows) == 1 and rows[0]['content'] == body['content'])
        status, rows = call(path + '?id=eq.' + model_id + '&select=id,title,content,created_at', 'PATCH', {'content': 'Texto revisado'}, token)
        check('update_returns_confirmed_row', status == 200 and len(rows) == 1 and rows[0]['content'] == 'Texto revisado')
        status, rows = call(path + '?id=eq.' + missing + '&select=id', 'PATCH', {'content': 'Sem registro'}, token)
        check('missing_update_returns_no_rows', status == 200 and rows == [])
        status, rows = call(path + '?id=eq.' + model_id + '&select=id', 'DELETE', token=token)
        check('delete_returns_confirmed_row', status == 200 and rows == [{'id': model_id}])
        status, rows = call(path + '?id=eq.' + model_id + '&select=id', 'DELETE', token=token)
        check('missing_delete_returns_no_rows', status == 200 and rows == [])
        result['passed'] = True
    finally:
        status, _ = call('/rest/v1/predefined_messages?id=eq.' + model_id, 'DELETE')
        if status not in (200, 204):
            raise RuntimeError('Fixture model cleanup failed')
        if user_id:
            status, _ = call('/auth/v1/admin/users/' + user_id, 'DELETE')
            if status not in (200, 204):
                raise RuntimeError('Fixture account cleanup failed')
        result['baseline_restored'] = baseline() == initial
        (ROOT / 'result.json').write_text(json.dumps(result, indent=2))
    if not result['baseline_restored']:
        raise RuntimeError('Staging baseline differs; inspect private evidence')
    print(json.dumps({'passed': result['passed'], 'checks': len(result['checks']),
                      'baseline_restored': True, 'real_sends': False}))


if __name__ == '__main__':
    main()
