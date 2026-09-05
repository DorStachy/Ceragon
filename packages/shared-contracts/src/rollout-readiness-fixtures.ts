/**
 * M3 Rollout Governance — shared readiness fixture battery (LOCK-2).
 *
 * `computeReadiness` (Backend import) and `lib/ai/readiness.ts` (Frontend
 * reimpl) MUST both satisfy every vector here. Split into its own file
 * (mirrors `worker-result-fixtures.ts`) so the fixtures can be imported without
 * pulling logic, and consumed by the `.cjs` golden runner + both jest suites.
 */

import type {
  ComputeReadinessInput,
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
  };
  note: string;
}

export const READINESS_VECTORS: readonly ReadinessVector[] = [
  {
    input: {
      controls: { webAiGuard: { state: 'active' } },
      attestedAt: FRESH,
      usage: { webAiGuard: true },
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'ready', gaps: [] },
    note: 'HR machine: browser-only, Web AI Guard active, everything else n/a → ready',
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
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'ready', gaps: [] },
    note: 'all-active dev machine → ready',
  },
  {
    input: {
      controls: { packageGate: { state: 'inactive' } },
      attestedAt: FRESH,
      usage: { packageGate: true },
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
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'ready', gaps: [] },
    note: 'used but platform-unsupported → not-applicable, not a gap → ready',
  },
  {
    input: {
      controls: { proxy: { state: 'unknown' } },
      attestedAt: FRESH,
      usage: { proxy: true },
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
      health: okHealth(),
      nowIso: NOW,
    },
    expected: { verdict: 'ready', gaps: [] },
    note: 'monitoring (detect-mode) counts as protected → ready',
  },
  {
    input: {
      controls: { packageGate: { state: 'inactive' } },
      attestedAt: FRESH,
      usage: { packageGate: true },
      health: { ...okHealth(), online: false },
      nowIso: NOW,
    },
    expected: { verdict: 'not-ready' },
    note: 'health failure outranks a usage gap → not-ready',
  },
];
