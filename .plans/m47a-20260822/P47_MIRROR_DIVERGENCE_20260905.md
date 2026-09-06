# The shared-contracts mirror gap Wave 6 exposed but did not create

2026-09-05. Recorded rather than closed, and the distinction matters.

## What was found

Wave 6 Task 9 added two constants to the Backend's governance contract:

    packages/shared-contracts/src/ai-governance-contract.ts
      AI_EVENT_ADJUDICATION_STATUSES   NOT_REQUIRED | AGREED | THIRD_REVIEW | UNRESOLVED
      AI_EVENT_LABELER_ROLES           AUTHOR | SECURITY_REVIEWER | PRIVACY_REVIEWER | ADJUDICATOR

The agent that built it reported, correctly, that the workspace-root canonical copy did not receive
them, and that the guard which should have caught that **skips entirely** from a worktree.

## Both halves of that are true, and the second is the interesting one

`ai-governance-contract.ts` **is** on the mirrored list — `M3_GOVERNANCE_DOMAIN_FILES` in
`src/shared-contracts-guard/m3-contracts.snapshot.ts` names it first of seven. So the intended state
is that it exists in both copies and is byte-identical.

It does not exist in the workspace-root copy **at all**. Not out of date — absent. That is one of the
four Backend-only files the workspace CLAUDE.md already flags as a known divergence, and it predates
this programme entirely.

The guard cannot see it. `shared-contracts-mirror.dev.spec.ts` locates the workspace copy by probing
for `endpoint-controls-contract.ts` in a list of candidate directories. The root copy does not have
that file either, and the worktree-relative candidate resolves to a directory that does not exist.
`findCopy1()` returns null, `describeIfWorkspace` becomes `describe.skip`, and both assertions —
including the directory-presence diff that exists precisely to catch a file present in one copy and
missing from the other — never run.

**So the guard is not wrong about the tree. It never looked at one.** A spec that skips is not a
spec that passed, and this is the shape it takes in practice.

## Why this is not being closed here

Closing it means creating a 1,300-line file in the canonical reference. Per the workspace CLAUDE.md,
editing the root copy **changes what the parity checks consider correct**, while editing the Backend
copy changes what ships — different acts, and seven specs under `Backend/src/` resolve to the root by
relative path. Copying Backend's file wholesale would make the canonical reference say whatever the
Backend currently says, which is a decision about the mirror discipline rather than a Wave 6 task.

It is also not Wave 6's to close. Wave 6 added two constants to a file that was already outside the
mirror in practice. Closing the gap would move three copies and change what seven specs measure
against.

## What is true right now

| | State |
|---|---|
| Backend copy carries the two new constants | yes |
| Workspace-root canonical carries them | no — the whole file is absent |
| `m3-contracts.parity.spec.ts` (always-on gate) | passes; it does not read this file |
| `shared-contracts-mirror.dev.spec.ts` | **SKIPPED — proved nothing** |
| Divergence introduced by Wave 6 | no; pre-existing, four files deep |

## The one-line version for whoever picks this up

The mirror guard for the shared governance contract has not run in this workspace, so every
"the copies agree" statement about those seven files is currently **UNKNOWN**, not true. Fixing the
skip is worth more than fixing any single file it would have caught.
