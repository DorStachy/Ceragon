# Wave 0A run log

## 2026-08-28T15:38:10Z — pre-fix live endpoint observation

**Status: NOT EXERCISED**

The required live decision observation could not be performed before the source change because no
reachable enrolled endpoint was available:

- `devoid` was not present on the workstation's `PATH` or reviewed install locations.
- Nothing was listening on `127.0.0.1:19280`.
- The parallel-programme handshake records that the preceding real-box cycle ended in uninstall and
  warns that running an unisolated locally-built binary rewrites active Claude/Codex configuration.
- Read-only AWS inventory returned zero running EC2 instances and zero SSM managed instances. The
  account identifier is deliberately omitted.

No request was sent to `/v1/ai/policy` or `/v1/ai/tool-decision`; neither benign deny nor the
`rm -rf /` liveness control was observed. No deletion command was executed.

Compiled-regex and source evidence do not substitute for this observation. The before state remains
**NOT EXERCISED**, not green, and cannot be recreated after a release.

## 2026-08-29 — source checkpoint

Installers PR #221 is independently **APPROVED** at exact SHA
`14e19b23faed4a74a5385fa35d4f1872daf0c592`. Affected source gates, C12, the 2,842-decision golden
with zero row delta, vet, and the clean paired performance pass are green. The source remains
deliberately **UNMERGED** because Docker Desktop/WSL could not provide the final mirror run.

Accepting that evidence exception is an owner decision. No agent release occurred. After an
owner-authorized merge and combined P9/P47 release, the real enrolled-endpoint after-observation is
still required; until then, live customer-impact closure is **NOT PROVEN**.
