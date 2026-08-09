# Fix specs - cluster CREDS

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

ONE measurement primitive serves both findings. F16's self-healing reconciler must compute the actual on-disk DACL trustee set for every machine-scoped secret; F15's honest assurance level is exactly that same measurement projected onto an enum. Implement `winacl.MeasureSecretAssurance(path)` ONCE in C:/cwt/Installers/internal/winacl (plus a POSIX sibling reading mode/owner/group), and have BOTH the daemon reconciler and CreateSignedTrustAnchorAck consume it. Do NOT write two independent DACL readers — a second, divergent notion of "protected" is how the OS_PROTECTED constant survived in the first place.

THE BIG CORRECTION FOR THIS CLUSTER: F16's recorded hypotheses ("REGRESSION", "install-mode=lite is the prime suspect") are BOTH DISPROVEN at source. The BUILTIN\Users read ACE is applied DELIBERATELY and UNCONDITIONALLY on every write path by `winacl.MachineLocalReadSDDL` = "O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;BU)" (machine_secret_windows.go:68). 0x120089 IS FILE_GENERIC_READ, which SDDL renders as `FR` — exactly the observed `(A;;FR;;;BU)`. Both install modes reach it: install.ps1:2171 and the MSI CA both call the SAME Go entrypoint `runSetupSaveCredentials` (setup_installer.go:60) -> `config.WriteCredentialsFile(path, data, true)` (setup_installer.go:107) -> writeCredentialsFileAtomic -> protectCredentialTemp(systemScope=true) (credentials_atomic_windows.go:17) -> hardenMachineCredential (:71) -> winacl.HardenMachineLocalRead. The lite-only `--user-scope` flag ONLY adds a per-user mirror (setup_installer.go:118-126); it changes nothing about the machine DACL. A pure-MSI box has the identical ACL.

The "prior shipped fix" the owner remembers is real but was a DIFFERENT fix: on 2026-08-07 the package SPLIT one badly-named constant into two honestly-named ones and pinned the split. It explicitly did NOT move credentials.json or daemon-token off the Users-read boundary, and says so in code (machine_secret_windows.go:36-45 and 63-67). So this is a KNOWN, NAMED, DOCUMENTED, STILL-OPEN exposure ("item 101 [H1] step 1"), not a regression. This matters operationally: `TestMachineDescriptorRouting` (machine_secret_policy_test.go:222-240) ACTIVELY PINS THE EXPOSED STATE. An implementer who narrows the DACL without editing that routing table in the SAME commit gets a red test and may wrongly conclude the fix is wrong.

FILE-SET CORRECTION: F16 lists five files carrying the Users-Read ACE. Only TWO hold secret material. `aitrust\lkg-bundle.json`, `activated-policy-pair.json` and `activation-floor.json` are PUBLIC signed-policy artifacts (signed envelope + policy body + the forward-only no-downgrade floor; aikeystore/activation.go:7-39, store.go:34-35) hardened via aikeystore/harden_windows.go:37. For those Users-Read is CORRECT AND REQUIRED — a non-admin agent process reads them on every policy load, and their protection requirement is INTEGRITY (no Users write, already enforced) not confidentiality. Narrowing them would fail-close the local-authoritative policy path on every non-elevated agent launch. Do not "fix" them; say so in the commit so a later reviewer does not re-narrow them by symmetry.

DEPLOY ORDER: F15's enum widening is BACKEND-FIRST, non-negotiable. The agent's storageAssurance value sits inside an Ed25519-SIGNED payload validated by @IsIn (dto/ai-trust-anchor-ack.dto.ts:70) AND a second strict membership check (crypto/ai-trust-anchor-ack.ts:183-184) AND a DB CHECK constraint. An agent shipping a new value before the backend accepts it gets every ack rejected, never reaches ATTESTED_V2, and parks the fleet in V1_DEGRADED — the exact structural blocker already on the 2026-07-30 acceptance-ledger record. F16/F16b are entirely endpoint-local and can ship in either order relative to the Backend.


---

## F16 - Endpoint Ed25519 signing private key is stored on a deliberately Users-readable boundary; move it to a SYSTEM/Administrators-only file and self-heal the installed fleet

- **Severity**: CRITICAL - Raised from the recorded HIGH. `PrivateKeyPkcs8DerB64Url` is the endpoint's Ed25519 SIGNING key and the only thing that makes ATTESTED_V2 mean anything: the backend verifies the trust-anchor acknowledgment against `agent.endpointSigningPublicKeySpkiDerB64Url` and nothing else (ai-trust-anchor-ack.service.ts:214). Any local standard user — including non-interactive service identities such as LOCAL SERVICE and NETWORK SERVICE, which are members of BUILTIN\Users — can read the key with a plain file read requiring no privilege at all, then produce acknowledgments and endpoint-signed proofs indistinguishable from the real endpoint's. That is not a hardening gap; it is the complete defeat of the cryptographic identity the whole V2 trust chain rests on, reachable by the lowest-privileged code on the box. Confirmed in an authorized live ACL inspection; operator identity remains private.
- **Side**: agent   **Effort**: L   **Root cause verdict**: REVISED

### Root cause

NOT a regression and NOT specific to install-mode=lite — both recorded hypotheses are DISPROVEN at source. The Users-Read ACE is applied deliberately and unconditionally on every machine-scoped credential write by a single named constant.

MECHANISM END TO END: `winacl.MachineLocalReadSDDL = "O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;BU)"` (machine_secret_windows.go:68). 0x120089 is FILE_GENERIC_READ, printed by SDDL as `FR`, matching the observed `(A;;FR;;;BU)` exactly. `winacl.HardenMachineLocalRead` (:84-86) applies it through `hardenSecret`, which REPLACES owner+group+DACL and sets PROTECTED_DACL_SECURITY_INFORMATION (:244-247) — so the ACE is authored by us, not inherited from %ProgramData%.

The only Windows machine-credential writer is `protectCredentialTemp` (credentials_atomic_windows.go:17-19), which for systemScope calls `hardenMachineCredential` (:71-73) -> `winacl.HardenMachineLocalRead`. Its own doc comment states the intent in plain words: 'Machine-scoped credentials always receive the canonical LocalSystem/Administrators/Builtin Users descriptor' (:14-16). Both install modes funnel through it: install.ps1:2171 shells out to `setup save-credentials ... --user-scope`, the MSI CA calls the same `runSetupSaveCredentials` (setup_installer.go:60) without it; both reach `config.WriteCredentialsFile(credsPath, data, true)` (setup_installer.go:107), whose comment again names the outcome ('on Windows an atomic write installs the protected SYSTEM/Admin-full + Users-read file DACL', :104-106).

WHY IT IS THERE (the real constraint, and why an SDDL edit alone would brick the fleet): the machine credential is resolved MACHINE-FIRST by `config.CredentialsPath()` (config.go:495-510) from the NON-ELEVATED user context, and `runShim` builds a backend client from `cfg.APIKey` on every governed `npm install` (main.go:4979). The daemon-token has the same shape: attachDaemonToken runs in the user context (daemon_client.go:181-189) and postPrescanWatch treats a 401 as FAIL-CLOSED (:191-198).

BUT — and this is what the existing writeup misses — THAT CONSTRAINT DOES NOT COVER THE PRIVATE KEY. I inventoried every reader of `AIEndpointSigning`: internal/policybundle/trust_anchor_client.go (:242-292, :341) and trust_anchor_contract.go (:243-300), driven exclusively by internal/daemon/ai_trust_converge.go — the SYSTEM daemon — plus the elevated reinstall-carry read at setup_installer.go:222-227. Nothing else. Every OTHER trust-material consumer reads only PUBLIC anchor fields: cmd/devoid-prompt-guard-host/main.go:619-634 (orgId, rootKeyId, rootSpki, fingerprint, transition), internal/core/backend/ai_canary_challenge.go:121 and ai_correlation_keys.go:48 (Status + OrgID only). So the private key has ZERO non-elevated readers and sits on the wide boundary purely because it shares a FILE with material that does.

The 2026-08-07 change renamed and split the constants and pinned the split, but deliberately left credentials.json and daemon-token wide, stating so in code (machine_secret_windows.go:36-45, 63-67) and pinning that exposed state in TestMachineDescriptorRouting (machine_secret_policy_test.go:222-240). The fix was to the NAME; the exposure was left open as 'item 101 [H1] step 1'.

FINALLY, THE SELF-HEAL GAP: the only existing re-assert entrypoint, `config.HardenExistingMachineSecrets()` (machine_secret_hardening_windows.go:16-40), is invoked from exactly ONE place — `devoid harden-shims --require-machine-root` (main.go:8104), an installer-time step. No daemon path re-asserts credential ACLs, so an installed box never repairs itself. By contrast the daemon DOES re-assert the token on every start (daemon_auth.go:174-182), proving the seam pattern already exists and works.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:68`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:84`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:46`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:36`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:63`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:196`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:204`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:244`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:143`
- `C:/cwt/Installers/internal/core/config/credentials_atomic_windows.go:14`
- `C:/cwt/Installers/internal/core/config/credentials_atomic_windows.go:17`
- `C:/cwt/Installers/internal/core/config/credentials_atomic_windows.go:71`
- `C:/cwt/Installers/internal/core/config/config.go:712`
- `C:/cwt/Installers/internal/core/config/config.go:879`
- `C:/cwt/Installers/internal/core/config/config.go:495`
- `C:/cwt/Installers/internal/core/config/config.go:272`
- `C:/cwt/Installers/internal/core/config/config.go:627`
- `C:/cwt/Installers/internal/core/config/ai_trust.go:25`
- `C:/cwt/Installers/internal/core/config/ai_trust.go:105`
- `C:/cwt/Installers/internal/core/config/ai_trust.go:146`
- `C:/cwt/Installers/internal/core/config/machine_secret_hardening_windows.go:16`
- `C:/cwt/Installers/cmd/devoid/main.go:8104`
- `C:/cwt/Installers/cmd/devoid/main.go:4979`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:60`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:104`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:107`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:170`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:195`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:222`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:1074`
- `C:/cwt/Installers/cmd/devoid/daemon_client.go:181`
- `C:/cwt/Installers/cmd/devoid/daemon_client.go:191`
- `C:/cwt/Installers/internal/daemon/daemon_auth.go:162`
- `C:/cwt/Installers/internal/daemon/daemon_auth.go:174`
- `C:/cwt/Installers/internal/daemon/server.go:373`
- `C:/cwt/Installers/internal/winacl/machine_secret_policy_test.go:222`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_client.go:242`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_client.go:341`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_contract.go:243`
- `C:/cwt/Installers/cmd/devoid-prompt-guard-host/main.go:619`
- `C:/cwt/Installers/internal/core/backend/ai_canary_challenge.go:121`
- `C:/cwt/Installers/internal/core/backend/ai_correlation_keys.go:48`
- `C:/cwt/Installers/internal/aikeystore/harden_windows.go:37`
- `C:/cwt/Installers/install-scripts/production/install.ps1:2171`

### Fix

SPLIT THE FILE ALONG THE READER SEAM; DO NOT EDIT THE SDDL IN PLACE. The constraint that keeps credentials.json wide (a non-elevated `npm install` must read the bearer) is real and provable; it does NOT cover the private key, which has zero non-elevated readers. So relocate exactly the material that has no non-elevated reader onto the already-existing, already-pinned SECRET boundary and leave everything else untouched. One mechanism change, not N ACL patches.

1) NEW FILE %ProgramData%\devoid\endpoint-identity.json holding ONLY `aiEndpointSigning` (keyId + publicKeySpki + privateKeyPkcs8DerB64Url + bootstrapRequestId + createdAt), written through a new writer that hardens with `winacl.HardenMachineSecret` (MachineSecretSDDL = SY+BA full, PROTECTED, no BU ACE — the constant and its exact-ACE verifier already exist and are already pinned). POSIX analogue: 0600 root:root, deliberately NOT the 0640 root:devoid credentials policy.
   `aiTrustAnchor` STAYS in credentials.json: every field is public pin data (rootKeyId, SPKI, fingerprint, transition sequence/digest, issuance window, status) and it HAS non-elevated readers (devoid-prompt-guard-host, backend client). Moving it would fail-close the local-authoritative policy path.

2) SELF-HEALING RECONCILER in the SYSTEM daemon, because a code fix alone cannot repair the installed fleet. On daemon construction and again on every heartbeat tick, idempotently and in this exact order:
   a. If endpoint-identity.json is absent AND credentials.json still carries an inline aiEndpointSigning: write the new file, harden it, READ IT BACK and verify both bytes and DACL; ONLY THEN rewrite credentials.json with the aiEndpointSigning key removed. NEVER strip first. A Users-readable key is bad; a LOST key is a permanent backend 409 and an unrecoverable endpoint (the brick documented at setup_installer.go:170-178).
   b. Re-assert the canonical descriptor every pass, reusing hardenSecret's verify-then-harden fast path (machine_secret_windows.go:204) so a correct file costs one READ_CONTROL open and no privileged rewrite.
   c. Record the MEASURED trustee set (this is the primitive F15 consumes) and log loudly on mismatch.
   d. HARD CONSTRAINT: a reconciler failure must NEVER lock daemon IPC. daemon_auth.go:174-182 returns an empty token on hardening failure, which 503s every mutating AI route and makes the guard fail OPEN — the live 7.8.14 incident recorded at machine_secret_windows.go:143-148. This reconciler logs, records, degrades the reported assurance, and returns.

3) UPDATE THE ROUTING PIN IN THE SAME COMMIT. TestMachineDescriptorRouting currently pins the EXPOSED state and goes red the moment the new file appears. Add the new writer to `wantSecret` with its reason; keep credentials_atomic_windows.go in `wantLocalRead` but rewrite its reason to say the private key has moved out and only the bearer + requestSigning remain (that residue is F16b). This is what stops a future commit silently re-widening the key.

4) The reinstall/upgrade carry is the highest-risk edge and must MOVE, not be duplicated: credentialsForInstall (setup_installer.go:195-230) carries AIEndpointSigning forward specifically to prevent the permanent-409 brick. After the split it must read the identity from the new file, and the asymmetry rule (setup_installer.go:183-190 — the anchor is carried ONLY together with the identity) must be preserved ACROSS the two files.

### Changes

**Installers** - `internal/core/config/endpoint_identity.go`

NEW, cross-platform. Add `EndpointIdentityFileName = "endpoint-identity.json"`, `MachineEndpointIdentityPath()` and `UserEndpointIdentityPath()` mirroring MachineDaemonTokenPath/UserDaemonTokenPath (config.go:544-560). Add `LoadEndpointSigning() (*AIEndpointSigningIdentity, error)` and `SaveEndpointSigning(identity *AIEndpointSigningIdentity) error`. SaveEndpointSigning writes atomically through a new writeEndpointIdentityAtomic that hardens the TEMP file BEFORE any secret byte is written (mirroring writeCredentialsFileAtomic, config.go:879-923 — key bytes must never exist under a permissive ACL, not even momentarily), then renames, then read-back-verifies bytes AND descriptor. Unlike saveAITrustFields it is NOT scoped by bearer: there is exactly one machine identity.

**Installers** - `internal/core/config/endpoint_identity_windows.go`

NEW, //go:build windows. `protectEndpointIdentityTemp(tempPath string, systemScope bool) error`: systemScope -> `winacl.HardenMachineSecret(tempPath)` (NOT HardenMachineLocalRead); user scope -> the per-user PROTECTED hardener described in risks. Include the machineCredsDirTestOverride escape hatch exactly as hardenMachineCredential does (credentials_atomic_windows.go:71-84) but routed to `winacl.HardenSecretWithPrincipal`, so a non-SYSTEM test exercises the real replacement+verify path against the SECRET descriptor.

**Installers** - `internal/core/config/endpoint_identity_unix.go`

NEW, //go:build !windows. Machine scope 0600 chown root:root — deliberately NOT CredentialsFileMode(true)'s 0640 root:devoid (config.go:699-708), because no devoid-group member needs the private key. User scope 0600. Add a mode pin so this boundary cannot drift to the group-readable credentials policy by copy-paste.

**Installers** - `internal/core/config/ai_trust.go`

Rewire so the private key never travels through the credentials writer again. `SaveAIEndpointSigning` (:76-81) delegates to config.SaveEndpointSigning(identity) and stops calling saveAITrustFields with setIdentity=true; keep the signature so callers at trust_anchor_client.go:248/264/292 are untouched, and keep the non-empty KeyID / non-empty private-key precondition. `ReadAITrustMaterial` (:93-103) composes: identity from LoadEndpointSigning() (machine-first then user), anchor from credentials as today. `saveAITrustFields` (:105-192) loses the setIdentity branch (:146-152) and the persisted.AIEndpointSigning read-back compare (:178-181). Leave SaveAITrustAnchor (:85-90) and the entire anchor path unchanged.

**Installers** - `internal/core/config/config.go`

Keep the `AIEndpointSigning` field on the Credentials struct (:257) as READ-ONLY LEGACY so the reconciler can parse an un-migrated file; annotate it '// LEGACY: migrated to endpoint-identity.json; never written by this package again'. In loadCredentials, line 627 (`cfg.AIEndpointSigning = creds.AIEndpointSigning`) becomes: prefer LoadEndpointSigning(), fall back to the legacy inline field ONLY when the new file is absent, so an un-migrated box keeps working until the reconciler runs. Line 628 (AITrustAnchor) unchanged.

**Installers** - `internal/winacl/machine_secret_windows.go`

Add `MeasureSecretAssurance(path string) (trustees []string, protected bool, err error)` — open with READ_CONTROL only, read the DACL, return SDDL trustee aliases plus SE_DACL_PROTECTED. It MUST reuse the same ACE walk as verifySecretHandle (:365-380), not a second parser. This is the one primitive shared with F15. Do not change either SDDL constant.

**Installers** - `internal/daemon/machine_secret_reconcile.go`

NEW. `func (s *Server) reconcileMachineSecrets()` implementing the ordered migrate -> verify -> strip -> harden -> measure sequence. Store the last measurement on the Server so trust convergence and any status surface read it without re-measuring. Every failure path: log at Error with the exact path and measured trustee set, set the recorded assurance to the honest lower value, and RETURN — never touch s.daemonToken, never gate a route. Serialize with an OS-level named mutex (Windows Global\DevoidMachineSecrets; POSIX an O_EXCL lockfile beside the file) because an MSI upgrade CA is a SEPARATE process that rewrites credentials.json and config.configMu (ai_trust.go:106) is in-process only.

**Installers** - `internal/daemon/server.go`

Call s.reconcileMachineSecrets() in NewServer immediately BEFORE `s.daemonToken = loadOrCreateDaemonToken(...)` at :373, so a migrated identity is on disk before anything reads trust material; and again from the heartbeat loop so a box whose ACL is widened post-boot repairs within one heartbeat. It must not be able to make NewServer fail.

**Installers** - `cmd/devoid/setup_installer.go`

credentialsForInstall (:195-230): the existing.AIEndpointSigning carry at :222-227 must read the identity from config.LoadEndpointSigning() (falling back to the legacy inline field on an un-migrated box) and must NOT put it back into the returned config.Credentials. Preserve the asymmetry at :183-190 verbatim: aiTrustAnchor carried into credentials.json ONLY when an identity was found in the new file; orgId still carried alone. THIS IS THE BRICK-RISK EDGE — get it wrong and every MSI upgrade re-mints a key against a backend row holding the old one, taking the permanent 409 at :174-177. Also add "endpoint-identity.json" to the purge list in removeWindowsMachinePurgeState (:1074-1085) next to "credentials.json" and "daemon-token".

**Installers** - `internal/core/config/machine_secret_hardening_windows.go`

Extend HardenExistingMachineSecrets (:16-40): keep the two existing paths on their current local-read hardener and ADD MachineEndpointIdentityPath() routed to winacl.HardenMachineSecret. It is called from the elevated installer path (main.go:8104) and is fail-closed there by design (main.go:8104-8107 exits 1) — correct for an installer, and must NOT be copied into the daemon reconciler.

**Installers** - `internal/winacl/machine_secret_policy_test.go`

Update TestMachineDescriptorRouting's tables IN THE SAME COMMIT or the build is red for the wrong reason. Add "internal/core/config/endpoint_identity_windows.go" to wantSecret (:230-236, currently intentionally empty) with the reason: 'the endpoint Ed25519 signing private key; its only readers are internal/policybundle trust-anchor convergence driven by the SYSTEM daemon — zero non-elevated readers, verified by reader inventory'. Rewrite the credentials_atomic_windows.go reason (:225-229) to state the private key has moved out and only the bearer + requestSigning secret remain, pending F16b.

**Installers** - `install-scripts/production/install.ps1`

No functional change to the credential write (it correctly delegates to the Go writer at :2171). Extend the reinstall backup block at :2139 to also back up endpoint-identity.json alongside credentials.json, so a non-destructive reinstall cannot lose the key on a box the reconciler has already migrated.

### Rejected alternatives

- Edit MachineLocalReadSDDL in place to drop the BU ACE. REJECTED: it is shared with internal/aikeystore/harden_windows.go:37 and internal/airuntimeintegrity/providers/claude/machine_windows.go:162, whose readers are genuinely non-elevated (public policy artifacts + the Claude managed-settings file Claude Code reads as the user). Narrowing it fail-closes every non-elevated policy load and every governed npm install fleet-wide.
- Route credentials.json to winacl.HardenMachineSecret without touching the file layout. REJECTED for the same reason at a different site: config.CredentialsPath() is machine-first (config.go:495-510) and runShim reads cfg.APIKey from the non-elevated context (main.go:4979). This is the exact fleet-brick the routing test warns about (machine_secret_policy_test.go:236-241). It is also unnecessary for the private key, which does not share that constraint.
- Encrypt the private key at rest with DPAPI-machine and leave the file Users-readable. REJECTED: DPAPI CRYPTPROTECT_LOCAL_MACHINE is decryptable by ANY process on the same machine, including the same BUILTIN\Users principals — it changes the file format, not the boundary, while making the assurance claim harder to measure honestly (F15).
- Do the per-user credential distribution first and move everything at once. REJECTED as sequencing: it is a materially larger change (F16b) with a real fleet-brick surface, and it would hold the private-key fix — which is independently correct, independently testable, and closes the CRITICAL — behind it for no security benefit.
- Have the reconciler fail-closed (refuse to serve IPC) when it cannot harden. REJECTED with live evidence: that is precisely the 7.8.14 behaviour recorded at machine_secret_windows.go:143-148, where a correct-ACL token still locked the daemon out of its own IPC and every mutating AI route 503'd, making the guard fail OPEN. Failing closed on a hardening error trades a confidentiality gap for a total enforcement outage.

### Tests (each carries a defeat step)

- TEST TestMachineDescriptorRouting places the endpoint identity on the SECRET boundary and keeps the public artifacts on local-read. DEFEAT: point endpoint_identity_windows.go at winacl.HardenMachineLocalRead instead of HardenMachineSecret and re-run — it MUST fail with 'UNROUTED machine writer on the LOCAL-READ boundary' plus 'no longer uses the SECRET boundary'. If it stays green the source scan is not seeing the file; check stripGoComments and the _test.go exclusion at machine_secret_policy_test.go:262-264.
- TEST Windows live DACL — endpoint-identity.json reads back exactly 2 ACEs (SY:FA, BA:FA), SE_DACL_PROTECTED set, no BUILTIN\Users SID, exactly one hard link, not a reparse point. DEFEAT (two, both required): (1) swap the writer to HardenLocalReadWithPrincipal — the exact-count assertion must fail with '3 ACEs; expected 2'; (2) CI-VACUITY DEFEAT — delete the entire assertion body and confirm the PR check STILL goes green today, which proves the runner gap named at machine_secret_policy_test.go:1-11 (no workflow runs ./internal/... on a Windows runner). Adding that Windows runner to .github/workflows/pr-checks.yml is PART OF THIS FIX, not a follow-up: an ACL test no runner executes is exactly the dead-green surface this programme exists to eliminate.
- TEST migration is write-verify-then-strip — an un-migrated credentials.json yields a hardened, read-back-verified endpoint-identity.json AND a credentials.json with no privateKeyPkcs8DerB64Url, and ReadAITrustMaterial() still returns the identity afterwards. DEFEAT: reorder the reconciler to strip credentials.json BEFORE the new file's read-back verification, then force the new-file write to fail (target a read-only directory) — the test must fail by observing the key present in NEITHER file. A green result there means the ordering assertion is not actually exercised, and the whole point is that a lost key is worse than an exposed one.
- TEST reinstall carry — an identity living in endpoint-identity.json survives credentialsForInstall on a same-backend upgrade, and the anchor asymmetry still holds. DEFEAT (two): (1) point the carry read back at the legacy inline field only and run against a fully-migrated box (inline field absent) — the test must fail showing a dropped identity; (2) supply an anchor with NO identity and assert the anchor is NOT carried — if it is, the asymmetry at setup_installer.go:183-190 is broken and the endpoint converges with a fresh key against a stale backend row, taking the permanent 409.
- TEST self-heal — a deliberately widened DACL on endpoint-identity.json is re-narrowed within one reconcile pass, AND a reconcile that cannot rewrite does not lock IPC. DEFEAT (two): (1) stub the reconciler's harden call to a no-op — the re-narrowing assertion must fail; (2) hold the file open with a share mode denying WRITE_DAC so the rewrite is impossible, then assert a mutating daemon IPC route still answers 2xx and the failure is recorded honestly — if that route 503s, the fix has re-created the 7.8.14 fail-open incident at machine_secret_windows.go:143-148 and must be rejected.
- TEST uninstall purge removes endpoint-identity.json. DEFEAT: remove the filename from the removeWindowsMachinePurgeState list (setup_installer.go:1074-1085) and confirm the test fails. Separately assert purgeMachineActivationStore's refuse-when-a-floor-is-present behaviour (:1118-1147) is UNCHANGED — this fix must not collaterally alter the no-downgrade latch.
- TEST negative pin — the three aitrust artifacts KEEP their BUILTIN\Users read ACE and keep having no Users WRITE ACE. DEFEAT: narrow internal/aikeystore/harden_windows.go:37 to HardenMachineSecret and confirm this test fails. Without this pin a later reviewer 'completing' the F16 fix by symmetry will fail-close every non-elevated policy load; the test exists to make the deliberate asymmetry explicit rather than implied by prose.

### Risks

HIGHEST RISK IS KEY LOSS, NOT KEY EXPOSURE. aiEndpointSigning is the field the backend's permanent 409 is about (setup_installer.go:170-178). Any path that drops it — a botched migration, a carry reading the wrong location, an MSI CA racing the daemon reconciler on credentials.json — leaves the endpoint unable to ever re-establish trust. The write-verify-then-strip ordering and the OS-level mutex are load-bearing, not defensive extras.

MSI/daemon concurrency: configMu (ai_trust.go:106) is process-local. The MSI deferred CA is a SEPARATE SYSTEM process using the same writer. Without the named mutex an upgrade can interleave with a reconcile and resurrect the inline key or lose the anchor.

PER-USER INSTALL WHERE THE RUNNING USER IS NOT AN ADMIN (asked explicitly): there is no machine file at all (IsSystemInstall, config.go:522-533) and the user CANNOT assign LocalSystem as owner — hardenSecret would fail at SetSecurityInfo with ERROR_INVALID_OWNER even with the best-effort SeRestorePrivilege/SeTakeOwnershipPrivilege enable at machine_secret_windows.go:256. So the per-user identity file MUST use a distinct per-user descriptor: owner = the caller's own SID, DACL PROTECTED (no inheritance — %USERPROFILE% inheritance is not a boundary if an admin has widened C:\Users), ACEs exactly {caller SID: FA, SYSTEM: FA, Administrators: FA}, and none of BU/WD/AU/IU/BG/AN. State honestly that Administrators-full is unavoidable on Windows and is not a weakening: a local admin can take ownership of anything.

Non-Windows: HardenExistingMachineSecrets is a hard error on POSIX today (machine_secret_hardening_unix.go:7-9). The new POSIX identity path must be a real 0600 root:root implementation, not an error stub, or Linux endpoints regress to no protection at all.

Old agent vs new backend and vice versa: NONE. This is entirely endpoint-local — no wire field, no DTO, no shared-contracts type. It can ship independently of the Backend, in either order.

WHAT THIS DOES NOT CLOSE, stated so the fix is not over-claimed: the API bearer and the requestSigning HMAC secret in credentials.json, and the daemon capability token, REMAIN readable by BUILTIN\Users after this change. A local standard user can still call the backend as this endpoint's agent identity and still drive mutating local IPC. That residue is F16b and must not be described as fixed by F16.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED, ROOT CAUSE VERDICT UPHELD. I opened every load-bearing line. winacl.MachineLocalReadSDDL is at C:/cwt/Installers/internal/winacl/machine_secret_windows.go:68 and is exactly "O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;BU)"; MachineSecretSDDL at :46; HardenMachineLocalRead at :84; PROTECTED_DACL at :247; the 7.8.14 fail-open note at :141-148; hardenSecret's verify-then-harden at :201-205; the ACE walk at :364-380. credentials_atomic_windows.go:14-19 and :71-73 route machine scope to HardenMachineLocalRead. setup_installer.go:60/:104-107/:118-126/:170-178/:183-190/:195-230/:222-227 all read as claimed; install.ps1:2139-2171 as claimed. TestMachineDescriptorRouting pins the exposed state at machine_secret_policy_test.go:216-236 with wantSecret intentionally empty at :230-236. HardenExistingMachineSecrets has exactly one caller, cmd/devoid/main.go:8104. The REGRESSION and lite-only hypotheses are correctly DISPROVEN, and the negative pin on the three aitrust artifacts is correct (internal/aikeystore/harden_windows.go:37, activation.go:7-39) — narrowing those would break signed-bundle propagation and the anti-rollback floor, both PROVEN WORKING live.
- BLOCKING — THE READER INVENTORY IS FALSE, AND THE OMITTED READER IS NON-ELEVATED. The spec asserts the private key's readers are 'internal/policybundle ... driven exclusively by internal/daemon/ai_trust_converge.go — the SYSTEM daemon — plus the elevated reinstall-carry', i.e. 'ZERO non-elevated readers'. There is a SECOND driver of the exact same convergence code: cmd/devoid/ai_trust_converge.go:40 -> policybundle.ConvergeTrustAnchor, reached from cmd/devoid/main.go:6800 (performEnrollment), which is called at cmd/devoid/main.go:4583 from runShim — the NON-ELEVATED user-context governed-install path — and at cmd/devoid/main.go:662 from a per-user daemonStart. Both fire whenever `cfg.AgentID == "" || (cfg.RequestSigningV2Required() && !cfg.HasValidRequestSigningV2())`. That code path reads cfg.AIEndpointSigning at trust_anchor_client.go:242 and, when it is nil, MINTS A NEW KEY at :244-250.
- BLOCKING — THE CONSEQUENCE IS THE EXACT BRICK THE SPEC CALLS ITS HIGHEST RISK. After the split, a non-elevated shim on a system install cannot open a SY+BA-only endpoint-identity.json. cfg.AIEndpointSigning resolves nil, trust_anchor_client.go:244 mints a fresh Ed25519 key, and bootstrap is presented to a backend row still holding the OLD endpoint_signing_* columns — the permanent 409 documented verbatim at cmd/devoid/setup_installer.go:170-178. The fix as written manufactures the failure it was designed to prevent, through a path the spec asserted did not exist.
- BLOCKING — THE config.go:627 FALLBACK CONTRACT IS UNDER-SPECIFIED AND UNSAFE. The change says 'prefer LoadEndpointSigning(), fall back to the legacy inline field ONLY when the new file is absent'. After the fix the file is PRESENT but UNREADABLE to a standard user; that is neither 'absent' nor a benign error. loadCredentials (config.go:608-657) has no non-fatal error channel — it returns err, and config.Load() is on every CLI invocation. Treat EACCES as fatal and every non-elevated devoid command dies fleet-wide; treat it as 'absent' and you get the mint-new-key 409 above. The spec picks neither.
- CITATION ERRORS (non-fatal but they will misdirect an implementer). (a) The change entry says 'Keep the AIEndpointSigning field on the Credentials struct (:257)' — config.go:257 is the field on the **Config** struct; the Credentials struct field is at config.go:281. (b) The first test's troubleshooting note cites 'the _test.go exclusion at machine_secret_policy_test.go:262-264'; the _test.go exclusion is at :259 (:262-264 is the os.ReadFile). (c) The spec cites 'machine_secret_routing_test.go' nowhere but the source comments do (machine_secret_windows.go:26, daemon_token_perm_windows.go:16) while the test actually lives in machine_secret_policy_test.go — flag the stale in-code filename so the implementer does not go looking for a file that is not there.
- EFFORT IS UNDER-ESTIMATED. L (3-5d) does not cover: a new cross-platform writer with harden-temp-before-bytes + read-back of bytes AND descriptor; two new platform hardener files; a daemon reconciler with an OS-level named mutex (Windows Global\ mutex has no x/sys helper in this module today); the carry rewrite at the documented brick edge; the purge list; install.ps1; a NEW windows-latest CI job for ./internal/... (correctly identified as in-scope — pr-checks.yml:107 runs ./internal/winacl/... on ubuntu-latest, so every //go:build windows DACL test in that package is dead-green today); plus seven tests several of which need a live Windows DACL harness. Add the non-elevated-read contract above and this is XL.

**Corrected root cause**: The mechanism is exactly as the spec derived it — MachineLocalReadSDDL (machine_secret_windows.go:68) applied unconditionally by hardenMachineCredential (credentials_atomic_windows.go:71-73) on both install paths — with ONE correction that changes the fix. The private key does NOT have zero non-elevated readers. The convergence code that reads AND mints it has two drivers, not one: internal/daemon/ai_trust_converge.go:62 (SYSTEM daemon) and cmd/devoid/ai_trust_converge.go:40, reached from cmd/devoid/main.go:6800 inside performEnrollment, which runShim calls at cmd/devoid/main.go:4583 and a per-user daemonStart calls at cmd/devoid/main.go:662 — both in the caller's own, typically non-elevated, context. Additionally every non-elevated config.Load() already materialises the key into memory via loadCredentials (config.go:627), because it lives in the file the shim must read machine-first (config.go:498-510). So the file split is still the right shape, but 'nothing non-elevated touches this' is false, and the split must define what a non-elevated caller SEES when the identity file exists and is unreadable.


**Corrected approach**: Keep the split (new %ProgramData%\devoid\endpoint-identity.json on winacl.HardenMachineSecret; 0600 root:root on POSIX; anchor stays in credentials.json). Add ONE missing contract and one guard, both testable:

1) LoadEndpointSigning must return three distinguishable outcomes, not two: PRESENT(identity) / ABSENT / PRESENT-BUT-UNREADABLE (os.ErrPermission, or Windows ERROR_ACCESS_DENIED). Export config.EndpointIdentityUnreadable() bool alongside it. loadCredentials (config.go:627) must NEVER fail on the unreadable case — it sets cfg.AIEndpointSigning = nil and records the unreadable fact, so every existing non-elevated CLI keeps working exactly as today.

2) HARD GUARD AT THE MINT SITE. internal/policybundle/trust_anchor_client.go:243 currently reads `if identity == nil { ...mint... }`. It must become `if identity == nil { if config.EndpointIdentityUnreadable() { return degraded, fmt.Errorf("%w: endpoint identity exists but is not readable by this process; convergence must run as the SYSTEM daemon", ErrAITrustNotConverged) } ...mint... }`. Never mint a replacement key when the real one is on disk and merely out of reach. This is the single change that stops the fix from becoming the 409 brick, and it also makes the daemon the only actor that can converge — which is the intended design, now enforced rather than assumed.

3) Because of (2), enroll-time convergence from a non-elevated shim on a system install becomes a loud V1_DEGRADED that the SYSTEM daemon repairs on its next pass. cmd/devoid/ai_trust_converge.go:57-60 already has exactly that loud-degraded shape; reuse it, do not add a new failure mode.

4) Fix the down-stream carry precisely: credentialsForInstall (setup_installer.go:195-230) is called for BOTH scopes (machine at :102, per-user at :143). The identity read must be scope-correct — machine carry reads MachineEndpointIdentityPath(); the per-user call must NOT silently pick up the machine identity via a machine-first loader.

5) Add the missing files to the change set: internal/security/manifest.go:161-163 registers credentials.json as a tamper-detected CriticalFile and cmd/devoid/main.go:4596-4599 refreshes it after enroll — endpoint-identity.json must get the same coverage or the key file is the one credential with no integrity manifest entry. internal/core/config/machine_secret_hardening_unix.go:7-9 is a hard-error stub and must gain the real POSIX implementation, since HardenExistingMachineSecrets is the installer's only re-assert entrypoint.

6) Keep everything else: the write-verify-then-strip ordering, the named mutex, the never-gate-IPC constraint (correctly grounded in daemon_auth.go:174-182 and machine_secret_windows.go:141-148), the routing-table edit in the same commit, and the negative pin on the aitrust artifacts. Those are all right.


**Missing changes the reviewer found**:

- **Installers** `internal/policybundle/trust_anchor_client.go` - Line 243 (`if identity == nil`): add the unreadable-identity guard BEFORE the mint at :244-250. When config reports the identity file exists but cannot be opened by this process, return ErrAITrustNotConverged with a distinct reason instead of minting a new Ed25519 key. Without this the fix produces the permanent-409 brick described at setup_installer.go:170-178 on every non-elevated runShim first-run enrollment (reached via main.go:4583 -> :6800 -> ai_trust_converge.go:40).
- **Installers** `internal/core/config/endpoint_identity.go` - LoadEndpointSigning must distinguish ABSENT from PRESENT-BUT-UNREADABLE (os.ErrPermission / ERROR_ACCESS_DENIED) and expose EndpointIdentityUnreadable(). The spec's 'fall back only when the new file is absent' is unimplementable without this distinction, because after the fix the common non-elevated case is present-and-unreadable.
- **Installers** `internal/core/config/config.go` - loadCredentials (:608-657) must treat an unreadable endpoint-identity.json as non-fatal — set cfg.AIEndpointSigning = nil and record the fact. Today loadCredentials returns err to config.Load(), which runs on EVERY CLI invocation; a fatal permission error there is a fleet-wide CLI brick. Also correct the spec's line reference: the Credentials struct's AIEndpointSigning field is at :281, not :257 (:257 is the Config struct's).
- **Installers** `internal/security/manifest.go` - Lines 161-163 register credentials.json in manifest.CriticalFiles for tamper detection; endpoint-identity.json must be registered the same way, and cmd/devoid/main.go:4596-4599 (RefreshCriticalFile after enroll) extended, or the endpoint's signing key becomes the only credential with no integrity record.
- **Installers** `internal/core/config/machine_secret_hardening_unix.go` - Lines 7-9 return a hard error on every non-Windows host. HardenExistingMachineSecrets is the installer's only re-assert entrypoint (called at cmd/devoid/main.go:8104 and fail-closed there). If POSIX gains an endpoint-identity file it must gain a real 0600 root:root implementation here, not stay an error stub.
- **Installers** `cmd/devoid/setup_installer.go` - credentialsForInstall (:195-230) is invoked for BOTH scopes — machine at :102 and per-user at :143 (saveUserScopeCredentials). The identity carry must be scope-correct; a machine-first LoadEndpointSigning() called from the per-user path would silently attach the machine identity to a per-user credentials file.
- **Installers** `.github/workflows/pr-checks.yml` - Line 107 runs `go test ./internal/winacl/...` on ubuntu-latest (job runs-on at :68). Every //go:build windows test in that package — machine_secret_windows_test.go and machine_secret_verify_windows_test.go — therefore never executes on a PR. A windows-latest job covering ./internal/winacl/... ./internal/core/config/... ./internal/daemon/... is required in THIS commit; the spec names the vacuity correctly but the workflow file is absent from its changes list.

**Collateral risk**: Does NOT regress command-lane blocking/discrimination, DLP, browser masking, Codex wire blocking, the supply-chain package gate, or MCP discovery — none read AIEndpointSigning. Signed-bundle propagation and anti-rollback ARE at risk only if a later reviewer narrows internal/aikeystore/harden_windows.go:37 by symmetry; the spec's negative pin correctly forbids this and must survive review. The real collateral is the supply-chain package gate INDIRECTLY: if the endpoint-identity read contract is left as written, config.Load() or convergence failure on a non-elevated shim is on the same code path as `npm install` governance (cmd/devoid/main.go:4578-4590 exits 1 fail-closed when v2 signing is required). Get (1) and (2) above wrong and you brick the governed-install lane, not just trust.

**Effort correction**: XL (>1 week), not L. The listed changes alone are ~L; adding the three-state read contract, the mint guard, the tamper-manifest coverage, the POSIX hardening implementation, and a new windows-latest CI job for ./internal/... (required, because pr-checks.yml:107 runs internal/winacl on ubuntu-latest so every //go:build windows ACL test there is dead-green today) puts it over a week.


---

## F16b - Machine API bearer, requestSigning HMAC secret and daemon capability token remain readable by BUILTIN\Users; narrow to a dedicated local group mirroring the already-shipped POSIX root:devoid model

- **Severity**: HIGH - Any local standard user — and every non-interactive service identity that is a member of BUILTIN\Users — can read the endpoint bearer plus the 32-byte requestSigning secret and therefore mint fully-signed, fail-closed-accepted requests as this endpoint's agent, and can read the daemon capability token and drive every mutating local IPC route. Not CRITICAL because, unlike F16's Ed25519 key, these are shared agent/install credentials rather than the cryptographic trust anchor — per the memory record cli_agent keys are already fleet/site-shared, so their compromise does not forge a unique endpoint identity. Also below F16 because a genuinely non-elevated reader DOES exist, so a careless narrowing brick-risks every npm install on the fleet.
- **Side**: agent   **Effort**: L   **Root cause verdict**: CONFIRMED
- **Depends on**: F16

### Root cause

Same single mechanism as F16 — winacl.MachineLocalReadSDDL (machine_secret_windows.go:68) applied by HardenMachineLocalRead — but here the wide ACE has a REAL justification, recorded in code: config.CredentialsPath() resolves MACHINE-FIRST (config.go:495-510) and runShim constructs a backend client from cfg.APIKey in the NON-ELEVATED user context on every governed package install (main.go:4979, and the same pattern at main.go:3103 and :4644); attachDaemonToken reads the machine token in the user context on every shim and `devoid ai hook` invocation (daemon_client.go:181-189); postPrescanWatch treats a 401 as FAIL-CLOSED (daemon_client.go:191-198). The routing test states both preconditions verbatim (machine_secret_policy_test.go:225-241) and internal/daemon/daemon_token_perm_windows.go:9-16 repeats the token half.

THE ACTUAL DEFECT IS NOT 'a wide ACE exists' — it is that the Windows implementation is a BADLY CHOSEN ANALOGUE of the POSIX design shipping alongside it. On POSIX the very same file is 0640 root:devoid (CredentialsFileMode, config.go:699-708; daemon_token_perm_unix.go:13-26): readable by a DEDICATED GROUP whose membership the installer controls. The Windows port rendered 'a dedicated group' as BUILTIN\Users — every local account on the machine, including LOCAL SERVICE, NETWORK SERVICE, guest-class accounts and any newly created standard user. Two platforms therefore ship materially different trust boundaries under one name. Nothing about the non-elevated-reader constraint requires the reader set to be EVERYONE; it requires it to be THE USERS WHO RUN GOVERNED TOOLS.

Secondary contributor: CredentialsPath() and DaemonTokenReadPath() (config.go:548-560) select scope by os.Stat EXISTENCE, not readability. os.Stat succeeds on a file the caller cannot open. So even where a correct per-user copy already exists — the lite path writes one via --user-scope (setup_installer.go:118-126, install.ps1:2171) — the machine copy still wins, and a narrowed machine ACL would produce a hard open-failure rather than a graceful per-user fallback.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:68`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:48`
- `C:/cwt/Installers/internal/winacl/machine_secret_windows.go:275`
- `C:/cwt/Installers/internal/core/config/config.go:495`
- `C:/cwt/Installers/internal/core/config/config.go:548`
- `C:/cwt/Installers/internal/core/config/config.go:699`
- `C:/cwt/Installers/internal/core/config/config.go:514`
- `C:/cwt/Installers/cmd/devoid/main.go:4979`
- `C:/cwt/Installers/cmd/devoid/daemon_client.go:181`
- `C:/cwt/Installers/cmd/devoid/daemon_client.go:191`
- `C:/cwt/Installers/internal/daemon/daemon_token_perm_windows.go:9`
- `C:/cwt/Installers/internal/daemon/daemon_token_perm_unix.go:13`
- `C:/cwt/Installers/internal/daemon/daemon_auth.go:162`
- `C:/cwt/Installers/internal/winacl/machine_secret_policy_test.go:225`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:79`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:118`
- `C:/cwt/Installers/install-scripts/production/install.ps1:2171`

### Fix

MAKE THE WINDOWS BOUNDARY THE FAITHFUL ANALOGUE OF THE POSIX ONE IT WAS MEANT TO BE: replace the BUILTIN\Users ACE with a dedicated local group, exactly as POSIX uses root:devoid. One constant, one group lifecycle, one membership reconciler — not a per-file ACL campaign and not a per-user credential distribution project.

1) NEW DESCRIPTOR `winacl.MachineGroupReadSDDL` = O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;%s) templated on the SID of a local group `Devoid Agents`, built at runtime because a local group SID is machine-specific and cannot be a compile-time constant. Same PROTECTED, same FILE_GENERIC_READ, same exact-ACE verification. MachineLocalReadSDDL STAYS with its three legitimate callers (the aikeystore public artifacts and the Claude managed-settings file, which genuinely must be readable by any local user running Claude Code) — which is why this adds a THIRD boundary rather than mutating the second.

2) GROUP LIFECYCLE. The elevated installer creates `Devoid Agents` if absent and adds the installing user. The SYSTEM daemon reconciles membership on the same pass as F16's reconciler: for each interactive logon session it observes, ensure that user's SID is a member. This is the Windows equivalent of the `usermod -aG devoid` the POSIX installer already performs.

3) READABILITY-BASED SCOPE RESOLUTION. CredentialsPath() (config.go:495-510) and DaemonTokenReadPath() (:548-560) must decide by ATTEMPTING TO OPEN, not by os.Stat. A caller who cannot open the machine copy transparently falls back to the per-user copy. This is what makes the narrowing safe: a user outside the group degrades to their own ~/.devoid credential instead of hard-failing, and a user with neither gets a precise, actionable error naming the group.

4) PER-USER PROVISIONING so the fallback is real. The lite path already writes a per-user copy; the MSI path never does, and setup_installer.go:79-83 explains exactly why (the CA runs as SYSTEM, whose profile is useless). The SYSTEM daemon closes that gap: when it observes an interactive user with no readable credential it materialises <profile>\.devoid\credentials.json and <profile>\.devoid\daemon-token with a per-user PROTECTED DACL {that user SID: FA, SYSTEM: FA, Administrators: FA}. SaveEnrollment (config.go:786-800) already writes every existing scope, so once the file exists it stays converged.

5) SEQUENCING WITHIN ONE RELEASE, WITH NO FEATURE FLAG. The narrowing is gated on a MEASURED FACT, not a toggle: the reconciler narrows the machine DACL only after verifying that the group exists AND that every profile with a logon in the retention window either is a member or has a verified per-user copy. That is a precondition check, not an off-switch — no env var, no config key, no shadow mode — and on a normal box it is satisfied on the first pass.

6) Update TestMachineDescriptorRouting in the same commit: move credentials_atomic_windows.go and daemon_token_perm_windows.go out of wantLocalRead into a new wantGroupRead set with their reasons, leaving wantSecret holding F16's endpoint identity and wantLocalRead holding only the genuinely-public artifacts.

### Changes

**Installers** - `internal/winacl/machine_secret_windows.go`

Add MachineGroupReadSDDL as an SDDL TEMPLATE plus HardenMachineGroupRead(path string, groupSID *windows.SID) error and HardenGroupReadWithPrincipal (the test-only owner-substituting twin, matching the existing pair at :108-122). Extend expectedACEs (:275-310) with the group case so verifySecretHandle enforces exactly {SY:FA, BA:FA, <group>:0x120089} and still fails closed on an unrecognised descriptor (:306-308).

**Installers** - `internal/winacl/local_group_windows.go`

NEW. EnsureDevoidAgentsGroup() (*windows.SID, error) via NetLocalGroupAdd/NetLocalGroupAddMembers, plus EnsureMember(groupSID, userSID). Idempotent. Must return a DISTINGUISHABLE error when local group creation is denied by policy, so the caller leaves the DACL unnarrowed and reports honestly rather than bricking a locked-down image.

**Installers** - `internal/core/config/credentials_atomic_windows.go`

hardenMachineCredential (:71-84) routes to winacl.HardenMachineGroupRead with the resolved group SID. If the group cannot be resolved it returns the CURRENT behaviour (HardenMachineLocalRead) plus a loud recorded warning — a machine that cannot host the group keeps working at today's boundary rather than losing its credential. Rewrite the doc comment at :14-16, which currently states the Users-read outcome as intended.

**Installers** - `internal/daemon/daemon_token_perm_windows.go`

hardenMachineToken (:17) moves from the winacl.HardenMachineLocalRead function value to a wrapper that resolves the group SID and calls HardenMachineGroupRead, with the same fall-back-and-report behaviour. Rewrite the doc comment at :9-16, which currently documents the exposure as deliberate. Keep it a package var so TestMachineDescriptorRouting's no-trailing-paren scan (machine_secret_policy_test.go:238-241) still sees it.

**Installers** - `internal/core/config/config.go`

CredentialsPath() (:495-510) and DaemonTokenReadPath() (:548-560): replace the os.Stat existence probes with an actual os.Open (immediately closed). A machine path that exists but cannot be opened must fall through to the user-scoped path rather than be returned. Add MachineCredentialUnreadable() bool so callers render one precise operator message ('this account is not a member of Devoid Agents and has no per-user credential') instead of a bare permission error.

**Installers** - `internal/daemon/machine_secret_reconcile.go`

Extend F16's reconciler: ensure the group exists, reconcile membership for observed interactive sessions, materialise missing per-user credential + token copies with the per-user PROTECTED DACL, and only then narrow the machine DACL. Every step records a measured fact; none may gate daemon IPC (same hard constraint as F16).

**Installers** - `internal/winacl/machine_secret_policy_test.go`

Add TestMachineGroupReadSDDLGrantsNoBroadTrustee mirroring :166-190, banning ;BU) ;WD) ;AU) ;IU) ;BG) ;AN) in the group template and requiring the O:SYG:SYD:P prefix. Add the wantGroupRead routing set and move the two secret-bearing writers into it with their reasons.

**Installers** - `install-scripts/production/install.ps1`

Create/ensure the `Devoid Agents` local group and add the installing user, before the `setup save-credentials` call at :2171, mirroring what install.sh already does for the POSIX devoid group. Non-fatal on failure — report and continue at the current boundary.

### Rejected alternatives

- Move credentials.json and daemon-token straight to MachineSecretSDDL. REJECTED with the mechanism named in the code being changed: attachDaemonToken runs in the user context and postPrescanWatch treats 401 as FAIL-CLOSED (daemon_client.go:181-198), so this stops every non-elevated npm install on every endpoint — the exact fleet-wide brick warned about at machine_secret_policy_test.go:236-241 and daemon_token_perm_windows.go:9-16.
- Full per-user credential distribution (the daemon mints a distinct bearer per user) as the primary fix. REJECTED as disproportionate and, on its own, ineffective: the daemon-token that would gate the distribution IPC is itself Users-readable, so without narrowing the token first any local user could simply ask for a bearer. The group narrowing plus readability-based fallback achieves the reduction with a fraction of the surface.
- Switch daemon IPC to a named pipe with ImpersonateNamedPipeClient so no shared secret exists at all. Architecturally the right long-term answer and worth recording, but REJECTED for this fix: it changes the transport for every CLI call path AND the browser-extension loopback lane, which is a far larger blast radius than the finding warrants and cannot be validated inside one release.
- Grant Authenticated Users instead of BUILTIN\Users. REJECTED: on a domain-joined machine that is WIDER, not narrower, and it is already on the banned-trustee list in the existing policy pin (machine_secret_policy_test.go:141-152).

### Tests (each carries a defeat step)

- TEST Windows live DACL — credentials.json and daemon-token read back exactly {SY:FA, BA:FA, DevoidAgents:0x120089}, SE_DACL_PROTECTED set, no BUILTIN\Users ACE. DEFEAT (two): (1) restore HardenMachineLocalRead on either writer — the trustee assertion must fail naming BU; (2) delete the assertion body and confirm the CI job still passes today — the same Windows-runner vacuity check as F16. Do not accept this test until a runner actually executes ./internal/... on Windows.
- TEST fleet-brick guard — a non-member standard user still completes a governed npm install via the per-user fallback. DEFEAT: run as a user NOT in the group who HAS a provisioned per-user credential (install must succeed), then delete the per-user copy and re-run — it must fail CLOSED with the named actionable group message, not with a bare 'access denied' and NOT silently fail open. A run that succeeds with no credential at all means the gate was bypassed and the test is measuring nothing.
- TEST readability-based resolution — a present-but-unreadable machine credential resolves to the user scope. DEFEAT: revert CredentialsPath to os.Stat and confirm the test fails by returning the machine path. Run it DE-ELEVATED: under an elevated test process the machine file is always openable and the assertion passes vacuously, which is precisely the trap.
- TEST narrowing precondition — with local group creation denied, the DACL is LEFT at today's boundary and the degradation is recorded. DEFEAT: stub EnsureDevoidAgentsGroup to return the policy-denied error and assert (a) the file keeps its current descriptor, (b) a measured record names the reason, (c) no route fail-closes. If the reconciler narrows anyway it will lock out every user on a locked-down domain-joined machine.
- TEST per-user provisioning produces a PROTECTED per-user DACL with no broad trustee. DEFEAT: widen C:\Users\<u> to grant BUILTIN\Users read and re-run — because the per-user descriptor is PROTECTED the provisioned file must still read back with no BU ACE. If it inherits, SetAccessRuleProtection was not applied and the per-user fallback is not a boundary at all.

### Risks

THE FLEET-BRICK IS THE DOMINANT RISK AND IT IS NAMED IN THE CODE BEING CHANGED (machine_secret_policy_test.go:236-241, daemon_token_perm_windows.go:9-16): a token the user-context shim cannot read means attachDaemonToken sends no header, the daemon 401s, and postPrescanWatch's caller treats that as FAIL-CLOSED — every non-elevated npm install on every endpoint stops. Hence the measured provisioning precondition, and hence the readability-based fallback must land in the SAME release, never after.

Domain-joined and hardened images: local group creation may be denied by policy, and roaming/mandatory profiles may make the per-user copy non-durable. Both must degrade to today's boundary with a recorded, honest 'not narrowed, and why', never to a broken endpoint.

Interaction with F16: both reconcilers share the ordering and the named mutex. Ship F16 FIRST — it is independently correct, closes the CRITICAL, and leaves this residue explicitly stated. Shipping this first would put the private key behind a GROUP boundary instead of a SYSTEM boundary, which is strictly weaker than it needs to be.

Honesty discipline: after this fix the reported storage assurance (F15) for credentials.json and daemon-token is OS_SHARED_LOCAL_GROUP, NOT OS_PROTECTED. Do not let the group narrowing be reported as OS_PROTECTED — a group-readable secret is a genuinely lower assurance and saying so is the entire point of F15.

No backend or wire impact: entirely endpoint-local, no DTO, no contract, no mirror.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED, ROOT CAUSE CONFIRMED. The POSIX-analogue framing is correct and provable: CredentialsFileMode returns 0640 for system scope (config.go:705-710) and applyMachineTokenPerms chowns root:devoid 0640 with a 0600 fail-safe (daemon_token_perm_unix.go:26-39), while the Windows port renders the same intent as BUILTIN\Users (machine_secret_windows.go:68). install.sh really does create the group and add the user (install-scripts/production/install.sh:413-435, 1805, 1857). The non-elevated-reader constraint is real (config.go:498-510 machine-first; cmd/devoid/main.go:4979, :3103, :4644 build the backend client from cfg.APIKey; daemon_client.go:181-198). The existence-not-readability observation about os.Stat is correct (config.go:498-510, :527-531, :555-559).
- BLOCKING — THE READABILITY FALLBACK IS WIRED TO THE WRONG FUNCTION, SO THE NAMED FLEET-BRICK IS LEFT OPEN. The fix changes config.DaemonTokenReadPath() (:555-559). But attachDaemonToken does not call it: cmd/devoid/daemon_client.go:186 calls daemon.ReadToken(configDir), and ReadToken (internal/daemon/daemon_auth.go:98-123) branches on config.IsSystemInstall() at :112 and returns read(config.MachineDaemonTokenPath()) with NO user-scope fallback, and its inner read() at :103-106 swallows every error to "". So on a system install a non-member user gets an empty token, no header is set, the daemon 401s, and postPrescanWatch's caller treats that as FAIL-CLOSED (daemon_client.go:195-198) — every non-elevated npm install stops. That is precisely the brick the spec says must never happen, and internal/daemon/daemon_auth.go is absent from the changes list.
- BLOCKING — THE TEMPLATED SDDL WILL FAIL expectedACEs AND FAIL OPEN. expectedACEs dispatches on STRING EQUALITY against the two constants (machine_secret_windows.go:288-310) and returns 'unknown machine descriptor; refusing to verify' in default (:306-308). A runtime-templated MachineGroupReadSDDL carrying a machine-specific group SID can never equal a constant, so every group-hardened file falls into that default, verifySecretHandle fails, hardenSecret returns an error, and applyMachineTokenPerms -> loadOrCreateDaemonToken (daemon_auth.go:177-180) returns an EMPTY TOKEN — which locks mutating IPC and, per the incident recorded at machine_secret_windows.go:141-148, makes the guard fail OPEN. The spec says 'extend expectedACEs with the group case' but never says the string-equality dispatch itself must be restructured (descriptor-kind enum or prefix match). As written this is a fail-open landmine on the daemon's own capability token.
- BLOCKING — THE ROUTING PIN CANNOT SEE THE NEW HARDENER, AND THE SPEC'S OWN FALLBACK CONTRADICTS ITS TABLE EDIT. TestMachineDescriptorRouting scans source text for exactly two regexes (machine_secret_policy_test.go:242-243); winacl.HardenMachineGroupRead matches NEITHER, so a file that only calls it is invisible and the pin passes green on an unrouted boundary. Worse: the spec's own design has hardenMachineCredential FALL BACK to winacl.HardenMachineLocalRead when the group cannot be resolved — that call site stays in the file, so credentials_atomic_windows.go still matches localReadCall. Moving it 'out of wantLocalRead into wantGroupRead' therefore fails the scan as an UNROUTED LOCAL-READ writer (:290-296). The table edit and the fallback design are mutually inconsistent as specified.
- IsSystemInstall() IS LEFT INCONSISTENT. The fix converts CredentialsPath and DaemonTokenReadPath to readability probes but not IsSystemInstall (config.go:527-531), which is itself an os.Stat existence probe and is the machine-vs-user signal used by ReadToken (:112) and by the daemon's own token WRITE target. After the change CredentialsPath falls back to user scope while IsSystemInstall still answers 'system' — two different answers to the same question in the same process. Spell out which one is authoritative and why, or the fallback is non-deterministic across call sites.
- EFFORT IS UNDER-ESTIMATED. L (3-5d) does not cover NetLocalGroupAdd/NetLocalGroupAddMembers (no x/sys/windows wrapper is used anywhere in this module today — this is new syscall plumbing), membership reconciliation over observed logon sessions, a SYSTEM daemon materialising per-user files into other users' profiles with a PROTECTED per-user DACL, the readability rewrite across four resolvers, plus the five tests. Combined with the dependsOn F16 sequencing this is XL.

**Corrected approach**: Keep the shape — a third descriptor and a dedicated local group, faithful to the POSIX root:devoid model — and repair four mechanical defects:

1) Introduce a descriptor KIND, not a string. Replace the `switch sddl` in expectedACEs (machine_secret_windows.go:288-310) with an explicit kind (secret | localRead | groupRead + resolved group SID) threaded through hardenSecret/alreadyCanonicalSecret/verifySecretHandle. Keep the default fail-closed branch. Without this, group hardening cannot verify and the daemon token empties out (daemon_auth.go:177-180 -> fail-open, machine_secret_windows.go:141-148).

2) Fix the token read path, not the path helper. internal/daemon/daemon_auth.go:110-123: on a system install, attempt to OPEN MachineDaemonTokenPath(); on a permission error fall through to the user-scoped token rather than returning "". Keep the existing anti-shadow rule (a readable machine token still wins). This — not DaemonTokenReadPath — is what attachDaemonToken (daemon_client.go:186) actually calls, and it is the only change that makes the narrowing survivable for the governed-install lane.

3) Make the routing pin see the new boundary in the same commit: add a `groupReadCall` regex for winacl.HardenMachineGroupRead|HardenGroupReadWithPrincipal alongside :242-243, add the wantGroupRead set, and extend the straddle check at :310-321 to all three pairs. Then resolve the contradiction: EITHER put the local-read fallback in a separate file so credentials_atomic_windows.go carries only the group call, OR keep credentials_atomic_windows.go in BOTH wantLocalRead and wantGroupRead with an explicit reason ('group-read primary, local-read degradation when the group cannot be hosted'). Do not leave it implicit — the whole value of that test is that a boundary decision is written down.

4) Decide IsSystemInstall explicitly. Recommended: leave IsSystemInstall() as an existence probe (it is a scope/topology question, not an access question) and make every READ resolver — CredentialsPath, ReadToken, DaemonTokenReadPath — do the open-probe. State this in the change so a reviewer does not 'complete' the fix by converting IsSystemInstall too, which would silently move the daemon's token WRITE target on any box where the daemon lacks read access.

Sequencing and honesty guidance in the spec are correct and should be kept verbatim: F16 first; report OS_SHARED_LOCAL_GROUP, never OS_PROTECTED, after this lands (F15).


**Missing changes the reviewer found**:

- **Installers** `internal/daemon/daemon_auth.go` - ReadToken (:98-123) is the function attachDaemonToken actually calls (via daemon_client.go:186). Its system-install branch at :112-114 reads MachineDaemonTokenPath() with no fallback and its read() helper at :103-106 swallows permission errors to "". Add the open-probe fallback to the user-scoped token here. Omitting this file makes the entire readability-fallback design inert and leaves the fleet-brick the spec names as its dominant risk fully open.
- **Installers** `internal/winacl/machine_secret_windows.go` - expectedACEs (:288-310) dispatches on string equality against the two SDDL constants and fail-closes in default (:306-308). A runtime-templated group SDDL can never match, so every group-hardened file fails verification. Restructure the dispatch to an explicit descriptor kind threaded through hardenSecret (:196), alreadyCanonicalSecret (:161) and verifySecretHandle (:312) — the spec asks for the group case to be 'extended in' but does not identify the dispatch as the blocker.
- **Installers** `internal/winacl/machine_secret_policy_test.go` - Add a third source-scan regex for the new hardener alongside localReadCall/secretCall at :242-243 and extend the straddle check at :310-321 to three boundaries. Without the regex the new boundary is invisible to the scan and the pin goes green on unrouted writers — exactly the dead-green shape the file's own header (:1-11) exists to prevent. Also reconcile the wantGroupRead move with the spec's local-read fallback, which keeps credentials_atomic_windows.go matching localReadCall.
- **Installers** `internal/core/config/config.go` - State explicitly what happens to IsSystemInstall() (:527-531). It is an existence probe consumed by daemon_auth.go:112 and by the daemon token write-target selection; converting CredentialsPath/DaemonTokenReadPath to readability while leaving it alone produces two different answers to 'is this a system install' inside one process. The spec changes the two resolvers and is silent on the third.

**Collateral risk**: This is the spec in the cluster that can directly regress a capability PROVEN WORKING live. The supply-chain package gate depends on the shim reading the machine bearer (cmd/devoid/main.go:4979) and on postPrescanWatch's token-authenticated handoff (daemon_client.go:181-198, fail-closed at :195-198). Narrowing the DACL without fixing daemon_auth.go:110-123 stops every non-elevated `npm install` fleet-wide. Separately, an expectedACEs verification failure on the daemon token empties the token (daemon_auth.go:177-180), 503s every mutating AI route and makes the guard fail OPEN — which would regress command-lane blocking, the single most valuable capability proven live in this engagement. Both are avoidable, both are in the corrected approach.

**Effort correction**: XL (>1 week), not L. New Windows local-group syscall plumbing, session-aware membership reconciliation, cross-profile per-user provisioning from SYSTEM, four resolver rewrites, the descriptor-kind refactor, and five tests — on top of a hard dependency on F16.


---

## F15 - aiTrustStorageAssurance=OS_PROTECTED is a compile-time constant the agent asserts without measuring, and the backend stores the unverifiable self-report as if it were a verified protection

- **Severity**: HIGH - Raised from the recorded MEDIUM. This is not an inaccurate field — it is a security product asserting, under an Ed25519 signature it controls, that a protection is in force which is demonstrably absent on the very endpoint making the claim. The API presents it as an attested property of an ATTESTED_V2 endpoint, so the one surface an operator would consult to discover F16 actively tells them the opposite. A false negative on a key-exposure control is worse than a missing control, and it directly violates the standing discipline that an uncertified fact is reported honestly as unknown, never as safe.
- **Side**: multi   **Effort**: M   **Root cause verdict**: CONFIRMED

### Root cause

Both halves of the recorded hypothesis are correct and the re-derived line numbers match the current worktrees. There are TWO agent-side sites, not one, and the recorded one is the less important of the pair.

AGENT (Installers@55cd0ae): config.AITrustStorageOSProtected = "OS_PROTECTED" (internal/core/config/ai_trust.go:17) is written unconditionally at BOTH (a) internal/policybundle/trust_anchor_client.go:488, in trustCredentialFromBootstrap, building the LOCAL durable record, and (b) internal/policybundle/trust_anchor_contract.go:300, inside CreateSignedTrustAnchorAck, building the payload that is Ed25519-SIGNED (:305-307) and SENT. (b) is the load-bearing one: it is the value that travels, and it is signed, so the assertion carries the endpoint's own cryptographic weight. Neither site takes any input describing storage. I searched the whole Installers tree for storageAssurance and found only these two writers, the local struct field (ai_trust.go:61), the wire struct field (trust_anchor_contract.go:103) and one test fixture. There is no measurement function anywhere in the module. The value is literally a constant.

BACKEND (Backend@bded3919): src/agents/ai-trust-anchor-ack.service.ts:236 assigns agent.aiTrustStorageAssurance = signedAck.payload.storageAssurance verbatim. The surrounding transaction verifies a great deal — outstanding-issuance match (:201), Ed25519 signature (:214), digest binding — but nothing about storage, and nothing CAN be verified server-side: storage protection is an unobservable local property. The stored value is then exposed by src/agents/agents.controller.ts:148 on the agent response, typed at src/agents/dto/agent-response.dto.ts:137-138 as an enum of exactly two GOOD values.

THE STRUCTURAL PROBLEM THE WRITEUP DOES NOT STATE: the enum has NO honest negative. AI_TRUST_ANCHOR_STORAGE_ASSURANCES (src/crypto/ai-trust-anchor-ack.ts:10-13) is exactly ['OS_PROTECTED','ENTERPRISE_MANAGED'], enforced in FOUR independent places — the strict validator (:178-184, throws 'storageAssurance is unsupported'), the DTO @IsIn (src/agents/dto/ai-trust-anchor-ack.dto.ts:69-71), the entity type (src/entities/agent.entity.ts:210-211, varchar(24)), and the DB CHECK constraint ck_agents_ai_trust_storage_assurance (src/migrations/1785300000000-AddAiTrustAnchorAttestation.ts:60-64). A truthful agent LITERALLY CANNOT report a degraded state today: every value it is permitted to send is a claim of adequate protection. That is why the constant is a constant, and it is why fixing the agent without first widening the vocabulary would 400 every ack and park the fleet in V1_DEGRADED.

One mitigating fact worth recording: I grepped the Frontend worktree for aiTrustStorageAssurance and OS_PROTECTED and found NOTHING, so the false claim is not currently rendered in the console — it lives in the DB and the API only. That bounds today's blast radius and means the honest display is new work, not a correction of existing UI.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/core/config/ai_trust.go:17`
- `C:/cwt/Installers/internal/core/config/ai_trust.go:61`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_client.go:488`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_client.go:341`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_contract.go:277`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_contract.go:300`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_contract.go:103`
- `C:/cwt/Installers/internal/policybundle/trust_anchor_contract.go:322`
- `Backend/src/agents/ai-trust-anchor-ack.service.ts:236`
- `Backend/src/agents/ai-trust-anchor-ack.service.ts:214`
- `Backend/src/crypto/ai-trust-anchor-ack.ts:10`
- `Backend/src/crypto/ai-trust-anchor-ack.ts:178`
- `Backend/src/agents/dto/ai-trust-anchor-ack.dto.ts:69`
- `Backend/src/entities/agent.entity.ts:210`
- `Backend/src/migrations/1785300000000-AddAiTrustAnchorAttestation.ts:60`
- `Backend/src/agents/agents.controller.ts:148`
- `Backend/src/agents/agents.controller.ts:294`
- `Backend/src/agents/dto/agent-response.dto.ts:137`
- `Backend/src/crypto/ai-trust-anchor-ack.spec.ts:124`

### Fix

GIVE THE VOCABULARY AN HONEST NEGATIVE FIRST, THEN MAKE THE AGENT MEASURE. The order is forced by the four-place closed enum: widen server-side, deploy, then teach the agent to tell the truth.

ENUM (final; every value <= 24 chars so the existing varchar(24) column needs NO widening):
  OS_PROTECTED           — MEASURED: descriptor PROTECTED (no inheritance) and every trustee is LocalSystem or Administrators. Windows: exactly the MachineSecretSDDL shape. POSIX: 0600 root:root. May ONLY be emitted after a successful measurement.
  OS_SHARED_LOCAL_GROUP  — MEASURED: PROTECTED, no broad trustee (no BUILTIN\Users / Everyone / Authenticated Users / Interactive), but a dedicated non-administrative group has read. F16b's target state, and today's POSIX 0640 root:devoid state.
  OS_LOCAL_USER_READABLE — MEASURED: a broad local principal can read. THIS IS THE TRUE VALUE FOR THE ENDPOINT IN FINDINGS.md TODAY.
  UNVERIFIED             — the agent could NOT measure (open failed, unsupported platform, unexpected descriptor). Never inferred, never defaulted to a good value.
  ENTERPRISE_MANAGED     — unchanged; preserved for old agents and a future TPM/DPAPI-machine lane.

AGENT: implement measurement ONCE (the cross-cutting primitive shared with F16) and thread it into BOTH writers. Add `storageAssurance string` as an EXPLICIT REQUIRED parameter of CreateSignedTrustAnchorAck (trust_anchor_contract.go:277) and of trustCredentialFromBootstrap (trust_anchor_client.go:485-490), so the value is IMPOSSIBLE to omit — a caller that forgets it will not compile. That compile-time force is the structural guard against recurrence; a default parameter or package-level variable would let it silently regress to a constant. Measure the WEAKEST of the files the anchor's storage claim is actually about — the endpoint identity file (F16's endpoint-identity.json, or the inline credentials.json on an un-migrated box) and the credentials file holding the anchor — and take the minimum. Fail to UNVERIFIED, never to OS_PROTECTED.

BACKEND: widen the enum at all four enforcement points plus a new migration dropping and recreating the CHECK constraint. Keep storing the payload value VERBATIM — do NOT normalise, clamp or rewrite it: it lives inside the Ed25519-signed payload and inside ackBodyDigest, and mutating it would break the binding the endpoint validates in the response (ValidateTrustAnchorAckResponse, trust_anchor_contract.go:322-337).

HONESTY ON THE READ SIDE, WITHOUT TOUCHING THE SIGNED PAYLOAD: an OLD agent sends OS_PROTECTED unconditionally and the backend cannot distinguish that from a NEW agent that measured OS_PROTECTED — except that it already stores the signed aiTrustAgentVersion (ai-trust-anchor-ack.service.ts:238). So add a DERIVED, non-persisted boolean on the agent response: aiTrustStorageAssuranceMeasured = storageAssurance !== 'OS_PROTECTED' || agentVersion >= MIN_MEASURED_STORAGE_ASSURANCE_AGENT_VERSION. No migration, no new signed field, no new agent contract. The console then renders 'self-reported; not measured by this agent version' instead of a bare green claim — the honest statement of exactly what is known.

WHAT NOT TO DO: do not hide the field, suppress the row, or make the console omit a degraded endpoint. The correct outcome is a VISIBLE truthful OS_LOCAL_USER_READABLE that makes F16 discoverable from the console.

CONTRACT/MIRROR ANSWER (asked explicitly): this enum is NOT a shared-contracts type. I grepped all three mirrors — Backend/packages/shared-contracts, the workspace packages/shared-contracts, and Ceragon-Intelligence/packages/shared-contracts — for storageAssurance / OS_PROTECTED / ENTERPRISE_MANAGED and found ZERO hits. It lives in Backend src/crypto + src/agents and in Installers Go. So NO mirror-parity work is required. If an implementer chooses to promote it into @ceragon/shared-contracts, all THREE copies must land in the same change per the transitional-bridge rule — but that is optional scope and I recommend against bundling it with a security fix.

### Changes

**Backend** - `src/crypto/ai-trust-anchor-ack.ts`

Extend AI_TRUST_ANCHOR_STORAGE_ASSURANCES (:10-13) to ['OS_PROTECTED','ENTERPRISE_MANAGED','OS_SHARED_LOCAL_GROUP','OS_LOCAL_USER_READABLE','UNVERIFIED']. The membership check at :183-184 needs no edit — it reads the frozen array — but assert in review that it STILL throws on an unknown value; the widening must not become an any-string accept. Do not touch PAYLOAD_KEYS (:38-54) or the canonicalisation: the key set is unchanged, only the value domain.

**Backend** - `src/agents/dto/ai-trust-anchor-ack.dto.ts`

Widen @IsIn (:70), the union type (:71) and the @ApiProperty enum (:69) to the same five values. THIS IS THE GATE THAT 400s A TRUTHFUL AGENT — it must be deployed before any agent capable of emitting a new value.

**Backend** - `src/entities/agent.entity.ts`

Widen the aiTrustStorageAssurance union at :210-211 to the five values. Column stays varchar(24): the longest new value, 'OS_LOCAL_USER_READABLE', is 22 characters. No column alteration.

**Backend** - `src/migrations/<newtimestamp>-WidenAiTrustStorageAssurance.ts`

NEW migration. ALTER TABLE agents DROP CONSTRAINT ck_agents_ai_trust_storage_assurance, then re-ADD with the five-value IN list, mirroring the original at 1785300000000-AddAiTrustAnchorAttestation.ts:60-64. Provide a real down() that FIRST normalises any row carrying a new value to NULL and only then restores the two-value list, so the down cannot fail on live data. Register it the same way the existing one is (see src/migrations/m47-ai-security-migrations.live-pg.spec.ts:3,29).

**Backend** - `src/agents/ai-trust-anchor-ack.service.ts`

Line 236 keeps assigning VERBATIM — correct, and must NOT become a normalisation. Add one thing: when the accepted payload's storageAssurance is neither OS_PROTECTED nor ENTERPRISE_MANAGED, log at warn with orgId + endpointId + the reported level, so a degraded fleet is visible in ops without waiting for someone to open the console.

**Backend** - `src/agents/dto/agent-response.dto.ts`

Widen the @ApiProperty enum (:137) and the type (:138). ADD `aiTrustStorageAssuranceMeasured: boolean | null` — null when aiTrustStorageAssurance is null, otherwise the derived value described in the fix. Document it in the ApiProperty description as 'false = the endpoint asserted a protection its agent version does not measure'.

**Backend** - `src/agents/agents.controller.ts`

At :148, alongside the existing aiTrustStorageAssurance projection, emit the derived aiTrustStorageAssuranceMeasured computed from agent.aiTrustStorageAssurance and agent.aiTrustAgentVersion (already persisted at ai-trust-anchor-ack.service.ts:238). Export MIN_MEASURED_STORAGE_ASSURANCE_AGENT_VERSION from exactly one place so the cutover version is defined once. No change to the ack passthrough at :294.

**Installers** - `internal/winacl/machine_secret_windows.go`

Provide MeasureSecretAssurance — the same primitive F16 needs; implement ONCE. It must return UNVERIFIED, never a good value, on: open failure, SE_DACL_PROTECTED absent, NULL DACL, or any ACE that is not a non-inheriting ACCESS_ALLOWED (reuse the ACE walk at :365-380). Classify: any of BU/WD/AU/IU/BG/AN present -> OS_LOCAL_USER_READABLE; only SY+BA -> OS_PROTECTED; SY+BA plus a single non-administrative group -> OS_SHARED_LOCAL_GROUP.

**Installers** - `internal/winacl/machine_secret_other.go`

NEW, //go:build !windows. POSIX sibling: 0600 owner root -> OS_PROTECTED; 0640 owner root with a non-root group and no world bits -> OS_SHARED_LOCAL_GROUP; any world-readable bit -> OS_LOCAL_USER_READABLE; stat failure -> UNVERIFIED. Exists so Linux endpoints report a measured value instead of a constant, and so the claim means the same thing on both platforms.

**Installers** - `internal/core/config/ai_trust.go`

Add the new level constants next to AITrustStorageOSProtected (:17): AITrustStorageSharedLocalGroup, AITrustStorageLocalUserReadable, AITrustStorageUnverified (and AITrustStorageEnterpriseManaged if introduced). Add MeasureStorageAssurance() string returning the WEAKEST measured level across the endpoint-identity file and the credentials file, defaulting to Unverified on any error. Leave the redacting String()/GoString() on AIEndpointSigningIdentity (:33-37) untouched.

**Installers** - `internal/policybundle/trust_anchor_contract.go`

CreateSignedTrustAnchorAck (:277) gains an explicit REQUIRED `storageAssurance string` parameter; line 300 uses it instead of config.AITrustStorageOSProtected. Reject an empty or non-member value with an error rather than substituting a default — a caller that cannot measure must pass UNVERIFIED explicitly. The parameter must not be variadic or defaulted: the compile-time force IS the regression guard.

**Installers** - `internal/policybundle/trust_anchor_client.go`

trustCredentialFromBootstrap (:485-490) gains the same explicit parameter; line 488 uses it. The convergence caller at :324 and the ack construction at :341 both take the value from ONE config.MeasureStorageAssurance() call made once per convergence pass, so the local record and the signed ack can never disagree about what was measured at the same instant.

**Frontend** - `(additive) endpoint / agent trust-detail surface`

There is currently NO reference to aiTrustStorageAssurance anywhere in the Frontend worktree (verified by grep), so this is additive, not a correction. Where endpoint trust status is shown, render the level in the established honest voice: OS_LOCAL_USER_READABLE as an explicit negative ('the endpoint reports its credential store is readable by all local users'), UNVERIFIED as 'NOT MEASURED', and when aiTrustStorageAssuranceMeasured is false append 'self-reported; this agent version does not measure storage protection'. Never render null or UNVERIFIED as protected, and never omit a degraded endpoint from a list.

### Rejected alternatives

- Have the backend infer or override the value (e.g. force UNVERIFIED for old agents in the DB). REJECTED: storageAssurance is inside the Ed25519-signed payload and inside ackBodyDigest, which the endpoint validates back in ValidateTrustAnchorAckResponse (trust_anchor_contract.go:322-337). Rewriting it server-side breaks the binding and is itself a dishonesty — the server would store something the endpoint never signed. Derive the qualifier on the READ side instead.
- Drop the field or hide it in the console until F16 lands. REJECTED: it inverts the honesty discipline. Making an honest negative disappear is the exact failure mode this programme exists to eliminate; the negative is what makes F16 discoverable to an operator.
- Add a boolean `storageProtected` instead of widening the enum. REJECTED: a boolean cannot distinguish 'measured and group-readable' from 'measured and world-readable' from 'could not measure', and UNVERIFIED-vs-false is precisely the distinction the honesty discipline requires.
- Ship the agent measurement first and let the backend catch up. REJECTED and dangerous: four independent closed-set gates reject an unknown value, so every ack fails, no endpoint reaches ATTESTED_V2, and the fleet parks in V1_DEGRADED — the structural blocker already on the 2026-07-30 record.
- Widen the enum by relaxing the validator to accept any string. REJECTED: the strict membership check at crypto/ai-trust-anchor-ack.ts:183-184 is the thing that keeps an attacker-supplied payload field bounded; widening the domain must not weaken the check.

### Tests (each carries a defeat step)

- TEST Go MeasureSecretAssurance classifies a real Windows DACL table correctly (BU present, dedicated group present, SY+BA only, unprotected DACL, NULL DACL, open failure). DEFEAT: hardcode the function to return OS_PROTECTED — every non-protected row must fail. If any row still passes, that row is asserting on something other than the returned level.
- TEST Go — the SIGNED ack carries the MEASURED value (the direct regression pin for this finding): harden the identity file with HardenLocalReadWithPrincipal (the Users-read descriptor), build the ack, assert payload.storageAssurance == 'OS_LOCAL_USER_READABLE'. DEFEAT: restore config.AITrustStorageOSProtected at trust_anchor_contract.go:300 — the test MUST fail. This is the single assertion that would have caught F15 on 7.8.30, and it must be verified to fail against the pre-fix code before the fix is accepted.
- TEST Go — the assurance parameter is compile-time mandatory. DEFEAT: attempt to construct the ack without it; the package must NOT build. If it builds (default value, package var, variadic), reject the implementation — the entire structural point is that the value cannot be silently omitted, which is exactly how the constant survived.
- TEST Backend — the widened validator accepts the four legitimate values and STILL rejects an unknown one. DEFEAT: submit 'PLAINTEXT' (already exercised at src/crypto/ai-trust-anchor-ack.spec.ts:124-126) and confirm it still throws 'storageAssurance'. Run the same probe through the DTO layer too: @IsIn and the crypto validator are independent gates and BOTH must reject, or the widening has turned one of them into an any-string accept.
- TEST Backend live-pg — the CHECK constraint accepts the new values and still rejects PLAINTEXT. DEFEAT: run the same INSERT against the PRE-migration schema and confirm it FAILS there. A test that only passes post-migration proves nothing about which change was responsible; the pre-migration failure is what proves the migration is load-bearing. Also exercise down() on a table already containing a new value — it must succeed, not error on the constraint.
- TEST Backend — aiTrustStorageAssuranceMeasured is false for OS_PROTECTED from a pre-cutover agentVersion and true post-cutover. DEFEAT: set MIN_MEASURED_STORAGE_ASSURANCE_AGENT_VERSION to '0.0.0' and confirm the pre-cutover row flips to true and the test fails. Without this defeat the derived field could be a hardcoded constant and nobody would notice.
- TEST deploy-order regression — an OLD agent's ack (OS_PROTECTED, pre-cutover agentVersion) still succeeds end-to-end against the NEW backend. DEFEAT: remove 'OS_PROTECTED' from AI_TRUST_ANCHOR_STORAGE_ASSURANCES and confirm the test fails with a rejected ack. This is the assertion guaranteeing the backend-first deploy does not brick the installed fleet — the single most dangerous property of this change.
- TEST end-to-end honesty on the finding's own endpoint shape — with credentials hardened to the Users-read descriptor, drive a full convergence against a test backend and assert the persisted agent row reads OS_LOCAL_USER_READABLE and the agent response reports measured=true; then apply the F16 fix and assert it MOVES to OS_PROTECTED. DEFEAT: if the value does not move between the two states, the measurement is not wired to the file that actually changed and the test is passing on a fixture.

### Risks

DEPLOY ORDER IS THE RISK. Backend first, without exception. The value is validated by four independent closed-set gates (crypto validator, DTO @IsIn, entity type, DB CHECK). An agent emitting OS_LOCAL_USER_READABLE against the currently-deployed backend has its ack rejected on EVERY convergence pass, never reaches ATTESTED_V2, and parks in V1_DEGRADED — the exact structural blocker already on the 2026-07-30 acceptance-ledger record, reproduced fleet-wide. Gate the agent release on the backend deploy being confirmed via the Deploy-to-ECS JOB result, not the workflow run conclusion.

Signed payload and digest: storageAssurance participates in the JCS canonicalisation and therefore in ackBodyDigest. The backend re-derives the digest from the received payload, so there is no stored-digest mismatch for existing rows. I searched Installers parity-vectors/ and test/ for storageAssurance and found no fixtures, so nothing needs regenerating — but any NEW fixture pinning a digest must be generated after the parameter lands, not before.

Do not normalise server-side: rewriting the value breaks the ackBodyDigest binding the endpoint validates in the response (trust_anchor_contract.go:322-337), and is itself a dishonesty.

New agent against old backend: rejected, by design. If a backend rollback is ever needed, the down() migration must run BEFORE any agent rollback, and agents already reporting new values must be tolerated — which is why down() must NULL them rather than fail.

OPERATIONAL CONSEQUENCE THAT IS A FEATURE, NOT A BUG: the moment this ships, essentially the entire installed Windows fleet flips from OS_PROTECTED to OS_LOCAL_USER_READABLE (and, after F16b, to OS_SHARED_LOCAL_GROUP). That will look like a mass regression on any dashboard. It is not — it is the first true reading. Say so in the release note, or someone will 'fix' it by reverting the measurement.

Shared contracts: NONE required. Verified absent from all three mirrors.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED IN FULL — this is the best-evidenced spec in the cluster. Both agent writer sites are exactly where claimed: internal/core/config/ai_trust.go:17 (the constant), internal/policybundle/trust_anchor_client.go:488 and internal/policybundle/trust_anchor_contract.go:300 (both writing config.AITrustStorageOSProtected unconditionally). A module-wide grep for storageAssurance returns exactly six hits — the constant, the two struct fields (ai_trust.go:61, trust_anchor_contract.go:103), the two writers, and one test fixture (cmd/devoid/setup_installer_credpreserve_test.go:302). There is genuinely no measurement function. Backend: the frozen array at src/crypto/ai-trust-anchor-ack.ts:11-14, the throw at :183-184, the DTO @IsIn at src/agents/dto/ai-trust-anchor-ack.dto.ts:69-71, the entity union at src/entities/agent.entity.ts:210-211 (varchar 24 — 'OS_LOCAL_USER_READABLE' is 22, so no column change, as claimed), the CHECK at src/migrations/1785300000000-AddAiTrustAnchorAttestation.ts:60-64, the verbatim assign at src/agents/ai-trust-anchor-ack.service.ts:236, agentVersion persisted at :238, the projection at src/agents/agents.controller.ts:148 and the field-by-field passthrough at :294. The 'PLAINTEXT' probe exists at src/crypto/ai-trust-anchor-ack.spec.ts:120-126. The Frontend-absent and shared-contracts-absent claims are both correct: zero hits across Backend/packages/shared-contracts, the workspace copy, Ceragon-Intelligence/packages/shared-contracts and the whole Frontend worktree. The backend-first deploy argument is right and the four gates are real.
- BLOCKING — THE SPECIFIED down() MIGRATION WILL ABORT ON EXACTLY THE ROWS THAT MATTER. The spec says down() must 'FIRST normalise any row carrying a new value to NULL and only then restore the two-value list'. There is a FIFTH constraint the spec never mentions: ck_agents_ai_trust_attested_atomic (src/migrations/1785300000000-AddAiTrustAnchorAttestation.ts:31-44) requires, at line 39, `ai_trust_storage_assurance IS NOT NULL` whenever ai_trust_attestation_status = 'ATTESTED_V2'. Setting it NULL on an ATTESTED_V2 row violates that CHECK and the down() migration fails — on precisely the attested endpoints a rollback exists to protect. The spec's own risk section leans on this down() being safe ('agents already reporting new values must be tolerated — which is why down() must NULL them'), so the rollback story is currently broken.
- BLOCKING — THE SPEC'S OWN END-TO-END TEST CONTRADICTS ITS OWN MEASUREMENT DEFINITION. The fix says to measure 'the WEAKEST of ... the endpoint identity file ... and the credentials file holding the anchor — and take the minimum'. Test 8 then demands: '...then apply the F16 fix and assert it MOVES to OS_PROTECTED.' After F16 alone, credentials.json is still on MachineLocalReadSDDL (machine_secret_windows.go:68 via credentials_atomic_windows.go:71-73) — F16b is what moves it, and only to OS_SHARED_LOCAL_GROUP. So the minimum can NEVER reach OS_PROTECTED under this cluster's plan, and test 8 as written must fail forever. Either the measurement is scoped to the identity file (then it reaches OS_PROTECTED after F16) or the test's expected value is OS_SHARED_LOCAL_GROUP after F16b. Pick one and say which, in the spec, before an implementer discovers it as a red test.
- THE DERIVED aiTrustStorageAssuranceMeasured HAS TWO UNSPECIFIED CASES. (a) agentVersion is free text: it is varchar(64) (src/entities/agent.entity.ts:216-217) and validated only by SAFE_TOKEN_RE at src/crypto/ai-trust-anchor-ack.ts:186-189 — not semver. A version comparison over an unparseable token must be specified to return FALSE (the honest, conservative value), never true, and never throw inside the response mapper at agents.controller.ts:148. (b) The spec says 'null when aiTrustStorageAssurance is null' but no test in the list asserts that case; per honesty discipline a null assurance must not render as measured=false either, since false reads as 'we know it is self-reported' rather than 'we know nothing'.
- THE FRONTEND CHANGE ENTRY IS NOT IMPLEMENTATION-READY. path = '(additive) endpoint / agent trust-detail surface' names no file. I confirmed there is no existing render surface anywhere in the Frontend worktree. An implementer cannot open that. Either name a concrete file/route, or state plainly that this wave is API-only and the honest render is a separate named item — the latter is preferable, because inventing a new console surface inside a security fix is exactly the unrequested-detail pattern the standing guidance forbids.
- EFFORT. M (1-2d) is credible for the Backend half alone. It is not credible if the Go measurement primitive (two platforms) plus threading a required parameter through CreateSignedTrustAnchorAck (trust_anchor_contract.go:277) and trustCredentialFromBootstrap (trust_anchor_client.go:478) plus eight tests are in scope here. Mark it M-if-F16-delivers-MeasureSecretAssurance, L otherwise, and say which explicitly — the cross-cutting note assigns the primitive to F16, but the changes list re-declares it under F15.

**Corrected approach**: The plan is right; three repairs make it shippable.

1) REWRITE down(). Do not NULL the column in isolation. In a single statement, for rows whose ai_trust_storage_assurance is one of the three new values, set ai_trust_attestation_status = 'PENDING' AND ai_trust_storage_assurance = NULL together (PENDING is legal under ck_agents_ai_trust_status, migration :20-30, and the atomic constraint at :31-44 only binds ATTESTED_V2). THEN drop and re-add the two-value CHECK. Record the honest consequence in the migration comment: a backend rollback demotes measured-degraded endpoints to PENDING and they re-converge on the next daemon pass. Do NOT map new values onto 'OS_PROTECTED' to satisfy the constraint — that would write a false protection claim into the DB, which is the exact dishonesty this finding exists to remove.

2) SCOPE THE MEASUREMENT AND FIX TEST 8. Recommended: MeasureStorageAssurance() reports the weakest level across the files that hold SECRET material relevant to the trust claim, and after F16 that is the endpoint identity file alone (the anchor in credentials.json is public pin data — the spec itself argues this at length in F16). Under that scoping the value legitimately moves OS_LOCAL_USER_READABLE -> OS_PROTECTED when F16 lands, and F16b independently moves the SEPARATE bearer/token exposure, which F15 does not claim to cover. If instead you keep the minimum-including-credentials.json definition, then test 8's expectation must read OS_SHARED_LOCAL_GROUP after F16b and the fix text must say so. Either is defensible; ambiguity is not.

3) PIN THE DERIVED FIELD'S EDGES. MIN_MEASURED_STORAGE_ASSURANCE_AGENT_VERSION comparison must be total: unparseable or empty aiTrustAgentVersion -> measured = false; aiTrustStorageAssurance null -> measured = null. Add a test for each, each with the defeat step of hardcoding the opposite.

Everything else stands as written: verbatim storage at ai-trust-anchor-ack.service.ts:236 (do not normalise — the value is inside the JCS-canonicalised, Ed25519-signed payload and inside ackBodyDigest, which the endpoint re-checks at trust_anchor_contract.go:316-327); the compile-time-required parameter as the structural regression guard; backend-first deploy; no shared-contracts mirror work (verified absent from all three copies); the refusal to hide or prettify the negative.


**Missing changes the reviewer found**:

- **Backend** `src/migrations/<newtimestamp>-WidenAiTrustStorageAssurance.ts` - down() must not set ai_trust_storage_assurance = NULL on ATTESTED_V2 rows: ck_agents_ai_trust_attested_atomic (1785300000000-AddAiTrustAnchorAttestation.ts:31-44, line 39) requires it NOT NULL for that status, so the specified down() aborts. Demote status to 'PENDING' and NULL the column in the same UPDATE, then restore the two-value CHECK. Add a live-pg test that runs down() against a table containing an ATTESTED_V2 row carrying OS_LOCAL_USER_READABLE.
- **Backend** `src/agents/agents.controller.ts` - Specify the total behaviour of the aiTrustStorageAssuranceMeasured derivation at :148: aiTrustAgentVersion is varchar(64) free text validated only by SAFE_TOKEN_RE (src/crypto/ai-trust-anchor-ack.ts:186-189), so the version comparison must not throw and must yield false on any unparseable value; aiTrustStorageAssurance null must yield null, not false.
- **Backend** `src/agents/ai-trust-anchor-ack.service.spec.ts` - Existing fixtures pin OS_PROTECTED at :118 and :203. Add cases covering an ack carrying each new value end-to-end through the transaction (accepted, stored verbatim, warn logged) — the spec's test list covers the validator and the DB but not the service's own persistence of a degraded value.
- **Installers** `internal/policybundle/trust_anchor_client.go` - Resolve the ownership ambiguity: the cross-cutting note assigns MeasureSecretAssurance to F16 while F15's changes list re-declares it. Whichever spec owns it, the single per-convergence measurement must be taken once and passed to BOTH trustCredentialFromBootstrap (:478-490) and CreateSignedTrustAnchorAck (:341) so the local record and the signed ack cannot disagree — the spec states this intent but does not name the variable's lifetime relative to convergeTrustAnchorWithAPIClock.

**Collateral risk**: Low and well-bounded. No proven-working capability is touched: the widened value domain does not alter PAYLOAD_KEYS (src/crypto/ai-trust-anchor-ack.ts:40-55) or the JCS canonicalisation, so signed-bundle propagation, anti-rollback, command-lane blocking, DLP, browser masking, the package gate and MCP discovery are all unaffected. The one real hazard is the rollback path (down() as specified aborts) and the one perception hazard is the intended mass flip of the fleet from OS_PROTECTED to OS_LOCAL_USER_READABLE — which the spec correctly pre-empts as a feature. The honesty invariant is preserved and in fact restored: this is the fix that stops an honest negative from surfacing as positive.

**Effort correction**: M for the Backend-only half (widen four gates + migration + derived field + tests). L if the Go MeasureSecretAssurance primitive and the two required-parameter threadings are counted here rather than delivered by F16. State the split; do not leave the primitive owned by two specs.
