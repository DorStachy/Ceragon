# Rebase manifest

**Generated; never hand-edit.** Run `node ci/lib/rebase-manifest.mjs` to validate and
`node ci/lib/rebase-manifest.mjs --write` to regenerate after the required seven-repo fetch.

Every `path:line` claim in the M4.7A plan is a claim about `origin/main` at the SHA
below. Resolve citations with `git show origin/main:<path>`, never from the working tree.
A SHA list handed to an implementer is not evidence; the required fetch is.

This file carries no generation timestamp on purpose: the wave exit requires that a
re-run produce byte-identical output, and a clock would defeat that by construction.
If these bytes changed, the repositories changed.

| Repository | Local branch | Local HEAD | `origin/main` | Behind | Required fetch moved `origin/main`? |
|---|---|---|---|---:|---|
| `Backend` | `fix/cxgov-agentid-recovery-handle` | `31985b157bbd1d2f5f088694cfadf98cc9737f3f` | `8d4c3b2c569c42601ded25449727ecb1f6f8c88e` | 10 | no |
| `Frontend` | `feat/cxgov-rollout-ring` | `8a4cc8a0cf3217fa461ff71f4f40fb23e8bc5c9e` | `7689011e10f2ea7a3ec4a426465ad3a46a325135` | 4 | no |
| `Installers` | `main` | `521e511a01c774fcb40bb58907b99e7fc0a86cf6` | `521e511a01c774fcb40bb58907b99e7fc0a86cf6` | 0 | no |
| `Ceragon-Intelligence` | `main` | `b7e9f27c7d030d99a45a277fd40727967799f29c` | `b7e9f27c7d030d99a45a277fd40727967799f29c` | 0 | no |
| `Static-Worker` | `main` | `137f34f770e2c5324d0b4cde61a5fa214111dc3a` | `137f34f770e2c5324d0b4cde61a5fa214111dc3a` | 0 | no |
| `Sandbox-Worker` | `main` | `496073fe3887e1605610798dbed9852824a8b047` | `496073fe3887e1605610798dbed9852824a8b047` | 0 | no |
| `GithubApp-Bot-Scanner-Worker` | `main` | `c72579e8d109b37c72f41bd00a71a7a018f4f420` | `c72579e8d109b37c72f41bd00a71a7a018f4f420` | 0 | no |
