# P47 stage-1 fixes — what was fixed, and how each was verified (2026-09-06)

Six defects the second-pass testing surfaced were fixed on their own branches, merged into their
integration branches, and re-tested. Nothing was pushed, merged to any `main`, or deployed.

## The fixes and where they landed

| # | fix | branch → commit | merged into | integration tip |
|---|---|---|---|---|
| 1 | Evidence spool: exclusive lock, quarantine-and-recover on a poisoned WAL, and a cause the heartbeat carries | `p47/fix-spool-lock` 8115ecc0 | `p47/fix-system-exfil` | 7863aa2f |
| 2 | Floor report + expiry: report the activation floor even with no spool; an expired bundle enforces last-known-good instead of blocking everything | `p47/fix-floor-report` 6f7ce4d4 | `p47/fix-system-exfil` | 7863aa2f |
| 3 | Self-defence: the disable class now catches delete/remove verbs, the ProgramData-root wipe, product stop verbs, and the quoted-`$HOME` wipe | `p47/fix-selfdefence` 0bdf353d | `p47/fix-system-exfil` | 7863aa2f |
| 4 | MCP TOML: a Codex `config.toml` server is seen by the real-time watcher, not only the six-hourly sweep | `p47/fix-mcp-toml` 71fb44c9 | `p47/fix-system-exfil` | 7863aa2f |
| 5 | Bulk triage: the console's bulk-triage call reaches the backend route | `p47/fix-bulk-triage` e93dcb12 | `p47/w6-frontend` 0e8b730e | — |
| 6 | Evidence-health (backend): an endpoint can say it cannot record evidence, and the health row goes degraded instead of healthy | `p47/fix-evidence-health` 937abdfb | `p47/integration-backend` a14f7c72 | — |
| 6a | **Reverted in the ship pass (2026-09-06):** the non-production bundle-lifetime seam that rode along with #6. The full Backend run caught it: the lane's own invariant test (`ai-policy-rollout.service.spec.ts`, "reads no environment variable … anywhere in the lane") scans the issuance service, and the seam read `process.env` there. Restored to `origin/main`; seam spec deleted. No product behaviour changes (production ignored the seam anyway). | on `p47/integration-backend` after a14f7c72 | — | — |
| 7 | **Ship pass (2026-09-06):** the spool's exclusive lock, held for the daemon's life, failed two daemon tests on Windows at temp-dir cleanup. The test helpers now release the spool (966cfb46), and the product no longer lets a straggling emitter reopen a spool that a graceful stop already released (78cedeb8) — a real gap the Windows run exposed. Full `internal/daemon` green. | `p47/fix-system-exfil` 966cfb46 + 78cedeb8 | — | 78cedeb8 |

The one merge conflict (spool #1 vs floor #2, both on the heartbeat report file) was resolved so the
degraded report carries **both** the floor tuple (breaks the genesis deadlock) and the spool cause
(flags the dark endpoint) in one heartbeat.

## Verification

Every fix has a green Go/TS suite on the final merged tree with red-before/green-after and defeat
cases. On the final integration tip: `go build ./...` and `go vet` clean; the ten fix-touched
packages (evidencespool, toolrisk, mcpgov, mcpsources, controls, localdecide, aihooks,
promptevidencegate, airuntimeintegrity, policybundle) all pass; the Backend targeted suites pass
(85 suites / 634 tests) and the Frontend targeted suites pass (135 suites / 1,256 tests).

### Proven LIVE against the rig

- **Bulk triage (#5)** — through the rebuilt console UI: select-all + Mark investigating returns
  `POST /api/ai-control-plane/events/triage/bulk` → 200, "122 detections updated, 10 already had this
  value, 0 could not be changed." Screenshot: `bulktriage/console-bulk-mark-investigating.png`.
- **Evidence spool + evidence-health (#1 + #6)** — the P0. A daemon built from all six fixes
  quarantined a poisoned WAL at 11:11:10 ("endpoint evidence WAL was poisoned and has been
  quarantined; the endpoint emits on a new stream", cause `spool-corrupt-quarantined`), kept working
  (inventory and MCP scans still posting — not bricked), and its heartbeat carried the cause to the
  backend, where `endpoint_control_state.ai_policy_evidence_spool_cause = spool-corrupt-quarantined`
  and `endpoint_evidence_health` reads `degraded / spool-unavailable`. The endpoint that used to read
  healthy while evidence-dark now reads degraded with the exact cause. Both are columns my migration
  added. Evidence: `spool/live-proof.txt`. The lock file (`endpoint-evidence.lock`) is present, and
  the poisoned WAL was renamed (`.poisoned-*`), not deleted.
- **Floor report (#2, one half)** — after the quarantine the endpoint reports `applied_revision=44`
  on a fresh stream, not NULL: it recovered and kept reporting its floor rather than falling into the
  genesis-bundle deadlock. Same evidence file.
- **MCP TOML (#4)** — planting three `[mcp_servers.*]` tables in the isolated Codex `config.toml` had
  the real-time watcher post them within ~10 s (not the six-hourly sweep); the backend recorded all
  three, the remote one correctly graded `warn / network-egress`. Evidence: `mcptoml/live-run.log`.

### Proven by Go suite, NOT live-driven in this rig (with the reason)

- **Self-defence (#3)** and **expiry un-brick (#2, other half)** drive the daemon's loopback API
  (`tool-decision`, `prompt-check`, `GET /v1/ai/policy`). The `main` merge turned the daemon into a
  hardened machine install — a SYSTEM-owned loopback token, a self-healing watchdog, and a
  system-managed stop that refuses the CLI — because this box carries the real
  `HKLM\SOFTWARE\Devoid\SecurityBoundary` marker from the production agent, which I must not touch.
  An unprivileged rig process cannot mint that token or cleanly restart the daemon, so the raw-token
  loopback drives cannot run here. Both fixes are covered by their suites: self-defence has 51 attack
  subtests red-at-base / green-now with 40 benign controls; the floor/expiry fix has 13 daemon tests
  plus 3 in aihooks, each with a defeat case, and the base-commit red run reproduced the live brick
  byte-for-byte (`benign … decision="block" … [policy-expired:deny]`, `GET /v1/ai/policy` 502). This
  is an environment limitation of the rig on this machine, not a defect in the fixes.

## Known residuals (small, noted for the ledger)

- `EVIDENCE_WAL_QUARANTINED` did not appear in `ai_events` (the quarantine WARN and the cause both
  reached the backend). Most likely the backend's `safeMetadata` allowlist does not yet admit the
  event type + its metadata; the spool fix's report flagged that allowlist as the backend-side to-do.
- The spool cause is currently sticky: once an endpoint quarantines, it keeps reporting
  `spool-corrupt-quarantined` and so reads degraded even after it recovers on the new stream.
  Flagging the data-loss event is correct; whether it should auto-clear after N clean heartbeats is a
  daemon-side refinement, not a backend one.
- MCP `p47_harvester` (npx + a token-shaped env value) graded `allow`, not `block`: the classifier's
  secret-env rule keys on specific env names, and `HARVESTER_API_TOKEN` was not one. The watcher
  discovered and classified it correctly; the grade is a separate classifier question.
