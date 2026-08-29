# Fix specs — tool-risk defaults and decision attribution

Covers F41 and F42, found by live diagnosis on 2026-08-09 while investigating why DeVoid interrupts ordinary agent
work. Owner decision **D4** (plan §7) governs F41 and is not open for relitigation.

---

## F41 — The default posture interrupts ordinary work, and nothing points at the dial  [HIGH · backend+agent · S/M]

### Root cause (settled)
Measured live: **7 warns in 705 tool-checks**, all local (`serverEnforced=false`). The enforced policy is
**byte-for-byte `defaultToolRiskActions()`** (`Backend/src/ai-security-policy/ai-security-policy.constants.ts:1046`):
25 block (HIGH tier), 3 warn (MEDIUM tier), 12 allow (INFO tier), with `exclusions.allow` **empty**. Nobody has ever
moved a tool-risk dial on this org.

The three MEDIUM classes — `interpreter-exec`, `fetch-then-exec`, `substitution-exfil` — fire on inline interpreters
and command substitution, i.e. continuously during ordinary agent work.

**The 2026-08-02 items 40/41 DID land and DO work.** All three classes are registered
(`ai-security-policy.constants.ts:213/215/220`), carry real console metadata (`ai-class-metadata.ts:253-255`), are
pinned by a parity spec, and are live in the bundle. They are controllable. **What never changed is the default.**

The product already describes this failure in its own words at `Installers/internal/daemon/ai_handlers.go:3227-3230`:
*"NO console setting could suppress one. Operators reasonably read a relaxed autonomy policy as 'stop asking me',
set it, and saw no change."* The monitor lane was built to fix that, and the owner still hit the wall — because the
default warns and nothing routes them to the dial.

De-escalation mechanics, verified: on the first-class lane (`toolRisk.enabled=true`) `decideToolRisk`
(`ai_handlers.go:3320-3353`) treats **both** `monitor` and `allow` as non-interrupting at `:3337` — the finding is
still evaluated, still posted, still in the event ledger. The legacy DLP-based lane (`:3252`) honours **monitor
only**; it is unreachable while `toolRisk.enabled` is true.

### What changes
1. **Backend** `ai-security-policy.constants.ts` — re-tier per the D4 table. Move the structural classes out of the
   interrupting tiers:
   - **BLOCK (15)** — `reverse-shell`, `content-reverse-shell`, `fork-bomb`, `destructive-mkfs`, `destructive-dd`,
     `destructive-devwrite`, `devoid-self-disable`, `sensitive-write-devoid`, `sudoers-edit`,
     `sensitive-write-sudoers`, `authorized-keys-write`, `sensitive-write-authkeys`, `firewall-disable`,
     `history-wipe`, `docker-socket-abuse`
   - **WARN (6, operand-gated — see step 6)** — `destructive-rm` (system paths), `cloud-cred-read`, `data-exfil`,
     `chmod-sensitive`, `git-history-destroy`, `untrusted-network-install`
   - **MONITOR (16)** — `interpreter-exec`, `fetch-then-exec`, `substitution-exfil`, `pipe-to-shell`,
     `base64-pipe-shell`, `content-pipe-shell`, `powershell-download-exec`, `generic-pipe-shell`, `dynamic-eval`,
     `content-spawn-shell`, `chmod-broad-777`, `docker-cp-host`, `privilege-escalation`,
     `sensitive-write-git-hooks`, `sensitive-write-shell-hooks`, `sensitive-write-shellrc`
2. **Backend migration** — orgs that have never customised must pick up the new defaults; orgs that **have**
   customised a class must keep their value. Key on the existing preset/`customizedKeys` metadata; do not blanket
   overwrite stored actions.
3. **Backend** — keep the tier constants as the single source of truth so `AI_TOOL_RISK_*_CLASSES`,
   `defaultToolRiskActions()`, the class metadata and the Frontend tuple cannot drift. The existing parity spec must
   be updated, not deleted (a class added without a META entry **crashes the console board**).
4. **Agent** `internal/daemon/ai_handlers.go` (`toolDecisionReason`, `:3394+`) — every interruption must name the
   exact **class** and the exact **dial** ("AI Security → Tool-Risk → `<class>` → Monitor"), plus the local one-shot
   remedy. Secret-free, as today.
5. **Frontend + Backend** — surface `exclusions.allow`. It exists, is enforced, and is empty on every org; an
   operator has no way to discover it.
6. **Follow-on, after F8a lands** — re-promote the WARN tier to **operand-gated**: warn only when the structural
   shape carries a destructive path, a credential read, or a network sink. Judging that needs the expanded argv the
   F8a parser produces. Strictness is earned back with precision, not with shape.

### The cost — state this plainly, do not bury it
Moving `pipe-to-shell`, `base64-pipe-shell`, `powershell-download-exec`, `chmod-broad-777` and `fetch-then-exec` to
MONITOR **removes the exact five blocks proven live in PL/CC-1** — the paired attack/benign trials that were our
demonstration the command lane works and discriminates. Findings are still detected, posted and rendered. **Nothing
is stopped.** This is correct for a pre-customer dev tenant and wrong as a permanent product default; step 6 is what
makes it defensible long-term.

### Do not touch
The self-defense floor at `ai_handlers.go:3328` — `devoid-self-disable` and siblings can never relax below warn,
whatever the policy says. By design.

### Also fix: the guard over-blocks on non-executed text
Found live 2026-08-09: a **read-only `grep` of log files** was blocked as `devoid-self-disable` purely because the
**search pattern** contained a command name. A pattern that is never executed must not trip the guard. Narrow the
content predicate so a string appearing as a search argument to a read-only tool is not treated as an invocation.
Same class as PL/CC-2 (writing an evidence file was blocked for quoting a dropper) — correct posture, wrong scope.

### Tests
- Policy round-trip: publish the new baseline, confirm the endpoint's on-disk `lkg-bundle` carries the new tiers.
  **Defeat:** publish a policy setting one of the three classes back to `warn`; the interruption must return.
- Realistic agent session end-to-end: **zero interruptions**. **Defeat:** run one unambiguous malicious-shape probe
  (reverse-shell shape, benign target) — it must still be **BLOCKED**. An open baseline that blocks nothing is a
  failure, not a pass.
- Customised-org migration: an org with a stored non-default action keeps it. **Defeat:** revert the
  `customizedKeys` check; the assertion must fail.
- Console board renders all 40 classes after the re-tier. **Defeat:** remove one META entry; the board must fail
  loudly in test rather than crash at runtime.
- Grep-pattern case: a read-only search whose pattern contains a guarded command name is **allowed**. **Defeat:**
  actually invoke that command — it must still be blocked.

### Risks
This is a security-posture relaxation on the one live tenant. It is reversible in one console publish (~5 min
propagation). The migration is the risky part — an over-broad write would silently discard an operator's tuning.

---

## F42 — A tool call with zero findings was recorded as `warn`  [MEDIUM · agent · S]

### Root cause — UNCONFIRMED, and that is the point
Two of the seven warns were `toolName=StructuredOutput decision=warn findings=0`. A warn with nothing behind it, on
an internal tool.

The log line cannot attribute it. `Installers/internal/core/backend/ai_tool.go:183` emits
`"AI tool-check posted", "toolName", req.ToolName, "decision", result.Decision, "serverEnforced",
result.ServerEnforced, "findings", len(req.Findings)` — **`findings` comes from the REQUEST, `decision` comes from
the SERVER's reply.** The two fields are from different sides, so `findings=0` with `decision=warn` may mean the
agent sent nothing and the backend escalated, or it may mean the count and the decision simply describe different
things. From the log alone this is undecidable.

**Do not ship a blind fix.** This is the same pathology family as F33/F34 — a decision with no finding behind it —
but on the decision path rather than the console, and we have not proven the mechanism.

### What changes
1. **Installers** `internal/core/backend/ai_tool.go:183` — log the **local** decision and the **server** decision as
   separate fields, plus the local finding count and the server-returned finding count. One line must be
   self-attributing.
2. **Installers** — record which side escalated when the two disagree (`escalatedBy=local|server`).
3. Once instrumented, wait for a recurrence and decide from evidence.

### Candidate mechanisms and the evidence that settles each
- *Backend escalated a tool it does not recognise* → server decision `warn` with local `allow` and zero local findings.
- *Taint/hold lane fired with no tool-risk finding* — plausible: `toolDecisionReason` (`ai_handlers.go:3397-3402`)
  documents that the taint path "may fire with NO toolrisk findings" → expect a hold reason string with no class.
- *Counting artifact only* → local and server decisions agree and both are `allow`; the log line was simply
  misleading.

### Tests
- Force each candidate in a harness and assert the new log line distinguishes them. **Defeat:** revert to the single
  `decision` field; the attribution assertion must fail.

### Risks
None — instrumentation only. Explicitly **not** a behaviour change.
