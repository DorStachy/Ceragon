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
| [docs](docs/) | Plans, handoffs, and canonical source-of-truth documents. | See below |

## Canonical source-of-truth docs

Authoritative product, infra, and intelligence references live under [docs/](docs/). When in doubt, prefer these over older plans elsewhere in `docs/`:

- [docs/MostUpdated_SourceOfTruth/](docs/MostUpdated_SourceOfTruth/) — Code Security; Supply Chain Security (`SUPPLY_CHAIN_SOURCE_OF_TRUTH.md`, package dependency scanning, formerly "Dependency Scanning"); Endpoint MCP-server / IDE-extension protection (`MCP_IDE_EXTENSION_PROTECTION_SOURCE_OF_TRUTH.md`, added 2026-05-28); AWS Infrastructure; Database
- [docs/Ceragon_Intel/](docs/Ceragon_Intel/) — 16-doc set covering the intelligence pipeline (architecture, followers, queues, tables, S3, Terraform, CI/CD, message contracts)

Other top-level files in `docs/` (e.g., `*_PLAN.md`, `*_HANDOFF_REPORT.md`) are historical or in-flight; treat them as context, not contract.

## Cross-cutting facts

- **AWS**: account `113627991972`, primary region `eu-north-1` (per [docs/MostUpdated_SourceOfTruth/AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md](docs/MostUpdated_SourceOfTruth/AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md)).
- **Shared contracts**: `@ceragon/shared-contracts` exists in two locations during a transitional bridge — `packages/shared-contracts/` (used by `Backend`) and `Ceragon-Intelligence/packages/shared-contracts/` (vendored mirror so the intel repo can build standalone). Changes must be applied to both until a real monorepo or published package exists; see [Ceragon-Intelligence/README.md](Ceragon-Intelligence/README.md).
- **Backend ↔ Intelligence boundary**: Backend is the install-time decision server; Ceragon-Intelligence precomputes verdicts/aliases that Backend reads from DynamoDB (`cera-artifact_analysis_cache-production`, `ceragon-production-artifact-verdict`).
- **Workers ↔ Backend**: Sandbox/Static/Scanner workers consume SQS queues and submit results back to the Backend API. Queue URLs and bucket names are environment-specific (see each worker's README).

## Operational scripts

- [scripts/ceragon-power-off.ps1](scripts/ceragon-power-off.ps1) — scales ECS services to zero, zeroes ECS autoscaling targets, disables Lambda event source mappings, drains the intelligence EC2 ASG.
- [scripts/ceragon-power-on.ps1](scripts/ceragon-power-on.ps1) — restores the controllers paused by power-off.

State is tracked in `scripts/ceragon-power-state.json`. These are part of the operating model, not ad-hoc utilities.
