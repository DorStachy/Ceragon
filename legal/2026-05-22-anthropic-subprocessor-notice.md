# Subprocessor Change Notice — 2026-05-22

**Effective date:** 2026-06-21 (30 calendar days from notice)
**Subject:** New subprocessor — Anthropic PBC (Claude API)
**Customer action required:** None, unless you wish to opt out (see below)

---

## What is changing

Effective 2026-06-21, Ceragon will add **Anthropic PBC** as an approved
subprocessor for AI-assisted code analysis on **baseline-candidate scans only**
— the first-ever security baseline scan for each newly onboarded repository
in your installation, and admin-initiated re-baseline scans.

All subsequent push, pull-request, and diff scans continue to use Google
Gemini (our existing AI subprocessor) as today.

---

## Why this change

A 1-million-token context window AI model (Claude Opus 4.7) can reason
about how files compose across a whole repository — catching security
issues that single-file pattern scanners systematically miss. Onboarding
the platform is the moment your team most needs a deep, baseline
understanding of the repo's security posture. After the baseline, ongoing
diff scans don't need this depth and continue using the existing AI vendor.

You will see this as a one-time "Security Posture Narrative" report
attached to the first scan of each newly onboarded repository, plus
additional findings the deeper analysis surfaces.

---

## What data is sent to Anthropic

Same content boundary your deterministic scanners (Semgrep, Gitleaks,
OSV, TruffleHog, Bandit, Checkov, Trivy, actionlint, zizmor) already see
today:

| Sent to Anthropic | NOT sent to Anthropic |
|---|---|
| Source code (`.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.go/.rs/.java/.rb/.php`) | `node_modules/`, `dist/`, `build/`, `coverage/`, lock files |
| Config files (`*.json/*.yml/*.yaml/*.toml/*.ini`) | Binary files, images, fonts, archives |
| Infrastructure (`Dockerfile`, `docker-compose.*`, `*.tf`, ECS task-defs) | `__snapshots__/`, `.next/`, `.turbo/` |
| CI workflows (`.github/`, `.gitlab-ci.yml`) | Test code (excluded by tiered filter for baseline) |
| SQL migrations, README, `*.md` documentation | Git history, commit messages, PR descriptions |
| File paths and structure | Customer secrets / env vars (set in your deploy env, not source) |

---

## Anthropic's commitments

- **Data Processing Agreement:** https://www.anthropic.com/legal/dpa
- **Security & compliance program:** https://trust.anthropic.com
  - SOC 2 Type II compliant
  - GDPR-aligned data processing
  - HIPAA available on enterprise contracts
- **Default region:** US. EU residency available on customer request.
- **Data retention:** Anthropic does not retain inputs or outputs from the
  Claude API beyond what's required to deliver the response, per their
  commercial terms. They do not use API inputs for model training.

---

## Opting out

If your compliance requirements preclude using Anthropic, contact
**support@ceragon.io** before the effective date. We will set the
`OPUS_ONBOARDING_ENABLED=false` flag on your organization, which reverts
all baseline scans for your org to the prior Gemini-only flow. You will
not see the "Security Posture Narrative" report, but all other security
analysis continues unchanged.

---

## Questions

Reply to this email or contact **support@ceragon.io**. We're happy to walk
your compliance team through the DPA, the technical data-boundary, and the
opt-out path.

---

— Ceragon
