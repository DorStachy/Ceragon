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
| `Backend` | `main` | `eb5e2ef870e0274301733c24ed8ad287853aaf0b` | `eb5e2ef870e0274301733c24ed8ad287853aaf0b` | 0 | no |
| `Frontend` | `main` | `3e6b739ba15c30d5b67818b8d360cb5f66519014` | `3e6b739ba15c30d5b67818b8d360cb5f66519014` | 0 | no |
| `Installers` | `main` | `48c3d2eb36a73c53aec17fbbfe03ae667fffcd18` | `48c3d2eb36a73c53aec17fbbfe03ae667fffcd18` | 0 | no |
| `Ceragon-Intelligence` | `main` | `ce28c62b8f3cb4cc228be8ae096b4204ceeaaeb5` | `ce28c62b8f3cb4cc228be8ae096b4204ceeaaeb5` | 0 | no |
| `Static-Worker` | `main` | `bc96695c941a6a6328fcc8ad9c2959089acbba37` | `bc96695c941a6a6328fcc8ad9c2959089acbba37` | 0 | no |
| `Sandbox-Worker` | `main` | `496073fe3887e1605610798dbed9852824a8b047` | `496073fe3887e1605610798dbed9852824a8b047` | 0 | no |
| `GithubApp-Bot-Scanner-Worker` | `main` | `c72579e8d109b37c72f41bd00a71a7a018f4f420` | `c72579e8d109b37c72f41bd00a71a7a018f4f420` | 0 | no |
