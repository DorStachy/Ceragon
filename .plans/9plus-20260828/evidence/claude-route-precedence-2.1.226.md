# Claude Code transport-route precedence — MEASURED, five sources, 32 cells

**P9 W3 Task 3.** `w3_forced_egress.md` lines 372-478. RECONCILIATION §1 C8, §3 sequencing item 9.

| | |
|---|---|
| Product | `claude-code` (native Windows binary) |
| Version | **2.1.226** |
| SHA-256 | `cec4e772e8237357554a8a5a86f821db9081e9fb05499bc4e5fd14b73f48708c` |
| Path measured | `C:\Users\Owner\.local\bin\claude.exe` (identical size to `~/.local/share/claude/versions/2.1.226`) |
| Host | Windows 11 Education 10.0.26200, amd64 |
| Measured at | 2026-08-29T03:10:07Z (pre-W4-T4 measurement) |
| Harness | [`w3-t3/measure-claude-route-precedence.mjs`](w3-t3/measure-claude-route-precedence.mjs) |
| Raw result | [`w3-t3/measurement-2.1.226-pre-w4t4.json`](w3-t3/measurement-2.1.226-pre-w4t4.json) |
| Control | [`w3-t3/control-swap.mjs`](w3-t3/control-swap.mjs) |

**This is a measurement, not a reading of the vendor's documentation.** The spec's LANDMINES say
inferring the order produces "a control that reports green over the losing source". It would have.
See §4: the naive reading of the vendor's own bundle predicts the *opposite* of what the binary does.

---

## 1. How it was measured

Each of the five sources is planted with a **distinct loopback sentinel base URL** that differs only
in its path segment — `http://127.0.0.1:<port>/s-process`, `/s-machine`, `/s-user`, `/s-project`,
`/s-projectlocal`. One HTTP listener answers all five. The binary is launched with
`-p hi`; the winner is **whichever sentinel path the binary actually connected to**. The binary's
first request on a fresh session is `<base>/api/hello`, so a cell resolves in a few seconds.

Every scope is a fresh temp fixture: a throwaway `USERPROFILE`/`HOME`, a throwaway project
directory, a throwaway managed-settings root. **Nothing on this machine's real Claude configuration
was read or written** — not `%USERPROFILE%\.claude`, not `C:\Program Files\ClaudeCode`, not
`%ProgramData%`, not any real project's `.claude/`.

Re-run it with:

```sh
node .plans/9plus-20260828/evidence/w3-t3/measure-claude-route-precedence.mjs \
  --binary "C:/path/to/claude.exe" --out ./out --port 19360 --timeout 35000
```

### Control against a fixture-writer artefact

If the harness had a bug that made the winning *string* rather than the winning *file* decide the
answer, the matrix would still look self-consistent. `control-swap.mjs` swaps the payloads — the
user file gets the `project` sentinel and the project file gets the `user` sentinel — and asserts the
reported label flips. It did:

```
user+project, payloads SWAPPED: sentinel=project expected=project OK
user+project, payloads NORMAL:  sentinel=user    expected=user    OK
```

The winning **file** is the user file either way. The harness measures file precedence.

### Reproducibility

The seven discriminating cells (5, 9, 13, 17, 24, 25, 2) were re-run on a second port in a second
process. All seven matched the first run.

---

## 2. THE MEASURED ORDER

```
userSettings  >  processEnv  >  localSettings  >  projectSettings
```

`~/.claude/settings.json` `env` beats **everything else measurable**, including the process
environment. `<proj>/.claude/settings.local.json` beats `<proj>/.claude/settings.json`. Both project
files lose to the process environment.

**The machine managed-settings scope could not be measured on this host — see §3.** In every cell
where it is present the observed winner was identical to that cell's machine-absent twin, which is
consistent with the planted machine file being inert, not with the machine scope losing.

All 32 cells are consistent with that single total order. Bit order: `1=process`, `2=machine`,
`4=user`, `8=project`, `16=projectlocal`.

| # | present | winner | verified |
|---|---|---|---|
| 0 | — | none | yes |
| 1 | process | **process** | yes |
| 2 | machine | none | **NO** |
| 3 | process, machine | process | **NO** |
| 4 | user | **user** | yes |
| 5 | process, user | **user** | yes |
| 6 | machine, user | user | **NO** |
| 7 | process, machine, user | user | **NO** |
| 8 | project | **project** | yes |
| 9 | process, project | **process** | yes |
| 10 | machine, project | project | **NO** |
| 11 | process, machine, project | process | **NO** |
| 12 | user, project | **user** | yes |
| 13 | process, user, project | **user** | yes |
| 14 | machine, user, project | user | **NO** |
| 15 | process, machine, user, project | user | **NO** |
| 16 | projectlocal | **projectlocal** | yes |
| 17 | process, projectlocal | **process** | yes |
| 18 | machine, projectlocal | projectlocal | **NO** |
| 19 | process, machine, projectlocal | process | **NO** |
| 20 | user, projectlocal | **user** | yes |
| 21 | process, user, projectlocal | **user** | yes |
| 22 | machine, user, projectlocal | user | **NO** |
| 23 | process, machine, user, projectlocal | user | **NO** |
| 24 | project, projectlocal | **projectlocal** | yes |
| 25 | process, project, projectlocal | **process** | yes |
| 26 | machine, project, projectlocal | projectlocal | **NO** |
| 27 | process, machine, project, projectlocal | process | **NO** |
| 28 | user, project, projectlocal | **user** | yes |
| 29 | process, user, project, projectlocal | **user** | yes |
| 30 | machine, user, project, projectlocal | user | **NO** |
| 31 | process, machine, user, project, projectlocal | user | **NO** |

**16 verified cells. 16 unverified cells** — every cell in which the machine scope is present.
The checked-in fixture `internal/aihooks/testdata/claude-route-precedence.v1.json` records the
unverified 16 as `unverified`, not as the winner the other four scopes produced, so
`EffectiveRouteSource` refuses rather than guesses on any endpoint where a machine-scope route
exists. That is the cell class `w4_vendor_authority.md` Task 4 is about to populate.

---

## 3. The cell class that could NOT be measured on this box, and what would measure it

**Which:** machine managed-settings — the 16 cells where source bit 2 is set.

**Why:** the vendor resolves the managed-settings root from a hard-coded, memoized platform
constant. Extracted from the 2.1.226 bundle at byte offset 257939187:

```js
Nz = memo(function () {
  switch (platform()) {
    case "macos":   return "/Library/Application Support/ClaudeCode";
    case "windows": return "C:\\Program Files\\ClaudeCode";
    default:        return "/etc/claude-code";
  }
});
function MBg() { return path.join(Nz(), "managed-settings.json"); }
function pen(e) {
  ... a3(path.join(e, "managed-settings.json"), ...)              // the merge BASE
  ... readdirSync(path.join(e, "managed-settings.d")) ... sorted   // then every *.json fragment
}
```

`Nz()` reads no environment variable. `CLAUDE_CODE_MANAGED_SETTINGS_PATH` exists as a declared,
exported env accessor in this build (`TSg`) and **is never read anywhere else in the bundle** — the
only site that touches it is the `plugin eval` harness, which *sets* it for a child process. Setting
it had no effect, confirmed directly from the vendor's own debug log while it was pointed at a temp
directory:

```
[DEBUG] Broken symlink or missing file encountered for settings.json at path:
        C:\Program Files\ClaudeCode\managed-settings.json
```

Both variants were tried — the DeVoid drop-in `managed-settings.d\90-devoid.json` and the
`managed-settings.json` base — and both were ignored.

So on this host the machine scope can only be exercised by writing to
`C:\Program Files\ClaudeCode\`, which is the **real machine managed-settings scope of this
developer's endpoint**. That is out of bounds: the task forbids writing into any real Claude
configuration scope, and the standing prohibitions forbid changing machine-wide configuration on
this box.

**What would measure it:** a disposable Windows VM or Windows container in which
`C:\Program Files\ClaudeCode\managed-settings.d\90-devoid.json` is a throwaway path, running the
same harness unchanged — the harness already plants that file and already reports the cell. Any
Linux host works equally well with `/etc/claude-code` (same `pen()` code path, same version), at the
cost of measuring a different build artefact than the Windows one a customer runs.

---

## 4. THE MEASUREMENT CONTRADICTS THE WAVE'S PREMISE, TWICE

### 4.1 "project scope sits above user scope" is false for `env`

`w3_forced_egress.md` §2 says, of the IDE/desktop lane:

> per strategy §4.1 the vendor's precedence puts enterprise-managed settings above user, project,
> local and CLI settings — which also means **project scope sits above user scope**. Nothing in this
> repo reads or reports a project-scope `env.ANTHROPIC_BASE_URL`.

Measured, for `env.ANTHROPIC_BASE_URL` on 2.1.226: **user scope beats both project scopes** (cells
12, 13, 20, 21, 28, 29). A project-scope override does not demote the DeVoid route; it loses to it.

This does not make the task pointless — it changes what its doctor row means. A project-scope
`env.ANTHROPIC_BASE_URL` is still worth reporting (it is a configured attempt to leave the route, and
it becomes the winner the moment `~/.claude/settings.json` has no `env` entry, which is every
endpoint where `mergeTransportRoute` has not yet run). It is **not** an override of a DeVoid-managed
endpoint's route, and a row that said so would be wrong.

### 4.2 A user-scope hand edit beats the terminal shim's injection, and `enforceManagedTransportRoute` cannot see it

`cmd/devoid/agent_shim.go` injects `ANTHROPIC_BASE_URL` into the **child process environment**
(`buildAgentEnv` → `appendEnvIfMissing`). On a managed endpoint `enforceManagedTransportRoute`
(`:306-340`) overrides a user-supplied value and records `PROVIDER_ROUTE_BYPASS` — but it decides by
scanning `baseEnv`, i.e. **the process environment only**.

Measured: `~/.claude/settings.json` `env` beats the process environment (cells 5, 13, 21, 29). So a
hand-edited user-scope `env.ANTHROPIC_BASE_URL` wins over the value the shim injected, and
`enforceManagedTransportRoute` never fires, because nothing in the environment it inspects was
user-supplied. On an endpoint where DeVoid has written its own route into
`~/.claude/settings.json` the two agree and nothing is wrong; on an endpoint where
`internal/aihooks.mergeTransportRoute` has not run, or where the user edited that file after it did,
**the terminal lane's route is silently overridden by a file the terminal lane never reads.**

This is the same defect shape the wave already names for the IDE lane, on the lane the wave
believed was covered by the env injection. It is reported here as a finding; **this task changes no
routing behaviour** and does not fix it.

### 4.3 The vendor's own bundle does not predict the measured order

For the record, because it is the reason the LANDMINE "do not infer the precedence order from the
vendor's documentation" is correct. The bundle contains a settings-source order

```js
L1 = ["userSettings", "projectSettings", "localSettings", "flagSettings", "policySettings"];
```

and applies settings `env` with a last-wins loop

```js
Object.assign(process.env, TSr(globalConfig().env, "globalConfig"));
for (let a of allowedSources()) Object.assign(process.env, TSr(settings(a)?.env, a));
```

Read naively, that is `policySettings > flagSettings > localSettings > projectSettings >
userSettings` and every one of them above the process environment. The measurement says
`userSettings > processEnv > localSettings > projectSettings`. The filter `TSr` and the allowed-source
set (default `["userSettings","flagSettings","policySettings"]`) evidently change the outcome; the
minified bundle was not decompiled far enough to say exactly how, and **it does not need to be** —
the measured behaviour is what governs. Recorded only so a later reader does not "correct" the
fixture from the bundle.

---

## 5. The doctor row's state vocabulary — a deviation from the task's exit criterion

The task's exit criterion 2 reads:

> `devoid doctor --json | jq -r '.rows[] | select(.label=="AI provider route (Claude)") | .state'`
> returns `overridden`.

It cannot, and it should not. `rows[].state` in `last-run.json` is a **closed
three-member vocabulary** — `pass`, `fail`, `unverified` (`cmd/devoid/doctor_last_run.go:53-58`,
`cmd/devoid/doctor_scoreboard.go:78-83`). Adding a fourth member to publish `overridden` would break
every reader pinned to `doctorLastRunSchemaVersion = 2`, and the task's own LANDMINES forbid touching
that vocabulary (`doctor_scoreboard.go` holds it and the `selfConsistent` tally invariant).

Implemented instead: `.state` is `fail` and `.detail` begins `overridden by <scope> → <host>`.
The equivalent command is

```sh
devoid doctor --json | jq -r '.rows[] | select(.label=="AI provider route (Claude)") | .detail'
```

The other half of the criterion holds exactly as written: on a box with no fixture entry for the
installed binary version, `.state` is `unverified`, never `pass`.

### A defect found while wiring the row

`cmd/devoid/main.go` fed the whole AI-runtimes section through
`check(row.Label, row.State == doctorRowPass, row.Detail)`. `check` has **two** outcomes, so every
`doctorRowUnverified` that section produced was scored as a FAILURE of the endpoint and published to
`last-run.json` as one. That already applied to the **Codex machine baseline** row, which is
unverified on every endpoint in the fleet by construction — the exact condition
`doctor_ai_surface.go:204-219` documents at length as "never a failure of this endpoint". Fixed by
routing the section through `sb.emit`, which is the one place all three states are counted and
rendered. One line.

---

## 6. Post-W4-T4 re-measurement — NOT DONE

RECONCILIATION §3 item 9 requires this matrix to be **re-measured after `w4_vendor_authority.md`
Task 4 merges**, because that task makes the machine scope authoritative.

At the time of writing, Installers `origin/main` is `33062dd4` and the merged W4 work is **Task 1
only** (PR #199, `p9/w4-t1-claude-machine-projection`). **W4 Task 4 has not merged.** The second
measurement is therefore absent, and every machine-present cell stays `unverified` until it is taken.

To take it, on a host where the machine managed-settings root is disposable:

```sh
node .plans/9plus-20260828/evidence/w3-t3/measure-claude-route-precedence.mjs \
  --binary "<claude>" --out ./out-post-w4t4 --port 19360 --timeout 35000
diff <(jq -S .cells out-post-w4t4/measurement.json) \
     <(jq -S .cells .plans/9plus-20260828/evidence/w3-t3/measurement-2.1.226-pre-w4t4.json)
```

then regenerate `internal/aihooks/testdata/claude-route-precedence.v1.json` with `verified: true` on
the 16 machine cells and re-run `go test ./internal/aihooks/ -run RoutePrecedence -count=1`.
