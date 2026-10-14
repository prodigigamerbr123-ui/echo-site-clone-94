"""Query public OSV advisories for the pinned upstream Hex lockfile, without secrets."""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import re
import urllib.request

COMMIT = 'e8719d9ac5a43604c46d2d9e15bb34c76dea8f12'


def request(url, data=None):
    headers = {'Content-Type': 'application/json'} if data else {}
    payload = json.dumps(data).encode() if data else None
    with urllib.request.urlopen(urllib.request.Request(url, data=payload, headers=headers), timeout=45) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, required=True, help='New private evidence file outside Git')
    parser.add_argument('--lockfile', type=pathlib.Path, help='Resolved candidate lockfile; defaults to pinned upstream source')
    args = parser.parse_args()
    if args.output.exists():
        raise RuntimeError('Preserve existing evidence instead of overwriting it')
    lock = args.lockfile.read_bytes() if args.lockfile else request('https://raw.githubusercontent.com/supabase/supavisor/' + COMMIT + '/mix.lock')
    packages = re.findall(r'"([^"\n]+)": \{:hex, :([^,]+), "([^"\n]+)"', lock.decode())
    assert packages, 'No Hex packages parsed'
    queries = [{'package': {'name': name, 'ecosystem': 'Hex'}, 'version': version}
               for _, name, version in packages]
    results = json.loads(request('https://api.osv.dev/v1/querybatch', {'queries': queries}))['results']
    assert len(results) == len(packages), 'Incomplete advisory response'
    rows = [{'package': package[1], 'version': package[2], 'advisories': result.get('vulns', [])}
            for package, result in zip(packages, results) if result.get('vulns')]
    ids = sorted({item['id'] for row in rows for item in row['advisories']})

    def detail(advisory_id):
        return json.loads(request('https://api.osv.dev/v1/vulns/' + advisory_id))

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        details = list(executor.map(detail, ids))
    evidence = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'source_commit': COMMIT, 'lock_sha256': hashlib.sha256(lock).hexdigest(),
                'lock_origin': 'resolved candidate' if args.lockfile else 'pinned upstream',
                'packages_queried': len(packages), 'results': rows, 'details': details,
                'limitations': ['Lockfile includes development dependencies.',
                                'Git dependencies are excluded from this Hex query.',
                                'Advisory aliases may duplicate the same issue.',
                                'Installed runtime versions and reachability require separate verification.']}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(evidence, output, indent=2)
    print(json.dumps({'packages_queried': len(packages), 'packages_with_records': len(rows),
                      'advisory_records': len(details)}))


if __name__ == '__main__':
    main()
