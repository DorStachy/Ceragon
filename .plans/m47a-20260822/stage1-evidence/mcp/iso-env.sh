# Source this to run $ISO/devoid.exe against the ISOLATED home exactly as
# run-daemon-p47.sh does (plus APPDATA/LOCALAPPDATA, which run-daemon-p47.sh does
# NOT redirect — see FINDINGS "rig isolation" note).
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
export APPDATA="$HOMED_W\AppData\Roaming"
export LOCALAPPDATA="$HOMED_W\AppData\Local"
export DEVOID_DAEMON_PORT=19390
