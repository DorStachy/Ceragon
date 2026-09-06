# The four-symbol rule — W6 T4

**Status:** written 2026-09-03. The enforcement guard is specified in §3 and is NOT yet landed;
until it is, this document is a convention, and a convention nobody checks is not a control. That
sentence is here so nobody reads this file as protection it does not yet provide.

## 1. Why this exists

Four times in six weeks, the same shape shipped: a value changed, the thing that would have caught
it was inert or absent, and both status surfaces went on reporting green.

- `knownHookTrustDialects` was pinned to Codex `0.144` markers while `0.134` was installed. Every
  hook returned `Failed`, Codex fails **open**, and the console and the CLI both said governed.
- `IsSystemInstall()` read one file that a deferred install never writes, so the SYSTEM daemon put
  its token where no user shim could read it. Measured result on one box: 1,786 of 1,904
  `PRE_TOOL_USE` invocations failed open, rendered as a neutral latency row.
- The machine-baseline delivery lanes depend on three gates — enrolment, rollout ring, version
  discovery — and no installer, doctor row or console surface named any of them.
- `desktopVendorWithheld` withholds R1–R4 and R6 under `desktop-safe`, and the withholding was not
  distinguishable, from outside, from having asserted them.

The common factor is not carelessness. It is that each value is read far from where it is set, and
nothing tied a change in one to evidence in the other.

## 2. The rule

**Any change to these four — the values, their derivation, or the lanes that deliver them —
requires both artefacts below in the same PR. Not one. Both.**

| Symbol | Where |
|---|---|
| `knownHookTrustDialects` | `Installers/internal/codexmanaged/hookdialect.go` (**also FROZEN** per contract §2.4 — a row additionally needs two vendor artefacts off a real binary and goes through the owner) |
| `IsSystemInstall` | `Installers/internal/core/config/config.go` |
| the machine-baseline delivery lanes | installer, daemon boot, and controller paths that write `requirements.toml` |
| `desktopVendorWithheld` | `Installers/internal/codexmanaged/` |

**(a) A live-proof entry** in `Installers/internal/liveproof/register.json` — append-only, never a
rewrite (contract §3.2) — recording what was observed on a real machine, not what a test asserted.
A unit test is not a live proof. `TestMain` in `internal/uninstall` redirects `ProgramData` for the
whole package, and that made every observation of one export non-production for months without
anyone noticing; assume your test harness has done the same to you until you have checked.

**(b) A release note** in `docs/notes/`, in the existing shape, saying in plain words what an
operator will now see that they did not see before — or stop seeing.

## 3. The enforcement guard (specified, not yet landed)

A written rule is the weakest possible control and this codebase has the scars to prove it. The
guard that makes it real:

A Go test pins a **digest over the four symbols' current values** — the dialect set, the
`IsSystemInstall` predicate source, the delivery-lane call sites, and the withheld-requirements
set. If any of them changes, the digest changes and the test fails with a message naming which
symbol moved and what the author must now add. Updating the digest is the deliberate act that
carries the two artefacts with it.

This is the same mechanism the repo already uses for the pinned CI artifact, so it is a pattern
here rather than an invention, and it fails **closed**: a new symbol added to the set with no
digest entry fails the test rather than passing silently.

**It must be defeat-tested at landing:** change one dialect row, watch the test go red naming that
row, restore it, watch it go green. A guard nobody has watched fail is indistinguishable from a
guard that cannot fail — and that exact shape has shipped green here five separate ways.
