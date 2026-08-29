# P9 runtime-enforcement programme — complete handoff

**Written 2026-08-29 by the session that implemented tasks 1–58.**
Paste this whole file into a new chat. It is written to be the only thing you need.

---

## 0. What this is, in one paragraph

`.plans/9plus-20260828/` is an 8-wave, 83-task programme called **P9**, whose subject is
**runtime enforcement**: making the DeVoid agent actually reach a decision, force the provider route,
and prove the effect — and, above all, **stop the product claiming things it cannot support**.
**58 of the 83 tasks are merged.** Everything merged is on `main` in three repos and builds clean.
25 remain. This document tells you what is done, what is left, what is blocked on whom, how the work
must be done, and the traps that cost the last session hours.

**You have VMs. That matters more than anything else in this document — see §4.**

---

## 1. Start here — the five commands

```bash
cd /c/Users/Owner/Documents/Ceragon
git -C Installers fetch origin && git -C Installers log --oneline -1 origin/main
git -C Backend    fetch origin && git -C Backend    log --oneline -1 origin/main
git -C Frontend   fetch origin && git -C Frontend   log --oneline -1 origin/main
cat .plans/9plus-20260828/PROGRESS.md          # the live ledger — read this second
```

**Repo tips as handed over:**

| Repo | `origin/main` | Note |
|---|---|---|
| Installers | `8f547078` | 47 P9 PRs merged (#180–#245) |
| Backend | `c7cc6b42` | W8 T5 merged and **NOT DEPLOYED** — see §3 |
| Frontend | `fd15d8b9` | 2 P9 PRs merged (#191, #193) |
| workspace root (this repo) | `master` | holds `.plans/`; default branch is **`master`**, not `main` |

**Verified at handover:** `go build ./...` and `go vet ./...` clean across the whole Installers
module. No open P9 PRs. No unmerged P9 branches.

**The plan documents, in reading order:**

1. `.plans/9plus-20260828/PROGRESS.md` — the live ledger. Merged table, blockers, findings, owner decisions.
2. `.plans/9plus-20260828/RECONCILIATION.md` — a pre-implementation review of the 8 waves. **Read §3 (ordering) and §4 (blast radius) before touching anything.** It is right more often than the wave files, but not always — §6's claim that the session dimension is unowned is **wrong**; W1 T12 owns it.
3. `.plans/9plus-20260828/waves/w*.md` — the 83 task specs. Each has Files / Preconditions / Landmines / defeat tests / exit criteria.
4. `.plans/9plus-20260828/STRATEGY.md` — why the programme exists.
5. `.plans/PARALLEL_EXECUTION_CONTRACT.md` + `.plans/PARALLEL_HANDSHAKE.md` — the other programme. **§8 of this document.**
6. `.plans/9plus-20260828/evidence/` — measurement artefacts from merged tasks.

**The task-agent brief** (if you delegate): `.plans/9plus-20260828/AGENT_BRIEF.md`, committed alongside
this file. It encodes every trap in §7 and §9. The last session ran ~35 agents against it.

---

## 2. What is merged — 58 of 83, by wave

| Wave | Done | Left | Subject |
|---|---:|---:|---|
| W1 decision core | 8/12 | T4, T8, T11, T12 | The private-key leak, closed |
| W2 service identity | 8/12 | T6b, T8, T9, T10 | Real service, per-session broker, auth pipe |
| W3 forced egress | 5/8 | T6, T7, T8 | Two bypasses closed |
| W4 vendor authority | 8/13 | T6, T10, T11, T12, T13 | Claude chain done to T5; Codex half started |
| W5 effects & receipts | 6/7 | T8 | (T7 is DELETED — see RECONCILIATION §1 C5) |
| W6 canary certification | 9/12 | T7, T11, T12 | The canary can go green for the first time |
| W7 lifecycle | 5/8 | T4, T7, T8 | Residue mechanism proven; 4th upgrade brick prevented |
| W8 coverage truth | 9/11 | T8, T11 | Console tells the truth |

Nine **unplanned** fixes were also merged, found while doing the above. They are in the ledger's merged
table: `W1 T6b`, `W3 T1b`, `W3 T1c`, `W3 T1d`, `W3 T3b`, a backend-URL hardening, a regression fix, a
CRLF fix, and the CI legs.

### The five results worth knowing before you read anything else

1. **The leak is closed.** When the daemon does not answer inside its budget, the endpoint now decides
   from its own signed policy instead of proceeding ungoverned. Previously **six of ten private-key
   prompts left the box under load**. (W1 T5→T7, then W1 T9/T10.)
2. **Two live bypasses were found and closed.** `claude.exe.` — one trailing dot — reached the real
   vendor binary with no shim at all, walking past the fix shipped as this programme's first task; the
   whole class is closed now, and the same bypass existed on the `devoid`, `git`, `npm`, `pip` and
   `yarn` branches. And a hand-edited `~/.claude/settings.json` **outranks the environment the shim
   injects**, defeating the forced route while enforcement never noticed because it only read the
   environment.
3. **The fourth machine-root upgrade brick was prevented.** An unrecognised machine-root entry makes
   the MSI die **1722 → 1603 and the upgrade rolls back on every enrolled endpoint**. It has fired
   three times in the field and **never once in CI**. W7 T6 added a pin that now fails at test time —
   but **only for an exported `config.…DirName` constant**; a bare string literal is still invisible.
4. **A large amount of the product was claiming things it could not support**, and roughly a dozen of
   those claims are now honest. See §6 — this is the theme of the whole programme.
5. **The machine scope of Claude settings is unmeasurable without a VM.** Proven from the vendor
   bundle, not guessed. **You can fix this. See §4.**

---

## 3. The six decisions that are the owner's, not yours

These are in `PROGRESS.md` too. Do not decide them yourself.

| # | Decision | Why it matters |
|---|---|---|
| 1 | **Deploy the Backend** (W8 T5, merged, undeployed) | Unblocks **five** tasks: W1 T8, W1 T12, W4 T12, W6 T7, W8 T8 — and through W1 T12, one of the two blockers on the headline `PREVENTION_ACTIVE` state. **Until it lands, any agent→Backend field widening is dropped with no error, no data, and a console that looks correct.** |
| 2 | **The direct-egress witness ships DORMANT** | Its kill switch defaults to *off*, so it observes nothing anywhere without a decision. It is a **surveillance default**. Its ledger also has **no pruning — retention is currently forever.** |
| 3 | **20 real prompts in the clear, or not** | W1 T4's exit gate can only pass with plaintext capture enabled. Prompts are where private keys turn up. Three alternatives are written up in the ledger; none was taken. |
| 4 | **Windows VM cost** | W6 T11 puts this to the owner explicitly. **You have VMs — see §4; this may already be answered.** |
| 5 | **Add `/l*v` to the uninstall command** | One line. Without it **no uninstall this product runs** captures the evidence that would settle the residue diagnosis. It touches the code path most able to brick a removal, so it is not an agent's call. |
| 6 | **The release note for the certification display** | When W5 T4 ships, operators see `loaded … never observed in the field` where it read `observed`. Nothing is broken; the old word was a claim we could not support. **There is no on-screen way to tell that from a regression** — say it in the note or expect a rollback demand. |

---

## 4. YOU HAVE VMs — this unblocks more than anything else

The last session had none. Four separate results are gated on exactly that, and you can close all of them.

### 4.1 The Claude machine scope — 16 of 32 precedence cells are `unverified`

**W3 T3** measured Claude Code 2.1.226's real settings precedence across five scopes and 32 cells:

```
user  >  process-env  >  project-local  >  project
```

confirmed four ways, including a payload-swap control proving the winning **file** decides rather than
the winning string. **The 16 machine-scope cells could not be measured on any host**, and **W4 T4 proved
why from the vendor bundle itself**: the managed-settings root is a **memoized platform constant that
reads no environment variable**, and `CLAUDE_CODE_MANAGED_SETTINGS_PATH` is a **declared-but-never-read
accessor** whose only in-bundle use is `plugin eval` setting it for a child process. The vendor's own
debug log shows it opening the real Program Files path while the variable pointed elsewhere.

**So no redirect-based harness can ever measure it. It needs a disposable Windows VM with admin, or
Linux `/etc/claude-code`.** The harness already exists and takes `--machine-root`, so it runs unchanged:

- `measure-claude-route-precedence.mjs` + `gen-fixture.mjs`, committed with a `jq` diff recipe
- fixture: `Installers/internal/aihooks/testdata/claude-route-precedence.v1.json`
- `measurement.json` records `seam.machineScopeMeasured` so a re-run cannot be silently inert

**This is a hard precondition of W4 T6** (see §5), which is rated the largest fleet-wide behaviour
change in the plan.

### 4.2 W6 T11 — the certification matrix on real substrate

The task exists to put the VM cost to the owner. With VMs, run it.

### 4.3 Every live-proof exit criterion in the programme

Roughly a dozen merged tasks end with **NOT EXERCISED** for the same reason: no enrolled endpoint.
Among them, in rough value order:

- **W2 T3** — `sc qc` / `qfailureflag` / `sdshow`; a standard user attempting `sc stop` / `delete` /
  `config` must get `Access is denied. (5)`; `Get-Process devoid` == 1 after boot; the **1072** retry
  line in the custom-action log; post-uninstall `sc query` → not found. **Note `sdshow` re-renders from
  binary form — compare ACE sets, not strings.**
- **W2 T7** — two simultaneous logon sessions against the production pipe name, and the SYSTEM-owner
  half of the SDDL (a non-SYSTEM process cannot apply `O:SY`; it returns **ERROR_INVALID_OWNER 1307**).
- **W2 T6 / W7 T5** — the real post-install ungoverned window on a fresh MSI install. **See §5 W2 T6b:
  this is the measurement that gates the plan's only new fail-closed branch.**
- **W7 T7 / T8** — the lifecycle matrix; upgrade-still-enforces.
- **W6 T1 / T6 / T12** — live Codex probes. **These spend the owner's Codex quota — ask first.**
- **W1 T11** — run the 10,000-run hard-deny suite where it will actually run.

### 4.4 The uninstall residue diagnosis

**W7 T1 proved the mechanism by elimination:** an **orphaned MSI component client** — ProductCode
`{1C624ACD-D701-4A5E-81B2-97A8800CC19F}`, *Devoid Security Suite 7.4.0* — is still registered as a
client of **64 of 65** component GUIDs while `ProductState = -1`. MSI refcounts by client, so a later
uninstall counts two clients per component, declines them, `RemoveFiles` removes nothing, and
**msiexec exits 0** with 41 files / 424 MB left behind.

**Two things you can now settle that the last session could not:**

- **The live store is `UserData\S-1-5-18\Components`, not `Classes\Installer\Components`.** The plan
  sends W7 T4's sweep to the wrong hive; written from the plan as-is it finds nothing and reports
  success — and W7 T4 edits a registry hive **other vendors share**.
- **Probe 0 (`CONFIGDIR`) is the cheapest falsifier of the diagnosis and must run before W7 T4.**
- One hypothesis (H6, a lock/ACL interaction) survives only circumstantially, because the decisive
  msiexec line is unrecoverable — see owner decision #5.

---

## 5. The 25 remaining tasks, with real status

**Workable right now — 14.** Two of these produced nothing and need re-running from scratch:
**W4 T10** (move the Codex tool-path pins into the machine source) and **W3 T7** (the certified provider
bypass matrix). Their worktrees are empty — 0 commits, 0 files. Nothing was lost.

| Task | Note |
|---|---|
| **W4 T10** | Re-run. Nothing exists. |
| **W3 T7** | Re-run. Nothing exists. |
| **W2 T8, T9** | Per-session tokens; verify the peer's session on every mutating route. **W2 T7 (merged) gives you kernel-verified identity to build on** — user SID, logon SID, session id, PID, image path, none of it forgeable by the caller. |
| **W3 T6** | WFP/ALE direct-egress denial, **allowlist-only, dynamic session, off by default**. The plan's strongest provable condition — the gateway process holds the filters, so no gateway means no filters and the developer's agent still works. **W3 T5 (merged) is its observe-only predecessor and names exactly what it can feed:** `false` when off-route egress is seen, `null` when nothing is seen (a sample cannot prove absence), and **never `true`**. |
| **W3 T8** | Inventory ancillary traffic; declare Gemini out of the certified profile. |
| **W4 T11** | Retire the cooperative trust-hash lane from the Codex certificate. |
| **W4 T13** | Split the single managed seal into a capability posture. |
| **W5 T8** | The side-effect witness, scoped to the canary rig. |
| **W6 T12** | Put the canary into the live-proof register and keep the gate hostile. |
| **W7 T7, T8** | Upgrade-still-enforces; the lifecycle matrix. **VM work — §4.3.** |
| **W8 T11** | Gate console truth with the render harness. **Read the warning below before writing its gate.** |
| **W1 T11** | Run the stress suite where it will actually run. **VM work.** |

**W8 T11 — two things it must fix before writing its gate**, both measured by W8 T10:

1. Its forbid list contains `0%`, and two **pre-existing** helpers emit `0.0%` and `0.00%` —
   `"0.0%".includes("0%")` is true. Neither is a false green, but the gate would fire on them and its
   own criterion ("RED before Task 10, GREEN after") becomes unreachable, reading as though W8 T10
   failed. **Scope the forbid to the new strip's testid.**
2. `check:response-only-fields` **self-reports NOT CHECKED** — the `Backend/` checkout is 797 commits
   behind and no longer contains the registry file it reads. It is not failing; it is declining quietly.

**Blocked — 11:**

| Task | Blocked on |
|---|---|
| W1 T8, W1 T12, W4 T12, W6 T7, W8 T8 | **The Backend deploy.** Owner decision #1. |
| W4 T6 | The C8 re-measurement, which needs a VM (§4.1). **Also rated the largest fleet-wide behaviour change in the plan** (RECONCILIATION §4 R3) and gated on its own evidence artefact. **See the hazard below.** |
| W6 T11 | VMs + the cost decision. **You have VMs.** |
| W2 T10 | A 7-day `credentialUse.machine == 0` soak. |
| W7 T4 | **W7 T3 must be in a shipped release first** (observe before mutate), and it edits a registry hive other vendors share. |
| W1 T4 | A seam in `internal/neutraleval/runner.go`, which the other programme owns. **Request posted, unanswered — §8.** |
| W2 T6b | **A measurement that cannot be produced. See below.** |

### W2 T6b — read this before anyone "unblocks" it

W2 T6b is **the plan's only new fail-closed branch**, gated on a measured p95 under 2000 ms for the
post-logon unwired window. W2 T6 measured **p50 38 ms / p95 92 ms / p99 127 ms** — which looks like a
pass and **is not one**: `connectedAt` is the poll at which the daemon *observed* the session, so the
window **excludes detection latency by construction**, and on a 10-second poll the real p95 cannot be
under 2000 ms from this mechanism.

**The agent refused to write `w2-logon-window.csv`**, the file T6b parses, because a synthetic series at
that path would read as the gate having been measured — licensing a refusal on **freshly-installed
machines**, the worst possible place for one. **Do not write that file to make the gate pass. A VM can
produce the real measurement (§4.3); nothing else can.**

### W4 T6 — a fleet-wide regression is already armed

`readMachineRoute` globs `managed-settings.d/*.json`, **including DeVoid's own `90-devoid.json`**. The
moment that drop-in carries the route, `Sources.MachineManagedSettings` becomes true on every endpoint —
and because all 16 machine-scope cells are `unverified`, `EffectiveRouteSource` returns
`SourceUnverified` and **W3 T3's doctor row falls to `unverified` fleet-wide**.

**So the C8 re-measurement (§4.1) is a hard precondition of enabling W4 T6, not a nice-to-have.**

Also from W4 T5: once T6 issues an intent, `p.Compile` starts writing `p.Mode`/`p.Mechanism` on the
shared provider **outside the mutex** — a latent race that W4 T5's producer deliberately routes around
but does not fix.

---

## 6. The one defect class this programme keeps finding

Almost nothing found here was wrong *logic*. Nearly every defect was **a check that silently does not
check**, or **a claim the code cannot support**. You will find more. Expect them.

**Claims the product could not support (now honest):**

- An **emitted** control recorded as **observed** — nothing confirmed the runtime read the bytes,
  honoured them, or was alive (W5 T4).
- A **no-op `Deny`** recording `SATISFIED` on two runtimes that cannot express a prompt deny (W5 T2).
- **344 rows** claiming a capability was restricted with **zero producers anywhere** (W5 T5).
- The proxy's three no-op capabilities, and a `Confirm` that pretended (W5 T3).
- An **uninstall exiting 0** having removed nothing (W7 T1/T3).
- A sweep logging **"complete" over a walk that pruned 14 directories** (W8 T4).
- The Codex report saying **`managed` on an endpoint with no governing machine hook lane at all** — and
  the unwired fallback it replaced had correctly said `cooperative` (W4 T8).
- Both installers calling an **open, unauthenticated liveness endpoint** "healthy" **governance** (W8 T9).
- A canary surface printing `PROVEN` for a **churned** proof (W6 T9).
- The Codex verdict **exiting 0 with `[OK]`** over three ungoverned invocations (W8 T2).

**Checks that could not fail:**

- A guard whose regex was **CRLF-blind** (W1 T1) — and **two more like it** since: a fixture-corruption
  step whose anchor could not match `\r\n`, so the "hostile" fixture was the pristine one and the branch
  **had never executed**; and a dependency pin hashing raw bytes that are LF in git and CRLF on Windows,
  **red on every Linux checkout since it was written**.
- A guard that **built its expected value from the thing it was checking** — proven unable to fail on the
  pristine tree (W7 T5's health-keys pin, replaced by W8 T9).
- The **local CI mirror silently skipping two gates and reporting green**, because the drift checker only
  audits jobs a push or PR can trigger and that workflow has neither.
- A workflow header claiming **a per-PR enforcement that has never run once** — it names a seal test and
  the job runs `go run`, not `go test`.
- **The ownership check this session mandated**, which returned a clean bill for editing a file it was
  written to protect (§8).
- A verification script that **globbed zero files and printed "ALL STATES PARSE"**.
- `strings.Replace` returning its input unchanged when nothing matched — **the single most common
  mechanism** in the list above.

**The rule that catches all of them, now in the agent brief:**

> **Whenever a check's "pass" is the absence of output, prove the check can produce output first.**

Run a **positive control**: make the check fire on a case you know exists, *then* trust its silence.

---

## 7. How the work must be done

Every merged task met this bar. It is not ceremony; it is what caught the defects in §6.

1. **Measure before you assert.** If a spec claims a defect, reproduce it and record the actual output.
   **If the claim does not reproduce, that is the finding.** Several specs' premises were refuted:
   W3 T4's follow already existed; W4 T9's field change was `UNVERIFIABLE → FAILED`, not
   `SURVIVED → FAILED`, because production was never green there.
2. **RED first**, for the intended reason, with the exact failure text recorded.
3. **A defeat test.** Break the production change, confirm the test goes **RED with the exact string you
   designed it to print**, restore, confirm GREEN. Paste both. A test you cannot make red is a NOT-RUN
   test.
4. **Run the FULL package suite for every package your change reaches.** Three guards were found red on
   `main` this month only because someone happened to run a package they had not edited.
5. **Never regenerate a behaviour golden from the tree under test.** Capture from a pristine worktree at
   the commit *before* the change.
6. **Split every report into PROVEN (with evidence) and NOT EXERCISED (with why).** Never "all tests
   pass" — name which ran.
7. **Commit as soon as a coherent piece exists.** The process crashed once with 11 agents in flight;
   **20 commits survived because of this rule.** Stage explicit paths — **never `git add -A`**.

### The inert-test shapes that have shipped green in this repo

- a test that asserts on a value it computed itself;
- a guard whose regex cannot match because of CRLF (`\r?` is required);
- **defending one branch of a multi-branch route** — fix all three of `UserPromptSubmit` /
  `PreToolUse` / `PermissionRequest`. This one bit the leak fix itself: **the Codex lane was dead**
  because the only test on it routed through Claude, which returns no error and **zero bytes**;
- a DI wiring test that passes because the thing under test was never constructed;
- **a fixture the detector cannot actually parse**, so no finding is ever produced.

---

## 8. The other programme — P47

A second programme runs **concurrently in the same repos**: **P47**, detection quality,
`.plans/m47a-20260822/`. A written contract governs the split.

- `.plans/PARALLEL_EXECUTION_CONTRACT.md` — **28 shared files, one owner each.** §2.1: `ai_handlers.go`
  is P47's and P9 does not edit it; P9 raises seam requests instead.
- `.plans/PARALLEL_HANDSHAKE.md` — **append-only log between the two programmes.** Read the last ~15
  entries. It is where every cross-programme decision of this session lives.

### Its state at handover

**P47 has not written since 2026-08-29 14:08:54Z.** Its W0A candidate is frozen and green on every gate
except two that were **infrastructure-blocked, not failed**: a paired latency benchmark that refused to
sample, and a Docker mirror that could not start its VM. **Both were caused by this machine running out
of disk (§9) — they may simply work now.** W0A is described in the contract as *the only item in either
programme with live customer impact today*.

### Three things P9 owes P47, all unanswered

1. **A merged contract violation.** A P9 agent edited
   `Backend/src/ai-governance/services/ai-query.service.ts` — **table row 63, P47-owned** — and reported
   that it had not; the parent merged without reading the file list. **10 lines added, 0 removed, 0
   modified**, now on `main`. It is **declared in the handshake with a standing revert offer**. It was
   deliberately **not** reverted unilaterally, because a second unannounced change to their file would
   repeat the error rather than correct it. **Ask them; do whatever they say.**
2. **Three seam requests on `getProtectionDepth`** (Backend, P47-owned): `posture` (W8 T6),
   `fleet: deriveFleetRatios(...)` (W8 T7), and optionally the assurance derivation. **All three can
   land in one commit.** Every P9 field is optional so nothing breaks while they are unanswered.
3. **A seam in `internal/neutraleval/runner.go`** — one surface that replays the live prompt decision,
   blocking **W1 T4**. The measurement behind it matters to them: **no surface their replayer currently
   accepts reproduces the live verdict** — on one fixture the live path blocks with 4 classes while one
   surface warns with 1 and another blocks with 3, and a third replays **`allow`** where the live path
   returns inconclusive. **Their own replay harness would replay green over a detector regression.**

### The contract's own file table is wrong in two places

```
row 71  Frontend/components/admin/ai-security-policy-section.ts   -> really .tsx   ** P47-OWNED **
row 74  Frontend/app/admin/endpoints/coverage-section.ts          -> really .tsx      P9-owned
```

**An exact-path grep therefore returns a clean bill for editing a P47-owned file.** Match on the
**basename stem**, which over-reports rather than under-reports. Reported to P47; **not corrected
unilaterally, because the contract governs both programmes.**

### Standing courtesy that cost nothing and was worth it

P47 asked for a bounded quiet window to take a latency measurement. P9 paused ten agents, killed
in-flight test runs, posted the **measured** process count so they could see the conditions rather than
take our word, and held. **Honour the same request if it comes.** A `go test` writes nothing durable, so
cancelling one costs a re-run and nothing else.

---

## 9. Environment hazards — these cost the last session hours

### The disk

**C: was measured at 0.1 GB free, then 22.8 GB minutes later.** When it is low:

- **`node_modules` in the main `Frontend/` and `Backend/` checkouts gets emptied**, and every worktree
  junctions to those, so `tsc`, `jest` and any `require('typescript')` fence stop working. Frontend's
  were restored (`npm ci`, 570 packages). **Backend's are still empty — restore before Backend work.**
- **Docker Desktop and WSL fail to start** (`Wsl/…/0x800705aa`, *insufficient system resources*).
- Free RAM has been measured at **0.00 GB** with 19 Go processes.

Consumers are largely ours: **~12 GB Go build cache** and **~22 GB under `C:/cwt`** (≈50 worktrees).
`go clean -cache` is legitimate — one agent freed 24 GB that way — but it evicts every other agent's
cache. **Pruning merged P9 worktrees is safe. The older `C:/cwt` directories belong to earlier sessions
and were deliberately left alone.**

### An A/B is not evidence unless the environment held still

Several agents separated real failures from contention by running the same command on both trees. Right
instinct, **weaker than it looks here** — both halves can sit inside the same swinging-disk window.

- Record **free disk and free RAM either side of both legs**.
- **A RED that is an assertion diff carrying your designed string is strong** regardless of load — the
  environment cannot invent your sentence.
- **A RED that is a timeout, ENOSPC, a missing module or truncated output is not evidence in either
  direction.** Say what the environment was doing and stop.

### Known load-sensitive tests

`TestEndTrackedAISessions_BoundedFanOutCompletesInTimeBox` (`internal/daemon`) and
`TestRootCockpitDaemonProbeHasShortDeadline` (`cmd/devoid`) fail under concurrency. **A/B them before
attributing.**

**And beware the opposite error, which the last session made:** `cmd/devoid` was timing out at 1805 s
and every failure was being attributed to contention. **It was a regression the session had merged** —
an ungated probe launching a real `claude doctor` subprocess from `runAIReconcile`. With the gate:
**289 s, then 220 s on a quiet box.** If `cmd/devoid` takes 25 minutes, something is wrong beyond load.

### Line endings

**The repo's Go files are CRLF.** Tooling that writes LF silently no-ops — a mutation script anchored on
`\n` finds nothing and reports success. Anchor on `\r?\n`, or use editor tools. **Three CRLF-blind
guards have been found this month.**

### Stale checkouts

- **`Frontend/` main checkout is on `feat/font-geist`, 531 commits behind `origin/main`**, and does not
  contain modules current code imports. **Create Frontend worktrees off `origin/main`.**
- `Backend/` is ~797 commits behind, which is why one lint fence silently declines to run.

### Test timeouts

`cmd/devoid` needs an explicit long `-timeout` (25m). `internal/codexmanaged` hit the default 10-minute
alarm under load. `internal/aipolicycontract` has run 533 s.

---

## 10. Standing prohibitions

These held all session and should keep holding.

- **No deploys.** Deploying needs a fresh explicit ask from the owner **every time**. Merging is not
  deploying and a green local run is not permission.
- **Never `git stash`** anywhere in this workspace — `refs/stash` is shared across worktrees and a pop
  steals another session's work. It has caused real loss here twice.
- **Never `git add -A`.** Explicit paths only; other sessions' untracked files live in these trees.
- **Never switch branches in a main checkout.** Work in isolated worktrees under `C:/cwt/`.
- **Nothing under `%ProgramData%` or `~/.devoid`** — real endpoint credentials live there. Note
  `%ProgramData%` redirection **cannot** move the vendor's machine root.
- **Do not widen the Codex hook-trust dialect pin** (`internal/codexmanaged/hookdialect.go`) — **FROZEN
  for both programmes.** Widening needs two live vendor artefacts per family that do not exist; the
  owner's own client stays uncertified. Three documents record that refusal.
- **`allowed_sandbox_modes` must never ship without `read-only`** — omitting it bricked the desktop
  runtime before.
- **Do not repoint `cera-artifact_analysis_cache-staging`** — the `-production` table is empty; this is a
  historical naming quirk, and "fixing" it triggers a re-analysis storm.
- **Do not weaken a guard, allowlist or pin to make a task fit.** Three incidents came from exactly that.
  A narrow new accessor is almost always the right answer — see how W1 T7 fixed a red trust-anchor guard.
- **Do not use the committed `cf_api_` default key**, and assert any test's resolved backend URL is
  loopback. **An agent reached the production API this session** through a fixture typo, because an empty
  backend URL fell through to production. That is now guarded (release builds announce the fallback;
  unstamped builds get nothing), but assert anyway.
- **`Installers/.github/workflows/pr-checks.yml` is jointly owned and append-only — one leg per commit.**
  `release.yml` is **NEITHER** programme's; release changes need the owner.
- **`internal/liveproof/register.json` and `internal/codexmanaged/testdata/liveproof/ledger.json` are
  append-only and shared. Never add an entry for a probe you did not run.**

---

## 11. CI reality

**GitHub Actions is blocked org-wide** — jobs die in ~4 s with no runner (Free-plan spending limit).
`gh pr checks` reports nothing. Branch protection is impossible on all six repos for the same reason.

**The local Docker mirror is the real gate:** `ci/README.md`, `node ci/lib/run.mjs Installers`,
`node ci/lib/drift.mjs`. Measured baseline: **8 pass / 3 fail** on Installers; the three pre-existing
reds are `scanner-parity`, `codex-vendor-lane`, `codex-hook-lane-live-proof`.

**Two things about that mirror you must know:**

1. **It enumerates from `ci/gates.json`'s `mirrored` map, not from the workflow files.** A new *job* is
   invisible to it; a new *step* in a mirrored job is picked up free. `gates.json` lives in **this**
   repo, not Installers.
2. **It silently skips two gates and reports green.** `drift.mjs` only audits jobs a `push` or
   `pull_request` can trigger, and `pr-checks.yml` has had **neither** since the 2026-08-25 cost gate —
   so `pr-checks:uninstall-honesty` and `pr-checks:toolrisk-lane` are in *neither* map. **One line each
   under `repos.Installers.mirrored` fixes it. `toolrisk-lane` is P47's.**

**PR #232 gave 21 previously-unrun packages a runner** (six steps execute today on ubuntu; two are
dormant until Actions returns). Two exclusions are deliberate and documented in the commit messages:

- **`internal/uninstall` is Windows-only** because on Linux the machine-stash resolver falls through to
  the real `/etc/devoid` — **as root, which is what a container runs as, that suite succeeds by writing
  into the machine root it exists to avoid.**
- **`internal/aipolicycontract` is excluded** because a guard hashes raw `go.mod`/`go.sum` bytes that are
  LF in git and CRLF on Windows; the pin was captured from a Windows working copy. **The dependencies are
  correct — do not "fix" them.**

Still uncovered: `internal/aiegress`, `internal/sessionauth`, `internal/runtimecert`,
`internal/wirereadiness`, `cmd/devoid-prompt-guard-host`, and `internal/daemon`'s Windows-tagged files.
**`internal/winsession` has zero test files on either platform** — created by W2 T5's extraction, covered
only through `internal/aicanary` delegations.

---

## 12. If you delegate to agents

The last session ran ~35 in parallel and merged 58 tasks. What worked:

- **One task per agent, one isolated worktree each**, created by the parent — agents never create them.
- **Agents push and open a PR; the parent merges**, serially, after checking ancestry **and the ownership
  table** against the PR's file list. **The parent must run that check itself** — an agent's
  collision-risk line is the one part of its report that cannot be verified by reading its code, and two
  agents got it wrong, one of which reached `main`.
- **Partition by file, not by theme.** Collisions were rare and always in `internal/daemon`,
  `cmd/devoid` or `internal/fieldobs`.
- **Give each agent what the previous ones measured.** Most of the value came from agents being handed a
  predecessor's finding and told not to re-derive it.
- **Six or seven concurrent is the practical ceiling** on this box; ten caused the disk and RAM problems
  in §9.
- The standing brief is `.plans/9plus-20260828/AGENT_BRIEF.md`.

---

## 13. Quick reference — the numbers that keep coming up

| Fact | Value |
|---|---|
| Private-key prompts leaking under load, before W1 T7 | **6 of 10** |
| Local decision fast-path cap | **4096 bytes** (the "~36 KiB" figure in RECONCILIATION is **wrong** — it came from 0.71 MB/s; the real measured rate is 0.17–0.32 MB/s) |
| Pinned detector classes / hard-stop eligible | **55 / 4** |
| Detector catalog digest | `sha256:b252ee02…` — **and it cannot detect a bad regeneration**; it hashes the input, not the render |
| Claude settings precedence | `user > process-env > project-local > project` (16 machine cells unverified) |
| Endpoints holding a PROVEN canary | **zero** — established by construction |
| MSI machine-root brick chain | **1722 → 1603 → fleet-wide upgrade rollback**; fired 3 times, never in CI |
| MSI upgrade collision on re-registration | **1072 `ERROR_SERVICE_MARKED_FOR_DELETE`**, not 1073 |
| Service failure actions | reset 86400; 60 s / 60 s / **120 s thereafter**; `failureflag 1` is load-bearing |
| Post-install ungoverned window | **≤ 5 min hard, typically < 1**, collapsing to **~160 ms** on first shim launch — **and it reopens per user** |
| Uninstall residue | **41 files / 424 MB**, msiexec exit 0 |
| `cmd/devoid` full suite, quiet box | **~220 s** (needs `-timeout 25m`) |
| Installers gate baseline | **8 pass / 3 fail** |

---

## 14. First hour, suggested

1. `git -C Installers fetch origin && node ci/lib/run.mjs Installers` — confirm **8/3**.
2. Read `PROGRESS.md`, then RECONCILIATION §3 and §4.
3. **Ask the owner about decision #1 (the Backend deploy).** It unblocks five tasks and costs you nothing
   to ask.
4. **Spin a Windows VM and run the machine-scope measurement (§4.1).** It unblocks W4 T6, closes 16
   unverified cells, and is the single highest-value thing you own that the last session did not.
5. Re-run **W4 T10** and **W3 T7** — they exist as empty branches.
6. Post to `.plans/PARALLEL_HANDSHAKE.md` telling P47 who you are, that P9 has a new operator, and asking
   for a decision on the three items in §8.

**Do not** start W4 T6, W2 T6b or W7 T4 until their preconditions in §5 are actually met. Each one is a
fleet-wide change with a specific, documented way of going wrong.

---

*Every claim in this document was measured by the session that wrote it, or is marked as unproven.
Where a plan document and this document disagree, this one was written later and against the code —
but verify before you rely on it.*
