# Wave 4.7A readiness — survey findings

**Built 2026-08-26. Read-only. Nothing in this document was changed, deployed, or executed.**

---

## 1. What this is

This is the output of a read-only survey: four independent readers went through the Installers,
Backend, Frontend and workspace trees at their `origin/main` commits, and every load-bearing claim
they made was then handed to a separate agent whose only job was to try to knock it down. Claims that
failed that refutation have been dropped from the body of this document and appear only in §6 so
nobody re-files them; claims that survived but were *partly* wrong have been corrected in place, and
those corrections are the most useful thing here.

---

## 2. Console-driven Codex policy — the design

*This is checklist item 3.2. Trees read: Installers `origin/main` 114dbc03, Backend `origin/main`
1a24262b, Frontend `origin/main` 359d6548.*

### What a customer cannot do today

An administrator cannot set how the Codex AI agent behaves on their machines. Three postures —
whether Codex asks the user for approval before running a command, which sandbox it runs commands in,
and whether that sandbox may reach the network — are frozen into the agent program. Changing any one
of them requires a code change, a build, and an agent release. There is no console control, and the
backend never sends these values. That contradicts the standing product rule that policy belongs to
the admin in our console.

The frozen values live at `Installers/internal/codexmanaged/requirements.go:404`
(`wantApprovalPolicy = "never"`), `:405` (`wantSandboxMode = "workspace-write"`) and `:423`
(`wantNetworkAccess = false`), inside a `const (` block opened at `:387`. The source itself files the
gap at `requirements.go:400-403`: an administrator who *wants* Codex to prompt cannot have it, and
making that value read admin policy instead of a constant is the open work item.

**Correction the refutation forced, and it changes the design:** it is not true that every machine in
the fleet gets the same three answers. On a box where the ChatGPT/Codex desktop app shares `~/.codex`,
DeVoid deliberately writes a *different, shorter* file — `DesktopManagedConfigBytes`
(`Installers/internal/codexmanaged/merge.go:202-233`) emits only the model-provider route and none of
the three postures, because the sandbox lock hard-bricks the desktop core. Those endpoints attest
three controls (`requirements.go:364`, `desktopRequirements = {R5, R7, R8}`) instead of eight. So
there are two uncontrollable compiled-in decisions, not one, and the desktop one must keep winning
over whatever the admin sets.

---

### ⚠️ THE BRICK WARNING — read this before designing any Codex control

There is a Codex setting, `allowed_sandbox_modes`, that lists which sandbox modes are permitted.
**It has two independent ways to brick clients, and only one of them is the famous one.**

1. **Omit `read-only` and Codex refuses to load its entire requirements document** — on every host,
   not just desktops, with the literal vendor message *"must include 'read-only' to allow any
   PermissionProfile"*. The trap is that `read-only` reads as the *most permissive* entry, so it is
   the first thing a well-meaning admin or a hardening pass deletes. Recorded with vendor-source
   provenance at `Installers/internal/codexmanaged/vendor_key_provenance_test.go:525-554`.
2. **Include `read-only` but omit a mode the client actually needs, and the client's own flows fail.**
   This is the only allowlist brick ever *observed in the field*: openai/codex issue 18242 records
   `allowed_sandbox_modes = ["read-only","workspace-write"]` — a list that **contains** `read-only` —
   breaking an Enterprise customer's desktop app, because its worktree flow requested
   `DangerFullAccess`. Recorded at `vendor_key_provenance_test.go:539-545`.

**Consequence, stated plainly: "always re-insert `read-only`" is NOT a sufficient guard.** Sanitizing
`["workspace-write"]` up to `["read-only","workspace-write"]` produces *exactly* the document that
broke that customer, and our own checker deliberately passes it
(`machine_sandbox_allowlist_test.go:177`, `wantFail=false`).

**Therefore: the console must expose only the three postures named above and must never render the
allowlist.** Both allowlist keys stay unwritten. That is the current, guarded state —
`TestMachineAllowlistsAreNotWrittenYet` (`machine_sandbox_allowlist_test.go:226-238`) asserts absence
over the real renderers, and `TestOmittedVendorKeysAreActuallyOmitted`
(`vendor_key_provenance_test.go:1038`) enforces it across every written document.

If a later wave ever does render one, four fail-closed layers are required, not one: a production
refusal on the write path (promote `sandboxAllowlistDefect`, today test-only, at
`machine_sandbox_allowlist_test.go:117-137`); a backend sanitizer that re-inserts `read-only` **and**
enforces mode-completeness plus a shared-core version floor; a multi-tier fold that is
union-plus-mandatory-member, **not** the intersection used for every other list
(`Backend/src/ai-security-policy/ai-runtime-integrity-policy.ts:251` and `:276`) — two intersecting
tiers can otherwise produce a list with no `read-only` in it; and the desktop-safe profile continuing
to withhold these locks regardless of policy.

A separate, behaviourally-proven brick: `sandbox_mode = workspace-write` in `managed_config.toml`
hard-errors the desktop core (*"invalid value for sandbox_mode … Managed{Restricted}"*, M4.6-B F2),
documented at `merge.go:183-201`. That is why the desktop profile exists at all.

*Status of the "read-only omitted" mechanism: read at vendor source at a pinned commit. **NOT
EXERCISED** — this build has never driven the key against a live Codex host.*

---

### Recommended lane and order

**L0 — Owner decision, before any code.** Deliver over the ordinary policy body, **not** the
runtime-integrity intent lane. Two reasons. First, the values in question are written by the
install/reconcile path (`merge.go:99 ManagedConfigBytes` via `Install` at `merge.go:535/557`), while
the intent lane writes a different file entirely (`requirements.toml`). Second, the intent lane's
Codex leg is measured broken: its two halves hash two different documents — the compiler returns
`mp.Hash()` (`Installers/internal/codexmanaged/provider.go:316`, hashing
dialect/hook/digest/signer/timeout/route/events) while the read paths publish `OwnedFieldsHash()`
(`provider.go:1152`, hashing managed_only/features_hooks/hook_dir/hookgroup) — so the controller's
comparison at `Installers/internal/airuntimeintegrity/controller.go:1002` always mismatches, three
repairs fail, and the target lands `State=FAILED / Containment=UNSUPPORTED`. *Correction from the
refutation: it does not latch permanently — the repair budget window is 5 minutes
(`internal/airuntimeintegrity/episode.go:63-64`), so it cycles forever rather than stopping. The
operational effect is the same: never MATCHED, `onEffectiveMatch` never reached, no canary ever runs,
console reads "mismatch".* Aligning the hashes is worse, not better: the steady-state branch at
`controller.go:551-561` sets `StateMatched` unconditionally when hashes agree and no episode is open,
converting a fleet-wide false alarm into a fleet-wide false all-clear.

**L1 — Backend policy model.** Add a `codexRequirements` block to
`Backend/src/ai-security-policy/ai-runtime-integrity-policy.ts`: closed vocabularies, a default that
returns exactly today's three constants so a deploy changes nothing, a strictest-wins fold, and a
sanitizer that rebuilds the block field-by-field. The shapes to copy are in the same file —
`defaultRuntimeIntegrityConfig:141`, `foldRuntimeIntegrity:205`, `projectRuntimeIntegrityToWire:355`,
`sanitizeStoredRuntimeIntegrity:397`.

**L2 — Shared contracts, all four copies.** `Backend/packages/shared-contracts/src/` is the copy
Backend compiles; mirror into `Ceragon-Intelligence/packages/shared-contracts/`; mirror into the
workspace-root `packages/shared-contracts/`, which is what Backend's parity specs compare against.
There is a **fourth**, hand-written copy in the console at `Frontend/types/ai-governance.ts:5578`
(`AiSecurityPolicyRuntimeIntegrityConfig`) and `:5606` (`defaultAiRuntimeIntegrityConfig`) — the
Frontend does not import the shared package for this shape. Missing one of the four does not fail the
build; it fails silently, and the console ends up editing a field the backend throws away.

**L3 — Backend delivery.** Emit it from `assembleEffectiveDto`
(`Backend/src/ai-security-policy/ai-security-policy.service.ts:2508`) so it rides both the plain
policy read and the signed bundle body. No envelope or signature change is needed, because the body
digest is computed over whatever is assembled.

**L4 — Agent decode.** Add **one nullable field** to the policy struct in
`Installers/internal/core/backend/ai_prompt.go:757`. Nullable, not a value type, because three states
must stay distinguishable: the server never mentioned it (too old), the server said "use defaults",
and the server named values. The precedent and its reasoning already exist in that same file for
`PromptEvidence`, and on the heartbeat lane at
`Installers/internal/core/backend/ai_runtime_integrity_intent.go:19-31`.

**L5 — Agent resolution.** Replace the three constants with one resolved posture threaded through the
detector, the classifier, the legacy-field table (`machine_effective.go:725-727`) and
`PinnedApprovalPolicyRemovesPermissionRequest` (`verify.go:581`), and turn the requirement-label table
into a function of that posture.

*Two corrections here, both of which make this cheaper than it looks.* First, "this touches every
surface that prints a requirement" is **false**: only two places read `row.ShortLabel`, both inside
`reqlabel.go` (`:153`, `:192`); every external caller already goes through a function, and the
`RequirementSetLabel` callers print only ID ranges (R1..R8), never a value. Second, **the exact
table-to-function refactor is already done on the sibling field** — `Consequence` became
`RequirementConsequence(id)` (`requirements.go:245`) delegating to
`requirementConsequenceWhen(id, pinnedApprovalRemovesPermissionRequest)` (`:260`), with
`TestR1ConsequenceIsWithheldWhenThePinStopsRemovingTheCheckpoint` already driving the branch today's
constants cannot reach. Start the agent-side work there: it is the one place with coverage for the
new branch before the feature exists.

**L6 — Agent write path, and the value-restatement trap.** Carry the posture into the install options
so the five-minute reconcile rewrites the managed file when policy changes. **Before that:** the file
writer and the checker do not share their values. `merge.go:113` writes `network_access = false` as a
plain literal, `:116` `web_search = false`, `:119` `computer_use = false`, while the checkers compare
against constants (`requirements.go:547`, `:482`, `:483`). Only approval policy and sandbox mode are
formatted from the constants (`merge.go:106-107`). There is a **fourth** restatement the original
survey missed — `requirements.go:217`, `const networkAccessLabel = "false"`, feeding the operator
label at `:225`. Today all four agree, so no customer sees anything wrong. The day any of them becomes
admin-driven, the agent writes one value and then accuses its own file of tampering, which surfaces in
the console as security drift on every endpoint. Route all five values and the label through one
resolved source.

There is a partial guard, and it is worth knowing it will not catch this: `merge_test.go:136`
(`TestWriteManagedConfig_DetectAllInstalled`) round-trips writer → `Detect` and goes red on a plain
constant flip — but it runs in no pull-request gate (`pr-checks.yml:248` selects only `-run 'Desktop'`;
`go test ./...` lives only in the dispatch-only `internal-candidate.yml:87`), and it exercises
*default* values, so it stays green while a non-default admin choice ships broken.

**L7 — Brick floor.** Promote `sandboxAllowlistDefect` from test-only to a production refusal on the
write path, per the brick warning above.

**L8 — Frontend.** The policy editor
(`Frontend/components/admin/ai-security-policy-section.tsx`, runtime-integrity editor at `:1356`,
mounted `:5386`) plus the fourth copy of the shape at `Frontend/types/ai-governance.ts:5578`.

**L9 — Tests, including the mutations.**

**Ship L8 together with checklist item 3.8** — `attestedProfile` is never rendered anywhere in the
console (`git grep attestedProfile` over Frontend `origin/main` returns zero). Without it an admin can
set the posture and has no way to confirm it took effect: a desktop machine enforcing three controls
and a full machine enforcing eight look identical on screen. The endpoint already produces the report
(`Installers/internal/codexmanaged/adapter_report.go:303`, withheld reasons at `:335` and `:357`) and
the backend already carries it.

---

### Migration, both directions

**Old agent, new backend — safe, and not by luck.** An endpoint on today's agent ignores a Codex
section it does not understand and keeps its built-in values. It will not crash, refuse the policy, or
get locked out. The reason is *where* the strict, reject-anything-unknown parsing sits: it is applied
to the delivery wrapper (`Installers/internal/core/backend/ai_policy_bundle.go:75`, whose `policyBody`
is raw bytes at `:23`), never to the policy document, which is unmarshalled permissively at
`internal/daemon/ai_policy_activate.go:202`. The body is bound by a digest taken over the *raw
delivered bytes* (`ai_policy_activate.go:197` and `:216`), not by schema, so a new member changes the
digest on both sides together. The stored-bytes trap does not recur either: `ai_policy_activate.go:341/374`
persist the raw body verbatim, so boot re-verification cannot fail on a member the agent ignored.

Two refinements the refutation added. (i) "Strict parsing never touches the policy body" is true only
for *unknown fields*: duplicate-member and malformed-JSON checks do recurse into it
(`ai_policy_bundle.go:83`). (ii) **"Keep the new section in the policy body, never in the bundle
envelope" is necessary but not sufficient.** Three server-side knobs still make an older endpoint
refuse the whole bundle, all in `Installers/internal/policybundle/bundle_v2.go`:
`components.minimumAgentVersion` (`:130`, checked `:583`); the three component digests, which must
equal the agent's *embedded* pinned contract-spine digest (`:576`); and `required.obligationKinds` /
`effects`, checked closed-world against a hardcoded list (`:585`). So if the Codex section ships
alongside a contract-spine bump or a new required obligation, older endpoints stop receiving *any*
newer policy — silently, keeping their last-known-good — while the console shows nothing wrong. The
envelope warning stands and is regression-pinned: one unknown envelope member once activated, was
persisted, then failed its own re-verification and contained the endpoint on every restart
(`ai_policy_activate.go:210-215`; corpus case
`internal/policybundle/testdata/policy-bundle-v2/cases/reject-unknown-payload-member.json`).

**New agent, old backend — needs an explicit fall-back.** A machine that upgrades before the backend
does must not end up with *no* Codex posture, which would leave it ungoverned while the console shows
it fine. That is what the nullable field in L4 buys: absent means "this server is too old", which
falls back to today's constants. The standing deploy rule already covers the ordering — **Backend is
deployed before any agent release is cut.**

**NOT EXERCISED:** nothing pins direction A by test. The 24-case parity corpus has no
"accept-additive-policy-body-member" case, and `internal/core/backend/ai_policy_phaseb_wire_test.go`
pins only *declared* additive sections and *absent* sections, not a genuinely unknown one — despite
that file's own header saying its purpose is to stop a future strict-body decoder breaking additive
policy evolution. Adding that one case is cheap insurance.

---

### One correction to a standing belief

A previous note recorded that Codex only accepts "allow" as a decision, which drove a whole design
round to the conclusion that we can never make Codex ask the user. **That note was wrong.** Codex
accepts a per-command decision that prompts the human (`prefix_rule` accepts allow|prompt|forbidden;
`network_rule` accepts allow|prompt|deny|forbidden), measured twice independently on 2026-08-20
against app-bundled codex-cli 0.148.0-alpha.15. Combined with our current silent pin, a matched prompt
rule becomes a native, vendor-enforced refusal with its own reason. The real blocker is a missing
catch-all: an empty prefix is rejected, and wildcards are literal, not globs. **We emit none of this
today** — searching Installers `origin/main` for exec-policy syntax returns exactly one unrelated hit
in a PowerShell attack fixture. *NOT EXERCISED: the vendor probe was not re-run for this survey.*

---

## 3. Stage D — what it covers and how to run it

### What it is

Before a change ships, somebody opens the console in a real browser, at the same address a customer
would use, and looks at every screen the change touched. The only authoritative definition is
`.plans/verify-prod-20260808/IMPLEMENTATION_PLAN.md:985-992`, verbatim:

> **D1** Grep **every** render file for the changed field — not just the one you edited.
> **D2** **Drive a browser to the customer's actual entry point** and look at each changed surface.
> Screenshot it.
> **D3** Check every state: populated, empty, loading, error, and **absent-capability** (must read
> "Not reported" — never green, never red).
> **D4** Mobile width for anything in the top bar or policy page.
> **DEFEAT for the whole stage:** point the console at a tenant with no data and confirm surfaces read
> honestly empty rather than silently green.

D3's absent-capability rule is the point of the stage: a screen that cannot measure something must say
so in words. Stage D is **not** the last gate — Stage E follows at `IMPLEMENTATION_PLAN.md:994`.
D1–D4 are *axes*; the *items* are whichever render surfaces a wave changed.

### Status — the checklist line is stale, but not in the way it looks

`.plans/READY-FOR-4.7A-MASTER-CHECKLIST.md:226` says, unqualified, *"Stage D (render surfaces) has
never been run."* It has been run — once, 2026-08-18/19, recorded in
`.plans/verify-prod-20260808/STAGE-D-RESULTS.md` (811 lines) with 43 screenshots plus matching text
and JSON captures under `evidence/stage-d/shots/`. It scored **12 PASS / 5 FAIL** over 17 items, left
**6 surfaces NOT_RUN** (session-detail receipt identity, prompt-evidence deployment capability, the
enforced-authority panel, tamper render, the events page, the non-substantive toggle) and 19
production-tenant phases BLOCKED by construction. Four of the five failures were **one defect class**:
a headline number derived independently of the rows beneath it, with nothing comparing the two.

Two things the plain reading gets wrong, in both directions. The two *other* documents that say "never
run" (`OPEN-REGISTER-TO-DONE.md:142`, `OWNER-DECISIONS-BRIEF.md:693`) were written before that run
finished and were true when written; only the 2026-08-26 master checklist is stale. And the run tested
a pre-merge integration worktree (`integ/gate-fe-all @ 26000d2`) against a localhost stub — it never
touched production. All five failures were then fixed on Frontend `origin/main` on 2026-08-19
(ecf515fc, 6857bb88, 12154f8a, 09b9f12e, 949bfe57, plus 762e77b1 repairing one of those fixes), and
`origin/main` is now **226 commits past** the tree Stage D looked at.

**So the accurate open item is: Stage D has never been run against the fixed, currently-shipping
console, and a third of its intended surfaces were never reached even once.**

### The harness — and the one file that is missing

There is no Playwright or Puppeteer anywhere in this workspace and one cannot be installed. Screens
are photographed by driving a plain Chrome window over its debug port, pointed at a local dev copy of
the console fed by a stub backend.

- **Driver (committed):** `.plans/verify-prod-20260808/evidence/stage-d/drive.cjs`
  `node drive.cjs <shot-name> <route> [width] [testid,...]`
  Chrome path hardcoded to `C:/Program Files/Google/Chrome/Application/chrome.exe`; flags
  `--headless=new --disable-gpu --hide-scrollbars --remote-debugging-port=9366 --user-data-dir=<temp>`;
  env `APP=http://localhost:3130  STUB=http://127.0.0.1:2163  CDP_PORT=9366`.
  Auth: POST `{email:'render-qa@local.test', password:'local-stub-no-auth'}` to
  `<STUB>/api/v1/auth/login`, then `Network.setCookie` for `codefense_session`, `httpOnly:true` — page
  JavaScript cannot set that cookie, CDP can. Never use a real credential.
  Site selection: `Page.addScriptToEvaluateOnNewDocument` sets
  `localStorage cera_active_site_id = 11111111-1111-4111-8111-111111111111` **before first paint** — a
  post-navigation evaluate lands too late and the capture comes back blank.
  Settle: warms the route once, then polls rendered-text length until three equal reads with no
  spinner. Never a fixed sleep — a dev-mode Next route compiles on first hit.
  Writes `<name>.png`, `<name>.txt` (rendered text — **this is the evidence of record**, not the
  source) and `<name>.json` (data attributes, console errors, ≥400 responses).
- **Dev server:** `node node_modules/next/dist/bin/next dev --webpack -p 3130`. Turbopack panics on a
  worktree's `node_modules` symlink.
- **Fixture switcher (committed):** `.plans/verify-prod-20260808/evidence/stage-d/fx.cjs` —
  `node fx.cjs <scenario>` rewrites `overrides.json` and the stub re-reads it per request, so answer
  shapes change between screenshots with no restart. That is how the absent-capability axis is driven.
- **⚠️ THE BLOCKER:** `.plans/verify-prod-20260808/evidence/stage-d/override-patch.js:13` reads
  `stub-backend.cjs` from its own directory and throws if it is absent. **That file does not exist
  anywhere in the workspace** — `find .plans -name '*.cjs'` returns exactly four files
  (`be-suite-lane/lane-accounting.cjs`, `render-remainders/rem.cjs`, `stage-d/drive.cjs`,
  `stage-d/fx.cjs`). It was left in a session scratchpad that is gone. **Anyone told to re-run Stage D
  today cannot, without rebuilding the stub backend from scratch.** Cheap to fix, and it sits directly
  in front of the gate.

### The six fixture shapes that crash the AI console

All six are the fixture author guessing the shape wrong, not the product being fragile — but each has
cost hours. Read off `Frontend/types/ai-governance.ts`:

1. `AiDataMovementCounts` is `{blocked, redacted, held, allowed}` — there is no `redactedSent` and no
   `unrecorded` key.
2. `AiDetectionRow` needs a whole nested `triage:{status, classification, resolutionReason, assigneeId,
   hidden, secondsToTriaged, secondsToResolved, updatedAt}` plus `repeatCount`. A flat `triageStatus`
   crashes on `.hidden`.
3. The detections `counts` object needs a `hidden` tally.
4. Preset cards carry a **nested** `baseline:{dataProtection, aiAutonomy}`, not flat axis keys.
5. `config.exclusions` is `{allow:[], block:[], patterns:[]}`, not an array.
6. `config.providers` is `{approved:[], blocked:[]}`, not a map — and each risk group needs its own
   `classes:[]`.

Two further silent-blank time sinks: the `/api/sites` and `/api/organizations` proxies pass upstream
through unchanged and the console checks `Array.isArray(data)` first, then `data.sites` /
`data.organizations` — an `{items,total}` envelope satisfies neither, giving an empty site list and
"No active site." on every policy surface. And `middleware.ts` *decodes* the session token without
verifying its signature, which is why a stub-issued token is accepted.

### Surface inventory — 26 routes, and what failure looks like

Taken from the routing table and `Frontend/lib/navigation.ts`, not from memory.

**Tier 1 — AI-security / evidence**

1. `/` Overview — `app/page.tsx` + `app/ai-control-plane/overview-content.tsx`, which mounts
   `protection-depth.tsx`, `rollout-readiness-band.tsx`, `data-movement.tsx`, `kind-bar.tsx`,
   `evidence-chain-card.tsx`, `scope-chips.tsx` and `reports/reports-content.tsx` (`:735`).
   *Fail = "0 blocked / no change" when the server sent no tally at all.*
2. `/coding-ai/sessions` — `app/ai-control-plane/ai-sessions/ai-sessions-content.tsx`.
   *Fail = a session whose events did not load counted as clean.*
3. `/coding-ai/sessions/[id]` — the 16-file `ai-sessions/[id]/` set (verdict header, certified outcome,
   event rail, investigation pane, chain strips, run-timeline band, outcome split bar).
   *Fail = an unproven receipt shown as certified; band totals disagreeing with the rail.*
   **Several NOT_RUN items live here.**
4. `/coding-ai/detections` — `detections-content.tsx`, `facet-rail.tsx`, `severity-band.tsx`.
   *Fail = headline count disagreeing with rows — this screen rendered `NaN` in the 2026-08-18 run.*
5. `/web-ai/activity` · 6. `/web-ai/sessions` and `/web-ai/sessions/[id]` ·
   7. `/ai-control-plane/events` (+ `prompt-evidence.tsx`, `prompt-preview.tsx`) — **NOT_RUN** ·
   8. `/ai-control-plane/catalog` · 9. `/mcp` · 10. `/alerts`.

**Tier 2 — endpoint / coverage**

11. `/admin/endpoints?sub=fleet` · 12. `/admin/endpoints?sub=coverage` (`coverage-section.tsx`,
`ai-optout-coverage-panel.tsx`, `ai-canary-fleet-panel.tsx`, `ai-trust-root-panel.tsx`,
`protection-depth.tsx`) · 13. `/endpoints/[hostname]` · 14. `/inventory` ·
15. `/inventory/item/[ecosystem]/[...name]` · 16. `/inventory/endpoint/[hostname]` ·
17. `/admin/install` · 18. `/admin/audit`.

**Tier 3 — policy**

19. `/admin/policies/ai-security` (the section file plus 19 files under `components/admin/policy/`) —
**2 NOT_RUN items** · 20. `/admin/policies/approvals` · 21. `/admin/policies/mcp` ·
22. `/admin/policies/code-security` · 23. `/admin/policies/supply-chain` ·
24. `/(internal)/diagnostics/detector-catalog`.

**Tier 4 — artifact verdicts feeding the endpoint story**

25. `/analysis`, `/analysis/[...artifact]`, `/analysis/licenses` (+ 24 files under
`components/analysis/`) · 26. `/scripts/[...package]`.

**D4 (mobile, 375px)** applies to the top bar on every route above, plus `/admin/policies/ai-security`
and `/admin/policies/approvals` in full.

---

## 4. What the master checklist missed

Everything below survived refutation or was re-verified against `origin/main` for this document. Each
item leads with what a person would see or lose.

### 4.1 — A brand-new detector cannot interrupt anyone, and no screen says so — **BLOCKS 4.7A**

**What you'd see:** an admin opens the AI Security page, sets a detector class to "block", and the
endpoint silently allows every hit. The endpoint has a deliberate rule that a detector whose
false-positive rate has not been measured may look and record but may never stop, warn, or hold —
enforced *above* every policy branch, so it wins even when the backend is unreachable. Nothing in the
console shows which detectors are in that state.

**Where:** `Installers/internal/policyeval/policyeval.go:405` and `:514`
(`if IsShadowClass(class) { return VerdictAllow, true }`); the rule at
`Installers/internal/policyeval/shadow.go:16` ("Every NEW detector class ships with lifecycle
SHADOW"); the false claim at `shadow.go:66` that this "is what the console renders as 'measuring,
cannot interrupt'". Backend carries the field
(`Backend/src/ai-security-policy/ai-security-detector-catalog.service.ts:46`, `:111`); Frontend
projects it at `Frontend/lib/ai-security-detector-catalog.ts:160` and then **nothing reads it** — I
re-ran the search: `.lifecycle` across `app/`, `components/`, `lib/` returns exactly that one producing
line and no consumer, including the internal detector-catalog diagnostics page.

**Why it blocks:** dormant today — `Installers/internal/aipolicycontract/detector_catalog_generated.go`
has 55 rows, all `CURRENT`, zero `SHADOW` (verified by count). It switches on **the day 4.7A ships its
first detector**, because 4.7A's own rule is that every new detector ships in exactly that state. The
first 4.7A measurement would be taken against a console asserting enforcement the machine is refusing.

### 4.2 — A field the agent sends and the server does not know is thrown away with no trace — **BLOCKS 4.7A**

**What you'd lose:** any new detection field the agent starts reporting can vanish on arrival, and the
measurement is computed on the remainder with nothing anywhere saying data was missing. Agent requests
are handled leniently on purpose (rejecting the whole request has taken the fleet down four times);
the documented safety net is a log line naming what was dropped.

**Where:** `Backend/src/common/pipes/agent-ingest-validation.pipe.ts:110` writes it at **debug** level;
`Backend/src/common/logging/pino-options.ts:140` defaults to `info`, and `LOG_LEVEL` appears exactly
once in the whole Backend repo (that line), so no deployment raises it. Nothing else counts it — no
metric, no alert, no column. Worse, the routine is **top level only** by design (`:107-109` filters
`Object.keys(input)`), so anything nested — the endpoint's whole control-attestation block, the
runtime-adapter reports, the coverage numbers — is discarded with no record even when debug logging is
on. No spec references it, including the otherwise-thorough `agent-wire-leniency.spec.ts`.

### 4.3 — The detector vocabulary is hand-copied into three repos and each repo's guard checks itself — **BLOCKS 4.7A**

**What you'd lose:** a new high-severity detector added in the agent but never copied across would
start interrupting work fleet-wide with **no console control to turn it off** — an admin literally
cannot set a policy for a class the backend's list does not contain.

**Where:** the producer states the sync is manual at
`Installers/internal/toolrisk/class_catalog.go:1-24`, and records the prior incident by name
(`interpreter-exec`, `fetch-then-exec`, `substitution-exfil` were absent from both consumer registries
for months). The guard added afterwards compares each repo against *that repo's own copy*, so it
catches an edit-without-copy and cannot catch an add-in-agent-never-copied.
`Backend/src/ai-security-policy/ai-security-policy.service.ts:2977` iterates `AI_TOOL_RISK_CLASSES`
only, so a class outside that 40-entry tuple is never emitted and the endpoint falls to its built-in
severity default.

**Verified for this document:** all three copies are byte-identical today —
`Installers/parity-vectors/toolrisk-classes.v1.json`,
`Backend/packages/shared-contracts/toolrisk-classes.v1.json`,
`Frontend/types/vendored/toolrisk-classes.v1.json`, all sha256
`cf4b55add546382737a5eb24d9b2b8f24a0ac87d8713c32705ae696b95603541`. **Nothing is broken right now.**
4.7A adds detectors, which is precisely when it fires.

### 4.4 — On a machine's own page, an add-on nobody has ever checked shows a green Allow — *runs alongside, but it contradicts a §6 "done" claim*

**What you'd see:** open a single machine in the console. An MCP server or editor extension our
intelligence has **never analysed** shows the same green "Allow" as one we analysed and found clean.
Open the same artifact on the analysis screen and it correctly reads amber, "Not analyzed — this is
NOT a clean result." The console tells an operator two opposite things about one add-on depending on
which page they opened.

**Where:** the stored ambiguity is documented at
`Backend/src/endpoint/ai-artifact-coverage.ts:174-180` ("`endpoint_inventory.verdict` is 'ALLOW' for
BOTH … Absence of analysis is not a clean bill"). The contract's own instruction is at
`Backend/src/endpoint/dto/endpoint-inventory-list.dto.ts:633-641`: "This is the ONLY thing separating
the two on the wire … A client MUST render `pending` distinctly from an analysed ALLOW." Same field,
same instruction, on the catalog DTO at `:763`. **The per-machine DTO does not have it** —
`InventoryEndpointItemDto` at `:942-964` is `{ecosystem, name, displayName, version, verdict, state,
source, editorHost, mcpClient, lastSeen, findingId}`, no `coverageState`; I confirmed this by reading
all three DTOs side by side. Producer:
`Backend/src/endpoint/inventory-aggregation.service.ts:3819-3831`. Console:
`Frontend/app/endpoints/[hostname]/inventory-panels.tsx:109` renders only `<VerdictIndicator>`, which
maps ALLOW to the success token.

**Why it matters beyond itself:** checklist §6 records "The console cannot render healthier than the
endpoint reported" as done and verified. This is a live counter-example.

### 4.5 — The console reads a "where was the data going" field the backend never forwards — *runs alongside*

**What you'd lose:** a network-exfiltration detection describes what happened without ever naming the
destination host, and reads milder than what the machine recorded. Three separate console surfaces
have code to show it: the detection summary sentence
(`Frontend/app/ai-control-plane/detections/detections-content.tsx:931`), the investigation side panel
(`.../investigation-detail-pane.tsx:247`, evidence row `:581`) and the risk facts
(`.../risk-facts.ts:137-155`, "destination it would have been sent to").

**Where it dies:** the backend's read layer copies event details onto the wire from an explicit
allowlist (`Backend/src/ai-governance/services/ai-query.service.ts:2592`, described as such at `:394`),
and `egressHosts` is not on it. **I re-ran this search: `egressHosts` has zero occurrences anywhere in
Backend `src/` or `packages/shared-contracts/src/` on `origin/main`.** Both read surfaces go through
that allowlist (`:3508` timeline, `:5743` activity rows). Separately, the endpoint writes it as a
comma-joined **string** (`Installers/internal/daemon/ai_handlers_proxybridge.go:53`,
`meta["egressHosts"] = strings.Join(hosts, ",")`) while every console reader gates on `Array.isArray`
— so even if it were forwarded, all three readers would discard it. The spool allowlist
(`Installers/internal/daemon/evidence_delivery.go:20`) and the alert struct
(`Installers/internal/proxy/ai_alert.go:71`, `[]string`) both show the key was meant to travel.
Same class, same file: `risk-facts.ts:111` reads `metadata.toolProvider`, also not on the allowlist.

### 4.6 — The "this deployment can capture governed evidence" light checks that two secrets exist, not that they work — *runs alongside*

**What you'd lose:** a mistyped, short, or wrongly-encoded key turns off both the operator startup
warning and the console banner while every governed-evidence upload keeps being refused.

**Where:** the flattering check is
`Backend/src/ai-security-policy/ai-prompt-evidence-capabilities.ts:148-152` — it filters for "is a
string and trims to non-empty", then sets `governedEvidenceAvailable: missing.length === 0`. The real
gates are far stricter: `Backend/src/crypto/prompt-evidence-tenant-key-ring.ts:57` requires at least 32
characters, and `Backend/src/agents/ai-correlation-key-custody.service.ts:328-333` requires 64 hex / 43
base64url / 43 base64 **and** exactly 32 decoded bytes. That same service already has a correct
`master-key-malformed` readiness answer at `:299-307` which the capability report never calls.
Consumers of the flattering value: `Backend/src/ai-governance/ai-governance.module.ts:339-340`
(suppresses the only startup warning) and
`Frontend/components/admin/prompt-evidence-controls.tsx:436`.

**Currently correct by accident:** both keys are absent in production, so the report happens to be
right. It becomes wrong the first time someone sets them — likely during 4.7A preparation.

### 4.7 — Three silent, uncounted allow paths in the on-box provider/agent gate — *runs alongside*

**What you'd see:** the console shows a provider as blocked, the block does nothing, and no number
anywhere moves. Three routes let everything through recording nothing — no reason, no counter, no
event: no policy loaded (`Installers/internal/daemon/ai_governance.go:102-103`,
`if policy == nil { return aiGovernanceVerdict{} }` — the file header notes this endpoint is contained
today, so policy is nil on *every* call); a blank agent type (`:128-133`); and a policy mode string
this build does not recognise (`Installers/internal/aiagent/aiagent.go:230`, "Unknown mode string ->
permissive (fail-open)"), which returns allowed with no reason, so the caller at
`ai_governance.go:157-162` — which records only when the reason is non-empty — stays silent. The
checklist tracks thirteen fail-opens that are bucketed and counted; none of these three is among them,
because that bucketing covers only the hook lane
(`Installers/internal/airuntime/undecidable.go:72-77`). This is the missing instrument for the
checklist's own item about a policy never activating.

### 4.8 — A count of how much prompt-preview text was shortened is stored and read by nothing — *runs alongside*

**What you'd lose:** a reader looking at an endpoint's AI-context coverage cannot tell that some of
what they are looking at was trimmed. The number crosses the wire, passes validation, and is written to
a column on every sweep. Producer `Installers/internal/core/backend/aicontext_findings.go:138`;
accepted at `Backend/src/ai-context/dto/ai-context-ingest.dto.ts:250`; written unconditionally at
`Backend/src/ai-context/ai-context.service.ts:341`; column at
`Backend/src/entities/ai-context-coverage.entity.ts:148`. **I re-ran the search: outside specs, those
four lines plus the migration are the only occurrences in Backend, and the Frontend has zero.** This is
a second, separate instance of checklist item 3.10, not the same one — 3.13 mentions this file only to
say a comment in it is stale.

### 4.9 — The endpoint and the server compute the ungoverned-invocation alert differently, and the endpoint's comment says they cannot — *runs alongside*

**What you'd see:** two different answers to one headline question — "how many AI tool calls ran with
no verdict at all?" — depending on whether you read the endpoint's own accounting or the console, with
one of the two source files actively asserting they agree. The server includes records the endpoint's
queue had to throw away; the endpoint's version excludes them.
`Installers/internal/controls/attestation.go:969-972` omits `Dropped` (declared at `:959-961`) and its
comment at `:966-968` claims "The endpoint and the server must not be able to disagree about the alert
number"; `Backend/src/ai-governance/runtime-adapter-shape.ts:876-887` adds `u.dropped` and its comment
at `:871-874` says the difference is deliberate and pre-existing. The console agrees with the server
(`Frontend/types/ai-governance.ts:3640`). Separately, **the endpoint's version has no production caller
at all** — I re-ran it: `UndecidableTotal()` across Installers `origin/main` non-test Go returns only
the definition line.

### 4.10 — Three weaker render cases, each worth one Stage D fixture — *runs alongside*

Marked *likely*, not proven, because each depends on a response shape I did not confirm the shipping
backend can emit. That is precisely what Stage D's absent-capability axis exists to settle.

- **The front page invents zeros for a weekly tally the server did not send.**
  `Frontend/app/ai-control-plane/reports/reports-content.tsx:17-25` substitutes `?? 0` for events,
  sessions, blocked, redacted and exceptions, and the delta chip then prints "no change". A reader sees
  "0 blocked, no change" and concludes the week was quiet. Two screens away, the sibling panel refuses
  exactly this in writing (`Frontend/app/admin/endpoints/ai-canary-fleet-panel.tsx:29-33`: "a
  fabricated all-zero rollup is byte-identical to the honest never-run answer"). This is reachable —
  it is the console landing page, mounted at `overview-content.tsx:735`. A non-2xx does render an
  explicit error panel, so this bites only on a 2xx with an absent or partial `totals`.
- **The fleet-readiness headline is never checked against the rows beneath it.**
  `Frontend/app/admin/endpoints/coverage-section.tsx:1542-1546` renders the summary band straight from
  the server, immediately above the endpoint matrix at `:1560-1568`, with no reconciliation. The guard
  exists (`lib/summary-vs-rows.ts` + `components/ui/summary-vs-rows-note.tsx`) and is wired into three
  other panels — this is the fourth summary-over-rows on the same screen and is not among them. It
  cannot fire today because
  `Backend/src/endpoint/rollout-readiness.service.ts:663-665` builds both halves from the same array,
  so this is a gap, not a live bug — but it is the exact shape that has already shipped four times.
- **The enforcement-proof card vanishes silently on an empty-but-successful read.**
  `Frontend/app/admin/endpoints/ai-canary-fleet-panel.tsx` ends both lanes with `) : null}` (`:254`,
  `:301`), and the fetch at `:100-108` sets a falsy rollup with no error on a 200 whose body is `null`.
  A missing section reads as "nothing to worry about here", which is the worst available answer to
  "has anything on this fleet ever been shown to actually enforce a policy?" The same class was scored
  once already (D-S2d) and fixed on a different panel.

---

## 5. The 4.7A plan versus current reality

### 5.1 — Two different milestones are both called "M4.7A"

The roadmap's M4.7A (`docs/Devoid_Roadmap_To_Finished_Product.md:731`) is a **certification program**:
score at least 9/10 against five named risks on a named managed deployment, with an independent
reviewer reproducing the highest-impact defeat cases. Its immediate exit gate (`:935`) names eight
items. The plan in `.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md:5` is a **product-quality build**:
"Make the AI security engine's rules fire correctly, never fire on legitimate work, carry a severity
that means something, and present all of it clearly in the console."

Only two of the roadmap's eight gate items appear anywhere in the plan's eight waves, and the plan
explicitly lists two of the others under "What this plan does NOT cover" (`:17505-17520`) — branch
protection on our own repos, and unsigned SQS job/result traffic. Word counts over the plan file are
**zero** for each of "M4.7A-", "Five-Risk", "9+", "Governance Profile", "Risk 1", "Risk 2", "Risk 5",
"F16" and "trust_anchor".

**Somebody has to decide which of the two is being started.** Completing all eight waves and reporting
"M4.7A done" leaves the roadmap's M4.7A entirely open.

### 5.2 — The plan was formally rejected and the rebase it demanded never happened

`.plans/m47a-20260822/M47A_DETECTION_QUALITY_REVIEW_20260823.md:6-10` returns **"REQUEST CHANGES — NOT
APPROVED"** with 19 blocking findings and the instruction "Do not begin detection-enforcement
implementation from the current plan", requiring a rebase against current code first. **File
timestamps, checked for this document:** plan `2026-08-22 20:16`, review `2026-08-23 01:18`, and the
folder contains no revised plan. The document on disk is the exact version the reviewer refused.

### 5.3 — Nothing has quietly overtaken the plan's decisions

Each checked against today's code so nobody redoes it. All still open:

- **D1 (unbounded source egress)** — still committed in all three deployed worker definitions:
  `GithubApp-Bot-Scanner-Worker/deployment/scanner-worker-task-def.json:90-91`,
  `scanner-worker-fullrepo-task-def.json:92-93`, `scanner-worker-heavy-task-def.json:85-86` all carry
  `CODEFENCE_GEMINI_VULN_REVIEW_ALLOW_MINIMAL` and `CODEFENCE_OPUS_BASELINE_ALLOW_MINIMAL` = `"true"`.
- **D7 (confidence grade)** — the endpoint computes it and it never leaves the machine; Backend
  declares the field with no producer (`Backend/src/ai-governance/dto/ai-response.dto.ts:876`).
- **D8 (severity bands)** — `Frontend/app/ai-control-plane/detections/detection-read-model.ts:52` is
  still `["critical","high","medium","low"]`, and `Frontend/lib/severity.ts` does not exist.
- **D11 (multi-signal combining)** — `deriveCombos` exists at
  `Installers/internal/ingressrisk/ingressrisk.go:334` and
  `Installers/internal/promptrisk/promptrisk.go:770`, and is absent from `internal/toolrisk/` entirely.
- **Sweep caps** behind the filed blocking finding — untouched
  (`Installers/internal/aicontext/resolve.go:139-140`, `:277-280`, `:294-296`, `:312-334`;
  `sweep.go:167-171`).

**⚠️ Numbering collision.** `.plans/READY-FOR-4.7A-MASTER-CHECKLIST.md` §6 records "D1 implemented on
all legs" and "D2 implemented" — for a **different decision set**. The plan's D1 and D2 are not done.

### 5.4 — The same measurement defect as the filed blocking finding, in three more places

The finding already filed against the file sweep is "a number computed over a population that was
quietly cut down". It recurs:

- **Secret classes: 81 emitted / 55 catalogued / 30 governable.** I counted these directly:
  `Installers/internal/dlp/registry.go:133-197` has 33 class entries and
  `Installers/internal/dlp/codesecurity_rules.go:70-158` has 48, folded into one index at
  `registry.go:201-213` — **81**. The shared catalog
  (`Installers/internal/aipolicycontract/detector_catalog_generated.go`) has **55**. The list an
  administrator can set a policy for
  (`Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts`,
  `AI_DLP_CLASSES`, lines 55–84) has **30**. The false-positive scorer seeds a zero row only for
  catalog members (`Installers/cmd/ai-security-neutral/holdout.go:265-267`; anything else is labelled
  UNCATALOGED at `:196-200`). A per-class "zero false positives" number computed this way is a number
  about 30 classes described as a number about the whole product. The plan hardcodes both stale figures
  (`M47A_IMPLEMENTATION_PLAN.md:4307`, `:9654`).
- **The malicious-artifact catch gate records a miss only if a sample escapes in all four ecosystems at
  once.** `Static-Worker/src/__tests__/corpus-fp-gate.test.ts:296-297` —
  `if (rows.every((r) => r.verdict === 'ALLOW')) { escapedSlugs.push(label); }`, where `rows` spans
  `ARTIFACT_ECOSYSTEMS = ['agent-skill','mcp','editor-extension','plugin']` (`:70`). A malicious plugin
  caught as an npm package but waved through as a plugin bundle is recorded as caught and the gate
  stays green. The roadmap forbids this in words at
  `docs/Devoid_Roadmap_To_Finished_Product.md:839` ("no aggregate average hiding a failing critical
  stratum").
- **The ungoverned-invocation rate structurally cannot see the invocations it is about.** On the Codex
  lane the client discards our decision and runs the tool anyway when our check fails
  (`Installers/internal/codexmanaged/machine_projection.go:116-120`,
  `const HookTimeoutFailOpen = true`). Nothing anywhere parses the client's failure line — searching
  `internal/**` returns only comments and a runbook — so those invocations are in neither the numerator
  nor the denominator. The rate reads its best exactly when the control is being voided most, and plan
  Task 8 (`M47A_IMPLEMENTATION_PLAN.md:11978`) puts that rate on screen.

### 5.5 — The instrument the plan's central decision depends on cannot produce the number

The plan's rule is "measure the false-positive rate before turning any rule on". The recorder keeps one
global count of agreements and retains class names only on disagreement, so "this rule caused zero
problems" and "this rule never once had the chance to fire" produce identical output. And it only sees
**tool-call** decisions, while six of the rules the plan wants to turn on live on the **prompt** and
**tool-result** paths, which can never appear in it. Structurally confirmed: the combining logic the
tool lane would need does not exist there (`deriveCombos` absent from `internal/toolrisk/`, which is why
plan W4 Task 2 has to port it). Either those rules stay off and the milestone ends without improving
prompt protection, or somebody promotes them on evidence about something else.

### 5.6 — Wave 1 Task 1's stated premise is wrong about where the floor is already wired

The plan says the guard that stops an admin setting protection below the mandatory floor "simply is not
called when a customer saves", and is referenced only by our preset file. On current code the preset
file mentions it **only in a comment** (`Backend/src/ai-security-policy/ai-policy-presets.ts:64`), while
a sibling that applies the same floor **is** wired — on the preset/risk-group path, at
`Backend/src/ai-security-policy/ai-security-policy.service.ts:3575`, inside the private
`buildRiskGroupUpdateDto` (`:3343`). The task is still needed — `putForSite` (`:860`) really is
unguarded — but the implementer will hunt for a call that is not where the plan says and add a second
guard on a path that already has one. The source file also carries a false comment
(`Backend/src/ai-security-policy/ai-malicious-floor.ts:31`) claiming the guard runs inside
`assembleEffectiveDto` on every assembly for every tenant; `assembleEffectiveDto` is at `:2131` and
contains no such call.

### 5.7 — Prerequisites the plan assumes and that do not exist

1. **The Wave 3 shadow report** the plan tells the implementer to open is never created by any earlier
   wave.
2. **No measurement path exists for the prompt and tool-result lanes** at all — only for tool calls
   (§5.5).
3. **The roadmap's endpoint key-custody prerequisite is absent from the plan.**
   `docs/Devoid_Roadmap_To_Finished_Product.md:788` states that before Risk 1, 3, 4 or the shared trust
   gate can certify, the endpoint credential/key split must be resolved. Zero occurrences of "F16" or
   "trust_anchor" in the plan. The related open item is real:
   `Installers/internal/winacl/machine_secret_windows.go:69` (checklist §3.1).
4. **Wave 0 needs live AWS access and permission to change three deployed worker definitions**, and
   there is a separate open owner decision about production visibility that cannot be closed from a
   keyboard here.
5. **No agent release has been cut**, so every Installers fix in this campaign is live on **zero
   customer machines** (checklist §0.2). Owner-gated, not engineering-gated. *Proven from the two
   workspace documents; not independently verified against GitHub.*

### 5.8 — Where the same defect was looked for and NOT found

So this is not re-audited. Four places a truncated-population number could hide are already
disciplined: the false-positive scoring harness refuses to average two measurement lanes into one rate
and exits non-zero if any case failed to run
(`Installers/cmd/ai-security-neutral/holdout.go:216-235`, `:277-286`; `main.go:64-68`); the console's
list queries fetch one row past their cap so they can tell a full page from a truncated one and label
an estimate as one (`Backend/src/ai-governance/services/ai-query.service.ts:2290/2307`, `:6077-6093`);
when an event carries more findings than we store, the survivors are chosen by severity and the loss is
counted (`Backend/src/ai-governance/services/ai-event.service.ts:3027-3060`, `:3020-3024`); and when a
script body is too big to analyse the answer is "risky", not "fine"
(`Installers/internal/toolrisk/interpreter_body.go:199-204`).

---

## 6. Did not survive refutation

**Be aware of a limit in the material I was given:** the verdict record handed to this document is
truncated mid-record inside the Stage D lane, so it contains no `refuted` array I can read, and the
checklist-gaps and plan-vs-reality lanes carry **no adversarial verdict at all**. I did not treat those
as verified — I re-read each of their load-bearing claims against `origin/main` myself, and every one I
checked held (those re-checks are marked inline in §4 and §5). **No whole finding was overturned.**

What follows is the list of *sub-claims inside upheld findings* that the refutation killed. They are
here so nobody re-files them:

- **"Every customer machine gets the same three Codex answers."** False — desktop-safe endpoints get
  none of them (`merge.go:202-233`).
- **"Eight production consumers of the Codex constants."** Seven direct sites; `reqlabel.go` has zero
  direct references (it reads the catalog), and three other live consumers were omitted.
- **"`wantNetworkAccess` is what gets written to disk."** No — `merge.go:112-113` emits a separate
  literal; the constant is used only on the detection side.
- **"Fixing the labels touches every surface that prints a requirement."** False — only two sites read
  `row.ShortLabel`, both in `reqlabel.go`.
- **"No guard exists on the writer/checker split."** One does — `merge_test.go:136` — but it runs in no
  pull-request gate and exercises only default values.
- **"Re-inserting `read-only` in the backend sanitizer makes the allowlist safe."** False, and actively
  dangerous: that is exactly the document that broke an Enterprise customer (issue 18242).
- **"No console control may EVER reach the sandbox allowlist."** Overstated — the recorded state is
  "not yet, with a named prerequisite" (our own desktop version probe discards the build number,
  `requirements.go:335-357`).
- **"Stage D is the last gate of the plan."** False — Stage E follows at `IMPLEMENTATION_PLAN.md:994`.
- **"Every document saying Stage D was never run is stale."** Only the 2026-08-26 master checklist is;
  `OPEN-REGISTER-TO-DONE.md:142` and `OWNER-DECISIONS-BRIEF.md:693` were written before the run finished
  and were true then.
- **"Keeping the new section in the policy body is sufficient for old-agent safety."** Necessary, not
  sufficient — three other server-side knobs still make an older endpoint refuse the whole bundle
  (`bundle_v2.go:130/576/585`).
- **"The Codex intent lane stays permanently FAILED."** It cycles rather than latches — the repair
  budget window is 5 minutes (`episode.go:63-64`). Same operational outcome, different mechanism.
- **Citation drift, corrected in place:** the design note is `ai_prompt.go:725-735` not `728-736`; the
  intersection folds are `ai-runtime-integrity-policy.ts:251` and `:276` not `255`/`275`; the desktop
  hard-error sentence is `merge.go:187-188` not `183-199`.

---

## 7. What this survey could not see

1. **Nothing here was executed, rendered, or driven in a browser.** Every render claim is a claim about
   what the code would do given a shape, not a photograph. No Go test was run; the Installers working
   tree is on a branch that has no `internal/codexmanaged/` directory, so red/green behaviour is read
   off the source, not observed.
2. **A text search cannot see copy wrapped inside page markup.** Every "only N call sites" or "appears
   nowhere" statement here is a statement about source-text matches, not about what renders. The one
   authority on rendered output is `drive.cjs`'s `<name>.txt` captures — which is exactly why Stage D
   exists and why the missing stub-backend file matters.
3. **Ordinary text search silently skips files containing stray binary bytes.** There are 5 such files
   in Frontend and 12 in Backend `src/`. One of them —
   `Backend/src/endpoint/inventory-aggregation.service.ts` — is the producer in finding 4.4, and was
   only caught because the search tool announced it as binary. Two Frontend render-path files
   (`components/forensics/cve-intelligence-panel.tsx`, `lib/threat-intel-finding.ts`) were **not
   audited**.
4. **The "console reads a field the server never sends" hunt works by comparing word lists.** A backend
   key assembled at runtime, or one carried only inside a stored JSON blob, would be a false positive of
   that method. Both confirmed drift findings (4.4, 4.5) were verified by reading the producing code,
   not by the word list.
5. **The refutation record handed to this document is truncated** (see §6). Two of four survey lanes
   carry no adversarial verdict; their claims were re-verified against `origin/main` by hand instead,
   which is weaker than an adversarial pass.
6. **Trees read:** Installers `origin/main` 114dbc03, Backend `origin/main` 1a24262b, Frontend
   `origin/main` 359d6548, plus `Static-Worker` and `GithubApp-Bot-Scanner-Worker` `origin/main`. The
   local working checkouts are **not** at those commits, so anything read from a working tree would have
   been the wrong code.
7. **No deliberate non-goal from checklist §5 was reopened.** §5 was read first.
