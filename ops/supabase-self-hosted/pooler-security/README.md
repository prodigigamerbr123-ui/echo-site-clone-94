# Supavisor candidate on a supported Debian runtime

This is a candidate build and isolated validation procedure, not a production
deployment command. Production still requires a fresh verified backup, immutable
image checks, metadata compatibility checks and an explicit rollback procedure.

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
