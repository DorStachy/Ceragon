# Wave 1 — Make every class the endpoint can emit governable

**Depends on:** Wave −1 (rebase manifest, citation repair, and the written decision on which tuple is
the governed DLP vocabulary — Task 2 below is that decision's engineering half). Wave 0A may run in
parallel; nothing here blocks it and it blocks nothing here.
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

## Context an engineer needs

### Read `origin/main` with `git show`. The working trees do not contain these files.

Measured 2026-08-27: **Backend is 773 commits behind** `origin/main` (`15dd89ba` vs `0cf9021e`),
**Frontend 525** (`1fe6e7a6` vs `cac574ae`), **Installers 1,010** (vs `5b129523`). Every file this
wave touches is absent from the working tree — `ls Backend/src/ai-security-policy/ai-malicious-floor.ts`,
`ls Installers/internal/dlp/codesecurity_rules.go` and
`ls Frontend/components/admin/policy/category-bucket-board.tsx` all return
`No such file or directory`. Work in an isolated worktree off `origin/main`; never switch branches in
these checkouts (they are shared with live sessions) and never `git add -A`.

```bash
cd /c/Users/Owner/Documents/Ceragon/Backend && git fetch origin
MSYS_NO_PATHCONV=1 git show "origin/main:src/ai-security-policy/ai-malicious-floor.ts" | less
```

`MSYS_NO_PATHCONV=1` is mandatory on Git Bash for any path containing `.github`; without it
`git show "origin/main:.github/workflows/pr-checks.yml"` fails with
`ambiguous argument 'origin\main;.github\workflows\pr-checks.yml'`.

### The producer emits 81 DLP classes. The Backend governs 30. Verified by counting, 2026-08-27.

| Where | Count | How it was counted |
|---|---|---|
| `Installers/internal/dlp/registry.go:133` `classRegistry` | **33** | `git show origin/main:internal/dlp/registry.go \| sed -n '133,198p' \| grep -c '{class:'` |
| `Installers/internal/dlp/codesecurity_rules.go:70` `codeSecurityParityClasses` | **48** | same technique over lines 70-159 |
| `RegisteredClasses()` (`registry.go:221`, over `classIndex` at `:201`) | **81** | union of the two tables; `registry_confidence_test.go:259` proves the tables never overlap |
| `AI_DLP_CLASSES` (`Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts:54`) | **30** | enumerated |
| `AI_DLP_CLASSES` (`Frontend/types/generated/ai-security-portable.generated.ts:53`) | **30** | enumerated; byte-identical set to Backend's, diffed |
| **Ungoverned** | **51** | `comm -23` of the two sorted sets. **Zero classes are governed-but-not-produced** — the delta is entirely one-directional |

`ClassHighEntropy` in the registry table resolves to `"high-entropy"` (`internal/dlp/dlp.go:52`), so
the 33 and the 30 line up on 30 shared names plus three registry-only ones.

**The 51, exactly.** All 48 `codeSecurityParityClasses`, plus three from `classRegistry`:
`private-key-candidate`, `base64-wrapped-secret`, `hex-credential-at-rest`.

### What posture those 51 ship at, and why no administrator can change it

`Installers/internal/aicontext/respond.go:175` `ActionFor` resolves in three steps: the
administrator's configured action, then `dlp.DefaultClassAction(class)` (`:179`), then the tier
default. Step 2 is clamped by `capAutomaticDefault` (`:194`) to `automaticDefaultCeiling = ActionWarn`
(`:189`).

Step 1 can never fire for these 51, because the Backend cannot store a key for them:
`assertClosedActionMap` (`Backend/src/ai-security-policy/resolve-strictest-policy.ts:426`) **throws**
via `nonRankableToken` (`:412`) on any `dlp.actions` key outside `AI_SECURITY_DLP_CLASSES`, and
`validateActionMap` (`ai-security-policy.service.ts:4754`) **400s** the write with
`dlp.actions: unknown class "<x>"`.

So the shipped posture is whatever the producer's own `defaultAction` says, capped at warn. Counted
from the two tables:

- **48 of the 51 ship at `warn` — the interrupt tier.** (46 of the 48 parity classes, plus
  `base64-wrapped-secret` and `hex-credential-at-rest`.)
- **3 ship at `monitor`.** (Two parity identifier classes, plus `private-key-candidate`.)

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
3. **A spec asserts the alias identity.** `ai-security-portable-reader.spec.ts:128-133` — *"makes the
   old Backend names aliases, not competing policy enums"* — asserts
   `expect(AI_SECURITY_DLP_CLASSES).toBe(AI_DLP_CLASSES)` (reference identity, not deep equality).
   `:115` pins the source commit and artifact digest by literal.

So "generate `AI_DLP_CLASSES` from `RegisteredClasses()`" **cannot be done by regenerating the
portable artifact** from anything in this workspace. Task 2 records the fork and picks the buildable
side. Do not hand-edit the generated file: it is verified against the pin, and a hand edit is exactly
the drift the pin exists to catch.

### The precedent to copy is tool-risk, and it is good

C3/C4 closed the identical problem for tool-risk and **must not be rebuilt** (source material §2):

- `Installers/internal/toolrisk/class_catalog.go:57` `ClassCatalog()` loops the live rule tables plus
  `astClassSeverity` (`:47`) — a rule added without a catalog update is impossible.
- `class_catalog_test.go:189` `TestClassCatalog_ParityVector` writes
  `parity-vectors/toolrisk-classes.v1.json` under `TOOLRISK_CLASSES_UPDATE=1` (`:193`) and compares
  LF-normalised otherwise (a raw byte compare went red on every Windows worktree).
- The vector: `classCount: 40`, `sha256:2cc7caeff31a09169d5d947fddf805f5d1f4f7eddcfcc984be5f83e69d1af922`.
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

**There is no DLP class vector.** `Installers/parity-vectors/dlp-findings.json` is a text→findings
parity corpus for the two engines, not a class catalog. Creating the class vector is Task 1.

### Widening the tuple does not brick stored tenants — because of one function

`sanitizeStoredConfig` (`ai-security-policy.service.ts:5399`) merges the stored document over
`cloneRecommendedAiSecurityPolicy()`, its own docblock saying *"so rows written before a catalog grew
still produce complete action maps"*. That is the migration safety net and it is **conditional on the
Recommended preset carrying all 81 keys in the same change**. If the tuple widens and the preset does
not, `assertClosedActionMap` throws `resolveStrictestPolicy: non-rankable token undefined at
dlp.actions.<class>` on the *read* path for every tenant, fleet-wide.

The preset builder does widen automatically: `dlpActionsByConfidence`
(`ai-policy-presets.ts:258-264`) loops `AI_SECURITY_DLP_CLASSES` and calls `confidenceOf(cls)`. But it
returns `{} as Record<AiDlpClass, …>` — an `as` cast that **defeats the compile-time totality check**.
The runtime behaviour is safe (`classMetadataFor`, `ai-class-metadata.ts:415-423`, falls back to a
synthesized entry rather than `undefined`), which is worse: the widening compiles, runs, and produces
51 rows labelled with their own raw class id, in group `other`, at confidence `low`, with
`extractable: false`.

`extractable: false` is not cosmetic. `ai-security-policy.service.ts:2893` reads
`stored === 'block' && !hardStopDlp && isExtractableClass(cls) ? 'redact' : stored` — so an
administrator who sets one of the 51 to `block` gets a **hard stop** rather than a span redaction,
purely because the metadata was never written.

### Deploy ordering, stated precisely

**Backend deploys before the Frontend ships the 81-row board.** The console PUTs
`dlp.actions`; a key the Backend has not registered 400s at `validateActionMap`. Backend first is not
a preference.

**No agent release is required by this wave.** The agent already emits all 81 (that is the defect) and
tolerates a widened policy: the strict `DisallowUnknownFields` decoder
(`Installers/internal/core/backend/ai_policy_bundle.go:75`) applies to the delivery *envelope*, while
`PolicyBody` is a `json.RawMessage`, and `internal/aicontext` reads `p.Actions[class]` as an open map.
Verified 2026-08-27. If a later wave changes floor membership, that constraint returns.

### What this wave deliberately does not do

- It does **not** rebuild the tool-risk producer authority (C3/C4). `ClassCatalog()` already loops the
  rule tables, the vector is byte-identical in three repos, and two RED mutations are already proven.
- It does **not** add any DLP class to the malicious floor. All 10 DLP floor members
  (`ai-malicious-floor.ts`, `credential('dlp', …)` at `:118-123`) are inside today's 30. Adding a
  floor member changes the served posture of every existing tenant on the next assembly — an owner
  decision, not a side effect of a vocabulary change.
- It does **not** fix the lane-tally under-count. Measured 2026-08-27: `detectorCount`
  (`Frontend/components/admin/policy/category-bucket-board.tsx:2164-2168`) now correctly counts
  `membersAtDisposition`, but the column it sums over is still `byDisposition` (`:1758-1766`), which
  buckets by **category** disposition under strictest-wins. So a board where every category folds to
  Block still answers *"is anything set to warn?"* with **0 categories · 0 detectors** while members
  warn. That is console truth and belongs to **Wave 5**; it is recorded here so it is not lost.

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
  tables never declare the same class twice, so the union is safe to hash.
- [ ] **Step 3: emit `parity-vectors/dlp-classes.v1.json`** with `format:
  "ceragon.ai-security.dlp-class-catalog"`, `formatVersion: 1`, `producer: "Installers/internal/dlp"`,
  `classCount`, `sha256` over the canonicalised body, and a `wire` block naming the policy key path
  (`section: "dlp"`, `keys: ["enabled","actions","customClasses"]`) — the tool-risk vector's
  `formatVersion 2` added `wire` precisely because the class names and the wire keys are two contracts
  and only one was pinned.
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
- `Backend/src/ai-security-policy/ai-security-portable-reader.spec.ts:128-133` (the alias assertion is
  rewritten, deliberately, with the reason in the diff)

This is a design fork, and the plan picks a side because one side is not buildable from this
workspace.

**Option A — regenerate the portable artifact so `AI_DLP_CLASSES` itself becomes 81.** Cleanest: one
tuple, one pin, no divergence. **Blocked, external dependency:** the generator
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
producer vector; `AI_DLP_CLASSES` stays the frozen V1 wire tuple.** This is exactly what tool-risk
already does (`AI_TOOL_RISK_CLASSES` at `constants.ts:250` is hand-written and pinned against a
vendored vector, not read from the portable projection). **This plan takes Option B** unless the
discovery command above finds the generator.

- [ ] **Step 1: write the decision into the plan and into the code**, as a docblock above the new
  tuple naming the artifact digest, the unresolvable source commit, and the date of the discovery
  attempt. A future reader must not re-litigate this from scratch.
- [ ] **Step 2: rewrite `ai-security-portable-reader.spec.ts:128-133` to assert the new relationship,
  not to delete the old one.** The contract becomes: `AI_DLP_CLASSES` (30) is a **strict subset** of
  `AI_SECURITY_DLP_CLASSES` (81), and every member appears in the same relative order. Assert both.
  A spec that merely stops asserting the identity is a weakened guard and §20.3 forbids it.
- [ ] **Step 3: leave `AI_SECURITY_PORTABLE_SOURCE_COMMIT`, `…_ARTIFACT_DIGEST` and the
  `runtimeActivatable: false` assertions at `:115-126` untouched.** They pin a different thing and
  they still pin it.

**Defeat test:** `ai-security-portable-reader.spec.ts` › "the governed DLP vocabulary is a superset of
the pinned V1 wire tuple" — remove one member of `AI_DLP_CLASSES` from the new governed tuple.
Expected failure text: `Expected AI_SECURITY_DLP_CLASSES to contain "kubeconfig"` (or whichever member
is dropped).
**Exit:** a named artifact — the docblock above `AI_SECURITY_DLP_CLASSES` in
`ai-security-policy.constants.ts` recording the fork, the digest, and the discovery result; plus the
rewritten spec. If Option A becomes available, the exit criterion is instead a regenerated artifact
whose `AI_DLP_CLASSES.length === 81`, and this task is **blocked on the external dependency named
above** until then.

---

## Task 3: Widen the governed DLP tuple to 81 without changing one existing posture

**Files:**
- `Backend/src/ai-security-policy/ai-security-policy.constants.ts` (the tuple, `:93`)
- `Backend/src/ai-security-policy/ai-class-metadata.ts` (`AI_CLASS_METADATA`; `meta()` at `:103`,
  `confidenceForMechanism` at `:89`, `classMetadataFor` at `:415`)
- `Backend/packages/shared-contracts/dlp-classes.v1.json` (vendored copy of the Task 1 vector)
- `Backend/src/ai-security-policy/ai-security-policy.dlp-class-parity.spec.ts` (create)
- `Backend/src/ai-security-policy/ai-policy-presets.ts:258-264`

The tuple is one line. The work is everything the tuple's width silently controls: **12 production
call sites across 7 files**, enumerable with

```bash
cd /c/Users/Owner/Documents/Ceragon/Backend
git grep -n "AI_SECURITY_DLP_CLASSES" origin/main -- src | grep -v '\.spec\.\|__tests__'
```

which returned, on 2026-08-27: `ai-class-metadata.ts:451`, `ai-policy-presets.ts:260`,
`ai-preset-distribution.ts:68`, `ai-risk-groups.ts:604`, `ai-security-policy.constants.ts:1976`,
`ai-security-policy.service.ts:2853, 3997, 4193, 4951, 5130, 5156, 5409, 5443`,
`resolve-strictest-policy.ts:452, 1025`.

- [ ] **Step 1 (RED): write `ai-security-policy.dlp-class-parity.spec.ts` first**, modelled line for
  line on `ai-security-policy.tool-risk-class-parity.spec.ts`. Four cases, and the fourth is the one
  that matters:
  1. the vendored vector is internally consistent (digest recomputes);
  2. `AI_SECURITY_DLP_CLASSES` equals `vector.classes`, class for class;
  3. every producer class is settable — `cloneRecommendedAiSecurityPolicy().dlp.actions` has a key for
     each, and `assertRankablePolicyConfig` does not throw on it;
  4. **every producer class carries REAL console metadata, not the synthesized fallback.** Copy the
     assertion body from `tool-risk-class-parity.spec.ts:323-339` exactly — `label.length > 0`,
     `label !== cls`, `category !== 'other'` — because `classMetadataFor` returns a defined object for
     *any* string, so asserting only `toBeDefined()` passes over the exact defect.
  Run it. Expected: case 2 fails with `Expected length 30, received 81`.
- [ ] **Step 2: copy `parity-vectors/dlp-classes.v1.json` into
  `Backend/packages/shared-contracts/dlp-classes.v1.json`.** Manual copy, same as tool-risk. Task 6
  is what makes forgetting detectable.
- [ ] **Step 3: widen `AI_SECURITY_DLP_CLASSES` to the 81**, in the vector's sorted order.
  `AiSecurityPolicyDlpConfig.actions` is `Record<AiDlpClass, AiStoredDlpAction>` (`constants.ts:936`),
  so `tsc --noEmit` now fails on every literal action map that is short 51 keys. **That is the gate
  working.** Fix each by construction from the catalog, never by pasting 51 keys.
- [ ] **Step 4: preserve every existing posture, and set the 51 to the producer's own default.**
  The rule is: the served disposition for all 30 pre-existing classes is byte-identical before and
  after; each of the 51 gets the `defaultAction` its `classSpec` already declares — **48 `warn`,
  3 `monitor`**. This wave gives an administrator a dial. It does not turn one.
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
  the result passes `assertRankablePolicyConfig`. This is the fleet-wide-outage guard; without it the
  widening is a coin flip on `cloneRecommendedAiSecurityPolicy()` having been updated in the same
  commit.

**Defeat test:** `ai-security-policy.dlp-class-parity.spec.ts` › "every tier tuple equals the producer
catalog, class for class" — delete `"vault-token"` from
`Backend/packages/shared-contracts/dlp-classes.v1.json` and run. Expected failure text:
`Expected AI_SECURITY_DLP_CLASSES to equal vector.classes; received 81 vs 80` with `vault-token`
named in the diff.
**Second defeat test:** the same spec's metadata case — delete the `AI_CLASS_METADATA` entry for
`sentry-dsn`. Expected: `expect(received).not.toBe(expected) // Object.is equality` on
`response['sentry-dsn'].category` being `'other'`.
**Third defeat test:** the read-path spec from Step 8 — revert
`cloneRecommendedAiSecurityPolicy()`'s dlp map to 30 keys. Expected:
`resolveStrictestPolicy: non-rankable token undefined at dlp.actions.aws-arn`.
**Exit:** `AI_SECURITY_DLP_CLASSES.length === 81` and
`AI_SECURITY_DLP_CLASSES.length === RegisteredClasses().length`, asserted by the vendored-vector
comparison, **currently 30 vs 81**. The console's own governance line at `ai-risk-groups.ts:604` reads
`Data-loss detectors (81)`, not `(30)` — a user-visible number that moves and can be screenshotted.

---

## Task 4: State the real failure mode for an unregistered class, and keep it non-green

**Files:**
- `Backend/src/ai-security-policy/ai-security-policy.unregistered-class-visibility.spec.ts` (extend to
  the DLP lane)
- `Backend/src/ai-security-policy/ai-security-policy.service.ts` (the DLP counterpart of the tool-risk
  announcement)

**Correcting the old plan.** `plan:9141` reads: *"the six new classes are emitted by the endpoint and
rejected by the Backend: `assertClosedActionMap` throws on any `toolRisk.actions` key outside
`AI_TOOL_RISK_CLASSES` and `validateActionMap` 400s the write."* That sentence is **correct for the
policy write path** — verified verbatim, and restated in
`ai-security-policy.unregistered-class-visibility.spec.ts:19-23` — and **wrong for the agent wire**,
where a finding's `class` is open text and nothing rejects it. Write both halves:

> An unregistered class is **accepted as evidence** off the agent wire, **rejected as policy** on the
> write path, and therefore **ungoverned**. It must be counted, named, and must keep the certificate
> non-green. It must never inherit a permissive action, and "no policy row" must never render as
> "allowed".

- [ ] **Step 1 (RED): extend the existing spec to DLP.** It is already the right file — 322 lines,
  already pairs every "warns" case with a control config that must produce no warning
  (`:29-34`), which is what stops a `logger.warn` moved outside its `if` from being celebrated. Add
  `UNREGISTERED_DLP = 'quantum-exfil-9000'` cases mirroring the tool-risk ones.
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
  `ai-security-policy-toolrisk-class-parity.test.ts`: local tuple equals the vendored vector, and
  every class carries real metadata.
- [ ] **Step 2: copy the vector to `Frontend/types/vendored/dlp-classes.v1.json`** and widen
  `AI_DLP_CLASSES`' Frontend consumer. Follow the Task 2 decision: the Frontend's own generated
  portable projection (`types/generated/ai-security-portable.generated.ts:537`) stays pinned and
  untouched.
- [ ] **Step 3: give the 51 real subgroups in `ai-board-subgroups.ts`,** so the complement rule stops
  being the answer for two thirds of the lane. The producer's `family` field is already the right
  axis and it ships in the Task 1 vector — do not invent a second taxonomy in the Frontend.
- [ ] **Step 4: add the case the current suite cannot fail** — assert no single DLP subgroup holds
  more than a stated fraction of the lane. Pick the number from the design, state it in the test, and
  say why. Without it, "partitions exactly" is satisfied by one group holding everything.
- [ ] **Step 5: render the board through the harness and look at it.** `scripts/render-harness/`
  (`shoot`, `fixtures`, `stub-backend`, 1,730 lines, C15) exists precisely because no console instance
  runs in this environment. Attach the screenshot to the PR.

**Defeat test:** `ai-board-subgroups.test.ts` › "every lane's groups partition its class tuple
exactly" — remove one class from a named subgroup's `memberKeys` after Step 3. Expected failure text:
the partition assertion naming the orphaned class.
**Second defeat test:** the Step 4 case — put all 51 back into the complement group. Expected: the
stated-fraction assertion failing with the group's actual share.
**Exit:** the harness screenshot showing 81 DLP rows, each with a working disposition control, and no
subgroup over the stated share. `AI_DLP_CLASSES.length === 81` in the Frontend tuple, asserted against
the vendored vector.

---

## Task 6: Make the cross-repo vocabulary check run inside a repository's PR gate

**Files:**
- `Frontend/scripts/check-vocab-parity.mjs` (create — or Backend; pick one and say which)
- `Frontend/.github/workflows/pr-checks.yml`
- `ci/lib/vocab-parity.mjs` (extend `COPIES` to cover DLP; keep the workspace runner)
- `ci/lib/vocab-parity.test.mjs`

This is C14's remaining half, and it is the reason the *tool-risk policy authority* dimension — the
one dimension §5.4 says can reach PASS — is `UNKNOWN` rather than green.

**What exists.** `ci/lib/vocab-parity.mjs` (618 lines) reads the three tool-risk copies out of the
three repositories and compares them to each other. It derives everything from bytes on disk
(`:64-70`: *"Nothing below enumerates a class"*), and it **refuses to pass when it cannot compare** —
exit `0` PASS, `1` DRIFT, `2` NOT CHECKED, `3` usage (`:84-88`). Its `COPIES` table (`:107-134`) is
the only registry anywhere of where the vocabulary was copied to.

**Why no repo's CI runs it.** It needs all three checkouts at once, and it lives at the workspace root,
outside all three. Backend's `pr-checks.yml` does not reference it; neither does `build.yml` or
`security.yml`. (While confirming that, note a second gap for Wave −1: `check:ai-security-consumer`
— the script that verifies the generated projection against its pin — is wired into
`npm run build:shared-contracts` only, and **no workflow runs either.** `npm run build` is `nest build`.)

**The precedent for doing this from inside one repo already exists in this workspace and it does not
use `actions/checkout` of a sibling.** `Frontend/scripts/check-vendored-upstream.mjs` fetches the
upstream file over `https://api.github.com/repos/${repo}/contents/…?ref=…` (`:136-146`) with a PAT,
driven by `Frontend/.github/workflows/vendored-upstream-drift.yml`. Copy that shape.

- [ ] **Step 1: extend `ci/lib/vocab-parity.mjs`'s `COPIES` to the DLP vector** — producer
  `Installers/parity-vectors/dlp-classes.v1.json`, consumers
  `Backend/packages/shared-contracts/dlp-classes.v1.json` and
  `Frontend/types/vendored/dlp-classes.v1.json` — and extend `vocab-parity.test.mjs`'s fabricated-class
  case to the new document. The script derives the schema tag from `EXPECTED_FORMAT` (`:137`), so add
  the DLP tag rather than loosening the check.
- [ ] **Step 2: write `check-vocab-parity.mjs` in the chosen repo**, fetching the producer vector from
  `Ceragon-Prod/Installers` over the contents API and comparing it to the local vendored copy.
  Preserve the NOT-CHECKED discipline exactly: **a missing token, an unreadable ref or unparseable
  JSON must exit non-zero.** `vendored-upstream-drift.yml:32-37` states the rule — *"A drift check
  that exits 0 because it checked nothing reports the same green as one that checked and found
  nothing"* — and it is the failure class this whole task exists to close.
- [ ] **Step 3: add it to `pr-checks.yml`** with `GH_TOKEN: ${{ secrets.INSTALLERS_READ_TOKEN }}` —
  the secret name already used by `vendored-upstream-drift.yml:72`.
- [ ] **Step 4: land it green.** `pr-checks.yml`'s own rule, quoted in
  `vendored-upstream-drift.yml:16-19`: *"Landing a gate that is red from its first commit teaches
  everyone to ignore red."* Copy both vectors across (Tasks 3 and 5) **before** the gate lands, in the
  same change or an earlier one.

**External dependency, named.** The check needs `secrets.INSTALLERS_READ_TOKEN` to exist in the target
repository with read access to `Ceragon-Prod/Installers`. It exists in Frontend for
`vendored-upstream-drift.yml`; whether it exists in Backend is **UNKNOWN — repository secrets cannot
be read from here.** Discovery:
`gh secret list --repo Ceragon-Prod/Frontend` and `--repo Ceragon-Prod/Backend`. If the chosen repo
lacks it, provisioning it is an **owner action**, and this task's exit criterion is blocked until then.
A second, weaker, unblocked fallback: run `node ci/lib/vocab-parity.mjs` inside the local Docker CI
(`node ci/lib/run.mjs workspace`) and record the result in the PR body — that is evidence, not a gate,
and it must be labelled as such.

**Defeat test:** the new PR job — regenerate the Installers vector with one class added and do **not**
copy it into the consumer repo. Expected: the job exits `1` with the script's DRIFT report naming the
class and stating which repos are missing it. Then delete `INSTALLERS_READ_TOKEN` from the job env and
re-run: expected exit `2`, `NOT CHECKED`, and the job still red.
**Exit:** `node ci/lib/vocab-parity.mjs` covers **2 vocabularies × 3 copies = 6 files** and reports
`PASS`; and at least one repository's `pr-checks.yml` contains a job that fails on producer/consumer
drift for both vocabularies. **Blocked on `secrets.INSTALLERS_READ_TOKEN` availability in that repo —
owner action.** Until it lands, the *tool-risk policy authority and catalog totality* dimension stays
`UNKNOWN` in the certificate, not `PASS`.

---

## Task 7: The malicious floor on the write path, and the floor made visible

**Files:**
- `Backend/src/ai-security-policy/ai-malicious-floor.ts` (export `categoryFloors()`)
- `Backend/src/ai-security-policy/ai-security-policy.service.ts:943, 2198`
- `Backend/src/ai-security-policy/dto/ai-security-policy.dto.ts`
- `Backend/src/ai-security-policy/ai-malicious-floor-write-path.spec.ts` (create)
- `Frontend/components/admin/ai-security-policy-section.tsx:3478, 3505-3510`
- `Frontend/components/admin/policy/__tests__/category-bucket-board.a11y.test.tsx`

**Check C2 first: the read path is closed and must not be re-done.** `withMaliciousFloorApplied` is
the first statement of `assembleEffectiveDto` (`ai-security-policy.service.ts:2198`), shipped in
`dfbac545` and deployed in task definition 322. It **raises**, it does not throw, and the reasoning is
written out at `:2168-2197`: throwing would fail the policy pull and strand that endpoint on its
last-known — i.e. sub-floor — policy indefinitely. `assertMaliciousFloorHeld`
(`ai-malicious-floor.ts:325`) remains deliberately unwired, and its docblock at `:317-324` says so.
**Do not wire it in.** 37 members: 23 toolRisk, 10 dlp, 4 promptRisk.

**What is still open, in the floor file's own words** (`ai-malicious-floor.ts:39-42`):

> *"A direct section PUT through `validateAndMergeConfig` still does not consult the floor — it
> accepts any member of the stored action vocabulary for any registered class, so
> `PUT /ai-security-policy` with `toolRisk.actions['devoid-self-disable'] = 'monitor'` stores below the
> floor and returns 200."*

Since the read path started raising, that is no longer an enforcement hole — it is a **truth** hole,
and it is the defect class this workspace keeps shipping: the admin sets Monitor, gets `200`, the
board shows Monitor, and every endpoint is served `block`. Worse, `floorRaised`
(`ai-security-policy.service.ts:2198-2205`) goes to a `logger.warn` and **nowhere else** — it is on no
DTO, so the console cannot render the row as floor-pinned even though the raise happened. Verified by
`git grep -n floorRaised origin/main -- src`: four hits, all inside those eight lines.

**The trap in the old plan's version of this task.** `plan:1297-1435` calls
`assertWriteAboveFloor(merged)` on the fully-merged config. The merge base is
`sanitizeStoredConfigForSecurityUse(locked.config)` (`ai-security-policy.service.ts:937-939`) — the
**raw stored** config, not the floor-raised one. So a tenant already sitting below the floor would get
a `422` on an unrelated edit to an unrelated section, forever, with no way out through the console.
That is the same shape as the outage the read path deliberately avoided.

- [ ] **Step 1 (RED): write `ai-malicious-floor-write-path.spec.ts` around the delta, not the state.**
  The predicate is `findMaliciousFloorViolations(next) \ findMaliciousFloorViolations(base)`. Cases:
  a PUT that moves `dlp.private-key` from `redact` to `monitor` → `422` naming `dlp.private-key`;
  a PUT that touches `providers` on a tenant already below the floor → **`200`**, unchanged, with the
  pre-existing violation reported on the response rather than refused; the recommended policy → `200`;
  a stricter-than-floor config → `200`. Expected first run: `assertWriteAboveFloor is not a function`.
- [ ] **Step 2: add the guard and call it from every path that persists a full config.** The old
  plan's list is correct and worth preserving: `putForSite`, `@Post('library/apply')`,
  `@Post('apply-preset')`, `@Put('team/:groupId')`. A floor enforced on one of four write paths is not
  enforced. Confirm the list against `origin/main` before wiring — do not trust the 2026-08-22 list.
- [ ] **Step 3: export `categoryFloors()` from `ai-malicious-floor.ts`,** derived from
  `AI_MALICIOUS_FLOOR` itself, and put it on the policy response DTO alongside the classes that were
  raised at serve time. Preserve the old plan's Task 2 test content verbatim (`plan:1449-1483`) — it
  is good and it catches a real bug: the board has no `redact` disposition, `DISPOSITION_RANK['redact']`
  is `undefined`, and sending the raw `dlp` minimum would make `isAtOrStricterThan` compare against
  `undefined` and **permit every move**.
- [ ] **Step 4: populate `category.floor` in the Frontend.** The board's refusal logic is already
  correct and already unreachable: `moveRefusalReason` (`category-bucket-board.tsx:689-690`) returns
  `null` whenever `category.floor == null`, and `floor?:` (`:222`) is set by **no production code** —
  the only `floor:` producers in the repo are in `components/overview/ai-activity-region.tsx`, an
  unrelated component. Verified 2026-08-27.
- [ ] **Step 5: fix `isProtected` and the fixture that hides it.** `category-bucket-board.tsx:792-793`
  tests `PROTECTED_DLP_CLASS_KEYS.includes(m.row.key) || m.protectedReason != null`. Production member
  keys are lane-qualified — `boardMemberKey` is `` `${lane}:${cls}` `` at
  `ai-security-policy-section.tsx:3478`, applied at `:3508` — while
  `PROTECTED_DLP_CLASS_KEYS` (`downgrade-confirm-dialog.tsx:44-49`) holds bare ids, and
  `protectedReason` is set by no production code. **Both arms are dead for every production member.**
  The a11y suite passes because its fixture uses `{ row: { key: "private-key" } }`, the unqualified
  shape. Fix the fixture to the production shape in the same change, or the test remains one of the
  five inert shapes.

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
**Exit:** four numbers and one artifact. (1) `4` write endpoints call the guard, enumerated in the
spec. (2) A PUT that newly violates the floor returns `422` naming the class **and** the section, and
a PUT that does not returns `200` — both asserted against a real Backend, not a mock. (3)
`categoryFloors()` emits `0` dispositions the board cannot rank. (4) The response carries the
serve-time raised set, so `floorRaised` stops being log-only. Artifact: a render-harness screenshot of
a floored category showing the lock chip and its reason.

---

## Wave exit criteria

Each is a number or a named artifact, and each names the test that goes red on revert.

1. **`|AI_SECURITY_DLP_CLASSES| == |RegisteredClasses()| == 81`**, in Backend and Frontend, asserted by
   comparison against a vendored copy of `parity-vectors/dlp-classes.v1.json`. Baseline **30 vs 81**.
   Defeat: `ai-security-policy.dlp-class-parity.spec.ts` › "every tier tuple equals the producer
   catalog" — drop one class from the vendored vector.
2. **All 81 have a console-settable disposition, and the 51 newly-settable ones ship at the posture
   they ship at today: 48 `warn`, 3 `monitor`, 0 changed.** Defeat: the parity spec's settability case
   — remove one class's entry from the Recommended preset and get
   `resolveStrictestPolicy: non-rankable token undefined at dlp.actions.<class>`.
3. **`0` of the 81 resolve to the synthesized metadata fallback** — no `category === 'other'`, no
   `label === classId`. Baseline **51 of 81**. Defeat: delete one `AI_CLASS_METADATA` entry.
4. **`ungovernedClassCount` reads `0`** against the producer catalog, from the same computation that
   reads **51** on `origin/main` today. Defeat: remove a class from the Backend tuple only; the count
   goes to 1 and the certificate row goes non-green.
5. **A stored config carrying only the original 30 `dlp.actions` keys still passes
   `assertRankablePolicyConfig` after the widening.** This is the fleet-wide-outage guard. Defeat:
   revert `cloneRecommendedAiSecurityPolicy()`'s dlp map to 30 keys.
6. **`node ci/lib/vocab-parity.mjs` covers 2 vocabularies × 3 copies = 6 files and reports `PASS`,
   and at least one repository's `pr-checks.yml` fails on producer/consumer drift for both.**
   **The CI half is BLOCKED on `secrets.INSTALLERS_READ_TOKEN` existing in the chosen repository — an
   owner action, not engineering.** Until it lands, the *tool-risk policy authority and catalog
   totality* certificate dimension is **`UNKNOWN`, not `PASS`**, and this plan says so in writing
   rather than reporting the local run as a gate.
7. **`4` write endpoints refuse a policy that newly drops a class below the floor, with `422` naming
   class and section; a PUT that does not newly violate returns `200`.** Verified against a real
   Backend, not a mock. Defeat: delete the guard call from `putForSite`.
8. **`categoryFloors()` emits `0` dispositions the board cannot rank, and the serve-time raised set
   reaches the DTO** — today `floorRaised` has 4 references, all inside one `logger.warn`. Artifact: a
   render-harness screenshot of a floored category rendering its lock chip and reason.
9. **Deploy order held and evidenced:** Backend task definition deployed and its revision recorded
   **before** the Frontend build carrying the 81-row board. No agent release is required by this wave;
   if one is cut for unrelated reasons it still goes after the Backend.

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
- **"All DLP classes are governed" remains on the forbidden-claims list until criterion 1 passes with
  its defeat test demonstrated**, not merely written.
