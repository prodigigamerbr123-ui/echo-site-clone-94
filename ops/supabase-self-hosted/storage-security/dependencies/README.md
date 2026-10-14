# Storage dependency security release

This recipe keeps Storage 1.74.0 application code and migrations. It replaces vulnerable npm dependencies within their existing major versions and copies Node 24.21.0 from the digest-pinned official Alpine image. Node's embedded Undici is independent of the npm package; both must be checked.

## Fixed baseline

- Original dependency image: `supabase/storage-api:v1.74.0@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85`.
- Hardened runtime parent: local `workout-storage:1.74.0-security1`, required image ID `sha256:527e41281258698d48648b9d2e6f881956393028f18a09967ec6bc9e2c115e42`.
- Candidate tag: `workout-storage:1.74.0-security2`; deployment binds to the resulting immutable ID in the private candidate manifest.
- Node source: `node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2`.

Verify the local parent ID before building. Do not trust its tag alone. npm is used only in the dependency build stage; the runtime keeps npm/Corepack/build tools absent. Installation scripts are disabled. Native addon behavior and Node ABI must pass validation.

## Build and validation

The VM package directory is `/home/ubuntu/workout-storage-dependencies-20261014`. Copy the recipe and Python tools there through an authenticated operator channel; keep generated reports private.

```text
docker build --force-rm -t workout-storage:1.74.0-security2 /home/ubuntu/workout-storage-dependencies-20261014
python3 /home/ubuntu/workout-storage-dependencies-20261014/validate-candidate.py
```

Use the installed Docker builder; this VM does not support BuildKit's `--progress` option. `validate-candidate.py` scans the immutable image using the same Trivy database snapshot as the production baseline, rejects critical/high findings, and invokes isolated Storage integration tests. It never changes production. Review `validation-state.json`, `hardened-summary.json`, and `stage-validation.json`; a completed build alone is insufficient.

The final dependency directory is replaced as a whole to avoid retaining stale nested modules. `dist` and `migrations` hashes must match the stage baseline. Tests cover private object operations, permission failures, signed URLs, cleanup, native xattr and runtime version/ABI. They do not call WhatsApp or Gemini.

npm resolves a resulting lockfile during this build. Preserve its bytes/hash and the candidate image ID with release evidence. A future rebuild may resolve a different graph and requires a fresh scan and validation; this recipe alone is not a guarantee of bit-identical rebuilds.

## Production gate and rollback

`release.py prepare` requires the original image, healthy services, a passing candidate report and an empty production Storage inventory. It preserves compose/container inspections privately and generates a complete backup. Copy all four backup files and both release files independently; compare hashes and upload only the matching proof JSON before `apply`.

`apply` rechecks image IDs, compose hash and inventory; it recreates only Storage with `--no-deps --pull never`. Failure invokes image/config rollback. `rollback` restores only the prior compose/image, never a database snapshot. Do not rewrite release state or bypass a failed gate. The dated scripts reject drift and should not be reused for a later release without review.

## Primary sources

- [Fastify 5.12.2 security release](https://github.com/fastify/fastify/releases/tag/v5.12.2).
- [gRPC JavaScript 1.14.5](https://github.com/grpc/grpc-node/releases/tag/@grpc%2Fgrpc-js@1.14.5).
- [Undici 7.29.1](https://github.com/nodejs/undici/releases/tag/v7.29.1).
- [Official Node Alpine recipe](https://github.com/nodejs/docker-node/blob/main/24/alpine3.23/Dockerfile).
- [Supabase self-hosted updating](https://supabase.com/docs/guides/self-hosting/updating).
