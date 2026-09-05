# P47 Wave 0 run log

Last updated: 2026-08-29 (Asia/Jerusalem)

This log separates repository proof, read-only production observations, and owner-gated live
changes. It contains no task-definition payloads, environment values, credentials, or customer
content.

## Repository changes

| Task | State | Evidence |
|---|---|---|
| 2–3 — committed task-definition privacy invariant and removal | **MERGED** | Scanner PR #42; merge is present on `origin/main` at `2e33812`. The validator defeat rejects any enabled `*_ALLOW_MINIMAL`, all three committed task definitions validate, and CI is fully green. |
| Baseline dependency audit remediation | **MERGED** | Scanner PR #43; merge `b4f6067`. All three package audits report zero vulnerabilities and all required CI checks passed. This was isolated so the privacy PR did not waive a security gate. |
| 8 — provider pre-egress assertion and R1 input | **MERGED** | Scanner PR #44, source tip `4dcbef8`. Direct-client MINIMAL defeat tests record zero Anthropic/Gemini transport calls; provider inventory is 2/5; R1 remains `NOT_READY` with six named blockers and F16 explicitly `BLOCKED`. All required CI checks passed before merge. |

## Read-only AWS observation — 2026-08-29

Identity was verified before reading state: account `113627991972`, region `eu-north-1`.

### Task 1 — live scanner task definitions

The defect is still deployed. No mutation was performed.

| Family | Live/latest revision observed | Enabled `*_ALLOW_MINIMAL` names | Service state |
|---|---:|---:|---|
| `codefence-scanner-worker` | 164 | 2 | service points to 164; desired/running 0/0 |
| `codefence-scanner-worker-fullrepo` | 40 | 2 | service points to 40; desired/running 0/0 |
| `codefence-scanner-worker-heavy` | 96 | 2 | no service in the scanner-service inventory |

The two names on every revision are
`CODEFENCE_GEMINI_VULN_REVIEW_ALLOW_MINIMAL` and
`CODEFENCE_OPUS_BASELINE_ALLOW_MINIMAL`. Values and the rest of each task definition were not
printed. Task 1 remains **BLOCKED — PRODUCTION MUTATION REQUIRES FRESH OWNER AUTHORIZATION**. The
observed rollback revisions are 164, 40, and 96; they must be re-read immediately before any
authorized change.

### Task 4 — Backend ECS Exec

`backend-service` is live on `backend:324`, desired/running 1/1, with
`enableExecuteCommand: false`. `ecsTaskExecutionRole` has 19 inline policies and no
`AllowEcsExecSsmMessages` policy. Task 4 remains **BLOCKED — PRODUCTION IAM/SERVICE MUTATION AND AN
INTERACTIVE LIVE SESSION REQUIRE FRESH OWNER AUTHORIZATION**.

### Task 7 — power-on verification

Both scanner services are at desired/running 0/0. No scan, provider call, or CloudWatch absence is
claimed as proof. The scanner-specific scalable-target query returned no target. Task 7 is
**NOT EXERCISED**.

## Remaining Wave 0 state

- Task 1: repository half merged; live AWS revisions unchanged and still vulnerable.
- Tasks 2–3: merged and CI-proven.
- Task 4: not changed; live precondition measured.
- Task 5: no `.codefence.yml` exists in the seven local product repositories checked. The enabled
  repository denominator must come from the authenticated Backend endpoint before any repo can be
  claimed covered.
- Task 6: no policy write performed. The live org-default row and `failOn` preservation proof are
  still required.
- Task 7: not exercised because scanner services remain powered off.
- Task 8: merged in PR #44; R1 intentionally remains `NOT_READY`.

Wave 0 is therefore **NOT COMPLETE**. No live state was modified during this evidence pass.
