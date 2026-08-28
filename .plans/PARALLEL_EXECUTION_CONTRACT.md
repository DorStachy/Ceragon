# Parallel execution contract — M4.7A and the 9+ programme

**Written 2026-08-28.** Two plans are being executed **at the same time, by different agent teams, in
different chat sessions**. This file is the contract between them. It is binding on both.

| Programme | Plan | Session | Subject |
|---|---|---|---|
| **P9** | `.plans/9plus-20260828/waves/*.md` | the session that authored it | Runtime enforcement: reach the decision, force the route, prove the effect |
| **P47** | `.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md` | a new session | Detection quality: what fires, how well, measured honestly |

**Read this before your first task. If you are an agent and you were handed a task without this file,
stop and ask for it.**

---

## 0. Why this exists

The two plans were written independently and **28 source files appear in both**. Two of those are
guaranteed conflicts, one is heavily edited by both, and several shared *resources* — one agent
release channel, one production Backend, one live-proof register — have no file-level conflict at all
and will still destroy each other's work if used without a protocol.

Nothing here is about politeness. Every rule below maps to a specific way these two programmes can
break each other or the fleet.

---

## 1. The split

**P9 owns the runtime enforcement substrate**: whether a decision is reached at all, whether the route
can be bypassed, whether the service survives a crash, whether an effect can be proven.
Directories: `internal/airuntime`, `internal/aicanary`, `internal/proxy`, `internal/aipolicycontract`,
`cmd/devoid-msi-root-guard`, `cmd/devoid` dispatch, the daemon's transport and service plumbing,
`windows-installer/`, and the Backend runtime-adapter/health/wire surfaces.

**P47 owns detection semantics and measurement**: which classes exist, what they fire on, what the
defaults are, what the corpora prove, and what the console says about all of it.
Directories: `internal/toolrisk`, `internal/dlp`, `internal/promptrisk`, `internal/ingressrisk`,
`internal/shellast`, `internal/neutraleval`, `cmd/ai-security-neutral`, `parity-vectors/`, the
Backend `ai-security-policy` tree, and the console's policy and detections surfaces.

**The rule when a task seems to need the other side's territory: it doesn't.** Post a request in the
handshake file (§5) and keep going on something else. A task that edits the other programme's
directory is out of scope by definition, no matter how small the edit looks.

---

## 2. The 28 shared files, with a single owner each

The count columns are how many times each plan references the file, which is a fair proxy for who has
more at stake. **The non-owner must not edit these files at all** — not a line, not an import, not a
test in the same package that forces a signature change.

| File | 9+ | 4.7A | OWNER | Why |
|---|---:|---:|---|---|
| `Backend/src/ai-governance/runtime-adapter-shape.ts` | 13 | 1 | **P9** | The runtime binding is P9's core object |
| `Installers/cmd/devoid/ai.go` | 7 | 3 | **P9** | Status/posture surfaces belong to coverage truth |
| `Installers/internal/daemon/server.go` | 6 | 5 | **P9** | Route registration and the service boundary |
| `Installers/internal/daemon/ai_handlers.go` | 5 | 9 | **P47 — SPECIAL, see §2.1** | Contested; the highest-risk file in the contract |
| `Backend/src/common/pipes/agent-ingest-validation.pipe.ts` | 4 | 1 | **P9** | P9 W8 T5 is the field-drop counter; it lands first for both |
| `Installers/internal/airuntime/runner.go` | 4 | 1 | **P9** | Budgets and the decision latch |
| `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts` | 4 | 2 | **P9** | Control authority is enforcement, not detection |
| `Backend/src/ai-governance/services/ai-query.service.ts` | 4 | 2 | **P47** | Detections read path |
| `Installers/internal/liveproof/register.json` | 4 | 4 | **BOTH — see §3.2** | Append-only protocol, never a rewrite |
| `Frontend/types/ai-governance.ts` | 3 | 7 | **P47** | Mostly detection vocabulary |
| `Backend/src/ai-governance/dto/ai-response.dto.ts` | 3 | 1 | **P9** | |
| `Backend/src/ai-governance/services/runtime-adapter-render.util.ts` | 3 | 1 | **P9** | |
| `Installers/internal/aicanary/exec.go` | 3 | 3 | **P9 — see §2.2** | Both plans specify the SAME fix |
| `Installers/internal/codexmanaged/canary.go` | 3 | 2 | **P9** | Canary machinery |
| `Installers/internal/codexmanaged/testdata/liveproof/ledger.json` | 3 | 2 | **BOTH — §3.2** | Same append-only rule |
| `Frontend/components/admin/ai-security-policy-section.ts` | 3 | 4 | **P47** | Policy authoring UI |
| `Installers/internal/aipolicycontract/detector_catalog_generated.go` | 2 | 3 | **P47 regenerates, P9 reads** | §2.3 |
| `Installers/internal/codexmanaged/hookdialect.go` | 2 | 4 | **P47 — FROZEN, see §2.4** | Neither may widen the pin |
| `Frontend/app/admin/endpoints/coverage-section.ts` | 2 | 1 | **P9** | Coverage truth |
| `Installers/.github/workflows/pr-checks.yml` | 7 | 8 | **BOTH — §3.3** | Append-only, one leg per commit |
| `Installers/.github/workflows/release.yml` | 2 | 2 | **NEITHER — §3.1** | Release changes need the owner |
| `Installers/internal/neutraleval/contract.go` | 1 | 5 | **P47** | Evaluation contract |
| `Installers/cmd/devoid/agent_shim.go` | 1 | 2 | **P9** | Launch gate and dispatch |
| `Installers/cmd/devoid/main.go` | 1 | 1 | **P9** | The uppercase-extension dispatch fix |
| `Installers/internal/liveproof/liveproof.go` | 1 | 1 | **P9** | Register mechanics |
| `Installers/internal/aipolicycontract/detector_catalog_test.go` | 1 | 1 | **P47** | Pairs with the generated catalog |
| `Frontend/scripts/render-harness/fixtures.cjs` | 1 | 2 | **P47 owns, P9 appends** | §2.5 |
| `Backend/src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts` | 1 | 1 | **P47** | Mirror discipline |

### 2.1 `ai_handlers.go` — the contested file

P47 references it 9 times, P9 five, and both edit real behaviour. Splitting a 3,000-line file by
convention will fail. So:

- **P47 owns the file.** P9 does not edit it directly.
- P9's needs there are all *additive seams* — a decision source, a receipt hook, a transport
  observation. P9 raises each as a handshake request (§5) naming the exact function and signature.
- **P47 lands the seam as its own commit, with no behaviour change**, and replies with the commit SHA.
  P9 then wires to it from P9-owned files.
- A seam-only commit is cheap, reviewable and cannot break detection. A merge conflict in this file
  between two agent teams is not.

### 2.2 `aicanary/exec.go` — both plans specify the same fix, so only one may make it

Both plans independently found that a 5-second `WaitDelay` reports a real deny as a launch failure,
and both wrote the fix. **P9 implements it** (P9 Wave 6 Task 1, which bounds the grace per call site
rather than raising one constant). **P47 must delete its version and cite P9 Wave 6 Task 1.**
If both implement it, the second one to merge either conflicts or silently reverts the first's
per-call-site design back to a constant.

### 2.3 The detector catalog

`detector_catalog_generated.go` is generated. **P47 regenerates it** when classes change. **P9 reads
it and must never hand-edit it** — P9's own plan already establishes that the pinned artifact is the
authority and that hand-editing a generated file is the drift the pin exists to catch.
After any P47 regeneration, P47 posts the new `DetectorCatalogDigest` to the handshake file, because
P9 Wave 1 pins it.

### 2.4 `hookdialect.go` is FROZEN for both programmes

Neither plan may add a dialect row. The rule is unchanged and predates both: **a row requires two
vendor artefacts taken off a real binary**, and widening the pin on inference is how the firewall
went silently dead the first time. The owner's own client (`0.149.0-alpha.4.1`) stays uncertified
until those artefacts exist. If either programme obtains them, it goes through the owner, not through
a plan task.

### 2.5 The render harness

P47 owns `fixtures.cjs`. P9 needs a fixture for the coverage surfaces. **P9 appends a new fixture
object; it never edits an existing one.** Two teams editing one fixture silently changes what the
other team's screenshots prove.

---

## 3. Shared resources — no file conflict, and far more dangerous

### 3.1 The agent release channel — SERIALISED, OWNER-GATED

There is one `stable.json` and one release workflow. **Neither programme cuts a release on its own
authority.** Both plans already carry the rule that deploying needs a fresh explicit owner ask; this
adds that a release now carries *both* programmes' merged work, so:

1. The programme that needs the release posts a request to the handshake file listing its merged SHAs.
2. **The other programme replies with its own merged-but-unreleased SHAs**, or with "nothing pending".
3. The owner is given one combined list and asked once.
4. Whoever runs the release posts the resulting version and the promoted SHA back.

A release cut by one programme ships the other's half-finished work to every endpoint. This is the
single most likely way these two plans hurt a customer.

### 3.2 The live-proof register and the Codex ledger — APPEND ONLY

Both programmes add observations. `register.json` and `testdata/liveproof/ledger.json` are the
scoreboard for the whole product.

- **Append your entry. Never rewrite, reorder, or reformat the file.** A prettifier run by one team
  turns every subsequent diff into a conflict.
- Never change another programme's entry, including to "correct" it. Raise it in the handshake file.
- Never flip an entry to `observed` without its five evidence fields. Both plans already say this;
  it matters more now that two teams can do it.

### 3.3 `pr-checks.yml` — one leg per commit, append only

Both programmes add CI legs. Add your leg in its own commit, at the end of the job list, and never
reformat or reorder existing jobs. **And know that on the current GitHub plan these legs are
advisory** — branch protection returns 403 on all six repos, so a leg tells you a rule was broken but
does not stop the merge. Run `node ci/lib/run.mjs <repo>` locally; that is the only gate that
actually blocks you.

### 3.4 Backend migrations — timestamp collisions are silent

Both programmes add migrations. Two migrations with adjacent timestamps authored in parallel can
apply in an order neither team tested.

- Before writing a migration, post the intended timestamp to the handshake file.
- Never renumber the other programme's migration.
- If a migration is non-transactional (`CREATE INDEX CONCURRENTLY` sets `public transaction = false`),
  say so in the handshake post — the production runner detects it by regex and it cannot be batched.

### 3.5 Backend deploys — one production, two programmes

Both plans have Backend-before-agent ordering rules. A deploy carries whatever is on `main`.

- Post to the handshake before requesting a deploy, listing what of yours it carries.
- The other programme must confirm its own merged work is deployable, or say what is not ready.
- The deploy gates are **fail-closed on MISSING runs**: `pr-checks` and `security` must be dispatched
  on `main` for that exact SHA first. Whoever deploys does that for the combined tip, not just their
  own commits.

---

## 4. Branching

- P9 branches: `p9/<wave>-<task>` — e.g. `p9/w2-t8-session-token`
- P47 branches: `p47/<wave>-<task>` — e.g. `p47/w0a-destructive-rm`
- Both merge to `main` in their repos. Neither creates a long-lived integration branch that the other
  cannot see; a fix campaign here previously stalled because 39 commits sat on 7 unmerged branches.
- **Merge each task as it completes.** Do not batch. A crash and three API outages hit one campaign in
  this workspace, and only committed work survived.
- Work in a git worktree under `C:/cwt/`. **Never `git stash` anywhere in this workspace** —
  `refs/stash` is shared across worktrees and a pop steals the other session's work. This has already
  happened twice here, and with two teams running it becomes likely rather than possible.

---

## 5. The handshake file

`C:/Users/Owner/Documents/Ceragon/.plans/PARALLEL_HANDSHAKE.md`

Append-only. Newest at the bottom. One entry per request or notice:

```
### 2026-08-29T14:02Z · P9 · SEAM REQUEST
File: Installers/internal/daemon/ai_handlers.go
Need: a call site for the effect receipt after the tool decision resolves
Proposed signature: recordEffectReceipt(ctx, decisionID string, effect EffectResult) error
Blocking: P9 W5 T6
```

```
### 2026-08-29T16:40Z · P47 · SEAM LANDED
Commit: a1b2c3d4 (Installers) — seam only, no behaviour change
Re: the 2026-08-29T14:02Z request
```

Entry kinds: `SEAM REQUEST`, `SEAM LANDED`, `RELEASE REQUEST`, `DEPLOY REQUEST`, `MIGRATION CLAIM`,
`CATALOG DIGEST`, `CONFLICT`, `BLOCKED`.

**If you are blocked on the other programme, post `BLOCKED` and switch tasks. Do not wait, and do not
work around it by editing their files.**

---

## 6. Cross-programme dependencies that actually exist

These are real, not bookkeeping. Each has a direction.

| Dependency | Direction | Consequence if ignored |
|---|---|---|
| **P9 W8 T5 (agent-wire field-drop counter) lands and DEPLOYS before any contract widening in either programme** | P9 → both | `AgentIngestValidationPipe` drops unknown keys instead of rejecting them. Without the counter, an agent-ahead-of-Backend mistake produces no error, no data, and a console that looks correct. This is the first Backend change of either programme. |
| **P9 Phase 1 (local decision core) before P47 believes any false-positive measurement** | P9 → P47 | P47's own D18 says measurements taken on an unrepaired instrument are invalid. The same applies to a substrate that fails open: six of ten private-key prompts leaked under load. An FP rate measured on that is a rate about the load, not the detector. |
| **P47 W0A (destructive-rm narrowing) is independent and goes FIRST** | none | It is the only item in either programme with live customer impact today. It needs an agent release, which is §3.1. |
| **P47 catalog regeneration → P9's pinned digest** | P47 → P9 | P9 Wave 1 pins `DetectorCatalogDigest`. A silent regeneration breaks P9's contract test. Post it (§2.3). |
| **P9 W3 T1-T2 (uppercase-extension dispatch bypass)** | none | Phase 0, two files, no dependency either way. Cheap and security-relevant; do it early. |

---

## 7. What to do when the contract is wrong

It will be. Twenty-eight files were found by grep, not by reading every task; a real collision will
surface that this table does not predict.

**Post `CONFLICT` to the handshake, stop touching the file, and let the two programmes agree an owner
before either proceeds.** Do not resolve it by being fast. The failure mode this contract exists to
prevent is two correct changes that are wrong together — which is exactly the shape that has already
cost this workspace a fleet-wide outage, a bricked upgrade class three times over, and a regex that
two waves narrowed incompatibly.
