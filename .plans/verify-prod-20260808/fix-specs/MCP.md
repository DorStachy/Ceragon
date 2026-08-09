# Fix specs - cluster MCP

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

STRUCTURAL ANSWER (the question the brief says matters most — why one subsystem sees node_repl and the MCP Control Tower is blind).

There are not "two scanners with different inventories". There are two SUBSYSTEMS asking two DIFFERENT questions, each of which built its OWN file-discovery + parse stack, and only one of the two stacks can read Codex:

  A. codexmanaged (attestation question: "which governance keys took effect that DeVoid never attested?"). Owns a real, fail-closed TOML reader (C:/cwt/Installers/internal/codexmanaged/toml.go:46 parseTOML, tomlTree accessors :454-516), reads $CODEX_HOME/config.toml + managed_config.toml (config.go:92-122 Load), and enumerates every foreign `[mcp_servers.<id>]` at requirements.go:536-549 with the fixed effect string "un-attested MCP server took effect" (requirements.go:481). It emits KEY + EFFECT ONLY — no command, no args, no env, no capability, no verdict, no approval. It is a divergence surface, not an inventory.
  B. mcpgov/mcprisk/mcpquarantine (inventory+risk+approval question: "what MCP servers exist, what can they do, may they run?"). Owns a JSON-only discovery stack (mcpgov.go:46-73), a JSON-only parser (inventory/mcp/view.go:53-81), a JSON-only quarantine engine (mcpquarantine.go:95-115) — and knows nothing about TOML or about $CODEX_HOME.

So the split is not a disagreement; it is one question asked over an inventory that structurally cannot contain Codex. The recorded diagnosis "there is NO TOML PARSER at all" is FALSE: the product already parses this exact file, today, in production, ten lines away from where node_repl is enumerated.

RECOMMENDATION: share the DISCOVERY layer, not the judgement layer. Introduce one producer (internal/mcpsources) that answers "what MCP server declarations exist on this box, from which client, at which scope, in which file, and which sources could we NOT read/understand". Both A and B become consumers of it: B classifies+registers+approves; A keeps its own attestation verdict but sources its `mcp_servers` enumeration from the SAME accessor so the two can never again disagree about WHICH servers exist. Do NOT merge the verdicts: "un-attested" and "risky" are genuinely different facts and collapsing them would destroy the honesty of both.

FOUR SEPARATE ALLOW-LISTS EXIST TODAY for the same concept, which is why coverage drifts every time someone adds a location:
  sweep/sweep.go:93        (recursive inventory walker)  — IsKnownMCPConfig || IsGeminiSettingsJSON
  mcpgov/mcpgov.go:56      (governance dir scan)         — IsKnownMCPConfig || IsGeminiSettingsJSON
  mcpgov/mcpgov.go:101     (governance file roots)       — + IsClaudeUserConfigJSON
  mcpwatch/watcher.go:120  (real-time watcher)           — IsKnownMCPConfig || IsGeminiSettingsJSON   ← misses .claude.json, which is exactly why the watcher is inert
A single registry with a parity test (F7 test 4) is the anti-recurrence primitive; the vocabulary for the honest-unknown signal already exists in this repo and should be reused verbatim rather than invented (airuntime/registry.go:20-68 ErrUnknownDialect vs ErrIndeterminateDialect vs ErrEmptyPayload — "a check that cannot answer never reports a clean pass").

MEASURED GROUND TRUTH (re-derived on the live box, not taken from FINDINGS.md):
  ~/.claude.json top-level `mcpServers` is EMPTY ({}), and projects["C:/Users/Owner/Documents/Ceragon"].mcpServers = { firecrawl: {type:"http", url:"https://mcp.firecrawl.dev/<key-segment>/v2/mcp"} }.
  => `codegraph` (the ONE server that was discovered) comes from ~/.cursor/mcp.json, NOT from Claude. FINDINGS.md implies Claude global scope was covered; it was not exercised at all.
  ~/.codex/config.toml lines 17-21: [mcp_servers.node_repl] command = 'C:\...\runtimes\cua_node\...\bin\node_repl.exe', args = [], startup_timeout_sec = 120; [mcp_servers.node_repl.env] carries NODE_REPL_TRUSTED_CODE_PATHS, NODE_REPL_NODE_PATH, CODEX_HOME, a named-pipe path.
  %APPDATA%\Code\User\mcp.json EXISTS on this box with {"servers": {playwright, nanobanana, chrome-devtools}} — THREE further undiscovered servers that neither FINDINGS.md nor the deeper diagnosis mentions. The parser already understands the `servers` envelope (view.go:56); only the DIRECTORY is missing from sweep/roots.go:39-63.
  Net live miss: 5 of 6 servers on this endpoint.

DEPLOY ORDER / CONTRACT NOTE THAT CHANGES THE PLAN: the agent-side discovery fix needs NO backend change. McpScanServerDto already declares sourceFile, ingest is per-item tolerant (mcp-governance.service.ts:203-216), and the agent surface is governed by AgentIngestValidationPipe (src/common/pipes/agent-wire-dto.ts) which TOLERATES-AND-DROPS undeclared keys instead of 400-ing — the F25/#233 defect class is already structurally closed on this route. So F7/F7b/F7c ship agent-only, in one release, against the currently-deployed backend:301. Only F7d touches contracts and must land backend-first.


---

## F7 - MCP discovery reads three of eight real config locations and one of three envelopes; replace the four ad-hoc allow-lists with one declarative source registry that also reports what it could not read

- **Severity**: HIGH - A security product printed "[OK] No risky MCP servers found." (cmd/devoid/mcp.go:119) on a box running an un-attested arbitrary-code-execution REPL, while ANOTHER part of the same product was simultaneously naming that server as "un-attested MCP server took effect". Discovery is also the gate on the entire approve/reject/quarantine lane: `devoid mcp status` reject-drives a real config quarantine that PASSED verification, but an undiscovered server has no row, so the two risky servers on this box cannot be rejected by any operator. On the live box the miss is 5 of 6 servers (firecrawl, node_repl, playwright, nanobanana, chrome-devtools missed; codegraph found). Raised above the recorded MEDIUM because the failure mode is a false clean bill of health on the exact class of artifact the Control Tower exists to catch.
- **Side**: agent   **Effort**: L   **Root cause verdict**: REVISED

### Root cause

Four independent, structurally distinct misses — the recorded diagnosis names one of them and gets its mechanism wrong.

(1) CLAUDE CODE PER-PROJECT SCOPE — the file IS read, the nested map is never parsed. mcpgov.DiscoverServers explicitly adds ~/.claude.json as a FILE root (mcpgov.go:68-73, sweep/roots.go:75-77) and reads it. But the parser only ever looks at THREE top-level shapes: `mcpServers`, `servers`, and a flat object (inventory/mcp/view.go:54-78, mirrored in mcp.go:175-205). Claude Code stores per-project servers at projects.<absolute-path>.mcpServers, which no branch reaches. Verified on the live box: top-level `mcpServers` is `{}` and projects["C:/Users/Owner/Documents/Ceragon"].mcpServers = { firecrawl }. Worse, because the top-level map is EMPTY the code falls through to the flat fallback (view.go:69-78) and unmarshals the WHOLE .claude.json into map[string]serverEntry, which fails on the first numeric key (`numStartups`) — so the file returns zero servers and the only signal is a Diag("info", "no MCP servers parsed") that no surface ever shows.

(2) CODEX — the recorded "missed THREE ways" is right about the dir and the basename and WRONG about the parser. sweep.McpConfigDirs (roots.go:39-63) has no ~/.codex entry, and IsKnownMCPConfig (inventory/mcp/mcp.go:68-79) has no config.toml entry — both confirmed. But "there is NO TOML PARSER at all" is false: internal/codexmanaged/toml.go:46 parseTOML is a fail-closed TOML reader that is ALREADY parsing this exact file in production, and codexmanaged.ForeignKeys (requirements.go:536-549) already walks ec.User.tableAt("mcp_servers") and emits node_repl. The defect is that the parse result is confined to the attestation subsystem and is never offered to the inventory subsystem. The daemon even resolves the path already, for a different watcher (daemon/server.go:1933-1940 codexConfigTomlPath).

(3) VS CODE FAMILY — a whole client class is absent and it is NOT a parser gap. %APPDATA%\Code\User\mcp.json exists on this box with {"servers":{playwright,nanobanana,chrome-devtools}}. view.go:56 already decodes the `servers` envelope. Only the directory is missing from McpConfigDirs, whose own comment (roots.go:36-38) asserts VS Code-style "User/settings.json holds no known MCP basename" — true when written, obsolete now that VS Code ships its own User/mcp.json.

(4) THE WATCHER IS INERT BY CONSTRUCTION, TWICE OVER. daemon/server.go:1857-1859 passes only `Dirs: sweep.McpConfigDirs(home)`; sweep.McpConfigFiles (the ~/.claude.json root) is never handed to it and $HOME is deliberately not a root, so no fsnotify event for .claude.json can ever arrive. And even if one did, mcpwatch.Watcher.isMCPConfig (watcher.go:119-121) omits IsClaudeUserConfigJSON, so the event would be discarded at the predicate. ~/.codex is neither watched nor recognised. Finally New() logs a failed fsw.Add at Debug and never retries (watcher.go:77-85), so any client directory created AFTER daemon start is invisible to the watcher for the life of the process.

NOT-PROVEN and explicitly not claimed: whether the 6-hourly daemon sweep (server.go:2252 scanAndEnforce) had already posted codegraph before the manual scan. The wire policy always carries mcp.enabled (ai-security-policy.service.ts:1634-1635) so that path is enabled; the console's 0->1 transition is more likely cadence than a second defect. One latent hazard found while checking: policybundle.McpGovernanceEnabled (bundle.go:253-258) returns TRUE for a nil policy but p.Mcp.Enabled for a non-nil one, and backend.AiPolicyMcp is a value struct (ai_prompt.go:389-393), so any bundle that omits the mcp section silently disables ALL daemon-side MCP governance while a missing bundle enables it — the inverse-default shape. Not F7's cause; listed under risks.

AND THE HONESTY GAP THAT MAKES ALL FOUR INVISIBLE: nothing anywhere records "we looked at N sources, parsed M, and could not read/understand K". runMcpScan (cmd/devoid/mcp.go:100-122) computes blocked/warned over ONLY what discovery returned and prints an unqualified "[OK] No risky MCP servers found." A parse failure (view.go returns nil), an unreadable file (mcpgov.go:113-117 returns nil), and a genuinely clean box are all the same output. That is the exact green-surface-on-a-dead-path shape this programme exists to remove.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/inventory/mcp/view.go:53-81 — ParseServers decodes only top-level mcpServers/servers then a flat map; no projects.<path>.mcpServers branch`
- `C:/cwt/Installers/internal/inventory/mcp/mcp.go:68-79 — IsKnownMCPConfig basename allow-list: mcp.json, claude_desktop_config.json, mcp_config.json, mcp_settings.json, cline_mcp_settings.json, .mcp.json. No config.toml`
- `C:/cwt/Installers/internal/sweep/roots.go:39-63 — McpConfigDirs: <AppData>/Claude, ~/.gemini, ~/.cursor, ~/.windsurf, ~/.codeium/windsurf, ~/.claude. No ~/.codex, no VS Code/Cursor/Windsurf 'User' dirs`
- `C:/cwt/Installers/internal/sweep/roots.go:75-77 — McpConfigFiles returns exactly one path: <home>/.claude.json`
- `C:/cwt/Installers/internal/mcpgov/mcpgov.go:46-73 — DiscoverServers: ReadDir over McpConfigDirs plus the single file root; nothing else can ever be reached`
- `C:/cwt/Installers/internal/mcpgov/mcpgov.go:99-109 — isAllowedConfigFile basename gate with os.Lstat (no link following): the security posture to preserve when adding roots`
- `C:/cwt/Installers/internal/mcpwatch/watcher.go:77-85 — New() adds only opts.Dirs, logs a failed Add at Debug, never retries`
- `C:/cwt/Installers/internal/mcpwatch/watcher.go:119-121 — isMCPConfig omits IsClaudeUserConfigJSON, so the one file root can never pass the predicate`
- `C:/cwt/Installers/internal/daemon/server.go:1857-1866 — runMcpWatch passes Dirs: sweep.McpConfigDirs(home) only`
- `C:/cwt/Installers/internal/daemon/server.go:1933-1940 — codexConfigTomlPath: the daemon ALREADY resolves ~/.codex/config.toml honoring CODEX_HOME, and hands it to a different subsystem`
- `C:/cwt/Installers/internal/codexmanaged/toml.go:46-107 — parseTOML, a fail-closed TOML reader already shipping`
- `C:/cwt/Installers/internal/codexmanaged/config.go:92-122 — Load reads managed_config.toml + config.toml under a resolved CODEX_HOME, with ReadErrs distinguishing 'absent' from 'could not look'`
- `C:/cwt/Installers/internal/codexmanaged/requirements.go:536-549 — ForeignKeys enumerates every non-devoid [mcp_servers.<id>] and emits effectForeignMcp`
- `C:/cwt/Installers/internal/codexmanaged/requirements.go:481 — effectForeignMcp = "un-attested MCP server took effect"`
- `C:/cwt/Installers/internal/sweep/sweep.go:93 — a THIRD allow-list for the same concept in the recursive walker`
- `C:/cwt/Installers/cmd/devoid/mcp.go:100-122 — runMcpScan's unqualified "[OK] No risky MCP servers found."`
- `C:/cwt/Installers/internal/airuntime/registry.go:20-68 — the existing honest-unknown vocabulary (ErrUnknownDialect / ErrIndeterminateDialect / ErrEmptyPayload) to mirror`
- `live box: ~/.claude.json top-level mcpServers == {} ; projects["C:/Users/Owner/Documents/Ceragon"].mcpServers == {firecrawl:{type:http,url:https://mcp.firecrawl.dev/<seg>/v2/mcp}}`
- `live box: ~/.codex/config.toml:17-21 [mcp_servers.node_repl] command='...\node_repl.exe' args=[] ; :22 [mcp_servers.node_repl.env] NODE_REPL_TRUSTED_CODE_PATHS`
- `live box: %APPDATA%/Code/User/mcp.json == {"servers":{playwright,nanobanana,chrome-devtools}} — three further undiscovered servers`
- `live box: ~/.cursor/mcp.json == {"mcpServers":{codegraph}} — the ONE server that was discovered came from Cursor, not Claude`

### Fix

ONE mechanism, not four patches: collapse the four ad-hoc allow-lists into a single declarative SOURCE REGISTRY that is the only thing that knows where MCP config lives, what format it is in, and which envelope it uses — and make discovery return COVERAGE alongside servers so "we could not read this" is a first-class result instead of silence.

New package internal/mcpsources (leaf; imports codexmanaged; imported by mcpgov + mcpwatch + sweep):

  type Kind string      // "dir" | "file"
  type Format string    // "json" | "toml"
  type Envelope string  // "mcpServers" | "servers" | "flat" | "claude-projects" | "toml-mcp-servers"
  type Scope string     // "user" | "project" | "machine"
  type Env struct { Home, AppData, LocalAppData, CodexHome string }   // injected, so tests drive the real entry point (existing tests already t.Setenv HOME/USERPROFILE)
  type Source struct { ClientID string; Scope Scope; Kind Kind; Format Format; Envelopes []Envelope; Basenames []string; Watch bool; PathsFor func(Env) []string }
  var Registry = []Source{ ... }   // the ONLY place a location is named
  type ParseState string // "parsed" | "empty" | "absent" | "unreadable" | "unparseable" | "unrecognized"
  type SourceCoverage struct { ClientID, Scope, Format, Path string; State ParseState; ServerCount int; Detail string }  // Detail is CLOSED vocabulary, never file bytes
  type RawServer struct { ClientID, Scope, SourceFile, ConfigKeyPath, ServerName, Command, Transport, URL string; Args []string; Env map[string]string }
  func Discover(env Env) (servers []RawServer, coverage []SourceCoverage)

Registry contents (the complete, re-derived set — the implementer does not invent these):
  claude-code    user     file json [mcpServers, claude-projects]  <home>/.claude.json                                                                   watch
  claude-code    project  file json [mcpServers]                   <p>/.mcp.json for each p in the .claude.json `projects` keys (+ githubRepoPaths)      no-watch
  claude-desktop user     dir  json [mcpServers]                   win %APPDATA%/Claude · mac ~/Library/Application Support/Claude · linux ~/.config/Claude   watch
  codex          user     file toml [toml-mcp-servers]             $CODEX_HOME/config.toml (env override, else <home>/.codex/config.toml)                 watch
  codex          machine  file toml [toml-mcp-servers]             $CODEX_HOME/managed_config.toml                                                        watch
  cursor         user     dir  json [mcpServers]                   <home>/.cursor                                                                         watch
  cursor         project  dir  json [mcpServers]                   <p>/.cursor for each known project root                                                no-watch
  windsurf       user     dir  json [mcpServers]                   <home>/.windsurf, <home>/.codeium/windsurf                                             watch
  gemini-cli     user     dir  json [mcpServers]                   <home>/.gemini (settings.json, path-dispatched as today)                               watch
  vscode         user     dir  json [servers]                      win %APPDATA%/Code/User · mac ~/Library/Application Support/Code/User · linux ~/.config/Code/User   watch
  vscode-insiders / vscodium / cursor-app / windsurf-app  user dir json [servers]   same shape with 'Code - Insiders' | 'VSCodium' | 'Cursor' | 'Windsurf'  watch
  vscode         project  dir  json [servers, mcpServers]          <p>/.vscode/mcp.json for each known project root                                       no-watch

Project roots are NOT obtained by walking $HOME (roots.go:36-38 correctly refuses that): they come free from the `projects` and `githubRepoPaths` maps already present in ~/.claude.json — a bounded, already-read list. Cap it (e.g. 64 most-recent) so a long-lived .claude.json cannot turn discovery into a directory crawl.

Parsers — exactly one implementation each, no new TOML code:
  JSON: extend internal/inventory/mcp/view.go with ParseServersScoped(data []byte) []ScopedRecordView, where ScopedRecordView = RecordView + {ConfigKeyPath, ProjectPath}. Keep the three existing top-level branches BYTE-IDENTICAL and ADD a `projects` walk: for each key p, decode projects[p].mcpServers with the same serverEntry type, emitting ConfigKeyPath = "projects["+p+"].mcpServers". Keep ParseServers as a thin wrapper so no existing caller changes. Also fix the flat-fallback misfire: attempt the flat branch only when the document has NEITHER mcpServers NOR servers NOR projects.
  TOML: add internal/codexmanaged/mcp_export.go exporting UserMcpServers(codexHome) ([]McpServerEntry, EffectiveConfig) and ManagedMcpServers(codexHome) (...), projecting ec.User.tableAt("mcp_servers") (and its nested "env" sub-table) into McpServerEntry{Name, Command, Args, Env, Transport, URL} using the EXISTING parseTOML/tableAt machinery. Skip Name == devoidMcpID ("devoid") exactly as ForeignKeys:545-547 does, so we never inventory or quarantine our own audit server. Dependency direction is mcpsources -> codexmanaged (no cycle; codexmanaged imports nothing from mcpgov today). This is the concrete 'share one discovery source of truth' change: ForeignKeys' mcp branch is then re-expressed over the same accessor, so the two subsystems can never again disagree about WHICH servers exist — only about what to say about them.

Coverage is the honesty fix and is what makes this maintainable. Every registry entry yields a coverage row on every scan, including `absent`. A path that sits in a registered directory and whose basename matches *mcp*.{json,toml,yaml,yml,json5,jsonc} but is NOT in that source's Basenames yields State="unrecognized" (basename only — never contents, never a read). A file that exists but fails to parse yields "unparseable" and CONTRIBUTES NO SERVERS (fail-closed, matching codexmanaged's posture). A file that exists but cannot be read yields "unreadable" (mirror codexmanaged/config.go:75-85 noteReadErr: ENOENT is an observation, anything else is the absence of one).

runMcpScan then prints a coverage block and QUALIFIES its verdict line. New copy, in the house voice already shipped elsewhere:
  all rows parsed/empty/absent:  "[devoid] [OK] No risky MCP servers found across N configuration sources."
  otherwise:                     "[devoid] [!] No risky MCP servers found in the N sources DeVoid could read. K sources were NOT read (listed above): this is a measured absence over part of the machine, not a clean result."
Never suppress a negative; state its scope. Exit code stays 0 (this is not an enforcement failure), but the unqualified [OK] must be unreachable while any row is unreadable/unparseable/unrecognized.

Rewire the watcher off the same registry: daemon/server.go:1857 passes mcpsources.WatchTargets(env) (dirs AND the parent dirs of file sources, deduped); mcpwatch.isMCPConfig becomes mcpsources.IsRegisteredConfig(path); New() keeps a pending list for directories that did not exist at start and re-Adds them on each sweep tick, so a Codex/VS Code install after daemon start is picked up in minutes rather than 6 hours.

NO CONTRACT CHANGE, NO FEATURE FLAG, SHIPS ON. Backend:301 already accepts these servers (McpScanServerDto.sourceFile is declared, ingest is per-item tolerant, and the route is agent-wire lenient), so a 7.8.31 agent posts firecrawl/node_repl/playwright/nanobanana/chrome-devtools to the CURRENTLY DEPLOYED backend and the Control Tower fills in with no server-side work. Coverage stays LOCAL in this change (CLI output + a security.RecordEvents evidence row, both of which need no contract); the console surface is F7d.

### Changes

**Installers** - `internal/mcpsources/mcpsources.go`

NEW. Source/Env/Kind/Format/Envelope/Scope/ParseState/SourceCoverage/RawServer types; the Registry table above; Discover(env) (servers, coverage); WatchTargets(env) []string; IsRegisteredConfig(path) bool; SourceForPath(path) (Source, bool); ResolveEnv() Env (os.UserHomeDir + APPDATA/LOCALAPPDATA + CODEX_HOME, mirroring daemon/server.go:1935-1940). Preserve mcpgov.isAllowedConfigFile's posture for every FILE source: basename allow-list + os.Lstat (no link following); DIRECTORY sources keep os.Stat as today.

**Installers** - `internal/mcpsources/parse_json.go`

NEW. Envelope-directed JSON parse delegating to invmcp.ParseServersScoped; maps ScopedRecordView -> RawServer; classifies the outcome into ParseState. Bound reads with mcpgov.MaxConfigFileSize (5 MiB).

**Installers** - `internal/mcpsources/parse_toml.go`

NEW. Calls codexmanaged.UserMcpServers / ManagedMcpServers; maps McpServerEntry -> RawServer with ConfigKeyPath "mcp_servers.<id>"; maps EffectiveConfig.UserParseErr -> "unparseable", ReadErrs -> "unreadable", !UserPresent -> "absent".

**Installers** - `internal/codexmanaged/mcp_export.go`

NEW. Exported McpServerEntry{Name, Command string; Args []string; Env map[string]string; Transport, URL string} plus UserMcpServers(codexHome) ([]McpServerEntry, EffectiveConfig) and ManagedMcpServers(codexHome) (...). Both read the existing tomlTree via tableAt("mcp_servers") and the nested "env" sub-table; skip id == devoidMcpID. No new parser, and no behaviour change to Detect/Verify/ForeignKeys.

**Installers** - `internal/codexmanaged/requirements.go`

ForeignKeys (:536-549): replace the inline ec.User.tableAt(tableMcpServers) walk with a call to the shared projection helper from mcp_export.go so both subsystems enumerate from one code path. Effect strings, ordering and the devoidMcpID skip are unchanged — this is a de-duplication, not a semantic change.

**Installers** - `internal/inventory/mcp/view.go`

Add ScopedRecordView (RecordView + ConfigKeyPath, ProjectPath) and ParseServersScoped(data). Keep ParseServers as a wrapper returning the top-level subset so sweep/mcpwatch callers are untouched. Add the projects walk, routing each entry through the SAME remote/launcher/spec logic at lines 100-142 so firecrawl comes out as PackageManager="mcp-remote" with RequestedSpec sanitized to scheme://host by sanitizeRemoteURL (mcp.go:142-164) — the API-key-bearing path segment must not survive. Gate the flat fallback (:69-78) on the document having none of mcpServers/servers/projects.

**Installers** - `internal/inventory/mcp/mcp.go`

Do NOT add config.toml to IsKnownMCPConfig (basename dispatch is JSON-only by design and feeds the recursive sweep walker). Update the package doc (lines 9-14) to name the projects envelope, and point at internal/mcpsources as the authority on WHERE configs live.

**Installers** - `internal/sweep/roots.go`

McpConfigDirs / McpConfigFiles become thin adapters over mcpsources.Registry (filtered to Kind==dir / Kind==file) so there is exactly one list. Keep the exported signatures — daemon/server.go:1858, mcpgov.go:46,68 and the existing tests all call them.

**Installers** - `internal/mcpgov/mcpgov.go`

DiscoverServers becomes: servers, coverage := mcpsources.Discover(env); classify each with mcprisk.Classify(mcprisk.FromRecord(view, view.Env)); project to backend.McpScanServer as today. Add DiscoverServersWithCoverage() ([]backend.McpScanServer, []mcpsources.SourceCoverage) and keep DiscoverServers() as the coverage-dropping wrapper. DiscoverServersInFile routes through mcpsources.SourceForPath so a single-file watcher event is parsed with the right format/envelope. Preserve the (SourceFile, ServerName) de-dup key at :36-43 — with more sources this is now load-bearing.

**Installers** - `internal/mcpwatch/watcher.go`

isMCPConfig (:119-121) -> mcpsources.IsRegisteredConfig(path). New() (:77-85): keep unresolvable dirs in a pendingDirs slice and expose RetryPendingWatches() for the sweep tick; log the initial failure at Info with the dir, not Debug. scan() (:157-176) additionally routes TOML sources through mcpgov.DiscoverServersInFile, since mcp.Scanner.ScanConfig is JSON-only.

**Installers** - `internal/daemon/server.go`

runMcpWatch (:1856-1866): Dirs -> mcpsources.WatchTargets(mcpsources.ResolveEnv()). runOneSweep (:2252): call RetryPendingWatches() before scanAndEnforce so a client installed after daemon start becomes watched. scanAndEnforce: use DiscoverServersWithCoverage and record one evidence row per non-parsed coverage entry via s.recordMcpEvidence("mcp_source_unreadable", "warn", ...) with the closed-vocabulary Detail — no file contents, no bytes.

**Installers** - `cmd/devoid/mcp.go`

runMcpScan (:57-123): use mcpgov.DiscoverServersWithCoverage. Print a COVERAGE section (client, scope, path, state, server count) before the per-server list. Replace the unconditional "[OK] No risky MCP servers found." at :119 with the two qualified forms in `fix`. Also fix :73-76: "no MCP servers configured on this machine." must not print when any coverage row is unreadable/unparseable/unrecognized — say what was not read instead.

### Rejected alternatives

- Add config.toml to mcp.IsKnownMCPConfig and write a second TOML parser inside internal/inventory/mcp. Rejected: it duplicates codexmanaged/toml.go (a deliberately fail-closed reader whose exact semantics — the bare-key re-scoping hazard, literal-quoted project paths, unmatched-quote fail-closed — were derived from a frozen Codex corpus), and IsKnownMCPConfig is basename-dispatched into the RECURSIVE sweep walker (sweep.go:93), so a stray config.toml anywhere in any project tree would be fed to the MCP parser.
- Add ~/.codex to sweep.McpConfigDirs and stop. Rejected: it fixes one of four misses, leaves the four allow-lists intact, and silently re-opens the same hole the next time a client ships a new location — the pattern the brief asks to end.
- Have mcpgov call codexmanaged.ForeignKeys and treat every foreign key as a discovered server. Rejected: ForeignKeys emits key+effect only, deliberately (it is an attestation boundary that must never carry command/args/env), so the Control Tower would get a name with no capabilities, no verdict and nothing to approve — a row that looks governed and is not.
- Walk $HOME for .mcp.json / mcp.json. Rejected by the existing correct reasoning at sweep/roots.go:36-38 (measured: ~/.claude alone held 13,799 files). Project roots come from the bounded projects/githubRepoPaths maps already inside ~/.claude.json.
- Merge codexmanaged and mcpgov into one governance subsystem. Rejected: they answer different questions with different failure modes (attestation divergence, which must fail closed on a malformed managed file, vs inventory+approval, which must fail soft). Sharing the discovery layer gets the coverage benefit without collapsing two verdicts into one.
- Suppress the "[OK] No risky MCP servers found." line entirely when coverage is partial. Rejected: hiding the negative is the mirror image of overstating it. State the result and its scope.

### Tests (each carries a defeat step)

- TestDiscover_ClaudeProjectScope (internal/mcpgov): temp home via the existing tempHome helper (mcpgov_claude_test.go:24-34); write ~/.claude.json with top-level "mcpServers":{} AND projects["C:/x"].mcpServers.firecrawl = {"type":"http","url":"https://mcp.firecrawl.dev/SECRETSEG/v2/mcp"} plus a numeric sibling key ("numStartups":7) to reproduce the flat-fallback misfire. Assert exactly one server: ServerName==firecrawl, PackageManager=="mcp-remote", RemoteURL=="https://mcp.firecrawl.dev", and assert the emitted backend.McpScanServer JSON does NOT contain the substring "SECRETSEG". DEFEAT STEP: temporarily point the same fixture at the OLD invmcp.ParseServers (the pre-fix wrapper) and assert it returns zero servers — if that sub-assertion passes green the test is exercising the new projects branch and not an incidental top-level parse; if the main test still passes with the projects walk deleted, it is vacuous.
- TestDiscover_CodexTomlMcpServers (internal/mcpgov): t.Setenv CODEX_HOME to a temp dir; write the EXACT live block ([mcp_servers.node_repl] command='C:\\...\\node_repl.exe', args = [], startup_timeout_sec = 120, plus [mcp_servers.node_repl.env] with NODE_REPL_TRUSTED_CODE_PATHS), and additionally a [mcp_servers.devoid] table. Assert node_repl is discovered with Command == the exe path and Env["NODE_REPL_TRUSTED_CODE_PATHS"] non-empty, and that `devoid` is NOT discovered (we never inventory our own audit server). DEFEAT STEP 1: remove the codex entries from mcpsources.Registry and assert discovery returns zero AND a coverage row for codex disappears entirely — proving the registry, not an incidental path, is what reaches the file. DEFEAT STEP 2: corrupt the file to invalid TOML and assert servers==0 AND coverage state=="unparseable" — proving fail-closed rather than silent-empty; if state comes back "parsed" or "absent" the coverage plumbing is inert.
- TestCoverage_UnreadableSourceSuppressesTheOkLine (cmd/devoid, or a testable extraction of runMcpScan's rendering): build a coverage set containing one row with State=="unreadable" and zero risky servers; assert the rendered output contains "measured absence over part of the machine" and does NOT contain "No risky MCP servers found across". DEFEAT STEP: flip that one row to State=="parsed" and assert the unqualified [OK] line reappears — if both variants render identically the qualification is decorative and the test is worthless.
- TestRegistryParity_WatcherCoversEveryWatchableSource (internal/mcpsources): for every Source with Watch==true, assert (a) mcpsources.WatchTargets(env) contains the directory fsnotify would need (the dir itself for Kind==dir, filepath.Dir(path) for Kind==file) and (b) mcpsources.IsRegisteredConfig accepts a synthetic path under that source for each of its Basenames. DEFEAT STEP: add a throwaway Source{ClientID:"parity-canary", Watch:true} to the Registry inside the test body and assert the parity check FAILS for it before the wiring exists — this is the anti-recurrence test for the four-allow-lists defect and must be demonstrably capable of going red.
- LIVE VERIFICATION on the enrolled endpoint (CND34521VN), run after the 7.8.31 agent lands: `devoid mcp scan` must list firecrawl (warn, network-egress), node_repl (see F7b), playwright, nanobanana, chrome-devtools and codegraph, and the console MCP Control Tower must go 1 -> 6 rows. DEFEAT STEP: rename ~/.codex/config.toml aside, re-run, and assert node_repl DISAPPEARS from the listing while a coverage row for the codex source reports state="absent" — if the server persists it is being read from a stale backend row rather than re-discovered, and if the coverage row silently vanishes the honest-absence signal is not wired.

### Risks

1. VOLUME + IDENTITY COLLISION. mcp_servers' functional unique key is (org_id, COALESCE(endpoint_id,''), server_name, COALESCE(package_name,'')) — source_file is NOT in it (migration 1782440000000; entity doc). Two clients that configure the same server name+package (e.g. `filesystem` in both Cursor and VS Code) collapse into ONE row whose source_file flip-flops on each upsert, and one approve/reject decision then governs both. Pre-existing, but this change makes it reachable for the first time. Do NOT change the identity here (index rebuild on a live multi-tenant table plus an approval-semantics decision); F7d adds the visible clientId/scope descriptors and F7c fixes the matching daemon-side collapse.
2. AUTO-QUARANTINE ON A CONFIG WE CANNOT EDIT. Prod presets set mcp.autoEnforce=true (ai-policy-presets.ts:264). Once node_repl is discovered and (after F7b) classified block, scanAndEnforce will attempt eng.Quarantine on a .toml path; mcpquarantine is JSON-only (:95-115) and will REFUSE — the safe outcome, but today it refuses with ErrConfigUnparseable ("config is not parseable JSON") about a perfectly valid TOML file. F7c fixes the reason token. Nothing edits ~/.codex in this change, deliberately: the Codex lane's desktop-safe posture exists because that write has bricked the desktop app before.
3. PRIVACY. RawServer.Env now carries Codex env values (absolute paths, a named-pipe path, CODEX_HOME). It must never leave mcprisk: Classify already reduces env to class+ruleId+span (mcprisk.go:419-460) and backend.McpScanServer has no env field. Add a compile-time guard test that backend.McpScanServer declares no Env/Command/Args field. Separately note an EXISTING inconsistency, not introduced here: mcp_servers.source_file already carries a raw absolute path including the OS username, while codexmanaged deliberately hashes project paths and emits a coarse class (requirements.go:492-517). Discovery now feeds more such paths. Flag for an owner decision; do not silently change the existing field's semantics.
4. PERFORMANCE. Registry expansion adds roughly 15 stat/ReadDir probes plus up to 64 bounded project-root probes per scan. All non-recursive, all size-bounded at 5 MiB. Do not let project-root expansion become a walk.
5. OLD AGENT / NEW BACKEND and NEW AGENT / OLD BACKEND: neither is affected. No wire field changes, the route is agent-wire lenient (src/common/pipes/agent-wire-dto.ts), and backend:301 already declares sourceFile. A 7.8.30 agent keeps posting the old subset; a 7.8.31 agent posts more rows to the same DTO.
6. LATENT, ADJACENT, DO NOT FIX HERE: policybundle.McpGovernanceEnabled (bundle.go:253-258) returns true for a nil policy but p.Mcp.Enabled for a non-nil one, and backend.AiPolicyMcp is a value struct — so a bundle that omits `mcp` disables all daemon-side MCP governance while a missing bundle enables it. The deployed backend always emits the section (ai-security-policy.service.ts:1634), so it is not live today; close it as its own item with an explicit tri-state.
7. cmd/devoid/main.go:206,237 gates the whole `devoid mcp` surface on MCP_GOVERNANCE_ENABLED (default ON, an off-switch rather than an off-by-default flag) and the backend write routes mirror it (mcp-feature-flags.config.ts, 403 when off). It does not violate the ship-ON invariant, but it is a way to silence this surface and deserves an explicit owner decision.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- IMPORT CYCLE, will not compile as specified: changes[] tells internal/mcpsources/parse_json.go to 'Bound reads with mcpgov.MaxConfigFileSize (5 MiB)' (declared at internal/mcpgov/mcpgov.go:25) while simultaneously rewriting mcpgov.DiscoverServers to call mcpsources.Discover. mcpsources -> mcpgov -> mcpsources.
- RECURSIVE-WALK REGRESSION, measured: 'McpConfigDirs / McpConfigFiles become thin adapters over mcpsources.Registry' feeds sweep/roots.go:117-134 candidateRoots and therefore sweep.go:88 walk.Walk. %APPDATA%/Code/User on this box = 29,948 files / 5,918 dirs, vs the 13,799-file ~/.claude the package header (roots.go:80-95) cites as the reason to refuse a walk. The registry must not be the walk-root list.
- UNFLAGGED ENFORCEMENT BLAST RADIUS: with mcp.autoEnforce on (ai-policy-presets.ts:264/301/357) and shouldQuarantine (daemon/mcp_governance.go:35-49) auto-quarantining pending+block, F7 alone causes the daemon to EDIT newly-discovered JSON configs on first sweep. Concretely on this box: nanobanana in %APPDATA%/Code/User/mcp.json has env GEMINI_API_KEY, which scanSecretEnv (mcprisk.go:426-458) rates HIGH on the NAME alone -> Verdict block -> entry deleted from the user's VS Code config. The spec's risks only mention the TOML file it cannot edit.
- PRESET CITATION IMPRECISE: risk 2 says 'Prod presets set mcp.autoEnforce=true (ai-policy-presets.ts:264)'. :264 is BALANCED. ESSENTIAL is false (:201), and RECOMMENDED_AI_SECURITY_POLICY.mcp.autoEnforce is pinned FALSE by src/ai-security-policy/ai-security-policy.constants.mcp-uploads-paths.spec.ts:11,25. FINDINGS.md never records this org's preset, so the blast radius is unmeasured, not known.
- LIVE-FIXTURE ERROR: the spec asserts ~/.claude.json top-level mcpServers is `{}`. It is ABSENT. Same downstream behaviour, but the F7 test fixture as written does not reproduce the live shape.
- TOML COVERAGE BOUND UNSTATED: codexmanaged.parseTOML (toml.go:50-105, parseValue :364-388, parseStringArray :393-418) accepts only single-line arrays and fails closed on any unclassifiable line. A Codex config with a multi-line args array yields UserParseErr, so codex contributes ZERO servers under coverage='unparseable'. Honest, but the spec presents the shared-parser reuse as if it closes node_repl generally. It closes it on single-line configs (which this box happens to be).

**Corrected root cause**: The mechanism as written is CORRECT and I re-verified every citation in C:/cwt/Installers@55cd0ae: view.go:53-81 (three top-level branches only, flat fallback at :69-78), mcp.go:68-79 (IsKnownMCPConfig, no config.toml), roots.go:39-63 / :75-77, mcpgov.go:46-73 and :99-109, mcpwatch/watcher.go:77-85 and :119-121, daemon/server.go:1857-1858 (Dirs: sweep.McpConfigDirs(home) only) and codexConfigTomlPath at :1934-1940, codexmanaged/toml.go:46 parseTOML, config.go:92-122 Load, requirements.go:536 ForeignKeys with the mcp_servers walk at :543-549 and the devoidMcpID skip at :545-547, effectForeignMcp at :481, sweep/sweep.go:93, cmd/devoid/mcp.go:73-76 and the unqualified [OK] at :117-119. The 'there is NO TOML PARSER' rebuttal is right. Live ground truth re-derived independently and matches to the line: ~/.codex/config.toml:17-21 is [mcp_servers.node_repl] with args=[] and command='C:\...\node_repl.exe', :22 is [mcp_servers.node_repl.env] with NODE_REPL_TRUSTED_CODE_PATHS; %APPDATA%/Code/User/mcp.json exists with {servers:{playwright,nanobanana,chrome-devtools}}; ~/.cursor/mcp.json holds codegraph; ~/.claude.json projects['C:/Users/Owner/Documents/Ceragon'].mcpServers = {firecrawl}. ONE factual correction: ~/.claude.json has NO top-level `mcpServers` key at all (it is ABSENT, not `{}` as the spec states). The downstream conclusion is unchanged — env1 unmarshals cleanly with nil maps, len(servers)==0, the flat fallback then fails on the first non-object top-level value (numStartups) and the file yields zero servers with only Diag('info','no MCP servers parsed') — but the spec's stated fixture is wrong and the F7 test fixture must reproduce the ABSENT key, not an empty one, or it tests a shape the box does not have.


**Corrected approach**: Keep the source-registry mechanism; make four corrections before an implementer touches it.
(a) Break the import cycle: put MaxConfigFileSize (or a copy) in internal/mcpsources and have mcpgov reference mcpsources' constant, not the reverse.
(b) Split the RECURSIVE-WALK root list from the DISCOVERY registry. Add `SweepWalk bool` to Source (default false) and have sweep.candidateRoots consume only Registry entries with SweepWalk==true, preserving today's six dirs. Never let a newly-registered discovery dir become a filepath.WalkDir root.
(c) Decide, in the spec, what happens to auto-quarantine on the newly-covered sources on first sweep. Either add an explicit one-release discovery-only stage for sources whose ClientID is new, or state plainly that the first 7.8.31 sweep will DELETE entries from customers' VS Code / Cursor / project configs wherever mcp.autoEnforce is on. Do not ship this silently.
(d) State the TOML coverage bound: codexmanaged.parseTOML (toml.go:364-418 parseValue, :50-105 parseTOML) is a single-line-only subset that fails closed on any line it cannot classify, so a Codex config with a multi-line `args = [` array yields UserParseErr and contributes ZERO servers under a coverage state of 'unparseable'. Honest, but it means the headline miss (node_repl) is only closed on single-line configs. Either accept that explicitly or extend parseTOML for multi-line arrays behind the existing frozen-corpus tests.


**Missing changes the reviewer found**:

- **Installers** `internal/mcpsources/mcpsources.go` - Own MaxConfigFileSize here (mcpgov.go:25 currently declares it) so mcpsources has no import edge to mcpgov — as written, parse_json.go importing mcpgov.MaxConfigFileSize while mcpgov.DiscoverServers calls mcpsources.Discover is a Go import cycle and will not compile.
- **Installers** `internal/mcpsources/mcpsources.go` - Add `SweepWalk bool` to Source and export SweepWalkRoots(env) so sweep/roots.go:117-134 candidateRoots can keep exactly today's six recursive roots. Without this, adding %APPDATA%/Code/User to the Registry adds a measured 29,948-file / 5,918-dir recursive walk to every startup and 6-hourly sweep.
- **Installers** `internal/daemon/mcp_governance.go` - Not listed in the spec at all, but load-bearing: enforcePathScoping (:346-378) and the shouldQuarantine (:35-49) pending+block path now reach five new source classes. Either gate newly-registered ClientIDs to discovery-only for one release, or record the decision that first-sweep auto-quarantine on VS Code / Cursor / project configs is intended.
- **Installers** `internal/mcpgov/mcpgov_claude_test.go` - Test 1's fixture must OMIT the top-level `mcpServers` key entirely (the live shape) rather than setting it to `{}`; the spec's stated fixture does not reproduce the box.

**Collateral risk**: 1. UNFLAGGED FLEET BEHAVIOR CHANGE — this is the biggest risk in the cluster and the spec does not name it. daemon/mcp_governance.go:35-49 shouldQuarantine returns true for a `pending` server whose staticVerdict=='block' whenever enforce is on, and mcp.autoEnforce is true in BALANCED/HARDENED/LOCKED_DOWN (Backend src/ai-security-policy/ai-policy-presets.ts:264, :301, :357). On THIS box the newly-discovered `nanobanana` entry in %APPDATA%/Code/User/mcp.json carries env GEMINI_API_KEY with a real-looking value; mcprisk.scanSecretEnv (mcprisk.go:426-458) fires CapSecretEnv at SeverityHigh on the NAME alone, Verdict (:642-650) returns block, and mcpquarantine will happily edit that file because it IS JSON. So F7 alone — with no part of F7b — causes the daemon to delete a legitimate developer's VS Code MCP server on the first sweep after the release. The spec's risk 2 discusses only the TOML file it cannot edit.
2. RECURSIVE-WALK BLOWUP. The change 'McpConfigDirs / McpConfigFiles become thin adapters over mcpsources.Registry' silently expands sweep.candidateRoots (roots.go:117-134) -> baselineRoots (:137-146) -> sweep.go:88 walk.Walk. Measured on this box just now: %APPDATA%/Code/User holds 29,948 files across 5,918 directories — more than double the 13,799 files the package header (roots.go:80-95) cites as the reason NOT to walk ~/.claude. Startup sweep and the 6-hourly sweep both regress. Nothing else in the cluster protects against this.
3. enforcePathScoping (mcp_governance.go:346-378) re-parses every discovered source with invmcp.ParseServers and quarantines on blocked-path overlap. Once project-scope entries are discovered, this loop gains reach it never had; the spec does not mention it.
4. Does NOT regress anything proven working: the codegraph discovery->console path is preserved (same mcpgov projection, same (SourceFile,ServerName) de-dup at mcpgov.go:36-43), command-lane/DLP/browser/Codex-wire/supply-chain lanes are untouched.

**Effort correction**: L is credible only after (b) and (c) are decided; with the sweep-root split, the enforcement-staging decision and the four-test suite it sits at the top of L (5d). Do not plan it at the bottom of the band.


---

## F7b - Even after discovery is fixed, node_repl classifies as ALLOW — mcprisk cannot see that an MCP server whose launcher IS an interpreter is an open code channel, so "No risky MCP servers found." would still print

- **Severity**: HIGH - This is the half of the finding nobody wrote down, and without it F7 delivers a Control Tower row that says `allow / no capabilities` for an un-attested arbitrary-code-execution REPL — arguably worse than not listing it, because now the product has looked straight at it and pronounced it safe. It is the difference between F7 closing the finding and F7 relocating it.
- **Side**: agent   **Effort**: M   **Root cause verdict**: CONFIRMED
- **Also closes**: F7
- **Depends on**: F7

### Root cause

Traced the live entry through mcprisk.Classify (mcprisk.go:236-289) by hand: command = '<USER_PROFILE>\AppData\Local\OpenAI\Codex\runtimes\cua_node\<hash>\bin\node_repl.exe', args = [], env = the NODE_REPL_* block.

  - joinLauncher blob is the .exe path alone. shellExecRules (:142-155) need `sh -c`, a curl|sh pipe, `eval`, or base64|sh — none present. filesystemBroadRules (:174-192): the broad-toplevel regex wants a POSIX top-level dir or $HOME/~; a backslashed Windows path matches nothing. networkEgressRules (:161-171): no curl/wget, and PackageManager is not "mcp-remote".
  - The interpreter detector is gated twice and fails both gates. shellast.InterpreterExec (shellast.go:672-675) -> InterpreterExecInfo (:597-657) first requires InterpreterFamily(BaseName(cmd)) to hit the map at shellast.go:473-479 {python, python2, python3, node, nodejs, deno, bun, perl, ruby, sh, bash, zsh, ksh, dash, pwsh, powershell} — "node_repl" is not a member. Even if it were, InterpreterExecInfo requires an INLINE-CODE FLAG with a non-empty body (-c/-e/-lc/--command/--eval, or PowerShell -Command/-EncodedCommand); args is [] so d.Matched stays false.
  - untrusted-source (:325-343) is gated by isNodePyLauncher (:347-353) on {npx,bunx,uvx,pipx,pnpm,yarn,bun,npm,uv}. An absolute-path command is never even considered, even though isUntrustedSpec (:378-411) would have called that exact Windows path untrusted.
  - secret-env (:419-460): no key matches secretEnvNameRe/awsEnvNameRe (NODE_REPL_TRUSTED_CODE_PATHS ends in PATHS, not TOKEN/SECRET/KEY), and the one high-entropy-looking value is a 64-char hex digest, which dlp.scanHighEntropy explicitly suppresses via isBenignDeveloperIdentifier (dlp.go:1310-1316, "git SHA / hash / UUID … never a standalone high-entropy secret").

  => findings == [] => Verdict (mcprisk.go:642-650) returns "allow" => runMcpScan's blocked/warned counters stay 0 => the unqualified [OK] line prints anyway.

The structural blind spot: mcprisk asks "does this launcher CONTAIN code?" — the right question for a shell command. For an MCP server the right question is "is this launcher a code CHANNEL?", because the transport itself supplies the code at runtime. A bare interpreter/REPL as an MCP command needs no inline body to be arbitrary execution; that is the entire point of node_repl.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/mcprisk/mcprisk.go:236-289 — Classify: the complete rule set applied to command+args`
- `C:/cwt/Installers/internal/mcprisk/mcprisk.go:255-265 — the only interpreter path, gated on shellast.InterpreterExec`
- `C:/cwt/Installers/internal/shellast/shellast.go:473-479 — interpreterFamilies map; node_repl absent`
- `C:/cwt/Installers/internal/shellast/shellast.go:597-657 — InterpreterExecInfo requires an inline-code flag with a non-empty body`
- `C:/cwt/Installers/internal/shellast/shellast.go:548-558 — InterpreterFamily: exact map, then a textnorm-normalized retry, then ""`
- `C:/cwt/Installers/internal/mcprisk/mcprisk.go:325-353 — untrusted-source gated on isNodePyLauncher, so an absolute-path command is never judged`
- `C:/cwt/Installers/internal/mcprisk/mcprisk.go:378-411 — isUntrustedSpec already classifies a Windows/absolute path as untrusted; it is simply never reached for a command`
- `C:/cwt/Installers/internal/mcprisk/mcprisk.go:419-460 — scanSecretEnv: NODE_REPL_* names miss secretEnvNameRe/awsEnvNameRe`
- `C:/cwt/Installers/internal/dlp/dlp.go:1305-1330 — scanHighEntropy suppresses a 64-hex digest via isBenignDeveloperIdentifier`
- `C:/cwt/Installers/internal/mcprisk/mcprisk.go:642-650 — Verdict: no HIGH and no MEDIUM => allow`
- `C:/cwt/Installers/cmd/devoid/mcp.go:100-122 — blocked/warned both 0 => the unqualified [OK] line`
- `live box ~/.codex/config.toml:17-21 — command is node_repl.exe with args = []`

### Fix

Add ONE structural rule, not a node_repl regex (that would be the F8 whack-a-mole mistake transplanted into a new package).

(a) shellast: add InterpreterFamilyStem(name) (family string, normalizedOnly, viaReplStem bool). After the existing exact-map and Unicode-normalized lookups both miss, try ONE stem normalization — strip a trailing "_repl"/"-repl"/"_shell"/"-shell" from the basename and re-look-up. node_repl -> node -> FamilyJS; python_repl -> FamilyPython; a bare "my-repl" still returns "". Leave InterpreterFamily / InterpreterExecInfo / InterpreterExec / interpreterFamilies BYTE-UNCHANGED so the command lane (internal/toolrisk) is provably unaffected.

(b) mcprisk.Classify: after the existing interpreter block (mcprisk.go:255-265) add
      fam, normOnly, _ := shellast.InterpreterFamilyStem(in.Command)
      if fam != "" && !hasScriptOperand(in.Args) {
          found = append(found, Finding{Class: CapShellExec, RuleID: "shell-exec-interpreter-repl", Severity: SeverityHigh, Start: 0, End: len(blob), NormalizedOnly: normOnly})
      }
    where hasScriptOperand reports whether at least one non-flag arg exists that is not consumed by a preceding value-taking flag. So `node server.js` and `python -m pkg` HAVE an operand and stay ALLOW; `node`, `node_repl`, `python -i`, `bun repl` do NOT and become HIGH. That gate is what keeps the rule off the single most common stdio MCP shape in the ecosystem — a rule that blocked half the fleet's legitimate servers would be reverted within a day and would teach operators to ignore the tower.

(c) A WARN-tier companion for the residue F7 now surfaces: an MCP server whose Command is an absolute path to a binary that is neither a registry launcher nor a recognized interpreter is not necessarily dangerous, but it is un-inventoriable — no package identity, no version, nothing to check against a catalog. Emit Class=CapUntrustedSource, RuleID="untrusted-source-local-executable", Severity=MEDIUM (warn, never block) by lifting the isNodePyLauncher gate at mcprisk.go:328 for the COMMAND itself and reusing isUntrustedSpec. This is the honest statement of what we know: not "this is malware", but "this server has no checkable identity".

Effect on the live box: node_repl -> shell-exec HIGH -> Verdict block -> the tower shows `block / Shell execution`, the CLI prints "1 block, 0 warn", and the [OK] line is unreachable. firecrawl -> network-egress-remote-transport MEDIUM -> warn (already correct once discovered). The three VS Code npx-launched servers stay allow unless their own args say otherwise.

Agent-only. No wire change: `shell-exec` and `untrusted-source` are existing capability slugs already in the backend taxonomy and already labelled and tone-mapped by the console (Frontend app/mcp/mcp-governance-content.tsx:18-32). Only the ruleId strings are new, and ruleId is a free-text wire field the console renders in a chip title (:200-210).

### Changes

**Installers** - `internal/shellast/shellast.go`

Add InterpreterFamilyStem(name) (family string, normalizedOnly, viaReplStem bool): exact map -> textnorm-normalized map -> strip a trailing _repl/-repl/_shell/-shell from BaseName and retry. Do not modify InterpreterFamily (:548-558), InterpreterExecInfo (:597), InterpreterExec (:672) or interpreterFamilies (:473-479).

**Installers** - `internal/mcprisk/mcprisk.go`

In Classify, after the shellast.InterpreterExec block (:255-265), add the shell-exec-interpreter-repl HIGH rule gated on InterpreterFamilyStem AND !hasScriptOperand(args). Add unexported hasScriptOperand(args []string) bool that skips flags and their values (keep the value-taking flag list local; do not import inventory/mcp's unexported helpers). In scanUntrustedSource (:325-343), when isNodePyLauncher is false, additionally test the COMMAND with isUntrustedSpec and emit untrusted-source-local-executable at SeverityMedium.

**Installers** - `internal/mcprisk/mcprisk.go`

Package doc (:26-31) and the CapShellExec comment (:63): state explicitly that for an MCP server the interpreter rule does NOT require an inline body, and why (the transport supplies the code), so the next reader does not 'simplify' it back to InterpreterExec.

**Frontend** - `app/mcp/mcp-governance-content.tsx`

Verification only, no functional change expected: confirm shell-exec and untrusted-source are already in CAPABILITY_LABELS (:18-24) and CAPABILITY_DANGER (:27-32), and that unknown ruleIds render safely in the chip title (:200-210). Listed so the implementer checks rather than assumes.

### Rejected alternatives

- Add a regex for `node_repl` (or for NODE_REPL_TRUSTED_CODE_PATHS) to mcprisk's rule tables. Rejected under the standing F8 lesson: one regex per vendor's REPL binary is unbounded whack-a-mole. The generalizable fact is 'the launcher is an interpreter and nothing tells it what to run'.
- Fire shell-exec HIGH on ANY interpreter-family command regardless of args. Rejected: {"command":"node","args":["server.js"]} is the most common stdio MCP shape in the ecosystem; blocking it under autoEnforce would quarantine most legitimate servers and destroy trust in the verdict.
- Treat every non-registry absolute-path command as HIGH. Rejected: locally-built and vendor-bundled MCP servers are legitimate and common; the honest statement is 'no checkable identity' (WARN), not 'dangerous' (BLOCK).
- Ask the server what it can do (an MCP tools/list handshake) to decide capability. Rejected outright: violates the NEVER-EXECUTE invariant stated in three package docs (mcprisk.go:11-15, mcpgov.go:1-8, view.go:11-14) — classification must never launch the thing it is classifying.

### Tests (each carries a defeat step)

- TestClassify_InterpreterReplLauncherIsHigh (internal/mcprisk): Input{Command: `C:\fixture\OpenAI\Codex\runtimes\cua_node\abc\bin\node_repl.exe`, Args: nil} must yield a CapShellExec finding with RuleID "shell-exec-interpreter-repl" at SeverityHigh and Verdict(findings)==VerdictBlock. DEFEAT STEP (the discrimination proof, and the more important half): the SAME test must also assert that Input{Command:"node", Args:[]string{"C:\\srv\\server.js"}} and Input{Command:"npx", Args:[]string{"-y","@modelcontextprotocol/server-github"}} both remain VerdictAllow. If the hasScriptOperand gate is deleted the second half goes red — proving the test exercises the gate and not merely the presence of a rule.
- TestInterpreterFamilyStem_ReplSuffix (internal/shellast): node_repl -> FamilyJS with viaReplStem true; python_repl -> FamilyPython; "my-repl" and "repl" -> "". DEFEAT STEP: assert in the same test that the UNMODIFIED InterpreterFamily("node_repl") still returns "" — if that assertion fails, the stem logic leaked into the command lane and toolrisk verdicts changed fleet-wide, which is the one outcome this split entry point exists to prevent.
- TestToolRiskUnchangedForReplCommandWord (internal/toolrisk): pin the existing verdict for a shell command whose command word is `node_repl` (and for `node_repl -e '...'`) against the pre-change expectation. DEFEAT STEP: temporarily point mcprisk's new rule at shellast.InterpreterFamily instead of InterpreterFamilyStem and confirm this test goes red — it is the blast-radius fence, and a fence that cannot fail is not a fence.
- TestScanOutput_NoOkLineWhenAnyServerBlocks (cmd/devoid): render runMcpScan's summary with one block-verdict server and full clean coverage; assert the output contains "1 block" and does NOT contain "No risky MCP servers found". DEFEAT STEP: change that server's verdict to allow and assert the [OK] line reappears — identical output in both variants means the summary is not reading the verdict at all.

### Risks

1. OVER-BLOCK IS THE REAL RISK. mcp.autoEnforce is true in the shipped RECOMMENDED/BALANCED presets, so a HIGH verdict on a pending server drives an automatic config edit (daemon/mcp_governance.go:35-50, :209-232). The hasScriptOperand gate is the only thing keeping `node server.js` / `python -m mcp_server_x` / `npx -y @scope/pkg` on the allow path; it must be covered by a test that FAILS if the gate is removed, or the first fleet rollout quarantines legitimate servers. Consider reviewing (c)'s WARN tier against a corpus of real MCP configs before shipping — warn is non-interrupting, so its blast radius is a console chip, not an edit.
2. Widening interpreterFamilies itself would leak into internal/toolrisk and change COMMAND-lane verdicts fleet-wide. The separate InterpreterFamilyStem entry point exists precisely to prevent that, and the toolrisk pin test is the fence.
3. Old agent / new backend: none — no contract change. New agent / old backend: none — ruleId is free text and the console renders it generically.
4. Interaction with F7c: on this box the new block verdict drives a quarantine attempt against a TOML file the engine cannot edit. That refusal is correct and fail-safe, but until F7c lands it is recorded with a false reason string.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- SELF-CONTRADICTION with real over-block consequence: the fix defines hasScriptOperand as 'at least one non-flag arg that is not consumed by a preceding value-taking flag', then asserts `python -m pkg` 'HAS an operand and stays ALLOW'. Under that definition -m consumes pkg and there is NO operand, so it blocks. Live case on this box: %APPDATA%/Code/User/mcp.json `nanobanana` = {command:'python', args:['-m','nanobanana_mcp_server.server']}.
- RULE (c) IS NEAR-UNIVERSAL ON WINDOWS: mcprisk.isUntrustedSpec:389-390 returns true for any string containing a backslash, so untrusted-source-local-executable would fire on 'C:\Program Files\nodejs\npx.cmd' — the Command of two of the three VS Code servers on this box. A MEDIUM that fires on almost every row degrades the console rather than informing it.
- STATED LIVE EFFECT IS WRONG: 'The three VS Code npx-launched servers stay allow unless their own args say otherwise.' Only two are npx-launched; nanobanana is python-launched, and it already classifies HIGH via scanSecretEnv (mcprisk.go:426-458 — GEMINI_API_KEY is a secretEnvNameRe name hit at SeverityHigh) with or without F7b. The post-fix matrix must be restated from source.
- PRESET MIS-CITATION in risk 1: 'mcp.autoEnforce is true in the shipped RECOMMENDED/BALANCED presets'. RECOMMENDED_AI_SECURITY_POLICY.mcp.autoEnforce is pinned FALSE (Backend src/ai-security-policy/ai-security-policy.constants.mcp-uploads-paths.spec.ts:11,25); ESSENTIAL is false (ai-policy-presets.ts:201). BALANCED/HARDENED/LOCKED_DOWN are true (:264/:301/:357).
- Minor citation drift (does not change the verdict): scanUntrustedSource is 319-342 not 325-343; isUntrustedSpec 380-414 not 378-411; scanSecretEnv 426-458 not 419-460; interpreterFamilies 473-487 not 473-479.

**Corrected root cause**: Root cause CONFIRMED and re-derived by hand against the same live entry; the trace is right in every link. Verified: mcprisk.Classify (mcprisk.go:236-289), the only interpreter path gated on shellast.InterpreterExec (:255-265), interpreterFamilies (shellast.go:473-487 — node_repl absent), InterpreterFamily (:548-558), InterpreterExecInfo requiring an inline-code flag with a non-empty body (:597-657, the `if strings.TrimSpace(body) == ""` guard at :640), InterpreterExec (:672-675), scanUntrustedSource's isNodePyLauncher gate (:319-322, the launcher set at :347-353), isUntrustedSpec (:380-414), scanSecretEnv (:426-458), Verdict (:642-650). Also verified the stem approach is mechanically viable: shellast.BaseName (:418-431) strips both the path and a trailing .exe/.cmd/.bat/.com/.ps1 (exeExts at :413), so 'C:\...\bin\node_repl.exe' -> 'node_repl' before any stem strip. Two line-number drifts of ~6 lines (scanUntrustedSource is 319-342 not 325-343; scanSecretEnv is 426-458 not 419-460; isUntrustedSpec is 380-414 not 378-411) — cosmetic, the code says what is claimed.


**Corrected approach**: Keep rule (a) and (b); specify hasScriptOperand exhaustively and drop or re-scope rule (c).
(1) hasScriptOperand must be defined as a CLOSED table in the spec, not as a principle. The principle as written ('a non-flag arg not consumed by a preceding value-taking flag') BLOCKS `python -m pkg`, which the same paragraph promises stays ALLOW. Split the flag table in two: SCRIPT-SUPPLYING flags whose value IS the operand (python `-m`/`-mMOD`, ruby `-r`, node `--import`/`--require`, deno `run`, bun `run`) and NON-supplying value flags (python `-W`, node `--max-old-space-size`, etc.). Presence of a script-supplying flag with a non-empty value => hasScriptOperand true. Enumerate them in the spec so the implementer does not re-derive them.
(2) Drop rule (c), or scope it to commands whose resolved path is outside the known installer/registry launcher set. As written it fires on essentially every Windows MCP server, because isUntrustedSpec (mcprisk.go:389-390) returns true for ANY string containing a backslash — including 'C:\Program Files\nodejs\npx.cmd', which is the Command of BOTH playwright and chrome-devtools on this box. A WARN that fires on nearly every row is not a signal.
(3) Restate the expected live matrix from source rather than from assumption (see problems).


**Missing changes the reviewer found**:

- **Installers** `internal/mcprisk/mcprisk.go` - hasScriptOperand must carry an explicit SCRIPT-SUPPLYING flag table (python -m/-mMOD, ruby -r, node --import/--require, deno/bun `run` subcommand) whose value counts AS the operand. Without it `python -m pkg` blocks, contradicting the spec's own stated behaviour and auto-quarantining nanobanana on this box.
- **Installers** `internal/mcprisk/mcprisk_test.go` - Add `{Command:"python", Args:["-m","nanobanana_mcp_server.server"]}` (the live VS Code entry) to TestClassify_InterpreterReplLauncherIsHigh's allow-side assertions, with the DEFEAT STEP being: delete the script-supplying-flag branch and confirm THIS case flips to block. Without it the discrimination proof does not cover the shape that actually breaks.
- **Installers** `internal/mcprisk/mcprisk.go` - If rule (c) is kept, scope it: isUntrustedSpec (:389-390) treats any backslash-bearing string as untrusted, so 'C:\Program Files\nodejs\npx.cmd' (playwright, chrome-devtools) warns. Add an installer-path/known-launcher exemption or drop (c).

**Collateral risk**: 1. OVER-BLOCK ON THE MOST COMMON MCP SHAPE. `python -m <module>` is live on this box (nanobanana). Under the spec's own definition of hasScriptOperand it becomes HIGH -> Verdict block -> with mcp.autoEnforce on (ai-policy-presets.ts:264/301/357) the daemon DELETES it from %APPDATA%/Code/User/mcp.json. This is the exact 'revert within a day, operators learn to ignore the tower' outcome the spec says it is guarding against.
2. The split entry point (InterpreterFamilyStem, leaving InterpreterFamily / InterpreterExecInfo / InterpreterExec / interpreterFamilies byte-unchanged) is the right fence and DOES protect the command lane proven working in PL/CC-1 — internal/toolrisk consumes InterpreterExecInfo, which is untouched. The pin test is correctly specified.
3. No regression to DLP, browser masking, Codex wire, signed-bundle, or the package gate — none of them import mcprisk.
4. Deploy-order safe both directions: no wire field changes; ruleId is free text and the console renders unknown ruleIds generically (Frontend app/mcp/mcp-governance-content.tsx:200-210), while shell-exec and untrusted-source are already in CAPABILITY_LABELS (:19-24) and CAPABILITY_DANGER (:28-33). Verified, so the Frontend 'verification only' change entry is accurate.

**Effort correction**: M is credible ONLY once the operand table is fixed in the spec. If the implementer has to derive the script-supplying-flag table and then corpus-test it against real MCP configs, this is a solid M-to-L. Keep M, but the table is a precondition, not an implementation detail.


---

## F7c - Enforcement cannot act on the newly-discovered sources and lies about why: TOML configs are refused as "not parseable JSON", and only ONE config file per server name is ever quarantined

- **Severity**: MEDIUM - Neither bug loses enforcement (both fail safe — no edit happens), but both produce a FALSE STATEMENT in a durable evidence record and a silently partial enforcement, which is precisely the honesty class this programme protects. Both become reachable the moment F7 lands, so they must ship in the same release, not after it.
- **Side**: agent   **Effort**: M   **Root cause verdict**: CONFIRMED
- **Depends on**: F7

### Root cause

(1) FALSE REFUSAL REASON. mcpquarantine.Quarantine (mcpquarantine.go:95-115) unconditionally json.Unmarshals the source file and, on failure, returns fmt.Errorf("%w: %v", ErrConfigUnparseable, err) where ErrConfigUnparseable's text is "mcpquarantine: config is not parseable JSON — refusing to edit" (:27). daemon.quarantineServer (mcp_governance.go:276-291) writes that error verbatim into the evidence row's `reason` field. So once a Codex .toml server is blocked, the product records — durably, in the hash-chained evidence store — that a perfectly valid TOML config "is not parseable JSON". The refusal is the correct ACTION; the stated reason is false and will send an investigator hunting a corrupted file that is not corrupted. The same shape applies to serversKeyOf (:56-64) returning ErrServerNotFound for a Claude project-scoped server whose entry lives at projects.<path>.mcpServers rather than a top-level key — again a true refusal with a misleading reason.

(2) ONE SOURCE FILE PER SERVER NAME. scanAndEnforce builds `sourceOf := map[string]string{}` and assigns sourceOf[sv.ServerName] = sv.SourceFile in a loop (mcp_governance.go:181-186). mcpgov de-duplicates on (SourceFile, ServerName), so the same name declared in two different configs legitimately yields two servers — and the last one wins the map. The quarantine loop (:204-247) then edits exactly one file, and enforcePathScoping (:346-379) iterates `for _, src := range sourceOf` and so also visits only the surviving file. Today this is nearly unreachable because discovery finds one or two files; after F7 (Claude user + Claude project + Codex + Cursor + VS Code — around eight sources) a shared name such as `filesystem`, `github` or `playwright` in two clients is the common case, and an admin's Block would silently disarm only one of them.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/mcpquarantine/mcpquarantine.go:26-31 — ErrConfigUnparseable text: "config is not parseable JSON — refusing to edit"`
- `C:/cwt/Installers/internal/mcpquarantine/mcpquarantine.go:95-115 — Quarantine json.Unmarshals any source path; serversKeyOf (:56-64) only knows top-level mcpServers/servers`
- `C:/cwt/Installers/internal/daemon/mcp_governance.go:276-291 — quarantineServer copies err.Error() straight into the evidence reason field`
- `C:/cwt/Installers/internal/daemon/mcp_governance.go:181-186 — sourceOf is map[string]string; last writer wins`
- `C:/cwt/Installers/internal/daemon/mcp_governance.go:204-247 — the quarantine loop reads sourceOf[row.ServerName] and skips when empty`
- `C:/cwt/Installers/internal/daemon/mcp_governance.go:346-379 — enforcePathScoping iterates the same collapsed map`
- `C:/cwt/Installers/internal/mcpgov/mcpgov.go:36-43 — the (SourceFile, ServerName) de-dup key that makes duplicate names across files legitimate`
- `C:/cwt/Installers/internal/daemon/mcp_governance.go:216-232 — the existing correct posture: a refused edit still emits MCP_SERVER_BLOCKED, so the verdict is never lost`
- `C:/cwt/Installers/internal/daemon/mcp_governance.go:310-332 — restoreServer already keys on (SourceFile, ServerName) from the stash list and is therefore already multi-file correct`

### Fix

(1) Name the refusal honestly and keep the fail-safe. Add two typed errors to internal/mcpquarantine:
      ErrConfigFormatUnsupported = errors.New("mcpquarantine: config format cannot be edited by this engine (JSON only) — refusing to edit")
      ErrServerScopeUnsupported  = errors.New("mcpquarantine: server is declared in a config scope this engine cannot edit — refusing to edit")
   Quarantine/Restore dispatch on the source's registry entry (mcpsources.SourceForPath) BEFORE reading: Format != "json" -> ErrConfigFormatUnsupported; envelope == "claude-projects" -> ErrServerScopeUnsupported. Only a genuine JSON syntax error keeps ErrConfigUnparseable. daemon.quarantineServer maps the typed error to a CLOSED reason token in the evidence details — "format-not-editable:toml", "scope-not-editable:claude-projects", "config-unparseable", "hash-drift", "already-quarantined" — instead of interpolating a free-text Go error into a durable record. The MCP_SERVER_BLOCKED ai_event still fires (mcp_governance.go:216-232 already guarantees this), so the verdict reaches the console even though no edit occurred: the server shows `block` with enforcement NOT applied, which is the truthful rendering.
   DELIBERATELY OUT OF SCOPE: teaching the engine to EDIT Codex TOML. Writing to ~/.codex is the operation the Codex lane already refuses to perform blindly (the desktop-safe posture exists because that write has bricked the desktop app), and a byte-preserving TOML rewrite with a reversible stash is separate, riskier work. Refusing honestly is the right day-one behaviour; the operator remedy is a documented manual removal plus the existing approval row.

(2) sourceOf becomes map[string][]string. Append instead of assign at mcp_governance.go:184; the quarantine loop iterates every source for the name and calls quarantineServer per file, emitting ONE enforcement event per (server, sourceFile) so a partial success is visible as a partial success. enforcePathScoping's seenFiles de-dup (:347-352) already handles the flattened list. shouldQuarantine/shouldRestore are pure functions and need no change; restoreServer is already correct.

### Changes

**Installers** - `internal/mcpquarantine/mcpquarantine.go`

Add ErrConfigFormatUnsupported and ErrServerScopeUnsupported to the var block (:26-31). In Quarantine (:95) and Restore, dispatch on mcpsources.SourceForPath(sourceFile) before os.ReadFile: non-JSON format -> ErrConfigFormatUnsupported; claude-projects envelope -> ErrServerScopeUnsupported. Keep ErrConfigUnparseable strictly for a real JSON syntax failure. Update the package doc (:1-9) to state that the engine edits JSON top-level server maps only and that every other shape is an honest refusal rather than an unsupported edit.

**Installers** - `internal/daemon/mcp_governance.go`

quarantineServer (:276-291): add reasonTokenFor(err) mapping the typed errors to the closed token set; put the token in details["reason"] and drop the raw err.Error() from the durable record (keep it on the local logger.Debug line). sourceOf (:181-186) becomes map[string][]string with append; the quarantine loop (:204-247) iterates the slice and emits one enforcement event per source file; enforcePathScoping (:346) takes map[string][]string.

**Installers** - `internal/daemon/mcp_governance.go`

emitMcpEnforcementEvent call sites: when a server is blocked across N source files and only M edits succeeded, pass the PER-FILE quarantined result rather than one aggregate boolean, so a partial enforcement is never rendered as a full one.

### Rejected alternatives

- Teach mcpquarantine to edit TOML now. Rejected for this release: a byte-preserving, reversible TOML edit of ~/.codex/config.toml is exactly the write the Codex lane already declines to perform automatically (the daemon's own 'R5 route would brick it' posture), and getting it wrong takes the user's AI tool down. Honest refusal first; a scoped TOML editor with a stash and drift guard is its own spec.
- Quarantine the Claude project-scoped entry by rewriting projects.<path>.mcpServers. Rejected here for the same reason plus a sharper one: ~/.claude.json is a large, high-churn state file that Claude Code rewrites constantly, so the hash-drift guard would refuse on nearly every restore. Needs its own design.
- Leave the reason string as-is because the refusal is safe anyway. Rejected: a durable evidence record stating that a valid file is corrupt sends an investigator down a false path, and it is the exact 'the surface says X, the system did Y' pattern this programme exists to remove.

### Tests (each carries a defeat step)

- TestQuarantine_TomlSourceRefusedWithFormatReason (internal/mcpquarantine + internal/daemon): call Quarantine on a valid ~/.codex/config.toml fixture containing [mcp_servers.node_repl]; assert errors.Is(err, ErrConfigFormatUnsupported), assert the file on disk is byte-identical afterwards, and assert the daemon-side evidence detail reason == "format-not-editable:toml". DEFEAT STEP: assert in the same test that the detail does NOT contain the substring "parseable JSON" — then temporarily revert the dispatch and confirm THAT assertion fails, proving the test is reading the real reason string and not a constant.
- TestQuarantine_EveryOccurrenceOfAName (internal/daemon): two JSON configs (a Cursor mcp.json and a VS Code User/mcp.json) both declaring a server named `filesystem`; backend status row approval == "blocked"; run scanAndEnforce and assert BOTH files had the entry removed and that TWO enforcement events were emitted with distinct sourceFile values. DEFEAT STEP: revert sourceOf to map[string]string and confirm the test fails with exactly one file edited and one event — if it still passes, the fixture is not actually producing two same-named servers (check the mcpgov (SourceFile, ServerName) de-dup key) and the test is vacuous.
- TestEnforcementEventStillEmittedOnRefusal (internal/daemon): with a TOML source and a blocked approval, assert an MCP_SERVER_BLOCKED ai_event IS enqueued even though no edit occurred, and that its quarantined flag is false. DEFEAT STEP: force quarantineServer to return true and assert the event's quarantined flag flips to MCP_QUARANTINE_APPLIED — if both paths produce the same event the flag is not wired and the console cannot distinguish 'blocked and removed' from 'blocked, nothing changed'.

### Risks

1. Event volume rises to one enforcement event per (server, sourceFile) instead of per server. Bounded by discovery size (single digits per endpoint) and it is the honest shape — a partial enforcement rendered as a full one is the defect being fixed.
2. NEW HONESTY GAP CREATED BY THIS FIX, must be handled: the console's Enforcement column keys off approvalStatus === 'blocked' (Frontend app/mcp/mcp-governance-content.tsx:222-229) and renders 'Quarantined' regardless of whether an edit actually happened. After this change a Codex-sourced blocked server renders 'Quarantined' while nothing was edited. Fold the correction into F7d's console work, or at minimum stop the column from asserting an edit the daemon refused.
3. No wire or contract change; old/new agent and old/new backend are unaffected.
4. Reason tokens must stay a closed vocabulary. Interpolating a Go error into a durable, hash-chained evidence record is how the false 'not parseable JSON' statement got there; do not reintroduce free text.

### ADVERSARIAL REVIEW - verdict: SOUND

- Every citation verified exactly in C:/cwt/Installers@55cd0ae: mcpquarantine.go:26-31 (ErrConfigUnparseable text 'config is not parseable JSON — refusing to edit'), :95-115 Quarantine with the two ErrConfigUnparseable wraps at :105 and :113, serversKeyOf :57-64 knowing only top-level mcpServers/servers, daemon/mcp_governance.go:276-291 quarantineServer writing err.Error() verbatim into the evidence reason, :181-186 sourceOf as map[string]string with last-writer-wins, :204-247 the quarantine loop, :346-378 enforcePathScoping over the same collapsed map, mcpgov.go:36-43 the (SourceFile,ServerName) de-dup that makes duplicate names legitimate, :216-232 the block-event-on-refusal posture, :310-332 restoreServer already keyed on (SourceFile,ServerName). Both defects are real, both fail safe, both become reachable the moment F7 lands. The closed reason-token vocabulary is the right call and preserves honesty discipline (it makes the record MORE precise, never a negative look positive).
- MINOR — make Restore explicit in changes[]: Restore (mcpquarantine.go:167-190) carries the SAME two ErrConfigUnparseable wraps at :183 and :187. The `fix` prose says 'Quarantine/Restore dispatch', but the changes[] entry only spells out Quarantine's read-order change. An implementer working from changes[] alone will leave Restore emitting the false 'not parseable JSON' text on a TOML source.
- MINOR — dependency direction: mcpquarantine becomes a consumer of mcpsources.SourceForPath. That is cycle-free today (mcpsources -> codexmanaged only; codexmanaged imports aicanary/airuntime/airuntimeintegrity/brand/controls/endpointcontrolauth/envfallback/logger and nothing in the mcp lane), but it inherits F7's cycle if mcpsources ends up importing mcpgov. State the constraint so it is checked at implementation time.
- MINOR — event-volume note is right but incomplete: with sourceOf becoming map[string][]string, emitMcpEnforcementEvent fires per (server, sourceFile) in BOTH the quarantine loop (:204-247) and the two else-branches (:236-247), and enforcePathScoping (:373) also emits. Say explicitly that all three call sites move to per-file, or the else-branches will still aggregate.


---

## F7d - Surface discovery coverage in the console, and make a NEW client location addable without shipping a binary — a signed-bundle source registry with an immovable built-in floor

- **Severity**: MEDIUM - Without this, the coverage truth F7 computes stops at the endpoint: the console still shows a bare server count with no way to tell 'no risky servers' from 'we could not read half this machine', and its empty state actively asserts a clean world from an absence of rows. And every future client location still requires an agent release, which is the maintainability question the brief asks to answer. Ranked below F7/F7b because the dangerous silence is already broken locally by F7.
- **Side**: multi   **Effort**: L   **Root cause verdict**: UNPROVEN
- **Depends on**: F7

### Root cause

Not a defect with a single line to pin — a missing surface plus a maintainability property, stated as a design requirement. What IS pinned: (a) there is no coverage concept anywhere on the wire. McpScanIngestionDto (Backend src/ai-governance/dto/mcp-scan-ingestion.dto.ts) carries only endpoint + clientCorrelationId + servers[]; McpServerRowShape (packages/shared-contracts/src/ai-governance-contract.ts:658-678) has no client, scope or coverage field; the console's empty state (Frontend app/mcp/mcp-governance-content.tsx:147-152) reads "NO MCP SERVERS DETECTED … MCP servers appear here once AI coding agents with MCP configurations are detected in this account", which is an assertion about the world made from an absence of rows. (b) There is no mechanism by which a new config location reaches a deployed fleet other than an agent release: every location is a Go literal (sweep/roots.go:39-63) compiled into the binary. (c) The console does carry a genuinely honest precedent to extend rather than replace — the reconciliation paragraph at mcp-governance-content.tsx:136-146 already explains why two counts legitimately differ; coverage belongs next to it.

### Evidence (read at origin/main)

- `Backend src/ai-governance/dto/mcp-scan-ingestion.dto.ts — McpScanIngestionDto: endpoint?, clientCorrelationId?, servers[]. No coverage`
- `Backend packages/shared-contracts/src/ai-governance-contract.ts:658-678 — McpServerRowShape has no clientId / configScope / coverage`
- `Backend src/entities/mcp-server.entity.ts — mcp_servers columns; identity is (org_id, COALESCE(endpoint_id,''), server_name, COALESCE(package_name,'')) per migration 1782440000000`
- `Backend src/main.ts:59-67 and src/common/pipes/agent-wire-dto.ts — AgentIngestValidationPipe: agent routes tolerate-and-drop undeclared keys, so a new agent field is silently DISCARDED (not 400) until the backend declares it; this is what makes backend-first mandatory for the field to have any effect`
- `Backend src/ai-governance/services/mcp-governance.service.ts:189-227 — upsertFromScan, the insertion point for a coverage write`
- `Frontend app/mcp/mcp-governance-content.tsx:127-152 — the count header, the reconciliation paragraph, and the EmptyNoData copy that asserts a clean world from zero rows`
- `C:/cwt/Installers/internal/sweep/roots.go:39-63 — every location is a compiled-in Go literal`
- `Backend src/ai-security-policy/ai-security-policy.service.ts:1634-1649 — the wire `mcp` policy section the endpoint already receives on every signed bundle (rev 6->7->8 observed activating in ~5 min live), the natural carrier for additional sources`

### Fix

Two additive pieces, BACKEND FIRST (invariant 5), and neither is a flag.

(A) COVERAGE ON THE WIRE AND ON SCREEN.
  - shared-contracts: APPEND McpDiscoveryState ('parsed'|'empty'|'absent'|'unreadable'|'unparseable'|'unrecognized'), McpScanCoverageShape { clientId: string; scope: 'user'|'project'|'machine'; format: 'json'|'toml'; sourceFile: string | null; state: McpDiscoveryState; serverCount: number; detail: string | null }, an optional coverage?: McpScanCoverageShape[] on the scan request shape, and optional clientId/configScope on McpServerRowShape. Append only, never re-order (the LOCK-8 discipline the file already follows). APPLY TO ALL THREE MIRRORS IN PARITY: Backend/packages/shared-contracts, the workspace packages/shared-contracts, and Ceragon-Intelligence/packages/shared-contracts.
  - Backend: McpScanCoverageDto + coverage? on McpScanIngestionDto (per-item tolerant like servers). New entity + migration mcp_discovery_coverage (org_id, site_id, endpoint_id, client_id, scope, format, source_file, state, server_count, detail, last_seen) with a functional unique index (org_id, COALESCE(endpoint_id,''), client_id, scope, COALESCE(source_file,'')). upsertFromScan atomically REPLACES the (org, endpoint) coverage set when coverage is supplied, so a source that disappeared cannot linger as 'parsed'. Expose coverage[] + coverageReported:boolean on the console read (GET /api/ai-control-plane/mcp/servers). Refresh clientId/configScope in upsertServer's mutable-descriptor block WITHOUT touching the approval lifecycle.
  - Frontend: a Coverage panel above the table, and a rewrite of the two dishonest strings. Count header -> "<N> MCP Servers · <M> of <K> configuration sources read". EmptyNoData description becomes coverage-conditional: coverageReported false -> "This endpoint's agent does not report discovery coverage. DeVoid cannot say which configuration sources were read."; all sources parsed -> "No MCP servers are configured in the <K> sources DeVoid read on this endpoint."; unread sources present -> "DeVoid could not read <J> of <K> configuration sources on this endpoint. This is a measured absence over part of the machine, not a clean result." Note the ordering consequence and do not paper over it: because the agent route tolerates-and-drops, a 7.8.31 agent talking to backend:301 has its coverage field SILENTLY DISCARDED — which is exactly why coverageReported must default false and the console must say so rather than implying full coverage. Also fix the F7c-created gap: the Enforcement column must not render 'Quarantined' for a server whose edit the daemon refused.

(B) A NEW LOCATION WITHOUT A BINARY. Extend the signed bundle's existing `mcp` section with an optional sources: [{clientId, scope, kind, format, envelope, pathTemplate, basenames[]}]. The endpoint merges bundle sources with mcpsources.Registry under three hard rules: (i) ADD-ONLY — a bundle can add a source and can NEVER remove, disable or shadow a built-in one, so a compromised or downgraded bundle cannot blind discovery (same reasoning as the activation floor); (ii) template variables are a CLOSED set ({HOME},{APPDATA},{LOCALAPPDATA},{CODEX_HOME},{PROJECT}) resolved locally, with no absolute path accepted verbatim and no traversal, so a bundle cannot point discovery at an arbitrary file; (iii) format/envelope must be a value this build already implements — an unknown format yields a coverage row with state='unrecognized' and detail='format-not-implemented', never a silent skip. Rule (iii) is what keeps the honest-unknown signal alive when a bundle is ahead of the binary. Measured propagation on the live endpoint is ~5 min (bounded by the 12-30 min refresh cadence), so a new client location reaches the fleet in minutes with no release.

### Changes

**Backend** - `packages/shared-contracts/src/ai-governance-contract.ts`

APPEND McpDiscoveryState + McpScanCoverageShape + optional coverage? on the scan request shape; APPEND clientId?: string | null and configScope?: string | null to McpServerRowShape (:658-678). Never re-order existing members.

**workspace** - `packages/shared-contracts/src/ai-governance-contract.ts`

MIRROR PARITY — apply the identical append. This mirror is what Backend builds against locally (last parity restore: commit 7a85d3b), so drift here fails the build, not a test.

**Ceragon-Intelligence** - `packages/shared-contracts/src/ai-governance-contract.ts`

MIRROR PARITY — apply the identical append so the intel repo still builds standalone.

**Backend** - `src/ai-governance/dto/mcp-scan-ingestion.dto.ts`

Add McpScanCoverageDto (clientId, scope, format, sourceFile?, state with @IsIn over the union, serverCount @IsInt @Min(0), detail?) and coverage?: McpScanCoverageDto[] on McpScanIngestionDto with @IsOptional @IsArray. Document that items are per-item tolerant exactly like servers.

**Backend** - `src/entities/mcp-discovery-coverage.entity.ts`

NEW entity mirroring the mcp_servers doc conventions (org-scoped, wire-safe, functional unique index declared in the migration, not in decorators).

**Backend** - `src/migrations/<timestamp>-CreateMcpDiscoveryCoverage.ts`

NEW migration: table + ix_mcp_discovery_coverage_org + the functional unique index (org_id, COALESCE(endpoint_id,''), client_id, scope, COALESCE(source_file,'')).

**Backend** - `src/ai-governance/services/mcp-governance.service.ts`

upsertFromScan (:189-227): after the server loop, when coverage is supplied, atomically replace the (org, endpoint) coverage set. Add coverage + coverageReported to the console read path. Refresh clientId/configScope in upsertServer's mutable-descriptor block (:254+) without touching approval_status/approved_by/approved_at.

**Frontend** - `app/mcp/mcp-governance-content.tsx`

Add a Coverage panel above the table (insert around :127-152); change the count header (:130-134); replace the EmptyNoData description (:147-152) with the three coverage-conditional strings; render clientId/configScope next to serverName; stop the Enforcement column (:222-229) from asserting 'Quarantined' when the daemon refused the edit.

**Frontend** - `types/ai-governance.ts`

Extend McpServer / McpServersResponse with the new optional fields so the panel type-checks against the shared contract.

**Installers** - `internal/core/backend/mcp.go`

Add McpScanCoverage (frozen camelCase mirroring the DTO) and Coverage []McpScanCoverage `json:"coverage,omitempty"` on McpScanRequest. Keep the SECURITY INVARIANT comment (:19-23) accurate: coverage carries a source PATH and a closed-vocabulary state, never file contents.

**Installers** - `internal/mcpgov/mcpgov.go`

Project []mcpsources.SourceCoverage into []backend.McpScanCoverage and attach it to the scan requests built by cmd/devoid/mcp.go and internal/daemon/mcp_governance.go.

**Installers** - `internal/policybundle/bundle.go`

Decode the optional mcp.sources array into a typed slice; expose McpExtraSources(p) implementing the ADD-ONLY, closed-template-variable, known-format-only merge rules. Nil or expired policy -> built-in registry only (never fewer sources).

### Rejected alternatives

- Put coverage on the existing mcp_servers table as a synthetic row. Rejected: it pollutes the approval lifecycle (a coverage row has no approvalStatus and must never be approvable) and corrupts every server count on the console.
- Ship the agent coverage field first and add the backend later. Rejected: the field is silently dropped, so the change appears to work in dev and is a no-op in prod — the exact invisible-producer failure class this programme keeps hitting.
- Fix the identity collapse (add source_file to the unique index) in this change. Rejected here: it is an index rebuild on a live multi-tenant table plus an approval-semantics decision (does approving `filesystem` in Cursor approve it in Codex?). It deserves its own spec with an owner decision; the additive clientId/configScope descriptors make the collapse VISIBLE in the meantime, which is the honest interim state.
- Fetch the source registry from an HTTP endpoint at scan time. Rejected: it breaks local-authoritative enforcement (discovery would degrade when the backend is unreachable) and introduces an unsigned input. The signed bundle is already the anti-rollback, offline-capable carrier and is the right one.

### Tests (each carries a defeat step)

- TestBackendCoverageIngestAndReplace (Backend, mcp-governance.service.spec): post a scan with three coverage rows, then a second scan with two; assert the endpoint's stored coverage set is exactly the second set (the vanished source is gone, not stale). DEFEAT STEP: change the second post to omit `coverage` entirely and assert the FIRST set is preserved untouched — an old agent that reports nothing must not be read as 'coverage is now empty', and if both cases behave identically the replace/preserve distinction is not implemented.
- TestAgentWireLeniencyIncludesCoverage (Backend, agent-wire-leniency.spec): assert McpScanIngestionDto is in the lenient set and that posting an UNDECLARED extra key alongside coverage yields 200 with the key dropped, not 400. DEFEAT STEP: temporarily strip the CLI_AGENT stamp from the route and confirm the test goes red with a 400 — this pins the property that made backend-first safe rather than mandatory-lockstep.
- TestConsoleEmptyStateIsCoverageConditional (Frontend, app/mcp/__tests__/mcp-control-tower.test.tsx): render with (a) coverageReported=false, (b) coverageReported=true with all sources parsed, (c) coverageReported=true with two unreadable sources; assert three DISTINCT strings, and specifically that (a) never claims anything about MCP servers being absent. DEFEAT STEP: force all three fixtures to the same props and confirm the test fails — identical copy across the three states is the exact defect being fixed, so the test must be able to detect it.
- TestBundleSourcesAreAddOnlyAndTemplateBounded (Installers, internal/policybundle): a bundle that (i) omits a built-in source, (ii) supplies pathTemplate '../../etc' or an absolute '/etc', (iii) supplies format 'yaml' must respectively (i) leave the built-in registry intact, (ii) be rejected with no source added, (iii) produce a coverage row state='unrecognized' detail='format-not-implemented'. DEFEAT STEP: relax each rule one at a time and assert the corresponding sub-case fails — a merge test that only exercises the happy path proves nothing about a hostile bundle.
- LIVE VERIFICATION after backend deploy then agent deploy: with the new agent, the console MCP tower must read '6 MCP Servers · 12 of 14 configuration sources read' (or the box's actual numbers) and list the unread sources. DEFEAT STEP: run the OLD 7.8.30 agent against the NEW backend and confirm the console says the agent does not report coverage — if it instead shows a full-coverage claim, coverageReported is defaulting wrong and the surface is asserting something it never measured.

### Risks

1. DEPLOY ORDER IS LOAD-BEARING AND ITS FAILURE IS SILENT. Because agent routes tolerate-and-drop, an agent shipped before the backend does not 400 — its coverage field simply vanishes. The visible symptom is a console that keeps saying 'coverage not reported' for a fleet that is reporting it: confusing but honest. Backend + migration first, then agent.
2. NEW TABLE GROWTH. Coverage upserts on every scan (6-hourly per endpoint plus watcher-triggered). The functional unique key bounds it to roughly 10-15 rows per endpoint, but note F19: retention crons in prod are green-but-inert, so this table will never be pruned. Bound it by design (upsert + atomic replace), never by a cron.
3. BUNDLE-DRIVEN SOURCES ARE AN ATTACK SURFACE. A source list that could REMOVE built-ins would be a policy-driven blinding of discovery; a pathTemplate accepting an absolute path would turn the daemon into an arbitrary-file reader. The three merge rules are the mitigation and must be tested adversarially, not happy-path. Reads stay bounded (5 MiB) and non-link-following (the mcpgov.go:99-109 posture) for bundle-added FILE sources too.
4. THREE-MIRROR CONTRACT PARITY: a partial application breaks either the Backend build (workspace mirror) or the Ceragon-Intelligence standalone build. Apply all three in one PR.
5. Frontend noise: the Coverage panel must not become a wall of rows on a clean box — collapse 'parsed'/'absent' behind a summary line and expand only the non-clean states by default.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- FACTUALLY WRONG CHANGE ENTRIES — two of the three 'mirror parity' edits target files that DO NOT EXIST. ai-governance-contract.ts exists only at Backend/packages/shared-contracts/src/. C:/Users/Owner/Documents/Ceragon/packages/shared-contracts/src/ has no such file (its set is cache-schema, customer-taxonomy, decision-contract, endpoint-inventory-contract, policy-drift, policy-facts, release-manifest, scanner-*, scan-run-view-contract, security-taxonomy, source-identity, sqs-*, trusted-packages, vulnerability-*, worker-result-*), and neither does Ceragon-Intelligence/packages/shared-contracts/src/. Risk 4 ('a partial application breaks either the Backend build or the Intelligence standalone build') is therefore false for this file, and following changes[] would create two files that must not exist.
- MISSING SCHEMA WORK: the spec appends clientId/configScope to McpServerRowShape and refreshes them in upsertServer, but never adds the columns to mcp_servers or a migration for them, and never says existing rows stay NULL until re-scan.
- MISSING READ-PATH CHANGE: src/ai-governance/controllers/ai.controller.ts:496 is the console GET route and is not in changes[]; the Frontend panel cannot receive coverage without it.
- BUNDLE SOURCES UNBOUNDED: the three merge rules are correct as far as they go, but nothing caps the NUMBER of bundle-added sources or project expansions, and nothing states that a bundle-added source is discovery-only rather than a recursive sweep root (see the F7 sweep.candidateRoots objection — Installers internal/sweep/roots.go:117-134 feeds walk.Walk at sweep.go:88).
- EFFORT UNDER-ESTIMATED: L for a three-surface change with a new entity, a migration, a backend-first deploy and adversarial bundle-merge tests. This is XL.

**Corrected root cause**: rootCauseVerdict=UNPROVEN is honestly declared and the pinned facts hold. Verified: McpServerRowShape at Backend/packages/shared-contracts/src/ai-governance-contract.ts:658-678 has no clientId/configScope/coverage; the console count header (Frontend app/mcp/mcp-governance-content.tsx:130-134), the honest reconciliation paragraph (:136-146) and the world-asserting EmptyNoData copy (:147-152) are exactly as quoted; the Enforcement column asserts 'Quarantined' off approvalScope alone at :222-229; every MCP location is a compiled-in Go literal (Installers internal/sweep/roots.go:39-63); the agent surface tolerates-and-drops (Backend src/common/pipes/agent-wire-dto.ts, the four-recurrence doc-comment); upsertFromScan is at src/ai-governance/services/mcp-governance.service.ts:189-227 with sourceFile already declared at dto:100 and refreshed at service:265; the functional unique index (org_id, COALESCE(endpoint_id,''), server_name, COALESCE(package_name,'')) is in src/migrations/1782440000000-CreateMcpServers.ts:70-77; the console read route is GET mcp/servers at src/ai-governance/controllers/ai.controller.ts:496.


**Corrected approach**: Ship part (A) as specified MINUS the two phantom mirror edits, and tighten part (B).
(A) ai-governance-contract.ts is Backend-local. Append the coverage types there only; delete the workspace and Ceragon-Intelligence 'MIRROR PARITY' change entries and delete risk 4, which is false for this file. (If some other contract in the shared set is touched later, the three-mirror rule applies to THAT file — it does not apply here.)
(B) Bundle-driven sources: keep the three merge rules (add-only, closed template vars, known-format-only) and add two more that the spec omits — a hard CAP on the number of bundle-added sources and on project-root expansion, and an explicit 'bundle-added sources are DISCOVERY-only and are never recursive-walk roots' (see the F7 objection about sweep.candidateRoots). Also state that policybundle gains an import edge to mcpsources and that this is cycle-free (codexmanaged does not import policybundle).


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/controllers/ai.controller.ts` - GET mcp/servers (:496) must project the new coverage[] + coverageReported + per-row clientId/configScope. The spec changes the service but never names the controller that returns the console payload.
- **Backend** `src/entities/mcp-server.entity.ts` - clientId / configScope columns + a migration to add them. The spec says 'Refresh clientId/configScope in upsertServer's mutable-descriptor block' and appends them to McpServerRowShape, but never adds the columns. Existing rows stay NULL until the next scan — say so explicitly rather than leaving it implied.
- **Installers** `internal/policybundle/bundle.go` - Cap the number of bundle-added sources and the project-root expansion, and mark bundle-added sources as discovery-only (never sweep-walk roots). Unbounded, a signed bundle turns the daemon into a broad filesystem reader within the template rules.

**Collateral risk**: 1. The two phantom mirror edits are the highest-risk item: an implementer following changes[] would CREATE ai-governance-contract.ts in two packages that deliberately carry only the scanner/intel contract set (cache-schema, scanner-*, worker-result-*, policy-facts, trusted-packages…), and wire it into two index.ts files. That is new, unreviewed surface in two repos for no reason.
2. Deploy order is correctly identified and its failure mode is correctly characterised as silent-but-honest (coverageReported defaults false). Backend-first with a migration, then agent — stated, and the DEFEAT STEP on the live check (old 7.8.30 agent vs new backend must render 'does not report coverage') is the right pin.
3. Old agents against the new backend: unaffected — coverage? is optional and the servers[] path is unchanged.
4. The copy rewrites strengthen honesty discipline rather than weakening it (three distinct coverage-conditional strings, and 'measured absence over part of the machine, not a clean result' matches the shipped house voice). No invariant violation. No feature flags proposed; the bundle sources are additive-only and cannot disable a built-in, which preserves local-authoritative enforcement.
5. Correctly refuses to change the identity index on a live multi-tenant table and correctly defers the approve-semantics decision to an owner.

**Effort correction**: L is wrong. This is an XL (>1 week): a contract append + a NEW Backend entity + migration + upsert/replace semantics + read-path projection + a Frontend coverage panel and three copy states + new Go wire types + a signed-bundle merge with adversarial (not happy-path) tests, spanning two repos under a backend-first deploy with a migration. Planning it as L will mis-size the wave.
