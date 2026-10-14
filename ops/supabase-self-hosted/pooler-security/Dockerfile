# Same Supavisor source; patched Elixir 1.18/OTP 27, Bookworm builder/Trixie runtime.
FROM hexpm/elixir:1.18.4-erlang-27.3.4.16-debian-bookworm-20260824-slim@sha256:dde28876be197773dfc507426802bcedd2671bb411ad0517c33fc296aadf1f3f AS builder
RUN apt-get update && apt-get install -y --no-install-recommends build-essential git curl ca-certificates cmake libclang-dev \
    && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup.sh \
    && sh /tmp/rustup.sh -y --profile minimal --default-toolchain 1.90.0 && rm /tmp/rustup.sh
ENV PATH="/root/.cargo/bin:${PATH}" MIX_ENV=prod CARGO_BUILD_JOBS=2 ERL_FLAGS="+S 2:2"
WORKDIR /app
RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock VERSION ./
RUN mix deps.get --only prod
COPY config/config.exs config/prod.exs config/
RUN mix deps.compile
COPY priv priv
COPY lib lib
COPY native native
RUN mix compile
COPY config/runtime.exs config/
COPY rel rel
RUN mix release supavisor

FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libstdc++6 libssl3t64 libncurses6 locales tini ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8 LANGUAGE=en_US:en LC_ALL=en_US.UTF-8 MIX_ENV=prod RLIMIT_NOFILE=100000 ECTO_IPV6=true
ENV ERL_AFLAGS="-proto_dist inet6_tcp"
WORKDIR /app
RUN chown nobody /app
COPY --from=builder --chown=nobody:root /app/_build/prod/rel/supavisor ./
COPY limits.sh /app/limits.sh
ENTRYPOINT ["/usr/bin/tini", "-s", "-g", "--", "/app/limits.sh"]
CMD ["/app/bin/server"]
