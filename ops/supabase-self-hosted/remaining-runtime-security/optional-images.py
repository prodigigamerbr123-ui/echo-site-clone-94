"""Disable unused image transformations; keep imgproxy available only on demand.

Run prepare/apply/rollback on the named VM. Requires an already verified backup.
Normal Storage is retained; transformation support needs explicit revalidation.
"""
import copy
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time
import yaml

os.umask(0o077)
ROOT = pathlib.Path('/home/ubuntu/workout-image-optional-20261015')
STACK = pathlib.Path('/opt/workout-supabase')
CONFIG = STACK / 'docker-compose.yml'


def run(args):
    p = subprocess.run(args, capture_output=True, timeout=120)
    if p.returncode:
        (ROOT / 'private-error.log').write_bytes(p.stdout+p.stderr)
        raise RuntimeError('Optional image service change failed; inspect private evidence')
    return p.stdout


def compose(path, args):
    return run(['docker', 'compose', '--project-directory', str(STACK), '--project-name',
        'workout-supabase', '--env-file', str(STACK/'.env'), '-f', str(path),
        '--profile', 'admin', '--profile', 'images', *args])


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wait():
    for _ in range(60):
        item=json.loads(run(['docker','inspect','workout-supabase-storage']))[0]
        if item['State'].get('Health',{}).get('Status')=='healthy': return
        time.sleep(1)
    raise RuntimeError('Storage not healthy')


def rollback(state):
    if digest(CONFIG)!=state['after_sha256']: raise RuntimeError('Compose changed; review rollback')
    original=ROOT/'compose.before.yml'
    assert digest(original)==state['before_sha256']
    CONFIG.write_bytes(original.read_bytes())
    run(['docker','update','--restart='+state['imgproxy_restart'],'workout-supabase-imgproxy'])
    run(['docker','start','workout-supabase-imgproxy'])
    compose(CONFIG,['up','-d','--no-deps','storage']);wait()
    print('OPTIONAL_IMAGE_CHANGE_ROLLED_BACK')


if __name__=='__main__':
    action=sys.argv[1]
    if action=='prepare':
        ROOT.mkdir(mode=0o700,exist_ok=False)
        raw=yaml.safe_load(CONFIG.read_text());before=json.loads(compose(CONFIG,['config','--format','json']))
        expected=copy.deepcopy(before)
        assert str(before['services']['storage']['environment']['ENABLE_IMAGE_TRANSFORMATION']).lower()=='true'
        raw['services']['storage']['environment']['ENABLE_IMAGE_TRANSFORMATION']='false'
        raw['services']['storage']['depends_on'].pop('imgproxy')
        raw['services']['imgproxy'].update(profiles=['images'],restart='no')
        expected['services']['storage']['environment']['ENABLE_IMAGE_TRANSFORMATION']='false'
        expected['services']['storage']['depends_on'].pop('imgproxy')
        expected['services']['imgproxy'].update(profiles=['images'],restart='no')
        candidate=ROOT/'compose.candidate.yml';candidate.write_text(yaml.safe_dump(raw,sort_keys=False))
        assert json.loads(compose(candidate,['config','--format','json']))==expected
        (ROOT/'compose.before.yml').write_bytes(CONFIG.read_bytes())
        item=json.loads(run(['docker','inspect','workout-supabase-imgproxy']))[0]
        state={'before_sha256':digest(CONFIG),'after_sha256':digest(candidate),'imgproxy_restart':item['HostConfig']['RestartPolicy']['Name']}
        (ROOT/'state.json').write_text(json.dumps(state,indent=2));print('OPTIONAL_IMAGE_CHANGE_PREPARED')
    else:
        state=json.loads((ROOT/'state.json').read_text())
        if action=='rollback': rollback(state)
        elif action=='apply':
            assert digest(CONFIG)==state['before_sha256']
            CONFIG.write_bytes((ROOT/'compose.candidate.yml').read_bytes())
            try:
                run(['docker','update','--restart=no','workout-supabase-imgproxy'])
                run(['docker','stop','workout-supabase-imgproxy'])
                compose(CONFIG,['up','-d','--no-deps','storage']);wait()
                print('IMAGE_TRANSFORMS_DISABLED_STORAGE_HEALTHY')
            except Exception:
                rollback(state);raise
        else: raise RuntimeError('Use prepare, apply or rollback')
