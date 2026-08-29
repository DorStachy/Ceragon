# Wave −1 execution log

## DLP provenance discovery — 2026-08-29

The governed artifact names source commit `d366f5f8c76fac253d9adf7914873e97a955a16d`, artifact digest
`sha256:29006…`, generator `ceragon-ai-security-artifact` `v1.3.1`, and 30 `AI_DLP_CLASSES`.

After fetching all seven governed repositories, `git cat-file -t
d366f5f8c76fac253d9adf7914873e97a955a16d` failed in **7/7** repositories. The same command against
known Installers commit `5b12952307db` returned `commit`, proving the command and local object access
worked. A GitHub organization repository search for `shared-contracts` returned no repository.

Conclusion: the source tuple is not reconstructable from the seven governed repositories. Wave 1
must treat the portable artifact as a fork and obtain an explicit owner decision before widening or
replacing its vocabulary. This discovery changes no runtime source and asserts no DLP class count.
