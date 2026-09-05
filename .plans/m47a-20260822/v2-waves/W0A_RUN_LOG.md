# Wave 0A run log

## 2026-08-28T15:38:10Z — pre-fix live endpoint observation

**Status: NOT EXERCISED**

The required live decision observation could not be performed before the source change because no
reachable enrolled endpoint was available:

- `devoid` was not present on this workstation's `PATH`.
- The reviewed system/user install locations contained no `devoid.exe`.
- Nothing was listening on `127.0.0.1:19280`.
- The parallel-programme handshake records that the 2026-08-27 real-box cycle ended in uninstall and
  warns that running an unisolated locally-built binary would rewrite the active Claude/Codex user
  configuration.
- Read-only AWS inventory in account `113627991972`, region `eu-north-1`, returned zero running EC2
  instances and zero SSM managed instances.

No request was sent to `/v1/ai/policy` or `/v1/ai/tool-decision`; therefore neither the two benign
denies nor the `rm -rf /` liveness control was observed. No shell deletion command was executed.

Per the programme evidence contract, compiled-regex and source evidence are not substituted for this
observation. The before state remains **NOT EXERCISED**, not green. Repository work may demonstrate a
correct source change, but Wave 0A cannot claim live customer-impact closure until an owner-approved
agent release reaches a real endpoint and the after observation has a passing control. If a pre-fix
endpoint becomes available before release, this section must be appended with its version, served
disposition, two benign decisions, and control decision; this entry must not be rewritten.
