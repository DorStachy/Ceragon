// ════════════════════════════════════════════════════════════════════════
// Canonical SQS job-body contract (P0-6, 2026-05-14 stabilization plan).
//
// Pins the wire shape of:
//   - fetch-job messages on cera-fetch_jobs[_exec_now]-staging (Backend
//     producer → Static-Worker consumer)
//   - sandbox-job messages on cera-sandbox_jobs[_exec_now]-staging
//     (Backend producer → Sandbox-Worker consumer)
//
// Both directions must agree on:
//   - The full set of top-level keys on the SQS message body.
//   - `siteId: string | null | undefined` for account-scoped jobs.
//     Backend explicitly emits `siteId: null` when an account-scoped fetch
//     is enqueued (`Backend/src/jobs/job-queue.service.ts:775`); the
//     worker-side Zod schemas were tightened in P0-6 to accept null.
//
// Bump policy mirrors `worker-result-contract.ts`: any add/remove/rename
// of an allowed key requires bumping the version constant in lockstep
// with the worker-side schemas and Backend `JobQueueService` field set.
// ════════════════════════════════════════════════════════════════════════

export const SQS_JOB_CONTRACT_VERSION = 1 as const;

// ── Fetch job body (Backend → Static-Worker) ───────────────────────────

export const ALLOWED_FETCH_JOB_KEYS = [
  'id',
  'ecosystem',
  'name',
  'version',
  'integrity',
  'priority',
  'createdAt',
  'attempts',
  'artifactS3Key',
  'tenantId',
  'agentId',
  'siteId',
  'correlationId',
  'analysisId',
  'packageBaselineFingerprint',
] as const;

export const ALLOWED_FETCH_JOB_KEY_SET: ReadonlySet<string> = new Set(
  ALLOWED_FETCH_JOB_KEYS,
);

export interface FetchJobContract {
  id: string;
  ecosystem: 'npm' | 'pypi' | 'cargo' | 'go';
  name: string;
  version: string;
  integrity?: string | null;
  priority?: number;
  createdAt?: string;
  attempts?: number;
  artifactS3Key?: string | null;
  tenantId?: string;
  agentId?: string;
  /** account-scoped jobs carry siteId=null on the wire. */
  siteId?: string | null;
  correlationId?: string;
  analysisId?: string;
  packageBaselineFingerprint?: unknown;
}

export function isAllowedFetchJobKey(key: string): boolean {
  return ALLOWED_FETCH_JOB_KEY_SET.has(key);
}

export function findUnknownFetchJobKeys(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => !ALLOWED_FETCH_JOB_KEY_SET.has(k));
}

// ── Sandbox job body (Backend → Sandbox-Worker) ────────────────────────

export const ALLOWED_SANDBOX_JOB_KEYS = [
  'schemaVersion',
  'jobType',
  'intent',
  'ecosystem',
  'tool',
  'tenantId',
  'agentId',
  'siteId',
  'correlationId',
  'target',
  'createdAt',
  'id',
  'originalAnalysisId',
  'evidence',
  'attempts',
  'priority',
  'fetchContext',
  'sandboxTriggerExpectations',
  'sandboxTriggerProfile',
  'context',
] as const;

export const ALLOWED_SANDBOX_JOB_KEY_SET: ReadonlySet<string> = new Set(
  ALLOWED_SANDBOX_JOB_KEYS,
);

export interface SandboxJobContract {
  schemaVersion: string;
  jobType: 'SANDBOX';
  intent: 'INSTALL' | 'EXEC_NOW';
  ecosystem: 'npm' | 'pypi' | 'cargo' | 'go';
  tool: string;
  tenantId: string;
  agentId: string;
  /** account-scoped jobs carry siteId=null on the wire. */
  siteId?: string | null;
  correlationId: string;
  target: Record<string, unknown>;
  createdAt: string;
  id?: string;
  originalAnalysisId?: string;
  evidence?: { artifactS3Key?: string; telemetryS3Prefix?: string };
  attempts?: number;
  priority?: number;
  fetchContext?: unknown;
  sandboxTriggerExpectations?: unknown;
  sandboxTriggerProfile?: unknown;
  context?: unknown;
}

export function isAllowedSandboxJobKey(key: string): boolean {
  return ALLOWED_SANDBOX_JOB_KEY_SET.has(key);
}

export function findUnknownSandboxJobKeys(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => !ALLOWED_SANDBOX_JOB_KEY_SET.has(k));
}
