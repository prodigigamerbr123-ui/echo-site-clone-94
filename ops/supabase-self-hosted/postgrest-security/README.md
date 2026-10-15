# PostgREST runtime hardening

This procedure preserves PostgREST 14.17's exact ARM64 binary, SHA256
`4eee06ead8d14318fd02ea182f919cca0c9487b01a4780dffe9532664155e8c8`.
Only its runtime changes. The upstream ARM64 Dockerfile installs development
packages; this image installs runtime libraries, updates Ubuntu packages, removes
the unused Pebble executable and strips setuid/setgid bits. Package metadata is
retained. Kernel header findings are not evidence of the host kernel's state.

## Build and isolated checks

Copy Dockerfile and build-candidate.py into the private VM directory
`/home/ubuntu/workout-postgrest-security-20261014` and run
`sudo python3 build-candidate.py`. It verifies the current production image,
preserves source/base digests, scans the old and new image with the same Trivy
database, checks binary identity/version/linkage and refuses existing evidence.
APT resolution can change on a future rebuild; preserve the tested immutable
image rather than assuming a later build reproduces it.

Run `sudo python3 verify-isolated.py` only after the candidate has zero critical
and high findings. Its 41 checks use an internal Docker network, PostgreSQL on
tmpfs, synthetic secrets/records and no published ports or application workers.
Checks cover JWT rejection, role permissions, RLS across two identities, CRUD,
Unicode, pagination/counts, RPC, transaction-local pre-request hooks, concurrency,
restart and runtime controls. Cleanup is checked and evidence stays private.

Set PGRST_SERVER_HOST=0.0.0.0 and PGRST_ADMIN_SERVER_PORT=3001 in the fixture;
the health CLI needs an explicit usable hostname. GET transactions are read-only:
the fixture hook uses a local GUC, not a persistent audit INSERT. Image permission
bits are inspected in a separate root container without network or writable root;
the API fixture itself remains UID/GID 1000 with dropped capabilities.

## Production procedure

`release.py` is specific to `/home/ubuntu/workout-postgrest-release-20261014` and
requires Python 3, PyYAML, the reviewed images and completed isolated evidence.

- `observe`: read-only API and health checks. It signs a short-lived JWT for the
  existing active admin using the private server secret; this checks PostgREST
  authorization and does not exercise the Auth password-login flow.
- `prepare`: verify 41 checks and zero critical/high findings, preserve the old
  compose/private inspection, create a five-file backup and export the candidate.
- `apply /private/independent-proof.json`: require independently computed hashes
  for eight copied files, a fresh backup, unchanged inventory/compose and image;
  update only rest, retaining every other service's effective configuration.
  Require 17 checks and repeat them after a deliberate restart.
- `rollback`: check current compose hash and old image identity, restore the
  previous compose and recreate only rest. No database restore or migration.

Current runtime controls are non-root UID/GID 1000, read-only rootfs, cap_drop ALL,
no-new-privileges and a 256 PID limit. Production checks read students/dashboard,
verify anonymous rejection, Auth/Storage and preserve the hardened pooler. They
do not send WhatsApp or invoke paid AI. Do not overwrite private evidence or reuse
a dated rollback after later compose changes.

Residual medium/low packages, Haskell dependency coverage, host security, sustained
load and full application disaster recovery remain separate work. A clean Trivy
critical/high result does not establish that the entire system is secure.

## Primary references

- [Upstream ARM64 Dockerfile](https://github.com/PostgREST/postgrest/blob/v14.17/Dockerfile).
- [PostgREST health CLI](https://docs.postgrest.org/en/v14/references/cli.html).
