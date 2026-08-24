# GithubApp-Bot-Scanner-Worker's precision gates are only meaningful against
# the exact analyzer versions CI pins -- a different Semgrep minor moves the
# finding counts the corpus asserts on, so an unpinned local run would report a
# regression the real gate would not, or hide one it would.
#
#   semgrep==1.89.0   security.yml `rule-precision`, quality-precision-gate.yml
#   gitleaks v8.18.4  quality-precision-gate.yml
#   python 3.11       actions/setup-python@v5 in both workflows
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git jq rsync unzip xz-utils procps \
      python3 python3-pip python3-venv build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/analyzers \
 && /opt/analyzers/bin/pip install --no-cache-dir 'setuptools<81' 'semgrep==1.89.0'
ENV PATH=/opt/analyzers/bin:$PATH

ARG GITLEAKS_VERSION=8.18.4
RUN curl -sSfL -o /tmp/gitleaks.tar.gz \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
 && tar -xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks \
 && install -m 0755 /tmp/gitleaks /usr/local/bin/gitleaks \
 && rm -f /tmp/gitleaks.tar.gz /tmp/gitleaks \
 && gitleaks version \
 && semgrep --version



ENV CI=true
ENV npm_config_fund=false
ENV npm_config_audit=false
WORKDIR /w
