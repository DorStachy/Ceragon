> ## ⚠ READ FIRST — THIS PROGRAMME RUNS IN PARALLEL WITH ANOTHER ONE
>
> A second plan is being implemented **at the same time, by a different agent team, in a different
> chat session.** The two plans share **28 source files** and several resources that have no file
> conflict at all and will still destroy each other's work: one agent release channel, one production
> Backend, one live-proof register, one `pr-checks.yml`.
>
> **Before your first task, read
> [`.plans/PARALLEL_EXECUTION_CONTRACT.md`](../../PARALLEL_EXECUTION_CONTRACT.md).** It names the owner
> of every shared file, the append-only protocol for the shared scoreboards, the serialised
> owner-gated release procedure, and the handshake file for anything you need from the other side.
>
> Three rules that will not be obvious from inside a task:
> 1. **If your task seems to need a file this programme does not own, it does not.** Post a seam
>    request to the handshake and switch tasks. Do not make "a small edit" in the other programme's
>    directory.
> 2. **Never cut an agent release or request a Backend deploy on your own authority.** A release now
>    carries both programmes' merged work. One team releasing alone ships the other team's
>    half-finished work to every endpoint.
> 3. **Append, never rewrite,** in `internal/liveproof/register.json`, the Codex ledger, and
>    `pr-checks.yml`. A reformat by one team turns every later diff into a conflict.
>

# Wave 1 — Make every class the endpoint can emit governable

**Depends on:** Wave −1 (rebase manifest, citation repair, and the **discovery** that decides which
tuple is the governed DLP vocabulary). Per reconciliation **C-1**, Wave −1 Task 3 is discovery only —
it runs the provenance sweep and declares the fork. **This wave owns the decision (Task 2) and the
widening (Task 3),** and Wave −1's exit criterion 4, restated as
`AI_SECURITY_DLP_CLASSES.length === RegisteredClasses().length`, is criterion 1 here. Wave 0A may run
in parallel; nothing here blocks it and it blocks nothing here.
**Implements decisions:** D10 (impact and vocabulary declared by the producer, consumer tables
generated from it) — carried forward unchanged. D17 (this wave delivers a *dimension*, not a risk
certificate). The revision source material introduces no new D-number for this wave; if the revised
decision table adds one for DLP totality, it belongs on this row.
**Certificate impact:** **R1 (secrets / company-data exposure) stays `NOT_READY` after this wave** —
this closes exactly one of its six named blockers. Concretely, until this wave passes:
`profile.exclusions` must name *"51 of 81 producer DLP classes have no administrator control"*, and
the **tool-risk policy authority and catalog totality** dimension — the one dimension §5.4 says can
reach PASS — stays `UNKNOWN`, because the cross-repo copy step that keeps the three tool-risk
vocabularies equal runs in no repository's CI (C14). A dimension whose only guard lives outside every
repo is not a guarded dimension.

---

## ⛔ THE ONE CONSTRAINT THAT TAKES THE FLEET DOWN IF IT IS MISSED (O-5)

> **Task 3 Step 4 — widening the Recommended preset to all 81 keys — MUST land in the same commit as
> Task 3 Step 3, the tuple widening. Not the same PR. The same commit.**

`sanitizeStoredConfig` (`Backend/src/ai-security-policy/ai-security-policy.service.ts:5399`) merges
every stored tenant document over `cloneRecommendedAiSecurityPolicy()`. If `AI_SECURITY_DLP_CLASSES`
widens to 81 and the Recommended preset still carries 30 keys, then on the **read** path — the policy
pull every endpoint makes — `assertClosedActionMap` throws
`resolveStrictestPolicy: non-rankable token undefined at dlp.actions.<class>` **for every tenant,
fleet-wide.** Nobody has to write a policy for this to fire; serving one is enough.

The reconciliation calls this the single highest-blast-radius ordering constraint in the packet, and it
is. Two consequences an implementer must not negotiate with:

1. **A commit that widens the tuple without the preset is a fleet outage even if CI is green**, because
   the specs that would catch it (Task 3 Step 8) are written in this same wave.
2. **A revert must revert both halves together.** Reverting the preset alone reproduces the outage
   exactly.

The three other ordering constraints that bind this wave:

- **O-4 — Backend deploys before the Frontend ships the 81-row board.** See "Deploy ordering" below.
- **O-19 — deploying needs a fresh explicit owner ask, every time.** Merging is not deploying, a green
  local run is not permission, and the deploy gates are fail-closed on MISSING runs, so `pr-checks`
  and `security` are dispatched on `main` first.
- **C-6, resolved in this wave's favour:** the constraint is **Backend-before-Frontend**, *not*
  Backend-before-an-agent-release. Wave −1 Task 3 Step 3 states it as an agent-release dependency; that
  wording is imprecise (the 400 comes from `validateActionMap` on a **console** PUT) and **this file's
  wording is authoritative**. No agent release is required by this wave.

---

## Context an engineer needs

### Read `origin/main` with `git show`. The working trees do not contain these files.

Measured 2026-08-28: **Backend is 773 commits behind** `origin/main` (`15dd89ba` vs `0cf9021e`),
**Frontend 525** (`1fe6e7a6` vs `cac574ae`), **Installers 1,010** (vs `5b129523`). Every file this
wave touches is absent from the working tree — `ls Backend/src/ai-security-policy/ai-malicious-floor.ts`,
`ls Installers/internal/dlp/codesecurity_rules.go` and
`ls Frontend/components/admin/policy/category-bucket-board.tsx` all return
`No such file or directory`. Work in an isolated worktree off `origin/main`; never switch branches in
these checkouts (they are shared with live sessions), never `git add -A`, and **never `git stash`
anywhere in this workspace** — `refs/stash` is shared across worktrees.

```bash
cd /c/Users/Owner/Documents/Ceragon/Backend && git fetch origin
MSYS_NO_PATHCONV=1 git show "origin/main:src/ai-security-policy/ai-malicious-floor.ts" | less
```

`MSYS_NO_PATHCONV=1` is mandatory on Git Bash for any path containing `.github`; without it
`git show "origin/main:.github/workflows/pr-checks.yml"` fails with
`ambiguous argument 'origin\main;.github\workflows\pr-checks.yml'`.

### The producer emits 81 DLP classes. The Backend governs 30. Re-counted 2026-08-28 against `origin/main`.

| Where | Count | How it was counted |
|---|---|---|
| `Installers/internal/dlp/registry.go:133` `classRegistry` | **33** | `git show origin/main:internal/dlp/registry.go \| sed -n '133,200p' \| grep -c '{class:'` |
| `Installers/internal/dlp/codesecurity_rules.go:70` `codeSecurityParityClasses` | **48** | same technique over lines 70-160 |
| `RegisteredClasses()` (`registry.go:221`, over `classIndex` at `:201`) | **81** | union of the two tables; `registry_confidence_test.go:259` `TestRegisteredClasses_IsSortedAndUnique` proves the tables never overlap |
| `AI_DLP_CLASSES` (`Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts:54`) | **30** | enumerated, `:55-84` |
| `AI_DLP_CLASSES` (`Frontend/types/generated/ai-security-portable.generated.ts:53`) | **30** | enumerated; byte-identical set to Backend's, diffed |
| **Ungoverned** | **51** | `comm -23` of the two sorted sets. **Zero classes are governed-but-not-produced** — the delta is entirely one-directional, re-confirmed 2026-08-28 |

`ClassHighEntropy` in the registry table resolves to `"high-entropy"` (`internal/dlp/dlp.go:52`) — it is
the one entry declared through a constant rather than a string literal, which is why a naive
`grep -o '{class: "…"'` returns 32 names for a 33-entry table. Count with `grep -c '{class:'`.

**The 51, exactly.** All 48 `codeSecurityParityClasses`, plus three from `classRegistry`:
`private-key-candidate`, `base64-wrapped-secret`, `hex-credential-at-rest`.

### What posture those 51 ship at, and why no administrator can change it

`Installers/internal/aicontext/respond.go:175` `ActionFor` resolves in three steps: the
administrator's configured action (`:176-178`), then `dlp.DefaultClassAction(class)` (`:179`,
defined at `registry.go:247`), then the tier default. Step 2 is clamped by `capAutomaticDefault`
(`:194`) to `automaticDefaultCeiling = ActionWarn` (`:189`).

Step 1 can never fire for these 51, because the Backend cannot store a key for them:
`assertClosedActionMap` (`Backend/src/ai-security-policy/resolve-strictest-policy.ts:426`) **throws**
via `nonRankableToken` (`:412`) on any `dlp.actions` key outside `AI_SECURITY_DLP_CLASSES`, and
`validateActionMap` (`ai-security-policy.service.ts:4754`, called at `:4190`, `:4216`, `:4252`)
**400s** the write with `dlp.actions: unknown class "<x>"`.

So the shipped posture is whatever the producer's own `defaultAction` says, capped at warn. Counted
from the two tables on 2026-08-28
(`grep -o 'defaultAction: Posture[A-Za-z]*' | sort | uniq -c`):

- **48 of the 51 ship at `warn` — the interrupt tier.** (46 of the 48 parity classes, plus
  `base64-wrapped-secret` and `hex-credential-at-rest`.)
- **3 ship at `monitor`.** (Two parity identifier classes, plus `private-key-candidate`, which is
  `familyInconclusive` at confidence 0.)

That is 48 endpoint-emitting classes able to interrupt a developer with **no console control of any
kind**, and no path to one short of this wave.

### The trap that decides this whole wave: `AI_DLP_CLASSES` is not editable here

`AI_SECURITY_DLP_CLASSES` is an alias, not a table:

```
Backend/src/ai-security-policy/ai-security-policy.constants.ts:93
  export const AI_SECURITY_DLP_CLASSES = AI_DLP_CLASSES;

Backend/packages/shared-contracts/src/ai-governance-contract.ts:262
  export const AI_DLP_CLASSES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_CLASSES;
```

`AI_SECURITY_PORTABLE_ORDERED_TUPLES` lives in a **generated, digest-pinned file** produced by
`npm run generate:ai-security-consumer` from a vendored artifact
`packages/shared-contracts/generated/ai-security/0.4.1/portable-contract.v1.jcs.json`
(776,506 bytes, `sha256:29006c25…f96d3`), pinned in `packages/shared-contracts/ai-security-consumer-pin.v1.json`.

**Three facts an engineer will otherwise discover the hard way:**

1. **The artifact's generator does not exist in this workspace.** `ceragon-ai-security-artifact`
   v1.3.1 appears only as a *name* in the pin and in the consumer-side verifier
   (`packages/shared-contracts/scripts/lib/ai-security-backend-consumer-trust.cjs`). There is no
   producing script anywhere in Backend, Frontend, Installers or Ceragon-Intelligence.
2. **The artifact's source commit resolves in no checkout here.** `git cat-file -t d366f5f8c76fac…`
   returns `could not get object info` in all four repos. Frontend's projection pins a *different*
   source commit (`93bf85b6…`) and the agent's embedded copy
   (`Installers/internal/aipolicycontract/consumer-pin.v1.json`, `embedded/0.5.0`) pins `93bf85b6…`
   too. Three independently-pinned projections of one contract, and none of their provenance is
   reachable from this workspace.
3. **A spec asserts the alias identity.** `ai-security-portable-reader.spec.ts:128-132` — *"makes the
   old Backend names aliases, not competing policy enums"* — asserts
   `expect(AI_SECURITY_DLP_CLASSES).toBe(AI_DLP_CLASSES)` at `:129` (reference identity, not deep
   equality). The pin block at `:115-126` fixes the source commit, the artifact digest, the generator
   version `1.3.1` and `runtimeActivatable: false` by literal.

So "generate `AI_DLP_CLASSES` from `RegisteredClasses()`" **cannot be done by regenerating the
portable artifact** from anything in this workspace. **This is reconciliation C-1**: Wave −1 Task 3's
exit criterion 4 as originally written (`AI_DLP_CLASSES.length === RegisteredClasses().length`) is
unachievable, and the only way to close it would be to hand-edit a digest-pinned generated file —
which is the exact drift the pin exists to catch. Task 2 records the fork and picks the buildable
side; Task 3 does the widening.

### The precedent to copy is tool-risk, and it is good

C3/C4 closed the identical problem for tool-risk and **must not be rebuilt** (source material §2):

- `Installers/internal/toolrisk/class_catalog.go:57` `ClassCatalog()` loops the live rule tables plus
  `astClassSeverity` (`:47`) — a rule added without a catalog update is impossible.
- `class_catalog_test.go:189` `TestClassCatalog_ParityVector` writes
  `parity-vectors/toolrisk-classes.v1.json` under `TOOLRISK_CLASSES_UPDATE=1` (`:193`) and compares
  LF-normalised otherwise (`:205-215` records why: a raw byte compare went red on every Windows
  worktree while the committed bytes were digest-identical).
- The vector: `format: "ceragon.ai-security.toolrisk-class-catalog"`, `formatVersion: 2`,
  `classCount: 40`, `sha256:2cc7caeff31a09169d5d947fddf805f5d1f4f7eddcfcc984be5f83e69d1af922`.
- Consumers pin against their own vendored copy:
  `Backend/packages/shared-contracts/toolrisk-classes.v1.json` and
  `Frontend/types/vendored/toolrisk-classes.v1.json`.
- The Backend tuples are **hand-written in `ai-security-policy.constants.ts`** (`:189`
  `AI_TOOL_RISK_HIGH_CLASSES`, `:250` `AI_TOOL_RISK_CLASSES`) — *not* in the pinned portable
  projection. That is the shape DLP must take.
- `resolveToolRiskDefaults` (`constants.ts:1409-1417`) **throws at module load** on a registered class
  with no tier (C4). The DLP analogue already exists structurally: `AiSecurityPolicyDlpConfig.actions`
  is `Record<AiDlpClass, AiStoredDlpAction>` (`constants.ts:936`), so widening `AiDlpClass` makes every
  object literal a compile error until all 81 keys are present.

**There is no DLP class vector.** `git ls-tree --name-only origin/main parity-vectors/` returns seven
entries and `dlp-classes.v1.json` is not among them; `Installers/parity-vectors/dlp-findings.json` is a
text→findings parity corpus for the two engines, not a class catalog. Creating the class vector is
Task 1.

### Widening the tuple does not brick stored tenants — because of one function, and one commit

`sanitizeStoredConfig` (`ai-security-policy.service.ts:5399`) merges the stored document over
`cloneRecommendedAiSecurityPolicy()`, its own docblock saying *"so rows written before a catalog grew
still produce complete action maps"*. That is the migration safety net and it is **conditional on the
Recommended preset carrying all 81 keys in the same commit** — see the O-5 box at the top of this file.

The preset builder does widen automatically: `dlpActionsByConfidence`
(`ai-policy-presets.ts:258-264`) loops `AI_SECURITY_DLP_CLASSES` at `:260` and calls `confidenceOf(cls)`.
But it returns `{} as Record<AiDlpClass, …>` — an `as` cast at `:259` that **defeats the compile-time
totality check**. The runtime behaviour is safe (`classMetadataFor`, `ai-class-metadata.ts:415-423`,
falls back to a synthesized entry rather than `undefined`), which is worse: the widening compiles,
runs, and produces 51 rows labelled with their own raw class id, in group `other`, at confidence `low`,
with `extractable: false`.

`extractable: false` is not cosmetic. `ai-security-policy.service.ts:2893` reads
`stored === 'block' && !hardStopDlp && isExtractableClass(cls) ? 'redact' : stored` — so an
administrator who sets one of the 51 to `block` gets a **hard stop** rather than a span redaction,
purely because the metadata was never written.

### Deploy ordering, stated precisely (O-4, and the resolution of C-6)

**Backend deploys before the Frontend ships the 81-row board.** The console PUTs
`dlp.actions`; a key the Backend has not registered 400s at `validateActionMap`. Backend first is not
a preference.

**No agent release is required by this wave.** The agent already emits all 81 (that is the defect) and
tolerates a widened policy: the strict `DisallowUnknownFields` decoder
(`Installers/internal/core/backend/ai_policy_bundle.go:75`) applies to the delivery *envelope*, while
`PolicyBody` is a `json.RawMessage`, and `internal/aicontext` reads `p.Actions[class]` as an open map.
Verified 2026-08-28. If a later wave changes floor membership, that constraint returns.

### What this wave deliberately does not do

- It does **not** rebuild the tool-risk producer authority (C3/C4). `ClassCatalog()` already loops the
  rule tables, the vector is byte-identical in three repos, and two RED mutations are already proven.
- It does **not** add any DLP class to the malicious floor. All 10 DLP floor members
  (`ai-malicious-floor.ts:162-171`, `credential('dlp', …)`, built by the helper at `:119-124`) are
  inside today's 30. Adding a floor member changes the served posture of every existing tenant on the
  next assembly — an owner decision, not a side effect of a vocabulary change.
- It does **not** fix the lane-tally under-count. Measured 2026-08-28: `detectorCount`
  (`Frontend/components/admin/policy/category-bucket-board.tsx:2164-2168`) now correctly counts
  `membersAtDisposition`, but the column it sums over is still `byDisposition` (`:1758-1766`), which
  buckets by **category** disposition under strictest-wins. So a board where every category folds to
  Block still answers *"is anything set to warn?"* with **0 categories · 0 detectors** while members
  warn. **That is console truth and belongs to Wave 5 (`w5_w6_console_triage.md`).** Reconciliation
  G-1 named it as Wave 5 work and **Wave 5 Task 11 carries it** — *"The three lane headers stop being
  the only answer to 'is anything set to warn?'"* (`w5_w6_console_triage.md:793`), which opens
  *"**Claimed from Wave 1**"* at `:803` and quotes this bullet's own sentence back. It walks the same
  fold (`categoryDisposition` → `byDisposition` → `detectorCount`, `:806-822`) and exits on Wave 5
  criterion 10, the lane accounting identity (`:918-923`). It is recorded here so it is not lost —
  **not** as an open item against Wave 5. Do not open a defect for it.
- It does **not** own `Installers/.github/workflows/pr-checks.yml`. Per reconciliation **D-8** that
  file is **owned by Wave −1 Task 7**. Task 6 below touches **Frontend's** `pr-checks.yml`, which is a
  different file in a different repository.

---

## Task 1: Publish the DLP class catalog as a producer parity vector

**Files:**
- `Installers/internal/dlp/class_catalog.go` (create)
- `Installers/internal/dlp/class_catalog_test.go` (create)
- `Installers/parity-vectors/dlp-classes.v1.json` (generated, committed)

Model every line on `internal/toolrisk/class_catalog.go` and its test. Do not invent a second shape:
the cross-repo checker (Task 6) compares documents by `format`, and a second schema means a second
checker.

- [ ] **Step 1 (RED): write `TestDlpClassCatalog_ParityVector` before the catalog exists.**
  Copy `internal/toolrisk/class_catalog_test.go:189-225` verbatim, substituting the DLP names and the
  `DLP_CLASSES_UPDATE=1` regenerate hint. Keep the LF-normalisation comment and code — the tool-risk
  gate went red on every Windows worktree with a raw byte compare and the reason is recorded at
  `class_catalog_test.go:205-215`.
  Run `go test ./internal/dlp/ -run TestDlpClassCatalog`. Expected: build failure,
  `undefined: ClassCatalog`.
- [ ] **Step 2: add `ClassCatalog()` to `internal/dlp`, derived from `classIndex`, never from a
  literal.** One row per class carrying, from `classSpec`: `class`, `family`, `confidence`,
  `defaultAction`. `classIndex` (`registry.go:201`) is already built from both backing tables, and
  `TestRegisteredClasses_IsSortedAndUnique` (`registry_confidence_test.go:259`) already proves the two
  tables never declare the same class twice, so the union is safe to hash. Emit `high-entropy`, not
  `ClassHighEntropy` — the vector carries wire names, and the constant is the only entry where those
  differ in source.
- [ ] **Step 3: emit `parity-vectors/dlp-classes.v1.json`** with `format:
  "ceragon.ai-security.dlp-class-catalog"`, `formatVersion: 1`, `producer: "Installers/internal/dlp"`,
  `classCount`, `sha256` over the canonicalised body (prefixed `sha256:`, matching the tool-risk
  vector's `:7`), and a `wire` block naming the policy key path (`section: "dlp"`,
  `keys: ["enabled","actions","customClasses"]`) — the tool-risk vector's `formatVersion 2` added
  `wire` precisely because the class names and the wire keys are two contracts and only one was pinned.
- [ ] **Step 4: regenerate and commit.** `DLP_CLASSES_UPDATE=1 go test ./internal/dlp/`.
- [ ] **Step 5: assert the vector against `RegisteredClasses()` in the same test file**, so the vector
  cannot drift from the enumeration the rest of the product reads.

**Defeat test:** `TestDlpClassCatalog_ParityVector` — add
`{class: "acme-token", family: familyCredential, confidence: 50, defaultAction: PostureWarn}` to
`codeSecurityParityClasses` without regenerating. Expected failure text: the vector-stale message,
naming `parity-vectors/dlp-classes.v1.json` and printing on-disk vs from-the-tables bodies, exactly as
`class_catalog_test.go:219-223` does for tool-risk.
**Exit:** `parity-vectors/dlp-classes.v1.json` exists on `origin/main` with `classCount: 81` and a
recorded `sha256`. Record the digest in this plan when it is generated — it is the value Task 6 and
the certificate's `system.detectorCatalogDigest` compare against.

---

## Task 2: Record which tuple is the governed DLP vocabulary, and why the other one cannot be

**Files:**
- `Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts` (READ ONLY —
  the artifact stays pinned)
- `Backend/src/ai-security-policy/ai-security-policy.constants.ts` (the new tuple lands here)
- `Backend/src/ai-security-policy/ai-security-portable-reader.spec.ts:128-132` (the alias assertion is
  rewritten, deliberately, with the reason in the diff)

**This task is the engineering half of reconciliation C-1, and it is the decision Wave −1 hands over.**
Wave −1 Task 3 runs the provenance sweep and declares the fork; it does not decide it and it does not
edit a tuple. Everything below is this wave's.

This is a design fork, and the plan picks a side because one side is not buildable from this
workspace.

**Option A — regenerate the portable artifact so `AI_DLP_CLASSES` itself becomes 81.** Cleanest in
principle: one tuple, one pin, no divergence. **Blocked, external dependency:** the generator
`ceragon-ai-security-artifact` v1.3.1 exists nowhere in Backend, Frontend, Installers or
Ceragon-Intelligence, and neither pinned source commit (`d366f5f8…`, `93bf85b6…`) resolves in any
checkout. Discovery command, to be run before this option is closed for good:

```bash
cd /c/Users/Owner/Documents/Ceragon
for r in Backend Frontend Installers Ceragon-Intelligence Static-Worker Sandbox-Worker \
         GithubApp-Bot-Scanner-Worker; do
  (cd "$r" && git fetch --all -q 2>/dev/null
   echo "== $r"; git cat-file -t d366f5f8c76fac253d9adf7914873e97a955a16d 2>&1 | head -1)
done
gh search repos --owner Ceragon-Prod 'shared-contracts'   # is there a repo we do not have?
```

**Option B — the governed tuple moves to `ai-security-policy.constants.ts`, pinned against the Task 1
producer vector; `AI_DLP_CLASSES` stays the frozen 30-member V1 wire tuple.** **This plan takes
Option B** unless the discovery command above finds the generator. Four reasons, in order of weight:

1. **Option A is not buildable here.** There is no generator and no reachable source commit. The only
   remaining way to move `AI_DLP_CLASSES` is to hand-edit
   `generated/ai-security-portable.generated.ts`, which is verified against
   `ai-security-consumer-pin.v1.json` — a hand edit is precisely the drift the pin exists to catch.
2. **Tool-risk already works this way, and it is the good precedent.** `AI_TOOL_RISK_CLASSES`
   (`constants.ts:250`) is hand-written and pinned against a vendored producer vector, not read from
   the portable projection. Copying a shape that already has a green cross-repo checker is cheaper and
   safer than inventing a second one.
3. **Option B leaves the wire contract still.** `AI_DLP_CLASSES` is re-exported as
   `AI_DLP_CLASSES_SNAPSHOT` (`src/ai-governance/ai-governance-contract.snapshot.ts:13`) and read by
   `ai-governance-contract.parity.spec.ts:79, 145, 163`. Freezing it at 30 means the entire
   `ai-governance` wire-parity lane is untouched by this wave — the widening is a *governance*
   vocabulary change, not a wire change, and keeping those two separable is the point.
4. **It is reversible.** If the generator is ever recovered, `AI_SECURITY_DLP_CLASSES` can be
   re-pointed at a regenerated `AI_DLP_CLASSES` and the superset assertion in Step 2 becomes an
   equality. Nothing in Option B has to be undone first.

- [ ] **Step 1: write the decision into the plan and into the code**, as a docblock above the new
  tuple naming the artifact digest (`sha256:29006c25…f96d3`), the unresolvable source commit
  (`d366f5f8…`), the generator name and version (`ceragon-ai-security-artifact` v1.3.1), and the date
  of the discovery attempt. A future reader must not re-litigate this from scratch — and one already
  has, which is why C-1 exists.
- [ ] **Step 2: rewrite `ai-security-portable-reader.spec.ts:128-132` to assert the new relationship,
  not to delete the old one.** The contract becomes: `AI_DLP_CLASSES` (30) is a **strict subset** of
  `AI_SECURITY_DLP_CLASSES` (81), and every member appears in the same relative order. Assert both.
  A spec that merely stops asserting the identity is a weakened guard and §20.3 forbids it.
- [ ] **Step 3: leave `AI_SECURITY_PORTABLE_SOURCE_COMMIT`, `…_ARTIFACT_DIGEST`,
  `…_GENERATOR_VERSION` and the `runtimeActivatable: false` assertions at `:115-126` untouched.**
  They pin a different thing and they still pin it.

**Defeat test:** `ai-security-portable-reader.spec.ts` › "the governed DLP vocabulary is a superset of
the pinned V1 wire tuple" — remove one member of `AI_DLP_CLASSES` from the new governed tuple.
Expected failure text: `Expected AI_SECURITY_DLP_CLASSES to contain "kubeconfig"` (or whichever member
is dropped).
**Exit:** a named artifact — the docblock above `AI_SECURITY_DLP_CLASSES` in
`ai-security-policy.constants.ts` recording the fork, the digest, and the discovery result; plus the
rewritten spec asserting subset-and-order. If Option A becomes available, the exit criterion is
instead a regenerated artifact whose `AI_DLP_CLASSES.length === 81`, and that variant is **blocked on
the external dependency named above** until then.

---

## Task 3: Widen the governed DLP tuple to 81 without changing one existing posture

**Files:**
- `Backend/src/ai-security-policy/ai-security-policy.constants.ts` (the tuple, `:93`)
- `Backend/src/ai-security-policy/ai-class-metadata.ts` (`AI_CLASS_METADATA`; `meta()` at `:103`,
  `confidenceForMechanism` at `:89`, `classMetadataFor` at `:415`)
- `Backend/packages/shared-contracts/dlp-classes.v1.json` (vendored copy of the Task 1 vector)
- `Backend/src/ai-security-policy/ai-security-policy.dlp-class-parity.spec.ts` (create)
- `Backend/src/ai-security-policy/ai-policy-presets.ts:258-264`
- `Backend/src/ai-security-policy/ai-preset-distribution.spec.ts:223-235, 276-280` (the pinned tallies
  this widening moves — Step 9)

The tuple is one line. The work is everything the tuple's width silently controls. Enumerate it, do
not trust this list:

```bash
cd /c/Users/Owner/Documents/Ceragon/Backend
git grep -n "AI_SECURITY_DLP_CLASSES" origin/main -- src | grep -v '\.spec\.\|__tests__'
```

On 2026-08-28 that returned **22 hits: 6 imports, 1 definition (`constants.ts:93`), and 15 use sites
across 7 files** — `ai-class-metadata.ts:451`, `ai-policy-presets.ts:260`,
`ai-preset-distribution.ts:68`, `ai-risk-groups.ts:604`, `ai-security-policy.constants.ts:1976`,
`ai-security-policy.service.ts:2853, 3997, 4193, 4951, 5130, 5156, 5409, 5443`,
`resolve-strictest-policy.ts:452, 1025`. Use the count the command prints, not the count written here.

- [ ] **Step 1 (RED): write `ai-security-policy.dlp-class-parity.spec.ts` first**, modelled line for
  line on `ai-security-policy.tool-risk-class-parity.spec.ts`. Four cases, and the fourth is the one
  that matters:
  1. the vendored vector is internally consistent (digest recomputes);
  2. `AI_SECURITY_DLP_CLASSES` equals `vector.classes`, class for class;
  3. every producer class is settable — `cloneRecommendedAiSecurityPolicy().dlp.actions` has a key for
     each, and `assertRankablePolicyConfig` does not throw on it;
  4. **every producer class carries REAL console metadata, not the synthesized fallback.** Copy the
     assertion body from `tool-risk-class-parity.spec.ts:324-336` exactly — `label.length > 0`
     (`:334`), `label !== cls` (`:335`), `category !== 'other'` (`:336`) — because `classMetadataFor`
     returns a defined object for *any* string (`ai-class-metadata.ts:415-423`), so asserting only
     `toBeDefined()` passes over the exact defect.
  Run it. Expected: case 2 fails with `Expected length 30, received 81`.
- [ ] **Step 2: copy `parity-vectors/dlp-classes.v1.json` into
  `Backend/packages/shared-contracts/dlp-classes.v1.json`.** Manual copy, same as tool-risk. Task 6
  is what makes forgetting detectable.
- [ ] **Step 3: widen `AI_SECURITY_DLP_CLASSES` to the 81**, in the vector's sorted order.
  `AiSecurityPolicyDlpConfig.actions` is `Record<AiDlpClass, AiStoredDlpAction>` (`constants.ts:936`),
  so `tsc --noEmit` now fails on every literal action map that is short 51 keys. **That is the gate
  working.** Fix each by construction from the catalog, never by pasting 51 keys.
- [ ] **Step 4 (O-5 — SAME COMMIT AS STEP 3): the Recommended preset carries all 81 keys, and every
  existing posture is preserved byte for byte.**
  Two obligations, and they are not separable from Step 3:
  - **(a) The preset is total.** `cloneRecommendedAiSecurityPolicy().dlp.actions` has a key for each
    of the 81 **in the same commit that widens the tuple.** `sanitizeStoredConfig`
    (`service.ts:5399`) merges every stored tenant document over that preset on the **read** path; a
    tuple wider than the preset throws `resolveStrictestPolicy: non-rankable token undefined at
    dlp.actions.<class>` for **every tenant, fleet-wide**, on the next policy pull. Nobody has to
    write a policy for this to fire. This is the single highest-blast-radius constraint in the packet
    and it is restated at the top of this file.
  - **(b) Nothing moves.** The served disposition for all 30 pre-existing classes is byte-identical
    before and after; each of the 51 gets the `defaultAction` its `classSpec` already declares —
    **48 `warn`, 3 `monitor`**. This wave gives an administrator a dial. It does not turn one.
  Prove (b) with a before/after diff of `assembleEffectiveDto` output for the Recommended policy, not
  by reading the code.
- [ ] **Step 5: write real metadata for all 51 in `AI_CLASS_METADATA`.** Each needs a human label, a
  category that is not `other`, a mechanism, and an explicit `extractable`. Take the mechanism from
  the producer `classSpec.confidence`: the parity classes are context-qualified regex matches, so
  `regex-context`; `hex-credential-at-rest` and `private-key-candidate` carry producer confidence 0
  and are `keyword-heuristic`. **`extractable` is a security decision, not a default** — a class marked
  non-extractable turns an administrator's `block` into a hard stop rather than a redaction
  (`ai-security-policy.service.ts:2893`). Mark extractable only where the match is a cleanly
  strippable span, and say so per class.
- [ ] **Step 6: delete the `as` cast in `dlpActionsByConfidence` (`ai-policy-presets.ts:259`)** or
  replace it with a construction the compiler can check. It is the one place the totality type is
  defeated, and it is the place a missing metadata entry would otherwise land silently.
- [ ] **Step 7: run the whole `ai-security-policy` suite and baseline any failure against
  `origin/main` in a throwaway worktree before attributing it to this change.**
  `cd Backend && npx jest src/ai-security-policy`.
- [ ] **Step 8: prove the read path is safe for an old row.** Write a spec that feeds
  `sanitizeStoredConfig` a stored config carrying only the original 30 `dlp.actions` keys and asserts
  the result passes `assertRankablePolicyConfig`. This is the O-5 guard in test form; without it the
  widening is a coin flip on whether Step 4(a) actually happened in the same commit.
- [ ] **Step 9: move the preset-distribution tallies deliberately, and recompute them — do not chase
  green.** `ai-preset-distribution.spec.ts:223-235` pins `AI_PRESET_DISTRIBUTION_TOTAL === 108` with
  `['dlp', 30]` and the comment *"The ONLY literal 108 in the codebase, and deliberately so"*; `:276-280`
  pins five per-rung bucket tallies (`L1_OPEN` … `L5_REGULATED`) that each sum to 108. Widening dlp
  30 → 81 makes the total **81 + 18 + 20 + 40 = 159** and moves every rung.
  The rule: derive each new rung tally from the 51 classes' *known* preset disposition and assert
  that; then check the implementation agrees. Editing the expected numbers to whatever the run prints
  is the "test you cannot make red" shape, and this spec exists because a 108→90 flatten bug
  (`:59`, `:236`) shipped once already. **Wave 4C cites `108` as a verified fact; after this step it
  is `159`, and 4C's citation is a pre-Wave-1 snapshot.** Say so in the commit message.

**Defeat test:** `ai-security-policy.dlp-class-parity.spec.ts` › "every tier tuple equals the producer
catalog, class for class" — delete `"vault-token"` from
`Backend/packages/shared-contracts/dlp-classes.v1.json` and run. Expected failure text:
`Expected AI_SECURITY_DLP_CLASSES to equal vector.classes; received 81 vs 80` with `vault-token`
named in the diff.
**Second defeat test:** the same spec's metadata case — delete the `AI_CLASS_METADATA` entry for
`sentry-dsn`. Expected: `expect(received).not.toBe(expected) // Object.is equality` on
`response['sentry-dsn'].category` being `'other'`.
**Third defeat test (the O-5 guard):** the read-path spec from Step 8 — revert
`cloneRecommendedAiSecurityPolicy()`'s dlp map to 30 keys while leaving the tuple at 81. Expected:
`resolveStrictestPolicy: non-rankable token undefined at dlp.actions.aws-arn`. **If this mutation
does not go red, Step 4(a) is not done and the change must not be deployed.**
**Exit:** `AI_SECURITY_DLP_CLASSES.length === 81` **and
`AI_SECURITY_DLP_CLASSES.length === RegisteredClasses().length`** — the criterion restated from Wave −1
per C-1 — asserted by the vendored-vector comparison, **currently 30 vs 81**. The console's own
governance line, served by `Backend/src/ai-security-policy/ai-risk-groups.ts:604`
(`` `Data-loss detectors (${AI_SECURITY_DLP_CLASSES.length})` ``), reads `Data-loss detectors (81)`,
not `(30)` — a user-visible number that moves and can be screenshotted.

---

## Task 4: State the real failure mode for an unregistered class, and keep it non-green

**Files:**
- `Backend/src/ai-security-policy/ai-security-policy.unregistered-class-visibility.spec.ts` (extend to
  the DLP lane; 322 lines on `origin/main`)
- `Backend/src/ai-security-policy/ai-security-policy.service.ts` (the DLP counterpart of the tool-risk
  announcement)

**Correcting the old plan.** `plan:9141` reads: *"the six new classes are emitted by the endpoint and
rejected by the Backend: `assertClosedActionMap` throws on any `toolRisk.actions` key outside
`AI_TOOL_RISK_CLASSES` and `validateActionMap` 400s the write."* That sentence is **correct for the
policy write path** — verified verbatim, and restated in
`ai-security-policy.unregistered-class-visibility.spec.ts:19-22` and again at `:136-141` — and **wrong
for the agent wire**, where a finding's `class` is open text and nothing rejects it. Write both halves:

> An unregistered class is **accepted as evidence** off the agent wire, **rejected as policy** on the
> write path, and therefore **ungoverned**. It must be counted, named, and must keep the certificate
> non-green. It must never inherit a permissive action, and "no policy row" must never render as
> "allowed".

- [ ] **Step 1 (RED): extend the existing spec to DLP.** It is already the right file — it pairs every
  "warns" case with a control config that must produce no warning, and says why at `:30-35`
  (*"'always warns' and 'correctly warns' are the same green if you only ever assert that a warning
  happened"*), which is what stops a `logger.warn` moved outside its `if` from being celebrated. The
  tool-risk token `UNREGISTERED = 'quantum-exfil-9000'` already exists at `:39`; add
  `UNREGISTERED_DLP` cases mirroring the tool-risk ones (`:118-130`, `:142-146`, `:201-213`), each
  with its paired control.
- [ ] **Step 2: emit the DLP counterpart announcement**, same shape as the tool-risk one (C8).
- [ ] **Step 3: surface the count**, not just the log line: an `ungovernedClassCount` that a
  certificate run can read. A number in a log is not a measurement.

**Defeat test:** `ai-security-policy.unregistered-class-visibility.spec.ts` › the DLP control case —
move the announcement outside its `if`. Expected failure text: the paired control assertion,
`expect(warn).not.toHaveBeenCalled()` receiving 1 call, on an ordinary config with no unregistered
class.
**Exit:** `ungovernedClassCount` is emitted and readable; on `origin/main` today it would read **51**,
and after Task 3 it reads **0** against the same producer catalog. Both numbers come from the same
computation, so the drop is evidence rather than an assertion.

---

## Task 5: Eighty-one settable rows on the board, without losing the group partition

**Files:**
- `Frontend/types/vendored/dlp-classes.v1.json` (vendored copy of the Task 1 vector)
- `Frontend/types/ai-governance.ts:1988` (`AiDlpClass`), `:2086`
- `Frontend/components/admin/ai-security-policy-section.tsx:2638, 3547, 3632`
- `Frontend/components/admin/policy/ai-board-subgroups.ts:65`
- `Frontend/components/admin/policy/__tests__/ai-board-subgroups.test.ts`
- `Frontend/components/admin/__tests__/ai-security-policy-dlp-class-parity.test.ts` (create)

**The trap here is that the existing partition test will pass and the board will still be unusable.**
`ai-board-subgroups.test.ts:73` asserts "every lane's groups partition its class tuple exactly", and
`:109` documents that secrets are derived as the **complement** — *"so a new class defaults to being a
secret"*. All 51 will therefore land in "Secrets and keys" and the gate stays green while one board
section grows from ~24 rows to ~75.

- [ ] **Step 1 (RED): create `ai-security-policy-dlp-class-parity.test.ts`**, the mirror of
  `components/admin/__tests__/ai-security-policy-toolrisk-class-parity.test.ts`: local tuple equals
  the vendored vector, and every class carries real metadata.
- [ ] **Step 2: copy the vector to `Frontend/types/vendored/dlp-classes.v1.json`** and widen
  `AI_DLP_CLASSES`' Frontend consumer. Follow the Task 2 decision: the Frontend's own generated
  portable projection (`types/generated/ai-security-portable.generated.ts:53`) stays pinned and
  untouched.
- [ ] **Step 3: give the 51 real subgroups in `ai-board-subgroups.ts`,** so the complement rule stops
  being the answer for two thirds of the lane. The producer's `family` field is already the right
  axis and it ships in the Task 1 vector — do not invent a second taxonomy in the Frontend.
- [ ] **Step 4: add the case the current suite cannot fail** — assert no single DLP subgroup holds
  more than a stated fraction of the lane. Pick the number from the design, state it in the test, and
  say why. Without it, "partitions exactly" is satisfied by one group holding everything.
- [ ] **Step 5: render the board through the harness and look at it.** `Frontend/scripts/render-harness/`
  (`shoot.cjs` 635, `fixtures.cjs` 870, `stub-backend.cjs` 225, `README.md` 224 = 1,730 lines, C15)
  exists precisely because no console instance runs in this environment. Attach the screenshot to the PR.
  **⚠ BLOCKED — and it is a blocker, not a caveat.** `fixtures.cjs` answers no AI-security-policy
  route: `git show origin/main:scripts/render-harness/fixtures.cjs | grep -n "ai-security-policy\|presets"`
  returns nothing (verified 2026-08-28), so `admin/policies/ai-security` cannot be photographed at all
  today and reports `unfixtured` under `--strict`. **The fixture is added by Wave 5 Task 1 Step 2**
  (`w5_w6_console_triage.md`, "add the policy-presets fixture to `fixtures.cjs` for all six
  scenarios"). Until that lands, this step is not runnable and its artifact cannot be produced.
  Sequence Wave 5 Task 1 Step 2 before this step, or ship Task 5 with the screenshot recorded as
  **NOT EXERCISED — blocked on Wave 5 Task 1 Step 2**, never as done.

**Defeat test:** `ai-board-subgroups.test.ts` › "every lane's groups partition its class tuple
exactly" — remove one class from a named subgroup's `memberKeys` after Step 3. Expected failure text:
the partition assertion naming the orphaned class.
**Second defeat test:** the Step 4 case — put all 51 back into the complement group. Expected: the
stated-fraction assertion failing with the group's actual share.
**Exit:** `AI_DLP_CLASSES.length === 81` in the Frontend tuple, asserted against the vendored vector,
and no subgroup over the stated share. **Artifact — blocked on Wave 5 Task 1 Step 2:** the harness
screenshot showing 81 DLP rows, each with a working disposition control.

---

## Task 6: Make the cross-repo vocabulary check run inside a repository, and say honestly what it gates

**Files:**
- `Frontend/scripts/check-vocab-parity.mjs` (create — **the repo is Frontend**; see below)
- `Frontend/.github/workflows/vendored-upstream-drift.yml` (the workflow that actually runs)
- `Frontend/.github/workflows/pr-checks.yml` (the matrix, for when the trigger question is settled)
- `ci/lib/vocab-parity.mjs` (extend `COPIES` to cover DLP; keep the workspace runner)
- `ci/lib/vocab-parity.test.mjs`

This is C14's remaining half, and it is the reason the *tool-risk policy authority* dimension — the
one dimension §5.4 says can reach PASS — is `UNKNOWN` rather than green.

**Do not touch `Installers/.github/workflows/pr-checks.yml`.** Per reconciliation D-8 it is owned by
**Wave −1 Task 7**, which creates the toolrisk+shellast leg and the `ci/gates.json` mirror entry. This
task is in the Frontend repository only.

**What exists.** `ci/lib/vocab-parity.mjs` (618 lines, 24,024 bytes) reads the three tool-risk copies
out of the three repositories and compares them to each other. It derives everything from bytes on
disk (`:63-68`: *"Nothing below enumerates a class"*), and it **refuses to pass when it cannot
compare** — exit `0` PASS, `1` DRIFT, `2` NOT CHECKED, `3` usage (`:84-88`). Its `COPIES` table
(`:109-134`) is the only registry anywhere of where the vocabulary was copied to. **It has no
vocabulary axis**: `COPIES` is a flat array of three entries all describing
`toolrisk-classes.v1.json`, and `EXPECTED_FORMAT` (`:137`, checked at `:309-311`) is a single string.
Adding a second vocabulary is a small restructure, not an append.

**Why no repo's CI runs it.** It needs all three checkouts at once, and it lives at the workspace root,
outside all three. Neither Backend's nor Frontend's `pr-checks.yml` references it; neither does
Backend's `build.yml` or either `security.yml`.

**Correcting this file's own earlier claim, which reconciliation G-6 inherited.** An earlier revision
said `check:ai-security-consumer` — the script that verifies the generated portable projection against
its pin — *"is wired into `npm run build:shared-contracts` only, and no workflow runs either."*
**That is wrong, verified 2026-08-28.** `Backend/package.json:5` makes `prebuild` run
`build:shared-contracts`, and `:10` makes `pretest` run it too, so **every** `npm run build` and
**every** `npm test -- <path>` reaches `check:ai-security-consumer` (`:6-7`). `build.yml:246`
(`npm run build`) and `:371` (`npm test`) both do, as do `pr-checks.yml:229` and `:245`. The guard is
wired. **What it lacks is a trigger, not a workflow** — `build.yml`'s `on:` (`:3-6`) is
`workflow_dispatch` + `repository_dispatch: [backend-deploy]`, and Backend's `pr-checks.yml` `on:`
(`:35-38`) is `workflow_dispatch` + `repository_dispatch: [backend-pr-checks]`. So the pin check runs
on the **deploy** path and on manual dispatch, and never automatically on a push or a PR. There is no
missing wiring here for anyone to build; there is the packet-wide trigger question, which is an owner
spend decision. **G-6 is closed as a mis-statement, not as work.**

**The same trigger reality governs this task's own gate, and it must be stated, not assumed.**
`Frontend/.github/workflows/pr-checks.yml`'s `on:` block is **`workflow_dispatch: {}` and nothing
else** (`:89-90`, verified 2026-08-28) — the long comment above it at `:35-56` describes `push` and
`pull_request` triggers that **no longer exist**. A job added to that matrix runs when somebody
dispatches it. It is not a merge gate. By contrast `vendored-upstream-drift.yml`'s `on:` (`:39-43`) is
`workflow_dispatch` **plus a daily `cron: "15 6 * * *"`**, and it already holds the token. So:

**Land the check in `vendored-upstream-drift.yml` — the workflow that actually runs — and add it to
`pr-checks.yml`'s matrix as well.** Report it as a daily drift detector plus a dispatchable check,
never as a PR gate, until the repository's trigger question is settled.

**The precedent for doing this from inside one repo already exists and it does not use
`actions/checkout` of a sibling.** `Frontend/scripts/check-vendored-upstream.mjs` fetches the upstream
file over `https://api.github.com/repos/${repo}/contents/…?ref=…` (`:135-147`) with a PAT. Copy that
shape.

- [ ] **Step 1: extend `ci/lib/vocab-parity.mjs` to two vocabularies.** Give `COPIES` (`:109-134`) a
  vocabulary key and turn `EXPECTED_FORMAT` (`:137`) into a per-vocabulary tag, then add the DLP
  document — producer `Installers/parity-vectors/dlp-classes.v1.json`, consumers
  `Backend/packages/shared-contracts/dlp-classes.v1.json` and
  `Frontend/types/vendored/dlp-classes.v1.json`, format tag
  `ceragon.ai-security.dlp-class-catalog`. Extend `vocab-parity.test.mjs`'s fabricated-class case to
  the new document. **Add a tag; never loosen the check at `:309-311` to accept both.**
- [ ] **Step 2: write `Frontend/scripts/check-vocab-parity.mjs`**, fetching the producer vector from
  `Ceragon-Prod/Installers` over the contents API and comparing it to the local vendored copy.
  Preserve the NOT-CHECKED discipline exactly: **a missing token, an unreadable ref or unparseable
  JSON must exit non-zero.** `vendored-upstream-drift.yml:33-37` states the rule — *"A drift check
  that exits 0 because it checked nothing reports the same green as one that checked and found
  nothing"* — and it is the failure class this whole task exists to close.
  **State the coverage limit in the script's own header:** run from inside Frontend it compares
  **producer ↔ Frontend**, two of the three copies. Backend's copy is invisible to it. The third leg
  stays on the workspace runner, and the certificate must not claim three-copy coverage from a
  two-copy check.
- [ ] **Step 3: add the step to `vendored-upstream-drift.yml`** with
  `GH_TOKEN: ${{ secrets.INSTALLERS_READ_TOKEN }}` — the secret already used at `:72` — and add the
  same command to `pr-checks.yml`'s check matrix.
- [ ] **Step 4: land it green.** `pr-checks.yml`'s own rule, quoted in
  `vendored-upstream-drift.yml:16-18`: *"Landing a gate that is red from its first commit teaches
  everyone to ignore red."* Copy both vectors across (Tasks 3 and 5) **before** the check lands, in the
  same change or an earlier one.
- [ ] **Step 5: record the trigger truth in the PR body and in `ci/gates.json`.** One sentence: this
  check runs daily and on dispatch; `Frontend/.github/workflows/pr-checks.yml` carries only
  `workflow_dispatch`, so nothing here gates a merge. Silence is what turns a dispatch-only job into
  a claimed gate three months later.

**External dependency, named.** The check needs `secrets.INSTALLERS_READ_TOKEN` to exist in the
Frontend repository with read access to `Ceragon-Prod/Installers`. It is referenced by
`vendored-upstream-drift.yml:72`, which is strong evidence but not proof — **repository secrets cannot
be read from here.** Discovery: `gh secret list --repo Ceragon-Prod/Frontend`. If it is absent,
provisioning it is an **owner action**, and this task's exit criterion is blocked until then. A second,
weaker, unblocked fallback: run `node ci/lib/vocab-parity.mjs` inside the local Docker CI
(`node ci/lib/run.mjs workspace`) and record the result in the PR body — that is evidence, not a gate,
and it must be labelled as such.

**Defeat test:** the new job — regenerate the Installers vector with one class added and do **not**
copy it into the consumer repo. Expected: the job exits `1` with the script's DRIFT report naming the
class and stating which repos are missing it. Then delete `INSTALLERS_READ_TOKEN` from the job env and
re-run: expected exit `2`, `NOT CHECKED`, and the job still red.
**Exit:** `node ci/lib/vocab-parity.mjs` covers **2 vocabularies × 3 copies = 6 files** and reports
`PASS`; and `Frontend/.github/workflows/vendored-upstream-drift.yml` contains a step that fails on
producer/consumer drift for both vocabularies, proven by the defeat test above. **Blocked on
`secrets.INSTALLERS_READ_TOKEN` availability — owner action.** Until it lands, and for as long as
Frontend's `pr-checks.yml` carries only `workflow_dispatch`, the *tool-risk policy authority and
catalog totality* dimension stays `UNKNOWN` in the certificate, not `PASS` — a daily drift detector is
real evidence and it is not a merge gate, and this plan says which it is.

---

## Task 7: The malicious floor on the write path, and the floor made visible

**Files:**
- `Backend/src/ai-security-policy/ai-malicious-floor.ts` (export `categoryFloors()`)
- `Backend/src/ai-security-policy/ai-security-policy.service.ts:943, 2198`
- `Backend/src/ai-security-policy/dto/ai-security-policy.dto.ts`
- `Backend/src/ai-security-policy/ai-malicious-floor-write-path.spec.ts` (create)
- `Frontend/components/admin/ai-security-policy-section.tsx:3478, 3505-3510`
- `Frontend/components/admin/policy/downgrade-confirm-dialog.tsx:44-49, 52-61`
- `Frontend/components/admin/policy/__tests__/category-bucket-board.a11y.test.tsx:89`

**Check C2 first: the read path is closed and must not be re-done.** `withMaliciousFloorApplied` is
the first statement of `assembleEffectiveDto` (`ai-security-policy.service.ts:2198`), shipped in
`dfbac545` and deployed in task definition 322. It **raises**, it does not throw, and the reasoning is
written out at `:2168-2197`: throwing would fail the policy pull and strand that endpoint on its
last-known — i.e. sub-floor — policy indefinitely. `assertMaliciousFloorHeld`
(`ai-malicious-floor.ts:325`) remains deliberately unwired, and its docblock at `:315-324` says so.
**Do not wire it in.** 37 members: 23 toolRisk, 10 dlp (`:162-171`), 4 promptRisk.

**What is still open, in the floor file's own words** (`ai-malicious-floor.ts:37-41`):

> *"A direct section PUT through `validateAndMergeConfig` still does not consult the floor — it
> accepts any member of the stored action vocabulary for any registered class, so
> `PUT /ai-security-policy` with `toolRisk.actions['devoid-self-disable'] = 'monitor'` stores below the
> floor and returns 200."*

Since the read path started raising, that is no longer an enforcement hole — it is a **truth** hole,
and it is the defect class this workspace keeps shipping: the admin sets Monitor, gets `200`, the
board shows Monitor, and every endpoint is served `block`. Worse, `floorRaised`
(`ai-security-policy.service.ts:2198-2204`) goes to a `logger.warn` and **nowhere else** — it is on no
DTO, so the console cannot render the row as floor-pinned even though the raise happened. Verified by
`git grep -n floorRaised origin/main -- src`: four hits, all inside those seven lines.

**The trap in the old plan's version of this task.** `plan:1297-1435` calls
`assertWriteAboveFloor(merged)` on the fully-merged config. The merge base is
`sanitizeStoredConfigForSecurityUse(locked.config)` (`ai-security-policy.service.ts:937-939`) — the
**raw stored** config, not the floor-raised one — and the merge itself is `:943`. So a tenant already
sitting below the floor would get a `422` on an unrelated edit to an unrelated section, forever, with
no way out through the console. That is the same shape as the outage the read path deliberately avoided.

- [ ] **Step 1 (RED): write `ai-malicious-floor-write-path.spec.ts` around the delta, not the state.**
  The predicate is `findMaliciousFloorViolations(next) \ findMaliciousFloorViolations(base)`. Cases:
  a PUT that moves `dlp.private-key` from `redact` to `monitor` → `422` naming `dlp.private-key`;
  a PUT that touches `providers` on a tenant already below the floor → **`200`**, unchanged, with the
  pre-existing violation reported on the response rather than refused; the recommended policy → `200`;
  a stricter-than-floor config → `200`. Expected first run: `assertWriteAboveFloor is not a function`.
- [ ] **Step 2: add the guard and call it from every path that persists a full config.** Revalidation
  against current `origin/main` found **six**, not the four named in the 2026-08-22 draft:
  `putForSite`, `applyLibraryEntry`, `updateRiskGroupsForSite`, `applyPresetForSite`, `putForTeam`,
  and `applyPresetForTeam`. All six route through `runPutTransaction`; a floor enforced on only one
  write path is not enforced. The real HTTP/live-Postgres proof must enumerate all six routes and
  prove each reaches its named writer and persists through that shared transaction.
- [ ] **Step 3: export `categoryFloors()` from `ai-malicious-floor.ts`,** derived from
  `AI_MALICIOUS_FLOOR` itself, and put it on the policy response DTO alongside the classes that were
  raised at serve time. Preserve the old plan's Task 2 test content verbatim (`plan:1449-1483`) — it
  is good and it catches a real bug: the board has no `redact` disposition, `DISPOSITION_RANK['redact']`
  is `undefined`, and sending the raw `dlp` minimum (`credential()` sets `minimumDisposition: 'redact'`
  for the dlp section, `ai-malicious-floor.ts:119-124`) would make `isAtOrStricterThan` compare against
  `undefined` and **permit every move**.
- [ ] **Step 4: populate `category.floor` in the Frontend.** The board's refusal logic is already
  correct and already unreachable: `moveRefusalReason` (`category-bucket-board.tsx:689-690`) returns
  `null` whenever `category.floor == null`, and `floor?:` (`:222`) is set by **no production code** —
  `git grep -n "floor:" origin/main -- components app lib` returns only
  `components/overview/ai-activity-region.tsx:242, 258, 277, 293, 321`, where `floor: !deltasExact` is
  an unrelated boolean on an unrelated component. Verified 2026-08-28.
- [ ] **Step 5: fix `isProtected`, the consequence lookup, and the fixture that hides both.**
  Production member keys are lane-qualified — `boardMemberKey` is `` `${lane}:${cls}` `` at
  `ai-security-policy-section.tsx:3478`, applied at `:3508` — while the two tables keyed against them
  hold **bare** ids: `PROTECTED_DLP_CLASS_KEYS` (`downgrade-confirm-dialog.tsx:44-49`) and
  `DOWNGRADE_CONSEQUENCE` (`:52-61`). So **three arms are dead for every production member**:
  - `category-bucket-board.tsx:793` `PROTECTED_DLP_CLASS_KEYS.includes(m.row.key)` never matches;
  - the same line's `|| m.protectedReason != null` never matches either — `protectedReason` is
    declared at `:181` and set by no production code (`git grep -n protectedReason origin/main --
    components app lib` returns only `:181`, `:793`, `:795`);
  - `:795` `DOWNGRADE_CONSEQUENCE[m.row.key]` never matches, so **every** downgrade dialog falls back
    to `genericConsequence(m.row.label)` and no administrator has ever seen the specific
    consequence copy written for `private-key`, `aws-credential-pair`, `gcp-service-account` or
    `kubeconfig`.
  Fix the keying, and fix the fixture in the same change: the a11y suite passes because
  `category-bucket-board.a11y.test.tsx:89` uses `{ row: { key: "private-key", label: "Private key" } }`,
  the unqualified shape. Find every such site with
  `git grep -n 'key: "private-key"' origin/main -- components/admin/policy/__tests__` rather than
  guessing at the list. A fixture left in the pre-fix shape leaves the test one of the five inert
  shapes.

**Defeat test:** `ai-malicious-floor-write-path.spec.ts` › "refuses a move that newly drops a class
below the floor" — delete the `assertWriteAboveFloor` call from `putForSite`. Expected failure text:
`expect(received).toThrow(UnprocessableEntityException)` on a PUT setting `dlp.private-key` to
`monitor`.
**Second defeat test:** the same file's pre-existing-violation case — change the predicate from the
delta to the whole merged config. Expected: the unrelated-section PUT now throws `422`, failing
`expect(...).not.toThrow()`.
**Third defeat test:** `category-bucket-board.a11y.test.tsx` — revert the fixture key from
`dlp:private-key` to `private-key`. Expected: the typed-confirm case fails because `isProtected` no
longer matches and the dialog does not open.
**Fourth defeat test:** the consequence case — assert the dialog for `dlp:private-key` renders the
`DOWNGRADE_CONSEQUENCE` copy, then revert the keying. Expected: the assertion fails against
`genericConsequence`'s wording.
**Exit:** four numbers and one artifact. (1) `6` write endpoints call the guard, enumerated in the
spec. (2) A PUT that newly violates the floor returns `422` naming the class **and** the section, and
a PUT that does not returns `200` — both asserted against a real Backend, not a mock. (3)
`categoryFloors()` emits `0` dispositions the board cannot rank. (4) The response carries the
serve-time raised set, so `floorRaised` stops being log-only. **Artifact — blocked on Wave 5 Task 1
Step 2:** a render-harness screenshot of a floored category showing the lock chip and its reason.
`fixtures.cjs` answers no AI-security-policy route today, so this board cannot be photographed until
Wave 5 adds the fixture; until then the artifact is recorded **NOT EXERCISED — blocked on Wave 5
Task 1 Step 2**, and criteria (1)-(4) stand on their own.

---

## Wave exit criteria

Each is a number or a named artifact, and each names the test that goes red on revert.

1. **`|AI_SECURITY_DLP_CLASSES| == |RegisteredClasses()| == 81`**, in Backend and Frontend, asserted by
   comparison against a vendored copy of `parity-vectors/dlp-classes.v1.json`. Baseline **30 vs 81**.
   *This is Wave −1's exit criterion 4, restated per reconciliation C-1 and moved here, because the
   original form (`AI_DLP_CLASSES.length === RegisteredClasses().length`) is unachievable without
   hand-editing a digest-pinned generated file.*
   Defeat: `ai-security-policy.dlp-class-parity.spec.ts` › "every tier tuple equals the producer
   catalog" — drop one class from the vendored vector.
2. **All 81 have a console-settable disposition, and the 51 newly-settable ones ship at the posture
   they ship at today: 48 `warn`, 3 `monitor`, 0 changed.** Defeat: the parity spec's settability case
   — remove one class's entry from the Recommended preset and get
   `resolveStrictestPolicy: non-rankable token undefined at dlp.actions.<class>`.
3. **O-5 held, and evidenced by the commit graph, not by assertion: `git show --stat <sha>` for the
   commit that widens `AI_SECURITY_DLP_CLASSES` shows the Recommended preset widened to 81 keys in the
   same commit.** Defeat: Task 3's third defeat test — revert the preset to 30 keys while leaving the
   tuple at 81 and get the fleet-wide read-path throw. If that mutation does not go red, this
   criterion is not met and the change must not be deployed.
4. **`0` of the 81 resolve to the synthesized metadata fallback** — no `category === 'other'`, no
   `label === classId`. Baseline **51 of 81**. Defeat: delete one `AI_CLASS_METADATA` entry.
5. **`ungovernedClassCount` reads `0`** against the producer catalog, from the same computation that
   reads **51** on `origin/main` today. Defeat: remove a class from the Backend tuple only; the count
   goes to 1 and the certificate row goes non-green.
6. **A stored config carrying only the original 30 `dlp.actions` keys still passes
   `assertRankablePolicyConfig` after the widening.** Defeat: revert
   `cloneRecommendedAiSecurityPolicy()`'s dlp map to 30 keys.
7. **`AI_PRESET_DISTRIBUTION_TOTAL` reads `159` (81+18+20+40), the five per-rung bucket tallies are
   recomputed and each still sums to it, and the derivation is asserted rather than pasted.** Baseline
   **108**. Defeat: the flatten case at `ai-preset-distribution.spec.ts:236` — a flat union must still
   report a different number than the per-section tally.
8. **`node ci/lib/vocab-parity.mjs` covers 2 vocabularies × 3 copies = 6 files and reports `PASS`, and
   `Frontend/.github/workflows/vendored-upstream-drift.yml` fails on producer/consumer drift for both
   vocabularies.** **BLOCKED on `secrets.INSTALLERS_READ_TOKEN` existing in Frontend — an owner
   action, not engineering.** And stated in writing either way: the in-repo check runs **daily and on
   dispatch, not on a pull request** (Frontend's `pr-checks.yml` `on:` is `workflow_dispatch` only),
   and it compares **two of the three copies**. Until both are true, the *tool-risk policy authority
   and catalog totality* certificate dimension is **`UNKNOWN`, not `PASS`**.
9. **`6` write endpoints share the guarded transaction; a policy that newly drops a class below the
   floor is refused with `422` naming class and section; a PUT that does not newly violate returns
   `200`.** Verified against a real Backend, not a mock. Defeat: delete the guard call from
   `putForSite`.
10. **`categoryFloors()` emits `0` dispositions the board cannot rank, and the serve-time raised set
    reaches the DTO** — today `floorRaised` has 4 references, all inside one `logger.warn`.
11. **Deploy order held and evidenced (O-4):** Backend task definition deployed and its revision
    recorded **before** the Frontend build carrying the 81-row board. No agent release is required by
    this wave; if one is cut for unrelated reasons it still goes after the Backend. Deploying needs a
    fresh explicit owner ask (O-19), and `pr-checks` + `security` are dispatched on `main` first
    because the deploy gates are fail-closed on MISSING runs.
12. **Two render-harness artifacts, both BLOCKED on Wave 5 Task 1 Step 2** — the 81-row DLP board
    (Task 5) and a floored category showing its lock chip (Task 7). `fixtures.cjs` answers no
    AI-security-policy route on `origin/main`, so neither can be produced today. They are reported
    **NOT EXERCISED — blocked on Wave 5 Task 1 Step 2**, never as passing, and never as absent
    without the reason.

### What this wave does **not** move, and must not be reported as moving

- **R1 stays `NOT_READY`.** Its five other named blockers are untouched: two published FN residuals
  (`attack-private-key-block`, `attack-prod-db-connection-string`), the ingress private-key leak, the
  absent pre-egress boundary across every provider route (P0-15), the absent inspection-completeness
  contract, and **F16 endpoint signing-key custody — a signing-infrastructure dependency with
  procurement and key-ceremony lead time** (`docs/Devoid_Roadmap_To_Finished_Product.md:788`, a
  separate repository).
- **No false-positive claim of any kind.** Widening a vocabulary changes what an administrator can
  see and set. It measures nothing. Every rate for these 51 classes is `UNKNOWN` until Wave 3 repairs
  the instrument (D18) and Wave 3B supplies a denominator.
- **The lane-tally under-count is not fixed here.** Owned by Wave 5 (console truth) and carried there
  by **Task 11** (`w5_w6_console_triage.md:793`, exit criterion 10 at `:918-923`). See "What this wave
  deliberately does not do".
- **The standards mapping is not done here.** Reconciliation D-12 gives Wave 8 Task 7 the generated
  mapping and `TestEveryClassCarriesStandardsIds`; that wave's *"121 of 121"* exit covers all producer
  DLP classes, which is only reachable **after** this wave widens the governed vocabulary to 81. This
  wave is a precondition of it, not a participant in it.
- **"All DLP classes are governed" remains on the forbidden-claims list until criterion 1 passes with
  its defeat test demonstrated**, not merely written.
