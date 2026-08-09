# Prompt to paste into the ChatGPT desktop app

Copy everything below the line. If you can attach or connect the `Installers` repo (Go — the DeVoid agent, daemon,
CLI, proxy and browser extension), do that first; the prompt tells it to distinguish verified-in-source claims from
reasoned ones either way.

---

You are the lead investigator on a live production defect in a security product. I want depth, not breadth — and I
want you to run **multiple parallel investigation agents** (one per track below), then reconcile them into a single
report. Do not answer from one pass of reasoning.

## The product

DeVoid is an AI-governance security platform. It governs the OpenAI Codex client by writing
`~/.codex/managed_config.toml` with:

```toml
model_provider = "devoid"
[model_providers.devoid]
base_url = "http://127.0.0.1:19280/proxy/openai/v1"
wire_api = "responses"
requires_openai_auth = true
```

So **100% of Codex traffic is meant to transit our local daemon proxy**, where policy is applied (secrets blocked
before egress, etc). There is no fallback path: a failure in that proxy is a total outage of the user's AI tool.
The codebase is Go: `internal/proxy` (the OpenAI proxy), `internal/daemon` (the daemon + hook handlers),
`internal/codexmanaged` (Codex requirements/attestation), `cmd/devoid` (CLI + hook runner).

There is a second, cooperative lane: DeVoid installs Codex hooks (SessionStart, UserPromptSubmit, PreToolUse,
PermissionRequest, SessionEnd) plus a machine baseline at `C:\ProgramData\OpenAI\Codex\requirements.toml`.

## Measured ground truth (all verified on a live production endpoint, do not re-derive, do not doubt)

**A. Codex is currently ungoverned.** `devoid ai status codex` reports:
```
R5-provider-route    missing (managed-file-absent)
R7-hook-cooperative  missing (hook-entry-absent)
R8-hook-lifecycle    missing (hook-entry-absent)
PreToolUse / PermissionRequest / SessionStart / SessionEnd :  NEVER FIRED
wire egress route:   last carried 2026-08-08T18:33:07Z
[!] NEITHER Codex layer is clean.
```
`~/.codex/managed_config.toml` does not exist. Live `codex exec` runs report `provider: openai` (not `devoid`) and
produce **zero** daemon proxy log lines.

**B. Our own daemon chose this state.** The daemon log contains:
```
"AI-agent auto-wire skipped (desktop app present + daemon proxy not healthy — R5 route would brick it)" agent=codex
```
So an availability guard declined to install the only lane that governs Codex — and on the evidence so far never
restored it, with no alarm and no console state.

**C. The proxy panics and fails closed.** While the route WAS wired, three times in 90 seconds:
```
WARN openai sse: recovered panic; holding request  recover="net/http: abort Handler"
```
The request is HELD after the panic, so the user's turn dies and Codex renders "task encountered a system error".
This happened on requests the policy had **allowed** — it is a crash, not a policy decision. Intermittent, not total.

**D. One blocked secret bricks a conversation permanently.** Codex resends the entire conversation every turn, so
once a blocked class is anywhere in the thread, every later message — including a plain "hello" — re-triggers the
block and fails identically. Observed at 21:19:08, 21:19:20, 21:19:32 on the same finding. The only escape is
starting a new conversation, and nothing in the product says so.

**E. The user cannot tell it was us.** On a block the user saw only OpenAI's own cybersecurity-refusal copy and
concluded the product was broken. Note: our daemon *does* emit a string beginning `"Blocked by Devoid: "` — so we
do attribute, yet it did not reach the user's screen. Explaining that gap is one of the tracks below.

**F. The hook lane is dead, and we believe we now know why — I want this INDEPENDENTLY VERIFIED OR REFUTED.**
Every Codex run prints `hook: SessionStart Failed` and `hook: UserPromptSubmit Failed`. Our long-held explanation
was a hook-trust dialect pinned to a `0.144.` format vs an older client — but we upgraded the CLI to `0.147.0` and
the hooks still fail identically, which falsifies it.

A separate audit then concluded the following. **Treat it as a hypothesis to attack, not as fact:**
> The machine baseline builds the hook command as the bare executable plus only the canonical event token, so
> `requirements.toml` tells Codex to run `devoid.exe SESSION_START <marker>` when the real entrypoint is
> `devoid.exe ai hook --adapter codex --event SESSION_START --provenance <marker>`. The binary does not recognise
> `SESSION_START` as a top-level command, prints `Unknown command:` and exits 1, so the hook handler is never
> entered. Codex enforces a deny only when a hook exits 0 with a recognised payload — a non-zero exit is checked
> before stdout is even inspected — so every hook fails open. Compounding it, `allow_managed_hooks_only=true`
> suppresses the user-scope fallback, so the correctly-formed cooperative scripts cannot compensate.

If that is right it means the Codex hook lane has been **completely dead on every machine and every version since
it shipped**, and our attestation never caught it because it validates only that the first executable resolves, not
the full argv. Verify it end to end, and tell me if it is wrong or incomplete.

**G. What DOES work (do not propose anything that regresses these):** while wired, the proxy blocked a synthetic
AWS key before egress. Our browser extension separately masks secrets before send and the model receives a
redaction token — that mask-and-send capability already exists and is a candidate to reuse.

**H. Reported but un-attested "foreign governance keys":** `features.js_repl`, `mcp_servers.node_repl` (an
arbitrary-code REPL), six project directories marked trusted with approval prompts suppressed, and
`sandbox_workspace_write.network_access` (sandbox egress re-enabled outside the managed lock).

## Run these as parallel investigation tracks

1. **BYPASS (highest priority).** Does the Codex **CLI** read `managed_config.toml` at all, or only the desktop app?
   If the CLI ignores it, the CLI was *never* governed and this is a standing bypass, not a regression. Then
   enumerate every path by which Codex reaches a model without transiting `127.0.0.1:19280`: a second provider
   entry, env vars (`OPENAI_BASE_URL`, `OPENAI_API_KEY`, `CODEX_*`), per-project config, profiles, ChatGPT-account
   auth vs API key, a websocket lane, or an MCP server that itself calls a model. Rank by exploitability.
2. **HOOKS — verify or refute (F).** Attack the hypothesis in (F) independently. Confirm the exact command string
   written into the machine baseline, confirm what the binary does with it, and confirm Codex's real contract for a
   managed hook (exit code, stdout shape, schema, timeout). Then answer what (F) does **not**: how do we repair the
   baselines already deployed in the field without requiring an elevated rewrite on every machine? What must
   attestation check so this class — a resolvable executable invoked with arguments that enter the wrong code path —
   becomes impossible to ship again? And is there any *other* reason a hook would report Failed that this
   explanation would mask?
3. **RELIABILITY.** Find what converts a `net/http: abort Handler` panic into a *held* request rather than a clean
   abort. Then go wider: enumerate every failure mode of an SSE proxy in front of the `responses` API — deadlines,
   write timeouts, flush/buffering, partial frames, client and upstream disconnect, slow consumers, streamed tool
   calls, reasoning blocks, `previous_response_id` continuation, large payloads, concurrency, and daemon
   restart/upgrade mid-turn. For each: does the turn survive, and what does the user see?
4. **REPLAY.** Is the current turn reliably distinguishable from replayed history in a `responses` API request,
   including under `previous_response_id`? If we mask the offending span in replayed history instead of blocking the
   whole request, does that corrupt model context, break continuation, invalidate caching, or change token
   accounting? Is masking safe — does the secret still never egress? And for a thread already poisoned, is there any
   recovery short of starting over?
5. **ATTRIBUTION.** What SSE event/error shape should a proxy emit so that the Codex desktop app, the VS Code
   extension, and the CLI each render it as *our* message rather than a generic error — without depending on one
   client version? Include every channel worth using: SSE body, HTTP headers, an injected assistant/system message,
   OS notification, in-thread marker.
6. **SELF-REPAIR.** `managed_config.toml` is user-writable and currently absent. What should own it? Design
   detection, bounded retry, and repair — explicitly **behind a health gate**, because force-wiring while the proxy
   is unhealthy is the exact brick the guard exists to prevent. And design how an ungoverned window becomes a
   visible, recorded fact rather than a log line.

## Rules

- **Cite file:line** for anything you verify in source. If you do not have the repo, say so plainly and label every
  such claim as reasoned-not-verified. Never present inference as measurement.
- Mark anything unproven as **UNPROVEN**. I would rather have five proven findings than twenty plausible ones.
- **Availability is a security property here**: a governance layer that breaks the user's tool gets uninstalled, and
  then governs nothing. But a silent fail-open is equally unacceptable — an ungoverned window must be recorded and
  surfaced.
- **No feature flags.** Fixes ship on. Do not propose off-by-default, shadow mode, or an env gate.
- Never fix a problem by making a truthful negative surface look positive. Our CLI honestly says "missing" and
  "NEVER FIRED" and that discipline is deliberate — preserve it.
- Do not recommend force-wiring the provider route while the proxy is unhealthy.

## Output format

1. **THE ANSWER** — first paragraph, no preamble: after fixing what you find, will Codex actually be enforced,
   governed and detected without crashing or becoming unusable? If something still fails, say so up front.
2. **GOVERNANCE BYPASSES** — ranked, most exploitable first. Anything here outranks everything else in the report.
3. **ROOT CAUSES** — one block per track, each with mechanism, evidence, and confidence (verified / reasoned /
   unproven).
4. **THE ARCHITECTURE** — the single coherent design, not six separate patches. State the invariant that makes our
   layer structurally unable to break their tool, phrased so an implementer can check code against it.
5. **WHAT YOU DISAGREE WITH** — anything in my ground truth above you think is wrong or incomplete. Say it directly.
6. **LOCAL PROOF** — how each fix is proven on a developer machine *before* deploy, and for each check, the **defeat
   step**: the action that must make the check fail. A check whose defeat step does not turn it red proves nothing.
7. **RESIDUAL RISK** — what could still take Codex down after all of this.

Be blunt and specific. Name files, functions and orderings. No hedging, and do not restate my inputs back to me.
