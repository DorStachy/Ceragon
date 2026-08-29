# Rebase manifest

**Generated; never hand-edit.** Run `node ci/lib/rebase-manifest.mjs` to validate and
`node ci/lib/rebase-manifest.mjs --write` to regenerate after a required seven-repo fetch.

Every `path:line` claim in the M4.7A plan is a claim about `origin/main` at the SHA
below. Resolve citations with `git show origin/main:<path>`, never from the working tree.
A SHA list handed to an implementer is not evidence; the required fetch is.

| Repository | Local branch | Local HEAD | `origin/main` | Behind | Required fetch moved `origin/main`? |
|---|---|---|---|---:|---|
| `Backend` | `fix/remote-uninstall-command-timeout` | `15dd89bae54d273135bfe2bc0ef01f014f9fd448` | `c0b533ef7da51ca8144a0217e2455d33117c149d` | 787 | yes (fec535952d31 → c0b533ef7da5) |
| `Frontend` | `feat/font-geist` | `1fe6e7a609de9ff1a9f63fbcfc1fd918b0e86a49` | `cac574ae063b4e91ec38ddb205ec5abe4cbc3dff` | 525 | no |
| `Installers` | `fix/remote-uninstall-privileged-daemon` | `8e49a6251bf52283b612382ab3c5bb465ce65deb` | `657aed6ba4301fa60502435cb6b3e106723fd98f` | 1119 | yes (b7c0c1359a98 → 657aed6ba430) |
| `Ceragon-Intelligence` | `feat/push-depth-cli-ui` | `58404e0a3db59943141af921a7e388580364a379` | `98be888ea4a8fa502c9fc9b6c8d93e3b93d54322` | 178 | yes (20b5a463b74a → 98be888ea4a8) |
| `Static-Worker` | `feat/install-gate-scan-quality` | `a7326106e71c9a3381a3fd1686ed451d0224e04b` | `f5cddcc27d6992ee5995ad7d2348a3a221f53a4a` | 76 | no |
| `Sandbox-Worker` | `chore/cleanup-unnecessary-files` | `1a9072538e09c63d14d133259980da9476747eb4` | `2831997dfe840d4a4313f25c3ad0ebeff35722f9` | 67 | no |
| `GithubApp-Bot-Scanner-Worker` | `codex/m42-scanner-reliability` | `ed9209996148ab55e022e1936083b09e723d77e1` | `3d4116a5e5b1f48a9a9e33f487e490133fba47d9` | 20 | no |
