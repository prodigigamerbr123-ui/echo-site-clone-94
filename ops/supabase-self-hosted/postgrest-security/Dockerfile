# Preserve the exact upstream ARM64 executable; replace only its runtime.
FROM postgrest/postgrest:v14.17@sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c AS upstream
FROM ubuntu:resolute@sha256:678c6550cc43645e08669028bc177f50be4e7c5b8cca677067b1914d4afc7a03
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends libpq5 libnuma1 libgmp10 zlib1g ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && rm -f /usr/bin/pebble \
    && find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -exec chmod a-s {} +
COPY --from=upstream /usr/bin/postgrest /usr/bin/postgrest
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=5s --retries=3 CMD ["postgrest", "--ready"]
CMD ["postgrest"]
