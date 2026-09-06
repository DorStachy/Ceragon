/**
 * M3 Rollout Governance — shared readiness fixture battery (LOCK-2).
 *
 * `computeReadiness` (Backend import) and `lib/ai/readiness.ts` (Frontend
 * reimpl) MUST both satisfy every vector here. Split into its own file
 * (mirrors `worker-result-fixtures.ts`) so the fixtures can be imported without
 * pulling logic, and consumed by the `.cjs` golden runner + both jest suites.
 *
 * F6 — every vector now carries `verification`. That is the intended tripwire:
 * the field is REQUIRED on `ComputeReadinessInput`, so a consumer that has not
 * been taught about server-side verification fails to COMPILE rather than
 * silently keeping the old endpoint-self-report meaning of `protected`.
 */

import type {
  ComputeReadinessInput,
  ControlDisplayStatus,
  EndpointHealthSignals,
  RolloutReadinessVerdict,
} from './rollout-readiness-contract';
import type { EndpointControlKey } from './endpoint-controls-contract';

const NOW = '2026-07-08T12:00:00.000Z';
const FRESH = '2026-07-08T11:59:00.000Z'; // 1 min ago — within the window
const STALE = '2026-07-08T11:00:00.000Z'; // 1 h ago — beyond the 15 min window

function okHealth(): EndpointHealthSignals {
  return {
    installed: true,
    online: true,
    policySynced: true,
    evidenceIntact: true,
    noActiveBypass: true,
  };
}

export interface ReadinessVector {
  input: ComputeReadinessInput;
  expected: {
    verdict: RolloutReadinessVerdict;
    /** Optional exact gap-key assertion (order-insensitive). */
    gaps?: EndpointControlKey[];
    /** Optional per-control display-status assertion (F6). */
    controlStatuses?: Partial<Record<EndpointControlKey, ControlDisplayStatus>>;
  };
  note: string;
}

export const READINESS_VECTORS: readonly ReadinessVector[] = [
  {
    input: {
      controls: { webAiGuard: { state: 'active' } },
      attestedAt: FRESH,
      usage: { webAiGuard: true },
      verification: { webAiGuard: true },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: {
      verdict: 'ready',
      gaps: [],
      controlStatuses: { webAiGuard: 'protected' },
    },
    note: 'HR machine: browser-only, Web AI Guard active AND server-verified → ready',
  },
  {
    input: {
      controls: {
        proxy: { state: 'active' },
        hooks: { state: 'active' },
        packageGate: { state: 'active' },
        push: { state: 'active' },
        webAiGuard: { state: 'active' },
        mcp: { state: 'active' },
      },
      attestedAt: FRESH,
      usage: {
        proxy: true,
        hooks: true,
        packageGate: true,
        push: true,
        webAiGuard: true,
        mcp: true,
      },
      verification: {
        proxy: true,
        hooks: true,
        packageGate: true,
        push: true,
        webAiGuard: true,
        mcp: true,
      },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'ready', gaps: [] },
    note: 'all-active, all server-verified dev machine → ready',
  },
  {
    input: {
      controls: { packageGate: { state: 'inactive' } },
      attestedAt: FRESH,
      usage: { packageGate: true },
      verification: {},
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'at-risk', gaps: ['packageGate'] },
    note: 'npm used but package gate inactive → gap (at-risk)',
  },
  {
    input: {
      controls: {},
      attestedAt: FRESH,
      usage: { hooks: true },
      verification: {},
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'at-risk', gaps: ['hooks'] },
    note: 'coding agent used but hooks never attested → gap (at-risk)',
  },
  {
    input: {
      controls: { webAiGuard: { state: 'active' } },
      attestedAt: STALE,
      usage: { webAiGuard: true },
      verification: { webAiGuard: true },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'unknown' },
    note: 'stale attestation is never green → unknown',
  },
  {
    input: {
      controls: { webAiGuard: { state: 'active' } },
      attestedAt: null,
      usage: { webAiGuard: true },
      verification: { webAiGuard: true },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'unknown' },
    note: 'never attested → unknown',
  },
  {
    input: {
      controls: { proxy: { state: 'active' } },
      attestedAt: FRESH,
      usage: { proxy: true },
      verification: { proxy: true },
      health: { ...okHealth(), online: false },
      nowIso: NOW,
    },
    expected: { verdict: 'not-ready' },
    note: 'offline → not-ready (universal health fails)',
  },
  {
    input: {
      controls: { proxy: { state: 'active' } },
      attestedAt: FRESH,
      usage: { proxy: true },
      verification: { proxy: true },
      health: { ...okHealth(), evidenceIntact: false },
      nowIso: NOW,
    },
    expected: { verdict: 'not-ready' },
    note: 'evidence-chain broken → not-ready',
  },
  {
    input: {
      controls: { proxy: { state: 'active' } },
      attestedAt: FRESH,
      usage: { proxy: true },
      verification: { proxy: true },
      health: { ...okHealth(), policySynced: false },
      nowIso: NOW,
    },
    expected: { verdict: 'not-ready' },
    note: 'policy out of sync → not-ready',
  },
  {
    input: {
      controls: { proxy: { state: 'active' } },
      attestedAt: FRESH,
      usage: { proxy: true },
      verification: { proxy: true },
      health: { ...okHealth(), noActiveBypass: false },
      nowIso: NOW,
    },
    expected: { verdict: 'not-ready' },
    note: 'active bypass/tamper → not-ready',
  },
  {
    input: {
      controls: {},
      attestedAt: null,
      usage: {},
      verification: {},
      health: { ...okHealth(), installed: false },
      nowIso: NOW,
    },
    expected: { verdict: 'unknown' },
    note: 'agent not installed → unknown, never not-ready',
  },
  {
    input: {
      controls: { webAiGuard: { state: 'unsupported' } },
      attestedAt: FRESH,
      usage: { webAiGuard: true },
      verification: {},
      health: okHealth(),
      nowIso: NOW,
    },
    expected: {
      verdict: 'ready',
      gaps: [],
      controlStatuses: { webAiGuard: 'not-applicable' },
    },
    note: 'used but platform-unsupported → not-applicable, not a gap → ready',
  },
  {
    input: {
      controls: { proxy: { state: 'unknown' } },
      attestedAt: FRESH,
      usage: { proxy: true },
      verification: {},
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'unknown', gaps: [] },
    note: 'used but state unknown → unknown verdict (never false ready)',
  },
  {
    input: {
      controls: { packageGate: { state: 'inactive' } },
      attestedAt: FRESH,
      usage: { packageGate: false },
      verification: {},
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'ready', gaps: [] },
    note: 'inactive control for an UNUSED tool → not-applicable, no false gap → ready',
  },
  {
    input: {
      controls: { proxy: { state: 'monitoring' } },
      attestedAt: FRESH,
      usage: { proxy: true },
      verification: { proxy: true },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: {
      verdict: 'ready',
      gaps: [],
      controlStatuses: { proxy: 'protected' },
    },
    note: 'monitoring (detect-mode), server-verified, counts as protected → ready',
  },
  {
    input: {
      controls: { packageGate: { state: 'inactive' } },
      attestedAt: FRESH,
      usage: { packageGate: true },
      verification: {},
      health: { ...okHealth(), online: false },
      nowIso: NOW,
    },
    expected: { verdict: 'not-ready' },
    note: 'health failure outranks a usage gap → not-ready',
  },

  /* ── F6: the endpoint's self-report is not a verification ────────────────── */

  {
    input: {
      controls: { mcp: { state: 'active' } },
      attestedAt: FRESH,
      usage: { mcp: true },
      verification: { mcp: false },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: {
      verdict: 'unknown',
      gaps: [],
      controlStatuses: { mcp: 'self-reported' },
    },
    note: 'F6 — used + active but NOT server-verified → self-reported, verdict unknown (never ready)',
  },
  {
    input: {
      controls: { proxy: { state: 'monitoring' } },
      attestedAt: FRESH,
      usage: { proxy: true },
      verification: {},
      health: okHealth(),
      nowIso: NOW,
    },
    expected: {
      verdict: 'unknown',
      gaps: [],
      controlStatuses: { proxy: 'self-reported' },
    },
    note: 'F6 — an ABSENT verification key is unverified: monitoring reads self-reported, never protected',
  },
  {
    input: {
      controls: {
        webAiGuard: { state: 'active' },
        packageGate: { state: 'inactive' },
      },
      attestedAt: FRESH,
      usage: { webAiGuard: true, packageGate: true },
      verification: { webAiGuard: false },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: {
      verdict: 'at-risk',
      gaps: ['packageGate'],
      controlStatuses: {
        webAiGuard: 'self-reported',
        packageGate: 'unprotected-used',
      },
    },
    note: 'F6 — a real gap still outranks a self-report, and a self-report is never itself a gap',
  },
  {
    input: {
      controls: { hooks: { state: 'active' } },
      attestedAt: FRESH,
      usage: { hooks: false },
      verification: {},
      health: okHealth(),
      nowIso: NOW,
    },
    expected: {
      verdict: 'ready',
      gaps: [],
      controlStatuses: { hooks: 'not-applicable' },
    },
    note: 'F6 — verification is irrelevant for an UNUSED tool: still not-applicable, still ready',
  },
];
