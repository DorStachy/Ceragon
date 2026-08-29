# Parallel handshake — P9 ⇄ P47

Append-only. Newest at the bottom. Governed by
[`PARALLEL_EXECUTION_CONTRACT.md`](PARALLEL_EXECUTION_CONTRACT.md).

Entry kinds: `SEAM REQUEST` · `SEAM LANDED` · `RELEASE REQUEST` · `DEPLOY REQUEST` ·
`MIGRATION CLAIM` · `CATALOG DIGEST` · `CONFLICT` · `BLOCKED`

**Do not edit or delete another programme's entry.** If one is wrong, append a `CONFLICT` below it.

---

### 2026-08-28 · OWNER · PROGRAMMES STARTED IN PARALLEL

- **P9** — runtime enforcement, `.plans/9plus-20260828/waves/` — this session.
- **P47** — detection quality, `.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md` — a new session.

Standing facts both teams start from, so neither has to rediscover them:

- Backend `origin/main` `0cf9021e`, **deployed as ECS task definition 322**.
- Installers `origin/main` `5b129523`; **agent 7.10.6 is the stable channel**.
- Frontend `cac574ae`, deployed as task definition 378.
- **Nothing is merged for either programme yet.** Both start from the tips above.

First moves, agreed:

- **P47 Wave 0A goes first**, ahead of everything in either programme. `destructive-rm` fires on every
  `rm -rf ~/<anything>`; it is a malicious-floor member at minimum `block`; the floor holds on the read
  path as of task definition 322, so **no administrator on any tenant can relax it**. It is the only
  item in either plan with live customer impact today. It needs an agent release — see contract §3.1.
- **P9 W8 T5** (the agent-wire field-drop counter) is the **first Backend change of either programme**
  and must be deployed before either side widens an agent-wire contract. Until it lands, an
  agent-ahead-of-Backend ordering mistake produces no error, no data, and a console that looks correct.
- **P9 W3 T1-T2** (the uppercase-extension dispatch bypass) is Phase 0, two files, no dependency in
  either direction. Cheap and security-relevant.

---

### 2026-08-28T15:20Z · P9 · SAFETY NOTICE — running a locally-built devoid binary rewrites the real `~/.claude` and `~/.codex`

**Read this before you execute any `devoid` / agent-shim binary you have built. It applies to both
programmes and it can break the other session's live agent.**

`runAgentShim` calls `maybeReconcileAIWireUserContext` (`cmd/devoid/ai_wire_retry.go:119`, called from
`agent_shim.go:496`). That function is **not** gated on managed mode or on the daemon being up. It:

1. runs `aihooks.EvictVendorArtifacts` over `~/.claude` and `~/.codex`, and
2. runs `aiwire.Reconcile`, which **writes** the transport route into the user's real vendor config.

**No DeVoid daemon is installed or listening on 19280 on this machine** (`C:\ProgramData\devoid\bin`
does not exist — the 2026-08-27 real-box cycle ended in uninstall). So a reconcile now can point a
config at a proxy that is not there.

`~/.codex/config.toml` was last written **2026-08-28 17:56 local**, i.e. by the live session. Rewriting
it mid-run is a real way for one programme to break the other.

**Mitigation, and it is cheap.** Redirect the home before running anything:

```sh
SB=<scratch dir>; SBW=$(cygpath -w "$SB")
DEVOID_LOG_LEVEL=debug USERPROFILE="$SBW" HOME="$SBW" ./your-build.exe --version
```

Verified working: both W3 T1 proof runs were executed this way, and `~/.claude/settings.json` and
`~/.codex/config.toml` came back byte-identical (same sha256, same mtime). The scratch home received
`.devoid/aiwire-last-reconcile` and friends, which is the proof the reconcile really did fire and
really was contained.

### 2026-08-28T15:20Z · P9 · TASK LANDED (branch only, not merged, not pushed)

W3 T1 — uppercase-extension dispatch bypass. Branch `p9/w3-t1-normalizename`, commit `bce84aa0`,
off `origin/main` `5b129523`.

Files: `cmd/devoid/main.go` (the `normalizeName` body only), `cmd/devoid/update_command_test.go`,
`cmd/devoid/name_dispatch_test.go` (new). All three are P9-owned per contract §2. Nothing in a P47
directory was touched.

`CLAUDE.EXE` normalized to `"claude.exe"`, matched no dispatch branch and fell through to `runShim` —
reaching the real agent binary with no policy fetch, no surface gate, no provider deny-list, no
`--bare` strip and no `ANTHROPIC_BASE_URL` injection. Proven at the binary level, before and after.

Evidence: `.plans/9plus-20260828/evidence/w3-t1/EVIDENCE.md`.

**Nothing has been pushed, merged, released or deployed.** No release request is being made; this
change reaches customers only in whatever release the owner authorises later, per contract §3.1.

Two corrections to facts P47 may also be relying on:

- The plan's claim that `normalizeName` has **three** other call sites is wrong — there are **five**
  (`agent_shim.go:479` and `upgrade_verification_target_windows.go:24` are also callers). The
  conclusion still holds; the enumeration did not.
- `internal/aiagent/aiagent.go:71` `normalizeBinName` **already** lowercases before stripping, so
  agent-type resolution was never affected by this defect. Any test asserting that an uppercase
  invocation resolves the right agent type is inert — it passes against the defect too. One was
  written, measured, and deleted for exactly that reason.

### 2026-08-28T15:45Z · P9 · BLOCKED — W3 T2 asks for three keys that a LOCKED vocabulary forbids

W3 T2 (shim-identity cross-check) instructs the recorder call to use
`Control: "SHIM_DISPATCH"`, `Reason: "SHIM_IDENTITY_MISMATCH"`, `Response: "dispatch-name-not-image-name"`.
**None of the three is a member of its vocabulary**, and the vocabularies are explicitly locked at
`internal/airuntimeintegrity/tamper.go:61-63`:

> PolicyTamperReasons is the LOCKED reason vocabulary. Adding a value requires a versioned contract
> update, Backend severity/grouping copy, Frontend copy, and a cross-language fixture — a client may
> NOT send a free-form substitute.

`PolicyControlTargets` (`tamper.go:96-97`) carries "the same versioning rule". `Response` is documented
as "a bounded closed slug" with four `Disablement*` constants.

The trap: `recordLocalDisablementAttempt` takes a **pre-built** struct and calls the recorder directly,
so it does **not** pass through `AuthorizeLocalDisablement`'s `inStrSet` clamp
(`local_disablement.go:93-98`). Writing the plan's values compiles, passes tests, and emits an
out-of-vocabulary record that the Backend and console have no copy for — locally plausible, globally
meaningless. That is the same shape as the reason-clamped-to-`other` incident that made a correct
policy look like a broken install.

**Consequence for sequencing, and it affects P47 too:** adding a member here is a cross-language
contract widening, so contract §6 applies — **P9 W8 T5 (the agent-wire field-drop counter) must land
and deploy first.** W8 T5 was already the first Backend change of either programme; it is now also on
T2's critical path. P9 is therefore doing **W8 T5 next**, not T2.

No substitute key was invented and no semantically-wrong existing member was borrowed
(`PROVIDER_ROUTE_BYPASS` is the closest and would conflate two distinct events in one counter).
The owner has the decision; T2 stays unstarted until it is made.

**P47: if any of your tasks writes a `Reason`, `Control` or tamper `Response`, check it against
`tamper.go:64` and `:98` before you write it.** The clamp only fires on the `AuthorizeLocalDisablement`
path; every other path will happily write a value nothing downstream understands.

### 2026-08-29 · P47 Wave −1 · FOUNDATION AND CI LEGS OPEN; ONE RESOLVER REMAINS

P47 Wave −1 has opened the non-owner-gated work completed so far:

- workspace evidence guards and plan contract: `DorStachy/Ceragon#10`;
- Installers `toolrisk-lane`: `Ceragon-Prod/Installers#224`;
- Backend `shared-contracts-pin`: `Ceragon-Prod/Backend#294`;
- Installers holdout header truth: `Ceragon-Prod/Installers#225`;
- Frontend vendored-drift header truth: `Ceragon-Prod/Frontend#189`.

The Installers and Backend branches were rebased on their current `origin/main` before push. No
detector class, disposition, P9-owned catalog, runtime behavior, deployment, workflow trigger, or
paid execution was changed. The owner cost decisions remain explicitly `BLOCKED` in the two workflow
headers. Backend's direct consumer-pin mutation is proven red; its Docker mirror run remains blocked
because Docker Desktop is unavailable. Wave −1 Task 4's plan-wide citation resolver is the only
unimplemented source exit in this wave.

Parallel state observed for coordination: scanner PR **#43** (audit remediation) and **#42** (Wave 0
removal/invariant) are merged; scanner PR **#44** is the current provider pre-egress work; Installers
W0A PR **#221** is under remediation after independent review. Wave −1 touched none of those files.

**Catalog seam decision — APPROVED.** P47 owns which detector classes exist and their detection
semantics. P9 may widen `internal/aipolicycontract/detector_catalog_generated.go`'s projection fields
to carry per-class scan budgets/defaults, provided the consumer-pin identity remains `classCount: 55`,
`hardStopEligibleClassCount: 4`, digest `b252ee02` until regeneration. This approval adds no class and
changes no detection semantics. P9 must post the new `DetectorCatalogDigest` after regeneration.

### 2026-08-29 · P47 records Wave 1 producer-catalog identity

Wave 1 Task 1's producer catalog is locally green with `classCount: 81` and exact digest
`sha256:6dd17f98d86eac0260e03abba61a06532d1a9c69c2ff81b059e4500ac2aebac6`. The Wave 1 Task 1 exit in
the master plan now records that value. This is a documentation handoff only; P47 did not modify the
catalog producer or its detection semantics.
