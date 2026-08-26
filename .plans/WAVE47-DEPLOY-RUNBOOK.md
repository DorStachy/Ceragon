# Wave 47 — deploy runbook, ready to execute

**Written 2026-08-26, before billing was cleared, so the deploy step is immediate when the owner says go.**
Nothing here has been run. Every command is to be executed only on a fresh, explicit instruction.

---

## Order is not negotiable

1. **Backend first.** 2. **Frontend.** 3. **Agent release last.**

Cutting an agent release before the Backend it depends on is deployed has caused session-start failures
fleet-wide. The Backend currently in production (`320`, image `1a24262b…`) is the base every wave-47 lane
built on, so nothing in this wave can ship out of order by accident — but the rule stands for the release.

---

## STEP 0 — the thing that is easy to forget

The 2026-08-25 cost decision removed the `push` and `pull_request` triggers from `pr-checks.yml` and
`build.yml`. Backend's `deploy` job is `needs: [required_checks, build_and_test]`, and `required_checks`
polls for **completed runs of `pr-checks.yml` and `security.yml` for the merge SHA**.

**Those runs will not exist unless they are dispatched by hand.** So even with Actions working, a deploy
needs both workflows dispatched manually first, and their runs must complete against the merge commit.

---

## STEP 1 — Backend

### 1a. Verify before building
```bash
node ci/lib/drift.mjs                       # the mirror still covers every gate
node ci/lib/run.mjs Backend                 # every mirrored gate
bash docker/test-suite/run-suite.sh         # the whole suite: ~2h06m, measured
```
The suite baseline to compare against, measured 2026-08-26 at `origin/main` `1a24262b`:
**17656 passed / 1 failed / 19 skipped; 1038 suites passed / 2 failed / 2 skipped**, and both red suites
pass when re-run alone. Anything worse than that is a regression from this wave.

⚠️ **Read the suite counts, not the test counts.** A suite that CRASHES contributes zero tests to the
total — nine errors were absent from that 17676.

### 1b. Build with the stamp, and assert it BEFORE pushing
```bash
docker build --build-arg CF_BUILD_SHA=<sha> --build-arg CF_BUILD_TIME=<iso> -t <ecr>:<sha> .
node scripts/assert-image-build-stamp.cjs        # FAIL-CLOSED. Must pass before any push.
```

### 1c. Deploy by cloning the running task definition
Clone the **running** task definition and swap **only** `.containerDefinitions[0].image`. Then diff the two
with the image blanked, to prove zero env or secret drift by construction rather than by inspection.

⚠️ **Do NOT add `CF_BUILD_SHA` to the task definition.** `build.yml:635` strips it deliberately.

### 1d. Verify
Services stable · load balancer attached · target healthy · running task on the new image ·
`api.devoid.one/health` returns 200 with the new build sha.

⚠️ **The `Deploy-to-ECS` JOB is the truth. The run conclusion can lie.**

### 1e. Migration — read this before deploying, it edits live tenant policy
This wave adds `1792700000000-RebaselineToolRiskDefaultsForUncustomizedOrgs`. It rewrites a stored
tool-risk class **only** when its value is exactly what that row's preset rung would have planted before
decision D4; anything else is treated as a human's choice and preserved, per class.

Proven against a real Postgres 17 on thirteen seeded rows. **Idempotent in the strong form** — the second
run matches nothing at all. **Reversibility is NOT byte-exact**: `down()` restores 12 of 13; the one it
cannot is a row already at the target posture before `up()` ran, which is indistinguishable from a migrated
one. That limitation is in the `down()` docblock and pinned by name in a spec. Recovery is a console preset
re-publish.

From captured production evidence, `presetMetadata` is **absent on every captured row**, so the
unclassifiable branch is what production actually looks like — it is treated as the guided rung, matching
what the server already does with those rows. **A definitive population count needs the read-only query in
the migration docblock; it has never been run against production.**

---

## STEP 2 — Frontend

- `BACKEND_URL` is a GitHub secret and unreadable locally. **Recover it from the running task definition
  env** (`https://api.devoid.one`).
- ⚠️ **Bake `NEXT_PUBLIC_FRONTEND_SECURITY_FINDINGS_V2=true`.** The running server env says on; the
  workflow input defaults to **false**; these are build-time inlined. A no-input dispatch ships the bundle
  with it OFF while the server claims ON.

---

## STEP 3 — Agent release. This is what makes the whole wave real.

**Until this runs, every Installers fix in this wave is live on ZERO endpoints** — the quarantine
data-loss fix included.

- `release.yml` needs `-f bootstrap_trust_chain=true` **and `-f managed_firefox=false`**.
- If any browser-extension source changed, **bump all five version sources**.
- This cannot be done off GitHub: the workflow resolves the version by verifying the current stable
  channel's signature, Authenticode-signs six executables plus the installer and bundle with timestamps,
  and publishes under OIDC with signing material in GitHub secrets.

---

## STEP 4 — then, and only then, the substrate proofs

An enrolled endpoint unlocks the four proofs that are currently NOT-RUN. Three of the four are gated on
**enrolment**, not installation — that was measured on this machine on 2026-08-26.

⚠️ **Hook removal is refused outright on a managed endpoint** and needs an admin grant. Plan the teardown
before enrolling anything you want back.

---

## Do not do these

- Do not repoint `cera-artifact_analysis_cache-staging`. The similarly-named `-production` table is empty.
- Do not widen the Codex hook-trust dialect pin without two vendor artefacts.
- Do not ship `allowed_sandbox_modes` without `read-only` — that omission has bricked desktops.
- Do not disturb exit code 31 for an unreadable WSL registration.
- Do not make `EffectiveResult.Clean()` true while a tier is unobserved.

## One live security item, independent of all of the above

`install-scripts/development/install-windows.ps1:16` carries a **production-shaped API key as the default
value** of its key parameter, with the backend URL defaulting to production on the next line. The
"API key is required" guard at `:40` can never fire, because the default is non-empty. Running that script
bare enrols a machine into the production tenant using a credential that lives in the repository.
**Rotate the key and make the parameter mandatory.** This is not gated on billing.
