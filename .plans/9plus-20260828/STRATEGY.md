# DeVoid AI Runtime Enforcement — 9+/10 Technology Strategy

**Date:** 2026-08-28  
**Audience:** DeVoid product/security leadership and Codex with full repository access  
**Document type:** Technology and assurance strategy — **not** a code-ready implementation plan  
**Scope:** How DeVoid intercepts, governs, enforces, responds, survives failure, resists bypass, and proves effects for Claude Code and Codex  
**Explicitly out of scope:** Detection rules, malicious-class logic, confidence tuning, false-positive tuning, and the policy choice of what should block

---

## 1. Executive decision

DeVoid should **keep its present multi-layer architecture**. Hooks, a local provider gateway, managed configuration, launch controls, a local policy authority, and tamper-evident evidence are the right ingredients.

The product does **not** need a new idea. It needs a stronger execution model:

> DeVoid must become a **certified edge enforcement platform** in which every green prevention claim is bound to an exact runtime, binary, host surface, operating system, managed-policy source, provider route, effect capability, and recent live canary.

The central technical changes are:

1. **Move hard decisions off the synchronous hook-to-daemon round trip.** A prompt or pre-tool decision must be available locally even when the service, backend, telemetry, or user interface is busy.
2. **Make vendor machine-managed controls authoritative.** User-writable Claude and Codex configuration becomes compatibility and observability, not the basis of the prevention claim.
3. **Force provider egress at the operating-system layer.** Configuration should point traffic at DeVoid; Windows Filtering Platform or enterprise firewall policy should make bypassing that route technically impossible for the protected process.
4. **Run the machine component as a real, recoverable security service.** Separate it from per-user UI and configuration work, and replace the machine-readable shared token with authenticated per-session IPC.
5. **Prove effects, not intentions.** A decision, a vendor response, and the absence of the forbidden side effect are separate facts.
6. **Certify every exact client release and host.** Unknown or changed binaries automatically lose the prevention certificate; they never inherit green status from a previous version.

After those changes, all ten areas in the requested scorecard can honestly reach **9+/10 within a deliberately bounded certified scope**.

They cannot honestly reach 9+/10 as an unlimited claim covering every Claude/Codex version, every embedded host, cloud sessions, arbitrary custom providers, hostile local administrators, and future vendor features that DeVoid has never tested. A serious enterprise product wins by defining and proving its boundary, not by calling unknown coverage green.

---

## 2. What “9+/10” means

A 9+/10 score in this document means all of the following are true for the named supported profile:

- the exact runtime binary and host are known;
- organization-managed controls are active and cannot be weakened by a standard user;
- the action reaches a local decision under normal operation and defined stress conditions;
- a busy or dead control-plane process does not silently create an allow;
- direct provider egress is blocked independently of runtime configuration;
- the requested effect is supported by that exact runtime checkpoint;
- the effect is observed or continuously validated by an independent canary;
- configuration drift, runtime updates, or stale proof remove green status automatically;
- install, logon, reboot, upgrade, repair, sleep/resume, and service recovery create no silent ungoverned window;
- all claims are reproduced through the production signing, policy, evidence, and rollout chain.

### 2.1 Initial certified commercial boundary

The first 9+ profile should be intentionally narrow:

- enterprise-managed Windows endpoints on currently supported Windows 11 builds;
- developers running as standard users;
- DeVoid installed machine-wide and enrolled in attested/managed posture;
- exact DeVoid-certified Claude Code and Codex binaries;
- each host certified separately: CLI, IDE extension, and desktop host;
- machine- or MDM-delivered vendor settings and hooks;
- DeVoid’s provider gateway as the configured route;
- operating-system enforcement preventing the protected runtime from connecting directly to provider model endpoints;
- a recent successful semantic canary;
- production-signed policy and evidence.

The following should be separate profiles, not silently included:

- WSL2;
- native macOS and Linux;
- Claude or Codex cloud sessions;
- Agent SDK embeddings;
- custom providers;
- ChatGPT/Claude subscription authentication that DeVoid has not gateway-certified;
- prerelease vendor builds;
- hostile local administrators.

A local administrator can alter services, firewall policy, binaries, drivers, or managed configuration unless an organization adds stronger MDM and application-control controls. DeVoid can detect that and revoke assurance, but it should not call a standard Windows endpoint an anti-admin hardware security boundary.

---

## 3. Current-state baseline from the Source of Truth

This section is **source-derived** from `AI_SECURITY_SOURCE_OF_TRUTH.md`, revised 2026-08-28. It does not replace that document.

| Area | Current score | Main reason it is below 9 |
|---|---:|---|
| Overall technological architecture | 8.5 | Correct layers exist, but they do not yet compose into one unavoidable and continuously proven boundary. |
| Detection-brain plug-in readiness | 8.0 | Normalization and effects exist, but runtime contracts, capability truth, replay, and failure isolation need to be frozen. |
| Claude interception coverage | 7.5 | Broadly wired, but hook timeouts fail open, IDE/desktop differ from CLI, and routing is asserted rather than forced. |
| Codex interception coverage | 5.5 | Cooperative trust is version-sensitive, the machine and user lanes suppress one another, desktop differs, and some tool paths never use hooks. |
| Effect execution after a decision | 7.0 | Real effects exist, but post-effect controls are sometimes described too strongly and several receipts attest intent rather than outcome. |
| Reliability of reaching a decision | 3.0 | Ten identical private-key prompt tests produced four blocks and six leaks under ordinary machine load because the four-second daemon budget expired. |
| Resistance to bypass | 4.0 | PATH wrapping is bypassable; direct routes, embedded runtimes, absolute paths, an uppercase-extension defect, and local configuration remain material. |
| Operational durability | 4.5 | The MSI path lacks proper crash recovery, per-user wiring is delayed, the machine token is broadly readable, and the daemon is a scheduled task rather than a real service. |
| Proof that enforcement happened | 3.5 | Three of eight live-proof controls are observed, none against production; the continuous canary cannot currently become proven. |
| Enterprise prevention readiness | 4.0 | The platform is advanced pre-production technology, but the prevention boundary is not yet dependable under load, change, and failure. |

The most important current observations are:

- **6 of 10 identical private-key prompts egressed** during the reference load campaign because no decision was reached in time.
- **11 invocations were recorded as undecided** in that window.
- **3 of 8 live-proof controls are observed**, and none were observed against the production authority chain.
- the canary cannot currently go green because its production receipt sink is unwired, and its process wait logic can classify a real deny as a launch failure;
- the cooperative Codex lane is covered only for specifically measured client families in the Source of Truth and is suppressed by the machine baseline;
- a missing managed seal turns several fail-closed branches cooperative at once;
- a user-readable machine token is standing in for per-session identity;
- direct provider routing is configured but not independently prevented;
- a clean uninstall has been observed leaving the entire bin payload behind.

These are not detector-quality problems. They are runtime-enforcement and assurance problems.

---

## 4. What current vendor and Windows research changes

This section is **external research**, based on current official Anthropic, OpenAI, and Microsoft documentation as of 2026-08-28.

### 4.1 Anthropic now provides a stronger organization-managed foundation than DeVoid currently treats as primary

Anthropic’s managed settings apply above user, project, local, and command-line settings. Endpoint-managed sources cover terminal, IDE extensions, the desktop Code surface, and Agent SDK sessions. Anthropic exposes locks such as `allowManagedHooksOnly` and `allowManagedPermissionRulesOnly`, and a `policyHelper` can compute managed settings from a local program; a helper failure at startup prevents Claude Code from starting.

**Implication:** DeVoid should move Claude’s authoritative enforcement posture out of ordinary user settings and into an OS/MDM-managed source. The existing user settings writer remains useful for compatibility and older versions, but it should no longer create the green prevention claim.

### 4.2 Claude hooks are valuable semantic checkpoints, but the vendor explicitly makes timeout/non-start failures non-blocking

Anthropic documents that `PreToolUse` and `UserPromptSubmit` can block, including through exit code 2. It also documents that command/HTTP/MCP hook timeouts render no decision and execution continues; a hook that cannot start also lands in a non-blocking path. `PostToolUse` runs after the action and cannot undo it.

**Implication:** DeVoid must keep hooks for intent and context, but a hook cannot be the only enforcement boundary. The decision must be local and fast, and provider egress/sandbox controls must remain as independent backstops.

### 4.3 Claude’s gateway protocol is deliberately open-ended

Anthropic says new releases add body fields, beta headers, and feature pairings. Gateways should pass unknown fields through instead of reconstructing requests from a closed schema. Anthropic also warns that body rewriting or redaction can break header/body feature pairings.

**Implication:** DeVoid’s gateway must perform protocol-preserving patches rather than decode into a reduced structure and rebuild. If it cannot prove that a transformation is safe for the certified client/protocol version, it must hold or block rather than emit a malformed or semantically altered request.

### 4.4 OpenAI’s managed Codex hooks are the right primary lane

OpenAI documents that hooks delivered from managed/system/MDM/`requirements.toml` sources are trusted by policy and cannot be disabled from the user hook browser. `allow_managed_hooks_only = true` suppresses user, project, session, and plugin hooks while retaining managed hooks. Current documentation also supports managed permission profiles and administrator constraints across the desktop app, CLI, and IDE extension, while warning that supported requirements can differ by client and version.

**Implication:** DeVoid should retire the cooperative trust-hash lane from the prevention claim. It may remain as an unmanaged fallback or diagnostic path, but the machine-managed hook is the authoritative Codex integration.

### 4.5 Codex hooks are not a complete tool boundary

OpenAI states that hosted tools such as WebSearch do not use the local function-tool hook path and that specialized paths may opt out. OpenAI explicitly calls hooks a useful guardrail rather than a complete enforcement boundary.

**Implication:** A 9+ Codex profile must either disable uncovered hosted/specialized capabilities through managed requirements, govern them through another proven lane, or show them as uncovered. It cannot mark “Codex protected” merely because `PreToolUse` fired for shell commands.

### 4.6 Codex contracts move quickly

The current official hook documentation supports exit-code-2 blocking for `PreToolUse` and `UserPromptSubmit`, while DeVoid’s measured 0.147 behavior in the Source of Truth found a different result. The latest stable Codex release is 0.150.1, released 2026-08-27, and prerelease 0.151 builds are already appearing.

**Implication:** documentation is not enough and source inspection is not enough. Every exact binary/host pair requires live certification before it inherits prevention status.

### 4.7 Windows already provides the primitives DeVoid needs without beginning with a kernel driver

Microsoft documents:

- Service Control Manager recovery actions and service identities;
- service SIDs and least-privilege service accounts;
- named pipes with explicit security descriptors, per-logon SIDs, client process identity, and impersonation;
- Windows Filtering Platform Application Layer Enforcement, which can identify the initiating application and permit or block its network connection;
- App Control/AppID tags that can provide a stable application identity for firewall policy;
- TPM-backed CNG keys whose private material can remain non-exportable and outside ordinary process memory.

**Implication:** the first strong Windows design should use a real service, secure named-pipe IPC, user-mode WFP/ALE filters, and optional App Control tagging. A custom WFP callout driver should be a later choice only if simple application-scoped permit/block filters prove insufficient.

---

## 5. Target architecture

```text
                         DEVOID BACKEND CONTROL PLANE
          signed policy | rollout | runtime certificates | evidence chain
                                     |
                                     v
+--------------------------------------------------------------------------------+
|                    DEVOID MACHINE ENFORCEMENT SUPERVISOR                       |
|               Real Windows service, protected service identity                 |
|                                                                                |
|  Signed policy cache   Capability registry   Provider gateway   WFP manager     |
|  Session/permit state  Canary coordinator    Evidence spool     Update/repair   |
+-----------------------------+--------------------------+-------------------------+
                              | secure per-session IPC   |
                              v                          | forced outbound path
+-----------------------------------------------+        |
|        PER-SESSION USER BROKER / UX            |        |
| identity, consent UI, user config, notifications|       |
+-------------------+---------------------------+        |
                    |                                    |
                    v                                    v
+--------------------------------------------------------------------+
|  RUNTIME EDGE ADAPTERS                                              |
|                                                                     |
|  Launch guard  |  Claude managed hook  |  Codex managed hook        |
|  Config attestor | Provider protocol adapter | Browser/native host    |
|                                                                     |
|             Runtime-neutral Inline Decision Core                    |
|        normalized action -> findings -> policy -> desired effect    |
+-----------------------------+--------------------------------------+
                              |
                     exact vendor effect
                              v
                  CLAUDE CODE / CODEX RUNTIME
                              |
                  direct provider path = denied
                              |
                              v
                    DEVOID PROVIDER GATEWAY
                              |
                   protocol-safe forward only
                              v
                    ANTHROPIC / OPENAI
```

### 5.1 The three-plane rule

The product should be split conceptually into three planes:

1. **Enforcement data plane:** inline decisions, hook responses, provider gateway, WFP policy, and immediate effect execution. This plane must not wait on the backend, evidence upload, inventory sweeps, notifications, or UI telemetry.
2. **Control plane:** policy fetch, rollout, configuration, runtime inventory, certificates, updates, and administrative state.
3. **Evidence plane:** local append-only spool, receipt signing, backend acknowledgement, investigation views, and alerts.

A failure in the control or evidence plane may reduce freshness or visibility. It must not starve the enforcement data plane or silently convert a hard managed decision into allow.

### 5.2 The local decision rule

For every blocking checkpoint, one of these must be true:

- the complete decision is computed in the short-lived hook/gateway process from a verified immutable local snapshot; or
- the process asks a dedicated high-priority local decision service and has a deterministic safe terminal when that service is unavailable.

There must be **no backend network dependency** in the immediate decision path.

Stateful context, user confirmation, cloud reputation, and secondary model opinions can enrich or tighten the answer. They cannot be required merely to avoid an unrecorded proceed.

### 5.3 The proof rule

Every event records six separate facts:

1. what DeVoid observed;
2. what the detection engine concluded;
3. what policy requested;
4. what that exact checkpoint was capable of doing;
5. what effect command DeVoid emitted;
6. what independent evidence exists that the effect occurred.

Only fact 6 supports the word **proven**.

---

## 6. Assurance tiers and product language

| Tier | Meaning | Allowed product label |
|---|---|---|
| **T0 — Discovered** | Runtime/configuration found. | Discovered |
| **T1 — Configured** | Hooks/routes/settings appear installed. | Configured |
| **T2 — Managed** | Authoritative machine/MDM source verified. | Managed |
| **T3 — Observed** | Hook and/or provider route carried a real event. | Observed |
| **T4 — Enforced** | A decision reached an effect-capable checkpoint and the vendor accepted/acted on it. | Enforced |
| **T5 — Proven** | Independent side-effect/egress witness and fresh semantic canary exist for the exact certified runtime. | Prevention Active |

No screen should collapse T1 or T2 into T5. No unsupported client version should inherit T5. No aggregate “5 of 5 hooks fired” should remain green while undecided invocations exist.

---

## 7. Strategic workstreams

Each workstream below states the technology direction, why it is the best fit, what DeVoid should avoid, and the assurance gate that earns a 9+ score. Codex should later map these outcomes onto the actual codebase.

---

### Workstream 1 — Freeze the runtime-neutral “brain socket”

#### Objective

Make the future detection brain independently replaceable, testable, and replayable without tying it to Claude JSON, Codex TOML, hook exit codes, gateway protocols, or Windows UI behavior.

#### Recommended technology direction

Define one versioned internal contract around these objects:

```text
RuntimeObservation
    -> NormalizedAction
    -> FindingSet
    -> PolicyDecision
    -> DesiredEffect
    -> CapabilityResolution
    -> EffectCommand
    -> EffectReceipt
```

The contract should carry, at minimum:

- runtime identity, exact binary digest/version, host surface, OS, and user/session identity;
- checkpoint and timing: launch, prompt, pre-tool, post-tool, provider request, configuration change;
- content segments and provenance available at that checkpoint;
- stable conversation, turn, tool-use, and request correlation identifiers;
- route posture and managed-source posture;
- interactive/headless status;
- detector version and policy digest;
- requested disposition and actual supported effect;
- reason for any downgrade or fallback.

The detector side should return **findings and safe transformation proposals**, not vendor response bodies. The enforcement side should own Claude/Codex-specific output.

Use a canonical, privacy-safe replay envelope so the same normalized event can be run through:

- offline unit tests;
- corpus evaluation;
- shadow mode;
- a historical policy simulator;
- a new detector version before rollout;
- a different runtime adapter without changing the brain.

Keep executable detector code part of the signed DeVoid release initially. Update rule/data packs through signed bundles where practical, but do not introduce an arbitrary local plug-in loader into the security hot path. Dynamic executable plug-ins would add code-loading, compatibility, and tamper risks before they add customer value.

#### Why this is the best design

- It lets the detection team begin while enforcement is hardened.
- It prevents Claude and Codex protocol changes from forcing detector rewrites.
- It makes false-positive and false-negative evaluation reproducible.
- It lets DeVoid distinguish a bad detector from a failed enforcement path.
- It keeps the trusted computing base smaller than an open-ended local plug-in platform.

#### Avoid

- detectors directly returning Claude `permissionDecision` objects;
- detectors directly choosing Codex exit codes;
- one shared “verdict” field that hides requested versus achievable effects;
- unversioned JSON whose meaning changes in place;
- evidence objects that can contain raw prompt/tool text by accident;
- loading third-party executable detectors into a SYSTEM service.

#### 9+ exit gate

- One normalized event replays identically across the hook runner, provider gateway, offline harness, and policy simulator.
- The same detector binary produces the same finding set for identical canonical input.
- No detector package imports or knows a vendor response type.
- Unknown contract versions fail explicitly and remove prevention status.
- A policy/effect downgrade is visible and testable, never silently rewritten into “allow.”

**Target contribution:** Detection-brain plug-in readiness → **9.6/10**.

---

### Workstream 2 — Build an inline local decision core

#### Objective

Eliminate the current failure mode in which a busy or unreachable daemon means the runtime never receives a decision.

#### Recommended technology direction

Extract the smallest security-critical decision path into a reusable local core that can execute in the hook runner and provider gateway from an immutable signed snapshot.

The snapshot should contain only what is necessary for an immediate decision:

- validated effective policy;
- detector/rule versions and enabled features;
- failure-terminal table;
- runtime capability certificate;
- current route and trust requirements;
- bounded local state needed for immediate policy evaluation.

The machine service should create a new immutable generation, verify it, and atomically switch the active pointer. Readers should always see either the old complete generation or the new complete generation—never a half-written policy.

The immediate path should be:

```text
read bounded input
    -> validate runtime dialect
    -> normalize
    -> load verified local snapshot
    -> run local detectors/policy
    -> map to certified effect
    -> emit effect
    -> enqueue evidence asynchronously
```

The backend, alerting, evidence acknowledgement, inventory, update service, and administrative UI must be absent from this dependency chain.

For genuinely stateful operations—session taint, single-use approvals, or cross-turn correlation—use a dedicated high-priority local state channel. Its unavailability must resolve through a named, impact-aware failure terminal. A managed hard-security action must not silently proceed because state could not be fetched.

Resource-isolate the decision path:

- separate decision queues from telemetry, inventory, and update work;
- bound every queue and input;
- reserve workers for decisions;
- prevent unbounded goroutine/thread creation;
- cap parsing and normalization work;
- precompile and prevalidate the active snapshot;
- ensure evidence backpressure cannot block the vendor response.

The current four-second budget should cease to be the protection. A larger timeout only makes the user wait longer before the same fail-open. The goal is a fast local answer and a deterministic safe failure, not a longer hope.

#### Two-tier opinion model

The platform should support future heavy detection without weakening immediate enforcement:

- **Tier A — inline authoritative:** deterministic local checks that can participate in an immediate effect.
- **Tier B — local/stateful enrichment:** bounded local service opinion; if unavailable, the frozen failure terminal applies.
- **Tier C — cloud/model opinion:** asynchronous or hold-only. It may upgrade a result or inform investigation, but it cannot be the only reason a dangerous action avoids an ungoverned proceed.

This is an enforcement architecture choice, not a choice about which detections belong in each tier.

#### Why this is the best design

It removes the exact dependency measured failing in the Source of Truth without discarding the daemon’s useful roles. It also makes load behavior testable and allows the same logic to protect hooks and the wire.

#### Avoid

- merely raising the four-second timeout;
- synchronous backend calls in the hard path;
- a single global “daemon unavailable → allow” behavior;
- letting the telemetry spool or database lock share the decision worker pool;
- running user confirmation inside the same deadline as local classification;
- calling a reached verdict “reliable” when a process can still fail before emitting it.

#### 9+ exit gate

For every certified blocking checkpoint:

- 10,000 consecutive synthetic hard-deny operations under the certified stress matrix produce **zero silent allows**;
- platform-only decision latency is proposed to target p95 ≤ 50 ms and p99 ≤ 150 ms after warm-up;
- loss of backend connectivity has no effect on immediate local decisions;
- evidence/alert outages have no effect on immediate local decisions;
- killing the control-plane service either leaves the inline snapshot usable or enters an explicit safe containment state;
- every undecided action is a visible failure state, never counted as an ordinary allow.

The exact latency thresholds may be adjusted after Codex measures the present code, but the zero-silent-allow requirement is not negotiable.

**Target contribution:** Reliability of reaching the decision engine → **9.7/10**.

---

### Workstream 3 — Replace the scheduled-task daemon with a real enforcement supervisor

#### Objective

Give DeVoid a durable, least-privileged, externally recoverable machine authority that starts before governed runtimes and survives process failure.

#### Recommended technology direction

Use a real Windows service managed by Service Control Manager.

The machine supervisor should:

- start automatically at boot;
- have configured restart-on-failure actions on the actual MSI path;
- run under a dedicated virtual service identity or similarly isolated service account;
- have a service SID used on DeVoid files, pipes, keys, and state;
- declare and receive only the privileges it requires;
- keep its service DACL from granting standard users stop/change/delete rights;
- own machine policy, WFP filters, provider gateway, signed snapshot generation, canaries, evidence spool, and repair;
- expose detailed authenticated health separately from a minimal liveness endpoint.

Do not make a Session 0 service responsible for interactive dialogs or arbitrary writes into user profiles. Split those responsibilities into a **per-session user broker** launched immediately when the user signs in.

The broker should:

- run as the interactive user;
- perform user-scoped vendor configuration and UI;
- identify the active logon/session;
- relay consent and notifications;
- never become the authority that can weaken machine policy;
- signal readiness before a managed runtime is permitted to start.

The current one-minute delayed reconciliation should be replaced by one of two honest states:

1. the user broker is ready and the runtime launches governed; or
2. the required broker is not ready and the managed launch is refused/held with a clear reason.

There should be no third state in which the installer has reported success and a new session silently runs without its required wiring.

#### Secure IPC

Use an ACL-protected named pipe or equivalent Windows local RPC mechanism for decision/state/control messages.

The pipe should have:

- an explicit DACL—never the default descriptor, which Microsoft documents as granting read access broadly;
- the service SID and the specific logon SID as allowed principals;
- no anonymous or cross-session access;
- bounded messages and schema versions;
- client process ID and session ID verification;
- optional client impersonation for operations that genuinely require the user’s security context;
- executable path/signature validation for privileged calls;
- nonces or per-connection challenge material where replay matters.

The provider gateway can remain on loopback HTTP because it speaks a vendor protocol. It must use a separate per-session authentication design and must not reuse a machine token readable by every local user.

#### Why this is the best design

Service Control Manager is the native Windows durability and policy mechanism. A real service gives external recovery when the process is dead, while a daemon that repairs its own scheduled task can only repair itself while it is already alive.

The service/broker split also solves the current confusion between machine authority, user configuration, and desktop UI.

#### Avoid

- another scheduled task with more retries;
- an in-process watchdog as the only recovery mechanism;
- LocalSystem for every component merely because it is convenient;
- one machine-wide bearer token accessible to all users;
- default named-pipe security descriptors;
- a service that directly displays UI in Session 0;
- reporting installer success before the enforcement supervisor and required user broker are proven ready.

#### 9+ exit gate

- The service is running before a certified runtime can start.
- Process termination triggers external recovery without user action.
- Deleting or corrupting persistence revokes green and is repaired by a component that does not depend on the dead process.
- Immediate post-logon launch is governed or refused—never silently ungoverned.
- Cross-user and cross-session IPC attempts are denied.
- Standard users cannot stop, reconfigure, replace, or write the service binary/configuration.
- Reboot, sleep/resume, fast user switching, upgrade, and network changes preserve the correct posture.

**Target contribution:** Operational durability → **9.5/10**.

---

### Workstream 4 — Make provider routing unavoidable

#### Objective

Turn the local provider gateway from “the route we configured” into “the only route the protected runtime can use.”

#### Recommended technology direction

Use four layers together:

1. **Managed runtime routing** points the client at DeVoid.
2. **A local provider gateway** scans and enforces the known protocol.
3. **A credential boundary** prevents the runtime from holding a reusable upstream secret where possible.
4. **Operating-system egress enforcement** denies direct provider connections from the protected runtime and its relevant embedded processes.

##### A. Managed routing

For Claude, route each certified surface using the vendor-supported method for that surface. The CLI/IDE and the desktop app do not necessarily consume identical gateway configuration, so “Claude” must not be treated as one route.

For Codex, use managed/system configuration for the built-in OpenAI base URL or certified provider definition, and constrain provider/model choices through requirements where available.

##### B. Provider gateway

The gateway should be a protocol-aware enforcement point, not a generic corporate TLS MITM.

It should:

- terminate only traffic intentionally configured to use it;
- recognize all prompt-bearing endpoints in the certified client version;
- support the certified transports, encodings, streaming modes, retry behavior, and request limits;
- preserve unknown fields and headers;
- modify only exact content nodes when a transformation is certified;
- re-scan transformed content before forward;
- hold/block when safe transformation is uncertain;
- record whether any upstream byte was written;
- correlate request/turn/session with hook observations;
- maintain retry/reconnect deny state where the client can resubmit the same turn.

A safe redaction implementation should be a **lossless protocol-preserving patch**: retain the original object and all unknown fields, replace only known text spans, and preserve header/body feature pairings. Reconstructing the request from a reduced struct is too fragile for a protocol that evolves every release.

##### C. Credential boundary

The strongest profile should issue a short-lived, per-user/per-session gateway credential and keep the real upstream provider credential in the DeVoid gateway or an enterprise upstream gateway.

- Claude can use its supported credential helper mechanism to obtain a rotating local gateway credential.
- For runtimes without a suitable helper, inject a token only into the protected process/session or use a user-protected credential store; do not write one machine-wide secret readable by every user.
- Bind local credentials to user/session, short TTL, route, and where practical the initiating runtime identity.
- Make revocation immediate on unenrolment, user sign-out, or lost managed posture.

Where subscription/OAuth passthrough makes credential brokering impractical, DeVoid can still force the route. That profile should state that credentials remain client-held rather than falsely claiming gateway isolation.

##### D. Windows Filtering Platform

Install application-scoped outbound controls at WFP Application Layer Enforcement:

- explicitly permit the protected runtime’s required loopback connection to the DeVoid gateway;
- deny direct external model-provider traffic or, in the strongest profile, deny all external traffic from the model client except an approved ancillary allowlist;
- cover IPv4 and IPv6, TCP and UDP/QUIC where relevant;
- identify all actual runtime binaries, embedded helpers, and relevant child processes;
- account for system proxies, custom DNS, direct IP use, and alternate provider endpoints;
- re-authorize or refresh filters when runtime identity changes.

Use user-mode WFP filter management first. Simple ALE permit/block policy does not justify beginning with a custom kernel callout driver. A driver becomes appropriate only if DeVoid later proves it requires transparent redirection or inspection that built-in filters cannot provide.

For enterprise fleets, optionally combine WFP with App Control/AppID tagging and MDM-delivered firewall policy. AppID tags can provide a stable identity across vendor update paths, while MDM can prevent local rule merge from weakening the organization policy.

#### Ancillary traffic

Model traffic, login, updates, telemetry, WebFetch, hosted tools, and provider discovery are not the same thing. The certified profile should inventory each and choose one of:

- route through DeVoid;
- allow directly for a documented reason;
- disable through managed settings;
- declare unsupported.

For Claude gateway deployments, disable nonessential direct traffic when the customer’s egress model requires it and arrange controlled updates separately. For Codex, hosted tools and apps require their own managed controls because the local command network proxy and local hooks do not cover all of them.

#### Why this is the best design

- Managed configuration gives the client a supported route.
- WFP makes that route unavoidable for a standard user.
- Credential brokering reduces the value of copying configuration or launching another client.
- The proxy sees exact bytes before egress without intercepting unrelated endpoint TLS.

#### Avoid

- relying only on `ANTHROPIC_BASE_URL` or `openai_base_url`;
- broad enterprise TLS interception as the primary product design;
- IP-only provider blocklists that break when cloud ranges change;
- a custom kernel driver before proving it is necessary;
- block-all firewall policy without certifying required ancillary flows;
- claiming custom provider coverage merely because the proxy accepted one request;
- forwarding a modified request when protocol conformance is uncertain.

#### 9+ exit gate

- Zero direct model-provider connections in the certified bypass matrix.
- Attempts using a changed base URL, environment variable, project configuration, absolute-path binary, renamed/copy binary, alternate provider, IPv6, QUIC, or system proxy either remain routed through DeVoid or fail visibly.
- The gateway observes every model request from the certified surface.
- An unrecognized prompt-bearing endpoint or transport removes the certificate rather than forwarding silently.
- Gateway redaction passes a protocol conformance suite for the exact client version; otherwise the effect is block/hold.
- Credentials are per-user/per-session or the lower credential-isolation assurance is clearly shown.

**Target contribution:** Bypass resistance → **9.2/10** for the standard-user threat model.

---

### Workstream 5 — Make machine-managed vendor controls authoritative

#### Objective

Ensure a user-writable file, PATH order, cooperative trust record, or launch method cannot decide whether DeVoid is present.

#### Recommended technology direction

Adopt this authority order:

```text
OS/MDM-managed vendor policy
        +
DeVoid OS egress enforcement
        +
DeVoid certified local effect path
        = authoritative prevention

User configuration + PATH shim = compatibility, UX, and extra telemetry
```

For each runtime/surface, DeVoid should know:

- which managed source is authoritative;
- which exact file/registry/MDM channel the client selected;
- whether user/project/host settings can still widen behavior;
- whether the managed hook binary and all of its dependencies are in an administrator-controlled directory;
- whether the runtime loaded the managed settings;
- whether any entry was rejected;
- whether the runtime version supports every required key;
- whether the client is already running with stale startup-only values.

The PATH shim remains useful for:

- friendly launch refusal;
- immediate policy/health messaging;
- version inventory;
- extra correlation identity;
- stripping known flags in supported versions;
- package/plugin launch governance.

It should no longer be treated as the security boundary. Absolute-path, embedded, IDE, and desktop launches must still encounter machine policy and egress control.

The current managed/cooperative seal should be replaced as a broad single boolean with a **capability posture**. Examples:

- managed policy source active;
- machine hook active;
- provider egress forced;
- service identity valid;
- certificate fresh;
- canary fresh;
- user broker ready.

Each enforcement behavior should depend on the capability it actually needs rather than on one seal whose absence flips five behaviors at once.

#### Why this is the best design

Vendor-managed sources are designed for organization policy and cross-surface coverage. DeVoid should use them rather than maintain a parallel user-scope control that is weaker and more version-sensitive.

#### Avoid

- a single managed/cooperative boolean as the complete trust model;
- counting a written configuration file as proof the client loaded it;
- continuing to pin Codex cooperative hook trust as the main prevention lane;
- treating PATH-first as continuously guaranteed;
- trusting a client version because its semantic version looks close to a measured one;
- allowing a machine baseline to suppress the user hook before the machine hook is live-proven.

#### 9+ exit gate

- The client reports the expected managed source on every certified host.
- The managed hook is observed and can deny on the actual machine root—not a redirected test root.
- Removing user settings or launching by absolute path does not change the prevention result.
- A missing/invalid managed source removes green and, for managed enforcement mode, refuses or contains the runtime.
- Every behavior is tied to an explicit capability state rather than one opaque seal.

**Target contribution:** Overall architecture and both runtime coverage scores.

---

### Workstream 6 — Build a capability-aware effect executor

#### Objective

Make DeVoid’s response layer as rigorous as its future detection layer: it must know exactly what each checkpoint can do and never overstate a post-effect action as prevention.

#### Recommended technology direction

Create a runtime capability registry keyed by:

- runtime family;
- exact version and binary digest;
- host: CLI, IDE, desktop, SDK;
- OS and architecture;
- checkpoint;
- hook/transport dialect;
- managed source;
- effect type.

Use a small effect vocabulary:

| Effect class | Meaning |
|---|---|
| `PREVENT_BEFORE_ACTION` | The action or prompt is stopped before execution/processing. |
| `REWRITE_BEFORE_ACTION` | Input is safely changed before execution or egress. |
| `REQUIRE_TRUSTED_CONFIRMATION` | A trusted human approval is required before action. |
| `RESTRICT_CAPABILITY` | Sandbox, network, file, provider, tool, or runtime capability is narrowed. |
| `BLOCK_BEFORE_EGRESS` | Provider bytes are not forwarded. |
| `REDACT_THEN_EGRESS` | A certified transformed body is re-scanned and forwarded. |
| `REPLACE_MODEL_CONTEXT_AFTER_ACTION` | The side effect already happened; only model-visible output is replaced. |
| `OBSERVE_ONLY` | No enforcement effect exists at that checkpoint. |

Policy requests a desired effect. The capability registry returns:

- supported as requested;
- supported through a stricter alternative;
- supported only as a weaker effect;
- unsupported.

A weaker mapping must be visible. For example:

- Claude `PostToolUse` replacement is not “tool blocked.”
- Codex `PostToolUse` feedback is not “command prevented.”
- a wire redaction that cannot preserve protocol becomes a pre-egress block, not a best-effort malformed forward;
- a headless warn with no trusted confirmation surface must resolve through a declared policy terminal, not a hidden allow.

Human confirmation should be separated from the detector deadline:

- where the vendor provides a native pre-action ask primitive, use it;
- where no safe ask exists, issue a block/hold and allow a human to create a digest-bound, single-use permit for a retry;
- never place an executable bypass instruction in text the agent itself can follow;
- never let the controlled agent authorize its own permit.

#### Why this is the best design

It gives the product one honest language across different vendors and prevents a policy UI from promising an effect a runtime cannot perform.

#### Avoid

- one generic `block` value for pre-action and post-action checkpoints;
- a receipt that marks a no-op callback “satisfied”;
- hidden warn-to-allow behavior in headless sessions;
- letting user presence be inferred only from a header the runtime may omit;
- exposing an allow-once command that the controlled agent can execute;
- applying a transformation not certified for the current wire protocol.

#### 9+ exit gate

- Every desired effect resolves through the capability registry.
- Unknown runtime/checkpoint combinations cannot report a successful effect.
- Every post-effect action is labeled as post-effect.
- Every interactive approval is bound to user, action digest, runtime, session, expiry, and reason.
- The agent cannot mint or consume its own human permit.
- Clean allow controls remain functional, so strict failure behavior does not brick ordinary use.

**Target contribution:** Ability to enforce once a decision is reached → **9.5/10**.

---

### Workstream 7 — Separate decision evidence from effect proof

#### Objective

Make DeVoid able to answer, with precision, not just “what did we decide?” but “what did the runtime actually do?”

#### Recommended technology direction

Create two related but distinct records:

1. **Decision Receipt** — what was observed, which detector/policy version evaluated it, and what effect was requested.
2. **Effect Receipt** — which concrete mechanism was invoked, whether it was accepted/observed, and what independent witness exists.

A complete receipt chain should include:

```text
observation id
  -> normalized action digest
  -> finding-set digest
  -> policy/revision digest
  -> desired effect
  -> runtime capability certificate id
  -> emitted vendor/proxy/OS effect
  -> effect assurance level
  -> witness
  -> local sequence
  -> signed backend acknowledgement
```

Use explicit assurance levels:

| Level | Evidence |
|---|---|
| **E0 — Intended** | Policy requested an effect. |
| **E1 — Emitted** | DeVoid emitted the vendor response, proxy refusal, sandbox restriction, or OS rule. |
| **E2 — Observed** | The runtime/proxy/OS reported or behaved consistently with that effect. |
| **E3 — Independently witnessed** | A separate witness proved the side effect or provider egress did not happen. |

Examples of E3 witnesses:

- a pre-tool synthetic marker file was not created while the allow control created it;
- a controlled upstream received no blocked request;
- the provider gateway’s egress state proves no upstream write began;
- WFP recorded a denied direct connection attempt;
- the original body hash never egressed and the transformed body hash did;
- a launch-denied runtime process never appeared in process telemetry.

For ordinary customer events, E3 may not be possible for every arbitrary side effect. The product must therefore say whether an individual event is E1, E2, or E3. A recent E3 semantic canary can certify that the exact mechanism is currently working, but it does not magically turn every unrelated event into independently witnessed proof.

Use the existing append-only local spool and backend hash chain, but remove all false-satisfaction paths. A capability callback that returns success without doing anything may record **planned**, never **satisfied**.

Where available, sign endpoint evidence with a non-exportable TPM-backed CNG key. Report whether the key is hardware-backed, software-protected, or unavailable. Do not claim that TPM storage alone defeats a hostile local administrator; the value is non-exportability and stronger device binding, not magical endpoint invulnerability.

#### Why this is the best design

It preserves the current strong evidence architecture while fixing its largest semantic weakness: confusing a decision or no-op obligation with an effect.

#### Avoid

- one Boolean `enforced=true`;
- treating hook stdout as proof the vendor honored it;
- treating a proxy block response as proof when an upstream write had already started;
- putting raw prompt/tool content into receipts;
- deleting evidence after an unverified acknowledgement;
- reporting hardware attestation without measuring the actual key provider.

#### 9+ exit gate

- Every block/hold/redact record includes an Effect Receipt with an assurance level.
- No E0/E1 event is displayed as “proven.”
- All canary effects reach E3.
- Evidence remains locally durable through backend outage, reboot, and service restart.
- Backend acknowledgements remain signed and fail closed before local deletion.
- Production evidence can be traced from endpoint sequence through console rendering and gap verification.

**Target contribution:** Proof that enforcement happened → **9.6/10**.

---

### Workstream 8 — Build continuous multi-layer semantic canaries

#### Objective

Continuously answer: “Is prevention alive on this exact endpoint, runtime, host, version, route, and policy right now?”

#### Recommended technology direction

Use a reserved synthetic control that is independent of the customer’s detector settings. The synthetic action must be harmless, unique, and impossible to confuse with real customer content.

Build separate canaries for separate claims:

1. **Managed-source canary** — confirms the runtime selected the expected system/MDM source and did not drop required entries.
2. **Hook dispatch canary** — confirms the managed hook actually ran.
3. **Pre-action effect canary** — attempts a harmless side effect and verifies that deny prevented it; runs an allow twin on the identical rig.
4. **Provider-route canary** — verifies the model request reaches the DeVoid gateway.
5. **Direct-egress bypass canary** — attempts a direct provider connection from the protected runtime identity and expects an OS-level denial.
6. **Gateway deny canary** — verifies a synthetic blocked body never reaches a controlled upstream.
7. **Evidence canary** — verifies the effect receipt reaches the production backend chain and is visible through the customer investigation path.
8. **Recovery canary** — re-runs the above after service restart, runtime update, policy change, logon, and resume.

Use two execution environments:

- **Frequent endpoint canary:** real installed runtime and DeVoid stack, with a controlled local/staging upstream where appropriate. This can run often without provider cost.
- **Release/production canary:** real vendor service route, production signing/policy/evidence chain, and a harmless action designed to be blocked before billable/provider processing wherever possible.

The current canary must be fixed in two conceptual ways:

- give it a real production receipt sink;
- wait for process/pipe completion correctly instead of using a fixed five-second delay that can misclassify a real deny.

Canary freshness should be event-driven and time-bounded:

- immediately after install, upgrade, runtime binary change, policy change, managed-source change, service restart, WFP change, user sign-in, or route change;
- periodically while the runtime remains installed;
- expired quickly enough that a stale green cannot survive a meaningful change. A proposed initial target is 15 minutes for the full prevention certificate, with faster local health checks underneath it.

#### Failure behavior

A canary failure should revoke only the claims it tested, then compose the endpoint posture:

- hook failure but wire/WFP healthy: prompt/tool semantic coverage is degraded, provider egress may remain protected;
- route failure but WFP healthy: model traffic is contained rather than forwarded;
- WFP failure: prevention certificate revoked immediately; managed runtime launch may be refused;
- evidence failure: enforcement may continue, but proof/convergence is degraded and alerting escalates.

This avoids both false green and unnecessary all-or-nothing bricking.

#### Avoid

- one canary that tests configuration but not effect;
- using the real detector corpus as the canary trigger;
- a canary with no allow control;
- green status that survives a runtime binary update;
- treating receipt delivery as optional when the label is “proven”;
- running only on a quiet developer machine.

#### 9+ exit gate

- Every certified surface has a fresh canary bound to exact binary digest, host, OS, policy digest, managed-source digest, gateway mode, and WFP policy generation.
- The canary reaches E3 effect proof.
- A stale, failed, unknown, or undelivered canary automatically removes “Prevention Active.”
- Stress, reboot, update, service restart, and logon canaries pass.
- The canary’s negative control proves the test rig itself can observe the side effect.

---

### Workstream 9 — Create an automated runtime certification factory

#### Objective

Turn vendor updates and host differences from surprises into controlled release inputs.

#### Recommended technology direction

Build a clean-room certification pipeline that watches official Claude and Codex release channels, obtains the exact signed binary/package, records its digest and signer, installs it into clean test images, and issues a signed DeVoid capability certificate only after the matrix passes.

The certificate should be keyed by:

- runtime and exact version;
- binary/package digest and publisher signature;
- host: CLI, VS Code, JetBrains, desktop, SDK, WSL;
- OS build and architecture;
- managed configuration source and schema;
- hook dialect and event coverage;
- provider protocol/transport/encoding;
- authentication mode;
- supported effects;
- covered and uncovered tools/features;
- test suite version;
- test timestamp and expiry/revocation state.

#### Required certification matrix

**Managed configuration**

- correct system/MDM source selected;
- required settings accepted;
- invalid or unsupported settings surfaced;
- user/project/CLI overrides cannot weaken managed requirements;
- running-session versus startup-only changes understood.

**Hook behavior**

- prompt allow and block;
- pre-tool allow and block;
- post-tool feedback/replacement with correct post-effect language;
- hook timeout;
- hook process missing;
- crash/non-zero exit;
- malformed JSON;
- oversized/truncated input;
- concurrent matching hooks;
- background/async hooks;
- host-specific hook dispatch.

**Tool coverage**

- shell/PowerShell;
- file reads/writes;
- unified/long-running exec and follow-up input;
- MCP;
- plugins/skills where relevant;
- subagents;
- hosted tools such as web search;
- computer/browser use;
- specialized paths the vendor documents as bypassing default hooks.

Any capability that does not traverse the certified control must be disabled in the prevention profile or listed as uncovered.

**Provider wire**

- all prompt-bearing endpoints;
- HTTP/SSE/WebSocket behavior;
- compression/content encoding;
- retries, reconnects, cancel, and fallback;
- unknown body/header fields preserved;
- certified redaction transformations;
- direct-route denial;
- auth modes and credential refresh.

**Failure and load**

- high CPU, memory pressure, disk pressure, Docker/container builds;
- backend outage and latency;
- service restart and crash;
- gateway restart;
- user sign-in/out and fast switching;
- sleep/resume and network change;
- install/upgrade/rollback/repair/uninstall.

#### Release policy

- Disable uncontrolled prerelease adoption on managed endpoints.
- Prefer a DeVoid-certified release ring over vendor auto-update where the vendor allows it.
- An exact unknown binary gets `UNVERIFIED`, never the last version’s green state.
- Customer policy may choose: block unknown version, allow in degraded/wire-only mode, or allow monitored. Only the first two can belong to a 9+ prevention profile.
- Preserve historical certificates and evidence so an incident can reconstruct what was believed at the time.

The current release cadence makes this mandatory: Codex stable 0.150.1 arrived on 2026-08-27 and 0.151 prereleases followed immediately, while the Source of Truth’s cooperative certification covers older families.

#### Avoid

- semantic-version prefix widening without live artifacts;
- assuming docs and a binary match;
- testing only the globally installed CLI while the desktop embeds another runtime;
- a redirected fake machine root when the client uses the Windows known-folder API;
- calling unit tests live proof;
- letting a new vendor release reach production before the gateway/hook matrix runs.

#### 9+ exit gate

- 100% of prevention-enabled runtime binaries have a non-expired signed certificate.
- Unknown digests cannot display green.
- CLI, IDE, desktop, and WSL are separate certificate rows.
- Every certificate includes allow and deny controls and independent effect witnesses.
- A revoked or superseded certificate reaches endpoints before the version is permitted in the managed rollout ring.

---

### Workstream 10 — Engineer install, update, repair, rollback, and uninstall as security transitions

#### Objective

Remove silent windows and residue across the full lifecycle, not just steady state.

#### Recommended technology direction

Treat every lifecycle operation as a state machine with an assurance result.

##### Installation

- stage binaries in an administrator-controlled immutable version directory;
- verify publisher signature and expected digest before activation;
- install the real service, WFP policy, managed vendor settings, hook launcher, user broker registration, and provider route;
- run the full local canary before reporting “protected”;
- report `INSTALLED_NOT_READY` rather than success when an external dependency remains;
- block managed runtime launch until mandatory components are ready.

##### Update

Use A/B or immutable-version deployment:

1. stage the new DeVoid version beside the active one;
2. verify it and migrate state transactionally;
3. run shadow self-tests/canaries;
4. atomically switch the active version;
5. retain a known-good rollback generation;
6. revoke the old generation after successful proof.

Updates to Claude/Codex should be coordinated with capability certificates. A runtime update is a security-posture change, not an ordinary application patch.

##### Repair

Continuously verify and repair:

- service registration and recovery settings;
- service binary signature/digest;
- WFP filters and firewall policy;
- managed vendor source and hook command;
- provider route;
- per-user broker registration;
- directory/file ACLs;
- credential/key provider;
- current canary and certificate.

Repair should not manufacture green; it must re-run proof after fixing drift.

##### Rollback

Policy and binary rollback should remain forward-moving and signed. Reuse the current forward-only policy principle: a historical body is reissued at a higher revision rather than lowering monotonic state.

##### Uninstall

- restore or preserve user-owned configuration and quarantined content before deleting DeVoid state;
- remove WFP filters, service registration, managed vendor sources, shims, browser policy, native host, credentials, and version directories;
- verify PATH and shell profiles no longer reference DeVoid;
- leave no vendor-named executable residue;
- if a user-owned artifact cannot be restored safely, preserve it with a clear manifest rather than delete it or pretend success;
- produce an uninstall evidence record before identity teardown when policy permits.

The current 41-file/~424 MB residue must be treated as a release-blocking lifecycle defect once the mechanism is understood.

#### Avoid

- mutating the active binary in place;
- an MSI health command whose failure is ignored while the installer returns success;
- deleting stashes before restore outcome is known;
- removing evidence/keys before sending the final teardown proof;
- a custom cleanup action that hides an unexplained MSI component-state problem without understanding it;
- preserving stale shims under vendor names after uninstall.

#### 9+ exit gate

- Clean and dirty-state lifecycle matrices pass across supported OS builds and user counts.
- Install creates no ungoverned launch window.
- Update rollback is automatic after failed canary.
- Repair is externally effective even when the main service is dead.
- Uninstall leaves no active routing, WFP policy, service, PATH reference, managed hook, or unexplained payload residue.
- User-owned data is restored or explicitly preserved with actionable evidence.

---

### Workstream 11 — Replace roll-up health with coverage truth

#### Objective

Make the console and local status unable to read green while a material control is unknown, stale, bypassed, or undecided.

#### Recommended technology direction

Create one coverage record per:

```text
endpoint + user/session + runtime + exact binary + host + OS + route + auth mode
```

Track independent states:

- runtime discovered;
- approved binary/certificate;
- machine-managed source present;
- client confirmed the source was selected;
- required settings accepted;
- managed hook configured;
- managed hook observed;
- hook decisions reached/undecided count;
- provider route configured;
- provider route observed;
- direct egress guard active;
- effect capability certified;
- last effect proof;
- last semantic canary;
- local policy freshness;
- evidence convergence;
- tamper/drift state;
- unsupported capabilities enabled.

Use a strict posture composition rule:

- `PREVENTION_ACTIVE` only when every mandatory field for that profile is true and fresh;
- `DEGRADED` when a known weaker path remains;
- `CONTAINED` when direct use is technically prevented but full functionality is unavailable;
- `UNSUPPORTED` for unknown versions/features;
- `UNMANAGED` for cooperative endpoints;
- `UNKNOWN` when DeVoid cannot measure the state.

Unknown is not clean. Drift is not unknown. Failure is not absence. These need distinct reason codes because they require different operator actions.

Show both current state and evidence basis:

- “managed settings selected from HKLM”;
- “hook observed 3 minutes ago”;
- “2 undecided invocations in last hour”;
- “direct egress canary passed”;
- “Codex hosted WebSearch disabled by requirement”;
- “desktop binary 0.150.1, certificate X, expires …”.

Fleet views should expose denominators:

- percentage of endpoints managed;
- percentage on certified runtime versions;
- percentage with fresh canaries;
- percentage with forced egress;
- undecided invocation rate;
- evidence backlog/gaps;
- exact reasons endpoints are degraded.

#### Avoid

- one “agent online” health bit;
- unauthenticated HTTP 200 as governance health;
- “hooks installed” based on file equality;
- a zero count omitted from output, making zero indistinguishable from unreadable;
- counting only decisions and labeling the metric “traffic observed”;
- hiding unsupported tool paths behind a runtime-level green row.

#### 9+ exit gate

- No test can produce green with an unknown version, missing managed source, stale canary, non-zero undecided count, bypassed route, or absent effect certificate.
- Local and backend posture use the same reason vocabulary.
- Every fleet percentage has a visible numerator/denominator and freshness window.
- The UI can drill from runtime summary to exact host, binary, route, capability, and evidence.

---

### Workstream 12 — Strengthen identity, secret storage, and tamper resistance

#### Objective

Prevent one local user from impersonating another, reduce credential theft value, and ensure tampering revokes assurance immediately.

#### Recommended technology direction

##### Endpoint identity

- keep one machine identity controlled by the machine service;
- generate the signing key through Windows CNG;
- prefer the Microsoft Platform Crypto Provider/TPM for a non-exportable key;
- bind backend enrollment to the measured key and endpoint identity;
- report hardware-backed versus software-backed storage explicitly;
- rotate through an authenticated continuity protocol rather than wiping identity on reinstall.

##### Per-user/session identity

- create a short-lived user/session channel when the broker connects;
- authorize by logon SID and client process identity;
- issue capability-specific tokens rather than one all-powerful machine bearer;
- expire on sign-out, session change, unenrollment, or managed-posture loss;
- never place a global daemon token in a file readable by all local users.

##### Binary/configuration integrity

- sign every DeVoid executable and script;
- keep hook launchers in administrator-controlled paths;
- verify publisher, digest, owner, ACL, and canonical target before use;
- prefer direct executable invocation over shell-interpreted wrappers in authoritative hooks;
- measure WFP policy, service config, vendor managed settings, and active DeVoid version;
- emit high-priority tamper evidence and revoke prevention state when integrity changes.

##### Enterprise hardening

Offer an optional high-assurance deployment profile that integrates with:

- Intune/MDM or Group Policy for managed settings and firewall policy;
- App Control for Business/WDAC to allow approved DeVoid and vendor binaries and scripts;
- AppID tagging for stable firewall identity;
- disabled local firewall rule merge where appropriate;
- BitLocker/Secure Boot/TPM health as posture inputs.

This profile raises the cost of local tampering. It still must not be marketed as defeating a determined domain or local administrator who controls the machine’s policy authority.

#### Avoid

- confusing “file ACL is correct” with hardware-backed identity;
- one fleet-shared secret for runtime IPC;
- storing long-lived provider credentials in plain user config;
- using a shell script as the authoritative machine hook when a signed executable is available;
- retaining green after service, firewall, managed policy, or binary integrity changes;
- claiming TPM attestation solely from a provider name without a real attestation chain.

#### 9+ exit gate

- Standard users cannot read machine private keys or another user’s session credential.
- Cross-user local API/pipe calls fail.
- Runtime and DeVoid binaries are verified before certification.
- Tampering with the service, hook, managed settings, WFP policy, or provider route revokes green immediately and produces evidence.
- Hardware-backed key coverage is measured fleet-wide; software fallback is clearly labeled.

---

## 8. Claude Code target architecture

### 8.1 Authority stack

The target Claude stack should be:

1. **OS/MDM-managed Claude settings** as the authoritative policy source.
2. **Machine-managed command hooks** in an administrator-controlled signed executable path.
3. **Managed permission and hook locks** so user/project/host sources cannot add weakening rules or hooks.
4. **A local cached-policy helper at startup** where dynamic endpoint policy is needed.
5. **Surface-correct gateway configuration and credential delivery.**
6. **WFP direct-egress denial.**
7. **PATH shim as an additional launch/UX/correlation layer.**
8. **Exact-version and host certification plus continuous canary.**

### 8.2 Managed settings posture

Use endpoint-managed settings rather than ordinary `~/.claude/settings.json` for the prevention claim. The managed posture should include, subject to exact-version certification:

- `allowManagedHooksOnly`;
- `allowManagedPermissionRulesOnly`;
- bypass-permission mode disabled;
- managed MCP/marketplace restrictions where DeVoid’s product policy requires them;
- an absolute command hook path;
- route/auth configuration appropriate to the surface;
- supported version bounds as a convenience guard, not the sole certificate.

A `policyHelper` is useful when DeVoid needs to compute endpoint-specific managed settings. It should read the last verified local policy snapshot and return quickly. It should not call the backend during Claude startup. Because Anthropic stops startup when the helper fails, DeVoid must make helper failure messages precise and keep a known-good local snapshot.

Server-managed Claude settings can complement the endpoint source, but they should not be the primary delivery mechanism for enforcement hooks because some server-managed changes require user approval and cloud/desktop surfaces differ. DeVoid must define source-composition behavior deliberately and verify `/status` reports the expected selected/merged source.

### 8.3 Hook design

Use command hooks with direct signed executable invocation for authoritative gating. Keep hook work local and bounded.

- `UserPromptSubmit`: pre-processing prevention; good for semantic prompt context.
- `PreToolUse`: pre-execution prevention; primary local tool gate.
- `PostToolUse`: model-context feedback/replacement only; never described as undoing the tool.
- session/config events: posture, correlation, and evidence, not universal prevention.

For a hard deny, emit the strongest contract certified for the exact Claude version, including exit-code-2 behavior where appropriate. Do not depend on timeout or process failure as a block; Anthropic explicitly documents those as non-blocking.

### 8.4 Gateway design by surface

Do not treat every Claude host as consuming the same gateway setting.

- **CLI:** managed environment/settings plus gateway credential/helper.
- **VS Code/JetBrains:** certify the extension’s own startup/login checks and environment delivery, not only the spawned process.
- **Claude Desktop Code/Cowork:** use the administrator-supported third-party inference/gateway configuration for the desktop host; do not assume `ANTHROPIC_BASE_URL` in a user file covers it.
- **Agent SDK:** certify host-supplied environment and managed settings separately.
- **Cloud sessions:** device policy does not automatically reach Anthropic-hosted environments; treat as a separate product surface.

Use `/status` and `claude doctor` as vendor-native posture evidence, but combine them with DeVoid’s own wire and effect canaries.

### 8.5 Sandboxing and network

Claude’s built-in sandbox is available on macOS, Linux, and WSL2, not native Windows. On native Windows, DeVoid cannot claim the vendor sandbox as a backstop. It must rely on managed permission rules, WFP/provider control, and the endpoint’s broader security stack. WSL2 should be separately certified because the process, filesystem, policy source, and network path cross the Windows/Linux boundary.

### 8.6 Claude 9+ acceptance

Claude interception reaches 9+ only when, for each named host:

- the exact binary/extension/desktop runtime is certified;
- the expected managed source is selected;
- the managed hook blocks in a live allow/deny twin;
- hook timeout/crash behavior does not create provider leakage because the wire/OS boundary remains;
- the correct gateway route is observed for that host;
- direct egress is denied;
- unsupported ancillary/cloud features are disabled or shown separately;
- a fresh full-stack canary exists;
- production evidence is converged.

**Target score:** Claude interception coverage → **9.4/10**.

---

## 9. Codex target architecture

### 9.1 Authority stack

The target Codex stack should be:

1. **Machine `requirements.toml` / supported managed channel** as the authoritative requirements source.
2. **Managed hooks** from that source, using an absolute signed launcher in the managed directory.
3. `features.hooks = true` and `allow_managed_hooks_only = true` **only after the machine hook is proven on the actual machine root**.
4. **Managed permission profiles** and feature restrictions, not a brittle new deployment built around old sandbox constants.
5. **Elevated native Windows sandbox** as the required implementation for the strongest Windows profile.
6. **Managed provider route** plus WFP direct-egress denial.
7. **Cooperative user hook retained only for unmanaged fallback/diagnostics**, not for the prevention certificate.
8. **Exact binary/host certification**, because client and host behavior differ by version.

### 9.2 Replace the cooperative trust-hash dependency

The cooperative trust ledger was a useful bridge, but it is structurally the wrong long-term authority:

- its digest dialect changes by client family;
- unmeasured builds are inert;
- a machine baseline with `allow_managed_hooks_only` suppresses it;
- the desktop may embed a different build from the CLI;
- user scope is not the strongest organization control.

DeVoid should continue to report it accurately on unmanaged endpoints, but no 9+ score should depend on it.

The authoritative proof must come from the managed hook actually dispatching from the real machine requirements location on the exact client/host.

### 9.3 Managed permission profiles and sandbox

OpenAI now recommends permission profiles for supported local clients. Use them to define a conservative shared baseline and restrict the profiles a user may choose. Omitted future profiles should remain denied.

For native Windows, require the `elevated` sandbox in the strongest profile. It uses dedicated lower-privilege users, filesystem boundaries, and firewall policy; the unelevated mode is explicitly weaker.

Avoid repeating the current desktop-bricking pattern in which one full CLI profile is written into a shared configuration and the desktop cannot operate. Build:

- a minimal common managed baseline verified across CLI, IDE, and desktop;
- host-specific additions only after the exact host certifies them;
- separate posture rows when a host receives a reduced profile.

### 9.4 Uncovered Codex tool paths

A 9+ Codex profile must account for OpenAI’s documented gaps:

- hosted tools such as WebSearch do not use the local function-tool hook path;
- specialized tool paths may bypass default hooks;
- follow-up input to an already-approved unified execution session may not re-run `PreToolUse`;
- apps, MCP, computer use, and browser features have distinct control surfaces;
- post-tool feedback does not undo execution.

For each such capability, choose one:

1. disable it through managed requirements;
2. govern it through another proven DeVoid/vendor control;
3. include it only in a lower assurance profile;
4. declare it unsupported.

The console must show the choice. “Codex hooks healthy” is not equivalent to “all Codex capabilities governed.”

### 9.5 Hook contract certification

Current OpenAI documentation supports several blocking forms, including exit code 2. DeVoid’s older measured client behavior differed. Therefore:

- choose one canonical effect form per exact certified build;
- test canonical JSON, legacy JSON, exit code 2, malformed output, timeout, crash, concurrent hooks, and host differences;
- never broaden a version family from source inspection alone;
- make the latest stable release an immediate certification input;
- keep prerelease builds out of the enterprise prevention ring unless explicitly certified.

### 9.6 Provider routing and authentication

Use managed `openai_base_url` or a certified provider configuration to point Codex at DeVoid. Project config is not sufficient as authority; WFP must prevent direct external use.

Authentication should be a named coverage dimension:

- enterprise/API gateway identity with brokered upstream credential;
- API-key passthrough;
- ChatGPT sign-in/OAuth passthrough;
- custom provider.

Only modes that have been tested across CLI, IDE, and desktop may carry the 9+ certificate. A custom provider should not inherit OpenAI protocol certification automatically.

### 9.7 Codex 9+ acceptance

Codex interception reaches 9+ only when:

- the managed machine hook fires on the actual machine root;
- `allow_managed_hooks_only` suppresses only weaker hooks, never the sole working hook;
- the exact CLI/IDE/desktop binary is certified;
- unsupported hosted/specialized tools are disabled or removed from the claim;
- managed permission profiles and the elevated sandbox are active where required;
- provider traffic is forced through DeVoid;
- retries/reconnects cannot escape a deny;
- direct provider egress is denied;
- a fresh allow/deny canary and production evidence exist.

**Target score:** Codex interception coverage → **9.3/10**.

---

## 10. Reliability, performance, and failure test standard

A 9+ rating must be earned under the failure mode that already broke the product: load and partial failure—not only a quiet functional test.

### 10.1 Certified stress matrix

Run every hard-deny canary and its allow twin under:

- idle baseline;
- sustained CPU saturation;
- memory pressure and paging;
- high disk I/O and nearly-full disk;
- Docker/container build load;
- many concurrent agent sessions;
- backend unreachable, slow, 401, 409, 429, 5xx, and malformed response;
- evidence backend unavailable and acknowledgement invalid;
- service restart during decision;
- gateway restart during request;
- runtime update during idle and active sessions;
- policy change during an active session;
- user logon/logoff, fast user switch, lock/unlock;
- sleep, hibernate, and resume;
- network adapter/VPN/proxy changes;
- IPv4/IPv6 transitions;
- WFP/firewall policy refresh;
- clock skew and trusted-time failure;
- corrupt/missing local policy snapshot;
- corrupt/missing managed vendor settings;
- full evidence spool and bounded local stores.

### 10.2 Proposed reliability objectives

These are strategic acceptance targets for Codex to refine after establishing a baseline:

| Metric | Proposed 9+ target |
|---|---|
| Silent allow on a synthetic hard-deny path | **0 in 10,000 consecutive operations per certified surface/stress matrix** |
| Inline platform decision latency | p95 ≤ 50 ms; p99 ≤ 150 ms after warm-up |
| Decision availability in certified profile | ≥ 99.999% measured, with remaining failures entering an explicit safe terminal |
| Direct provider bypass | 0 successful connections in the full bypass suite |
| Service crash recovery | external recovery within 5 seconds, while WFP/containment prevents direct provider use |
| Ungoverned startup window | 0; launch is governed or refused |
| Unknown runtime version shown green | 0 |
| Block effects with a Decision Receipt | 100% |
| Canary effects reaching E3 | 100% |
| Full prevention canary freshness | ≤ 15 minutes and immediately after material change |
| Evidence deletion on unverified acknowledgement | 0 |
| Lifecycle residue that can still intercept or route | 0 |

The exact latency and recovery numbers may be adjusted after engineering measurement. The semantic requirements—zero silent hard-deny allows, zero direct bypass, no false green—must remain.

### 10.3 Load-shedding order

When resources are constrained, DeVoid should shed work in this order:

1. cosmetic UI/notifications;
2. noncritical telemetry enrichment;
3. inventory and background scans;
4. backend opinions;
5. evidence upload, while preserving local spool;
6. never the local hard decision or required effect.

The product should slow or contain before it silently removes a mandatory checkpoint.

---

## 11. Program phases in dependency order

These are strategic phases, not repository tasks or time estimates.

### Phase 0 — Define the honest boundary and freeze contracts

Outcomes:

- approve the initial certified scope and threat model;
- freeze normalized action, findings, policy decision, desired effect, capability resolution, and receipt contracts;
- define assurance tiers and UI language;
- define the 9+ test matrix and measurement baseline;
- separate detection-engine work from runtime-specific effect code;
- make all current gaps visible as open evidence items, not informal knowledge.

**Gate:** Codex can map every current runtime path onto one contract and every product claim onto one assurance tier.

### Phase 1 — Eliminate the critical fail-open and establish the real service boundary

Outcomes:

- local inline decision snapshot/core;
- hard decisions independent of backend/telemetry;
- real Windows enforcement service with external recovery;
- secure per-session broker and named-pipe identity;
- no one-minute unwired state;
- no shared machine-readable daemon bearer.

**Gate:** the 10,000-run hard-deny stress suite has zero silent allows, and immediate post-logon launch is governed or refused.

### Phase 2 — Make vendor controls authoritative and provider egress forced

Outcomes:

- Claude OS/MDM-managed settings and managed hook;
- Codex machine-managed requirements and hook;
- host-specific managed profiles;
- provider gateway route per surface;
- WFP/ALE direct-egress denial;
- credential-broker mode for the strongest profile;
- PATH shim demoted to an additional gate.

**Gate:** absolute paths, embedded hosts, route changes, and alternate provider configuration cannot bypass the certified runtime boundary.

### Phase 3 — Make effects and proof first-class

Outcomes:

- capability registry;
- honest effect vocabulary;
- Decision and Effect Receipts;
- independent side-effect/egress witnesses;
- production receipt sink;
- fixed process/stream completion in the canary;
- multi-layer canaries and posture state machine.

**Gate:** “Prevention Active” is impossible without a recent E3 canary and a valid capability certificate.

### Phase 4 — Automate runtime certification and controlled release

Outcomes:

- official release watchers;
- clean VM host matrix;
- exact binary certificates;
- managed vendor update rings;
- unsupported capability disablement;
- automatic downgrade/revocation on new binaries;
- historical certificate ledger.

**Gate:** a new Claude/Codex release cannot enter the prevention ring before certification and cannot inherit a previous binary’s green status.

### Phase 5 — Prove the production chain and commercialize the boundary

Outcomes:

- field proof against the production signing, policy, evidence, and rollout chain;
- representative hardware, users, and hosts;
- fleet coverage dashboard and operational alerts;
- install/update/repair/uninstall certification;
- enterprise deployment package for Intune/GPO/MDM/App Control;
- customer-facing security boundary and degraded-mode documentation.

**Gate:** all scorecard rows below have their required evidence, not merely merged code.

---

## 12. Target scorecard after the strategy is completed

The target score is conditional on the named evidence. It is not a prediction that code changes alone automatically earn the score.

| Area | Current | Target | Evidence required for target |
|---|---:|---:|---|
| **Overall technological architecture** | 8.5 | **9.5** | Three-plane design, local decision core, authoritative managed controls, forced egress, capability registry, and proof lifecycle all live together. |
| **Ability to plug in a detection brain** | 8.0 | **9.6** | Runtime-neutral versioned contract, canonical replay, detector/effect separation, deterministic snapshots, and no vendor imports in detector code. |
| **Claude interception coverage** | 7.5 | **9.4** | Per-host managed settings/hook, correct gateway configuration, direct-egress denial, exact-version certificate, and fresh canary. |
| **Codex interception coverage** | 5.5 | **9.3** | Machine-managed hook on real machine root, permission profiles, elevated sandbox, uncovered hosted paths disabled/declared, forced route, exact-host certificate. |
| **Ability to enforce once a decision is reached** | 7.0 | **9.5** | Capability-aware mapper, no post-effect overclaim, trusted confirmation, protocol-safe rewrite, and Effect Receipts. |
| **Reliability of reaching the decision engine** | 3.0 | **9.7** | 10,000-run stress suite with zero silent hard-deny allows; no backend dependency; reserved decision resources; safe explicit terminals. |
| **Resistance to bypass** | 4.0 | **9.2** | OS/MDM authority, WFP direct-egress denial, AppID/App Control option, credential isolation, absolute-path/embedded-host tests, tamper revocation. |
| **Operational durability** | 4.5 | **9.5** | Real service, external recovery, secure IPC, no logon gap, atomic updates/rollback, lifecycle certification, no residue. |
| **Proof that enforcement happened** | 3.5 | **9.6** | Decision/Effect separation, E3 canaries, TPM-backed signing where available, production evidence convergence, no no-op satisfaction. |
| **Enterprise prevention readiness** | 4.0 | **9.3** | All above within a published certified scope, production proof, managed deployment, supportable degraded modes, fleet truth, and controlled vendor updates. |

### Why none of these is 10/10

Claude and Codex are vendor-controlled clients with changing protocols and capabilities. DeVoid does not control all future versions, cloud-hosted surfaces, or a hostile machine administrator. The responsible goal is a continuously certified 9+ boundary with rapid revocation when reality changes—not a permanent universal 10/10 claim.

---

## 13. Enterprise prevention Definition of Done

For every runtime/host that DeVoid markets as prevention-capable:

1. The exact binary, signer, digest, version, host, OS, user/session, and authentication mode are known.
2. The organization-managed vendor source is active and the client confirms it selected that source.
3. Required settings were accepted; rejected/unknown settings are visible.
4. The managed hook fires from an administrator-controlled signed path.
5. A busy/dead control-plane process cannot silently turn a hard decision into proceed.
6. Direct provider egress is denied independently of client configuration.
7. The configured gateway route is observed on that exact surface.
8. Every enabled tool/capability is covered, disabled, or explicitly excluded.
9. The requested effect resolves through the exact capability certificate.
10. Pre-action and post-action effects are never conflated.
11. A recent allow/deny semantic canary reaches independent effect proof.
12. Install, immediate logon, reboot, update, repair, sleep/resume, and service recovery create no silent governance gap.
13. Unknown runtime binaries automatically lose prevention state.
14. Standard-user tampering attempts are denied and recorded.
15. Evidence is locally durable and acknowledged only through verified backend proof.
16. The production console can trace the event and prove there is no sequence gap.
17. A clean allow control succeeds, proving safety controls have not simply bricked the runtime.
18. The complete result has been reproduced through the production policy/signing/rollout chain.

Until all eighteen are true, the surface may be valuable and partially enforced, but it is not a 9+ enterprise prevention boundary.

---

## 14. Decisions DeVoid should make now

### Decision 1 — Adopt a narrow certified scope

Choose the first commercial prevention profile and explicitly list what is outside it. This is the prerequisite for every score.

### Decision 2 — Make the inline decision core the first engineering priority

The six-in-ten leak is more important than adding another interception surface. It is the direct contradiction of the prevention promise.

### Decision 3 — Make machine-managed hooks primary for both vendors

Claude user settings and Codex cooperative trust remain useful, but they must stop carrying the strongest claim.

### Decision 4 — Force provider egress with WFP before building a custom driver

Use managed routing plus built-in ALE filters. Revisit a callout driver only after a measured requirement proves built-in filters cannot meet it.

### Decision 5 — Replace the scheduled task with a service/broker split

A security control cannot depend on an in-process watchdog and a delayed per-user task while calling itself durable.

### Decision 6 — Build proof and certification as product features

The compatibility lab, effect receipts, and canaries are not QA extras. They are the moat and the basis of the enterprise claim.

### Decision 7 — Freeze uncontrolled vendor updates in the prevention ring

Allow updates through a tested rollout rather than letting a vendor release silently alter hook semantics in production.

### Decision 8 — Do not broaden to more AI clients until Claude and Codex pass

A dependable narrow boundary is more valuable than broad, conditional integrations with no effect proof.

---

## 15. Approaches that look fast but will not produce 9+/10

1. **Increase the hook timeout.** This adds delay and leaves the same dependency/fail-open.
2. **Make every failure globally fail closed.** This will brick normal work and cause removal; failure behavior must be capability- and impact-aware.
3. **Treat PATH shims as endpoint control.** They cannot cover absolute paths, embedded hosts, or custom clients.
4. **Keep expanding Codex trust-hash prefixes.** That is a compatibility bridge, not machine authority.
5. **Trust configuration equality.** A file on disk does not prove the client loaded or honored it.
6. **Build a broad TLS MITM.** It expands privacy, compatibility, certificate, and support risk unnecessarily.
7. **Start with a kernel driver.** WFP’s built-in enforcement should be exhausted before increasing the trusted kernel attack surface.
8. **Call `PostToolUse` a block.** The action already occurred.
9. **Call a no-op obligation satisfied.** An intended deny is not an effect.
10. **Use one machine token for all users.** It cannot provide per-user authority or trustworthy local attribution.
11. **Mark the runtime green when one hook fired.** The relevant question is whether every enabled capability and required route is governed now.
12. **Let unknown versions inherit old proof.** Runtime compatibility is part of the security boundary.
13. **Put cloud/model opinions in the hard path.** They create latency and availability dependencies that the endpoint cannot control.
14. **Update detector logic and enforcement architecture in the same change.** It destroys the ability to identify which layer failed.

---

## 16. Instructions for Codex with repository access

This section is the handoff. It deliberately stops before code-ready implementation detail.

### 16.1 Required first action

Before proposing changes, Codex should read:

1. `AI_SECURITY_SOURCE_OF_TRUTH.md` at the current repository commits;
2. this 9+ strategy;
3. the existing runtime enforcement foundation gate;
4. the live-proof register and separate Codex proof ledger;
5. current vendor documentation for the exact versions present in the test environment.

Codex must verify the repository has not moved beyond the commits named by the Source of Truth. Where code and documents disagree, code and current live evidence win; the documents must be updated rather than defended.

### 16.2 Codex’s planning output

Codex should produce a repository-specific implementation plan that maps each strategic outcome to:

- current components that can be preserved;
- components that must be refactored or replaced;
- migration and backward-compatibility implications;
- security boundaries and trust changes;
- test and live-proof requirements;
- install/upgrade/rollback/uninstall implications;
- rollout and feature-flag sequence;
- operational metrics and console changes;
- explicit risks and unresolved vendor limitations.

That later plan may name files, packages, interfaces, data migrations, and test fixtures. This strategy intentionally does not.

### 16.3 Non-negotiable constraints for Codex

- Do **not** change detection classes, patterns, evidence tiers, malicious floors, or default block/warn/redact choices as part of this work.
- Do **not** delete or weaken existing controls merely to simplify the architecture.
- Do **not** call a code path live because it has unit tests.
- Do **not** close a Source-of-Truth gap without a dated live-proof artifact.
- Do **not** widen a runtime version range from source inspection or documentation alone.
- Do **not** enable `allow_managed_hooks_only` until the managed machine hook has passed the real-host canary.
- Do **not** create a kernel driver unless a written comparison proves user-mode WFP filters cannot satisfy the requirement.
- Do **not** put backend, evidence upload, alert delivery, inventory, or UI work into the hard decision dependency chain.
- Do **not** preserve a false-green status for compatibility.
- Do **not** market local-admin resistance without an explicit MDM/App Control threat model and evidence.

### 16.4 Codex’s recommended epic order

Codex should organize its later implementation plan around these outcome epics:

1. runtime-neutral contracts and replay;
2. inline decision core and immutable snapshot;
3. Windows service, user broker, IPC, and per-session identity;
4. forced provider routing and credential boundary;
5. Claude machine-managed authoritative lane;
6. Codex machine-managed authoritative lane;
7. capability-aware effect executor;
8. Decision/Effect Receipts and semantic canaries;
9. runtime certification factory and update ring;
10. coverage truth, lifecycle hardening, and production field proof.

The first release gate should be **Claude CLI on managed Windows**, followed by Claude IDE, Codex CLI, Codex IDE, and desktop hosts only as each passes its own certificate. Codex should challenge that ordering if code inspection proves a different dependency, but it should preserve the principle of one narrow live-proven surface before breadth.

---

## 17. Research references

### Source basis

- `AI_SECURITY_SOURCE_OF_TRUTH.md`, written 2026-08-27 and revised 2026-08-28.
- `DEVOID_AI_RUNTIME_ENFORCEMENT_FOUNDATION_GATE.md`, 2026-08-28.

### Anthropic official documentation

- Managed settings: https://code.claude.com/docs/en/managed-settings
- Settings and precedence: https://code.claude.com/docs/en/settings
- Hook contract: https://code.claude.com/docs/en/hooks
- Hook guide: https://code.claude.com/docs/en/hooks-guide
- LLM gateway overview: https://code.claude.com/docs/en/llm-gateway
- Gateway connection/rollout: https://code.claude.com/docs/en/llm-gateway-connect
- Gateway protocol: https://code.claude.com/docs/en/llm-gateway-protocol
- Network configuration: https://code.claude.com/docs/en/network-config
- Sandbox: https://code.claude.com/docs/en/sandboxing

### OpenAI official documentation

- Codex hooks: https://developers.openai.com/codex/hooks
- Managed configuration: https://developers.openai.com/codex/enterprise/managed-configuration
- Admin rollout: https://developers.openai.com/codex/enterprise/admin-setup
- Configuration reference: https://developers.openai.com/codex/config-reference
- Permission profiles: https://developers.openai.com/codex/permissions
- Windows sandbox: https://developers.openai.com/codex/windows/windows-sandbox
- Advanced configuration/provider routing: https://developers.openai.com/codex/config-advanced
- Authentication: https://developers.openai.com/codex/auth
- Codex releases: https://github.com/openai/codex/releases

### Microsoft official documentation

- Application Layer Enforcement/WFP: https://learn.microsoft.com/en-us/windows/win32/fwp/application-layer-enforcement--ale-
- Named-pipe security: https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights
- Named-pipe client identity: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid
- Named-pipe client impersonation: https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-impersonatenamedpipeclient
- Windows service recovery: https://learn.microsoft.com/en-us/windows/win32/services/service-changes-for-windows-vista
- App Control for Business: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/appcontrol
- AppID tagging: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/appidtagging/appcontrol-appid-tagging-guide
- TPM/CNG key protection: https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/how-windows-uses-the-tpm

---

## 18. Final judgment

The present DeVoid runtime architecture is good enough to preserve and good enough for the detection team to start building against. It is not yet good enough to call dependable enterprise prevention.

The route to 9+ is not more detection breadth and not more wrappers. It is:

> **local decisions, machine authority, forced egress, durable service identity, exact-version capability certificates, independent effect proof, and a console that refuses to call uncertainty green.**

That combination turns DeVoid from a collection of sophisticated control points into a product an enterprise can rely on—and gives the future detection brain a body whose decisions actually reach Claude and Codex.
