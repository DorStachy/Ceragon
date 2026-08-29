# Backend runs every PR lane on Node 24 (`node-version: 24.x` in pr-checks.yml,
# build.yml and security.yml). Same additions as node20.Dockerfile; see the
# comment there for why each one is present.
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git jq rsync unzip xz-utils procps \
      postgresql-client python3 build-essential \
 && rm -rf /var/lib/apt/lists/*


# Deliberately NO `corepack enable`. The image should provide exactly what
# `actions/setup-node` provides and nothing more. Enabling corepack installs a
# /usr/local/bin/pnpm shim, and Static-Worker's workflow then fails on
# `npm install -g pnpm` with EEXIST -- a failure that exists only locally,
# which is the definition of a mirror that lies. Repos that need pnpm install it
# themselves, exactly as they do on GitHub.
ENV CI=true
ENV npm_config_fund=false
ENV npm_config_audit=false
WORKDIR /w
