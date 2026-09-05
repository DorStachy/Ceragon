# Direct-egress witness — baseline, privacy account, and what it cannot do

**Wave 3 Task 5.** Installers branch `p9/w3-t5-direct-egress-witness`, off `origin/main` `e78ed484`.
Written 2026-08-29. Every number below was measured on this box unless it is marked NOT EXERCISED.

The witness **observes**. It installs no filter, opens no socket, sends no packet, resolves no name
and changes no host setting. There is no branch anywhere in it that refuses, delays or alters
anything. The application-scoped denial is a different task and is not in this branch.

---

## 1. The headline: what this can and cannot tell you

| Question | Answer |
|---|---|
| Did a certified AI runtime hold a connection that did not go through our proxy? | **Yes — this is what it measures.** |
| Was the peer of that connection the model provider? | **No. It cannot know.** Proving it needs the destination address, which this never records. |
| Did anything go out over QUIC / HTTP-3? | **No. Structurally invisible** — see §4. |
| Was a connection made between two samples? | **No.** It is a 1 Hz poll and every record says so. |
| Is it running on your endpoints today? | **No.** It is dormant under the shipped default policy — see §5. |

The honest phrase for a non-zero count is **off-route egress by a certified runtime**. Anything
stronger ("the runtime talked to Anthropic behind our back") is not what the number says.

## 2. Four outcomes, and only one of them is a measurement

`poll` · `unsupported` · `unavailable` · `disabled` · (`unstarted` before the first tick)

`Result.Measured()` is true for `poll` alone. Reading `directEgress: 0` without reading
`observationMethod` is reading a number that does not mean what you think. The vocabulary lives in
`internal/fieldobs` (validated on write) and `internal/aiegress` aliases it, so there is one list.

## 3. The privacy account — this is surveillance of the machine's owner

**What is READ.** `iphlpapi!GetExtendedTcpTable` and `!GetExtendedUdpTable` enumerate **every** TCP
and UDP endpoint on the machine, including applications that have nothing to do with DeVoid, plus
`system.ListProcesses()` for the PID → image-path map. Measured on this box: **848 TCP rows and 112
UDP rows** in one sample. That breadth is unavoidable — the API is machine-wide — and it is stated
here rather than glossed.

**What SURVIVES classification.** Per observation: a closed-vocabulary provider id
(`anthropic`|`openai`), a closed-vocabulary adapter id, a class, an address **family**, a protocol,
and a destination **port**. That is the whole destination vocabulary.

There is **no field** for an address, a hostname, a PID, a username, an image path, or a command
line, so none of them can leak by accident rather than by decision.
`TestResultCarriesNoPathHostnameOrCommandLine` marshals the entire result and fails on any of them;
`TestWitnessClassifiesExternal443AsDirect` additionally fails on fragments of the observed dotted
quad.

**Applications outside the certified profile.** Their rows are read (unavoidable) and **discarded**.
A row whose owning PID does not resolve to a certified image path increments a counter and produces
no record. Nothing about them reaches disk beyond that aggregate.
`TestDirectEgressWitnessIgnoresProcessesOutsideTheCertifiedProfile` drives Chrome and Outlook rows
through the pipeline and then greps the ledger bytes for `chrome`, `outlook`, their addresses, port
`993` and `Program Files`.

**Credentials.** Not possible by construction: nothing here reads a packet payload, a TLS session, a
header or a process environment block. The input is the kernel's connection table — a 5-tuple and an
owning PID.

**Hostnames.** Not possible: no name is ever resolved, and no address is ever recorded even for a
certified runtime.

**The residual inference risk, stated plainly.** The destination **port** is recorded for certified
AI runtimes only. Ports are low-entropy (overwhelmingly 443), but an unusual port would weakly
indicate a service. This is the one place where widening the record would need a fresh privacy
decision, and the wave's own rule is that widening it is a separate decision with a review.

**Where it is written.** `fieldobs` ledger, `security.DefaultPaths().ConfigDir` =
`$HOME/.devoid/ai-field-observations.json`, file `0600`, directory `0700`. On Windows the daemon runs
as SYSTEM, so that is **SYSTEM's own profile, not the developer's** — the same custody argument
`fieldobs` already makes for the route ledger — and it is read back over the token-gated loopback IPC
rather than off disk.

**Nothing is written under `%ProgramData%`.** No machine-root entry, therefore no
`boundaryChildNames` change in `cmd/devoid-msi-root-guard/guard_windows.go` is required or made.
`TestDirectEgressWitnessRecordsOffRouteEgressWhenEnabled` asserts the only new entry in the config
directory after a recording tick is the ledger file itself.

**How long it is kept — OPEN QUESTION FOR THE OWNER.** **Forever.** The `fieldobs` ledger has no
retention or pruning for any record type, and this one inherits that: a monotone counter with
`firstAt` / `lastAt`, deleted only when the config directory is removed (uninstall). That is
pre-existing behaviour rather than something this task introduced, but it is now true of a
network-observation record and so it is named here rather than left to be discovered.

## 4. What it cannot see, counted rather than hidden

- **UDP / QUIC / HTTP-3 is invisible.** `UDP_TABLE_OWNER_PID` rows carry the local endpoint and the
  owning PID and **no remote address at all** — a UDP socket has no connection to describe. The rows
  are still read and emitted destination-less so `Result.RowsNoDestination` reports the size of the
  blind spot. **112 such rows on this box in one sample.** A TCP-only count is therefore a floor.
- **Sampling.** A connection that opens and closes inside one 1000 ms interval is never seen.
- **A PID present in the connection table but absent from the process snapshot** is its own counter
  (`RowsUnknownPID`) — "we could not tell whose it was" is not "it was someone else's".
- **Process-map staleness.** The PID → image map is refreshed at most every 5 s (a process snapshot
  opens a handle per process; doing it at 1 Hz spends real CPU on an observation). A runtime younger
  than that lands in `RowsUnknownPID`; a PID recycled inside that window could be attributed to the
  previous holder's image. The TTL is the bound and it is stated in the code.
- **An unknown address family, protocol, or unparseable address** fails to `unclassified` — never to
  `routed` (a false green) and never to `direct-egress` (a false alarm).

## 5. FINDING — as specified, this ships DORMANT on every endpoint

The wave specifies the kill switch as `netenforce.Policy.Mode == "off"`. Measured:
`netenforce.DefaultPolicy()` returns `Mode: ModeOff`, and `LoadPolicy` returns that default for a
missing policy file — i.e. **every endpoint in the fleet today**. So out of the box the witness
reports `disabled`, reads neither the connection table nor the process list, and writes nothing.

This is pinned by two tests so it cannot be discovered later from a fleet report of zeroes:
`TestWitnessIsDormantUnderTheShippedDefaultNetenforcePolicy` and
`TestDirectEgressWitnessIsDormantUnderTheShippedDefaultPolicy`.

Enabling it is `devoid network-enforce configure --mode monitor`. Note that
`netenforce.ValidatePolicy` **requires a `proxyUrl`** for any mode other than `off`, so an operator
cannot enable observation without also configuring one.

**This is an owner decision, not an implementation detail.** Turning machine-wide connection-table
observation on by default is a surveillance default. The programme's "ship ON, no feature flags" rule
points one way; the privacy floor points the other. The witness is built so either answer is a
one-line change at the policy, and the current answer is written down instead of assumed.

## 6. FINDING — the certified-runtime image-path set does not exist yet

The wave forbids matching runtime PIDs on process **name** (a copied binary defeats it — matrix cell
3) and directs matching on the **image path** against "the set the certified profile names (Task 8's
inventory)". That inventory has not landed. More fundamentally, **nothing in this product certifies a
runtime binary today** — the Backend's own posture input carries `runtimeBinaryCertified: null` and
says so in its comment.

So the certified set is a **seam** (`Server.directEgress.runtimes`) whose default returns an empty set
with the reason `certified-runtime-inventory-absent`. An empty set **with** a reason makes the witness
report `unavailable`, not a poll finding zero. An empty set **without** a reason (a genuinely clean
box, once the inventory exists) stays a real measured zero. The two are different claims and the code
refuses to merge them.

Consequence, stated plainly: **on today's build the live path reports `disabled` or `unavailable`,
never a misleading `poll` with a clean zero.** Wiring the real source is one line at the seam.

## 7. What this can and cannot feed into `directEgressDenied`

The Backend socket is `AdapterPostureProjectionArgs.directEgressDenied: boolean | null`, and it is a
**denial** claim:

- `null` — no producer. Emits `direct-egress-not-measured`.
- `false` — a producer ran and egress was **not denied**. Emits `direct-egress-not-denied`.
- `true` — measured and denied. Reaches `PREVENTION_ACTIVE` (with the session dimension).

| Witness state | Honest value for `directEgressDenied` |
|---|---|
| ≥1 off-route egress observed from a certified runtime | **`false`** — a producer ran and egress demonstrably was not denied. This is a real measured failure and the strongest thing this witness can contribute. |
| `poll`, certified runtimes known, zero observed | **`null`** — a sample cannot prove absence, and nothing denied anything, so neither `true` nor `false` is honest. |
| `disabled` / `unsupported` / `unavailable` / `unstarted` | **`null`** — absence of measurement. |

**This witness can never justify `true`.** `true` means *denied*, and nothing in this branch denies
anything. Only the WFP/ALE task can produce it.

**And there is a wire obstacle the Backend names itself.** `PreventionPostureInput`'s doc states as a
hard constraint that **no field there may require a new key on the agent wire**, because
`EndpointControlsDto.runtimeAdapters` is `unknown[]` with no `@ValidateNested` and the enforcing gate
rebuilds field-by-field, silently dropping what it does not recognise — "no error, no data, and a
console that looks correct". The witness's output lives on the endpoint, in a loopback-IPC-served
ledger. **Nothing in this branch puts it on the heartbeat**, and adding a naive agent-authored field
would arrive as silence. Whoever wires the producer must route the value through a field the ingest
pipe already validates, or widen the pipe deliberately.

**Correction to the wave file, verified:** W3's claimed Backend deploy-ordering constraint for
`/v1/ai/transport-observation` is spurious, as RECONCILIATION §1 C3 says. Re-verified against Backend
`origin/main`: `git grep -n "transport-observation\|routeObserved\|transportRoute\|routeDecisions" --
src` returns **zero hits**. It is a token-gated loopback handler on the daemon
(`internal/daemon/server.go:599`). **This task carries no deploy ordering.**

## 8. Measured on this box

- `iphlpapi` reader: `method=poll`, **848 TCP rows, 112 UDP rows** in one sample
  (`TestConnTableReadsThisWindowsBox`; counts only — no address, port or PID is printed).
- A real machine poll with an **empty** certified set produced **0 observations** over all 960 rows,
  which is the assertion that the classifier is not attributing other people's traffic.
- `netenforce.DefaultPolicy().Mode == "off"`.
- `golang.org/x/sys v0.38.0` does **not** export `GetExtendedTcpTable` / `MIB_TCPROW_OWNER_PID`
  (`go doc golang.org/x/sys/windows | grep -i …` → no match), so both procedures are declared with
  `windows.NewLazySystemDLL("iphlpapi.dll")`. **No new module was added.**

### Defeat tests — both produce the wave's required literal text

```
$ go test ./internal/aiegress/ -run TestWitnessIsSamplingAndSaysSo -count=1
--- FAIL: TestWitnessIsSamplingAndSaysSo (0.00s)
    witness_test.go:145: witness claims complete coverage: want method="poll", got method="complete"
```
(mutation: `Classify`'s `Method: in.Table.Method` → `Method: "complete"`; reverted → PASS)

```
$ go test ./internal/aiegress/ -run TestWitnessUnsupportedPlatformIsNotZero -count=1
--- FAIL: TestWitnessUnsupportedPlatformIsNotZero (0.00s)
    witness_test.go:176: unsupported platform reported method="poll" with 0 rows; absence of measurement is not a measurement of zero
```
(mutation: `unsupportedConnTable()` → `ConnTable{Method: MethodPoll}`; reverted → PASS)

`conntable_other.go` is a bare delegation to `unsupportedConnTable()`, which lives in the
platform-neutral file precisely so this second mutation is compiled and caught on Windows.

## 9. NOT EXERCISED

- **EXIT 1 — the 60-minute live run.** A real box with a deliberately bypassed Claude
  (`ANTHROPIC_BASE_URL` set by the user) recording ≥1 observation, and the same run with the route
  intact recording 0. **Not run.** It needs the certified-runtime inventory of §6 to exist, an
  operator to enable `--mode monitor`, and a live agent session. Until §6 lands, such a run would
  report `unavailable`, which is the honest answer and not the exit number.
- **EXIT 3 — the `curl` against a live daemon.** `curl -H "<daemon token>"
  http://127.0.0.1:19280/v1/ai/transport-observation | jq -r '.observationMethod'`. **Not run.** The
  handler is covered by `TestTransportObservationCarriesDirectEgressAndMethod` against an
  `httptest` recorder; the live daemon path needs an enrolled endpoint. On today's build it would
  return `disabled`, not `poll`.
- **Non-Windows `readConnTable`.** `conntable_other.go` is not compiled or run on this box. It
  cross-compiles clean (`GOOS=linux`, `GOOS=darwin` build and vet) and the invariant it delegates to
  is exercised, but no non-Windows execution happened.
- **The `iphlpapi` unavailable branch.** Never observed failing on this box; the failure shape is
  asserted from a constructed `ConnTable`, not from a real API failure.
- **CI.** `internal/aiegress` runs in **no** `pr-checks.yml` job — that workflow has no
  `go test ./...` — and `internal/daemon` is `-run` scoped there, so the new daemon tests match no
  scope either. Local runs are the only signal. No leg was appended: a consolidated CI change is in
  flight separately.
