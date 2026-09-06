# Probe 1 — why evidencespool.Open fails on the live spool (temporary test, removed after the run)

Test (internal/evidencespool, untracked, deleted afterwards):

    _, err := Open("C:\Users\Owner\AppData\Local\Temp\devoid-p47-iso\home\.devoid\evidence-spool\9cc7bb95-78ec-4bcd-9c08-15de21a1c625", "9cc7bb95-78ec-4bcd-9c08-15de21a1c625")
    -> err = load endpoint evidence WAL: endpoint evidence WAL sequence has conflicting event ids

# Probe 2 — deterministic reproduction of the poisoning (temporary test, removed after the run)

    a := Open(dir, id)            // the daemon that is shutting down
    a.Enqueue(AGENT_CONTROL_TAMPER)   // seq 1
    b := Open(dir, id)            // the replacement daemon loads the WAL: lastSequence = 1
    b.Enqueue(MCP_SERVER_BLOCKED)     // seq 2
    a.Enqueue(MCP_SERVER_BLOCKED)     // the draining daemon still thinks lastSequence = 1 -> writes seq 2 AGAIN
    Open(dir, id)                 // every later start:
    -> err = load endpoint evidence WAL: endpoint evidence WAL sequence has conflicting event ids
    --- PASS: TestZZProbeTwoHandlesPoisonWAL (0.25s)

Nothing in Open/Enqueue takes an exclusive lock on the WAL, re-reads the tail before allocating,
or checks that the process owns the spool; the only guard is the daemon PID file, which is released
when the listener stops, not when the last writer exits.
