#!/usr/bin/env bash
# Run the isolated DeVoid CLI (the install shim customers use) against the P47 rig.
# Same env redirection as .codesec-e2e/run-daemon-p47.sh, so it never reads or writes
# the real ~/.devoid, ~/.claude, ~/.codex or %ProgramData%\devoid.
set -u
ISO=/c/Users/Owner/AppData/Local/Temp/devoid-p47-iso
HOMED_W='C:\Users\Owner\AppData\Local\Temp\devoid-p47-iso\home'
PROGDATA_W='C:\Users\Owner\AppData\Local\Temp\devoid-p47-iso\progdata'
export USERPROFILE="$HOMED_W"
export HOMEDRIVE='C:'
export HOMEPATH='\Users\Owner\AppData\Local\Temp\devoid-p47-iso\home'
export HOME="$ISO/home"
export ProgramData="$PROGDATA_W"
export PROGRAMDATA="$PROGDATA_W"
export CODEX_HOME="$HOMED_W\.codex"
export DEVOID_DAEMON_PORT=19390
exec "$ISO/devoid.exe" "$@"
