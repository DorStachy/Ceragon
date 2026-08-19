# Carried forward — noticed during a scoped fix, deliberately NOT fixed

One line per item: `- [severity] file:line — one sentence`.
A carried-forward item is a success of the pass that recorded it, not a failure.

## From fix/go-flap-route4 (the fourth five-minute rewrite-and-flap door), 2026-08-19

- [medium] Installers/cmd/devoid/setup_installer.go:497 — `governedAgents` still omits `res.InstalledUnattested`, so the enrolment's last line can read "No AI agents detected to wire (homes absent)" over a Codex that is installed and egress-governed but whose hook-trust dialect could not be attested (the unmerged branch `fix/go-flap-second-verdict`, commit c6608646, fixes this class generically from disk presence — do not fix it twice).
- [info] integ/gate-go — the brief stated two flap doors were already closed on this branch, but only one is: `130220ea` (hook-trust dialect) is an ancestor; `cfba9caa`/`c6608646`/`16a0e454` (the `diverged` and redirected-CODEX_HOME doors, plus `internal/aiwire/reconcile_decision.go` which centralises the whole decision) are still on the unmerged branch `fix/go-flap-second-verdict` — this route-4 fix was therefore built on the pre-centralisation two-branch shape and will need a small merge onto `reconcile_decision.go` when that branch lands.
- [low] Installers/internal/codexmanaged/requirements.go:733 — `knownTrustLevel` is a hard-coded closed vocabulary (`trusted`/`untrusted`/`none`/empty) with no telemetry, so a vendor adding a fifth word degrades every endpoint's hook-lane attestation to unreadable with nothing counting how many endpoints it hit.
