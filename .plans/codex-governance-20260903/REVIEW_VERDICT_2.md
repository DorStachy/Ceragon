## Verdict: `codex-governance-20260903/PLAN.md`

**Note on inputs.** The fact-check clusters and five of six adversarial findings handed to me were placeholder text (`"problem": "test"`); G1 was correctly refuted (`ai_status_wsl.go` appears nowhere in the plan). Only the completeness critic and the one ownership finding had content. Everything below is my own re-verification: ~35 file:line citations opened across Installers/Backend/Frontend, all six `evidence/*.txt`, `PARALLEL_EXECUTION_CONTRACT.md`, `PARALLEL_HANDSHAKE.md`, and both git histories.

---

## 1. Should work start from this plan?

**YES AFTER THE BLOCKING FIXES.** The diagnosis is the strongest part — of ~35 mechanism citations I opened, all but one held, most landing on the exact line, and the corrections the plan made since its last review (F1's histogram numbers, F4's "6 projects", F5's 3,733, F7's self-retraction, W1 T1's site-count retraction) all check out against the committed evidence. But F9 is factually wrong in a way that hollows out D8 and most of W6 T5, and the ownership audit in W-1 — the wave built specifically to catch this — still misses **three** more contract-owned files and the contract's entire §1 directory rule, including the file **W5 T1** touches while W5 is billed as "no dependencies, start now."

---

## 2. Corrections the plan MUST make

**C1 — F9 is WRONG; the console already exposes runtime-integrity `mode`.** §0 F9 says `runtimeIntegrity` appears in `ai-security-policy-section.tsx` "only as validation/advisory keys (`:1251, :1289, :1700, :1795`)". It does not. `RuntimeIntegrityControls` (`Frontend/components/admin/ai-security-policy-section.tsx:1837`) renders a **Mode** `<select aria-label="Runtime integrity mode">` bound to `v.mode`, whose `onChange` writes `s.mode`, populated from `AI_RUNTIME_INTEGRITY_MODES = ["off","observe","enforce"]` (`Frontend/types/ai-governance.ts:5929-5933`) — plus editable selects for `assuranceFloor`, `responseStrength` and `targetRuntimes`. It is rendered inside a real `PolicySection` titled "Policy Integrity & Tamper Response" at `:6565-6589`, wired to `updateConfig`, whose own copy reads *"There is no Off switch on the endpoint, only here."* The two lines cited as validation are not: `:1251` is the `AiPolicySectionKey` union member and `:1289` is the `ALL_AI_POLICY_SECTIONS` entry — those are how the section gets **rendered**.
Replace F9 with the finding that actually survives: *the shipped default is `observe` (`Backend/src/ai-security-policy/ai-runtime-integrity-policy.ts:144`) and no production org has been observed raising it* — a posture question, not a missing-UI question.

**C2 — W1 T1's site count is still wrong, in the direction the plan warned about.** T1 says the loose grep prints 21 across 10 files and "roughly 14 are real calls." Loose = **21** ✓, files = **10** ✓, but the plan's own anchored grep, run verbatim, prints **12**. Also, the parenthetical "`internal/aikeystore/location.go` (5 sites) and `internal/policybundle/trust_anchor_client.go` (2)" mixes counting methods: those are loose-grep numbers. Real calls are `location.go:220,253` (**2**) and `trust_anchor_client.go:330` (**1**); the rest are doc-comment mentions. Say 12, and label 5/2 as loose hits.

**C3 — §7's cost table contradicts W1 T1.** Row 2 still reads "2–3 days incl. the **19**-site audit" — the number T1 explicitly retracts. Change to "the 12-site audit".

**C4 — §6's non-goal is false as written.** "It does not… enrol any machine" vs W0 T1 `devoid setup enroll --token <T>`. Rewrite as: *"It does not enrol any machine on its own authority; W0 T1 is the owner's act under D1."*

**C5 — D7's Blocks column is under-scoped.** The table says D7 blocks "W4, W6". W1's EXIT (line 180) is "On a fresh **deferred** install on the VM (D7)" and W2's EXIT (line 205) is "Fresh MSI install on the VM". Change to **W1, W2, W4, W6** — otherwise a reader following §7's order runs W1 at position 2 and discovers at EXIT that it cannot close.

**C6 — W-1 T4 undercounts.** It says "W2, W3 and W4 touch six files under that path." The distinct `internal/codexmanaged/` paths the plan proposes to **write** are ten: `provider.go`, `hookdialect147_oracle_test.go`, `testdata/liveproof/ledger.json`, `testdata/dialect-disposition.json` (new), `dialectprobe/` (new), `machine_projection.go`, `machine_effective.go`, `testdata/scfg/managed/probes/`, `requirements.go`, `capability_disposition.go`.

**C7 — W-1 T4 misreports the handshake as silence.** The plan says P47 "asked at 04:12 … and no answer by 10:07." The 04:12 entry does not ask open-endedly; it states *"We are treating it as P47's because the dialect machinery is a detection-semantics concern… Correct us if that is wrong."* That is a **default claim that stands unless rebutted**, and it changes W-1 T4 from "get an answer" to "rebut a standing claim or accept it." Also, three files under that path are **already resolved** by §2 and need no ruling: `canary.go` → P9, `testdata/liveproof/ledger.json` → **BOTH, §3.2, append-only** (which is exactly what W3 T1 does), `hookdialect.go` → P47/FROZEN.

---

## 3. Blocking findings — fix before W1 starts

**B1 — `Backend/src/ai-governance/runtime-adapter-shape.ts` is P9's, and W2 T3 edits it.** Contract §2, row 1: 13 P9 references vs 1, owner **P9**, *"The runtime binding is P9's core object"*; the non-owner rule is absolute — *"not a line, not an import."* W-1's cross-check does not name it.
**Fix:** add it as an explicit W-1 task beside T2/T3 — post a SEAM REQUEST naming the exact `machineTier` field and type to add beside `attestedProfile`; P9 lands it as its own no-behaviour-change commit and replies with the SHA; W2 T3 then consumes that field from files this programme owns. W2 T3 must not start until the seam clears, the same gate W-1 already imposes on `server.go`.

**B2 — `Installers/cmd/devoid/ai.go` is P9's, and W5 T1 edits it — in the wave billed "no dependencies."** Contract §2, row 2: 7 vs 3, owner **P9**, *"Status/posture surfaces belong to coverage truth."* W5 T1's file list ends with `cmd/devoid/ai.go:892`; I opened it — line 892 is `printVendorHookFailOpenTo`, reading `hooklatency.ReadDefault()`, exactly the summary T1 changes the verdict of. §7 runs W5 at order 3 and its header says "no dependencies."
**Fix:** delete "no dependencies" from W5's header, add a W-1 seam request for the `ai.go` render call site, and keep the `summary.go` verdict change (which this programme can own) on the P9-owned side of the seam.

**B3 — `Frontend/components/admin/ai-security-policy-section.tsx` is P47's, and W6 T5 edits it.** Contract §2: `ai-security-policy-section.ts` → **P47**, *"Policy authoring UI"* (the table's extension is wrong; the real file is `.tsx`, 306 KB). Combined with C1, W6 T5 is a non-owner edit that would largely rebuild controls that exist.
**Fix:** cut W6 T5 down to the one thing that is genuinely missing — the rollout-ring state displayed beside the control — and raise it as a P47 seam request, or move it to W2 T4 where the ring work already lives.

**B4 — W-1 T1 audits the wrong half of the contract.** T1 cross-checks "all 28 rows of §2." §1 assigns whole **directories**, and its rule is stricter: *"A task that edits the other programme's directory is out of scope by definition, no matter how small the edit looks."* P9's directories include **`windows-installer/`** and "the daemon's transport and service plumbing." This plan edits `windows-installer/msi-build/CustomActions.wxs` in **W1 T5 and W2 T1**, and `internal/daemon/daemon_auth.go` in **W1 T2/T4**.
**Fix:** W-1 T1 must run against §1 *and* §2, and produce a directory column. Then decide per file: seam request, or an explicit owner ruling that this third programme is not bound by a two-party contract. That ruling is worth asking for once, up front, rather than five times.

---

## 4. Major findings — rework risk, per wave

- **W2/W3/W4 (highest rework risk).** If P47's standing `internal/codexmanaged` claim is accepted, nine files across three waves convert from direct-edit tasks to wait-on-seam tasks, and the shape of all three waves changes. This is a fork in the plan, not a checkbox — W-1 T4 should carry both branches with their costs, so the owner is choosing between two plans and not just answering a question.
- **W2 T4 names no file, and the obvious target is P9's.** "Endpoint pages show the org's runtime-integrity ring next to the integrity state" — `Frontend/app/admin/endpoints/coverage-section.tsx` already carries `RolloutReadinessResponse`/`RolloutReadinessVerdict` rendering (`:661-681, :1598-1631`) and is **P9**-owned. Name the file in T4, or route it through the seam.
- **W2 T4b is inventing a rollback procedure that already exists.** `internal/liveproof/register.json:78` documents the real audited operator seam — `POST /api/v1/ai/policy-delivery/rollout` — and its progression gate: *"one write may move the ring or the phase, not both to their maxima"* (the rig needed SHADOW/0 → CANARY/9999, then CANARY/10000). T4b should cite that seam and its two-write constraint rather than design a new one; that also fixes the missing cohort floor, since 9999 bp is a real starting value with precedent.
- **W3 T3 parallels a drift gate that exists.** `pr-checks.yml:648-666` already couples the CI pin to `requiredBuilds` in `ledger.json` (*"the next step FAILS if they drift apart"*, `TestLiveCanary_RequiredBuildIsActuallyPresent`). T3's npm-registry resolution is genuinely new, but write it as an **extension** of that coupling inside `codex-vendor-lane` (job confirmed at `:605`) — otherwise two gates answer overlapping questions and one will rot.
- **W5 T3 is cheaper than stated.** The plan implies the manifest generator must be built. `Backend/scripts/generate-release-manifest.cjs`, `src/health/services/release-manifest.service.ts` and its three spec files all exist; nothing in `Dockerfile`, `package.json`, or `.github/workflows/` invokes them (I grepped all three — zero hits). T3 is a **wiring** task. Restate it that way and it drops out of the 1–2 day W5 estimate.
- **Programme-level: eight owner-only gates on a serial path.** D1–D8, plus the production ring change inside D2 and the standing fresh-ask on deploy/release. §7's order is near-fully serial and its cost column prices engineering only. The realistic critical path runs through one person answering eight non-parallelisable questions. Group them: D1+D2+D7 are a single "give me a box, a token, and a ring" ask that unblocks W0, W1, W2 and W6 at once; D3/D4 are cheap product rulings; D5/D6/D8 can wait for their waves.

---

## 5. What the plan got right — trust these

- **F2's whole mechanism chain, verbatim.** `IsSystemInstall()` is `os.Stat` on the machine `credentials.json` (`config.go:738-742`, exact); `security.DefaultPaths()` is `os.UserHomeDir()`-derived with no machine variant (`paths.go:27-33`); the daemon calls it in `sendHeartbeat()` at `server.go:1700` (exact); `daemonTokenWriteTarget` branches on `config.IsSystemInstall()` at `daemon_auth.go:266-272` (exact); the 401 is `daemon_auth.go:406` (exact); `daemonAskStatus → UngovernedReasonDaemonError` at `ai_daemon_ask.go:72-73`; `EventTypeCredentialUnreadable` at `credential_reachability.go:71`. This is the P0 and it is airtight.
- **F1's numbers now match the committed histogram exactly** — 61/1786/57, POST 1751 + 58, UPS 0/8. The prose-vs-evidence correction landed.
- **F3, to the character.** `codex_machine_migration.go:50-52` reads *"It is not an installer. A box with no baseline is NOT_APPLICABLE and stays that way…"*; the Debug log is at `:105`; `ai_codex_machine.go:56,579`; and W2's precondition `grep -rn "codex-machine install" install.ps1 *.wxs | wc -l` really prints **0**.
- **F3b, including the deploy check.** `targetShapeForProvider` returns `CODEX_REQUIREMENTS`/`MACHINE_FILE` for codex at `endpoint-policy-integrity-read.service.ts:465` — exact line. `mode: 'observe'` at `:144`. The SHADOW/empty-cohort floor at `ai-policy-rollout.service.ts:75-101`. `git merge-base --is-ancestor 4cdeccd1 bc11446c` → **ok**, and `bc11446c` is Backend HEAD. `706a5c4d` is dated 2026-08-30 and does touch `ai_integrity_intents.go` and `controller.go`.
- **F4 and F5 against the evidence file.** Six trusted projects with one `system-dir` (`27ec468c`), two un-attested MCP servers, one feature override, `network_access` re-enabled; `3733 delivered decision(s)`; `0.150.0-alpha.8`; `knownHookTrustDialects = {144, 147}` at `hookdialect.go:166` (exact); `requiredBuilds = [0.134.0, 0.146.0-alpha.3.1]`, `"status": "UNFIRED"` at ledger line 2; CI pin at `pr-checks.yml:654`.
- **F7's handling is the best thing in the document.** The plan tells the reader to distrust its own finding, states both surviving readings, and refuses to assign severity. The evidence supports exactly that: the interactive run stamped 08:37:11Z (11:37 local) and the 11:40:01 scheduled run returned `0`. Keep this pattern.
- **F8's third bullet holds despite an easy trap.** "No `Backend/Dockerfile` or workflow ships one" is literally true — I grepped Dockerfile, all workflows, and package.json: zero. The `release_check.go` comment at `:258-262` even quotes the measured production 503.
- **W4's restraint is grounded in code, not caution-theatre.** `requirements.go:408-422` is a first-person record of a `network_access = true` change that was drafted, measured against 0.148.0-alpha.15, found indistinguishable via `doctor --json`, and reverted — and it closes with *"Re-measure by attempting actual egress"*, which is W4 T3 verbatim. Same for `machine_projection.go:17-30`.
- **W1's adversarial defeat test is the right instinct.** `TestNoUnprivilegedProcessCanForgeMachineScope` correctly identifies that T1 turns one check into an OR of three and therefore weakens the predicate. `residue_probe_windows.go:99` confirms the `Devoid\SecurityBoundary` marker is real and already probed. Do not drop this test to save time.

---

## 6. Gaps to add

- **W-1 (new task): audit §1 directories, not just §2 rows.** Produce a directory column; resolve `windows-installer/*` and `internal/daemon/daemon_auth.go`. See B4.
- **W-1 (new task): seam request for `runtime-adapter-shape.ts`.** See B1.
- **W-1 (new task): seam request for `cmd/devoid/ai.go`.** See B2, and strike "no dependencies" from W5.
- **W-1 T4 (rewrite): carry both branches of the codexmanaged ruling** with their wave-reshaping costs. See C7 and §4.
- **W0 (new task, before T5): read the ring's rollback path** from `register.json:78` and record the two-write progression constraint — it is a precondition for D2 being reversible, and D2 is the one production-posture change in the programme.
- **W2 T4 (add): name the file.** See §4.
- **W6 (add): a contract test that the ownership audit itself ran** — a check that every file this programme's waves name appears in W-1 T1's table with an owner and a disposition. The failure this programme keeps repeating is not editing the wrong file; it is *not noticing* it did.
- **W6 T5 (cut to one line): the ring state beside the existing control.** The `mode` and `assuranceFloor` controls exist. See C1 and B3.

---

## 7. Revised wave order

| order | wave | change from §7 |
|---|---|---|
| 0 | **W-1**, expanded: §1 directories + §2 rows; four seam requests (`server.go`, `main.go`, `runtime-adapter-shape.ts`, `ai.go`); codexmanaged ruling with both branches priced | was 3 seam requests and §2 only |
| 0.5 | **One combined owner ask: D1 + D2 + D7 + D3** | new — a token, a ring (with its rollback path), a VM, and the deferred-mode ruling unblock W0, W1, W2 and W6 in a single conversation instead of four |
| 1 | **W0** (needs D1, D2) | unchanged |
| 2 | **W5 T2 + T3** | promoted: T2 is doctor-privilege honesty and T3 is wiring an existing generator — neither touches a contested file, both can run while seams are pending |
| 3 | **W1** (needs D3, D7) | D7 added; cost restated as the **12**-site audit; T2/T4 gated on the `server.go` and `daemon_auth.go` seams |
| 4 | **W5 T1** | split out — blocked on the `cmd/devoid/ai.go` seam, unlike T2/T3 |
| 5 | **W2** (needs D4, D7, and the `runtime-adapter-shape.ts` seam) | D7 and the seam added |
| 6 | **W3** (owner runs T2) | unchanged; T3 written as an extension of the existing `codex-vendor-lane` pin/ledger coupling |
| 7 | **W4** (needs D6, D7) | unchanged |
| 8 | **W6** | T5 reduced to the ring-state line and routed to P47; T1/T2 unchanged |
| — | **W5 T4** | stays where it is, but its first act is the F7 re-capture, and the plan must not budget for a fix until the re-capture says there is one |