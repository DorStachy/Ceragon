# Code Security Benchmark Fixtures (Phase 6)

Seeded critical/high vulnerability fixtures used by the scoring
script `scripts/code-security-benchmark.js`. Run after a clean
scanner-worker deploy to validate the detection rate, evidence
mode behavior, and pre-push hook latency claimed by the Code
Security product contract.

## Fixture set

| ID | Category | Severity | Description |
|---|---|---|---|
| sast-eval-1 | SAST | HIGH | `eval(req.query.code)` injection |
| sast-sqli-1 | SAST | HIGH | Tagged-template SQL string concat |
| sast-cmdi-1 | SAST | HIGH | `child_process.exec($USER_INPUT)` |
| secrets-aws-1 | SECRETS | CRITICAL | Live-looking AWS key shape |
| secrets-pem-1 | SECRETS | HIGH | Embedded private key marker |
| sca-dep-1 | SCA | CRITICAL | Pinned vulnerable lodash version |
| iac-tf-1 | IAC | HIGH | S3 bucket with public-read ACL |
| iac-tf-2 | IAC | HIGH | Security group 0.0.0.0/0 ingress |
| actions-1 | ACTIONS | HIGH | Pinned action by floating tag |
| posture-1 | POSTURE | HIGH | Missing Dockerfile USER directive |

## How to run

```bash
node Backend/scripts/code-security-benchmark.js --fixtures fixtures/code-security-benchmark --report fixtures/code-security-benchmark/last-report.json
```

Acceptance: the report claims >=85% detection across the table
above, hook latency p95 <= 3000ms on the pre-push-strict profile,
and evidenceMode=MINIMAL produces zero source-derived field
captures (snippet/diffContext/patchSuggestion/ideFixPrompt all
null on every emitted finding).
