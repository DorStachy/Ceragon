# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

A multi-component **workspace** for the CodeFence / Ceragon supply-chain security platform — not a monorepo. Each subdirectory is its own project (in some cases its own GitHub repo) with its own toolchain. There is **no root `package.json`, `tsconfig.json`, or lockfile**; running `npm`/`go`/`docker` at the workspace root will not work. The root is also not a git repository — `_git-backups/` holds tarred backups of components, not live source.

Always `cd` into a component before running build/test/dev commands.

## Component map

Each component has its own `CLAUDE.md` or `README.md` with commands and architecture — start there.

| Path | Role | Read first |
|---|---|---|
| [Backend](Backend/) | NestJS multi-tenant SaaS API: webhooks, package analysis, policy engine, audit. PostgreSQL + DynamoDB + SQS + S3 + Redis. | [Backend/CLAUDE.md](Backend/CLAUDE.md) |
| [Frontend](Frontend/) | Next.js App Router UI (proxies API to backend). shadcn/ui + Radix + Tailwind. | [Frontend/CLAUDE.md](Frontend/CLAUDE.md) |
| [Ceragon-Intelligence](Ceragon-Intelligence/) | Near-real-time release ingestion + verdict precompute pipeline (npm/PyPI/Cargo/Go followers, artifact fetcher, static/dynamic adapters, verdict writer). Standalone repo. | [Ceragon-Intelligence/README.md](Ceragon-Intelligence/README.md) |
| [GithubApp-Bot-Scanner-Worker](GithubApp-Bot-Scanner-Worker/) | CodeFence GitHub App scanner worker + action runtime + shared schemas. Standalone repo. | [GithubApp-Bot-Scanner-Worker/README.md](GithubApp-Bot-Scanner-Worker/README.md) |
| [Sandbox-Worker](Sandbox-Worker/) | `@cera/sandbox-worker` — SQS-driven sandbox execution with strace telemetry. | [Sandbox-Worker/README.md](Sandbox-Worker/README.md) |
| [Static-Worker](Static-Worker/) | `cera-fetch-worker` — SQS-driven static analysis worker. | [Static-Worker/README.md](Static-Worker/README.md) |
| [Installers](Installers/) | Go-based `ceragon` / `ceragond` CLI/daemon plus Windows MSI/EXE installer (WiX + WPF bootstrapper). | [Installers/STRUCTURE.md](Installers/STRUCTURE.md) |
| [packages/shared-contracts](packages/shared-contracts/) | `@ceragon/shared-contracts` — TypeScript type contracts shared with `Backend`. | [packages/shared-contracts/package.json](packages/shared-contracts/package.json) |
| [scripts](scripts/) | Operational PowerShell + Node scripts (power on/off, queue checks, smoke tests). | — |
| [ci](ci/) | Local CI: runs every repo's GitHub Actions gates in Docker, off the real workflow files. | [ci/README.md](ci/README.md) |
| [docs](docs/) | Plans, handoffs, and canonical source-of-truth documents. | See below |

## Running the gates and shipping to production

**Read [ci/README.md](ci/README.md) before pushing anything.** Gates run locally, in Docker;
deploys stay on GitHub. GitHub Actions billed $600 for July 2026 and the only jobs that still need
to run there are the ones a laptop genuinely cannot do.

```bash
node ci/lib/drift.mjs          # is the local mirror still complete?
node ci/lib/run.mjs Backend    # every mirrored gate for one repo
```

- 52 gate legs across the 7 component repos are mirrored, reading commands straight from each
  repo's `.github/workflows/*.yml`, so a gate added upstream is picked up without editing anything
  here. `ci/gates.json` records only which jobs are mirrored and, for the rest, why they are not.
- **Every checkout in this workspace is far behind its `origin/main`** (Installers by 933 commits,
  Backend by 684, Frontend by 485, as of 2026-08-24). The runner handles workflow staleness itself
  by following GitHub's merge semantics, and prints how far behind each repo is. Pass `--merged` to
  test the tree a pull request would actually build.
- **73 job legs cannot be mirrored at all** and 68 of them are `Installers/finding-b-e2e.yml` on
  macOS and Windows. Docker cannot run macOS. Never report a change as "all checks pass" on the
  strength of a local run; say which gates ran and which could not.
- **Deploying needs a fresh, explicit ask from the owner every time.** Merging is not deploying and
  a green local run is not permission. [ci/README.md](ci/README.md) lists each repo's deploy
  workflow and the ordering rules that have broken production before.

## Canonical source-of-truth docs

Authoritative product, infra, and intelligence references live under [docs/](docs/). When in doubt, prefer these over older plans elsewhere in `docs/`:

- [docs/MostUpdated_SourceOfTruth/](docs/MostUpdated_SourceOfTruth/) — Code Security; Supply Chain Security (`SUPPLY_CHAIN_SOURCE_OF_TRUTH.md`, package dependency scanning, formerly "Dependency Scanning"); Endpoint MCP-server / IDE-extension protection (`MCP_IDE_EXTENSION_PROTECTION_SOURCE_OF_TRUTH.md`, added 2026-05-28) + its discovery→identity→intelligence→decision→persistence engine (`BUMBLEBEE_SOURCE_OF_TRUTH.md`, added 2026-05-29); AWS Infrastructure; Database
- [docs/Ceragon_Intel/](docs/Ceragon_Intel/) — 16-doc set covering the intelligence pipeline (architecture, followers, queues, tables, S3, Terraform, CI/CD, message contracts)

Other top-level files in `docs/` (e.g., `*_PLAN.md`, `*_HANDOFF_REPORT.md`) are historical or in-flight; treat them as context, not contract.

## Cross-cutting facts

- **AWS**: account `113627991972`, primary region `eu-north-1` (per [docs/MostUpdated_SourceOfTruth/AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md](docs/MostUpdated_SourceOfTruth/AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md)).
- **Shared contracts**: `@ceragon/shared-contracts` exists in **three** locations, and only two of them are built. `Backend/package.json` resolves it to `file:./packages/shared-contracts`, i.e. **`Backend/packages/shared-contracts/`** — that is the copy `Backend` compiles. `Ceragon-Intelligence/packages/shared-contracts/` is the vendored mirror so the intel repo can build standalone. Changes must be applied to **both of those**; see [Ceragon-Intelligence/README.md](Ceragon-Intelligence/README.md).
  - The workspace-root **`packages/shared-contracts/` is not on any build path, but it is not dead**: it is the **canonical reference that `Backend`'s parity specs compare against**. Seven specs under `Backend/src/` resolve to it by relative path, including the mirror guard `src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts`, which does run in the default lane (`jest.config.js` matches `.*\.spec\.ts$`). So editing the root copy changes what the parity checks consider correct, while editing `Backend/packages/shared-contracts/` changes what actually ships — they are different acts and both are sometimes needed.
  - ⚠️ The three copies have nonetheless diverged: four files exist only under `Backend/`, one only at the root, and three more differ. Only three files anywhere carry the `MIRROR FILE` banner, so most of the tree is outside the mirror discipline entirely. Verified 2026-08-18.
- **Backend ↔ Intelligence boundary**: Backend is the install-time decision server; Ceragon-Intelligence precomputes verdicts/aliases that Backend reads from DynamoDB (the artifact analysis cache, and `ceragon-production-artifact-verdict`).
  - ⚠️ **The live production artifact cache is the table named `cera-artifact_analysis_cache-staging`.** The similarly-named `-production` table is **empty** — a historical naming quirk. **Do not "fix" this name**: repointing it aims the system at the empty table and triggers a re-analysis storm. Per [CERA_PRODUCT_GUIDE_PLAIN_ENGLISH.md](docs/MostUpdated_SourceOfTruth/CERA_PRODUCT_GUIDE_PLAIN_ENGLISH.md) §11.2, which is authoritative over this file. An earlier version of this line named the empty table and did mislead a reader into reporting the live config as a misconfiguration.
- **Workers ↔ Backend**: Sandbox/Static/Scanner workers consume SQS queues and submit results back to the Backend API. Queue URLs and bucket names are environment-specific (see each worker's README).

## Operational scripts

- [scripts/ceragon-power-off.ps1](scripts/ceragon-power-off.ps1) — scales ECS services to zero, zeroes ECS autoscaling targets, disables Lambda event source mappings, drains the intelligence EC2 ASG.
- [scripts/ceragon-power-on.ps1](scripts/ceragon-power-on.ps1) — restores the controllers paused by power-off.

State is tracked in `scripts/ceragon-power-state.json`. These are part of the operating model, not ad-hoc utilities.
