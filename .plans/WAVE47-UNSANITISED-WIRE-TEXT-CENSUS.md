# Wave 4.7 — census: server- and endpoint-authored text drawn into copy positions

**Frontend repo.** Produced 2026-08-26 from worktree `C:/cwt/r47-fesmall`, branch `wave47/fesmall`,
based on Frontend `origin/main` `359d6548`.

This is a **work-list, not a fix**. Everything under `app/admin/endpoints/**` and `components/ui/empty.tsx`
was fixed in that branch; everything below is outside that territory and was deliberately left alone.

---

## 1. What the defect is, and what it is not

A value that arrived over the wire is handed to a component that draws it as copy, with no neutralizer
between. Measured on the rendered page, this is **not script injection**:

- `description` / `title` reach React as string children or as attribute values and are escaped.
- **There is no `dangerouslySetInnerHTML` anywhere in this repository.** Verified with the TypeScript
  parser across 1,483 files: **0 JSX attribute usages**. (A plain `grep` now returns 2 textual matches —
  both are comments in `app/admin/endpoints/` explaining this very fact. A grep census here reads 2 and
  means 0.)

What it *does* allow is a message from the wire choosing the shape and reading of a security surface.
Measured on the rendered page during this wave:

| Payload | Effect |
|---|---|
| `U+202E` RIGHT-TO-LEFT OVERRIDE | reverses the rest of the line, so a verdict can be made to read backwards |
| `U+200B` / `U+00AD` / `U+FE0F` / tag block | invisible inside a word; two fleet rows can be made to look like one machine |
| raw newline / `U+2028` | breaks a single-line cell out of its row |
| 2,400+ characters | runs past the visible panel and pushes the state's own action control off the fold |

The last one is the one that turns a cosmetic issue into a truth issue: enough padding places a plausible
sentence such as `GUARD: HEALTHY` inside a banner that is reporting the opposite.

**The fix is always the same two things** — the console's existing neutralizer
(`sanitizeAiSecurityDisplayText` in `lib/ai-security-display.ts`, which strips invisible and
direction-changing code points, folds control characters, and caps at 2,000) plus a **layout-sized**
length bound at the call site, because 2,000 is the DTO's bound and not a column's.

---

## 2. Method — and where it is blind

Census built with the **TypeScript parser** (`ts.createSourceFile`, `ScriptKind.TSX`), walking for JSX
attributes in a copy-bearing position and JSX expression children, filtered to identifiers whose name
indicates wire origin.

**Where the AST approach is stronger than grep**

- It sees **JSX-wrapped copy** — text split across element boundaries that no line-oriented grep can match.
- It reads the **5 tracked files containing NUL bytes**, which `grep -I` skips *silently* and which have
  therefore never appeared in any grep census of this repo. One of them is
  `components/admin/__tests__/ai-security-policy-section.c06.test.tsx`.
- It distinguishes a **comment** from **code**. This matters concretely: the `dangerouslySetInnerHTML`
  count above is 0 in code and 2 in text.
- It distinguishes `className` / `href` / `data-*` from copy, so SVG path data and route strings do not
  produce false positives.

**Where it is still blind — these holes are real and were hit during this wave**

1. **Only bare bindings.** It matches `{x}`, `{x.y}`, `{x[y]}`. It does **not** match a value reached
   through an operator or a call. `{executionHost ?? "not reported"}` in
   `app/admin/endpoints/agents-content.tsx` was **missed by this exact sweep** and found only by reading
   the file. So was the same value interpolated into a `title={...}` template literal two lines above.
   Both were genuine defects.
2. **Name-based origin guess.** A wire value named `x` or `summary` is not matched; a console constant
   named `activeTab.description` is. The list below is triaged by hand for that reason, and the triage is
   a judgement, not a proof.
3. **No taint tracking.** Whether a prop named `description` holds a literal or a fetch error depends on
   every caller. Pass-through props in shared components are marked *undetermined* below rather than
   guessed at.
4. **Attribute name list is closed.** A copy-bearing prop this repo invents later will not be seen until
   the list is extended.

A complete answer needs taint analysis from every `fetch` to every render position. This census is the
cheaper 80%, and it names its own 20%.

---

## 3. The work-list

Severity key:

- **S1** — untrusted text on a **security decision surface**, where a hostile string can make the reading
  wrong rather than merely ugly.
- **S2** — untrusted text elsewhere in the console; layout damage and spoofing, not a false verdict.
- **S3** — shared component or pass-through; severity depends on callers. Fixing at the component is
  higher leverage than fixing callers.
- **NOT A DEFECT** — console-authored constant. Listed so the next person does not re-triage it.

### 3.1 Backend-authored failure text — `description={error}` and friends

Same shape, 31 sites. **Shape-verified, provenance NOT verified per site** -- read the next paragraph
before treating any single row as a confirmed defect.

> **Correction, and it matters.** The first draft of this section asserted every one of these renders
> `body.error`. That is wrong, and it was caught by a test failing for the right reason. The one site
> examined closely, `app/admin/endpoints/agents-content.tsx:1107`, throws
> `new Error("Failed to fetch agents")` on the HTTP path -- **a literal this repo wrote**, not the
> server's text. Server bytes reach that banner by one narrower but real route: the same `catch` also
> catches `response.json()`, and a malformed body makes the engine throw a `SyntaxError` whose message
> **quotes the bytes it choked on**, so a server returning an HTML error page lands a fragment of that
> page on screen. The unambiguous passthrough in that same file was somewhere else entirely -- the
> uninstall modal's `throw new Error(data.error || ...)`.
>
> So each row below is one of three things and only reading the `setError` call tells you which:
> (a) a literal this repo wrote -- neutralizing costs nothing but fixes nothing;
> (b) `body.error` passed through -- the real defect;
> (c) a parse-error message quoting server bytes -- real, and easy to miss.
> **Check the `catch` before you fix the render.** Doing this per site is most of the remaining work in
> this section, and it is why the count is a list of candidates rather than a list of defects.

**All are S2 unless the surface states a security verdict.**

| File | Line | Prop |
|---|---|---|
| `app/admin/policies/approvals/action-approvals-section.tsx` | 307 | `description={error}` |
| `app/admin/policies/approvals/ai-detector-exceptions-section.tsx` | 125 | `description={error}` |
| `app/admin/policies/approvals/ai-exceptions-section.tsx` | 144 | `description={error}` |
| `app/admin/shared.tsx` | 428 | `title={error}` |
| `app/admin/sites/sites-content.tsx` | 132 | `title={error}` |
| `app/admin/users/users-content.tsx` | 800 | `description={error}` |
| `app/ai-control-plane/ai-sessions/ai-sessions-content.tsx` | 1168 | `description={error}` |
| `app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx` | 1417 | `description={error}` |
| `app/ai-control-plane/detections/detections-content.tsx` | 4185 | `description={error}` |
| `app/ai-control-plane/events/events-content.tsx` | 1397 | `description={error}` |
| `app/ai-control-plane/overview-content.tsx` | 582 | `description={error}` |
| `app/ai-control-plane/reports/reports-content.tsx` | 227 | `description={error}` |
| `app/alerts/alerts-content.tsx` | 2130 | `description={error}` |
| `app/analysis/analysis-content.tsx` | 1049 | `description={error}` |
| `app/endpoints/[hostname]/endpoint-hub-content.tsx` | 526 | `description={erroredForCurrentScope.message}` |
| `app/inventory/inventory-content.tsx` | 783 | `description={error}` |
| `app/inventory/item/[ecosystem]/[...name]/item-detail-content.tsx` | 698 | `description={erroredForCurrentScope.message}` |
| `app/mcp/mcp-approval-actions.tsx` | 189 | `description={error}` |
| `app/mcp/mcp-governance-content.tsx` | 547 | `description={error}` |
| `app/repositories/findings/global-findings-content.tsx` | 856 | `description={error}` |
| `app/repositories/repositories-content.tsx` | 415 | `description={error}` |
| `app/repositories/scans/global-scans-content.tsx` | 233 | `description={error}` |
| `app/repositories/[owner]/[repo]/repo-detail-content.tsx` | 895 | `description={error}` |
| `app/repositories/[owner]/[repo]/scans/[scanRunId]/scan-detail-content.tsx` | 1541 | `description={findingsError}` |
| `app/scripts/[...package]/package-forensics-content.tsx` | 1858 | `description={error}` |
| `components/inventory/inventory-fleet-view.tsx` | 756 | `description={error}` |
| `components/pr-security/dependencies-section.tsx` | 495 | `description={error}` |
| `components/pr-security/repo-findings-tab.tsx` | 594 | `description={error}` |
| `components/scan-detail/graph-panel.tsx` | 1753 | `description={error}` |

**The layout half of these is already closed.** `components/ui/empty.tsx` now sets `break-words` on
`EmptyDescription`, so every `EmptyState`/`EmptyError` caller in this table wraps. What remains for each is
the **neutralizer and the length bound**.

`app/admin/shared.tsx:428` and `app/admin/sites/sites-content.tsx:132` are `title={error}` — a native
tooltip, which `break-words` does **not** help. Those two still need the bound.

### 3.2 S1 — untrusted text on a security decision surface

| File | Line | Prop | Origin | Note |
|---|---|---|---|---|
| `app/ai-control-plane/events/events-content.tsx` | 505 | `title={reason}` | backend | **Highest-value entry in this census.** The chip's visible body is `humanizeControlledValue(reason)`; the tooltip on the same element is the raw value. Neutralized in one position and raw in the one beside it — the identical split that produced §3.12. |
| `components/admin/policy/category-bucket-board.tsx` | 1500 | `title={category.notEnforcedReason}` | backend | Why a detector is not enforced, on the policy board. |
| `components/admin/policy/category-bucket-board.tsx` | 1527 | `title={category.floor.reason}` | backend | Policy floor rationale. |
| `components/admin/policy/category-bucket-board.tsx` | 1536 | `title={category.ceiling.reason}` | backend | Policy ceiling rationale. |
| `components/ai-console/sessions/session-row.tsx` | 241 | `title={reason}` | backend | Risk-band cell on the sessions list. |
| `app/admin/policies/approvals/ai-detector-exceptions-section.tsx` | 192, 278 | `title={e.reason}` | **admin-authored, persisted** | An exception reason typed by one administrator, stored, and rendered to every other. Persisted and cross-user, so it outlives any single response. |
| `app/admin/policies/approvals/ai-exceptions-section.tsx` | 273 | `title={g.reason}` | **admin-authored, persisted** | As above. |
| `app/analysis/licenses/exceptions-panel.tsx` | 375 | `title={ex.reason}` | **admin-authored, persisted** | As above. |

### 3.3 S2 — user-authored data echoed back

| File | Line | Prop | Origin |
|---|---|---|---|
| `components/admin/endpoint-groups-tab.tsx` | 303 | `title={group.description}` | user-authored, persisted |
| `components/admin/teams-tab.tsx` | 267 | `title={team.description}` | user-authored, persisted |
| `app/repositories/repositories-content.tsx` | 794 | `title={repo.description}` | **third-party** — a repository description from the VCS provider, authored by whoever owns the repo |

`app/repositories/repositories-content.tsx:794` is worth calling out: it is the only entry here whose text
is authored outside the customer's own organisation.

### 3.4 S3 — shared components and pass-throughs (fix at the component, not the callers)

| File | Line | Prop | Why it is here |
|---|---|---|---|
| `components/ui/absent.tsx` | 70, 71 | `title={reason}`, `aria-label={reason}` | **Highest leverage in this group.** A shared primitive used across the console for absence explanations; every caller's `reason` lands here. `aria-label` additionally reaches a screen reader, where an invisible or direction-changing code point is not merely cosmetic. |
| `components/admin/ai-security-policy-section.tsx` | 4440 | `note={row.enforcedNote}` | *undetermined* — needs a caller check |
| `components/overview/ai-activity-region.tsx` | 410 | `note={sampleNote}` | *undetermined* — needs a caller check |
| `components/admin/section-header.tsx` | 47 | `description={description}` | pass-through on `AdminAccessRestricted`; callers appear to pass literals |
| `components/ai-console/sessions/session-row.tsx` | 369 | `description={description}` | pass-through |
| `components/ai-console/sessions/session-ribbon.tsx` | 175 | `label={description}` | pass-through |

### 3.5 NOT A DEFECT — console-authored constants

Listed so they are not re-triaged. Each of these binds a value this repo wrote, not one the wire supplied.

| File | Line | Prop |
|---|---|---|
| `app/analysis/layout.tsx` | 52 | `description={activeTab.description}` |
| `app/repositories/layout.tsx` | 66 | `description={activeTab.description}` |
| `app/ai-control-plane/ai-sessions/[id]/chain-not-recorded.tsx` | 77 | `title={copy.description}` |
| `app/ai-control-plane/ai-sessions/[id]/chain-parent-line.tsx` | 88 | `title={line.description}` |
| `app/ai-control-plane/ai-sessions/[id]/investigation-detail-pane.tsx` | 619 | `title={reasoningFidelityLabel(...).title}` |
| `app/ai-control-plane/ai-sessions/[id]/verdict-header.tsx` | 109 | `title={runSeverity.detail}` |
| `app/ai-control-plane/detections/detections-content.tsx` | 1435 | `title={category.detail}` |
| `app/inventory/item/[ecosystem]/[...name]/item-detail-content.tsx` | 274 | `description={noEndpointsState.description}` |
| `components/admin/ai-security-policy-section.tsx` | 5624 | `description={group.note}` — from `SETTINGS_GROUPS` |
| `components/admin/policy/action-row-list.tsx` | 436 | `title={lane.description}` |
| `components/admin/policy/category-bucket-board.tsx` | 1519 | `title={UNCLASSIFIED_GROUP_NOTE}` |
| `components/analysis/ai-artifact-coverage.tsx` | 97 | `title={COVERAGE_PENDING_DESCRIPTION}` |

---

## 4. Recommended order

1. **`components/ui/absent.tsx`** (§3.4) — one shared primitive, many callers, and it feeds `aria-label`.
2. **`app/ai-control-plane/events/events-content.tsx:505`** (§3.2) — the raw tooltip sitting beside its own
   neutralized twin is the clearest live instance of the defect class.
3. **The three persisted `reason` surfaces** (§3.2) — persisted and cross-user, so they outlive a response.
4. **`title={error}` at `app/admin/shared.tsx:428` and `app/admin/sites/sites-content.tsx:132`** — the two
   §3.1 entries the shared `break-words` fix does **not** reach.
5. **The remaining §3.1 table** — mechanical once a shared helper exists.
6. **Resolve the two *undetermined* entries** in §3.4.

A durable close would be a lint fence in the shape of the existing `scripts/check-wire-vocabulary.cjs` —
same parser, same allowlist-with-a-reason discipline — asserting that a copy-bearing prop is never bound to
a bare identifier reaching a `fetch`. That is the only version of this that a hand-fix cannot regress, and
it is the lesson `check-wire-vocabulary.cjs` already records in its own header: *"A hand fix cannot stop the
next one from being typed."*

---

## 5. Confidence

- The **file:line pairs and prop names** are parser output. High confidence.
- The **origin column** in sections 3.2 to 3.5 is hand triage, spot-checked by reading each site. Two
  entries are marked *undetermined* rather than guessed.
- The **origin claim in section 3.1 is shape-only** and was overstated in the first draft; see the
  correction there. Those 31 rows are candidates, and each needs its `setError` read before it is called
  a defect.
- The **completeness claim is bounded by §2**: values reached through an operator, a call, or a template
  literal are **not** in this census, and at least two real defects of that shape were found by reading
  rather than by sweeping. Treat the counts as a floor, never as a total.
