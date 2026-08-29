# P9 — runtime enforcement: what is done, what is running, what is blocked

## READ THIS FIRST

**58 of the plan's 83 tasks merged, plus 9 unplanned fixes found on the way (68 merges total)**, across Installers and Backend, by ~15 parallel agents.
Installers `origin/main` and Backend `origin/main` both build and vet clean, and every package the
work touched is green together.

### The two tasks that produced nothing

`W4 T10` (move the Codex tool-path pins into the machine source) and `W3 T7` (the certified provider
bypass matrix) were launched and their agents stopped without committing anything. **Both worktrees are
empty — 0 commits, 0 uncommitted files.** Nothing was lost because nothing was written; they simply
need re-running. They are counted as NOT DONE below.

### Decisions only you can make

| # | Decision | Why it cannot wait on engineering |
|---|---|---|
| 1 | **Deploy the Backend** (W8 T5, merged, undeployed) | Unblocks **five** tasks (W1 T8, W1 T12, W4 T12, W8 T8, W6 T7) and, through W1 T12, one of the two blockers on the headline `PREVENTION_ACTIVE` state. Until it lands, any wire widening is dropped **with no error, no data, and a console that looks correct.** |
| 2 | **The direct-egress witness ships DORMANT** | Its kill switch defaults to *off*, so without your word it observes nothing anywhere. **It is a surveillance default.** Its ledger also has **no pruning — retention is currently forever.** |
| 3 | **20 real prompts in the clear, or not** | W1 T4's exit gate can only pass with plaintext capture enabled. Prompts are where private keys turn up. Three alternatives are written up; none was taken. |
| 4 | **A disposable Windows VM** | The Claude *machine* scope is **not measurable on any host** — proven from the vendor bundle, not guessed. 16 of 32 precedence cells stay `unverified` until a VM exists, and that re-measurement is a **hard precondition** of enabling Wave 4's last task. |
| 5 | **Add `/l*v` to the uninstall command** | One line. Without it **no uninstall this product runs** captures the evidence that would settle the residue diagnosis. It touches the code path most able to brick a removal, so it is your call, not an agent's. |
| 6 | **The release note for the certification display** | When W5 T4 ships, operators see `loaded … never observed in the field` where it read `observed`. Nothing is broken; the old word was a claim we could not support. **There is no on-screen way to tell that from a regression** — say it in the note or expect a rollback demand. |

### The three defects worth knowing about, all closed

- **`claude.exe.` reached the real agent ungoverned.** One trailing dot walked past the fix shipped as
  the programme's first task. The whole class is closed now — dots, spaces, path forms — and the same
  bypass existed on the `devoid`, `git`, `npm`, `pip` and `yarn` branches.
- **A user's own `~/.claude/settings.json` outranked the route the shim injects**, and enforcement
  never noticed because it only read the environment. Reproduced against the real vendor binary before
  being closed. The fix was **one comparison** — the value was already being read.
- **The local-decision fix I reported as "the leak, closed" was not closed on Codex.** It used the
  wrong effect for Codex's permission checkpoint, and the only test on that lane routed through Claude,
  which returns no error and zero bytes. Found by 8,960 deny operations, not by re-reading code.

### What I got wrong, recorded

- I merged a PR whose own report said a required suite had **not completed**. It was safe, but the
  sequencing was wrong and I had just written the rule I broke.
- That same merge put an **ungated vendor-subprocess spawn** on `main`, and I then spent hours telling
  agents their `cmd/devoid` timeouts were contention. **They were my regression** — 1805 s → 289 s with
  the gate as the only difference. Fixed in `0f172889`.
- I repeated the reconciliation's claim that the **session dimension is unowned**. Wave 1 Task 12 owns
  it outright; it is deploy-blocked, not orphaned.

---

Live ledger. Updated as tasks merge. Read `RECONCILIATION.md` §3 for the ordering rules
this schedule obeys and §6 for the phase map.

**Integration check at `ff6d4f43`:** `go build ./...` and `go vet ./...` clean across the whole
Installers module, and these suites green together: `localdecide`, `localsnapshot`, `airuntime` (+ both
adapters), `coveragetruth`, `proxy`, `uninstall`, `removalreport`, `aihooks`. The 36 merges from
~14 concurrent agents integrate.

**A crash, and what survived it.** The Claude Code process died with 11 agents mid-task. Nothing was
lost: 20 commits were already on disk across the worktrees because the standing brief requires
committing as soon as a coherent piece exists rather than at the end. Two worktrees held uncommitted
work only, and two were empty. All 11 agents were **resumed with their context intact** rather than
restarted, so their measurements and defeat-test evidence were not thrown away.

**Earlier integration check at `29acff6a`:** `go build ./...` and `go vet ./...` clean across the whole
Installers module — the 29 merges from 13 concurrent agents do not conflict at compile or vet level.

**Repo tips at last update:** Installers `origin/main` `b32410ac` · Backend `origin/main` `c0b533ef` (a coworker's PR #288 landed on Backend main; P9's W8 T5 `2aab1852` is confirmed
an ancestor of it, so nothing of ours was lost).

---

## Merged (68)

| Task | PR | Commit | What it did |
|---|---|---|---|
| W3 T1 | #180 | `bce84aa0` | Lowercase before stripping the extension — closed the `CLAUDE.EXE` one-shift-key dispatch bypass |
| W1 T1 | #181 | `e5cd0163` | Measured what a local decision costs; found the budget already spent |
| W1 T2 | #182 | `58cde0af` | Pinned the runtime-adapter vocabulary to the artifact instead of a copy of it |
| W6 T1 | #183 | `1bd9cecf` | Bounded child-process I/O grace per call site, so a real deny stopped reading as a host error |
| W6 T2 | #184 | `fe1cf3f2` | Assigned the two canary challenge ledgers nothing was assigning |
| W6 T3 | #185 | `c6fd49d9` | Populated the applied-bundle binding every sweep |
| W1 T5 | #186 | `bb77f421` | Read the durably committed signed policy without a daemon round trip |
| W1 T6 | #187 | `f81be7bf` | Extracted the decision core; routed the daemon through it |
| W1 T6b | #188 | `2f6562ff` | Isolated the decision golden from the detections programme's detectors |
| W1 T7 | #189 | `2dfe00b7` | **The leak, closed** — a budget expiry now answers from the endpoint's own signed policy |
| W1 T3 | #190 | `f5a45bca` | Projected the pinned spine's per-class budgets and defaults into the catalog — digest, class count and hard-stop count all unchanged |
| W6 T4 | #191 | `07a788d9` | Added the canary receipt-upload client method the sink needs |
| W7 T6 | #192 | `c50b5d44` | **The fourth upgrade brick, prevented** — a completeness pin that goes red the moment a machine-root writer is unknown to the MSI guard |
| W1 T9 | #195 | `8744c82d` | The four pinned hard-stop classes made pre-emptive and bounded at 4096 bytes, and unable to widen themselves. **Ships INERT — no caller until W1 T10 wires it, which is running now.** |
| W7 T1 | #197 | `da789cf8` | Named the uninstall-residue mechanism by elimination: an orphaned MSI component client from **7.4.0** still holds 64 of 65 component GUIDs, so a later uninstall counts two clients, declines them, removes nothing and exits 0 |
| W4 T1 | #199 | `a9b43519` | Made the Claude machine projection compilable — and refused the tempting fix of widening the digest regex to admit bare hex |
| W5 T1 | #198 | `10920f13` | One capability resolver derived from what the adapters declare; found four cells where the declaration and the real translation disagree |
| W8 T1 | #193 + BE #289 | `c817d9e9` | Froze the coverage-truth vocabulary — 6 states, 24 reasons — as one byte-identical artifact both runtimes read |
| W2 T1 | #196 | `edc1db07` | The reconciler can now see a missing restart-on-failure — **and the spec's one-branch fix was not enough**, see below |
| W3 T2 | #194 | `01c6342e` | The shim now cross-checks the invoked name against its own image — **and found `claude.exe.` still bypasses the shim entirely** |
| W6 T5 | #200 | `b5a32c19` | Wired the receipt sink into both providers. Production `Receipts` assignments went 0 → 2; the canary can go green for the first time |
| W8 T2 | #201 | `65838b91` | The Codex verdict and exit code now compose the undecided and vendor-discarded counts — a run with 3 undecided invocations no longer exits 0 saying `[OK]` |
| W5 T2 | #202 | `03ed1e5f` | The prompt checkpoint's no-op `Deny` now records `deny-not-expressible` instead of `SATISFIED`. First production caller of the capability resolver, so W5 T1 is no longer inert |
| W4 T2 | #205 | `a1ef376d` | Probed the two Claude tiers that outrank the file tier. Both rows now come back probed on a clean Windows box; unreadable/unparseable/unknown all resolve to UNPROBED, never to "absent" |
| W8 T4 | #206 | `84aa3b7b` | The AI-inventory sweep can no longer log "complete" over a truncated walk. Completeness is now derived from an empty reason list, not asserted by a flag |
| W3 T1b | #203 | `6fdff3c9` | **Closed the trailing-dot dispatch bypass** and the whole class around it |
| W7 T3 | #204 | `39016a9c` | An incomplete removal can no longer report as a clean one — the verdict is recomputed from the observations, with no verdict field and no setter — **without ever blocking removal** |
| W3 T1c | #207 | `29acff6a` | An MCP runner spelled `node.exe.` no longer evades interpreter classification — which means the gate hashes the script again instead of losing it |
| W2 T2 | #208 | `25215e10` | `devoid-daemon.exe` has an SCM service mode that is **dormant until registered** — proved three independent ways, against the real binaries |
| W3 T3 | #209 | `14efb797` | Measured the Claude route's real precedence across five scopes and 32 cells — and **found a user-writable bypass**, below |
| W6 T8 | #210 | `8b8329ce` | Proof freshness cut from 24 h to 15 min. A no-op today; a fleet-wide revocation if it had shipped after W6 T5 |
| Hardening | #214 | `c30b041d` | A credentials file that yields no backend URL no longer resolves to **production**. Split by build stamp: a stamped release keeps production but announces it; every unstamped build gets nothing |
| W6 T6 | #215 | `af13f917` | The live Codex canary test can now drive the machine lane, built through the same exported projection the production host uses. **The live-proof ledger was deliberately NOT amended** — it still reads `UNFIRED 2 2 ['user','user']` |
| W7 T2 | #216 | (in `ff6d4f43`) | Gave the residue probe a machine-payload stage — **the gate that decides whether a console uninstall may deregister an endpoint was blind to it**, and would have reported 40 residue files as zero |
| W5 T3 | #211 | `ff6d4f43` | The proxy's three no-op capabilities stopped claiming success, and `Confirm` is honestly nil rather than pretending |
| W3 T1d | #218 | (in `b7c0c135`) | **A path-form interpreter hashed the interpreter, not the script** — `node.exe ./evil.js` content-addressed node.exe. Also: the allow-once key carried no server name, so releasing one path-form server released all |
| W4 T3 | #213 | `657aed6b` | Made the managed-source question answerable from `claude doctor` — and established that `claude status` **does not exist** non-interactively, so the winner stays an inference and the code now says so |
| W2 T5 | #217 | `1587cdb6` | Extracted the de-elevated per-session launcher into `internal/winsession`, proven identical by replaying the permitted renames against `origin/main` |
| W8 T6 | BE #292 | `c0b533ef` | The Prevention Active state machine, derived server-side and additively, over all 128 gate combinations |
| W5 T4 | #212 | `5a323998` | Stopped the field-observation ledger calling an **EMITTED** record *observed* — nothing in the old gate confirmed the runtime read the bytes, honoured them, or was even alive |
| W3 T3b | #220 | `2f7b9b47` | **The user-scope route override is now visible.** The value was already read and then never compared to DeVoid's route |
| W7 T5 | #222 | `e78ed484` | The post-install ungoverned window is reported instead of hidden — a machine-scope install exits 0 with **nothing wired in any user's context**; first shim launch closes it, measured at **6.53 s** |
| W8 T3 | #219 | `feba0eb5` | Route **traffic** and route **decisions** are now separate facts. The status line asserted decisions and called it traffic; a zero and a null are now different claims |
| W6 T9 | #223 | (in `e5d20ca9`) | The canary surfaces read real evidence instead of a constant — a churned proof printed `PROVEN`; it now leads with the churn and demotes the recorded outcome beneath it |
| W1 T10 | #226 | `e5d20ca9` | Wired `HardStop` (W1 T9 was inert) and ran the hard-deny stress suite — **and found two live defects in W1 T7**, below |
| W4 T3 fix | #230 | `0f172889` | **Regression fix to a PR merged tonight** — the Claude host probe had no daemon gate, so `runAIReconcile` launched a real `claude doctor` subprocess with nothing listening |
| CRLF fix | #231 | `b32410ac` | The second red from #213 — a fixture-corruption step that silently no-opped on CRLF, so a test asserting the parser fails safe had **never exercised that path at all**. It does now, and the parser is fine |
| W5 T6 | BE #296 | `79e93039` | The E0-E3 effect-assurance ladder, derived server-side — **E2 is structurally unreachable, not merely unpopulated**. Frontend half HELD on a seam request |
| W2 T3 | #228 | (merged) | `devoid-daemon` registered as a real service with failure actions and a hardened DACL. Upgrade collision is **1072, not 1073** — unhandled it would have silently failed to register on every upgraded endpoint |
| W4 T4 | #227 | (merged) | Pinned the Claude transport route in the machine source — **and caught that leaving the health probe nil would have failed every Claude compile fleet-wide**, once per sweep per endpoint |
| CI legs | #232 | `58636f8b`+ | Gave a runner to **21 packages no job reached at all**, in 8 commits, one leg each. The Linux run caught two packages green on Windows and red on Linux |
| W5 T5 | #234 | (merged) | The 344 RESTRICT_CAPABILITY rows got a real executor — they had **zero producers**; the lane was filing them as `audit-only` |
| W3 T5 | #233 | `60b89f64` | The direct-egress witness — observe only, never enforce. Appended to the ledger schema **without a version bump**, because a bump makes every fleet ledger read EMPTY |
| W4 T7 | #235 | `9139131f` | Measured `allowManagedPermissionRulesOnly` and **did not write it** — one artefact kind of two. **The gate is asymmetric: it zeroes allow-rules but NOT deny-rules** |
| W8 T7 | BE #295 | `c7cc6b42` | Every fleet percentage now has a numerator, a denominator and a freshness window — and two of them honestly read `null`, not zero |
| W3 T4 | #236 | `a485de9e` | `CODEX_HOME` — **the spec's premise was refuted**: the follow already existed; the bound and the witness were missing. A relative value writes the managed config into the developer's own working directory |
| W2 T11 | #237 | (merged) | A token-unreadable endpoint was **byte-for-byte a healthy one off-box** — 40 token-less 401s produced zero events anywhere. Now 2 events, once per cause, with the flood bound printed |
| W4 T5 | #238 | `014127fa` | Wired the Claude machine and proof seams — reading the durable target record rather than the live provider, to avoid widening an existing unsynchronised window |
| W4 T8 | #239 | (merged) | The Codex report claimed `managed` **on an endpoint with no governing machine hook lane at all** — and the unwired fallback it replaced had said `cooperative`. Now `managed` only when the machine hook lane governs |
| W5 T6 | FE #191 | `f0415be7` | The assurance ladder reaches the console, declared in a P9-owned module rather than the other programme's file |
| W8 T9 | #241 | `a35c6a69` | The daemon composes its own posture from reasons, and both installers stopped reporting an open liveness endpoint as **"healthy"** governance |
| W2 T6 | #240 | `943f002f` | The per-session broker — **writes nothing to the machine root**, proven by grep and by a defeat test that prints the 1722 -> 1603 brick. **Did NOT write the measurement file that gates W2 T6b** |
| W2 T4 | #242 | (merged) | External recovery proven through seams: **10/10 cycles recovered, 0 user actions, worst 30 s against a 90 s budget**, asserted as arithmetic over the shipped interval |
| W6 T10 | #243 | `513713e6` | The per-digest capability certificate. **All four real digests read `UNVERIFIED`** — a certificate issued today can honestly certify nothing, and the package asserts that |
| W4 T9 | #244 | `30a07301` | A diverging higher-precedence Codex requirement now removes green — **and the real field change is `UNVERIFIABLE` → `FAILED`, not `SURVIVED` → `FAILED`: production was never green here** |
| W2 T7 | #245 | `8f547078` | Per-session auth pipe with a kernel-verified peer. **The message schema has no identity field at all** — a caller cannot assert who it is. Wrong-principal refusal tested **live and unelevated** |
| W8 T10 | FE #193 | `fd15d8b9` | Per-host x per-surface posture in the console. **No `%` rendered anywhere** — `n / d` plus a window — and every reason tagged so a product fact reads differently from a real gap |
| W8 T5 | Backend | `2aab1852` | Field-level agent-wire loss counter. **MERGED, NOT DEPLOYED — owner-gated.** |

---

### The user-scope bypass, reproduced at the vendor level before it was closed

W3 T3b re-ran the precedence harness against claude-code 2.1.226 on a fresh port with a throwaway
profile and five loopback sentinels. Cell 5 is the bypass, observed rather than argued:

```
cell  1 [process]              winner=process
cell  4 [user]                 winner=user
cell  5 [process,user]         winner=user      <-- the bypass
cell  9 [process,project]      winner=process
cell 17 [process,projectlocal] winner=process
```

With the shim's `ANTHROPIC_BASE_URL` in the environment **and** a foreign route in the user's own
`~/.claude/settings.json`, the binary connected to the **user file's** endpoint. Cells 9 and 17 confirm
`user` is the only *verified* scope that outranks the environment.

The fix was **one comparison** — the shim already read that file and never compared the value — so
there is zero new I/O on the launch path and no routing change. The real `~/.claude/settings.json` was
never read or written: sha256 and mtime both unchanged, stated in the report.

## TWO DEFECTS IN W1 T7 — the task reported as "the leak, closed" — found and fixed by W1 T10

W1 T7 (#189) was reported, by me, as closing the ungoverned-proceed leak on all three checkpoints.
**On Codex it was not closed.** W1 T10 (#226) found both defects by driving 8,960 deny operations
through both adapters rather than by re-reading the code.

**1. The Codex escalation lane was dead.** The local decider answered a `PermissionRequest` with the
`deny-tool` effect. Codex replies *"effect not supported at this checkpoint"* and refuses; the effect
it accepts there is `deny-escalation`, which produces 116 bytes of native deny. **It was invisible
because the only test on that lane routes through Claude**, which returns no error and **zero bytes**
for the same call — inert-test shape 3, in the middle of the fix that was supposed to close the leak.

**2. The derived reason slug defeated its own counter.** W1 T7 derived
`daemon-unreachable-no-local-snapshot` from the daemon-unreachable slug so it would stay in that
bucket. But `UngovernedOrDecided` matches **exactly** while `UndecidableBucketFor` matches by
**prefix** — so declined checkpoints fell through into `decided`, putting every ungoverned proceed
back into the governed denominator. That is defect **F18 reintroduced by the field added to prevent
it**.

Both fixed in #226, each with a defeat test that names the lane.

**What the stress suite then measured:** 8,960 deny operations plus 8,960 benign twins, 16 of 18
modes, both adapters, five lanes — **0 silent allows, 0 false blocks**. Non-grantability is proven
rather than asserted: a signed policy of `{"private-key":"allow"}` yields verdict `allow` with no
reasons, and the hard stop still refuses. Putting the hard stop *in front of* the unusable-snapshot
gate turned W1 T7's July-2026 brick guard red — recorded as a finding, and the ordering kept.

### The environment, and why several nights' symptoms were one cause

**This machine's C: drive was measured at 0.1 GB free, then 22.8 GB minutes later.** That single fact
explains a set of failures each of us had been diagnosing separately:

- the parallel programme's **Docker/WSL failure** (`Wsl/.../0x800705aa`, *insufficient system resources*)
  — not a broken mirror;
- **`node_modules` emptied in both `Frontend/` and `Backend/`**, blocking two agents, because every
  worktree junctions to those directories — not a rogue install;
- an agent measuring **0.00 GB free RAM** with 19 Go processes;
- probably some of the wall-clock test failures several agents carefully A/B-ed all night.

Consumers are largely ours: **12.6 GB of Go build cache** and **21.9 GB under `C:/cwt`** (~40 P9
worktrees plus dozens from earlier sessions). Frontend dependencies have been restored (570 packages,
`npm ci` clean); **Backend's are still empty**. The Go cache was deliberately **not** cleared while
agents were mid-suite — that would force every one of them to rebuild and worsen the contention it was
meant to relieve.

**Pruning the merged P9 worktrees is safe and would free most of that 21.9 GB. The older `C:/cwt`
directories belong to earlier sessions and were left alone.**

### Two things W8 T11 must fix before it writes its gate

**1. Its forbid list would fire on pre-existing code and read as though Task 10 failed.** The list
contains `0%`, and two helpers that predate all of this emit `0.0%` and `0.00%` — and
`"0.0%".includes("0%")` is true. Neither is a false green. But the gate's own criterion is *"RED before
Task 10, GREEN after"*, and it can never go green, which would be read as the render task having
failed. **Scope the forbid to the new strip's testid.**

**2. A fence in that repo cannot do its job anywhere in this workspace.**
`check:response-only-fields` **self-reports NOT CHECKED** — the `Backend/` checkout is 797 commits
behind and no longer contains the registry file it reads. It is not failing; it is declining, quietly.

### The safeguard I mandated had the defect it was written to prevent

Every agent was told to grep the ownership table before declaring a clean collision-risk section. An
agent checking whether it could touch its **own** file noticed the grep came back clean for the wrong
reason. Measured against Frontend `origin/main`:

| contract row | file on disk |
|---|---|
| row 71 `…/ai-security-policy-section.ts` — **P47-owned** | `…/ai-security-policy-section.**tsx**` |
| row 74 `…/coverage-section.ts` — P9-owned | `…/coverage-section.**tsx**` |

**An exact-path grep therefore returns a clean bill for editing a P47-owned file** — in the repo where
P9 had already had to revert one such edit. The check now matches on the **basename stem**, which
over-reports rather than under-reports. The table errors were reported to P47 rather than corrected
unilaterally, since the contract governs both programmes.

**Also worth knowing: the main `Frontend/` checkout is on `feat/font-geist`, 531 commits behind
`origin/main`**, and does not contain modules current code imports. Frontend worktrees must be created
off `origin/main`.

### A guard I merged tonight was tautological, and another task proved it

W7 T5 (#222) added `TestHealthOpenBody_ExactlyLivenessKeys` to pin the open health endpoint's key set,
and I reported it as a constraint protecting that surface. **It cannot fail.**

W8 T9 proved it on the **pristine** `origin/main` with its own files removed: adding a sixth key to
both the key list and the body left the test **PASSING**, because it builds its expected set from the
very list it is checking. Its sibling missed it too — a case difference in the name it looked for.

That is inert-test shape 1 — *a test that asserts on a value it computed itself* — the first entry on
the list every agent is handed. It shipped anyway, in a task whose subject was honesty about state,
and I merged it. The replacement pins a **literal** five-key list.

**Still open, reported and not fixed:** `devoid ai posture` parses a key off the open body that the
body is forbidden to contain, so it prints **"Evidence chain: FAIL" on every real endpoint** while its
own test stays green against a fixture the daemon cannot emit. Outside that task's file list; a
follow-up is filed.

### A process mistake of mine, recorded

I merged PR #218 while its agent's report explicitly said the `cmd/devoid` suite had **NOT COMPLETED**.
The suite then finished with 11 failures. The agent measured all 11 afterwards and they are contention,
not the change — the same 11 tests pass **by name, on the same commit, unloaded, in 5.7 s**, against a
**1502.7 s** loaded run where CI records the package at 284.7 s. It also showed the changed code is
unreachable from five of the six failing files. **So the merge is safe**, but the sequencing was wrong:
a report that names an incomplete suite is not a merge-ready report, and I should have waited.

## Blocked, and on what

### On the owner (a deploy, an ask, or money)

| Task | Blocked on |
|---|---|
| W1 T8 | Backend deploy of W8 T5 (ordering rule O1 — without it the widening drops silently) |
| W4 T12 | Same (O2) |
| W8 T8 | Same (O3) |
| W6 T7 | Same (O4) — and this one 400s loudly rather than dropping silently |
| W6 T1 EXIT 2 | Six live Codex probes on a real host; owner's Codex quota |
| W6 T11 | Windows VMs, and a cost decision put to the owner. macOS needs Apple hardware |
| W2 T6b | **A measurement that cannot be produced.** Its gate is a p95 under 2000 ms for the post-logon unwired window. W2 T6 measured p50 38 ms / p95 92 ms / p99 127 ms — but `connectedAt` is the poll at which the daemon *observed* the session, so the window **excludes detection latency by construction**, and on a 10-second poll the real p95 cannot be under 2000 ms from this mechanism. The agent **refused to write the synthetic CSV** the gate parses. T6b is the plan's only new fail-closed branch; it stays blocked rather than being licensed by a number that does not mean what it says. |
| W2 T10 | A 7-day `credentialUse.machine == 0` soak before the machine-token narrowing |
| Branch protection | GitHub Free plan — six repos return 403 |

| W1 T4 | A seam in `internal/neutraleval/runner.go`, which P47 owns. Seam request posted to the handshake. **Also needs an owner decision** — see below. |

## OPEN — a user-writable file defeats the forced route, and enforcement cannot see it

W3 T3 measured Claude Code 2.1.226's real settings precedence across five scopes and 32 cells, and
established one total order:

```
user  >  process-env  >  project-local  >  project
```

`user > process-env` was confirmed four ways — the isolating cell, every cell where both are present,
a second run on a second port, and a payload-swap control proving the winning **file** decides rather
than the winning string.

**The consequence: a hand-edited `~/.claude/settings.json` defeats the shim's route injection, and
`enforceManagedTransportRoute` never fires, because it scans only the environment.** No privilege
needed — the file is in the user's own profile. That is the exact property Wave 3 exists to
establish, inverted.

A task is open (`p9/w3-t3b-user-scope-route-override`) scoped to **detect and report** rather than
refuse — a refusal on a condition we have only just learned to observe is how endpoints got bricked in
July 2026 — and to reuse W3 T3's precedence model rather than build a second one.

**The wave's own §2 is wrong** where it says project scope sits above user scope. It does not.

### The machine scope could not be measured here, and it is the one about to become authoritative

16 of the 32 cells are `unverified`. `CLAUDE_CODE_MANAGED_SETTINGS_PATH` is declared and exported but
**never read** in this build; the root is a memoized constant. Every route to measuring it is closed
on this box: the file write needs admin *and* would be this endpoint's real policy; the registry
paths are forbidden and are a different source tier; there is no disposable Windows rig, and the local
Docker is Linux-only. **A throwaway Windows rig with admin measures all 16 unchanged** — the harness
takes `--machine-root` precisely so the re-run is not silently inert.

This matters because Wave 4 is making the machine source authoritative, and W4 T4 requires this matrix
to be re-measured afterwards.

### Fixed in passing: every endpoint has been publishing a failure it cannot avoid

The doctor's AI section funnelled every row through a two-outcome check, so **every `unverified` row
was scored and published as an endpoint failure** — including `Codex machine baseline`, which is
unverified fleet-wide by construction and can never be anything else.

### A wider MCP gap, found while closing a narrow one — task open

**A path-form interpreter hashes the interpreter, not the script.**
`command: "C:\…
ode.exe", args: ["./evil.js"]` content-addresses **node.exe** — which settles clean
forever, because it is a legitimate interpreter everyone has — and **never hashes `evil.js`**.

This is worse in one respect than the trailing-dot gap it was found beside: there, the server was
merely unidentified. Here the gate reports a **confident, permanently-clean identity for the wrong
file**. Pre-existing and reportedly by design, which is why the open task
(`p9/w3-t1d-mcp-interpreter-hashing`) is scoped to establish the design intent first and then choose
between changing what is hashed and making the claim honest — not to assume.

Why it matters: losing the script's digest moves a settled-malicious local server off
`StatusBlocked` (an unconditional block) into the not-yet-judged family — held under enforce,
**allowed under monitor or unset**.

### Two owner decisions the uninstall work surfaced

**1. No uninstall this product runs captures the evidence that would settle the residue diagnosis.**
`uninstallCommandForProduct` runs `msiexec /x <code> /qn /norestart` with **no `/l*v`**. W7 T1's
decisive line — `Disallowing uninstallation of component` — is therefore written by nothing. Adding a
log path is **one line**, and W7 T3's agent deliberately did not add it: it changes msiexec's argv on
the code path most able to brick a removal, and a customer who cannot uninstall has no escape hatch.
**Worth doing, but it is your call, not an agent's.**

**2. The existing residue probe collapses "could not determine" into "removed" in three places**, all
feeding `executeRemoteUninstall`. That is the same false-green shape Wave 7 exists to remove, but the
blast radius is fleet-wide remote uninstall, so it was left alone rather than fixed in passing.

### A correction to the W5 T4 release-pairing rationale — it does NOT fully hold

The reconciliation says W5 T4 must ship with W6 T1–T5 "or every endpoint's certification display drops
`observed` → `loaded` with nothing able to restore it." W5 T4's agent traced what W6 actually restores
and **the second half is wrong**.

`foldCanaryEvidence` returns unchanged unless the adapter is Codex, and it lifts the **report-level**
state to `enforcement-tested` — **not** the per-checkpoint rows W5 T4 changes. So W6 puts a
legitimately-earned strong rung back on the **Codex managed attestation**; it does **not** back-fill
the Claude `USER_PROMPT_SUBMIT` row.

**Only a `RUNTIME_ACKNOWLEDGED` producer will, and none exists — deliberately.**

**Consequence for the release note, which must be written before this ships:** an operator opening
`devoid ai certify claude-code` will see

```
USER_PROMPT_SUBMIT   loaded   effect=deny-prompt   never observed in the field
```

where it read `observed` yesterday. Nothing is broken and nothing stopped enforcing — the old word was
a claim we could not support. But there is **no on-screen way to tell that from a regression**, so the
rational operator response is to demand a rollback of a change working exactly as designed. **Say it
in the release note or expect the rollback request.**

### The same over-claim exists in four more places, by a different mechanism

W5 T4's third exit criterion — every non-test `CertObserved` gated on `RUNTIME_ACKNOWLEDGED` — **cannot
be met as written.** Four hits are **prober-derived, not ledger-derived**: `claudecode/probe.go:107`,
`codex/probe.go:72`, `codex/detect.go:190` and `:237`. The Codex certify prober only checks that
Codex's *own* translated bytes **would** enforce — no Codex runtime is in the loop at all.

Same family of over-claim, different mechanism, in files that task's own file list excludes. **Flagged,
not fixed.** It wants its own task.

### The post-install ungoverned window is not install-only — it reopens per user

W7 T5 measured it, and the most important line is one the spec does not say: **the readiness stamp is
per-user, so every user's first session on an already-installed box reopens the window.** It is not a
one-time install artefact.

Measured bounds: **≤ 5 minutes hard, typically under 1, collapsing to ~160 ms once any governed tool
runs** (158.98 ms uncontended, 6.53 s under load, monotonic clock). Registration uses
`schtasks /Create /F /XML` with **no `/Run`**, so nothing kicks the task at install; the closers are the
first shim invocation (immediate), the logon trigger (60 s) and the time trigger (≤ 300 s).

Inside the window the PATH shims and the package-install gate **do** work — they are machine-scope and
present at install. What does not work is AI-runtime governance: no vendor hooks, no asserted route.

Two more spec corrections: **there is no `devoid status` command** at all, so that task's exit criterion
would fail today for that reason alone — readiness was surfaced on `devoid ai status` instead. And
`install.ps1` **already** closes the window; it belongs to the **MSI path** and the no-user-profile
branch.

Structural guarantees worth keeping: the readiness package has **no writers at all**, nothing gates on
it, machine scope **can never return READY**, and the verdict is derived at serialisation with no
setter — the same pattern W7 T3 used.

### More owner decisions, from the direct-egress witness (W3 T5)

**1. It ships DORMANT on every endpoint as specified.** The kill switch is the network-enforcement
mode, and the default policy returned for every missing policy file is `off`. So without a decision
from you, the witness observes nothing anywhere and the fleet report is a page of zeroes. That is
pinned by two tests rather than left to be discovered. **It is a surveillance default and it is yours
to set.**

**2. The ledger has no pruning — retention is currently forever.** Flagged as an open question rather
than silently chosen. What it records cannot contain credentials or hostnames by construction, and
other applications' rows are discarded to an aggregate count.

**3. The certified image-path set does not exist.** Nothing in the product certifies a runtime binary
today — the Backend's own `runtimeBinaryCertified` is `null` and says so. The witness therefore
reports `unavailable` rather than a clean zero, which is the honest output.

**What it can and cannot see, measured live:** one sample read **848 TCP rows and 112 UDP rows**.
**QUIC/HTTP-3 is invisible** — the UDP table carries no remote address at all — so those 112 rows are
counted separately and the TCP number reads as a floor, not a total. It also cannot prove the peer was
the provider, so the honest phrase is *off-route egress by a certified runtime*.

**What it can feed the posture seam:** `false` (measured: not denied) when off-route egress is seen;
`null` when nothing is seen, because a sample cannot prove absence; and **never `true`**, because
`true` means *denied* and nothing here denies.

### The second red on main: a CRLF no-op, diagnosed without running anything

`TestParseDoctorReportIsUnobservedOnAnythingItCannotRead/unknown_line_in_section`. Root cause, found by
reading during the perf window:

The fixture is committed **LF**, `core.autocrlf=true`, and **no `.gitattributes` rule covers that
testdata path** — so the working-tree copy is **CRLF**. The test builds its hostile variant with
`strings.Replace(capture, "Invalid settings\n", …)`, and that anchor **cannot match `\r\n`**.
`strings.Replace` returns its input unchanged when nothing matches, so the "hostile" fixture is the
pristine, perfectly valid capture — the parser correctly returns `ok=true`, and the assertion for
`ok=false` fails.

**The parser was never wrong. The test never fed it the input it claimed to.** So the one case designed
to prove the parser fails safe on something genuinely unknown **has never been exercised.**

It passed for the author because the file was created by a shell redirect (LF) and git had not yet
re-materialised it — `git add` even warned that LF would become CRLF next time git touched the file.

**A second latent instance of the same bug sits in the same file**: another test cuts a section on
`"\n\n"`, which does not appear in CRLF text at all, so the cut silently misses and the section runs to
end-of-file. It passes only by luck.

The fix normalises the fixture to LF at read time **and** adds a `mustReplace` helper that fails when
its anchor is absent — because the defect class, not the instance, is *a test whose precondition
silently skips the assertion*.

### An owner decision W1 T4 surfaced, which is not a deploy

W1 T4's exit gate is "replay 20 captured decisions and get the same verdict". The replayer recomputes
the input digest from the stored plaintext and **refuses any entry that does not carry it**. So the
gate can only pass with `DEVOID_AI_CAPTURE_PLAINTEXT=1` — meaning **20 real prompts stored in the
clear on disk**, and prompts are exactly where private keys and credentials turn up.

The agent stopped rather than set the flag. Options, none taken: reduce the gate to fixtures we
authored; make the replayer verify against a digest without holding the plaintext; or accept the
plaintext corpus under a stated retention rule. **This is the owner's call.**

Two errors in W1 T4's own spec were also proved, and matter to whoever picks it up: the capture point
it names is *post-floor*, and the replayer reproduces no floors, so a decision captured there is not
replayable at all — the replayable unit is `localdecide.ScanAndDecide`. And no surface the replayer
currently accepts reproduces the live verdict: on one fixture the live path blocks with 4 classes
while `dlp` warns with 1 and `promptrisk` blocks with 3.

### On things engineering cannot reach

- **Codex 9.3** — permission profiles and the `elevated` sandbox need two vendor artefacts per key we do not have.
- **Codex dialect past 0.144/0.147** — vendor artefacts. The owner's own client stays uncertified. The pin is FROZEN for both programmes.
- **Bypass matrix cell 3 (copied binary)** — WDAC through an MDM the customer may not have.
- **Production authority chain** — every live-proof artefact in all eight waves is a local-rig measurement. **No wave owns this**, and it is a required clause of two scorecard rows.

### A correction: the session dimension is NOT unowned

`RECONCILIATION.md` §6 lists the session dimension as owned by no wave, and I repeated that. **It is
wrong.** `w1_decision_core.md` Task 12 owns it outright and says so in its own opening note: Wave 1
owns the producer and the wire field, Wave 8 Task 6 owns retiring the `session-dimension-unavailable`
reason once it lands.

That matters because the session dimension is **one of the two things blocking `PREVENTION_ACTIVE`**
(the other being WFP direct-egress denial, W3 T6). So it is not an orphan — it is **deploy-blocked**:
W1 T12's own preconditions require W8 T5 merged **and deployed**, and instruct that this be verified
against the image actually serving production rather than taken on anyone's word, because a wrong
answer there is silent.

**Net effect: the Backend deploy unblocks more than previously recorded** — W1 T8, W1 T12, W4 T12,
W8 T8 and W6 T7, and through W1 T12 it is a prerequisite for one of the two `PREVENTION_ACTIVE`
blockers.

---

## AN INCIDENT, AND TWO COVERAGE HOLES FOUND WHILE FIXING SOMETHING ELSE

### A test reached production. Nothing was stored.

While building W8 T4's evidence, an agent wrote a temp credentials file using the JSON key
`backendUrl` where the code reads `apiBaseUrl`. The backend URL came back **empty**, and
`normalizeBackendURL` **substituted the production endpoint**. Two AI-inventory records were sent at
production, **rejected 401 on key format, nothing stored.** The committed test has no network path.

The agent reported it prominently and unprompted, which is why it is written down here rather than
found later.

**It was not one bad fixture. The hardening task found the same shape already in the tree:**
`cmd/devoid/ai_trust_mint_test.go:63` carries the identical `backendUrl` typo, and about ten more
fixtures seed `{"apiKey":"k"}` with no `apiBaseUrl` at all — **12 `config.Load()` calls across 7
`cmd/devoid` tests were resolving to the production URL.** None of them made a request, so nothing
left the box from those; the incident above is what happens when one of them does. A pre-existing
test, `TestEmptyBackendFallsBackToProduction`, had pinned the footgun as *intended behaviour*.

**Fixed (#214), split by build stamp rather than by a hard error.** A hard error from `Load()` was
rejected as the fleet-brick shape: it runs on every command, and refusing would brick any endpoint
the installer wrote with an empty `BACKEND_URL`. So a **stamped release** still falls back to
production but now says so, and every **unstamped build** — which is every `go test` and every dev
rig — gets an empty URL and no fallback. First-run with no credentials file never reaches the
function and is untouched.

**The underlying footgun is a real product defect: an empty or unreadable backend URL falls through to
production rather than to an error.** One wrong key in a fixture is enough, and nothing warns. A
hardening task is open on it (`p9/hardening-empty-backend-url`), scoped to keep the *absent-file*
default working — that is the fleet's normal path — while refusing to treat a file that exists but
yields no usable URL as "no configuration".

Every agent brief now requires asserting the resolved URL is loopback before any test that could make
a request.

### A junctioned home directory reports a clean sweep of zero items

Measured: `through junction: records=0 unreadable=0 depthPruned=0 complete=true`. Both callers pass
`roots=[$HOME]`, so an endpoint whose profile is a junction logs a perfectly clean AI-inventory sweep
that looked at nothing. Not fixed by W8 T4 — out of its scope, and filed.

The walker also collapses access-denied, path-too-long, vanished and I/O errors into a single counter
and discards the errno, so an operator cannot tell which of those happened.

---

## CLOSED — the `claude.exe.` bypass, and the class it belonged to

Measured live on this box, then closed by #203. The bypass was:

```
image=…\CLAUDE.EXE.   argv0=claude.exe.   ->   2.1.226 (Claude Code)
```

W3 T1 had closed the `CLAUDE.EXE` spelling by lowercasing before the extension strip. A trailing dot
walked past it, because `"claude.exe."` matches none of `.exe/.cmd/.bat` while Win32 discards the dot
when it opens the file. One character, no privilege.

**The fix folds Win32-insignificant tail characters before the extension strip and again after each
one** — the second pass is what catches `claude..exe` — and it is **Windows-only**, because on POSIX
`claude.exe.` is a legal, different file and folding it there would launch the real agent when the
caller asked for something else.

Closed, each proven by driving `CreateProcessW` directly rather than through PowerShell (which refuses
several of these spellings and would have hidden them): `claude.exe.`, `..`, `. `, ` .`, trailing
space, `CLAUDE.EXE.`, `claude.EXE.`, `claude.`, `claude `, `claude..exe`, and every path form
including forward-slash and UNC. **The same bypass existed on the `devoid`, `git`, `npm`, `pip` and
`yarn` branches** and is closed there too.

**Deliberately left open, with reasons:** `claude.exe::$DATA`, a leading space, a trailing tab or
non-breaking space. None is Win32-insignificant — each denotes a different file or none, and
`CreateProcessW` returns `ERROR_INVALID_NAME` for the ADS spelling as an image path, so the miss ends
in a failed launch rather than an ungoverned agent. All three still log
`verdict=mismatch-agent-shim-missed` under W3 T2's cross-check.

**Still open, a smaller one:** `internal/inventory/mcp`'s `trimExeSuffix` has the same shape and *is*
reachable — a `.mcp.json` runner spelled `node.exe.` evades interpreter classification. That is
coverage evasion, not an execution bypass. A task is open (`p9/w3-t1c-mcp-runner-normalisation`).
`internal/aiagent`'s `normalizeBinName` has the identical shape but is unreachable; its one production
caller passes an already-folded name.

---

## A finding that changes a later task before anyone writes it

**W7 Task 4's registry sweep is aimed at the wrong hive and would be a no-op.** The plan sends it to
`Classes\Installer\Components`, which on this machine holds two subkeys and **none of DeVoid's**.
The live store is `UserData\S-1-5-18\Components`. W7 T1 measured this while proving the residue
mechanism. Anyone writing T4 from the plan as it stands would ship a sweep that finds nothing and
reports success — and T4 is the task that edits a registry hive shared with other vendors.

**Before T4 runs at all, Probe 0 (`CONFIGDIR`) is the cheapest falsifier** of the diagnosis and must
go first. One hypothesis (H6, a lock/ACL interaction) survived only circumstantially and is flagged
as such; the decisive `since another client exists` log line is unrecoverable, because the uninstall
ran `/qn` with no logging policy and the box was rebooted the next day.

---

## Ordering rules being obeyed

1. **W8 T5 is the first Backend change of the programme** — ahead of W1 T8, W4 T12, W8 T8. Done (merged).
2. **W7 T6 before W2 T6/T8.** Done (#192), but read what it actually did: it did **not** add
   `sessions` to the allowlist. It added a completeness pin that goes RED the moment any code declares
   a machine-root child the MSI guard does not recognise. Wave 2 still has to add `sessions` to
   `boundaryChildNames` **and** `inspectRootEntries` in the same commit — the pin now forces that
   instead of letting it reach the field, where it is 1722 → 1603 → a fleet-wide upgrade rollback.
   **Caveat that Wave 2 must obey:** the pin only sees an *exported* `config.…DirName` constant. A
   bare `"sessions"` literal in a path is invisible to it and would still brick the fleet.
3. **W6 T1 → T2 → T3 → T4 → T5.** T1-T3 done.
4. **W6 T8 only after W6 T5 is deployed** — before that it revokes nothing; after, it is a fleet-wide revocation.
5. **W1 T1 → T7 → T9**, and **W1 T6 → T7 → T9**. T1, T6, T7 done.
6. **W4 T1→T2→T3→T4→T5, T6 last** — each is inert without its predecessor.
7. **W7 T1 (diagnose) before W7 T4 (mutate the registry)**; **W7 T3 (observe) in a release before W7 T4.**
8. **W2 T6's measured p95 < 2000 ms before W2 T6b** — the gate that makes the plan's only new
   fail-closed branch legitimate.
9. **W5 T4 must ship in the same release as W6 T1-T5**, or every endpoint's certification display
   drops `observed` → `loaded` with nothing able to restore it.

---

## Parallel-programme state

P47 (detection quality) is running concurrently against the same repos.
`.plans/PARALLEL_EXECUTION_CONTRACT.md` owns the 28-file split; `.plans/PARALLEL_HANDSHAKE.md`
is the log.

**Resolved 2026-08-28T20:28Z:** P47 granted W1 T3's field projection — P9 may project the
already-pinned spine's `classes[].budgets` and `classes[].defaults`, provided
`DetectorCatalogDigest` stays `sha256:b252ee02…`, `classCount` stays 55 and
`hardStopEligibleClassCount` stays 4. That unblocked W1 T3, T4 and T9.
