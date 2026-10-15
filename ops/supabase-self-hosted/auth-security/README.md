# Auth dependency maintenance

This dated procedure rebuilds Supabase Auth v2.196.0 from commit
`0204331ca41a5b49f076b6fa3dc6c0d20b996590`. It updates Go/runtime dependencies
and applies a bounds check to vendored pgproto3/v2. Auth migrations must remain
byte-identical to production. Application roles and shared-admin behavior remain.

## Build and validation

Copy these files to the private VM directory
`/home/ubuntu/workout-auth-security-20261014`. Run `sudo python3 build-candidate.py`
once. Existing evidence is guarded; inspect and preserve failed attempts before
using `--resume-build`. Source/base digests, module changes, go.mod/go.sum,
binary build information and scans stay in this private directory.

The builder checks 14 parser cases before/after the bounds correction and runs a
bounded fuzz check through a main-module wrapper. The original pgproto3 version
metadata is retained; scanners still report CVE-2026-32286. Do not suppress the
finding or describe this as an upstream patched release. The local correction
and its hashes require review whenever the dependency changes.

Run `sudo python3 verify-isolated.py` after scanning. Its 42 checks use synthetic
accounts, an internal network, tmpfs PostgreSQL, no published ports, no SMTP and
no application workers. It checks old-to-new login/session compatibility,
password changes, administrative boundaries, local logout, restart and runtime
controls. It also verifies fixture cleanup. Preserve failed fixtures' evidence;
do not weaken assertions to turn an unexpected result into a pass.

## Production release

The immutable published image is
`sha256:94a79d1a5e153f771a1f2066e0f38672d33e75e971b8a0d9393b856f7d5e15cc`,
tagged `workout-auth:2.196.0-security1`. Rebuilding later can resolve different
Alpine packages; retain the tested image archive instead of assuming identical
future builds.

Copy `release.py` to `/home/ubuntu/workout-auth-release-20261015`. It requires
Python 3/PyYAML and the private build/validation evidence above.

- `prepare`: consume private `login-input.json` containing the authorized admin
  email/password, remove that input, create one audit session, preserve existing
  session IDs and schema/password/identity fingerprints, back up five files and
  export the image. Never commit these files or print their contents.
- Copy and verify all eight proof files outside the VM; verify the OCI archive
  blobs, manifest and config relationship. Store the exact proof privately.
- `apply /private/verified-off-vm.json`: require a fresh backup and unchanged
  compose/image. Recreate only Auth; preserve the other services' effective
  configuration. Run 19 production checks and repeat after restart. Existing
  access/refresh tokens and an Auth-issued dashboard request must work.
- `cleanup-session`: log out only the audit session with `scope=local`, confirm
  refresh rejection and previous client session preservation, then remove the
  temporary session file. Create/copy/verify the post-release backup.
- `rollback`: restore the old compose/image only when the current compose hash
  still matches this release. It refuses later unrelated configuration changes;
  no database restore is involved. If the audit session was already cleaned,
  rollback checks health, preserved data and previous sessions without claiming
  a new password/refresh test. Review the dated state before a later incident.

Production login and refresh update authentication timestamps/session records.
These checks do not constitute a read-only operation or a complete SMTP/OAuth
validation. No WhatsApp or paid AI calls are part of this procedure.

## References

- [Supabase Auth source](https://github.com/supabase/auth/tree/v2.196.0).
- [pgproto3 advisory](https://github.com/advisories/GHSA-jqcq-xjh3-6g23).
- [pgproto3 upstream](https://github.com/jackc/pgproto3).
