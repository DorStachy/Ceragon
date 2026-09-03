# Codex governance — close every gap, and make the gaps structurally impossible

**Programme:** `codex-governance-20260903` · **Owner:** DorStachy · **Author:** Fable (research 2026-09-03; all measurements on `CND34521VN`, agent 7.10.9, `ENROLLMENT_MODE=deferred`)

**Evidence for every number in §0 is in [`evidence/`](evidence/).** Every mechanism claim carries a `file:line`. Where a claim was inferred from code and not yet observed, it says so.

---

## 0. What is actually broken — measured, not assumed

The question that started this was "is my endpoint covered the way we want?" The answer is no, and the reasons are not the ones that were being worked on for a week. Ranked by what a customer would lose.

### F1 · P0 — Gating checkpoints are fail-open on this install, with the daemon UP

Since the 08:01 install: `PRE_TOOL_USE` **61 decided / 1,786 `daemon-error` / 57 `daemon-unreachable-budget-expired`**. `USER_PROMPT_SUBMIT` **0 decided / 8 `daemon-error`**. `POST_TOOL_USE` reaches a decision 1,751 times, with 58 fail-safes of its own. The primary enforcement checkpoint proceeds without asking anyone 96% of the time.

Evidence: [`evidence/hook-rollup-post-install-histogram.txt`](evidence/hook-rollup-post-install-histogram.txt).

Every figure above is read from that committed histogram, not from a live count. An earlier draft of this section cited 1,571 / 7 / 1,537, taken from a doctor run 3.5 hours older than the evidence file; the prose was the outlier while two independent evidence files agreed with each other. The conclusion is unchanged and slightly worse at the real numbers.

### F2 · P0 — The cause of F1 is a mis-scoped daemon token, not "unenrolled by design"

`IsSystemInstall()` is literally `Stat(%ProgramData%\devoid\credentials.json) == nil` (`internal/core/config/config.go:738-742`). A deferred-enrolment install has no `credentials.json`, so the SYSTEM daemon believes it is a per-user install, resolves its paths from `os.UserHomeDir()` (`internal/security/paths.go:28-33`, used by the daemon at `internal/daemon/server.go:1700`), and mints its capability token under **the SYSTEM profile** (`internal/daemon/daemon_auth.go:266-272`, `:285-336`). No user can read it; the CLI sends no bearer; the daemon 401s (`daemon_auth.go:406`); the hook stamps `daemon-error` (`cmd/devoid/ai_daemon_ask.go`: `daemonAskStatus → UngovernedReasonDaemonError`).

The token is **absent from every user-visible path** (all four candidate paths ABSENT; an elevated stat of the SYSTEM profile was UAC-declined — the code path is unambiguous). The daemon *does* record the refusal (`internal/daemon/credential_reachability.go:24-37`, `EventTypeCredentialUnreadable`) — into a spool under the same unreadable profile, riding a heartbeat that an unenrolled box never sends. `~/.devoid/devoid.log` shows the same 401 refusing every user-side sweep since install.

The product's own line — `authority: NOT GOVERNABLE [authority-endpoint-unenrolled]` ([`evidence/ai-hooks-status-codex.txt`](evidence/ai-hooks-status-codex.txt)) — means only "no agentId" (`internal/codexmanaged/authority.go:114`). It cannot distinguish this defect from enrolment. **No doctor row, no local event, no wire: invisible.**

### F3 · P1 — The Codex machine baseline is absent, and on this box nothing will ever write it

`baseline present: false`; `MO4-managed-hook-commands UNCONSTRAINED [machine-requirements-absent]`; MO1–MO3 `UNKNOWN` ([`evidence/ai-codex-machine-status.txt`](evidence/ai-codex-machine-status.txt)).

The only manual writer is `devoid ai codex-machine install` (`cmd/devoid/ai_codex_machine.go:56,579`). The boot-time lane repairs only and refuses to install by design (`internal/daemon/codex_machine_migration.go:50-52`: *"A box with no baseline is NOT_APPLICABLE and stays that way; writing one from a boot-time job would turn a repair into a silent install with no operator-facing verdict"*), and logs that outcome at **Debug** (`:105`). Neither `install.ps1`, `Product.wxs`, `CustomActions.wxs`, nor enrolment runs the verb. Known as a SHIP-ON gap since **2026-07-16** (M4.6 E2E). Never made a P9 task.

### F3b · P1 — …but on an *enrolled* box the controller is designed to self-install it, and that has never been proven live

Since 2026-08-30 (`internal/daemon/ai_integrity_intents.go`, commit `706a5c4d`) the loop is complete in code:

1. the controller persists a `UNKNOWN` record for a discovered-but-unmanaged target — the `!managed` branch in `internal/airuntimeintegrity/controller.go` persists **before** returning;
2. the heartbeat carries that record's `controlTargetKey` (`internal/daemon/ai_integrity_observed_projection.go:124`);
3. the backend derives `CODEX_REQUIREMENTS / MACHINE_FILE` **unconditionally for codex** (`Backend/src/ai-policy-delivery/endpoint-policy-integrity-read.service.ts:465`; introduced in `4cdeccd1`, **deployed this morning in `bc11446c`**) whenever the signed policy's `mode !== 'off'` — and the shipped default is `mode: 'observe'` (`Backend/src/ai-security-policy/ai-runtime-integrity-policy.ts:143-146`);
4. the relay hands it to the controller; `!insp.Present → "MANAGED_CONFIG_DELETED"` is drift; `p.Apply` writes the file (`controller.go` `driftReason`, and `:548`). **There is no `observe` gate in the controller.**

The "only writer in the whole repo" comment (`internal/codexmanaged/migrate_argv.go:19`, 2026-08-16) predates the relay by two weeks and is stale.

**Three gates can still zero the loop:** (a) enrolment; (b) the org's rollout ring — no persisted authority → `SHADOW` with an empty cohort (`Backend/src/ai-policy-delivery/ai-policy-rollout.service.ts:75-101`), and the activator writes only a candidate pair for SHADOW (`internal/daemon/ai_policy_activate.go:8`), so `authority.runtimeIntegrity` is null and `buildIntentsForEndpoint` emits **nothing** — the liveproof rig had to advance the ring by hand (`internal/liveproof/register.json`, entry at line 78); (c) client-version discovery returning nothing (`internal/codexmanaged/version_discovery.go`). **Whether any production org's ring has ever been advanced is unknown.** That is the fleet's real state, and nobody has checked it.

### F4 · P1 — Live exposure through foreign governance keys, on this box, now

At the user tier — which the product deliberately does not rewrite (`internal/aiwire/reconcile_decision.go`, the four-rewrites-eight-events lesson) — `ai status codex` reports: `sandbox_workspace_write.network_access` **re-enabled outside the managed lock**; **6 projects marked trusted → approval prompts suppressed**, one classified `system-dir`; 2 un-attested MCP servers (`cua_repl`, `node_repl`); 1 un-pinned feature override (`js_repl`). All reported as `[i]` lines only (`cmd/devoid/ai_codex_hooks.go:495`) — never a bypass event, never on the wire, never in the console. Evidence: [`evidence/ai-status-codex.txt`](evidence/ai-status-codex.txt).

### F5 · P2 — The installed Codex desktop runtime is `0.150.0-alpha.8`, outside every measured hook-trust dialect

`knownHookTrustDialects = {0.144, 0.147}` (`internal/codexmanaged/hookdialect.go:166`), so R7/R8 read `unknown (coverage downgrade)`. The pin is **FROZEN for both programmes** (`.plans/PARALLEL_EXECUTION_CONTRACT.md §2.4`): a row needs two vendor artefacts off a real binary and goes through the owner. The 0.147 row's recipe needed no operator auth and no real `~/.codex` (`hookdialect.go:117-160`). **No capture tool exists — only tests.** **Corrected after review — the evidence says nothing about Codex.** An earlier draft read the canary's **3,733 delivered decisions** as proof *"the hooks are firing on 0.150"*. They are not evidence of that: every row in `evidence/hook-rollup-post-install-histogram.txt` carries adapter `claude-code`, summing to 3,729, and **zero Codex samples appear in it at all**. `Sample.Adapter` (`internal/hooklatency/hooklatency.go:134`) records the adapter precisely so the two can be told apart, and told apart they are. Whether Codex hooks fire on 0.150 is **unmeasured on this box**, which is a stronger reason for W3's capture tool, not a weaker one — and it is exactly the class of claim this plan exists to stop making. CI pins `@openai/codex@0.134.0` (`.github/workflows/pr-checks.yml:650`); `requiredBuilds` = `[0.134.0, 0.146.0-alpha.3.1]`, ledger status `UNFIRED`. Installed here: npm `0.147.0`, desktop `0.150.0-alpha.8` (`%LOCALAPPDATA%\OpenAI\Codex\bin\6ca77c4a9caa4eed\codex.exe`, 313 MB, 2026-08-29).

### F6 · P2 — `desktop-safe` withholds R1–R4 and R6

`desktopVendorWithheld` (`internal/codexmanaged/adapter_report.go:521-524`, reason `vendor-lock-unexpressible`) because the full user-tier profile bricks the desktop core (`internal/codexmanaged/merge.go:183-190`, proven live). The machine tier is where those locks could live — and that is exactly **W4 T10**, which was launched and produced nothing (`.plans/9plus-20260828/PROGRESS.md:76`: *"Both worktrees are empty — 0 commits"*).

### F7 · P2 — The per-user reconcile task was observed refused by Task Scheduler, and the evidence does not confirm it

`LastTaskResult 0x800710E0` = *"The operator or administrator has refused the request"*, every 5 minutes; principal `GroupId=Users, LogonType=Group, RunLevel=Limited`; the Operational log is disabled so the cause is unrecorded. The same action (`devoid-daemon.exe ai reconcile`) run interactively exits 0 and advanced the stamp to `2026-09-03T08:37:11Z`. **READ THE EVIDENCE BEFORE TRUSTING THIS FINDING.** [`evidence/reconcile-task.txt`](evidence/reconcile-task.txt) was captured AFTER an interactive reconcile run and records `LastTaskResult: 0 (0x00000000)` at 11:40:01 - a SUCCESS. The committed artefact therefore contradicts the refusal above, so the failure is at best intermittent. Two readings survive and this finding cannot choose between them: either the refusal is transient and self-clearing, or the interactive run cleared it. **W5 T4's first act is to re-capture this with the Task Scheduler Operational log enabled and settle which.** Until then F7 is an OBSERVATION, not a proven defect, and its severity is unproven.

### F8 · P3 — Endpoint-truth rows that mislead

- Doctor's latency verdict is **neutral** whenever *any* decision exists (`internal/hooklatency/summary.go:286-291` — RED only at `Decisions.Count == 0`), so F1's 96% fail-open rendered as `!`.
- `Daemon persistence` / `Daemon service` print `x … daemon unreachable` while `Daemon reachable` is `+` on the line above (`cmd/devoid/doctor_persistence.go`).
- `Release Provenance` is **unverified** on every endpoint because the **backend** container ships no `release-manifest.json` (`cmd/devoid/release_check.go:254-262`; no `Backend/Dockerfile` or workflow ships one) — a server defect wearing an endpoint row. **Corrected after review:** the row is *not* red. `main.go:1679` routes it through `sb.unverified`, which `main.go:1275-1279` deliberately gives its own warning-weight glyph so it cannot read as a failure, and `evidence/doctor.txt:44` shows `!`. That design is already right; the only defect is the absent server-side manifest, which is why W5 T3 is a Backend task and not a doctor task. Evidence: [`evidence/doctor.txt`](evidence/doctor.txt).

### F9 · RETRACTED — the console already exposes runtime-integrity `mode`

**This finding was wrong, and the review caught it.** The draft searched `Frontend/components/admin/ai-security-policy-section.tsx` for `runtimeIntegrity`, found validation and advisory keys at `:1251, :1289, :1700, :1795`, and drew its conclusion from where the search stopped. `RuntimeIntegrityControls` is defined at **`:1837`**, carries a `mode` select bound to `v.mode` over `AI_RUNTIME_INTEGRITY_MODES` at **`:1892`** and an `assuranceFloor` select at **`:1923`**, and is mounted at **`:6574`** inside a live `PolicySection` titled *“Policy Integrity & Tamper Response”* whose key sits in the default-visible list at `:1289`. An admin can raise `observe → enforce` today.

**What remains true:** the rollout ring state is surfaced nowhere in that file — no `rollout`, `cohort`, `SHADOW` or `CANARY` match anywhere in its 6,979 lines. So an admin can set a `mode` while F3b silently stops every intent from reaching an endpoint: the two facts that have to be read together live on different pages. That, and only that, is what W6 T5 now builds.

---

**What this reframes.** The week's work made the *reporting* honest — `managed → cooperative`, `observed → never observed in the field`, `unknown` instead of green on an unmeasured dialect. The endpoint was in this state before; it now says so. What nobody had measured is that the *first* thing a fresh deferred install does is fail open on every gating checkpoint (F1/F2), and that the machine tier's delivery depends on three gates (enrolment, rollout ring, version discovery) none of which an installer, a doctor row, or a console tells anyone about.

**Corrections to what I said earlier today, so this plan starts honest:** (1) "nothing installs the baseline" is true for unenrolled and pre-ring boxes; on an enrolled, ring-advanced box the controller is designed to — unproven live. (2) The 401s are a token-scope defect (F2), not merely enrolment. (3) The reconcile *action* works; the *scheduler launch* is what is refused (F7).

---

## 1. Diagnosis in one paragraph

DeVoid has two enforcement tiers for Codex — a user-owned cooperative layer the product refuses to fight over (correctly), and a SYSTEM-owned machine tier that the vendor honours (proven on 0.134: `internal/codexmanaged/testdata/liveproof/ledger.json`, observation at line 61). The machine tier is the only place a lock can live that a standard user cannot remove, and the only place `desktop-safe`'s withheld requirements could be recovered. **Nothing delivers it unless an operator types a command per machine, or unless enrolment + an advanced rollout ring + a readable client version all hold — and nothing tells anyone which of those is missing.** Underneath that, a deferred install is silently fail-open because a *credentials file* is standing in for *install scope*. The fixes: make install scope a property of the install (F2); make machine-tier delivery a verdict-bearing act of every install path and of the daemon (F3); put the machine tier and its reasons on the wire and in the console (F3, F4); give the owner a one-command dialect measurement so the pin moves by evidence (F5); re-run the per-key machine probes (F6); and turn every one of those into a contract test or CI leg so it cannot regress (W6).

---

## 2. Rules this plan inherits — none may be weakened to make a task fit

- **§2.4: `hookdialect.go` is FROZEN.** No task adds a dialect row. W3 builds the *measurement*; the row is the owner's act.
- **Never widen the machine baseline with an unprobed key** (`internal/codexmanaged/machine_projection.go:17-30`; the W4 T10 restraint). `sandbox_mode` never, at any scope. `network_access` not until its effect is measured by real egress.
- **A SYSTEM process never reads or writes a user profile** (RA-3; `internal/daemon/user_ai_wire_task.go:7-32`). W1/W2 write only machine objects.
- **The endpoint never authors a "desired"** (RA-0). W2's daemon-ensure writes DeVoid's *own* baseline from the compiled projection; it invents no policy.
- **A check that cannot answer FAILS rather than reporting installed** (rule 7). Every new row/verdict has a RED path.
- **The five inert-test shapes** (`reference_inert_test_shapes`): every test in this plan is shown RED with its designed message first.
- **File ownership must be checked against all 28 rows of the contract table, not the three named here.** Three of this plan's own files are owned by a LIVE sibling programme and the first draft missed them: `internal/daemon/server.go` is **P9** (contract line 58, and the rule is absolute - *not a line, not an import*), `cmd/devoid/main.go` is **P9** (line 79), and `internal/codexmanaged/` - the primary surface of W2, W3 and W4 - is **contested and unresolved**, with P47 asking who owns it in the handshake at 2026-09-03T04:12 and no answer by the newest entry at 10:07. P9 and P47 are both active TODAY. Also unchanged: `ai_handlers.go` is P47's (seam requests only); `pr-checks.yml` append-only, one leg per commit; `release.yml` untouched. **See W-1, which gates W1.**
- **No `git stash`; isolated worktrees under `C:/cwt/`; explicit `git add` paths; deploys and releases need a fresh owner ask.**

---

## 3. Owner decisions — before a wave that depends on them starts

**Read this table as the critical path, because it is one.** Eight of the decisions below are answerable only by the owner, the wave order in section 7 is mostly serial, and W-1 additionally waits on replies from two sibling programmes. No single wave looks blocked; the programme is. If the eight are answered one at a time as each wave reaches them, the calendar cost is set by that queue and not by the engineering estimates. D1, D3, D4 and D7 can all be asked today, in one go, before any code starts.

| # | Decision | Blocks | Why it is yours |
|---|---|---|---|
| D1 | **Enrol `CND34521VN`** (or a dedicated site/org) so W0 can measure the enrolled path. | W0 | Puts your machine in the fleet; needs your token |
| D2 | **Advance the production org's rollout ring** from `SHADOW/0` to `CANARY` with cohort > 0 — *if* it is still at the default. Until then **zero runtime-integrity intents reach any endpoint** (F3b). **The cohort is a hash bucket, not an allowlist:** `rolloutBucketBasisPoints(orgId, segmentId, endpointId)` (`Backend/src/ai-policy-delivery/policy-integrity.types.ts:399-411`) hashes the triple and takes a modulus, so raising the cohort sweeps in whichever endpoints fall under the threshold and **cannot target one box**. Advancing a customer-serving org therefore activates the never-proven-live machine-tier write path on other people's endpoints. This is why D1 should enrol into a **dedicated org**, not a shared one — the two decisions are not independent. | W0, W2 | Production posture change, per org |
| D3 | **Mostly answered already — `deferred` is a documented, shipped state.** `windows-installer/msi-build/Product.wxs:65-69` defines it: *"deferred — machine setup succeeds, enrollment skipped for staged workflows"*. So it is a feature for golden-image and staged rollouts, not a hypothetical, and F1/F2's fail-open is live **by design** on every machine sitting in that window — not just this one box. What is left for you is narrower: is that staged window allowed to be ungoverned, or must W1 close it? This also makes **W0 T4b load-bearing**, since it is the only task that measures how many machines are in it. | W1 | Product decision |
| D4 | **Accept reversing the boot-lane's "not an installer" stance** (W2 T2): the daemon *may* write DeVoid's own machine baseline on a box where Codex is present, *with* a durable verdict. The original objection was silence; the fix removes the silence, not the caution. | W2 | It reverses a recorded design decision |
| D5 | **Run the 0.150 dialect measurement yourself** (W3 gives you one command) and add the row if both artefacts hold. | W3 | §2.4 |
| D6 | **Is `desktop-safe` acceptable as terminal** for desktop boxes, or must W4 recover R3/R4 (and maybe R1) at the machine tier? | W4 | Risk appetite vs. vendor brick |
| D7 | **A disposable Windows VM.** Needed for W4's probes and W6's E2E - and also by **W1 and W2, whose own EXIT bars are both written against a fresh install on the VM**. The first draft listed only W4 and W6 here while running W1 and W2 earlier in the order, so a reader following this table would have started W1 believing it could close without the VM. | **W1, W2, W4, W6** | The plan forbids probes on the owner's box |
| D8 | **Should runtime-integrity `mode` ship above `observe`?** The second half of this question — *should the console expose it* — is already answered: it does, and has all along (F9, retracted). What is left is the posture call, plus whether the rollout ring belongs beside it. | W6 T5 | Fleet-wide behaviour change |

---

## 4. Waves

Each task: **Files · Preconditions · Steps · DEFEAT · ROLLBACK · EXIT.** Order within a wave is the order to land. W1 and W5 have no external dependency and can start now.

### W-1 — Reconcile with the two live sibling programmes (BLOCKING gate on W1) · no code

This wave exists because the first draft checked file ownership against three named exclusions instead
of the contract's 28-row table, and three of its own files are owned elsewhere. P9 and P47 are both
active TODAY: the newest handshake entry is `2026-09-03T10:07`, about two hours before this plan.

- [ ] **T1 Cross-check every file in every wave** against all 28 rows of
      `.plans/PARALLEL_EXECUTION_CONTRACT.md` section 2, not just the three the plan named. Produce the table.
- [ ] **T2 Post a SEAM REQUEST for `internal/daemon/server.go`** (needed by W1 T2; contract line 58,
      **P9**, and the rule is absolute - not a line, not an import). Follow the section 2.1 pattern: P9 lands
      the accessor as its own no-behaviour-change commit and replies with the SHA; this programme then
      wires to it from files it owns.
- [ ] **T3 Post a SEAM REQUEST for `cmd/devoid/main.go`** (needed by the W2 T1 service-install branch;
      contract line 79, **P9**, which already has a live change in that file).
- [ ] **T3b Post a SEAM REQUEST for `Backend/src/ai-governance/runtime-adapter-shape.ts`** (needed by W2 T3; contract line 56, **P9**, 13 references, *the runtime binding is P9's core object*). This one was missed by the first W-1 draft too, which is the point: the check has to be the whole table, mechanically, not a reading. Name the exact `machineTier` field and type needed beside `attestedProfile`; P9 lands it as a no-behaviour-change commit and replies with the SHA; W2 T3 then CONSUMES that field from files this programme owns instead of editing the shape file. **W2 T3 does not start until this clears.**
- [ ] **T4 Get the `internal/codexmanaged/` ownership question answered - and read what P47 actually wrote.** P47 did not merely ask - it staked a
      **default claim**: *"We are treating it as P47's because the dialect machinery is a detection-semantics
      concern... Correct us if that is wrong"* (`PARALLEL_HANDSHAKE.md:2110`). Reporting only the absence of a
      reply understates it: **if that default stands, every file this plan touches under `codexmanaged/` is a
      non-owner edit** - `provider.go`, `machine_projection.go`, `machine_effective.go`, `requirements.go`,
      `hookdialect147_oracle_test.go`, the new `capability_disposition.go` and `dialectprobe/`, and the new
      `testdata/` probe and disposition files. That turns direct-edit tasks in three waves into wait-on-seam
      tasks, which is a different plan. Note also that the contract ALREADY resolves three files here and they
      need no ruling: `canary.go` is P9, `hookdialect.go` is P47/FROZEN, and `testdata/liveproof/ledger.json`
      is BOTH under the append-only rule - which is exactly what W3 T1 needs, so that append is already legal.
- [ ] **T5 Check the W3 T3 `pr-checks.yml` append** against the legs P47 appended this same morning, so
      one-leg-per-commit is honoured against the live file rather than the committed one.

**EXIT:** the ownership table exists; a handshake entry exists for T2, T3 and T4; and no wave starts on
a file whose owner has not answered. **W1 must not write to `server.go` until T2 clears.**

### W0 — Measure the enrolled path on this box (no code · ~1 hour · needs D1, then D2)

The cheapest thing in the programme, and it decides the size of W2. Every step is a measurement.

- [ ] **T1 Enrol — in the two steps the shipped installer actually uses.** *Corrected: the single command this task used to name does not work.* `runSetupEnroll` (`cmd/devoid/setup_installer.go:280`) accepts `args` and never reads them — it goes straight to `config.Load()`, and its own comment says *"Reads credentials from disk (CA_SaveCredentials must have run first)"*. The MSI proves the real sequence: `CA_SaveCredentials` runs `setup save-credentials --token "[TOKEN]" --backend-url "[BACKEND_URL]"` (`CustomActions.wxs:240-243`) and `CA_RegisterAgent` then runs the **bare** `setup enroll` (`CustomActions.wxs:185-187`). On this deferred box no `credentials.json` exists, so the old command would have discarded the token silently and failed on an empty `APIKey`. Run instead:

```bash
devoid setup save-credentials --token <T> --backend-url https://api.devoid.one
devoid setup enroll
```

  Record whether `credentials.json` appears at `%ProgramData%\devoid\` (expected: yes, written by step one).
- [ ] **T2 Restart the daemon deliberately.** Enrol's `startDaemon` will *not* restart a daemon that is already up at our version (`cmd/devoid/setup_installer.go:1039-1062`, `ourDaemonHealthy`), so F2's SYSTEM-profile token would persist. `devoid daemon stop`, then start the "Devoid Daemon" task. Record: `%ProgramData%\devoid\daemon-token` now EXISTS and is readable by a standard user.
- [ ] **T3 Prove F1 closes.** Make 20 tool calls in Claude Code; histogram the rollup again. EXPECT `PRE_TOOL_USE` decided ≥ 19/20 and `daemon-error` = 0 in the new window. If not, F2's fix is insufficient and the cause is elsewhere — STOP AND REPORT.
- [ ] **T4 Read the org's ring.** `GET /api/v1/ai/policy-delivery/rollout` for the org. If `SHADOW`/0 → **D2**. Record the value either way — this is the single most important unknown about the production fleet.
- [ ] **T4b Count the fleet's real exposure.** Every EXIT bar in this plan is scored against one test box or one VM, yet F1 and F2 are ranked P0 on customer harm. Query whatever surface Backend exposes (heartbeats, `endpoint_control_state`) for how many currently-installed, non-test endpoints show the F1/F2 pattern right now: a reachable daemon alongside gating checkpoints that are not deciding. If the answer is small, the P0 ranking needs restating; if it is large, W1 stops being an engineering task and becomes an incident.
- [ ] **T5 Watch the self-install.** After D2: tail the daemon's integrity store; EXPECT the `CODEX_REQUIREMENTS` target to go `UNKNOWN → MANAGED_CONFIG_DELETED (episode) → REPAIRING → MATCHED` within two sweeps + one heartbeat (≤ 10 min), `C:\ProgramData\OpenAI\Codex\requirements.toml` to appear SYSTEM-owned, and `ai codex-machine status` to read `baseline present: true` with MO1–MO4 not `UNKNOWN`. Save the transcript as `evidence/w0-enrolled-self-install.md`.

**EXIT:** the transcript exists and states, for each of T3 and T5, PROVEN or FAILED with the observed value. A FAILED T5 with T1–T4 green is the finding that W2 T2 must cover enrolled boxes too.

### W1 — Install scope is a property of the install, not of a credentials file (F2) · P0

**Files:** `internal/core/config/config.go` (`IsSystemInstall` :738), `internal/daemon/daemon_auth.go` (:266-336), `internal/security/paths.go` (:27-40), `internal/daemon/server.go:1700`, `internal/wininstall/managed_windows.go` (`BoundaryRegistryPath`), `cmd/devoid/doctor_*.go` (new row), `cmd/devoid/ai_codex_hooks.go` and `ai_status.go` (authority slug), `cmd/devoid/setup_installer.go` (enrol restart), `install-scripts/production/install.ps1`, `windows-installer/msi-build/CustomActions.wxs`.

**Preconditions (run; if any fails STOP AND REPORT):**

```bash
cd C:/cwt/<wt> && sed -n '738,742p' internal/core/config/config.go                        # MUST show the Stat-on-credentials predicate
grep -rnE "config\.IsSystemInstall\(\)" --include=*.go internal/ cmd/ | grep -v _test | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//"   # the CALL SITES to audit. Record the number; do not trust a figure
grep -n "BoundaryRegistryPath" internal/wininstall/managed_windows.go                       # MUST show SOFTWARE\Devoid\SecurityBoundary
```

- [ ] **T1 Define install scope from machine facts.** `IsSystemInstall()` becomes true when **any** of: `credentials.json` at the machine dir (today's rule, kept); **or** the MSI's machine marker `HKLM\SOFTWARE\Devoid\SecurityBoundary` exists (Windows; written by the guard, FROZEN lifetime, already read by `internal/uninstall/residue_probe_windows.go:99`); **or** the running binary lives under the hardened machine `bin` (`%ProgramData%\devoid\bin`, `/opt/devoid`…) — the derivation `deriveInstallRoot` already uses. Put the **call-site audit table** in the PR. Establish the count with the anchored grep above and record it: run verbatim it prints **12**. Not 14, not 19, not 21 — each of which some draft of this task has asserted. Establish it by running the command, never by carrying a figure forward: for each site, behaviour on (machine-scope, unenrolled) before/after. `internal/aikeystore/location.go` (5 sites) and `internal/policybundle/trust_anchor_client.go` (2) are the ones most likely to have been silently per-user on deferred boxes — any behaviour change there is its own finding.
- [ ] **T2 The daemon's paths follow scope.** `security.DefaultPaths()` is home-derived with no machine variant; add `security.PathsForScope()` used by the daemon (`server.go:1700`) so a SYSTEM daemon on a machine-scope install keeps its token (`daemon-token`), integrity store (`integrity/`), and bypass spool under `%ProgramData%\devoid`, ACL'd per `applyMachineTokenPerms`. Per-user daemons unchanged.
- [ ] **T3 Enrol restarts what it must.** In `runSetupEnroll`, after credentials are written: if a daemon is listening at our version, perform a controlled restart (stop → start the task → wait for `/health` with our marker) and **verify the token path is machine-scope and user-readable**; otherwise fail the enrol with `enrol-daemon-token-not-machine-scoped`. Never report "enrolled" over a daemon that will keep 401-ing.
- [ ] **T4 Make it visible.** (a) New doctor row **`Daemon capability token`**: `+ readable at <path>` / `x absent` / `x unreadable by this user (minted under <scope>)` — it reads the path the CLI reads, so an unelevated doctor sees what the hook sees. (b) The authority line distinguishes `authority-endpoint-unenrolled` from **`authority-daemon-refused-401`** — the condition the daemon already names (`daemonAskStatus`). (c) The daemon's `CredentialUnreadable` event is also written to `%ProgramData%\devoid\evidence\tamper.log`, not only to the heartbeat spool.
- [ ] **T5 Install-time assertion.** `install.ps1` and a deferred CA (`Impersonate="no"`, `Return="ignore"`) run `devoid doctor --row daemon-token` after the daemon task starts and write the row's verdict to the MSI log; a deferred install that leaves the token unreadable prints it in red at the end.

**DEFEAT (each RED first, with the designed message):** `TestSystemInstallScopeDoesNotDependOnCredentials` — sandboxed `ProgramData` (the w47b-rig pattern), marker present, no `credentials.json`: assert `IsSystemInstall()==true`; revert T1 → RED *"a machine-scope install with no credentials.json is reported per-user; the daemon will mint its token under the SYSTEM profile"*. `TestDaemonTokenIsUserReadableOnMachineScopeInstall` — start the daemon under a sandboxed SYSTEM-like home + machine root; assert the token at the machine path with Users-read ACL; revert T2 → RED naming the profile path. `TestEnrollRestartsAListeningDaemon` — fake listener at our version; assert restart + token-path check; revert T3 → RED *"enrol left a running daemon holding a per-user token"*. Doctor row: point the reader at a wrong path → RED.

Additionally required on T1, and it is not optional: **`TestNoUnprivilegedProcessCanForgeMachineScope`**. T1 turns one check into an OR of three signals, which makes the predicate EASIER to satisfy. Every other defeat test here proves the false-negative direction only. This one proves the adversarial direction: assert that a standard, non-admin principal cannot create `HKLM\SOFTWARE\Devoid\SecurityBoundary`, cannot write into the hardened machine `bin`, and cannot place a `credentials.json` at the machine dir. If any of the three turns out to be reachable without admin, T1 is a privilege-escalation-shaped change and STOPS. The answer is probably "all three already require admin" - but that is a claim the plan was assuming rather than proving.

**ROLLBACK:** T1 is a predicate change — revert restores the credentials rule; T2–T5 are additive.

**EXIT:** On a fresh **deferred** install on the VM (D7): `devoid doctor` shows `+ Daemon capability token readable at C:\ProgramData\devoid\daemon-token`; 20 Claude Code tool calls → rollup shows `PRE_TOOL_USE` decided ≥ 19, `daemon-error` = 0; `ai hooks-status codex` no longer says the cooperative layer fails open for a *token* reason (it may still say unenrolled — that is D1's business, and the two are now different words).

### W2 — Machine-baseline delivery: every install path, the daemon, and the fleet (F3, F3b) · P1

**Files:** `windows-installer/msi-build/CustomActions.wxs` (one new deferred CA), `install-scripts/production/install.ps1` (the :2917 region), `cmd/devoid/main.go` (`service-install`), `internal/daemon/codex_machine_migration.go` (repair → ensure), `internal/codexmanaged/provider.go`, `internal/controls/attestation.go` (wire), `Backend/src/ai-governance/runtime-adapter-shape.ts` (+ types), `Frontend/app/ai-control-plane/protection-depth.tsx`, `internal/liveproof/register.json` (append-only).

**Preconditions:**

```bash
grep -rn "codex-machine install" install-scripts/production/install.ps1 windows-installer/msi-build/*.wxs | wc -l   # MUST print 0 — nothing runs it today
sed -n '50,52p' internal/daemon/codex_machine_migration.go                                                        # MUST show "NOT_APPLICABLE and stays that way"
git -C ../Backend merge-base --is-ancestor 4cdeccd1 bc11446c && echo ok                                            # MUST print ok — the intent source is deployed
```

- [ ] **T1 Install-time verdict, all three paths.** A deferred, non-impersonated CA **`CA_AssertCodexMachineBaseline`** after `CA_InstallDaemonTask` (`Return="ignore"` — a refusal is a verdict, never a 1603) runs `devoid ai codex-machine install --verdict-file %ProgramData%\devoid\evidence\install-verdicts.json`; `install.ps1` runs the same after its daemon-task registration; `service-install` does the same, so *script, MSI, and CLI* agree (the trio at `install.ps1:2917`). Verdicts are the verb's own: `ASSERTED` / `NOT_APPLICABLE (no Codex client discovered)` / `REFUSED (runtime-version-unknown | below-floor | dialect-unsupported)` / `HARDENING_FAILED` — each printed by the installer and written to the MSI log. **Nothing is silent.**
- [ ] **T2 Daemon ensure at startup, gated and loud (D4).** Extend `migrateCodexMachineBaselineArgv`'s lane from *repair* to *ensure*: on a machine-scope install (W1) where (i) a Codex client is discoverable at ≥ floor, (ii) `requirements.toml` is **absent** (a foreign file is never overwritten — the `isLegacyArgvCommand` discipline stands), and (iii) the verb's `Validate` passes — write DeVoid's own baseline through the same `Compile → ApplyAtomic → re-read → harden` path the verb uses, and record the outcome at **Info**, in `tamper.log`, and in the next heartbeat. This covers unenrolled and pre-ring boxes; on enrolled+ring boxes it converges with the controller (same projection, same hash — idempotent; `reconcile_decision.go`'s no-churn rule already applies to the machine target).
- [ ] **T3 The machine tier on the wire and in the console.** Add `machineTier: { present, obligations: {MO1..MO4}, reason: baseline-absent | dialect-unverified | desktop-safe-withheld | client-version-unknown | not-applicable, lastVerdictAt }` beside `attestedProfile` in the Codex adapter report; Backend rebuilds it field-by-field (`runtime-adapter-shape.ts` is the enforcing boundary); console renders a **Codex · Machine tier** row under the assurance chip with the reason in words. The reasons are exactly the causes this investigation found — an operator sees *why* it says `cooperative`.
- [ ] **T4 Rollout-ring visibility.** Endpoint pages show the org's runtime-integrity ring (`SHADOW/0` …) next to the integrity state, with the sentence *"no intents are delivered at SHADOW"*. F3b's gate (b), made visible; raising it stays an operator seam.
- [ ] **T4b A way back from D2, and something watching it.** D2 advances a PRODUCTION rollout ring, and the moment it moves, W2 T2's boot-time lane starts writing machine files on real endpoints. As written D2 sets no cohort floor (cohort > 0 permits 1), has no documented way back, and T4 adds only a static visibility row. Add three things: a cohort-rollback procedure through the audited operator seam, a stated minimum cohort to start at, and one alert tied to the ring-advance moment - the count of `CODEX_REQUIREMENTS` targets entering `REPAIRING` or `FAILED` per hour. Visibility is not monitoring.
- [ ] **T5 Live proof, appended.** Register the first `CODEX_REQUIREMENTS` target that reaches `MATCHED` on a real enrolled Windows endpoint (W0 T5 or the VM) in `liveproof/register.json` — the entry that replaces the stale "only writer" comment.

**DEFEAT:** `TestEveryInstallPathAssertsTheCodexMachineBaseline` — parse `install.ps1`, `CustomActions.wxs`, and the `service-install` step list; assert each invokes the verdict step; delete one → RED naming the path. `TestDaemonEnsureNeverOverwritesAForeignBaseline` — seed a foreign `requirements.toml`; assert untouched, verdict `FOREIGN_PRESENT`. `TestDaemonEnsureIsLoud` — assert an Info log + a tamper record on every outcome; downgrade to Debug → RED *"the machine baseline outcome was logged at Debug — that is the silence this lane exists to end"*. `TestMachineTierReachesTheWire` — a report with `present:false` must carry `reason: baseline-absent`; drop the field → RED. Console: a render-harness fixture per reason (P9 appends fixtures; never edits).

**ROLLBACK:** T1/T2 are additive lanes behind the verb's own refusals; revert per task. T3 widens the wire — Backend first, agent after (the standing order).

**EXIT:** Fresh MSI install on the VM with Codex present and **no** enrolment: `ai codex-machine status` → `baseline present: true`, MO4 not `UNCONSTRAINED`; the install log carries `CodexMachineBaseline: ASSERTED`; the console (once enrolled) shows the Machine tier row. And on this box: the W0 T5 transcript.

### W3 — The dialect moves by measurement, never by inference (F5) · P2

**Files:** new `cmd/codex-dialect-probe/` (or `internal/codexmanaged/dialectprobe/`), `internal/codexmanaged/hookdialect147_oracle_test.go` (the recipe to generalise), `internal/codexmanaged/testdata/liveproof/ledger.json` (append), `.github/workflows/pr-checks.yml` (`codex-vendor-lane`, one appended step), `cmd/devoid/ai_codex_hooks.go` (the "run this" hint), new `internal/codexmanaged/testdata/dialect-disposition.json`.

**Preconditions:** `sed -n '166p' internal/codexmanaged/hookdialect.go` MUST show exactly two rows; `grep -n "0.134.0" .github/workflows/pr-checks.yml` MUST show the vendor-lane pin.

- [ ] **T1 The probe.** One command — `codex-dialect-probe --client <path-to-codex.exe> --scratch-home <dir>` — produces the **two artefacts** the 0.147 row was grounded on (`hookdialect.go:117-160`): (1) `app-server` + `hooks/list` → `currentHash` and `trustStatus` for the oracle vector set; (2) three `codex exec` runs over one variable — `[hooks.state]` absent / hash one nibble wrong / hash byte-equal — asserting the middle one *never dispatches*. Output: an evidence bundle (`dialect-probe-<version>-<date>.json` + transcripts) naming the binary's sha256 and the version it observed. It never touches `~/.codex` (scratch home only) and never runs elevated.
- [ ] **T2 The owner runs it against 0.150.0-alpha.8** — the desktop runtime at `%LOCALAPPDATA%\OpenAI\Codex\bin\6ca77c4a9caa4eed\codex.exe` — and against npm `0.147.0` as the positive control (it must reproduce the committed row). If both artefacts hold for 0.150, **the owner** adds `hookTrustDialect150` with the provenance block, in the exact shape of the 0.147 entry (§2.4). If they do not, the bundle *is* the finding, and `writerHookTrustDialect` stays 0.144.
- [ ] **T3 The drift gate.** `dialect-disposition.json`: every Codex version DeVoid has *observed on any rig* and every version published to npm at gate time, each with `measured-<row>` / `unmeasured` / `refused-<bundle>`. Appended CI step in `codex-vendor-lane`: resolve `npm view @openai/codex versions --json` (newest stable + newest pre-release) and the locally pinned build; **fail** if any is absent from the ledger. An `unmeasured` entry is valid only with `ackBy`/`ackAt` — the gate turns "a new family exists" into a named, dated acknowledgement instead of silence.
- [ ] **T4 Turn `unknown` into an action.** When the installed client is outside the pin, `ai status codex` and doctor print the exact `codex-dialect-probe` invocation for that binary. The row stays `unknown` — it stops being a dead end.

**DEFEAT:** T1 — run the probe against 0.147 and corrupt one committed golden vector → the probe must report `MISMATCH` (it validates itself against the committed corpus before it is trusted on a new build). T3 — remove a version from the ledger → RED naming it.

**ROLLBACK:** all additive. A wrong row is the owner's single-commit revert.

**EXIT:** `evidence/dialect-probe-0.150.0-alpha.8.json` exists with both artefacts and a verdict; the drift gate is green on a ledger naming 0.134.0, 0.144.x, 0.146.0-alpha.3.1, 0.147.0, 0.149.0-alpha.4.1, 0.150.0-alpha.8 with dispositions; on this box R7/R8 read either `installed` (row added) or `unknown` **with the probe command printed**.

### W4 — Foreign governance keys and the withheld requirements (F4, F6) · P1/P2 · needs D6, D7

**Files:** everything W4 T10 names (`internal/codexmanaged/machine_projection.go`, `machine_effective.go`, `testdata/scfg/managed/probes/`), W4 T12's `capability_disposition.go` (deploy-unblocked now), `internal/codexmanaged/requirements.go` (:596-640, the effect table), `internal/security` (bypass event), Backend/Frontend per T12's file list.

**Preconditions:** W4 T10's own block, verbatim (its worktree produced nothing) — the `merge.go:183-190` brick note, the `requirements.go:408-421` undetermined note, the probe-directory convention.

- [ ] **T1 Re-run W4 T10 as written**, key by key, one commit per key: `tools.web_search` (R3) and `features.computer_use` (R4) first — "none measured" is not "unsafe", it is "unprobed". `sandbox_mode` never. `network_access` **not** until T3.
- [ ] **T2 Probe `projects.*.trust_level` at machine scope.** Does `requirements.toml` accept a pin that prevents a user-tier `projects.<hash>.trust_level = "trusted"` from suppressing approval prompts? Measure on the VM with the committed probe shape. If the vendor cannot express it: disposition `vendor-unexpressible`, and T4 is the whole countermeasure.
- [ ] **T3 Measure `network_access` by egress, not by `doctor --json`** — the re-measure `requirements.go:408-421` asks for: a sandboxed `codex exec` attempting a real loopback fetch with `true` vs `false`. Only a distinguishing result clears the key.
- [ ] **T4 Escalate what the product already understands.** `effectSandboxEgressLive` and `effectProjectTrustedFmt` with `projectClassSystem` become **HIGH bypass events** on the wire and a console row (*"a user-tier key re-enabled sandbox egress outside the managed lock"*, *"approval prompts suppressed for a system directory"*), keyed and de-duplicated so they cannot flap (the `reconcile_decision.go` spool lesson). The `[i]` lines stay; the events are new.
- [ ] **T5 W4 T12 — capability dispositions**, deploy-unblocked since this morning: for each withheld requirement on `desktop-safe`, declare `recovered-at-machine-tier` (after T1) / `vendor-unexpressible` / `hook-covered`, on the wire and in the console, so `vendor-lock-unexpressible` stops being the end of the sentence.

**DEFEAT:** W4 T10's own (`TestMachineBaselineOmitsAnyKeyWithoutACommittedProbe` first, RED before any key). T4: a fixture with `network_access = true` under the user tier and no machine lock → assert one HIGH event; remove the classifier → RED.

**ROLLBACK:** per key (T10's rule); T4/T5 additive.

- [ ] **T6 The two F4 facts T1 to T5 never touch.** T1 covers `tools.web_search` and `features.computer_use`, which are F6 desktop-safe recoveries, not F4 facts. That leaves the un-attested MCP servers (`cua_repl`, `node_repl`) and the un-pinned feature override (`js_repl`) with no task at all. Either build attestation and pinning for them, or record an explicit reasoned deferral.

**EXIT:** ≥ 2 keys pinned at machine scope with committed probes (T10's number); `projects.*` disposition recorded either way; and on this box **each of the four F4 facts is either an event in the console within one heartbeat of enrolment, or carries a written deferral naming why**. The first draft promised all four as events while building escalation for only two - an EXIT must not claim coverage the task list does not deliver.

### W5 — Endpoint truth rows (F1's visibility, F7, F8) · P2/P3 · no dependencies

- [ ] **T1 Gating fail-open is RED.** `internal/hooklatency/summary.go`: for **gating** checkpoints (`PRE_TOOL_USE`, `USER_PROMPT_SUBMIT`), when non-decisions with reason `daemon-error` / `daemon-unreachable*` exceed **25%** of invocations over ≥ 50 invocations, the verdict is `VerdictGatingFailOpen` (a control failure) and the row prints the reason histogram (`daemon-error 1786 · budget-expired 57 · decided 61`). **Two corrections after review.** The histogram figure was stale at 1571 (the round-one fix to 1786 never propagated here). And the original wording gated the verdict on *"while the daemon answered `/health` in the window"*, which **cannot be implemented as written**: `Sample` carries only `AtUnixMilli`, `Micros`, `Adapter`, `Event`, `Reason`, `FailSafe`, `TotalMicros`, the package contains no health reference at all, and `Summarize` never touches the daemon. Either drop the qualifier (a gating checkpoint that fails open at this rate is a control failure whatever the daemon was doing) or budget a persisted health history as its own task — do not assume the data is there. Today's `VerdictNoDecisions` stays for the fresh-install case it was written for. Files: `summary.go:286-291`, `cmd/devoid/doctor*.go`, `cmd/devoid/ai.go:892`.
- [ ] **T2 Doctor rows tell the truth about privilege.** `cmd/devoid/doctor_persistence.go`: when `/health` answered, `Daemon persistence` / `Daemon service` render `?` *"cannot verify unelevated"*, never `x daemon unreachable`.
- [ ] **T3 The backend ships its release manifest.** `Backend/Dockerfile` copies a `release-manifest.json` generated at build from the deploy SHA (or sets `RELEASE_MANIFEST_PATH`); the `/health` release route stops 503-ing; doctor's provenance row moves from `!` unverified to green fleet-wide. Server defect since ≤ 2026-08-23 (`cmd/devoid/release_check.go:254-262`). **Do not touch the doctor row itself** — it is `sb.unverified` at warning weight by deliberate design (`main.go:1275-1279`, `:1679`), which is correct. The only defect is the absent server-side manifest.
- [ ] **T4 The per-user reconcile task's launches are observable and succeed.** On the VM: enable `Microsoft-Windows-TaskScheduler/Operational`, capture the `0x800710E0` cause (principal `Users` / `Group` / `Limited` is the suspect — a group principal with no interactive member at trigger time is refused), fix the trigger/principal in `internal/daemon/user_ai_wire_task.go`, and add *"scheduled reconcile: last result <code> at <time>"* to `ai status` so a refused task is visible without the event log.

**DEFEAT:** T1 — feed the committed histogram from `evidence/` → RED `gating-fail-open`; feed a fresh-install rollup → `no-decisions` (not RED). T2 — mock a reachable daemon + unelevated → `?`. T4 — assert the principal/trigger shape in a contract test.

**EXIT:** `doctor` on this box (after W1) has no `x` row caused by privilege; the gating row is RED on the committed evidence and green after W1; the provenance row is green against production.

### W6 — Never again · structural guards · lands with each wave, listed here so none is skipped

- [ ] **T1 Install contract tests** (mirror `install-scripts/production/install_privileged_system_daemon_contract_test.go`): `install.ps1` + `CustomActions.wxs` + `service-install` invoke the machine-baseline verdict (W2) and the token row (W1); a deferred-mode install pins the token path. RED-first.
- [ ] **T2 Fresh-install posture E2E on the VM** — the customer-imitation test the DoD demands: `msiexec /i … ENROLLMENT_MODE=deferred` → `doctor` → an **expected-rows table** (token readable; Codex machine row `ASSERTED` or `NOT_APPLICABLE`, never silent; `PRE_TOOL_USE` decides on 20 calls; gating row not RED) → enrol → same table + `MATCHED`. Run per release candidate; its transcript is the release's evidence.
- [ ] **T3 The dialect drift leg** (W3 T3) — the only CI change; one appended step.
- [ ] **T4 A written rule + release-note template.** In `.plans/` and the Installers `README`: any change to `knownHookTrustDialects`, `IsSystemInstall`, the machine-baseline delivery lanes, or `desktopVendorWithheld` requires (a) a live-proof entry in `liveproof/register.json` (append-only) and (b) a release note in `docs/notes/` in the existing shape — today's R7 lesson, generalised.
- [ ] **T5 Surface the rollout ring beside the controls that already exist (D8).** *Reduced after review:* `ai-security-policy-section.tsx` already exposes `mode` (`:1892`) and `assuranceFloor` (`:1923`) in a mounted, default-visible section (`:6574`), so this task builds neither of them. What it adds is the **rollout ring state**, read-only, beside the `mode` select — so nobody can set `enforce` while the org sits at `SHADOW/0` and nothing reaches an endpoint (F3b). Never a hardcoded flip. If D2 advances the ring, this row is how anyone sees that it moved.

---

## 5. Exit for the whole programme — verifiable by a command

On a **fresh deferred MSI install on a clean VM with Codex desktop + CLI present**, then **enrolled into an org whose ring is `CANARY` > 0**:

```
devoid doctor                      → 0 rows `x` attributable to privilege, token, or silence; gating row not RED
devoid ai codex-machine status     → baseline present: true · MO1–MO4 none UNKNOWN/UNCONSTRAINED
devoid ai status codex             → authority: governable · machine tier row present · every foreign key also an event
hook rollup, 20 tool calls         → PRE_TOOL_USE decided ≥ 19 · daemon-error 0
console                            → Codex · Machine tier row with reason; ring state visible; W4 events visible
CI                                 → dialect drift leg green on a ledger naming every observed/published version
```

…and the same six lines **unenrolled**, with `authority: unenrolled` as the *only* difference. Plus `evidence/w6-fresh-install-e2e.md` from the VM.

**A fallback exit, because the bar above is not closable by engineering alone.** It requires a ring at `CANARY > 0`, which is D2 — an owner action §6 explicitly puts out of scope. If D2 or D8 is declined or deferred, the programme would otherwise have no definition of done at all. So: **ENGINEERING DONE** is the same six lines with the ring line replaced by *"the delivery path is proven against a ring advanced on a disposable org, and the production ring state is displayed in the console (W6 T5)"*. **PROGRAMME DONE** additionally needs D2 on a real org. Report the two separately and never let the second silently redefine the first as incomplete work.

## 6. What this plan deliberately does not do

- It does not add a dialect row (§2.4). It builds the measurement and hands the owner the command.
- It does not write `sandbox_mode` at any scope, or `network_access` before an egress measurement.
- It does not rewrite user-tier foreign keys. It escalates them and, where the vendor allows, out-ranks them at the machine tier.
- It does not raise `mode`, advance any rollout ring, deploy, or release. Those are D1/D2/D8 and fresh asks. **On enrolment, read W0 T1 rather than this line:** enrolling `CND34521VN` is D1, and the owner runs that command with their own token - no task and no agent enrols a machine, but the plan does depend on it happening.
- It does not touch `ai_handlers.go` (P47), `release.yml`, or the PR gates beyond one appended leg.

## 7. Suggested order and rough cost

| order | wave | why first | cost |
|---|---|---|---|
| 0 | **W-1** (needs P9/P47 replies) | three of this plan's files are owned by live sibling programmes; W1 cannot write to `server.go` until the seam lands | hours, mostly waiting |
| 1 | **W0** (needs D1) | one hour of measurement decides W2's size and checks the fleet's real gate (D2) | 1 h + owner |
| 2 | **W1** (needs W-1 seams, D7) | P0, and W0 T3 needs it to pass | 2–3 days incl. the call-site audit (**12** real calls, measured. This cell has now carried 19, then 14, while boasting about propagating a fix. Run the precondition grep; do not read a number from here) |
| 3 | **W5 T1–T3** | independent; makes F1-class failures visible everywhere | 1–2 days |
| 4 | **W2** (needs D4) | the gap the week was about | 3–4 days + Backend/Frontend halves |
| 5 | **W3** (owner runs T2) | unblocks R7/R8 honesty on 0.150 | 2 days + an owner hour |
| 6 | **W4** (needs D6/D7) | VM-gated; per-key | 3–5 days on the VM |
| 7 | **W6** | lands alongside each wave; T2 is the release gate | continuous |

Adversarial review of this plan itself is recommended before W1 starts — the last time a plan skipped it, four would-have-shipped defects went through.
