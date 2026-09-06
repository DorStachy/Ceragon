# P47 stage 1 — lane `mcp` (MCP Control Tower / Wave 5 T3)

Lane question: when a developer adds an MCP server to a coding agent's config, does the
product see it, quarantine or queue it, let an admin approve or deny it in the console,
and enforce that answer on the endpoint?

Rig: daemon 7.10.99 :19390 from `/c/cwt/p47-fix-exfil` (p47/fix-system-exfil), backend
:2353 from `/c/cwt/p47-w4b-be`, console :3201 from `/c/cwt/p47-final-frontend-20260830`.
Isolated home `C:\Users\Owner\AppData\Local\Temp\devoid-p47-iso\home`.

## Mechanism, as read from the code (before testing)

1. `internal/mcpsources/mcpsources.go` is a single declarative Registry of 16 config
   locations: claude-code user (`~/.claude.json`) + project (`.mcp.json` under the
   bounded project roots named *inside* `~/.claude.json`, max 64), claude-desktop
   (`%APPDATA%\Claude`), codex user (`$CODEX_HOME/config.toml`, TOML) and machine
   (`managed_config.toml`), cursor (`~/.cursor` + project `.cursor/mcp.json`), windsurf,
   gemini-cli, the VS Code family `User/mcp.json` (Code, Insiders, VSCodium, Cursor,
   Windsurf apps), `~/.claude`, and project `.vscode/mcp.json`.
2. Each entry declares Kind (file/dir), Format (json/toml), Envelopes (`mcpServers`,
   `servers`, flat, claude-projects, toml-mcp-servers), `Watch` (real-time) and
   `SweepWalk` (recursive walk) separately, so registering a location never silently
   adds a recursive traversal.
3. `Discover()` returns servers AND a `SourceCoverage` row per location with a closed
   state vocabulary (parsed/empty/absent/unreadable/unparseable/unrecognized), so
   "found nothing" and "could not look" are different values. File sources are Lstat'd
   and a symlink is refused, not resolved.
4. `internal/mcpgov` classifies each discovered server with `internal/mcprisk` — a
   deterministic regex classifier over launcher/args/env/URL, five capability classes
   (shell-exec, network-egress, filesystem-broad, untrusted-source, secret-env). Any
   high finding -> static verdict `block`; a medium -> `warn`; none -> `allow`.
   It never launches a process or performs an MCP handshake.
5. Only a wire-safe projection leaves the box: server name, package name/manager,
   transport, remote URL reduced, launch-identity digest, capability slugs and
   `{class,ruleId,severity,count}` findings. No env values, no command bodies.
6. Triggers: (a) daemon start and the sweep tick — `Policy.sweep_interval`, default
   **6h**, minimum 1m — calls `scanAndEnforce(ctx, "")`; (b) the fsnotify MCP watcher
   (`internal/mcpwatch`, watch targets = registry `Watch` sources incl. the PARENT dir
   of file sources) calls `scanAndEnforce(ctx, <path>)`; (c) CLI `devoid mcp scan`
   (feature-gated on `MCP_GOVERNANCE_ENABLED`, defaults ON) posts direct to the backend
   and does NOT enforce; (d) the CLI shim's runtime launch telemetry posts an
   `ecosystem:"mcp"` inventory item.
7. `scanAndEnforce` POSTs `/api/v1/ai/mcp/scan`, then GETs `/api/v1/ai/mcp/status` for
   the AUTHORITATIVE rows. A failed status read logs at Warn, writes an
   `mcp_status_fetch_failed` evidence event and runs NO enforcement (fail-safe).
8. Enforcement (`shouldQuarantine`): `approval=blocked` quarantines in every mode;
   `surfaces.mcp=block` + enforce quarantines everything; `approval=approved` never
   quarantines; enforce + `allowlistMode` quarantines the unapproved; otherwise
   enforce + static `block` quarantines. Quarantine = remove that one entry from the
   config, keep a timestamped backup plus a stash with the post-edit hash; restore
   refuses if the config drifted.
9. The same status read warms `mcpVerdicts`, the 5-minute TTL cache read by the
   PreToolUse gate `mcpGateDecision` (`internal/daemon/ai_mcp_gate.go`). A live
   `mcp__<server>__<tool>` call resolves to Artifact{Kind:"mcp",Name:server,Tool:tool}
   via `internal/skillgate`, and the gate answers: blocked -> BLOCK, approved -> defer,
   static block -> BLOCK, static warn -> WARN, static allow -> defer, unknown ->
   HOLD under enforce / defer otherwise. Nothing new rides the wire.
10. Persistence: `mcp_servers` (functional unique key
    `(org_id, COALESCE(endpoint_id,''), server_name, COALESCE(package_name,''))`,
    approval preserved across rescans, `detection_count` bumped) and
    `mcp_discovery_coverage`. Console reads `GET /api/v1/ai/mcp/servers[/:id]` and
    writes `PATCH /api/v1/ai/mcp/servers/:id/approval` (JWT, admin role); the agent
    uses `POST /api/v1/ai/mcp/{scan,approval}` + `GET /api/v1/ai/mcp/status` (API key).

## Results

Probes ran 2026-09-05 21:03-21:20 UTC against the shared rig. Planted three servers in
Claude Code `~/.claude.json` (`mcpServers` envelope), three in Codex `~/.codex/config.toml`
(`[mcp_servers]`, TOML) and one in Cursor `~/.cursor/mcp.json`, all inside the ISOLATED home.
The one token-shaped value was SYNTHETIC and assembled from fragments at runtime.

| # | probe | expected | observed | verdict | evidence |
|---|---|---|---|---|---|
| 1 | Write `~/.claude.json` with 3 servers; fsnotify watcher | discovered + classified + posted within seconds | `MCP scan posted servers=3 accepted=3` about 1s after the write; 3 rows in `mcp_servers` | VERIFIED | 02, 03 |
| 2 | Static classification spread | benign npx filesystem server -> allow; npx package with a token-shaped env var -> block; made-up remote http URL -> warn | exactly that: `allow` / `block` (`secret-env` / `secret-env-name` / high x1) / `warn` (`network-egress` / `network-egress-remote-transport` / medium x1) | VERIFIED | 03 |
| 3 | Wire minimisation | no env values, no command bodies; remote URL reduced to scheme+host | row holds `remote_url=https://mcp.p47-not-a-real-host.example` (the `/mcp` path dropped), `capabilities` + `riskFindings` only, `authMode=configured-env` with no value, plus a launch-identity digest | VERIFIED | 03, 10 |
| 4 | Write Codex `config.toml` `[mcp_servers]`; fsnotify watcher | same as probe 1 | `configwatch: CONFIG_CHANGE observed source=codex-config` fired, but NO `MCP scan posted` and no row. TOML is invisible to the real-time path | **GAP G1** | 04 |
| 5 | Full sweep via `devoid mcp scan` (isolated env) | reads every registry source including TOML | 14 sources checked, 0 unread; 7 servers classified across claude-code / codex / cursor; per-source coverage table with parsed / empty / absent states | VERIFIED | 05, 06 |
| 6 | Persistence | one row per server, approval preserved, detection count bumped | 7 rows; `detection_count` 1 -> 2 -> 3 -> 4 across rescans; identity = server_name + package_name + endpoint | VERIFIED | 06, 19 |
| 7 | Identity descriptors `clientId` / `configScope` | console can say which client declared a server | both NULL for every row. The agent's `McpScanServer` wire struct has no such fields, though the entity and migration 1791400000000 define them. Console renders "Client not measured for this row" | **GAP G2** | 06, 09 |
| 8 | Discovery coverage reaches the console | `mcp_discovery_coverage` populated | 0 rows; `coverageSummary.reported=false`. The agent computes coverage (probe 5) and never posts it: `McpScanRequest` carries no `coverage` field, though the backend DTO accepts one and returns `coverageAccepted` precisely so an agent can detect the drop | **GAP G3** | 08, 09 |
| 9 | Console queue count = API count | equal | `/mcp` header "10 MCP SERVERS" then "13 MCP SERVERS"; API `rows` 10 then `total` 13. Admin queue "10 AWAITING REVIEW". No console error | VERIFIED | 08, 09, 18, 23 |
| 10 | Approve via the console's own API | 200, approval recorded with the admin's id | `PATCH /api/ai-control-plane/mcp/servers/<id>/approval {"status":"approved"}` -> 200, `approvalStatus:"approved"`, `approvedBy: cc6c4681-...` (demo@cera.io) | VERIFIED | 10 |
| 11 | Block via the same API | 200, `blocked` | 200, `approvalStatus:"blocked"`, `MCP_SERVER_BLOCKED` ai_event with `disposition: BLOCKED_BEFORE_EGRESS` | VERIFIED | 10, 17 |
| 12 | Endpoint learns the block: config quarantine | blocked server removed from the config, reversibly | on the next watcher tick: `MCP_QUARANTINE_APPLIED server=p47-unknown-harvester`; the entry is GONE from `~/.claude.json`; a timestamped `.bak` of the original plus a stash holding the exact removed entry, `serversKey`, the post-edit `configSha256` and the backup path. The follow-up rescan posted `servers=2` | VERIFIED | 13, 14, 15, 22 |
| 13 | Endpoint learns the block: PreToolUse gate | `mcp__p47-unknown-harvester__read` blocked | `decision=block` - "DeVoid stopped MCP tool ...: an administrator blocked this MCP server." | VERIFIED | 11 |
| 14 | Classifier block with no admin decision | blocked in every mode | `mcp__p47-codex-harvester__read` -> `decision=block` - "the MCP classifier settled this server as malicious." (org policy has `autoEnforce:false`, `agents.mode:""`) | VERIFIED | 11 |
| 15 | Classifier warn | ask | `mcp__p47-remote-tower__fetch` -> `decision=warn` - "found risky capabilities on this server" | VERIFIED | 11 |
| 16 | Approval clears a classifier warn (twin of 15) | defer | after approving that same server: `decision=allow`, no reason | VERIFIED | 16 |
| 17 | Benign twins (negative controls) | pass through unchanged | `mcp__p47-fs-benign__read` (approved, allow) -> `allow`, no reason; `mcp__p47-codex-fs-benign__list` (pending, allow) -> `allow`, no reason | VERIFIED | 11 |
| 18 | Unknown server | HOLD under enforce, defer otherwise | `mcp__p47-not-configured-at-all__ping` -> `allow`, and the log records `MCP verdict unobtainable (would hold under enforce)` | VERIFIED | 11 |
| 19 | Verdict-cache latency | admin decision honoured within 5 min | the first call after the 5-minute TTL expired served "unobtainable" and deferred while an async refresh ran; the very next call answered correctly. Under `mode=unset` that first call passes ungated | VERIFIED (as designed; see G5) | 11 |
| 20 | Endpoint enforcement reaches the control plane | an `MCP_QUARANTINE_APPLIED` ai_event | never arrived: `mcp governance: evidence enqueue failed eventType=MCP_QUARANTINE_APPLIED ... error="endpoint evidence spool is unavailable: spool-not-enrolled"`. `ai_events` holds only backend-side MCP_SERVER_ADDED / APPROVED / BLOCKED | **GAP G4** | 13, 17 |
| 21 | Console column "4 - RUNTIME EFFECT ENFORCED" | reflects what the endpoint did | it is `approvalStatus === "blocked" ? "Quarantined" : approved ? "Approval only - effect not attested" : "No permitted runtime effect"` - a pure re-render of the org approval field | **GAP G6** | 23, Frontend `app/mcp/mcp-governance-content.tsx:765-774` |
| 22 | Negative control: config with no MCP servers | no rows, nothing posted | empty `mcpServers` in all three clients -> no `MCP scan posted` line, row count unchanged at 13 | VERIFIED | 20 |
| 23 | Negative control: remove the planted entries | removed or stale-marked after the next scan | NEITHER. `devoid mcp scan` reports "no MCP servers configured on this machine (14 sources checked)", and all 7 rows remain, unchanged, still Pending / Approved / Blocked. `last_seen` is frozen and the console renders no last-seen, first-seen or detection-count column at all | **GAP G7** | 21, 19 |

## Gaps

**G1 - a Codex (TOML) MCP server is not governed in real time; only the 6-hourly sweep sees it.**
`internal/mcpwatch` correctly recognises `~/.codex/config.toml` (it is in the registry with
`Watch:true`) and calls `Server.scanAndEnforce(ctx, path)`. That single-file path calls
`mcpgov.DiscoverServersInFile`, which parses with `invmcp.ParseServers` - JSON only - so a TOML
source yields nil, `len(servers)==0`, and the function returns before it posts the scan, before it
reads `/api/v1/ai/mcp/status` and before any quarantine. The full sweep (`singlePath==""`) goes
through `mcpsources.Discover` and reads TOML correctly, which is why probe 5 found all three Codex
servers. Consequence: a developer who adds a malicious MCP server to Codex is governed up to six
hours later (`Policy.sweep_interval` default), while the same server in Claude Code is governed in
about a second. `DiscoverServersInFile` also drops the coverage row, so the watcher path cannot even
report that it failed to understand the file.
Fix shape: route the single-path case through `mcpsources` - `SourceForPath` already resolves the
right format and envelope for exactly this purpose.

**G2 - `clientId` / `configScope` are dead columns.** The backend entity, migration 1791400000000
and the console all support them; `backend.McpScanServer` in the agent has no such JSON fields and
`mcpgov.projectServer` never sets them, so they are NULL for every row ever written. The console is
honest about it ("Client not measured for this row"), but an admin cannot tell whether a server
came from Cursor or from Codex - and the identity key deliberately collapses two clients' same-named
servers into one row, which is the case those columns exist to make visible.

**G3 - discovery coverage never leaves the endpoint.** `mcpsources.Discover` returns a coverage row
per location and `devoid mcp scan` prints it (probe 5). `McpScanRequest` has no `coverage` field, so
`mcp_discovery_coverage` is empty and the console says: "DeVoid cannot say which configuration
sources were read. No endpoint in this scope has reported its discovery coverage." The backend even
returns `coverageAccepted` so an agent can detect a silent drop; nothing in the Go tree reads it. The
honesty contract is implemented on three sides out of four.

**G4 - the endpoint's enforcement action never reaches the control plane.** Every daemon-side MCP
ai_event (`MCP_QUARANTINE_APPLIED`, and the local `MCP_SERVER_BLOCKED`) failed with
`spool-not-enrolled`, on an endpoint whose agent id IS a v4 UUID and whose spool directory exists
(`evidence-spool/9cc7bb95-.../endpoint-evidence.wal`, last written two hours before these events).
The cause slug conflates "agent id is not a UUID" with "spool directory could not be opened", so the
log does not say which. This is what leaves G6 with nothing to attest.

**G5 - the first MCP tool call in each 5-minute window is ungated when no mode is set.**
`mcpVerdictCacheTTL` is five minutes and the refresh is deliberately asynchronous, so an expired
cache serves "unobtainable" to the call that triggered the refresh. Under `enforce` that is a HOLD
and correct. Under the configuration shipped in this rig (`mcp.autoEnforce:false`,
`agents.mode:""`) it is a plain defer, so a blocked server's tool call succeeds once every five
minutes. Observed live in probe 19. It is the documented design; it is worth stating because the org
policy here is exactly the configuration in which it bites.

**G6 - "RUNTIME EFFECT ENFORCED" is not a measurement.** The column is derived solely from
`approvalStatus`. In this run the quarantine really did happen, so the column was accidentally
right; the daemon's attestation for it never arrived (G4). The column would read "Quarantined"
identically for an endpoint that is offline, for a config whose envelope `mcpquarantine` refuses
(flat-map, and every TOML config - the engine only edits `mcpServers` / `servers` JSON), and for a
quarantine refused on hash drift. A column headed with an endpoint claim should be backed by an
endpoint fact.

**G7 - a removed MCP server is never removed or marked stale.** Discovery posts only servers it
found, and the backend only upserts. With every planted entry deleted and the endpoint reporting
"no MCP servers configured", all 7 rows stayed in `mcp_servers` and in the Control Tower,
indistinguishable from live ones - and the console renders neither `lastSeen` nor `detectionCount`,
so nothing on screen even hints at age. An approval granted to a server that no longer exists stays
in force for whatever later re-appears under that name.

**Rig-isolation note (not a product defect, but other lanes should know).** `mcpsources.ResolveEnv()`
reads `%APPDATA%` from the process environment, and `run-daemon-p47.sh` redirects `USERPROFILE`,
`HOME`, `ProgramData` and `CODEX_HOME` but not `APPDATA`. The daemon under test therefore discovers
and reports the developer's real VS Code `User/mcp.json` (playwright, chrome-devtools, nanobanana).
On a real endpoint that is correct behaviour; in this rig it means three real rows sit in the local
`mcp_servers` table. A second daemon another lane started at 21:15:06Z (endpoint `2c5bf33c-...`)
added three more, taking the console from 10 to 13. Adding `APPDATA` and `LOCALAPPDATA` to
`run-daemon-p47.sh` would close it.

## Not exercised

- `surfaces.mcp = "block"` (the site-wide lane gate) and `mcp.allowlistMode` (closed-world
  governance). Both are read by `mcpSurfaceDecision` / `shouldQuarantine`; exercising either needs
  an org-policy change on the SHARED backend that other lanes depend on.
- `autoEnforce = true`, i.e. auto-quarantine of a pending server with a static block, and the
  `mode=enforce` HOLD arm of the gate: same reason.
- Drift-refusal on restore, and restore-on-approve driven from a stash.
- IDE extension discovery, `POST /api/v1/endpoint/check-extension`, and extension quarantine - the
  other half of MCP_IDE_EXTENSION_PROTECTION, outside this lane's question.
- Claude Code project scope (`.mcp.json` under the roots named in `~/.claude.json`), and the Claude
  Desktop / Gemini / Windsurf / VS Code-family sources: all registered, all reported `absent` by the
  coverage table, none planted.
- Signed-policy expiry behaviour (`mcpGovernanceDecision` forcing `enforce=false` when the authority
  is expired).

## Setup notes (how to re-run)

1. Rig must be up: daemon :19390, backend :2353, console :3201 (see the shared brief).
2. `node plant-mcp.cjs plant` - writes `~/.claude.json`, appends a marked block to
   `~/.codex/config.toml` (backing the original up to `codex-config.toml.pre-p47mcp.bak` first) and
   writes `~/.cursor/mcp.json`, all under the ISOLATED home. `empty` writes the zero-server negative
   control; `remove` restores everything.
3. `source iso-env.sh`, then `MSYS_NO_PATHCONV=1 $ISO/devoid.exe mcp scan` - the full sweep with the
   coverage table. `iso-env.sh` mirrors `run-daemon-p47.sh` and additionally redirects `APPDATA` and
   `LOCALAPPDATA` so the CLI does not read the real profile.
4. Console/API: `POST /api/auth/login` on :3201 with an `Origin: http://localhost:3201` header (the
   CSRF middleware rejects it otherwise), keep the cookie jar, then
   `GET /api/ai-control-plane/mcp/servers?siteId=...` and
   `PATCH /api/ai-control-plane/mcp/servers/<id>/approval` with `{"status":"approved"}` or
   `{"status":"blocked"}`.
5. `bash tool-decision.sh <server> <tool>` - one PreToolUse MCP tool call against the daemon, shaped
   the way the hook shapes it.
6. Cleanup: `node plant-mcp.cjs remove`, then delete `$ISO/home/.devoid/mcp-quarantine` (a copy is
   kept at `22-mcp-quarantine-dir-copy/`). Done: `$ISO` is back to its pre-test state and
   `config.toml` is byte-identical to the backup. The 7 `p47-*` rows were left in the shared local
   `mcp_servers` table on purpose, as evidence.

### Screenshots

The console was driven live in the Browser pane (login -> `/mcp` -> Admin > Policies > Approvals &
Exceptions -> back to `/mcp`); those frames are in the session transcript. The corresponding on-disk
captures are the DOM/table dumps `09-console-mcp-page-BEFORE.txt` and
`23-console-mcp-page-AFTER.txt`, which carry the same numbers (10 then 13 servers, 10 awaiting
review, and the per-row verdict / approval / runtime-effect values).
