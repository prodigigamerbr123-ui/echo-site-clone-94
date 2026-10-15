# Remaining runtime security — 2026-10-15

These recipes preserve application versions and database formats. Private build
manifests, original configuration, container inspections and logs stay outside Git.
Never print runtime environments or copy private release state into this folder.

## Build and validation

Build `Dockerfile.gosu` as `workout-gosu:1.19-go1.26.9`. For database, Evolution
database, Edge and Realtime Dockerfiles, pass the reviewed immutable local image ID
as `--build-arg UPSTREAM_IMAGE=sha256:...`. Do not substitute a moving latest tag.
Cloudflared pins the official 2026.10.0 source commit, updates Go/x/net and uses an
updated Alpine runtime. These are local builds, not official vendor releases.

Preserve build logs, image IDs and scanner JSON. Compare old and candidate with
the same Trivy database; do not suppress residual findings. Record builder IDs and
source checksums when rebuilding: package repositories can change over time.

Before production, compare PostgreSQL/Edge executable hashes and prove backup
recovery with the candidate images. `restore-integrated.py` accepts
`--image-overrides /private/images.json`, mapping service keys to immutable IDs;
`restore-evolution.py` accepts `--database-image sha256:...`. These options affect
disposable restore containers only. Realtime requires isolated tenant health and
restart checks. Cloudflared requires offline ingress validation and readiness.

## Dated release and return

`release.py prepare SNAPSHOT` validates candidate evidence and that only three
Compose image fields change; Evolution PostgreSQL is cloned with the same mounts,
environment and policy. `apply` waits for health and compares data/passwords/functions.
It does not restore a database. `observe` requires the exact post-release Compose.

`optional-images.py` disables transformations, removes the Storage dependency and
puts imgproxy in profile `images`, restart `no`. Normal Storage remains enabled.
It is unused by this application; enabling it later requires a separate review.

`cloudflared-release.py` validates a second connector of the existing tunnel before
switching names; routes and credentials are retained. It creates no new tunnel.

Each script has a guarded `rollback`, prepared but not exercised in production.
Review the current state first. The later optional-image Compose change causes
the earlier four-image return guard to refuse: reverse/review the later change
before considering the older return. Never bypass guards or restore an old dump
to undo an image update. Retained database/tunnel containers are stopped with
restart `no`; never start a second database on the production data volume.

Release evidence, exact IDs, archive hashes and remaining risks:
`docs/auditoria-2026-10-11/fechamento-basico-2026-10-15.md`.
