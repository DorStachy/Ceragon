# Installers' Go lanes pin `go-version: '1.24.x'`, and the scanner-parity lane
# additionally needs Node 22 in the same job because it runs the Go corpus and
# the browser-extension JS corpus against one shared set of golden vectors.
#
# Node is copied out of the official image rather than installed from
# NodeSource so the version is pinned by the base tag and no network repo has
# to be trusted at build time.
FROM golang:1.24

COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git jq rsync unzip shellcheck procps \
 && rm -rf /var/lib/apt/lists/*

# GOFLAGS/-buildvcs=false: the runner copies the source into /w WITHOUT .git,
# so the toolchain must not try to stamp VCS metadata into binaries.
ENV CI=true
ENV GOFLAGS=-buildvcs=false
ENV GOPATH=/gocache/gopath
ENV GOCACHE=/gocache/build
WORKDIR /w
