# Ceragon-Intelligence's validate lanes are shell, not Node: shellcheck over
# deploy/hetzner/scripts, `docker compose config` for YAML well-formedness, jq
# over the IAM policy JSON, and actionlint over the autobump workflows.
#
# The Docker CLI and the compose plugin come from their upstream static
# releases, not from Debian: bookworm ships neither `docker-compose-plugin` nor
# a `docker compose` subcommand, and `docker.io` would drag in a daemon this
# image must never run. It talks to the HOST daemon over the mounted socket.
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git jq rsync unzip gawk shellcheck procps \
 && rm -rf /var/lib/apt/lists/*

ARG DOCKER_CLI_VERSION=27.3.1
RUN curl -sSfL -o /tmp/docker.tgz \
      "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
 && tar -xzf /tmp/docker.tgz -C /tmp docker/docker \
 && install -m 0755 /tmp/docker/docker /usr/local/bin/docker \
 && rm -rf /tmp/docker.tgz /tmp/docker

ARG COMPOSE_VERSION=2.29.7
RUN mkdir -p /usr/local/lib/docker/cli-plugins \
 && curl -sSfL -o /usr/local/lib/docker/cli-plugins/docker-compose \
      "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
 && chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose \
 && docker compose version

ARG ACTIONLINT_VERSION=1.7.7
RUN curl -sSfL -o /tmp/actionlint.tar.gz \
      "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" \
 && tar -xzf /tmp/actionlint.tar.gz -C /tmp actionlint \
 && install -m 0755 /tmp/actionlint /usr/local/bin/actionlint \
 && rm -f /tmp/actionlint.tar.gz /tmp/actionlint \
 && actionlint --version \
 && shellcheck --version

ENV CI=true
WORKDIR /w
