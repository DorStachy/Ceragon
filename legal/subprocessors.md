# Ceragon Subprocessor Schedule

**Last updated:** 2026-05-22

This document lists the third-party subprocessors Ceragon uses to deliver the
CodeFence security platform. Customers signing a DPA receive notice when this
list changes per the standard 30-day notice clause.

---

## Active subprocessors

| Subprocessor | Service | Data categories processed | Hosting region(s) | Added |
|---|---|---|---|---|
| Amazon Web Services, Inc. (AWS) | Infrastructure hosting — compute, storage, queues, secrets, observability | All platform data | EU (eu-north-1 primary), US on request | initial |
| Google LLC | Gemini API — AI-assisted code analysis for diff / push / pull-request scans (Pass-2 LLM enrichment of incremental changes) | Source code snippets (≤500 chars per finding), file paths, deterministic scanner findings | US | initial |
| **Anthropic PBC** | **Claude API — AI-assisted code analysis for baseline-candidate scans only (first-ever security baseline per repository, OR admin-initiated re-baseline). Produces both findings and a one-time Security Posture Narrative.** | **Filtered repository source code (no node_modules / dist / lockfiles / binaries / tests), deterministic scanner findings JSON, Phase-1 Semantic Context Bundles. NOT included: git history, PR descriptions, customer secrets in deploy-env variables.** | **US (default), EU on customer request via DPA** | **2026-05-22** |

---

## Recently added (within 30-day notice window)

### 2026-05-22 — Anthropic PBC

Added to support the Opus 4.7 onboarding scan capability. Routing details:

- **What triggers Anthropic processing:** Only `baseline-candidate` scans
  (first-ever scan per onboarded repo OR admin-initiated re-baseline scan).
  Diff / push / pull-request scans continue to use Google Gemini.
- **What data is sent:** Same filtered repository surface our deterministic
  scanners already process — source code in `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.go/.rs`,
  config files (`*.json/*.yml/*.yaml/*.toml`), infrastructure-as-code
  (`Dockerfile`, `*.tf`, ECS task definitions, CI workflows), SQL migrations,
  and the `README.md`. Test code, lockfiles, binaries, `node_modules/`, `dist/`,
  `__snapshots__/`, and similar are excluded.
- **What data is NOT sent:** Git history, commit messages, PR descriptions,
  CI/CD secrets, customer environment variables, customer database contents,
  customer end-user data.
- **Opt-out path:** Customers may request Gemini-only baselines (no narrative)
  by contacting support before signing the DPA. Setting
  `OPUS_ONBOARDING_ENABLED=false` per-org reverts the platform to the prior
  Gemini-3-Flash-Preview-only baseline flow for that org.
- **Anthropic's DPA:** https://www.anthropic.com/legal/dpa
- **Anthropic's security & compliance:** https://trust.anthropic.com
- **Notice window:** Active customers were notified 2026-05-22; subprocessor
  becomes effective 2026-06-21 (30 days from notice).

---

## Subprocessor change policy

When Ceragon adds, removes, or materially changes a subprocessor:

1. We update this document.
2. We send a notice email to each customer with an active DPA, at least
   30 calendar days before the change takes effect.
3. Customers may object during the notice window. Objections trigger a
   reasonable-alternative-arrangement conversation (typically: opt out of the
   new subprocessor's feature scope, or terminate the contract per DPA terms).
4. After the notice window closes, the new processing is operational.

---

## Audit trail

| Date | Change | Reason |
|---|---|---|
| 2026-05-22 | Added Anthropic PBC (Claude API for baseline-candidate scans) | Spec `docs/superpowers/specs/2026-05-22-opus-onboarding-scan-design.md` (D8). Enables premium-depth onboarding scans via Opus 4.7's 1M-context reasoning, which captures architectural gap classes (env-spread-to-subprocess, producer-controlled-argv, IaC capability creep, SSRF via untrusted URL, unbounded resource ingest, bearer-only outbound auth, LLM prompt injection from package fields, no-USER Dockerfile, default-fails-open config) that single-file pattern scanners systematically miss. |
