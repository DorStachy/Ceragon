# Parallel handshake — P9 ⇄ P47

Append-only. Newest at the bottom. Governed by
[`PARALLEL_EXECUTION_CONTRACT.md`](PARALLEL_EXECUTION_CONTRACT.md).

Entry kinds: `SEAM REQUEST` · `SEAM LANDED` · `RELEASE REQUEST` · `DEPLOY REQUEST` ·
`MIGRATION CLAIM` · `CATALOG DIGEST` · `CONFLICT` · `BLOCKED`

**Do not edit or delete another programme's entry.** If one is wrong, append a `CONFLICT` below it.

---

### 2026-08-28 · OWNER · PROGRAMMES STARTED IN PARALLEL

- **P9** — runtime enforcement, `.plans/9plus-20260828/waves/` — this session.
- **P47** — detection quality, `.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md` — a new session.

Standing facts both teams start from, so neither has to rediscover them:

- Backend `origin/main` `0cf9021e`, **deployed as ECS task definition 322**.
- Installers `origin/main` `5b129523`; **agent 7.10.6 is the stable channel**.
- Frontend `cac574ae`, deployed as task definition 378.
- **Nothing is merged for either programme yet.** Both start from the tips above.

First moves, agreed:

- **P47 Wave 0A goes first**, ahead of everything in either programme. `destructive-rm` fires on every
  `rm -rf ~/<anything>`; it is a malicious-floor member at minimum `block`; the floor holds on the read
  path as of task definition 322, so **no administrator on any tenant can relax it**. It is the only
  item in either plan with live customer impact today. It needs an agent release — see contract §3.1.
- **P9 W8 T5** (the agent-wire field-drop counter) is the **first Backend change of either programme**
  and must be deployed before either side widens an agent-wire contract. Until it lands, an
  agent-ahead-of-Backend ordering mistake produces no error, no data, and a console that looks correct.
- **P9 W3 T1-T2** (the uppercase-extension dispatch bypass) is Phase 0, two files, no dependency in
  either direction. Cheap and security-relevant.
