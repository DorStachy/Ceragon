# P9 Wave 3 Task 1 — evidence

**Task:** Lowercase before stripping the extension (Phase 0).
**Branch:** `p9/w3-t1-normalizename` · **Commit:** `bce84aa0` · **Worktree:** `C:/cwt/w3-t1`
**Base:** Installers `origin/main` `5b12952307db9903fa166d5d9ce1a0c058e0ad77` (matched the plan's
expected SHA exactly; no re-verification of line citations was required).
**Date:** 2026-08-28.

---

## Preconditions — all four passed

| Check | Expected | Observed |
|---|---|---|
| `git rev-parse origin/main` | `5b129523…` | `5b12952307db9903fa166d5d9ce1a0c058e0ad77` ✅ |
| `sed -n '242,247p' cmd/devoid/main.go` | the defective body | byte-identical to the plan's quote ✅ |
| `sed -n '178,180p' cmd/devoid/update_command.go` | `normalizeName(base) == "devoid"` | exact ✅ |
| `grep -c TestNormalizeName cmd/devoid/*_test.go` | 0 in every file | 0 ✅ |
| baseline `go test -run TestIsCanonicalDevoidName` | ok | `ok … 0.147s` ✅ |

---

## The change

`cmd/devoid/main.go` — `normalizeName` now lowercases once into a local and strips from the lowered
value. **The cumulative strip loop is preserved exactly**, so output is identical for every
all-lowercase name; the only invocations whose behaviour changes are those typed with a mixed-case
extension.

> Deviation from the literal wording of the plan, deliberate: the plan says to copy the *shape* of
> `internal/inventory/mcp/launch.go:431-439` `trimExeSuffix`, which **returns on the first matching
> extension**. Copying that control flow would also have changed multi-extension names
> (`npm.cmd.exe` → `npm.cmd` instead of `npm`), a second behaviour change the plan's own blast-radius
> analysis does not cover ("the only names that change behaviour are those whose extension is not
> all-lowercase"). The case fix is applied to the existing loop instead, which keeps the blast radius
> exactly as analysed.

`cmd/devoid/update_command_test.go` — the comment claiming an uppercase `.EXE` "never occurs on disk"
and is "correctly NOT canonical" was the only place this defect was written down. Replaced with the
true statement, and `"DEVOID.EXE"` added to the `canonical` slice so `isCanonicalDevoidName` is a live
probe of the ordering rather than a note explaining it away.

`cmd/devoid/name_dispatch_test.go` — new.

Three files, nothing else. `internal/aiagent/aiagent.go` was mutated during defeat-testing and
restored; `git status` confirms it is unmodified.

---

## RED → GREEN

**RED**, before the fix, 7 of 10 normalizer cases and all 5 dispatch pairs:

```
--- FAIL: TestNormalizeNameIsCaseInsensitiveOnTheExtension (0.00s)
    name_dispatch_test.go:43: normalizeName("CLAUDE.EXE") = "claude.exe", want "claude"
    name_dispatch_test.go:43: normalizeName("Claude.Exe") = "claude.exe", want "claude"
    name_dispatch_test.go:43: normalizeName("claude.EXE") = "claude.exe", want "claude"
    name_dispatch_test.go:43: normalizeName("npm.CMD") = "npm.cmd", want "npm"
    name_dispatch_test.go:43: normalizeName("NPM.BAT") = "npm.bat", want "npm"
    name_dispatch_test.go:43: normalizeName("git.EXE") = "git.exe", want "git"
    name_dispatch_test.go:43: normalizeName("DEVOID.EXE") = "devoid.exe", want "devoid"
--- FAIL: TestNameDispatchRoutesUppercaseInvocationsToTheSameBranch (0.00s)
    name_dispatch_test.go:62: isAgentShim(normalizeName("CLAUDE.EXE")) = false; want true (uppercase must not walk past the agent shim)
    name_dispatch_test.go:62: isAgentShim(normalizeName("CODEX.EXE")) = false; want true (uppercase must not walk past the agent shim)
    name_dispatch_test.go:62: isAgentShim(normalizeName("GEMINI.EXE")) = false; want true (uppercase must not walk past the agent shim)
    name_dispatch_test.go:69: isCLIEntrypointName(normalizeName("DEVOID.EXE")) = false; want true (devoid must reach CLI mode)
    name_dispatch_test.go:75: normalizeName("GIT.EXE") = "git.exe", want "git" (managed-git-gate dispatch)
```

**GREEN**, after:

```
--- PASS: TestNormalizeNameIsCaseInsensitiveOnTheExtension (0.00s)
--- PASS: TestNameDispatchRoutesUppercaseInvocationsToTheSameBranch (0.00s)
--- PASS: TestIsCanonicalDevoidName (0.00s)
ok  	github.com/codefense/cli-wrapper/cmd/devoid	1.330s
```

## Defeat tests — the mutation was applied and all three went RED

Mutation: the `TrimSuffix` loop restored ahead of `strings.ToLower`.

The plan's required literal appeared verbatim:

```
normalizeName("CLAUDE.EXE") = "claude.exe", want "claude"
isCanonicalDevoidName("DEVOID.EXE") = false; want true (canonical devoid self-updates)
```

plus the dispatch test's five pairs. The fix was then restored and re-verified GREEN.

---

## Binary-level BEFORE / AFTER proof

The plan's exit criterion asks for this against an MSI-installed endpoint. **DeVoid is not currently
installed on this machine** — `C:\ProgramData\devoid\bin` does not exist, following the 2026-08-27
real-box install/uninstall cycle. So the proof was taken by building both binaries and invoking each
under the name `CLAUDE.EXE`. The dispatch decision is `filepath.Base(os.Args[0])`, which is settled
before anything in the install tree is consulted, so this exercises the same code path.

**BEFORE** — `origin/main` binary, invoked as `CLAUDE.EXE --version`:

```
level=DEBUG msg="Starting devoid" tool=claude.exe args=[--version]
level=DEBUG msg="Running in shim mode" tool=claude.exe
level=DEBUG msg="Searching for real tool" tool=npm  shimDir=…\before
level=DEBUG msg="Found real tool" tool=npm path="C:\\Program Files\\nodejs\\npm.cmd"
… (npx, yarn, pnpm, corepack, bun, bunx, pip …)
```

Worse than the plan described: the invocation did not merely skip AI governance, it fell into the
**package-manager** machinery and began a full real-tool discovery sweep, because `runShim("claude.exe")`
finds no tool config and drops into the manifest-refresh path.

**AFTER** — the fixed binary, same name, same arguments:

```
level=DEBUG msg="Starting devoid" tool=claude args=[--version]
level=DEBUG msg="Running in AI-agent shim mode" tool=claude
level=DEBUG msg="agent shim: daemon unreachable, failing open (no governance, no transport inject)" agent=claude
[devoid] warning: devoid daemon unreachable — running agent without governance/DLP
2.1.226 (Claude Code)
```

The uppercase invocation now reaches the agent shim, and the shim announces its own fail-open — which
is the substrate Wave 1 repairs, visible here as a side effect rather than a claim.

### Both runs were sandboxed, and here is why that mattered

`runAgentShim` calls `maybeReconcileAIWireUserContext` (`cmd/devoid/ai_wire_retry.go:119`), which
sweeps `~/.claude` and `~/.codex` via `aihooks.EvictVendorArtifacts` and then runs `aiwire.Reconcile`
— a **write** into the user's real vendor config trees. No daemon is listening on 19280 on this box.
Run unsandboxed, that could have written a transport route pointing at a dead proxy into the owner's
live Claude Code and Codex configuration.

Both runs were therefore executed with `USERPROFILE`/`HOME` redirected to a scratch directory.
Proof the real configuration was untouched:

| File | before the runs | after the runs |
|---|---|---|
| `~/.claude/settings.json` | mtime `2026-08-27 18:13:36`, sha `afbe218cc291b1ad` | **identical** |
| `~/.codex/config.toml` | mtime `2026-08-28 17:56:53`, sha `e38d47f144cc5f76` | **identical** |
| `~/.codex/managed_config.toml` | absent | absent |

The sandbox home received `.devoid/aiwire-last-reconcile`, `bypass-events.json`, `chain-state.json`,
`manifest.json`, `tamper.log` — confirming the reconcile did run, and that it would have landed on the
real home otherwise.

---

## Findings the plan did not predict

1. **The call-site enumeration was incomplete.** The plan names three other `normalizeName` call
   sites (`main.go:8280`, `:8290`, `:8876`) and says the fix is contained. There are **five**:
   also `cmd/devoid/agent_shim.go:479` (`runAgentShim` re-normalizing `os.Args[0]`) and
   `cmd/devoid/upgrade_verification_target_windows.go:24`. Both were read; both are safe and both
   are *improved* by the fix, so the conclusion holds — but it held by luck of enumeration, not by
   the stated reasoning.
2. **A fourth normalizer exists and is already correct.** `internal/aiagent/aiagent.go:71`
   `normalizeBinName` lowercases before stripping. This means agent-type resolution was **never** a
   casualty of the dispatch defect: `AgentTypeFor` repairs the name independently.
3. **Consequence for the tests:** an assertion that an uppercase invocation resolves the right agent
   type passes against the defect as well as the fix — inert by this wave's own definition. It was
   written, measured against both mutations, found inert, and **deleted**. A comment in
   `name_dispatch_test.go` records why, and notes that pinning `normalizeBinName`'s ordering belongs
   in a task that owns `internal/aiagent`.

---

## Suite delta

`go test ./cmd/devoid/... ./internal/...`, 132 packages, run on `origin/main` in a throwaway worktree
(`C:/cwt/w3-t1-base`) and on the fix branch.

**Pre-existing red on `origin/main`, not introduced here:**
`internal/daemon` — `TestEndTrackedAISessions_BoundedFanOutCompletesInTimeBox` (5.05s, a timing
box). The baseline run exits 1 for this reason alone.

Fix-branch result: see `suite-fix.txt` alongside this file.

---

## Not exercised

- **The MSI-installed path.** No DeVoid install exists on this box, so the BEFORE/AFTER proof is
  binary-level, not endpoint-level. Re-running the plan's `Copy-Item "$env:ProgramData\devoid\bin\devoid.exe"`
  form remains open for the next endpoint that has one.
- **macOS and Linux.** The change is platform-independent Go, but only Windows was executed.
- **`pr-checks.yml`.** This task adds no CI leg.
