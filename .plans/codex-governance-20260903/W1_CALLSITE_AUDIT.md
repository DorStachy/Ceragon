# W1 T1 — the `IsSystemInstall()` call-site audit

Required by the task, not optional. This change flips a predicate that thirteen production call
sites read, and on the box it targets — machine-scope, `ENROLLMENT_MODE=deferred`, never enrolled —
**every one of them flips at once**, from `false` to `true`.

## The count

The plan's own precondition grep finds **12**. Run it and you get 12. But it anchors on
`config\.IsSystemInstall\(\)`, and a thirteenth call lives **inside the package itself**
(`internal/core/config/config.go:906`) with no `config.` prefix, which that grep cannot see. Both
numbers are recorded so the next reader need not rediscover the difference:

- **12** call sites matching the plan's exact grep,
- **13** production call sites in total.

Earlier drafts asserted 19, then 14. Neither matched anything.

## What changes on a machine-scope, unenrolled box

| # | Call site | Before (`false`) | After (`true`) | Risk |
|---|---|---|---|---|
| 1 | `internal/daemon/daemon_auth.go:196` | token path per-user | token path machine-scope | **This is the fix.** The 401s stop |
| 2 | `internal/daemon/daemon_auth.go:267` | as above | as above | **This is the fix** |
| 3 | `internal/aikeystore/location.go:220` | AI key store per-user | machine-scope | **Behaviour change — §3** |
| 4 | `internal/aikeystore/location.go:253` | as above | as above | **Behaviour change — §3** |
| 5 | `internal/policybundle/trust_anchor_client.go:330` | early return, "the read-back is the whole of the evidence" | runs `mintPersistenceProbe()`, requires the key to have reached machine scope | **Stricter — §2** |
| 6 | `internal/daemon/ai_trust_converge.go:67` | gate unconditionally true | gate reduces to `IsElevated()` | **Stricter — §1** |
| 7 | `cmd/devoid/ai_trust_converge.go:63` | as #6 | as #6 | **Stricter — §1** |
| 8 | `cmd/devoid/main.go:7086` | as #6 | as #6 | **Stricter — §1** |
| 9 | `internal/daemon/codex_machine_migration.go:115` | migration skipped | migration runs | Intended: a machine install should migrate |
| 10 | `cmd/devoid/main.go:164` | takes the `!` branch | skips it | Reviewed, benign |
| 11 | `cmd/devoid/main.go:935` | skips | takes | Reviewed, benign |
| 12 | `cmd/devoid/uninstall_command.go:764` | Linux uninstall does not elevate | elevates | Correct: a machine install needs it |
| 13 | `internal/core/config/config.go:906` | same-package, invisible to the plan's grep | — | Reviewed, internal |

## §1 — The elevation gate now bites, and that is the point

`!config.IsSystemInstall() || uninstall.IsElevated()` was **unconditionally true** on a deferred
box, because the left half was true. It now reduces to `uninstall.IsElevated()`.

The code's own comment states the intent: *"The two refuse together on an unelevated system
install."* The gate was never meant to pass freely on a machine-scope box; it did so only because
scope was mis-detected. Three call sites share the pattern.

**Consequence, plainly:** an unelevated CLI on a deferred machine-scope box no longer mints AI
trust; it defers to the SYSTEM daemon, which is elevated and does it. That is the correct split.
Before this change the unelevated CLI would mint a **per-user** key on a machine-scope box — the
split-brain that machine scope exists to prevent.

## §2 — The mint must now prove it reached machine scope

`verifyMintReachedTheAuthoritativeScope` previously returned `nil` early on these boxes, reasoning
*"Per-user install: there is no machine scope, so the read-back above is the whole of the
evidence."* On a deferred box that reasoning was **false** — there is a machine scope, and nothing
checked that the key reached it. The probe now runs.

**This is the change to watch on a real fleet.** It introduces a failure that did not exist before:
`cannot confirm the minted endpoint signing identity reached the machine scope`. §1 is what keeps it
safe — only the elevated daemon reaches the mint, and it can write machine scope. The two changes
are coherent only *together*; §2's effect without §1's would put an unelevated process in front of a
probe it cannot satisfy.

**This is trust-anchor code, and this workspace has bricked a trust anchor before** — a reinstall
producing a permanent 409. Nothing here rotates or re-mints an existing key; the path is reached
only when a mint is already under way. But W0 T5 and W6 T2 must exercise **an already-enrolled box
upgrading into this change**, not only a fresh install, because fresh install is the path least
likely to expose it.

## §3 — `aikeystore` (#3, #4): flagged, NOT closed

The plan predicted these two were "most likely to have been silently per-user on deferred boxes".
The prediction holds: the key-store location moves from per-user to machine-scope for exactly those
boxes. **An endpoint that already wrote keys per-user before upgrading will, after the upgrade, look
at the machine location and find nothing there.**

Whether the right answer is re-mint, migrate, or fall-back-and-adopt is **not decided here and not
implemented**. It is the largest open risk in W1 and belongs to W0 T5 on a real upgraded box.
Recorded as unfinished rather than assumed benign.

## How this was checked

Every row was read in source, not inferred from the call site's name. The two flagged sections were
read in full context — the gate with its own comment, and the mint with the branch it used to take.
Ten `cmd/devoid` tests that went red under this change were baselined on `b364a7fa` in a clean
worktree first: all ten passed there, so they were caused by this change and not pre-existing,
contrary to the build agent's report of them.
