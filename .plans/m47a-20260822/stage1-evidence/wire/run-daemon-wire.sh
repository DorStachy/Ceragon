#!/usr/bin/env bash
# P47 stage-1 WIRE lane — this lane's OWN daemon instance (port 19391), fully isolated.
# Differences from .codesec-e2e/run-daemon-p47.sh:
#   - home/ProgramData under %TEMP%\devoid-p47-wire (never the shared p47-iso home);
#   - DEVOID_DAEMON_PORT=19391;
#   - DEVOID_TEST_ANTHROPIC_UPSTREAM points the /proxy/anthropic forward destination at
#     the loopback capture server (harness seam, branch p47/wire-lane-harness);
#   - HTTPS_PROXY/HTTP_PROXY point at a DEAD loopback port with NO_PROXY=127.0.0.1,
#     so if any code path tried to reach a real provider host it fails at connect
#     instead of leaving the machine.
set -u
ISO=/c/Users/Owner/AppData/Local/Temp/devoid-p47-wire
HOMED_W='C:\Users\Owner\AppData\Local\Temp\devoid-p47-wire\home'
PROGDATA_W='C:\Users\Owner\AppData\Local\Temp\devoid-p47-wire\progdata'
mkdir -p "$ISO/home/.devoid" "$ISO/home/.codex" "$ISO/progdata"
export USERPROFILE="$HOMED_W"
export HOMEDRIVE='C:'
export HOMEPATH='\Users\Owner\AppData\Local\Temp\devoid-p47-wire\home'
export HOME="$ISO/home"
export ProgramData="$PROGDATA_W"
export PROGRAMDATA="$PROGDATA_W"
export CODEX_HOME="$HOMED_W\.codex"
export DEVOID_DAEMON_PORT=19391
export DEVOID_DAEMON_HEARTBEAT_INTERVAL=20
export DEVOID_TEST_ANTHROPIC_UPSTREAM=http://127.0.0.1:19399
export DEVOID_TEST_FINGERPRINT_SALT=p47-wire-lane
export DEVOID_TEST_OPENAI_UPSTREAM=http://127.0.0.1:19399
export HTTPS_PROXY=http://127.0.0.1:19998
export HTTP_PROXY=http://127.0.0.1:19998
export NO_PROXY=127.0.0.1,localhost,::1
export no_proxy=127.0.0.1,localhost,::1
cd "$ISO" || exit 1
echo "[run-daemon-wire] USERPROFILE=$USERPROFILE port=$DEVOID_DAEMON_PORT upstream=$DEVOID_TEST_ANTHROPIC_UPSTREAM"
exec "$ISO/devoid.exe" daemon start
