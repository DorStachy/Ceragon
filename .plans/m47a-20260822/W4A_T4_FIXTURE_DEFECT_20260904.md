# Wave 4A Task 4 — the Tier-A expectation is unmeetable, and the fixture is why

**Measured 2026-09-04.** Not a detector defect. A sealed-corpus fixture defect.

## The task's own first bullet

> `ScanAll` must produce a `db-connection-string` finding **at Tier A** for
> `DATABASE_URL=postgres://svc_prod:Hq7#nR2v!Lz9@prod-db.internal.example.net:5432/appdb`

The engineering half of the task is done and correct: the unencoded `#` used to truncate the
authority before `net/url` saw it, `normalizeDBURIUserinfo` now re-spells the userinfo and re-parses,
and the false negative is closed — `fn 0/1`, which is the task's stated **Exit**.

## But the tier cannot be A, and the reason is the hostname

Fed to `dlp.ScanAll`, the same URI on two hosts:

| Host | Tier | `enforcementEligible` |
|---|---|---|
| `prod-db.internal.example.net` (the fixture) | **C** | false |
| `prod-db.internal.acme-corp.io` | **A** | **true** |

`isDBExampleHost` matches the suffix `.example.net`, and the `case isDBExampleHost(host):` arm sits
**before** the Tier-A default arm on purpose. Its comment says so: *"this case sits AFTER the host
checks so example-host fixtures keep their existing evidence"*, and the recovery step's own comment
adds *"recovering a password does not promote a documentation host"*.

**Both behaviours are correct.** `.example.net` is RFC 2606 reserved and can never be a real
production database. A detector that raised an enforceable Tier-A credential finding on a reserved
documentation domain would be firing on every architecture diagram and runbook in the repository —
which is precisely the over-defence this programme measures.

## So the defect is in the fixture

`attack-prod-db-connection-string` is a case whose *name* says production and whose *hostname* says
documentation. It asks the detector to treat a reserved example domain as a live host, which is the
one thing the host ladder exists to refuse.

**The repair is to the corpus, not to `database_uri.go`:** re-author the fixture on a hostname that
is not RFC-2606 reserved. The URI is otherwise exactly right — the `#` in the password is the real
defect it was written to expose, and that defect is now fixed.

**It is a sealed holdout case, so this is an owner/corpus-governance act rather than an engineering
one**, and it is recorded here instead of done. Until it is re-authored:

- the Exit criterion (`fn 0/1`) **is met** and the task should not be held open for it;
- the first bullet's Tier-A expectation **cannot be met** and should be struck from the task rather
  than chased;
- nothing in the detector should be changed to satisfy it. Loosening the host ladder to promote
  `.example.net` would trade a corpus wording problem for a live false-positive class.
