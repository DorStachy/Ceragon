# Fix specs — Codex governance

Authored from settled investigation, not merged from a reviewed spec set. Sources, all verified:
plan §§7b–7f · `docs/CODEX_GOVERNANCE_PRODUCTION_DEFECT_INVESTIGATION.md` (against installed rev `36ca1ad3`) ·
private machine-lock and hook traces retained in the authorized local workspace (against `openai/codex` @
`rust-v0.147.0`). The sensitive raw traces are intentionally not published.

**Scope decision (owner, 2026-08-09):** build the **machine-hook lane** properly and take the wire proxy off the
critical path. **No network/WFP containment programme.** The residual adversarial exposure is stated honestly, not
engineered away. Do not relitigate this in the specs below.

**The goal in one line:** govern Codex where we govern Claude — at its decision points — instead of on its network
cable. Codex's machine requirements file is SYSTEM-owned and ACL-protected and **survives `CODEX_HOME` rotation and
direct binary invocation**, so done right this is *stronger* than Claude's user-writable `settings.json`.

---

## CX-1 — Emit a hook command Codex can actually run  [CRITICAL · agent · M]

### Root cause (settled)
The machine provider supplies the launcher as bare `os.Executable()` (`cmd/devoid/ai_codex_machine.go:124-134`,
`cmd/devoid/ai.go:1463`) and the renderer appends only the canonical event token plus a provenance marker
(`internal/codexmanaged/hookset.go:93-125`, `internal/codexmanaged/machine_projection.go:623-636`). So
`requirements.toml` instructs Codex to run:

```
devoid.exe SESSION_START <marker>
```

when the real entrypoint is `devoid.exe ai hook --adapter codex --event SESSION_START --provenance <marker>`. The
top-level dispatcher recognises `ai`, not `SESSION_START` (`cmd/devoid/main.go:341-346`), so the process prints
`Unknown command:` and **exits 1**. `runAIHook` (`cmd/devoid/ai.go:584-685`) is never entered.

Codex 0.147 runs Windows hook strings through `COMSPEC`-or-`cmd.exe /C` with one extra raw outer quote pair
(`hooks/src/engine/command_runner.rs:168-218`) — **not** argv-split, **not** direct exec.

### What changes
1. **Installers** `internal/codexmanaged/machine_projection.go:623-636` — replace the machine use of
   `hookCommandForProv` with a machine renderer that emits the full invocation:
   `"<abs devoid.exe>" ai hook --adapter codex --event <CANONICAL> --provenance <marker>`.
   The cooperative script already demonstrates correct Windows and Unix forms (`internal/codexmanaged/script.go:80-89`)
   — reuse its quoting, do not invent a second one.
2. **Installers** `internal/codexmanaged/hookset.go` — emit the **`commandWindows`** key on the Windows dialect.
   Codex prefers it over `command` on Windows (`hooks/src/engine/discovery.rs:458-469`). Quote for `cmd /C`
   semantics: the whole string is wrapped once more by Codex, so inner quoting must survive that.
3. **Installers** `cmd/devoid/ai_codex_machine.go:124-134` — stop passing the bare executable as `HookCommand`; pass
   the rendered command.

### Tests
- Render every event for the Windows dialect and execute each through a real `cmd /C` with a captured fixture.
  **Defeat:** drop the `ai` token, or change the event name — every event must fail the assertion.
- Golden-file the rendered `requirements.toml`. **Defeat:** revert `machine_projection.go` to the bare form; the
  golden must not match.
- Path-with-spaces case: install under a directory containing a space and re-run the execution test.
  **Defeat:** remove the outer quotes; the command must fail to resolve.

### Risks
The command string passes through a user-controlled `COMSPEC`. Use absolute paths; do not assume `cmd.exe`.

---

## CX-2 — Exit 1 never denies; adopt the real deny contract  [CRITICAL · agent · M]

### Root cause (settled)
Even with CX-1, our handler's exit code is wrong. Codex 0.147's contract
(`hooks/src/engine/output_parser.rs:338-356`, per-event files under `hooks/src/events/`):

- **Exit 1 never denies.** Every unexpected non-zero exit fails open.
- **Exit 2 + non-empty trimmed `stderr` blocks** on block-capable events. No stdout JSON required on that path.
- Exit 2 with **empty** stderr fails open.
- Exit 0 JSON must be a single object matching a strict `deny_unknown_fields` schema; malformed fails open.
- Spawn error, crash, timeout, stdin/wait failure → fail open.
- Default timeout 600s, configurable, min 1s. **`SessionEnd` is 1s default / 3s max.**

Deny-capable events are **six**: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`,
`SubagentStop`. `PreCompact`/`PostCompact`/`SessionStart` can only halt via exit-0 `{"continue":false,...}`.
`SessionEnd` and `SubagentStart` are **not deny-capable**.

### What changes
1. **Installers** `internal/airuntime/adapters/codex/response.go` — emit **exit 2 with a non-empty secret-free reason
   on stderr** for a deny on the six block-capable events; keep the exit-0 JSON form as the primary where the
   event-specific schema is richer (`PreToolUse` `permissionDecision:"deny"`, `PermissionRequest`
   `decision.behavior:"deny"`). Never exit 1 on a deny path.
2. **Installers** — per-event contract table in the adapter, one entry per event, driven from a single constant so
   the six/eleven split cannot drift.
3. **Installers** — make the `SessionEnd` path meet a **1-second** budget: fire-and-forget, no backend round trip.
   Anything slower is dropped by Codex.
4. **Installers** — a deny reason must never contain prompt-derived bytes; `stderr` is rendered to the user.

### Tests
- Table test, one row per event: assert the exit code and stream we produce for allow / deny / error.
  **Defeat:** return exit 1 with valid JSON — the deny assertion must fail. Return exit 2 with empty stderr — must
  also fail.
- `SessionEnd` latency test under 1s. **Defeat:** add a backend call; the budget assertion must fail.

### Risks
`PostToolUse` "block" only stops continuation — the tool has already run. Do not describe it as prevention.
`Stop`/`SubagentStop`: any handler returning `continue:false` suppresses **every** `decision:block`
(`hooks/src/events/stop.rs:373-405`) — never emit `continue:false` from a deny path.

---

## CX-3 — Repair the already-deployed malformed baselines  [HIGH · agent · M]

### Root cause
Every endpoint in the field carries the malformed short form in a **SYSTEM-owned, ACL-protected**
`requirements.toml` (`internal/codexmanaged/machine_acl_windows.go:15-28`). A normal user cannot repair it, so a
code fix alone leaves the fleet dead until an elevated rewrite runs.

### What changes
1. **Installers** `cmd/devoid/main.go:341` — a **narrow** compatibility dispatcher recognising **only** the exact
   legacy shape `<known-canonical-event> <verified-provenance-marker>` and routing it into `runAIHook` with the
   equivalent Codex flags. **Do not create a general bare-event alias** — it becomes a permanent second entrypoint.
2. **Installers** — a SYSTEM startup migration that atomically rewrites DeVoid-owned tables in the machine baseline
   to the canonical argv, then re-reads and verifies.
3. Ship via the existing SYSTEM/HIGHEST updater (`cmd/devoid/main.go:2295-2363`, `internal/daemon/update.go:133-147`).
   Where the privileged updater is absent or broken, the endpoint must report **explicitly legacy/unproven**, never
   governed.

### Tests
- Old baseline + new binary → hooks fire via the bridge. **Defeat:** disable the bridge; hooks must go back to failing.
- Migration writes canonical argv and re-reads it. **Defeat:** deny the SYSTEM write; the endpoint must report
  legacy/unproven rather than green.

---

## CX-4 — Attestation must validate the whole argv, and a canary must be real  [HIGH · agent · M]

### Root cause
Validation checks path, signer/digest text, timeout, event presence and whether the **first executable exists** —
it never parses or executes the full argv (`internal/codexmanaged/machine_projection.go:298-355`,
`internal/codexmanaged/provider.go:455-500`). Tests explicitly accept the defective grammar
(`machine_hook_resolvable_test.go:130-155`). Worse, a live canary is optional: **zero attempted canaries can still
become `MATCHED`** (`internal/airuntimeintegrity/controller.go:543-646`), and machine status returns `true` while
printing `CANARY_PENDING` (`cmd/devoid/ai_codex_machine.go:284-294`).

### What changes
1. Validate the **complete argv**: the executable resolves **and** the argument vector enters the intended CLI path.
   Assert it by execution against a fixture, not by string inspection.
2. Delete the test that accepts the bare form; replace with one that rejects it.
3. **Zero attempted canaries can never be `MATCHED`.** A target with no canary is `NOT_PROVEN`.
4. Machine status must not return success before a fresh live negative-control canary. Ties into F38.

### Tests
- Feed a resolvable executable with wrong arguments. **Defeat:** it must FAIL attestation — this is the exact class
  that shipped.
- Assert `MATCHED` is unreachable with zero canaries. **Defeat:** restore the optional-canary path; the assertion
  must fail.

---

## CX-5 — Pin the machine requirements that make hooks load at all  [HIGH · agent · S]

### Root cause
Hook construction is gated on `Feature::CodexHooks` (`core/src/session/mod.rs:4137-4167`). `allow_managed_hooks_only`
is a **requirements** field read from the machine layer (`hooks/src/engine/discovery.rs:53-87`) and suppresses user,
project, session/`-c` and plugin hooks — but **not** machine, system, MDM, enterprise, or legacy
`managed_config.toml` hooks.

### What changes
1. Pin `[features] hooks = true` in the machine requirements. Without it every hook is inert regardless of grammar.
2. Keep `allow_managed_hooks_only = true`, but activate it **only** alongside a verified-runnable machine command —
   paired with a broken command it suppresses every fallback, which is today's state.
3. Protect the **handler and its dependencies**, not only the requirements file.
4. Record the known hole: `$CODEX_HOME/managed_config.toml` hooks are classified *managed* **regardless of actual
   ACL** (`config/src/loader/layer_io.rs:170-181`, `hooks/src/engine/discovery.rs:677-690`), so a rotated
   `CODEX_HOME` can inject hooks that survive the filter. Surface it; do not claim it is closed.

### Tests
- Remove the feature pin → hooks inert. **Defeat:** the test must go red when the pin is present.

---

## CX-6 — WSL coverage: a Windows baseline cannot reach a Linux Codex  [HIGH · agent · L]

### Root cause
Machine-file selection is **compile-target based**: a Windows binary reads the ProgramData known folder, a Linux
binary reads literal `/etc/codex/requirements.toml`. There is no `/mnt/c` bridge and no host-Windows lookup
(`config/src/loader/mod.rs:641-657`). Our own layout agrees (`internal/codexmanaged/machine.go:53-57`).

**This is live on the owner's box:** the VS Code extension launches a Linux Codex inside WSL with its own home, and
that lane is entirely outside the Windows machine lock. Our status conflates "Windows root missing" with "all Codex
surfaces ungoverned" — a wrong-namespace bug in both directions.

### What changes
1. Discover WSL distros and treat each as a first-class runtime instance (executable, distro, UID, effective home).
2. Install and maintain a root-owned `/etc/codex/requirements.toml` **inside each distro**, with the Unix hook form.
3. Attest per distro. Report a distro with no baseline as **uncovered**, not as part of a Windows verdict.
4. Fix the status roll-up so per-surface coverage is reported per surface.

### Tests
- Two distros, one covered and one not → status shows exactly that. **Defeat:** remove the covered distro's file;
  its row must flip.

### Risks
Writing into a WSL distro as SYSTEM crosses a trust boundary. Follow the existing rule: SYSTEM inspects, the
least-privileged per-user task writes.

---

## CX-7 — Authorized opt-out must be visible, attributed and expiring  [HIGH · agent+backend+frontend · M]

### Root cause
`~/.devoid/aiwire-optout/<runtime>_<hash>.json` causes reconcile to return **before** proxy health or file repair
(`internal/airuntimeintegrity/local_disablement.go:44`, `internal/aiwire/aiwire.go:232-245`). It is honoured
indefinitely, carries only `runtime/home/optedOutAt`, has no console surface, and no event marks the transition.
**Live case:** written 2026-08-08T21:57:52Z by the owner running the un-brick command after a block bricked a Codex
thread. Correct and authorized — and invisible for four hours.

### What changes
1. Render as **`SKIPPED_AUTHORIZED`** — visibly missing **and** authorized. Never green, never auto-repaired.
2. Extend the marker: **who, when, why, and an expiry** with a default TTL, after which the product asks again.
3. Emit an event on both transitions (opt-out taken, opt-out lapsed/restored) — a log line is not enough.
4. Surface it in the console as endpoint coverage state, not only in a local CLI command.
5. **Do not auto-clear existing markers** in any fix. Re-enabling while CX-8/CX-9 are unfixed re-bricks the user.

### Tests
- Marker present → status `SKIPPED_AUTHORIZED`, console shows it, an event exists. **Defeat:** delete the marker;
  the state must change and a second event must fire.
- Expired marker → product re-asks. **Defeat:** set a far-future expiry; it must stay opted out.

---

## CX-8 — Never convert a transport abort into a policy hold  [HIGH · agent · M]

### Root cause (revised — the original F23 framing was wrong)
`internal/proxy/openai_sse.go:77-83` recovers **every** panic without checking its type and converts it to
`writeHold` (`:294-297`). Streaming is delegated to `httputil.ReverseProxy` (`internal/proxy/proxy_stream.go:28-60`),
which raises `http.ErrAbortHandler` for upstream body-read errors, downstream write errors and short writes after
headers. The copy error is discarded, so upstream truncation and client disconnect are indistinguishable.

**The three measured panics did NOT kill their turns** (6.8–9.1s after ALLOW; one executed a tool afterwards, one
received `response.completed`). They produced **false "held" telemetry**. A pre-terminal abort could still kill a turn.

### What changes
1. **Re-panic `http.ErrAbortHandler`.** Never turn a transport fault into policy.
2. Replace opaque reverse-proxy copying with phase-aware relay instrumentation: headers-committed, bytes/events
   relayed, last valid frame, terminal seen, upstream read error, downstream write error, cancellation cause.
3. Add a response-header deadline and a stream-idle deadline (not a short absolute completion timeout).
4. Add a decoded-size cap (there is a compressed cap but none after decode) and a global admission bound.
5. Drain by terminal state on upgrade; the 5-second unconditional drain is insufficient.

### Tests
- Upstream EOF before terminal, after terminal; downstream cancellation; fragmented events; header stall; idle stall.
  **Defeat:** reintroduce the catch-all `writeHold` — an upstream fault must then be misclassified and fail the test.

### The phase invariant (check code against this)
> Before dispatch, a policy denial sends **zero** upstream bytes. After dispatch, policy is immutable for that
> request: upstream failures stay upstream failures, downstream disconnects stay disconnects, and exactly one
> upstream terminal is relayed when available.

---

## CX-9 — Attribution: stop colliding with OpenAI's reserved error code  [HIGH · agent · M]

### Root cause (settled — not malformed SSE)
`writeBlockNotice` emits HTTP 200 SSE `response.failed` with `error.code="cyber_policy"`
(`internal/proxy/openai_sse.go:368-417`). Codex **preserves our message** but classifies it as `CyberPolicy`
(`codex-api/src/sse/responses.rs:390-419`), and the TUI, Desktop and VS Code all branch on that classification to
render OpenAI's fixed cyber-safety surface **instead of our text** (`tui/src/chatwidget/turn_runtime.rs:438-477`).
We were overwritten by a name collision, not by a protocol error.

### What changes
1. Emit, in order: HTTP 200 SSE → a secret-free `response.output_item.done` **assistant** item naming DeVoid plus an
   opaque decision id → `response.failed` with non-retryable **`invalid_prompt`**. **Never** `response.completed`.
2. Add coarse `X-DeVoid-Decision` / version / opaque-id headers for diagnostics only; do not expect clients to show them.
3. Do **not** inject a system message upstream — the marker is a local client-visible event carrying no
   prompt-derived data.
4. Notification copy must name the surface the user is actually in. Deliver via a **per-user broker over ACL'd IPC**:
   SYSTEM-context toast delivery may target session 0, so current user visibility is UNPROVEN
   (`internal/notify/notify_windows.go:25-65`).
5. Do **not** enable the WS lane's top-level 403/custom error — it is **retryable** in Codex.

### Tests
- Per packaged client (CLI, `codex exec`, `--json`, Desktop, VS Code): the DeVoid decision id appears, the turn ends
  non-retryable. **Defeat:** restore `cyber_policy`, or remove the assistant item, or emit `response.completed` —
  each must fail the UI/retry assertion.

---

## CX-10 — Replay: unreachable because it depends on a dead hook  [HIGH · agent · L]

### Root cause
The deployed replay sanitizer is correct but unreachable. Its only current-turn boundary oracle is
`RecentPrompt`, written **only** on successful prompt-check handling (`internal/daemon/ai_handlers.go:1603-1610`)
— i.e. by the dead `UserPromptSubmit` hook. With no match, `currentKnown=false` and sanitation is refused
(`internal/proxy/ai_context_replay.go:86-146`), so the full-history decision re-blocks the historical secret
(`internal/proxy/openai_decision.go:305-339`). **F22 is downstream of CX-1/CX-2.**

Two further defects: the correlation store is global, bounded, 30-minute, **not session-bound**, and matched with
`strings.Contains` (`internal/daemon/ai_recent_prompt.go:17-95`). And with `previous_response_id` present, `TurnKey`
ignores current input (`internal/proxy/openai_denystore.go:105-127`) and the persisted-deny check runs **before**
extraction (`openai_decision.go:247-264`) — real but **dormant** on the current SSE transport.

### What changes
1. Bind current-prompt evidence to session/thread + runtime + provider + newest hook sequence + exact prompt bytes.
   Replace substring matching.
2. Move the persisted-deny consult to **after** extraction and sanitation.
3. Key retry memory from the normalised request, not from `previous_response_id` alone.
4. Masking safety is already correct and must be preserved: rewrite only DLP spans wholly outside the current
   prompt; boundary-overlapping or unmappable spans stay blocked; re-extract and rerun the full decision engine
   before forwarding (`internal/proxy/ai_context_replay_test.go:178-239` proves the marker, not the secret, egresses).
5. Accept and document the cost: masking changes model context, token accounting and prompt-cache prefix hits.

### Tests
- Block turn A, send clean turn B containing the historical secret: B forwards redacted history; a *current-turn*
  secret still blocks. **Defeat:** remove session binding or restore substring matching — cross-session correlation
  must then be caught by the test.
- Tripwire upstream scanning every request byte, header, log, event and notification for the planted secret.
  **Defeat:** bypass the sanitizer; the tripwire must fire.

### Recovery
Today, starting a new conversation is the only deterministic remedy — and nothing says so. Ship the in-product
"this thread is poisoned, start a new one" affordance as part of CX-11. Content already referenced by an opaque
server-held `previous_response_id` cannot be rewritten locally; a secret that reached the provider cannot be recalled.

---

## CX-11 — Lesser levers, so disabling governance is never the only escape  [HIGH · agent+frontend · M]

### Root cause
When a block bricked a thread the only available remedy was to switch the product off. There is no scoped bypass, no
time-boxed pause, and no in-product explanation of the actual remedy.

### What changes
1. **Scoped one-turn bypass** — reuse the existing `devoid ai allow-once` machinery, surfaced where the user hits
   the block rather than only in a terminal.
2. **Time-boxed pause** with an expiry and a recorded reason (shares CX-7's marker schema).
3. **In-product remedy text**: name the class, say the thread carries a blocked value, and state that a new
   conversation clears it.

### Tests
- Trigger a block, use each lever, confirm the next turn proceeds and the event ledger records which lever was used.
  **Defeat:** remove the ledger write; the audit assertion must fail.

---

## CX-12 — Demote the wire proxy from load-bearing to defence-in-depth  [MEDIUM · agent · M]

Once CX-1/CX-2 land, prompt DLP is enforceable at `UserPromptSubmit`, which is where Claude is governed. The proxy
then remains useful for what hooks cannot see — bytes the client sends that never pass a prompt hook — but it must
no longer be the only lane, and a proxy failure must not be a tool outage.

1. Health-gate the route continuously, not only at wiring time, and restore it when health returns (today the skip
   is Info-log-only and unbounded).
2. Apply the health gate to **every** R5 writer — currently only the shared-core branch checks `DaemonHealthy`
   (`internal/aiwire/aiwire.go:295`); the full CLI-only profile writes R5 with no check (`:269`).
3. Replace the retry timestamp with an outcome journal:
   `DISCOVERED → STARTED → DEFERRED_PROXY_UNHEALTHY | SKIPPED_AUTHORIZED | REPAIR_FAILED | VERIFY_FAILED |
   PROVEN_GOVERNED`, with attempt id, runtime/root identity, timestamps, reason slug and canary time. Today
   Task Scheduler result 0 covers all of throttled / absent / opt-out / unhealthy / write-failed / compliant /
   repaired.
4. Fix the enrollment message: "CLI still governed via shim" is false — say model egress and DLP are not governed
   until the healthy route is restored (`cmd/devoid/setup_installer.go:399`).
5. Replace the spoofable unauthenticated health marker (`setup_installer.go:709`) with a short-lived nonce-bound
   readiness proof.
6. Label upload coverage honestly: **text inspected; image/encrypted/opaque content uninspected**
   (`internal/proxy/openai_frame.go:71,147`). Transport presence is not upload DLP.

**Watch item:** the Responses scanner preserves unknown input-item and content-part types **without scanning them**.
If the vendor moves user text into a new content type, prompts silently stop being inspected. Add an
unknown-type counter that reports rather than passes silently.

---

## CX-13 — Honest residual (ship this text, do not engineer it away)
- **Fail-open on handler failure** is deliberate in Codex: spawn error, timeout, crash, malformed output, exit 1 →
  allow. A dead daemon is an ungoverned turn. Claude has the same property (F18).
- **`COMSPEC` is user-controlled**, so the hook launches through a shell the user can replace.
- **`--remote` escapes** — the remote server's config governs.
- **Legacy classification hole** — a rotated `CODEX_HOME` can supply `managed_config.toml` hooks that pass
  `allow_managed_hooks_only`.
- **A patched/embedded binary** can set `ignore_managed_requirements`.
- **Desktop-app coverage is UNPROVEN.** CLI, `codex exec` and the VS Code extension (via app-server) are proven.

Claim to make: *"governs the normal path on every proven surface, and records honestly when it cannot; not a hard
boundary against a determined local administrator."*

---

## Build order
CX-1 → CX-2 → CX-4 (grammar, contract, then the attestation that proves them) → CX-3 (field repair) → CX-5 →
CX-8 → CX-9 → CX-10 (needs CX-1/CX-2) → CX-7 + CX-11 → CX-6 → CX-12.
