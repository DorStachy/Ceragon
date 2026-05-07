# Phase 8 — Policy-Aware Day-to-Day Retest Plan

Template for the post-cleanup retest. Pre-requisite: Phase 6 + Phase 7 complete and Phase 6 controllers restored.

## Principle

**Simulate normal developer behavior first.** Every expected verdict must be derived from the active policy, not from scanner assumptions alone. The Phase 4 chain enrichment (`policyAction → effectiveAction → runtimeAction`) is the source-of-truth for how to write expected values.

## Per-test-case schema

Each retest case is recorded with:

| Field | Notes |
|---|---|
| `date/time` | ISO timestamp at CLI invocation start |
| `package manager` | `npm` / `pip` / `cargo` / `go` |
| `command` | Exact CLI invocation including flags |
| `fixture path` | Path to package archive or lockfile fixture |
| `policy profile` | Active org policy version + key rules |
| `effective account/site/agent policy` | After resolution merge |
| `expected scanner signal` | What scanner SHOULD detect (CVE, malware, etc.) |
| `expected policy action` | `policyAction` (BLOCK/PROMPT/WARN/MONITOR/ALLOW) |
| `expected runtime action` | `runtimeAction` (after non-interactive collapse + ALLOW_FAST normalization) |
| `observed CLI action` | What the user-facing CLI shows (read from `[ceragon]` exit lines) |
| `observed DB action/reason` | `analysis.verdict` + `analysis.reason` post-completion |
| `observed UI action/reason` | What `console.cera.buzz` shows for the row |
| `latency by phase` | Fetch / static / sandbox / total — from Phase 3 progress events |
| `correlation ID` | From CLI request → SSE → DB row |
| `mismatch classification` | `none` / `cli≠db` / `db≠ui` / `runtime≠expected` / `latency-anomaly` |

## Day-to-day cases (run in order)

| # | Case | Fixture | Expected runtimeAction | Notes |
|---|---|---|---|---|
| 1 | npm safe install | `is-number@7.0.0` | ALLOW | Phase 4 ALLOW normalization gate. |
| 2 | npm known vulnerable direct dep | `lodash@4.17.20` | BLOCK or PROMPT (per policy) | Phase 0b R14 policy reason gate. |
| 3 | npm deprecated/unmaintained | `request@2.88.2` | WARN/PROMPT/ALLOW (per policy) | Verifies WARN rendering, NOT BLOCK. |
| 4 | npm previously-hung package | `minimist@0.0.8` | BLOCK (per policy) | Phase 3 timeout/degradation gate. |
| 5 | pip safe install | `requests==2.31.0` | ALLOW | Cross-ecosystem regression. |
| 6 | pip vulnerable install | `requests==2.19.0` | BLOCK or PROMPT | CVE detection on PyPI. |
| 7 | cargo safe crate | `serde@1.0.197` | ALLOW | Phase 0b cross-ecosystem regression. |
| 8 | cargo vulnerable/deprecated | per scanner support | as-policy | Skip if scanner support absent. |
| 9 | Reinstall same package | re-run case 1 | ALLOW with `decisionSource=DYNAMODB_CACHE` and `effectiveAction=ALLOW_FAST` | Phase 4 ALLOW_FAST chain rendering. |
| 10 | Prescan lockfile then install | run prescan first, then case 1 | Same primary reason in both | Phase 4 prescan/foreground parity. |

## Regression cases (fixed-bug coverage)

| # | Case | Verifies |
|---|---|---|
| R1 | Sandbox V2 result posts with `sandboxExecutionMode='bwrap-v2'` | Phase 2 worker contract; backend accepts the value. |
| R2 | Sandbox failure without job ID does NOT call `/jobs/undefined/fail` | Phase 2 UUID guard. Inject `jobId=undefined` and assert worker logs "invalid jobId; failure not reported." |
| R3 | AI provider 429 / malformed output persists `aiStatus='quota_exhausted'` or `'parse_failed'` | Phase 3 typed degradation status. |
| R4 | Allowlisted local repo scan succeeds | Phase 5 allowlist contract. Use `installationId=0` and a known-allowlisted repo. |
| R5 | Prescan and foreground same package produce same primary reason | Phase 4 decision-key parity. |
| R6 | CLI reason equals DB reason | Phase 0b R14 + Phase 4 chain enrichment. |
| R7 | User-facing verdict normalizes ALLOW_FAST to ALLOW | Phase 4 wire normalization gate. Inspect SSE payload `decision.action` AND `decision.runtimeAction`. |
| R8 | WARN policy in non-interactive mode shows policy-to-runtime chain | Phase 4 nonInteractiveAction → effectiveAction. CLI must show `WARN → BLOCK (non-interactive mode collapsed)`. |
| R9 | Daemon killed mid-scan produces clear reconnect/failure behavior | Phase 3 SSE watchdog. Kill daemon during a scan, verify the CLI surfaces a timeout reason, NOT silent hang. |

## Local-artifact regression (Phase 4 cleanup pass)

Critical security regression coverage added during Phase 4 review:

| # | Case | Verifies |
|---|---|---|
| L1 | Upload local artifact named `react@18.0.0` (different bytes from registry) | The local upload runs fresh analysis on uploaded bytes; does NOT inherit registry react cache. |
| L2 | After L1, request registry `react@18.0.0` from same org | Registry request creates fresh Analysis; does NOT inherit L1's local-artifact verdict. |
| L3 | Upload local artifact whose name matches an allowlist entry | Allowlist short-circuit is suppressed; analysis runs on uploaded bytes. |
| L4 | Two local uploads of the same `react@18.0.0` with different content hashes | Each upload creates a distinct FetchJob and Analysis. |
| L5 | Cross-tenant: tenant A uploads, then tenant B installs `react@18.0.0` from registry | Tenant A's local-artifact result must NOT be visible to tenant B. |

## Recording

Run log lives at `scripts/phase8-runs/<date>/<run-id>.json`. The Phase 4 chain fields and Phase 3 progress events are extracted automatically:

```jsonc
{
  "case": "1-npm-safe-install",
  "expected": { "runtimeAction": "ALLOW" },
  "observed": {
    "cliAction": "ALLOW",
    "dbVerdict": "ALLOW",
    "uiAction": "ALLOW",
    "decisionSource": "FRESH_ANALYSIS",
    "policyAction": "ALLOW",
    "effectiveAction": "ALLOW",
    "runtimeAction": "ALLOW",
    "latencyMs": { "fetch": 4200, "static": 1100, "sandbox": null, "total": 6500 }
  },
  "mismatch": "none",
  "correlationId": "..."
}
```

## Acceptance gate

The retest is GREEN when:
- All day-to-day cases land in expected `runtimeAction`.
- All regression cases pass (R1-R9 + L1-L5).
- No `mismatch != "none"` entries.
- 95th-percentile total latency under 10s for cases 1, 5, 7 (safe installs).
- No `analysis.failureReason='SSE_TIMEOUT'` rows in the test window.
