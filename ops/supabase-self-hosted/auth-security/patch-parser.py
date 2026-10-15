"""Bound negative DataRow lengths in vendored pgproto3/v2 without hiding its version."""
import hashlib
import json
import pathlib

path = pathlib.Path('vendor/github.com/jackc/pgproto3/v2/data_row.go')
original = path.read_bytes()
old = b'if len(src[rp:]) < msgSize {'
new = b'if msgSize < 0 || len(src[rp:]) < msgSize {'
assert original.count(old) == 1, 'Review unexpected vendor source before patching'
patched = original.replace(old, new)
path.write_bytes(patched)
pathlib.Path('/out/parser-patch.json').write_text(json.dumps({
    'module': 'github.com/jackc/pgproto3/v2', 'version': 'v2.3.3',
    'advisory': 'CVE-2026-32286', 'file': str(path),
    'original_sha256': hashlib.sha256(original).hexdigest(),
    'patched_sha256': hashlib.sha256(patched).hexdigest(),
    'version_metadata_preserved': True,
}, indent=2))
