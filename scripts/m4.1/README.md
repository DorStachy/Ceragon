# M4.1 verification tools

These tools make the selected Governance Profile reproducible without changing
either developer's active checkout.

## Isolated local stack

Run the existing Code Security stack against isolated component worktrees:

```powershell
$base = 'C:\Users\Owner\Documents\Ceragon'
$m41 = 'C:\Users\Owner\Documents\Ceragon-M41'
$compose = @(
  "$base\.codesec-e2e\docker-compose.yml",
  "$m41\Workspace\scripts\m4.1\docker-compose.worktrees.override.yml"
)

& "$m41\Workspace\scripts\local-e2e-reset.ps1" `
  -RepoRoot $base `
  -BackendRoot "$m41\Backend" `
  -FrontendRoot "$m41\Frontend" `
  -ScannerRoot "$m41\GithubApp-Bot-Scanner-Worker" `
  -StaticWorkerRoot "$m41\Static-Worker" `
  -SandboxWorkerRoot "$m41\Sandbox-Worker" `
  -StackDir "$base\.codesec-e2e" `
  -ComposeFiles $compose `
  -NpmCommand 'C:\Program Files\nodejs\npm.cmd' `
  -FullRebuild
```

The overlay clears external LLM credentials and disables remote AI analysis.
Postgres, SQS, S3, and DynamoDB stay local to Docker.
ElasticMQ cannot emulate AWS KMS HMAC, so the overlay explicitly enables the
documented pre-soak unsigned queue fallback for local package E2E only. CI and
production must continue to require the configured KMS signer.

## Live infrastructure preflight

The live check is read-only and prints no secret values:

```powershell
$env:M41_AGENT_SIGNING_KEYRING_SECRET_ARN = '<managed keyring parameter/secret ARN>'
node .\scripts\m4.1\verify-live-posture.cjs `
  --restore-drill .\scripts\m4.1\restore-drill-record.json
```

It exits non-zero until RDS is private, encrypted, deletion-protected, backed up
for at least seven days, both installer buckets have versioning, internal-event
and agent-signing keys are managed-secret references with workload IAM, the
unused Lambda plaintext key is gone, and a fresh restore drill is recorded.

The restore record is evidence, not a switch. Create it only after restoring a
snapshot to a temporary instance, running an application-level read probe, and
deleting the temporary instance.
