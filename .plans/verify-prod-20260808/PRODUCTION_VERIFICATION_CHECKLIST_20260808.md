# PRODUCTION VERIFICATION CHECKLIST — 2026-08-08

**Target of test:** the live Devoid / Ceragon AI-governance platform.
**Console:** `https://console.devoid.one` — **API:** `https://api.cera.buzz` — **Region:** `eu-north-1`, account `<AWS_ACCOUNT_ID>`.
**Under test:** backend `301`, frontend `358`, endpoint agent **7.8.30** (stable channel, **UNSIGNED**).
**Author:** QA design. **Audience:** one operator, one owner, one real Windows endpoint.
**Test count:** 165 across 15 phases.

---

## 0. READ THIS BEFORE YOU RUN ANYTHING

### 0.1 What this document is

This is a **journey-based** production verification plan. It is not an endpoint smoke test. Every test follows a real
action taken by a real persona and then demands that **independent surfaces agree** about what happened. A test that
only asks "did the API return 200" has been deliberately excluded, because a stub that accepts and discards returns 200.

### 0.2 The cardinal rule — a green surface can sit on a dead path

In the two days before this plan was written, this programme found, by measurement:

- ~50 database-backed test suites that had **never executed** in CI while the gate reported green for months;
- 7 contract-parity suites that **silently self-skipped** because a path resolved outside the repo;
- a privacy assertion (`expect(JSON.stringify(dispatcher.calls)).not.toContain(secret)`) over an array that was
  **always empty** — it could never fail;
- a test suite that ran `DROP SCHEMA public CASCADE` on the database its neighbours were using;
- an S3 immutable-prefix guard that could neither pass when the prefix was free nor detect when it was occupied;
- a release job that called a repo script **without checking out the repo**, so the release-manifest producer has
  never run, in any release, ever;
- a daemon that never sent `appliedBundle`, leaving five DB columns NULL and making the deny-canary unable to fire;
- Codex running **completely ungoverned** on machine-scope installs while **both** status surfaces reported green.

Therefore **every test in this document carries a FALSE-PASS clause**: the specific way this check could report success
while the underlying thing is broken, and the concrete step that defeats it.

> **If you skip the defeat step, the test is `NOT-RUN`. It is never `PASS`.**

### 0.3 The verdict rule — there is no soft pass

Every test terminates in exactly one of:

| Verdict | Meaning |
|---|---|
| **PASS** | All PASS criteria met **and** the FALSE-PASS defeat step was executed and did not fire. |
| **FAIL** | A PASS criterion was not met, **or** the defeat step fired. |
| **BLOCKED** | Could not run. **You must name the precondition that blocked it** (e.g. "no second org provisioned", "column `ai_policy_applied_digest` absent from `information_schema`"). A BLOCKED test with no named blocker is itself a defect in the run. |
| **NOT-PROVEN** | The test executed but the tenant topology makes the property **definitionally unfalsifiable** (e.g. id-collision checks with exactly one endpoint and one key). Record why. |
| **NOT-RUN** | Steps skipped, or the defeat step skipped. |

**"Unknown" is not a verdict. "Looks fine" is not a verdict. "Probably OK" is not a verdict.**

### 0.4 What is deployed, and what is known-open

**Deployed / changed in this wave**
- Codex governance: the hook dialect firewall was pinned to the wrong Codex version markers; Codex **fails OPEN**, so
  every hook reported "Failed" and nothing was enforced while status screens showed green. Claimed fixed.
- Claude Code hooks: `PreToolUse`, `UserPromptSubmit`, `PostToolUse`, `SessionStart`, `PermissionRequest`.
- Tool-risk decisions on the **real** command: shell, interpreters, PowerShell including base64 `-EncodedCommand`
  (decoded and re-evaluated). Classes include `interpreter-exec`, `fetch-then-exec`, `powershell-download-exec`,
  `privilege-escalation`.
- Secrets/DLP in AI context: high-entropy, payment-card, cloud keys, home paths.
- Web AI Guard blocks unapproved AI sites.
- Signed policy bundles console → server → endpoint, with the endpoint reporting the exact bundle it applied
  (revision, digest, signing key, applied-at) into `endpoint_control_state.ai_policy_applied_*`.
- Bundle-application receipts (`ai_policy_bundle_application_receipt`).
- Deny-canary with an `everRun` field that prints "This is a measured absence, not a pass".
- Rollout phases SHADOW → CANARY → ENFORCE with a canary-predecessor requirement.
- Endpoint lifecycle: install, enroll, trust attestation (`V2_ATTESTED`), heartbeat, upgrade lane, anti-rollback floor.
- Machine secret no longer readable by `BUILTIN\Users`.
- `backend:301`; migration ledger repaired 215 rows / 204 distinct → 218 / 218 with `uq_migrations_name`;
  298 CHECK constraints; multi-tenant constraints on AI tables.
- DB credentials rotated (old password proven dead); 17/17 secrets under `/ceragon/production/backend/*`;
  RDS private, zero public CIDRs.
- `errorCode` on error bodies; `release-manifest` health endpoint.

**Known-open / actively suspect. Do NOT assume these are fine — several tests below exist specifically to catch them.**

| # | Known-open item | Tests that hunt it |
|---|---|---|
| K1 | `ai_context_coverage.endpoint_id` historically held the **API-KEY id**, not the endpoint id (`agentId ?? apiKeyId`). | EN-05, EN-06, CN-11 |
| K2 | The deny-canary may **never have fired in production**. | PL-11 … PL-14 |
| K3 | `m47-backend-truth.repro` is an aspirational spec, **red by design**. | OP-11 |
| K4 | Top-bar layout **overflows horizontally at phone width on every route**. | UX-01, UX-02 |
| K5 | Prompt-evidence correlation keys (`AI_CORRELATION_KEY_MASTER_KEY`, `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY`) were **absent in prod** — the prompt-evidence lane may be **inert**. Every privacy assertion is vacuous over an inert lane. | DL-01 … DL-05 |
| K6 | `release-manifest` reported `manifestLoaded:false`; the producer only just started emitting. | AQ-03, AQ-04, OP-09 |
| K7 | Agent 7.8.30 is **unsigned** — SmartScreen will warn. That is expected; the failure mode is asking a user to run an unsigned binary with no published way to verify it. | AQ-01, AQ-02 |
| K8 | `endpoint_control_state` in the last-read source revision had **no** `ai_policy_applied_*` columns and there was **no** `ai_context_coverage` / `ai_policy_bundle_application_receipt` entity. Resolve every table and column from `information_schema` in **GT-03** before asserting on it. Absence is a **FINDING**, never a skip. | GT-03, PL-04 |

### 0.5 The two structural preconditions (read before scheduling)

An adversary who wanted a broken product to pass would not attack the tests — they would sit in the space between
them. Two whole classes of property are **definitionally unfalsifiable** in a single-org, single-endpoint,
single-user topology, and roughly a quarter of this plan cannot run without fixing that.

**PRE-A — Topology. [OWNER]** Before execution begins, provision:
1. **Org B** — a second production organisation with its own login. Without it, no isolation, attribution or
   cross-tenant test in this plan can exist (CN-08 … CN-13, OP-04, OP-05).
2. **A second enrolled endpoint** — a VM is fine. Without it, every "is this id the right id" and "does this receipt
   discriminate" test is NOT-PROVEN by construction (EN-05, PL-06, RS-08).
3. **A second Windows user account** on the primary machine, non-administrator. This is exactly where the
   machine-scope / one-shot-enroll defect lived that left Codex ungoverned. Without it, CX-06 … CX-09 cannot run.
4. **A non-admin console role** (viewer / read-only member) in Org A. Without it, no authorization test exists
   (CN-09, CN-10, OP-06).

If PRE-A is not satisfied, the affected tests are **BLOCKED with the missing item named** — never PASS.

**PRE-B — Negative controls are mandatory.** Almost no detector test is meaningful without proving the detector
**discriminates** rather than merely **fires**. A classifier that flags everything, a chain that always validates, a
receipt that always exists and a counter that never moves would all pass a plan without negative controls. Every
detection test below therefore runs a **paired benign trial** with the same shape and a harmless payload, and the
PASS requires the two to differ. Where the pairing is the point, it is called out explicitly.

### 0.6 Standing conventions — every test assumes these

**C1 — Clock discipline (two clocks, always).** At the start and end of every test record:
- endpoint: `Get-Date -Format o`, `[System.TimeZoneInfo]::Local.Id`, and `w32tm /query /status` offset;
- backend: the `Date` response header from a plain `HEAD` of the API health route.

Every "within N seconds" claim is measured against these. **A surface that renders time is a witness, never the clock.**

**C2 — Derive N, never invent it.** Before asserting any latency bound, read the agent's actual heartbeat / report
interval out of its own config or log (`%USERPROFILE%\.cera\cera.log`, the daemon log, `cera doctor`). Record it as
`N_hb`. "Within one heartbeat" means `N_hb + 30s`. **Never write a PASS against a bound you made up.**

**C3 — RUN_ID.** Each test gets `RUN_ID=<TESTID>-<yyyymmddHHMM>`. Working dir `C:\devoid-qa\<RUN_ID>\`. The RUN_ID
appears in file paths and repo names, which makes it a greppable correlator across all four surfaces at once.

**C4 — Time-box every query.** Record `T0` and `T1` (UTC, to the second) around every action. All SQL, CloudWatch and
console queries are bounded to `[T0-60s, T1+300s]`. **An unbounded query is how a row from last week fakes a pass.**

**C5 — Org pin.** Take `org_id` once from the session/bootstrap response. Every SQL predicate carries it. A query
without an org predicate proves nothing about a multi-tenant system.

**C6 — Network capture is mandatory.** DevTools → Network, filter `Fetch/XHR`, **Preserve log** on, open for the whole
console session. For every number you assert on, you must be able to name the request that produced it.
**A tile with no backing request is a defect in its own right (CN-13).**

**C7 — Payload hygiene.** Every attack-shaped or secret-shaped probe is **written to a file with an editor** and
referenced by path. Never typed on a shell command line. Our own tool-risk guard will (correctly) refuse the operator's
own shell, and you will misread that refusal as a test result. Where a payload must be assembled without any literal
attack string touching a shell argument, build it with Node/JSON `\uXXXX` escapes inside the file.

**C8 — Synthetic secrets only, and never record a value.** Use canary values with the right *shape* and no real
power: an `AKIA` prefix plus 16 uppercase alphanumerics; the published Luhn-valid test PAN `4111111111111111`; a
`ghp_`-shaped token of correct length. **Never a real credential.** In evidence record only *presence*, *length*,
*first 4 chars*, or a SHA-256 — never the value.

**C9 — Read-only against production** unless the test is tagged `[DESTRUCTIVE]`. **Never disable a control to make a
test pass.** If a control blocks you, that is data. Two tests deliberately degrade a component to measure a failure
mode; both are `[OWNER]`, time-boxed, and their result is never "pass because the control was off".

**C10 — Evidence naming.** `<TESTID>-<surface>-<utc>.<ext>`, surface ∈ `{console, agent, ecs, sql, cli, net, fp}`.
Every screenshot shows the **URL bar and a visible clock**. Every SQL result is saved **with the exact query text**
that produced it. Evidence root: `<LOCAL_EVIDENCE_ROOT>\<TESTID>\`.

**C11 — Four-surface triangulation.** Where a test says *triangulate*, the same fact is read from four places that
cannot lie in unison:
1. **console UI** (screenshot + the backing XHR response body),
2. **agent-side artifact** (`%USERPROFILE%\.cera\`, `C:\ProgramData\cera\`, `evidence\tamper.log`),
3. **CloudWatch `/ecs/backend`** filtered by endpoint id or request id, **never by free text**,
4. **production SQL**, read-only, in-VPC runner.

Two surfaces agreeing while a third is silent is **INCONCLUSIVE**, not PASS.

**C12 — The ledger discipline.** Where a test compares counts, write all four numbers down *before* judging:
`agent_emitted = backend_accepted = db_rows = console_displayed`. Any inequality **names the layer that ate the event**.

**C13 — Vacuity guard (the empty-array rule).** Before asserting that something is **absent** (plaintext not stored,
counter not moved, no cross-tenant row), you must first prove the container is **non-empty** for a positive case in the
same session. Asserting absence over an empty collection is the single most common false pass in this codebase's
history and it is banned here.

**C14 — Exclusive tenant.** Only one test runs against the tenant at a time. `ai_events` is a **per-org monotonic hash
chain** (`ux_ai_events_org_seq(org_id, seq_num)`); a background prober minting rows will corrupt every ordering
assertion its neighbours make. Any test that changes policy **restores the prior value** and records both states.

### 0.7 Execution order and dependencies

Ordered for **setup cost**, not tidiness. Do not reorder without checking the dependency column.

| Phase | Code | Surface centre of gravity | Depends on |
|---|---|---|---|
| 1 | **GT** | harness, schema, ground truth | — (run first, always) |
| 2 | **AQ** | download page, artifacts, S3, manifest | GT |
| 3 | **EN** | install, enroll, attestation, identity map | AQ |
| 4 | **CN** | console cold read, tenancy, authorization | EN |
| 5 | **PL** | policy authorship → bundle → receipt → canary | EN, CN |
| 6 | **CC** | Claude Code runtime governance | EN, PL |
| 7 | **CX** | **Codex** runtime governance | EN, PL, PRE-A.3 |
| 8 | **DL** | DLP, prompt evidence, privacy | CC (needs a live event) |
| 9 | **WB** | Web AI Guard, browser | EN |
| 10 | **SC** | packages, MCP, supply chain | CC |
| 11 | **AD** | adversarial / insider evasion | CC, CX, PL |
| 12 | **RS** | resilience, failure modes, offline | PL, CC |
| 13 | **OP** | backend jobs, scale, data hygiene, ops | CN |
| 14 | **UN** | uninstall and residue | everything (runs LAST on the primary box) |
| 15 | **UX** | responsive, accessibility, error surfaces | CN |

> **UN runs last.** It destroys the endpoint under test. If you need the endpoint afterwards, run UN on the secondary.

### 0.8 Tag legend

`[OPERATOR]` the operator can run it alone · `[OWNER]` needs the owner (purchase, account, second user, physical access,
elevated destructive action) · `[DESTRUCTIVE]` changes production state · `[READ-ONLY]` changes nothing.

---

# PHASE GT — GROUND TRUTH AND HARNESS (9 tests)

*Run first, in order. Everything downstream cites GT output. Nothing in this phase is optional; GT-03 in particular
determines whether half the plan is executable at all.*

---

### GT-01 — Pin the deployed versions of all three tiers from the tiers themselves `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Auditor establishing what is actually running before believing any claim about it.

**Prereqs.** Console login; AWS CLI; endpoint.

**Steps**
1. Backend: describe the running ECS task definition and record the **image tag actually running**, not the one in the
   pipeline. Record task-def revision, image digest, and `desiredCount`/`runningCount` for every service.
2. Frontend: load the console, and from the page source or a static asset path record the **build id**. Confirm the
   document was served fresh (HTTP 200, not 304 from disk cache) with an empty cache + hard reload.
3. Endpoint: `cera --version`; the on-disk file version of the CLI and daemon binaries; the ARP `DisplayVersion`
   registry value; and the version in the daemon's startup banner in its log.
4. Record all of these in `GT-01-versions.json`.

**PASS.** Backend image tag = `301`. Frontend build id corresponds to `358`. All four endpoint version readings agree
and equal `7.8.30`. Every ECS service under test has `runningCount ≥ 1`.

**FALSE-PASS.** (a) `cera --version` prints the version **compiled into the CLI binary**, not the version of the
**running daemon** — a half-upgraded box reads as fully upgraded. *Defeat:* read the version separately from the
daemon's `/health` response on `127.0.0.1:19280` and from the daemon log's startup banner, and require all of them to
match the CLI. (b) The console build id comes from a cached bundle. *Defeat:* hard-refresh with cache disabled and
confirm the network entry is 200. (c) A worker service is at `0/0` — historically **all ECS worker services sat at 0/0
since a power-off while images were "deployed"** — so features look shipped and nothing processes. *Defeat:* record
`runningCount` per service explicitly and fail this test if any service under test is 0.

**Evidence.** `GT-01-versions.json`, ECS describe output, console screenshot with build id visible, daemon `/health`
body, agent log banner.

---

### GT-02 — Prove the SQL runner reads the same database the API reads `[OPERATOR]` `[DESTRUCTIVE — creates one row]`

**Persona/angle.** Auditor who refuses to let two dead surfaces agree on zero.

**Why.** Every zero-count reconciliation in this plan is worthless until this passes. Two surfaces agreeing on `0` is
indistinguishable from two *disconnected* surfaces agreeing on `0`.

**Prereqs.** In-VPC read-only SQL runner; console login.

**Steps**
1. Through the product (not by SQL), create exactly one uniquely-named, low-value artifact in Org A — e.g. a policy
   exception request, or a site named `qa-gt02-<RUN_ID>`.
2. Note `T0`/`T1`.
3. From the SQL runner, find that row by its unique name, bounded by `created_at BETWEEN T0-60s AND T1+300s`.
4. Record the row's `org_id` and confirm it equals the `org_id` the console reports for your session.
5. Record the database endpoint host the runner is connected to and the DB host in the backend task definition's
   configuration source (name only, never the value).

**PASS.** The artifact created through the console is visible to the SQL runner within the window, in the same org.

**FALSE-PASS.** The runner is pointed at a replica with lag, or at a staging database that happens to have a
similarly-named row. *Defeat:* the artifact's name embeds `RUN_ID` and is therefore globally unique — a match cannot be
a coincidence. Additionally, poll the runner every 15s and record **time to visibility**; if it exceeds 60s you have a
replica-lag confound and every later "within N seconds" test must add that lag to its bound (record it as `N_lag`).

**Evidence.** The console action screenshot, the SQL result with query text, `N_lag`, the two host identifiers.

---

### GT-03 — Resolve the real schema; every table and column this plan names either exists or is a finding `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Auditor who has been burned by a plan written against a branch that never merged.

**Why.** The last-read application source contained **no** `ai_policy_applied_*` columns on `endpoint_control_state`,
**no** `ai_context_coverage` entity and **no** `ai_policy_bundle_application_receipt` entity. Either the deployed
`backend:301` has them and the checkout is stale, or the entire policy-proof chain is unbuilt. This test decides which.

**Steps**
1. Run, and save verbatim:
   ```sql
   SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema='public'
     AND table_name IN ('ai_sessions','ai_events','ai_context_coverage','ai_security_policy',
                        'ai_provider_policy','endpoint_control_state','endpoint_inventory',
                        'ai_policy_bundle_application_receipt','mcp_servers','agents','api_keys',
                        'audit_events','organizations','sites','users','ai_chain_marker')
   ORDER BY table_name, ordinal_position;
   ```
2. Separately list the tables in the above set that **do not appear** in the result.
3. Record the count of CHECK constraints: `SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='CHECK' AND table_schema='public';`
4. Record the migration ledger: total rows, distinct names, and whether `uq_migrations_name` exists.
5. Record every unique index on `ai_events` (expect `ux_ai_events_org_seq(org_id, seq_num)`).
6. Write `GT-03-schema.md` mapping **every table/column named anywhere in this document** to `PRESENT` / `ABSENT`.

**PASS.** The schema file is complete, and each of the following resolves to `PRESENT`: `endpoint_control_state`
columns `ai_policy_applied_revision`, `ai_policy_applied_digest`, `ai_policy_applied_signing_key_id`,
`ai_policy_applied_at`; tables `ai_policy_bundle_application_receipt` and `ai_context_coverage`. CHECK constraint count
= 298. Migration ledger = 218 rows / 218 distinct with `uq_migrations_name` present.

**FALSE-PASS.** (a) The operator finds a table missing and marks the dependent tests "skip". **A missing table is a
FAIL of GT-03 and a named BLOCKER for its dependents — never a skip.** (b) The columns exist but are 100% NULL across
all rows, so later tests "confirm the column exists" and stop. *Defeat:* for each `ai_policy_applied_*` column also
record `count(*) FILTER (WHERE col IS NOT NULL)` right now, so PL-04 has a genuine before-value. (c) The CHECK count
matches by coincidence across a different constraint mix. *Defeat:* also save the full constraint name list, not just
the count.

**Evidence.** `GT-03-schema.md`, all raw query outputs with query text, the ABSENT list.

---

### GT-04 — Establish the API route map from the running API, not from documentation `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Tester who will otherwise spend a day proving that a 404 is a bug.

**Steps**
1. From the console with DevTools open, walk every route in the sidebar once and capture the **full set of upstream API
   paths** the frontend proxies to. Save as `GT-04-routes.json`.
2. Confirm the global prefix by direct call: `GET https://api.cera.buzz/api/v1/ai/overview` (authenticated). If it 404s,
   retry without `/api`. **Record which one is real.** A mismatch between the console's fetch path and the documented
   path is itself a finding.
3. Specifically resolve and record the real paths for: AI overview, AI sessions, AI events/activity, agent posture,
   security policy, provider policy, MCP servers, exception requests, endpoint inventory, endpoint groups, rollout
   readiness, installer install-contract, installer download, `health/release-manifest`, audit, and **the deny-canary
   route** (the brief names `GET /v1/ai/canary` with an `everRun` field).
4. For each, record HTTP status and whether it required auth.

**PASS.** Every route in step 3 resolves to a real, authenticated endpoint and its path is written down.

**FALSE-PASS.** The canary route 404s and the operator writes "n/a". **A 404 on the canary route is a FAIL of GT-04 and
the named blocker for PL-11 … PL-14** — it means the deny-canary is not deployed at all, which is precisely one of the
known-open items. *Defeat:* explicitly assert the canary route's status code and record it in the results table.

**Evidence.** `GT-04-routes.json`, raw status codes, the canary route's literal response body.

---

### GT-05 — Endpoint ground-truth manifest `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Before measuring friction or enforcement you must know exactly what is installed, or every later test
is an assumption test.

**Steps**
1. As the normal (non-elevated) user record: resolved absolute paths of `cera.exe`, `ceragond.exe`,
   `ceragon-evidence-writer.exe`; SHA-256 of each; the Windows service names, states, and the **account each runs as**.
2. Record the daemon port from the machine config (record the **port**, never the token). Confirm the daemon answers on
   `http://127.0.0.1:<port>/health` (default `19280`).
3. Capture the **file bytes and SHA-256** of every vendor config Claude Code and Codex merge:
   `%USERPROFILE%\.claude\settings.json`, `%USERPROFILE%\.claude\settings.local.json`, the project-scope
   `.claude/settings.json` and `.claude/settings.local.json` in the repo you will work in, any enterprise/managed policy
   path, `%USERPROFILE%\.codex\config.toml`, and `C:\ProgramData\OpenAI\Codex\requirements.toml` if present.
4. Record the exact installed Claude Code version and the exact installed **Codex version including patch**.
5. Run `cera ai hooks-status claude-code` and `cera ai hooks-status codex`; record **stdout and the exit code
   separately**.
6. `cera doctor` and `cera telemetry`; save both.

**PASS.** All artifacts captured; `hooks-status` exits 0 for both runtimes and reports every event as installed; every
hook command string names an executable that `Test-Path` confirms exists.

**FALSE-PASS.** `hooks-status` reads only the **user-scope** settings file and reports green while the **project-scope**
file — which Claude Code merges and which can override — is empty or contains a stale path to a deleted binary. This is
exactly the "five orphaned hooks pointing at a deleted binary" defect class. *Defeat:* enumerate **every** settings file
the runtime merges (user, user-local, project, project-local, managed/enterprise) and `Test-Path` the executable named
in each hook command string. Second defeat: assert the **exit code independently of the stdout text** — a build that
prints green and exits 1, or prints green having read zero files, is caught only here.

**Evidence.** `GT-05-manifest.json` (paths, hashes, versions, service accounts, exit codes), all config file copies,
`hooks-status` stdout + exit codes, `cera doctor` output.

---

### GT-06 — Virgin fingerprint: the control for every "leaves nothing" claim `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** IT admin. You cannot prove an uninstaller left nothing unless you know what was there before. Every
prior "clean uninstall" claim in this programme was unfalsifiable because nobody took the before-picture.

**Steps**
1. Hand-author two decoy markers that must survive the entire lifecycle: a harmless top-level key
   `"qaMarkerGT06": "<uuid>"` in `~/.claude/settings.json`, and a comment line `# qa-marker-GT06 <uuid>` in
   `~/.codex/config.toml`. Record both uuids in `fp-markers.txt`.
2. Author `C:\devoid-qa\fingerprint.ps1`, invoked as `.\fingerprint.ps1 -Out <path>`, capturing at minimum:
   - recursive listing + SHA-256 of `C:\ProgramData\cera`, `C:\ProgramData\devoid`, `C:\Program Files\<vendor dirs>`,
     `C:\ProgramData\OpenAI\Codex`, `%USERPROFILE%\.claude`, `%USERPROFILE%\.codex`, `%USERPROFILE%\.cera`,
     `%LOCALAPPDATA%\devoid`, `%APPDATA%\devoid`;
   - services matching the vendor names, with account and start type;
   - `schtasks /query /fo csv /v` **unfiltered** (filtering is how an orphan hides);
   - HKLM and HKCU `Path` values verbatim, plus `$env:Path` split one entry per line;
   - registry exports: vendor software key; ARP uninstall key (names only); services key (names only);
   - full text of every vendor AI config from GT-05;
   - `Get-ChildItem -Recurse -Force` for `*.devoid*.bak` and `*.cera*.bak` under `%USERPROFILE%` and `C:\ProgramData`;
   - `Get-Acl` in SDDL form for the vendor ProgramData root, its `bin`, its `config`, and the machine-secret file;
   - **both** `Win32_Product` matches **and** the ARP registry keys — WMI alone misses Burn bundles.
3. Run it: `fp-00-baseline.json`.

**PASS.** The fingerprint exists, covers every path, and every enumerated path that does not exist emits an explicit
`"__ABSENT__"` sentinel.

**FALSE-PASS.** The script **silently skips** a path that does not exist yet — e.g. `C:\ProgramData\OpenAI\Codex` on a
box where Codex is user-scope only — so a directory that later appears looks like it was always there and gets excused
at uninstall time. *Defeat:* the `__ABSENT__` sentinel is mandatory; grep `fp-00` for it and list every absent path in
the evidence README.

**Evidence.** `fp-00-baseline.json`, `fp-markers.txt`, the absent-path list, `fingerprint.ps1` itself.

---

### GT-07 — Prove the agent's verbose/diagnostic logging actually emits before relying on its silence `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Several later tests interpret "no log line" as "the hook did not fire". That inference is only valid
if the log *would* have spoken.

**Steps**
1. Identify the agent's log controls (`CERA_LOG_FILE`, `CERA_LOG_FORMAT=json`, `CERA_LOG_LEVEL`) and the default log
   path (`%USERPROFILE%\.cera\cera.log`).
2. Raise verbosity for the QA session (**a logging change, not a control change**). Record the before/after setting.
3. Perform an action known to be governed and known to be **allowed** — e.g. a trivially benign read tool call in Claude
   Code — and confirm the log emits an **invocation** line even though the hook's stdout is empty (allow = empty stdout).
4. Count invocation lines vs actions performed.

**PASS.** Verbose logging emits one invocation line per hook invocation, including for allow decisions with empty stdout.

**FALSE-PASS.** The verbose flag logs only *decisions that produced output*, so allow-path invocations are invisible and
every later "the hook did not fire" conclusion is unfounded. *Defeat:* this test IS the defeat — if the invocation line
does not appear for a known-firing allow, then **CC-01's and CX-01's invocation-count method is invalid** and must be
replaced by process-level evidence (e.g. process-creation auditing on the hook binary). Record which method is in force.

**Evidence.** Before/after log settings, the log excerpt showing an allow-path invocation, the invocation count.

---

### GT-08 — Establish the closed vocabulary of risk classes and DLP classes `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Auditor preventing a typo'd or invented class from rendering as a plausible chip and passing.

**Steps**
1. From the shipped agent binary or its published rulebook, enumerate the **closed set** of tool-risk class slugs. The
   set observed in source includes at least: `destructive-rm`, `destructive-dd`, `destructive-mkfs`,
   `destructive-devwrite`, `fork-bomb`, `chmod-broad-777`, `pipe-to-shell`, `base64-pipe-shell`, `data-exfil`,
   `cera-self-disable`, `firewall-disable`, `history-wipe`, `sudoers-edit`, `authorized-keys-write`,
   `docker-socket-abuse`, `docker-cp-host`, `cloud-cred-read`, `git-history-destroy`, `privilege-escalation`,
   `dynamic-eval`, `untrusted-network-install`, `generic-pipe-shell`, `action-git-push`, `action-git-commit`,
   `action-pr-create`, `sensitive-write-sudoers`, `sensitive-write-authkeys`, `sensitive-write-shellrc`,
   `sensitive-write-shell-hooks`, `sensitive-write-git-hooks`, `sensitive-write-cera`, `content-reverse-shell`,
   `content-pipe-shell`, `content-spawn-shell`.
2. Enumerate the DLP class set: at least `aws-access-key`, `aws-secret-key`, `gcp-key`, `github-token`, `slack-token`,
   `openai-key`, `private-key`, `payment-card`, `high-entropy`, `generic-api-key`.
3. Record the brief's claimed classes `interpreter-exec`, `fetch-then-exec`, `powershell-download-exec` and mark each
   PRESENT or ABSENT against the shipped binary.
4. Save as `GT-08-vocabulary.md`.

**PASS.** The vocabulary is written down, and each class named in this plan is marked PRESENT or ABSENT.

**FALSE-PASS.** The operator later sees a chip in the console reading a class name and accepts it because it "looks
right". *Defeat:* every detection test in this plan asserts **membership in this closed set**. A class outside the set
is a FAIL of that test (either the console invented it or the binary emits something undocumented) — both are findings.
Note explicitly: `high-entropy` has a built-in default of MONITOR/allow, so a `high-entropy`-only hit is **not**
evidence of blocking.

**Evidence.** `GT-08-vocabulary.md` and its provenance (which binary / rulebook it was read from).

---

### GT-09 — Baseline every counter this plan will later claim moved `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Auditor closing the "a counter that never moves passes every unchanged-counter test" hole.

**Steps**
1. For Org A record, with query text, the current values of: `count(*)` of `ai_events` (total and by `event_type`),
   `ai_sessions`, `mcp_servers`, exception requests, `audit_events`, endpoints, and each `ai_policy_applied_*`
   non-NULL count from GT-03.
2. Record the console's own headline numbers on the landing route and the AI Control Plane route, each paired with the
   XHR that produced it.
3. Record `max(seq_num)` for Org A in `ai_events` — this is the chain watermark every later ordering test starts from.
4. Save as `GT-09-baseline.json`.

**PASS.** Baseline captured for every counter, with `max(seq_num)` recorded.

**FALSE-PASS.** The baseline is taken **after** some other test has already run and minted rows, so an attribution later
in the plan credits the wrong action. *Defeat:* GT-09 runs before any test that creates anything, and the baseline file
is timestamped and never regenerated. Any later re-baselining is a **new file**, never an overwrite.

**Evidence.** `GT-09-baseline.json` with all query text; console screenshots with XHR bodies.

---

# PHASE AQ — ACQUISITION, ARTIFACTS AND THE RELEASE CHAIN (11 tests)

*Persona: a security buyer who is about to run an EXE that Windows will call untrusted, and whose entire purchasing
thesis is that we are careful.*

---

### AQ-01 — The download page tells the truth about an unsigned binary and gives an out-of-band way to verify it `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** GT-01, GT-04.

**Steps**
1. Log into the console; open `/admin/install`. Capture the full page. Enumerate every artifact offered (deployment
   script, MSI, EXE, Linux packages).
2. Read the troubleshooting section **verbatim**. Record whether any entry describes the "unknown publisher" /
   SmartScreen / "Windows protected your PC" warning and what to do about it.
3. Record whether the page publishes a **SHA-256** for each artifact and the **version** each artifact contains.
4. Download the EXE and MSI through the console's own links. Do not run them.
5. `Get-FileHash -Algorithm SHA256` each; `Get-AuthenticodeSignature <file> | Format-List Status, SignerCertificate, StatusMessage`.

**PASS.** The console publishes a digest per artifact that **matches** `Get-FileHash`; it names the version each
artifact contains; and the troubleshooting text warns the user **in advance** that the binary is unsigned and describes
the warning they will see. `NotSigned` is expected and is not itself the failure — the failure is asking a user to run
an unsigned binary with no published verification path and no forewarning.

**FALSE-PASS.** (a) The page shows a hash that is **hardcoded or templated** rather than derived from the object
currently in S3. *Defeat:* compare the published digest against **both** `Get-FileHash` of the actual download **and**
the digest in the release manifest (AQ-03) — matching the file but not the manifest means the manifest is stale;
matching neither means the hash is decorative. (b) The operator counts "Run as Administrator" as covering SmartScreen —
it does not; require literal text describing the publisher warning.

**Evidence.** Full-page screenshot, both `Get-FileHash` outputs, `Get-AuthenticodeSignature` output, verbatim quote of
the troubleshooting entries.

---

### AQ-02 — Verify the artifact customers actually get, not the one the console proxies `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** At scale, customers run `install.ps1`, which pulls **static S3 objects**. The console's
`/api/v1/installer/download/<file>` proxy can diverge from those objects; historically the install scripts are three
separate static S3 keys maintained by hand.

**Prereqs.** AQ-01.

**Steps**
1. Fetch `install.ps1` at the exact URL the documentation and the console instruct customers to use.
2. Read it and extract **every** URL it will fetch: agent artifact, checksum file, contract endpoint.
3. Download the artifact at *that* URL (not through the console proxy) and `Get-FileHash` it.
4. `HEAD` each S3 object and record `LastModified`, `ETag`, `Content-Length`.
5. Compare: console-proxied artifact hash vs static-S3 artifact hash vs published digest vs manifest digest.
6. Repeat for the Linux `install.sh` keys.

**PASS.** All four hashes agree, and every S3 object's `LastModified` is at or after the 7.8.30 release time.

**FALSE-PASS.** The console proxy serves the new build while the static S3 key still serves the previous one, so a
console-only check passes while every real customer installs the old agent. *Defeat:* this test's whole point — hash
the static key independently. Second: an object whose `LastModified` predates the 7.8.30 release is a stale key even if
its hash "matches" a stale manifest.

**Evidence.** `install.ps1` source, extracted URL list, all hashes side by side, S3 `HEAD` metadata for every key.

---

### AQ-03 — The release manifest is loaded, and it is *this* release's manifest `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The release-manifest producer has **never run in any release** because its CI job called a repo
script without checking out the repo. "It now emits" is a claim to be measured.

**Prereqs.** GT-04.

**Steps**
1. `GET https://api.cera.buzz/health/release-manifest`. Record the **literal** value of `manifestLoaded` and the full
   body.
2. `GET https://api.cera.buzz/api/v1/installer/install-contract`. Record the full body.
3. If the manifest names a source object, `HEAD` it and record `LastModified`.
4. Compare the manifest's version/digest content against the artifacts hashed in AQ-01/AQ-02.

**PASS.** `manifestLoaded` is literally `true`, the manifest's `LastModified` is at or after the 7.8.30 release time,
and its contents cover 7.8.30 with digests that match the artifacts.

**FALSE-PASS.** Three shapes, all real. (a) HTTP 200 with `manifestLoaded:false` recorded as "endpoint healthy" —
**200 is not the assertion; `manifestLoaded` is.** (b) `manifestLoaded:true` for a manifest generated during an older
release (e.g. 7.8.14): the endpoint is green, the producer still never ran for this release. *Defeat:* the
`LastModified` + version-coverage check in step 3/4. (c) The job ran, **failed soft**, and left the previous manifest in
place. *Defeat:* AQ-04.

**Evidence.** Raw JSON of both endpoints, S3 `HEAD` output, the comparison table.

---

### AQ-04 — The manifest producer job actually executed in the 7.8.30 workflow run `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Release engineer. The original defect was "the job ran but had no repo checked out"; a job that runs,
fails soft, and leaves last release's artifact in place is invisible from the API side.

**Prereqs.** AQ-03.

**Steps**
1. Identify the workflow run that produced 7.8.30.
2. List its **jobs and steps** and locate the release-manifest producer step.
3. Record: did the step run; its conclusion; whether a repo checkout step preceded it in the same job; and whether the
   step's log shows it read real repo files (non-zero input) rather than an empty directory.
4. Record whether the job's failure would have failed the run, or is `continue-on-error` / conditioned away.

**PASS.** The step executed in the 7.8.30 run, in a job with a preceding checkout, read non-zero input, concluded
success, and a failure of that step would fail the run.

**FALSE-PASS.** The step shows "success" because it produced an empty manifest without erroring. *Defeat:* require
positive evidence in the step log that it enumerated ≥1 artifact, and cross-check that the emitted digest equals the
artifact digest from AQ-02.

**Evidence.** Workflow run job/step listing, the producer step's log, the `continue-on-error` determination.

---

### AQ-05 — The install script's integrity checking is real, not decorative `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** AQ-02.

**Steps**
1. Read `install.ps1` and determine, by reading the code: does it verify a checksum or signature before executing the
   downloaded artifact? Where does the expected value come from — a file it downloaded from the same origin, or a value
   pinned in the script / fetched from an independent contract endpoint?
2. Determine what the script does on mismatch: abort, warn, or continue.
3. Record whether the script pins TLS/host, and whether it would follow a redirect to another host.

**PASS.** The script verifies integrity against a value that does **not** come from the same mutable object as the
artifact, and aborts on mismatch.

**FALSE-PASS.** The script downloads `artifact` and `artifact.sha256` from the same bucket path and compares them — an
attacker (or a botched release) who can change one can change both, so the check always passes and proves nothing.
*Defeat:* trace the provenance of the expected digest explicitly; if it is same-origin and mutable, that is a FAIL with
a named finding, regardless of the code "having a check".

**Evidence.** Annotated `install.ps1` excerpt showing the provenance of the expected digest and the mismatch branch.

---

### AQ-06 — Anti-rollback floor: an older agent cannot be installed over 7.8.30 `[OWNER]` `[DESTRUCTIVE]`

**Prereqs.** EN-01 (7.8.30 installed). Run on the **secondary** endpoint.

**Steps**
1. Obtain the immediately-previous agent artifact by its published URL.
2. Attempt to install it over 7.8.30, as the owner, from the owner's own elevated terminal.
3. Record the exact outcome: refused with a message, refused silently, or succeeded.
4. Re-read the version four ways (GT-01 method) and the console's endpoint detail.
5. Query the endpoint's row in SQL for version and trust state.

**PASS.** The downgrade is refused with an explicit, user-legible message naming the anti-rollback floor; the endpoint
remains at 7.8.30 by all four readings; the console and DB still show 7.8.30.

**FALSE-PASS.** (a) The install "fails" for an unrelated reason (a file lock, a missing prerequisite) and the operator
credits the anti-rollback floor. *Defeat:* require the refusal message to explicitly name version/rollback; an
unexplained failure is INCONCLUSIVE. (b) The downgrade succeeds on disk but the console still shows 7.8.30 because it
renders the **latest available** version rather than the installed one — see AQ-07.

**Evidence.** Installer transcript, the four version readings, console screenshot, SQL row.

---

### AQ-07 — The console shows the version that is INSTALLED, not the version that is AVAILABLE `[OWNER]` `[READ-ONLY]`

**Persona/angle.** Fleet admin who will make upgrade decisions from this column.

**Prereqs.** A second endpoint deliberately held at an **older** agent build (PRE-A.2).

**Steps**
1. Confirm by four readings on the secondary box that it is on the older version.
2. Open the console's endpoint list and endpoint detail for that machine. Record the version shown.
3. Record the XHR that produced it and the field name in the response body.
4. Query SQL for that endpoint's stored `agent_version`.

**PASS.** The console shows the **older** number for the older box and 7.8.30 for the primary, and the DB agrees with
each.

**FALSE-PASS.** With only one endpoint, all on the same version, this property is **unfalsifiable** — the console could
be printing a constant and pass. *Defeat:* this test requires two endpoints on different versions. If PRE-A.2 is not
satisfied, verdict is **BLOCKED: no second endpoint on a differing version** — never PASS.

**Evidence.** Both endpoints' four-way version readings, both console rows, both SQL rows, the XHR body.

---

### AQ-08 — Upgrade prior → 7.8.30 with zero enforcement gap `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** IT admin. A fleet-wide upgrade brick has happened here before and froze every installed customer. The
question is not only "does it end up at 7.8.30" but "was the machine ever unguarded during the swap, and did the console
ever lie about it."

**Prereqs.** Secondary endpoint on the prior version; GT-06 fingerprint of it; CC-02 known-denied probe defined.

**Steps**
1. Prepare a probe file containing a command shape the policy **denies** (per C7, written by an editor, referenced by
   path).
2. In terminal A start a prober that every 5 seconds drives the probe **through the real runtime path** (a Claude Code
   action that triggers `PreToolUse`), appending `<utc>,<decision>,<decisionId>` to `enforcement-timeline.csv`. Confirm
   it is producing DENY rows **before** starting the upgrade.
3. Upgrade the secondary box to 7.8.30.
4. Let the prober run for 5 minutes after the upgrade completes, then stop it.
5. Inspect `enforcement-timeline.csv` for any window with no DENY, or with an ALLOW.
6. Triangulate the same window against the console's endpoint health timeline, the agent log, and SQL heartbeats.

**PASS.** Every probe in the timeline is DENY, before, during and after; **or** there is a gap and the console shows
that same gap as degraded. The endpoint reaches 7.8.30 by four readings.

**FALSE-PASS.** (a) The prober itself dies when the service restarts and its silence is read as "no gap". *Defeat:* the
prober writes a heartbeat row every cycle regardless of decision, so its own absence is visible as missing rows, not as
absent denials. (b) The console shows unbroken green because it renders **current** state, not history. *Defeat:* the
SQL heartbeat timestamps must show the gap even if the UI smooths it; a UI that cannot show a real gap is a finding
recorded here and re-tested in RS-02. (c) The upgrade succeeds but the daemon is left at the old version — *defeat* with
the four-way version read from GT-01.

**Evidence.** `enforcement-timeline.csv`, both clocks, console health screenshots at three points, agent log, SQL
heartbeats across the window, post-upgrade fingerprint.

---

### AQ-09 — Upgrade preserves user content and enrollment `[OWNER]` `[READ-ONLY after AQ-08]`

**Prereqs.** AQ-08 complete; GT-06 markers present on the secondary.

**Steps**
1. Re-run `fingerprint.ps1` → `fp-01-post-upgrade.json`.
2. Diff against the pre-upgrade fingerprint. Classify every change as expected (binaries, version strings) or
   unexpected.
3. Confirm the two decoy markers (`qaMarkerGT06`, `qa-marker-GT06`) are still present **verbatim** in the vendor configs.
4. Confirm the endpoint did **not** re-enroll as a new identity: the endpoint id / agent id in SQL is unchanged.
5. Confirm no `.devoid.bak` / `.cera.bak` litter was created.

**PASS.** Markers intact; identity unchanged; only expected artifacts changed; no backup litter.

**FALSE-PASS.** The upgrade rewrote the vendor config wholesale but happened to reproduce the marker because the marker
was in a section it copies. *Defeat:* also compare the **file SHA-256** and diff the full text; assert the user's other
original keys survived too, not just the marker.

**Evidence.** Both fingerprints, the classified diff, the config diffs, the SQL identity rows.

---

### AQ-10 — Deployment script path: the console's copy-paste install actually works and is scoped correctly `[OWNER]` `[DESTRUCTIVE]`

**Steps**
1. On a clean secondary, copy the deployment script exactly as the console presents it.
2. Record whether the command line contains an enrollment secret in plaintext, and whether the console warns about
   handling it.
3. Run it from the owner's own elevated terminal.
4. Record whether it installs **machine-scope** or **user-scope**, and which account the resulting service runs as.
5. Confirm the resulting install enrolls to the correct org and site.

**PASS.** The script installs, enrolls to the right org/site, and the console documents the scope it installs at.

**FALSE-PASS.** The script installs machine-scope and enrolls **once**, for the invoking user only — which is exactly
the shape of the defect that left Codex ungoverned for every other user on the box. *Defeat:* do not judge this test
until CX-06 has run under the second Windows user account. Record here which scope was used so CX-06 can interpret its
result.

**Evidence.** The script text (secret redacted to first 4 chars), install transcript, service account, org/site
assignment in console and SQL.

---

### AQ-11 — Error bodies carry `errorCode`, and it is stable and specific `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** An integrator writing retry logic against our API.

**Steps**
1. Provoke, without harming production: an unauthenticated call to an authenticated route; a call with a malformed
   body to a POST route; a call to a non-existent id; a call to a non-existent path.
2. For each, record HTTP status, the full body, and the `errorCode` value.
3. Repeat each provocation twice and confirm `errorCode` is identical both times.
4. Confirm no error body leaks a stack trace, a SQL fragment, an internal host name, or another org's identifier.

**PASS.** Every error body carries a non-empty `errorCode`; codes differ across the four distinct failure kinds; codes
are stable across repeats; no internal detail leaks.

**FALSE-PASS.** All four failures return the same generic code (e.g. `INTERNAL_ERROR`), which is present and therefore
"passes" a presence check while carrying zero information. *Defeat:* the PASS requires the four codes to be **distinct**
and to correspond to the failure kind.

**Evidence.** All eight raw responses with status codes and bodies.

---

# PHASE EN — INSTALL, ENROLL, TRUST AND THE IDENTITY MAP (9 tests)

*Nothing downstream is interpretable without a correct identity map. Known-open K1 lives here: `ai_context_coverage.endpoint_id` historically stored the **API-KEY id** via `agentId ?? apiKeyId`.*

---

### EN-01 — Fresh install on the primary endpoint, observed end to end `[OWNER]` `[DESTRUCTIVE]`

**Prereqs.** GT-05, GT-06, AQ-01, AQ-02.

**Steps**
1. Record `T0`, both clocks.
2. Run the installer from the owner's own elevated terminal. Capture the full transcript including the SmartScreen
   interaction (screenshot the warning — it is expected).
3. Record every prompt the installer showed and every default it chose.
4. On completion, re-run `fingerprint.ps1` → `fp-02-post-install.json` and diff against `fp-00-baseline.json`.
5. Record the service state, the account each service runs as, and the daemon's `/health` response.

**PASS.** Install completes; the diff against baseline contains only artifacts the product is supposed to create;
services run under the intended account; the daemon answers `/health` on loopback.

**FALSE-PASS.** The installer reports success while a component (daemon, evidence writer, browser guard) failed to
register — "installed" is a claim about MSI transaction state, not about running software. *Defeat:* assert **each**
service is Running **and** the daemon answers on loopback, and that the fingerprint diff contains all expected
binaries, not merely a nonzero diff.

**Evidence.** Installer transcript, SmartScreen screenshot, `fp-02`, the classified diff, service states, `/health` body.

---

### EN-02 — Enrollment binds the machine to the right org and site, and the console notices `[OWNER]` `[DESTRUCTIVE]`

**Prereqs.** EN-01.

**Steps**
1. Record `T0`. Enroll per the documented flow.
2. Within `N_hb + 30s` (C2), refresh `/endpoints` and `/admin/endpoints`.
3. Capture the endpoint row and the XHR that produced it.
4. SQL: the rows in `agents` and `endpoint_control_state` for this hostname.
5. CloudWatch `/ecs/backend`: the enrollment request, filtered by endpoint id — never by free text.

**PASS.** Four-surface agreement on hostname, org, site, agent version, first-seen time; the endpoint is visible in the
console within `N_hb + 30s + N_lag`.

**FALSE-PASS.** The console shows the endpoint because a **previous** enrollment of the same hostname already existed,
so a failed enrollment renders identically to a successful one. *Defeat:* before enrolling, confirm zero rows for this
hostname (from the GT-09 baseline); after enrolling, confirm the row's `created_at` falls inside `[T0, T1+300s]` rather
than being older.

**Evidence.** Console screenshot + XHR body, both SQL rows with `created_at`, CloudWatch excerpt, both clocks.

---

### EN-03 — Trust attestation reaches `V2_ATTESTED` and the console says so honestly `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The programme previously had endpoints stuck at `V1_DEGRADED` so that **no signed bundle was ever
activated in the field**, while surfaces looked plausible.

**Prereqs.** EN-02.

**Steps**
1. SQL: `endpoint_control_state` for this agent — `enforcement_tier`, `evidence_intact`, `last_attested_at`.
2. Console: the endpoint detail trust/posture indicator, and the XHR field that drives it.
3. Agent: `cera doctor` trust section and the daemon log's attestation lines.
4. Confirm `last_attested_at` is recent against both clocks, not a stale value from a prior install.

**PASS.** All three surfaces report the attested tier (exact string recorded in GT-08), `evidence_intact` is true, and
`last_attested_at` is within one attestation interval of now.

**FALSE-PASS.** (a) The console renders a green trust badge from the mere **presence** of a row rather than from the
tier value, so a degraded endpoint shows green. *Defeat:* read the XHR body and confirm the badge's value is the tier
string itself, and separately confirm the DB tier string matches. (b) `last_attested_at` is populated but frozen.
*Defeat:* re-read it 15 minutes later and confirm it advanced.

**Evidence.** SQL row twice, 15 minutes apart; console screenshot + XHR; `cera doctor`; daemon log lines.

---

### EN-04 — Heartbeat is real, periodic, and its absence would be visible `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** EN-03; `N_hb` derived (C2).

**Steps**
1. Record the last three heartbeat timestamps from SQL and from the agent log.
2. Compute the intervals; compare against `N_hb`.
3. Compare the DB timestamp against the agent's own timestamp for the **same** heartbeat; record the skew.
4. Confirm the console's "last seen" tracks the newest DB heartbeat, not the page-load time.

**PASS.** Intervals within tolerance of `N_hb`; DB↔agent skew explained by the C1 clock offsets; console "last seen"
equals the DB value.

**FALSE-PASS.** The console renders "last seen: a few seconds ago" computed from **now** whenever any row exists.
*Defeat:* read the raw timestamp out of the XHR body rather than the humanised string, and confirm it equals the DB
value. A humanised string with no underlying timestamp in the payload is itself a finding.

**Evidence.** Three heartbeat timestamps from both sources, the interval table, the XHR body, console screenshot.

---

### EN-05 — The identity map: five identifiers, all distinct, all correctly bound `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Auditor establishing chain of custody. Known-open K1 lives here.

**Prereqs.** EN-02; ideally PRE-A.2 (second endpoint) and a second API key.

**Steps**
1. From the console session/bootstrap response record `org_id`.
2. On the endpoint: `cera doctor` / `cera telemetry` — agent version, hostname, machine/endpoint id, enrollment state,
   backend URL, and **which** credentials file is in use (machine vs user). Read the machine credentials file
   **metadata only** — key names and the API base URL. Never a token value.
3. SQL, one row each: `agents` by hostname; `endpoint_control_state` by hostname; `api_keys` for the org;
   `endpoint_inventory` for the org.
4. Build the identity table: `org_id`, `agent_id`, `endpoint_id`, `api_key_id`, `hostname`, `hostname_hash`, agent
   version, console-displayed endpoint name.
5. Assert as **values**: `endpoint_id != api_key_id`, `agent_id != api_key_id`, `agent_id != endpoint_id`.

**PASS.** Console name, `agents.hostname`, `endpoint_control_state.hostname` and the machine's real hostname are the
same string; the three ids are pairwise distinct; every version reading is 7.8.30.

**FALSE-PASS.** Everything matches **because there is exactly one endpoint and one API key**, so any id collides with
the right answer by luck. *Defeat:* if the org has fewer than two endpoints or fewer than two keys, the id-confusion
defect is undetectable in this tenant — record **NOT-PROVEN** and name the missing precondition. With PRE-A.2 satisfied,
assert the second machine's ids are pairwise distinct **and** disjoint from the first machine's.

**Evidence.** `identity.md` table, `cera doctor` output, the four SQL result sets, console screenshot with XHR body.

---

### EN-06 — `ai_context_coverage.endpoint_id` holds an ENDPOINT id, not an API-KEY id `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Directly hunting known-open K1.

**Prereqs.** GT-03 confirmed the table exists; EN-05 identity table; at least one AI session — run after CC-01 if the
table is empty.

**Steps**
1. `SELECT DISTINCT endpoint_id FROM ai_context_coverage WHERE org_id=:org;`
2. For each distinct value test membership: is it in `endpoint_control_state.endpoint_id`? in `agents.id`? in
   `api_keys.id`?
3. Classify every value into exactly one of: endpoint id / agent id / api-key id / unknown.
4. Repeat the same classification for `ai_events.endpoint_id` and `ai_sessions.endpoint_id`.

**PASS.** Every value classifies as an endpoint id (or whatever the documented intended id type is, recorded in GT-03),
and none classifies as an API-key id.

**FALSE-PASS.** (a) The table is empty, so "no api-key ids found" is vacuously true — the C13 vacuity guard. *Defeat:*
require at least one row produced inside this run's window before judging; an empty table is
**BLOCKED: no coverage rows**. (b) In a one-key, one-endpoint tenant the id spaces may not overlap in a discriminating
way. *Defeat:* the membership test is by exact value against three different tables, which discriminates regardless of
count — but record explicitly how many candidate ids existed.

**Evidence.** Query text and results, the classification table, the row count inside the window.

---

### EN-07 — The machine secret is not readable by `BUILTIN\Users` `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** A non-admin user on a shared box.

**Prereqs.** EN-01; PRE-A.3 strongly preferred.

**Steps**
1. `Get-Acl` in SDDL form for the machine secret file, the daemon token, the vendor ProgramData root, its `bin` and its
   `config`. Record every SDDL string verbatim.
2. Enumerate the principals granted read on the secret. Confirm `BUILTIN\Users`, `Everyone`, `Authenticated Users` and
   `INTERACTIVE` are absent.
3. **Empirically**, logged in as the second non-admin account, attempt to read the secret file. Record the exact error.
4. Confirm inherited ACEs from the parent directory do not re-grant read.

**PASS.** SDDL grants read only to SYSTEM/Administrators (or the documented service principal), **and** the empirical
read as a non-admin fails with access denied.

**FALSE-PASS.** The SDDL looks correct but an **inherited** ACE or the parent directory still permits read; or the
secret is protected while the daemon token beside it is not. *Defeat:* the empirical read in step 3 is mandatory — an
SDDL-only check is INCONCLUSIVE. Second defeat: test **every** file in the state directory, not only the one named in
the changelog. If PRE-A.3 is unmet: **BLOCKED: no second Windows account**.

**Evidence.** All SDDL strings, the empirical read transcript and error, the list of files tested.

---

### EN-08 — Re-install over an existing install does not brick the trust anchor `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** A previously-measured defect: a reinstall permanently bricked the trust anchor with a 409 forever.

**Prereqs.** Run on the **secondary** endpoint. Owner approval. Credentials backed up by **copy**, never move.

**Steps**
1. Record identity (EN-05 method) and trust state for the secondary.
2. Re-run the installer over the existing install.
3. Watch the agent log and CloudWatch for enrollment/attestation calls. Record any HTTP 409 and its `errorCode`.
4. After `N_hb + 60s`, re-read trust state from SQL, console and `cera doctor`.
5. Confirm the identity is preserved or cleanly re-issued, and that the console shows **exactly one** endpoint for this
   machine.

**PASS.** Trust returns to attested; no permanent 409 loop; exactly one endpoint row for the machine; no duplicate or
orphaned ghost in the console.

**FALSE-PASS.** The endpoint appears healthy because a **new** identity enrolled successfully while the old one is
orphaned and still counted in fleet totals. *Defeat:* count endpoint rows for this hostname before and after; a
duplicate is a FAIL even though every individual surface is green. Also confirm the console fleet count moved by the
same delta.

**Evidence.** Before/after identity rows, agent log, any CloudWatch 409s, console endpoint list, fleet counts.

---

### EN-09 — Enrollment cannot be replayed into another org `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Red team holding a copy of the deployment script.

**Prereqs.** PRE-A.1.

**Steps**
1. From Org B's console obtain Org B's deployment script; note the enrollment material's **shape** only.
2. From Org A's console confirm Org B's material never appears in any response body.
3. As Org A's authenticated user, call the enrollment/registration API with an identifier belonging to Org B.
4. Record status and `errorCode`.

**PASS.** Cross-org enrollment is refused with an explicit authorization error; Org A responses never contain Org B
identifiers.

**FALSE-PASS.** The call fails with a 404 and the operator reads that as isolation. A 404 can mean "not in your scope"
(correct) or "route does not exist" (proves nothing). *Defeat:* prove the same call **succeeds** with an Org A
identifier of the same shape from the same session, so the 404 is demonstrably a scoping decision. If PRE-A.1 is unmet:
**BLOCKED: no second org**.

**Evidence.** Both request/response pairs, status codes, `errorCode` values.

---

# PHASE CN — CONSOLE COLD READ, TENANCY AND AUTHORIZATION (13 tests)

*Persona: hour one, a brand-new customer reading every screen; then a suspicious auditor doing it again.*

---

### CN-01 — A brand-new org shows ZERO of everything, and the zeros are real `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The highest-value control test in the plan: it is the baseline every attribution depends on.

**Prereqs.** **GT-02 must have passed** — otherwise two dead surfaces agreeing on zero is meaningless. Ideally run in
Org B before Org B has any endpoint.

**Steps**
1. Screenshot in full, with DevTools capturing: `/`, `/endpoints`, `/inventory`, `/ai-control-plane`,
   `/ai-control-plane/agent-posture`, `/ai-control-plane/events`, `/ai-control-plane/ai-sessions`,
   `/ai-control-plane/policy`, `/coding-ai/sessions`, `/coding-ai/events`, `/admin/endpoints`, `/mcp`, `/web-ai`,
   `/web-ai/activity`, `/web-ai/sessions`, `/alerts`, `/admin/audit`, `/repositories`, `/analysis`, `/autonomous/agents`.
2. For every non-zero number, every chart with ink, and every non-neutral badge, record the number, the tile, and the
   exact request URL + JSON body that produced it.
3. SQL for the same org: counts in the agent/endpoint tables, `ai_sessions`, `ai_events`, `endpoint_inventory`,
   `ai_context_coverage`, `mcp_servers`.
4. Confirm every response body carries only this org's ids.

**PASS.** Every count is 0 / "—" / an explicit empty state; the SQL counts agree; charts render an empty state rather
than a flat baseline that reads like data; no foreign org id appears anywhere.

**FALSE-PASS.** A tile shows "0" because the fetch **failed** and the component defaulted to zero. *Defeat:* for every
tile inspect the Network entry — a non-2xx, aborted or blocked request rendering as a confident "0" is a **FAIL**.
Force the issue once: block one tile's request URL in DevTools, reload, and observe what renders. If it renders "0"
instead of an error state, that is a finding that applies to **every zero on every screen** and must be recorded as
such. Second false-pass: two disconnected surfaces agreeing on zero — defeated by the GT-02 prerequisite.

**Evidence.** All screenshots, the tile→request map, HAR, SQL counts, the blocked-request screenshot.

---

### CN-02 — Every policy surface renders from stored server state, never from client defaults `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Security officer opening the policy pages cold.

**Steps**
1. Visit `/admin/policies/web-ai`; `/admin/policies/coding-ai` (walk **all** in-page tabs); `/admin/policies/autonomous-ai`;
   `/admin/policies/approvals`; `/ai-control-plane/policy`; `/admin/policy`.
2. Capture the backing requests (expect a proxy to `GET /api/v1/ai/security-policy` plus per-page calls).
3. SQL: `SELECT * FROM ai_security_policy WHERE org_id=:org AND group_id IS NULL;` and the provider-policy table.
4. Build a three-column table: **rendered control state ↔ API JSON ↔ DB row**, field by field.

**PASS.** Every rendered control maps to a JSON key that maps to a DB field with an equal value. Controls present in the
DB but not rendered are listed. **Any control rendered but absent from the JSON is a FAIL.**

**FALSE-PASS.** The page ships **client-side defaults** and renders them when the fetch 404s or 500s, so the UI looks
right while the org has no stored policy at all. *Defeat 1:* block the policy request URL in DevTools and reload — the
page must show an error/empty state, not a plausible default policy. *Defeat 2, and this is the important one:* do
**not** infer row existence from the API's `updatedAt`. The service is known to return a cloned *recommended* policy
with a freshly generated `updatedAt` when no row exists, so a never-configured org receives a plausible policy carrying
a current timestamp. Read `ai_security_policy` **by SQL**, and separately assert that the API distinguishes
"org default preset" from "org-authored policy" **on the wire**. If it does not, that is a finding in its own right —
the officer cannot tell whether their org has a policy at all.

**Evidence.** Per-page screenshots, HAR, the SQL row or its absence, the three-column table, the blocked-request
screenshot, and the wire field that distinguishes preset from authored (or a note that none exists).

---

### CN-03 — The same fact reads the same on every screen that shows it `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** A CISO reading the console in a meeting who will ask why two screens disagree.

**Steps**
1. Pick five facts that appear on more than one screen: endpoint count; protected/covered endpoint count; AI session
   count for a window; blocked-event count for a window; MCP server count.
2. For each, record the value and the backing XHR on **every** screen that shows it.
3. SQL the same five facts with explicit predicates and the same window.
4. Record any screen that differs and whether the difference is explained by a scope qualifier the UI actually prints.

**PASS.** Any numeric difference between screens is explained by a qualifier **printed on the screen itself**, and all
screens agree with SQL under that scope.

**FALSE-PASS.** All screens agree because they all call the **same** endpoint, so a wrong number is consistently wrong.
*Defeat:* the SQL check is the tiebreaker — screen agreement is never sufficient. Record which screens share an
endpoint, since that reduces this test's independence.

**Evidence.** The five-fact matrix (screen × value × XHR), SQL results, screenshots.

---

### CN-04 — The AI Control Plane overview reflects reality, including honest emptiness `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Open `/ai-control-plane`. For each tile and chart record value + XHR.
2. Identify every element that could be a placeholder: sparklines with no data, 0% coverage, all-neutral provider rows.
3. Cross-check each against SQL for the same org and window.
4. Specifically check coverage/posture figures against `ai_context_coverage` and `endpoint_control_state`.

**PASS.** Every element traces to data; every empty element says it is empty rather than implying a measured zero.

**FALSE-PASS.** A coverage percentage computed as `covered / total` with `total = 0` renders as "100%" or "0%" and reads
as a measurement. *Defeat:* read the raw numerator and denominator out of the XHR body. If the denominator is 0 the UI
must say "no data"; printing a percentage instead is a FAIL.

**Evidence.** Tile→XHR map with numerators and denominators, SQL cross-checks, screenshots.

---

### CN-05 — Session list → session detail → timeline is internally consistent `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** At least one real session — run after CC-01.

**Steps**
1. `/ai-control-plane/ai-sessions`: locate the CC-01 session by its `RUN_ID`-bearing repo path.
2. Open its detail page and its timeline.
3. Compare field by field: agent type, source surface, start/end, host, repo, risk score, event count, decisions.
4. SQL `ai_sessions` + `ai_events` for the same session id; compare every field.
5. Confirm the list's summary counts equal the detail's event count.

**PASS.** List, detail, timeline and SQL agree on every shared field, including the event count.

**FALSE-PASS.** The detail page renders its event count from a separate aggregate computed differently (e.g. excluding
some event types), so both are "right" and disagree. *Defeat:* enumerate the event types included in each count from the
XHR bodies and state the rule; an undocumented exclusion is a finding.

**Evidence.** Three screenshots, three XHR bodies, both SQL result sets, the field comparison table.

---

### CN-06 — Pagination and totals never lie `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The programme has an explicit rule: new lists use the shared pager, the page lives in the URL, and
pages are **never** numbered off an estimate.

**Steps**
1. On `/ai-control-plane/events`, `/coding-ai/events`, `/inventory`, `/endpoints`, `/repositories/findings` and
   `/admin/audit`: page forward to at least page 3 or the end.
2. Confirm the page number appears in the URL and that reloading the URL lands on the same page.
3. Record whether the response carries `hasMore` / `totalIsEstimate` and whether the UI prints a total.
4. If a total is printed, compare it against SQL `count(*)` under the same filters.
5. Page to the last page: confirm the final page is not empty and no row is duplicated or skipped at a boundary.

**PASS.** URL-addressable pages; totals either exact-and-correct or explicitly labelled estimates; no duplicates or gaps
at boundaries.

**FALSE-PASS.** A printed total matches SQL by coincidence on a small dataset. *Defeat:* apply a filter producing a
count larger than one page and re-check; and specifically exercise a list where `totalIsEstimate` is true — the UI must
not render numbered pages off an estimate.

**Evidence.** URLs at each page, XHR bodies showing `hasMore`/`totalIsEstimate`, SQL counts, boundary row ids.

---

### CN-07 — Filters and time windows actually filter, server-side `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. On the events and sessions lists apply each filter in turn: agent type, decision, time range, endpoint, severity.
2. For each, record the request query string and the returned row count.
3. SQL the equivalent predicate and compare.
4. Apply a filter that must return **zero** rows and confirm an explicit empty state.

**PASS.** Every filter changes the server-side query (visible in the request) and the returned count equals SQL under
the same predicate, including the zero case.

**FALSE-PASS.** The filter is applied **client-side** to the current page only, so it appears to work while counts and
totals are wrong beyond page one. *Defeat:* inspect the request query string — a filter that does not appear in the
request is client-side and that is a FAIL. Confirm by filtering to a value that exists only on page 4.

**Evidence.** Request query strings, row counts, SQL counts, the zero-result screenshot.

---

### CN-08 — Cross-tenant READ isolation on every list and detail route `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** PRE-A.1, with Org B holding at least one endpoint and one session.

**Steps**
1. As Org A, for every route from GT-04, capture the response and confirm every returned id belongs to Org A.
2. Take specific Org B resource ids: session, endpoint, MCP server, policy, exception.
3. From Org A's authenticated session, request each Org B id directly.
4. Record status and `errorCode` for each.
5. Repeat in reverse (Org B requesting Org A ids).

**PASS.** Every cross-org fetch is refused; no list response ever contains a foreign id.

**FALSE-PASS.** The refusal is a 404 that also occurs for ids that do not exist at all, so nothing is proven about
scoping. *Defeat:* for each route prove the **same shape** of request succeeds with an own-org id in the same session.
Also confirm the response does not leak existence: a different `errorCode` for "exists but not yours" versus "does not
exist" is an enumeration oracle and is itself a finding.

**Evidence.** Per route: own-org success, cross-org refusal, both status codes and `errorCode`s.

---

### CN-09 — Cross-tenant WRITE isolation, verified in the database `[OPERATOR]` `[READ-ONLY in effect]`

**Prereqs.** PRE-A.1.

**Steps**
1. Enumerate mutating routes from GT-04: policy PUT/PATCH, provider policy PATCH, MCP approval PATCH, exception create,
   session start/end, endpoint group changes.
2. From Org A's session attempt each against an Org B resource id with a minimal valid body.
3. Record status and `errorCode`, then **verify in SQL that Org B's row is unchanged** — compare `updated_at` and the
   targeted field before and after.

**PASS.** Every attempt refused **and** Org B's rows byte-identical before and after.

**FALSE-PASS.** The request returns 403 but a side effect already occurred before authorization was checked — an audit
row, a cache invalidation, a partial write. *Defeat:* the before/after SQL comparison is mandatory, and also query Org
B's `audit_events` for any row attributable to Org A's user inside the window.

**Evidence.** Per-route request/response, before/after SQL for Org B, Org B audit query results.

---

### CN-10 — Role authorization is enforced server-side, not by hiding buttons `[OWNER]` `[READ-ONLY in effect]`

**Prereqs.** PRE-A.4.

**Steps**
1. Log in as the viewer. Walk the policy pages; record which controls render as editable.
2. For each control the UI disables, call the corresponding API **directly** with the viewer's session.
3. Record status and `errorCode`, and verify in SQL the policy row is unchanged.
4. Repeat for user management, API key creation, endpoint upgrade/uninstall actions, and exception approval.

**PASS.** Every privileged mutation is refused server-side and no row changes.

**FALSE-PASS.** The UI hides the button and the operator concludes the role works. **Hiding is not authorization.**
*Defeat:* step 2 is the whole test; a hidden-but-callable route is a FAIL. If PRE-A.4 is unmet:
**BLOCKED: no non-admin role provisioned**.

**Evidence.** Viewer screenshots, each direct API call with status and `errorCode`, before/after SQL.

---

### CN-11 — Coverage and posture attribute to the right machine `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** PRE-A.2; EN-05; EN-06.

**Steps**
1. Generate distinguishable activity on each endpoint: a session on machine 1 tagged `RUN_ID` A, a session on machine 2
   tagged `RUN_ID` B.
2. On `/ai-control-plane/agent-posture` and the `/admin/endpoints` coverage section, confirm each is attributed to the
   correct machine.
3. SQL: confirm the `endpoint_id` on those rows maps to the right machine via the EN-05 identity table.

**PASS.** Machine 1's activity appears only under machine 1 and vice versa, on both surfaces and in SQL.

**FALSE-PASS.** With a single endpoint, attribution is trivially correct — everything maps to the only machine.
*Defeat:* two endpoints are required; without PRE-A.2 the verdict is **NOT-PROVEN**. Second: if the two machines share a
hostname (a cloned VM) then `hostname_hash` collides — confirm hostnames are distinct before starting.

**Evidence.** Both `RUN_ID`s, both console attributions, the SQL mapping through the identity table.

---

### CN-12 — The audit log records who did what, and the actor cannot author it `[OPERATOR]` `[DESTRUCTIVE — reversible]`

**Steps**
1. Perform three distinct, reversible administrative actions (a policy save, an exception decision, a role change) and
   revert them.
2. `/admin/audit`: confirm each appears with actor, action, target, timestamp, source IP.
3. SQL `audit_events` for the window; compare fields.
4. Attempt from an authenticated session to create or modify an audit row via any exposed route; record the refusal.
5. Confirm the audit timestamp is server-authored by comparing against the backend clock, not the browser's.

**PASS.** All three actions recorded with correct actor and target; audit not writable via the API; timestamps
server-authored.

**FALSE-PASS.** The audit view is populated from a **client-supplied** description of the action, so an actor controls
their own audit text. *Defeat:* compare the audit row against the CloudWatch record of the same request, and send one
request carrying an unexpected extra field claiming a different action — the audit row must ignore it.

**Evidence.** Three console actions, audit screenshots, SQL rows, CloudWatch correlation, the write-attempt refusal.

---

### CN-13 — Every rendered number has a backing request `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The structural test that catches hardcoded UI.

**Steps**
1. With DevTools capturing and cache disabled, load each major route once.
2. For every number, badge, chart series and percentage, identify the request that carries the value.
3. Produce `CN-13-unbacked.md` listing every element for which **no** request carries the value.
4. For each unbacked element decide: derived from other fetched values (acceptable — record the formula) or a literal in
   the bundle (a FAIL).

**PASS.** The unbacked list contains only elements provably derived from fetched values, with the derivation written
down.

**FALSE-PASS.** The operator finds the value inside a large aggregate response and stops looking. *Defeat:* for at least
three values, block the request that supposedly carries them and confirm the element changes to an error or empty state.
An element that renders unchanged with its data source blocked is hardcoded.

**Evidence.** `CN-13-unbacked.md`, HAR per route, three blocked-request screenshots.

---

# PHASE PL — POLICY AUTHORSHIP, BUNDLE DELIVERY, RECEIPTS AND THE CANARY (15 tests)

*Persona: a security officer who authors a control and then demands proof it landed on the metal. This phase contains
the proof chain that has historically been theatre: five DB columns stayed NULL because the daemon never sent
`appliedBundle`, and the deny-canary has (as of the last measurement) never fired in production.*

**Phase-wide rule.** Every policy change made here is **reverted at the end of the phase**, and both the pre-state and
post-state are recorded. Note the pre-state in `PL-pre-state.json` before PL-02 and diff it after PL-15.

---

### PL-01 — Author one real policy change and follow it to the endpoint `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Persona/angle.** The officer tightens one control and demands proof.

**Prereqs.** GT-03 confirmed the `ai_policy_applied_*` columns exist; CN-02 passed.

**Setup.** Choose ONE low-blast-radius control on `/admin/policies/coding-ai` → Runtime (e.g. add a single deny pattern,
or move one tool-risk class from warn to block). Record its pre-state.

**Steps**
1. Before the change, capture:
   ```sql
   SELECT agent_id, hostname, enforcement_tier, evidence_intact, last_attested_at,
          ai_policy_applied_revision, ai_policy_applied_digest,
          ai_policy_applied_signing_key_id, ai_policy_applied_at
   FROM endpoint_control_state WHERE org_id = :org;
   ```
2. Make the change in the console. Save. Screenshot the confirmation. Record `T0`.
3. Re-run the SQL immediately, then every 30s for 10 minutes.
4. On the endpoint, tail the agent log for the bundle fetch/apply lines; record the revision, digest, signing-key id and
   applied-at **that the agent itself prints**.
5. CloudWatch `/ecs/backend`: find the PUT and the subsequent bundle issue for this agent.
6. Return to the console: the endpoint's row must show the **new** revision as applied.

**PASS.** The same `(revision, digest, signingKeyId)` triple appears, character for character, in: the agent log,
`endpoint_control_state`, `ai_policy_bundle_application_receipt`, and the console. `ai_policy_applied_at` is later than
the save time. None of the four columns is NULL.

**FALSE-PASS.** The server writes the applied columns from **what it issued** rather than from what the endpoint
reported, or the console shows "applied" from its own optimistic post-save state. *Defeat (both required):*
(a) confirm the digest in the DB equals a digest the **agent log** printed, character for character — not merely a
digest that exists; (b) run PL-02, the offline test, which is the decisive one.

**Evidence.** Before/after SQL, agent log excerpt, CloudWatch excerpt, console screenshots at each stage, the
pre-state record for the revert.

---

### PL-02 — With the endpoint offline, the console must show N-1 applied and N pending `[OWNER]` `[DESTRUCTIVE — reverted]`

**Persona/angle.** The decisive test for whether the proof chain is real or server-authored.

**Prereqs.** PL-01 complete; owner present to stop and start the service from their own elevated terminal.

**Steps**
1. Record the currently applied revision from SQL. Call it **N-1**.
2. Take the endpoint offline by the mechanism a real failure would use — stop the service, or disconnect the network.
   Confirm the daemon no longer answers on loopback and heartbeats have stopped.
3. Make a second trivial policy change in the console, producing revision **N**.
4. Wait `N_hb + 120s`. Read the console endpoint row, the SQL applied columns, and the receipt table.
5. Bring the endpoint back. Wait `N_hb + 120s`. Read all three again.

**PASS.** While offline: the console shows **N-1** as applied and **N** as pending/not-yet-applied; the SQL applied
columns still hold N-1's values; no receipt exists for N. After recovery: all surfaces move to N together.

**FALSE-PASS.** Two opposite errors, and the operator must not commit either. (a) The console claims **N** is applied
while the agent is down — the columns are server-authored and the entire proof chain is theatre. **FAIL.** (b) The
console shows *nothing* applied, or "pending" with no prior revision — the operator marks this a FAIL, but a **correct**
implementation continues to show N-1 as applied. *Defeat:* the assertion is **revision-specific**. Write down N-1 and N
by value before starting, and judge against those two numbers, never against the words "applied"/"pending" alone.

**Evidence.** N-1 and N by value; console screenshots offline and after recovery; SQL at three points; the receipt
table at three points; the service-state transcript; both clocks around the outage window.

---

### PL-03 — All four applied columns move together, per bundle, and the digest differs between bundles `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Persona/angle.** Closing the half-lie: a server that writes `revision` from what it issued, `applied_at` from the ack
timestamp, and only `digest` from the agent still passes PL-01.

**Prereqs.** PL-01, PL-02.

**Steps**
1. Issue two consecutive **distinct** policy changes, producing revisions N and N+1, with a full apply cycle between
   them.
2. After each, capture all four `ai_policy_applied_*` columns.
3. Assert: all four values changed between N and N+1; `digest` at N differs from `digest` at N+1; `signing_key_id` is
   the same only if the signing key genuinely did not rotate.
4. Confirm each digest also appears in the agent log for the corresponding apply.

**PASS.** All four columns move in lockstep across the two bundles and the digests differ.

**FALSE-PASS.** The two policy changes produce **byte-identical** bundle content (e.g. because the change did not affect
the bundle), so equal digests look like a bug or unequal digests look like success by accident. *Defeat:* make the two
changes materially different and verify the bundle content differs by checking that the agent log's applied policy
summary differs; if the digests are equal **and** the content is genuinely identical, that is correct and the test must
be re-run with a materially different change.

**Evidence.** Both column sets, both agent-log applies, the content difference proof.

---

### PL-04 — The bundle-application receipt is actually a receipt `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** An auditor asking "prove the endpoint applied *this* bundle".

**Prereqs.** GT-03 confirmed the table exists; PL-01/PL-03 produced ≥2 receipts.

**Steps**
1. `SELECT * FROM ai_policy_bundle_application_receipt WHERE org_id=:org ORDER BY created_at DESC LIMIT 20;`
2. For the receipts produced by PL-01 and PL-03, verify each carries: endpoint identity, bundle revision, digest,
   signing-key id, applied-at, and an **endpoint-produced** signature/proof field.
3. Cross-check the digest against the bundle the server logged issuing (CloudWatch), and the signing-key id against a
   key the console shows.
4. Coverage: `SELECT count(*) FROM endpoint_control_state e LEFT JOIN ai_policy_bundle_application_receipt r ON ... WHERE r.id IS NULL AND e.org_id=:org;`

**PASS.** Every receipt carries all six fields; the proof field **differs** between the two receipts; the coverage query
returns 0 **and** `endpoint_control_state` has ≥1 row for the org.

**FALSE-PASS.** Two shapes. (a) The coverage query returns 0 because `endpoint_control_state` has **zero rows for the
org** — no endpoints, therefore no missing receipts, therefore green. This is the classic vacuous assertion. *Defeat:*
the PASS explicitly requires ≥1 row; assert the denominator before believing the numerator (C13). (b) The proof field is
a **constant** across rows — a server-side placeholder that looks like a signature. *Defeat:* the ≥2-receipt comparison.
With fewer than two receipts or fewer than two endpoints the discrimination check is impossible — record **NOT-PROVEN**
with the reason.

**Evidence.** Receipt rows, the six-field checklist per receipt, CloudWatch issue lines, the coverage query with its
denominator, the two proof values (hashed if long).

---

### PL-05 — The server refuses to issue a bundle the endpoint could not activate `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** This refusal path is asserted in the changelog and exercised nowhere.

**Prereqs.** Secondary endpoint; owner approval; a documented way to place an endpoint in a state where activation is
impossible (e.g. degraded trust tier, or a policy referencing a capability the agent version does not have).

**Steps**
1. With the owner, identify a legitimate, non-destructive way to put the **secondary** endpoint into a state where a
   given bundle cannot be activated. Document the mechanism before starting.
2. Attempt to issue that bundle to that endpoint.
3. Record: does the server refuse, and with what message/`errorCode`? Does the console explain it to the officer?
4. Confirm the endpoint's applied columns did **not** change and no receipt was written.
5. Restore the endpoint and confirm the bundle can then be issued and applied.

**PASS.** The server refuses with an explicit reason; the applied columns and receipts are untouched; after restoration
the same bundle issues and applies successfully.

**FALSE-PASS.** The server "refuses" because of an unrelated error (a validation failure on the request, a transient
5xx) and the operator credits the activation guard. *Defeat:* require the refusal reason to name activation/capability
explicitly, **and** require step 5 to succeed with the *same* bundle after restoration — that pairing proves the refusal
was about the endpoint's state, not the bundle's content. If no mechanism can be identified in step 1, record
**BLOCKED: no known way to make activation impossible** — that is itself a finding, because it means the guard is
untestable.

**Evidence.** The documented mechanism, the refusal response, the unchanged columns/receipts, the successful post-
restoration issue.

---

### PL-06 — A policy scoped to a group or site applies only there `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Prereqs.** PRE-A.2 (two endpoints) placed in **different** groups or sites.

**Steps**
1. Put endpoint 1 and endpoint 2 in different groups/sites. Record the assignment from the console and from SQL.
2. Author a policy change scoped to endpoint 1's group only.
3. After a full apply cycle, read the applied revision/digest for **both** endpoints.
4. Drive the same governed action on both machines and compare decisions.

**PASS.** Endpoint 1's applied digest changes and its behaviour changes; endpoint 2's applied digest is unchanged and its
behaviour is unchanged.

**FALSE-PASS.** Both endpoints receive the change because scoping is not enforced, and the operator only checks endpoint
1. *Defeat:* the negative half — endpoint 2 must be checked and must be **unchanged**. Without a second endpoint this
test is **BLOCKED**, not passed.

**Evidence.** Group assignments from two surfaces, both endpoints' applied columns before and after, both behavioural
outcomes.

---

### PL-07 — Rollout phase SHADOW observes without enforcing `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Prereqs.** PL-01; GT-09 counter baseline; a **paired positive control** available (a genuinely blocked action).

**Steps**
1. Record the current rollout phase and the blocked-event counter for the window.
2. **Positive control first:** perform a genuinely blocked action under the current phase and confirm the blocked
   counter moves. Record by how much.
3. Move the relevant control to SHADOW. Wait for the apply cycle and confirm the endpoint applied the new bundle.
4. Perform the same action. Record the decision the agent made and what the user experienced.
5. Read the blocked counter and the event rows again.

**PASS.** In SHADOW the action **proceeds**, an event is still recorded with a shadow/observe decision, and the blocked
counter does **not** move. The positive control in step 2 proved the counter *can* move.

**FALSE-PASS.** "The blocked counter did not move" is trivially satisfied by a counter that is permanently zero, or by a
shadow decision that was never recorded at all. *Defeat:* step 2's positive control is mandatory (C13), **and** the
shadow decision must produce a visible event row — silence in SHADOW is a FAIL, not a pass, because SHADOW's entire
purpose is observation.

**Evidence.** Phase before/after, the positive-control delta, the shadow event row, the counter at three points, the
user-visible outcome.

---

### PL-08 — Rollout phase ENFORCE cannot be reached without a canary predecessor `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Steps**
1. From a state with **no** successful canary for the target control, attempt to move the rollout phase directly from
   SHADOW to ENFORCE.
2. Record the exact refusal: status, `errorCode`, and the message the officer sees.
3. Confirm in SQL that the phase did **not** change.
4. Then run the canary path (PL-11 … PL-13) and re-attempt ENFORCE.

**PASS.** The direct SHADOW→ENFORCE transition is refused with a message that names the canary requirement; the phase
is unchanged in the DB; the transition succeeds only after a canary has genuinely run.

**FALSE-PASS.** The requirement is only tested in the direction that succeeds — i.e. the operator runs the canary first
and then observes ENFORCE working, concluding the guard exists. *Defeat:* step 1 must be attempted **from a state where
the canary has not run**, and the refusal must be observed. If a canary has already run and cannot be un-run, record
**BLOCKED: cannot reach a no-canary state** and say so — that is a finding about testability.

**Evidence.** The refusal response, the unchanged phase in SQL, and the later successful transition with its
precondition.

---

### PL-09 — Rollout phase CANARY targets only the canary cohort `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Prereqs.** PRE-A.2.

**Steps**
1. Define a canary cohort containing endpoint 1 only. Record it from console and SQL.
2. Move the control to CANARY.
3. After the apply cycle, compare applied digests and behaviour on both endpoints.

**PASS.** Endpoint 1 gets the canary bundle and behaves accordingly; endpoint 2 does not.

**FALSE-PASS.** Both endpoints get it and only endpoint 1 is checked. *Defeat:* the negative half on endpoint 2 is
required. Without PRE-A.2: **BLOCKED**.

**Evidence.** Cohort definition from two surfaces, both endpoints' digests and behaviours.

---

### PL-10 — Rollout state and policy state survive a page reload and a second browser `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. After PL-09, hard-reload the policy page and re-read every control.
2. Open the same page in a different browser/profile logged in as the same user; re-read.
3. Compare both renderings against SQL.

**PASS.** All three agree.

**FALSE-PASS.** The first browser renders from optimistic local state left over from the save, so it agrees with what
the officer *intended* rather than with what was stored. *Defeat:* the second browser has no local state; if the two
browsers disagree, the first was rendering optimistic state and that is a FAIL.

**Evidence.** Both screenshots, both XHR bodies, the SQL row.

---

### PL-11 — Does the deny-canary exist, and has it EVER run? `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Known-open K2. This is a measurement, not an assertion.

**Prereqs.** GT-04 resolved the canary route.

**Steps**
1. Call the canary route. Record the **full literal body**, including `everRun` and any "measured absence" text.
2. SQL: locate the canary storage (challenge/proof rows) and record the total count, the count for this org, and the
   newest timestamp.
3. CloudWatch: search the last 30 days for canary issuance/verification log lines.
4. Record whether the console surfaces canary status anywhere, and what it says.

**PASS.** This test **passes on either answer** as long as the answer is measured and recorded: either the canary has
run (with dates and counts) or `everRun` is false and every surface says so honestly, including the console.

**FALSE-PASS.** The console renders a green "canary OK" badge while `everRun` is false — a measured absence displayed as
a pass. *Defeat:* compare the console's canary indicator against the literal `everRun` value. A green badge over
`everRun:false` is a **FAIL** of this test and a headline finding. Second: if the route 404s, this is **FAIL, canary not
deployed** (blocker for PL-12 … PL-14).

**Evidence.** The literal API body, canary SQL counts, CloudWatch search results, the console canary surface screenshot.

---

### PL-12 — Force a canary to fire, end to end, for the first time `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** The whole point of the canary is that it proves enforcement on the metal. It has never fired.

**Prereqs.** PL-11 established the route and the storage.

**Steps**
1. With the owner, trigger a canary issuance for the primary endpoint through the supported mechanism.
2. Watch the agent log: the endpoint must attempt a **denied action against the real runtime** and produce a proof.
3. Record the challenge id, the action attempted, the decision, and the proof returned.
4. Verify the server accepted the proof; read the stored row.
5. Re-call the canary route: `everRun` must now be true, with a timestamp inside the window.
6. Confirm the console's canary surface changes.

**PASS.** A challenge is issued, the endpoint attempts the denied action against the **real** runtime (visible in the
agent log with a decision id), a proof is returned and accepted, `everRun` flips true, and all four surfaces agree.

**FALSE-PASS.** The endpoint returns a proof it **synthesised** without touching the runtime — a canonical
"green over a dead path". *Defeat:* the agent log must show the runtime decision (the same decision-id shape produced by
a normal `PreToolUse` deny), and the corresponding `ai_events` row must exist for the canary action. A proof with no
decision row behind it is a FAIL.

**Evidence.** Challenge id, agent log with the runtime decision, the proof (hashed), the stored row, the before/after
`everRun` bodies, console screenshots.

---

### PL-13 — The canary can go RED — prove it discriminates `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** PRE-B. A canary that always returns "proof" is worthless. This is the negative control for PL-12.

**Prereqs.** PL-12 succeeded.

**Steps**
1. With the owner, construct a state in which the denied action **would be allowed** — for example, target the canary at
   an action the current policy permits, or run the canary against an endpoint whose applied bundle predates the deny
   rule (the secondary, held on the older bundle).
2. Trigger the canary.
3. Record the outcome: does the canary report failure/red, and does the console show it?

**PASS.** The canary reports a failed proof (red) and the console shows it as a failure, not as "no data".

**FALSE-PASS.** The canary reports green because it verifies only that *a response was returned*, not that the action
was *denied*. *Defeat:* this test is that defeat. If the canary cannot be made to go red by any supported means, record
**FAIL: the canary cannot discriminate** — it is decoration, and that is a headline finding regardless of how many green
canaries exist.

**Evidence.** The constructed state, the canary result, the console rendering, the agent log for the allowed action.

---

### PL-14 — Canary results are attributed to the right endpoint and org `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** PL-12; PRE-A.2.

**Steps**
1. Run canaries against both endpoints.
2. Verify each result is stored against the correct endpoint id (via the EN-05 identity table) and the correct org.
3. Confirm Org B cannot see either result.

**PASS.** Correct attribution on both, invisible to Org B.

**FALSE-PASS.** With one endpoint, attribution is trivially correct. *Defeat:* two endpoints required; otherwise
**NOT-PROVEN**. Also check the stored id is an endpoint id and not an API-key id (K1 recurrence).

**Evidence.** Both canary rows with ids resolved through the identity table, the Org B negative check.

---

### PL-15 — Restore every policy changed in this phase and prove the restoration landed `[OPERATOR]` `[DESTRUCTIVE — restorative]`

**Steps**
1. Compare current policy state against `PL-pre-state.json`.
2. Revert every change made in PL-01 … PL-13.
3. Wait a full apply cycle; confirm the endpoint applied the restored bundle (revision, digest in agent log and DB).
4. Re-run the CN-02 three-column comparison and confirm it matches the pre-phase state.
5. Restore the rollout phase to its original value.

**PASS.** Policy, rollout phase and applied bundle all match the pre-phase state on all surfaces.

**FALSE-PASS.** The console shows the original values because the officer re-typed them, while the endpoint is still on
the modified bundle. *Defeat:* the applied **digest** must return to a value the agent log printed for the pre-phase
bundle — or, if the revision number necessarily advanced, the applied policy content summary in the agent log must match
the pre-phase content.

**Evidence.** Pre-state vs post-state diff, the agent log apply, the final SQL columns, the CN-02 comparison re-run.

---

# PHASE CC — CLAUDE CODE RUNTIME GOVERNANCE (16 tests)

*Persona: Maya, a senior backend developer on a governed Windows box. She did not ask to be governed and will not
tolerate mystery interruptions. Every test is measured from her chair first, then triangulated.*

**Wire contract for Claude Code `PreToolUse` — assert on this literally, not on a paraphrase:**
- **block** → stdout `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<reason>"}}`
- **warn** → same shape with `"permissionDecision":"ask"`, reason prefixed with a warning marker
- **allow** → **empty stdout**
- the hook **always exits 0**; only the deny JSON blocks; fail-OPEN unless the strict env flag is set
- client timeouts: tool-decision ~4s, session ~3s

---

### CC-01 — Do the five hook events actually FIRE, or are they merely DECLARED? `[OPERATOR]` `[DESTRUCTIVE — creates a session]`

**Prereqs.** GT-05, GT-07 (the invocation-logging method must be validated or replaced).

**Steps**
1. Record `T0` and both clocks. Create a working repo at `C:\devoid-qa\<RUN_ID>\` so `RUN_ID` becomes a greppable
   correlator on all four surfaces.
2. Start a fresh Claude Code session there and perform, in order: (a) session opens → `SessionStart`; (b) a plain prompt
   → `UserPromptSubmit`; (c) a benign Read/Glob → `PreToolUse` + `PostToolUse`; (d) an action requiring permission →
   `PermissionRequest`; (e) close the session → session end.
3. After each step, capture the newest agent-log lines with timestamps.
4. SQL: `SELECT seq_num, event_type, agent_type, surface, policy_decision, event_time FROM ai_events WHERE org_id=:org AND event_time BETWEEN :t0 AND :t1 ORDER BY seq_num;`
5. CloudWatch for the same window, filtered by session id.

**PASS.** Each of the five events produced an observable artifact in the agent log **and** a corresponding row or
backend log line, in the order Maya performed them. `seq_num` continues from the GT-09 watermark with no gaps.

**FALSE-PASS.** Three real shapes. (a) The hook is declared, Claude invokes it, the binary is **missing**, Claude
swallows the spawn error, and the session proceeds normally — **indistinguishable from allow, because allow is empty
stdout**. *Defeat:* use the GT-07-validated invocation logging and assert `invocations >= actions performed`; if GT-07
invalidated that method, use process-creation auditing on the hook binary instead. (b) Rows exist in `ai_events` but
were produced by a **different** session or a previous run. *Defeat:* the `[T0,T1]` bound plus the `RUN_ID`-bearing repo
path. (c) The events are recorded but with the wrong `agent_type`/`surface`, so they will never be attributed to Claude
Code in the console. *Defeat:* assert `agent_type` and `surface` values explicitly against the GT-08 vocabulary.

**Evidence.** The action timeline with wall-clock, agent log excerpts, the SQL result, CloudWatch excerpt, the
invocation count.

---

### CC-02 — A genuinely dangerous command is BLOCKED, and the block is legible `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Persona/angle.** Maya asks the assistant to run something that is actually dangerous.

**Prereqs.** CC-01; C7 payload hygiene; GT-08 vocabulary.

**Steps**
1. Write, with an editor, a payload **file** containing a fetch-then-exec cradle (a download utility whose output is
   piped into a shell interpreter). Never type it on a command line.
2. Ask Claude Code to execute that file via the shell tool.
3. Capture the hook's **literal stdout** and its exit code.
4. Capture what Maya sees in her terminal — the exact wording of the refusal.
5. Agent log: the decision id and the class.
6. SQL: the `ai_events` row with `policy_decision`, `data_classes`, and the class in `metadata`.
7. Console: the detection on `/ai-control-plane/events` and `/coding-ai/events`.

**PASS.** stdout is exactly the deny JSON shape above; exit code 0; the tool does **not** run; Maya sees a specific,
actionable reason naming the risk; the class is a member of the GT-08 closed set (`pipe-to-shell` or the documented
fetch-then-exec equivalent); the same decision id appears in the agent log, the DB row and the console detection.

**FALSE-PASS.** (a) The tool did not run for an unrelated reason (the file did not exist, the interpreter is missing) and
the operator credits the guard. *Defeat:* confirm the deny JSON was actually emitted and the decision id exists — a
non-run with no decision is INCONCLUSIVE. (b) The console renders a class string that is **not** in the closed
vocabulary — a typo'd or invented class rendering as a plausible chip. *Defeat:* assert closed-set membership.
(c) HTTP 2xx on the ingest is credited as "recorded". *Defeat:* the assertion is "2xx **and** a row with this
correlation id exists" — the conjunction, not the status.

**Evidence.** The payload file, the literal stdout, exit code, Maya's terminal text, agent log with decision id, the SQL
row, both console screenshots.

---

### CC-03 — The paired benign control: the same shape with a harmless payload is ALLOWED `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Persona/angle.** PRE-B. A detector that flags everything passes CC-02.

**Prereqs.** CC-02.

**Steps**
1. Write a second payload file with the **same structure** as CC-02's but a harmless body (e.g. printing the date).
2. Ask Claude Code to execute it the same way.
3. Capture stdout (expect empty), exit code, and whether the tool ran.
4. Confirm no deny event was recorded, but confirm the invocation **was** observed (GT-07 method).
5. Compare the two runs side by side.

**PASS.** The benign run produces **empty stdout**, the tool runs, and no block event is recorded — while CC-02's run
produced a deny. The two differ.

**FALSE-PASS.** The benign run is allowed because the hook did not fire at all, which would also produce empty stdout.
*Defeat:* the invocation count from GT-07 must show the hook fired for the benign run too. Allow-because-evaluated and
allow-because-absent are indistinguishable on stdout alone, and that distinction is the entire point of this test.

**Evidence.** Both payload files, both stdouts, both exit codes, the invocation counts, the side-by-side comparison.

---

### CC-04 — Base64 `-EncodedCommand` is decoded and re-evaluated, with a paired benign control `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Persona/angle.** An attacker obfuscating a download-exec to dodge a string match.

**Prereqs.** CC-02, CC-03.

**Steps**
1. In **files**, build two PowerShell `-EncodedCommand` invocations with identical outer form:
   **(A)** decoded payload is a download-then-execute; **(B)** decoded payload is harmless (print the date).
   Assemble both with escape sequences inside the file so no literal attack string ever reaches a shell argument.
2. Have Claude Code invoke each as a tool call, separately, with a recorded gap between them.
3. Capture, for each: the hook stdout, the class, the decision id, the DB row, and the console detection.

**PASS.** (A) is detected with a class reflecting the **decoded** intent (a download-exec / interpreter-exec class from
the GT-08 set), and (B) is **not** blocked. The two verdicts **differ**.

**FALSE-PASS.** Two shapes. (a) The guard flags a generic "encoded command present" without decoding, making benign and
malicious indistinguishable. (b) The guard decodes but classifies on the **outer** interpreter only. *Defeat:* the
paired trial is the defeat — a real decoder produces **different** classes for A and B; a fake one produces the same
verdict for both. Record both verdicts side by side; identical verdicts are a FAIL even if A was blocked.

**Evidence.** Both encoded input files, both decoded intents (described, not executed), both hook stdouts, both console
detections side by side, both decision ids.

---

### CC-05 — Interpreter-laundering: the guard reads what the interpreter will execute `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Persona/angle.** A developer who "just needs a quick script", laundering a shell through an interpreter to escape
shell-AST rules.

**Steps**
1. Write `payload.py` (via editor) whose body spawns a shell running a fetch-then-exec cradle. Write a paired
   `benign.py` that only prints.
2. Ask Claude Code to run each with the interpreter.
3. Repeat the pair with Node and `child_process`.
4. Capture class, decision, and the console detection for all four runs.

**PASS.** The malicious pair is detected with a class naming the interpreter-laundering (`content-spawn-shell` /
`content-pipe-shell` / the documented interpreter-exec class), the console detection **references the in-file content**
and not merely "ran python", and the benign pair is allowed.

**FALSE-PASS.** The guard inspects only the top-level tool command — which looks innocuous — and never reads the file
the interpreter will execute, so the cradle inside the file is invisible. *Defeat:* the detection's evidence must
reference the in-file content (a quoted fragment, a content hash, or the file path plus a content-derived class). A
detection that names only the interpreter invocation is a FAIL. Second defeat: the benign pair must be allowed, or the
guard is simply flagging "ran an interpreter".

**Evidence.** All four payload files, all four decisions, the detection evidence fields, the console screenshots.

---

### CC-06 — Privilege escalation and self-disable attempts are caught `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Steps**
1. In files, prepare three probes: (a) an elevation-shaped invocation; (b) a firewall-disable shape; (c) an attempt to
   disable or uninstall the agent itself.
2. Drive each through Claude Code's shell tool.
3. Capture class, decision, and what Maya sees.
4. Confirm each class is in the GT-08 set (`privilege-escalation`, `firewall-disable`, `cera-self-disable`).
5. Confirm the self-disable attempt also writes to the endpoint's tamper log.

**PASS.** All three are blocked or warned per policy, with the correct classes, and the self-disable attempt produces a
tamper-log entry **and** a console-visible event.

**FALSE-PASS.** The self-disable attempt is blocked by Windows (not by us) because the terminal is not elevated, and the
operator credits our guard. *Defeat:* require our deny JSON and our decision id before the OS ever sees the command;
an OS-level refusal with no decision id is INCONCLUSIVE.

**Evidence.** Three payload files, three decisions with ids, tamper-log entry, console events.

---

### CC-07 — Warn (`ask`) is distinguishable from deny, and the user's choice is honoured and recorded `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Identify a probe whose policy disposition is **warn**, not block.
2. Drive it; capture the hook stdout and confirm `permissionDecision` is `ask` with a warning-prefixed reason.
3. As Maya, **decline**. Confirm the tool does not run and an event records the decline.
4. Repeat and **accept**. Confirm the tool runs and an event records the acceptance, with the accepting user identified.

**PASS.** Warn produces `ask`; both branches are honoured; both are recorded distinctly, with the decision attributable
to a user.

**FALSE-PASS.** Both branches record the same event type, so "the user approved a risky action" is invisible in audit.
*Defeat:* the two events must be distinguishable in `ai_events` (different `policy_decision` values or distinct event
types) and distinguishable in the console.

**Evidence.** Both hook stdouts, both terminal transcripts, both event rows, both console renderings.

---

### CC-08 — Allow-once does not become allow-forever `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Use the allow-once mechanism on a warned action.
2. Immediately repeat the identical action.
3. Repeat again after the documented expiry, and after a session restart.
4. Record the decision each time and whether an event was written each time.

**PASS.** The second occurrence prompts again (or is denied) per the documented semantics; the exception does not
silently persist across sessions; every occurrence produces an event.

**FALSE-PASS.** The second occurrence is allowed **silently with no event**, so a one-time exception has become an
invisible standing exemption. *Defeat:* assert an event exists for **every** occurrence, including allowed ones — a
silent allow is a FAIL even if the semantics are "allow for 5 minutes".

**Evidence.** The four occurrences with timestamps, decisions and event rows; the documented expiry.

---

### CC-09 — Decision latency does not make the assistant unusable `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Maya's tolerance, and the stated policy of correctness over latency — which is not a licence for a
4-second stall on every keystroke.

**Steps**
1. Over a 30-minute real working session, log every hook invocation with its wall-clock duration.
2. Compute the distribution: median, p90, max, and the count that hit the documented 4s/3s client timeouts.
3. Record how many timeouts occurred and what the decision was on timeout (fail-open, per the contract).
4. Record Maya's subjective experience in one sentence per interruption.

**PASS.** The distribution is recorded; timeouts are counted; the behaviour on timeout matches the documented fail-open
contract; nothing is asserted about a p99 target (this is a pre-customer product and latency targets are explicitly not
a gate).

**FALSE-PASS.** The median looks fine because most invocations are trivial reads while every **shell** invocation stalls.
*Defeat:* bucket the distribution by tool type and report shell separately. Second: a timeout that silently fails open
is invisible — assert that each timeout produced a log line, so the fail-open count is measurable.

**Evidence.** The invocation log with durations, the bucketed distribution, the timeout count, Maya's notes.

---

### CC-10 — Benign daily work is not interrupted `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Persona/angle.** The false-positive angle. Approval prompts are ours, not the harness's; every interruption Maya sees
is attributable to us.

**Steps**
1. Perform 30 minutes of genuinely normal work through Claude Code: read files, grep, run a build, run tests, `git
   status`, `git diff`, `git commit`, install a well-known dependency, format code.
2. Log every interruption: what was asked, what the reason text said, and whether it was justified.
3. Classify each as true positive, false positive, or noise.

**PASS.** Zero unjustified interruptions; every interruption's reason text is specific and actionable.

**FALSE-PASS.** Zero interruptions occurred because the hook is not firing at all. *Defeat:* the invocation count
(GT-07) must show hooks fired throughout — this is the same allow-vs-absent ambiguity as CC-03, and it must be resolved
before "no interruptions" can be read as "no false positives".

**Evidence.** The session transcript, the interruption log with classifications, the invocation count.

---

### CC-11 — `git push` and `git commit` are recognised as actions and recorded `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. In the `RUN_ID` repo, make a trivial commit and push to a scratch remote.
2. Record whether classes `action-git-commit` / `action-git-push` appear, and at what severity.
3. Confirm the corresponding events reach `ai_events` with repo attribution.
4. Confirm the console attributes them to the right repo and session.

**PASS.** Both actions produce info-severity events with correct repo attribution on all surfaces.

**FALSE-PASS.** The repo is attributed by a hashed path only and the console prints "unknown repo", which the operator
accepts. *Defeat:* assert the console shows a repo identity a human can act on, and that `repo_full_name` (or the
documented equivalent) is populated, not just `repo_path_hash`.

**Evidence.** The commit/push transcript, the event rows, the console session view.

---

### CC-12 — Session boundaries are correct: one session, correctly opened and closed `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Open a Claude Code session, work for 5 minutes, close it cleanly.
2. Confirm exactly one `ai_sessions` row with `started_at` and `ended_at` bracketing the work.
3. Open a second session and **kill the terminal** rather than closing cleanly.
4. Confirm how the session is closed: by a sweeper, by timeout, or never.

**PASS.** Clean close produces a bounded session. Unclean close is eventually closed by a documented mechanism, or is
explicitly marked as unterminated — **not** left silently open forever.

**FALSE-PASS.** The unclean session appears "ended" because `ended_at` was written optimistically at start, or because
the list only shows recent sessions and the stale one is invisible. *Defeat:* query `ai_sessions` directly for rows with
NULL `ended_at` older than the documented timeout, and count them across the whole org. A growing population of
never-closed sessions is a finding.

**Evidence.** Both sessions' rows, the sweeper mechanism (or its absence), the count of stale open sessions org-wide.

---

### CC-13 — The event chain is intact and ordered `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. For the window covering CC-01 … CC-12, pull `seq_num`, `prev_hash`, `event_hash` for Org A ordered by `seq_num`.
2. Verify: no gaps in `seq_num`; each row's `prev_hash` equals the previous row's `event_hash`.
3. Confirm the chain continues from the GT-09 watermark.
4. Confirm the unique index `ux_ai_events_org_seq(org_id, seq_num)` exists (GT-03).

**PASS.** Contiguous `seq_num`, correct linkage, continuous from the watermark.

**FALSE-PASS.** The chain validates because **no other test was running** and there were no concurrent writers — so the
check proves nothing about concurrency. *Defeat:* record explicitly that C14 exclusivity was in force, and schedule
RS-09 (concurrent writers) as the real test of chain behaviour under load. Second: `prev_hash` is NULL on many rows and
the verifier skips NULLs — assert the NULL count and that only the genesis row is NULL.

**Evidence.** The chain dump, the linkage verification output, the NULL count, the exclusivity note.

---

### CC-14 — The console shows Maya's activity within a bounded, measured time `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Perform one clearly-identifiable governed action at a recorded `T0`.
2. Poll the console events view every 15s. Record the first poll at which it appears (`T_console`).
3. Poll SQL every 15s. Record `T_db`.
4. Compute `T_db - T0` and `T_console - T_db`.

**PASS.** Both deltas are recorded, and `T_console - T_db` is explained by the polling interval plus `N_lag`.

**FALSE-PASS.** The console appears fast because it was already showing a **similar older event** and the operator did
not check the id. *Defeat:* match on the decision id / `RUN_ID`, never on the event's appearance.

**Evidence.** `T0`, `T_db`, `T_console`, the polling log, the matched decision id.

---

### CC-15 — The reason text Maya sees is ours, specific, and offers an alternative `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** A standing product rule: every interruption the developer sees is ours, never the harness's, and we
never blame the harness.

**Steps**
1. Collect the verbatim reason text from every block and warn produced in CC-02 … CC-08.
2. For each, check: does it identify the product as the source? Does it name the specific risk class in human terms?
   Does it offer a concrete safer alternative? Does it tell Maya how to request an exception?
3. Check none of them attributes the refusal to the AI harness or to a generic "permission denied".

**PASS.** Every reason names us, names the risk, offers an alternative, and points to the exception path.

**FALSE-PASS.** The reason is specific in the agent log but generic in Maya's terminal. *Defeat:* judge on **what Maya
saw**, quoting her terminal, not on the log's richer internal reason.

**Evidence.** Verbatim terminal quotes for each block/warn, the four-point checklist per message.

---

### CC-16 — Exception request flow works end to end `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Steps**
1. From a blocked action, follow the exception path the reason text advertised.
2. Confirm an `EXCEPTION_REQUESTED` event and a request visible on `/admin/policies/approvals`.
3. As the officer, approve it with a scope and an expiry.
4. Re-run the blocked action; confirm it is now permitted, and that the permission is recorded as flowing from the
   exception.
5. Let the exception expire (or revoke it) and confirm the action is blocked again.

**PASS.** Request → approval → permitted → expiry → blocked again, with every transition visible in the console and in
`ai_events`.

**FALSE-PASS.** The approval works but the **expiry does not** — the exception is permanent and nobody notices, because
nothing ever re-tests it. *Defeat:* step 5 is mandatory. If the shortest available expiry is longer than the test
window, set a revocation instead and record that expiry was **NOT-PROVEN** with the reason.

**Evidence.** The request event, the approvals screenshot, the approval record, both post-approval and post-expiry
decisions, the console rendering of the exception's scope and expiry.

---

# PHASE CX — CODEX RUNTIME GOVERNANCE (11 tests)

*This phase exists because the single worst defect this programme has found lived here: Codex ran **completely
ungoverned** on machine-scope installs while **both** status surfaces reported green. Codex is the runtime that
**fails OPEN**, whose hook semantics are **inverted** relative to Claude Code, and whose dialect firewall was pinned to
the wrong version markers.*

**The rule for this phase: never accept `hooks-status` as evidence of enforcement.** A status surface standing in for
enforcement is exactly the original failure. Every test below drives a real denied action through the real Codex
runtime.

---

### CX-01 — Codex hooks are installed for the version that is ACTUALLY installed `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The dialect firewall was pinned to Codex `0.144` markers while `0.134` was installed, so every hook
reported "Failed" and nothing was enforced.

**Prereqs.** GT-05 captured the exact installed Codex version including patch.

**Steps**
1. Record the exact installed Codex version, three ways: the binary's own version output, the package metadata, and the
   version string Codex writes into its own logs.
2. Read the managed hook configuration our agent installed. Record **every version marker, dialect identifier, or
   schema version** it contains.
3. Compare each marker against the installed version.
4. Read Codex's own log/output for any hook error, including "Failed", schema mismatch, or unknown-key warnings.
5. Run `cera ai hooks-status codex`; record stdout **and** exit code separately.

**PASS.** Every marker in our managed configuration matches the installed Codex version; Codex's own log shows **zero**
hook errors across a real session; `hooks-status` exits 0.

**FALSE-PASS.** `hooks-status` reports green by checking only that our config **file exists** — which it did throughout
the original outage. *Defeat:* the authority here is **Codex's own log**, not our status command. A single "Failed"
line in Codex's output is a FAIL regardless of what `hooks-status` says. Second defeat: assert the exit code separately
from the text, and confirm the status command read a non-zero number of files.

**Evidence.** Three version readings, the managed config with markers highlighted, Codex's own log across a full
session, `hooks-status` stdout + exit code.

---

### CX-02 — A denied action driven through Codex is actually denied `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Persona/angle.** The test that the whole programme was missing: enforcement, through Codex, end to end.

**Prereqs.** CX-01; CC-02 established the equivalent Claude Code result for comparison.

**Steps**
1. Use the **same** payload file as CC-02 (fetch-then-exec cradle, written by an editor).
2. Drive it through Codex, as a real Codex session performing a real tool call.
3. Capture: whether the command ran; the hook's output and **exit code** (remember Codex's semantics are inverted — the
   hook must exit 0, and deny is not signalled the way Claude signals it; record the actual mechanism observed).
4. Capture the agent log decision id and class.
5. SQL: the `ai_events` row with `agent_type` = the Codex value from GT-08's vocabulary.
6. Console: the detection on the events view, attributed to Codex.

**PASS.** The command does **not** run; a deny decision with a decision id exists in the agent log; a row exists in
`ai_events` with the Codex `agent_type`; the console shows it attributed to Codex.

**FALSE-PASS.** Three shapes, all previously real. (a) The command did not run because Codex itself refused for its own
reasons (its own sandbox/approval settings), and the operator credits us. *Defeat:* our decision id must exist **before**
Codex's own refusal, and the event row must exist; a Codex-side refusal with no decision id of ours is INCONCLUSIVE and
must be re-run with Codex's own restrictions relaxed to the level the customer actually runs. (b) The hook fails and
Codex **fails open**, the command runs, and nothing is recorded — indistinguishable from "nothing happened". *Defeat:*
if the command ran, that is an immediate FAIL; do not look for a reason. (c) The event is recorded with the **Claude**
`agent_type` because the ingest defaults it, so Codex looks governed on a dashboard that is actually counting Claude.
*Defeat:* assert the literal `agent_type` value.

**Evidence.** The payload file, whether the command ran (with proof — e.g. the absence of its side effect), hook output
and exit code, agent log with decision id, the SQL row with `agent_type`, the console detection.

---

### CX-03 — The paired benign control through Codex `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Prereqs.** CX-02.

**Steps**
1. Drive CC-03's benign payload through Codex the same way.
2. Confirm it runs, produces no deny, and yet **was evaluated** (invocation evidence per GT-07).
3. Compare CX-02 and CX-03 side by side.

**PASS.** The benign action runs and was evaluated; the malicious one did not run. The two differ.

**FALSE-PASS.** The benign action runs because the hook is absent — the same allow-vs-absent ambiguity as CC-03, and
here it is the historical defect itself. *Defeat:* invocation evidence is mandatory; without it this test is
INCONCLUSIVE and CX-02's pass is weakened to NOT-PROVEN.

**Evidence.** Both runs side by side, invocation evidence for both.

---

### CX-04 — Codex fails OPEN — measure exactly what happens when the daemon is down `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** An insider who knows enforcement lives in the daemon and wants a window.

**Prereqs.** **Decide the expected behaviour with the owner BEFORE running.** The shipped default is fail-open unless
the strict env flag is set. Write the PASS line against that decision; as written, both outcomes are otherwise
defensible and the operator will resolve ambiguity in the product's favour.

**Steps**
1. Record baseline: hooks installed, daemon answering on loopback.
2. Owner stops the daemon service from their own elevated terminal. Confirm loopback refuses connections.
3. Drive CC-02's denied payload through **Codex**, and separately through **Claude Code**.
4. Record for each: did the tool run? Was a **local rulebook** decision made? Was anything written to the tamper log or
   the agent log?
5. Restart the daemon.

**PASS (against the owner's stated intent).** If the intent is *local floor always decides*: both runtimes still block,
with a local decision id, and the daemon-down interval is itself recorded as a degraded window. If the intent is
*fail-open*: the tool runs, **and** the fail-open event is explicitly recorded on the endpoint and visible to the
console as a coverage gap.

**FALSE-PASS.** The hook fails open, the tool runs with **no local evaluation and no record**, and because the daemon
was down there is also no tamper-log entry — a silent hole indistinguishable from "nothing happened". *Defeat:* the
record is the test. **Fail-open with no record is a FAIL under either intent**, because the control is absent exactly
when an attacker removes the daemon and nobody can tell. Also reject "the console is green" as a pass — green during a
daemon-down window is the bug.

**Evidence.** The owner's stated intent, service-state transcript, both runtimes' outcomes, hook exit codes, tamper log,
agent log, console endpoint-health screenshot across the window.

---

### CX-05 — After the daemon returns, the outage is not retroactively erased `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** CX-04.

**Steps**
1. After the daemon restarts and re-heartbeats, open the console endpoint timeline/health view.
2. SQL: raw heartbeat and control-state timestamps across the outage window.
3. Diff the DB gap against the wall-clock window the owner controlled in CX-04.

**PASS.** The down-window remains visible after recovery — a gap or an explicit degraded span persists — and the DB
timestamps show the gap.

**FALSE-PASS.** The endpoint posts a fresh healthy heartbeat and the console shows an unbroken green line because it
renders only **current** state, not history. The outage is real but invisible. *Defeat:* the SQL timestamps must show
the gap even if the UI smooths it. A UI that structurally cannot display a real outage is a finding recorded here.

**Evidence.** SQL heartbeat timestamps around the window, the wall-clock window, console timeline screenshot.

---

### CX-06 — Codex is governed for a SECOND Windows user on the same machine `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** This is where the original defect lived: a SYSTEM daemon plus a one-shot enroll left Codex
permanently ungoverned on every machine-scope install, for every user except the enrolling one.

**Prereqs.** PRE-A.3; AQ-10 recorded which scope the install used.

**Steps**
1. Log in as the second (non-admin) Windows user. Install/authenticate Codex for that user if needed.
2. **Before** running anything, enumerate the hook configuration that user's Codex will actually read — user-scope
   config, any machine-scope requirements file, and any managed policy path. Record whether our hooks are present in
   **that user's** effective configuration.
3. Drive CC-02's denied payload through Codex **as that user**.
4. Record: did it run? Decision id? Event row? Correct `agent_type`? Attributed to which user?
5. Repeat with Claude Code as that user.

**PASS.** The denied action is blocked for the second user too, with a decision id and an event row attributed to that
user, on both runtimes.

**FALSE-PASS.** `hooks-status` run as the **first** user reports green and the operator infers coverage for everyone.
*Defeat:* everything in this test is performed **as the second user**, and the authority is the denied action's outcome,
not any status output. Second: the event is attributed to the enrolling user rather than the acting user, so a
per-user attribution defect hides as coverage — assert the acting user's identity on the event row. If PRE-A.3 is unmet:
**BLOCKED: no second Windows account** — and note that this is the single highest-risk BLOCKED item in the plan.

**Evidence.** The second user's effective config enumeration, the denied-action outcome as that user, decision id, event
row with user attribution, both runtimes.

---

### CX-07 — Codex governance survives a Codex upgrade `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** The dialect firewall pins version markers. Codex updates frequently and often silently.

**Prereqs.** CX-01, CX-02; owner approval to move the Codex version on the **secondary** box.

**Steps**
1. Record the current Codex version and confirm CX-02 blocks.
2. Upgrade (or downgrade) Codex to an adjacent version.
3. **Without** re-running our installer, re-run the CX-02 denied action.
4. Read Codex's own log for hook errors.
5. Run `hooks-status codex` and record stdout + exit code.

**PASS.** Either the block still holds, or the product **detects** the mismatch and surfaces it loudly (agent log,
console posture, and a user-visible message) rather than silently failing open.

**FALSE-PASS.** `hooks-status` still reports green after the version move while Codex's log is full of hook failures —
the exact original defect. *Defeat:* Codex's own log is the authority; a green status over a failing hook is the
headline finding. Second: the block appears to hold because Codex's **own** restrictions blocked it — apply the CX-02
defeat (our decision id must exist).

**Evidence.** Both Codex versions, the denied-action outcome at each, Codex's own log at each, `hooks-status` at each,
the console posture at each.

---

### CX-08 — Codex's own approval/sandbox settings are not silently doing our job `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Every Codex enforcement result in this phase is confounded if Codex's own settings would have blocked
anyway.

**Steps**
1. Record Codex's own approval mode / sandbox settings as the customer runs them (from the user's config, verbatim).
2. Identify which of the CX phase's payloads Codex would refuse **on its own**.
3. For each such payload, construct a variant that Codex's own settings permit but our policy denies, and re-run CX-02
   with it.

**PASS.** At least one payload exists that Codex would allow and we deny, and we deny it — proving our control is
additive and not a passenger.

**FALSE-PASS.** Every "block" in the phase is actually Codex's own sandbox, and the product contributes nothing.
*Defeat:* this test is that defeat. If no such payload can be constructed, the entire CX phase's enforcement results are
**NOT-PROVEN** and must be recorded as such.

**Evidence.** Codex's verbatim settings, the payload classification, the additive-block demonstration.

---

### CX-09 — Codex activity is attributed correctly in the console `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** CX-02, CX-06.

**Steps**
1. On `/ai-control-plane/events`, `/coding-ai/events`, `/ai-control-plane/agent-posture` and the provider matrix,
   filter to Codex.
2. Confirm the CX-02 and CX-06 events appear there, with the right machine, the right user and the right class.
3. Confirm the same events do **not** appear under Claude Code.
4. SQL cross-check on `agent_type`.

**PASS.** Codex events appear only under Codex, with correct machine/user/class, and match SQL.

**FALSE-PASS.** The console has no Codex filter at all, so everything renders in one undifferentiated list and the
operator reads "the event is there" as attribution. *Defeat:* the negative half — Codex events must be **absent** from
the Claude Code view. If no runtime filter exists, that is a finding: the console cannot answer "is Codex governed".

**Evidence.** Filtered screenshots for both runtimes, SQL `agent_type` counts, the negative check.

---

### CX-10 — Codex prompt-level governance (the `UserPromptSubmit` equivalent) `[OPERATOR]` `[DESTRUCTIVE]`

**Prereqs.** DL-01 (the evidence-lane positive control) should run first so a DLP hit is interpretable.

**Steps**
1. Place a synthetic cloud-key-shaped canary (C8) in a **file** and have Codex read it into its context in the way a
   developer would.
2. Record whether a prompt-level detection occurs, its class, and whether the prompt was blocked, redacted or allowed.
3. Compare against the equivalent Claude Code result from DL-02.
4. Confirm the event reaches the DB with the Codex `agent_type`.

**PASS.** Codex prompt-level governance produces the same class of outcome as Claude Code for the same input, recorded
with the Codex `agent_type`.

**FALSE-PASS.** No detection occurs and the operator concludes "Codex prompts are not covered by design". *Defeat:*
establish from the product's documented scope whether prompt-level coverage for Codex is in scope. If it is, absence is
a **FAIL**. If it is not, record **out-of-scope** explicitly with the source of that scope statement — never leave it as
an unexplained silence.

**Evidence.** The canary file, the Codex outcome, the Claude Code comparison, the event row, the scope statement.

---

### CX-11 — Both status surfaces tell the truth about Codex `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The original defect's signature was **both** status surfaces green over an ungoverned runtime.

**Prereqs.** CX-02 … CX-07 complete, so the ground truth is known.

**Steps**
1. Write down the **ground truth** established by this phase: is Codex governed, for which users, on which machine?
2. Read surface 1: `cera ai hooks-status codex` (and any local posture command).
3. Read surface 2: the console's Codex coverage/posture indicator.
4. Compare each surface against the ground truth.

**PASS.** Both surfaces match the ground truth, including reporting **not covered** where CX-06 showed a gap.

**FALSE-PASS.** Both surfaces are green and the operator, having seen green twice, does not compare against the ground
truth. *Defeat:* the ground truth is written down **first**, in step 1, before either surface is read. This ordering is
the entire test.

**Evidence.** The written ground truth (dated before the surface reads), both surface outputs, the comparison table.

---

# PHASE DL — DLP, PROMPT EVIDENCE AND PRIVACY (11 tests)

*Known-open K5: the prompt-evidence correlation keys were absent in production, so this whole lane may be inert. Every
privacy assertion in this phase is vacuous over a dead lane, which is exactly the `not.toContain(secret)` over an
always-empty array defect at production scale. **DL-01 is the mandatory positive control and must pass before any
absence claim in this phase carries meaning.***

---

### DL-01 — POSITIVE CONTROL: prove the evidence lane wrote something for this event `[OPERATOR]` `[DESTRUCTIVE]`

**Persona/angle.** C13, enforced. Nothing else in this phase means anything until this passes.

**Steps**
1. Record `T0`. Through Claude Code, submit a prompt whose content includes a synthetic cloud-key-shaped canary (C8),
   introduced from a **file** the assistant reads.
2. Confirm an event row exists for this prompt in `ai_events` inside `[T0,T1]`.
3. Determine where prompt evidence is stored (a column, a separate table, an object in S3 — resolve from GT-03/GT-04).
4. Assert the evidence artifact for **this specific event** exists and is **non-empty**.
5. Assert `evidence_ref` on the event row is non-NULL and resolves to that artifact.
6. Confirm the two correlation-key environment variables exist in the backend's configuration (record **presence and
   name only**, never a value) and that the backend did not log a "key missing" warning during the window.

**PASS.** A non-empty evidence artifact exists for this event, `evidence_ref` resolves to it, and no missing-key warning
appears in `/ecs/backend` for the window.

**FALSE-PASS.** `evidence_ref` is non-NULL but points at a placeholder row of zero length, so the lane "works" while
storing nothing. *Defeat:* assert the artifact's **byte length is greater than zero** and that it differs between two
different prompts (run a second prompt with different content and compare). Note the historical fact that
**`evidence_ref` has never been written by any producer** — if it is NULL here, that is a **FAIL and the named blocker
for DL-02 … DL-06**.

**Evidence.** The event row, the evidence artifact metadata (length, id — never content), the two key names' presence,
the CloudWatch warning search, the two-prompt difference.

---

### DL-02 — A cloud key pasted into a prompt is detected, classed and acted on `[OPERATOR]` `[DESTRUCTIVE]`

**Prereqs.** DL-01 passed.

**Steps**
1. From a file, have Claude Code read content containing an `AKIA`-shaped synthetic canary and submit it.
2. Record: the class (`aws-access-key`), the disposition (block / redact / warn / allow), and what Maya saw.
3. SQL: the event row's `data_classes` and `policy_decision`.
4. Console: the detection, its class chip, and its severity.
5. Confirm the class is in the GT-08 closed set.

**PASS.** Class is `aws-access-key`; disposition matches the stored policy; the same decision id appears in agent log,
DB and console; Maya saw a specific message.

**FALSE-PASS.** The detection fires as `high-entropy` only. `high-entropy` has a **built-in default of MONITOR/allow**,
so a `high-entropy`-only hit is **not** evidence of blocking and must not be scored as one. *Defeat:* assert the
specific class, and assert the disposition against the policy for **that** class.

**Evidence.** The canary file (value recorded only as first-4 + SHA-256), the class, the disposition, Maya's message,
the event row, the console detection.

---

### DL-03 — Payment card and private key detection, each with a benign pair `[OPERATOR]` `[DESTRUCTIVE]`

**Prereqs.** DL-01.

**Steps**
1. From files: (a) the published Luhn-valid test PAN; (b) a 16-digit number that **fails** Luhn; (c) a private-key
   shaped block; (d) a similarly-shaped but non-key text block.
2. Submit each through Claude Code, separately, with recorded gaps.
3. Record class and disposition for each.

**PASS.** (a) detects as `payment-card`; (b) does **not**; (c) detects as `private-key`; (d) does not. The pairs differ.

**FALSE-PASS.** All four fire (a detector that flags everything), or none fire (a dead lane). *Defeat:* the pairing is
the test — score it only on the **difference** between each pair, never on the positive alone.

**Evidence.** Four files (hashed), four outcomes, the two difference judgments.

---

### DL-04 — Home paths and local identifiers are handled per policy `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Have Claude Code include a real home-directory path in its context in the normal course of work.
2. Record whether it is detected, and what the policy does — redact, warn, allow.
3. Check what actually reached the backend: does the stored event contain the raw path, a hash, or nothing?
4. Compare against the policy the console displays for this class.

**PASS.** Behaviour matches the displayed policy; the stored representation matches what the policy promises.

**FALSE-PASS.** The console promises redaction while the backend stores the raw path, or vice versa. *Defeat:* read the
**stored** value from SQL (or the evidence artifact) and compare against the console's promise. This is the only way to
catch a UI promise the pipeline does not keep.

**Evidence.** The console's stated policy for this class, the stored value, the agent-side representation.

---

### DL-05 — The prompt text is NOT stored in the clear — asserted over a NON-EMPTY artifact `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The single most important privacy claim, and the one most at risk of being vacuous.

**Prereqs.** **DL-01 must have passed** — otherwise this test is BLOCKED, not passed.

**Steps**
1. Take the DL-02 event whose evidence artifact was proven non-empty.
2. Retrieve the stored artifact and every stored field that could carry prompt content: `ai_events.metadata`, any
   preview field, any S3 object, any CloudWatch log line for the window.
3. Search **each** for the canary's literal value, for its first 8 characters, and for a URL-encoded and a
   base64-encoded form of it.
4. Separately confirm the artifact **is** non-empty and **does** change when the prompt changes (from DL-01 step 6).
5. Search `/ecs/backend` logs for the canary in any form.

**PASS.** The canary appears in **none** of the searched locations, **and** the artifact is non-empty, **and** the
artifact differs between two different prompts.

**FALSE-PASS.** **This is the plan's flagship vacuity risk.** If nothing is stored, the plaintext is trivially absent
and this test goes green over a dead lane — the production-scale version of `not.toContain(secret)` over an empty array.
*Defeat:* the DL-01 prerequisite is not optional. The PASS explicitly conjoins "absent" with "non-empty and varying".
Second defeat: search the **encoded** forms too — a plaintext that survives as base64 is still a plaintext leak.

**Evidence.** The list of locations searched (with the query for each), the artifact length, the two-prompt difference,
the negative results for all four encodings.

---

### DL-06 — The masked preview shown in the console is genuinely masked and genuinely present `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Prompt evidence was previously stuck showing REDACTED everywhere, and separately, prompt text was
unreachable in the entire console although the bytes reached the browser.

**Steps**
1. In the console, open the detection from DL-02 and find the prompt preview surface.
2. Record what a user can actually see: a masked preview, a REDACTED placeholder, or nothing.
3. Inspect the XHR body that backs it: does the preview text reach the browser? Is it masked **before** transmission or
   masked in the renderer?
4. Confirm the canary's value does not appear in the XHR body in any encoding.

**PASS.** A useful masked preview is visible to the user; the canary is masked **server-side** (absent from the wire);
the preview is specific enough for an analyst to act on.

**FALSE-PASS.** Two shapes. (a) Everything reads REDACTED and the operator scores it as "privacy working" — a preview
that shows nothing is a product failure even though it is privacy-safe. Score it as a FAIL of usefulness and record it
separately from the privacy result. (b) The bytes reach the browser and are masked only by CSS or by the renderer.
*Defeat:* read the raw XHR body; masking that happens after transmission is not masking.

**Evidence.** The console preview screenshot, the raw XHR body, the four-encoding search of the body, the usefulness
judgment.

---

### DL-07 — Detection does not send the secret anywhere it should not go `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. During DL-02, capture the endpoint's outbound requests (agent-side capture, or the agent's own request log).
2. Confirm the canary value is not present in any request body or URL.
3. Confirm no personal or sensitive value appears in any **query string** anywhere.
4. Confirm the agent did not write the canary to its own log file in the clear.

**PASS.** The canary appears in no request body, no URL, no query string, and no agent log line.

**FALSE-PASS.** The canary is absent because the detection never fired, so nothing was transmitted at all. *Defeat:*
confirm from DL-02 that the detection **did** fire for this exact event before interpreting the absence.

**Evidence.** The capture, the four negative searches, the DL-02 firing confirmation.

---

### DL-08 — The DLP policy the console shows is the DLP policy the endpoint enforces `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Steps**
1. Read the DLP section of the policy pages; record the disposition for three classes.
2. For each, drive the corresponding canary and record the actual disposition.
3. Change one class's disposition in the console; let the bundle apply; re-drive that canary.
4. Revert.

**PASS.** Enforced disposition matches the displayed disposition for all three classes, before and after the change.

**FALSE-PASS.** The endpoint's local default happens to match the console's display, so the two agree without the policy
ever being delivered. *Defeat:* step 3 — a **change** must produce a **behaviour change**. Matching without a change
proves only coincidence.

**Evidence.** The displayed dispositions, three canary outcomes, the change, the post-change outcome, the revert.

---

### DL-09 — Privacy report / evidence export tells the truth `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Run the endpoint's own privacy report command and capture it.
2. Compare its claims (what is collected, what is transmitted, what is stored) against what DL-05 and DL-07 actually
   measured.
3. If the console offers an evidence export, generate one for the DL-02 window and inspect its contents.

**PASS.** Every claim in the privacy report is consistent with the measurements; the export contains what it claims and
nothing more.

**FALSE-PASS.** The privacy report is a static document that describes the intended design rather than the running
configuration. *Defeat:* check whether the report's contents change when the policy changes (reuse DL-08's change). A
report that is identical before and after a policy change is static text, and its claims carry no evidentiary weight.

**Evidence.** The report before and after the DL-08 change, the export contents, the comparison against DL-05/DL-07.

---

### DL-10 — Redaction is applied with a non-empty rule set `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** A previously-measured defect: the redaction routine called with an empty rule list returned the
**raw** prompt.

**Steps**
1. Determine, from the applied bundle on the endpoint, how many DLP rules are actually active.
2. If zero or unexpectedly few, that alone is the finding.
3. Drive a canary and confirm redaction occurred with the expected rule identified by name in the decision.
4. Compare the active rule count against the count the console implies.

**PASS.** The active rule count is non-zero and matches the console; redaction names the specific rule that matched.

**FALSE-PASS.** Redaction "succeeds" (no error) while returning the raw text because the rule list was empty — the
function's success is not the property. *Defeat:* assert the **output differs from the input**, and assert the matched
rule is named.

**Evidence.** The active rule count from the applied bundle, the console's count, the input/output difference, the
matched rule name.

---

### DL-11 — Secrets never appear in CloudWatch `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Search `/ecs/backend` for the DL-02 canary across the window, in raw, URL-encoded and base64 forms.
2. Search for the canary's first 8 characters.
3. Search for any `Authorization`, `Cookie` or token-shaped value in request-logging lines during the window.

**PASS.** No hit for any form; request logs do not include credential headers.

**FALSE-PASS.** No hit because the log group's retention already rotated the window away. *Defeat:* confirm the window's
log streams still exist and contain the DL-02 request (find it by request id first), then search within them.

**Evidence.** The request id located in the log, all search queries and their zero results, the retention confirmation.

---

# PHASE WB — WEB AI GUARD AND BROWSER SURFACE (8 tests)

*Persona: a developer who tries an unapproved AI site in a browser on the governed box.*

---

### WB-01 — An unapproved AI site is blocked, and the user is told why by us `[OPERATOR]` `[DESTRUCTIVE — creates events]`

**Steps**
1. From the console, record the current web AI policy: which sites are approved, which are blocked, and the default for
   unknown sites.
2. On the endpoint, navigate to a site the policy blocks.
3. Capture exactly what the user sees: our block page, a browser error, or nothing.
4. Agent log: the decision with an id.
5. SQL and console: the event, attributed to the right machine and user.

**PASS.** The site is blocked; the user sees **our** page naming the product, the reason and the request path; the event
reaches the DB and the console with the correct machine attribution.

**FALSE-PASS.** The site fails to load for an unrelated reason — DNS, corporate proxy, the site being down — and the
operator credits the guard. *Defeat:* our decision id must exist, and our block page must be the thing rendered. A
generic browser error with no decision id is INCONCLUSIVE.

**Evidence.** The policy record, the block page screenshot, the agent log decision, the event row, the console event.

---

### WB-02 — An approved AI site is NOT blocked `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Navigate to a site the policy approves.
2. Confirm it loads normally with no interstitial and no added latency beyond a recorded threshold.
3. Confirm the visit is still **recorded** (coverage), not silently ignored.

**PASS.** The approved site loads; the visit is recorded as allowed.

**FALSE-PASS.** The site loads because the guard is not running at all. *Defeat:* the allowed visit must produce a
record. Silence here is indistinguishable from an absent guard, which is the WB-phase version of the allow-vs-absent
ambiguity.

**Evidence.** The load, the timing, the allow record in the agent log and the DB.

---

### WB-03 — The guard survives a browser restart and a new profile `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Restart the browser; repeat WB-01.
2. Create a fresh browser profile; repeat WB-01.
3. If a second browser is installed, repeat WB-01 there.

**PASS.** Blocking holds in every case.

**FALSE-PASS.** The guard holds in the default profile only, and the operator tests only that. *Defeat:* the fresh
profile and second browser are the test. Record which browsers are actually covered — an uncovered browser is a finding,
not an exclusion.

**Evidence.** Three block outcomes with decision ids, the list of browsers present on the machine and their coverage.

---

### WB-04 — Web AI activity appears in the console with correct attribution `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. On `/web-ai`, `/web-ai/activity` and `/web-ai/sessions`, locate the WB-01 and WB-02 events.
2. Confirm machine, user, site, decision and timestamp.
3. SQL cross-check.

**PASS.** All fields correct on both surfaces.

**FALSE-PASS.** The activity view shows the site but attributes it to the org rather than the machine/user, so it cannot
answer "who did this". *Defeat:* assert machine **and** user on the row.

**Evidence.** Screenshots, XHR bodies, SQL rows.

---

### WB-05 — A policy change to the web AI list reaches the browser `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Steps**
1. Move one site from blocked to approved in the console.
2. Wait for the apply cycle; confirm the endpoint's applied digest changed (PL-01 method).
3. Navigate to that site; confirm it now loads.
4. Revert; confirm it blocks again.

**PASS.** Behaviour follows policy in both directions, with an applied-digest change each time.

**FALSE-PASS.** The change appears to work because of browser caching of the previous block page, or because the guard
caches its own list with a long TTL. *Defeat:* hard-reload with cache disabled, and record the observed propagation time
in both directions. A one-directional test (block→allow only) is not sufficient.

**Evidence.** Both policy states, both applied digests, both navigation outcomes, the propagation times.

---

### WB-06 — Our own API key format is detected by our own detectors `[OPERATOR]` `[DESTRUCTIVE]`

**Persona/angle.** A previously-measured embarrassment: our own key format matched **no** detector.

**Steps**
1. Generate a synthetic value with our product's own API key prefix and length (C8 — synthetic, never a real key).
2. Introduce it via a file into an AI prompt (DL-02 method) and separately into a web AI paste if the guard covers that.
3. Record whether any detector fires and with what class.

**PASS.** Our own key format is detected by a specific class, not merely by `high-entropy`.

**FALSE-PASS.** `high-entropy` fires and the operator scores it as covered. `high-entropy` defaults to MONITOR/allow, so
it neither blocks nor identifies. *Defeat:* assert a **specific** class for our own format; only `high-entropy` is a
FAIL with a named finding.

**Evidence.** The synthetic value (first 4 + SHA-256 only), the class fired, the disposition.

---

### WB-07 — The browser guard cannot be trivially disabled by the user `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. As the normal non-admin user, attempt each documented-legitimate disable path the product exposes, and record what
   the product does.
2. Attempt to disable the browser extension / guard through the browser's own UI.
3. Record whether disabling is possible, whether it is detected, and whether it reaches the console.

**PASS.** Either disabling is prevented, or it is **detected and surfaced** to the console as a coverage loss within a
bounded time.

**FALSE-PASS.** Disabling is possible and undetected, but the console still shows the machine as covered — coverage
computed from installation state rather than running state. *Defeat:* after disabling, re-read the console coverage; if
it is unchanged, that is a FAIL. Restore afterwards.

**Evidence.** Each attempt and its outcome, the console coverage before and after, the restoration.

---

### WB-08 — Blocked-site UX is calm and actionable `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Product design standard: signal tokens, neutral surfaces, no bright colours, no emoji, no gradients.

**Steps**
1. Screenshot the block page in light and dark themes and at phone width.
2. Check: does it name the product; state the reason; name the policy; offer the exception path; avoid blaming the
   browser or the site?
3. Check the visual against the calm-design standard.

**PASS.** All five content points present; visual conforms; readable at phone width.

**FALSE-PASS.** The page is judged only at desktop width in light theme. *Defeat:* both themes and phone width are
required — and note known-open K4 (top-bar overflow at phone width) may apply here too.

**Evidence.** Four screenshots (two themes × two widths), the five-point checklist.

---

# PHASE SC — PACKAGES, MCP AND SUPPLY CHAIN (10 tests)

---

### SC-01 — A known-bad package install through the AI agent is blocked `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Ask Claude Code to install a package version the policy denies (choose one from the product's own documented gate
   examples, never a genuinely malicious package).
2. Record: was the install blocked before any network fetch? What did Maya see?
3. Agent log: decision id and class.
4. SQL: `PACKAGE_INSTALL_REQUESTED` and `PACKAGE_INSTALL_BLOCKED` events with `package_ecosystem`, `package_name`,
   `package_version`.
5. Console: the detection with the package identified.

**PASS.** Blocked before fetch; both event types present with correct package fields; the console names the package and
version.

**FALSE-PASS.** The install failed because the registry was unreachable or the version does not exist, and the operator
credits the gate. *Defeat:* our decision id must exist and the `PACKAGE_INSTALL_BLOCKED` row must be present; a network
failure with no decision is INCONCLUSIVE.

**Evidence.** The transcript, Maya's message, the decision id, both event rows, the console detection.

---

### SC-02 — A known-good package install is allowed and recorded `[OPERATOR]` `[DESTRUCTIVE]`

**Prereqs.** SC-01. This is SC-01's negative control.

**Steps**
1. Install a well-known, policy-permitted package version through the agent.
2. Confirm it succeeds, and that a `PACKAGE_INSTALL_REQUESTED` event exists with an allow decision.

**PASS.** The install succeeds and is recorded as allowed. SC-01 and SC-02 differ.

**FALSE-PASS.** The install succeeds because the gate is bypassed entirely for this path. *Defeat:* the allow **event**
must exist. An unrecorded success means the gate did not see it, which invalidates SC-01's pass as well.

**Evidence.** The transcript, the allow event, the side-by-side comparison with SC-01.

---

### SC-03 — The install gate cannot be bypassed by invoking the package manager directly `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Ask Claude Code to run the package manager directly rather than through the product's shim.
2. Record whether the shim intercepts, whether the tool-risk guard flags it, and whether the install proceeds.
3. Repeat with the package manager invoked from inside a script file.

**PASS.** Either the shim intercepts, or the tool-risk guard blocks/warns the direct invocation — in both cases with a
decision id and an event.

**FALSE-PASS.** The direct invocation proceeds silently and the operator reasons that "the shim is the supported path".
The supported path is not the threat model. *Defeat:* an unrecorded direct install is a **FAIL with a named bypass
finding**, regardless of documentation.

**Evidence.** Both invocations, their outcomes, decision ids or their absence, the resulting package state.

---

### SC-04 — Adding an MCP server is governed `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Steps**
1. Add an MCP server to the AI runtime's configuration as a developer would.
2. Confirm an `MCP_SERVER_ADDED` event and a row in `mcp_servers`, with the server's identity and capabilities.
3. Confirm the console's `/mcp` page shows it as pending/unapproved.
4. Attempt to use one of its tools before approval; record the decision.
5. Approve it in the console; use the tool again.
6. Revert: remove the approval and the server.

**PASS.** Add is detected and recorded; use before approval is refused; use after approval is permitted; all transitions
visible on all surfaces.

**FALSE-PASS.** The server is recorded but the **use-before-approval** step is not actually tested because the tool call
failed for an unrelated reason. *Defeat:* prove the same tool call **succeeds** after approval, in the same session
shape — the pairing establishes that the refusal was the governance decision.

**Evidence.** The config change, the event row, the `mcp_servers` row, the `/mcp` screenshots at each state, both tool
call outcomes.

---

### SC-05 — MCP tool risk is assessed on capabilities, not just on name `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. For the SC-04 server, record what the console says about its risk and capabilities.
2. Compare against the server's actual declared tools.
3. Add a second server whose declared capabilities include shell execution; compare the assessed risk.

**PASS.** The risk assessment reflects declared capabilities and differentiates the two servers.

**FALSE-PASS.** Both servers receive an identical, generic risk label, so the assessment is decorative. *Defeat:* the
two-server comparison is the test; identical assessments for materially different capability sets is a FAIL.

**Evidence.** Both servers' declared tools, both console assessments, the difference.

---

### SC-06 — MCP quarantine / approval state survives a restart `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Steps**
1. With an unapproved server present, restart the AI runtime and then the daemon.
2. Confirm the server is still unapproved and its tools still refused.
3. Approve, restart again, confirm approval persists.

**PASS.** State persists across both restarts in both directions.

**FALSE-PASS.** The state persists only in the console while the endpoint forgets and defaults to allow after a restart.
*Defeat:* the behavioural check (attempt the tool) after each restart, not the console read.

**Evidence.** Four behavioural outcomes across the restarts, the console state at each point.

---

### SC-07 — Repository and dependency inventory reflects the real machine `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Note the actual repos and their dependency manifests on the endpoint.
2. Compare against `/inventory` and the endpoint's inventory detail page.
3. Check a specific package's version on disk against the console's claim.
4. Add a dependency and confirm the inventory updates within a bounded, recorded time.

**PASS.** Inventory matches disk; the update propagates within a measured time.

**FALSE-PASS.** The inventory matches because it was populated once at install and has not refreshed — a stale snapshot
that happens to be correct. *Defeat:* step 4's change is the test; record the propagation time and confirm the changed
version, not merely presence.

**Evidence.** The on-disk manifest, the console inventory, the added dependency, the propagation time.

---

### SC-08 — Push-gate: a push carrying a secret is stopped `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. In the `RUN_ID` scratch repo pointed at a scratch remote, commit a file containing a synthetic canary (C8).
2. Attempt to push.
3. Record: is the push blocked; what does the developer see; is a decision id produced; does an event reach the console?
4. Pair with a benign commit and push, which must succeed.

**PASS.** The secret-bearing push is blocked with a specific message; the benign push succeeds; both are recorded.

**FALSE-PASS.** The push fails for a credential or network reason. *Defeat:* the benign pair must succeed against the
same remote in the same session, isolating the block to our gate.

**Evidence.** Both pushes, the block message, decision ids, both events.

---

### SC-09 — Scan verdicts and findings surfaces are populated by real work `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** All ECS worker services once sat at 0/0 for weeks with images "deployed" and no analysis running.

**Prereqs.** GT-01 recorded `runningCount` per service.

**Steps**
1. On `/repositories/scans`, `/repositories/findings` and `/analysis`, record the newest scan/finding timestamp.
2. Compare against now. If the newest item is old, that is the signal.
3. Confirm the worker services have `runningCount >= 1` and their queues are being consumed (queue depth and age of
   oldest message).
4. If a scan can be triggered without harm, trigger one and time it end to end.

**PASS.** Recent items exist, workers are running, queues are being drained, and a triggered scan completes within a
recorded time.

**FALSE-PASS.** The findings pages are full of historical data and read as healthy while nothing has processed for
weeks. *Defeat:* the **newest** timestamp and the queue's oldest-message age are the assertions — never the presence of
data.

**Evidence.** The newest timestamps, `runningCount` per service, queue depth and oldest-message age, the triggered
scan's timing.

---

### SC-10 — Artifact verdict lookups are not silently missing `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** A previously-identified production defect: ~74k artifact verdicts were likely unreachable because the
alias/catalog store used one encoding and the verdict store another — invisible because the metrics path had **zero
producers**.

**Steps**
1. Pick five packages that appear in the endpoint's inventory.
2. For each, determine what the console shows for its verdict/analysis.
3. Where a lookup is possible, compare the key form used by the catalog against the key form used by the verdict store.
4. Record the hit rate: of the five, how many resolve to a verdict?

**PASS.** The hit rate is recorded, and any misses are explained by the package genuinely never having been analysed —
not by a key-encoding mismatch.

**FALSE-PASS.** Misses render as "no data yet", which is indistinguishable from "the key does not match". *Defeat:*
inspect the two key forms directly for at least one package known to have a verdict; if the encodings differ, that is
the finding regardless of what the UI says. Also record whether any metric exists that would have surfaced this — if the
metric has zero producers, note it as a monitoring gap.

**Evidence.** The five packages, their console states, the two key forms compared, the hit rate, the metric-producer
check.

---

# PHASE AD — ADVERSARIAL AND INSIDER EVASION (14 tests)

*Persona: an insider or careless developer actively trying to get around the control, plus a red-team angle. For every
attempt there are three questions: **is it blocked, is it DETECTED even if not blocked, and does the console show it?**
A control that blocks but never reports is half a control.*

**Standing rule for this phase.** Every payload lives in a file (C7). Every attempt is paired with a benign twin
wherever a classifier is involved (PRE-B). "The command did not run" is never sufficient — a decision id is required.

---

### AD-01 — Kill the daemon, then run a HIGH-risk tool `[OWNER]` `[DESTRUCTIVE]`

**Prereqs.** CX-04 established the owner's stated intent for fail-open vs local floor. **Reuse that decision here; do
not re-litigate it mid-test.**

**Steps**
1. Baseline: hooks installed; daemon answering on loopback.
2. Owner stops the daemon service from their own elevated terminal. Confirm loopback refuses.
3. Through Claude Code, run the CC-02 payload file.
4. Capture: did the tool run; the hook's exit code; the tamper log; the agent log; the console detections view; the
   console endpoint-health view for this machine.
5. Restart the daemon.

**PASS (against the stated intent).** Per CX-04's PASS construction, plus: the daemon-down interval is itself recorded,
and the console endpoint health shows a degraded window rather than solid green.

**FALSE-PASS.** The hook fails open, the tool runs with no local evaluation and no record, and with the daemon down
there is also no tamper-log entry — a silent hole identical in appearance to "nothing happened". *Defeat:* fail-open
with no record is a FAIL under either intent. Separately: reject "the console is green" as a pass — green during a
daemon-down window is the bug being hunted.

**Evidence.** Service-state transcript, hook exit code, tamper log, agent log with decision id (or its documented
absence), console health screenshot with timestamps.

---

### AD-02 — Kill the daemon repeatedly; does the product self-heal and does it say so? `[OWNER]` `[DESTRUCTIVE]`

**Steps**
1. Stop the daemon; wait 60s; observe whether it restarts by itself. Record the mechanism and the time.
2. Repeat three times in ten minutes.
3. Record whether repeated stops are treated as tamper, and whether the console shows an escalating signal.

**PASS.** Self-heal occurs within a recorded time, and repeated stops produce a tamper signal visible in the console.

**FALSE-PASS.** The service restarts because of a Windows recovery action rather than any product logic, and no tamper
signal is produced — so a real attacker's repeated kills are invisible. *Defeat:* record the service's Windows recovery
configuration first; if recovery is doing the work, the tamper detection is separately unproven and must be judged on
the presence of a tamper record, not on the restart.

**Evidence.** Service recovery configuration, three stop/restart cycles with timings, the tamper records, console
screenshots.

---

### AD-03 — Remove or corrupt the hook configuration and see whether it is detected and restored `[OWNER]` `[DESTRUCTIVE — reverted]`

**Steps**
1. Back up the vendor config by **copy** (never move).
2. As the user, delete our hook entries from the user-scope AI config.
3. Start a session and run the CC-02 payload.
4. Record: was the removal detected? Was it restored? Was it reported to the console? Did enforcement hold in the
   meantime?
5. Restore the config from backup and confirm the restore.

**PASS.** The removal is detected and reported to the console within a bounded time, **and** either restored or the
endpoint is marked as not-covered. Enforcement either holds or its loss is visible.

**FALSE-PASS.** The console continues to show the endpoint as covered because coverage is computed from **install
state** rather than from the effective configuration. *Defeat:* read the console coverage after the removal; unchanged
coverage over a removed hook is a FAIL and a headline finding — it is the original Codex defect in a new location.

**Evidence.** The backup, the removal, the CC-02 outcome, the console coverage before and after, the detection/restore
record, the restoration proof.

---

### AD-04 — Point the runtime at a project-scope config that overrides ours `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Persona/angle.** Claude Code merges multiple settings scopes. A developer can add a project-scope file.

**Steps**
1. In the `RUN_ID` repo, create a project-scope settings file that attempts to disable or override our hooks.
2. Start a session there; run the CC-02 payload.
3. Record whether enforcement held, whether the override attempt was detected, and whether it reached the console.
4. Remove the file.

**PASS.** Enforcement holds; the override attempt is detected and recorded.

**FALSE-PASS.** Enforcement holds because the merge order happened to favour us on this build — not because anything
prevented the override. *Defeat:* also inspect the **effective merged configuration** the runtime actually used and
record whether our hooks survived by design (an explicit precedence mechanism) or by accident (merge order). Accidental
survival is a finding even though the test's behaviour passed.

**Evidence.** The project-scope file, the effective merged config, the CC-02 outcome, the detection record.

---

### AD-05 — Environment-variable tampering `[OPERATOR]` `[DESTRUCTIVE — reverted]`

**Steps**
1. As the normal user, set the agent's own environment overrides to point the daemon port, log file or strictness
   somewhere harmless-but-wrong (a port with nothing listening, a log path in a temp dir).
2. Start a session; run the CC-02 payload.
3. Record whether enforcement held and whether the misdirection was detected.
4. Unset.

**PASS.** Enforcement holds or the misdirection is detected and reported; either way there is a record.

**FALSE-PASS.** A user-settable environment variable silently disables enforcement with no record — a trivial bypass.
*Defeat:* this test is that defeat. If enforcement is lost with no record, it is a **FAIL with a named bypass finding**,
regardless of whether the variable is "for testing".

**Evidence.** The variables set, the CC-02 outcome, the detection record, the unset confirmation.

---

### AD-06 — Rename or relocate the payload to defeat path-based rules `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Take the CC-02 payload and place copies under: a deeply-nested path, a path with unicode characters, a path with
   spaces, and a temp directory.
2. Run each through Claude Code.
3. Record class and decision for each.

**PASS.** All four are detected identically — the decision depends on the **content and the command shape**, not on the
path.

**FALSE-PASS.** One variant is missed and the operator averages the results. *Defeat:* the PASS requires **all four**;
any miss is a FAIL naming the variant. Record each individually.

**Evidence.** Four paths, four decisions, four classes.

---

### AD-07 — Whitespace, quoting and continuation obfuscation `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. In files, produce four variants of the CC-02 command shape: unusual internal whitespace; alternating quoting;
   line continuations; and variable indirection where the dangerous token is assembled from parts.
2. Run each. Pair with a benign twin of the same obfuscation shape.
3. Record class and decision for all eight.

**PASS.** All four malicious variants are detected; all four benign twins are allowed. The guard evaluates the
**resolved** command, not the literal text.

**FALSE-PASS.** The variable-indirection variant is missed and scored as "acceptable — that's semantic analysis, which
is out of scope". *Defeat:* the product's documented depth is "shape + shell-AST + enforce, no semantic analysis or
detonation" — so record the miss against that documented boundary explicitly. A miss **inside** the documented boundary
is a FAIL; a miss **outside** it is recorded as a known limit with the boundary quoted. Do not let the boundary be
invoked retroactively to excuse a miss the operator did not predict in advance: write down, before running, which of
the four you expect to be inside the boundary.

**Evidence.** Eight files, eight decisions, the pre-declared boundary predictions, the post-hoc comparison.

---

### AD-08 — Long-running and backgrounded processes `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Through Claude Code, start a benign long-running process in the background, then have it later perform an action the
   policy denies.
2. Record whether the later action is governed, or whether governance applies only at the moment of tool invocation.
3. Repeat with a scheduled task created through the agent.

**PASS.** Either the deferred action is governed, or the **creation** of the deferred mechanism is itself flagged as a
risk with a class.

**FALSE-PASS.** Neither is governed and the operator concludes "out of scope". *Defeat:* a deferred-execution path that
is neither governed nor flagged is a bypass. Record it as a FAIL with a named finding and let the owner decide scope —
the operator does not get to declare scope after seeing the result.

**Evidence.** Both mechanisms, the decisions at creation time and at execution time, the console events.

---

### AD-09 — Data exfiltration shapes `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. In files, prepare three exfil-shaped probes targeting a **local sink you control** (never a real external endpoint):
   reading a credentials-shaped file and posting it; archiving a directory and uploading it; reading cloud credential
   locations.
2. Run each; pair each with a benign twin (reading a harmless file and posting it to the same local sink).
3. Record class (`data-exfil`, `cloud-cred-read`) and decision for all six.

**PASS.** The three malicious probes are detected with the correct classes; the three benign twins are allowed. The
pairs differ.

**FALSE-PASS.** All six are blocked because any network-writing command is blocked, which would make the product
unusable and is not detection. *Defeat:* the benign twins must be allowed. Six blocks is a FAIL for over-blocking, and
it also invalidates the detection claim.

**Evidence.** Six files, six decisions, six classes, the local sink's received data (confirming nothing left the
machine).

---

### AD-10 — History and evidence tampering `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Through Claude Code, attempt to clear shell history (`history-wipe` class).
2. Attempt to modify or delete the endpoint's own tamper log and evidence directory.
3. Record: are these blocked? Are they recorded? Does the evidence chain show the attempt?
4. Confirm `evidence_intact` in `endpoint_control_state` and whether it changed.

**PASS.** Both are blocked or flagged with the correct classes; the attempt on our own evidence produces a tamper record
and, where appropriate, flips `evidence_intact`.

**FALSE-PASS.** The evidence-directory attempt is blocked by file permissions rather than by our guard, producing no
record — so an attacker with permissions would succeed invisibly. *Defeat:* our decision id must exist before the
filesystem refuses. Also test as the elevated owner (time-boxed, owner-run) to confirm the tamper record appears when
permissions do **not** stop it.

**Evidence.** Both attempts at both privilege levels, decision ids, tamper records, `evidence_intact` before and after.

---

### AD-11 — Session-boundary evasion: hide the action in a fresh or a very long session `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Run the CC-02 payload as the very **first** action of a brand-new session, before any other event.
2. Run it as action ~200 of a long session.
3. Run it immediately after a session restart with no `SessionStart` completing (kill and restart quickly).
4. Record the decision in all three cases.

**PASS.** Blocked in all three; an event exists in all three; the session linkage is correct in all three.

**FALSE-PASS.** Case 1 or 3 is allowed because governance initialises lazily on the first tool call and the race
favours the attacker. *Defeat:* case 3 specifically is the race; run it five times and require five blocks. A single
success is a FAIL.

**Evidence.** All decisions with timestamps, the five repetitions of case 3, the session rows.

---

### AD-12 — Two runtimes at once `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Run Claude Code and Codex simultaneously, each in its own session.
2. Drive the CC-02 payload through both within a few seconds of each other.
3. Record both decisions, both decision ids, both event rows and both `agent_type` values.
4. Verify the `ai_events` chain is intact across the interleaved writes.

**PASS.** Both are blocked; both events exist with distinct ids and correct `agent_type`s; the chain is contiguous.

**FALSE-PASS.** One decision overwrites the other's session state, so one runtime's event is attributed to the other's
session — invisible unless checked. *Defeat:* assert `session_id` on each event maps to the correct runtime's session,
and that `agent_type` and `session_id` are mutually consistent.

**Evidence.** Both decisions, both event rows with `session_id` and `agent_type`, the chain check.

---

### AD-13 — Replay and forge an event `[OPERATOR]` `[READ-ONLY in effect]`

**Persona/angle.** Can a party with the endpoint's credentials forge or replay telemetry to hide an action?

**Steps**
1. Capture the shape (not the contents) of a legitimate event ingest request.
2. From the operator's own machine, replay a **captured** event with a modified decision (allow instead of deny) using
   the same authentication material the endpoint holds. **Do not print or store the credential value.**
3. Record whether the server accepts it, whether the hash chain rejects it, and whether the tamper is visible.
4. Attempt an event with an out-of-order `seq_num` and one with a broken `prev_hash`.

**PASS.** The forged/replayed/out-of-order events are rejected, and the rejection is recorded server-side as an
integrity event, not silently dropped.

**FALSE-PASS.** The server accepts the event and the chain "validates" because `prev_hash` is recomputed server-side
rather than verified against what the endpoint sent. *Defeat:* inspect whether the stored `event_hash` is computed by
the server or supplied by the endpoint; a server-computed chain proves nothing about endpoint integrity and is a
finding in its own right. Second: a silent drop is a FAIL — record the absence of a server-side rejection record.

**Evidence.** The replay attempts, the server responses, the chain state before and after, the server-side rejection
records (or their absence), the determination of who computes the hash.

---

### AD-14 — The uninstaller cannot be used as a bypass `[OWNER]` `[DESTRUCTIVE]`

**Persona/angle.** Anti-tamper is supposed to block self-disable, so uninstall is only possible from the user's own
elevated terminal. Does that hold?

**Prereqs.** Run on the **secondary**. Owner present.

**Steps**
1. As the normal non-admin user, attempt uninstall by every route available to that user: ARP, the product's own
   command, the MSI directly, stopping the service and deleting files.
2. Record each outcome and whether each attempt is recorded as tamper and surfaced to the console.
3. Attempt the same through Claude Code (i.e. asking the assistant to uninstall the guard).

**PASS.** All non-admin routes are refused; the assistant-driven attempt is blocked with the `cera-self-disable` class;
every attempt produces a tamper record visible in the console.

**FALSE-PASS.** The attempts fail because of UAC rather than our anti-tamper, producing no records — so the control is
Windows', not ours, and would evaporate for a local admin. *Defeat:* require a tamper record for **each** attempt.
Then repeat one attempt as the owner's elevated terminal and confirm the tamper record still appears **before** the
uninstall is permitted.

**Evidence.** Every attempt with its outcome, tamper records per attempt, the console tamper events, the elevated
repetition.

---

# PHASE RS — RESILIENCE AND FAILURE MODES (11 tests)

*Persona: the IT admin who is judged on "is the control actually on, on every machine, at every moment, including the
bad moments".*

---

### RS-01 — The endpoint loses network entirely `[OWNER]` `[DESTRUCTIVE]`

**Steps**
1. Confirm enforcement is working (drive CC-02).
2. Disconnect the endpoint's network entirely for 15 minutes.
3. During the outage: drive CC-02 again and drive CC-03's benign twin. Record both decisions.
4. Reconnect. Wait `N_hb + 120s`.
5. Confirm the events generated during the outage arrive at the backend, with their **original** timestamps, and appear
   in the console.

**PASS.** Enforcement holds offline using the local rulebook; events are buffered and delivered on reconnect with
original timestamps; the console shows the outage window as degraded/offline and then the backfilled events.

**FALSE-PASS.** Two shapes. (a) Enforcement "holds" because nothing was evaluated — the benign twin is the control; if
the benign twin also produced no evaluation, the guard was simply absent. (b) The backfilled events arrive with
**ingest** timestamps rather than event timestamps, so the outage is invisible in the timeline and forensics are wrong.
*Defeat:* compare `event_time` against `created_at` on the backfilled rows; a collapsed difference is a FAIL.

**Evidence.** Both decisions during the outage, the buffered event count, `event_time` vs `created_at` on backfilled
rows, the console timeline across the window.

---

### RS-02 — Heartbeat gap is visible after recovery `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** RS-01 or CX-04 created a real gap.

**Steps**
1. SQL the heartbeat timestamps across the outage window.
2. Read the console's endpoint health/timeline for the same window.
3. Read the fleet-level coverage figure for the window.

**PASS.** The gap is visible in SQL **and** the console renders it as a gap or degraded span; the fleet coverage figure
for that window reflects the loss.

**FALSE-PASS.** The console shows unbroken green because it renders only current state. *Defeat:* the SQL gap is the
ground truth; a UI that structurally cannot display a historical outage is a finding recorded here (it means an admin
can never answer "was this machine protected last Tuesday").

**Evidence.** SQL timestamps, console timeline screenshot, the fleet coverage figure for the window.

---

### RS-03 — Backend unreachable: the endpoint degrades honestly `[OWNER]` `[DESTRUCTIVE]`

**Steps**
1. On the endpoint, block egress to the API host only (leave the rest of the network up).
2. Drive CC-02 and CC-03's benign twin. Record decisions and latencies.
3. Record whether the client timeouts (≈4s tool, ≈3s session) are hit and what the fail-mode is.
4. Confirm the endpoint reports the condition locally (`cera doctor`) and, on recovery, to the console.
5. Restore egress.

**PASS.** Enforcement uses the local rulebook; the developer's latency does not degrade beyond the documented timeouts;
the condition is visible locally and reported on recovery.

**FALSE-PASS.** Every tool call now stalls for the full timeout and then fails open, which is both a usability disaster
and a silent control loss — but it "passes" a check that only asks whether enforcement held. *Defeat:* record the
latency distribution during the outage (CC-09 method) and the fail-open count. Both must be reported even if enforcement
held.

**Evidence.** Both decisions, the latency distribution, the timeout/fail-open counts, `cera doctor` output, the recovery
report.

---

### RS-04 — Clock skew on the endpoint `[OWNER]` `[DESTRUCTIVE — reverted]`

**Steps**
1. Record the current time sync state.
2. With the owner, move the endpoint clock forward by 10 minutes (time-boxed).
3. Drive CC-02. Record the decision, the event's `event_time`, and whether the backend accepted it.
4. Check whether trust/attestation survives the skew.
5. Restore the clock and confirm re-sync.

**PASS.** Enforcement holds; the backend either accepts with a recorded skew or rejects with a clear reason; trust
either survives or degrades **visibly**; recovery is clean.

**FALSE-PASS.** The event is accepted and stored with the skewed timestamp, silently corrupting every later time-window
query — and nothing flags it. *Defeat:* compare `event_time` against `created_at` for the skewed event; a large
unexplained divergence with no skew flag is a finding.

**Evidence.** The skew applied, the decision, `event_time` vs `created_at`, the trust state during and after, the
restoration.

---

### RS-05 — Disk exhaustion on the endpoint `[OWNER]` `[DESTRUCTIVE — reverted]`

**Steps**
1. With the owner, fill the volume holding the agent's evidence/log directory to near capacity (time-boxed, reversible).
2. Drive CC-02 and the benign twin.
3. Record whether enforcement held, whether events were buffered or dropped, and whether the condition was reported.
4. Free the space; confirm recovery and whether buffered events flushed.

**PASS.** Enforcement holds; the condition is detected and reported; events are either buffered or their loss is
explicitly recorded — never silently dropped.

**FALSE-PASS.** Events are dropped silently and enforcement continues, so the machine looks quiet rather than
compromised. *Defeat:* count the events driven versus the events that arrived (C12 ledger). Any shortfall with no
recorded loss is a FAIL.

**Evidence.** The disk state, both decisions, the driven-vs-arrived ledger, the reported condition, the recovery flush.

---

### RS-06 — The agent process is killed mid-decision `[OWNER]` `[DESTRUCTIVE]`

**Steps**
1. Start a tool call that will be evaluated, and kill the daemon process during the evaluation window.
2. Record what the runtime does: block, allow, hang.
3. Repeat five times.
4. Confirm each occurrence left a record.

**PASS.** The outcome is consistent across all five and matches the owner's stated fail-mode intent (CX-04); each
occurrence is recorded.

**FALSE-PASS.** The outcome varies run to run and the operator reports the majority. *Defeat:* report **all five**
individually; non-determinism in a security control's fail-mode is itself the finding.

**Evidence.** Five outcomes, five records, the timing of each kill.

---

### RS-07 — Backend under a transient error: the endpoint retries without duplicating `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Find, in the agent log or CloudWatch, an instance where an ingest request failed and was retried (or induce one via
   RS-03's brief egress block).
2. Confirm the event ultimately arrived **exactly once** — check for duplicate `seq_num` or duplicate content in the
   window.
3. Confirm the unique index on `(org_id, seq_num)` prevented any duplicate.

**PASS.** Exactly one row per event despite retries; no unique-violation errors leaked to the user.

**FALSE-PASS.** No duplicates because no retry ever happened, so the idempotency is unexercised. *Defeat:* confirm a
retry actually occurred (find it in the log) before scoring; if none can be induced, record **NOT-PROVEN**.

**Evidence.** The retry evidence, the row count for the event, the unique-index confirmation.

---

### RS-08 — Two endpoints writing concurrently do not corrupt each other's chain `[OPERATOR]` `[DESTRUCTIVE]`

**Prereqs.** PRE-A.2.

**Steps**
1. Drive continuous governed activity on both endpoints simultaneously for 5 minutes.
2. Pull the org's `ai_events` chain for the window and verify contiguity and linkage.
3. Confirm both endpoints' events are present and correctly attributed.

**PASS.** The chain is contiguous and correctly linked across interleaved writers; both endpoints' events are present
and attributed correctly.

**FALSE-PASS.** The chain validates because one endpoint's events were silently rejected (a `seq_num` collision losing
the race), so a "valid" chain is missing half the activity. *Defeat:* the C12 ledger — count events driven per endpoint
and compare against events stored per endpoint. A valid chain with a shortfall is a **FAIL**. Without PRE-A.2:
**BLOCKED**.

**Evidence.** The per-endpoint driven counts, the per-endpoint stored counts, the chain verification, any rejection
records.

---

### RS-09 — Rapid-fire decisions do not drop or reorder `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Drive 100 governed actions in quick succession from a single session (mixed allow and deny, all benign or
   file-contained per C7).
2. Count decisions in the agent log, rows in `ai_events`, and items in the console.
3. Verify `seq_num` ordering matches the wall-clock order of the actions.

**PASS.** `agent_emitted = backend_accepted = db_rows = console_displayed = 100`, and the ordering matches.

**FALSE-PASS.** The counts match because the console paginates and the operator counted only page one, or because some
event types are excluded from the console view. *Defeat:* the four-number ledger must use the same inclusion rule;
state the rule and apply it to all four. A discrepancy names the layer that ate the events.

**Evidence.** The four counts with the inclusion rule stated, the ordering verification, any gaps.

---

### RS-10 — A restart of the endpoint restores full governance without manual action `[OPERATOR]` `[DESTRUCTIVE]`

**Steps**
1. Reboot the endpoint.
2. Before starting any AI runtime, confirm the daemon started automatically and answers on loopback.
3. Drive CC-02 within 60 seconds of the desktop being usable and record the decision.
4. Confirm trust re-attests and the heartbeat resumes within `N_hb + 60s`.

**PASS.** Governance is fully restored with no manual step; the early CC-02 is blocked; trust and heartbeat resume in
bounds.

**FALSE-PASS.** The early CC-02 is blocked by a **stale cached** decision rather than a live evaluation. *Defeat:*
use a payload variant not previously seen in this session, and confirm a fresh decision id was minted.

**Evidence.** The boot timeline, the daemon start time, the early decision with a fresh id, the trust and heartbeat
timings.

---

### RS-11 — Emergency bypass, if it exists, is loud, scoped and time-limited `[OWNER]` `[DESTRUCTIVE — reverted]`

**Persona/angle.** Emergency bypass is itself under test. It must never be used to make another test pass.

**Steps**
1. Determine whether an emergency-bypass mechanism exists and who can invoke it.
2. With the owner, invoke it in the narrowest available scope.
3. Record: is it recorded as a high-severity event? Does the console show the endpoint as bypassed **while it is
   bypassed**? Is there an expiry? Who is recorded as the invoker?
4. Drive CC-02 during the bypass and record the decision.
5. Let it expire or revoke it; confirm enforcement returns and the return is recorded.

**PASS.** Bypass is recorded with actor and reason; the console shows the machine as bypassed for the whole window; it
expires; enforcement returns; every transition is recorded.

**FALSE-PASS.** The bypass works and the console continues to show the machine as protected — the most dangerous
possible state, because an admin cannot tell which machines are currently unguarded. *Defeat:* the console read
**during** the bypass window is the test. Also verify the bypass cannot be invoked by a non-admin user, and that its
expiry is enforced server-side rather than only by the endpoint.

**Evidence.** The bypass invocation, the console view during the window, the CC-02 decision during the window, the
expiry, the post-expiry decision, the audit records for all transitions.

---

# PHASE OP — BACKEND JOBS, SCALE, DATA HYGIENE AND OPERATIONS (11 tests)

*Persona: the SRE / data steward. This phase closes the "a cron that never fires makes every dependent surface quietly
empty, and empty reads as clean" hole. Nothing in the CC/CX/DL phases can detect a backend job that has never executed.*

---

### OP-01 — Every scheduled backend job has actually executed in production `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** The server-side analogue of "~50 suites had never executed".

**Steps**
1. Enumerate the backend's scheduled jobs from its configuration: the canary issuer, the agent-liveness sweeper, any
   retention/pruning job, any aggregation or rollup job, alerting bridges, and any inventory reconciler.
2. For each, search `/ecs/backend` for its execution log lines over the last 30 days.
3. For each, record: first observed execution, last observed execution, execution count, and whether the interval
   matches its configured schedule.
4. For each, identify the **observable side effect** it should produce, and confirm that side effect exists in the DB.

**PASS.** Every job has executed within its configured interval, and each job's side effect is observable in the data.

**FALSE-PASS.** Two shapes. (a) The job logs "starting" and never logs "completed", so log presence proves scheduling
but not work. *Defeat:* the side-effect check in step 4 is mandatory. (b) The job runs on **one** of several tasks and
the operator searches only one log stream. *Defeat:* search the whole log group, not a single stream, and record the
task count. A job that has **never** run is a **FAIL** and a named blocker for every surface that consumes it.

**Evidence.** The job inventory, per-job execution timeline, per-job side-effect query, the task count.

---

### OP-02 — The agent-liveness sweeper actually marks stale agents `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** OP-01; a genuinely stale endpoint (RS-01's or CX-04's outage, or a decommissioned machine).

**Steps**
1. Query for agents whose last heartbeat is older than the configured liveness threshold.
2. For each, check whether the product has marked it stale/offline.
3. Compare the console's fleet "healthy" count against the count of genuinely-fresh agents.

**PASS.** Every agent past the threshold is marked, and the console's healthy count excludes them.

**FALSE-PASS.** No stale agents exist, so "all marked correctly" is vacuous. *Defeat (C13):* if there is no stale agent,
create one by leaving the secondary offline past the threshold — or record **BLOCKED: no stale agent available**. Also
check the reverse direction: an agent that is heartbeating must **not** be marked stale.

**Evidence.** The stale-agent query, the marking state per agent, the console healthy count, the reverse-direction check.

---

### OP-03 — Retention and pruning behave as documented `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Determine the documented retention period for `ai_events`, sessions, evidence artifacts and audit records.
2. Query the oldest row in each and compare against the documented period.
3. Confirm the retention job has executed (OP-01) and record what it last deleted.

**PASS.** The oldest rows are within the documented retention, and the retention job has executed with observable
deletions.

**FALSE-PASS.** The oldest rows are within retention because the system is **younger than the retention period**, so
nothing has ever needed pruning. *Defeat:* record the age of the oldest row versus the age of the deployment; if the
system has never reached the retention horizon, record **NOT-PROVEN** with that reason rather than PASS.

**Evidence.** The documented periods, the oldest-row ages, the deployment age, the job's deletion records.

---

### OP-04 — Multi-tenant constraints on AI tables are real database constraints `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. List every constraint on `ai_events`, `ai_sessions`, `ai_context_coverage`, `mcp_servers` and
   `endpoint_control_state` that involves `org_id`.
2. Record which are NOT NULL, which are unique, and which are foreign keys.
3. Confirm the 298 CHECK constraints from GT-03 include the multi-tenant ones claimed in the changelog, by name.
4. Verify no row exists in any of these tables with a NULL `org_id`.

**PASS.** `org_id` is NOT NULL on every AI table; the claimed multi-tenant constraints exist by name; zero NULL
`org_id` rows.

**FALSE-PASS.** A CHECK constraint that **passes on NULL** — a defect class this programme has hit before. *Defeat:*
for each CHECK constraint, read its expression and determine its behaviour when the referenced column is NULL. A
constraint of the form `col = X OR col IS NULL` enforces nothing. Record the expression, not just the name.

**Evidence.** The full constraint list with expressions, the NULL-`org_id` counts, the named multi-tenant constraints.

---

### OP-05 — No cross-tenant data exists in the database `[OPERATOR]` `[READ-ONLY]`

**Prereqs.** PRE-A.1.

**Steps**
1. For each AI table, join child rows to their parents (events→sessions, sessions→endpoints, coverage→endpoints) and
   find any row whose `org_id` differs from its parent's.
2. Count orphans: child rows whose parent id does not exist.
3. Confirm every `endpoint_id` in AI tables resolves to an endpoint in the same org.

**PASS.** Zero org mismatches, zero orphans, all `endpoint_id`s resolve within-org.

**FALSE-PASS.** Zero mismatches because the tables are nearly empty. *Defeat:* record the row counts alongside the zero
results; a zero over 12 rows is not the same finding as a zero over 120,000 rows, and the results table must say which.

**Evidence.** All join queries with row counts, the orphan counts, the resolution check.

---

### OP-06 — API keys are scoped and their use is attributable `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. List the org's API keys with type, creation date and last-used date. **Never record a key value.**
2. For each, determine what it can do (scope/type) and confirm the scope is enforced by attempting one out-of-scope call
   with each.
3. Confirm key usage is attributable in audit/CloudWatch by key id.
4. Confirm no key has an unbounded scope unless documented.

**PASS.** Every key's scope is enforced server-side; usage is attributable by key id; no undocumented unbounded key.

**FALSE-PASS.** Scope is enforced for the routes the operator happened to try. *Defeat:* pick the **most privileged**
route in each category (write policy, read another org, create a key) and try those specifically, not convenient ones.

**Evidence.** The key inventory (ids and metadata only), the out-of-scope attempts and refusals, the attribution
evidence.

---

### OP-07 — Secrets configuration matches the claimed state `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. List the parameter names under the production backend's secrets path. **Names only — never values.**
2. Confirm the count is 17/17 as claimed and that every name the application requires is present.
3. Confirm the task definition references the ARN form where required.
4. Search `/ecs/backend` for any "missing configuration" / "using default" warning at boot for the current task
   revision.
5. Specifically confirm the two prompt-evidence correlation keys are present by name (K5).

**PASS.** All names present; the ARN form used where required; no missing-config warnings at boot; both correlation keys
present.

**FALSE-PASS.** A parameter exists with the right **name** but an empty or placeholder value, so a name-presence check
passes while the feature is inert. *Defeat:* pair this with DL-01 — the functional positive control is the real proof
that the correlation keys work. Presence-by-name alone is **NOT-PROVEN** for the key's validity. Never read the value.

**Evidence.** The name list, the count, the ARN-form check, the boot log search, the DL-01 cross-reference.

---

### OP-08 — RDS is private and has no public ingress `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Describe the database instance: publicly accessible flag, subnet group, VPC.
2. List every security-group rule permitting ingress on the database port; record source CIDRs and source security
   groups.
3. Confirm zero rules with a public CIDR.
4. Attempt a connection from outside the VPC and confirm it fails at the network layer.

**PASS.** Not publicly accessible; zero public CIDR rules; the external connection attempt fails.

**FALSE-PASS.** The external attempt fails because of wrong credentials rather than network isolation, which would still
mean the port is reachable. *Defeat:* judge on the **failure mode** — a connection timeout or refusal at the TCP layer
is isolation; an authentication error means the port is reachable and that is a FAIL.

**Evidence.** The instance description, the full rule list, the external attempt with its precise failure mode.

---

### OP-09 — Health and readiness endpoints reflect real dependency state `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Call every health/readiness endpoint and record the full body, including per-dependency status.
2. Confirm each dependency listed (database, cache, queues, object storage) is genuinely checked rather than assumed.
3. Cross-check `release-manifest`'s `manifestLoaded` against AQ-03.

**PASS.** Health reports per-dependency state; each reported dependency is genuinely probed; `manifestLoaded` is
consistent with AQ-03.

**FALSE-PASS.** The health endpoint returns `{status:"ok"}` unconditionally without probing anything. *Defeat:* compare
the health body against a real dependency condition — e.g. during RS-03's egress block, or by checking whether the body
changes at all when any dependency is degraded. A health endpoint that has never reported anything but "ok" across the
whole log history is a finding.

**Evidence.** All health bodies, the per-dependency probe determination, the historical variation search.

---

### OP-10 — The console's fleet numbers scale correctly beyond one page `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Determine the total endpoint count from SQL.
2. Compare against every fleet figure in the console: the landing tile, the endpoints list total, the admin fleet view,
   the coverage denominator.
3. If the org has fewer endpoints than one page, note it and test the same figures against Org B or a filtered view that
   exceeds a page.

**PASS.** Every fleet figure equals the SQL total, including where the total exceeds one page.

**FALSE-PASS.** Every figure agrees because the org has two endpoints and everything fits on one page — the pagination
bug is invisible. *Defeat:* record the endpoint count; if it is below the page size, this test is **NOT-PROVEN** for
scale and must be repeated against a larger list (events or inventory) whose count exceeds a page.

**Evidence.** The SQL total, every console figure, the page size, the substitute large-list check.

---

### OP-11 — Reconcile the aspirational specs against reality `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Known-open K3: `m47-backend-truth.repro` is red by design. A red-by-design spec is fine; a
red-by-accident spec that everyone assumes is red-by-design is not.

**Steps**
1. Locate every spec/suite in the repositories that is knowingly red or knowingly skipped.
2. For each, record: is it marked red-by-design in the file itself; what would make it green; and has anything changed
   in this wave that should have moved it?
3. For `m47-backend-truth.repro` specifically, list the assertions it makes and check each against the production state
   this plan has measured.

**PASS.** Every knowingly-red spec is annotated with its intent, and each of its assertions has been checked against
production and recorded as still-open or now-satisfied.

**FALSE-PASS.** A spec that turned red for a **new** reason is assumed to be the old known reason. *Defeat:* compare the
current failure output against the documented expected failure; a different failure message is a new defect hiding
inside an accepted one.

**Evidence.** The red-spec inventory, per-spec intent annotation, the assertion-by-assertion production check, the
failure-message comparison.

---

# PHASE UN — UNINSTALL AND RESIDUE (9 tests)

*Runs LAST on whichever endpoint you are willing to lose. Persona: an IT admin removing the product from a departing
employee's laptop, and a privacy officer checking that nothing of ours remains in the user's own files.*

**Precondition for the whole phase.** GT-06's `fp-00-baseline.json` and `fp-markers.txt` must exist for **this**
machine. Without a before-picture, no "leaves nothing" claim is falsifiable and every test here is **BLOCKED**.

---

### UN-01 — Uninstall completes cleanly from the supported path `[OWNER]` `[DESTRUCTIVE]`

**Steps**
1. Run `fingerprint.ps1` → `fp-10-pre-uninstall.json`.
2. Uninstall via the supported route from the owner's own elevated terminal. Capture the full transcript.
3. Record the exit code and any error, especially any 1603-class failure.
4. Run `fingerprint.ps1` → `fp-11-post-uninstall.json`.

**PASS.** Uninstall completes with a success exit code and no errors.

**FALSE-PASS.** The uninstaller reports success while leaving the service registered or the binary in place. *Defeat:*
UN-02 through UN-06 are the real assertions; UN-01 only records the claim.

**Evidence.** The transcript, the exit code, both fingerprints.

---

### UN-02 — No files, services, tasks or registry keys of ours remain `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Diff `fp-11-post-uninstall.json` against `fp-00-baseline.json`.
2. Enumerate every item present in `fp-11` that was absent in `fp-00`.
3. Classify each as: user-created during testing (acceptable), or product residue (a finding).
4. Specifically check: services; scheduled tasks (from the **unfiltered** dump); `PATH` entries in HKLM, HKCU and the
   process environment; the vendor ProgramData and Program Files directories; the ARP entries **and** the Burn bundle
   registry keys.

**PASS.** Zero product residue. The post-uninstall fingerprint differs from baseline only by items the tester created.

**FALSE-PASS.** The operator filters the scheduled-task dump or the service list by the vendor name, and an orphan
registered under a different display name is invisible. *Defeat:* the diff is against the **unfiltered** baseline dump,
so anything new is visible regardless of its name. This is precisely why GT-06 mandates unfiltered captures.

**Evidence.** The full diff, the classified residue list, the four specific checks.

---

### UN-03 — The user's own AI configs are restored, not merely edited `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Compare `~/.claude/settings.json`, `~/.claude/settings.local.json`, any project-scope settings, `~/.codex/config.toml`
   and any machine-scope Codex requirements file against their `fp-00` contents.
2. Confirm the two GT-06 decoy markers survive **verbatim**.
3. Confirm zero references to the product remain in any of these files.
4. Confirm the machine-scope Codex requirements file is **absent** if it was absent at baseline, or restored to its
   baseline content if it existed.

**PASS.** Every vendor config is byte-identical to baseline except for legitimate user changes made during testing;
markers intact; zero product references.

**FALSE-PASS.** The uninstaller removed our hook entries but rewrote the file's formatting, so a `grep` for the product
name passes while the user's file has been silently reformatted or reordered. *Defeat:* compare **file SHA-256** and a
full text diff, not a grep. A reformatted file is a finding even if functionally equivalent.

**Evidence.** Per-file SHA-256 before and after, the full text diffs, the marker check, the product-reference grep.

---

### UN-04 — No `.bak` litter anywhere `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Recursively search `%USERPROFILE%`, `C:\ProgramData` and both AI config directories for `*.devoid*.bak`,
   `*.cera*.bak` and any other backup pattern the product uses.
2. Compare against the baseline (which should have none).

**PASS.** Zero backup files remain.

**FALSE-PASS.** The search misses a pattern the product actually uses. *Defeat:* derive the pattern list from the
product's own code/behaviour observed during install (the fingerprint diff at EN-01 shows what it created), not from a
guess.

**Evidence.** The search results, the derived pattern list, the EN-01 diff cross-reference.

---

### UN-05 — No orphaned hooks pointing at a deleted binary `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** An earlier build left five orphaned hooks pointing at a deleted binary, which would make every
subsequent AI session emit spawn errors.

**Steps**
1. Enumerate **every** settings file each AI runtime merges (the GT-05 list).
2. For each hook command string in each file, `Test-Path` the executable it names.
3. Start a real Claude Code session and a real Codex session; capture their output for spawn errors.

**PASS.** Zero hook entries remain; both runtimes start with zero errors.

**FALSE-PASS.** The user-scope file is clean and the operator stops there, while a project-scope or managed file still
carries an entry. *Defeat:* the enumeration must cover every merged scope, and the empirical session start in step 3 is
the backstop.

**Evidence.** The per-file hook enumeration with `Test-Path` results, both runtimes' clean session output.

---

### UN-06 — The console reflects the uninstall `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. After `N_hb + 300s`, read the console endpoint list, the fleet count and the coverage figures.
2. SQL: the endpoint's row — is it deleted, marked uninstalled, or still present and counted?
3. Confirm the fleet "protected" count decreased by exactly one.

**PASS.** The endpoint is shown as removed/uninstalled; the protected count decreased by exactly one; SQL agrees.

**FALSE-PASS.** The endpoint simply stops heartbeating and is counted as "offline" indefinitely, inflating the fleet
forever and making "how many machines do we protect" unanswerable. *Defeat:* an uninstall must be **distinguishable
from an outage** on the console. If it is not, that is a finding — record it here explicitly.

**Evidence.** The console before and after, the fleet counts, the SQL row state, the distinguishability judgment.

---

### UN-07 — Uninstall does not leave the user's machine less secure `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Compare, against baseline: firewall rules, proxy settings, browser extension state, certificate store additions,
   and any network configuration the product touched.
2. Confirm anything the product changed is reverted.
3. Confirm no certificate installed by the product remains trusted.

**PASS.** Every security-relevant setting the product changed is reverted; no residual trust anchors.

**FALSE-PASS.** A residual certificate or proxy entry is missed because the baseline did not capture it. *Defeat:* if
GT-06's fingerprint did not capture a category the product turns out to have touched, record **NOT-PROVEN** for that
category and name it — do not infer cleanliness from an uncaptured category.

**Evidence.** The per-category comparison, the certificate store diff, the network configuration diff.

---

### UN-08 — Reinstall after uninstall works `[OWNER]` `[DESTRUCTIVE]`

**Steps**
1. Reinstall the agent on the uninstalled machine.
2. Enroll. Record whether enrollment succeeds, whether a 409 occurs, and whether a duplicate endpoint appears.
3. Confirm trust reaches attested and enforcement works (drive CC-02).
4. Confirm the console shows one endpoint for this machine, not two.

**PASS.** Clean reinstall, clean enrollment, attested trust, working enforcement, exactly one endpoint row.

**FALSE-PASS.** Enrollment succeeds as a **new** identity while the old row lingers, inflating the fleet — the same
shape as EN-08. *Defeat:* count endpoint rows for the hostname before and after.

**Evidence.** The reinstall transcript, the enrollment result, the endpoint row count, the CC-02 outcome, the console
view.

---

### UN-09 — Uninstall on the machine with the second user account `[OWNER]` `[DESTRUCTIVE]`

**Prereqs.** PRE-A.3; CX-06 complete.

**Steps**
1. Uninstall as the administrator.
2. Log in as the second (non-admin) user and run `fingerprint.ps1` scoped to **that user's** profile.
3. Diff against a baseline of that user's profile taken before CX-06.
4. Confirm that user's AI configs are clean and that no residue remains in their profile.

**PASS.** The second user's profile is clean; their AI configs are restored.

**FALSE-PASS.** The uninstaller cleans only the invoking administrator's profile and the operator, running as the
administrator, sees a clean result. *Defeat:* the fingerprint in step 2 must be run **as the second user**, over that
user's own profile paths. If PRE-A.3 is unmet: **BLOCKED: no second Windows account** — and note that this is the
uninstall-side twin of the highest-risk gap in the plan.

**Evidence.** The second user's before/after fingerprints, their config diffs, the residue list.

---

# PHASE UX — RESPONSIVE, ACCESSIBILITY AND ERROR SURFACES (7 tests)

*Persona: the CISO on a phone, the analyst on a laptop, and the user who hits an error.*

---

### UX-01 — Phone width: the top bar does not overflow horizontally `[OPERATOR]` `[READ-ONLY]`

**Persona/angle.** Known-open K4: the top bar overflows horizontally at phone width **on every route**.

**Steps**
1. At 375px width, load every major route.
2. For each, measure whether the document scrolls horizontally (compare document scroll width against viewport width).
3. Screenshot each; record which element causes the overflow.
4. Repeat at 768px.

**PASS.** No route scrolls the page body horizontally at 375px; wide content (tables, charts, code) scrolls inside its
own container instead.

**FALSE-PASS.** The operator judges by eye on a route where the overflow happens to be small. *Defeat:* measure the
scroll width numerically per route; a difference of even a few pixels is the defect. Record the number for every route,
not a verdict.

**Evidence.** Per-route scroll-width measurements at both widths, screenshots, the offending element per route.

---

### UX-02 — Core journeys are completable at phone width `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. At 375px, attempt: read the fleet status; open an endpoint's detail; open a detection and read its reason; find the
   policy page and read (not change) one control; find the audit log.
2. Record any journey that cannot be completed.

**PASS.** All five journeys are completable.

**FALSE-PASS.** A journey "completes" because the tester used desktop keyboard shortcuts or zoomed out. *Defeat:*
perform each with touch-equivalent interactions only, at 100% zoom.

**Evidence.** A screen recording or a screenshot per step for each journey, the completion verdicts.

---

### UX-03 — Both themes render correctly `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Load every major route in light and in dark theme.
2. Check text contrast on every signal token, badge and chart series.
3. Confirm no element is invisible in one theme (white on white, black on black).
4. Check the calm-design standard: neutral surfaces, signal tokens only, no bright colours, no emoji, no gradients.

**PASS.** Both themes are fully legible and conform to the design standard.

**FALSE-PASS.** The tester toggles the theme without reloading and a cached stylesheet hides the defect. *Defeat:*
reload after each toggle, and check at least one route with the OS-level preference set rather than the in-app toggle.

**Evidence.** Paired screenshots per route, the contrast checks, the design-standard checklist.

---

### UX-04 — Keyboard navigation and focus `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. On three key routes, navigate the entire page with the keyboard only.
2. Confirm every interactive element is reachable, focus is always visible, and focus order is logical.
3. Confirm modals trap focus and return it on close.
4. Confirm no keyboard trap exists.

**PASS.** All four properties hold on all three routes.

**FALSE-PASS.** The tester checks only the primary navigation and misses controls inside tables and charts. *Defeat:*
enumerate the interactive elements from the accessibility tree first, then confirm each was reached by keyboard.

**Evidence.** The element inventory per route, the tab-order transcript, the modal behaviour.

---

### UX-05 — Error states are honest and actionable `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. For three key routes, block the primary data request in DevTools and reload.
2. Record what renders: an error state, an empty state, or plausible-looking zeros (the CN-01 defect).
3. Confirm the error names what failed and offers a retry.
4. Repeat with a slow (throttled) response to check the loading state.

**PASS.** Blocked requests produce an explicit error with a retry; slow requests produce a loading state; neither
produces a confident zero.

**FALSE-PASS.** The route renders an empty state that is indistinguishable from "you genuinely have no data" — which is
exactly how a dead backend reads as a clean tenant. *Defeat:* the error state must be **distinguishable** from the empty
state. If it is not, that is a finding that undermines every zero-reading test in this plan, and must be cross-
referenced in CN-01's result.

**Evidence.** Three blocked-request screenshots, three throttled screenshots, the distinguishability judgment.

---

### UX-06 — Not-found and unauthorised routes behave `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. Navigate to a non-existent route, a valid route with a non-existent id, and a route the current role cannot access.
2. Record what renders in each case and whether the user can recover.
3. Confirm no internal detail (stack trace, internal path, other org's identifier) is exposed.

**PASS.** Each case renders an appropriate, distinct page with a recovery path; nothing internal leaks.

**FALSE-PASS.** All three render the same generic page, so a user cannot tell "you can't see this" from "this doesn't
exist" — and neither can an operator diagnosing a permissions problem. *Defeat:* the three must be distinguishable to
the user while still not leaking existence to an attacker; record how the product resolves that tension.

**Evidence.** Three screenshots, the leak check, the distinguishability judgment.

---

### UX-07 — Time is displayed unambiguously `[OPERATOR]` `[READ-ONLY]`

**Steps**
1. On the events, sessions and audit views, record how timestamps are displayed: absolute or relative, and in which
   timezone.
2. Hover or inspect to see whether an absolute UTC value is available.
3. Compare a displayed time against the underlying raw value from the XHR and against the C1 clocks.

**PASS.** Every timestamp exposes an unambiguous absolute value with a stated timezone; relative times are accurate.

**FALSE-PASS.** Relative times ("2 minutes ago") are computed client-side from a stale page and drift without
reloading. *Defeat:* leave a page open for 10 minutes and re-read the relative time; if it did not advance, the display
is frozen and misleading. Also confirm the underlying raw value is present in the payload — a UI with only a humanised
string cannot be audited.

**Evidence.** The display audit per view, the raw values, the 10-minute drift check.

---

# RESULTS TABLE

Fill one row per test. **Every row must have a verdict.** `BLOCKED` requires a named precondition. `NOT-PROVEN`
requires the reason the property is unfalsifiable in this topology. `NOT-RUN` is the verdict when the FALSE-PASS defeat
step was skipped.

**Run header — fill this before starting**

| Field | Value |
|---|---|
| Run date (UTC) | |
| Operator | |
| Owner present for `[OWNER]` tests | |
| Backend image tag observed | |
| Frontend build id observed | |
| Agent version observed (4-way) | |
| `N_hb` (derived) | |
| `N_lag` (SQL runner lag, from GT-02) | |
| PRE-A.1 second org provisioned | yes / no |
| PRE-A.2 second endpoint provisioned | yes / no |
| PRE-A.3 second Windows user provisioned | yes / no |
| PRE-A.4 non-admin console role provisioned | yes / no |
| Evidence root path | |

**Test results**

| ID | Title (short) | Tags | Verdict | Defeat step executed? | Blocker / reason | Evidence path | Notes |
|---|---|---|---|---|---|---|---|
| GT-01 | Pin deployed versions | OPERATOR / READ-ONLY | | | | | |
| GT-02 | SQL runner sees the API's DB | OPERATOR / DESTRUCTIVE | | | | | |
| GT-03 | Resolve the real schema | OPERATOR / READ-ONLY | | | | | |
| GT-04 | API route map from the API | OPERATOR / READ-ONLY | | | | | |
| GT-05 | Endpoint ground-truth manifest | OPERATOR / READ-ONLY | | | | | |
| GT-06 | Virgin fingerprint | OPERATOR / READ-ONLY | | | | | |
| GT-07 | Verbose logging emits | OPERATOR / READ-ONLY | | | | | |
| GT-08 | Closed class vocabulary | OPERATOR / READ-ONLY | | | | | |
| GT-09 | Baseline every counter | OPERATOR / READ-ONLY | | | | | |
| AQ-01 | Unsigned binary told truthfully | OPERATOR / READ-ONLY | | | | | |
| AQ-02 | Verify the artifact customers get | OPERATOR / READ-ONLY | | | | | |
| AQ-03 | Release manifest loaded + current | OPERATOR / READ-ONLY | | | | | |
| AQ-04 | Manifest producer job ran | OPERATOR / READ-ONLY | | | | | |
| AQ-05 | Install script integrity check | OPERATOR / READ-ONLY | | | | | |
| AQ-06 | Anti-rollback floor | OWNER / DESTRUCTIVE | | | | | |
| AQ-07 | Installed vs available version | OWNER / READ-ONLY | | | | | |
| AQ-08 | Upgrade with zero enforcement gap | OWNER / DESTRUCTIVE | | | | | |
| AQ-09 | Upgrade preserves user content | OWNER / READ-ONLY | | | | | |
| AQ-10 | Deployment script scope | OWNER / DESTRUCTIVE | | | | | |
| AQ-11 | `errorCode` specific and stable | OPERATOR / READ-ONLY | | | | | |
| EN-01 | Fresh install observed | OWNER / DESTRUCTIVE | | | | | |
| EN-02 | Enrollment binds correctly | OWNER / DESTRUCTIVE | | | | | |
| EN-03 | Trust attestation honest | OPERATOR / READ-ONLY | | | | | |
| EN-04 | Heartbeat real and periodic | OPERATOR / READ-ONLY | | | | | |
| EN-05 | Identity map, five ids distinct | OPERATOR / READ-ONLY | | | | | |
| EN-06 | Coverage holds endpoint id (K1) | OPERATOR / READ-ONLY | | | | | |
| EN-07 | Machine secret not user-readable | OPERATOR / READ-ONLY | | | | | |
| EN-08 | Reinstall does not brick trust | OWNER / DESTRUCTIVE | | | | | |
| EN-09 | Enrollment not replayable cross-org | OPERATOR / READ-ONLY | | | | | |
| CN-01 | New org shows real zeros | OPERATOR / READ-ONLY | | | | | |
| CN-02 | Policy renders from server state | OPERATOR / READ-ONLY | | | | | |
| CN-03 | Same fact same on every screen | OPERATOR / READ-ONLY | | | | | |
| CN-04 | Overview honest about emptiness | OPERATOR / READ-ONLY | | | | | |
| CN-05 | List → detail → timeline consistent | OPERATOR / READ-ONLY | | | | | |
| CN-06 | Pagination and totals honest | OPERATOR / READ-ONLY | | | | | |
| CN-07 | Filters filter server-side | OPERATOR / READ-ONLY | | | | | |
| CN-08 | Cross-tenant read isolation | OPERATOR / READ-ONLY | | | | | |
| CN-09 | Cross-tenant write isolation | OPERATOR / READ-ONLY | | | | | |
| CN-10 | Role authorization server-side | OWNER / READ-ONLY | | | | | |
| CN-11 | Coverage attributes to right machine | OPERATOR / READ-ONLY | | | | | |
| CN-12 | Audit records actor, not actor-authored | OPERATOR / DESTRUCTIVE | | | | | |
| CN-13 | Every number has a backing request | OPERATOR / READ-ONLY | | | | | |
| PL-01 | Policy change reaches the endpoint | OPERATOR / DESTRUCTIVE | | | | | |
| PL-02 | Offline: N-1 applied, N pending | OWNER / DESTRUCTIVE | | | | | |
| PL-03 | Four applied columns move in lockstep | OPERATOR / DESTRUCTIVE | | | | | |
| PL-04 | Receipt is a receipt | OPERATOR / READ-ONLY | | | | | |
| PL-05 | Server refuses unactivatable bundle | OWNER / DESTRUCTIVE | | | | | |
| PL-06 | Scoped policy applies only in scope | OPERATOR / DESTRUCTIVE | | | | | |
| PL-07 | SHADOW observes without enforcing | OPERATOR / DESTRUCTIVE | | | | | |
| PL-08 | ENFORCE needs a canary predecessor | OPERATOR / DESTRUCTIVE | | | | | |
| PL-09 | CANARY targets only the cohort | OPERATOR / DESTRUCTIVE | | | | | |
| PL-10 | Policy state survives reload | OPERATOR / READ-ONLY | | | | | |
| PL-11 | Has the canary EVER run? (K2) | OPERATOR / READ-ONLY | | | | | |
| PL-12 | Force the canary to fire | OWNER / DESTRUCTIVE | | | | | |
| PL-13 | The canary can go RED | OWNER / DESTRUCTIVE | | | | | |
| PL-14 | Canary attribution | OPERATOR / READ-ONLY | | | | | |
| PL-15 | Restore all policy changed | OPERATOR / DESTRUCTIVE | | | | | |
| CC-01 | Five hook events actually fire | OPERATOR / DESTRUCTIVE | | | | | |
| CC-02 | Dangerous command blocked, legibly | OPERATOR / DESTRUCTIVE | | | | | |
| CC-03 | Paired benign control allowed | OPERATOR / DESTRUCTIVE | | | | | |
| CC-04 | EncodedCommand decoded, paired | OPERATOR / DESTRUCTIVE | | | | | |
| CC-05 | Interpreter laundering caught | OPERATOR / DESTRUCTIVE | | | | | |
| CC-06 | Privesc and self-disable caught | OPERATOR / DESTRUCTIVE | | | | | |
| CC-07 | Warn vs deny; choice honoured | OPERATOR / DESTRUCTIVE | | | | | |
| CC-08 | Allow-once is not allow-forever | OPERATOR / DESTRUCTIVE | | | | | |
| CC-09 | Decision latency distribution | OPERATOR / READ-ONLY | | | | | |
| CC-10 | Benign daily work uninterrupted | OPERATOR / DESTRUCTIVE | | | | | |
| CC-11 | git push/commit recognised | OPERATOR / DESTRUCTIVE | | | | | |
| CC-12 | Session boundaries correct | OPERATOR / DESTRUCTIVE | | | | | |
| CC-13 | Event chain intact and ordered | OPERATOR / READ-ONLY | | | | | |
| CC-14 | Console latency measured | OPERATOR / READ-ONLY | | | | | |
| CC-15 | Reason text is ours and actionable | OPERATOR / READ-ONLY | | | | | |
| CC-16 | Exception flow end to end | OPERATOR / DESTRUCTIVE | | | | | |
| CX-01 | Codex hooks match installed version | OPERATOR / READ-ONLY | | | | | |
| CX-02 | Denied action denied through Codex | OPERATOR / DESTRUCTIVE | | | | | |
| CX-03 | Paired benign control via Codex | OPERATOR / DESTRUCTIVE | | | | | |
| CX-04 | Codex fail-open measured | OWNER / DESTRUCTIVE | | | | | |
| CX-05 | Outage not retroactively erased | OPERATOR / READ-ONLY | | | | | |
| CX-06 | Codex governed for a 2nd user | OWNER / DESTRUCTIVE | | | | | |
| CX-07 | Governance survives Codex upgrade | OWNER / DESTRUCTIVE | | | | | |
| CX-08 | Codex's own sandbox isn't doing our job | OPERATOR / READ-ONLY | | | | | |
| CX-09 | Codex attribution in console | OPERATOR / READ-ONLY | | | | | |
| CX-10 | Codex prompt-level governance | OPERATOR / DESTRUCTIVE | | | | | |
| CX-11 | Both status surfaces tell the truth | OPERATOR / READ-ONLY | | | | | |
| DL-01 | POSITIVE CONTROL: evidence lane wrote | OPERATOR / DESTRUCTIVE | | | | | |
| DL-02 | Cloud key detected and classed | OPERATOR / DESTRUCTIVE | | | | | |
| DL-03 | Card + private key, paired | OPERATOR / DESTRUCTIVE | | | | | |
| DL-04 | Home paths per policy | OPERATOR / DESTRUCTIVE | | | | | |
| DL-05 | No plaintext, over a NON-EMPTY artifact | OPERATOR / READ-ONLY | | | | | |
| DL-06 | Masked preview present and masked | OPERATOR / READ-ONLY | | | | | |
| DL-07 | Secret not transmitted anywhere odd | OPERATOR / READ-ONLY | | | | | |
| DL-08 | Displayed DLP policy is enforced | OPERATOR / DESTRUCTIVE | | | | | |
| DL-09 | Privacy report tells the truth | OPERATOR / READ-ONLY | | | | | |
| DL-10 | Redaction has a non-empty rule set | OPERATOR / READ-ONLY | | | | | |
| DL-11 | No secrets in CloudWatch | OPERATOR / READ-ONLY | | | | | |
| WB-01 | Unapproved AI site blocked by us | OPERATOR / DESTRUCTIVE | | | | | |
| WB-02 | Approved site not blocked, still recorded | OPERATOR / READ-ONLY | | | | | |
| WB-03 | Guard survives restart / new profile | OPERATOR / DESTRUCTIVE | | | | | |
| WB-04 | Web AI attribution | OPERATOR / READ-ONLY | | | | | |
| WB-05 | Web AI policy change propagates both ways | OPERATOR / DESTRUCTIVE | | | | | |
| WB-06 | Our own key format is detected | OPERATOR / DESTRUCTIVE | | | | | |
| WB-07 | Guard not trivially disabled | OPERATOR / READ-ONLY | | | | | |
| WB-08 | Block page UX | OPERATOR / READ-ONLY | | | | | |
| SC-01 | Bad package install blocked | OPERATOR / DESTRUCTIVE | | | | | |
| SC-02 | Good package install allowed + recorded | OPERATOR / DESTRUCTIVE | | | | | |
| SC-03 | Direct package manager not a bypass | OPERATOR / DESTRUCTIVE | | | | | |
| SC-04 | MCP server addition governed | OPERATOR / DESTRUCTIVE | | | | | |
| SC-05 | MCP risk from capabilities | OPERATOR / READ-ONLY | | | | | |
| SC-06 | MCP state survives restart | OPERATOR / DESTRUCTIVE | | | | | |
| SC-07 | Inventory reflects the real machine | OPERATOR / READ-ONLY | | | | | |
| SC-08 | Push-gate stops a secret | OPERATOR / DESTRUCTIVE | | | | | |
| SC-09 | Scan/finding surfaces fed by real work | OPERATOR / READ-ONLY | | | | | |
| SC-10 | Artifact verdicts reachable | OPERATOR / READ-ONLY | | | | | |
| AD-01 | Daemon down + high-risk tool | OWNER / DESTRUCTIVE | | | | | |
| AD-02 | Repeated daemon kills | OWNER / DESTRUCTIVE | | | | | |
| AD-03 | Hook config removed | OWNER / DESTRUCTIVE | | | | | |
| AD-04 | Project-scope config override | OPERATOR / DESTRUCTIVE | | | | | |
| AD-05 | Environment-variable tampering | OPERATOR / DESTRUCTIVE | | | | | |
| AD-06 | Path relocation variants | OPERATOR / DESTRUCTIVE | | | | | |
| AD-07 | Whitespace/quoting obfuscation | OPERATOR / DESTRUCTIVE | | | | | |
| AD-08 | Backgrounded / deferred execution | OPERATOR / DESTRUCTIVE | | | | | |
| AD-09 | Exfil shapes, paired | OPERATOR / DESTRUCTIVE | | | | | |
| AD-10 | History and evidence tampering | OPERATOR / DESTRUCTIVE | | | | | |
| AD-11 | Session-boundary race | OPERATOR / DESTRUCTIVE | | | | | |
| AD-12 | Two runtimes at once | OPERATOR / DESTRUCTIVE | | | | | |
| AD-13 | Replay / forge an event | OPERATOR / READ-ONLY | | | | | |
| AD-14 | Uninstaller as a bypass | OWNER / DESTRUCTIVE | | | | | |
| RS-01 | Total network loss | OWNER / DESTRUCTIVE | | | | | |
| RS-02 | Heartbeat gap visible after recovery | OPERATOR / READ-ONLY | | | | | |
| RS-03 | Backend unreachable | OWNER / DESTRUCTIVE | | | | | |
| RS-04 | Clock skew | OWNER / DESTRUCTIVE | | | | | |
| RS-05 | Disk exhaustion | OWNER / DESTRUCTIVE | | | | | |
| RS-06 | Killed mid-decision, five times | OWNER / DESTRUCTIVE | | | | | |
| RS-07 | Retry without duplication | OPERATOR / READ-ONLY | | | | | |
| RS-08 | Concurrent endpoints, chain intact | OPERATOR / DESTRUCTIVE | | | | | |
| RS-09 | 100 rapid decisions, four-number ledger | OPERATOR / DESTRUCTIVE | | | | | |
| RS-10 | Reboot restores governance | OPERATOR / DESTRUCTIVE | | | | | |
| RS-11 | Emergency bypass is loud and scoped | OWNER / DESTRUCTIVE | | | | | |
| OP-01 | Every scheduled job has run | OPERATOR / READ-ONLY | | | | | |
| OP-02 | Liveness sweeper marks stale agents | OPERATOR / READ-ONLY | | | | | |
| OP-03 | Retention behaves as documented | OPERATOR / READ-ONLY | | | | | |
| OP-04 | Multi-tenant constraints are real | OPERATOR / READ-ONLY | | | | | |
| OP-05 | No cross-tenant rows | OPERATOR / READ-ONLY | | | | | |
| OP-06 | API key scoping enforced | OPERATOR / READ-ONLY | | | | | |
| OP-07 | Secrets configuration matches claim | OPERATOR / READ-ONLY | | | | | |
| OP-08 | RDS private, no public ingress | OPERATOR / READ-ONLY | | | | | |
| OP-09 | Health reflects dependency state | OPERATOR / READ-ONLY | | | | | |
| OP-10 | Fleet numbers scale past one page | OPERATOR / READ-ONLY | | | | | |
| OP-11 | Aspirational specs reconciled | OPERATOR / READ-ONLY | | | | | |
| UN-01 | Uninstall completes | OWNER / DESTRUCTIVE | | | | | |
| UN-02 | No files/services/tasks/registry remain | OPERATOR / READ-ONLY | | | | | |
| UN-03 | User AI configs restored byte-wise | OPERATOR / READ-ONLY | | | | | |
| UN-04 | No `.bak` litter | OPERATOR / READ-ONLY | | | | | |
| UN-05 | No orphaned hooks | OPERATOR / READ-ONLY | | | | | |
| UN-06 | Console reflects the uninstall | OPERATOR / READ-ONLY | | | | | |
| UN-07 | Machine not left less secure | OPERATOR / READ-ONLY | | | | | |
| UN-08 | Reinstall after uninstall works | OWNER / DESTRUCTIVE | | | | | |
| UN-09 | Uninstall cleans the 2nd user's profile | OWNER / DESTRUCTIVE | | | | | |
| UX-01 | Phone width: no horizontal overflow | OPERATOR / READ-ONLY | | | | | |
| UX-02 | Core journeys at phone width | OPERATOR / READ-ONLY | | | | | |
| UX-03 | Both themes render correctly | OPERATOR / READ-ONLY | | | | | |
| UX-04 | Keyboard navigation and focus | OPERATOR / READ-ONLY | | | | | |
| UX-05 | Error states honest and actionable | OPERATOR / READ-ONLY | | | | | |
| UX-06 | Not-found / unauthorised behave | OPERATOR / READ-ONLY | | | | | |
| UX-07 | Time displayed unambiguously | OPERATOR / READ-ONLY | | | | | |

**Run summary — fill this at the end**

| Metric | Count |
|---|---|
| Tests written | 165 |
| PASS | |
| FAIL | |
| BLOCKED (with named precondition) | |
| NOT-PROVEN (topology) | |
| NOT-RUN (defeat step skipped) | |
| **Tests with a verdict** (must equal 165) | |

> **Completion rule.** `PASS + FAIL + BLOCKED + NOT-PROVEN + NOT-RUN` must equal **165**. If it does not, the run has
> silently self-skipped — which is the very defect class this plan exists to catch. Reconcile before reporting.

---

## APPENDIX A — Headline findings to escalate immediately

Escalate to the owner **the same day**, without waiting for the run to finish, if any of these occur:

1. **CX-02 or CX-06 FAIL** — a denied action runs through Codex, or Codex is ungoverned for a second Windows user.
2. **CX-11 FAIL** — both status surfaces green over an ungoverned runtime. This is the original defect's exact
   signature.
3. **PL-02 FAIL(a)** — the console reports a bundle applied while the endpoint is demonstrably offline. The entire
   policy-proof chain is theatre.
4. **PL-13 FAIL** — the canary cannot be made to go red. It is decoration.
5. **DL-01 FAIL** — the evidence lane wrote nothing, which makes every privacy claim in the product unverifiable and
   every DL-phase pass vacuous.
6. **DL-05 FAIL** — plaintext prompt content found in any store or log, in any encoding.
7. **AD-05 or AD-08 FAIL** — a user-settable variable or a deferred-execution path silently disables enforcement.
8. **CN-01 FALSE-PASS confirmed** — a failed fetch renders as a confident zero. Every zero in the console becomes
   uninterpretable and several other tests' passes must be downgraded.
9. **OP-01 FAIL** — a scheduled backend job has never executed in production.
10. **GT-03 FAIL** — a column or table the proof chain depends on is absent from the deployed schema.

## APPENDIX B — Tests that are unfalsifiable without PRE-A

If the topology preconditions are not met, these tests **cannot** yield PASS. Record them as BLOCKED or NOT-PROVEN with
the precondition named.

| Missing precondition | Tests that become BLOCKED / NOT-PROVEN |
|---|---|
| PRE-A.1 (second org) | CN-01 (weakened), CN-08, CN-09, EN-09, OP-05, PL-14 (partial) |
| PRE-A.2 (second endpoint) | AQ-07, EN-05 (weakened to NOT-PROVEN), PL-06, PL-09, PL-14, CN-11, RS-08 |
| PRE-A.3 (second Windows user) | CX-06, UN-09, EN-07 (empirical half) |
| PRE-A.4 (non-admin console role) | CN-10, OP-06 (partial) |

## APPENDIX C — Standing prohibitions during the run

- Never print, paste, transcribe or store a credential value. Presence, length, first-4 and SHA-256 only.
- Never type an attack-shaped payload on a shell command line. Files only.
- Never disable a control to make a test pass. Where a test degrades a component, that degradation IS the measurement,
  it is `[OWNER]`, it is time-boxed, and its result is never "pass because the control was off".
- Never target a real third-party endpoint with an exfil probe. Use a local sink you control.
- Never run a `[DESTRUCTIVE]` test on the primary endpoint if the secondary can carry it.
- Never leave a policy changed. Every phase that changes policy restores it and proves the restoration landed.
- Never record a verdict of "unknown", "looks fine", or "probably OK".
