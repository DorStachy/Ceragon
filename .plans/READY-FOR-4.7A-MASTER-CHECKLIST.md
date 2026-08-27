# Ready for 4.7A — the master checklist

**Built 2026-08-26** from two exhaustive audits, not from recollection. Supersedes every earlier
"that's everything" in this campaign.

## Why this document exists

Four times in this campaign the answer to *"are we ready for 4.7A?"* was "yes" and then wasn't. The
cause was always the same: the answer came from whatever had most recently been touched, instead of
from a sweep. This list was built by enumerating the whole surface first — the `verify-prod-20260808`
register verified line-by-line against current code, and a substrate audit of install / uninstall /
hooks / shims / enrolment / policy / evidence.

**The register's own status text is not trustworthy.** ~35 lines it carries as open are fixed in
current code; a handful it treats as settled are not. Every item below was checked against the code,
not the register.

## The gate: what "ready" means here

4.7A builds a **detection engine**. A detection engine is worth exactly what the layer under it is
worth. So "ready" is not "the code is merged" — it is:

1. Everything the endpoint reports is **true** (done — see §6)
2. The hooks, shims and policy path **demonstrably work on a real machine** (NOT done — §2)
3. Our tests can **actually fail** (NOT done — §4)
4. The scan sees **everything it claims to see** (NOT done — §1.1)

---

# §0 — BLOCKED ON THE OWNER. Nothing below §0 can finish without these.

- [x] **0.1 — DONE 2026-08-27.** Owner cleared billing. Proven, not assumed: a dispatched `Security Audit` on `Frontend@main` completed **success in 38s**; the block's signature was a 4s death with no runner assigned. ~~Unblock GitHub Actions.~~ `github.com/organizations/Ceragon-Prod/settings/billing`.
  Jobs die in ~4s with `runner_name: ""` — no runner assigned. Actions is *enabled* at repo level, so
  this is a Free-plan spending limit or exhausted minutes. Onset between 2026-08-24 08:45 (a
  scheduled job passed) and 2026-08-25 03:58 (the same job failed, no commit involved).
  **This blocks: every agent release, all CI on 7 repos, and M4.7A Risk 2 branch protection.**
- [x] **0.2 — DONE 2026-08-27. Agent 7.10.5 promoted to stable at 00:12:42Z**, verified against `s3://installer-binaries-prod/channels/stable.json` rather than the workflow conclusion. Backend (task def 321, both migrations applied to production) and Frontend (378) deployed first, in that order. The quarantine data-loss fix now reaches endpoints. ~~Approve an agent release~~ once 0.1 clears. Until then **every Installers fix in this
  campaign is live on ZERO endpoints** — the quarantine data-loss fix included.
- [ ] **0.3 — Decide: transcript backup on this machine.** Currently none. The working Codex archive
  can be cloned onto `~/.claude` in ~10 min. Declined 2026-08-26 on the grounds that it cannot
  recover the 50 lost sessions (correct — it cannot). Re-raised because **36 intact transcripts and
  2,342 subagent transcripts remain exposed** until 0.2 ships.
- [ ] **0.4 — Approve a real-box MSI install/uninstall cycle.** Needed for §2. A reinstall has
  bricked the trust anchor before (409 forever), which is why this is an owner decision.

---

# §1 — The four decisions taken 2026-08-26. Implement these.

## 1.1 — Scan completely: accuracy over speed *(decided: scan everything)*

**Owner's words:** *"its ok if the sweep is slower … we need to make sure that we are precise and
accurate and the inventory of the endpoint will actually represent what he actually have and that we
wont miss anything."*

This is bigger than the plugin folder. There are **three** caps and all three lose data:

| Cap | Where | Measured effect on one real endpoint |
|---|---|---|
| `MaxCandidates = 200` | `resolve.go` defaults, `sweep.go:167` passes none | 18,299 eligible → 200 kept; **193 of the 200 were `.claude/plugins`** |
| `MaxNodes = 5000` | same | ~19,100 eligible files vs a 5,000 ceiling |
| `MaxProjectDepth = 8` | same | **425 directories pruned for depth** |

- [ ] **1.1a** Give the marketplace/extension caches their own classified rows so they are scanned
  properly instead of sampled, freeing the candidate budget.
- [ ] **1.1b** Raise/remove `MaxCandidates` and `MaxNodes` so the inventory is complete.
- [ ] **1.1c** Make depth-pruning **visible**: an endpoint that could not walk everything must say so.
  Silent truncation reads as "covered everything".
- [ ] **1.1d** Keep the worker-side filter narrow — only relevant files leave the box. Complete
  local enumeration ≠ complete upload.
- [ ] **1.1e VERIFY:** re-run the resolver probe on a real home. Assert `CandidateCount == kept`,
  `Truncated == false`, and **`.codex/sessions` node count > 0** (it is currently **0**).
- [ ] **1.1f VERIFY:** measure the new sweep wall-clock and record it. "Slower is fine" is not
  "unbounded".

## 1.2 — Plugins restored automatically on uninstall *(decided: finish it)*

- [ ] **1.2a** Wire `plugingate.Neutralizer.Restore` into **both** uninstall paths — the CLI
  (`internal/uninstall`) and the MSI teardown guard (`cmd/devoid-msi-root-guard`).
- [ ] **1.2b** Apply the same per-home confinement the aicontext fix needed. A bundle record also
  names destination paths, and both uninstalls run elevated over other users' profiles — unconfined,
  this is an arbitrary write as SYSTEM.
- [ ] **1.2c VERIFY:** mutation-prove it. Revert the wiring → test red; revert the confinement →
  test red; restore → green. Include a control proving a clean stash still deletes.

## 1.3 — Commit a lockfile *(decided: record exact versions)*

- [ ] **1.3a** Remove the `package-lock.json` exclusion from Backend `.gitignore` and commit the
  lockfile.
- [ ] **1.3b** Switch `build.yml`'s install step to `npm ci` and rewrite the comment that says
  "`npm ci` would fail here" — it will no longer be true.
- [ ] **1.3c** Revisit the `@types/node` pin added 2026-08-26. With a lockfile it may be relaxed
  back to a range; decide deliberately rather than leaving both belts on.
- [ ] **1.3d VERIFY:** two clean builds from an empty cache produce byte-identical dependency trees.
- [ ] **1.3e** Consider the same for Frontend (it already commits a lockfile — confirm it is used).

## 1.4 — Transcript backup — see §0.3.

---

# §2 — PROVE THE SUBSTRATE. Nothing here is provable without §0.

**This is the section that decides whether 4.7A stands on anything.** Each item needs a real
enrolled endpoint. None can be closed by a unit test.

- [x] **2.1 — DONE 2026-08-26T17:11:57Z.** `internal/liveproof/register.json` entry `pretooluse-deny-stops-side-effect` is `observed: true`, the ONLY observed entry of eight. Proven by the ABSENCE OF THE SIDE EFFECT, not by the hook's own claim: the deny run's `DENY_SIDE_EFFECT.txt` was never created while an allow control on the identical rig created its marker. Caveat recorded in the entry: **the deciding authority was the endpoint's LOCAL floor, not server policy** (the daemon's backend post 401'd and it fell back). ~~One Claude Code `PreToolUse` deny that actually stops the side effect.~~
  Hooks demonstrably FIRE — 131 hook processes observed in one turn window. But a real destructive
  delete ran through `PreToolUse`, returned **exit 0, and the directory was gone**. Zero
  `PROMPT_BLOCKED` events in 2,680 all-time events on that box.
  **A detection engine on a lane that detects and does not prevent is a reporting tool.**
  Closes `internal/liveproof/register.json` entry 1.
- [ ] **2.2 — One Codex hook fires, decides, and the client honours the deny.**
  `ledger.json` is `"status": "UNFIRED"`, `observations: []`. Five partials exist; the strongest is
  `FAIL_OPEN_OBSERVED_AND_SUPPRESSION_ISOLATED` — *an observation of the defect, not of the control.*
  Run `internal/codexmanaged/LIVE_PROOF_RUNBOOK.md` §3 and append a real row.
  ⚠️ The runbook's discriminator string was mined on Codex 0.144 and **is not in the 0.134 binary** —
  confirm the marker for the fleet's actual build before trusting a negative.
- [ ] **2.3 — An observer for the vendor's own fail-open.**
  `HookTimeoutFailOpen = true` (`machine_projection.go:120`). When Codex's client errors running our
  hook it **discards our decision and proceeds ungoverned, and nothing on our side records it.**
  Every other fail-open in the product (13 of them) is bucketed and counted; this one is invisible —
  and it is the one that silently voids every hook-based detection. Parse the client's
  `hook: <Event> Failed` line, or heartbeat a spawn-side counter. **It must exist before any hook
  coverage claim.**
- [ ] **2.4 — A signed policy bundle activates on a real endpoint and the applied digest reaches the
  Backend.** The chain deadlock was measured live twice (2026-08-06 endpoint `70573ce5`; 2026-08-19
  endpoint `5862b23a`, *"applied stayed nothing… the box enforced nothing"*). Both fixes are
  code-only. Without this, every detection runs on permissive built-in defaults — **not on your
  policy**.
- [ ] **2.5 — One evidence event traced end to end**: endpoint → ack → `ai_events` row → console
  render, on production. Then re-check the endpoint's `highestAcknowledgedSequence` against the
  server's `gap_count` (last seen at **760** and **7,500**).
- [ ] **2.6 — A real shim interception test, not a fake one.**
  `test/integration/finding-b/run-linux.sh:49` — `# Fake shim that announces itself; tests assert
  resolution lands here.` The 100-job matrix proves **PATH resolution only**. The package-manager
  shim IS proven live (5/5 blocked installs, control allowed); **git-hook and shell-profile shims are
  not.** Replace the stub with a genuine block/allow assertion and restore an automatic trigger.
- [ ] **2.7 — Real-box packet**: `.plans/verify-prod-20260808/REAL-BOX-PACKET.md`, 15 items ≈ 9h.
  Start with **item 4** (registry sweep for a non-distro `HKCU\...\Lxss` subkey) — the one hardware
  item this campaign's WSL fix depends on. Items 11–12 are marked DANGEROUS and 13–14 IRREVERSIBLE;
  read before running. Note `E1c` was previously run with a **synthetic `.cmd`**, never real hook
  wiring, and `F1` is **NOT-RUN, not PASS**.

---

# §3 — Code still open, ranked

- [ ] **3.1 — `MachineLocalReadSDDL` grants `BUILTIN\Users` READ.**
  `internal/winacl/machine_secret_windows.go:69`. The Ed25519 signing key has moved out (so the
  CRITICAL is gone), but **the bearer token, the request-signing secret and the daemon capability
  token remain readable by any local user.** *Substrate — credential store.*
- [ ] **3.2 — Codex requirement policy is hardcoded, not console-driven.**
  `internal/codexmanaged/requirements.go:404-423` — `approvalPolicy`, `sandboxMode`, `networkAccess`
  are constants; Backend and shared-contracts carry no Codex requirement section. An admin **cannot
  set Codex's posture from the console**, which contradicts the standing product rule that policy
  belongs to the admin. ⚠️ `allowed_sandbox_modes` must never ship without `read-only` — that
  omission has bricked desktops.
- [ ] **3.3 — F41/D4: tool-risk MEDIUM classes default to `warn`. THIS IS LIVE RIGHT NOW.**
  `Backend/src/ai-security-policy/ai-security-policy.constants.ts:1131`, with `interpreter-exec`,
  `fetch-then-exec` and `substitution-exfil` still MEDIUM. Backend is deployed, so **every org is
  interrupted on ordinary agent work out of the box.** The decision was taken and never implemented.
  Directly relevant to 4.7A's "zero false positives" goal.
- [ ] **3.4 — Prompt lane fires on PRESENCE, not command shape.** `internal/promptrisk/` has no
  code-fence, comment or quote discipline. Seven refusals in one day, all on work *about* the
  security product — including the adversarial review of a security fix. **Corpus first**, per the
  register's own rule and 4.7A decision D3.
- [ ] **3.5 — A prompt-risk finding in replayed history permanently bricks a thread.**
  `internal/proxy/ai_context_replay.go:235-236`. DLP secrets now un-stick; injections do not, and the
  block copy never says a new thread is the only way out. ⚠️ The first fix attempt was a **proven
  security regression** — review mandatory.
- [ ] **3.6 — Hook-trust dialect pinned to Codex 0.144 only.** `internal/codexmanaged/hookdialect.go:92`.
  Installed clients are 0.147/0.148, so R7/R8 report "unverified" on every real endpoint.
  **Do NOT widen without two vendor artefacts** — `TestDialectPinIsNotWidened` enforces this. May end
  in a recorded "no".
- [ ] **3.7 — `verify.go:445`: an UNREAD Codex version is still dialect-claimable.** Deliberate and
  instrumented, but it is the one place a readiness surface can claim on an unobserved build.
  *Owner decision: keep the fail-open or close it.*
- [ ] **3.8 — Frontend never renders `attestedProfile`.** Backend shapes it fully; FE grep returns
  zero. A desktop-safe Codex endpoint attesting 3 controls and a full endpoint attesting 8 are
  **indistinguishable in the console**.
- [ ] **3.9 — No `SessionEnd` hook on the Codex lane.** Now honestly surfaced and excluded from the
  denominator with four measured budget reasons. *Owner decision: confirm won't-fix.*
- [ ] **3.10 — `findingsDropped` written, never read.** `ai-event.service.ts:2812`; absent from
  `safeMetadata` and the timeline DTO. A console reader cannot see a row's findings were truncated.
- [ ] **3.11 — Opt-out panel treats an absent `total` as whole-scope.**
  `app/admin/endpoints/ai-optout-coverage-panel.tsx:293`.
- [ ] **3.12 — `description={error}` renders backend text unsanitised.**
  `app/admin/endpoints/coverage-section.tsx:1497`.
- [ ] **3.13 — Three source comments assert falsehoods** and will mislead the next reader:
  `internal/wsldistro/rows.go:68`; `src/ai-governance/services/ai-optout-coverage.service.ts:95`;
  `internal/core/backend/aicontext_findings.go:135-137`. Also
  `prompt-evidence-reveal.service.ts:558` and `:624` still say `evidence_ref` has no producer — it
  shipped 2026-08-05. And `LIVE_PROOF_RUNBOOK.md:152`'s line numbers now point at unrelated code.
- [ ] **3.14 — `approvalSurface` shipped as option B; the recommendation was C.**
  `ai-query.service.ts:2877`. One line, owner decision.
- [ ] **3.15 — `plugingate` restore** — see §1.2.

---

# §4 — TEST INTEGRITY. Fix these before trusting any 4.7A measurement.

**4.7A's decision D3 is "build FP measurement before turning any rule on." A measurement taken on
this harness today is not trustworthy.**

- [ ] **4.1 — 97 `*.live-pg.spec.ts` files report GREEN when Postgres is absent.** They print
  `SKIPPED (no Postgres…) — "…" proved nothing.` and return. **Confirm `RUN_INTEGRATION_TESTS=true`
  is actually set wherever the Backend suite runs.** Until confirmed, treat all Backend integration
  coverage as unproven.
- [ ] **4.2 — Zero tests cross the HTTP boundary on enrolment or policy delivery.** No real-socket
  test for `POST /api/v1/agents/enroll`; no real-DB test of `enrollAgent`; none for
  `GET /ai/policy-bundle`. This repo has already shipped a pipe that answered **every** submission
  `400 "property payload should not exist"` *"while all service-level and live-Postgres tests stayed
  green, because none of them crossed the HTTP boundary."*
- [ ] **4.3 — I unplugged the alarm. Re-plug it.** `pr-checks.yml` says
  *"THIS JOB IS RED ON PURPOSE. DO NOT DELETE IT TO GET A GREEN CHECK."* The 2026-08-25 cost decision
  removed its `push`/`pull_request` triggers, so **the deliberately-red Codex live-proof gate no
  longer runs automatically.** It survives only in the local Docker mirror, i.e. only when someone
  remembers. Restore an automatic trigger that does not reintroduce the bill (scheduled, or
  merge-only).
- [ ] **4.4 — `pr-checks:cli-entrypoint-tests` has NEVER run.** Cannot be mirrored locally
  (windows-latest). Needs 0.1.
- [ ] **4.5 — Backend full suite is BLOCKED locally** — 7–13h on the Windows bind mount. Needs Docker
  volumes, not a retry.
- [ ] **4.6 — Three discipline gates NOT-RUN:** `check:response-only-fields` (drift mode),
  `check:ai-security-frontend-consumer`, `check-vocabulary-contrast`.
- [ ] **4.7 — Stage D (render surfaces) has never been run.**
- [ ] **4.8 — §6 #9's proof is one layer short**: no live-pg spec for `guardDegraded` anywhere; the
  `jsonb_typeof` predicate is re-implemented in TypeScript rather than executed in Postgres.
- [ ] **4.9 — The five inert-test shapes.** Paste `reference_inert_test_shapes` into every wave. This
  campaign shipped a green suite over a guard watching a directory no producer writes, because the
  test planted its fixture at the guard's own derivation.

---

# §5 — Deliberate non-goals. Do NOT reopen these.

Re-litigating these has cost real time before.

**From §6 "Do NOT fix these":** F3b governed keyed artifact lane (do not provision correlation keys) ·
F5 protocol-2 receipt producer · F29 backend `repo`-rung delete · F32-render `showsPromptBlock`
reorder (provably self-defeating) · F4 part 2 opaque `Surface` struct (`omitempty` is a no-op on
structs) · F16b local-group narrowing (fail-open landmine) · F40 `driftFailMode` · F8b
`shell-not-analyzed` as a Finding class · F9 ECS 0/0 (correct — intel runs on Hetzner) · F11 (settle
by inspection) · F1 change B.

**From §8 "Preserve":** `serverEnforced=false` · "measured absence, not a pass" · "required evidence
missing" · "EFFECT EXPRESSED" · "NOT MEASURED" · the honest-unknown vocabulary · the self-defense
floor at `ai_handlers.go:3328`.

**Standing prohibitions:** do not widen the Codex hook-trust dialect pin without two vendor
artefacts · do not make `EffectiveResult.Clean()` true while a tier is unobserved · do not disturb
exit code 31 for an unreadable WSL registration · do not add `CF_BUILD_SHA` to the ECS task
definition (`build.yml:635` strips it deliberately) · do not repoint
`cera-artifact_analysis_cache-staging` · keep `wsldistro.Enumerate`'s narrow seam narrow.

---

# §6 — Done, and verified. Do not redo.

- **The uninstall no longer destroys user files.** 4 filed defects + 3 the fix itself contained + an
  LPE caught pre-commit. Six mutations, six reds. *Merged; live on zero endpoints (§0.2).*
- **Status stops calling a baseline clean when a tier was never read.** D1 implemented on all legs.
- **`unreadableGovernanceTables` rides the heartbeat.** D2 implemented across agent emitter, Backend
  declare-and-store, and FE render. **Deploy ordering satisfied** — Backend deployed, no agent
  release exists yet, so nothing can ship out of order.
- ~~**The console cannot render healthier than the endpoint reported.**~~ **RETRACTED 2026-08-26 — a live
  counter-example was found.** Open a single machine in the console and an add-on our intelligence has
  **never analysed** shows the same green "Allow" as one we analysed and found clean. Open the same
  artifact on the analysis screen and it correctly reads amber, *"Not analyzed — this is NOT a clean
  result."* The console tells an operator two opposite things about one add-on depending which page they
  opened. The wire contract even names the field that separates them as *"the ONLY thing separating the
  two on the wire"* and instructs clients to render them distinctly — and the per-machine DTO simply does
  not carry it. Tracked as §4.4 in `WAVE47-SURVEY-FINDINGS.md`. The claim may only be restored when that
  is closed.
- **Severity bands from what was detected, not from whether it was blocked.**
- **`evidence_ref` has a real producer** (2026-08-05) — two stale comments still deny it (§3.13).
- **Backend `320` and Frontend `376` deployed and verified** 2026-08-26: services stable, LB
  attached, targets healthy, running the built images.
- **Push and merge cost $0** — verified, zero workflow runs triggered.

---

# Exit criteria — when is 4.7A actually ready to start?

**A SEVENTH GATE ITEM, added 2026-08-27 from a live measurement.** 4.7A's output is *measurements
of detection quality*. On 2026-08-26, ten identical private-key prompts were run against a real
Claude Code client at the shipped 60-second hook timeout: **four blocked, six were NOT blocked and
the private-key bytes egressed.** The split tracked wall-clock, not content, and the leaks began the
moment a Docker build put the box under load. It is our own fail-open — the hook could not reach the
daemon inside its budget and proceeded unchecked — and `~/.devoid/undecidable-hook-payloads.json`
recorded eleven undecided invocations in exactly that window while the status surface printed
"5 of 5 hooks have fired".

**A false-positive or false-negative rate measured on that substrate is a number about the
substrate, not about the detectors.** Item 2.3 is therefore promoted from "an observer exists" to
"the fail-open is visible on the PRIMARY surface and changes the verdict" — and it is the cheapest
item on this list, because the counter already exists and is already correct. It simply is not
printed on the Claude lane.

**Hard gate — all must be true:**

1. §0.1 done (Actions runs) and §0.2 done (an agent release carries the substrate fixes to endpoints)
2. §2.1, §2.2 and §2.3 done — **a hook fires, is honoured, and its failure is observed.** Without
   all three, "detection" means "reporting"
3. §2.4 done — a real policy activates; otherwise detections run on defaults, not your policy
4. §1.1 done and verified — the inventory represents what the endpoint actually has
5. §4.1 and §4.2 done — the harness can fail
6. §3.3 done — the shipped default stops interrupting ordinary work, or 4.7A's FP baseline is taken
   against a known-bad default

**Everything else in §3 and §4 can run in parallel with 4.7A** provided it is tracked. The six above
cannot, because 4.7A's output is *measurements*, and each one makes a measurement mean something
other than what it says.

**The honest one-line status today:** the reporting layer is true and deployed; the enforcement layer
underneath it has never been demonstrated on a real machine, and one of its two lanes is proven not
to prevent anything.
