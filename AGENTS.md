# Repository Guidelines

## Project Structure & Module Organization

This workspace contains standalone projects, not one root monorepo. There is no root `package.json`, `tsconfig.json`, or lockfile; run commands from the component you are changing.

- `Backend/`: NestJS API with `src/`, `src/migrations/`, `public/`, and colocated `*.spec.ts` tests.
- `Frontend/`: Next.js App Router UI with routes in `app/`, UI in `components/`, API clients in `lib/`, and shared types in `types/`.
- `Static-Worker/` and `Sandbox-Worker/`: TypeScript SQS workers with `src/`, Jest tests, Dockerfiles, and ECS task definitions.
- `GithubApp-Bot-Scanner-Worker/`: `scanner-worker/`, `github-action/`, `shared-schemas/`, and `deployment/`.
- `Installers/`: Go CLI/daemon in `cmd/` and `internal/`; installer assets in `windows-installer/` and `install-scripts/`.
- `Ceragon-Intelligence/`: intelligence pipeline with `src/`, `packages/shared-contracts/`, and `infra/terraform/`.
- `packages/shared-contracts/`, `docs/`, and `scripts/`: shared contracts, source-of-truth docs, and ops utilities.

## Build, Test, and Development Commands

Install dependencies per component with `npm install` or `go mod download`.

- `cd Backend; npm run dev|build|lint|test|test:cov`
- `cd Frontend; npm run dev|build|lint|test`
- `cd Static-Worker; npm run build && npm test`
- `cd Sandbox-Worker; npm run build && npm test`
- `cd GithubApp-Bot-Scanner-Worker/scanner-worker; npm run build && npm test`; repeat in `github-action/` for action code.
- `cd Installers; go test ./...`; build with `go build -o build/ceragon.exe ./cmd/ceragon`.
- `cd Ceragon-Intelligence; npm run validate`

## Coding Style & Naming Conventions

TypeScript projects use ESLint and Jest; Backend also uses Prettier with 2 spaces, semicolons, single quotes, and `printWidth: 100`. Prefer `type` over `interface` in Backend code. Use existing path aliases such as `@/*`. Go code must be `gofmt`/`go test` clean.

## Testing Guidelines

Follow local patterns: Backend and scanner action use `*.spec.ts`, Frontend commonly uses `*.test.tsx`, workers use `*.test.ts`, and Go uses `*_test.go`. Add focused tests for changed behavior and run the relevant suite before a PR.

## Commit & Pull Request Guidelines

History mostly uses conventional-style messages such as `feat(mcp-governance): ...`, `fix(ceragon-cli): ...`, and `chore(fe): ...`. Keep subjects imperative and scoped. PRs should describe the change, list commands run, link issues or plans, call out config or migration impacts, and include screenshots for UI changes.

## Security & Configuration Tips

Do not commit `.env`, credentials, generated output, or installer artifacts. Most services depend on AWS, database, queue, and API secrets; check each component README or `CLAUDE.md` before running live integrations.
