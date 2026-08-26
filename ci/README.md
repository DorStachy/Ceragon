# Local CI: run the GitHub gates on this machine

Every check that GitHub Actions runs on a pull request in this workspace also runs here, in Docker,
against the same commands, the same Node/Go versions, and the same service containers. Nothing needs
to be pushed to find out whether it passes.

**The rule:** run the gates locally, push only when they are green, and let GitHub run deploys.
Deploys stay on GitHub because they need the cloud identity; gates do not.

```bash
node ci/lib/run.mjs Frontend
```

---

## Why this exists

GitHub billed $600 for July 2026. The breakdown was 54% macOS, 29% Windows, 16% Linux, and almost
all of it came from one workflow: `Installers/.github/workflows/finding-b-e2e.yml`, which fans out
to about 120 jobs and fires on every push and every pull request that touches its paths.

Run `node ci/lib/drift.mjs --cost` for the current figure. As of 2026-08-24:

| runner | legs per full run | rate | floor per run |
|---|---:|---:|---:|
| ubuntu-latest | 48 | $0.008/min | $0.38 |
| ubuntu-22.04 | 48 | $0.008/min | $0.38 |
| windows-2022 | 38 | $0.016/min | $0.61 |
| macos-14 | 34 | $0.080/min | $2.72 |
| ubuntu-24.04 | 7 | $0.008/min | $0.06 |
| windows-latest | 1 | $0.016/min | $0.02 |

That floor of $4.17 assumes every job finishes inside GitHub's one-minute billing minimum, which
none of them do. Real runs are many times that.

**Docker cannot remove the macOS and Windows part of it.** There is no macOS container runtime, and
Apple's licence permits macOS virtualisation only on Apple hardware. Windows containers need a
Windows container host, and Docker Desktop here runs the Linux engine. 73 legs are in that category
and 68 of them are in `finding-b-e2e.yml`. Local mirroring reduces the Linux 103 legs to zero; the
other 73 come down only by changing what triggers them.

---

## Prerequisites

1. **Docker Desktop**, Linux engine, running. `docker info` must report `OSType: linux`.
2. **Node 20+** on the host, for the runner itself.
3. **One-time:** `cd ci && npm install` (a single dependency, a YAML parser).
4. **Fetched remotes.** The runner resolves gates against `origin/main`, so each repo needs a recent
   `git fetch origin`. There is a helper: `node ci/lib/run.mjs --list` reports a broken manifest
   entry if a repo's remote refs are missing.

The first run of each image takes a few minutes and then never again. Images are named
`devoid-ci/node20`, `devoid-ci/node24`, `devoid-ci/go124`, `devoid-ci/scanner`, `devoid-ci/ops`.

---

## Commands

```bash
node ci/lib/run.mjs <repo> [gate...]     # run a repo's gates, or the named ones
node ci/lib/run.mjs all --jobs 3         # every repo, three repos at a time
node ci/lib/run.mjs Backend --list       # what would run, and what is not mirrored
node ci/lib/run.mjs Frontend --only jest # substring filter on the gate id
node ci/lib/drift.mjs                    # is the mirror still complete?
node ci/lib/drift.mjs --cost             # what a push still costs on GitHub
```

Flags: `--merged` tests the tree a pull request would really build (see below); `--fresh` throws
away the repo's workspace volume first (a true cold checkout, slow); `--no-cache` rebuilds images;
`--keep` leaves the container and services up for inspection; `--json <path>` writes a
machine-readable report; `--allow-partial` lets a PARTIAL gate exit 0.

Exit status is 0 only if every gate reached PASS.

### The three results

- **PASS** — every step of the job ran and succeeded.
- **PARTIAL** — the job reached a step that mints cloud credentials (`aws-actions/*` and similar).
  Everything before it ran; everything after it was skipped. This is **not** a pass. It is accurate
  for jobs like `Sandbox-Worker/build-and-deploy`, where audit, build, test and the contract gates
  live in the same job as the deploy.
- **FAIL** — a step exited non-zero. The failing step is named, and the full log path is printed.

Logs are written to `ci/.logs/<repo>/<gate>.log` with each step delimited, whatever the result.

---

## Which tree, and which version of a workflow

Every checkout in this workspace is a long way behind its remote. Measured 2026-08-24:

| repo | behind `origin/main` |
|---|---:|
| Installers | 933 |
| Backend | 684 |
| Frontend | 485 |
| Static-Worker | 73 |
| Sandbox-Worker | 65 |
| Ceragon-Intelligence | 148 |
| GithubApp-Bot-Scanner-Worker | 20 |

The runner prints this before it starts, because a pull request tests your branch **merged with
main**, and when the branch is behind, that is a different tree. Pass `--merged` to build and test
the real merge tree with `git merge-tree`; it refuses when the branch conflicts, which is what
GitHub does too. `--merged` covers committed work only, so the default remains your working tree,
uncommitted edits included.

### Which version of a workflow runs

Not necessarily the one in your checkout. The runner follows GitHub's own merge semantics:

- If your branch has **not** touched a workflow since it forked, GitHub would run `origin/main`'s
  copy on your PR, so the runner uses `origin/main`'s copy too, however old your checkout is.
- If your branch **has** edited that workflow, the runner uses your working tree, uncommitted edits
  included, because testing a workflow change before pushing it is the point.

This matters more than it sounds. When this harness was first wired up, reading the working tree
naively meant Backend's `full_test` and `migration_chain_from_empty` gates did not exist, Backend's
lint lane claimed Node 20 where CI runs 24, and Frontend had no `pr-checks.yml` at all, so the three
checks that gate every Frontend PR ("Typecheck", "Tests (jest)", "No customer-visible em dashes")
would have been silently absent from a green local report.

---

## What runs where, per repo

`node ci/lib/run.mjs <repo> --list` prints this live, including the reason for every job that is not
mirrored. Summary:

| repo | mirrored gates | image | notes |
|---|---:|---|---|
| Backend | 15 | node24 | four Postgres-backed lanes plus a 4-way sharded suite |
| Frontend | 4 | node20 | typecheck, jest, em-dash, npm audit |
| Ceragon-Intelligence | 7 | node20 + ops | validate plus six Hetzner artifact lints |
| GithubApp-Bot-Scanner-Worker | 14 | node20 + scanner | Semgrep 1.89.0 and gitleaks 8.18.4 pinned |
| Sandbox-Worker | 1 | node20 | PARTIAL by design: build+test share a job with the deploy |
| Static-Worker | 1 | node20 | same shape; pnpm; needs `.git` for its lockfile guard |
| Installers | 11 | go124 | Go 1.24 + Node 22 in one image |

**Not mirrored, and why** is recorded in `ci/gates.json` under each repo's `cannotMirror`. The two
categories are cloud identity (deploys, OIDC reads of live AWS state, GitHub App tokens) and
non-Linux runners (macOS, Windows, WSL, systemd-dependent Linux legs).

The eleventh Installers gate, `finding-b-e2e:shim-enforcement`, was added on 2026-08-26 and is the
only leg of `finding-b-e2e.yml` that mirrors. It is worth knowing what it is: the rest of that
workflow asserts PATH resolution — that a file with our name is found first — and until that date
the file it found was an `echo` script the test wrote itself. This job feeds a real forbidden push
and a real permitted one through the product and checks the side effect: the forbidden commit is
not on the remote afterwards, the permitted one is. It carries its own mutation guard, which
re-stages the old fake shim and requires the proof to refuse it.


Two of them are worth knowing by heart:

- `Installers/pr-checks.yml:cli-entrypoint-tests` runs on `windows-latest`. It exercises Windows
  service control, ACLs and PATH resolution. **Run it directly on this machine** from a Windows
  shell: `go test ./cmd/devoid/... -count=1 -timeout 25m`.
- `Installers/finding-b-e2e.yml` is 68 macOS/Windows legs. There is no local substitute at all.

---

## Workspace checks: the gates GitHub cannot host

```bash
node ci/lib/run.mjs workspace
```

Every gate above this line belongs to one repository and runs inside that repository's container.
That is the right shape for a question about one repo and the wrong shape for a **contract split
across repos** — three green repos can still disagree with each other, and no per-repo job is
standing anywhere it could notice. GitHub cannot host these either: a workflow in one repository
does not have the other two checked out.

Workspace checks run on the **host**, not in Docker, because seeing more than one checkout at once
is the entire point. They run whenever the whole workspace is in scope — `node ci/lib/run.mjs`,
`node ci/lib/run.mjs all`, or `workspace` on its own — and they run **before** the Docker check, so
a cross-repo break is still reported when Docker Desktop is down. They are declared in `gates.json`
under `workspaceChecks`, which does **not** mirror a GitHub job, so `drift.mjs` neither expects nor
validates it.

| check | what one repo cannot see |
|---|---|
| `toolrisk-vocab-parity` | The tool-risk detector vocabulary is one contract living as three hand-copied files: `Installers/parity-vectors/`, `Backend/packages/shared-contracts/`, `Frontend/types/vendored/`. Each repo's guard compares that repo against **that repo's own copy**, so a class added in the agent and never copied leaves all three green. |
| `toolrisk-vocab-parity-selftest` | The mutation proof for the check above. |

### Why the per-repo guards cannot cover it

`interpreter-exec`, `fetch-then-exec` and `substitution-exfil` were emitted by the agent's scanner
for months while both consumer registries omitted them. That is not merely an invisible row on a
board: `assertClosedActionMap` rejects any action-map key outside the Backend's registered tuple, so
an administrator **could not save a policy for those classes at all**, from the console or the API.
A detector that interrupts developers and has no off switch gets us uninstalled.

Three guards were added afterwards — a Go test in Installers, a Jest spec in Backend, a Jest test in
Frontend. Each compares its repo against a copy inside that same repo, so the Installers half is
sound (add a rule, forget to regenerate, Go goes red) and the copy step is not covered by anything.
Regenerate the vector in Installers and never copy it and all three stay green.

### It reports NOT CHECKED rather than passing

There is no degraded mode. A missing checkout, a missing file, an unreadable ref or unparseable JSON
all print `NOT CHECKED` and exit **2**, which the runner shows as `ERROR`. A cross-repo checker that
shrugs when a sibling is absent recreates the exact defect it exists to catch.

The source of every copy — working tree, `HEAD`, or `origin/main` — is printed on every run, pass or
fail. Because the checkouts here are hundreds of commits behind and several do not have the file on
disk at all, the checker falls back to a committed copy, and says so by name when it does.

```bash
node ci/lib/vocab-parity.mjs --ref origin/main   # pin all three to one ref
node ci/lib/vocab-parity.mjs --json
TOOLRISK_VOCAB_BACKEND=/path/to/wt@HEAD node ci/lib/vocab-parity.mjs   # per-repo source
```

Exit status: `0` compared and agreed, `1` compared and disagreed, `2` could not be compared.

**Adding a fourth consumer means adding a line to `COPIES` in `ci/lib/vocab-parity.mjs`.** A copy
that list does not name is a copy nothing checks.

---

## Before you push

```bash
node ci/lib/drift.mjs                # the mirror still covers every gate
node ci/lib/run.mjs <repo>           # every mirrored gate for the repo you touched
node ci/lib/run.mjs workspace        # the cross-repo contracts no single repo's CI can see
```

Both green means the PR will be green, minus the jobs listed as not mirrored. Say so explicitly in
the PR body: which gates ran locally, which could not, and why. A report that says "all checks pass"
when 68 macOS legs never ran is the failure this harness exists to prevent.

### Repo-specific notes

**Backend.** `npm ci`, from the committed `package-lock.json`. Until 2026-08-26 the repo
`.gitignore`d its lockfile and CI used `npm install`; a same-day re-resolve then differed on **21 of 80
direct dependencies with no commit to `package.json`**, which is what killed deploys on 2026-08-25. The
mirror reads its commands from the real workflow files, so it picked the change up without an edit here.
The four Postgres lanes and the sharded suite each get fresh `postgres:17` containers;
`migration_chain_from_empty` asserts the database is empty before it starts, which is why services
are recreated per gate rather than reused.

**Frontend.** The jest gate is two commands, `npm run pretest` then `npx jest`, not `npm test`. That
is deliberate upstream: a bare `npx jest` skips npm's lifecycle, and the generated-consumer parity
gate lives in `pretest`. The runner executes whatever the workflow says, so this is automatic.

**Static-Worker.** pnpm only. Its gate runs `git diff --exit-code pnpm-lock.yaml`, so this repo is
the one whose `.git` is copied into the container, and the index is re-stated after the copy.

**Installers.** Go lanes are fast; `codex-vendor-lane` installs `@openai/codex@0.134.0` globally
inside the container, so it needs network on first run.

---

## Deploying to production

**Every deploy needs a fresh, explicit ask from the owner.** Merging is not deploying, a green
local run is not permission, and approval for one deploy does not carry to the next. This section
documents the mechanism, not authorisation to use it.

Deploys stay on GitHub Actions. They assume an OIDC role in AWS account `113627991972`
(`eu-north-1`), and a deploy that can be fired from a laptop is a deploy with no audit trail.

| repo | how production deploys | trigger |
|---|---|---|
| Backend | `build.yml` "Build, Test, and Deploy (ECR -> ECS)" | `workflow_dispatch`, or `repository_dispatch` type `backend-deploy`. **Not** on push to main. |
| Frontend | `deploy-frontend-ecs.yml` | `workflow_dispatch` with build-time `NEXT_PUBLIC_*` choices, or `repository_dispatch`. |
| Sandbox-Worker | `build-and-deploy.yml` | **push to `main`**, or `workflow_dispatch`. |
| Static-Worker | `build-and-deploy.yml` | **push to `main`**, `workflow_dispatch`, or `repository_dispatch` type `static-worker-deploy`. |
| GithubApp-Bot-Scanner-Worker | `deploy-scanner-workers.yml` | `workflow_dispatch`, `repository_dispatch` type `scanner-workers-deploy`, or a push to `main` touching `Dockerfile.scanner-worker`. |
| Ceragon-Intelligence | `hetzner-deploy.yml` on the `[self-hosted, hetzner]` runner; `deploy-production.yml` for the AWS side | `workflow_dispatch`. Not billed by GitHub. |
| Installers (agent release) | `release.yml` "Release Devoid Agent" | `workflow_dispatch` with `bump`, `managed_ba`, `managed_firefox`, `promote`, `bootstrap_trust_chain`, `require_signed_windows`. |

```bash
gh workflow run build.yml --repo Ceragon-Prod/Backend --ref main
```

Read `release.yml`'s own input descriptions before cutting a release; they are authoritative and
they say what each flag does to the signed stable channel. `bootstrap_trust_chain` in particular is
described as a one-time action that must never be repeated after the first signed stable release.

### Ordering constraints that have broken production before

1. **Deploy Backend before cutting an agent release.** An agent that reports keys the deployed
   Backend DTO has not declared gets a 400 on the whole request, fleet-wide, at session start.
2. **Read the Deploy-to-ECS job, not the run conclusion.** A Backend workflow run has reported
   success while the deploy job inside it failed.
3. **ECS services may be scaled to zero.** `scripts/ceragon-power-off.ps1` zeroes services *and*
   their autoscaling targets; a deploy onto a powered-off cluster puts an image nowhere.
   `scripts/ceragon-power-on.ps1` restores them. State is in `scripts/ceragon-power-state.json`.

---

## Keeping the mirror honest

`run.mjs` reads gate commands from the real workflow files, so it cannot drift on a *command*. It
can drift on a *job*: someone adds a gate upstream, `ci/gates.json` never hears about it, and every
local run afterwards reports green while certifying one gate less than the reader believes.

`drift.mjs` is the fence. Every job on `origin/main` that a `push` or `pull_request` can trigger
must appear in `gates.json` as either mirrored or explicitly cannot-mirror-with-a-reason. Anything
else fails the check, and it names the job and tells you which side to add it to. Deploy-only and
scheduled jobs are exempt: they are not gates and never block a merge.

Run it before you trust a green local report, and after anyone edits a workflow.

---

## How it works

**The working tree is never mounted or written to.** Concurrent sessions work in these checkouts,
several gates run `npm install`, and a container writing a Linux-resolved `package-lock.json` or a
Linux `node_modules` into a Windows working tree would corrupt it.

The checkout is streamed as `git archive` of the commit (or of the merge tree under `--merged`),
with uncommitted work layered on top from `git status --porcelain`. Three earlier designs were
worse in instructive ways:

- A **bind mount** makes the container stat every file through Docker Desktop's file-sharing layer.
  Copying the Frontend tree took over four minutes and had not finished.
- A **directory tar** sweeps up everything gitignored. Ceragon-Intelligence came to 1.4 GB of
  `dist/` and friends, none of which a GitHub runner would ever have. `git archive` is both faster
  and closer to CI, and `git status --porcelain` respects `.gitignore` for free.
- **`git archive` without `-c core.autocrlf=false`** writes CRLF on this host. Against LF blobs in
  the container that made Static-Worker's `git diff --exit-code pnpm-lock.yaml` guard report all
  5,188 lines changed, a red gate caused entirely by the copy.

The transferred copy lands in `/w/.pristine` inside the repo's volume, stamped with a fingerprint
of the tree and every uncommitted file. Each gate then gets its own checkout at `/w/src` by local
copy, so gates never inherit each other's build output, while the transfer happens once per
invocation rather than once per gate. `node_modules` at any depth survives between gates on
purpose; every workflow here installs dependencies as an explicit step anyway.

**Service containers share one loopback.** GitHub publishes a job's `services:` on the runner's
loopback, so job steps reach Postgres at `localhost:5432` and the workflows say
`DATABASE_HOST: localhost`. Compose-style networking would force those values to be rewritten
locally, which is exactly the sort of local-only edit that makes a mirror lie. Instead each repo
gets a namespace-holder container, and the services and the gate container all join it with
`--network container:<pod>`. Where a service maps a host port that differs from the container port
(Backend runs three Postgres instances on 5432, 55432 and 55433), the server is told to listen on
the host port rather than remapping it.

**`uses:` steps are not emulated.** The images stand in for `actions/checkout`, `setup-node`,
`setup-python`, `setup-go` and `pnpm/action-setup` at the versions the workflows pin. Anything that
mints credentials stops the run and marks it PARTIAL. Anything with an `if:` this runner cannot read
is skipped and printed rather than assumed true; the same goes for a `${{ }}` expression it cannot
resolve, because `npx jest --shard=${{ matrix.shard }}/4` with the braces still in it is not the
command CI ran.

### Files

```
ci/
  gates.json               which jobs are mirrored, which are not, and why not,
                           plus workspaceChecks -- the cross-repo lane
  images/*.Dockerfile      the five toolchains
  lib/run.mjs              the runner
  lib/workflow.mjs         workflow -> ordered steps (matrix, if:, expressions, uses: policy)
  lib/wfsource.mjs         which version of a workflow to execute
  lib/drift.mjs            the completeness fence, and the cost report
  lib/vocab-parity.mjs     tool-risk vocabulary, three repos compared to EACH OTHER
  lib/vocab-parity.test.mjs  its mutation proof
  .logs/                   per-gate logs, git-ignored
```

---

## Troubleshooting

**"Docker is not running."** Start Docker Desktop and wait for `docker info` to report
`OSType: linux`. It can take a minute after the process appears.

**"BROKEN MANIFEST ENTRY ... no such workflow file, here or on origin/main."** That repo has no
`origin/main` ref locally. `git -C <repo> fetch origin`.

**A gate fails locally but passes on GitHub.** Check `ci/.logs/<repo>/<gate>.log` for which step,
then compare against the same job in a recent GitHub run. Known differences that are the machine,
not the code:

- `Static-Worker src/__tests__/redos-budget.test.ts` asserts a 3,000 ms wall-clock scan budget. It
  took 8,329 ms here, in a container, on a loaded host. The other 4,070 tests passed.
- Three Frontend suites are load-sensitive and pass in isolation and in CI but can fail under
  parallel workers: `scan-detail-content.test.tsx`, `multi-page-fetch.test.tsx`, `url-page.test.tsx`.
- `Cannot find module .../scripts/<something>.cjs` almost always means the branch is behind main and
  main's workflow calls a script main has and the branch does not. Use `--merged`.

**A gate is slow the first time.** The workspace volume is empty, so it is a real cold install, and
the transfer into a fresh volume is the other half. The second run reuses both. `--fresh` forces the
cold path when you want it.

**Everything is slow, or `docker` commands hang.** Check free disk first. Docker Desktop stores the
volumes in its WSL2 disk image on `C:`, this machine sits above 90% full, and the daemon degrades
badly under that pressure: a transfer that took 90 seconds took over six minutes for a fifth of the
same content once the disk got tight. `docker volume ls | grep devoidci` lists what this harness
owns; removing a repo's volume costs only the next run's install time. Do not reach for
`docker system prune` here, which would take unrelated images and networks with it.
