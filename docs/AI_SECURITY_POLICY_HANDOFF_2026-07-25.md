# HANDOFF — AI Security Policy redesign (continue from Wave 1)

You are taking over a multi-repo redesign of the DeVoid console's **AI Security Policy** page.
Two waves are committed and green. Your job is to finish the remaining waves, then prove the whole
thing end-to-end on the local Docker stack before any deploy.

Read this file top to bottom before touching anything. Then read the plan.

---

## 1. Read these first, in this order

1. **`C:\Users\Owner\Documents\Ceragon\docs\AI_SECURITY_POLICY_REDESIGN_PLAN_2026-07-25.md`**
   — the authoritative plan. §0 and §0b hold six locked design decisions (D1–D6). Do not
   re-litigate them; if one is wrong, say so and stop, don't silently deviate.
2. `C:\Users\Owner\Documents\Ceragon\CLAUDE.md` — workspace map. It is a **workspace, not a
   monorepo**: every component has its own toolchain. Always `cd` into a component.
3. The two commits you are building on (see §4).

Design proposal (visual, for context on the target UX):
https://claude.ai/code/artifact/aa2f8cb6-cf66-4de9-8424-440942adfd98

---

## 2. The problem in one paragraph

`Frontend/components/admin/ai-security-policy-section.tsx` is a **2,956-line** component exposing
**78 controls** in **11 distinct action vocabularies** (9 action tokens meaning about 3 things),
including **68 per-detector dropdowns** and **4 one-click ways to disable protection**. The owner's
direction: collapse the admin vocabulary to exactly **`monitor | warn | block`**, reorganise the
page around risks in customer language rather than by which subsystem enforces them, delete what
customers should never have to decide, and make the **baselines real** — today the shipped default
governs detection only and has no stance on which AI sites/agents/MCP servers are allowed.

---

## 3. Environment — read carefully, this already cost a day

### Worktrees (do your work ONLY here)

| Repo | Worktree | Branch | Base |
|---|---|---|---|
| Backend | `C:\Users\Owner\Documents\Ceragon\.worktrees\BE-policy3` | `feat/ai-policy-three-state` | origin/main `b58306b` |
| Installers | `C:\Users\Owner\Documents\Ceragon\.worktrees\INST-policy3` | `fix/warn-semantics-ingress-monitor` | origin/main `6ceaca8` |
| Frontend | *not yet created* | — | create off origin/main |

### THE TRAP THAT WILL BITE YOU

`C:\Users\Owner\Documents\Ceragon\Backend` and `...\Installers` are **shared with other active
chats**. Never `cd` into them, never switch their branch, never `git add -A` there.

**NEVER run `npm install` / `npm ci` / `npm run build:shared-contracts` inside a worktree.**
`@ceragon/shared-contracts` is a `file:` dependency. `BE-policy3/node_modules` is a hand-built farm
of **622 per-entry junctions** pointing at `Backend/node_modules`, with `@ceragon/shared-contracts`
overridden to the worktree's *own* `packages/shared-contracts`. An `npm install` writes *through*
those junctions and **repointed the shared checkout's contracts link at the worktree** — breaking
every concurrent Backend build. That already happened once and had to be repaired.

Verify before you start, and after anything that might have disturbed it:
```bash
cd .worktrees/BE-policy3 && node -e "console.log(require.resolve('@ceragon/shared-contracts'))"
# must print a path INSIDE .worktrees/BE-policy3
cd Backend && node -e "console.log(require.resolve('@ceragon/shared-contracts'))"
# must print a path INSIDE Backend, and `git status` there must be clean
```
To remove a junction use `$item.Delete()` or `cmd //c rmdir` — **never** `Remove-Item -Recurse`,
which follows the junction and deletes the target.

### Running tools

- Invoke local binaries directly rather than through `npx`:
  `node node_modules/typescript/bin/tsc --noEmit`,
  `node node_modules/jest/bin/jest.js src/ai-security-policy --silent`.
  (The DeVoid npm shim used to intercept `npx` and block it. The agent has since been uninstalled
  from this box, so `npx` may work now — but direct invocation is known-good either way.)
- `docs/` is **gitignored** at the workspace root. The plan and this handoff are local files, not
  tracked. Don't try to commit them; don't assume a fresh clone has them.
- Shell is Git Bash on Windows. Prefix git/AWS commands touching `/`-paths with `MSYS_NO_PATHCONV=1`.

---

## 4. What is already done (committed, with real numbers)

### `BE-policy3` — commit `4749e34` — Wave 1, the contract spine

Collapses the **stored/admin** vocabulary to three tokens **while leaving the V1 wire untouched**,
by extending `assembleEffectiveDto` in `src/ai-security-policy/ai-security-policy.service.ts` —
the same stored→wire seam that was built for the calm-monitor lane.

```
stored monitor -> wire allow/off + monitorClasses   (pre-existing, kept)
stored warn    -> wire warn
stored block   -> wire redact when the class is extractable, else block
                  (ingress: -> hold)
```

- per-class `extractable: boolean` on `AiClassMetadata`, seeded from `CORE_SANITIZE_DLP_CLASSES`;
  unknown class ⇒ `false` (conservative).
- `rolloutState: 'simulate' | 'enforce'` (default `enforce`). Under `simulate`, every governed class
  in all three class maps is emitted as the monitor projection. Guarded by
  `assertWireDispositionsSafe()`, which **throws rather than emit an unsafe payload**.
- `resolve-strictest-policy` reduced to one canonical order (`block > warn > monitor`); four
  hand-maintained rank maps became one ordering + four lists, asserted at module load.

**Tests:** `ai-security-policy` **810/810** across 26 suites (was 649/24 — no regressions);
`ai-governance` 750 passed / 18 skipped / 0 failed; `tsc --noEmit` clean.
**No shared-contracts source or dist was touched** — the new types are Backend-side, so there is no
dist rebuild and no trust-chain churn.

### `INST-policy3` — commit `b0647ec` — Wave 0A, a live production bug

Ingress `monitor` recorded **nothing**. The backend emits `Actions[cls]="off"` **plus**
`ingress.monitorClasses`, but the agent never read `MonitorClasses`; wire `"off"` then hard-skipped
the finding before it was appended. CORE ships `ingress-exfil-verb` at monitor, so **the console
promised observation and delivered silence, in production.**

Reproduced at runtime *before* fixing (default cfg → 1 finding; monitor cfg → 0 findings), then
fixed with a real `IngressMonitor` mode. A monitored finding is recorded into
`Monitored{DLP,Prompt,Ingress}Findings` and deliberately kept **out** of
`PromptFindings`/`IngressFindings` so it can never push a combo over `ingressrisk.HighConfidence` —
it records but never enforces, not even transitively. Wired on all three ingress surfaces
(Anthropic proxy, OpenAI Responses wire, PostToolUse hook).

**Adjacent bug found and fixed:** the evidence-spool metadata allowlist in `evidence_delivery.go`
was stripping `monitored` and `suppressedRepeat`, so the *existing* calm monitor lane was durably
delivered as an indistinguishable plain `allow`. The old test asserts on the pre-spool request,
which is why it never caught it.

**Tests:** `go test ./...` → **5,733 pass / 0 fail / 94 packages ok** (also fixes a pre-existing red
`internal/neutraleval` parity count); `go vet` clean; browser-extension **933/933**.

---

## 5. Locked decisions (plan §0 and §0b — do not silently change these)

| # | Decision |
|---|---|
| **D1** | **Warn** = interrupt, human may continue **with a recorded reason**. On a surface that cannot interrupt, warn **degrades to Monitor** and stamps the evidence — it must *never* silently become a block. |
| **D2** | **Redaction leaves the admin vocabulary.** `Block` means "this must not leave"; the engine picks the least-disruptive guaranteed enforcement. Evidence still distinguishes `REDACTED_THEN_SENT` from `BLOCKED_BEFORE_EGRESS`. |
| **D3** | Baselines are **ideologies, not rungs** — two dials (**Data protection** × **AI autonomy**) plus a pinned injection-defense floor. Named points: Observe / Open Tools / Protect *(default)* / Contained / Regulated. |
| **D4** | The proxy runs **inside the daemon** and has no TTY, so interactivity comes from an explicit hint (`X-Devoid-Interactive`) set by the CLI shim. Absent ⇒ non-interactive ⇒ degrade to Monitor. Spoofable **by design**: warn is a coaching boundary, not a security boundary. Anything that must truly stop belongs at Block. |
| **D5** | `blockStyle` is derived from the baseline: `sanitize-if-possible` normally, **`hard-stop` at Regulated** — otherwise D2 silently relaxes the contractor guarantee from "stop" to "sanitize and send". |
| **D6** | `INGRESS_MONITORED` must be added to `AI_EVENT_TYPES` **and Backend must deploy before any agent build that emits it.** |

---

## 6. What to do next, in order

### 6.1 — BLOCKER, do this first
`AI_EVENT_TYPES` is a **29-item digest-pinned ordered tuple** (`AI_SECURITY_PORTABLE_ORDERED_TUPLES`)
enforced by `@IsIn` in `AppendAiEventDto`. It does **not** contain `INGRESS_MONITORED`, so every
monitored ingress event the agent now emits would be **400-rejected in production**. Add the event
type, regenerate the pinned portable artifact properly, and keep the Backend-before-agent ordering.

### 6.2 — Wave 0B: unify `warn` (now unblocked by D4)
Today `warn` means two opposite things: proxy/CLI **holds** (`internal/proxy/ai_proxy.go` ~443-450,
615-680) while browser composer and uploads show a banner and **proceed**
(`browser-extension/src/content/index.js` ~627-670, ~1216-1237), and the `UserPromptSubmit` hook is
non-gating (`internal/aihooks/promptsubmit.go` ~41-44). Make it mean one thing per D1/D4.
`overrideReason` plumbing already shipped in `b0647ec`.

### 6.3 — Wave 1 remainder (Backend)
Not done in `4749e34`, all listed in the plan: the stored-config **migration**
(`allow→monitor`, `redact→block`, `hold→block`, `off→monitor`, `confirm/audit→warn/monitor`,
`*.enabled=false → group monitor`) **with a pre-migration archive write**; the stored-model
**deletions** (master kill switches, both fail-mode selectors, `uploads.maxSizeKb`, `paths.*`,
`exclusions.patterns`, `failureOracle.action`, `agents.enforcementTier`); an **additive** wire
channel so `uploads` can express `monitor` (it currently cannot — see the agent's note); and
`blockStyle` per D5.

Also close these gaps the Wave 1 agent flagged honestly:
- **`simulate` is partial** — it neutralises only the three per-class maps. A simulate policy still
  interrupts via `uploads`, `ingress.taintHold`, `providers.blocked` (extension navigation blocks),
  `paths.blocked`, `egress`, `mcp`, `webGuard.driftFailMode`. Finish it.
- The stored model currently carries **both** vocabularies at once; `allow` remains genuinely
  silent until the migration runs.

### 6.4 — Wave 2: real baselines (D3)
Rewrite `src/ai-security-policy/ai-policy-presets.ts`. **Verified problem:** the shipped default
`CORE` leaves every governance axis empty — `providers {blocked:[],tolerated:[]}`,
`agents {allowed:[], mode:""}`, `egress {mode:""}`, `paths {blocked:[],allowed:[]}` — and no rung
ever sets them. Add the missing primitive **`unknownDefault`** (`monitor|warn|block`) to
`providers`, `agents` and `mcp`: a baseline is a stance on the *unknown*, not a list of the known.
Ship the sensitive-path list as a vendor constant. **Contract test: any rung with an unset
governance axis fails CI** — that is what stops the page regrowing.

### 6.5 — Waves 3–4: risk groups + Frontend rebuild
Five risk groups as a *view* over the class map (not a new storage axis), then replace the
2,956-line component with roughly **9 controls**. Deletion list is in the plan.

### 6.6 — Local Docker E2E (the owner's explicit gate)
**Everything must be proven through the local prod-imitation Docker stack before any deploy.**
Containers are already up: `codesec-e2e-postgres`, `-minio`, `-dynamodb`, `-elasticmq`.
See `.codesec-e2e/` and the local-E2E run mechanics (host backend on :2053 — beware a stale host
node process shadowing the container on the same port).

---

## 7. Hard rules

- **Ship ON.** No feature flags, no off-by-default, no shadow mode. It ships working or it isn't done.
- **The wire does not change.** That is the whole point of the seam — deployed 7.8.x agents must keep
  working. Additive optional fields only.
- **Go `internal/policyeval` and `browser-extension/src/policyeval.js` are parity-locked** and
  enforced by shared golden-vector corpora. Mirror every change; regenerate
  `parity-vectors/neutral/*` via `browser-extension/scripts/generate-neutral-corpus.mjs`.
- **Never weaken the never-leak floor.** Absent/unknown policy stays conservative — absent policy is
  NOT monitor.
- **Any browser-extension source change must bump all five version sources**, or it never reaches an
  installed extension.
- **Report verified vs unverified.** Every report separates **PROVEN LIVE** (with evidence) from
  **NOT EXERCISED**. Never claim green without running; paste real pass/fail counts.
- Don't commit during a phase; bundle commits at the end of a wave.

## 8. Definition of done (owner's standard — no partial credit)

Ships ON · self-reviewed then adversarially reviewed · **real customer-imitation E2E on a live box**
· deployed to prod and verified with probes · source-of-truth docs and roadmap updated.

By this standard **no wave here is finished** — nothing has been exercised live, and nothing is
deployed.

---

## 9. Open risks carried forward

1. **Event volume.** Deleting `allow` makes previously-silent classes emit. Measure current
   allow-disposition fire rates *before* the migration ships. If ingestion can't absorb it, sample at
   the **endpoint**, never at the backend — dropping events at the backend recreates the exact blind
   spot this work removes.
2. **Migrating CORE→Protect is not behaviour-neutral** (unknown AI sites begin to warn, sensitive
   paths begin to block). Land migrated orgs in `simulate` so admins see what it *would* have done.
3. **`assertWireDispositionsSafe` throws**, so a backend coding error turns a policy pull into a 500.
   Fail-closed by design (the endpoint keeps enforcing its last known policy), but it is new.
4. **Team fold now folds `rolloutState`** (enforce beats simulate), so a team tier in `enforce`
   cancels a site-level `simulate`.
5. Module-wide `npm run lint` in Backend is **already red on main** (~216 pre-existing errors in
   files this work didn't touch). Don't chase it; keep your own files clean.
