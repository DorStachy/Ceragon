# W-1 T1 — Ownership cross-check, every plan file against all 28 contract rows

Generated mechanically on 2026-09-03 by `ownership-scan.json`'s producer, not by reading the table.
That distinction is the whole point of this wave: the plan's first draft checked three named
exclusions by eye and missed three owned files. The second draft checked by reading and missed two
more. This pass parses all 28 rows of `.plans/PARALLEL_EXECUTION_CONTRACT.md` §2, extracts every
path the plan names, and matches them — with a positive control asserting the parse found exactly
28 rows, so a broken parse cannot report "no collisions".

**It found a bug in itself, which is worth recording.** The first version normalised paths with
`lstrip("./")`, which strips *characters*, not a prefix — so `.github/workflows/pr-checks.yml`
became `github/...` on one side only and two contract rows were invisible. A second positive
control now asserts those two normalise equal. A checker nobody checks is not a check.

## The standing fact this wave rests on

`PARALLEL_EXECUTION_CONTRACT.md` is an agreement between **two** programmes, P9 and P47. This
plan is a **third**. Every one of the 28 rows is therefore a non-owner file for us by default —
we are not a party to the contract that allocates them. Nothing here claims otherwise; each row
below is a request or an abstention, never a claim.

## Exact path collisions (9)

| Plan path | Owner | Which task wants it | Disposition |
|---|---|---|---|
| `internal/daemon/server.go` | **P9** | W1 T2 (daemon paths follow scope) | **SEAM REQUEST** — posted |
| `cmd/devoid/main.go` | **P9** | W2 T1 (service-install branch) | **SEAM REQUEST** — posted |
| `Backend/src/ai-governance/runtime-adapter-shape.ts` | **P9** | W2 T3 (machineTier field) | **SEAM REQUEST** — posted |
| `cmd/devoid/ai.go` | **P9** | W5 T1 names `ai.go:892` in its Files list | **SEAM REQUEST** — posted. *Found by this scan; named by no earlier draft.* |
| `Frontend/components/admin/ai-security-policy-section.tsx` | **P47** | W6 T5 (rollout ring row) | **SEAM REQUEST** — posted to **P47**, a different programme from the other four. *Found by this scan.* |
| `.github/workflows/pr-checks.yml` | **BOTH** §3.3 | W3 T3 / W6 T3 (dialect drift leg) | **Legal already** — append-only, one leg per commit |
| `internal/codexmanaged/testdata/liveproof/ledger.json` | **BOTH** §3.2 | W3 T1 (dialect observation) | **Legal already** — append-only |
| `internal/liveproof/register.json` | **BOTH** §3.2 | W6 T4 (live-proof entry) | **Legal already** — append-only |
| `internal/codexmanaged/hookdialect.go` | **P47 — FROZEN** §2.4 | W3 (the pin) | **Not touched.** The plan hands the owner a measurement command; it never adds a row |

## Basename-only matches, checked and cleared (4 of 9)

The scan also matched bare filenames the plan mentions without a path. Five duplicate the exact
list above. The remaining four:

| Mentioned | Contract row | Owner | Disposition |
|---|---|---|---|
| `ai_handlers.go` | `Installers/internal/daemon/ai_handlers.go` | **P47 — SPECIAL** §2.1 | Not touched. §6 of the plan already disclaims it |
| `release.yml` | `Installers/.github/workflows/release.yml` | **NEITHER** §3.1 | Not touched. §6 disclaims it |
| `canary.go` | `Installers/internal/codexmanaged/canary.go` | **P9** | Not touched. Named only as context for the contested-directory question |
| `hookdialect.go` | (same as the exact row above) | P47 FROZEN | Not touched |

## The contested directory — `internal/codexmanaged/` (W-1 T4)

Not resolved by this scan, because the contract does not resolve it. Three files under that path
have rows (`canary.go` → P9, `hookdialect.go` → P47/FROZEN, `testdata/liveproof/ledger.json` →
BOTH); the rest of the directory has none.

P47 did not merely ask who owns it. It **staked a default claim** at
`PARALLEL_HANDSHAKE.md:2110`: *"We are treating it as P47's because the dialect machinery is a
detection-semantics concern… Correct us if that is wrong."* No reply is recorded.

**If that default stands**, every file this plan wants to add or edit under `codexmanaged/` —
`provider.go`, `machine_projection.go`, `machine_effective.go`, `requirements.go`,
`capability_disposition.go`, `dialectprobe/`, and the new `testdata/` fixtures — is a non-owner
edit, and W2, W3 and W4 become wait-on-seam waves rather than direct-edit waves. That is a
materially different plan, which is why W-1 gates on it rather than assuming.

The question is posted. Until it is answered, **no task in this programme writes under
`internal/codexmanaged/`** except the two already-legal append-only files.

## W-1 T5 — the `pr-checks.yml` append, checked against the live file

Checked against the working tree, not the committed plan. The last five commits touching
`.github/workflows/pr-checks.yml`:

```
d3cb7efe p9(w1-t11): pr-checks job hard-deny-stress — reduced-N regression guard
47f8708f ci(pr-checks): run the Windows-only test files no Linux runner can compile
ffef9ddb ci(pr-checks): run cmd/devoid-daemon, which ubuntu compiles to zero tests
5e8cc08c ci(pr-checks): unfilter runtime integrity, and say why aipolicycontract cannot join it
9eb3475d ci(pr-checks): run skillgate, aiclaudehost and daemonsupervise
```

One leg per commit is being honoured by both programmes, and the file currently defines **17**
jobs. So this programme's dialect-drift leg (W3 T3 / W6 T3) is legal as **one job, appended after
P9's `hard-deny-stress`, in a commit that changes nothing else**. That constraint is now recorded
in the task rather than assumed at the point of writing it.

## What this wave does NOT establish

Four of the five seam requests go to **P9** and one to **P47**, and none has a reply yet. Per §5
of the contract the correct behaviour is to post `BLOCKED` and switch tasks — never to wait, and
never to work around it by editing their files. That is what the build wave did: it implemented
only files with no contract row, and reported the exact seams it could not land.

**W1 T2 is therefore delivered as a constructor with no caller.** That is deliberate and it is not
finished work. The daemon still uses home-derived paths until P9 lands the one-line call site.
