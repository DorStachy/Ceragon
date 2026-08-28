The heredoc exceeded the process spawn limit. Per my instructions the parent reads my text output rather than files, so the report is below.

---

# Reconciliation of the eight 9+ waves

Read against `origin/main` on 2026-08-28. All seven SHAs in the brief confirmed current: Installers `5b129523`, Backend `0cf9021e`, Frontend `cac574ae`, Static-Worker `44d7aabb`, Sandbox-Worker `2831997d`, Scanner `3d4116a5`, Intelligence `deb70e64`. Local checkouts are behind by 1010 / 773 / 525 / 75 / 67 / 20 / 173 commits — every line number below was read with `git show origin/main:<path>`.

**Verdict: not ready to start as written.** Eight defects must be resolved first: one that bricks every enrolled endpoint's next upgrade (§4 R1), one contradiction where two waves state opposite facts about the same pin (§1 C1), one task that builds an artifact which already exists (§1 C2), one duplicated task whose owner is missing a prerequisite (§1 C5/C6), and one ordering rule that no wave states but three waves depend on (§3).

---

## 1. CONTRADICTIONS

### C1 — The runtime-adapter vocabulary pin. W1 and W5 state opposite facts. **W1 is right.**

- **W1 §F:** "two independent two-way pins and **no edge between them**: append a member to `CANONICAL_HOOK_EVENTS` or `ENFORCEMENT_EFFECTS` in TypeScript and every Go test stays green."
- **W5 "What exists today":** the twelve-member `EnforcementEffect` tuple is "**APPEND-ONLY and pinned three ways**: `airuntime` (typed) == `internal/controls` wire == the TypeScript `AI_SECURITY_PORTABLE_ORDERED_TUPLES` tuples."

Evidence — `internal/airuntime/vocab_parity_test.go:12-21`:

> "the expected tuples are EMBEDDED here as literal string slices rather than read from the TS file. The Installers module is a SEPARATE git repo from packages/shared-contracts, so **a path read would couple two repos**…"

The file then claims "If the TS contract changes, all three fail together until reconciled." That claim is false — the Go literals are hand-typed and nothing reads the `.ts`. W5 quoted the comment; W1 read the test.

W5's Task 5 *conclusion* survives on the facts: `restrict-capability` genuinely is present in Go (`vocab.go:109`), on the wire (`controls/attestation.go:425`) and in TS ENFORCEMENT_EFFECTS (12 members), so "no append, no Backend deploy" holds. But the *reason* is wrong, and any later wave reusing it ships a silent divergence. **Strike the "pinned three ways" sentence from W5 and cross-reference W1 Task 2.**

### C2 — W1 Task 2's premise is wrong, and the artifact it builds already exists. **Rewrite the task.**

W1 Task 2 proposes twelve files across two repos — a Backend emitter, a generated JCS artifact, a `.sha256` sidecar, a Backend spec, an embedded artifact, a consumer pin, a `runtimevocabgen` tool, `vocab_generated.go`, edits to `contract.go`/`vocab.go`/`attestation.go`/the inertness allowlist, and a CI step — with a blast radius W1 itself calls "the highest-consequence contract in the wave."

Three verified problems:

1. **There is no union to extract or mutate.** All six tuples in `Backend/packages/shared-contracts/src/runtime-adapter-contract.ts` are re-exports: `:72` COVERAGE_DEPTHS, `:97` ENFORCEMENT_EFFECTS, `:111` CERTIFICATION_STATES, `:130` CANONICAL_HOOK_EVENTS, `:164` GOVERNANCE_DISPOSITIONS, `:183` MCP_GOVERNANCE_ROWS — each `= AI_SECURITY_PORTABLE_ORDERED_TUPLES.<NAME>;`. The defeat test's mutation ("append `FAKE_EVENT` to the `CanonicalHookEvent` union in that file") **cannot be performed.**
2. **The named precedent does not do what W1 says.** `ai-governance-contract.parity.spec.ts` defines `extractTsUnionFromFile` at `:48` and calls it once, at `:133`, for `VerdictType` from a DTO path. It never touches these six.
3. **The pinned artifact already carries them.** `Installers/internal/aipolicycontract/embedded/0.5.0/portable-contract.v1.jcs.json` contains, at `v1Policy.orderedTuples`, all six — `CANONICAL_HOOK_EVENTS` with the same 11 members as the Go literal, `ENFORCEMENT_EFFECTS` with 12, plus COVERAGE_DEPTHS, CERTIFICATION_STATES, GOVERNANCE_DISPOSITIONS, MCP_GOVERNANCE_ROWS. It is already digest-pinned by `consumer-pin.v1.json` and already verified by `contract.go SelfCheck()` on the `BootSignedAuthority` → `Contain` path — the exact mechanism Task 2 wants to extend.

W1's §F line "The spine v3 does not carry these tuples either" is true of the *spine* and led it to conclude the edge was missing. It looked at the wrong artifact.

**Rewrite Task 2 to:** add `aipolicycontract.RuntimeAdapterTuples()` reading `v1Policy.orderedTuples` from the already-embedded artifact; one test asserting `airuntime.CanonicalEvents` and siblings deep-equal it in order; add the accessor to the inertness allowlist. No new artifact, no new pin, no generator, no Backend change, no CI leg. Blast radius drops from "highest in the wave" to near zero, and the "unknown contract version fails explicitly" half of the exit gate is satisfied by the `SelfCheck` path that already exists. **This is the largest connect-don't-build win in the plan, and it is sitting in the task the plan calls its most dangerous.**

### C3 — W3 asserts a Backend ordering constraint that does not exist. W2 and W8 are right.

W3's wave-exit rule: "Task 5 adds fields to the `/v1/ai/transport-observation` response … Therefore: **Backend change deployed first, agent release second**."

That route is a token-gated loopback handler on the daemon (`server.go:588`, `handleAITransportObservation` at `ai_transport_observation.go:75`), read by the CLI. W2 Task 4 states the correct rule for this class ("agent-local … carries no deploy-ordering constraint") and W8 verified the negative ("Grepping Backend `origin/main` for `routeObserved` / `transportRoute` / `routeDecisions` returns nothing"). **W3's rule is spurious.** Harmless if obeyed, but a phantom entry in a four-item ordering list is how a real one gets ignored. Strike it — W3 Tasks 1-8 are all agent-only.

### C4 — W2 and W7 both claim the Phase-1 "no one-minute unwired state", with incompatible stamps.

- W2 Task 6: the broker writes a **new** stamp, `<machineRoot>\sessions\<userSID>\broker-ready`; Task 6b's refusal condition 3 reads it.
- W7 Task 5 (explicitly "**Phase 1**, not Phase 5"): "Implement readiness off the **existing** durable reconcile stamp the shim already consults — **do not invent a second stamp**; two stamps is how this codebase grows a false green."

Both are right about their half. W7's rule wins on the stamp; W2's mechanism wins on the closure — a SYSTEM-driven per-session launch actually closes the window, a readiness state only names it. **Reconcile:** W2 Task 6's broker updates the existing durable reconcile stamp; W7 Task 5 computes readiness from it; W2 Task 6b reads the same one. This also removes half of the R1 brick.

### C5 — W5 Task 7 and W6 Task 5 are the same task, and W5's version is missing a prerequisite. **W6 is right.**

| | W5 Task 7 | W6 Task 5 | Verified |
|---|---|---|---|
| New file | `internal/daemon/canary_receipt_sink.go` | `internal/daemon/ai_canary_receipt_sink.go` | — |
| Composition root | `internal/daemon/server.go` | `ai_integrity_wiring.go bindIntegrityCanaryLoop` | **W6.** `:627-631` is where `w.claude.Challenges`, `w.claude.Verifier`, `w.codex.Canaries.Resolver`, `w.codex.Canaries.Applied.EndpointID` are assigned |
| Client method | "the daemon's existing request-signing backend client" | builds `RecordCanaryReceipt` (Task 4) | **W6.** `internal/core/backend/ai_canary_challenge.go` has exactly three methods: `RequestCanaryChallenge:105`, `ConsumeControlArtifact:187`, `postSignedControlAuthority:228`. **No receipt method exists.** |

### C6 — W5 and W6 disagree on what makes the canary green. **W6 is right.**

W5 Task 7's exit is "a canary run produces a row readable through the canary rollup." W6 verified **four** unwired seams, two of which fail *before* the sink is reached: the applied-bundle tuple is empty (Codex dies at `canary-challenge-wrong-bundle`) and the ledgers are unassigned (Claude dies at `canary-ledger-unavailable`). Confirmed at `ai_integrity_wiring.go:627-631`, which assigns four seams and leaves `Ledger`, `Receipts` and `Applied.{BundleRevision,BundleDigest,ProjectionHash}` unset. **W5 Task 7 cannot reach its own exit criterion.**

### C7 — W8 miscites the `Receipts:` assignment sites.

W8 gives `providers/claude/canary.go:55-59, :335-343` — those are the `errNoReceiptSink` declaration and `emitReceipt`. The four real sites, stated correctly by both W5 and W6, are `airuntimeintegrity/maintenance_test.go:64`, `codexmanaged/canary_host_test.go:289`, `canary_live_test.go:74`, `canary_test.go:111`. W8's conclusion is right; only the citation is wrong.

### C8 — W3's route-precedence matrix omits the scope W4 is about to make authoritative.

W3 Task 3 measures a 4×2 = 16-cell matrix over process env / user settings / project settings / project-local settings, and encodes it as the golden fixture behind `EffectiveRouteSource`. W4 Task 4 then emits `env.ANTHROPIC_BASE_URL` as an owned key in the **machine** managed-settings projection, and W4 Task 6 turns those writes on fleet-wide. The machine scope is not a cell. After W4, `EffectiveRouteSource` is asked a question its fixture cannot answer, and W3's doctor row either falls to `unverified` everywhere or reports `routed (user scope)` on a box whose real winner is the machine file. **W3 Task 3's matrix must be five sources (25 cells), re-measured after W4 Task 4.**

---

## 2. DUPLICATION — single owners assigned

| # | Duplicated work | Waves | **Owner** | Action |
|---|---|---|---|---|
| D1 | Canary receipt sink | W5 T7, W6 T5 | **W6 T5** | Delete W5 T7; W5's exit criterion 7 cites W6. |
| D2 | Side-effect witness caller | W5 T8 builds it, "the canary wave adds a caller"; W6 never does | **W6 T7** | W6 T7's `pre-action-effect` claim consumes `aicanary.SideEffectWitness`, or W5 T8 ships dead. |
| D3 | `internal/aicanary` launch path | W2 T5 (extract to `internal/winsession`), W6 T1 (`pipeDrainGrace:53`, `exec.go:125`) | split, **sequenced** | W6 T1 first, then W2 T5 re-baselined. W2 T5's exit is "0 tests changed status" against a baseline W6 T1 moves. |
| D4 | `AITransportObservationResponse`/`Entry` + the `AlertObserver` seam at `ai_handlers.go:2360` | W3 T5 (`directEgress`), W8 T3 (`Route.Traffic`) | **W8 T3** | W8 defines the struct and owns `routeStatusLabel`; W3 T5 appends. The code's own comment there reads "a second counter would be a second truth" — two waves are each adding one, neither referencing the other. |
| D5 | The posture composition rule | W8 T6 (TypeScript), W8 T9 (Go) | **W8 T6** authoritative | W8 shares the *vocabulary* file but implements the *rule* twice — the Go/JS parity problem W1 warns about. Ship a shared decision-table vector, or declare the local posture a strict subset and pin the subset relation. |
| D6 | The "not touching the 4 s budget / 60 s timeout" disclaimer | W1, W5, W6, W8 | none needed | All consistent, all correctly refuse. Noted so no reader thinks four waves each fix it. |

---

## 3. ORDERING — the hard constraint list

### Backend-deployed-before-agent-release: four real, one spurious

| # | Wave / Task | What widens | Failure direction |
|---|---|---|---|
| **O1** | W1 T8 | `localDecided` / `localDeclined` / `snapshotState` on `runtimeAdapters[].undecidable` | **Silent.** Confirmed: `runtimeAdapters` is `unknown[]` with no `@ValidateNested` (`heartbeat.types.ts:599-618`, whose docblock says the DTO's decorators "NEVER EXECUTE"); the enforcing gate is the field-by-field rebuild in `runtime-adapter-shape.ts`. No error, no data, looks like it worked. |
| **O2** | W4 T12 | `capabilityDispositions` | Same silent drop |
| **O3** | W8 T8 | `fieldObservation` | Same silent drop |
| **O4** | W6 T7 | widened `CANARY_PROOF_KINDS` | **Opposite — loud.** `RecordCanaryReceiptDto` is strict, so an agent ahead of Backend gets a 400. W6 flags the asymmetry correctly. |
| ~~—~~ | ~~W3 T5~~ | ~~`/v1/ai/transport-observation`~~ | **Not a Backend route. No constraint.** (C3) |

### The programme-level rule no wave states

**W8 Task 5 must be the first Backend change in the entire programme** — ahead of W1 T8, W4 T12 and W8 T8. W8 argues this for its own Task 8: today a mistyped or unknown optional field inside a surviving `runtimeAdapters[]` element is dropped with `reasons: []` and `rejectedCount` unchanged, and the pipe's drift counter is structurally blind. That argument applies identically to O1 and O2, which live in other waves. **Until W8 T5 lands, an ordering mistake on any of the three produces no error, no data, and a console that looks correct.**

### Sequencing that is destructive or wasteful if inverted

1. **W2 T6/T8 must not ship before the machine-root allowlist accepts `sessions`.** §4 R1 — hardest constraint in the document.
2. **W6 T8 (15-minute proof window) before W6 T5 is deployed.** Today zero endpoints hold a PROVEN canary, so shortening the window revokes nothing; after T5 the identical change is a fleet-wide revocation.
3. **W6 T2 + T3 before W6 T5.** Wiring only the sink changes nothing (C6).
4. **W6 T4 before W6 T5 and before anything in W5 that assumes a client method** (C5).
5. **W6 T1 before W2 T5** (D3).
6. **W1 T1 (measure) before W1 T7 and T9.** W1 is right that the only throughput figure on record — `dlp.ScanEx` at 0.71 MB/s — buys ~36 KiB inside 50 ms while the spine's own `maxInputBytes` is 65536.
7. **W1 T6 → T7 → T9.** Route the daemon through the extracted core while it is the only caller and the largest test surface covers it.
8. **W3 T1 + T2 ahead of the whole programme.** Verified: `cmd/devoid/main.go:242-247` strips the extension before lowercasing, so `CLAUDE.EXE` → `claude.exe`, matches no dispatch branch, and reaches the real binary with no shim, no surface gate and no `ANTHROPIC_BASE_URL` injection. `update_command_test.go` carries a comment documenting and dismissing it. One shift key, no privilege. Cheapest real fix in the plan.
9. **W3 T3 before W4 T4, re-measured after** (C8).
10. **W4 T1→T2→T3→T4→T5 in order; T6 last, gated on its evidence artefact.** Each is inert without its predecessor; nothing is applied until T6.
11. **W7 T1 (diagnosis) before W7 T4 (registry sweep).** Keep W7's gate absolute under schedule pressure — the sweep is only safe if H1 is the real mechanism.
12. **W7 T3 (observe) in a release before W7 T4 (mutate).**
13. **W2 T6's measured p95 < 2000 ms before W2 T6b.** The gate that makes the plan's only new fail-closed branch legitimate.
14. **W2 T10's 7-day `credentialUse.machine == 0` soak before the machine-token narrowing.**
15. **W8 T11's harness gates run RED before W8 T10, GREEN after.**
16. **NEW, unstated: W5 T4 must ship in the same release as W6 T1-T5.** W5 says it must ship "in the same release as the canary work that can legitimately restore `observed`" but never names the wave. It is W6. Without the pairing, every endpoint's certification display drops `observed` → `loaded` with nothing able to restore it, and an operator reads it as a regression.

---

## 4. BLAST-RADIUS REVIEW

### R1 — CRITICAL. W2 Tasks 6 and 8 create the fourth machine-root upgrade brick, and W2 shows no awareness of the mechanism.

Verified at `origin/main`, `cmd/devoid-msi-root-guard/guard_windows.go`:

- `boundaryChildNames` = `{"bin", "config", "logs", "evidence", "doctor", activationStoreDirName}`
- `inspectRootEntries` builds its allowlist from that plus `{"credentials.json", "daemon-token", endpointIdentityFileName, installModeMarkerName, proxyConfigDirName}`, and returns `fmt.Errorf("machine root contains unknown entry %q", entry.Name())` for anything else.

W2 Task 6 writes `<machineRoot>\sessions\<userSID>\broker-ready`. W2 Task 8 writes `<machineRoot>\sessions\<userSID>\daemon-token`. **`sessions` is not in the allowlist.**

The guard runs from the MSI Binary table with `Return="check"`, so the failure is **1722 → 1603 → the whole upgrade rolls back.** W7 documents this exact class: it has fired three times — `.staging` (F-MSI-1722), `aitrust` (F13/DF-71), and `endpoint-identity.json` on the owner's own box on 2026-08-20, where "a 7.8.42 endpoint that had enrolled the night before refused 7.8.43." W7 Task 6 exists solely to stop the fourth.

`grep -i "msi-root-guard|inspectRootEntries|boundaryChildNames|1722"` over `w2_service_identity.md` returns **nothing**.

The failure is invisible in CI exactly as the guard's own comment predicts: a clean-box install never creates a session directory, so every matrix stays green. **It fires on the second upgrade of a machine that has had an interactive logon — i.e. every real endpoint and none of the test ones.**

**Fix, mandatory:**
1. Add `sessions` to `boundaryChildNames` **in the same commit as W2 Task 6**, with the matching `createBoundaryChildren` entry and `boundaryChildRead` grant.
2. Land **W7 Task 6 before W2 Task 6** so the completeness pin exists when the writer arrives.
3. W7 T6's `TestGuardAllowlistCoversEveryMachineRootWriter` enumerates exported `internal/core/config` constants; W2 T8 adds `config.SessionDaemonTokenPath(userSID)`. Make the **directory name** derive from an exported constant so the test actually catches it, rather than hoping the path shape is reachable.
4. Adopting C4's single-stamp reconciliation removes the `broker-ready` half entirely, leaving only the session token to allowlist.

### R2 — HIGH. W2 Task 6b is the plan's only new fail-closed branch, and one condition fires on a half-broken install.

The design is otherwise the best fail-closed reasoning in the document. Condition 2 (the daemon answers `/health`) explicitly encodes the July-2026 brick; `TestLaunchGate_ProceedsWhenTheDaemonIsDead` is written first and its expected failure text names the incident. Scope is the AI runtime launch checkpoint only, never the package-install gate, pinned by `TestLaunchGate_DoesNotTouchThePackageGate` — correct, because a user who cannot `npm install` uninstalls the product. The rollback is a kill switch on a *refusal*, correctly distinguished from a feature flag.

Two residual hazards:

- **Condition 3 depends on the stamp R1/C4 are moving.** Re-specify once settled.
- **The exit criterion is "100% refusals in a synthetic run where the broker binary is renamed away."** On a real endpoint, a renamed or missing broker binary is a partially-failed upgrade or an AV quarantine — and the gate then refuses **every** AI runtime launch on that box. The failure mode most likely to occur in the field is the one this branch punishes hardest. **Add a fifth condition:** refuse only while the daemon is healthy *and* the machine-root payload verifies; on a payload that does not verify, proceed and record.

### R3 — HIGH. W4 Task 6 is the largest fleet-wide behaviour change in the plan and the obvious rollback leaves endpoints ungoverned.

Verified: `ai-runtime-integrity-policy.ts:150` ships `claudeAuthorityModes: {}`. Flipping it turns on `managed-settings.d\<devoid>.json` writes across every managed Windows/WSL endpoint, and that file carries `allowManagedHooksOnly: true` — making machine hooks the only hooks and moving the endpoint's entire governance onto them in one step. W4 names this correctly as the CX-1/CX-5 shape replayed on the other vendor and is right that "an argument is not a measurement."

W4's rollback is correct and says both halves are needed. **Elevate it from a bullet to a merge gate:** reverting the default alone leaves the applied drop-in on disk with `allowManagedHooksOnly: true` and user-scope hooks still suppressed — so the obvious rollback of the riskiest task in the plan leaves every endpoint ungoverned. W4 already says "Prove the withdrawal before proving the rollout"; that belongs **in the exit criterion**, which today names only the three rollout artefacts.

### R4 — MEDIUM-HIGH. W2 Task 10's narrowing can stop `npm install` fleet-wide, and one soak lane fails open.

W2 is unusually careful: the narrowing is a separate commit gated on `credentialUse.machine == 0` across a named rig matrix, the defeat test is the **existing** `TestMachineSecretNonElevatedReaderInventoryIsClosed` with an explicit instruction not to write a new one, and the rollback (`loadOrCreateDaemonToken` re-asserts perms on reuse, not only on mint) is real and to be confirmed on the rig first. Two additions:

- `postPrescanWatch` treats a 401 as fail-closed, so the blast radius is "no developer on the fleet can `npm install`."
- `cmd/devoid-prompt-guard-host` fails **open** (`decision:"allow"`), so it shows zero errors while silently ungoverned. The exit gate counts the *absence* of machine-token reads — which a lane that has stopped calling also satisfies. **Require a positive signal from the browser lane (a session-token authentication observed), not the absence of a machine-token read.**

W2 correctly keeps `machine-secret-denies-local-users` quarantined because `credentials.json` is the other half.

### R5 — MEDIUM. W3 Task 6 (WFP) has the plan's strongest provable condition and one mechanism gap.

The dynamic-session design is right, and the provable condition — *the DeVoid gateway process is alive, and the same process holds the filters* — is the best in the document: no gateway, no filters, agent still works. Stage 3's gateway-reachability self-test before the first block filter is the July-2026 lesson applied correctly. Declaring `node.exe`-hosted Claude, IDE extension hosts and WSL2 as uncovered cells rather than pretending coverage is the honest call.

**The gap:** the containment is written as a **deny-list** (`node.exe, Code.exe, python.exe, powershell.exe, cmd.exe, git.exe, devoid-daemon.exe`) with `TestFilterPlanRefusesSharedInterpreters`, while the surface table describes an **allowlist** ("app-scoped to an explicit list of image paths"). Two mechanisms, one test. **Make the plan builder allowlist-only** — refuse any image not on the certified list — and keep the deny-list as a redundant second assertion. A deny-list here is one unlisted interpreter away from taking a machine down, which is the exact failure this task's own defeat test says it prevents.

### R6 — MEDIUM. W7 Task 4 (H1 branch) edits a registry hive other vendors share.

W7 is candid that this is "the single most dangerous edit in the wave," and the three constraints are right: a literal allowlist generated from `Product.wxs` (never a wildcard or prefix), delete **values** not keys, leave zero-value keys in place. The `.reg` export before any deletion, failing closed if the export cannot be written, is correct — "refusing to sweep is always safe; sweeping without a backup is not." Keep the Task 1 gate absolute.

### R7 — LOW, but sequence it. Three tasks turn green surfaces red simultaneously.

W5 T4 (`observed` → `loaded` fleet-wide), W4 T8 (Codex `managed` → `cooperative` for most of the fleet), W8 T6 (`PREVENTION_ACTIVE` reads zero everywhere). All three are correct and none changes enforcement. Landing them in one release turns every coverage dashboard red at once, and the predictable response is a rollback request for a plan working as designed. **Sequence across releases with a release note each, and land W8 T6 first** — it is the one that explains the other two.

### What the review did NOT find

No task outside W2 T6b creates a fail-closed branch on a condition that cannot be proven at runtime. W6 T10 explicitly refuses to let a certificate stop a launch ("The certificate removes claims; it does not remove capability"). W8 adds no enforcement branch anywhere. W7 T3 is `Return="ignore"` by construction with a defeat test on the attribute itself. W1 T7 declines rather than denies on an unreadable snapshot. That discipline is the strongest property of this plan and should survive review pressure intact.

---

## 5. STALE FACTS — 40 citations spot-checked

### Misses (5)

1. **W1 §F / Task 2** — `runtime-adapter-contract.ts` contains no union literals; all six tuples are re-exports (`:72, :97, :111, :130, :164, :183`). The defeat test's mutation is not performable.
2. **W1 §F / Task 2** — `ai-governance-contract.parity.spec.ts` does not extract these six tuples; its one `extractTsUnionFromFile` call (`:133`) reads `VerdictType` from a DTO path.
3. **W1 §F** — the claim that no pinned artifact carries the tuples is wrong. `embedded/0.5.0/portable-contract.v1.jcs.json` carries all six at `v1Policy.orderedTuples.*`, digest-pinned and `SelfCheck()`-covered. (W1's narrower statement about the *spine v3* is correct.)
4. **W5** — "pinned three ways … == the TypeScript tuples." `vocab_parity_test.go:12-21` embeds literals and declines the path read.
5. **W8** — `Receipts:` assignment sites miscited; the four real sites are those W5 and W6 list.

### Cosmetic (3)

W8: "the Backend copy carries 53 files" — `src/` holds 42. W2: "`taskInfo` carries six fields" then lists seven. W8: `artifact_user_sweep.go:302-303` for a line at `:303-304`.

### Held (32)

`runner.go:52` = `const HookDecisionBudget = 4 * time.Second` ✓ · `aikeystore/store.go:35` = `activated-policy-pair.json` ✓ · `dlp.go:1376 IsGatingSecretClass` ✓ · `undecidable.go:64 BucketDaemonUnreachable` ✓ · `aicanary/exec.go:125` = `cmd.WaitDelay = 5 * time.Second` ✓ · `main.go:242-247` strips before lowering ✓ and `update_command_test.go` carries the documenting-and-dismissing comment verbatim ✓ · `persistence.go:17 DaemonTaskName` ✓, `taskInfo:43-51` with no restart field ✓, `configuredFor:66-88` with the `!inspected → (true, "present (definition not inspected)")` anti-churn guard exactly as described ✓ · `machine_secret_windows.go:69` and `:91` both SDDL strings byte-exact ✓ · `internal/winacl/machine_secret_routing_test.go` **does not exist** while `machine_secret_policy_test.go` does — W2's correction of a stale in-code comment is right ✓ · `cmd/devoid-daemon/main_windows.go` = **76 lines** ✓ · `aiagent.go:133 TransportEnvFor` returns exactly the three described cases ✓ · `codexmanaged/adapter_report.go:41/:47/:300` ✓ · `hookdialect.go:166` two rows with the in-file note that 0.145/0.146/0.148/0.149-alpha stay unresolvable ✓ · `adapters/registry.go:31` registers `claudecode.New(launcher)` with no Machine/Proof seam ✓ · `ai_oracle_receipt.go:82 Deny: func() error { return nil }` ✓ · `proxy/failure_oracle_route.go:64/:65/:66` all three no-ops ✓ · `ai_integrity_wiring.go:627-631` assigns four seams, leaves Ledger/Receipts/Applied-tuple unset ✓ · `ai_codex_hooks.go:508` and `:513` both bare statements ✓ · `server.go:1318 healthLivenessKeys` five keys ✓ · `sweep_ai.go:43-65` all five coverage fields with no reader ✓ · `Product.wxs` = **619 lines** and the RemoveFolder/1603 note verbatim ✓ · `aiwiretask.go:144`/`:178` ✓ · `liveproof/register.json` = **8 proofs, 3 observed, 5 quarantined**, exact ids ✓ · `ai-runtime-integrity-policy.ts:150 claudeAuthorityModes: {}` ✓ · bypass-event `type` is `@IsString()` with no enum and `details` a free `@IsObject()` — W2's "no Backend change for bypass events" holds ✓ · `heartbeat.types.ts:599-618` `runtimeAdapters` is `unknown[]` whose DTO decorators "NEVER EXECUTE" — W8's three-drop-site analysis confirmed by the source's own docblock ✓ · `runtime-adapter-contract.ts` and `endpoint-controls-contract.ts` exist **only** in the Backend copy — W8 Task 1's correction of the root `CLAUDE.md` is right and important ✓ · `restrict-capability` present in all three tuples ✓

**Citation quality is high.** W6's four-seam table and register counts are exact; W2's file:line work is excellent apart from R1; W8's Backend analysis is confirmed by the source's own docblocks. The five misses cluster in one task and all point toward a cheaper fix.

---

## 6. THE PHASE MAP

| Phase | Waves / tasks | Rows it closes |
|---|---|---|
| **0** | W1 T1-T4, W8 T1, **W3 T1-T2** | None directly. Freezes vocabulary; closes the uppercase-dispatch bypass. |
| **1** | W1 T5-T11, W2 T1-T11, W7 T5 | Reliability 3.0→9.7; Durability's *real service / external recovery / secure IPC / no logon gap* |
| **2** | W3 T3-T8, W4 T1-T13 | Resistance to bypass 4.0→9.2; Claude 7.5→9.4; Codex 5.5→**capped** |
| **3** | W5 T1-T8, W6 T1-T9, W8 T6 | Enforce-once-decided 7.0→9.5; Proof 3.5→9.6; the Phase-3 gate |
| **4** | W6 T10-T12 | Feeds Claude/Codex/Proof; no row of its own |
| **5** | W7 T1-T4, T6-T8; W8 T2-T5, T7-T11 | Durability's *atomic update / lifecycle certification / no residue*; Enterprise readiness 4.0→**capped** |

### Rows no wave moves

- **Overall architecture 8.5 → 9.5.** W8 claims it in its header, but it is the sum of all eight waves and **no wave carries an exit criterion for it.** Effectively unowned — assign it to the programme gate or drop the claim.
- **"Production evidence convergence"** (Proof) and **"production proof"** (Enterprise readiness). Every live-proof artefact in all eight waves is a **local-rig measurement**. W4 says so plainly: "No control in this product has been observed against the production authority chain." **No wave owns Phase 5's convergence against production signing, policy and evidence.**
- **The session dimension.** W8 declares `session-dimension-unavailable` and assigns it to "the wave that owns runtime identity (Workstream 1)." **W1 does not contain it.** Unowned — and one of the two reasons `PREVENTION_ACTIVE` is unreachable.

### Targets engineering alone cannot reach

| Target | Blocker | Named honestly by |
|---|---|---|
| Codex 9.3 | Permission profiles and `elevated` sandbox absent from the tree; both need two vendor artefacts per key we do not have | W4 (declares unsupported in T12) |
| Codex dialect past 0.144/0.147 | Vendor artefacts. The owner's own client (`0.149.0-alpha.4.1`) and the desktop runtime stay uncertified | W4 T11, W6, W8 — all three refuse to widen |
| Bypass matrix cell 3 (copied binary) | WDAC/App Control → Intune/MDM the customer may not have | W3 (detect-and-revoke as the safe subset) |
| Windows machine-lane certification matrix | Windows VMs; `%ProgramData%` redirection cannot move the vendor's machine root | W6 T11 — puts the cost to the owner as a decision |
| macOS | Apple licenses macOS VMs only on Apple hardware; outside the certified boundary | W6 T11 |
| MDM/Intune/GPO, WDAC, AppID tagging | A customer tenant we do not control | W2 and W3 both refuse to write it as a task |
| `forced-egress` fleet metric | No producer until W3 T6 | W8 T7 (`measured: false`, null numerator) |
| Branch protection on six repos | GitHub Free plan — owner spend | **No wave mentions it**, and several assume gates it would enforce |
| GitHub Actions | Blocked org-wide; jobs die in ~4 s | W1 T11, W2 T5, W6 T11 all correctly route through `ci/gates.json` + the Docker mirror. 73 legs (68 Installers `finding-b-e2e.yml` macOS/Windows) remain unmirrorable. |

**`PREVENTION_ACTIVE` — the strategy's Phase 3 gate and the headline of the Enterprise readiness row — is blocked on exactly two things: WFP direct-egress denial (in the plan, W3 T6) and a session dimension (in no wave at all).** W8 is right that reading zero everywhere is the correct output today; it is not right that the reason "simply stops being emitted" when W3 lands — someone must wire a `directEgressDenied` producer into the posture input. Assign that to W3 T6 explicitly.

---

## 7. THE HONEST SUMMARY

These eight waves are a real implementation plan built on unusually good reading of the actual code — 40 spot-checked citations returned 5 misses, and the misses cluster in one task and all point toward a *cheaper* fix than the one written. The plan's core insight is correct and repeatedly demonstrated: most of what the strategy asks for is already built and unwired, so the dominant cost is connecting, proving and telling the truth rather than building. It closes the measured 6-in-10 private-key leak by answering the decision locally from a signed snapshot that already exists on disk; it gives the daemon real crash recovery and a kernel-verified per-session identity; it closes a one-shift-key bypass and makes the provider route unavoidable at the OS layer with a fail-closed condition that is genuinely provable — the gateway process holds the filters, so no gateway means no filters and the developer's agent still works; it makes the vendors' machine-managed sources authoritative; it stops four obligation receipts attesting plans as outcomes; it makes the canary able to go green for the first time by wiring four seams, not the one the source of truth named; it makes every lifecycle transition prove itself; and it replaces roll-up health with coverage truth where a green state is impossible unless the reason list is empty. The sequence costs roughly six phases with hard gates between them: nothing in Phase 2 is worth its score until Phase 1's decision reaches the endpoint, nothing in Phase 3 can go green until Phases 1 and 2 land, and four separate Backend deploys must precede their agent releases — with Wave 8's field-level wire-loss counter landing **first**, before all of them, because it is the only thing that makes a violation of that order visible instead of silent. **Before any of it starts, eight defects need fixing: Wave 2 writes a `sessions` directory into the machine root that the MSI guard will reject with error 1722, rolling back the upgrade on every enrolled endpoint — the fourth occurrence of a brick class Wave 7 exists to prevent, and Wave 2 never mentions the guard; Waves 1 and 5 state opposite facts about whether the runtime-adapter vocabulary has a cross-repo pin (Wave 1 is right); Wave 1's most dangerous task builds a contract artifact that already exists, pinned, inside the Installers tree; Waves 5 and 6 both wire the canary receipt sink and Wave 5's version targets the wrong composition root and assumes a backend client method that does not exist; and Waves 2 and 7 both claim the same Phase-1 outcome with two incompatible stamps.** What the plan is blocked on that is not engineering: Codex cannot reach 9.3 without vendor artefacts for permission profiles and the `elevated` sandbox that we do not have; the Codex dialect pin cannot widen past 0.144/0.147 — leaving the owner's own client uncertified — without two live artefacts per family; the Windows machine-lane certification matrix needs real Windows VMs and a cost decision, and macOS needs Apple hardware; the copied-binary bypass cell needs WDAC through an MDM the customer may not have; branch protection across the six repos is blocked on the GitHub Free plan and no wave mentions it; and **no wave at all owns proving any of this against the production authority chain, which is a required clause of two scorecard rows.** The plan is honest about most of these. It should be honest about the last one too.