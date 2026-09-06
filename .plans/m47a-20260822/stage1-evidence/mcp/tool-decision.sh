#!/usr/bin/env bash
# POST /v1/ai/tool-decision to the P47 daemon, shaped exactly as the PreToolUse hook
# does for an MCP tool call: artifact {kind:"mcp", name:<server>, tool:<tool>,
# signal:"mcp-tool-name"} parsed from the runtime's `mcp__<server>__<tool>` name
# (internal/skillgate/invocation.go splitMCPToolName).
# usage: tool-decision.sh <server> <tool>
ISO=/c/Users/Owner/AppData/Local/Temp/devoid-p47-iso
SRV="$1"; TL="${2:-list}"
TOK=$(cat "$ISO/home/.devoid/daemon-token")
BODY=$(SRV="$SRV" TL="$TL" node -e '
const s=process.env.SRV,t=process.env.TL;
console.log(JSON.stringify({
  toolName:"mcp__"+s+"__"+t,
  toolInput:{path:"README.md"},
  agentType:"claude-code",
  surface:"cli",
  sessionId:"p47-mcp-lane-"+s,
  clientSessionId:"p47-mcp-lane",
  cwd:"C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso/home",
  artifact:{kind:"mcp",name:s,tool:t,signal:"mcp-tool-name",notContentAddressed:true}
}));')
curl -s -m 20 -X POST http://127.0.0.1:19390/v1/ai/tool-decision \
  -H "X-Devoid-Daemon-Token: $TOK" -H 'Content-Type: application/json' -d "$BODY"
echo
