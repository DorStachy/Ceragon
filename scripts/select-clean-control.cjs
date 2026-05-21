#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// ═════════════════════════════════════════════════════════════════════════
// 2026-05-20 R5 gap-closure: select-clean-control.cjs
//
// Selects a "clean control" package for E2E retest by querying OSV at
// test time. The previous fixture (`lodash@4.17.21`) gained 2026
// advisories (GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh) and stopped
// being clean, breaking the retest. This script picks the first package
// from CANDIDATES whose OSV query returns zero vulnerabilities.
//
// Output: JSON `{ ecosystem, name, version }` on stdout, suitable for
// the resolved-coords substitution in the H1 procedure.
// ═════════════════════════════════════════════════════════════════════════

const https = require('https');

const CANDIDATES = [
  { ecosystem: 'npm', name: 'is-arrayish', version: '0.3.2' },
  { ecosystem: 'npm', name: 'is-number', version: '7.0.0' },
  { ecosystem: 'npm', name: 'kind-of', version: '6.0.3' },
  // Add more low-risk leaf packages as needed.
];

function osvEcosystem(eco) {
  switch (eco) {
    case 'npm': return 'npm';
    case 'pypi': return 'PyPI';
    case 'cargo': return 'crates.io';
    case 'go': return 'Go';
    default: return eco;
  }
}

function queryOsv(candidate) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      package: { name: candidate.name, ecosystem: osvEcosystem(candidate.ecosystem) },
      version: candidate.version,
    });
    const req = https.request({
      hostname: 'api.osv.dev',
      path: '/v1/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          resolve({ candidate, vulns: parsed.vulns || [] });
        } catch (e) {
          reject(new Error(`OSV malformed response for ${candidate.name}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  for (const c of CANDIDATES) {
    try {
      const { vulns } = await queryOsv(c);
      if (vulns.length === 0) {
        console.log(JSON.stringify(c));
        return;
      }
      console.error(`[select-clean-control] ${c.name}@${c.version} has ${vulns.length} OSV vulns — skipping`);
    } catch (e) {
      console.error(`[select-clean-control] OSV query failed for ${c.name}@${c.version}: ${e.message}`);
    }
  }
  console.error(
    `[select-clean-control] No clean candidate found. Update CANDIDATES with newer pinned releases.`,
  );
  process.exit(1);
}

main();
