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
| `Backend` | `codex/customer-data-privacy` | `3a3de0568f815aeee53b4b8c7c4a13769daac660` | `fc7834eef50df6469d63f2cd7606f6c4388a574c` | 0 | no |
| `Frontend` | `codex/customer-data-privacy` | `e2208435e83eb277eaa6a3fab4fca94767e21f45` | `ee94fbb8e11d56b76bd95b9a2dbcca95ec0a1973` | 4 | no |
| `Installers` | `codex/customer-data-privacy` | `8d53a1d8f61457864358556e3fd1c5126d4b5ebc` | `52b5cb2a0f7c14eb1d7644e60b6fe0c4cb94a1ac` | 0 | no |
| `Ceragon-Intelligence` | `codex/customer-data-privacy` | `bb84c7571646391e27c5f9d75932ee519e7ee045` | `70786d19878ce18644d8f0c9da5ab4624458f67d` | 0 | no |
| `Static-Worker` | `codex/customer-data-privacy` | `e27381e85637e529b7dbe7189fe54f619cafd158` | `d9804a8058e71962686d72e13229c553876db720` | 0 | no |
| `Sandbox-Worker` | `codex/customer-data-privacy` | `395158bfc174975dc53547d80ed8604f7d4f46a5` | `4164a560e400b2b9c6a729a69960647724685b74` | 0 | no |
| `GithubApp-Bot-Scanner-Worker` | `codex/customer-data-privacy` | `ba660ee81b10a07d4cca852e4b099d465a6a6da6` | `5c642a167f1e14ba50449513ee841629c50c687d` | 0 | no |
