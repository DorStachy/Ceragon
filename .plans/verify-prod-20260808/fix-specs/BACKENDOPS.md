# Fix specs - cluster BACKENDOPS

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

THREE MECHANISMS EXPLAIN ALL NINE FINDINGS.

(1) SILENT-DEFAULT CONFIG NAME DRIFT — a config name resolves to a plausible WRONG value instead of failing. F12: the image already carries CF_BUILD_SHA (Dockerfile:4-7,20-23; build.yml:351) but three call sites read BUILD_SHA||GITHUB_SHA -> undefined. F37: `CERAGON_ENV || 'staging'` (verdict-alias-lookup.service.ts:72 AND all three shared-contracts mirrors) silently points prod at STAGING DynamoDB tables. F13: the Cera->Devoid rename half-landed because artifact names are hardcoded literals in the Backend instead of read from the signed manifest the pipeline already emits. F14: RELEASE_MANIFEST_PATH unset resolves to 'unset' and the loader never had a producer. Correct posture everywhere: fail loud, or derive from the signed artifact — never fall back to a guess.

(2) LIVENESS INFERRED FROM A CONFIG FACT, NEVER A DATA FACT — F9/F10/F11/F37 share this. The fullrepo lane's only consumer-liveness test is "is the queue URL configured" (scan-dispatch.service.ts:931). ECS reports rollout=COMPLETED/status=ACTIVE at desired=0 because desiredCount is a config fact. The GitHub lane cannot distinguish "no webhook arrived" from "producer broken" because github_webhook_deliveries is a 24h replay-dedup store (github-app.controller.ts:74,927-944), not a receipt ledger. Single fix pattern: derive liveness from newest row written / newest message consumed / newest cursor advance, and state absence honestly ("measured absence, not a pass") instead of rendering a config fact as health.

(3) THE INTELLIGENCE OPS LAYER IS DEAD CODE — MetricsService (Ceragon-Intelligence/src/operations/metrics.service.ts:139) has ZERO callers repo-wide; only alarms.ts and dashboards.ts import it, and they import the metric-NAME constants, never the class. buildAlarmDefinitions (operations/alarms.ts:34) has ZERO appliers — no script/workflow/IaC calls PutMetricAlarm. So the alarms that would have caught F9/F37 on day one were written, reviewed, merged, and never deployed. Notably alarms.ts:53 already sets treatMissingData:'breaching' on feed-lag — the design is RIGHT, it was simply never wired. F9/F10/F11/F37 therefore close together via one deliverable: emit the already-defined metrics + apply the already-defined alarms.

MAJOR CORRECTION TO THE F9 PREMISE (affects F9 and F37): the intelligence workers are NOT supposed to run on ECS. docs/customer-pack/control-statements.md AVL-5 states the Intel pipeline is replicated on Hetzner Cloud and "either side can be the active execution path"; Ceragon-Intelligence/deploy/hetzner/compose/intel-cluster.compose.yml:46,74 runs multi-follower and artifact-fetcher as docker compose services; ceragon-power-on.ps1:17-19 says verbatim that Intel ECS workers stay at desiredCount=0 "because the source of truth says Hetzner is the active Intel worker path". So ECS 0/0 is CORRECT AND EXPECTED, and the real, worse finding is that the ACTIVE (Hetzner) path is also not producing — proven by F37's empty alias/catalog tables — and no surface anywhere can see it, because every liveness surface is AWS-shaped and the active path is outside AWS.

TWO FINDINGS ARE SUBSTANTIALLY WRONG AS WRITTEN. F19 is 2/3 DISPROVEN (audit and delivery-log retention both default ENABLED and are actively deleting in prod right now; only threat-intel is inert). F37's "installs OVER-BLOCK" is DISPROVEN by the evidence file's own SC section (is-odd ALLOWED, lodash/event-stream correctly BLOCKED) — the precompute is a fast path only, and a miss falls through, it does not fail closed.

CONTRACT MIRRORS: only F37 touches shared contracts (package-intelligence/table-names.ts + s3-layout.ts). All three mirrors must change together — Backend/packages/shared-contracts, workspace packages/shared-contracts, Ceragon-Intelligence/packages/shared-contracts — plus the Backend's own fourth inlined copy at verdict-alias-lookup.service.ts:72-86. F14 reads release-manifest.ts but needs no field changes.

DEPLOY ORDER: none of these nine specs changes an agent-facing wire contract, so backend-first is satisfied trivially. F17 is the only one an agent touches, and it changes only which server-side id the server derives — the agent's request bytes are unchanged, so old and new agents both work.


---

## F13 - Windows EXE/MSI download broken: resolve installer artifact names from the signed release manifest instead of hardcoded Cera* literals

- **Severity**: MEDIUM
- **Side**: backend   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

CONFIRMED that the Backend still references CeraSetup.exe / CeraAgent.msi, but the recorded line numbers and the 'no try/catch' claim are both wrong, and the rename miss is broader than reported.

Re-derived in Backend@bded3919: the download allowlist is installer.service.ts:471-480 (`allowedFiles` contains 'CeraSetup.exe' at :478 and 'CeraAgent.msi' at :479), reached from installer.controller.ts:209 `@Get('download/:file')` -> streamInstallerScript. That is exactly the measured 400/404 inversion: DevoidSetup.exe fails the allowlist at :488 -> BadRequest 400; CeraSetup.exe passes the allowlist and then fails resolveInstallerReleaseKey -> NotFound 404.

DISPROVEN: 'resolveInstallerReleaseKey ... no try/catch'. resolveInstallerReleaseKey (:324-342) DOES try/catch each candidate (:327-339) and throws NotFoundException only after all candidates miss. The missing try/catch is at the CALL SITES: getSignedInstallerUrls:347 (windowsExe, unguarded -> the whole /installer/urls route 404s) and getInstallContract:388-389 (both exe and msi unguarded -> the whole /install-contract route 404s). getSignedInstallerUrls:352-357 does guard the MSI, which is why only the exe kills that route.

BROADER THAN REPORTED — three more stale `cera*` binary names the writeup missed, all in the same file: :152 `releases/${version}/windows/${arch}/cera.exe`, :184 `cera-daemon.exe`, :247 `cera-prompt-guard-host${ext}`. The pipeline emits `devoid.exe`, `devoid-daemon.exe`, `devoid-prompt-guard-host.exe` (Installers/.github/workflows/release.yml:801-802, 806-807, 821-822; uploaded at :1614-1615, :1620-1621, :1633-1634). These three are FALLBACK paths behind manifest entries, so they are latent rather than live-broken today — but they are the same defect and will fire the first time a manifest entry is absent.

WHY THE RENAME COULD HALF-LAND, AND THE SINGLE SOURCE OF TRUTH THAT ALREADY EXISTS: the release pipeline ALREADY publishes the authoritative Windows installer keys inside the Ed25519-signed manifest — release.yml:1496-1508 writes `manifest.windowsInstallerArtifacts = {'windows-amd64-msi': {key:'releases/<v>/windows/DevoidAgent.msi', sha256, authenticodeSigned}, 'windows-amd64-setup': {key:'releases/<v>/windows/DevoidSetup.exe', ...}}`, and the Backend already fetches and signature-verifies that same manifest (installer.service.ts:588-594 getManifest -> verifyManifestSignatureIfConfigured:628-660). The Backend's `Manifest` type (:41-53) simply does not declare `windowsInstallerArtifacts`, so the one field that would have made the rename impossible to miss is invisible to the consumer. That is the actual root cause of the class: artifact naming is duplicated as string literals in the consumer instead of read from the signed producer output.

getLinuxRepos (:411-455) is a separate, simpler instance: cdnBase is the hardcoded literal 'https://get.cera.io' at :422, used for gpgKeyUrl (:426) and all five directDownloads (:448-452), against a host the live check found does not resolve. The pipeline publishes repos to s3://installers-prod/repos/ and packages to s3://installers-prod/packages/{VERSION}/ (release.yml:96-105 layout block), i.e. the same public bucket the working install.ps1 path already uses.

### Evidence (read at origin/main)

- `Backend/src/installer/installer.service.ts:471-480 (allowedFiles: 'CeraSetup.exe' :478, 'CeraAgent.msi' :479)`
- `Backend/src/installer/installer.service.ts:486-492 (allowlist miss -> BadRequestException = the observed 400)`
- `Backend/src/installer/installer.service.ts:324-342 (resolveInstallerReleaseKey DOES try/catch per candidate — disproves the 'no try/catch' hypothesis)`
- `Backend/src/installer/installer.service.ts:347 (getSignedInstallerUrls windowsExe, unguarded)`
- `Backend/src/installer/installer.service.ts:388-389 (getInstallContract exe+msi, both unguarded)`
- `Backend/src/installer/installer.service.ts:41-53 (Manifest type lacks windowsInstallerArtifacts)`
- `Backend/src/installer/installer.service.ts:152,184,247 (stale cera.exe / cera-daemon.exe / cera-prompt-guard-host)`
- `Backend/src/installer/installer.service.ts:411-455 (getLinuxRepos, cdnBase='https://get.cera.io' at :422)`
- `Backend/src/installer/installer.controller.ts:209 (@Get('download/:file'))`
- `Installers/.github/workflows/release.yml:1496-1508 (windowsInstallerArtifacts written into the signed manifest)`
- `Installers/.github/workflows/release.yml:1887-1892 (upload to releases/<v>/windows/DevoidSetup.exe and the flat releases/<v>/ fallback)`
- `Installers/.github/workflows/release.yml:801-802,806-807,821-822 (devoid.exe / devoid-daemon.exe / devoid-prompt-guard-host.exe manifest keys)`

### Fix

ONE mechanism change, not N string edits: make the SIGNED MANIFEST the single source of truth for artifact keys, and make the transition dual-name so neither old nor new callers break.

(a) Declare the field that already exists on the wire. Add `windowsInstallerArtifacts?: Record<string, DaemonArtifact>` to the `Manifest` type (:41-53). DaemonArtifact already has exactly {key, sha256, authenticodeSigned?}, which matches what release.yml:1496-1508 emits — no new type needed.

(b) New private `resolveWindowsInstallerKey(version, kind: 'setup'|'msi'): Promise<string>`. Order: (1) manifest.windowsInstallerArtifacts['windows-amd64-setup'|'windows-amd64-msi'].key — authoritative, signature-verified; (2) fall back to resolveInstallerReleaseKey over an ORDERED candidate name list ['DevoidSetup.exe','CeraSetup.exe'] / ['DevoidAgent.msi','CeraAgent.msi'] so a manifest predating windowsInstallerArtifacts still resolves. Extend getInstallerReleaseKeyCandidates (:312-322) to take the name list; its existing two-prefix probe (releases/<v>/windows/<file> then releases/<v>/<file>) already matches both upload locations at release.yml:1887-1892.

(c) Allowlist BOTH names. installer.service.ts:471-480 gains 'DevoidSetup.exe' and 'DevoidAgent.msi' alongside the Cera names; the Cera entries stay for the transition and map onto the same resolver. Broaden allowedPatterns (:482-484) to `(cera|devoid)-agent` so Linux package names survive the same rename.

(d) Make the two unguarded call sites degrade instead of 404ing the whole route. getSignedInstallerUrls:347 and getInstallContract:388-389 must wrap per-artifact resolution the way :352-357 already does for the MSI, and OMIT the field when the artifact genuinely is not published — never fabricate a URL. Honesty discipline: if neither name resolves, the response must say the Windows bundle is not published for this version, not return a key that will 404 at download time.

(e) Retire the other three stale literals in the same pass: :152 cera.exe -> devoid.exe, :184 cera-daemon.exe -> devoid-daemon.exe, :247 cera-prompt-guard-host -> devoid-prompt-guard-host. Each is a fallback behind a manifest entry, so make each try the devoid name then the cera name.

(f) getLinuxRepos: replace the get.cera.io literal with a resolved public installers-prod origin (same origin the working install.ps1 path uses), sourced from config with the S3 public URL as the default, and rename the cera-agent package strings to match what build-packages actually emits.

WHY NOT a rename-everything sed: because that is exactly what produced this defect. (b)+(c) mean the NEXT rename cannot half-land — the consumer stops carrying its own copy of the name.

### Changes

**Backend** - `src/installer/installer.service.ts`

Add `windowsInstallerArtifacts?: Record<string, DaemonArtifact>` to the Manifest type (:41-53). Add private resolveWindowsInstallerKey(version, kind) that prefers manifest.windowsInstallerArtifacts['windows-amd64-setup'|'windows-amd64-msi'].key then falls back to an ordered candidate list. Change getInstallerReleaseKeyCandidates (:312-322) and resolveInstallerReleaseKey (:324-342) to accept string[] of candidate filenames. Add 'DevoidSetup.exe' and 'DevoidAgent.msi' to allowedFiles (:471-480) and broaden allowedPatterns (:482-484) to (cera|devoid)-agent. Route getSignedInstallerUrls:347 and getInstallContract:388-389 through resolveWindowsInstallerKey and guard both so a missing artifact omits the field instead of throwing. Replace 'cera.exe' (:152), 'cera-daemon.exe' (:184), 'cera-prompt-guard-host' (:247) with devoid-first / cera-fallback resolution. Replace cdnBase 'https://get.cera.io' (:422) with a config-resolved public installers origin and update the cera-agent package name strings (:429-452).

**Backend** - `src/installer/installer.service.spec.ts`

Add cases: manifest-driven key resolution wins over the static list; Devoid name resolves when the manifest lacks windowsInstallerArtifacts; Cera name still resolves (transition); a version with neither name omits windowsExe/windowsMsi rather than throwing; getInstallContract still returns 200 with the msi field absent.

**Backend** - `src/installer/installer.controller.spec.ts`

Pin that GET download/DevoidSetup.exe and download/DevoidAgent.msi are allowlisted (no 400) and that an unknown filename still 400s.

### Tests (each carries a defeat step)

- Allowlist parity test: assert allowedFiles contains both DevoidSetup.exe and CeraSetup.exe (and both MSI names). DEFEAT STEP: delete 'DevoidSetup.exe' from allowedFiles — the test must fail. If it still passes, the assertion is reading a stale constant, not the live array streamInstallerScript uses.
- Manifest-precedence test: stub getManifest to return windowsInstallerArtifacts['windows-amd64-setup'].key='releases/9.9.9/windows/FROM-MANIFEST.exe' AND make HeadObject succeed for the static Devoid candidate too; assert the resolved key is FROM-MANIFEST.exe. DEFEAT STEP: remove windowsInstallerArtifacts from the stub — the test must now resolve the static Devoid name, proving the first assertion actually exercised the manifest branch and was not passing because both branches happen to agree.
- Route-degradation test: make HeadObject reject for every MSI candidate and assert getInstallContract still resolves (200-shaped) with windows.msi absent, and that getSignedInstallerUrls still returns windows/unix. DEFEAT STEP: restore the exe-only guard removal (re-introduce the unguarded await at :388) — the test must fail with NotFoundException, proving it is testing the guard and not a mock that never rejects.
- Cross-repo naming contract test: parse Installers/.github/workflows/release.yml, extract every `releases/{version}/...` artifact basename the pipeline uploads, and assert each is resolvable by the Backend's candidate lists. DEFEAT STEP: rename DevoidSetup.exe to Devoid2Setup.exe in a fixture copy of release.yml — the test must fail. This is the pin that makes a future half-landed rename impossible.
- Live post-deploy check (not a unit test, record the output): GET /download/DevoidSetup.exe -> 200 with content-type application/vnd.microsoft.portable-executable, GET /download/CeraSetup.exe -> 200 (transition alias), GET /download/NotAThing.exe -> 400. DEFEAT STEP: the 400 case must stay 400 — if the allowlist broadening accidentally admits arbitrary filenames, this catches it.

### Risks

LOW blast radius; the only real risks are (i) broadening allowedPatterns to (cera|devoid)-agent slightly widens what the public /download proxy will attempt to stream — it must stay anchored (^...$) and stay restricted to the installers-prod prefix, or it becomes a path-traversal surface on a PUBLIC route; (ii) omitting windowsMsi/windowsExe instead of throwing changes the shape the Frontend onboarding UI consumes — check the consumer treats the field as optional (it already must, since :352-357 already omits the MSI on miss); (iii) the get.cera.io -> installers-prod origin change alters URLs shown in onboarding copy, so any customer doc quoting get.cera.io goes stale. No agent-facing wire change: old agents use install.ps1, which was never broken.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED — I opened every line. installer.service.ts:471-480 (allowedFiles with 'CeraSetup.exe' :478, 'CeraAgent.msi' :479), :486-492 (BadRequest = the observed 400), :312-322 / :324-342 (resolveInstallerReleaseKey DOES try/catch per candidate — the writeup's 'no try/catch' is correctly disproven), :347 and :388-389 unguarded, :352-357 MSI guarded, :41-53 Manifest type lacks windowsInstallerArtifacts, :152/:184/:247 stale cera.exe / cera-daemon.exe / cera-prompt-guard-host, :411-455 getLinuxRepos with cdnBase 'https://get.cera.io' at :422, controller :209. Installers release.yml:1496-1511 emits windowsInstallerArtifacts, :1887-1892 uploads both locations, :801-822 the devoid.exe/devoid-daemon.exe/devoid-prompt-guard-host keys. The root cause is sound.
- FALSE PREMISE THAT UNDERPINS FIX (a)/(b): the manifest is NOT 'authoritative, signature-verified' today. installer.service.ts:643 computes `JSON.stringify(unsignedManifest, null, 2)` as the signed body, while the producer signs `json.dumps(manifest, sort_keys=True, separators=(",",":"), ensure_ascii=True)` (Installers/.github/workflows/release.yml:966-979, and again at :1524). The pipeline's own comment at release.yml:969-974 names the pretty-printed scheme as the OLD broken contract that 'no shell/Go verifier could reproduce'. So either app.s3InstallerBinaries.manifestPublicKeyEd25519 is unset (verifyManifestSignatureIfConfigured returns at :629 and verification is a NO-OP) or every getManifest() throws InternalServerError. Promoting the manifest to source-of-truth for artifact keys without fixing :643 replaces one silent-trust defect with another.
- BUCKET TRAP the implementer will hit: getManifest -> fetchText reads this.binariesBucket (installer-binaries-prod, :614), but windowsInstallerArtifacts keys point at installers-prod (release.yml:1497,:1502). Both manifest copies exist (release.yml:1651 private, :1660 public, byte-compared at :2576), so the read works — but the resolved key must be presigned against this.installersBucket (the pattern at :354/:361), NOT via getPresignedUrl (:263), which defaults to binariesBucket. Getting this wrong yields presigned URLs against the wrong bucket and a 403 at download.
- THE CROSS-REPO CONTRACT TEST CANNOT RUN AS WRITTEN. Installers is a separate repo; Backend CI has no checkout of it, so 'parse Installers/.github/workflows/release.yml' is not executable in the Backend suite. Committing a fixture copy pins nothing — the fixture goes stale exactly when the real workflow changes, which is the same duplicated-name defect one layer up. Replace with (i) the post-deploy live check already listed, and (ii) an assertion inside Installers' own release job, which already has the machinery at release.yml:2497-2513 mapping manifest keys to buckets.
- RISK (ii) IS WRONG ON THE FACTS. The spec says the Frontend 'already must' treat the field as optional because :352-357 omits the MSI. Frontend/app/api/installer/urls/route.ts:6-11 types `windowsExe: string` REQUIRED and `windowsMsi?: string` optional. Omitting windowsExe is a declared-contract change on the Frontend side.

**Corrected approach**: Keep the manifest-as-source-of-truth mechanism, but land it with three corrections. (1) Fix installer.service.ts:643 FIRST: canonicalise as sorted-key compact JSON (the release.yml:969-979 contract) before verifying, and add a fixture test that verifies a real pipeline-signed manifest — otherwise the 'signature-verified' claim in the fix text is fiction. (2) Presign resolved windowsInstallerArtifacts keys against installersBucket explicitly (mirror :354), never via getPresignedUrl. (3) Drop the cross-repo yml-parsing unit test; move that pin into the Installers release job and keep the post-deploy live check (GET /download/DevoidSetup.exe -> 200, /download/CeraSetup.exe -> 200, /download/NotAThing.exe -> 400) as the real gate. Everything else in the spec — dual-name allowlist, ordered candidate list, per-artifact guards at :347 and :388-389, retiring :152/:184/:247, config-resolved Linux origin — is correct and should ship as written.


**Missing changes the reviewer found**:

- **Backend** `src/installer/installer.service.ts` - Line 643: replace `JSON.stringify(unsignedManifest, null, 2)` with a sorted-key compact canonicalisation (recursive key-sort + JSON.stringify with no spacing) so the Backend verifies the same bytes the pipeline signs at release.yml:969-979. Without this, the 'signature-verified manifest' the fix relies on is either unverified or fatal.
- **Frontend** `app/api/installer/urls/route.ts` - Line 8: change `windowsExe: string` to `windowsExe?: string` to match the Backend omitting the field when no Windows setup artifact is published for the version.
- **Frontend** `app/admin/install/install-content.tsx` - Line 96 already hardcodes `${origin}/api/installer/download/DevoidAgent.msi` — this is the live 400 the finding measured. No edit needed once the Backend allowlists the Devoid names, but the implementer must know the console button is already on the new name, so the Backend change alone closes the customer-visible path. Verify the rendered button at :283 after deploy.
- **Backend** `src/installer/installer.service.spec.ts` - Add a manifest-signature fixture case using a real sorted-compact-signed manifest body, with the defeat step being that a pretty-printed-signed fixture must FAIL verification.

**Collateral risk**: Low. Broadening allowedPatterns to (cera|devoid)-agent must keep the ^...$ anchors already present at :482-484 — the route is public and unauthenticated (controller:209). No PROVEN-WORKING capability is touched: the supply-chain package gate, command-lane blocking, DLP, browser masking, Codex wire blocking and signed-bundle propagation are all unrelated to this file. No agent-facing wire change; install.ps1 (the working path) is untouched.

**Effort correction**: M holds ONLY if the cross-repo yml test is descoped and the canonicalisation fix at :643 is treated as part of the same change. With both, M-to-L (2-3d).


---

## F17 - AI-context ingest keys rows on the fleet-shared API-key id because it reads a RequestUser field that does not exist

- **Severity**: MEDIUM
- **Side**: backend   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

CONFIRMED as a defect, but the stated mechanism is wrong in a way that changes the fix.

ai-context.controller.ts:65 reads `const endpointId = agentId ?? apiKeyId;` — the code ALREADY tries to prefer a real agent id. The bug is that `agentId` is never populated: the destructure at :51-56 casts req.user to an inline shape declaring `agentId?: string`, but the real `RequestUser` type (Backend/src/auth/types/auth.types.ts) has NO agentId member. The inline cast invents the field, TypeScript cannot object, and the `??` left operand is therefore ALWAYS undefined. So the fallback is not a fallback — it is the only branch that ever executes. This is why the comment at :61-64 reads as if identity were being handled correctly while the write is unconditionally keyed on the api-key id.

WHERE THE REAL ENDPOINT ID IS AVAILABLE ON THAT EXACT REQUEST: CliSignatureGuard sets `request.requestSigningVerifiedAgentId` from the signed `x-cera-cli-agent-id` header after a v2 signature verifies (cli-signature.guard.ts:167-171, and :127-131 on the shadow path), and it also attaches the already-read agents row as `request.requestSigningVerifiedAgent` {id, orgId, siteId, hostname} (auth.types.ts:104-119). AuthApiMember (common/decorators/auth-api-member.decorator.ts:14) runs CliSignatureGuard on this very route, so the value is present by the time the handler runs. Every other agent-ingest controller in the codebase already reads it — ai-ingest.controller.ts:134,182; ai-agent.controller.ts:156; ai-prompt-evidence-upload.controller.ts:88; endpoint-control-authority.controller.ts:606,642; ai-delegated-approval.controller.ts:217-219. AiContextController is the single outlier.

WHY THE MIGRATION CANNOT BE A REMAP (the writeup asks for one; it is not possible): (i) cli_agent keys are fleet/site-shared, so one api-key id genuinely represents N machines whose reports were folded into one row — the demultiplexing information was never persisted, so any remap would be a fabrication; (ii) ai_context_findings.fingerprint is derived FROM endpointId (ai-context.service.ts:162-163, `[endpointId, kind, class, path, redacted].join('\x00')`) under a UNIQUE index (ai-context-finding.entity.ts:37), so rewriting endpoint_id without recomputing fingerprint leaves rows whose identity no longer matches what a corrected agent will compute — producing permanent duplicates rather than updates; (iii) ai_context_coverage is uniquely keyed (orgId, endpointId, reportingUser) (ai-context-coverage.entity.ts:36-38), so remapping several api-key-keyed rows onto one real endpoint id would collide.

Second-order confirmation that the collapse is real: the coverage entity's own doc comment at :21-33 says the endpoint id is 'derived from the machine's API key' — the defect is documented in the schema as if it were the design.

### Evidence (read at origin/main)

- `Backend/src/ai-context/ai-context.controller.ts:51-56 (inline cast invents agentId)`
- `Backend/src/ai-context/ai-context.controller.ts:65 (`const endpointId = agentId ?? apiKeyId;` — left operand always undefined)`
- `Backend/src/auth/types/auth.types.ts (RequestUser has no agentId member; grep for 'agentId' in that file returns nothing)`
- `Backend/src/auth/guards/cli-signature.guard.ts:167-171 and :127-131 (sets request.requestSigningVerifiedAgentId)`
- `Backend/src/auth/types/auth.types.ts:104-119 (AuthenticatedRequest.requestSigningVerifiedAgentId + requestSigningVerifiedAgent{id,orgId,siteId,hostname})`
- `Backend/src/common/decorators/auth-api-member.decorator.ts:14 (AuthApiMember runs CliSignatureGuard on this route)`
- `Backend/src/ai-governance/controllers/ai-ingest.controller.ts:134,182 (the established pattern this controller diverges from)`
- `Backend/src/ai-context/ai-context.service.ts:162-163 (fingerprint derives from endpointId)`
- `Backend/src/entities/ai-context-finding.entity.ts:37 (unique index on fingerprint)`
- `Backend/src/entities/ai-context-coverage.entity.ts:21-33,36-38 (doc admits key-derived id; unique on org+endpoint+reportingUser)`
- `Backend/src/ai-context/ai-context.controller.ts:120-131 (console read GET endpoints/:endpointId, keyed on the real endpoint id — never matches)`

### Fix

(a) Read the verified identity, and make the wrong one unreachable. In ai-context.controller.ts ingest, replace the :51-56 inline-cast destructure and :65 with `const endpointId = req.requestSigningVerifiedAgentId;` and reject when absent: `if (!endpointId) throw new UnauthorizedException('Device-verified endpoint identity required');`. Delete `agentId` from the inline cast entirely so the phantom field cannot be reintroduced. Preserving the security property the existing comment claims: the id still comes from the signed request, never from the body — it is now a signature-bound device id rather than a fleet-shared key id, i.e. strictly stronger.

OLD-AGENT TOLERANCE — this is the one judgement call. requestSigningVerifiedAgentId is only set for v2-signed requests. A pre-v2 agent posting AI-context findings would now 401 instead of writing a mis-keyed row. That is the correct trade: a mis-keyed row is not a degraded write, it is a wrong one that also corrupts other machines' rows via the shared key. Prefer siteId+hostname enrichment ONLY as metadata, never as the key. If telemetry shows pre-v2 agents still posting, the fallback must be an explicit sentinel (`unattributed:<apiKeyId>`) that the console renders as 'endpoint not device-verified' — an honest negative, never a silent collapse into a plausible-looking machine row.

(b) Use the free identity the guard already read. requestSigningVerifiedAgent carries siteId and hostname; prefer those over dto.hostname (ai-context.service.ts:210) so hostname is server-attested rather than client-asserted.

(c) MIGRATION = QUARANTINE, NOT REMAP. A TypeORM migration that DELETEs ai_context_coverage and ai_context_findings rows whose endpoint_id matches an existing api_keys.id (`DELETE ... WHERE endpoint_id IN (SELECT id::text FROM api_keys)`). Justification for delete over remap: coverage is overwritten every sweep by design (entity doc :18-19), and findings are re-reported every sweep with firstSeenAt/lastSeenAt reconstructed, so a corrected agent repopulates BOTH tables correctly within one sweep interval. Deleting rows that assert a machine-level posture nobody measured is the honest action; keeping them means the console keeps showing one fabricated machine. The migration must log the deleted count so the operation is auditable, and must NOT touch rows whose endpoint_id is already a real agents.id (a fleet part-way through rollout).

(d) Add the regression pin that would have caught this: a compile-time assertion that the ingest handler's endpoint id is typed from AuthenticatedRequest, not from an inline cast of req.user.

### Changes

**Backend** - `src/ai-context/ai-context.controller.ts`

In ingest (:50-69): drop `agentId` from the inline req.user cast at :51-56; replace :65 with `const endpointId = req.requestSigningVerifiedAgentId;` plus an UnauthorizedException when it is absent; pass req.requestSigningVerifiedAgent?.siteId ?? siteId as the site and forward req.requestSigningVerifiedAgent?.hostname to the service so server-attested hostname wins over dto.hostname.

**Backend** - `src/ai-context/ai-context.service.ts`

ingest(): accept an optional verifiedHostname and prefer it over dto.hostname at the finding create (:210) and in upsertCoverage (:256-304). No fingerprint change — fingerprint keeps deriving from endpointId (:162-163), which is now the correct id.

**Backend** - `src/migrations/<ts>-QuarantineApiKeyKeyedAiContextRows.ts`

New migration. DELETE FROM ai_context_findings WHERE endpoint_id IN (SELECT id::text FROM api_keys); DELETE FROM ai_context_coverage WHERE endpoint_id IN (SELECT id::text FROM api_keys). Capture and log affected counts. down(): irreversible — document that the rows are re-derivable from the next agent sweep and MUST NOT be reconstructed, since the per-machine attribution they claimed never existed.

**Backend** - `src/ai-context/ai-context.ingest.live-pg.spec.ts`

Add live-pg cases pinning that a v2-signed ingest writes endpoint_id = the agents.id from the signed header (not the api-key id), and that two DIFFERENT signed endpoint ids sharing ONE api key produce TWO coverage rows and two distinct fingerprints.

### Tests (each carries a defeat step)

- Identity test: POST /api/v1/ai-context/findings with requestSigningVerifiedAgentId='AGENT-UUID' and req.user.apiKeyId='KEY-UUID'; assert the persisted endpoint_id === 'AGENT-UUID'. DEFEAT STEP: set requestSigningVerifiedAgentId to the SAME value as apiKeyId and confirm the test can no longer distinguish the branches — this proves the two ids must be different in the fixture, and that a test using one id would have passed against the buggy code.
- Fleet-sharing test (the finding's actual harm): two ingests with the SAME apiKeyId but requestSigningVerifiedAgentId = A then B, identical findings payload; assert TWO ai_context_coverage rows and TWO distinct fingerprints. DEFEAT STEP: revert controller:65 to `agentId ?? apiKeyId` — the test must fail with one coverage row and one fingerprint, reproducing the production collapse exactly.
- Console round-trip test: after a signed ingest as agent A, GET /ai-context/endpoints/A returns the findings and coverage. DEFEAT STEP: query GET /ai-context/endpoints/<apiKeyId> and assert it returns EMPTY — if it returns data, the fix did not move the key and the read path is matching the old row.
- Migration test on live-pg: seed one coverage row + one finding keyed on an api_keys.id and one keyed on a real agents.id; run the migration; assert the api-key-keyed rows are gone and the agent-keyed rows are untouched. DEFEAT STEP: change the seeded api-key-keyed row's endpoint_id to a random uuid not present in api_keys — the migration must now leave it alone, proving the WHERE clause is selective and not a table wipe.
- Type-drift pin: a compile/lint assertion that ai-context.controller.ts contains no inline cast of req.user declaring agentId. DEFEAT STEP: re-add `agentId?: string` to the cast — the check must fail. Without this, the exact defect reappears the next time someone needs an id in a hurry.

### Risks

(1) Pre-v2 / unsigned agents lose the ability to write AI-context findings (401 instead of a mis-keyed 200). Measure the signed-request share on this route before shipping; if non-trivial, ship the explicit `unattributed:<apiKeyId>` sentinel described in the fix rather than widening back to apiKeyId. (2) The migration DELETES production rows — it is irreversible by design and must be reviewed as a data-loss change, not a schema change; the mitigating fact is that both tables are sweep-repopulated. (3) Console counters that were summing the collapsed row will drop and then recover as endpoints re-sweep; the transient dip is real and must not be masked. (4) Backend-first ordering is satisfied trivially — the agent's request bytes are unchanged, so no agent release is coupled to this.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED. ai-context.controller.ts:51-56 does cast req.user to an inline shape declaring `agentId?: string`; :65 is `const endpointId = agentId ?? apiKeyId;`. auth.types.ts contains NO `agentId` member on RequestUser (only `requestSigningVerifiedAgentId?` at :106 and `requestSigningVerifiedAgent?` at :114-119 on AuthenticatedRequest). cli-signature.guard.ts sets requestSigningVerifiedAgentId at :129 (shadow) and :169 (enforce), and attaches the agent row at :228. auth-api-member.decorator.ts:14 runs CliSignatureGuard. ai-context.service.ts:162-163 derives the fingerprint from endpointId; ai-context-finding.entity.ts:37 is the unique fingerprint index; ai-context-coverage.entity.ts:36-38 is the (org, endpoint, reportingUser) unique index and :21-33 does admit the id is key-derived. endpoint_id is `type: 'text'` in both entities, so `id::text` in the migration is type-correct. The mechanism is right and the migration-not-remap argument is right.
- DEPLOY-ORDER BREAK — the 401 is not old-agent safe and the spec treats it as a judgement call when it is a hard blocker. CliSignatureGuard is SHADOW BY DEFAULT: the decorator's own comment at auth-api-member.decorator.ts:11-13 says 'Shadow by default (verify-and-log); fail-closed only when CLI_REQUIRE_SIGNED_REQUESTS=true', and the guard body at :110 is labelled 'SHADOW — observe only'. On the agent side Installers/internal/core/backend/request_signer.go:147-152 returns cliAuthVersionV1 whenever credentials.AuthVersion is empty. requestSigningVerifiedAgentId is populated ONLY for authVersion==='2' (guard :127-131 and :167-171). Backend ships FIRST, so on deploy day every pre-v2 endpoint in the installed fleet gets 401 on POST /api/v1/ai-context/findings. The spec's own cited precedent does NOT do this: ai-ingest.controller.ts:134 and :182 pass `verifiedAgentId: req.requestSigningVerifiedAgentId` as an optional field and never reject.
- SEQUENCING GAP — this lane is currently returning 400 on EVERY batch. FINDINGS.md F25 records three sweeps (85/48/25 items, postedSoFar=0) rejected with 'findings.N.redactedContext must be shorter than or equal to 4096 characters'. So today nothing reaches the table at all. The migration deletes the historical api-key-keyed rows on the promise that 'a corrected agent repopulates BOTH tables within one sweep interval' — that promise is FALSE until the redactedContext clamp lands. As written this spec produces an EMPTY console section, which is a worse honesty outcome than a collapsed one.
- MIGRATION HAZARD — `DELETE FROM ai_context_findings WHERE endpoint_id IN (SELECT id::text FROM api_keys)` is a single unbounded DELETE on the findings table. F19 in this same cluster argues (correctly) that an unbounded first-sweep DELETE is a lock-duration hazard. Apply the same bounded batched id-subselect here.
- HOSTNAME NULL-OVERWRITE — auth.types.ts:118 types `hostname: string | null`. Fix (b) says 'prefer those over dto.hostname'; an unconditional preference writes NULL over a hostname the agent did supply. Must be `verifiedHostname ?? dto.hostname`.

**Corrected approach**: Ship the identity fix WITHOUT the 401. In ai-context.controller.ts ingest: delete `agentId` from the :51-56 inline cast (kills the phantom field permanently) and replace :65 with `const endpointId = req.requestSigningVerifiedAgentId ?? `unattributed:${apiKeyId}`;`. The sentinel is unconditional, not telemetry-gated — it is an honest negative the console renders as 'endpoint not device-verified', which satisfies the honesty invariant and cannot 401 an old agent. This also makes the read path self-correcting: an unattributed row can never be mistaken for a machine. Then: (1) sequence behind or alongside the F25 redactedContext clamp so the tables actually repopulate; (2) make the quarantine migration a bounded batched DELETE and extend its WHERE to also drop `unattributed:%` rows only if they are older than one sweep interval — do not delete fresh honest-negative rows; (3) hostname preference must be `verifiedHostname ?? dto.hostname`. Keep everything else: the fingerprint stays derived from endpointId (service:162-163), the compile-time pin against re-adding an inline `agentId` cast, and the live-pg two-agents-one-key test.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/dto (AiContextIngestDto redactedContext bound) or the agent-side clamp` - F25 dependency: the 4096-char redactedContext validator rejects the WHOLE batch (class-validator on a nested DTO array). Either clamp server-side per-item and reject the item not the batch, or this fix delivers an empty table. Must be sequenced with F17 or the migration deletes data that nothing repopulates.
- **Backend** `src/migrations/<ts>-QuarantineApiKeyKeyedAiContextRows.ts` - Bounded batched DELETE (id-subselect loop, mirroring audit-retention.service.ts:164-188) rather than a single unbounded statement on ai_context_findings; log per-batch and total counts.
- **Frontend** `the AI-context endpoint/coverage surface` - Render `unattributed:<apiKeyId>` endpoint ids as an explicit 'endpoint not device-verified' state rather than as a machine row — otherwise the sentinel becomes the same fabrication the fix is removing.

**Collateral risk**: With the 401 as specified: HIGH — it silently disables AI-context reporting for every pre-v2 endpoint the moment the backend deploys, and there is no agent release that can precede it. With the sentinel: LOW. No PROVEN-WORKING capability is touched — this route is unrelated to command-lane blocking, DLP, browser masking, Codex wire blocking, signed-bundle propagation, the supply-chain gate, or MCP discovery. Request bytes are unchanged either way, so no agent release is coupled.

**Effort correction**: M is credible for the corrected scope (controller + service + bounded migration + live-pg tests), but only if the F25 clamp is counted separately.


---

## F14 - Release manifest is inert because the v1 assembler has zero callers and the loader cannot read the one place the document could live

- **Severity**: MEDIUM
- **Side**: multi   **Effort**: L   **Root cause verdict**: CONFIRMED

### Root cause

CONFIRMED, and the reason is more specific than 'the pipeline emits a partial'. There are three independent breaks and all three must close.

(1) THE ASSEMBLER HAS NO CALLER. Backend/scripts/generate-release-manifest.cjs exists and is the intended producer (its own header says so). A grep of Backend/.github/ for 'generate-release-manifest' returns NOTHING. Backend has only build.yml, pr-checks.yml, security.yml, and build.yml's deploy job (register-task-definition at :466-586, update-service at :765) never invokes it. So the v1 document is never assembled, by anyone, on any path.

(2) THE PIPELINE HALF IS DELIBERATELY UNLOADABLE, AND CORRECTLY SO. Installers/.github/workflows/release.yml:1562-1566 runs emit_release_manifest_v1.py, and the comment block at :1531-1560 states plainly that this is EXACTLY a half: components{8} need live ECS state the release role cannot read (it holds S3 permissions only), compatibleWorkerContractVersion lives in the worker repos, compatibleBackendRange lives in the Backend repo. It uploads to s3://installer-binaries-prod/releases/<v>/release-manifest.v1.partial.json (:1670-1672) and explicitly warns that RELEASE_MANIFEST_PATH must NEVER point at it. That is a correct, honest producer. It is not the bug.

(3) THE LOADER CANNOT READ THE ONLY VIABLE LOCATION. release-manifest.service.ts:183-192 explicitly REJECTS s3:// and https:// sources ('not supported in Phase 1; mount the manifest as a local file'). The default probe list (:52-61) is four local paths inside an immutable container image. Since the four ECS coordinates per component (taskDefinitionArn, taskDefinitionRevision, imageDigest, envHash) are only knowable AFTER register-task-definition returns — the generator's own header says a build-time generator 'would have to invent them' — the document CANNOT be baked into the image. And ECS Fargate has no writable shared volume to mount it from. So the loader supports exactly the two locations the document can never occupy.

The 503 and the message 'RELEASE_MANIFEST_PATH unset and no manifest at any default location' are therefore both CORRECT behaviour (health.controller.ts:88-102 refuses to report 200 for a route that knows nothing — keep that). The route is honest; the pipeline behind it is absent.

CONTRACT NOTE with real consequences: validateManifestShape (:224-297) requires ALL of RELEASE_COMPONENT_NAMES, which includes intelArtifactFetcher and intelMultiFollower. Per this cluster's cross-cutting finding those two run on Hetzner docker-compose, not ECS, so they have no taskDefinitionArn to report. The contract already has the escape hatch: ReleaseComponent.runningExpected (release-manifest.types.ts:33) — the assembler must emit runningExpected:false for the non-ECS components rather than the validator being relaxed.

### Evidence (read at origin/main)

- `Backend/scripts/generate-release-manifest.cjs (header: 'This script is that producer'; usage --input facts.json --out manifest.json)`
- `Backend/.github/workflows/ contains only build.yml, pr-checks.yml, security.yml; grep for 'generate-release-manifest|RELEASE_MANIFEST_PATH|release-manifest' across .github/ and Dockerfile returns nothing`
- `Backend/src/health/services/release-manifest.service.ts:183-192 (s3:// and https:// explicitly rejected)`
- `Backend/src/health/services/release-manifest.service.ts:52-61 (four local default paths, all inside the immutable image)`
- `Backend/src/health/services/release-manifest.service.ts:94-120 (the exact 503 body observed live)`
- `Backend/src/health/controllers/health.controller.ts:88-102 (503 when !manifestLoaded — correct, keep)`
- `Backend/src/health/types/release-manifest.types.ts:11-21,26-35 (RELEASE_COMPONENT_NAMES includes the 4 intel components; ReleaseComponent.runningExpected exists)`
- `Backend/src/health/services/release-manifest.service.ts:224-297 (validateManifestShape requires all 8 components with full ECS coordinates)`
- `Installers/.github/workflows/release.yml:1531-1566 (the half is deliberate and documented)`
- `Installers/.github/workflows/release.yml:1670-1672 (partial uploaded to installer-binaries-prod)`
- `Backend/.github/workflows/build.yml:466-586,765-771 (register-task-definition + update-service — the only place the ECS facts exist)`

### Fix

Close the loop where the facts actually are — the Backend deploy job — and teach the loader to read the one location that can hold a post-deploy document.

(a) IMPLEMENT THE S3 LOADER. In release-manifest.service.ts:183-192, replace the s3:// rejection with a real GetObject (reuse the MAX_MANIFEST_BYTES cap at :214 by checking ContentLength before reading). Keep https:// rejected. Keep the existing 60s cache (:35) so the route does not hit S3 per request. This is the minimum change that makes a post-deploy-assembled document reachable, and it is what the Phase-1 comment already anticipated.

(b) ASSEMBLE IN THE BACKEND DEPLOY JOB, AFTER THE TASK DEFINITION EXISTS. In build.yml's deploy job, after register-task-definition (:466-586) and after 'Wait for ECS service stability' (:776): download the artifact half from s3://installer-binaries-prod/releases/<v>/release-manifest.v1.partial.json, merge it with facts gathered via aws ecs describe-services / describe-task-definition for all 8 components, run `node scripts/generate-release-manifest.cjs --input facts.json --out release-manifest.v1.json`, and upload the ASSEMBLED document to s3://installer-binaries-prod/manifests/backend/release-manifest.v1.json. The generator already exits 1 on any placeholder (its PLACEHOLDERS set includes the literal 'unknown' the Dockerfile defaults to), so a hollow manifest fails the deploy step rather than shipping — keep that failure loud.

(c) SET THE POINTER. Add RELEASE_MANIFEST_PATH=s3://installer-binaries-prod/manifests/backend/release-manifest.v1.json to the backend task definition. NOT a feature flag — it is the address of a document, and its absence already degrades the lane honestly (503 + named reason), which is the required posture.

(d) HETZNER COMPONENTS. Emit intelArtifactFetcher and intelMultiFollower with runningExpected:false and their real (zeroed) ECS coordinates, so the drift gate compares against the truth 'these are not expected to run here' rather than being unsatisfiable. This is also what makes the manifest agree with F9's finding instead of contradicting it.

(e) IAM. The deploy role github-runner-backend (build.yml:337) already performs ecs:DescribeServices and ecs:DescribeTaskDefinition in this job (:439,:508,:592), so no new permission is needed for the backend/frontend/worker components; confirm the intel cluster is in scope or emit those two components from static config with runningExpected:false.

DO NOT relax validateManifestShape to make the 503 go away. The validator is the only thing standing between 'we have a baseline' and 'we have a plausible-looking fiction', which the generator header calls out explicitly.

### Changes

**Backend** - `src/health/services/release-manifest.service.ts`

loadManifest (:183-210): implement the s3:// branch with GetObjectCommand (parse bucket/key from the URL), enforce MAX_MANIFEST_BYTES via ContentLength before reading the body, keep https:// rejected with the existing explicit error. Inject an S3 client (mirror the pattern in installer.service.ts onModuleInit). Leave the default local-path probe (:52-61) intact as the non-container fallback.

**Backend** - `.github/workflows/build.yml`

In the 'Deploy to ECS' job, after 'Wait for ECS service stability': new step that (1) aws s3 cp the partial from installer-binaries-prod/releases/<version>/release-manifest.v1.partial.json, (2) builds facts.json by describing all 8 components (backend, frontend, staticWorker, sandboxWorker + the 4 intel components with runningExpected:false for the Hetzner-hosted ones), (3) runs node scripts/generate-release-manifest.cjs --input facts.json --out release-manifest.v1.json, (4) aws s3 cp the assembled document to s3://installer-binaries-prod/manifests/backend/release-manifest.v1.json. Fail the deploy if the generator exits non-zero.

**Backend** - `src/health/services/release-manifest.service.spec.ts`

Add cases for the s3:// branch: successful load+validate; oversize ContentLength rejected before body read; S3 error surfaces as MANIFEST_UNREACHABLE with the S3 message; https:// still rejected.

**config** - `ECS task definition (backend family)`

Add environment RELEASE_MANIFEST_PATH=s3://installer-binaries-prod/manifests/backend/release-manifest.v1.json. Ops action; the code change in (a) is what makes this value meaningful.

### Tests (each carries a defeat step)

- s3 loader test with a mocked S3 client returning a complete v1 manifest: assert manifestLoaded=true, driftReport.manifestUnreachable=false, and HTTP 200 from the route. DEFEAT STEP: make the mock return a manifest missing components.intelMultiFollower — the test must flip to manifestLoaded=false with the component named in the error. If it still passes, validateManifestShape is not being reached and the loader is short-circuiting.
- Generator/validator round-trip (extend the existing release-manifest.generator.spec.ts pattern): feed the generator a facts.json built from the SAME shape build.yml assembles, then feed its output through the real ReleaseManifestService; assert manifestLoaded===true. DEFEAT STEP: set one component's imageDigest to the literal 'unknown' — the generator must exit non-zero and write nothing, proving the placeholder guard is live and the deploy step will actually fail rather than upload a hollow document.
- Honest-negative preservation test: with RELEASE_MANIFEST_PATH pointing at a nonexistent S3 key, assert the route still returns 503 with reason MANIFEST_UNREACHABLE and expected:null. DEFEAT STEP: assert the route does NOT return 200 with an empty manifest — this is the specific regression that would turn an honest negative into a false green.
- Partial-rejection test: point RELEASE_MANIFEST_PATH at the pipeline's release-manifest.v1.partial.json fixture; assert manifestLoaded=false (the empty-string artifact fields fail validateManifestShape:249-254). DEFEAT STEP: this test must FAIL if someone relaxes the validator to accept empty strings — it is the guard on the 'do not fabricate' contract the pipeline comment relies on.
- Post-deploy live check: GET /api/v1/health/release-manifest -> 200, expected.version === the deployed release, expected.components.backend.taskDefinitionRevision === the revision build.yml just registered. DEFEAT STEP: compare against the PREVIOUS revision and assert it does not match — otherwise a stale cached manifest would satisfy the check.

### Risks

(1) The 60s cache (:35) plus the immutability contract means a deploy that uploads a new manifest is only visible after cache expiry — acceptable, but a stale-manifest window exists immediately post-deploy and must not be read as drift. (2) Adding an S3 read to a health route creates a new external dependency for that route; the cache and the try/catch at :141-169 already contain it, but confirm the failure path returns 503-with-reason rather than throwing. (3) If the deploy role cannot describe the intel cluster, the assembler must fall back to static runningExpected:false entries rather than failing the whole deploy — the manifest existing with honest 'not expected here' is better than no manifest. (4) build.yml gains a step that can fail the deploy; that is intentional (a deploy that cannot describe its own components should not silently claim it did) but it does add a new deploy-failure mode.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED. Backend/.github/workflows/ contains only build.yml, pr-checks.yml, security.yml, and grep for 'generate-release-manifest|RELEASE_MANIFEST_PATH|release-manifest' across .github/ and Dockerfile returns NOTHING — the assembler genuinely has zero callers. release-manifest.service.ts loadManifest explicitly throws for s3:// and https:// ('not supported in Phase 1; mount the manifest as a local file'); defaultManifestPaths() returns the four local candidates; the 'unset' branch emits exactly the observed 503 body; validateManifestShape requires all of RELEASE_COMPONENT_NAMES (release-manifest.types.ts:13-22, which does include intelArtifactFetcher and intelMultiFollower) plus taskDefinitionArn, an integer taskDefinitionRevision >= 1, and a boolean runningExpected. health.controller.ts sets 503 when !manifestLoaded with an explicit honesty comment. Installers release.yml:1664-1672 does upload only the .partial. to installer-binaries-prod with the warning. The three-break diagnosis is correct and runningExpected IS the right escape hatch for the Hetzner components.
- MISSING IAM ON THE READ SIDE — the spec's IAM section addresses only the github-runner-backend DEPLOY role. The component that performs the new GetObject is the BACKEND ECS TASK ROLE at request time. Without s3:GetObject on arn:aws:s3:::installer-binaries-prod/manifests/backend/* on the task role, the route returns MANIFEST_UNREACHABLE forever and is indistinguishable from today's 503. This is the single most likely way the whole deliverable ships and changes nothing.
- THE DRIFT GATE BECOMES TAUTOLOGICAL FOR 3 OF 4 ECS COMPONENTS. Assembling `expected` by running `aws ecs describe-services` in the same job that just deployed means expected == observed by construction for frontend, staticWorker and sandboxWorker — those are deployed by OTHER repos' workflows, so the 'expected' recorded is simply 'whatever was live at backend-deploy time'. The manifest then detects only post-assembly drift, never a component that was already wrong. That is precisely the 'plausible-looking fiction' the generator header warns about, one level up. It must be stated in the manifest semantics (and ideally each non-backend component should carry its own source-of-truth digest from its own deploy, not a live describe).
- FALSE SUPPORTING PREMISE: 'ECS Fargate has no writable shared volume to mount it from.' Fargate supports EFS volumes, and the service's own default-path list already includes '/etc/devoid/release-manifest.json' with the comment 'the conventional mount point for a task-definition volume'. The S3 loader is still the better answer (cheaper, no mount lifecycle), but do not rest the argument on a claim the code contradicts.
- RISK (1) MIS-DESCRIBES THE CACHE. The 60s TTL (cacheTtlMs) applies to FAILURE responses too — the failure path sets cachedResponse/cachedAt identically. The inline comment saying failures 'clear only on backend restart' is stale relative to the code. Net effect is benign (a transient S3 error self-heals in 60s) but the spec should say so rather than repeat the comment.

**Corrected approach**: Keep the three-part fix (S3 loader, assemble-in-the-deploy-job, set the pointer) — it is the right shape and the honest-negative preservation is correct. Add: (1) the backend ECS TASK role IAM grant, called out as a first-class deliverable, not a footnote; (2) an explicit statement in the manifest doc/semantics that non-backend ECS components are recorded from live state at backend-deploy time and therefore establish a baseline, not a release contract — anything stronger would be a fabrication; (3) drop the Fargate-has-no-volume argument; (4) correct the cache-behaviour note. Do NOT relax validateManifestShape — that part of the spec is exactly right, and the partial-rejection test is the key pin.


**Missing changes the reviewer found**:

- **config** `ECS task role (backend family) IAM policy` - Add s3:GetObject on arn:aws:s3:::installer-binaries-prod/manifests/backend/release-manifest.v1.json. This is the runtime read the new loader performs; the deploy-role grant does not cover it.
- **Backend** `src/health/services/release-manifest.service.ts` - Also update the stale cache comment near cachedResponse/cachedAt: failures ARE cached for the same 60s TTL, they do not persist until restart.
- **Backend** `docs or the manifest semantics comment` - State that components other than `backend` are captured from live ECS at backend-deploy time, so drift for them is measured relative to the last backend deploy, not to a release contract.

**Collateral risk**: Low and well contained. The new build.yml step can fail the deploy — intentional and correct per the generator's exit-1-on-placeholder guard. No PROVEN-WORKING capability is touched. No agent-facing change. The one real regression risk is turning the honest 503 into a false 200; the spec's honest-negative preservation test and partial-rejection test both guard it and must be kept.

**Effort correction**: L is optimistic. A new S3 loader + injected client, an 8-component facts.json assembled across at least two clusters (with two components sourced from static Hetzner config), IAM on two principals, and four test suites is L-to-XL (4-6d).


---

## F12 - backendBuildSha is undefined because three call sites read BUILD_SHA/GITHUB_SHA while the image actually carries CF_BUILD_SHA

- **Severity**: LOW
- **Side**: backend   **Effort**: S   **Root cause verdict**: REVISED

### Root cause

The finding is right that backendBuildSha is always undefined, and right that no backend build-version route or header exists. It is WRONG about why, and the correct reason makes the fix far smaller than the recommended build-arg -> label -> env pipeline.

THAT PIPELINE ALREADY EXISTS. Backend/Dockerfile:4-7 and :20-23 declare `ARG CF_BUILD_SHA=unknown` / `ARG CF_BUILD_TIME=unknown` and promote both to `ENV` in BOTH stages, and build.yml:350-352 passes `--build-arg CF_BUILD_SHA="${GITHUB_SHA}"` and `--build-arg CF_BUILD_TIME=...`. Image ENV survives into the ECS container unless a task definition explicitly overrides it, so process.env.CF_BUILD_SHA IS the deployed git sha in prod today. The evidence's own observation is consistent with this: CF_BUILD_SHA would not appear in the taskdef env list because it is baked in the IMAGE, not declared in the taskdef — so 'none of the 71 taskdef env names match BUILD/SHA/VERSION/COMMIT' is true and simultaneously not evidence that no build sha exists.

THE ACTUAL BUG IS A NAME MISMATCH AT THREE READ SITES. Re-derived line numbers (the reported 877 was off by five): jobs.controller.ts:882, job-queue.service.ts:1397, job-queue.service.ts:1485 — each `backendBuildSha: process.env.BUILD_SHA || process.env.GITHUB_SHA`. Neither name is ever set (GITHUB_SHA exists only inside a GitHub Actions runner, never in ECS), so every job payload and every workerFailure record carries undefined. A repo-wide grep for CF_BUILD_SHA in src/ returns ZERO consumers — the value is present in the process and nothing reads it. The only two mentions are a spec comment (release-manifest.generator.spec.ts:120) and the generator's PLACEHOLDERS doc (generate-release-manifest.cjs:88), both of which reference it precisely because they know the Dockerfile defaults it to 'unknown'.

SECOND HALF CONFIRMED: there is no backend build-version surface. installer.controller.ts:92 @Get('version') and :108 @Get('agent-version') both return installerService.getLatestVersion(), which reads channels/stable.json from S3 (installer.service.ts:307-310) — that is the CLI release version, unrelated to the running backend build. HealthCheckResponseDto (health/types/health.types.ts) has status/database/dynamodb/sqs/llm*/timestamp/uptime/scannerSubsystems/scannerAi/backendLlmProxy and no build identity at all, and health.service.ts:153-165 assembles exactly those fields. So a deployed build genuinely cannot be identified from any HTTP response.

### Evidence (read at origin/main)

- `Backend/Dockerfile:4-7 and :20-23 (ARG+ENV CF_BUILD_SHA / CF_BUILD_TIME in both stages)`
- `Backend/.github/workflows/build.yml:350-352 (--build-arg CF_BUILD_SHA="${GITHUB_SHA}")`
- `Backend/src/jobs/jobs.controller.ts:882 (process.env.BUILD_SHA || process.env.GITHUB_SHA)`
- `Backend/src/jobs/job-queue.service.ts:1397 and :1485 (same expression)`
- `Backend/src/jobs/helpers/worker-evidence-alias-detector.ts:151,173,190,306 (the consumer that logs the undefined value)`
- `grep CF_BUILD_SHA across Backend/src returns no consumers (only release-manifest.generator.spec.ts:120 and scripts/generate-release-manifest.cjs:88 mention it)`
- `Backend/src/installer/installer.controller.ts:92,108 (both return getLatestVersion = CLI version)`
- `Backend/src/installer/installer.service.ts:307-310 (getLatestVersion reads channels/stable.json)`
- `Backend/src/health/types/health.types.ts (HealthCheckResponseDto has no build field)`
- `Backend/src/health/services/health.service.ts:153-165 (assembled response)`

### Fix

(a) READ THE VARIABLE THAT EXISTS. Introduce one exported helper — `backendBuildIdentity()` in a small module (e.g. src/common/build-identity.ts) returning `{ sha: process.env.CF_BUILD_SHA, builtAt: process.env.CF_BUILD_TIME }` with the literal 'unknown' (the Dockerfile default) normalised to undefined so an unstamped build reports honestly as unknown rather than as the string 'unknown'. Point all three call sites at `backendBuildIdentity().sha`. Keep BUILD_SHA/GITHUB_SHA as secondary fallbacks so local/dev runs and any future CI shape still work — but CF_BUILD_SHA must be first, because it is the one that is actually set in production.

Do NOT introduce a new build-arg or image label: the arg, the ENV, and the CI wiring are already in place and already correct. Adding a second mechanism would create exactly the name-drift this finding is an instance of.

(b) MAKE THE DEPLOYED BUILD IDENTIFIABLE. Add optional `buildSha?: string` and `buildTime?: string` to HealthCheckResponseDto and populate them in health.service.ts:153-165 from the same helper. Additive optional fields on an unauthenticated health route — no consumer breaks. Honesty discipline: when the helper returns undefined the field must be ABSENT (or explicitly null with the existing 'unknown' vocabulary), never a placeholder string that reads like a real sha.

(c) RESPONSE HEADER. Add a tiny global interceptor (or extend an existing one) setting `X-Devoid-Backend-Build: <sha>` on every response when the sha is known, and omitting the header when it is not. This is what makes 'which build answered this request' answerable during an incident without a second call.

WHY THIS CLOSES THE CLASS: the single helper becomes the one place build identity is read, so the next consumer cannot invent a fourth env name.

### Changes

**Backend** - `src/common/build-identity.ts`

New. export function backendBuildIdentity(): { sha?: string; builtAt?: string } — reads process.env.CF_BUILD_SHA ?? process.env.BUILD_SHA ?? process.env.GITHUB_SHA and process.env.CF_BUILD_TIME; normalises the literal 'unknown' and empty string to undefined.

**Backend** - `src/jobs/jobs.controller.ts`

Line 882: replace `process.env.BUILD_SHA || process.env.GITHUB_SHA` with `backendBuildIdentity().sha`.

**Backend** - `src/jobs/job-queue.service.ts`

Lines 1397 and 1485: same replacement.

**Backend** - `src/health/types/health.types.ts`

Add @ApiPropertyOptional buildSha?: string and buildTime?: string to HealthCheckResponseDto, documented as 'absent when the image was not stamped'.

**Backend** - `src/health/services/health.service.ts`

In check() (:153-165), spread the build identity into the returned object, omitting the keys entirely when undefined.

**Backend** - `src/common/interceptors/build-identity.interceptor.ts`

New global interceptor setting X-Devoid-Backend-Build when backendBuildIdentity().sha is defined; sets nothing when it is not. Register in main.ts alongside existing global interceptors.

### Tests (each carries a defeat step)

- Helper precedence test: set CF_BUILD_SHA='abc123' and BUILD_SHA='zzz' and assert sha==='abc123'. DEFEAT STEP: unset CF_BUILD_SHA and assert sha==='zzz' — this proves the first assertion exercised the CF branch rather than passing because both were set to the same value.
- Placeholder-honesty test: set CF_BUILD_SHA='unknown' (the literal Dockerfile default) and assert sha===undefined, and that the health response OMITS buildSha. DEFEAT STEP: assert the response does not contain the string 'unknown' anywhere in the build fields — this is the specific way a placeholder becomes a fake-looking identity.
- Job-payload test: with CF_BUILD_SHA set, dispatch through the jobs.controller path at :882 and assert the emitted alias context carries backendBuildSha==='abc123'. DEFEAT STEP: revert that one line to process.env.BUILD_SHA — the test must fail with undefined, confirming it reads the live emission and not a re-derived constant.
- Header test: assert X-Devoid-Backend-Build is present and equals the sha when stamped, and that the header is ABSENT (not empty-valued) when not. DEFEAT STEP: assert absence explicitly — an empty header value would satisfy a naive presence check while telling an operator nothing.
- Post-deploy live check: GET /api/v1/health returns buildSha equal to the GITHUB_SHA of the deploy commit. DEFEAT STEP: compare against the previous deploy's sha and assert inequality, so a cached or stale response cannot pass.

### Risks

Very low. (1) If any ECS task definition explicitly declares CF_BUILD_SHA it would override the image ENV — verify none does before relying on it. (2) Exposing the git sha on an UNAUTHENTICATED health route is a small information disclosure; it is standard practice and the repo is private, but if that is unacceptable put buildSha on the JWT-guarded /jwt-secure variant and keep only the header on the public route. (3) Adding a global interceptor touches every response path — keep it allocation-free and exception-safe so it can never turn a 200 into a 500.

### ADVERSARIAL REVIEW - verdict: SOUND

- Verified every citation and the REVISED root cause is correct. Dockerfile:4-7 and :20-23 declare ARG+ENV CF_BUILD_SHA/CF_BUILD_TIME in BOTH stages; build.yml:351-352 passes --build-arg CF_BUILD_SHA="${GITHUB_SHA}". The three read sites are jobs.controller.ts:882 and job-queue.service.ts:1397 and :1485, each `process.env.BUILD_SHA || process.env.GITHUB_SHA`. A grep for CF_BUILD_SHA across Backend/src returns ONLY release-manifest.generator.spec.ts:120 and scripts/generate-release-manifest.cjs (the PLACEHOLDERS doc) — zero consumers, exactly as claimed. installer.controller.ts:92 and :108 both return getLatestVersion() (installer.service.ts:307-310 reads channels/stable.json), and HealthCheckResponseDto has status/database/dynamodb/sqs/llmRequired/llmConfigured/timestamp/uptime/scannerSubsystems/scannerAi/backendLlmProxy with no build identity; health.service.ts:153-165 assembles exactly those. The 'name mismatch, not a missing pipeline' correction is right, and refusing to add a second build-arg mechanism is the correct call.
- Minor: build.yml:352 sources CF_BUILD_TIME from ${{ github.event.head_commit.timestamp }}, which is EMPTY on a workflow_dispatch run. So the helper's empty-string normalisation is load-bearing, not cosmetic — a dispatch-triggered deploy would otherwise stamp builtAt=''. Worth an explicit test case alongside the 'unknown' case.
- Minor: fix (c)'s global interceptor requires registration in main.ts alongside the existing global interceptors and is the only part of this spec that touches every response path. It is optional to the root-cause fix; if the wave is tight, (a)+(b) alone close the class and (c) can follow.

**Collateral risk**: Negligible. Nothing here touches enforcement, DLP, the wire lane, signed bundles, the package gate, or MCP discovery. Risk (2) is correctly identified: exposing the git sha on an unauthenticated /health is a small disclosure; the repo is private and this is standard, but the JWT-guarded variant is a valid alternative if the owner objects. Risk (1) is the right pre-check — confirm no task definition declares CF_BUILD_SHA, which would override the image ENV.

**Effort correction**: S is right for (a)+(b). Including (c) the global interceptor plus main.ts registration and its two tests puts it at the S/M boundary; still call it S.


---

## F19 - Only threat-intel retention is inert; audit and delivery-log retention are ALREADY DELETING in prod - the finding is 2/3 wrong and the live risk is the opposite of the one described

- **Severity**: MEDIUM
- **Side**: backend   **Effort**: S   **Root cause verdict**: DISPROVEN

### Root cause

DISPROVEN as written. Two of the three named gates default ENABLED, and both jobs are running and deleting production data right now. The finding's stated danger ('a retention job that silently switches ON in prod will DELETE DATA') describes a state that already obtains for audit_events — which is the more important thing to know, and it is the inverse of what was reported.

AUDIT RETENTION — DEFAULTS ON, RUNNING. audit-retention.service.ts:69-78: `if (flag === undefined) return true;` and empty string also returns true; ONLY the explicit strings 'false'/'0'/'no' disable it. The class JSDoc at :20-25 states this deliberately ('ENABLED by default ... not an opt-in'). Since AUDIT_RETENTION_ENABLED is absent from backend:301, the sweep RUNS daily at 02:00 UTC (@Cron at :136) and deletes audit_events older than AUDIT_RETENTION_DAYS, which is also absent and therefore defaults to 30 (:92-101). The service is a registered provider (audit.module.ts:27) and ScheduleModule.forRoot() is present (app.module.ts:74), so the cron is genuinely wired. NOT inert; the audit log is NOT immutable-by-omission; it is on a 30-day window nobody set explicitly.

DELIVERY-LOG RETENTION — DEFAULTS ON, RUNNING. delivery-log-retention.service.ts:76-82: `if (typeof flag !== 'string') return true;` and empty string returns true. Registered at integrations.module.ts:149, @Cron('0 3 * * *') at :119, window defaults to 90 days (:101-109). So 'integration delivery logs grow unbounded' is DISPROVEN.

THREAT-INTEL RETENTION — THE ONLY INERT ONE, AND THE FINDING IS CORRECT HERE. threat-intel-retention.service.ts:47-52: `if (typeof flag !== 'string') return false;` — unset means DISABLED. THREAT_INTEL_RETENTION_ENABLED is absent, so runDailyRetention (:69-79) early-returns at :71 and neither pruneLookups nor pruneExpiredChecks ever runs. threat_intel_lookups (append-only provider-lookup audit log) and expired threat_intel_checks rows grow without bound. This is a genuine off-by-default feature flag on a hygiene job and it violates the no-feature-flags invariant.

COMMENTS IN THE CODE ARE STALE AND ACTIVELY MISLEADING — this is how the finding went wrong. delivery-log-retention.service.ts:63 says 'This asymmetry vs AuditRetentionService (which defaults disabled)'; env.validation.ts:288 says 'matches the precedent set by AUDIT_RETENTION_ENABLED'; env.validation.ts:327 says 'Defaults to ENABLED (unlike AUDIT_RETENTION_ENABLED which defaults disabled)'. All three describe an audit default that the code contradicts at :71. Anyone reading the comments — human or agent — concludes audit retention is off.

### Evidence (read at origin/main)

- `Backend/src/audit/audit-retention.service.ts:69-78 (isEnabled returns true when unset/empty)`
- `Backend/src/audit/audit-retention.service.ts:20-25 (JSDoc: ENABLED by default, not an opt-in)`
- `Backend/src/audit/audit-retention.service.ts:92-101 (AUDIT_RETENTION_DAYS defaults to 30)`
- `Backend/src/audit/audit-retention.service.ts:136-202 (@Cron EVERY_DAY_AT_2AM, batched DELETE)`
- `Backend/src/audit/audit.module.ts:27 (registered provider)`
- `Backend/src/app.module.ts:74 (ScheduleModule.forRoot())`
- `Backend/src/notifications/retention/delivery-log-retention.service.ts:76-82 (defaults enabled)`
- `Backend/src/notifications/retention/delivery-log-retention.service.ts:101-109,119 (90-day default, 03:00 cron)`
- `Backend/src/notifications/integrations.module.ts:149 (registered provider)`
- `Backend/src/threat-intel/threat-intel-retention.service.ts:47-52 (defaults DISABLED - the only inert one)`
- `Backend/src/threat-intel/threat-intel-retention.service.ts:69-79 (early return at :71)`
- `Backend/src/threat-intel/threat-intel.module.ts:49 (registered, so the cron fires and no-ops)`
- `Backend/src/threat-intel/threat-intel-retention.service.ts:14-23 (scope doc: injects ONLY the two bookkeeping repos, never the malware mirror or verdict caches)`
- `Backend/src/notifications/retention/delivery-log-retention.service.ts:63 and Backend/src/config/env.validation.ts:288,327 (three stale comments asserting audit defaults disabled)`

### Fix

Correct the record first, then make exactly one change of substance.

(a) DELETE THE THREAT-INTEL ENABLE GATE (the no-feature-flags fix, and it is safe by construction). Remove isEnabled() (:47-52) and the early return (:71-76) so runDailyRetention always executes. The safety argument is structural, not a promise: this service can only reach what is injected, and only threat_intel_lookups and threat_intel_checks are injected (:39-44). It has NO handle to threat_intel_entries (the malware mirror) or to any verdict cache — the class doc at :14-23 says so explicitly and the constructor proves it. So an unconditional sweep cannot un-block malware or delete a BLOCK verdict, which is the only outcome that would justify a gate. Keep THREAT_INTEL_LOOKUP_RETENTION_DAYS as a configurable WINDOW (a value, not an on/off switch) with its existing fail-closed -1 sentinel (:59-67, :84-90) — that is legitimate configuration, not a flag.

(b) FIRST-SWEEP SAFETY, WITHOUT A FLAG. The real hazard is the first unconditional sweep deleting a large accumulated backlog in one statement. pruneLookups (:92-97) is a single unbounded DELETE. Give it the batched id-subselect loop AuditRetentionService already uses (audit-retention.service.ts:164-188) with the same bounded batch size, so the first cleanup cannot hold a long autovacuum-blocking lock on a table that has grown since the gate was set. This is a correctness/lock-safety change, not a rollout gate — it is unconditional and ships ON.

(c) MAKE THE DELETION AUDITABLE. Both surviving jobs must write a durable record of what they removed (count, window, table), the way audit retention exempts AUDIT_LOGS_DELETED (audit-protected-types.ts, referenced at :122). Silent deletion is the thing that let a 30-day audit window run unnoticed.

(d) FIX THE THREE STALE COMMENTS. delivery-log-retention.service.ts:63 and env.validation.ts:288,327 must state the real defaults: audit ENABLED-by-default (kill-switch semantics), delivery-log ENABLED-by-default, threat-intel now unconditional. A comment that misstates a data-deletion default is a defect in its own right — it is what produced this finding.

(e) OPERATOR DECISION TO SURFACE, NOT TO SILENTLY KEEP: AUDIT_RETENTION_DAYS is unset, so the audit log is on an implicit 30-day window (:94). Whether 30 days is the intended compliance posture is an owner call. The engineering deliverable is to make it EXPLICIT in the task definition rather than inherited from a code default — an unset value that silently means 'delete after 30 days' is the same silent-default class as F12 and F37. The hash-chain consequence is already documented at :40-50 (surviving-window chain stays intact; full-history proofs come from the exempt EVIDENCE_CHECKPOINT anchors), so the window is a policy choice, not a correctness risk.

DO NOT touch the audit and delivery-log enable-reads: an ENABLED-by-default gate whose only effect is an explicit operator kill switch is not an off-by-default feature flag and does not violate the invariant.

### Changes

**Backend** - `src/threat-intel/threat-intel-retention.service.ts`

Delete isEnabled() (:47-52) and the early return in runDailyRetention (:71-76) - the sweep becomes unconditional. Rewrite pruneLookups (:82-105) to use a bounded batched id-subselect DELETE loop mirroring audit-retention.service.ts:164-188 instead of the single unbounded queryBuilder delete. Keep getLookupRetentionDays (:59-67) and its -1 fail-closed sentinel unchanged. Update the class JSDoc :25-33 to state the sweep is unconditional and why that is safe (only bookkeeping repos are injected).

**Backend** - `src/threat-intel/threat-intel-retention.service.spec.ts`

Delete the disabled-by-default cases; add: sweep runs with no env set; unparseable THREAT_INTEL_LOOKUP_RETENTION_DAYS still skips with the loud error; batched loop terminates on a short batch; the service holds no repository other than ThreatIntelLookup and ThreatIntelCheck.

**Backend** - `src/notifications/retention/delivery-log-retention.service.ts`

Fix the stale comment at :63 that claims AuditRetentionService defaults disabled. Add a durable deletion record (count/window/table) alongside the existing log line.

**Backend** - `src/audit/audit-retention.service.ts`

No behaviour change. Add a durable AUDIT_LOGS_DELETED-style record of each sweep's deleted count and window if one is not already written, so the 30-day cut is visible rather than log-only.

**Backend** - `src/config/env.validation.ts`

Correct the misleading comments at :288 and :327 to state the true defaults; add a boot WARNING when AUDIT_RETENTION_DAYS is unset, naming the implicit 30-day window, so an operator learns the audit cut exists before it runs. Warning only - never a boot assertion.

**config** - `ECS task definition (backend family)`

Set AUDIT_RETENTION_DAYS explicitly to the owner-decided value (owner decision; the code default of 30 is currently in force unannounced). Do NOT add THREAT_INTEL_RETENTION_ENABLED - the gate is being deleted.

### Tests (each carries a defeat step)

- Unconditional-sweep test: with NO threat-intel env vars set, run runDailyRetention and assert both pruneLookups and pruneExpiredChecks executed. DEFEAT STEP: re-insert the isEnabled early return - the test must fail. Without this step the test would pass against a stubbed repo that records calls regardless of the guard.
- Blast-radius invariant test: reflect over ThreatIntelRetentionService's injected repositories and assert the set is exactly {ThreatIntelLookup, ThreatIntelCheck}. DEFEAT STEP: add a ThreatIntelEntry repo to the constructor - the test must fail. This is the test that makes the 'safe by construction' claim in the fix actually enforced rather than asserted.
- Batching test on live-pg: seed 2500 aged lookup rows with batch size 1000; assert exactly 3 statements and 2500 deleted, and that the loop terminates. DEFEAT STEP: seed 1000 rows exactly (a batch-boundary case) and assert termination - an off-by-one here is an infinite loop against production.
- Window fail-closed test: THREAT_INTEL_LOOKUP_RETENTION_DAYS='90d'; assert zero rows deleted and an error logged. DEFEAT STEP: set it to '90' and assert rows ARE deleted - proving the first case failed on the sentinel and not because the fixture had no aged rows.
- Documentation-truth test: assert AuditRetentionService.isEnabled() returns true for undefined and for '' - i.e. pin the ACTUAL default in a test, so the next stale comment cannot mislead. DEFEAT STEP: change :71 to `return false` - the test must fail, which is the alarm that a data-deletion default changed.
- Retention-record test: after a sweep, assert a durable record exists naming table, window, and deleted count. DEFEAT STEP: assert the record exists even when zero rows were deleted - a job that only records non-empty sweeps cannot be distinguished from a job that never ran, which is precisely the green-but-inert pattern.

### Risks

(1) THE MAIN RISK IS ALREADY LIVE AND UNRELATED TO THIS CHANGE: audit_events is being cut at 30 days right now under an implicit default. Surfacing it may prompt an urgent window change; do that via explicit config, not by disabling the job. (2) The first unconditional threat-intel sweep deletes an accumulated backlog - the batched loop bounds lock duration but the total volume could still be large; run it once manually in a maintenance window and record the count before letting the 03:00 cron own it. (3) Deleting the enable gate removes the operator's ability to stop that job without a deploy; acceptable given the injected scope is two bookkeeping tables, but it is a real reduction in operational control and should be an explicit owner acknowledgement. (4) No agent-facing or contract impact.

### ADVERSARIAL REVIEW - verdict: SOUND

- The DISPROVEN verdict is CORRECT and I verified it line by line. audit-retention.service.ts isEnabled(): `if (flag === undefined) return true;` then empty string returns true, and only 'false'/'0'/'no' disable — the class JSDoc says verbatim 'ENABLED by default ... not an opt-in'. getRetentionDays() returns 30 when unset. @Cron(CronExpression.EVERY_DAY_AT_2AM) on runDailyRetention. Registered at audit.module.ts:27 and ScheduleModule.forRoot() at app.module.ts:74. delivery-log-retention.service.ts isEnabled(): `if (typeof flag !== 'string') return true;` plus empty-string true; 90-day default; @Cron('0 3 * * *'); registered at integrations.module.ts:149. threat-intel-retention.service.ts isEnabled(): `if (typeof flag !== 'string') return false;` — the ONLY inert one; runDailyRetention early-returns; registered at threat-intel.module.ts:49. So audit_events IS being cut at 30 days in prod right now and the finding as written was 2/3 wrong. That correction is the most valuable thing in this cluster.
- The blast-radius argument for deleting the threat-intel gate is verified STRUCTURALLY, not just asserted: the constructor injects only Repository<ThreatIntelLookup> and Repository<ThreatIntelCheck>, and the class doc explicitly states it has no handle to threat_intel_entries (the malware mirror) or any verdict cache. So an unconditional sweep provably cannot un-block malware. The reflection test that pins the injected repository set is the right way to keep that true.
- Minor scope gap: the fix batches pruneLookups but leaves pruneExpiredChecks as a single unbounded delete on the TTL cache. If the gate has been off since the service shipped, that table has the same accumulated-backlog lock hazard. Batch both.
- Minor over-read: env.validation.ts:288's comment ('matches the precedent set by AUDIT_RETENTION_ENABLED') is about warn-not-fail semantics, not about defaults, so it is not actually a false statement about the default. env.validation.ts:327 ('Defaults to ENABLED (unlike AUDIT_RETENTION_ENABLED which defaults disabled)') and delivery-log-retention.service.ts:63 ARE flatly wrong and must be corrected. Trim the claim to those two so the implementer does not rewrite a correct comment.

**Collateral risk**: Low, and correctly characterised. The genuinely important disclosure is pre-existing: audit_events is on an unannounced implicit 30-day window right now. Surfacing that must not be 'fixed' by disabling the job. Deleting the threat-intel enable gate removes an operator kill switch without a deploy — a real reduction in operational control that the spec correctly flags for explicit owner acknowledgement. No PROVEN-WORKING capability is touched: the injected scope cannot reach malware verdicts, so the supply-chain package gate (proven live: is-odd ALLOW, lodash/event-stream BLOCK) is structurally out of reach. No agent or contract impact.

**Effort correction**: S is optimistic. Fix (c) 'make the deletion auditable' means a new durable retention record for TWO services — in the audit lane that implies a new event type and registration in audit-protected-types (the spec's own reference to the AUDIT_LOGS_DELETED exemption). With the batched rewrite of both prune methods, six tests, and three comment corrections, this is M (1-2d).


---

## F37 - Package precompute cache is empty AND unreadable: an off-by-default flag plus a CERAGON_ENV default that silently points prod at staging tables

- **Severity**: MEDIUM
- **Side**: multi   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

The emptiness is CONFIRMED and its cause is identified; the CONSEQUENCE is DISPROVEN, and two code defects the writeup did not name are the actionable part.

WHICH CACHE IS EMPTY vs POPULATED - settled from source. There are THREE distinct caches and the writeup conflates them.
  * DynamoDB ceragon-{env}-artifact-alias and -artifact-catalog: the precompute fast path. Written by EXACTLY ONE component - Ceragon-Intelligence/src/workers/artifact-fetcher.ts (catalog at :432,948,956; alias at :996,1125,1150). Nothing else writes them. Empty because the fetcher is not producing.
  * DynamoDB ceragon-production-artifact-verdict: the 1170-row table the evidence found. Its rows are 100% endpoint-advisory content because a DIFFERENT writer produces them - src/advisory/advisory-endpoint-verdict-writer.ts, driven by advisory-sync-runner.ts (a scheduled runner, not one of the four ECS services). Its rows carry decisionSource='advisory-bumblebee' and are read via lookupEndpointVerdict (verdict-alias-lookup.service.ts:262-286), a path that bypasses the alias table entirely. So one writer still runs while the package writer does not - which is exactly why the table looks 'populated but wrong'.
  * The relational/threat-intel path (threat_intel_entries + CVE/GHSA advisories + policy rules) - untouched by any of this.

'INSTALLS OVER-BLOCK' IS DISPROVEN, by the evidence file's own SC section and by the code. The precompute is Phase 3 of fastgate, a FAST PATH ONLY (fastgate.service.ts:2440-2665). It runs AFTER the deterministic malware/allowlist/denylist/typosquat checks and BEFORE the tenant/global cache. A miss falls through to TenantDecisions -> global cache -> fresh analysis and every lookup error is explicitly swallowed with 'Precomputed verdict lookup failure must NEVER block the install-time path' (:2657-2663). The live trials agree: is-odd@3.0.1 ALLOWED, lodash@4.17.4 and event-stream@3.3.6 correctly BLOCKED from the malware/CVE path. So the empty precompute costs LATENCY and FRESHNESS, not correctness, and the '(preliminary)' tag observed on lodash is the honest signal working as designed. The gate logic is correct and must not be touched - agreed.

THE TWO REAL CODE DEFECTS:
  (i) OFF-BY-DEFAULT FEATURE FLAG. verdict-alias-lookup.service.ts:212: `if (process.env.PRECOMPUTED_VERDICT_ENABLED !== 'true') { ... return; }` leaves isEnabled=false, so lookupByVersion returns null at :237 before touching DynamoDB. If that variable is not set in backend:301 then the reader is dead REGARDLESS of whether the tables are populated - and no backfill would change anything. This is a textbook off-by-default flag on a shipped capability and it violates the no-feature-flags invariant directly.
  (ii) SILENT STAGING FALLBACK. verdict-alias-lookup.service.ts:72: `const ENV = process.env.CERAGON_ENV || 'staging';` evaluated at MODULE LOAD, feeding every name in TABLE_NAMES (:75-86). If CERAGON_ENV is unset or misspelled in the backend task definition, the production backend reads ceragon-staging-artifact-alias / -catalog / -verdict. That is precisely the measured symptom ('the prod forensics-cache env points at the STAGING table, 6 rows'). The same `|| 'staging'` default is duplicated in FOUR places: this inlined copy plus all three shared-contracts mirrors (package-intelligence/table-names.ts:7 and s3-layout.ts:7 in each). A separate, related pointer defect: dynamodb-cache.service.ts:644 reads DYNAMODB_ARTIFACT_CACHE_TABLE with no environment assertion at all, so it will happily attach to a staging table name and log 'DynamoDB connectivity VERIFIED' (:690) against it.

WHY THE FETCHER IS NOT PRODUCING - see F9. It runs on Hetzner (deploy/hetzner/compose/intel-cluster.compose.yml:74), not ECS, so its ECS 0/0 is expected and tells you nothing.

BACKFILL SHAPE (asked for explicitly): the release-observation queue has 14-day retention (src/contracts/queue-definitions.ts:23-27), so any backlog from the June power-off has ALREADY EXPIRED - a power-on drains nothing. Recovery is cursor-driven: npm-follower resumes from the durable cursor (:297-303), enters catchup mode above a 500-change gap (:50), and walks _changes at CATCHUP_BATCH_LIMIT=100 per poll with a 500ms catchup interval (:48,:53) and PACKUMENT_CONCURRENCY=20 (:56). The change-feed re-walk is hours, but every observed release then enqueues an artifact fetch plus static analysis, so wall-clock to a useful alias/catalog population is bounded by fetch+analysis throughput and is DAYS, not hours - and only for packages published since the cursor position. It is NOT a full-registry backfill; packages that have not published a new version since the cursor will never get an alias row from the follower path at all. If broad coverage is the goal, that requires the hotset/reconciliation seeding path (src/pipeline/hotset/, src/pipeline/reconcile/rescan-planner.ts:265), not the followers.

### Evidence (read at origin/main)

- `Backend/src/package-intelligence/services/verdict-alias-lookup.service.ts:212-215 (PRECOMPUTED_VERDICT_ENABLED !== 'true' -> disabled, returns early)`
- `Backend/src/package-intelligence/services/verdict-alias-lookup.service.ts:237 (lookupByVersion returns null when disabled)`
- `Backend/src/package-intelligence/services/verdict-alias-lookup.service.ts:72-86 (CERAGON_ENV || 'staging' at module load feeding all TABLE_NAMES)`
- `Backend/src/package-intelligence/services/verdict-alias-lookup.service.ts:262-286 (lookupEndpointVerdict - the advisory path that bypasses the alias table)`
- `Backend/src/packages/services/fastgate.service.ts:2440-2459 (Phase 3 precomputed fast path, ordering documented)`
- `Backend/src/packages/services/fastgate.service.ts:2657-2663 (lookup failure must never block install)`
- `Backend/src/packages/services/dynamodb-cache.service.ts:644,690 (DYNAMODB_ARTIFACT_CACHE_TABLE unvalidated; logs VERIFIED against whatever it points at)`
- `Ceragon-Intelligence/src/workers/artifact-fetcher.ts:432,948,956 (sole ARTIFACT_CATALOG writer)`
- `Ceragon-Intelligence/src/workers/artifact-fetcher.ts:996,1125,1150 (sole ARTIFACT_ALIAS writer)`
- `Ceragon-Intelligence/src/advisory/advisory-endpoint-verdict-writer.ts + advisory-sync-runner.ts:431-442 (the different writer behind the 1170 populated rows)`
- `Ceragon-Intelligence/src/contracts/queue-definitions.ts:6,23-27 (CERAGON_ENV||'staging'; 14-day release-observation retention)`
- `Ceragon-Intelligence/src/followers/npm-follower.ts:48,50,53,56,297-303 (catchup constants and durable-cursor resume)`
- `Ceragon-Intelligence/deploy/hetzner/compose/intel-cluster.compose.yml:74 (artifact-fetcher runs on Hetzner)`
- `packages/shared-contracts/src/package-intelligence/table-names.ts:7 and s3-layout.ts:7 in all three mirrors (same 'staging' default)`

### Fix

(a) DELETE THE FLAG. Remove the PRECOMPUTED_VERDICT_ENABLED check at verdict-alias-lookup.service.ts:212-215. onModuleInit keeps only the genuine capability precondition - AWS_REGION present (:217-220) - and logs which tables it bound. A capability that is correct and shipped must be ON; and because a miss falls through harmlessly (proven above), enabling it cannot make any install stricter. This is the rare no-flags fix that carries no enforcement risk.

(b) FAIL LOUD ON THE ENVIRONMENT, IN ALL FOUR COPIES. Replace `process.env.CERAGON_ENV || 'staging'` with a resolver that (i) returns the value when set, (ii) in production (NODE_ENV/app.nodeEnv === 'production') THROWS rather than defaulting, and (iii) keeps 'staging' as an explicit local/dev default. Apply to Backend/src/package-intelligence/services/verdict-alias-lookup.service.ts:72 AND to package-intelligence/table-names.ts:7 + s3-layout.ts:7 in ALL THREE shared-contracts mirrors. Silently reading another environment's security data is worse than not reading it - a staging verdict served to a production install is a correctness hazard, not just a miss. Note this is a THROW at first use of the table names, not a boot assertion of a secret - it does not resurrect the boot-assert failure mode, and to keep it that way the resolver must be evaluated lazily (a function), not at module load as it is today.

(c) ASSERT THE ARTIFACT-CACHE POINTER. In dynamodb-cache.service.ts around :644-656, refuse to bind a table whose name does not match the running environment (e.g. reject a '-staging' suffixed table when NODE_ENV is production) and log a loud error instead of the current 'VERIFIED' line. This is the specific defect the evidence measured as 'forensics-cache env points at the STAGING table'.

(d) MAKE EMPTINESS VISIBLE INSTEAD OF SILENT. Today a permanently-empty precompute is indistinguishable from a healthy one at every surface, because a miss just falls through. Add a counter/health field for precompute hit-rate and last-successful-alias-hit age, and surface 'precompute cold - verdicts are live-analysis only' as an honest degraded state. This is what turns F37 from something only a DynamoDB scan can find into something a dashboard shows. It pairs directly with the F9 liveness deliverable.

(e) POPULATION (ops, specified for the owner): the alias/catalog cache is populated only by artifact-fetcher on the Hetzner compose stack, fed by the four followers. Restart that stack; the followers resume from their durable cursors and enter catchup. Expect hours for the change-feed re-walk and DAYS before alias/catalog coverage is materially useful, and understand it covers only packages that publish AFTER the cursor position - broad coverage needs the hotset/reconciliation seeding path, which is a separate operation.

DO NOT change the gate logic. It is correct and fail-closed and the live trials prove it discriminates.

### Changes

**Backend** - `src/package-intelligence/services/verdict-alias-lookup.service.ts`

Delete the PRECOMPUTED_VERDICT_ENABLED early return (:212-215) so the service enables whenever AWS_REGION is present. Replace the module-load `const ENV = process.env.CERAGON_ENV || 'staging'` (:72) and the derived TABLE_NAMES const (:75-86) with a lazily-evaluated resolver that throws in production when CERAGON_ENV is unset, and update the TableName references (:473,488,518,540 and the endpoint path) to call it.

**Backend** - `packages/shared-contracts/src/package-intelligence/table-names.ts`

Replace the module-load `const ENV = process.env.CERAGON_ENV || 'staging'` (:7) with the same lazy, production-throwing resolver; make tablePrefix() and TABLE_NAMES lazy accessors so evaluation happens at use, not import. Same change in s3-layout.ts:7. CONTRACT MIRROR - must be applied identically in all three copies.

**Ceragon-Intelligence** - `packages/shared-contracts/src/package-intelligence/table-names.ts`

Identical change (mirror 2 of 3). Same for s3-layout.ts:7.

**config** - `workspace packages/shared-contracts/src/package-intelligence/table-names.ts`

Identical change (mirror 3 of 3). Same for s3-layout.ts:7. All three mirrors must land in one change or the contract-parity check fails.

**Backend** - `src/packages/services/dynamodb-cache.service.ts`

At :643-656, validate DYNAMODB_ARTIFACT_CACHE_TABLE against the running environment before binding; refuse and log an error for a cross-environment table name instead of proceeding to the 'connectivity VERIFIED' log at :690.

**Backend** - `src/package-intelligence/services/verdict-alias-lookup.service.spec.ts`

Add: service is enabled with no PRECOMPUTED_VERDICT_ENABLED set; table names resolve to ceragon-production-* with CERAGON_ENV=production; unset CERAGON_ENV in production throws at first use rather than resolving to staging.

**config** - `ECS task definition (backend family)`

Ensure CERAGON_ENV=production is set and DYNAMODB_ARTIFACT_CACHE_TABLE points at the production artifact-analysis-cache table. Remove PRECOMPUTED_VERDICT_ENABLED if present - the flag is being deleted.

### Tests (each carries a defeat step)

- Flag-removal test: construct the service with NO PRECOMPUTED_VERDICT_ENABLED and AWS_REGION set; assert isEnabled and that lookupByVersion issues a DynamoDB GetItem. DEFEAT STEP: unset AWS_REGION and assert it disables - proving the first assertion exercised the enable path rather than a stub that always queries.
- Cross-environment guard test: NODE_ENV=production with CERAGON_ENV unset; assert first use THROWS and never issues a request against a '-staging' table name. DEFEAT STEP: set CERAGON_ENV=production and assert the resolved name is ceragon-production-artifact-alias - this proves the throw is conditional on the misconfiguration and has not simply broken the resolver.
- Fall-through invariant test (protects the gate logic): stub lookupByVersion to return null and run a benign package through fastgate; assert the decision is ALLOW via the normal path, not BLOCK. DEFEAT STEP: stub it to THROW instead of returning null and assert the decision is still ALLOW - this pins the :2657-2663 swallow and is the direct regression test for the disproven 'over-block' hypothesis.
- Contract-parity test: assert the three shared-contracts copies of table-names.ts and s3-layout.ts are byte-identical. DEFEAT STEP: change one mirror only - the test must fail. This is the guard that keeps the four-copy defect from re-diverging.
- Precompute-coldness surfacing test: with zero alias rows, assert the health/metric surface reports precompute cold with an explicit reason. DEFEAT STEP: assert it does NOT report healthy - an empty cache that reads as green is the exact failure this finding is.

### Risks

(1) Making the CERAGON_ENV resolver THROW in production converts a silent wrong-data read into a hard failure on the precompute path; the fastgate try/catch at :2657-2663 already swallows lookup errors, so a misconfigured deploy degrades to live analysis rather than failing installs - verify that swallow covers the construction path too, or the throw could escape at module init. Keep it lazy for exactly this reason. (2) Turning the reader on means production installs will begin consulting DynamoDB on the hot path - currently zero traffic; confirm IAM read permissions and table capacity before enabling, or the first enabled deploy generates a burst of AccessDenied warnings (harmless, since it falls through, but noisy). (3) Enabling the reader against a POPULATED but STALE cache would start serving old verdicts - this is why (b) and the F9 freshness signal must land together; an enabled reader over a stale cache is worse than a disabled one. (4) Contract mirrors: all three must land together. No agent-facing wire change.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED. verdict-alias-lookup.service.ts:72 is `const ENV = process.env.CERAGON_ENV || 'staging';` evaluated at module load, feeding TABLE_NAMES at :75-86; :212-215 is the PRECOMPUTED_VERDICT_ENABLED !== 'true' early return leaving isEnabled=false (:206); :237 and :267 both return null when disabled; :262-286 is lookupEndpointVerdict. fastgate.service.ts Phase 3 sits after the deterministic checks with the documented ordering, and the lookup-error swallow ('Precomputed verdict lookup failure must NEVER block the install-time path') is exactly where claimed. dynamodb-cache.service.ts onModuleInit reads DYNAMODB_ARTIFACT_CACHE_TABLE with no environment assertion and logs 'DynamoDB connectivity VERIFIED' against whatever it binds. artifact-fetcher.ts is the sole ARTIFACT_CATALOG writer (:432,:948,:956) and sole ARTIFACT_ALIAS writer (:996,:1125,:1150). queue-definitions.ts release-observation retention is 14 days. npm-follower constants (CATCHUP_BATCH_LIMIT 100, CATCHUP_GAP_THRESHOLD 500, CATCHUP_POLL_INTERVAL_MS 500, PACKUMENT_CONCURRENCY 20) and the durable-cursor resume are all as stated. The DISPROVEN of 'installs OVER-BLOCK' is correct.
- COLLATERAL — THE 'CANNOT MAKE ANY INSTALL STRICTER' CLAIM IS FALSE FOR THE SECOND CONSUMER. endpoint.service.ts:66 calls lookupEndpointVerdict for the SYNTHETIC_SHA ecosystems, which are mcp and editor-extension. Today isEnabled=false means that call returns null and resolve() returns ALLOW/noData for every MCP server and editor extension. Deleting the flag turns on live BLOCK verdicts sourced from ceragon-production-artifact-verdict — the same 1170-row table the spec itself describes as '100% endpoint-advisory content' that nobody in this engagement validated. This lands directly on 'MCP discovery-to-console for discovered servers', one of the capabilities PROVEN WORKING in this engagement (codegraph discovered, classified allow, propagated to the Control Tower). A day-one deploy could start blocking discovered MCP servers and editor extensions on unreviewed data. This must be stated and the table's contents reviewed before the flag is deleted — not gated behind a new flag, but validated as data.
- COLLATERAL — THE PRODUCTION THROW IS NOT CONTAINED ON THE ENDPOINT PATH. endpoint.service.ts documents its error policy explicitly: 'Infrastructure errors from the lookup (DynamoDB down, etc.) propagate. The /check-extension route surfaces them as 5xx.' So the fastgate try/catch the spec relies on does NOT cover lookupEndpointVerdict. A production throw on unset CERAGON_ENV becomes a 5xx on the extension/MCP check route, and on the /inventory route it becomes a degraded ALERT finding for every item. Risk (1) only considers the fastgate swallow.
- THE CONTRACT-PARITY TEST FAILS ON DAY ONE — THE MIRRORS ARE ALREADY DIVERGENT, AND THE DIVERGENCE IS ITSELF AN UNREPORTED DEFECT. Backend/packages/shared-contracts/src/package-intelligence/s3-layout.ts declares RAW_ARTIFACTS `${BUCKET_PREFIX}-${ENV}-raw-artifacts`, EXTRACTED_METADATA `-extracted-metadata`, VERDICT_SNAPSHOTS `-verdict-snapshots`; Ceragon-Intelligence/packages/shared-contracts/src/package-intelligence/s3-layout.ts declares `-raw`, `-meta`, `-snap`. table-names.ts also differs (ENV at :7 behind a 6-line header vs ENV at :1). A byte-identical assertion cannot pass, and — far worse — a blind 'apply the same edit to all three mirrors' copy-paste would silently rename three S3 buckets in Ceragon-Intelligence and point the pipeline at buckets that do not exist.
- The spec's crossCutting says 'only F37 touches shared contracts' and then lists 3 mirrors x 2 files = 6 contract files plus the Backend's inlined 4th copy. That is a 7-file contract change, not a footnote; it should be planned as such.

**Corrected root cause**: Both named defects are real and correctly pinned (off-by-default flag at :212-215; module-load `|| 'staging'` at :72 duplicated in four places). What the spec missed is that the reader has TWO consumers, not one: fastgate's package fast path (error-swallowing, miss-tolerant) and endpoint.service.resolve() for mcp/editor-extension (error-PROPAGATING, and today unconditionally ALLOW because the service is disabled). Enabling the reader is a behaviour change on the second consumer, and throwing on a bad environment is a 5xx there. Separately, the three shared-contract mirrors are already out of parity on S3 bucket names, so 'apply identically to all three' is an actively dangerous instruction as written.


**Corrected approach**: (a) Delete the PRECOMPUTED_VERDICT_ENABLED gate as specified — but land it together with a review of ceragon-production-artifact-verdict's mcp/editor-extension rows, because those become enforcing on the /check-extension and /inventory paths the moment the flag goes. Add a fall-through invariant test for endpoint.service.resolve() mirroring the fastgate one. (b) Make the CERAGON_ENV resolver lazy and production-strict, but do NOT throw: log a loud error and leave the service DISABLED (isEnabled=false) on a cross-environment or unset value in production. That gets the same 'never silently read staging security data' property, keeps the endpoint path from 5xx-ing, and preserves the honest negative (the precompute-coldness surface from (d) then reports the misconfiguration by name). (c) dynamodb-cache assertion: keep as specified. (d) precompute-coldness health surface: keep — it is the part that turns this from a DynamoDB-scan-only finding into something a dashboard shows, and it pairs with F9. (e) Mirrors: FIRST reconcile the existing s3-layout.ts bucket-name divergence as an explicit, separately-reviewed decision naming which side matches the deployed buckets; THEN apply the resolver change; and make the parity test SEMANTIC (compare exported resolved values under a fixed CERAGON_ENV) rather than byte-wise, because the files legitimately differ in header comments.


**Missing changes the reviewer found**:

- **Backend** `src/endpoint/endpoint.service.ts` - Add a fall-through/containment test and, if the resolver is made strict, ensure resolve() does not convert a configuration error into a 5xx on /check-extension. The class doc at :49-56 documents error propagation as intentional — that policy interacts with the new resolver and must be reconciled explicitly.
- **Ceragon-Intelligence** `packages/shared-contracts/src/package-intelligence/s3-layout.ts` - PRE-REQUISITE, not part of the resolver change: the Intel mirror declares -raw/-meta/-snap while the Backend mirror declares -raw-artifacts/-extracted-metadata/-verdict-snapshots. Determine which matches the deployed buckets and reconcile BEFORE any mirrored edit. Copy-pasting the Backend copy over this file would repoint the pipeline at non-existent buckets.
- **config** `Data review of ceragon-production-artifact-verdict (mcp + editor-extension rows)` - Deleting the enable gate makes these rows enforcing on the endpoint path for the first time. Review the BLOCK rows before the flag is removed; this is a data gate, not a feature gate.

**Collateral risk**: HIGH as written, on a capability PROVEN WORKING in this engagement. Enabling the reader activates lookupEndpointVerdict for mcp and editor-extension via endpoint.service.ts:66, which currently always returns ALLOW/noData. New BLOCKs there hit the MCP Control Tower / discovered-server lane that was proven live (codegraph discovered -> classified -> propagated 0->1). The package supply-chain gate itself is NOT at risk (fastgate's swallow and fall-through are verified), and command-lane blocking, DLP, browser masking, Codex wire blocking and signed-bundle propagation are untouched. The other real hazard is the mirror copy-paste renaming Intelligence's S3 buckets.

**Effort correction**: M is optimistic. Flag deletion + a lazy resolver in four copies + reconciling a pre-existing mirror divergence + the dynamodb-cache assertion + a new precompute-coldness health surface + the endpoint-path containment work is M-to-L (2-4d).


---

## F9 - Intelligence pipeline liveness is unknowable: ECS 0/0 is CORRECT (the active path is Hetzner) and the metrics/alarms that would show the real path are dead code

- **Severity**: HIGH
- **Side**: ops   **Effort**: L   **Root cause verdict**: REVISED
- **Also closes**: F11, F37

### Root cause

The measurement is right, the verdict 'intentional power-down' is wrong for three of the four services, and the true situation is worse than reported.

ECS IS NOT WHERE THE PIPELINE LIVES. Ceragon-Intelligence/deploy/hetzner/compose/intel-cluster.compose.yml runs multi-follower (:46) and artifact-fetcher (:74) as docker-compose services on Hetzner; sandbox.compose.yml:69 runs intel-sandbox-worker. docs/customer-pack/control-statements.md (AVL-5) states the Intel pipeline is replicated on Hetzner Cloud and 'either side can be the active execution path; same SQS / S3 / DDB shared'. ceragon-power-on.ps1:17-19 says it in the operational voice: Intel ECS workers 'remain at desiredCount=0 because the source of truth says Hetzner is the active Intel worker path'. So ECS desired=0/running=0 with rollout=COMPLETED/status=ACTIVE is not a green surface on a dead path - it is ECS accurately reporting an empty service that is CORRECTLY empty.

THE POWER SCRIPTS CANNOT RESTORE WHAT WAS NEVER RECORDED. scripts/ceragon-power-state.json (saved 2026-06-26) lists exactly ONE intelligence service under ecsServices - ceragon-intel-sandbox-worker-production at desiredCount=0 (:54-61). artifact-fetcher, multi-follower and intel-static-worker are ABSENT ENTIRELY. scalableTargets (:63-103) likewise contains only the intel sandbox worker among intel resources. And the script's own defaults (ceragon-power-on.ps1:133-141) pin all four intel services to desiredCount=0. So the F9 note is CONFIRMED and broader: power-on restores NONE of the four, and multi-follower has no scalable target in either the saved state or the defaults (:165-185 lists only artifact-fetcher, intel-static-worker, intel-sandbox-worker).

THE ACTUAL DEFECT, WHICH IS SEVERE: there is no surface anywhere - console, ECS, or CloudWatch - that reports whether the ACTIVE execution path is producing. And F37 proves it is NOT: the alias and catalog tables, written only by artifact-fetcher, are empty. So the Hetzner side is down or broken and every available surface is silent, because every surface is AWS-shaped and the active path is outside AWS.

WHY NOTHING ALARMED. Ceragon-Intelligence/src/operations/metrics.service.ts:139 defines MetricsService; a repo-wide grep shows its ONLY importers are alarms.ts:8 and dashboards.ts:8, and both import the metric-NAME constants (PIPELINE_METRICS, PRODUCT_METRICS, ...), never the class. Nothing anywhere calls it - ZERO metric producers. buildAlarmDefinitions (operations/alarms.ts:34) has ZERO appliers: no script, workflow, or IaC in the repo calls PutMetricAlarm. The alarm design is actually correct - feed-lag alarms already set treatMissingData:'breaching' (alarms.ts:53), which is exactly the posture that would have fired the day the followers stopped. It was written, merged, and never deployed.

### Evidence (read at origin/main)

- `Ceragon-Intelligence/deploy/hetzner/compose/intel-cluster.compose.yml:46,74 (multi-follower and artifact-fetcher run on Hetzner)`
- `Ceragon-Intelligence/deploy/hetzner/compose/sandbox.compose.yml:69 (intel-sandbox-worker on Hetzner)`
- `docs/customer-pack/control-statements.md AVL-5 ('either side can be the active execution path; same SQS / S3 / DDB shared')`
- `scripts/ceragon-power-on.ps1:17-19 (Hetzner is the active Intel worker path)`
- `scripts/ceragon-power-on.ps1:133-141 (defaults pin all four intel services to desiredCount=0)`
- `scripts/ceragon-power-on.ps1:165-185 (scalable-target defaults omit multi-follower)`
- `scripts/ceragon-power-state.json:54-61 (only intel-sandbox-worker recorded; the other three absent)`
- `scripts/ceragon-power-state.json:63-103 (scalableTargets contains only the intel sandbox worker)`
- `Ceragon-Intelligence/src/operations/metrics.service.ts:139 (MetricsService - zero callers repo-wide)`
- `Ceragon-Intelligence/src/operations/alarms.ts:8,34,53 (imports metric NAMES only; buildAlarmDefinitions has zero appliers; treatMissingData:'breaching' already correct)`
- `Ceragon-Intelligence/src/workers/artifact-fetcher.ts:996,1125,1150 (sole alias writer - its output is empty per F37, so the active path is not producing)`
- `Ceragon-Intelligence/src/contracts/queue-definitions.ts:23-27 (14-day release-observation retention - a backlog cannot survive the outage)`

### Fix

Stop reporting a CONFIG fact as health; report a DATA fact, and make it execution-path agnostic so it is true whether the pipeline runs on ECS or Hetzner.

(a) DERIVE LIVENESS FROM DATA, NOT FROM desiredCount. Build one pipeline-freshness reader over facts that both execution paths write to the same shared stores: newest updatedAt in ceragon-{env}-release-observation-cursors per source (npm/pypi/cargo/go), newest write to ceragon-{env}-artifact-alias, newest write to -artifact-verdict, and the depth+oldest-message-age of the release-observation and artifact-fetch-background queues. These are the SHARED SQS/S3/DDB the AVL-5 control statement names, so they answer 'is the pipeline producing' without needing to know which side is active. Express the result in the product's existing honest vocabulary: PRODUCING (with the measured freshness), NOT PRODUCING (with the measured staleness age), and NOT MEASURED when the stores themselves cannot be read - never 'healthy'.

(b) EMIT THE METRICS THAT ARE ALREADY DEFINED. Wire MetricsService into the followers (after each successful cursor advance: FEED_LAG_SECONDS per ecosystem) and into artifact-fetcher (per successful alias/catalog write). No new metric names are needed - PIPELINE_METRICS already declares them. This is the missing producer, and it is the smallest change that makes the existing alarm design real.

(c) ACTUALLY DEPLOY THE ALARMS. Add a deploy step that calls buildAlarmDefinitions() and applies each via PutMetricAlarm. Do not redesign them: alarms.ts:53 already sets treatMissingData:'breaching' on feed lag, which means silence is treated as failure - the correct posture and the one that would have caught this on day one.

(d) MAKE THE POWER SCRIPTS STOP LYING BY OMISSION. Either remove the four intel ECS services from ceragon-power-on.ps1's defaults entirely, or annotate each with an explicit 'not the active execution path - see AVL-5' note and have the script PRINT that when it skips them. Right now the script silently restores them to 0 and an operator reasonably concludes it restored the pipeline. If ECS is ever meant to be the active side, the missing multi-follower scalable target must be registered - but per (a) that is a separate decision, not a prerequisite for honest surfacing.

(e) SURFACE THE EXECUTION PATH ITSELF. Whatever console tile reports intelligence status must name which side is active and when it last produced. A pipeline that is intentionally idle and a pipeline that is broken look identical today; the fix is to make the product state which one it is, using the measured freshness from (a).

This single deliverable also closes the observability half of F37 and F11 - see closesAlso.

### Changes

**Ceragon-Intelligence** - `src/operations/pipeline-freshness.ts`

New. Reads newest updatedAt per source from TABLE_NAMES.RELEASE_OBSERVATION_CURSORS, newest write timestamps from ARTIFACT_ALIAS and ARTIFACT_VERDICT, queue depth from SQS GetQueueAttributes, and queue age from the CloudWatch SQS `ApproximateAgeOfOldestMessage` metric for the release-observation and artifact-fetch-background queues. Returns a typed {state: 'PRODUCING'|'NOT_PRODUCING'|'NOT_MEASURED', perSource, measuredAt, stalenessSeconds} - no boolean 'healthy'.

**Ceragon-Intelligence** - `src/followers/npm-follower.ts`

After each successful cursor save (around :342-349 and :414-416) emit PIPELINE_METRICS.FEED_LAG_SECONDS via MetricsService with Dimension Ecosystem=npm. Mirror in pypi-follower.ts, cargo-follower.ts, go-follower.ts.

**Ceragon-Intelligence** - `src/workers/artifact-fetcher.ts`

Emit a MetricsService datum on each successful ARTIFACT_ALIAS write (:996,1125,1150) and ARTIFACT_CATALOG write (:432,948,956), so 'the fetcher is producing' becomes a measured fact rather than an inference from ECS state.

**Ceragon-Intelligence** - `scripts/apply-alarms.ts (new) plus a deploy workflow step`

Call buildAlarmDefinitions() and PutMetricAlarm each definition, mapping severity to the SNS topic ARNs. Idempotent. Run on deploy. Do not modify the alarm thresholds or treatMissingData values.

**Backend** - `src/health/controllers/health.controller.ts plus a new intelligence-freshness read`

Expose the freshness result on an authenticated route the console can render, using the honest three-state vocabulary. Must return the measured staleness age, never a bare boolean.

**ops** - `scripts/ceragon-power-on.ps1`

Lines 133-141 and 165-185: either drop the four ceragon-intelligence-production entries or annotate them 'not the active execution path (AVL-5 - Hetzner)' and print that annotation when skipping, so an operator is not told the pipeline was restored. If ECS is to become the active side, register the missing scalable target for ceragon-multi-follower-production.

### Tests (each carries a defeat step)

- Freshness-state test: seed the cursor table with an updatedAt 30 days old and assert state==='NOT_PRODUCING' with the staleness age reported. DEFEAT STEP: seed a cursor updated 60 seconds ago and assert 'PRODUCING' - proving the reader distinguishes the two and is not hardcoding one branch.
- Unreadable-store test: make the DynamoDB read fail and assert state==='NOT_MEASURED', NOT 'NOT_PRODUCING'. DEFEAT STEP: assert the response never contains 'PRODUCING' on a read failure - conflating 'cannot measure' with either verdict is the exact honesty failure being fixed.
- Metric-producer test: run a follower against a stubbed change feed and assert MetricsService received a FEED_LAG_SECONDS datum. DEFEAT STEP: comment out the emit call - the test must fail. Without this step the test could pass by asserting on the CONSTANT rather than on an emission, which is precisely how the current dead ops layer passed review.
- Alarm-application test: run the apply script against a mocked CloudWatch and assert every definition from buildAlarmDefinitions() was submitted, and that feed-lag alarms carry treatMissingData='breaching'. DEFEAT STEP: change one definition's treatMissingData to 'notBreaching' - the test must fail, since that single value is what turns silence into a signal.
- End-to-end absence test: with NO metrics emitted at all, assert the feed-lag alarm evaluates to ALARM (not INSUFFICIENT_DATA). DEFEAT STEP: this is the test that would have caught the original defect - verify it fails if treatMissingData reverts.
- Power-script honesty test: run ceragon-power-on.ps1 -WhatIf and assert the output explicitly states the intel services were skipped and why. DEFEAT STEP: assert the output does NOT claim the intelligence pipeline was restored.

### Risks

(1) Deploying alarms whose metrics are not yet emitted will immediately fire ALARM everywhere because treatMissingData='breaching' - ship (b) the producers BEFORE (c) the alarm application, or the first deploy is an alert storm that gets the alarms muted, which recreates the defect. (2) The freshness reader adds DynamoDB and SQS reads to a health path; cache it and make failures return NOT_MEASURED rather than throwing. (3) Changing the power scripts touches live operational tooling - the annotation-only variant is the safe default; removing entries changes what a future power-off records. (4) Surfacing 'NOT PRODUCING' honestly will make a long-standing outage visible in the console for the first time; that is the point, but it should not be mistaken for a new regression. (5) No agent or contract impact.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED. deploy/hetzner/compose/intel-cluster.compose.yml runs multi-follower (:46) and artifact-fetcher (:74) as compose services (plus 3x intel-static-worker at :33/:38/:43); sandbox.compose.yml:69 runs intel-sandbox-worker. docs/customer-pack/control-statements.md:130 carries AVL-5 verbatim: 'Intel pipeline replicated on Hetzner Cloud; either side can be the active execution path; same SQS / S3 / DDB shared'. ceragon-power-on.ps1's synopsis says Intel ECS workers 'remain at desiredCount=0 because the source of truth says Hetzner is the active Intel worker path', and Get-DefaultState pins all four intel services to desiredCount=0 while the scalableTargets defaults list only artifact-fetcher, intel-static-worker and intel-sandbox-worker — multi-follower has NO scalable target, exactly as claimed. ceragon-power-state.json records only ceragon-intel-sandbox-worker-production among intel services. MetricsService (operations/metrics.service.ts:139) has ZERO importers outside its own spec. buildAlarmDefinitions (operations/alarms.ts:35) is referenced only by alarms.spec.ts — zero appliers, no PutMetricAlarm anywhere in the repo. Feed-lag alarms do set treatMissingData:'breaching'. The MAJOR CORRECTION to the F9 premise is right and important.
- closesAlso: ['F11'] IS WRONG AND WILL MIS-PLAN THE WAVE. F11's gap is a per-installation webhook-arrival fact in Postgres — github-installation.entity.ts has no last_webhook_at and github_webhook_deliveries is pruned at 24h (github-app.controller.ts:74, cleanupExpiredDeliveries). Nothing in the intelligence-freshness deliverable produces that fact. F9 closes the observability half of F37 (precompute coldness) but not F11. Remove F11 from closesAlso or F11 will be planned as covered and ship unfixed.
- MISSING — CREDENTIALS/IAM FOR THE METRIC PRODUCERS. Fix (b) wires MetricsService into the followers and artifact-fetcher, which per the spec's own correction run on HETZNER, outside AWS. Those containers need AWS credentials and cloudwatch:PutMetricData in the compose environment. This is the single fact that decides whether (b) works at all, and it is not in the spec.
- MISSING — WHERE THE FRESHNESS READER LIVES FOR THE BACKEND. The spec creates Ceragon-Intelligence/src/operations/pipeline-freshness.ts and then adds 'a new intelligence-freshness read' to Backend/src/health/controllers/health.controller.ts. The Backend cannot import from Ceragon-Intelligence — they are separate repos with no dependency (the codebase's own workaround for exactly this is the inlined copy pattern at verdict-alias-lookup.service.ts and the release-manifest.types.ts header). Decide: shared-contracts (which makes this a FOURTH contract surface subject to the three-mirror rule) or a deliberate second implementation in the Backend. As written this change is not implementable.
- MISSING — BACKEND IAM. The backend task role needs dynamodb read on ceragon-production-release-observation-cursors / -artifact-alias / -artifact-verdict, sqs:GetQueueAttributes for queue depth, and cloudwatch:GetMetricData or cloudwatch:GetMetricStatistics for the SQS age metric. Not stated.
- DESIGN — 'newest write to ARTIFACT_ALIAS' IS AN O(TABLE) SCAN. There is no write-time index on that table (contracts/table-definitions.ts defines it keyed on aliasKey), so 'newest write' means a full Scan of a table intended to hold millions of rows — on a health route. Use the cursors table (small, per-source) as the primary freshness signal and have artifact-fetcher stamp a single heartbeat item (e.g. in SYSTEM_CONFIG) on each successful alias/catalog write. That is also cheaper than the metric emission and gives the same fact.
- OPS-FILE CITATION HYGIENE: ceragon-power-on.ps1 and ceragon-power-state.json are cited from the user workspace, and both show as MODIFIED in the working tree at session start. They are not a committed baseline; the implementer must re-read them before editing.

**Corrected approach**: Keep the core reframe — liveness must be a DATA fact, expressed as PRODUCING / NOT PRODUCING / NOT MEASURED, execution-path agnostic — it is the right answer and the honesty vocabulary is correct. Repair four things. (1) Drop F11 from closesAlso. (2) Base freshness on the cursors table plus a fetcher-written heartbeat item, not on 'newest row' in ARTIFACT_ALIAS; add queue depth + ApproximateAgeOfOldestMessage as secondary signals. (3) State explicitly where the reader lives for the Backend (shared-contracts with all three mirrors, or a deliberate Backend implementation) and add the backend task-role IAM. (4) Add AWS credentials + cloudwatch:PutMetricData to the Hetzner compose environment as a named prerequisite of (b). Keep the ordering discipline in risk (1) — producers BEFORE alarm application, because treatMissingData:'breaching' otherwise fires everything at once and the alarms get muted, which recreates the defect. Keep (d) power-script honesty: the annotate-and-print variant, not deletion.


**Missing changes the reviewer found**:

- **Ceragon-Intelligence** `deploy/hetzner/compose/intel-cluster.compose.yml and sandbox.compose.yml` - The metric emitters run here, outside AWS. Add the AWS credential environment/secret and confirm the IAM principal has cloudwatch:PutMetricData. Without this, fix (b) emits nothing and fix (c) alarms everything.
- **config** `Backend ECS task role IAM` - dynamodb:GetItem/Query/Scan on ceragon-production-release-observation-cursors and the artifact-alias/-verdict tables, sqs:GetQueueAttributes for queue depth, plus cloudwatch:GetMetricData or cloudwatch:GetMetricStatistics for the SQS age metric. Required for the health-route freshness read.
- **Ceragon-Intelligence** `src/workers/artifact-fetcher.ts` - In addition to the metric emission, stamp a single durable heartbeat item (e.g. TABLE_NAMES.SYSTEM_CONFIG key 'artifact-fetcher/last-alias-write') on each successful alias/catalog write, so freshness is a cheap GetItem instead of a table Scan.
- **Frontend** `the intelligence status tile` - Fix (e) says the console must name which side is active and when it last produced, but no Frontend file is listed. The tile must render the three-state vocabulary and the measured staleness age, never a boolean.

**Collateral risk**: Low on the enforcement side — nothing here touches command-lane blocking, DLP, browser masking, Codex wire blocking, signed-bundle propagation, the package gate, or MCP discovery. The real risks are operational and correctly named: deploying breaching-on-missing alarms before producers is an alert storm, and surfacing NOT PRODUCING honestly will make a long-standing outage visible for the first time (that is the point). One addition: the freshness read must be cached and must return NOT_MEASURED on failure, or a DynamoDB/SQS hiccup degrades an already-loaded health route.

**Effort correction**: L is wrong. This spans Ceragon-Intelligence (freshness reader + 5 metric-emitting processes + an alarm-apply script + a deploy step), the Backend (route + IAM), the Frontend (tile), the ops PowerShell, and credentials in the Hetzner compose environment. XL (>1 week), and it should be split: (a)+(e) surfacing is one deliverable, (b)+(c) metrics-and-alarms is another.


---

## F10 - Full-repo scanner lane admits jobs into a queue with no running consumer; the only liveness test is whether the queue URL is configured

> **Blocking API correction (2026-08-09):** `ApproximateAgeOfOldestMessage` is a CloudWatch SQS metric; it is not returned by `GetQueueAttributes`. Re-derive this preflight before coding. Depth may come from SQS `GetQueueAttributes`, while age requires CloudWatch `GetMetricData`/`GetMetricStatistics` (with explicit lag, period, cache, and `NOT_MEASURED` semantics) or another proven source. Add the matching task-role IAM. Do not implement the older pseudocode or defeat tests below literally where they ask the SQS client for age. See the official [GetQueueAttributes API](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_GetQueueAttributes.html) and [SQS CloudWatch metrics](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html).

- **Severity**: HIGH
- **Side**: backend   **Effort**: M   **Root cause verdict**: CONFIRMED

### Root cause

CONFIRMED exactly as described, and the mechanism is pinpointable to two lines.

The producer resolves its target at scan-dispatch.service.ts:526-529 (SQS_GITHUB_SCANNER_FULLREPO_JOBS_QUEUE_URL, falling back to ..._FULLREPO_QUEUE_URL) and enqueues at :1009-1022 when llmReviewMode==='OPUS_FULL_REPO' (:930).

THE ONLY CONSUMER-LIVENESS TEST IN THE WHOLE PATH IS :931 - `if (fullRepoLane && !this.scannerFullRepoQueueUrl)`. That is a CONFIG fact: it asks whether a URL string is set, never whether anything is reading the queue. When it fails, the code already does the right thing - marks the run FAILED, writes the audit event github_app.fullrepo_lane_unavailable (:948-950), and returns customer-facing copy 'Full repository scan capacity is not available right now' (:955-957). All the machinery for an honest refusal exists; it is simply wired to the wrong question.

THE ADMISSION CONTROL THAT DOES EXIST IS ABOUT THE TENANT, NOT THE LANE. :960-1006 calls opusQueue.admitFullRepoQueue and rejects on duplicate (:966-986) or per-org capacity (:987-1005). Neither has any visibility into consumer health, so a lane whose worker is at desired=0 passes admission cleanly and the job is accepted, persisted as QUEUED, and stranded. That is precisely the measured behaviour: 2 messages enqueued 2026-07-29 aging to 58,633s (16.3h) before a consumer appeared.

CONSEQUENCE THE WRITEUP UNDERSTATES: with DLQ maxReceiveCount=3 and 96h retention, a consumer that stays down past 96 hours means the messages are silently DISCARDED - not DLQ'd, since a message that is never RECEIVED never increments the receive count and therefore never reaches the DLQ. The DLQ protects against poison messages, not against an absent consumer. So the failure mode is total, silent loss, and the customer's scan run sits at QUEUED forever with no terminal state.

No alarm covers this: the Backend has no CloudWatch alarm on this queue, and per F9 the Intelligence alarm definitions are unapplied dead code - a different repo, but the same absence.

### Evidence (read at origin/main)

- `Backend/src/github-app/services/scan-dispatch.service.ts:526-529 (fullrepo queue URL resolution)`
- `Backend/src/github-app/services/scan-dispatch.service.ts:930-959 (the sole liveness test is 'is the URL configured', plus the honest-refusal machinery that already exists)`
- `Backend/src/github-app/services/scan-dispatch.service.ts:960-1006 (admission control is per-org concurrency/duplicate only - no consumer awareness)`
- `Backend/src/github-app/services/scan-dispatch.service.ts:1009-1022 (enqueue to scannerFullRepoQueueUrl)`
- `Backend/src/github-app/services/scan-dispatch.service.ts:539-546 (SQS client constructed when EITHER queue URL is set - so a dead fullrepo lane still gets a client)`
- `Backend/src/github-app/services/audit-log.service.ts:32-34 (fullrepo_lane_unavailable / _duplicate_queued / _queue_at_capacity - the existing honest vocabulary)`
- `Backend/src/github-app/entities/scan-run.entity.ts (status column; a stranded run has no terminal transition)`

### Fix

Replace the config-fact liveness test with a data-fact one, reusing the refusal path that is already built.

(a) PREFLIGHT THE LANE ON A MEASURED FACT. Before admitting a fullrepo job (i.e. extending the :931 check), read queue depth from SQS and oldest-message age from the CloudWatch SQS metric. Because CloudWatch samples can lag, the implementer must specify the period, lookback, freshness bound, cache, and `NOT_MEASURED` behavior before using the value for refusal. If a fresh measured age exceeds a threshold derived from observed normal drain time, treat the lane as UNAVAILABLE and take the EXISTING :931-959 branch verbatim: mark the run FAILED, write github_app.fullrepo_lane_unavailable with the measured age attached, and return the existing customer copy.

Why age and not depth: depth alone is ambiguous (a healthy busy lane has depth). A climbing OLDEST-MESSAGE AGE is the unambiguous signature of a lane nobody is draining, and it is the exact quantity the incident measured.

(b) TELL THE PRODUCER'S CUSTOMER THE TRUTH. The existing copy - 'capacity is not available right now, please try again shortly' - is honest and already shipped; keep it verbatim. Do NOT invent a cheerier message. Attach the measured age to the audit event so an operator can distinguish 'busy' from 'abandoned' after the fact.

(c) NO SILENT STRANDING FOR JOBS ALREADY ENQUEUED. A scan run that was accepted and whose message ages past the stranding threshold must transition to a terminal FAILED state with a reason naming the stranding, rather than sitting at QUEUED indefinitely. A reaper on the existing scan-run store (find QUEUED runs older than the threshold whose lane is fullrepo) is the minimal implementation. Without this, (a) only protects future dispatches and the already-stranded runs stay invisible forever.

(d) A REAL ALARM ON THE QUEUE. CloudWatch alarm on ApproximateAgeOfOldestMessage for codefence-scanner-fullrepo-jobs.fifo above the stranding threshold, and on ApproximateNumberOfMessagesVisible > 0 while the consumer service RunningCount is 0. treatMissingData must be 'breaching' - the same posture Ceragon-Intelligence/src/operations/alarms.ts:53 already uses and F9 requires - so a metric that stops reporting raises rather than silences.

This is a producer-side change only; the worker repo is untouched.

### Changes

**Backend** - `src/github-app/services/scan-dispatch.service.ts`

Add a private laneHealth(queueUrl) that combines SQS queue-depth attributes with a fresh CloudWatch `ApproximateAgeOfOldestMessage` datapoint behind a short in-memory TTL cache. Model stale or absent CloudWatch data as `NOT_MEASURED`, not as zero. Extend the :931 condition from `!this.scannerFullRepoQueueUrl` to also treat a fresh oldestMessageAgeSeconds above FULLREPO_STRANDING_THRESHOLD_SECONDS as unavailable, reusing the existing :932-958 refusal branch unchanged. Attach the measured age and measurement timestamp to the logDispatchAudit payload at :948-950. Apply the same guard to the second dispatch path around :2210-2339.

**Backend** - `src/github-app/services/scan-run-reaper.service.ts`

New (or extend an existing scan-run maintenance service). Cron: find scan_runs with lane fullrepo in status QUEUED/CREATED older than the stranding threshold; transition to FAILED with verdictReason naming the stranding and the measured age; release the opusQueue slot the way :938-947 does. Must be idempotent and bounded.

**Backend** - `src/github-app/services/scan-dispatch.service.spec.ts`

Add cases: healthy lane (age 0) dispatches; stranded lane (age above threshold) takes the fullrepo_lane_unavailable branch and does NOT call SendMessage; the attribute read is cached across consecutive dispatches.

**ops** - `CloudWatch alarms for codefence-scanner-fullrepo-jobs.fifo`

Alarm 1: ApproximateAgeOfOldestMessage > stranding threshold, treatMissingData='breaching'. Alarm 2: composite - ApproximateNumberOfMessagesVisible > 0 AND the consumer service RunningCount == 0. Route to the existing critical SNS topic.

### Tests (each carries a defeat step)

- Stranded-lane refusal test: stub a fresh CloudWatch `ApproximateAgeOfOldestMessage` datapoint at 58633 (the measured value) and assert the dispatch returns reason 'full_repo_lane_unavailable', writes the audit event, and NEVER calls SendMessage. DEFEAT STEP: stub a fresh age of 0 and assert SendMessage IS called - proving the refusal is driven by the measured age and not by an unconditional early return.
- Copy-preservation test: assert the customer-facing message on the stranded path is byte-identical to the existing :955-957 string. DEFEAT STEP: change one word - the test must fail. The honest copy is shipped product language and must not drift while the trigger changes underneath it.
- Cache test: two dispatches within the TTL issue exactly one CloudWatch age read (and no more than one SQS depth read if depth participates). DEFEAT STEP: advance the clock past the TTL and assert another read - otherwise the test would pass against a client that is never called at all. Add a stale/missing-datapoint case that proves `NOT_MEASURED` follows the explicitly approved fallback rather than becoming age zero.
- Reaper test: seed a fullrepo scan_run in QUEUED older than the threshold plus one inside the threshold; run the reaper; assert only the old one becomes FAILED with the stranding reason and that the opus slot was released. DEFEAT STEP: assert the fresh run is untouched - an over-broad reaper would fail live scans, which is worse than the defect.
- Loss-mode test (documents the real hazard): assert that a message never received does not increment receive count and therefore never reaches the DLQ - encode this as a comment-backed assertion on the alarm design so nobody later argues the DLQ covers it. DEFEAT STEP: the alarm test must fail if treatMissingData is changed away from 'breaching'.

### Risks

(1) FALSE REFUSALS ON A LEGITIMATELY BUSY LANE - if the threshold is too low, a heavily loaded but healthy lane starts refusing real customer scans. Set the threshold well above observed healthy drain time and treat it as a tunable value, and prefer refusing with honest copy over stranding silently. (2) The CloudWatch/SQS reads add AWS calls and CloudWatch sampling lag to the dispatch path; the TTL cache bounds calls, but missing, stale, or failed measurement must become `NOT_MEASURED` and follow an explicitly approved fallback. It must never silently become age zero or a fabricated healthy state. (3) The reaper transitions existing production rows to FAILED; scope it strictly to the fullrepo lane and to runs older than the threshold, and log every transition. (4) Customers with genuinely stranded runs will see them flip from QUEUED to FAILED - that is the honest outcome but it will look like new failures on the day it ships. (5) No agent or contract impact.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CITATIONS VERIFIED VERBATIM. scan-dispatch.service.ts:526-529 resolves SQS_GITHUB_SCANNER_FULLREPO_JOBS_QUEUE_URL with the ..._FULLREPO_QUEUE_URL fallback; :539-546 constructs the SQS client when EITHER queue URL is set; :930 computes fullRepoLane from llmReviewMode === 'OPUS_FULL_REPO' and :931 is exactly `if (fullRepoLane && !this.scannerFullRepoQueueUrl)` — a config fact and the only consumer-liveness test on the path; :932-958 is the honest-refusal branch (status FAILED, opus slot released, github_app.fullrepo_lane_unavailable audit, customer copy 'Full repository scan capacity is not available right now. Please try again shortly.'); :960-1006 is tenant-scoped admission only; :1009-1022 enqueues. The 'DLQ protects against poison messages, not an absent consumer' consequence is correct — a never-received message never increments the receive count.
- THE REAPER IS NOT IMPLEMENTABLE AS SPECIFIED — scan_run HAS NO LANE COLUMN. I read scan-run.entity.ts end to end: it has evidence_mode (:74), llm_mode (:77), status (:80), llm_status (:141), verdict_reason (:148), scanners_run (:152) and so on. There is NO `lane` column and NO `llm_review_mode` column. So 'find scan_runs with lane fullrepo in status QUEUED/CREATED' cannot be expressed. The implementer must either add a persisted lane / llm_review_mode column (with a migration and a write at dispatch time) or reap by joining the opus_active_baselines admission row created at :960-1006, which is the only durable record that a run took the fullrepo lane. The spec must say which.
- REAPER STATUS SCOPE IS TOO NARROW. github-app.types.ts:63-69 defines ScanRunStatus as CREATED|QUEUED|RECEIVING|PROCESSING|COMPLETED|FAILED. A run whose message was received and then abandoned mid-flight sits at RECEIVING or PROCESSING and is equally stranded, with no terminal transition. Scoping the reaper to QUEUED/CREATED leaves that class invisible — justify the exclusion or widen it (with a longer threshold for the in-flight states).
- THE 900s THRESHOLD IS UNMEASURED. The only data point in the evidence is the 58,633s stranding; there is no measurement of NORMAL fullrepo drain time anywhere in FINDINGS.md. Choosing a refusal threshold with no baseline is precisely how a healthy but busy lane starts refusing real customer scans — the spec's own risk (1). This is not a feature-flag concern; it is choosing a constant from data. Land the reaper and the CloudWatch age alarm FIRST to establish the p99, then set the preflight threshold from the measurement.

**Corrected approach**: Keep the mechanism — replace the config-fact test at :931 with a measured-data test and reuse the existing :932-958 refusal branch verbatim, including the byte-identical customer copy. Four repairs. (1) Name the durable lane discriminator: either add a persisted lane column to scan_runs (migration + write at dispatch, which also makes the reaper's WHERE clause trivially selective) or reap via the opus_active_baselines row; do not assume a column that does not exist. (2) Extend the reaper's status scope to RECEIVING/PROCESSING with a separate, longer threshold, or state explicitly why an in-flight-then-abandoned run is out of scope. (3) Sequence: ship the reaper + the two CloudWatch alarms first, measure fullrepo drain for one cycle, then enable the preflight refusal with a threshold derived from that measurement. (4) Implement the age reader through CloudWatch rather than SQS attributes, define measurement freshness and lag, and add cloudwatch:GetMetricData/GetMetricStatistics IAM. Missing or stale data is `NOT_MEASURED`; it must never be fabricated as healthy.


**Missing changes the reviewer found**:

- **Backend** `src/github-app/entities/scan-run.entity.ts + src/migrations/<ts>-AddScanRunLane.ts` - There is no lane or llm_review_mode column. Add a persisted `lane` (text, nullable) written at dispatch (:1009-1022 knows the lane) so the reaper's WHERE clause can be selective. Without this the reaper cannot distinguish a stranded fullrepo run from any other QUEUED run — an over-broad reaper failing live scans is worse than the defect.
- **Backend** `src/github-app/services/scan-dispatch.service.ts` - Also apply the laneHealth guard to the second dispatch path the spec references around :2210-2339 — confirm the line range against the current file before editing, and make sure the opus slot release at :938-947 runs on that path too.

**Collateral risk**: Moderate and correctly identified by the spec. The two live hazards are (i) false refusals on a busy-but-healthy lane if the threshold is guessed, and (ii) an over-broad reaper flipping live scans to FAILED — both mitigated by the lane column and by deriving the threshold from measurement. Nothing here touches a PROVEN-WORKING capability: the GitHub fullrepo lane is disjoint from command-lane blocking, DLP, browser masking, Codex wire blocking, signed bundles, the package gate, and MCP discovery. No agent or contract impact; producer-side only, worker repo untouched.

**Effort correction**: M is credible once the lane column is included (it is a small additive migration). If the implementer instead has to reap via opus_active_baselines joins, still M.


---

## F11 - GitHub bot lane silence is unattributable: no code gate is off, and nothing durable distinguishes 'no webhook arrived' from 'producer broken'

- **Severity**: MEDIUM
- **Side**: backend   **Effort**: M   **Root cause verdict**: DISPROVEN

### Root cause

The measurement (NumberOfMessagesSent Sum=0 for 14 consecutive days on codefence-scanner-jobs.fifo) is sound and the positive control is valid. The CONCLUSION - 'the PRODUCER path is dead' - is NOT SUPPORTED by the source, and cannot be settled either way from any surface the product currently has. That inability is the real finding.

EVERY GATE ON THE BOT LANE IS OPEN BY DEFAULT. I checked all four:
  * Kill switch: isBotDispatchEnabled (scan-dispatch.service.ts:2991-2996) reads CODEFENCE_GITHUB_BOT_DISPATCH_ENABLED with default TRUE.
  * Rollout stage: resolveRolloutStage (:4084-4103) defaults to 'ga' when neither CODEFENCE_BOT_ROLLOUT_STAGE nor CODEFENCE_GITHUB_BOT_ROLLOUT_STAGE is set.
  * Rollout percent: resolveRolloutPercent (:4105-4118) defaults to 100.
  * Mode resolution: resolveScanMode (:3984-4020) falls back to rollout, and at stage 'ga' every org is eligible, so mode='bot' (the SQS path) rather than 'action'.
So an arriving push/pull_request/check_suite webhook for a linked installation WOULD be dispatched to codefence-scanner-jobs.fifo. Sum=0 is therefore equally consistent with the far more likely explanation for a single-endpoint test tenant: no GitHub webhook arrived in 14 days because no repository was pushed to. The evidence file's own framing ('the running 1/1 sibling worker is not evidence of a working pipeline') is correct - but neither is Sum=0 evidence of a broken producer.

WHY IT CANNOT BE SETTLED - THIS IS THE DEFECT. There is no durable record of webhook arrival. github_webhook_deliveries exists (github-app/entities/webhook-delivery.entity.ts:16) but it is a REPLAY-DEDUP store, not a receipt ledger: DELIVERY_RETENTION_MS is 24 hours (github-app.controller.ts:74) and cleanupExpiredDeliveries (:927-944) prunes on a 60s interval. So it cannot answer a 14-day question by construction. A dispatch that is SKIPPED leaves an audit event (logDispatchAudit -> audit_events, which survives ~30 days per F19), but a period in which ZERO webhooks arrive leaves NO RECORD AT ALL - the absence of a signal and the absence of the thing that produces signals are literally the same bytes. The GitHubInstallation entity (github-app/entities/github-installation.entity.ts) has no last_webhook_at or equivalent column to fall back on.

This is the same mechanism as F9 and F10: liveness is inferred from a config fact (queue URL set, service exists, flag default) rather than recorded as a data fact (last delivery received, last dispatch attempted, last outcome).

### Evidence (read at origin/main)

- `Backend/src/github-app/services/scan-dispatch.service.ts:2991-2996 (isBotDispatchEnabled defaults TRUE)`
- `Backend/src/github-app/services/scan-dispatch.service.ts:4084-4103 (resolveRolloutStage defaults 'ga')`
- `Backend/src/github-app/services/scan-dispatch.service.ts:4105-4118 (resolveRolloutPercent defaults 100)`
- `Backend/src/github-app/services/scan-dispatch.service.ts:3984-4020 (resolveScanMode -> rollout -> mode 'bot' at ga)`
- `Backend/src/github-app/services/scan-dispatch.service.ts:634-650 (kill-switch and queue-config guards, both open)`
- `Backend/src/github-app/github-app.controller.ts:74 (DELIVERY_RETENTION_MS = 24h)`
- `Backend/src/github-app/github-app.controller.ts:927-944 (cleanupExpiredDeliveries prunes the only arrival record)`
- `Backend/src/github-app/github-app.controller.ts:120-169 (webhook receipt path; logs but persists nothing durable beyond the 24h dedup row)`
- `Backend/src/github-app/entities/github-installation.entity.ts (no last_webhook_at column)`
- `Backend/src/github-app/entities/webhook-delivery.entity.ts:16 (github_webhook_deliveries - dedup store)`
- `Backend/src/github-app/services/audit-log.service.ts:25-26 (only reset/listed events; no arrival event)`

### Fix

Do not 'fix the producer' - nothing in the producer is proven broken and changing open defaults would be guessing. Make the lane's silence ATTRIBUTABLE, then let the measurement decide.

(a) RECORD ARRIVAL DURABLY, PER INSTALLATION. Add last_webhook_at, last_webhook_event, and a monotonic webhook_count to GitHubInstallation, updated in the webhook handler (github-app.controller.ts:133-137, right after signature verification and org resolution, before the switch). Three columns, one UPDATE per delivery, unaffected by the 24h dedup pruning. This is the fact that is missing and it costs almost nothing.

(b) RECORD THE DISPATCH DECISION, ALWAYS. dispatchWebhookScan already returns {dispatched, reason} on every path and already writes audit events for the skip reasons. Add the ONE case that is currently unrecorded - a successful enqueue - and stamp last_dispatch_at / last_dispatch_outcome on the installation. Then 'webhook arrived, dispatch skipped because X' becomes readable, which is the case that would actually indicate a producer defect.

(c) EXPRESS THE THREE STATES HONESTLY. With (a)+(b) the lane has exactly three distinguishable states and each must be said plainly, in the product's existing vocabulary: NO WORK ARRIVED (no webhook in the window - 'measured absence, not a pass'); WORK ARRIVED AND WAS DISPATCHED (with the last enqueue time); WORK ARRIVED AND WAS NOT DISPATCHED (with the recorded reason - this is the only one that is a defect). Never render state 1 as healthy and never render it as broken; both would be fabrications.

(d) ALARM ON THE DEFECT, NOT ON THE SILENCE. Alarm on state 3 (arrivals with zero dispatches over a window), never on Sum=0 alone - an alarm on 'no messages sent' would page every quiet weekend and would be muted within a month, which is how the F9 alarms became irrelevant. The right signal is a RATIO between two facts we will now have.

(e) SETTLE F11 ITSELF, ONCE (b) IS LIVE: if webhook arrivals are non-zero and dispatches are zero, there IS a producer defect and the recorded reason names it. If arrivals are zero, the finding resolves as 'no work arrived' and should be restated that way rather than left as a HIGH-severity dead-producer claim. Interim, zero-code check the owner can run today: confirm whether any GitHubInstallation row is linked and whether any repository has been pushed in the window - that alone discriminates the two hypotheses.

### Changes

**Backend** - `src/github-app/entities/github-installation.entity.ts`

Add columns: last_webhook_at (timestamptz, nullable), last_webhook_event (text, nullable), webhook_count (bigint, default 0), last_dispatch_at (timestamptz, nullable), last_dispatch_outcome (text, nullable).

**Backend** - `src/migrations/<ts>-AddGithubLaneLivenessColumns.ts`

New migration adding the five nullable/defaulted columns. Additive, no backfill - existing rows correctly read as 'never measured' rather than as zero activity.

**Backend** - `src/github-app/github-app.controller.ts`

In handleWebhook after resolveOrgIdFromPayload (:136), UPDATE the installation row's last_webhook_at/last_webhook_event and increment webhook_count. Must not throw into the webhook path - wrap and log, since a bookkeeping failure must never 500 a GitHub delivery.

**Backend** - `src/github-app/services/scan-dispatch.service.ts`

In dispatchWebhookScan, on every return path, stamp last_dispatch_at and last_dispatch_outcome (the existing `reason` string, or 'dispatched') on the installation. Add the currently-missing audit event for a SUCCESSFUL enqueue so the success case is as legible as the skip cases.

**Backend** - `src/github-app/controllers/code-security-ops.controller.ts`

Add a read exposing per-installation lane state using the three-state vocabulary above, including the measured window and the last recorded reason. No boolean 'healthy'.

**ops** - `CloudWatch alarm for the GitHub bot lane`

Alarm on arrivals>0 with dispatches==0 over a rolling window. Explicitly do NOT alarm on NumberOfMessagesSent==0 alone.

### Tests (each carries a defeat step)

- Arrival-recording test: POST a signed push webhook and assert last_webhook_at/last_webhook_event/webhook_count are updated. DEFEAT STEP: POST a DUPLICATE delivery id (which short-circuits at :121-124 as already-processed) and assert the count does NOT double-increment - otherwise the counter measures retries, not arrivals.
- Three-state test: (i) no webhooks -> NO WORK ARRIVED; (ii) webhook + successful enqueue -> DISPATCHED with a timestamp; (iii) webhook + kill switch off -> NOT DISPATCHED with reason 'bot dispatch disabled by kill switch'. DEFEAT STEP: assert state (i) is NOT reported as healthy AND NOT reported as broken - collapsing it either way is the exact honesty failure being fixed.
- Default-openness pin: assert isBotDispatchEnabled() is true with no env set, resolveRolloutStage() is 'ga', and resolveRolloutPercent() is 100. DEFEAT STEP: set CODEFENCE_BOT_ROLLOUT_STAGE='internal' and assert an unlisted org resolves to mode 'action' - this proves the defaults test exercises the real resolver and simultaneously documents the config that WOULD have produced the reported symptom.
- Webhook-path safety test: make the bookkeeping UPDATE throw and assert the webhook still returns 200 and the delivery is still marked processed. DEFEAT STEP: remove the try/catch - the test must fail. A liveness counter that can 500 a GitHub delivery would be a worse defect than the one being fixed.
- Alarm-shape test: assert the alarm fires for arrivals>0/dispatches==0 and does NOT fire for arrivals==0/dispatches==0. DEFEAT STEP: feed arrivals==0 and confirm silence - an alarm that pages on quiet periods gets muted and then covers nothing.

### Risks

(1) One extra UPDATE per webhook delivery on a hot path - keep it to a single narrow UPDATE by installation id, and never let it block or fail the delivery. (2) Five additive nullable columns are low-risk, but existing rows will read as 'never measured' until the first webhook arrives; that must render as NOT MEASURED, not as zero activity. (3) There is a real chance this investigation concludes 'no work arrived', i.e. no defect in the producer at all - that outcome must be recorded as the resolution of F11 rather than treated as a failure to find the bug. (4) Alarming on the ratio requires both metrics to exist; until (a)+(b) have run for a full window the alarm has no baseline and must not be enabled. (5) No agent, contract, or wire impact.

### ADVERSARIAL REVIEW - verdict: SOUND

- The DISPROVEN verdict is CORRECT and every gate default checks out. scan-dispatch.service.ts:2991-2996 isBotDispatchEnabled reads CODEFENCE_GITHUB_BOT_DISPATCH_ENABLED with default true; :4084-4103 resolveRolloutStage defaults 'ga' (and warns-then-restricts only on an UNKNOWN value); :4105-4118 resolveRolloutPercent returns 100 when unset or unparseable; :3984-4020 resolveScanMode falls through to resolveRolloutDecision and returns mode 'bot' when eligible. So no code gate is closed and Sum=0 genuinely cannot distinguish 'no webhook arrived' from 'producer broken'. github-app.controller.ts:74 DELIVERY_RETENTION_MS = 24h and cleanupExpiredDeliveries prunes on an interval guard — the dedup store cannot answer a 14-day question by construction. github-installation.entity.ts has no last_webhook_at or equivalent. The refusal to 'fix the producer' by changing open defaults is exactly right, and the three-state honest vocabulary plus the ratio-based alarm (never alarm on Sum=0) is the correct shape.
- Implementation detail worth pinning: resolveOrgIdFromPayload (github-app.controller.ts:912-926) ALREADY does `installationRepo.findOne({ where: { id: installationId }, select: ['orgId'] })` at :136. Extend that existing read/write rather than issuing a second query, and note it returns null for an unknown installation — the bookkeeping UPDATE must then be a no-op, never an insert.
- Edge case: `installation` and `installation_repositories` events can arrive before a row exists (handleInstallationEvent creates it). The UPDATE must tolerate zero rows affected without logging noise, and the freshly-created row must read as NOT MEASURED rather than zero activity.
- The duplicate-delivery defeat step is well chosen and necessary: claimDelivery short-circuits at :120-124 BEFORE :136, so a replayed delivery never reaches the counter — the test proves the counter measures arrivals, not GitHub retries.

**Collateral risk**: Low. One narrow UPDATE per webhook delivery on a hot path, correctly required to be non-blocking and non-throwing (the webhook-path safety test with its remove-the-try/catch defeat step is the right pin — a liveness counter that 500s a GitHub delivery would be a worse defect than the one being fixed). Five additive nullable/defaulted columns, no backfill, existing rows read as never-measured. Nothing touches command-lane blocking, DLP, browser masking, Codex wire blocking, signed-bundle propagation, the package gate, or MCP discovery. No agent, contract, or wire impact. Risk (3) is important and correct: 'no work arrived' must be recorded as the resolution of F11, not treated as a failure to find a bug.

**Effort correction**: M is right (entity + migration + two write sites + a read route + an alarm + five tests).
