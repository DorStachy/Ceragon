# What is left before this is finished

Consolidated 2026-08-18 from Stage A, Stage B, both Stage C runs (140 verdict rows), and the 13 items
`REMEDIATION-PROGRESS.md` closed the build wave with. This is the register — every open item, with what it
actually is, so nothing is closed by forgetting it.

**Definition of done in force:** ship-ON (no flags), real customer-imitation E2E, prod deploy, SOT/roadmap updated.
No partial credit.

---

## CORRECTIONS TO THIS REGISTER — verified 2026-08-18, read before acting on any row

Six rows below are wrong. They are corrected in place, but listed here because acting on two of
them causes damage.

1. **§C's #20 remediation would RE-BREAK #20.** Retracted in place — see the callout in §C.
   #20 is already closed in production and needs no AWS write.
2. **`CLAUDE.md` named the wrong DynamoDB cache table.** The live production artifact cache is
   the table named `...-staging`; the `-production` one is empty. "Fixing" it triggers a
   re-analysis storm. Corrected in `CLAUDE.md` (commit `a9032ca`), which now cites
   `CERA_PRODUCT_GUIDE_PLAIN_ENGLISH.md` §11.2 as authoritative.
3. **#19 (three dropped agent fields) is a REAL defect.** It was briefly reported here as
   NOT_A_DEFECT off a single crashed run; re-running proved reverting the declaration makes the
   values vanish from the stored row.
4. **A4 / shared contracts: there are THREE copies, not two,** and the workspace-root
   `packages/shared-contracts/` is an orphan on no build path. Backend compiles
   `Backend/packages/shared-contracts/`. Separately: only 3 files anywhere carry the `MIRROR FILE`
   banner, none of the nine divergent ones do, and the `contracts-mirror-parity.sh` cited as
   evidence in commit `7a85d3b` is tracked in none of the three repos and is not on disk.
5. **A2 #11 (exit-2 deny contract) is SETTLED, not open.** A frozen 15-case corpus exists at
   `internal/airuntime/adapters/codex/testdata/shook/deny-matrix-0147/`, and
   `adapters/codex/response.go:359` now names `ExitHookFailed = 2` as fail-open: exit 2 prints
   `PreToolUse Failed` and RUNS the tool. The register had this backwards.
6. **B6's "no spec exists" rests on a grep that searched only `*.go`.** The overview-strip, the
   region and the feed are all TypeScript. This is a modification, not a new build.

---

## A. Code defects to fix — buildable now, no special hardware

### A1. The machine credential is readable, the number that would say so is a constant, and nothing repairs it

**These five are one mechanism, and F16's analysis predicted it before the gate measured it.** Fix them together
or the fix is cosmetic.

| # | Defect | Where |
|---|---|---|
| 1 | `MachineLocalReadSDDL` grants `BUILTIN\Users` **read** — and `credentials.json` holds the endpoint signing private key | `internal/winacl/machine_secret_windows.go:68` |
| 2 | A non-elevated user can **read** that file and **create files in its directory** — measured against the real install | — |
| 3 | `Load()` **swallows EACCES** and returns `cfg, nil`, so a blocked read produces `identity == nil`, which is exactly the input that fires the mint | `config.go:374-376` → `trust_anchor_client.go:243` |
| 4 | `storageAssurance` is a **hardcoded constant** (`OS_PROTECTED`), one value in the vocabulary, two producers assigning it unconditionally — so the measurement that would expose 1–3 can only ever say "protected" | `internal/core/config/ai_trust.go:17` |
| 5 | **No startup self-heal.** `HardenExistingMachineSecrets` has one production caller, inside `runHardenShims`, guarded by `requireMachineRoot` and reachable only via the admin-only `harden-shims` subcommand | `cmd/devoid/main.go:8120` |

Note for the F16 work: the mint gate is fronted only by `HasValidRequestSigningV2()` (`:223`), which measures the
**request-signing** credential and says nothing about the AI key. Splitting the key into a SYSTEM-only file while
leaving `credentials.json` on `MachineLocalReadSDDL` — the CREDS.md design — **still lets the non-elevated shim
pass `:223` and arrive at `:243` with a nil identity.** It still mints. There are **five** reader entry points,
four funnelling through `performEnrollment` (`main.go:6715`), so a guard keyed on `ConvergeTrustAnchor` alone
misses the funnel.

### A2. Codex governance lane

| # | Defect |
|---|---|
| 6 | **CX-10 is not implemented.** `internal/daemon/ai_recent_prompt.go` matches by **substring** with **no session/thread dimension** — conversation A's prompt matches into conversation B's request. The plan's own defeat step is vacuous: there is no binding to remove. |
| 7 | The persisted-deny consult still runs **before** extraction and sanitation (`openai_decision.go` `handleUplink`). Currently unexploitable on SSE because `firstTurnInputHashFor` hashes the whole input array; it becomes live on the WebSocket-v2 lane. |
| 8 | **WSL probe fails open:** the predicate is `test -s`, so a **directory** at `/etc/codex/requirements.toml` reads as `WSL_COVERED`. |
| 9 | `devoid wsl list` and `devoid ai status codex` use **two different enumerators**, report different distro sets seconds apart, and **neither says so**. |
| 10 | **Codex 0.147 suppresses user-scope `config.toml` hooks and prints `hook: … Completed` for hooks that never ran.** Our readiness surfaces must not treat the client's "Completed" as evidence; machine scope is the only scope that runs. |
| 11 | **The repo contradicts itself on the exit-2 deny contract.** `DENY_MATRIX.md` (measured, 0.144): exit 2 **allows**. `adapters/codex/response.go:357` (source read, 0.147): exit 2 + non-empty stderr **blocks**. We ship an exit-2 deny channel that depends on the second. Needs the measurement first (A2 below), then a fix on whichever side is wrong. |
| 12 | **There is no `SessionEnd` hook on the Codex lane at all** — five hook tables, none of them SessionEnd; the adapter rejects the canonical event. The plan budgets a hook that does not exist. |
| 13 | `devoid ai install-hooks codex --codex-home <dir>` is **not write-sandboxed** to the given home. |

### A3. Bypass and opt-out telemetry is invisible end to end

**Fix #14 first — it is the root cause of 15–18 being unobservable.**

| # | Defect |
|---|---|
| 14 | **`AuditService.logBypassAlert` is a no-op** by a 2026-05-27 operator decision. Every heartbeat `bypassTelemetry` event is accepted `200 "Heartbeat successful"`, counted as accepted, and dropped. `audit.service.ts:1398-1413` |
| 15 | The opt-out transition event is written but the **allowlist strips all seven identifying keys** (`transition, runtime, state, actor, reason, lever, expiresAt`) — the row cannot say what transitioned. *(Same `safeMetadata` allowlist class as prior waves.)* |
| 16 | **No event at all for the ungoverned window** — zero events across the whole delete → ungoverned → repair cycle. |
| 17 | Deleting the opt-out marker changes state but **fires no second event**. |
| 18 | **No console surface for the opt-out anywhere** — zero matches for `SKIPPED_AUTHORIZED`/opt-out in backend `src/` or the frontend. |

### A4. Fields dropped and builds unidentifiable

| # | Defect |
|---|---|
| 19 | Three agent fields **silently dropped** — `undecidable.daemonUnreachable`, `undecidable.daemonError`, `previewsTruncated`. Routes are agent-lenient (`forbidNonWhitelisted:false`) so there is no 400 and no error. Per the Go source the first two count actions that ran with **no governance at all**. *(Declared during the build wave — confirm the declaration actually landed against a stored row, not an HTTP status.)* |
| 20 | **The running backend cannot say what build it is** — no `CF_BUILD_SHA` in the process. The surface itself is correct and honest when stamped (two builds → two distinct answers; unstamped **omits** the key rather than reporting `"unknown"`). **This is a deploy-plumbing fix, not a code fix** — and it is the exact trap that cost this session hours when the container served an 8-hour-stale dist. |

---

## B. Owner decisions — blocked on a call, not on work

1. **A4 shared-contract parity** — all nine mirrored files diverge. Which divergences are intended?
2. **F36 Stage 2** — the spec drops the team fold **and** calls a key-minting WRITE inside a GET. Unsafe as written.
3. **F16 credential split** — where `trust_anchor_client.go:248` writes was never settled. See A1 above; the
   analysis and the live measurement now agree, which should make this decidable.
4. **C11d-2 — consumer-less queue raises nothing.** `laneVerdict` is hard-wired `NOT_EVALUATED`, threshold `null`,
   on the stated reasoning that a threshold from an n=2 sample would be *"a guess wearing a number's clothing"*.
   Defensible — but nothing else raises either, so an abandoned lane is silent. **Is that acceptable?**
5. **F11** — the programme contradicts itself: `READ-THIS-FIRST.md:57` says do **not** fix in code, settle by
   inspection; `IMPLEMENTATION_PLAN.md:235` lists the columns as a Wave 1 deliverable.
6. **overview-strip / region guard-health** — **no spec exists.** Needs authoring before it can be built.

## C. Owner-executed AWS/ops — config, not code

`AUDIT_RETENTION_DAYS` · `CERAGON_ENV` · `RELEASE_MANIFEST_PATH` + its `s3:GetObject` grant · CloudWatch alarms ·
Hetzner.

> ⚠️ **RETRACTED 2026-08-18 — DO NOT DO THIS.** This line used to say: add
> `CF_BUILD_SHA`/`CF_BUILD_TIME` on the ECS task definition to close #20. Doing that
> would **re-break** #20. A task-definition env entry overrides the image's ENV, and the
> deploy clones the previous task definition, so an unknown key is carried forward
> forever and pins the reported build identity to a dead build. That is the exact defect
> `d79b8ac0` fixed, and `build.yml:586-591` now strips both names rather than setting them.
>
> **#20 is already closed in production.** Measured read-only on 2026-08-18:
> `x-devoid-backend-build: d52a1ce07c29413b3ccd33a13aa46eef6b1a732b`, with three-way
> agreement between the ECR tag, the image's `CF_BUILD_SHA` and what the process reports.
> The task definition correctly sets nothing. **No AWS write is required.** Evidence:
> `AWS-OPS-STATE.md` §C-0/C-0c.

---

## D. Verification still owed — this is the larger half

### D1. Two Stage C outcomes have NEVER BEEN RUN

Zero rows for either across all 140 verdicts in every workflow to date:

- **C5 — command guard cannot be trivially bypassed.** Every confirmed transform must get the same verdict as its
  literal form, **and** the paired benign twin must still be ALLOWED — a rule that blocks both proves nothing.
  Plus the F8c replay: zero newly-blocked benign commands over the captured corpus.
- **C12 — DeVoid does not interrupt ordinary work (F41).** PASS = **zero interruptions** on a realistic agent
  session, with every genuinely dangerous probe still blocked. **This is the row the owner feels directly** — every
  interruption a developer sees is ours, never the harness's.

### D2. Stage D — render surfaces — HAS NEVER BEEN RUN

**The last wave died at exactly this stage.** D1 grep *every* render file for each changed field · D2 drive a
browser to the customer's actual entry point and screenshot each changed surface · D3 check populated, empty,
loading, error, **and absent-capability** (must read "Not reported" — never green, never red) · D4 mobile width.
**Stage defeat:** point the console at a tenant with no data and confirm the surfaces read honestly empty.

### D3. Gates that are BLOCKED or NOT-RUN

- **A2 Backend full suite — BLOCKED.** 957 suites, ~13–24 per 10 min on the Windows bind mount ⇒ 7–13 hours. One
  parallelisation attempt wedged the Docker engine. **Needs a different strategy, not a retry:** source and
  `node_modules` in Docker volumes rather than a bind mount, conservative worker memory.
- **Three discipline gates NOT-RUN** — `check:response-only-fields` **drift mode** (the only mode that catches the
  frontend copy drifting from the Backend registry; every discovery path it documents is dead from a worktree),
  `check:ai-security-frontend-consumer`, `check-vocabulary-contrast` (the latter two are `prebuild`/`pretest`
  hooks that the direct-binary invocations A1/A2 mandate **bypass**).
- **C8 agent half.** The server half is proven live over the real wire — `PROVEN` and `NOT_PROVEN` both round-trip
  and a missing receipt cannot manufacture `PROVEN`. The agent half needs a real enrolled endpoint.
- **Two flaky tests, both test-design not product:** `BoundedFanOutCompletesInTimeBox` (throughput assertion,
  1024 sessions / 16-way pool / hard 5 s wall clock) and `internal/skillgate
  TestResolve_PluginFastPathHonoursContext` (1 ns-timeout test-side race).

### D4. The FAIL rows are single-sourced

Only PASS rows were adversarially refuted — **8 of 48 fell, five because the defeat step did nothing.** Nobody
attacked the 12 FAILs. Before acting on any of them, confirm the two that look like deliberate design rather than
defect: **C11d-2** (null threshold, above) and **#12** (no SessionEnd hook may be intentional for this lane).

---

## E. Needs a real box — cannot be closed here, by construction

| Item | What it needs |
|---|---|
| **C6b** — DACL across fresh / upgrade / **lite** / re-enrol | Elevated MSI on a disposable box, snapshot between modes. **Lite is the mode most likely to skip the elevated `harden-shims` pass** — the only caller of the self-heal in A1#5. |
| **B1b / B3 / C3c** — enrolment, policy round-trip, ungoverned-window console state | A locally-enrolled machine-scope endpoint (needs `%ProgramData%\devoid`) |
| **C2b-2b** — the exit-2 deny contract on 0.147 | Teach `testdata/shook/harness/stub_server.cjs` 0.147's tool shape — **the accepted shape is already in the captured request bodies.** The rig is otherwise reusable as-is. Highest-value open item in the Codex cluster. |
| **C2j / C2f-CLI-CX9** — block rendering on Desktop + VS Code | GUI automation on a box where the client's provider config may be changed. Also `codex exec --json`, which is cheap anywhere. |
| **C2i-2** — daemon restart mid-turn under the SCM | A local (non-production) enrolled daemon |
| **C2d-5 / C2d-6** — WSL roll-up branch, console surface | Clean Windows Codex layers; and **no backend/frontend code consumes WSL coverage at all** |
| **C11a-3 / C11d-3** — installer key resolution, queue age | Real S3; CloudWatch `GetMetricData` (no local substitute exists) |
| **F8b · F26** | ≥7-day fleet replay; live Codex handshake header |
| Stage E | Cross-tenant isolation · signed-bundle propagation latency · second endpoint · second non-admin user · live nav-block |

---

## F. Then, and only then

Nothing is pushed — **129+ local commits across 12 branches and 3 integration trees.** After the above:
push → CI on the merged SHAs → **deploy order is fixed: frontend allowlists → backend → agent MSI → extension**,
with the backend tolerating the installed old-agent fleet at every step. The **Deploy-to-ECS job** is the truth;
a workflow run's overall conclusion can be green while the deploy job failed.
