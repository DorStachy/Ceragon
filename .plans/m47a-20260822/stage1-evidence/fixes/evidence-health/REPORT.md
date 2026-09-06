# Fix: the evidence-health row believes an endpoint that says it cannot record evidence (Backend)

Branch `p47/fix-evidence-health` (Backend), commits 2b00b8da + 937abdfb, merged into
`p47/integration-backend`. Not pushed, not deployed.

## What was wrong

`endpoint_evidence_health.status` was derived only from what the endpoint delivers: chain
verification freshness, sequence gaps, spool depth and acknowledgement age. An endpoint whose
evidence spool refused to open delivered nothing, so none of those inputs ever moved and the row
read `healthy` for hours (stage-1 second pass, receipt lane) while every audit obligation on the
endpoint failed and no bundle-application receipt could be produced. The heartbeat was the one
channel that endpoint still had.

## What is now true

| piece | change |
|---|---|
| contract (`packages/shared-contracts/src/endpoint-policy-integrity-contract.ts`) | additive `evidenceSpoolCause?: string \| null` on the integrity report; `normalizeEvidenceSpoolCause` accepts absent/null (open) or a slug `^[a-z0-9][a-z0-9:_-]{0,63}$`, and a malformed value rejects the whole report as `malformed` (never coerced, never dropped) |
| `src/health/policy-integrity-shape.ts` | the accepted report's cause becomes column `aiPolicyEvidenceSpoolCause` |
| `src/entities/endpoint-control-state.entity.ts`, `endpoint-evidence-health.entity.ts`, migration `1793600000000-AddEvidenceSpoolCause.ts` | nullable `ai_policy_evidence_spool_cause` and `spool_cause` (varchar 64); older agents send nothing and read as before; Backend deploys before any agent release |
| `src/health/services/health.service.ts` | on an ACCEPTED integrity report the cause is written to control state and carried onto the evidence-health row through the already-injected DataSource (no constructor change), with status re-derived; no row is invented for an endpoint claiming nothing; failures are logged, never turned into a refusal |
| `src/ai-governance/services/endpoint-evidence-health.ts` | `spoolCause` on the derivation input; any non-null claim yields `degraded / spool-unavailable` ahead of every delivery-derived signal |
| `src/ai-governance/services/ai-policy-bundle.service.ts` | **REVERTED 2026-09-06 (ship pass).** The non-production `AI_POLICY_BUNDLE_LIFETIME_MS` seam read `process.env` inside the issuance service, and the full Backend run failed `ai-policy-rollout.service.spec.ts` ("reads no environment variable and no request-scoped flag anywhere in the lane", RA-1 §9.2 I06), which scans this file. The invariant is deliberate — the policy lane must not be steerable by environment — so the file is restored to `origin/main` byte-for-byte (one-hour lifetime, 15-minute reuse floor, constants) and the seam spec is deleted. The expiry behaviour under test is the daemon's, and it stays covered by the Go floor/expiry suite; the 90-second rig shortcut is gone. |

## Tests

- `policy-integrity-shape.evidence-spool-cause.spec.ts`: absent and null read as open; a slug is carried to the column; seven malformed shapes reject the report.
- `endpoint-evidence-health.spool-cause.spec.ts`: an otherwise-healthy row is degraded while the claim stands, the claim wins over a broken chain, null/undefined change nothing, and the row clears when the claim is withdrawn.
- ~~`ai-policy-bundle.lifetime-seam.spec.ts`~~ — deleted with the seam (see the reverted row above).
- `tsc --noEmit` clean; jest on src/health, the evidence-health and verifier services, rollout readiness, the contracts guard and migrations: 85 suites, 634 tests, 0 failures; bundle service specs 52 tests.

## The field name the agent must send

`policyIntegrity.evidenceSpoolCause` (string slug or null). The spool fix lane on the Installers side
chose its own names for the causes; whichever slugs it sends are accepted as long as they match the
charset above, and the backend reports them verbatim in `endpoint_evidence_health.spool_cause`.

## Not done here

The console does not yet render `spool_cause`; readiness and protection-depth already go non-green
because they read the derived status. The live proof (a daemon with an unopenable spool turning the
row degraded within one heartbeat) is run on the rig once the daemon carries the field.
