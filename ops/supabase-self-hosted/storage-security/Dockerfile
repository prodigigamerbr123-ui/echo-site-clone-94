# Preserve Storage application and migrations; remove build-time tools from runtime.
FROM supabase/storage-api:v1.74.0@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85
RUN apk add --no-cache libstdc++ \
    && apk upgrade --no-cache \
    && apk del g++ make python3 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg
