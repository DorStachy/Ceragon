# Ship decisions (delegated by the owner, 2026-09-06)

The owner delegated the three open decisions before push and deploy. Each is stated with what a
customer or developer would see, and the reason.

## 1. Expiry posture — RATIFIED as built

An endpoint whose signed bundle has expired and that cannot activate a successor now keeps enforcing
the last-known-good policy, reports EXPIRED in its heartbeat, and answers `GET /v1/ai/policy` with the
policy plus `expired: true`. Before, it blocked everything, including a benign prompt, and answered 502.

What you see: a developer on a stale endpoint keeps working under the last admin policy instead of being
locked out of Claude Code and Codex; the console can still tell the endpoint is stale.

Why: this is the owner's standing decision for the web guard (2026-07-25, "local-authoritative: enforce
with the best available rulebook, never freeze") applied to the AI-policy lane. The fix preserves the
"no extended weakening" rule structurally: while expired, every decision is taken against the retained
policy AND against no policy, and the stricter answer wins, so exclusions, allow-listed classes, monitor
lanes and `dlp.enabled=false` all stop applying. Authorization surfaces (delegated approvals, MCP
auto-quarantine, ingress posture) still refuse on an expired bundle; only the scanning surfaces enforce
the retained rulebook. The measured alternative was a fleet-wide developer lockout an hour after any
chain deadlock.

## 2. `rm devoid.exe` in a build tree now blocks — KEPT as built

The self-defence class now fires on deleting the agent's own binary by name wherever it is, alongside
service/task deletion, the ProgramData-root wipe and the product's own stop verbs.

What you see: only people building DeVoid itself are affected, and only when a command names the
product's exact binary. Ordinary build cleanups (`rm -rf ./dist`, `del build\*.obj`) stay allowed, and
the class cannot be relaxed below warn, so the worst case for a DeVoid developer is an interruption on
that one command, not a block on their work.

Why: the population is our own developers, the friction is one named file, and the protection it buys
is the one the attack lane actually used (deleting the agent to stop it). Narrowing to install roots
would leave a copied binary unprotected; keeping it is the safer default.

## 3a. Static-Worker recall baseline — ACCEPTED (merge is the acceptance)

The W7B T8 baseline replaces an all-or-nothing "100%, no escapes" measurement that never measured the
`plugin` class with a per-applicable-class measurement: 123 applicable pairs, 122 caught, one named
escape (`tp-zero-width-smuggled-directive` under `plugin`) with a written reason, and a bank note that
records the two earlier shapes that were genuinely closed.

What you see: the recall number drops from a false 100% to an honest 99.2%, and one real detection gap
is now on the ledger instead of hidden.

Why: this is not banking a regression; it is the gate starting to ask the right question and recording
a miss that already existed. The forbidden-guard treats any change to the baseline versus `origin/main`
as a violation with no override (only `--allow-tp-additions` exists, for new fixture dirs), so the veto
test is red by design on the branch and goes green once the baseline is on main. Accepting the re-bank
therefore means merging it. The one escape is a P2 detection gap to close in the corpus, tracked, not a
reason to keep a false baseline.

## 3b. The three "stale trigger claims" in Installers workflow headers — headers stay

`workflow-header-truth` flagged `finding-b-e2e.yml:21` and `pr-checks.yml:3-4`. On reading: line 21 is a
past-tense history note ("Until commit cd657c77 … this workflow ran on every pull request"), and lines
3-4 are a negated sentence ("never runs by itself on a pull request or on a merge to main"). Both are
true statements about the real `on:` blocks; the checker misreads negation and past tense as claims.

What you see: nothing changes in any workflow; the root-repo guard stays red on these two files until
the checker learns negation and past tense.

Why: rewriting accurate prose to satisfy a checker's regex would make the headers worse. The checker is
the defect; it lives in the workspace-root tooling (not deployed) and is noted for a follow-up.

## Two consequences of pushing, decided here as well

- A push to Installers `main` will fire `finding-b-e2e.yml` (macOS and Windows legs, the most
  expensive workflow) because P47 touches its path filters. That is the owner's 2026-08-25 cost-gate
  design: it runs exactly on the pushes that change those paths, and it is the one gate a laptop
  cannot run. Accepted.
- A push to Static-Worker `main` auto-deploys the static worker (`build-and-deploy.yml`); its service
  is scaled to zero, so the image and task definition update and no task runs. Scanner's deploy fires
  only on `Dockerfile.scanner-worker`, which P47 does not touch; Intel's Hetzner auto-deploy fires only
  on its compose files, which W7C does not touch. Sandbox is already at main.
