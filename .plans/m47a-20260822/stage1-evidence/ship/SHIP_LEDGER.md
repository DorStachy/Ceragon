# P47 ship ledger — 2026-09-06

The owner's order: full module runs, then the Docker gate mirror on all final trees, then the three
decisions (delegated), then pull-merge-resolve, then push, then Backend before Frontend before any
agent release. This ledger records what each step measured, with VERIFIED and NOT EXERCISED kept apart.

## 1. Full module runs (host, Windows, six jest workers + the Go run in parallel)

| repo | tree | result | reds, and what each one is |
|---|---|---|---|
| Backend | `p47/integration-backend` a14f7c72 (pre-fix), re-run on 0dc24071 | 1024 suites / 17,526 tests passed; 9 suites red under load | **1 real**: `ai-policy-rollout.service.spec.ts` "reads no environment variable anywhere in the lane" — my bundle-lifetime seam read `process.env` in the issuance service. **Reverted** (6fba19fd), green on re-run. **8 timing-shaped**: re-run alone on the final tree, 7 pass; `fastgate.service.spec.ts` (B1-A-i time-budget race, 96/100 saves inside the window) fails **on origin/main too** in this host (`baseline-backend-fastgate-origin-main.log`), code P47 never touched. |
| Frontend | `p47/w6-frontend` 0e8b730e | 621 suites / 7,700 tests passed; 1 suite red | `scan-detail-content.test.tsx` pagination-cap test, 20 s timeout. Fails **identically on origin/main** in this host (`baseline-frontend-1-origin-main.log`); P47 touches nothing under `app/repositories`. GitHub's own FE pr-checks passed on 2026-09-04. |
| Static-Worker | `p47/w7b-static` de656fae | 205 suites / 4,183 tests passed; 1 suite red | `veto-gates.test.ts`: forbidden-guard flags `corpus/artifact-fixtures/CATCH_BASELINE.json` as `IMMUTABLE_FILE_CHANGED` vs origin/main — the re-banked recall baseline, decision 3a. Red **by design until the baseline is on main**. |
| Sandbox-Worker | `p47/w7c-containment` 0c34e95 | 77 suites / 1,140 tests passed; 14 suites red | All host-environment: 13 suites "Cannot find module '@iarna/toml'" (worktree `node_modules` predates main's f0301fa; the workflow runs `npm install` fresh) and 8 cargo-vendor tests that spawn `bash`+`ulimit` (Linux-only). The Docker leg is the honest run. |
| Scanner | `p47/integration-scanner` 04309b9 | github-action 63/63 suites; scanner-worker 153 suites / 2,244 tests, secret-classifier 1/1, phase-6 2/2, task-def privacy invariant green; 1 suite red | `opus-cost-governed-routing.spec.ts`: two 5 s timeouts, still red alone (36 s suite). Code P47 never touched (`git diff` empty for cost-governed/fit). NOT baselined on origin/main here; the Docker leg decides. |
| Intel | `p47/w7c-platform` ff424a6 | 112 suites / 1,737 tests passed, 0 red | — |
| Installers (Go, `./...`) | `p47/fix-system-exfil` 7863aa2f, re-runs on 7420b08d | 146 packages ok; 5 packages red | see below |

Installers Go reds:

- `cmd/devoid` (the Windows-only `cli-entrypoint-tests` leg the mirror cannot run): 5 tests red in the 52-minute
  loaded run (decision-latch slow-human ×2, plugin submit lanes ×2, quarantine resolver ×1). All 5 pass alone
  at 521e511a (this morning's main), f6148c37 (pre-fix integration) and 7863aa2f (final) — load-sensitive.
  Full-package quiet re-run on the merged tree: see §1a.
- `internal/daemon`: `TestEndTrackedAISessions_TimeBoxedNeverHangs` — deterministic on Windows: the spool
  fix's exclusive lock file stays open, so `t.TempDir` cleanup cannot remove the spool directory. Green on
  origin/main (no lock file existed). **Fixed** in the two test helpers (`newAIServer`, `newAIServerAtPaths`
  now `t.Cleanup(s.closeEvidenceSpool)`); product code unchanged. See §1a for the package result.
- `internal/neutraleval`: three P47-authored gates that are **red by design and say so in their headers**
  ("THE GATE, and it is RED"; "the number is the deliverable even while the gate is red"; "NOT_READY, never
  rounded up"): `TestCanonicalRegressionSetIsComplete` (1 NOT_READY member owned by Wave 3B, 4 PARTIAL
  owning tests asserting fewer than the four dimensions), `TestZeroUnmigratedIncidents` (3 of 26 incidents
  unmigrated: w0a destructive-rm benign-home, p9-w8 rule-file walk depth, hook decision-budget fail-open),
  `TestEnforcingCasesHaveTwoLabelers` (0 of 404 enforcing cases carry two labelers). Green on origin/main only
  because the tests do not exist there. Shipped as designed; the counts are the open debt.
- `internal/skillgate`: `TestResolve_PluginFastPathHonoursContext` red under load, green alone (3.7 s) and on
  origin/main — load-sensitive.
- `internal/certificate`: `TestForbiddenListMatchesThePlanChecklist` fails by design when the workspace plan
  is not reachable above the package (a detached worktree); with `M47A_PLAN` pointed at the plan the package
  is green (0.9 s) — the equality holds. Only `internal-candidate.yml` runs `go test ./...` on GitHub, so an
  internal candidate would need `M47A_PLAN`; no release or deploy path runs it.

### 1a. Quiet re-runs on the final Installers tree

- `internal/daemon` after the test-helper release: the targeted test went green, but the full package then
  failed `TestSessionStartDoesNotStallTheHookOnASlowControlPlane` the same way — a session-start goroutine
  released at test end **reopened** the spool after the helper's cleanup had closed it, and the held lock
  made the temp-dir cleanup fail. That is a product gap, not a test gap: after `closeEvidenceSpool` (the
  graceful-stop release that lets a replacement daemon take the lock) a late emitter reopened the spool.
  **Fixed** in 78cedeb8: the server remembers the spool was closed and answers late callers with nil.
  Full `internal/daemon` package: **green, 60.7 s** (`rerun-go-internal-daemon-fixed2.log`);
  `internal/evidencespool` green.
- `internal/skillgate` green alone (3.7 s); `internal/certificate` green with `M47A_PLAN` (0.9 s);
  `internal/neutraleval` red on exactly the three designed-red gates and nothing else (13.6 s).
- `cmd/devoid` full package, quiet: **green, 980.6 s** (`rerun-go-cmd-devoid.log`) — the Windows-only
  `cli-entrypoint-tests` leg, run on this machine as `ci/gates.json` prescribes. Measured on 7420b08d; the two
  daemon commits that landed during the run (966cfb46 test helper, 78cedeb8 spool guard) touch `internal/daemon`
  only. **Re-run on the final tip f27dd154: green, 919.9 s** (`rerun-go-cmd-devoid-final.log`), alongside the
  mirror on its own CPU set.

## 2. Docker gate mirror on the final trees

Run from the junction shadow root `C:/cwt/p47-ship-ciroot`, `--merged --jobs 1`, cpuset 0-5, 6 GB.

### Backend (13 legs, 55 min): 11 pass, 3 fail, 2 partial

- PASS: e2e_advisory, alerts_integration, audit_integration, full_test shards 2/3/4 (in-container Postgres),
  licenses_integration, migration_chain_from_empty, shared-contracts-pin, typecheck, security:audit.
- PARTIAL (cannot mirror, by design): security:rate_limit_taskdef and security:rds_boundary stop at the AWS
  OIDC credential step.
- **FAIL, real, deploy-blocking:** `build:build_and_test` and `pr-checks:lint` both die at "Lint migrations":
  `duplicate migration timestamp 1793300000000` — P47's W6 T8 `WidenAiEventTriageClassifications` collides
  with upstream `AddLastCommandToAgents` (aba83705, merged to main after the 2026-09-05 deploy, so neither is
  applied in prod yet). The lint's own words: the prod runner would silently skip one. **Fixed** (22ac77ba):
  P47's migration renumbered to `1793300000001` (file, class, `name`, its spec, the triage governance mapping
  JSON + MD, two spec comments); `lint:migrations` clean, `tsc` clean, the migration spec, the
  governance-mapping spec and the two citing specs green. Legs re-run after the chain (§2a).
- **FAIL, mirror environment:** `pr-checks:full_test#shard=1` — 278 suites / 4,832 tests passed; the one
  failure is `src/common/build-stamp-deploy-gate.spec.ts`, which builds real fixture images with `docker build`
  and has no Docker daemon inside the gate container (jest reports "Test suite failed to run: Converting
  circular structure to JSON" from the unserialisable spawn error). On origin/main, untouched by P47; GitHub's
  ubuntu runner has Docker. NOT MIRRORABLE here; recorded, not fixed.

### The disk filled at 17:2x and everything after Backend errored

`C:` reached 0 bytes free while Frontend's jest leg ran (Docker's data disk is 55 GB; the workspace carries
dozens of 1 GB worktrees). Frontend: typecheck PASS, jest FAIL, three legs ERROR; Installers, Static, Sandbox,
Scanner, Intel and the Backend re-runs errored in seconds (rc=2) with Docker returning 500. Space was reclaimed
from caches and this session's own throwaways only; nothing of the owner's was touched. Docker was restarted
and the chain re-run from Frontend (§2b).

### 2b. Re-run after recovery

**Frontend (5 legs): 4 pass, 1 fail.** Typecheck 67 s, jest 220 s (the host-only scan-detail red does not
reproduce in the container), em-dash guard, security audit all PASS. FAIL: "Detector vocabulary parity
(Installers -> Frontend)" — the check reads `Ceragon-Prod/Installers` **on GitHub at `main`** and needs
`GH_TOKEN`; the mirror has no token, so it exits 2 "NOT CHECKED … refusing to pass without comparing anything".
Run on the host with a token against Installers `main`: DRIFT (`formatVersion` 3 on main, 4 in the Frontend),
because P47's W1 vocabulary change lives in the Installers integration branch, not on main yet. Compared
byte-for-byte against the Installers P47 tip (78cedeb8): **both vectors identical**
(toolrisk sha 4538b0c3…, dlp identical). So the gate goes green on GitHub only after Installers `main` carries
P47 — **push Installers main before dispatching Frontend's pr-checks**, which the deploy gate requires.

**Installers (14 legs).** PASS: hot-path-audit-imports, ai-checkpoint-observation, release-workflow-contract,
self-update-lane, macos-legacy-identity, toolrisk-lane, finding-b-e2e:shim-enforcement (76 s — the real
block/allow assertion), uninstall-honesty; hard-deny-stress: (see the chain log). FAIL, each one read:

- `pr-checks:wire-lane-tests` — every step green (winacl, browserinv, wsldistro, wslcodex, the §10.4
  bundle-receipt lane incl. `internal/daemon` + `evidencespool` + `promptevidencegate`, codexmanaged,
  localdecide, coveragetruth/obligation/failureoracle) except "Neutral evaluation — including the holdout seal",
  where the seal tests pass and the three **P47-authored designed-red ratchets** fail
  (`TestCanonicalRegressionSetIsComplete`, `TestZeroUnmigratedIncidents`, `TestEnforcingCasesHaveTwoLabelers`,
  see §1). **Decision: ship them red, as their authors wrote them.** Nothing mechanical depends on Installers
  pr-checks (they are dispatch-only and `release.yml` has no required-checks gate). The cost is real and is the
  first follow-up: a permanently red leg cannot show a future holdout-seal regression.
- `pr-checks:scanner-parity` — Go engine parity, the scorer defeat suite and the extension build pass; the
  browser-extension `node --test` fails 5 tests. **1 was P47's**: `go-corpus-cross-engine` pinned 55 benign
  cases while W4C T6 grew the Go corpus to 91 and never re-ran this twin. Re-measured: the browser engine fires
  on 24 benign cases to Go's 15; the nine differences are named in the new pin (one old ingress-only class,
  eight W4C security-document cases of one shape — prose that names detection classes) — a browser-port
  parity gap recorded as a number, not hidden. **Fixed** (f27dd154), test green. **4 are upstream**: the
  chrome/firefox `web_accessible_resources`/`intervention.html` manifest checks fail identically on origin/main
  in this host (`baseline-ext-tests-origin-main.log`); not P47's, not touched.
- `pr-checks:codex-vendor-lane` — the pinned `@openai/codex@0.134.0` installs, then
  `TestLiveCanary_RequiredBuildIsActuallyPresent` refuses `/usr/local/bin/codex` with
  `canary-host-executable-untrusted` — an upstream guard (on origin/main, untouched by P47) rejecting an npm
  global install inside the container. Both gate tests pass on the host at origin/main AND at the P47 tip.
  Mirror environment.
- `pr-checks:codex-hook-lane-live-proof` — the job's own title is "EXPECTED RED until the lane is proven";
  passes on the host at both trees, fails in the container. Mirror environment.
- `holdout-score:score` — the runner cannot resolve `steps.engine.outputs.version`, skips "Score the ingress
  lane", and "Publish the rates" then finds no `holdout-summary.none.txt`. Runner limitation, not the tree.

**Sandbox-Worker (1 leg): PARTIAL as designed.** In the container: install, both security audits, build, the
test step (90 suites / 1,299 tests), the task-definition policy gate and the worker-result contract gate
(10 suites / 137 tests) all pass; the leg stops at the AWS OIDC credential step. Every host red (§1) was the
stale worktree `node_modules` and Linux-only cargo tooling, as predicted.

**Static-Worker (1 leg):** first attempt ERRORED before any step — the persistent gate volume held pnpm
symlinks from an earlier run that the disk-full crash left half-materialised (`cp: cannot overwrite
non-directory .../node_modules/ts-jest`). Re-run on a fresh volume (`--fresh`): (see §2c).

**Scanner (8 legs).** typecheck ×3 (shared-schemas, github-action, scanner-worker) PASS; test#shared-schemas
PASS; test#github-action FAIL on 4 tests in 2 suites that **shell out to git** — "the sealed holdout is sealed"
(`git ls-files … fatal: not a git repository`) and "workflow push triggers name branches that exist" ("cannot
resolve the repository default branch; refusing to assume one") — the gate checkout carries no `.git`
(only Static-Worker's does, by the runner's design). On the host with git: 63/63 suites green. Mirror
environment. Remaining Scanner legs: test#scanner-worker PASS (82 s — the host-only cost-governed timeout
does not reproduce in the container); ai-detection-gate PASS; test:github-action-clean-install PASS;
security:audit#scanner-worker and #shared-schemas PASS. FAIL, each read:

- `security:audit#package=github-action` — **1 high: `browserslist <=4.28.6`** (GHSA-c83g-rgw3-j3cx,
  GHSA-73wf-gq98-2v4g), a transitive dependency P47 never touched (`package.json`/lockfile unchanged vs
  origin/main), so origin/main's own security.yml would fail today too. **Fixed on the branch:** `npm audit fix`
  bumped browserslist to 4.28.9 plus its caniuse/electron-to-chromium data (23 lockfile lines), 0 vulnerabilities
  after; the action's jest suite re-run on the host: **63/63 suites, 755 tests green** (the `npm audit fix`
  reinstall had emptied the linked `shared-schemas/dist`, rebuilt first). Mirror re-run of the audit leg: (see §2c).
- `security:rule-precision` and `ai-vs-scanner-benchmark:benchmark` — both stop at the committed-artifact drift
  gate ("regenerated semgrep artifacts not committed"). The benchmark step is `npm run rules:build && git diff
  --quiet …`, and the gate checkout carries no `.git`, so `git diff` fails and the `||` branch prints the error;
  the harness's own byte check sees the Windows worktree's CRLF copies against an LF rebuild. On the host the
  rebuild changes NOTHING (`git diff --numstat` empty for both artifacts; the only difference is line endings) —
  the committed artifacts are current. Mirror environment, twice over.
- `quality-precision-gate` — "Install gitleaks (pinned)": `sudo: command not found` in the container. Mirror
  environment.

**Intel (7 legs): 4 pass, 3 environment.** actionlint, env-template-lint, iam-policy-lint, shellcheck PASS.
`validate:validate` runs the whole test suite green (customer-manifest-tracker, lambda-hotset batches …) and
dies only at "Build container image: docker: command not found"; `hetzner-validate-pr:compose-config` needs
`sudo`; `cross-reference-aws-baseline` needs live AWS. None of the three touches P47's one-file change
(`src/routing/os-target-classifier.ts`).

### 2a. Backend legs re-run on the renumbered tree (22ac77ba)

`build:build_and_test` (the deploy gate's own job): migration lint **clean**, security audit ok, live-Postgres
schema prepared, TypeORM migration ledger clean, then the whole suite — **1,116 suites / 18,830 tests passed**;
the single failure is again `build-stamp-deploy-gate.spec.ts` (needs `docker build` inside the container).
The leg is red only for that unmirrorable spec. `pr-checks:migration_chain_from_empty` **PASS** (105 s, the
renumbered set applies cleanly from an empty database); `pr-checks:lint` **PASS** (122 s: migration lint, the
hot-path audit-call-sites checker and its self-tests, worker-result contract, agent-route wire leniency, agent-wire
key parity). Backend is therefore green on every mirrorable leg; the two PARTIALs are AWS, the one FAIL is Docker.

## 3. The three decisions

Recorded in `DECISIONS.md`: expiry posture ratified; `rm devoid.exe` self-defence kept; Static re-bank accepted
(merge is the acceptance); workflow headers stay. Plus, decided during this pass: the bundle-lifetime seam is
reverted (it broke a codified invariant); the daemon spool lock gets a test-side release on Windows; the
neutraleval ratchets ship red as their authors designed.

## 4. Pull, merge, resolve

- Mains moved since the morning pull: Backend +1 (#308 release-manifest facts assembler), Installers +7
  (#261: Codex block toast, doctor policy-authority row, Claude 2.1.261 route precedence). Both merged into
  the integration branches conflict-free (Backend 0dc24071, Installers 7420b08d); `tsc --noEmit` clean,
  `go build`/`go vet` clean.
- Frontend, Static, Sandbox, Scanner, Intel, docs: already at origin/main.
- Local merge commits created (NOT pushed until the mirror is complete), each `--no-ff`, each tree byte-identical
  to its integration tip: Backend main 4ac4915a (35 ahead, worktree `C:/cwt/p47-ship-be-main`), Frontend main
  6919b243 (33 ahead, `C:/cwt/p47-ship-fe-main`), Installers main 0970b240 (148 ahead, live checkout),
  Static-Worker 4a6c982e (3), Sandbox-Worker 6659c47 (3), Scanner d6ab824 (21), Intel 264b914 (3), docs 505312f (4).

## 5. Push / 6. Deploy — the order, and why

1. **Backend**: push `main` (4ac4915a) and the integration branch. Nothing fires on push. Dispatch
   `pr-checks.yml` and `security.yml` on `main` (both dispatch-only since 2026-08-25), wait for green — the
   deploy's Required Checks Gate polls `gh run list --commit <sha>` for exactly those two. Then dispatch
   `build.yml`; the truth is the **Deploy to ECS (ECR -> ECS)** job, not the run conclusion. Backend must be
   deployed before any agent release (an agent reporting keys the deployed Backend rejects is the failure that
   has broken production before).
2. **Installers**: push `main` (0970b240) and the integration branch. Fires `finding-b-e2e.yml` (macOS +
   Windows legs, the expensive workflow, accepted in DECISIONS.md). **No release yet.** This must precede the
   Frontend gate because Frontend's vocabulary-parity check reads Installers `main` on GitHub.
3. **Frontend**: push `main` (6919b243) and the integration branch. Dispatch `pr-checks.yml` (now able to see
   formatVersion 4 on Installers main) and `security.yml`, wait for green, then dispatch
   `deploy-frontend-ecs.yml` with `security_findings_v2=true security_graph_guided_ui=true
   security_graph_motion=anime` — the live build (td 382) was dispatched with findings-v2 ON; the input defaults
   to off, so a default dispatch would silently switch the V2 evidence panels off.
4. **Workers and Intel**: push Static-Worker (auto-deploys `build-and-deploy.yml`, service at 0/0),
   Sandbox-Worker (same), Scanner (fires security/test/typecheck; deploy only on `Dockerfile.scanner-worker`,
   untouched), Intel (fires `validate.yml`; Hetzner autodeploy only on compose files, untouched), docs.
5. **Agent release**: `release.yml` with `bump=patch managed_ba=true managed_firefox=false promote=true
   bootstrap_trust_chain=false` → 7.10.15 from stable 7.10.14. **The production rollout ring is NOT promoted**
   (stage-2 gate: prompt-evidence keys + the receipt chain on one real endpoint first).
6. Root workspace repo: push `feat/push-depth-cli-ui` (this ledger) and `p47/root-main-merge`; master untouched.

### 2c. Follow-up legs

- Installers `scanner-parity` on the re-pinned tree: the cross-engine corpus test is **green in the container**
  (`ok 388`); the leg stays red only on the four upstream manifest tests that fail on origin/main too.
- Scanner `security:audit#package=github-action` on the fixed lockfile: **PASS** (7 s).
- Static-Worker on a fresh volume: the runner copies the checkout's `.git` for this repo's lockfile guard, but
  a git *worktree*'s `.git` is a pointer file into the main repository (`/w/src/C:/…/.git/worktrees/p47-w7b-static`),
  so inside the container "not a git repository" (exit 128) before any test ran. Re-run from the live primary
  checkout (main 4a6c982e, tree identical to the integration tip), fresh volume: lockfile guard ok, build ok,
  **204 suites / 4,182 tests pass**; 2 fail — `veto-gates` (the decision-3a forbidden-guard red, green once the
  baseline is on main) and `token-class`'s perf guard (a ~1 MB tokenize must not more-than-triple on doubling:
  581 ms vs < 491 ms in a 6-CPU container; code P47 never touched; passed on the host). Static pushed after this.

Results: (filled in as each step runs)
- 19:02 Backend main pushed b21dff6b..4ac4915a; `p47/integration-backend` pushed; pr-checks.yml + security.yml
  dispatched on main. Security audit: success. PR checks: (below).
- 19:03 Installers main pushed 6c292b84..0970b240 (+ `p47/fix-system-exfil`). **finding-b-e2e did not fire**:
  GitHub evaluated its path filters against the push and found no match, so the expensive macOS/Windows
  workflow stays idle (the DECISIONS.md expectation was conservative). No release yet.
- 19:03 Frontend main pushed 7689011e..6919b243 (+ `p47/w6-frontend`); pr-checks.yml + security.yml dispatched.
- 19:03 Sandbox-Worker 496073f..6659c47, Ceragon-Intelligence b7e9f27..264b914, docs 7c1cc51..505312f pushed
  (+ branches). Sandbox auto-deploys to its 0/0 service; Intel's validate.yml fires.
- 19:04 Scanner main pushed c72579e..21ccb5e (+ `p47/integration-scanner`); GitHub started Tests, Security Audit
  and quality-precision-gate on the push (the gates that could not run honestly in the mirror now run with git,
  sudo and network). Sandbox "Build & Deploy" and Intel "Validate" runs also started on their pushes.
- 19:0x GitHub's own Scanner gates on 21ccb5e: Security Audit PASS, TypeScript Check PASS, ai-vs-scanner-benchmark
  PASS (the mirror's drift red was environmental, as read), **Tests FAIL** and **quality-precision-gate FAIL** — the two
  gates the mirror could not run honestly, red on their first hosted run with the P47 tree:
  - Tests: only `workflow-branch-parity.spec.ts` (P47's, W7 "workflow truth") — it resolved the default branch from
    origin/HEAD or an env override, and actions/checkout sets neither, so both tests threw "cannot resolve the
    repository default branch". **Fixed** (9d86ca5): event-payload `repository.default_branch` first, then origin/HEAD,
    then `git ls-remote --symref`; branch existence also asks the remote. Verified on the git route and on a
    simulated hosted route (no git, event payload); action suite 63/63.
  - quality-precision-gate: 6 issues, all the W7B T4 `a4-committed-secret` reachability group (added 2026-09-04,
    after the gate's last green run on 08-29). The gate simulates gitleaks by feeding the classifier `REDACTED` plus one
    context line and cannot represent a detector that does not fire, so it "served" the repaired fixture and rated a
    private key CRITICAL against the manifest's HIGH. **Fixed** (9d86ca5) the way the gate already treats SCA legs: the
    four gitleaks reachability legs are DEFERRED with the reason on each line and CWE-798 reports UNKNOWN (0 evaluated,
    4 deferred) — unmeasured, never rounded up — until the gate runs gitleaks itself. Gate spec 18/18; tsc clean.
  - Scanner main re-merged and pushed 21ccb5e..767e959 at 19:19; hosted runs re-triggered: (below).
  - On 767e959: Security Audit PASS, TypeScript PASS, ai-vs-scanner-benchmark PASS, **Tests PASS** (the
    branch-parity fix holds on the hosted runner).
    quality-precision-gate **still red, now for the reason underneath**: "UNKNOWN — nothing failed, and nothing
    measured these: Tier-A strata never measured: CWE-506 (SCA) and CWE-798 (secret-scanner)", exit 2. The first
    run's six a4 failures had hidden it: W7B T4/T5 made an unmeasured Tier-A stratum fatal by design ("an
    unmeasured surface does not read as a clean one"), and two Tier-A strata are structurally unmeasurable by this
    gate today — SCA legs are deferred to the Backend gate by W7B's own design, and gitleaks is never run on
    fixtures. So the gate has been **red by design since W7B landed** (green before P47 only because strata.json
    did not exist). Shipped as designed and listed with the neutraleval ratchets as open debt: measure or re-tier
    CWE-506 and CWE-798. The DEFER is kept — it turns six false failures into an honest UNKNOWN.
- Sandbox "Build & Deploy Sandbox Worker": **success** (image + task definition updated; service stays at 0/0).
  Intel "Validate": **success**; "Hetzner Autobump": **success**.
- Frontend PR Checks (incl. detector-vocabulary parity against the pushed Installers main): **success**;
  Security Audit: **success**. Backend PR checks: **success**; Security Audit: **success**.
- 19:14 Backend `build.yml` dispatched (run 34044810931): Required Checks Gate success, E2E advisory success,
  **Build & Test success** (the whole suite on GitHub, where the Docker-dependent build-stamp spec has its Docker),
  **Deploy to ECS success 19:51** — `backend-service` on task definition **backend:337**, 1/1 running, rollout
  COMPLETED (was backend:336). Backend is deployed before any agent release, as ordered.
- 19:52 Frontend `deploy-frontend-ecs.yml` dispatched (run 34046804600) with `security_findings_v2=true`,
  `security_graph_guided_ui=true`, `security_graph_motion=anime` — the live build's inputs. **Deploy success
  19:58**: `frontend` service on task definition **frontend:383** (was 382), 1/1 running, rollout COMPLETED; the
  deploy log confirms `NEXT_PUBLIC_FRONTEND_SECURITY_FINDINGS_V2: true`, guided UI true, motion anime.
- 19:58 Agent release dispatched (run 34047139519 on Installers main 0970b240): `bump=patch managed_ba=true
  managed_firefox=false promote=true bootstrap_trust_chain=false` → expected 7.10.15 from stable 7.10.14. The
  production rollout ring is NOT promoted. **Result 20:23: success** — "Building version 7.10.15"; CLI binaries at
  `s3://installer-binaries-prod/releases/7.10.15/`, direct-download packages at `s3://installers-prod/packages/7.10.15/`,
  APT repositories deployed, Windows installer + browser extension + install scripts on S3, SHA-256 verified,
  **7.10.15 promoted to the stable channel**; managed Firefox deferred (as instructed); Authenticode not configured
  (unsigned startup mode, as every release before it).

## 7. Where things stand

**Deployed and verified live:** Backend `backend:337` (1/1, rollout COMPLETED, `/health` 200); Frontend
`frontend:383` (1/1, findings-v2 / guided UI / motion baked in as before); agent **7.10.15** on the stable channel;
Sandbox and Static worker images and task definitions refreshed on their 0/0 services; Intel validated and its
Hetzner SHA bumped; docs main updated. Every integration branch and main is on GitHub.

**NOT exercised, and owed before any prod ring promotion (the stage-2 gate):** prompt-evidence keys and the
receipt/activation chain on ONE real endpoint against `backend:337`; 7.10.15 has not been installed on a real
endpoint by this pass.

**Open debt, all named in the tree, none hidden by a pin:**
1. Installers `wire-lane-tests` is red on main by design — the three neutraleval ratchets (canonical regression set
   1 NOT_READY + 4 PARTIAL, 3 unmigrated incidents, 0/404 two-labeler cases). A permanently red leg cannot show a
   future holdout-seal regression: measure the debt down or move the ratchets to their own job.
2. Scanner `quality-precision-gate` is red on main by W7B design: Tier-A strata CWE-506 (SCA, deferred to the
   Backend gate) and CWE-798 (gitleaks never run on fixtures) are unmeasurable; the a4 committed-secret legs are
   deferred rather than false-failing.
3. The browser extension's promptrisk port fires on 8 W4C security-document cases Go holds clean (named in the
   cross-engine pin) — detector work.
4. Four upstream browser-extension manifest tests fail on origin/main too (`web_accessible_resources` coverage,
   `intervention.html` exposure) — not P47's, not touched.
5. `internal/certificate` needs `M47A_PLAN` outside a side-by-side checkout (`internal-candidate.yml` would need it).
6. The workspace root's `feat/push-depth-cli-ui` cannot be pushed as-is (push protection on synthetic Stripe test
   tokens in the wire-lane evidence); the squashed, redacted `p47/ship-ledger` carries the same tree.
7. Docker: `docker_data.vhdx` is 55 GB and never shrinks; `%LOCALAPPDATA%\Dockerun.broken-*` and
   `docker-secrets-engine.broken-*` hold dead socket files nothing can delete. `C:\cwt` holds dozens of ~1 GB
   worktrees from earlier waves that only their owners should remove.
- 19:51 Static-Worker: the second diagnostic push made the veto gate print the guard's report, and it said
  `NOISE_PATH_IN_DIFF [node_modules]` — this repository tracks `node_modules/.bin` (87 shim files) and a hosted
  runner's `pnpm install` rewrites them, so the guard reports noise on every CI run (its own remedy text says so);
  on a developer machine the shims match, hence "clean locally, exit 3 hosted". Upstream test (08-27) meeting an
  upstream repo quirk on its first hosted run; not P47's. **Fixed** (8f5a52c4): the clean-tree case reads the
  guard's JSON report and tolerates exactly that class; any other violation fails with the guard's words. Verified
  locally by touching a tracked shim (still passes). Static main pushed 959c6a32..3bcde18c; hosted run
  **"Build & Deploy Static Worker" success** (run 34046787559): tests green, image and task definition deployed
  to the 0/0 service, Hetzner SHA-bump dispatched. Static's re-banked recall baseline is now the one on main.
- 19:29 Static-Worker main pushed 137f34f7..4a6c982e (+ `p47/w7b-static`). Its hosted "Build & Deploy" run failed at
  Tests on `veto-gates` "exits 0 on a working tree that touches no protected path" (forbidden-guard exit 3) — a
  test that landed upstream on 08-27 and had **never run hosted** (no Static push since). Locally, against the
  pushed main, the full suite is green (206 suites) and the guard is clean; the container reproduction could not
  carry `.git`. The test discards the guard's output, so the next push carries a one-line change that prints it.
- 19:37 Root workspace repo: `p47/root-main-merge` pushed. `feat/push-depth-cli-ui` (42 commits of evidence and this
  ledger) is **rejected by GitHub push protection** — the wire lane's `results-extra.json` holds synthetic Stripe
  test tokens. Not bypassed and no shared history rewritten: the same tree, squashed and with every secret-shaped
  synthetic value replaced by `[SYNTHETIC-SECRET-REDACTED]` (13 evidence files), pushed as `p47/ship-ledger`
  (b16f405). The per-commit history stays local.
