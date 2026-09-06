# W7C Task 2 Step 5 — `direct` only, or `direct` and `strace`?

Recorded 2026-09-04.

## The decision

**Shipped: option (i) — refuse `direct`, keep running under `strace`.**

**Open, and an owner decision: option (ii) — refuse `strace` as well.** It is not deferred for
tidiness. It is unmeasured, and the measurement it needs does not exist (`D3_MEASUREMENT.md`).

**Owner of the open decision: the workspace owner.** Not an engineering call. It is a launch-type and
capacity question first (see "The deploy half" below), and this wave has no authority over either.

## Why the two modes are not one policy

They are not the same bargain, and the code deliberately does not collapse them.

| Mode | Isolation | Telemetry tier | What routing does with the result |
|---|---|---|---|
| `direct` | none — host fs as the worker user, host network | `'none'` (`job-processor.ts:4926`) | branch **2** (`verdict-routing.ts:206-208`): **always** `INCONCLUSIVE / SANDBOX_NO_ISOLATION` |
| `strace` | none — host fs, host network; syscalls observed | `'reduced'` (`:4925`) | falls to branch 6/7: a **usable** verdict at reduced confidence |

- **`direct` is strictly the worse bargain.** Its verdict is discarded whatever it found, and with
  telemetry tier `'none'` there is very little for a hard signal to fire *from*. We would be running
  someone else's untrusted code with no boundary, and throwing the answer away. Refusing it loses
  nothing that was ever used.
- **`strace` is a genuine trade.** No isolation either — but it is instrumented and its verdict *is*
  consumed downstream. Refusing it buys containment and costs real dynamic coverage. How much
  coverage is exactly the number that is `UNKNOWN`.

Branch **1** (`hardSignalFired → BLOCK`, `verdict-routing.ts:185-187`) precedes both, so a weak-mode
run can still produce a BLOCK. That is the whole benefit being weighed, and it is why refusing to run
is a trade rather than a free win. `tests/job-processor.containment-gate.test.ts` pins that branch-1
BLOCK so nobody optimises it away while reasoning about this decision.

## What option (i) actually buys today — stated plainly, not overclaimed

**On the current Fargate fleet, option (i) changes nothing about normal operation.** That is not a
reason against it, but it must not be reported as a coverage improvement.

The mechanism, verified in the tree:

- `Dockerfile:50-53` — bwrap needs unprivileged user namespaces, *"which Fargate 1.4.0 does not
  permit. On Fargate the worker falls back to strace-only mode, which is the accepted operating
  mode."*
- `sandbox-runner.ts:750-793` — `checkBwrapAvailable()` does not merely look for the binary, it
  **runs bwrap** and probes both proc-mount shapes. On Fargate both fail, so `bwrapAvailable` is
  `false`.
- strace **is** installed in the image (`Dockerfile:46`), so `straceAvailable` is `true`, and the
  resolved mode is `strace` — not `direct`.
- `willRunWithoutAnyContainment()` therefore returns **false** on Fargate, and the new gate does not
  skip. **No dynamic analysis is lost on either FARGATE service.**

So what option (i) closes is the case where the worker lands in `direct` — bwrap unavailable **and**
strace unavailable, or an unprobed runner. That is a degraded or stripped image, a host where the
strace probe fails, or a runner used before `initialize()`. In that state, before this change, the
worker executed an untrusted npm, PyPI or Go package with no boundary and no observation, and then
reported INCONCLUSIVE. It now refuses to run it.

**This is a fail-safe for a degraded worker, not a change to steady-state behaviour.** It is worth
having precisely because the degraded state is the one nobody notices: the verdict looked identical
either way.

## The deploy half is an owner decision, and it is where option (ii) gets expensive

Two of the four committed task definitions are `FARGATE`, and they are the two the deploy workflow
actually targets:

| File | Family | Launch type |
|---|---|---|
| `ecs-task-def.json` | `cera-sandbox-worker-staging` | **FARGATE** |
| `ecs-task-def-production.json` | `ceragon-intel-sandbox-worker-production` | **FARGATE** |
| `ecs-task-def-ec2.json` | `cera-sandbox-worker-staging-ec2` | EC2 |
| `ecs-task-def-intel-ec2.json` | `ceragon-intel-sandbox-worker-production-ec2` | EC2 |

Because a Fargate worker resolves to `strace`, **option (ii) would stop npm and PyPI dynamic analysis
outright on both live services** — every such package would return `INCONCLUSIVE`. Making option (ii)
anything other than a coverage blackout requires moving those services to EC2 with
`kernel.unprivileged_userns_clone=1`, which is a launch-type and capacity decision.

**Nothing here is deployed and nothing here asks to be.** Deploying needs a fresh, explicit ask from
the owner every time (O-19). A green local run is not permission.

## What was NOT done, deliberately

`cargoBuildDidNotCover` (`job-processor.ts:3538-3542`) keeps its `ecosystem !== 'cargo'` guard. It
requires `sandboxMode === SANDBOX_MODE_BWRAP`, so removing that guard would force every strace-mode
npm/PyPI/Go run to a coverage gap — **option (ii) arriving through the back door**, without the
decision being made and without the measurement. The guard stays until the owner chooses (ii); a
comment at that method records why, so a later reader does not read it as an oversight.

## Summary for the certificate

- Containment bound, as shipped: *"an untrusted package is not executed in a mode the worker cannot
  contain"*, **qualified to the `direct` mode set**. The qualifier is not optional and must be
  carried wherever the sentence is.
- The `direct`-vs-`strace` decision: **written down, with its numbers `UNKNOWN` and its owner named.**
- The deploy: **owner-gated on the Fargate-to-EC2 launch-type question.**
