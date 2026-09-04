# Live endpoint incident — the agent locked every toolchain on the box, 2026-09-04

**Status: OBSERVED LIVE, on the owner's own workstation, mid-session.** Not reproduced from a
corpus, not inferred from code. This is the class of evidence `W0A_RUN_LOG.md` records as
permanently unobtainable — *"no reachable enrolled endpoint existed"* — and it arrived by accident.

The endpoint was uninstalled by the owner shortly after this was captured, so the artefacts under
`C:\cwt\parts\endpoint-evidence-20260904\` are the only copy.

---

## What happened

At **13:08** the agent's `bin/` directory was rewritten and the daemon restarted (`devoid` and
`devoid-daemon`, both started 13:10). At **13:15** `credentials.json` was rewritten. From that point
every governed command on the machine failed closed:

```
[devoid] [X] Secure endpoint enrollment failed; refusing to continue without
per-device request signing: Signed device proof is required for agent re-enrollment
```

`go test` had been running normally in this session until ~13:05.

## The blast radius is not "installs"

Twenty-two shims sit in `C:\ProgramData\devoid\bin\`, nineteen of them third-party developer tools:

```
bun bunx cargo claude codex corepack gemini go npm npx
pip pip3 pipx pnpm poetry python python3 uv yarn
```

**`go version` fails.** So does `python --version`. These fetch nothing, install nothing and touch
no registry. The enrollment gate sits in front of the shim rather than in front of the
package-install path, so an endpoint that cannot enroll cannot run a compiler, an interpreter, a
test suite, or any of the three AI CLIs the product exists to govern.

This is goal #2 of the programme — *"ordinary developer work is not interrupted"* — failing on the
maintainer's own machine, with no admin override available. It is the same family as the Wave 0A
benign hard block, and strictly wider: 0A blocks one command shape, this blocks every toolchain.

## The loop it cannot leave

`credentials.json` carried `requestSigningMode: "enforce"`, an `apiKey` (108 chars), an
`apiBaseUrl` and a `governanceProfile`. It carried no device identity the Backend would accept.

The agent attempts **re-enrollment**; the Backend requires a **signed device proof**; producing a
signed device proof requires an enrolled device. Nothing on the endpoint can break the cycle, and
every path fails closed, so the machine gets less usable rather than less governed.

This is a variant of the recorded defect in which a reinstall permanently bricks the trust anchor
(409 forever). The mechanism differs — that one is a Backend uniqueness conflict, this one a
missing-proof precondition — but the customer-visible outcome is identical and wider in scope.

## Three failure surfaces in ten minutes, all fail-closed onto ordinary work

1. **Enrollment gate kills the toolchain.** Every governed binary, `go version` included.
2. **`PRE_TOOL_USE` returns `daemonError`** with the decision column `absent` — an error string
   where a verdict belongs.
3. **The on-box fallback denies.** Writing this very file was refused with *"the local governor did
   not answer in time, so the decision was made on-box."*

The third is the one worth sitting with. D14 keeps the decision path fail-OPEN and makes it force
non-green. The on-box fallback here denied instead, so the timeout path is fail-CLOSED on at least
one surface while the packet's decision record says the opposite.

## What the endpoint's own telemetry says

Copied out of `~/.devoid` before the uninstall:

| Artefact | Size | What it holds |
|---|---:|---|
| `ai-hook-outcomes.tsv` | 262 KB | per-hook outcome rows |
| `ai-lane-shadow.json` | 47 KB | the shadow-lane evidence D4 defines |
| `ai-runtime-inventory.json` | 16 KB | the discovered runtime inventory |
| `ai-field-observations.json` | 175 B | field observations |
| `ai-hook-outcomes.dropped` | 4 B | **2292** |
| `aicontext/`, `ai-hook-inflight/` | — | in-flight state at capture |

`ai-hook-outcomes.dropped` = **2292**. That many hook outcomes were dropped rather than recorded. A
dropped outcome is not neutral: it is a decision the console will never show, and the count lives in
a four-byte file beside the data rather than on any surface a person looks at. Every rate the
console publishes about this endpoint was computed over the outcomes that survived.

## What is NOT claimed here

- No root cause for **why** re-enrollment triggered at 13:08. Nothing in this session touched
  `C:\ProgramData\devoid`, and the agent was not upgraded by it.
- No measurement of how long the endpoint had been in `daemonError`. The TSV was last written
  2026-09-03 18:10 and the drop counter carries no timestamp.
- No reproduction. The endpoint was uninstalled minutes later; re-creating the state would mean
  deliberately enrolling a machine into it.
