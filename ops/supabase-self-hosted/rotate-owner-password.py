"""Read the approved owner/password plan through SSH stdin; never echo credentials.

Run once as root on the Workout VM. Uses Auth APIs, not direct password-hash edits.
"""
import base64
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path('/home/ubuntu/workout-owner-password-20261015')
os.umask(0o077)


def sql(query):
    result = subprocess.run(['docker', 'exec', '-i', 'workout-supabase-db', 'psql', '-X',
        '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        input=query, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Database verification failed; credentials omitted')
    return json.loads(result.stdout)


def fingerprint():
    return sql("""BEGIN READ ONLY;
      SELECT jsonb_build_object(
       'students',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM students t),
       'evaluations',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM evaluations t),
       'staff',(SELECT md5(string_agg(row_to_json(t)::text,'|' ORDER BY user_id)) FROM staff_members t),
       'messages',(SELECT count(*) FROM messages),
       'scheduled',(SELECT count(*) FROM scheduled_messages),
       'users',(SELECT count(*) FROM auth.users),
       'identities',(SELECT md5(string_agg(concat_ws(':',id,user_id,provider,provider_id),'|' ORDER BY id)) FROM auth.identities));
      COMMIT;""")


def main(payload):
    plan = payload['plan']
    password = payload['password']
    owner = plan['owner']
    user_id = str(uuid.UUID(owner['id']))
    if plan['applied'] or not payload.get('approved_global_logout'):
        raise RuntimeError('Explicit approval and unapplied plan required')
    if hashlib.sha256(password.encode()).hexdigest() != plan['candidate_sha256'] or len(password) < 20:
        raise RuntimeError('Password candidate differs from reviewed file')
    if ROOT.exists():
        raise RuntimeError('Rotation state already exists; inspect before retrying')
    current = sql("SELECT jsonb_build_object('email',u.email,'password_fingerprint',md5(u.encrypted_password),"
        "'role',s.role,'active',s.active) FROM auth.users u JOIN staff_members s ON s.user_id=u.id WHERE u.id='" + user_id + "';")
    if current != {key: owner[key] for key in ('email', 'password_fingerprint', 'role', 'active')}:
        raise RuntimeError('Owner changed since plan preparation')
    ROOT.mkdir(mode=0o700)
    before = fingerprint()
    sessions_before = sql("SELECT jsonb_build_object('sessions',count(*)) FROM auth.sessions WHERE user_id='" + user_id + "';")['sessions']
    previous_refresh = sql("SELECT jsonb_build_object('token',(SELECT token FROM auth.refresh_tokens WHERE user_id::text='" +
        user_id + "' AND NOT revoked ORDER BY id DESC LIMIT 1));")['token']
    gateway = json.loads(subprocess.check_output(['docker', 'inspect', 'workout-supabase-envoy'], text=True))[0]
    env = dict(value.split('=', 1) for value in gateway['Config']['Env'])
    service, anon = env['SERVICE_ROLE_KEY'], env['ANON_KEY']
    state = {'phase': 'verified_owner', 'approved_global_logout': True,
             'sessions_before': sessions_before, 'data_before': before,
             'started_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    def save():
        (ROOT / 'result.json').write_text(json.dumps(state, indent=2))
    def request(path, body, token=None, key=None, method='POST'):
        headers = {'apikey': key or service, 'Content-Type': 'application/json',
                   'Authorization': 'Bearer ' + (token or service)}
        req = urllib.request.Request('http://127.0.0.1:8000/auth/v1' + path,
            data=json.dumps(body).encode(), headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        return status, json.loads(raw) if raw else {}
    save()
    status, result = request('/admin/users/' + user_id, {'password': password}, method='PUT')
    if status != 200 or result.get('id') != user_id:
        raise RuntimeError('Auth password update failed; inspect phase, do not print request data')
    state['phase'] = 'password_updated'
    save()
    status, session = request('/token?grant_type=password', {'email': owner['email'], 'password': password},
                              key=anon, token=anon)
    if status != 200 or session.get('user', {}).get('id') != user_id:
        raise RuntimeError('New password login failed; administrative recovery required')
    access, refresh = session['access_token'], session['refresh_token']
    claims = json.loads(base64.urlsafe_b64decode(access.split('.')[1] + '==='))
    state['issued_access_token_lifetime_seconds'] = claims['exp'] - claims['iat']
    req = urllib.request.Request('http://127.0.0.1:8000/rest/v1/rpc/get_workout_dashboard',
        data=b'{}', method='POST', headers={'apikey': anon, 'Authorization': 'Bearer ' + access,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200 or not response.read():
            raise RuntimeError('Owner dashboard verification failed')
    state['new_login_and_dashboard_verified'] = True
    state['phase'] = 'new_login_verified'
    save()
    status, _ = request('/logout?scope=global', {}, token=access, key=anon)
    if status not in (200, 204):
        raise RuntimeError('Global sign-out failed; password is already changed')
    state['phase'] = 'global_logout_requested'
    save()
    remaining = sql("SELECT jsonb_build_object('sessions',(SELECT count(*) FROM auth.sessions WHERE user_id='" +
        user_id + "'),'refresh_tokens',(SELECT count(*) FROM auth.refresh_tokens WHERE user_id::text='" +
        user_id + "' AND NOT revoked));")
    if remaining != {'sessions': 0, 'refresh_tokens': 0}:
        raise RuntimeError('Auth still reports active owner sessions or refresh tokens')
    for token in [refresh] + ([previous_refresh] if previous_refresh else []):
        code, _ = request('/token?grant_type=refresh_token', {'refresh_token': token}, token=anon, key=anon)
        if code not in (400, 401, 403):
            raise RuntimeError('Logged-out refresh token was accepted unexpectedly')
    after = fingerprint()
    if after != before:
        raise RuntimeError('Application data fingerprint changed; review private evidence')
    state.update({'phase': 'passed', 'password_changed': True, 'sessions_after': 0,
        'unrevoked_refresh_after': 0, 'refresh_rejected': True, 'data_preserved': True,
        'finished_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    save()
    print(json.dumps({key: state[key] for key in ('phase', 'password_changed', 'sessions_before',
        'sessions_after', 'refresh_rejected', 'data_preserved', 'issued_access_token_lifetime_seconds')}))


if __name__ == '__main__':
    main(json.load(sys.stdin))
