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
| `Backend` | `fix/cxgov-agentid-recovery-handle` | `31985b157bbd1d2f5f088694cfadf98cc9737f3f` | `225dc6e98ab4e4554141730078e3e00d9b68fd70` | 57 | no |
| `Frontend` | `feat/cxgov-rollout-ring` | `8a4cc8a0cf3217fa461ff71f4f40fb23e8bc5c9e` | `ebe2a241c8de6d2df4d25e0247764a3677c671de` | 41 | no |
| `Installers` | `main` | `0970b240c34b18d0c90c84a7c3b2d6ad67cbdedd` | `e36cbc52d94e5b3cd2a3bd627650af6ea2ac1d7a` | 38 | no |
| `Ceragon-Intelligence` | `main` | `264b91492f06c3dabb964dc4c6beac0931a490b6` | `f2c0109f7172c4302288fef551cca7615ff7fa4b` | 4 | no |
| `Static-Worker` | `main` | `3bcde18caab70e0aae8a917e5f2ebb8fae7adb1c` | `ad1016d1ddb84ff13b30cab7fb39a4a24a754477` | 4 | no |
| `Sandbox-Worker` | `main` | `6659c47308684d879242545292106a1e5e08b2b6` | `a77d6bbcf4eabdebadbb077ae7e586eccbbe248d` | 2 | no |
| `GithubApp-Bot-Scanner-Worker` | `main` | `767e959fe858c79b7b2ddaf137c74d85181181c9` | `70837f51659d09182f1a49d26fb4ecfb5a42fe82` | 12 | no |
