# Fix specs - cluster PE

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

ONE MECHANISM EXPLAINS THE WHOLE CLUSTER: the endpoint's durable evidence envelope (`Installers/internal/evidencespool/types.go` `EventInput`/`Event`) is a strictly content-free, allowlisted projection, and the Backend's ingest DTO (`EndpointEvidenceEventDto`) has grown THREE typed payload slots for evidence that is not content-free-scalar — `policyBundleApplication`, `promptEvidence`, `enforcementReceiptV2`. Only the FIRST has a Go producer. Everything the PE cluster complains about is downstream of the other two never being produced, plus a read path that reports that absence with a fabricated diagnosis rather than the measured one.

THREE FACTS I VERIFIED THAT CHANGE THE EXISTING WRITE-UPS:

1. The agent-side metadata map is NOT a usable smuggling route and must not be proposed as one. `Installers/internal/daemon/evidence_delivery.go:414-440` filters every spool metadata key through an explicit `evidenceMetadataKeys` allowlist, a `contentFreeToken` regex, and a 512-byte value bound; `internal/evidencespool/spool.go:30-32,775-783` re-enforces 32 entries / 64-byte keys / 512-byte values. A windowed masked excerpt (server budget 1536 chars, `preview-shape-gate.ts:151`) cannot fit and cannot pass the token regex. Any fix that carries prompt-derived bytes on the durable lane needs a FIRST-CLASS TYPED FIELD, not a metadata key.

2. `EndpointEvidenceEventDto.privacyClassification` is pinned `@IsIn(['CONTENT_FREE_METADATA'])` (`endpoint-evidence-batch.dto.ts:86-87`) and is inside `computeCanonicalEventHash` (`ai-event-hash.ts:70-75`). Any lane that starts carrying a masked excerpt must add a new classification member BACKEND-FIRST or the honesty of that constant is broken; changing the pinned value without a backend-first wave 400s every batch fleet-wide.

3. `ai_events.metadata` is hash-covered (`ai-event-hash.ts:269`). Therefore prompt-derived bytes must NOT be added to it, and the bytes already there cannot be purged in place. This is why F3 and F20 have to be designed as one change: the fix for F3 that adds a durable masked-preview carrier MUST land those bytes outside the hash chain, or it manufactures more unpurgeable PII while claiming to fix investigability.

DEPLOY ORDER for the whole cluster: Backend first (new optional DTO properties + the new side table + read-path honesty), then agent. `promptEvidence` is ALREADY declared on the deployed Backend (`endpoint-evidence-batch.dto.ts:186-195`, rev 301/bded3919), so the F3b agent field needs no Backend wave; `redactedPreview`/`redactedCount` are NOT declared and do need one — `forbidNonWhitelisted` REJECTS undeclared properties, which is the exact defect class that 400'd every synchronous prompt-check in this codebase before.

NOT A DEFECT (recorded so it is not re-raised): `PromptEvidenceRetentionService` is real, scheduled every 10 minutes, and has NO env gate — it ships ON. It is not inert by configuration; it is inert because the table it sweeps has zero rows, which is F3's fault, not F19's.


---

## F3 - Masked prompt-evidence lane: give the durable lane a carrier, move the bytes off the hash chain, and stop fabricating the absence diagnosis (the no-keys, independently shippable half)

- **Severity**: HIGH
- **Side**: multi   **Effort**: L   **Root cause verdict**: REVISED
- **Also closes**: F30

### Root cause

The recorded two-part hypothesis is CONFIRMED-BUT-INCOMPLETE on (a) and PARTLY WRONG on (b). What I actually measured in the worktrees:

(a) WIRE GAP — CONFIRMED, and it is worse than recorded. `promptcapture.Prepare` runs on every prompt outcome and the built descriptor is validated at `ai_prompt_capture.go:285-292`, but the ONLY place it is ever written is the LOCAL protected-content recovery header (`ai_prompt_capture.go:403`), which never leaves the box. `evidencespool.EventInput` (types.go:27-64) and `evidencespool.Event` (types.go:75-127) carry exactly ONE typed payload — `PolicyBundleApplication map[string]any` (types.go:114-126) — and no prompt-evidence field. Backend `PromptEvidenceArtifactProducerService.plan()` therefore skips 100% of events at `prompt-evidence-artifact-producer.service.ts:100` (`if (event.promptEvidence === undefined) continue;`), no `ai_prompt_evidence_artifacts` row is ever minted, and `ai_events.evidence_ref` is NULL on every row. The stale line numbers in the brief are wrong; the real symbols are `evidencespool.EventInput`/`Event` and `Server.preparePromptEvidence`/`commitPromptCapture`.

(b) READ-PATH FABRICATION — the mechanism is NOT arbitrary fabrication. `PromptEvidenceProjectionService.projectForEvents` has ONE artifact-less branch (`prompt-evidence-projection.service.ts:198-208`) that HARDCODES the absence cause `'UNPROVEN'`. The contract offers three other, more accurate causes — `LEGACY_SERVER_UPGRADE`, `PROVEN_MODE_OFF`, `PROVEN_OUTSIDE_SCOPE` (`prompt-evidence-projection-contract.ts:274-282`) — and I verified they have ZERO production callers anywhere in the Backend. Two specific dishonesties follow: (i) `'UNPROVEN'` maps to `MISSING_REQUIRED / ASSIGNED_AUTHORITY_MISMATCH` (contract:317-321), which NAMES a four-column receipt comparison (`prompt-evidence-artifact-producer.service.ts:343-366`) that was never run for these rows — an unmeasured diagnosis stated as a measured one; (ii) `normalizeAbsentPromptEvidenceProjection`'s `captureMode` parameter defaults to `'OFF'` (contract:326-331) and the single caller never passes one, so the console asserts the administrator chose OFF for an org whose ceiling resolves to `SANITIZED_PREVIEW` (`ai-policy-prompt-evidence-authority.ts:186-190`). The row's OWN measured posture is sitting right there: the daemon stamps `metadata.evidenceMode` (`ai_handlers.go:3643-3650`), the Backend writes it (`ai-agent.controller.ts:401`), and `safeMetadata` already projects it to the client (`ai-query.service.ts:1376`) — the projection just never reads it.

(c) NEW ROOT CAUSE THE WRITE-UPS MISS, and the one that actually explains F30. The masked-preview lane — the one that needs NO keys — has NO DURABLE CARRIER. `redactedPreview` rides ONLY the synchronous `PostAiPromptCheck` request (`ai_handlers.go:1356-1358`, `:1398`). When that report does not land — F2 measured 26 of 136 posts timing out, plus the throttle back-off branch — the ONLY record written is `emitPromptHookEvent` (`ai_handlers.go:1600`, body at `:1863-1969`), which stamps `evidenceMode`, `captureState` and `captureReason` and NO preview. It cannot carry one: `evidence_delivery.go:414-440` filters spool metadata through an allowlist + a content-free-token regex + a 512-byte bound, and `evidencespool/spool.go:30-32,775-783` re-enforces it. So a governed prompt whose synchronous report was lost is PERMANENTLY uninvestigable by construction, and that is indistinguishable at read time from a prompt nobody captured.

(d) The correlation-key claim is right but its scope is narrower than recorded: `promptEvidenceTenantKeySource` is declared nil in production at `ai_prompt_capture_wiring.go:34-54`, so `custody.CorrelationKeyAvailable` is false (`ai_prompt_capture.go:159`), `contentRef` is empty (`:213-224`), and `Prepare` can never reach `PENDING_UPLOAD`. Wiring the descriptor field alone would therefore change NOTHING a customer can see — it would only convert a fabricated `ASSIGNED_AUTHORITY_MISMATCH` into a measured `CORRELATION_KEY_UNAVAILABLE`. That is why the split in this spec is real and not cosmetic: the keyed lane is F3b, and it cannot deliver a byte today.

WHY THE NO-KEYS LANE IS THE RIGHT FIX: the masked lane needs no server secret, and the entire READ half is already built and audited — `decideTextAccess` already prefers a governed artifact and then falls through to a stored masked preview (`prompt-evidence-projection.service.ts:254-259`), and the reveal route already has a fully audited legacy lane that commits an access grant and a chained audit row before producing a byte (`prompt-evidence-reveal.service.ts:498-546`). The only thing missing is the bytes.

### Evidence (read at origin/main)

- `Installers/internal/evidencespool/types.go:27-64 (EventInput: no prompt-evidence field)`
- `Installers/internal/evidencespool/types.go:114-126 (PolicyBundleApplication is the ONLY typed payload — the precedent to copy)`
- `Installers/internal/daemon/ai_prompt_capture.go:285-293 (descriptor validated, then discarded)`
- `Installers/internal/daemon/ai_prompt_capture.go:397-407 (descriptor written ONLY into the local recovery header)`
- `Installers/internal/daemon/ai_prompt_capture.go:156-169 (custody: CorrelationKeyAvailable)`
- `Installers/internal/daemon/ai_prompt_capture_wiring.go:34-54 (promptEvidenceTenantKeySource is nil in production, by declaration)`
- `Installers/internal/daemon/ai_handlers.go:1356-1358 (redactedPreview built only for the synchronous wire)`
- `Installers/internal/daemon/ai_handlers.go:1600 (spool twin emitted only when the synchronous report did NOT land)`
- `Installers/internal/daemon/ai_handlers.go:1863-1969 (emitPromptHookEvent: no preview on any branch)`
- `Installers/internal/daemon/evidence_delivery.go:369-411 (eventInputFromAppend — the translation seam)`
- `Installers/internal/daemon/evidence_delivery.go:414-440 (contentFreeEvidenceMetadata allowlist + 512-byte bound)`
- `Installers/internal/evidencespool/spool.go:30-32 (maxMetadataValueBytes = 512)`
- `Installers/internal/evidencespool/spool.go:775-783 (metadata validation)`
- `Backend/src/ai-governance/services/prompt-evidence-artifact-producer.service.ts:100 (silent skip)`
- `Backend/src/ai-governance/services/prompt-evidence-projection.service.ts:198-208 (hardcoded 'UNPROVEN')`
- `Backend/src/ai-governance/services/prompt-evidence-projection.service.ts:241-268 (decideTextAccess; legacy lane at :257)`
- `Backend/packages/shared-contracts/src/prompt-evidence-projection-contract.ts:274-282 (four absence causes)`
- `Backend/packages/shared-contracts/src/prompt-evidence-projection-contract.ts:296-340 (UNPROVEN -> MISSING_REQUIRED/ASSIGNED_AUTHORITY_MISMATCH; captureMode defaults to 'OFF')`
- `Backend/src/ai-governance/controllers/ai-agent.controller.ts:329,401,411-415 (metadata.evidenceMode + metadata.redactedPreview writers)`
- `Backend/src/ai-governance/services/ai-query.service.ts:1376 (metadata.evidenceMode already projected to the client)`
- `Backend/src/ai-governance/services/ai-event.service.ts:2098-2107,2231-2247 (PREVIEW_KEYS + gatePreviewValue)`
- `Backend/src/ai-governance/services/preview-shape-gate.ts:151,173-201 (windowed-excerpt budget the agent mirrors)`
- `Backend/src/ai-governance/services/prompt-evidence-reveal.service.ts:498-546 (audited legacy masked-preview reveal lane, already built)`
- `Backend/src/ai-governance/services/ai-event-hash.ts:269 (metadata is hash-covered)`
- `Backend/src/ai-policy-delivery/ai-policy-prompt-evidence-authority.ts:186-190 (org ceiling default SANITIZED_PREVIEW)`
- `Backend/src/ai-security-policy/ai-security-policy.service.ts:1542 (served evidenceMode is derived from the resolved intent)`
- `Backend/src/ai-security-policy/ai-prompt-evidence-capabilities.ts:113-133 (maskedPreviewAvailable: true — needs no secret)`

### Fix

ONE mechanism, three edits, no new secret, no flag, ships ON.

1. GIVE THE MASKED PREVIEW ITS OWN STORAGE, OUTSIDE THE HASH CHAIN. New table `ai_prompt_preview(id uuid pk, org_id, site_id, endpoint_id, event_id, preview text, redacted_count int, evidence_mode text, created_at, expires_at, purged_at)`. Both write lanes insert here inside the SAME append transaction, via the existing `preAppend` seam the artifact producer already uses, and the event keeps a hash-covered, purge-stable `metadata.promptPreviewRef = <uuid>`. Purge NULLs `preview` and stamps `purged_at`; the ref and therefore the event hash are never touched. This is the SOT's 'separate lane' built for the lane that actually has bytes, and it is what makes F20 a small follow-on instead of a chain-breaking migration.

2. GIVE THE DURABLE LANE A CARRIER. Add two FIRST-CLASS optional fields to the endpoint evidence wire (`redactedPreview`, `redactedCount`) — typed fields, never metadata keys, because the metadata lane is allowlisted and 512-byte bounded by design and must stay that way. Backend declares them first (`forbidNonWhitelisted`); the agent stamps them in `emitPromptHookEvent` from the SAME `redactedPreviewFor` choke point the synchronous lane uses, so both lanes are byte-identical in what they disclose and both are subject to the server's independent `gatePreviewValue` shape gate, identity-path scrub and value-aware secret scan, unchanged.

3. STOP FABRICATING THE ABSENCE DIAGNOSIS. In `projectForEvents`, derive the absence cause and the capture mode from facts already on the row instead of hardcoding. No shared-contract change is needed: `normalizeAbsentPromptEvidenceProjection` already accepts `captureMode`, and `LEGACY_SERVER_UPGRADE` already exists as a cause. `ASSIGNED_AUTHORITY_MISMATCH` may only be emitted where the receipt comparison was actually performed.

HONESTY IS PRESERVED, NOT TRADED: nothing here turns a negative surface positive. It makes the negative PRECISE ('captured under sanitized preview — reveal records an access entry' where bytes exist; 'this deployment does not produce governed evidence' where they do not) and it deletes a diagnosis the server never measured.

### Changes

**Backend** - `src/migrations/<new>-CreateAiPromptPreview.ts`

New migration creating `ai_prompt_preview` (columns above), `UNIQUE(org_id, event_id)`, index on `(expires_at) WHERE purged_at IS NULL`, and FK `event_id -> ai_events(id)` DEFERRABLE INITIALLY DEFERRED (same reason `fk_ai_events_evidence_ref_artifact` is). Does NOT alter `ai_events`.

**Backend** - `src/ai-governance/services/prompt-preview.service.ts`

New `PromptPreviewService` with `plan(orgId, siteId, endpointId, events)` and `mint(runner, ...)` mirroring `PromptEvidenceArtifactProducerService`'s two-phase shape. `mint` runs on the CALLER's QueryRunner from the `preAppend` seam (before the AI chain lock), computes `expires_at = min(eventTime, now) + previewRetentionDays` read from `ai_prompt_evidence_settings` (default 30, same materialization as prompt-evidence-artifact-producer.service.ts:406-439), and returns the minted uuid so the caller can stamp `metadata.promptPreviewRef`.

**Backend** - `src/ai-governance/dto/endpoint-evidence-batch.dto.ts`

On `EndpointEvidenceEventDto` add `@IsOptional() @IsString() @MaxLength(1536) redactedPreview?: string` and `@IsOptional() @IsInt() @Min(0) @Max(10000) redactedCount?: number`. Add `'MASKED_PROMPT_EXCERPT'` to the `privacyClassification` `@IsIn` list at :86 (old agents keep sending `CONTENT_FREE_METADATA` and are unaffected). MUST DEPLOY BEFORE ANY AGENT SENDS THESE — `forbidNonWhitelisted` rejects undeclared properties and 400s the whole batch.

**Backend** - `src/ai-governance/services/endpoint-evidence-ingest.service.ts`

In `toAppendInputs` (around :1010-1100) route `input.redactedPreview`/`input.redactedCount` through `PromptPreviewService`, exactly as `promptPlan` is threaded for artifacts. Reject with a bounded 422 slug (not a 500) when `redactedPreview` is present but `privacyClassification !== 'MASKED_PROMPT_EXCERPT'`, and when it is present on an event type that carries no prompt.

**Backend** - `src/ai-governance/controllers/ai-agent.controller.ts`

At :411-415 (prompt) and :846-850 (tool) stop writing `metadata.redactedPreview`/`metadata.redactedCount`. Instead pass the gated `ev.redactedText` to the new `PromptPreviewService` mint seam and write `metadata.promptPreviewRef` (uuid). Keep `evidenceModeStoresPreview(evidenceMode) && ev.redactedText != null && findingClasses.length > 0` as the gate verbatim — it is correct and must not be widened.

**Backend** - `src/ai-governance/services/prompt-evidence-projection.service.ts`

(1) Extend `PromptEvidenceProjectableEvent` reads to include `metadata.promptPreviewRef`. (2) In `projectForEvents`, add ONE batched query against `ai_prompt_preview` for the page (alongside the existing artifacts query) resolving `(id, purged_at, expires_at)`. (3) In `decideTextAccess` (:241-268) insert a lane BETWEEN `GOVERNED_ARTIFACT` and `LEGACY_METADATA_PREVIEW`: a live, unexpired, unpurged `ai_prompt_preview` row => `promptTextRevealable('MASKED_PREVIEW')`. (4) Replace the hardcoded `normalizeAbsentPromptEvidenceProjection('UNPROVEN', warning)` at :202 with a derivation: cause = `'LEGACY_SERVER_UPGRADE'` when the row has a preview row / legacy `metadata.redactedPreview` / a `metadata.evidenceMode` (i.e. a governed decision the pre-artifact route recorded); `'PROVEN_MODE_OFF'` when `metadata.evidenceMode === 'OFF'`; `'UNPROVEN'` only when the row carries none of those. Pass `captureMode = normalizeLegacyEvidenceModeForRead(metadata.evidenceMode) ?? 'OFF'` as the third argument so `captureModeAtAttempt` reports the posture the endpoint actually applied instead of the contract default.

**Backend** - `src/ai-governance/services/prompt-evidence-reveal.service.ts`

In the `artifactId === null` branch (:521-546), try the `ai_prompt_preview` row (tenant-scoped, same single statement pattern as the `legacy_preview` select at :505) BEFORE the `metadata.redactedPreview` fallback, and serve it through the existing `revealLegacyMetadataPreview` grant+audit commit (rename to `revealMaskedPreview`, same body). Also apply it in the `LegacyLaneApplies` fall-through at :585-590 so the list and the reveal never disagree.

**Backend** - `src/ai-governance/services/prompt-text-access.contract.ts`

Add `'MASKED_PREVIEW'` to the closed `source` set beside `GOVERNED_ARTIFACT` and `LEGACY_METADATA_PREVIEW`. This is the Backend-local access contract, NOT the mirrored shared-contracts package.

**Installers** - `internal/evidencespool/types.go`

Add `RedactedPreview string` + `RedactedCount int` to `EventInput` (after Metadata) and `RedactedPreview string \`json:"redactedPreview,omitempty"\`` + `RedactedCount int \`json:"redactedCount,omitempty"\`` to `Event`. Add `PrivacyClassification` as a per-event value (currently the package constant at :16) so an event carrying a preview declares `MASKED_PROMPT_EXCERPT` while every other event keeps `CONTENT_FREE_METADATA`. Update the package doc comment at :1-5 and the `EventInput` doc at :20-26: the outbox is content-free EXCEPT for the policy-gated windowed masked excerpt on this one typed field.

**Installers** - `internal/evidencespool/spool.go`

Validate the new field on append: reject when longer than 1536 bytes, when it contains NUL/CR/LF, or when it is present on an event whose type is not a prompt/tool checkpoint. Mirrors `validateBundleApplicationShape`'s local-refusal posture — an endpoint must never spool a record the server will 422.

**Installers** - `internal/daemon/evidence_delivery.go`

`eventInputFromAppend` (:369) carries `req.RedactedPreview`/`req.RedactedCount` through and sets `PrivacyClassification` accordingly. Do NOT add the preview to `contentFreeEvidenceMetadata` (:414) — that allowlist stays exactly as it is.

**Installers** - `internal/core/backend/ai_prompt.go`

Add `RedactedPreview string` + `RedactedCount int` to `AppendAIEventRequest` so the daemon's existing event-builder can carry them to the spool translation seam.

**Installers** - `internal/daemon/ai_handlers.go`

In `emitPromptHookEvent` (:1863) set `ev.RedactedPreview` / `ev.RedactedCount` from the SAME `redactedPreviewFor(evidenceMode, redactedText)` value the synchronous request used — thread the already-computed `redactedPreview` and `len(previewFindings)` in as parameters rather than recomputing (recomputing is how the two lanes drift). Gate identically: only when `len(previewFindings) > 0`. Do the same for the tool lane's `emitToolCallHeld`/`emitToolCallReleased` twins using `toolPreview` (:2589).

**Frontend** - `app/ai-control-plane/prompt-preview.tsx`

No behavioural change required — `promptTextAccessOf` is already the single gate and `normalizePromptTextAccess` must keep failing closed on the new `MASKED_PREVIEW` source. Verify `normalizePromptTextAccess` in types/prompt-evidence.ts passes an unknown `source` through as REVEALABLE (it keys on `disposition`, not `source`); if it allowlists `source`, add `MASKED_PREVIEW` there or the new lane renders as withheld.

### Rejected alternatives

- Stamping the preview into the spool `Metadata` map — structurally impossible and would require gutting a real control: `evidence_delivery.go:414-440` allowlists keys, requires a content-free token shape, and caps values at 512 bytes, and `spool.go:775-783` re-enforces it. A windowed excerpt is up to 1536 chars and is free text by design.
- Keeping the preview in `ai_events.metadata` and adding a purge there — `metadata` is inside `computeCanonicalEventHash` (ai-event-hash.ts:269), so any purge rewrites the row hash and breaks the org chain. `prompt-evidence-retention.service.ts:11-19` explicitly forbids it without a separately approved chain-preserving migration.
- Wiring the PE-1 descriptor as the fix for F30 — it cannot deliver a byte today: `promptEvidenceTenantKeySource` is nil in production (ai_prompt_capture_wiring.go:46), so `Prepare` can never reach PENDING_UPLOAD and the Backend refuses an unkeyed `contentRef` outright (prompt-evidence-artifact-producer.service.ts:249-255). That work is F3b and it is gated on two secrets that are absent in prod.
- Adding a new absence cause / availability member to the shared contract for 'this deployment produces no governed evidence' — it would ripple through three contract mirrors, the Frontend copy maps, AND the Go cross-language corpus in `Installers/internal/promptevidence/`. The deployment fact is already computed and already on the wire (`ai-security-policy.controller.ts:106`); surfacing it there is F30's job and costs nothing.

### Tests (each carries a defeat step)

- Live-PG: ingest an evidence batch whose event carries `redactedPreview` + `privacyClassification: MASKED_PROMPT_EXCERPT`; assert an `ai_prompt_preview` row exists, `ai_events.metadata.promptPreviewRef` equals its id, `ai_events.metadata` contains NO `redactedPreview` key, and `computeCanonicalEventHash` over the stored row equals the stored `event_hash`. DEFEAT: delete the `ai_prompt_preview` INSERT from the mint seam and re-run — the test must fail on the missing row, not merely on a null ref (a test that only asserts the ref would pass with an orphan uuid).
- Live-PG: for the same event call `projectForEvents` with `canReadPromptEvidence: true` and assert `access.disposition === 'REVEALABLE'`, `access.source === 'MASKED_PREVIEW'`, `projection.captureModeAtAttempt === 'SANITIZED_PREVIEW'`, and `projection.reasonCode !== 'ASSIGNED_AUTHORITY_MISMATCH'`. DEFEAT: revert `prompt-evidence-projection.service.ts:202` to the hardcoded `normalizeAbsentPromptEvidenceProjection('UNPROVEN', warning)` — the assertions on captureMode AND reasonCode must both fail. If only one fails, the derivation is reading one fact and defaulting the other.
- Live-PG: `POST /api/v1/ai/events/:id/prompt-evidence/reveal` on that event returns the masked excerpt AND commits exactly one access-grant row and one chained audit row. DEFEAT: null the `ai_prompt_preview.preview` column and re-run — the route must 410/deny with a named availability and write NO grant row. A reveal that still returns bytes proves it is reading the legacy metadata lane, not the new one.
- Go: table-driven test over `handleAIPromptCheck` with the backend client forced to fail, asserting the spooled `evidencespool.Event` for a findings-bearing BLOCK carries a non-empty `redactedPreview` that passes a Go port of `evaluatePreviewShape`. DEFEAT: set `evidenceMode` to `HASH_ONLY` in the same table and assert the field is EMPTY — if both cases produce a preview the `redactedPreviewFor` gate has been bypassed rather than reused.
- Go+TS parity: feed the agent's `windowedPreview` output for a 1-, 4- and 8-anchor prompt through the Backend's `evaluatePreviewShape` and assert `ok === true` for all three, and through `evidencespool` append validation and assert accepted. DEFEAT: raise `previewWindowBytes` from 48 to 96 in the Go constant and assert the 8-anchor case is now REJECTED server-side — this is the parity trap `preview-shape-gate.ts:41-45` warns about and the test exists to make it loud.
- Old-agent tolerance: replay a captured 7.8.30 evidence batch (no `redactedPreview`, `privacyClassification: CONTENT_FREE_METADATA`) against the new Backend and assert 200 with zero `ai_prompt_preview` rows and `promptTextAccess.withholdReason === 'NO_TEXT_STORED'`. DEFEAT: make `redactedPreview` required on the DTO and assert this test 400s — that is the fleet-wide break this ordering exists to prevent.
- Console: render a `PROMPT_BLOCKED` row whose access decision is `REVEALABLE / MASKED_PREVIEW` and assert `data-testid="prompt-reveal"` is present and `data-testid="prompt-absence"` is absent. DEFEAT: flip the fixture's `disposition` to `WITHHELD` and assert the reveal button disappears and the absence copy names the server's cause — proving the FE is reading the decision and not the availability label.

### Risks

1) DEPLOY ORDER IS LOAD-BEARING. An agent that sends `redactedPreview` to a Backend without the DTO declaration 400s the endpoint's ENTIRE evidence batch, fleet-wide, and wedges the spool — the exact defect class recorded six times in this codebase. Backend must be fully rolled out (all tasks on the new revision, not just a canary) before any agent build carrying the field is released.
2) `privacyClassification` is inside the canonical event hash. Introducing a second legal value means two hash inputs coexist; that is fine (the field was always hashed) but any test that pins the constant will fail and must be updated deliberately, not by loosening the pin.
3) Moving the preview off `metadata` changes what `GET /ai/activity`'s `metadata.redactedPreview` search predicate (`list-ai-activity.dto.ts:48`, `ai-query.service.ts:357`) can match. Rows written after this change will not match a text search on the metadata blob. Either repoint that predicate at `ai_prompt_preview` or state the change; silently narrowing a search is its own honesty defect.
4) The new lane widens what leaves the endpoint on the DURABLE path. Mitigated because it reuses the identical producer gate (`redactedPreviewFor`) and the identical server gates (`gatePreviewValue` → identity scrub → shape gate → value-aware secret scan), all unchanged. Do not add a bypass for the spool lane.
5) `ai_prompt_preview` grows with prompt volume. F20 is the purge and MUST ship in the same wave; without it this trades an unpurgeable problem for a purgeable one that nobody purges.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- UNPROVEN CAUSAL LINK (the reason this is NEEDS_REVISION). The spec never establishes that the masked lane produces bytes on this deployment. redactedPreviewFor (Installers internal/daemon/ai_handlers.go:3672-3679) emits only under REDACTED/FULL_WITH_APPROVAL and defaults to HASH_ONLY with no policy (:82,:3630-3635); ai-agent.controller.ts:232 additionally resolves the store gate from `session.evidenceMode`, not the daemon's per-request mode. The fix instructs 'gate identically' and 'reuse the SAME redactedPreviewFor value' — so if either upstream gate is the real zero, the wave ships and stores nothing.
- MISSING SEAM — the ai-agent.controller change is not implementable as written. `preAppend` exists ONLY on `appendEventsForOrgAtomically` (ai-event.service.ts:410-414, invoked at :1054-1055) and is used only by the batch ingest (endpoint-evidence-ingest.service.ts:425, :948). The synchronous routes call `appendEventForOrg` (ai-event.service.ts:909; callers at ai-agent.controller.ts:584, 936, 1103, 1161), which has no preAppend and no exposed QueryRunner. A new seam on the single-event append path (or routing the sync route through the atomic path) is a required, unlisted change — and without it the DEFERRABLE FK and the 'same transaction' claim are both unachievable.
- MISSING MIGRATION — the reveal audit lane. `ai_prompt_evidence_access_grants.source` is constrained by `ck_apeag_source_artifact` to exactly {GOVERNED_ARTIFACT with artifact_id NOT NULL, LEGACY_METADATA_PREVIEW with artifact_id NULL} (src/migrations/1788900000000-AddPromptEvidenceAccessGrantSource.ts:70-77) and the column is typed as that union (src/entities/ai-prompt-evidence-access-grant.entity.ts:66). 'Rename revealLegacyMetadataPreview to revealMaskedPreview, same body' therefore either (a) keeps writing the literal 'LEGACY_METADATA_PREVIEW' at prompt-evidence-reveal.service.ts:849 — recording the wrong lane in an audit-linked, non-revertible table (the down() migration refuses to revert those rows), or (b) writes 'MASKED_PREVIEW' and 500s on the CHECK. A migration adding the third source branch is mandatory and unlisted.
- DEPLOY-ORDER HAZARD IN THE REVERSE DIRECTION, mis-described as 'no behavioural change required'. Frontend types/prompt-evidence.ts:445-458 validates `source` against PROMPT_TEXT_SOURCES = ['GOVERNED_ARTIFACT','LEGACY_METADATA_PREVIEW'] (:403) and returns PROMPT_TEXT_ACCESS_UNDECIDABLE on anything else. Backend ships first by rule; the moment it emits source 'MASKED_PREVIEW', the CURRENTLY DEPLOYED console renders every such row as WITHHELD / DECISION_UNAVAILABLE ('a failure to answer, not a clean result') — strictly worse than today, on the exact rows the wave exists to make investigable. Either land the Frontend allowlist first, or keep serving 'LEGACY_METADATA_PREVIEW' for the new lane until the console revision is live.
- MISSING CHANGE — removing metadata.redactedCount silently deletes a shipped console chip. Frontend app/ai-control-plane/events/events-content.tsx:454 reads `finiteNumber(item.metadata?.redactedCount)` and it is one of the five predicates in `hasChips` (:469-476); a row whose only chip was the redaction count stops rendering entirely (`if (!hasChips && !promptBlock && !warned) return null`, :477).
- RISK #3 IS FALSE and should be deleted. The activity free-text search explicitly NEVER matches metadata.redactedPreview: ListAiActivityDto.q documents it (src/ai-governance/dto/list-ai-activity.dto.ts:47-50) and ai-query.service.ts:356-362 forbids the blob predicate by name ('never search it'). Moving the preview out of metadata narrows nothing.
- REDUNDANT WIRE FIELD. `redactedCount` is ALREADY in the durable spool's metadata allowlist (Installers internal/daemon/evidence_delivery.go:25) and already survives contentFreeEvidenceMetadata's token/512-byte checks. Only `redactedPreview` needs a first-class typed field; adding RedactedCount to EventInput/Event duplicates a working path.
- CROSS-LANE SCOPE GAP. The same controller gate is duplicated at ai-agent.controller.ts:847 (tool lane) and ai-security-context.controller.ts:191 — a third writer the spec never lists. Leaving it writing metadata.redactedPreview while the prompt lane writes a ref produces exactly the two-lanes-disagree drift the spec is trying to close. Note this touches the browser composer path, which is a PROVEN-WORKING capability (masking before send) — do not change what the browser lane discloses, only where the server files it.

**Corrected root cause**: Root-cause parts (a), (b) and (d) are CONFIRMED and every line number I checked is right: evidencespool.EventInput/Event carry exactly one typed payload (PolicyBundleApplication, types.go:114-126) and no prompt-evidence field; the artifact producer skips at prompt-evidence-artifact-producer.service.ts:100; the hardcoded absence cause is at prompt-evidence-projection.service.ts:202; the three other causes have ZERO production callers (only prompt-evidence-reveal.service.ts:248 emits the LEGACY availability, never through normalizeAbsentPromptEvidenceProjection); captureMode defaults to 'OFF' at prompt-evidence-projection-contract.ts:326-331 and the single caller passes only two arguments; promptEvidenceTenantKeySource is nil by declaration (ai_prompt_capture_wiring.go:34-46); metadata is hash-covered and privacyClassification is in the identity hash group (ai-event-hash.ts identity group + canonical object).

Part (c) — 'the masked lane has bytes today and only lacks a durable carrier' — is NOT PROVEN and is the load-bearing claim. Two gates upstream of the carrier can independently zero the lane, and neither was measured:
(1) ENDPOINT: redactedPreviewFor (ai_handlers.go:3672-3679) returns "" for anything but REDACTED/FULL_WITH_APPROVAL, and aiResolveEvidenceMode falls back to aiDefaultEvidenceMode = "HASH_ONLY" (ai_handlers.go:82, 3630-3635) whenever the daemon has no policy loaded.
(2) SERVER: on the branch where the agent supplies no session uuid, ai-agent.controller.ts:232 sets evidenceMode from session.evidenceMode — the SESSION ROW's stored posture — not from body.evidenceMode (only the sibling branch at :265 prefers the daemon's value). The preview-store gate at :412 then reads that. So a session row seeded HASH_ONLY stores no preview even for a landed synchronous post under an org whose ceiling is SANITIZED_PREVIEW (legacyEvidenceModeForCaptureMode maps SANITIZED_PREVIEW -> 'REDACTED', prompt-evidence-contract.ts:731-745, so the ceiling is NOT the blocker).
The live sample shows NO_TEXT_STORED on 200/200 events including findings-bearing rows (F30's aws-access-key BLOCK had RedactFindings populated — policyeval.go:285-296 puts every non-allow surviving finding in RedactFindings, so previewFindings was non-empty). That means the preview was suppressed by evidenceMode, by a lost synchronous post, or by the session-row gate — and the spec picked one without ruling out the other two. If it is the evidenceMode/session gate, this entire spec ships and produces ZERO bytes while reusing redactedPreviewFor verbatim: a new green lane on a dead path.


**Corrected approach**: Insert a DIAGNOSTIC GATE before committing the design, then keep the split but re-order it.
STEP 0 (hours, no code): on the F30 event and on the 23 findings-bearing rows, read `metadata.evidenceMode` — already projected to the client at ai-query.service.ts:1376 — and read `ai_sessions.evidence_mode` for those sessions. If evidenceMode is not REDACTED, the first fix is the mode-resolution path (endpoint policy load + the session-row-vs-daemon precedence at ai-agent.controller.ts:232), NOT a durable carrier, and this spec must be re-scoped.
STEP 1 (ship immediately, independent of everything): the read-path honesty fix (fix item 3). It needs no migration, no contract change, no agent change, no deploy ordering, and it is a real honesty gain today — it deletes an ASSIGNED_AUTHORITY_MISMATCH the server never measured and a captureMode='OFF' it never read. Derive captureMode from `metadata.evidenceMode` via normalizeLegacyEvidenceModeForRead (the key is already allowlisted on BOTH lanes: the synchronous controller writes it at :403 and evidence_delivery.go's evidenceMetadataKeys allowlists it, so spool twins carry it too).
STEP 2: only then build the side table + durable carrier, with the seven corrections in `problems`.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/services/ai-event.service.ts` - Add a `preAppend` participant to `appendEventForOrg` (:909) mirroring the one on `appendEventsForOrgAtomically` (:410-414, :1054-1055), or route the synchronous prompt/tool routes through the atomic path. Without this the PromptPreviewService mint cannot share the event's transaction and the DEFERRABLE FK is unusable.
- **Backend** `src/migrations/<new>-AddMaskedPreviewAccessGrantSource.ts` - Drop and re-add `ck_apeag_source_artifact` on `ai_prompt_evidence_access_grants` with a third branch: ("source" = 'MASKED_PREVIEW' AND "artifact_id" IS NULL). Widen the entity union at src/entities/ai-prompt-evidence-access-grant.entity.ts:66. Without it every masked-preview reveal either 500s on the CHECK or files a false lane in a non-revertible audit table.
- **Frontend** `types/prompt-evidence.ts` - Add 'MASKED_PREVIEW' to PROMPT_TEXT_SOURCES (:403). This is REQUIRED, not optional: normalizePromptTextAccess (:445-458) fails closed to DECISION_UNAVAILABLE on an unknown source. Ship it before (or with) the Backend emitting the new source.
- **Frontend** `app/ai-control-plane/events/events-content.tsx` - Source `redactedCount` from the new projection rather than `item.metadata?.redactedCount` (:454) and keep it in the `hasChips` predicate (:469-476), or the redaction chip disappears for every row written after the change.
- **Backend** `src/ai-governance/controllers/ai-security-context.controller.ts` - The third `evidenceModeStoresPreview(...)` preview writer (:191) is unlisted. Route it through the same mint seam or state explicitly that it keeps the legacy metadata lane — two lanes with two storage locations is the drift this spec exists to remove.
- **Backend** `src/ai-governance/services/ai-query.service.ts` - Diagnostic prerequisite (STEP 0): `metadata.evidenceMode` is already projected at :1376 and the per-session distinct-mode reader exists at :1237-1256. Use them to measure the resolved capture posture on the F30 rows BEFORE committing to a durable carrier.

**Collateral risk**: No PROVEN-WORKING capability is regressed by the design itself: command-lane blocking, DLP across 14 classes, browser masking-before-send, Codex wire blocking, signed-bundle propagation/anti-rollback, the package gate and MCP discovery are all untouched. Two real exposures remain: (1) the Frontend source allowlist failing closed turns today's REVEALABLE legacy-preview rows into DECISION_UNAVAILABLE during the backend-first window — a live console regression, not a hypothetical; (2) the spool-side change alters the durable outbox's privacy classification, so any consumer or test pinning `evidencespool.PrivacyClassification` (types.go:16) as a package constant must be migrated deliberately. No invariant is violated: no flag, no off-by-default, no boot assertion, and the honesty posture is improved rather than softened.

**Effort correction**: L -> XL. One new migration + a second (grant source) + a new service + a new append seam + DTO + ingest routing + projection + reveal + Backend-local contract + 5 Go files + 2 Frontend files + Go/TS parity corpus + live-PG suites. This is more than 5 days and it has a hard Backend-then-Frontend-then-agent ordering.


---

## F30 - A blocked AWS credential is uninvestigable: the console offers a reveal affordance that is structurally guaranteed to produce nothing, and never says that the deployment itself is the reason

- **Severity**: HIGH
- **Side**: frontend   **Effort**: S   **Root cause verdict**: CONFIRMED
- **Depends on**: F3

### Root cause

F30 is F3 arriving at the customer, and the console's own behaviour is correct — which is why the fix is mostly upstream. Verified: the Frontend is honest. `PromptEvidenceBlock` renders the reveal control ONLY when `promptTextAccessOf(row).disposition === 'REVEALABLE'` (`prompt-preview.tsx:519-522`), and otherwise renders `PromptAbsenceNote` with the SERVER's single cause (`prompt-preview.tsx:284-344`). The observed copy — 'Required evidence missing. There is nothing here for you to view.' — is `PROMPT_TEXT_WITHHOLD_COPY['NO_TEXT_STORED']` concatenated with the availability label (`prompt-preview.tsx:319-333`). So the panel is not offering a dead button; it is reporting `WITHHELD / NO_TEXT_STORED`, which by `decideTextAccess` (`prompt-evidence-projection.service.ts:241-268`) means BOTH lanes were empty: no `evidence_ref` (F3a) and no `metadata.redactedPreview` on the row.

TWO residual defects are genuinely F30's own, and neither is fixed by producing bytes:

(1) THE ABSENCE POINTS THE INVESTIGATOR AT THE WRONG LEVER. `promptAbsenceOf` sets `pointsAtSetting: true` for `NO_TEXT_STORED` (`prompt-preview.tsx:342`) and links the reader to `AI Security policy → Prompt evidence`. For this deployment that link is a dead end in the direction it implies: the org ceiling ALREADY resolves to `SANITIZED_PREVIEW` (`ai-policy-prompt-evidence-authority.ts:186-190`) and the governed lane is unavailable for a reason no policy control can change — two server secrets are absent. The console sends a security officer to change a setting that is already correct.

(2) THE SERVER ALREADY KNOWS AND ALREADY SAYS IT — TO NOBODY. `promptEvidenceDeploymentCapabilities()` computes `governedEvidenceAvailable`, `maskedPreviewAvailable` and `missingCapabilityKeys` (`ai-prompt-evidence-capabilities.ts:145-156`), the Backend attaches it to the security-policy response (`ai-security-policy.controller.ts:106`), and its own doc comment states the exact purpose: "'this deployment does not capture governed evidence' is a completely different sentence from 'this event has no evidence', and today both render as 'Required evidence missing'" (`ai-prompt-evidence-capabilities.ts:113-123`). I grepped the entire Frontend worktree: `promptEvidenceDeployment`, `governedEvidenceAvailable` and `maskedPreviewAvailable` appear ZERO times. The honest sentence was built, shipped on the wire, and never rendered.

### Evidence (read at origin/main)

- `Frontend/app/ai-control-plane/prompt-preview.tsx:284-344 (promptAbsenceOf — server's cause, pointsAtSetting at :342)`
- `Frontend/app/ai-control-plane/prompt-preview.tsx:486-626 (PromptEvidenceBlock; reveal gated on disposition at :519-522)`
- `Backend/src/ai-governance/services/prompt-evidence-projection.service.ts:241-268 (NO_TEXT_STORED means both lanes empty)`
- `Backend/src/ai-security-policy/ai-prompt-evidence-capabilities.ts:113-133 (the deployment DTO and why it exists)`
- `Backend/src/ai-security-policy/ai-prompt-evidence-capabilities.ts:145-156 (promptEvidenceDeploymentCapabilities; fail-calm, never boot-asserts)`
- `Backend/src/ai-security-policy/ai-security-policy.controller.ts:106 (already on the policy response)`
- `Backend/src/ai-governance/ai-governance.module.ts:296-325 (startup WARN, explicitly not an assertion)`
- `Backend/src/ai-security-policy/dto/ai-security-policy.dto.ts:877 (promptEvidenceDeployment on the DTO)`
- `Frontend: zero occurrences of promptEvidenceDeployment/governedEvidenceAvailable/maskedPreviewAvailable across app/, components/, lib/, types/`

### Fix

The byte-producing half is F3 and is not repeated here. F30's own fix is to make the console distinguish the three sentences it currently collapses into one, using facts the server already sends:

(a) 'This deployment does not produce governed prompt evidence' — a DEPLOYMENT fact, from `promptEvidenceDeployment.governedEvidenceAvailable`. Render it once, as a banner on the AI Security policy → Prompt evidence section and on the detections/session evidence panel header, naming that the masked-preview lane is unaffected. Do NOT name the secret keys in customer-facing copy.

(b) 'This event has no prompt evidence, and here is the measured reason' — the per-row cause, which F3 makes accurate.

(c) 'Prompt text is available; revealing records an access entry' — unchanged.

And stop pointing the reader at the policy control when the policy control is not the blocker: `pointsAtSetting` must be false for `NO_TEXT_STORED` when the org's resolved capture mode is already at or above `SANITIZED_PREVIEW` and the deployment reports `governedEvidenceAvailable === false`. That is a precision improvement to an honest negative, never a softening of it — the copy that must survive verbatim is 'required evidence missing' and 'an uncertified action is reported honestly as unknown, never as prevented or safe'.

### Changes

**Frontend** - `types/ai-governance.ts`

Add `AiPromptEvidenceDeploymentCapabilities { governedEvidenceAvailable: boolean; maskedPreviewAvailable: boolean; missingCapabilityKeys: string[] }` and `promptEvidenceDeployment?: …` on the security-policy response type, mirroring `Backend/src/ai-security-policy/dto/ai-security-policy.dto.ts:877`.

**Frontend** - `components/admin/prompt-evidence-controls.tsx`

Render a neutral (not alarming, not green) statement when `promptEvidenceDeployment.governedEvidenceAvailable === false`: governed/vault evidence is not produced on this deployment; the masked preview lane is unaffected and is what the console renders. Keep the existing ceiling controls fully operable — the operator must not be told their setting is broken when it is not.

**Frontend** - `app/ai-control-plane/prompt-preview.tsx`

Extend `promptAbsenceOf`'s return with the deployment context: accept an optional `deployment` argument (threaded from the page's already-fetched policy query) and set `pointsAtSetting: false` for `NO_TEXT_STORED` when `deployment?.governedEvidenceAvailable === false` AND the row's `promptEvidence.captureModeAtAttempt` is `SANITIZED_PREVIEW` or wider. In that case append the deployment sentence instead of the settings link. Do not change any existing withhold copy string.

**Frontend** - `app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx`

Thread the deployment capability into `SanitizedPromptOutcome` / `PromptTextWithheld` (around :1330-1345) so the detail panel — the surface F30 was measured on — carries the same sentence as the list.

**Backend** - `src/ai-governance/services/prompt-evidence-projection.service.ts`

No additional change beyond F3. Explicitly NOT adding a per-row deployment field: the fact is per-deployment, and duplicating it onto every row of every page is how two surfaces come to disagree.

### Rejected alternatives

- Rendering the missing key NAMES (`AI_CORRELATION_KEY_MASTER_KEY`, `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY`) in customer-facing copy — `missingCapabilityKeys` is an operator diagnostic; naming absent secrets in a tenant console is an information-disclosure regression for zero customer value. Keep it to the health/ops surface.
- Making the reveal button always visible and letting the POST fail with a reason — that reinstates the dead affordance F30 is about, and every press would write nothing while looking like an audited access attempt.
- Boot-asserting the two keys so the deployment can never be in this state — explicitly forbidden; a missing-secret boot assertion has already taken this product's production down, and `ai-governance.module.ts:309-314` documents the decision to WARN instead.

### Tests (each carries a defeat step)

- Frontend: render the evidence panel with `promptEvidenceDeployment.governedEvidenceAvailable === false` and a row whose access is `WITHHELD / NO_TEXT_STORED`; assert the deployment sentence renders and the `AI Security policy → Prompt evidence` link does NOT. DEFEAT: flip `governedEvidenceAvailable` to true in the same fixture and assert the link returns — if the link never returns, the branch is keyed on something else and the deployment fact is decorative.
- Frontend: with F3 applied, render a row whose access is `REVEALABLE / MASKED_PREVIEW` while `governedEvidenceAvailable === false`; assert the reveal control renders and NO deployment banner appears on that row. DEFEAT: remove the `disposition === 'REVEALABLE'` early return from `promptAbsenceOf` (:295-303) and assert the test fails — this proves the deployment copy cannot leak onto a row that does have text.
- Contract: assert the Frontend deployment type is structurally assignable from the Backend `AiPromptEvidenceDeploymentCapabilitiesDto` shape (a compile-time pin, or a fixture round-trip). DEFEAT: rename `governedEvidenceAvailable` on the Backend DTO and assert the check fails — a hand-copied type that silently drifts is how this field became unread in the first place.
- End-to-end on a seeded org: block a prompt containing a synthetic AWS key, then open the detection and reveal. Assert the revealed text contains `[REDACTED:aws-access-key]` and does NOT contain the synthetic key value, and that exactly one access-grant + one audit row were written. DEFEAT: assert the same revealed text is ABSENT from the list payload and from the CSV export — if the excerpt appears in either, the unaudited render path that E17 deleted has been reintroduced.

### Risks

1) Threading a policy-scoped capability into row-level components risks a fetch waterfall or a stale value on the detections page. Read it from the existing security-policy query the page already runs; do not add a per-row fetch.
2) The deployment sentence must never read as reassurance. Copy review is mandatory: it states a CAPABILITY GAP, and the masked-preview clause must not be phrased so the reader concludes evidence is fine.
3) If F3 ships and F30's copy does not, the console will offer reveals but still tell operators to go change a setting that is already correct — annoying but not unsafe. If F30 ships without F3, the console becomes more accurate about an absence it still cannot fill; also acceptable. They are independently safe, which is why F30 is `dependsOn: F3` for VALUE, not for correctness.

### ADVERSARIAL REVIEW - verdict: SOUND

- Every citation checks out. Frontend app/ai-control-plane/prompt-preview.tsx:284-344 is promptAbsenceOf with `pointsAtSetting: cause === "NO_TEXT_STORED" || cause === "RECORD_CANNOT_YIELD_TEXT"` as the final field; the reveal control is gated on `access.disposition === "REVEALABLE" && eventId !== null` (:522). Backend ai-prompt-evidence-capabilities.ts:113-133 carries the doc comment quoted verbatim, :145-156 is promptEvidenceDeploymentCapabilities, ai-security-policy.controller.ts:106 attaches it, ai-governance.module.ts:294-325 warns and explicitly refuses to assert. I re-ran the grep: promptEvidenceDeployment / governedEvidenceAvailable / maskedPreviewAvailable have ZERO occurrences across Frontend app/, components/, lib/, types/. The three rejected fixes are correctly rejected and the boot-assert invariant is protected.
- REQUIRED COPY TIGHTENING (does not change the design). `maskedPreviewAvailable` is a HARDCODED `true as const` (ai-prompt-evidence-capabilities.ts:155) — it asserts that the lane needs no secret, not that it is producing anything. The change item says the banner should name 'that the masked-preview lane is unaffected'. Until F3's STEP-0 diagnostic proves the masked lane actually stores bytes for this deployment, that clause reads as reassurance about a lane that produced nothing on 200/200 live events — an honest negative made to look positive, which is banned. Ship the banner with the governed-evidence sentence only; add the masked-preview clause in the same wave as the first row that actually reveals.
- MINOR SCOPE ADDITION. The banner belongs on the F33 surface too (agent-control-tamper detail renders 'PROMPT EVIDENCE Required evidence missing / CAPTURE MODE Off' on an event type that carries no prompt at all). promptAbsenceOf already short-circuits that case via eventTypeCarriesNoPrompt (:285-291), so verify AGENT_CONTROL_TAMPER is in that predicate's set — if it is not, the deployment banner will be appended to a row whose real answer is 'this event type has no prompt', and the new copy will make F33 worse rather than better.

**Missing changes the reviewer found**:

- **Frontend** `app/ai-control-plane/prompt-preview.tsx` - Confirm AGENT_CONTROL_TAMPER (and BROWSER_ENFORCEMENT_RECEIPT_RECORDED, per F32) are members of `eventTypeCarriesNoPrompt` (:285) so the new deployment sentence cannot be appended to rows whose true answer is 'this event type has no prompt'.

**Collateral risk**: None to any proven-working capability. Frontend-only plus one no-op Backend note. The one behavioural change — pointsAtSetting going false for NO_TEXT_STORED when governedEvidenceAvailable === false AND captureModeAtAttempt >= SANITIZED_PREVIEW — is correctly conditioned on the row's OWN captureMode, which F3 makes real; until F3 lands, captureModeAtAttempt is the fabricated 'OFF' default, so the condition never fires and the change is inert rather than wrong. State that explicitly in the spec so nobody reports the branch as working before F3 lands.

**Effort correction**: S -> M. A new type, a threaded capability through three render surfaces (prompt-preview.tsx, session-timeline-content.tsx, prompt-evidence-controls.tsx), a branch change in promptAbsenceOf, a contract-assignability pin, and four tests including an E2E reveal. That is 1-2 days, not under half a day.


---

## F5 - enforcementReceiptV2 can never be non-null on a PROMPT_* or TOOL_CALL_* row by contract, and no agent produces one anywhere — but two console surfaces read it there and report 'no endpoint receipt is attached'

- **Severity**: MEDIUM
- **Side**: multi   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

The finding's framing is wrong in a way that matters, and the 'partial contradiction' has a precise, mundane explanation.

(1) `enforcementReceiptV2` IS CONTRACTUALLY FORBIDDEN on the rows the finding checked. `endpoint-evidence-ingest.service.ts:1017-1025` rejects the batch with `receipt-event-type-mismatch` whenever a V2 envelope rides any event type other than `ENFORCEMENT_RECEIPT_RECORDED` or `BROWSER_ENFORCEMENT_RECEIPT_RECORDED` (consts at :86-87). `:1026-1032` additionally rejects `mixed-receipt-protocol-shape` when the V1 four-axis compatibility tuple accompanies a V2 envelope. So a `TOOL_CALL_BLOCKED` row carrying a V2 receipt is not a thing this system can produce — 'null on the 5 real blocks' is the contract working, not a defect on those rows.

(2) NO AGENT PRODUCES A V2 RECEIPT ON ANY EVENT TYPE. I grepped the whole Installers worktree: the only occurrences of `EnforcementReceiptV2` are three read-side predicate fields in `internal/promptevidence/validate.go:1325,1351-1367`. `evidencespool.Event` (types.go:75-127) has no `enforcementReceiptV2` field, so the wire cannot carry the `{wire, proofManifests}` envelope `EndpointEnforcementReceiptV2Dto` (endpoint-evidence-batch.dto.ts:53-61) requires. The agent DOES emit both receipt event types — `ai_oracle_receipt.go:355-375` and `browser_receipt.go:320-329` — but with the V1 four-axis tuple only, which the ingest then treats as V1. `AiEventService.buildAppendEvent` reads `input.enforcementReceiptV2` (`ai-event.service.ts:1079,1599`) and the ONLY caller supplying it is the evidence-batch ingest (`endpoint-evidence-ingest.service.ts:1095`); the synchronous prompt/tool DTOs carry only the flattened axes. Net: `enforcementReceiptV2` is null on 100% of rows in every tenant, permanently, and that is a MISSING PRODUCER, not a per-row failure.

(3) THE ASYMMETRY IS PER-SURFACE, NOT PER-LANE. Both lanes stamp the identical V1 tuple: prompt via `promptHookCertification(...).applyToPromptCheck(req)` (`ai_handlers.go:1430-1433`) and tool via `translatedHookCertification(...).applyToToolCheck(req)` (`ai_handlers.go:2639-2648`); both build the same `airuntime.LocalEffectReceiptCompatibilityV1` (`ai_event_certification.go:60-82`). What differs is the RENDERER. The session timeline renders `ObligationAxesPanel`, and `buildObligationAxes` falls back from the V2 receipt to the event's own columns (`obligation-axes.tsx:137-160`), so a V1-certified prompt row renders a panel headed 'Enforcement receipt' (:273) — which is what was observed. The Detections drawer instead hard-gates on the V2 object and renders `AbsentValue reason="No endpoint receipt is attached to this event"` (`detections-content.tsx:1336-1355`), and the Events ledger's receipt chip is gated the same way (`events-content.tsx:454-465,477`). The 5 TOOL_CALL_BLOCKED rows were read on those surfaces. Three surfaces, two different answers, one underlying fact — the exact divergence class this programme keeps finding.

WHY THE COPY IS THE REAL DEFECT: 'No endpoint receipt is attached to this event' reads as an endpoint failure a customer might chase. The endpoint DID attach a receipt — a V1 local-effect compatibility receipt with a complete four-axis tuple. What is missing is a protocol-2 receipt, which no shipped agent produces for anyone.

### Evidence (read at origin/main)

- `Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:86-87 (LOCAL_EFFECT_RECEIPT_EVENT / BROWSER_EFFECT_RECEIPT_EVENT)`
- `Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:1017-1032 (V2 envelope allowed ONLY on those two event types; V1 tuple may not accompany it)`
- `Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:1037-1046,1095 (the only supplier of input.enforcementReceiptV2)`
- `Backend/src/ai-governance/dto/endpoint-evidence-batch.dto.ts:53-61 (EndpointEnforcementReceiptV2Dto = {wire, proofManifests})`
- `Backend/src/ai-governance/services/ai-event.service.ts:1079,1591-1599 (persistence reads input.enforcementReceiptV2)`
- `Installers: zero non-test references to enforcementReceiptV2 outside internal/promptevidence/validate.go:1325,1351-1367`
- `Installers/internal/evidencespool/types.go:75-127 (Event carries the flattened four axes, no V2 envelope)`
- `Installers/internal/daemon/ai_event_certification.go:60-82 (LocalEffectReceiptCompatibilityV1 is what is actually built)`
- `Installers/internal/daemon/ai_event_certification.go:130-174 (applyToToolCheck and applyToPromptCheck are byte-identical in shape)`
- `Installers/internal/daemon/ai_handlers.go:1430-1433 (prompt lane certification)`
- `Installers/internal/daemon/ai_handlers.go:2639-2648 (tool lane certification)`
- `Installers/internal/daemon/ai_oracle_receipt.go:355-375 (ENFORCEMENT_RECEIPT_RECORDED emitted with V1 axes only)`
- `Installers/internal/daemon/browser_receipt.go:320-329 (BROWSER_ENFORCEMENT_RECEIPT_RECORDED, V1 axes only)`
- `Installers/internal/daemon/ai_effect_receipt.go:7-18 (standalone receipt route retired — 410)`
- `Frontend/app/ai-control-plane/ai-sessions/[id]/obligation-axes.tsx:137-160,273 (V2-then-legacy fallback; panel titled 'Enforcement receipt')`
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:1336-1355 (hard V2 gate → AbsentValue)`
- `Frontend/app/ai-control-plane/events/events-content.tsx:454-465,477 (receipt chip hard-gated on V2)`

### Fix

Do NOT build a V2 receipt producer to close this. Make the three surfaces agree on the truth that already exists, and state the missing capability once, in the place a capability belongs.

1. ONE receipt read model for all three surfaces: `buildObligationAxes`'s V2-then-legacy ladder is already the correct derivation. Export a small `receiptIdentityOf(row)` from it returning `{ protocolVersion: '1' | '2', assurance, source: 'V2_ENVELOPE' | 'V1_LOCAL_EFFECT' | 'NONE' }` and have the Detections drawer and the Events ledger consume it instead of reading `row.enforcementReceiptV2` directly.

2. Replace the false-sounding absence copy. Where a V1 tuple exists: 'Local effect receipt (protocol 1) · effect expressed, runtime unverified'. Where nothing exists: keep an honest absence, but say what is absent — 'No enforcement receipt was recorded for this event' — not 'no endpoint receipt is ATTACHED', which implies an attach step failed.

3. Say the capability gap ONCE, where capabilities live. Protocol-2 enforcement receipts are not produced by any shipped agent. That belongs in the readiness/capability surface (the same one that already reports `evidence.durable-delivery: degraded`), not repeated as a per-row absence on every event in the product.

4. Backend: project `receiptProtocolVersion` and `receiptAssurance` onto the detections and events read DTOs so the Frontend reads a server-derived protocol identity rather than inferring one from an object's nullness. The columns already exist and are already hash-covered (`ai-event-hash.ts:66-84`).

### Changes

**Frontend** - `app/ai-control-plane/ai-sessions/[id]/obligation-axes.tsx`

Extract and export `receiptIdentityOf(event)` from the existing ladder at :137-160 — the V2 envelope when present, else the event's own `receiptProtocolVersion` / `receiptAssurance` / four-axis columns, else NONE. No behaviour change to the panel itself; it becomes the one derivation.

**Frontend** - `app/ai-control-plane/detections/detections-content.tsx`

Replace the `row.enforcementReceiptV2 ? … : <AbsentValue reason="No endpoint receipt is attached to this event" />` block at :1336-1355 with `receiptIdentityOf(row)`. Render `v1 · effect expressed (runtime unverified)` when a V1 tuple is present; keep an `AbsentValue` only for source `NONE`, reworded to 'No enforcement receipt was recorded for this event'.

**Frontend** - `app/ai-control-plane/events/events-content.tsx`

At :454-465 and the `hasChips` predicate at :469-476, source the receipt chip from `receiptIdentityOf(item)` so a V1-certified row shows `Receipt v1 · <outcome> · <assurance>` instead of showing nothing.

**Backend** - `src/ai-governance/services/ai-query.service.ts`

At :1719 and :3319, alongside `enforcementReceiptV2: projectAiEnforcementReceiptV2(...)`, also project `receiptProtocolVersion` and `receiptAssurance` from the stored columns so the read model states the protocol rather than leaving the client to infer it from nullness.

**Backend** - `src/ai-governance/dto/ai-response.dto.ts`

Declare the two additional optional read fields on the activity/detections item DTOs beside `enforcementReceiptV2` (:423, :1493). Additive and optional — old console builds ignore them.

**Backend** - `src/ai-governance/services/ai-readiness*.ts (the surface that already emits `evidence.durable-delivery`)`

Add ONE capability statement that protocol-2 enforcement receipts have no producer on this fleet, so the gap is reported once rather than implied 200 times per page. Locate the existing capability emitter by the `evidence-health-degraded` slug.

### Rejected alternatives

- Building the protocol-2 receipt producer in the agent — XL and it would land the receipt on a SEPARATE `ENFORCEMENT_RECEIPT_RECORDED` event, which the read model already calls 'duplicate noise' (`ai-query.service.ts:3462`), which F32 independently flags as a useless timeline row, and whose standalone route the agent deliberately retired as unjoinable ledger noise (`ai_effect_receipt.go:7-18`). Producing more of it to satisfy a null field would make the customer's timeline worse.
- Relaxing `endpoint-evidence-ingest.service.ts:1017-1025` so a V2 envelope may ride a terminal event — that guard is what keeps a receipt from being asserted about an event it does not certify, and `assertReceiptChainIdentity` depends on it.
- Rendering `enforcementReceiptV2` as an empty object instead of null so the FE gate passes — a fabricated receipt, and precisely the green-surface-on-a-dead-path failure this programme exists to eliminate.

### Tests (each carries a defeat step)

- Frontend unit: one fixture set driven through all three surfaces — (a) V2 envelope present, (b) V1 tuple only, (c) neither — asserting the SAME receipt identity string renders on Detections, Events and the Session timeline. DEFEAT: revert Detections to the direct `row.enforcementReceiptV2` read and assert case (b) now disagrees across surfaces. If the test still passes, the surfaces are not actually sharing the derivation.
- Frontend: assert the literal string 'No endpoint receipt is attached to this event' does not appear for a row carrying a complete V1 tuple. DEFEAT: strip `requestedEffect`/`governanceDisposition` from the fixture and assert the honest absence copy DOES return — proving the absence branch is still reachable and was not simply deleted.
- Backend live-PG: ingest an evidence batch with a V2 envelope on a `TOOL_CALL_BLOCKED` event and assert a 422 with `receipt-event-type-mismatch`. DEFEAT: change the event type to `ENFORCEMENT_RECEIPT_RECORDED` in the same test and assert it is ACCEPTED — this pins that the null is the contract, not a bug, and stops a future wave from 'fixing' it by relaxing the guard.
- Backend: assert `receiptProtocolVersion`/`receiptAssurance` are present on the detections read DTO for a V1-certified row. DEFEAT: null both columns in the fixture and assert the fields are absent (not defaulted to '1') — a default here would manufacture a protocol claim, which is the same class of defect as the projection's fabricated captureMode in F3.

### Risks

1) Widening what the Detections drawer prints could be read as claiming stronger enforcement proof than exists. The copy MUST carry 'runtime unverified' wherever `observedActualEffect` is null and `actualEffectObserver` is NONE — that is exactly what the V1 receipt asserts and no more. This is the highest-risk part of the change and needs copy review against the standing 'EFFECT EXPRESSED / NOT MEASURED' vocabulary.
2) No agent change and no contract change, so there is no old-agent/new-backend exposure. The two new read DTO fields are additive and optional.
3) If a future wave DOES build a V2 producer, `receiptIdentityOf` already prefers the envelope, so nothing here has to be unwound.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- Change #4's premise is factually wrong: 'project receiptProtocolVersion and receiptAssurance from the stored columns … the columns already exist and are already hash-covered (ai-event-hash.ts:66-84)'. The hash group at ai-event-hash.ts contains `enforcementProtocolVersion` and eight sibling enforcement* members — there is no receiptProtocolVersion and no receiptAssurance column on AiEvent. An implementer opening the entity will find nothing to project.
- The change path `src/ai-governance/services/ai-readiness*.ts (the surface that already emits evidence.durable-delivery)` does not exist. The readiness surface is src/endpoint/rollout-readiness.service.ts. A wildcard path with a parenthetical 'find it by the slug' is not implementation-ready.
- Incomplete surface list. `receiptProtocolVersion` is read by obligation-axes.tsx:138 and produced by nobody, so the SESSION timeline is a third surface with the same defect, not the reference implementation. The spec treats obligation-axes as already correct; it is correct only because its legacy fallback masks the fact that its V2 discriminator can never fire.
- The honest-copy requirement needs one more pin. 'Local effect receipt (protocol 1) · effect expressed, runtime unverified' must be derived from the row, not asserted: ai_oracle_receipt.go:369-377 sets ActualEffectObserver=NONE and SecurityOutcome=UNKNOWN explicitly, so the 'runtime unverified' clause is measurable. Require the copy to be keyed on `observedActualEffect === null && actualEffectObserver === 'NONE'`, so a future V2 row that DOES carry an observation does not inherit the disclaimer.

**Corrected root cause**: The mechanism is exactly as described and I verified every citation: LOCAL_EFFECT_RECEIPT_EVENT/BROWSER_EFFECT_RECEIPT_EVENT at endpoint-evidence-ingest.service.ts:86-87; the two guards at :1017-1025 ('receipt-event-type-mismatch') and :1026-1032 ('mixed-receipt-protocol-shape'); the sole supplier at :1095; EndpointEnforcementReceiptV2Dto = {wire, proofManifests} at endpoint-evidence-batch.dto.ts:52-61; evidencespool.Event (types.go:75-127) has no V2 field; the ONLY Installers references to EnforcementReceiptV2 are read-side predicates at internal/promptevidence/validate.go:1325,1351,1359,1367; ai_oracle_receipt.go:355-378 emits ENFORCEMENT_RECEIPT_RECORDED with the V1 four-axis tuple only; ai_effect_receipt.go:7-18 is a 410 tombstone. The three-surface divergence is real: obligation-axes.tsx:137-160 falls back from the receipt to the event's own fields under a panel titled 'Enforcement receipt' (:273), while detections-content.tsx:1336-1355 hard-gates on `row.enforcementReceiptV2` and prints 'No endpoint receipt is attached to this event', and events-content.tsx:454-465/:469-476 gates the chip the same way. Verdict on the root cause: CONFIRMED.

What is WRONG is the fix's factual basis for change #4. There is no `receiptAssurance` column and no `receiptProtocolVersion` column. src/entities/ai-event.entity.ts:209 has `enforcementProtocolVersion` (varchar(8)); assurance for a V1-certified row lives in HASH-COVERED METADATA — `metadata.receiptAssurance`, server-derived from the transport and re-stamped at ai-event.service.ts:1402-1408 (see ai-local-receipt-compat.util.ts:26,77,132). And `receiptProtocolVersion` has ZERO producers anywhere in the Backend, yet obligation-axes.tsx:138 reads `event.receiptProtocolVersion === "2"` — so the session surface's V2 branch is dead too and is carried entirely by the receipt object.


**Corrected approach**: Keep the design (one shared `receiptIdentityOf`, honest copy, capability stated once). Correct the Backend half:
(a) project `receiptProtocolVersion` from the `enforcement_protocol_version` COLUMN (ai-event.entity.ts:209), defaulting to '1' ONLY when a V1 tuple is actually present — never as a bare default, which would manufacture a protocol claim (the spec's own DEFEAT step already says this; the change item contradicts it by implying a stored column exists).
(b) project `receiptAssurance` from `metadata.receiptAssurance`, and state in the code comment that it is SERVER-derived from the delivering transport (ai-local-receipt-compat.util.ts:26) so no reviewer reads 'receipt v1 · verified endpoint report' as the endpoint's own claim.
(c) add both to the SESSION event projection as well as detections/activity — obligation-axes already expects `receiptProtocolVersion` and never gets it, so the session surface silently sits on the legacy branch for V2 rows too.
(d) point the capability statement at src/endpoint/rollout-readiness.service.ts, which is the file that actually owns the readiness capability slugs; the spec's `src/ai-governance/services/ai-readiness*.ts` glob matches nothing.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/services/ai-query.service.ts` - Also add the two fields to the SESSION event projection, not only the activity (:1719) and detections (:3319) projections — obligation-axes.tsx:138 already reads receiptProtocolVersion from the session event and currently never receives it.
- **Backend** `src/endpoint/rollout-readiness.service.ts` - This is the readiness surface that owns the capability slugs (the spec's ai-readiness*.ts glob matches no file). Add the single 'protocol-2 enforcement receipts have no producer on this fleet' capability statement here.
- **Frontend** `types/ai-governance.ts` - receiptProtocolVersion (:683) and receiptAssurance (:473,:692) are already declared on the FE types but only on the session-event shape. Add them to the detections/activity item types so receiptIdentityOf can read them on all three surfaces.

**Collateral risk**: Low and correctly bounded: no agent change, no wire contract change, two additive optional read fields. The one genuine hazard is the one the spec names — widening what the Detections drawer prints must not read as stronger proof than a V1 local-effect receipt supports. Nothing here touches command-lane blocking, DLP, browser masking, Codex wire blocking, signed-bundle propagation/anti-rollback, the package gate or MCP discovery. The rejected item 'relax endpoint-evidence-ingest.service.ts:1017-1025' is correctly rejected — that guard plus assertReceiptChainIdentity (:1046) is what binds a receipt to the event it certifies.

**Effort correction**: M is credible (1-2 days) once the corrected Backend targets are used. It would NOT be credible if the implementer had to hunt for the nonexistent columns and the wildcard readiness path first — that is why the corrections matter more than the estimate.


---

## F20 - The prompt-evidence purge job is real and scheduled, but sweeps an empty table; the masked preview and prompt hash that ARE retained sit inline in the hash-chained ai_events.metadata and no job on this deployment touches ai_events at all

- **Severity**: MEDIUM
- **Side**: backend   **Effort**: M   **Root cause verdict**: REVISED
- **Depends on**: F3

### Root cause

'No prompt-evidence purge job' is DISPROVEN as written. `PromptEvidenceRetentionService` exists, is registered in `AiGovernanceModule` (:186, :253), and runs `@Cron(CronExpression.EVERY_10_MINUTES)` with NO env gate — it ships ON, unlike the three retention crons F19 found gated off. It implements the §10.3 EXPIRED→PURGED pair under `FOR UPDATE SKIP LOCKED` and honours the org's `preview_retention_days` / `hash_retention_days` as two independent deadlines (`prompt-evidence-retention.service.ts:21-47,71-80,108-121`).

The real finding is a scope mismatch on both sides:

(1) IT SWEEPS A TABLE THAT IS EMPTY. It writes only to `ai_prompt_evidence_artifacts` and its transitions table. F3 proves that table has never received a row in production, because no producer ever puts a descriptor on the wire (`prompt-evidence-artifact-producer.service.ts:100`). So the documented 30d/90d retention is enforced against zero rows — a control that runs, succeeds, and protects nothing.

(2) THE DATA THAT IS ACTUALLY RETAINED IS DELIBERATELY OUT OF ITS SCOPE, AND CANNOT BE PURGED IN PLACE. `metadata.redactedPreview` and `metadata.promptHash` are written into `ai_events.metadata` (`ai-agent.controller.ts:409-415`), and `metadata` is inside `computeCanonicalEventHash` (`ai-event-hash.ts:269`). The retention service's own class doc states the constraint and the boundary explicitly: it 'contains no UPDATE against `ai_events`, and none may ever be added: the W8 AI-plane purge owns the legacy inline previews' (`prompt-evidence-retention.service.ts:11-19`). I searched for that W8 purge: it does not exist. `DevoidDataRetentionService` sweeps exactly three tables — `user_sessions`, `login_attempts`, `analysis` — and `ai_events` is in none of them (`data-retention.service.ts:26-38,77-84`). No other production code path issues an UPDATE or DELETE against `ai_events`.

(3) THE ENDPOINT-SIDE 24h TTL IS THE ONE PART THAT IS REAL. `LocalContentExpiresAt` is carried on the protected-content recovery header and the local spool recovers/expires against it (`ai_prompt_capture.go:406`), so the local half of the documented retention does hold — for content that, per F3, never leaves the box.

So: the promise 'preview 30d / hash 90d' is currently kept only by a job with nothing to do, while the bytes a customer would actually ask about are kept forever in an append-only structure that cannot be edited without breaking the org's tamper-evident chain.

### Evidence (read at origin/main)

- `Backend/src/ai-governance/services/prompt-evidence-retention.service.ts:11-19 (explicitly excludes ai_events; names a 'W8 AI-plane purge' as the owner)`
- `Backend/src/ai-governance/services/prompt-evidence-retention.service.ts:21-47 (two independent deadlines, EXPIRED→PURGED pair)`
- `Backend/src/ai-governance/services/prompt-evidence-retention.service.ts:86-121 (@Cron EVERY_10_MINUTES, no env gate)`
- `Backend/src/ai-governance/ai-governance.module.ts:186,253 (registered as a provider and exported)`
- `Backend/src/ai-governance/services/prompt-evidence-artifact-producer.service.ts:100 (why the swept table is empty)`
- `Backend/src/ai-governance/services/ai-event-hash.ts:269 (metadata inside computeCanonicalEventHash)`
- `Backend/src/ai-governance/controllers/ai-agent.controller.ts:409-415 (redactedPreview + promptHash written into ai_events.metadata)`
- `Backend/src/data-retention/data-retention.service.ts:26-38,77-84 (three tables; ai_events absent)`
- `Backend: no production UPDATE/DELETE against ai_events anywhere (only two *.spec.ts fixtures)`
- `Installers/internal/daemon/ai_prompt_capture.go:397-407 (LocalContentExpiresAt on the local recovery header — the 24h TTL that IS real)`

### Fix

Do not bolt a purge onto the hash chain. Ship F20 IN THE SAME WAVE as F3, because F3's design is what makes it purgeable.

F3 already moves every NEW masked preview out of `ai_events.metadata` and into `ai_prompt_preview`, leaving a hash-covered, purge-stable `metadata.promptPreviewRef` in the chain. F20 is then two small pieces:

1. EXTEND THE EXISTING SWEEP — do not add a second job. Add an `ai_prompt_preview` pass to `PromptEvidenceRetentionService.sweep()`, on the same 10-minute cron, using the same `FOR UPDATE SKIP LOCKED` selection and the same org `preview_retention_days`. Purge NULLs `preview` and `redacted_count` and stamps `purged_at`; the row and its id survive so the hash-covered ref never dangles. One job, one cadence, one place a reviewer looks.

2. TELL THE TRUTH ABOUT THE LEGACY TAIL. Previews already inline in `ai_events.metadata` CANNOT be purged without a chain-preserving migration that the retention service's own doc says requires separate approval. Two honest consequences, both required:
   (a) the read path must treat the legacy metadata lane as NON-EXPIRING and say so — `decideTextAccess`'s `LEGACY_METADATA_PREVIEW` branch must not inherit the new lane's expiry semantics, and the prompt-evidence settings surface must state that previews recorded before this release are retained with the event;
   (b) file the chain-preserving purge of the legacy tail as a named, separately-approved migration. Do not let it hide inside this wave.

What must NOT change: `evidence_ref` and `metadata` stay hash-covered; the sweep still never issues an UPDATE against `ai_events`.

### Changes

**Backend** - `src/ai-governance/services/prompt-evidence-retention.service.ts`

Add `sweepMaskedPreviews(now)` to `sweep()`: `SELECT … FROM ai_prompt_preview WHERE purged_at IS NULL AND expires_at <= now FOR UPDATE SKIP LOCKED LIMIT n`, then in one transaction `UPDATE … SET preview = NULL, redacted_count = NULL, purged_at = now`. Extend `PromptEvidenceRetentionSweepResult` with `previewsPurged: string[]`. Update the class doc: `ai_events` is still never touched, and the reason the sweep now has work is that F3 moved the bytes out of it.

**Backend** - `src/ai-governance/services/prompt-evidence-projection.service.ts`

In the masked-preview lane F3 adds to `decideTextAccess`, treat a row with `purged_at IS NOT NULL` or `expires_at <= now` as NOT revealable and project `availability: 'EXPIRED' / reasonCode: 'RETENTION_EXPIRED'` — the same time-derived read the artifact lane already does at :443-453, so the list never advertises a reveal the route will refuse.

**Backend** - `src/ai-governance/services/prompt-evidence-reveal.service.ts`

The masked-preview reveal lane must re-check `expires_at`/`purged_at` under the row lock and deny with `RETENTION_EXPIRED` (no grant row, no audit row — a denial is not a disclosure, matching :585-596).

**Backend** - `src/ai-governance/services/prompt-evidence-settings.service.ts`

Surface a truthful retention statement for the legacy inline tail: previews recorded before the side-table release are retained for the life of the event because they are inside the tamper-evident chain. This is a statement, not a control — do not offer a toggle that cannot act.

**Backend** - `src/ai-governance/services/prompt-evidence-retention.live-pg.spec.ts`

Extend the existing live-PG suite with the new pass rather than starting a second suite.

**Frontend** - `components/admin/prompt-evidence-controls.tsx`

Render the legacy-tail retention statement beside the configured preview/hash retention values so an operator is not told 30 days applies to data it does not apply to.

### Rejected alternatives

- Adding a purge that UPDATEs `ai_events.metadata` — breaks `computeCanonicalEventHash` for the row and every successor in the org chain; forbidden in writing at `prompt-evidence-retention.service.ts:14-19`.
- Adding a second retention cron for previews — `PromptEvidenceRetentionService` already owns this concern on a 10-minute cadence; a second scheduler is one more thing that can be silently off, which is exactly the F19 defect shape.
- Env-gating the new sweep (`PROMPT_PREVIEW_RETENTION_ENABLED`) — that is precisely how the three F19 retention crons became green-but-inert, and it violates the no-flags ship-ON rule.
- Re-anchoring the hash chain to allow in-place redaction of the legacy tail — a genuinely separate, separately-approved migration with its own verification of every downstream `prev_hash`. Naming it here; not doing it here.

### Tests (each carries a defeat step)

- Live-PG: insert an `ai_prompt_preview` row with `expires_at` in the past, run `sweep()`, assert `preview IS NULL`, `purged_at` set, the row still exists, and the owning `ai_events` row's stored `event_hash` still equals `computeCanonicalEventHash` over it. DEFEAT: delete the row instead of nulling it and assert the FK/ref check fails — this pins that purge must never remove the row a hash-covered ref points at.
- Live-PG: a row whose `expires_at` is one second in the FUTURE must survive the sweep, and `decideTextAccess` must still return REVEALABLE for it. DEFEAT: move it one second into the past and assert the same call returns WITHHELD with `RETENTION_EXPIRED` BEFORE the sweep has run — proving the read is time-derived and not merely reporting what the worker happened to have done.
- Live-PG: a row carrying a LEGACY `metadata.redactedPreview` and no `ai_prompt_preview` row must be unaffected by the sweep and must still reveal. DEFEAT: add an `ai_events` UPDATE to the sweep and assert the chain-verification test fails — this is the guard rail that keeps a future author from 'finishing the job' by editing the chain.
- Static: assert the retention service source contains no `ai_events` write. DEFEAT: insert a commented-out UPDATE and confirm the check still passes (it must match statements, not the table name in prose) — a check that trips on the class doc is useless.
- Live-PG scale check: seed 50k expired preview rows and assert the sweep drains them in bounded batches without holding a lock longer than the existing artifact pass. DEFEAT: remove `SKIP LOCKED` and assert two concurrent sweeps now contend — proving the concurrency property is actually exercised.

### Risks

1) Purging previews removes evidence an investigator may want. That is the point of a retention policy, but the default is the org's `preview_retention_days` (30) and this is the FIRST time it will actually take effect for real data — announce it, because before this release nothing ever expired.
2) Sequencing: if F20's sweep ships BEFORE F3's side table exists, it sweeps an empty table and changes nothing (safe). If F3 ships without F20, the product starts accumulating previews in a purgeable table that nobody purges — worse than today's honesty position. Ship F20 in the same wave; if only one can go, ship F20 first.
3) The legacy inline tail remains retained forever and no fix in this spec changes that. Any customer-facing retention statement must reflect it or the console makes a promise the database does not keep.
4) `expires_at` is derived from `min(eventTime, now)` (same anchor rule as the artifact producer) so a future-dated `emittedAt` cannot extend custody. Reuse that helper rather than re-deriving it.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- RISK #2 IS WRONG AND ITS ADVICE IS BACKWARDS. 'If F20's sweep ships BEFORE F3's side table exists, it sweeps an empty table and changes nothing (safe) … if only one can go, ship F20 first.' It does not sweep an empty table — the table does not exist, so the SELECT raises 42P01 every ten minutes. scheduledSweep catches and logs the error (prompt-evidence-retention.service.ts, @Cron handler), so the job reports healthy while doing nothing: precisely the green-but-inert defect class this whole programme exists to eliminate, manufactured on purpose by the spec's own sequencing advice. Also note the artifact pass and the new preview pass would share one sweep() — a throw in the preview pass could abort the artifact pass unless each is independently try/caught.
- MISSING CHANGE — the F3 dependency is deeper than 'depends on F3'. The purge nulls `preview` but the hash-covered `metadata.promptPreviewRef` survives, which means the READ path must distinguish 'ref present, row purged' from 'ref present, row missing/orphaned'. The spec covers the first (RETENTION_EXPIRED) but not the second: a ref pointing at no row at all must project as a named failure, never fall through to NO_TEXT_STORED, or a purge bug becomes indistinguishable from 'nothing was ever captured'.
- MISSING CHANGE — the reveal-lane grant source. The spec says the masked-preview reveal must deny with RETENTION_EXPIRED and write no grant row. That is right, but the reveal lane it denies within is the one F3 introduces, which needs the ck_apeag_source_artifact migration (src/migrations/1788900000000:70-77) F3 also omits. F20 inherits that gap.
- UNDER-SPECIFIED CUSTOMER STATEMENT. 'Surface a truthful retention statement for the legacy inline tail' in prompt-evidence-settings.service.ts is the right instinct (the file exists), but the statement must also cover the fact measured live: the org's configured preview retention (30d) has NEVER taken effect for any real data, because the swept table has always been empty. An operator reading '30 days' today is reading a promise that has never been kept for anything.

**Corrected root cause**: The root cause is CONFIRMED as written and the REVISED verdict against the original finding is correct. I verified every claim: PromptEvidenceRetentionService's class doc at prompt-evidence-retention.service.ts:6-45 states the invariant and, verbatim, 'It contains no UPDATE against ai_events, and none may ever be added: the W8 AI-plane purge owns the legacy inline previews'; @Cron(CronExpression.EVERY_10_MINUTES) with no env gate wraps sweep() in a try/catch that logs and swallows; the two independent deadlines and the EXPIRED->PURGED pair under FOR UPDATE SKIP LOCKED are real; REPRESENTATION_COLUMNS is artifact-only. DevoidDataRetentionService sweeps exactly user_sessions, login_attempts and analysis (data-retention.service.ts:26-38, runDailyRetention at :77-84) — ai_events is absent, and the named 'W8 AI-plane purge' does not exist. metadata is inside computeCanonicalEventHash, and ai-agent.controller.ts:409-415 is where redactedPreview/promptHash enter it. So: a real, ungated, correctly-built control sweeping a table F3 proves is empty, while the retained bytes sit inside the hash chain and cannot be purged in place.


**Corrected approach**: Keep the design unchanged — extending the existing sweep rather than adding a second cron is right, and the refusal to env-gate it is right. Fix only the sequencing statement: F20 is NOT independently shippable and must NOT be sequenced first. Its sweep targets ai_prompt_preview, a table created by F3's migration. Correct the ordering to: F3's migration + mint path lands first (or in the same PR), F20's sweep lands in the SAME wave, never before. If the wave must be split, split it as [F3 migration + mint + read-path] then [F20 sweep], never the reverse.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/services/prompt-evidence-retention.service.ts` - Wrap each pass (artifacts, then previews) in its own try/catch inside sweep() so a failure in the new pass — including a missing table if the migration has not run — cannot abort the artifact pass that already works. Today one catch at the @Cron boundary swallows everything and reports healthy.
- **Backend** `src/ai-governance/services/prompt-evidence-projection.service.ts` - Add the orphan case: `metadata.promptPreviewRef` present but no ai_prompt_preview row resolvable for this org must project a named failure (not NO_TEXT_STORED). A dangling hash-covered ref is a data-integrity fact, not an absence of capture.
- **Backend** `src/ai-governance/services/prompt-evidence-settings.service.ts` - The truthful statement must say two things, not one: (a) previews recorded before the side-table release are retained for the life of the event because they are inside the tamper-evident chain, and (b) the configured preview_retention_days has not, until this release, applied to any stored data.

**Collateral risk**: None to any proven-working capability. The design's hard boundary — no UPDATE against ai_events, ever — is preserved and the spec's static test for it is well-conceived (matching statements, not the table name in prose, so it does not trip on the class doc). The one real data risk is intended and correctly flagged: this is the first time a 30-day preview deadline will actually delete anything, and it should be announced. No flag, no env gate, no boot assertion — the refusal to add PROMPT_PREVIEW_RETENTION_ENABLED is explicitly correct and matches the F19 lesson.

**Effort correction**: M is credible for the sweep itself (1-2 days including the live-PG suite and the 50k-row scale check). It is only credible when sequenced after F3's migration; sequenced first it is not 'M', it is a defect.


---

## F3b - Governed (keyed) prompt-evidence artifact lane: wire the PE-1 descriptor onto the durable event and give the endpoint a real tenant correlation key

- **Severity**: MEDIUM
- **Side**: multi   **Effort**: XL   **Root cause verdict**: CONFIRMED
- **Depends on**: F3

### Root cause

The full/governed lane is inert for THREE independent reasons, all of which must be closed together — closing any one alone changes nothing observable.

(1) NO WIRE FIELD. `evidencespool.EventInput`/`Event` carry no prompt-evidence descriptor (types.go:27-127); the descriptor built and validated at `ai_prompt_capture.go:285-292` is written only into the LOCAL protected-content recovery header (`:403`). The Backend's `PromptEvidenceArtifactProducerService.plan()` consequently skips every event (`:100`).

(2) NO TENANT CORRELATION KEY ON THE ENDPOINT. `promptEvidenceTenantKeySource` is a package var declared nil in production, with the reason stated in the source: the §10.2 correlation-key custody/bootstrap does not exist on the endpoint, and §10.2 forbids a legacy or global fallback (`ai_prompt_capture_wiring.go:34-54`). With no key, `custody.CorrelationKeyAvailable` is false (`ai_prompt_capture.go:159`), `contentRef` stays empty (`:213-224`), and `Prepare` can never return `PENDING_UPLOAD` — so even with the wire field, every descriptor would take the `default:` branch in `planOne` and mint `evidenceRef: null` (`prompt-evidence-artifact-producer.service.ts:207-224`), and any unkeyed `contentRef` that did arrive would be refused outright with `prompt-evidence-content-ref-unkeyed` (`:249-255`).

(3) NO SERVER SECRETS. `AI_CORRELATION_KEY_MASTER_KEY` and `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY` are absent at rev 301 (measured live, DL-correlation-keys). Without the first, `AiCorrelationKeyCustodyService` 503s every bootstrap; without the second, the upload lane refuses every body rather than accepting an unauthenticated one (`ai-prompt-evidence-capabilities.ts:96-111`). The Backend degrades correctly and warns once at startup (`ai-governance.module.ts:296-325`) — that posture is right and must not be changed.

PLUS an identity constraint the existing write-ups do not mention and that will bite an implementer immediately: the Backend requires `descriptor.clientEventId === event.eventId` (`prompt-evidence-artifact-producer.service.ts:145-150`), `Date.parse(descriptor.emittedAt) === Date.parse(event.emittedAt)` (`:152-159`), and `descriptor.contentId` to be a v4 UUID (`:166-171`). But `promptEventIdentity` mints `ClientEventID` as a fresh, unrelated uuid (`ai_prompt_capture_wiring.go:289-301`), while the spool's `Open` assigns the envelope's real `eventId`/`emittedAt` at append time (types.go:20-26). A naive wiring 422s every batch and, because a 422 on this route is terminal, wedges the endpoint's spool.

### Evidence (read at origin/main)

- `Installers/internal/evidencespool/types.go:20-26 (Open assigns eventId/emittedAt at append)`
- `Installers/internal/evidencespool/types.go:27-64,75-127 (no promptEvidence field; PolicyBundleApplication is the precedent)`
- `Installers/internal/daemon/ai_prompt_capture.go:156-169 (custody)`
- `Installers/internal/daemon/ai_prompt_capture.go:205-224 (contentRef/uploadRequestID derived only when a tenant key exists)`
- `Installers/internal/daemon/ai_prompt_capture.go:278-293 (authority + descriptor validation, then discard)`
- `Installers/internal/daemon/ai_prompt_capture_wiring.go:34-54 (tenant key source nil in production)`
- `Installers/internal/daemon/ai_prompt_capture_wiring.go:288-301 (promptEventIdentity mints unrelated uuids)`
- `Backend/src/ai-governance/dto/endpoint-evidence-batch.dto.ts:176-195 (promptEvidence ALREADY declared — deploy-order prerequisite already satisfied at rev 301)`
- `Backend/src/ai-governance/services/prompt-evidence-artifact-producer.service.ts:100,128-171 (skip; identity/emittedAt/uuid-v4 checks)`
- `Backend/src/ai-governance/services/prompt-evidence-artifact-producer.service.ts:207-224 (non-PENDING_UPLOAD → evidenceRef null)`
- `Backend/src/ai-governance/services/prompt-evidence-artifact-producer.service.ts:245-255 (contentRef must name a correlation key version)`
- `Backend/src/ai-governance/services/prompt-evidence-artifact-producer.service.ts:294-336,343-366 (mint; AUTHORITY_PENDING vs PENDING_UPLOAD)`
- `Backend/src/ai-security-policy/ai-prompt-evidence-capabilities.ts:96-156 (the two required keys; fail-calm)`
- `Backend/src/ai-governance/ai-governance.module.ts:296-325 (warn, never assert)`

### Fix

Three ordered steps. Steps 1-2 are safe and useful on their own: they replace a FABRICATED absence diagnosis with a MEASURED one, which is a real honesty gain even while the lane produces no text. Step 3 is the only part that needs the secrets and must be done as an ops change, never a boot assertion.

STEP 1 — carry the descriptor. Add `PromptEvidence map[string]any` to `evidencespool.EventInput`/`Event`, exactly mirroring `PolicyBundleApplication` (types.go:114-126) including its local shape validation. No Backend change is required: `endpoint-evidence-batch.dto.ts:186-195` already declares the property on the deployed revision.

STEP 2 — fix the identity binding, which is the part that will otherwise wedge the spool. The descriptor's `clientEventId` and `emittedAt` MUST equal the envelope the spool assigns. Add a `WithAssignedIdentity(eventID string, emittedAt time.Time)` hook to the append path so the spool rewrites those two descriptor fields at `Open` time (the descriptor is a `map[string]any`, so this is a two-key set, not a re-serialization), and drop `ClientEventID` from `promptEventIdentity`. Re-run `promptcapture.ValidateBuiltDescriptor` AFTER the rewrite — validating before and mutating after is how a half-trusted object reaches a durable channel.

STEP 3 — key custody. Provision both secrets in SSM/task-def (ARN form; `DATABASE_URL`'s stale-password lesson applies), then wire `promptEvidenceTenantKeySource` to the per-org prompt-evidence correlation key delivered through the existing custody/bootstrap path with a domain-separated `prompt-evidence` label, persisted under the endpoint's OS-protected credential store. NEVER boot-assert either key on the Backend: absence must keep degrading the lane exactly as `promptEvidenceDeploymentCapabilities()` already reports.

ORDER MATTERS FOR HONESTY TOO: after steps 1-2 and before step 3, every event will carry a descriptor stating `MISSING_REQUIRED / CORRELATION_KEY_UNAVAILABLE` — the endpoint's own measured fact — and the console will stop saying `ASSIGNED_AUTHORITY_MISMATCH`. That is the intended intermediate state and it is strictly better than today.

### Changes

**Installers** - `internal/evidencespool/types.go`

Add `PromptEvidence map[string]any` to `EventInput` and `PromptEvidence map[string]any \`json:"promptEvidence,omitempty"\`` to `Event`, with a doc comment mirroring :114-126 that states it is the §10.2/§10.3 `PromptEvidenceDescriptorV1` carried verbatim and is content-free by construction (identifiers, closed enums, byte counts, an HMAC contentRef — never prompt text).

**Installers** - `internal/evidencespool/spool.go`

Add `validatePromptEvidenceShape` beside the existing `validateBundleApplicationShape`: refuse an append whose descriptor is malformed, or whose `captureState` is PENDING_UPLOAD without a `contentRef` matching `^hmac-sha256:v\\d+:[0-9a-f]{64}$`. An endpoint must never spool a record the server will 422, because a 422 wedges the whole stream.

**Installers** - `internal/evidencespool/spool.go`

In the append path where `Open` assigns `eventId`/`emittedAt`, set `promptEvidence["clientEventId"]` and `promptEvidence["emittedAt"]` from the assigned envelope values before the record is fsynced, so the Backend's equality checks (prompt-evidence-artifact-producer.service.ts:145-159) can pass.

**Installers** - `internal/daemon/ai_prompt_capture_wiring.go`

Remove `ClientEventID` from `promptEventIdentity` (:288-301) — it is assigned by the spool now. Wire `promptEvidenceTenantKeySource` (:46) to the real per-org prompt-evidence correlation key from the custody/bootstrap client; keep returning nil when custody has not provisioned one, so `MISSING_REQUIRED / CORRELATION_KEY_UNAVAILABLE` remains the honest fallback.

**Installers** - `internal/daemon/ai_prompt_capture.go`

In `commitPromptCapture` (:361) and the caller at ai_handlers.go:1453-1455, attach `out.Prepared.Descriptor` to the outbound `evidencespool.EventInput` for BOTH the `PROMPT_EVIDENCE_CAPTURED` gate event and the prompt terminal event, on every capture state — not only PENDING_UPLOAD. §10.0 requires the explicit 'not captured, and exactly why', and the non-capturing states are precisely the ones that carry that answer. Move `ValidateBuiltDescriptor` (:285) to run after the spool's identity rewrite.

**Installers** - `internal/daemon/ai_prompt_capture.go`

Reconsider the `identity.ExecutionHost == "WINDOWS_NATIVE"` gate (ai_prompt_capture_wiring.go:183): on any non-Windows endpoint every descriptor reports UNSUPPORTED_SURFACE. Correct as shipped, but it means this lane is Windows-only — state it in the capability report rather than letting Linux/macOS endpoints look like a per-event failure.

**Backend** - `src/ai-governance/services/prompt-evidence-artifact-producer.service.ts`

No functional change — this service is already correct and already wired into the ingest `preAppend` seam. Only add a metric/log line counting descriptors received by `captureState`, so the first agent release carrying the field is measurable rather than assumed.

**ops** - `AWS SSM Parameter Store + backend task definition`

Provision `AI_CORRELATION_KEY_MASTER_KEY` and `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY` as secrets (ARN form — the plain-name form is known not to resolve here). No code gate, no boot assertion; `promptEvidenceDeploymentCapabilities()` flips to `governedEvidenceAvailable: true` on its own once both are present.

### Rejected alternatives

- Deriving `contentRef` from an unkeyed SHA-256 so the lane works without the correlation key — §10.2 forbids it and the source says why: an unkeyed hash of a guessable prompt presented as a tenant-keyed reference is the defect, not the fix (ai_prompt_capture_wiring.go:38-45). The Backend also refuses it independently.
- Boot-asserting the two keys once they are 'supposed to be' provisioned — a missing-secret boot assertion has already taken this product's production down; the module warns deliberately (ai-governance.module.ts:309-314) and that must not be revisited.
- Shipping the wire field alone and calling F3 closed — it would produce zero readable prompt text for anyone. Its only real benefit is replacing a fabricated diagnosis with a measured one, which is worth doing but must not be reported as making incidents investigable.
- Relaxing the Backend's `clientEventId`/`emittedAt` equality checks so the agent can keep minting its own ids — those checks are what stop a descriptor from being bound to an event it does not describe, and `evidence_ref` is hash-covered, so a mis-bound descriptor is permanent.

### Tests (each carries a defeat step)

- Go: append an event carrying a descriptor and assert the persisted record's `promptEvidence.clientEventId` equals the envelope `eventId` and `promptEvidence.emittedAt` equals the envelope `emittedAt`. DEFEAT: remove the identity-rewrite hook and assert the Backend contract test (below) now returns 422 `prompt-evidence-identity-mismatch` — this is the failure that would wedge the fleet's spool, so it must be provably reachable.
- Backend live-PG: post a batch with a PENDING_UPLOAD descriptor whose `contentRef` is properly keyed; assert one `ai_prompt_evidence_artifacts` row is minted, `ai_events.evidence_ref` equals `descriptor.contentId`, and the initial state is `PENDING_UPLOAD` when the bundle-application receipt has already landed, `AUTHORITY_PENDING` otherwise. DEFEAT: delete the receipt row and re-run, asserting the state flips to `AUTHORITY_PENDING` — if it does not, `receiptAlreadyLanded` (:343-366) is not being consulted and every artifact would be minted with an unproven authority.
- Backend live-PG: post the same batch with an UNKEYED `contentRef` and assert a 422 `prompt-evidence-content-ref-unkeyed` and that NO event row was written (the whole batch rolls back). DEFEAT: make the contentRef keyed and assert acceptance — pins that the refusal is about the key, not about the shape.
- Go with no tenant key (production posture today): assert every descriptor carries `captureState: MISSING_REQUIRED` and `reasonCode: CORRELATION_KEY_UNAVAILABLE`, and that no `contentRef`, no sanitized text and no protected record is produced. DEFEAT: inject a 32-byte test key via `promptEvidenceTenantKeySource` and assert the SAME input now produces PENDING_UPLOAD with a keyed contentRef — this is the one test that proves the key is the live gate and not a red herring.
- Backend: with both env keys unset, assert the app BOOTS, `promptEvidenceDeploymentCapabilities().governedEvidenceAvailable === false`, exactly one startup warning is logged, and an unrelated request succeeds. DEFEAT: set both keys and assert `governedEvidenceAvailable === true` with no warning. This test is the permanent guard against anyone converting the warning into an assertion.
- Cross-language: run the descriptor produced by the Go `promptcapture` corpus through `normalizePromptEvidenceDescriptor` and assert byte-parity, in both directions. DEFEAT: change one enum spelling on the Go side and assert the parity test fails — the three-mirror contract is only real if a drift is caught.

### Risks

1) A malformed descriptor 422s the ENTIRE batch and that is terminal for the stream — this is the single highest-risk change in the cluster. The local `validatePromptEvidenceShape` refusal is not optional; without it one bad descriptor permanently wedges an endpoint's evidence delivery.
2) `promptEvidence` is already declared on the deployed Backend, so a new agent will not 400 an old backend on THIS field — but do not assume the same for any sibling field added in the same release.
3) Provisioning the two secrets changes behaviour with no deploy: the upload lane starts accepting bodies and artifacts start reaching `PENDING_UPLOAD`. Provision them in a window where the retention sweep and the authority-gap cron are being watched, not on a Friday.
4) The lane is Windows-only by construction (`promptCaptureExecutionHost` refuses anything but WINDOWS_NATIVE). Do not report a fleet-wide capability that only part of the fleet can have.
5) Once artifacts exist, `PromptEvidenceAuthorityGapService`'s ten-minute cron starts promoting/failing them. Its `MISSING_REQUIRED / ASSIGNED_AUTHORITY_MISMATCH` outcome will then be a MEASURED result — which is exactly why F3's read-path fix must land first, or measured and fabricated instances of that same string become indistinguishable in the console.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- THE FIX INSTRUCTS THE FLEET-WEDGING FAILURE IT WARNS ABOUT. 'Attach out.Prepared.Descriptor to the outbound evidencespool.EventInput for BOTH the PROMPT_EVIDENCE_CAPTURED gate event and the prompt terminal event' puts one descriptor on two events in one batch. PromptEvidenceArtifactProducerService.plan() then throws on ALL THREE axes: duplicate contentId -> 'prompt-evidence-content-id-reused' (:101-107), duplicate promptAttemptId for capture-bearing entries -> 'prompt-evidence-attempt-reused' (:113-119), and clientEventId can equal at most one of the two enclosing eventIds -> 'prompt-evidence-identity-mismatch' (:145-150). Each is a 422, a 422 on this route is terminal, and a terminal 422 wedges the endpoint's whole evidence stream — the spec's own risk #1.
- 'On every capture state' cannot be implemented at the cited attach point. commitPromptCapture returns false immediately unless CaptureState == 'PENDING_UPLOAD' and HasContent() (ai_prompt_capture.go:361-366), and the PROMPT_EVIDENCE_CAPTURED event is emitted only through that gate. The non-capturing states — which are exactly the ones carrying the §10.0 'not captured, and why' answer — reach no event from there. The attach must be on the terminal event's EventInput built in handleAIPromptCheck / emitPromptHookEvent.
- DROPPING ClientEventID BREAKS THE LOCAL RECORD. promptcontentspool.RecoveryHeader.InitialClientEventID is set from out.event.ClientEventID (ai_prompt_capture.go:403), and the header also embeds the descriptor. Removing the field from promptEventIdentity (wiring:288-301) leaves the protected content record with an empty binding, and rewriting only the spooled descriptor makes the local header and the wire disagree about which event the content belongs to — on the exact lane whose whole purpose is a provable binding.
- SPOOL-SIDE MUTATION AFTER SEALING IS UNDER-SPECIFIED. 'Set promptEvidence["clientEventId"] and promptEvidence["emittedAt"] from the assigned envelope values before the record is fsynced' mutates a caller-owned map inside the append path. EventInput carries no PromptEvidence field today, so the ownership and aliasing rules for a map the daemon also holds (and also wrote into the recovery header) must be stated — copy-on-append, or the two copies diverge silently.
- EFFECT ON F3's READ FIX IS UNDERSTATED IN ONE DIRECTION. Risk #5 correctly says F3's read fix must land first. Add the converse: once descriptors arrive with captureState MISSING_REQUIRED / CORRELATION_KEY_UNAVAILABLE, `planOne`'s default branch mints evidenceRef: null (:207-224), so those rows still have NO artifact and still fall into the very projection branch F3 is repairing. The 'intermediate state is strictly better' claim only holds if F3's derivation reads the DESCRIPTOR's reasonCode, not just metadata.evidenceMode — which F3 does not currently do.

**Corrected root cause**: The root cause is CONFIRMED in full and this is the most carefully verified write-up in the cluster. All three inertia reasons check out: no wire field (evidencespool types.go:27-127, PolicyBundleApplication the sole typed payload); promptEvidenceTenantKeySource declared nil with the §10.2 reasoning in-source (ai_prompt_capture_wiring.go:34-46); the Backend refuses an unkeyed contentRef ('prompt-evidence-content-ref-unkeyed', prompt-evidence-artifact-producer.service.ts:252) and mints evidenceRef: null on every non-PENDING_UPLOAD branch (:221). The identity constraint the existing write-ups miss is real and correctly located: clientEventId equality at :145, emittedAt instant equality at :154, UUID v4 contentId at :166 — against promptEventIdentity minting an unrelated ClientEventID at ai_prompt_capture_wiring.go:288-301. The deploy-order claim is right: promptEvidence IS already declared on the deployed Backend at endpoint-evidence-batch.dto.ts:186-195 with the six-sightings warning in its own doc comment. The ops step correctly refuses to boot-assert (ai-governance.module.ts:294-325).

What is wrong is inside the fix: STEP 2 as written triggers the catastrophic failure the spec itself names as risk #1.


**Corrected approach**: Attach EXACTLY ONE descriptor per prompt attempt, on the TERMINAL PROMPT_* event only, and never on the gate event.
(1) Drop 'for BOTH the PROMPT_EVIDENCE_CAPTURED gate event and the prompt terminal event'. The gate event already carries the join keys it needs — commitPromptCapture stamps `promptAttemptId` and `contentId` into its content-free metadata (ai_prompt_capture.go:385-393) — and it is emitted only on the PENDING_UPLOAD branch anyway (the function returns early for every other capture state, :361-366), so 'on every capture state' is unimplementable there by construction.
(2) Keep ClientEventID minted in promptEventIdentity. Do not drop it: it is written into promptcontentspool.RecoveryHeader.InitialClientEventID (ai_prompt_capture.go:403) and is the local binding the recovery/upload path uses. Instead, make the spool's identity assignment authoritative and write the SAME assigned id back into both the descriptor and the recovery header, or reserve the event id BEFORE building the descriptor so one id is minted once. A rewrite that touches only the spooled copy leaves the local record naming a different event than the wire does.
(3) Re-run promptcapture.ValidateBuiltDescriptor after the rewrite, as the spec says — that part is right and important.
(4) Keep validatePromptEvidenceShape as a hard local refusal. It is the only thing standing between one malformed descriptor and a permanently wedged endpoint.


**Missing changes the reviewer found**:

- **Installers** `internal/daemon/ai_prompt_capture.go` - Attach the descriptor to the TERMINAL prompt event's EventInput only. Leave commitPromptCapture's PROMPT_EVIDENCE_CAPTURED gate event exactly as it is — its metadata already carries promptAttemptId and contentId (:385-393) and it fires only on PENDING_UPLOAD (:361-366).
- **Installers** `internal/promptcontentspool (RecoveryHeader writer)` - If the spool becomes the authority for clientEventId, the recovery header's InitialClientEventID and its embedded Descriptor must be written from the SAME assigned value. Unlisted in the spec, and without it the local protected record and the wire name different events.
- **Backend** `src/ai-governance/services/prompt-evidence-projection.service.ts` - F3's absence-cause derivation must also read the arriving descriptor's captureState/reasonCode, not only metadata.evidenceMode — otherwise every MISSING_REQUIRED / CORRELATION_KEY_UNAVAILABLE descriptor still mints evidenceRef: null (:207-224) and lands in the same UNPROVEN branch, and F3b's claimed 'measured instead of fabricated' gain does not reach the console.

**Collateral risk**: The dominant risk is correctly identified by the spec and then contradicted by its own fix step: a malformed or duplicated descriptor 422s the entire evidence batch terminally and wedges the endpoint's durable delivery — which is the transport for AI_POLICY_BUNDLE_APPLIED receipts, tool-call blocks and enforcement receipts. Wedging it would degrade signed-bundle application receipting and the durable half of the block ledger, both PROVEN WORKING in this engagement. That makes local-refusal validation (validatePromptEvidenceShape) non-negotiable and makes the one-descriptor-per-batch rule a correctness requirement, not a style choice. The ops step is safe: provisioning the two secrets is an environment change with no code gate, and the spec correctly refuses to boot-assert (ai-governance.module.ts:294-325). Windows-only scoping is real (ai_prompt_capture_wiring.go:183, identity.ExecutionHost == 'WINDOWS_NATIVE') and correctly flagged.

**Effort correction**: XL is credible and should not be revised down. With the corrections above (single-attach, id ownership across the spool and the recovery header, cross-language corpus parity) it stays over a week, and it is gated on an ops secrets change that must be watched.
