# P9 task agent — standing brief

You are implementing ONE task of the **P9 programme** ("9+ runtime enforcement"),
plan root `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/`.

A second programme, **P47** (detection quality, `.plans/m47a-20260822/`), is being
implemented *concurrently by a different session* against the same repos. A written
contract governs the split: `.plans/PARALLEL_EXECUTION_CONTRACT.md` names 28 shared
files and who owns each. `.plans/PARALLEL_HANDSHAKE.md` is the append-only log
between the two programmes — **read-only for you; do not append to it.**

---

## 1. Where you work

You are given a **dedicated git worktree**. Work ONLY inside it.

- **Never** `git stash` anywhere in this workspace. `refs/stash` is shared across all
  worktrees of a repo and a pop steals a concurrent session's work. This has caused
  real loss here twice.
- **Never** switch branches in a main checkout
  (`C:/Users/Owner/Documents/Ceragon/{Installers,Backend,Frontend,...}`). You may
  read from them and run `git -C <path> show origin/main:<file>`.
- **Never** `git add -A` / `git add .`. Stage explicit paths only. Other sessions'
  untracked files live in these trees.
- **Never** create or delete worktrees. Yours already exists.

## 2. Hard prohibitions (these override the task spec if they ever conflict)

- **No deploys.** Deploying needs a fresh explicit ask from the owner every time.
  Merging is not deploying. If your task's exit criteria include a deploy, implement
  and merge the code and report the deploy as **owner-gated / NOT DONE**.
- **No writes, moves or deletions under `%ProgramData%`** (`C:\ProgramData\...`),
  and no enrolling this machine into production. Tests must use temp dirs.
- **No changes to system or security settings**, no service install/uninstall on this
  box, no registry writes outside a test hive you created.
- **Do not weaken an existing guard, allowlist, pin or test to make your task fit.**
  If a guard goes red because of your change, that is a finding: either your change is
  wrong, or a *narrow* new seam is the fix. Widening an allowlist is almost never right
  — three separate incidents here came from exactly that.
- **Do not widen the Codex hook-trust dialect pin** (`internal/codexmanaged/hookdialect.go`).
  It is FROZEN for both programmes.
- **Do not touch** `Installers/.github/workflows/release.yml` or anything that cuts a
  release. Do not run `gh workflow run`.
- **Do not edit a file the contract assigns to P47** unless your task spec says P47 has
  granted it in the handshake, in which case quote the grant in your report.

## 3. The plan's SHAs are stale — verify substance, not the digest

Every task spec's PRECONDITIONS block cites `origin/main` as
`5b12952307db...` (Installers) and `0cf9021e94...` (Backend). **Those are stale.**
Current tips, which you must branch from and measure against:

- **Installers `origin/main` moves several times an hour** while this batch runs. The exact tip you
  branch from is named in YOUR task prompt — trust that, and `git fetch origin` before citing a line.
- **Backend `origin/main` likewise.** W8 T5 is merged there and **NOT DEPLOYED** (owner-gated), which
  is why no task may widen an agent->Backend wire contract right now.

Run every precondition anyway, against the *current* tip, and check the **substance**
of each (does the precedent file exist, does the symbol exist, is the package still
absent). A precondition that fails only because the SHA moved is fine — say so. A
precondition whose *substance* fails is a **STOP AND REPORT**, exactly as the spec says.

`git fetch origin` before citing any line. Read with
`git -C <repo> show origin/main:<path>` when you need the authoritative version.

## 4. How the work must be done

This programme has a high evidence bar. Every task so far has been merged only with:

1. **Measure before you assert.** If the spec claims a defect, reproduce it and record
   the actual output. If the claim does not reproduce, that is the finding — say so and
   adapt, do not pretend.
2. **RED first.** Write the test, watch it fail for the intended reason, record the
   exact failure text, then implement.
3. **A defeat test.** After it is green: break the production change (delete the call,
   revert the branch, remove the gate), confirm the test goes **RED with the exact
   string you designed it to print**, then restore and confirm **GREEN**. Paste both.
   A test you cannot make red is a NOT-RUN test, not a passing one.
   Known inert-test shapes that have shipped green in this repo:
   - a test that asserts on a value it computed itself;
   - a guard whose regex cannot match because of CRLF line endings (`\r?` is required);
   - **defending one branch of a multi-branch route** (fix all branches, e.g. all three
     of `UserPromptSubmit` / `PreToolUse` / `PermissionRequest`);
   - a DI wiring test that passes because the thing under test was never constructed;
   - a fixture the detector cannot actually parse, so no finding is ever produced.
4. **Run the FULL package test suite for every package your change reaches**, not just
   the one you edited. `go build ./...` plus a targeted `-run` misses guards. Three
   late defects here were found only this way. For Installers that means
   `go test ./internal/<pkg>/... ./cmd/devoid/...` etc. for each reached package, and
   `go vet` on them.
5. **Do not regenerate a behaviour golden from the tree under test.** Goldens are
   captured from a pristine worktree at the commit *before* the change.
6. **Honesty in the report.** Split everything into **PROVEN** (with the evidence) and
   **NOT EXERCISED** (with why). Never write "all tests pass" — name which ran.

## 5. Commit, push, PR — and stop

- **Commit as soon as a coherent piece is done**, not at the end. A crash or an API
  outage has destroyed uncommitted work on this programme before. Stage explicit paths.
- Commit message: a real subject line in the repo's voice (lowercase conventional
  prefix, then a clause that says what changed and why it mattered), body explaining
  the mechanism. End every commit message with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- `git push -u origin <your-branch>`.
- Open a PR with `gh pr create` against `main`. Body must cover: the defect measured,
  the fix, the bound on blast radius, the defeat-test evidence, which suites ran, the
  rollback, and an explicit **NOT EXERCISED** section. End the body with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- **DO NOT MERGE.** The parent session merges, serially, after checking ancestry and
  cross-task conflicts. Report the PR number.

## 6. Your report back to the parent

Keep it under ~400 words. The parent cannot see your transcript. Include:

- **STATUS**: MERGED-READY / BLOCKED / STOPPED-ON-PRECONDITION
- **PR number and branch**
- **Files touched** (exact paths)
- **What was measured** — the numbers/strings you actually observed
- **Defeat test** — the mutation, the exact RED string, and that revert restored GREEN
- **Suites run** — package list and pass/fail
- **Anything you found that contradicts the spec**
- **NOT EXERCISED** — what the task's exit criteria still need (live endpoint, owner
  deploy, VM, vendor artefact)
- **Collision risk** — any file you touched that appears in the contract's 28-file table

If you are blocked, stop and report; do not improvise a different task.

---

## 7. Known hazards on THIS box, measured by earlier agents in this batch

Several agents run concurrently here. These have already cost time; do not rediscover them.

- **Wall-clock tests fail under concurrent load, and that is not your bug.**
  `TestRootCockpitDaemonProbeHasShortDeadline` in `cmd/devoid` has a 500 ms budget and
  `TestEndTrackedAISessions_BoundedFanOutCompletesInTimeBox` in `internal/daemon` is a fan-out
  time box. Both fail when other agents' `devoid.test.exe` processes are running.
  **Do not call it a flake and move on, and do not "fix" it.** Do what an earlier agent did:
  run the same command on the reverted tree and on yours, and compare. If it fails on both,
  it is contention — say so in your report with both results.
- **The repo's Go files are CRLF.** Tooling that writes LF silently no-ops. A mutation script
  anchored on `\n` will find nothing and report success. Anchor on `\r?\n`, or use the Edit tool.
  This is the same shape as the CRLF-blind guard regex that sat red on main for a day.
- **`internal/localdecide`, `internal/airuntimeintegrity` and Windows-tagged `internal/daemon`
  tests run in NO `pr-checks.yml` job.** Green locally is the only signal they have. Say so.
- **Do not append a leg to `.github/workflows/pr-checks.yml`.** It is the contract's BOTH-owned
  append-only file and several agents are running at once; the parent adds one consolidated leg
  rather than accepting racing appends. Report which of your tests no CI job runs.
- **A `go:embed` pattern cannot contain `..`**, so nothing under `internal/` can embed
  `parity-vectors/`. Read the vector at test time by relative path, and assert the file OPENS
  before asserting anything about its contents.
- **`gh pr checks` reports no checks.** GitHub Actions is blocked org-wide on this account's plan;
  jobs die in about four seconds with no runner. Local runs are the only evidence.

---

## 8. NEVER LET A TEST REACH PRODUCTION — this already happened once tonight

An agent in this batch **sent two AI-inventory records at the production API.** It wrote a temp
credentials file for a local test, used the key `backendUrl` where the code reads `apiBaseUrl`, so
`BackendURL` came back empty and **`normalizeBackendURL` substituted the production endpoint.** The
records were rejected 401 on key format and nothing was stored — but the request left the box.

The trap: **an empty or unreadable backend URL falls through to PRODUCTION, not to an error.** A
single wrong JSON key in a fixture is enough. Nothing warns you.

So, before any test or probe that constructs a backend client or could make an outbound request:

- **Assert the resolved URL is loopback** (`127.0.0.1` / `localhost`) and fail the test loudly if it
  is not. Do not assume your fixture worked — check the value the code actually resolved.
- **Point it at an `httptest` server** and assert the request count on that server. If a request goes
  anywhere else, your count is wrong and the test tells you.
- **Never use the committed `cf_api_` default key**, and never copy real credentials out of
  `%ProgramData%` or `~/.devoid`.
- If you need to prove a real network path, that is a **NOT EXERCISED** item for the owner, not
  something to attempt.

If you do accidentally reach production, **say so in your report, prominently, with what was sent and
what the response was.** The agent above did exactly that, which is why it is written down here
instead of being discovered later.

- **Namespace every scratchpad filename you write.** A dozen agents share
  `…/scratchpad/`. One agent's `pr-body.md` was overwritten mid-task by another's tonight. Use
  `<your-branch-name>-pr-body.md`, or write inside your own worktree instead.

---

## 9. The contract check — and how it silently failed

Before writing your collision-risk line, grep the ownership table for **every** path in your final
diff. Two agents reported "no contract files touched" while having edited one; one of those reached
`main` because the parent also merged without checking.

**Run it exactly like this — absolute path, existence guard, positive control first:**

```bash
C=/c/Users/Owner/Documents/Ceragon/.plans/PARALLEL_EXECUTION_CONTRACT.md
test -f "$C" || { echo "CONTRACT NOT FOUND — do not report a clean bill"; exit 1; }
grep -c 'ai_handlers.go' "$C"   # positive control: MUST be > 0 before you trust any miss

# Match on the BASENAME WITHOUT EXTENSION, never the exact path.
for f in <every path in your final diff>; do
  base=$(basename "$f"); stem="${base%.*}"
  hits=$(grep -n -- "$stem" "$C") && echo "!! $f -> $hits" || echo "ok $f"
done
```

**Why basename-without-extension, and not the exact path.** The contract lists
`Frontend/app/admin/endpoints/coverage-section.ts` and
`Frontend/components/admin/ai-security-policy-section.ts` — **both are actually `.tsx` on disk.** One of
those two is **P47-owned**. An exact-path grep returns a **clean bill for editing a file you may not
touch.** An agent found this; do not rediscover it.

Stem-matching over-reports rather than under-reports — you may get a hit on a test file or a sibling.
**That is the correct direction to be wrong in.** Read each hit and say why it does or does not apply.

**Why the guard and the control both exist:** an agent ran the grep from a Frontend worktree, where
`.plans/` does not exist. `grep` errored, and its loop printed `NOT IN CONTRACT` for all four paths.
**A silently-failing check reporting a clean bill is the exact defect class this programme exists to
close** — and it appeared inside the safeguard added to prevent it. Only the positive control caught it.

Generalise it: **whenever a check's "pass" is the absence of output, prove the check can produce
output first.** That same shape has appeared tonight as a `strings.Replace` whose anchor never matched,
a glob that found zero files and printed "ALL STATES PARSE", a CI mirror skipping two gates and
reporting no drift, and a `doctor` command silent on an invented key.

## 10. This machine runs out of disk, and it looks like your bug

C: has been measured at **0.1 GB free**, then **22.8 GB** minutes later. When it is low:

- `node_modules` in the main `Frontend/` and `Backend/` checkouts **gets emptied**, and every worktree
  junctions to those — `tsc`, `jest` and any `require('typescript')` fence stop working;
- Docker Desktop and WSL fail to start (`Wsl/.../0x800705aa`, `insufficient system resources`);
- free RAM has been measured at **0.00 GB** with 19 Go processes.

**If a run fails with ENOSPC, a missing module, a VM that will not start, or an inexplicable timeout,
say so and stop — do not work around it and do not record it as a red.** Tell the parent; it is
environmental and the parent can free space or restore dependencies.

**Do not run `npm install` or `npm ci` in a main checkout yourself.** Other worktrees share it, and
two installs in one `node_modules` is a corruption risk. Ask the parent.

## 11. An A/B is not evidence unless the environment held still

Several agents tonight separated their own failures from contention by running the same command on the
mutated and the reverted tree. That is the right instinct and it is **weaker than it looks on this box.**

One agent said it best, against itself: *"both halves of every A/B I ran tonight sat inside the same
swinging-disk window. It happened not to bite — my REDs were assertion diffs with the exact designed
strings, not resource errors — but 'I compared two runs' is weaker evidence than I implied if the
environment can move between them."*

So when you A/B:

1. **Record free disk and free RAM either side of both legs**, and put the numbers in your report:
   ```bash
   powershell.exe -NoProfile -Command "'{0:N2} GB disk / {1:N2} GB RAM' -f ((Get-PSDrive C).Free/1GB), ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB)"
   ```
2. **A RED that is an assertion diff carrying the exact string you designed is strong** regardless of
   load — the environment cannot invent your sentence.
3. **A RED that is a timeout, an ENOSPC, a missing module, a VM that will not start, or a truncated
   output is not evidence of anything.** Do not attribute it, in either direction. Say what the
   environment was doing and stop.
4. If the two legs ran minutes apart, say so. "Sequential on a quiet box" and "interleaved while nine
   agents ran" are different claims and only one of them supports a conclusion.

**And if you free space yourself — `go clean -cache` is legitimate when a build fails for space — say
so in your report.** It evicts every other agent's build cache; they will rebuild and lose nothing, but
the next agent to see a slow first build deserves to know why.

**Reading a stem hit.** The table's last column is prose, so a stem can match a *description* rather
than a path — `machine.go` hits the word "machinery" in the `canary.go` row. **A hit is a prompt to
read the line, not a verdict.** Quote the matched line in your report and say whether it is a real
path row or description text. Under-reporting is the failure that matters; over-reporting costs you
one `grep -n`.
