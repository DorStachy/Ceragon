# P47 Wave 0 run log

Last updated: 2026-08-29 (Asia/Jerusalem)

This log separates repository proof, read-only production observations, and owner-gated live
changes. It contains no task-definition payloads, environment values, credentials, customer content,
or cloud account identifiers.

## Repository changes

| Task | State | Evidence |
|---|---|---|
| 2–3 — committed task-definition privacy invariant and removal | **MERGED** | Scanner PR #42; merge is present on `origin/main` at `2e33812`. The validator defeat rejects any enabled `*_ALLOW_MINIMAL`, all three committed task definitions validate, and CI was green. |
| Baseline dependency audit remediation | **MERGED** | Scanner PR #43; merge `b4f6067`. All three package audits reported zero vulnerabilities and required CI passed. This was isolated so the privacy PR did not waive a security gate. |
| 8 — provider pre-egress assertion and R1 input | **MERGED** | Scanner PR #44, source tip `4dcbef8`. Direct-client MINIMAL defeat tests record zero Anthropic/Gemini transport calls; provider inventory is 2/5; R1 remains `NOT_READY` with named blockers and F16 remains `BLOCKED`. |

## Read-only AWS observation — 2026-08-29

The operator identity and intended region were verified before reading state. No mutation was
performed and no credential, account id, task-definition value, or customer payload is recorded here.

### Task 1 — live scanner task definitions

The defect was still deployed at observation time.

| Family | Live/latest revision observed | Enabled `*_ALLOW_MINIMAL` names | Service state |
|---|---:|---:|---|
| `codefence-scanner-worker` | 164 | 2 | service points to 164; desired/running 0/0 |
| `codefence-scanner-worker-fullrepo` | 40 | 2 | service points to 40; desired/running 0/0 |
| `codefence-scanner-worker-heavy` | 96 | 2 | no service in the scanner-service inventory |

The two names on every revision were
`CODEFENCE_GEMINI_VULN_REVIEW_ALLOW_MINIMAL` and
`CODEFENCE_OPUS_BASELINE_ALLOW_MINIMAL`. Values and the rest of each task definition were not read
into this log. Task 1 remains **BLOCKED — PRODUCTION MUTATION REQUIRES FRESH OWNER AUTHORIZATION**.
The revisions above must be re-read immediately before any authorized change; they are observations,
not permanent rollback coordinates.

### Task 4 — Backend ECS Exec

At observation time, `backend-service` was desired/running 1/1 with `enableExecuteCommand: false`,
and the execution role did not carry the required ECS Exec message permission. Task 4 remains
**BLOCKED — PRODUCTION IAM/SERVICE MUTATION AND AN INTERACTIVE LIVE SESSION REQUIRE FRESH OWNER
AUTHORIZATION**.

### Task 7 — power-on verification

Both scanner services were desired/running 0/0. No scan, provider call, or CloudWatch absence is
claimed as proof. Task 7 is **NOT EXERCISED**.

## Remaining Wave 0 state

- Task 1: repository half merged; observed live revisions were unchanged and vulnerable.
- Tasks 2–3: merged and CI-proven.
- Task 4: not changed; live precondition measured.
- Task 5: no `.codefence.yml` existed in the seven local product repositories checked. The enabled
  repository denominator must come from the authenticated Backend endpoint before any repo is
  claimed covered.
- Task 6: no policy write performed. The live org-default row and `failOn` preservation proof remain.
- Task 7: not exercised because scanner services were powered off.
- Task 8: merged in PR #44; R1 intentionally remains `NOT_READY`.

Wave 0 is therefore **NOT COMPLETE**. No live state was modified during this evidence pass.
