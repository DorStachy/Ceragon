# Mirrors what `actions/setup-node@v4 with node-version: 20.x` gives a job on
# `ubuntu-latest`, plus the handful of things GitHub's runner image ships by
# default that a slim Node image does not: git (jest snapshot paths and
# `git diff --exit-code` lockfile guards need it), rsync (the runner copies the
# read-only source mount into the writable workspace), jq, curl, and a psql
# client for the gates that assert against a live database.
#
# Pinned to -slim, not -alpine: the repos build native modules (bcrypt, sharp)
# and musl builds diverge from what production runs on.
FROM node:20-bookworm-slim

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
