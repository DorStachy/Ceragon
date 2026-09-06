# Floor lane — the endpoint reports the floor it holds, and an expired bundle no longer bricks the box

Worktree `/c/cwt/p47-fix-floor`, Installers repo, branch `p47/fix-floor-report`, based on the merged
integration tip `f6148c37`. Nothing outside Installers was changed; `/c/cwt/p47-w4b-be` was read only.
Nothing was pushed.

## What was wrong, measured

Two independent halves of the 2026-09-05 brick
(`.plans/m47a-20260822/stage1-evidence/receipt/FINDINGS.md`).

**Half 1 — the endpoint stopped reporting anything, so the backend read it as floor-less.**
The endpoint's evidence WAL was poisoned by a restart overlap and would never open again.
`policyIntegrityReport()` (internal/daemon/ai_integrity_subsystem.go) returns nil the moment the
evidence spool has no emitter stream, so from that instant the heartbeat carried **no
`policyIntegrity` block at all** — not a block with a missing tuple. The backend had already written
`ai_policy_applied_bundle_digest = NULL` from the last accepted report, and
`endpointActivationFloor` reads "reported (`ai_policy_report_sequence` non-null) + no digest" as
"genuinely holds no floor". Bundles 38-41 were minted genesis-shaped, `checkChainContinuity` refused
each one against the floor that was never reported, and the cycle could not be broken from either
side.

The applied tuple itself was **not** the defect: `ai_applied_floor_report.go`'s
`withDurableFloorFallback` already reports the floor from disk without a receipt, and I proved that
before touching anything — a test that activates without a receipt and a test that restarts onto a
floor both pass on the base commit. The defect is one level up: the report is dropped wholesale.

**Half 2 — one hour later, the expired bundle blocked everything.**
`PolicySnapshot.Policy()` returns nil when expired, so every decision fell to the permissive built-in
defaults and was then floored to `block` by the POLICY_EXPIRED oracle — including
`please summarise the release notes` — while `GET /v1/ai/policy` answered 502 `policy unavailable`.

## Files changed

| file | what changed |
|---|---|
| `internal/daemon/ai_applied_floor_report.go` | +225. `floorOnlyIntegrityReport` — a degraded report that carries the floor tuple when the evidence spool will not open; `rememberEvidenceWatermark` / `loadRememberedWatermark`. |
| `internal/daemon/ai_integrity_subsystem.go` | the no-emitter-stream return now tries the degraded report first; a report the wire accepted remembers its watermark. |
| `internal/daemon/ai_policy_authority.go` | `PolicySnapshot.EnforcementPolicy()` + `EnforcingLastKnownGood()`, and the same two on `aiDecisionPolicy`; `applyPolicyExpiredToolDecision` does not floor while enforcing the LKG. |
| `internal/daemon/ai_handlers.go` | `aiPolicyCache.get` serves the enforcement policy; `decisionInput` projects the third state; the prompt, wire and tool-decision routes strip the expired policy's weakenings; `GET /v1/ai/policy` serves the LKG with `expired: true`; `/health` gains `expired-last-known-good`. |
| `internal/daemon/ai_permission.go` | the escalation verdict is decided on the enforcement policy, weakenings stripped. |
| `internal/daemon/ai_policy_activate.go` | WARN on every refresh while enforcing an expired bundle. |
| `internal/daemon/ai_integrity_subsystem.go` (2nd commit) | the remembered watermark is only written to disk when it moves, not once per heartbeat. |
| `internal/localdecide/floors.go` | `Input.ExpiredLKG`, `ReasonExpiredLastKnownGood`, `NoWeakeningBeyondDefaults`, `NoWeakerToolVerdictThanDefaults`. |
| `internal/aihooks/block_reason.go` | the new marker is skipped rather than rendered as a block cause. |
| tests | `internal/daemon/ai_floor_report_expiry_test.go` (new, 13 tests), `internal/aihooks/block_reason_expired_lkg_test.go` (new, 3), and four restated doctrine tests in `ai_policy_expired_surfaces_test.go` / `ai_policy_authority_test.go`. |

## The exact heartbeat fields now sent

Ordinary path (spool healthy) — unchanged, plus the watermark is now remembered on disk at
`<ConfigDir>/integrity/evidence-watermark.json`.

Degraded path (spool will not open, endpoint holds a durable floor), `controls.policyIntegrity`:

```
schemaVersion                 1
reportSequence                next from the hardened integrity store, persisted before use
integrityContractVersion      ri-1
appliedBundle.revision        from aitrust/activation-floor.json  (e.g. "37")
appliedBundle.digest          from aitrust/activation-floor.json  ("sha256:<64hex>")
appliedBundle.keyId           from aitrust/lkg-bundle.json payload.keyId, and ONLY when that LKG's
                              digest equals the floor's digest and its audience is this endpoint's
appliedBundle.appliedAt       the floor's trustedServerTime, RFC3339
signatureStatus               from the authority posture (UNKNOWN with no usable authority)
state                         never better than UNKNOWN; a worse aggregate (CONTAINED/FAILED) wins
containment                   the aggregate, unchanged
verifiedAt                    omitted - no fresh verification to date
evidenceWatermark             the last pair this endpoint successfully reported, repeated verbatim
criticalEvidencePendingDepth  0
```

There is **no `applicationReceipt` / `receiptId` field on the wire**, deliberately. The backend
rebuilds the block field by field (`normalizeEndpointPolicyIntegrityReport`) and drops every key it
does not know, so an additive field there would be discarded before storage and would buy nothing.
The fact is recorded where it can be read: a WARN at the moment the tuple is produced
(`applicationReceipt=false receiptId=""`) and `state: "expired-last-known-good"` / `expired: true`
on the loopback health surface.

## What the backend validates (read in /c/cwt/p47-w4b-be, unchanged)

`src/health/policy-integrity-shape.ts` -> `normalizePolicyIntegrityBlock` then
`decidePolicyIntegrityAcceptance`:

1. `normalizeEndpointPolicyIntegrityReport` — all-or-none applied tuple, `revision` canonical uint64,
   `digest` `sha256:<64 lowercase hex>`, `keyId` non-empty and at most 64 chars, `appliedAt` RFC3339;
   `evidenceWatermark.emitterStreamId` must match the shipped stream-id regex and
   `verifiedThroughSequence` must be a canonical uint64. Unknown keys are dropped, not rejected.
2. **`isIntegrityUuid(appliedBundle.keyId)`** — the column is a Postgres `uuid`. A contract-valid
   non-uuid key id rejects the **whole report** with `key-id-not-uuid`. The test fixture uses a real
   uuid for this reason and asserts it.
3. `integrityContractVersion` must equal the version the server latched.
4. `reportSequence` must strictly advance, unless `emitterStreamId` changed (new incarnation).
5. Watermark ceiling: a non-zero `verifiedThroughSequence` may not exceed the server's own
   `highest_contiguous_sequence` for that stream; an unknown stream's tail is 0.
6. Watermark regression: within the same stream the value may not go backwards.

**A receipt row is not consulted anywhere in that path.** `ai_policy_applied_bundle_digest` is written
straight from `applied.digest`, so a tuple with no receipt is accepted. That answers the brief's
question: nothing had to be bent, and nothing was.

The degraded report satisfies 4-6 by repeating the last accepted pair verbatim: the sequence still
advances (it comes from the hardened store, which is independent of the spool), the stream is
unchanged, and the watermark neither rises above the server's tail nor regresses.

## Expiry: what changed and what did not

Owner's standing decision (web-guard un-brick, 2026-07-25): *local-authoritative — enforce with the
best available rulebook, never freeze.* Applied as a **third state**, not as a softening of the second.

- `Policy()` — the AUTHORIZATION accessor — is **unchanged**. Delegated approvals, MCP
  auto-quarantine, the AI-context sweep and the ingress posture all still read it, still get nil, and
  still refuse. `TestExpiryStillWithholdsAuthorizationFromMachineEditingSurfaces` pins that.
- `EnforcementPolicy()` — new — returns the retained last-known-good when the signed envelope has
  expired and the endpoint is not contained. Contained keeps its own scoped floor.
- The rule 7 property the old comments protect ("no time-limited weakening is extended") is preserved
  **structurally** rather than dropped: while expired, the same input is decided twice — against the
  retained policy and against no policy at all — and the stricter answer wins
  (`localdecide.NoWeakeningBeyondDefaults`). An expired policy can therefore only ever be at least as
  strict as an endpoint with no policy, so an allow-listed span, a class set to `allow`, a monitor
  lane or `dlp.enabled=false` all stop applying, including a knob added later. It cannot be defeated
  by an enumeration going stale. Cost: one extra scan, only in the degraded state.
- Anti-rollback and chain continuity are untouched. `checkChainContinuity`, the activation floor and
  the trusted-time high-water mark were not modified. One subtlety was caught during the work: the
  new refresh WARN originally read `authority.Snapshot()`, which advances the observed high-water
  mark to the real clock — that retired legitimately dated bundles and turned four foreign-store
  tests red. It now reads `SnapshotAt(s.activationWallClock())`.

## Tests, with red/green evidence

Red-before was captured by running the same four claims against a throwaway worktree at the base
commit `f6148c37` (`/c/cwt/p47-floor-base`), using only symbols that exist there:

```
BASE f6148c37
  TestZZBaseFloorTupleSurvivesSpoolLoss     FAIL  RED: evidence-dark endpoint reported NOTHING
                                                  (skip="evidence spool has no emitter stream")
  TestZZBaseExpiredBenignPromptIsNotBlocked FAIL  RED: a benign prompt was BLOCKED under an expired
                                                  bundle: [policy-expired:deny]
  TestZZBaseExpiredPolicyRouteAnswers200    FAIL  RED: GET /v1/ai/policy = 502 "policy unavailable"
  TestZZBaseRestartReportsTheSameFloor      PASS  (a pin, not a fix - the durable-floor fallback
                                                  already worked)

p47/fix-floor-report - all four PASS
```

The two red decision outputs are byte-identical to what the live rig produced on 2026-09-05
(`bricked-state-before-recovery.txt`: `benign http 200 decision="block" reasons=["policy-expired:deny"]`
and `policy unavailable / http=502`). The probe file was temporary and was removed from both trees.

Shipped tests (`internal/daemon/ai_floor_report_expiry_test.go`), each with its defeat case:

| test | claim |
|---|---|
| `TestFloorTupleIsReportedWithoutAnApplicationReceipt` | (a) no receipt, the tuple is still reported |
| `TestFloorTupleSurvivesTheEvidenceSpoolGoingAway` | (a) the measured case: report, lose the spool, still report the floor; same stream id, never MATCHED, no `verifiedAt`, sequence advances |
| `TestDegradedReportStaysSilentWithNoActivationFloor` | **defeat**: no floor, silence, so the backend's genesis recovery still works |
| `TestDegradedReportRefusesToInventAWatermark` | **defeat**: never reported, no stream id is minted |
| `TestDegradedReportRejectsAMalformedRememberedWatermark` | **defeat**: a hand-edited file is refused, not trimmed |
| `TestRestartReportsTheSameFloor` | (b) restart, same revision/digest/keyId |
| `TestExpiredBundleStillEnforcesTheLastKnownGoodPolicy` | (c) benign prompt allowed; the admin's `aws-access-key: block` still blocks |
| `TestExpiredBundleWithNoLastKnownGoodStillDenies` | **defeat**: no LKG, the POLICY_EXPIRED floor still fires, on both the scan and the plain-verdict lane |
| `TestContainedAuthorityIsNotAnEnforcementPolicy` | **defeat**: contained is not widened into an enforcement path |
| `TestExpiryStillWithholdsAuthorizationFromMachineEditingSurfaces` | **defeat**: `Policy()` still nil, MCP auto-quarantine still withheld |
| `TestPolicyRouteServesTheLastKnownGoodWhenExpired` | (d) 200 plus `expired: true`, health says `expired-last-known-good` |
| `TestPolicyRouteStill502sWithNothingToServe` | **defeat**: never activated, still 502 |
| `TestPolicyRouteCarriesNoMarkerWhileFresh` | **defeat**: a fresh policy is not marked expired |

Four existing doctrine tests were **restated, not deleted**, each with a comment naming the owner
decision and keeping every assertion that still holds:

- `TestExpiredSnapshotDrivesTheNativePolicyExpiredDecision` — the oracle no longer floors while an LKG
  is being enforced (it stamps the marker); a new arm proves it still floors with no LKG.
- `TestNoDecisionSurfaceCanReadAnExpiredPolicyBody` — `aiPolicyCache.get` moved out of the
  "everything returns nil" list and is now asserted to be live; the five authorization accessors are
  unchanged.
- `TestPolicyExpiredPromptSurfaceDropsTheWeakening` / `...WireSurface...` — **the fixture was wrong
  and is now right.** It allow-listed AWS's documented example key, which the detector grades
  non-enforcing on purpose, so with no policy the prompt resolved to `allow` and the
  "weakening removed" assertion was really measuring the blanket floor rather than the weakening.
  The key is now a synthetic enforcing-shaped one assembled at run time, so fresh -> allow (exclusion
  applies) and expired -> not allow (exclusion dropped) is a real differential. A benign-prompt arm
  was added to each.
- `TestPolicyExpiredPermissionSurfaceFloorsTheEscalation` -> `...DropsTheWeakening` — its second
  assertion (a clean `echo hello` escalation is floored to block) *was* the brick. It now asserts the
  benign escalation is allowed and a risky one is stopped exactly as hard as while fresh.

## Runs

```
go build ./...                                                    OK
go vet ./internal/...                                             OK
go test -run 'Floor|Applied|Posture|Expire|Expired|Authority|Snapshot|Integrity' \
   ./internal/daemon/ ./internal/airuntimeintegrity/ ./internal/policybundle/  ok
go test ./internal/localdecide ./internal/controls ./internal/aihooks ./internal/policyeval \
   ./internal/plugingate ./internal/proxy ./internal/evidencespool ./internal/localsnapshot  ok
go test -count=1 -timeout 40m ./internal/daemon/                  ok, 38.4s, exit 0
go test -count=1 -timeout 40m ./...                               exit 0 overall; 146 ok,
                                                                  21 no-test, 4 packages red
```

The four red packages in the whole-repo run, each re-measured:

| test | verdict |
|---|---|
| `internal/certificate` `TestForbiddenListMatchesThePlanChecklist` | **pre-existing and environmental** - it looks for `.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md` above the package directory, which only exists in the workspace checkout, not in a `/c/cwt/` worktree. Red on the untouched base commit too (verified). |
| `internal/daemon` `TestEndTrackedAISessions_BoundedFanOutCompletesInTimeBox` | time-box under load (ended 709 of 1024 sessions in 5s). Passes in isolation. |
| `cmd/devoid-daemon` `TestServiceExecute_TenKillAndRecoverCyclesWithNoUserAction` | recovery-tick timing under load. Passes in isolation. |
| `internal/configwatch` `TestWatcher_BurstCollapsesToOneObservation` | debounce coalescing under load (25 observations from a 40-write burst). Passes in isolation. |

The three timing tests were re-run alone on this branch and all pass; the `internal/daemon` package
alone is 38s and green, against 156s and red inside the parallel whole-repo run. That is the
"timing-sensitive under load" the brief warned about, not a regression from this change - but it is
reported as measured rather than dismissed.

`gofmt -l` lists essentially every file in the repo, including on the untouched base commit — a CRLF
artefact of this checkout, not a property of these changes.

## What I could not do

1. **An endpoint whose spool is already dead before this ships is not rescued.** The degraded report
   needs a remembered watermark, and that file is only written by a report built from a live spool.
   The population this leaves out is also the one the backend still handles correctly: with no
   accepted report at all it answers `{known:false}` and falls back to the issuance chain, which is
   not the deadlock. The deadlock population has, by definition, reported.
2. **`emitterStreamId` and `verifiedThroughSequence` cannot be computed from a poisoned WAL.** Both
   live inside the WAL. I did not mint a stream id: the backend reads a new one as a stream rotation,
   and a claimed watermark above its own tail is refused. Fixing the WAL itself — an exclusive lock,
   quarantine-and-reinitialise on `conflicting event ids`, carrying the spool cause in the heartbeat
   — is the receipt/spool lane's suggested fix shape, not this one's.
3. **There is no `EXPIRED` value in the wire's integrity-state vocabulary.** It is frozen and mirrored
   in `packages/shared-contracts`, so an expired endpoint reports `state: UNKNOWN`,
   `signatureStatus: VALID`, no `verifiedAt`, plus the applied tuple. Saying "expired" explicitly on
   the heartbeat needs a contract change in the Backend repo, which is out of scope here.
4. **Not exercised against a live endpoint.** Everything above is Go tests plus the read-only backend
   source. The rig's daemon (`:19390`) is shared with other lanes and was not restarted, so no live
   heartbeat was observed carrying the degraded report or the expiry marker.
5. **The plugin-install gate still holds on an expired authority** (`plugingate.Policy.Expired`, a
   releasable hold, not a block). I left it alone: it tests expiry before `Unresolved`, so passing it
   a non-nil policy changes nothing, and widening it is a separate decision.
