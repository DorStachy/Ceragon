# Spool lane - the restart overlap that poisons the evidence WAL, and the endpoint that goes dark

Worktree `C:\cwt\p47-fix-spool` (Installers, Go), branch `p47/fix-spool-lock`, based on the merged
integration tip `f6148c37`. Nothing pushed, nothing merged, no other worktree touched.

Defect as measured: `.plans/m47a-20260822/stage1-evidence/receipt/FINDINGS.md` + `probe-open-and-repro.md`.

## What was wrong, in one paragraph

`evidencespool.Open` loaded the WAL tail once and kept `lastSequence` in memory. Nothing locked the
file and nothing re-read the tail before an append, and the only process guard anywhere near it was
the daemon PID file - which is released when the LISTENER stops, not when the last background writer
exits. So a graceful restart had a window (82 s on the measured box: an inventory walk over 1,834
items) with two daemons writing one WAL from two counters. One duplicate sequence made every later
`Open` fail with "endpoint evidence WAL sequence has conflicting event ids", permanently, with no
quarantine and no repair. `initEvidenceDelivery` then discarded that error on the very next line and
recorded `agent-not-enrolled-or-spool-unavailable`, so for sixteen hours the log said an ENROLLED
endpoint was not enrolled - 300+ times, every 30 s - while the backend's evidence-health row still
read healthy/healthy. No spool meant no ordering gate, no bundle-application receipt, a deadlocked
policy chain and a bricked endpoint an hour later.

## What is true now

1. OWNERSHIP. `Open` takes an OS-level exclusive lock on `endpoint-evidence.lock` in the spool
   directory and holds it until `Close`. A second `Open` fails immediately with a typed
   `*SpoolLockedError` naming the holder's pid - and fails BEFORE the WAL is opened for load, so a
   refused `Open` cannot touch the bytes. The kernel drops the lock when the handle closes, on a
   crash and a kill included, so unlike a pid file it cannot go stale.
2. A POISONED WAL IS NO LONGER PERMANENT. On exactly the two sequence-integrity conflicts, `Open`
   renames the WAL to `endpoint-evidence.wal.poisoned-<unix seconds>` (bytes untouched),
   reinitialises with a new stream id, and enqueues one content-free `EVIDENCE_WAL_QUARANTINED`
   event as sequence 1 of the new stream carrying the abandoned stream id and the reason slug.
   Every other load error stays strict.
3. THE CAUSE IS NO LONGER THROWN AWAY. `initEvidenceDelivery` logs the real error and records one of
   four distinct slugs; the local /health surfaces and the 9.4 heartbeat block carry it.
4. GRACEFUL STOP HANDS THE SPOOL OVER. `closeEvidenceSpool()` runs after the background writers
   drain and before the process exits, so the replacement's existing 30 s `ensureEvidenceDelivery`
   retry simply succeeds. No signal, no negotiation.

## Files changed

New:

- `internal/evidencespool/lock.go` - `spoolLock`, `acquireSpoolLock`, `ErrSpoolLocked`,
  `SpoolLockedError`, the in-process holder registry
- `internal/evidencespool/lock_windows.go` - LockFileEx/UnlockFileEx on a byte range past EOF;
  `openLockFile` with FILE_SHARE_DELETE
- `internal/evidencespool/lock_unix.go` - flock(LOCK_EX, LOCK_NB)
- `internal/evidencespool/quarantine.go` - sentinels, reason slugs, `QuarantineNotice`,
  `Spool.Quarantine()`, `quarantineAndReinitialize`
- `internal/evidencespool/restart_overlap_test.go` - defeat tests (a) and (b) + the strictness fence
- `internal/daemon/evidence_spool_cause_test.go` - defeat tests (c) + the shutdown-handover tests

Modified:

- `internal/evidencespool/spool.go` - lock acquired in `Open` before any WAL byte; `Close()`;
  `initializeFreshWAL()` split out; quarantine branch in `loadOrInitialize`; the two inline conflict
  errors became sentinels; `appendRecordLocked` refuses after `Close`
- `internal/daemon/evidence_delivery.go` - `classifySpoolOpenError`, quarantine logging,
  `evidenceSpoolRecoveryCause()`, `closeEvidenceSpool()`, `evidenceSpoolCause()` passthrough,
  recovery cause on /health + audit posture
- `internal/daemon/ai_oracle_receipt.go` - three new cause slugs in the closed residual vocabulary
- `internal/daemon/server.go` - `evidenceSpoolRecovery` field; `closeEvidenceSpool()` in the graceful
  shutdown after `watchWG.Wait()`, and unconditionally in `releasePIDUnlessHandedOff`
- `internal/daemon/ai_integrity_subsystem.go` - `EvidenceSpoolCause` on the 9.4 report; the
  report-skip log names the cause
- `internal/controls/policy_integrity.go` - `PolicyIntegrityReport.EvidenceSpoolCause` +
  `EvidenceSpoolCauses` + normalizer handling
- `internal/evidencespool/*_test.go`, `internal/promptevidencegate/pe2_gate_test.go` - restart
  fixtures now model a restart (close, then reopen)

## THE NAMES THE BACKEND SIDE NEEDS

Wire field (heartbeat, `controls.policyIntegrity`):

    "evidenceSpoolCause": "<slug>"      // string, OMITTED when the spool is ordinary

Closed value set (`controls.EvidenceSpoolCauses`, and the Go constants `auditFailSpool*` in
`internal/daemon/ai_oracle_receipt.go`):

| slug | means | operator action |
|---|---|---|
| spool-corrupt-quarantined | the WAL was poisoned; Open preserved the bytes and rotated onto a NEW emitter stream. The endpoint IS auditable. | none - but the rotation is explained and the preserved file is named on /health |
| spool-held-by-another-process | a draining daemon still owns the directory | wait; the 30 s retry resolves it. NEVER repair. |
| spool-open-failed | unreadable WAL / permission / disk / a load error outside the recoverable set | needs a human |
| spool-not-enrolled | no usable v4 endpoint identity (pre-existing slug, now narrowed to this only) | enrol |
| spool-not-configured | no valid credentials at all (pre-existing) | enrol |

Only `spool-corrupt-quarantined` currently reaches the wire - see the gap below.

WHY ADDING IT NOW IS SAFE WITHOUT THE BACKEND. `policyIntegrity` crosses as a bounded object with NO
@ValidateNested on `EndpointControlsDto` (Backend `src/health/types/heartbeat.types.ts`, deliberately
so a forward-shaped block cannot 400 the key-heartbeat), and its authoritative boundary is the
field-by-field rebuild in `health/policy-integrity-shape.ts`, which DROPS unknown keys. A new key on
the `controls` object itself would have been the opposite - that DTO runs forbidNonWhitelisted and an
undeclared key severs the whole heartbeat.

BACKEND WORK STILL OWED: declare `evidenceSpoolCause` in `policy-integrity-shape.ts` and persist it,
then stop deriving `endpoint_evidence_health.status` from a row that nothing has written since the
endpoint went dark.

NEW EVENT TYPE ON THE EVIDENCE BATCH: `EVIDENCE_WAL_QUARANTINED`, metadata `quarantinedStreamId`
(the abandoned `devoid:<uuid>`) and `quarantineReason` (`sequence-conflict` or `event-id-conflict`).
Content-free. The Backend's read-side `AiQueryService.safeMetadata` will drop both keys until it
allowlists them.

LOCAL /health ADDITIONS (no Backend change needed): `evidenceSpool.spoolRecoveryCause`,
`evidenceSpool.quarantine` (the full QuarantineNotice, including `quarantinedPath`), and
`auditPosture.cause` = `spool-corrupt-quarantined` beside `auditable: true`.

## Defeat tests - red before, green after

Red-before was produced by NEUTERING the fix in place and re-running; the fix was then restored from
a pre-edit copy and re-verified green. Raw output in this directory.

### (a) two handles on one directory - red-before-lock.txt

Neuter: `acquireSpoolLock` returns a lock without taking one.

    --- FAIL: TestTwoHandlesOnOneSpoolAreRefused
        a second Open succeeded while a live handle held the spool - this is the defect:
        two counters, one WAL, and a duplicate sequence that poisons every later Open
    --- FAIL: TestConcurrentOpenYieldsExactlyOneOwner
        8 concurrent Opens succeeded, want exactly 1

Green after: both PASS. `TestTwoHandlesOnOneSpoolAreRefused` is probe 2 from probe-open-and-repro.md,
inverted - second Open refused with *SpoolLockedError naming this pid, the WAL byte-identical after
the refusal, the owner still able to write while it drains, Open succeeding after Close, the
replacement inheriting sequences 1 and 2, Close idempotent, and a stale captured Enqueue refused
after close.

### (b) poisoned WAL quarantined - red-before-quarantine.txt

Neuter: `loadOrInitialize` returns the conflict instead of quarantining.

    --- FAIL: TestPoisonedWALIsQuarantinedAndTheStreamRotates
        Open must recover a poisoned WAL, got load endpoint evidence WAL:
        endpoint evidence WAL sequence has conflicting event ids
    --- FAIL: TestConflictingEventIDIsAlsoQuarantined
        Open must recover an event-id conflict, got load endpoint evidence WAL:
        endpoint evidence WAL event id has conflicting sequence

That first line is the field error verbatim. Green after: both PASS. The test builds the poisoned WAL
out of records the spool itself wrote, proves it is genuinely unloadable by replaying it through the
real projection, then asserts the .poisoned-* file is byte-identical to the original, the stream is
new, sequence 1 is the EVIDENCE_WAL_QUARANTINED marker with the old stream id and the reason slug,
the marker is content-free, a later enqueue takes sequence 2, and the whole thing survives a restart
without quarantining again.

`TestEveryOtherLoadErrorStaysStrict` is the fence: unsupported version, unknown record kind, stream
identity changed, undecodable record - none is quarantined, and the WAL is not modified.

### (c) cause slugs - red-before-cause.txt

Neuter: `initEvidenceDelivery` writes the old fixed string and reports no quarantine.

    --- FAIL: TestSpoolHeldByAnotherProcessIsItsOwnCause
        cause = "spool-not-enrolled", want "spool-held-by-another-process"
    --- FAIL: TestQuarantinedSpoolIsAuditableAndSaysSo
        recovery cause = "", want "spool-corrupt-quarantined"
    --- FAIL: TestSpoolOpenFailureIsNotReportedAsUnenrolled
        cause = "spool-not-enrolled", want "spool-open-failed"

Green after: all PASS, plus `TestUnenrolledEndpointKeepsItsOwnCause` (the negative control - the
over-applied slug must still be produced by the one condition it describes),
`TestClassifySpoolOpenErrorIsAClosedMapping` (six cases + a no-collision check across all six slugs),
`TestShutdownReleasesTheSpoolForTheReplacement`, `TestPIDHandoffStillReleasesTheSpool`, and
`TestEvidenceSpoolCauseRidesTheWireAdditively` in internal/controls (healthy endpoint emits no key at
all; the slug reaches the wire under the exact name; every declared slug survives normalization; an
off-vocabulary value is dropped without nilling the block or costing it the applied tuple).

### (d) the existing suites - green-after.txt

    go build ./...                                                            clean
    go vet ./internal/evidencespool/ ./internal/daemon/ ./internal/controls/  clean
    go test ./internal/evidencespool/       ok    5.056s
    go test ./internal/promptevidencegate/  ok    1.680s
    go test ./internal/controls/            ok    0.869s
    go test ./internal/daemon/              ok   40.865s   (the FULL suite, not just the -run filter)
    GOOS=linux go build ./...               clean
    GOOS=darwin go build ./...              clean

Also re-ran ./internal/core/backend/ (ok, 55.9 s) and ./internal/airuntimeintegrity/ (ok) - the only
other packages in the evidencespool import graph.

## Existing tests I had to change, and why it matters

Eleven "restart" tests reopened the spool OVER A LIVE HANDLE. That is not a restart; it is the
two-writers-one-WAL overlap that caused this outage. They now go through a `restartSpool` helper that
closes first. `internal/promptevidencegate/pe2_gate_test.go`'s `openPair` fixture likewise now models
process death.

Two tests changed meaning rather than mechanics:

- `TestConcurrentOpenConvergesOnOnePersistedStreamIdentity` asserted that eight concurrent Opens all
  SUCCEED and agree on a stream id. That was true, and it was the defect. Replaced by
  `TestConcurrentOpenYieldsExactlyOneOwner`: exactly one wins, the rest get *SpoolLockedError, and the
  convergence property is kept where it still belongs (after the winner closes).
- `TestSpoolCannotBeSilentlyReboundToAnotherEndpoint` opened twice without closing and asserted only
  that the second call errored. Under the lock it passed FOR THE WRONG REASON - an inert test. It now
  closes first and asserts the identity refusal specifically, and fails if the ownership lock answers
  instead.

## Deliberate design notes

- The lock is a SEPARATE file from the WAL: locking the WAL itself would make the quarantine rename
  and compaction fight the lock on Windows.
- Windows locks a byte range PAST EOF so the holder's pid stays readable, and opens the lock file with
  FILE_SHARE_DELETE (Go's os.OpenFile does not) so holding the lock does not block deleting the
  directory - an uninstaller, a re-enrolment cleanup and t.TempDir cleanup all needed that.
- The quarantine renames BEFORE anything is opened for load (Windows refuses to rename an open file);
  `load()` closes its handle on every one of loadWithRetry's attempts, so no handle is open then.
- A failed quarantine-marker enqueue does NOT fail Open. The spool is usable and putting the endpoint
  back in the dark over a marker would be the original defect again; it is recorded on the notice and
  in lastError, which drives Health().status to degraded.
- `spool-corrupt-quarantined` rides a SUCCESSFUL open, so it is kept in a separate field
  (`evidenceSpoolRecovery`) from the audit-failure cause. "Can this endpoint record a decision" and
  "has it been able to all along" are different questions.

## What I could NOT do

1. THE DARK CASES STILL DO NOT REACH THE WIRE. `policyIntegrityReport()` returns nil when there is no
   emitter stream, which omits the whole 9.4 block (the Backend derives `unknown` - honest, never
   healthy). So `spool-held-by-another-process` and `spool-open-failed` are visible in the daemon log,
   on /health and in the audit posture, but not on the heartbeat. Carrying them would mean either
   fabricating a watermark or adding a key to the `controls` object, which sits under
   forbidNonWhitelisted and would 400 the entire key-heartbeat of exactly the endpoints already in
   trouble. The quarantine path - which is what now REPLACES the permanent dark state - does reach
   the wire.
2. `endpoint_evidence_health` STAYING healthy IS STILL A BACKEND DEFECT. That row is written by
   evidence BATCH deliveries; a dark endpoint delivers no batches, so the last good row never ages.
   Nothing on the endpoint can fix it. Out of scope by instruction.
3. NOT EXERCISED AGAINST A LIVE DAEMON. Everything here is unit- and integration-tested in-repo. The
   shared rig daemon on :19390 was not restarted (brief rule 3) and no binary was cut, so the
   82-second real drain window is not re-measured against this build. The recovery it automates is the
   same one performed by hand on 2026-09-06 (RECOVERY_AND_CHAIN.md), which produced three chained
   receipts.
4. NO BACKEND CHANGE. The field names above are the handoff.
5. NOT PUSHED, NOT MERGED. One commit on p47/fix-spool-lock.

## How to re-run

    cd /c/cwt/p47-fix-spool
    go build ./... && go vet ./internal/evidencespool/ ./internal/daemon/ ./internal/controls/
    go test -count=1 ./internal/evidencespool/ ./internal/promptevidencegate/ ./internal/controls/
    go test -count=1 -run 'Evidence|Spool|Receipt' ./internal/daemon/
    go test -count=1 -v -run 'TestTwoHandles|TestPoisonedWAL|TestConflictingEventID|TestEveryOtherLoadError' ./internal/evidencespool/
    go test -count=1 -v -run 'Spool|Quarantin|Classify|PIDHandoff|Unenrolled' ./internal/daemon/
