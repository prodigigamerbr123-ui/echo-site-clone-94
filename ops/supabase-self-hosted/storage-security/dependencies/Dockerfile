# Run only after verifying both local image IDs against the release manifest.
FROM supabase/storage-api:v1.74.0@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85 AS dependencies
COPY apply-overrides.cjs /tmp/apply-overrides.cjs
RUN node /tmp/apply-overrides.cjs \
    && npm install --omit=dev --ignore-scripts --no-audit --no-fund

# This local parent was already hardened and validated in the preceding release.
# The build operator must reject a different parent ID, even if its tag matches.
FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS node_runtime
FROM workout-storage:1.74.0-security1
RUN rm -rf /app/node_modules /usr/local/include/node /usr/local/share/doc/node
COPY --from=dependencies /app/node_modules /app/node_modules
COPY --from=dependencies /app/package.json /app/package-lock.json /app/
COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
ENV NODE_VERSION=24.21.0
