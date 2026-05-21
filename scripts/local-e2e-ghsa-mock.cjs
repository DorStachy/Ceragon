#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// ═════════════════════════════════════════════════════════════════════════
// 2026-05-20 R5 gap-closure: local-e2e-ghsa-mock.cjs
//
// HTTP server on 127.0.0.1:19189 (by default) that impersonates GitHub's
// advisory endpoint for E2E retest. Modes:
//   --mode=clean       returns [] (empty advisory array, scan looks clean)
//   --mode=rate-limit  returns HTTP 403 with x-ratelimit-remaining: 0
//   --mode=malformed   returns HTTP 200 with `{}` (NOT an array)
//   --mode=fixture     returns a tiny static GHSA-like advisory array
//
// Used by `scripts/local-e2e-reset.ps1 -WithGhsaMock` and by the H1
// procedure's GHSA-degraded phase. Static-Worker is repointed to this
// host via `GHSA_BASE_URL=http://host.docker.internal:19189` — the
// vulnerability scanner's hardcoded `api.github.com` URL was replaced
// with a guarded resolver in Phase C, and the credential-exfiltration
// guard strips `Authorization` from any non-api.github.com request.
// ═════════════════════════════════════════════════════════════════════════

const http = require('http');

const args = process.argv.slice(2);
function arg(name, def) {
  const idx = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx < 0) return def;
  const a = args[idx];
  if (a.includes('=')) return a.split('=').slice(1).join('=');
  return args[idx + 1];
}

const MODE = arg('mode', 'clean');
const PORT = parseInt(arg('port', '19189'), 10);
const HOST = arg('host', '127.0.0.1');

const FIXTURE_ADVISORIES = [
  {
    ghsa_id: 'GHSA-fixture-0001',
    cve_id: 'CVE-2026-FIXTURE',
    summary: 'Local-E2E mock GHSA advisory (DO NOT ship to production)',
    severity: 'high',
    vulnerabilities: [
      {
        package: { ecosystem: 'npm', name: 'flatmap-stream' },
        vulnerable_version_range: '<= 0.1.1',
        patched_versions: null,
      },
    ],
    withdrawn_at: null,
  },
];

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  console.log(`[ghsa-mock] ${req.method} ${url} (mode=${MODE})`);

  if (!url.startsWith('/advisories')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Not Found' }));
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  // Standard rate-limit headers so the static worker's tracker can read them.
  switch (MODE) {
    case 'rate-limit': {
      res.setHeader('x-ratelimit-remaining', '0');
      res.setHeader(
        'x-ratelimit-reset',
        String(Math.floor(Date.now() / 1000) + 3600),
      );
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'API rate limit exceeded' }));
      return;
    }
    case 'malformed': {
      res.statusCode = 200;
      res.end(JSON.stringify({}));
      return;
    }
    case 'fixture': {
      res.statusCode = 200;
      res.setHeader('x-ratelimit-remaining', '4999');
      res.end(JSON.stringify(FIXTURE_ADVISORIES));
      return;
    }
    case 'clean':
    default: {
      res.statusCode = 200;
      res.setHeader('x-ratelimit-remaining', '4999');
      res.end(JSON.stringify([]));
      return;
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ghsa-mock] listening on http://${HOST}:${PORT} mode=${MODE}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[ghsa-mock] caught ${signal} — shutting down`);
    server.close(() => process.exit(0));
  });
}
