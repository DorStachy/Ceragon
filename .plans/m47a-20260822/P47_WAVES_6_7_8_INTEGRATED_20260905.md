# P47 — Waves 6, 7A, 7B, 7C and 8 built and integrated

2026-09-05. Every wave the owner named has its code. Seven repositories, seven integration branches,
**nothing pushed, nothing merged to `main`, nothing deployed.**

## Where the work sits

| Repository | Integration branch | Commits ahead of `main` |
|---|---|---|
| Backend | `p47/integration-backend` | 26 |
| Frontend | `p47/w6-frontend` | 28 |
| Installers | `p47/fix-system-exfil` | 111 |
| GithubApp-Bot-Scanner-Worker | `p47/integration-scanner` | 18 |
| Sandbox-Worker | `p47/w7c-containment` | 2 |
| Ceragon-Intelligence | `p47/w7c-platform` | 1 |
| Static-Worker | `p47/w7b-static` | 1 |

Two merges were performed and both were verified on the merged tree rather than on either branch:

- **Backend** — Wave 6's half and Wave 8's half. The conflict I predicted in `ai-governance.module.ts`
  never happened: the Wave 8 agent put its consumer in new files and registered it in a different
  module instead of reaching into the other agent's. 25 suites, 490 passed, 15 skipped.
- **Scanner** — Wave 7A's execution truth and Wave 7B's certification, off an agreed file split that
  held. 65 suites, 792 passed on `github-action`, which is more than either branch produced alone.

## Task state

| Wave | Built | Not built, and why |
|---|---|---|
| 6 console triage | **13 of 13** | — |
| 7A scanner execution truth | 6 BUILT, 1 PARTIAL, 1 handed on | T5 needs one real fork-PR run before a release tag; T8 was Backend and landed there |
| 7B scanner certification | 5 BUILT, 3 PARTIAL, 1 BUILT | three exit criteria are unmeetable, below |
| 7C sandbox containment | **2 of 2** | one deploy half owner-gated |
| 8 enforcement certificate | Backend half BUILT (5 commits) + the schema | **the Go half is blocked on a toolchain, not on engineering** |

## The pattern worth carrying forward

**Three separate waves would have built a false green by following their own task text literally.**
That is not bad luck three times; it is what a plan written ahead of the code does.

1. **Wave 7C, Task 2.** The task describes gating one detonation site. There are three — the npm and
   PyPI *import-trigger* runs sit outside the install block. Following it literally would have refused
   the install detonation and then executed the package anyway through the import-trigger harness,
   where module-body supply-chain malware actually fires. **P0-18 would have read closed while open.**
2. **Wave 7A, Task 1(b).** It says a missing execution manifest's *"every array carries"* the
   `coverage-contract-missing` marker. Taken at its word that puts the marker in `succeeded`, which
   closes the required-coverage gap and turns *"nobody measured"* into PASS.
3. **Wave 7A, Task 6.** It says read the runtime envelope first. The worker writes its own measurement
   at the top level **last**, commented *"RESERVED and worker-authoritative"*, precisely so a
   version-skewed dispatcher cannot overrule it. Envelope-first inverts the invariant the ordering
   exists to protect.

In all three the agent measured the tree, found the text wrong, and wrote down why. That is the
behaviour to keep.

## Findings that change what we may say

**The scanner's published bounds were cluster-blind.** Ten traps live in five fixture files, eight
recall controls in seven; the published numbers counted cases. Recomputed under Clopper-Pearson exact
one-sided at zero errors and checked independently:

| | Published | Honest |
|---|---|---|
| False-positive ceiling | 25.89% | **45.07%** |
| Recall floor | 68.77% | **65.18%** |

Both move against us. That is what makes them worth having.

**A migration would have aborted the deploy.** Wave 6 Task 8 built its nine CHECK values through a
template interpolation; the production runner sends SQL verbatim, so Postgres would have received the
interpolation's own characters. The five new triage classifications would have been unwritable in
production while the console offered them. Found by the Wave 8 agent, fixed by the Wave 6 agent,
`lint-migrations` now clean.

**Static-Worker was shipping a `dist` 207 files behind its `src`.** An mtime check could never have
caught it — every built file was newer than every source file. The freshness check that landed is a
content digest.

**A live fleet-safety gate is already failing on `main`.** `agent-wire-leniency.spec.ts` fails on 6
agent controllers. Baselined at the branch point in a throwaway worktree: identical 6 failures. Not
ours, and not new.

## Tests that could not fail, and now can

Six were found and closed. Three the Frontend agent found in **its own** work by reading fixtures
rather than trusting runs; one the Wave 8 agent found in **its own** spec when a sixth mutation
refused to redden; two were inherited.

The three Frontend ones, each proven by a mutation that reddened exactly one test while every
pre-existing test stayed green:

| Mutation | Result |
|---|---|
| Bypass `safeDisplayText` on the command field | 1 red, 14 green |
| Print the console's count instead of the server's | 1 red, 12 green |
| Delete the page reset from the second funnel | 1 red, 9 green |

The first is the one that mattered. `detectionCommandRender` claims the value goes *"through the SAME
strict decoder the list uses"*, and every existing case fed it benign text — so the decoder could have
been deleted silently. That is the field an analyst reads to decide whether an action was hostile, and
it is attacker-authored: the endpoint records what actually ran. The new case puts a bidi override, a
zero-width space, an ANSI escape and a newline inside one plausible `git commit`, paired against the
honest command keeping its exact text, because a decoder that mangled everything would otherwise pass.

## Crash hygiene — now a known hazard with a rule

Two crashes left **four** production files carrying deliberate defeat-run mutations that read as
ordinary work. Two were found and reverted by the wave's own agent; two by an orchestrator sweep,
including `verifyMessage(body, signature, signingKey) || true` — **HMAC signature verification
disabled outright**. None was committed. Only one of the four carried a marker comment.

**The rule, now in every agent brief:** before `git add`, read every modified hunk and ask whether it
is the task or a break introduced to redden a test. A deliberate break committed under a message that
says something else is worse than a lost task.

## What is NOT done, and why

- **Wave 8's Go half.** The `go` toolchain on this machine is a DeVoid shim whose enrollment is broken
  (`Signed device proof is required for agent re-enrollment`). It fails closed, correctly. Writing Go
  that cannot be run would mean shipping tests nobody has seen go red, which is the failure this
  programme exists to end. Needs `devoid setup` from the owner — a credentials action.
- **Three Wave 7B exit criteria are unmeetable, not open.** The recall benchmark has never run and its
  own runner *refuses to fabricate a pass*; 0 of 4 LLM routes were executed because that needs vendor
  artefacts the owner withdrew; 7 of 13 signature bypasses are closed, and the six that remain each
  carry a written gap.
- **No CI gate has fired anywhere.** Billing is withdrawn. Every workflow leg added across these waves
  is spelled correctly and unrun, and none is reported otherwise.
- **The shared-contracts mirror guard has never run in this workspace** — see
  `P47_MIRROR_DIVERGENCE_20260905.md`. Every "the copies agree" statement about those seven files is
  UNKNOWN rather than true.
- **No database, no browser, no AWS.** Two new migrations have never been applied to a real Postgres;
  the live-PostgreSQL lane skipped 15 tests and the harness says plainly that a skip is not coverage.

## Deploy ordering, when it is asked for

Backend before any agent release, and this time there is a second reason: Frontend Task 7 added
`channel` to the request allowlist, and because the facet rail is derived from that allowlist the
control now renders on the canonical detections page too. **If the deployed Backend revision does not
accept `channel`, every detections load 400s — including the page everyone uses.**
