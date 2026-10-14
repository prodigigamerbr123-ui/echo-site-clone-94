# Supavisor candidate on a supported Debian runtime

Current deployment: `workout-supavisor:2.9.12-security1` is published and healthy.
See [the release evidence](../../../docs/auditoria-2026-10-11/pooler-publicacao-2026-10-14.md).
The candidate sections below preserve earlier gates and rejected attempts.
Residual package warnings remain open; this is not an audit completion claim.

## Recipe

- Supavisor 2.9.12 source commit: `e8719d9ac5a43604c46d2d9e15bb34c76dea8f12`.
- Source archive SHA256 is checked before extracting with Python's data filter.
- Builder and runtime images are pinned by digest. Elixir 1.18.4 / OTP 27.3.4.16
  replace the original 1.18.2 / 27.2.1 within the same language/runtime series.
- The runtime contains Trixie libraries, locale, certificates, curl and tini.
  Compilation uses Bookworm; native linkage and runtime behavior must be checked.
  Compilers, Rust, Git, PostgreSQL tools, Exim and development headers stay out of
  the final image. Runtime packages receive available Debian updates at build time.
- The application uses upstream `mix.lock`; Debian packages and Hex/Rebar
  bootstrap tools are resolved at build time. Preserve the resulting immutable
  image and build evidence; rebuilding later requires a fresh validation.

The Debian 12 runtime candidate still had one critical and 62 high findings and
was rejected. Its image and scan are preserved; no alerts were suppressed.
The earlier attempt with OTP 27.2.1 failed TLS certificate verification when
bootstrapping Hex. Its logs are preserved privately. Certificate checking must
remain enabled; do not work around this using unsafe TLS settings.

## Running on the VM

Copy these files to `/home/ubuntu/workout-pooler-security-20261014` with mode 700
on the directory. Run `sudo python3 build-candidate.py` from the intended VM.
It refuses to overwrite an existing attempt, limits Docker build CPU/memory,
records source provenance and scans the resulting image with Trivy.

`sudo python3 verify-isolated.py` requires a completed scan with no critical/high
findings. For isolated compatibility diagnosis of a rejected image, the explicit
`--functional-only` option permits those private tests and still records production
promotion as blocked. Neither mode deploys production. It creates only `workout-pooler-check-20261014-*` resources: an internal
network, PostgreSQL on tmpfs and a candidate pooler. It uses fresh fixture secrets,
publishes no ports and never reads production credentials or student records.
Checks exercise both ports, transactions, rollback/commit, prepared statements in
session mode, concurrency, incorrect passwords, restricted SQL access and restart.
The fixture containers/network and environment file are removed afterward.

Do not point this validator at production or reuse production encryption keys.
Keep logs, generated environment files, scans and resolved archives outside Git.
An image scan does not prove coverage of all Erlang libraries or application
behavior; longer load tests and application compatibility remain separate checks.

## Application dependency gate

Run `python audit-hex.py --output /path/outside/git/hex-audit.json` to query OSV
for the pinned source's Hex packages. It preserves advisory details and aliases,
refuses to overwrite evidence and prints counts only. The first query covered 82
locked Hex packages and returned 61 advisory records across 12 packages. These
are records, not 61 distinct exploitable vulnerabilities. Check installed runtime
versions, development-only packages, duplicate aliases and relevant code paths.
Git dependencies, Rust/C native code and custom OTP builds need additional review.

Passing the image scan and connection tests does not authorize promoting this
candidate while application dependency triage remains open. For example, the
Cloak AES-CTR advisory must be compared with the configured AES-GCM cipher, and
the Phoenix long-poll advisory requires checking whether that transport is used.

## Dependency candidate

`build-dependencies.py` prepares a separate workspace at
`/home/ubuntu/workout-pooler-dependencies-20261014`. Copy it and
`Dockerfile.dependencies` there. It requires the previously reviewed local
builder/runtime images by immutable ID, then patches only declared version pins.
It unlocks the nine correction targets plus Finch, retains every other Hex
version and Git lock entry, replaces the assembled release in full and checks
that obsolete copies are absent. Preserve these parent images; a different
builder after VM recovery requires review and validation of its provenance.

The candidate reduced OSV records from 61 across 12 packages to six across four
packages. At that stage, the OS image still had 48 high findings and promotion
was blocked pending review. The subsequent hardened release is documented below.

Run `verify-isolated.py --candidate dependencies --functional-only` for the
disposable validation. Its 21 checks include the original SQL tests, six cases
of the real Supavisor JIT authorization helper through Req's Plug adapter, and
a loopback Cowboy listener rejecting a CRLF response header. No external auth
provider is called. Node RPC uses explicit loopback addressing only in this
fixture. Cleanup is verified before the result is marked functional_passed.

Audit the actual generated lock using
`audit-hex.py --lockfile resolved-mix.lock --output /private/path/hex-audit.json`.
Without `--lockfile`, the tool continues to audit the original upstream source.
See `docs/auditoria-2026-10-11/pooler-dependencias-2026-10-14.md` for exact image,
versions, residual advisory conditions and evidence hashes.

## Hardened runtime and reviewed release

`build-runtime.py` and `Dockerfile.runtime` inherit the exact reviewed dependency
image, remove setuid/setgid bits and run as UID/GID 65534. They preserve package
metadata and scan results. Copy both files to the private runtime directory
`/home/ubuntu/workout-pooler-runtime-20261014`; run with root on the intended VM.
The builder refuses to overwrite existing evidence.

`verify-isolated.py --candidate hardened --functional-only` performs 32 checks,
including upgrading the old image on fresh fixture metadata, unchanged encrypted
users/migrations, SQL/JIT behavior, non-root execution, read-only rootfs, dropped
capabilities, PID limits, temporary writes and restart. It does not deploy.
The strict zero-high scan gate remains false; functional success alone is not a
promotion decision.

`restore-metadata.py BACKUP_STAMP` restores only pooler.dump in a disposable,
networkless PostgreSQL. It compares tenant/user hashes and migration history with
read-only production evidence. Unlike the functional fixture, this procedure
reads private production metadata; never expose its artifacts or start workers.
It does not prove full Workout recovery.

`release-runtime.py` requires Python 3 and PyYAML on the VM. Its fixed private
release directory is `/home/ubuntu/workout-pooler-runtime-release-20261014`:

- `prepare`: verify immutable images, exact reviewed residual CVEs, 32 checks,
  restored metadata, fresh complete backup and healthy production; preserve state.
- `apply /private/independent-proof.json`: require independently copied hashes of
  five backup files, previous compose/inspection and exported image; replace only
  supavisor and require unchanged inventory plus 12 post-publication checks.
- `rollback`: verify current compose hash and old image before restoring the
  previous compose and recreating only the pooler. No database restore is needed.

These are date-specific guarded procedures, not a general deployment CLI. Review
all paths and existing state before reuse. Production applies read_only, cap_drop
ALL, no-new-privileges, tmpfs and PID limits in compose. NODE_IP loopback is valid
for the reviewed single-node installation only. Database role privileges and
residual Decimal/Cloak/Cowlib and OS advisories remain separate work.
