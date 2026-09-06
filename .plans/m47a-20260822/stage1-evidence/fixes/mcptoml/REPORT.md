# Fix: a Codex TOML MCP config is visible to the real-time watcher (Installers)

Branch `p47/fix-mcp-toml`, commit 71fb44c9 (base f6148c37). Written by the orchestrator from the
fix agent's findings; the agent's raw evidence is beside this file (`01-RED-before-fix.txt`,
`02-mutation-proofs.txt`, `03-GREEN-full-run.txt`, `04-GREEN-new-tests-verbose.txt`).

## What was wrong

`mcpgov.DiscoverServersInFile` (the single-file path the watcher calls for a changed file) parsed
JSON only, so a server declared in Codex `config.toml` under `[mcp_servers.<name>]` read as zero
servers and the daemon posted nothing; only the six-hourly full sweep, which reads TOML through
`mcpsources`, ever classified it (MCP lane, gap G1). `$CODEX_HOME` was already being watched, which
is why the rig saw the file event and still posted nothing: the event reached the right function and
the function was the defect.

## What is now true

| file | change |
|---|---|
| `internal/mcpsources/discover.go` | new `DiscoverInFile` / `DiscoverInFileIn`: read ONE path through the source registry with the sweep's format, envelope, allow-list and guards; a file source keeps `Lstat` (symlinks refused), a directory source keeps `os.Stat` |
| `internal/mcpgov/mcpgov.go` | `DiscoverServersInFile` is format-aware: a registered non-JSON path routes through `mcpsources` and then the same `viewFromRaw -> mcprisk -> projectServer` pipeline as JSON; `isAllowedConfigFile` admits the Codex files path-aware; a registry-derived extension pre-filter keeps JSON callers (plugingate, per activation) from paying a `~/.claude.json` read |
| `internal/mcpgov/mcpgov_toml_parity_test.go` (new), `internal/mcpwatch/watcher_test.go` (+3) | parity and watcher-path tests |
| `internal/daemon/mcp_governance.go` | unchanged: it already called the right function |

## Tests (red before, green after)

- RED: the TOML fixture read 0 of 3 servers; `isAllowedConfigFile` false for both Codex files.
- GREEN parity table: benign npx filesystem -> allow; npx with a synthetic token-shaped env value -> block / `secret-env-name`; made-up remote http host -> warn / `network-egress-remote-transport`; each TOML row identical to its JSON twin including launch and auth digests; an in-test proof that `invmcp.ParseServers` returns zero for the TOML fixture (the defeat).
- Watcher tests proved red by two mutations; `WatchTargets` already covers the parent directory of every `Watch:true` file source, so `$CODEX_HOME/config.toml` and `managed_config.toml` are watched, now pinned by test rather than assumed.
- `go build ./...`, `go vet`, `go test` on mcpgov, mcpsources, mcpwatch, plugingate, aicanary, mcpquarantine and the sweep: all exit 0.

## Not done

TOML quarantine still refuses (`ErrConfigFormatUnsupported`, by design; the tool-call gate still
blocks a denied server). Discovery coverage is still computed and not posted (MCP lane G3). The
mcpwatch inventory lane is still JSON-only. The symlink test skips without privilege. The live-rig
re-run of the MCP lane's probe 4 happens after the daemon rebuild.
