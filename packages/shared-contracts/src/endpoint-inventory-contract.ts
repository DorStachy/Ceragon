// ════════════════════════════════════════════════════════════════════════
// Endpoint Inventory Contract — sweep + extwatch findings on developer
// endpoints (MCP servers, IDE extensions).
//
// Wave 0 (2026-05-28). Design:
//   docs/superpowers/specs/2026-05-28-mcp-ide-extension-sweep-design.md
//
// Two new Backend routes consume these types:
//   POST /api/v1/endpoint/inventory          — `cera sweep` batch upload
//   POST /api/v1/endpoint/check-extension    — daemon extwatch single check
//
// Backend DTOs (mirrors of these types) live in Backend/src/endpoint/dto/.
// A parity spec (endpoint-inventory-contract.parity.spec.ts) enforces
// drift detection — same pattern as decision-contract.parity.spec.ts.
//
// Agent-side wire types live in Installers/internal/core/backend/client.go
// and conform to this contract by convention.
// ════════════════════════════════════════════════════════════════════════

import type { SecuritySeverity } from './security-taxonomy';

/**
 * Inventory ecosystems we support on an endpoint. Broader than the
 * registry-tier `Ecosystem` (in `package-intelligence/alias.types.ts`) —
 * includes endpoint-only surfaces (MCP server configs, IDE extensions).
 *
 * The package-registry members ('npm' | 'pypi' | 'cargo' | 'go' |
 * 'rubygems' | 'packagist') are inventoried at install-time via shims AND
 * may also surface in sweep findings when a previously-installed package
 * matches a fresh advisory.
 *
 * Future additions: 'browser-extension'.
 */
export const ENDPOINT_INVENTORY_ECOSYSTEMS = [
  'npm',
  'pypi',
  'cargo',
  'go',
  'rubygems',
  'packagist',
  'mcp',
  'editor-extension',
] as const;
export type EndpointInventoryEcosystem = (typeof ENDPOINT_INVENTORY_ECOSYSTEMS)[number];

/**
 * Where a finding originated.
 *   sweep        — scheduled or on-demand inventory match
 *   extwatch     — real-time filesystem watcher catch
 *   install-time — recorded by the existing shim chain (rare in this
 *                  contract; mostly used for historical event correlation)
 */
export const ENDPOINT_FINDING_SOURCES = ['sweep', 'extwatch', 'install-time'] as const;
export type EndpointFindingSource = (typeof ENDPOINT_FINDING_SOURCES)[number];

/**
 * Sweep scan profile. Mirrors Bumblebee's three-profile model.
 *   baseline — common global/user package roots + extension manifests
 *   project  — configured dev directories (~/code, ~/src, ...)
 *   deep     — operator-supplied broad roots (incident response)
 */
export const ENDPOINT_SWEEP_PROFILES = ['baseline', 'project', 'deep'] as const;
export type EndpointSweepProfile = (typeof ENDPOINT_SWEEP_PROFILES)[number];

/** The four IDE editor variants we support today. */
export const EDITOR_HOSTS = ['vscode', 'cursor', 'windsurf', 'vscodium'] as const;
export type EditorHost = (typeof EDITOR_HOSTS)[number];

/** MCP client variants whose configs we parse. */
export const MCP_CLIENTS = ['claude-desktop', 'cursor', 'windsurf', 'gemini-cli'] as const;
export type McpClient = (typeof MCP_CLIENTS)[number];

/**
 * Confidence in the inventory record's identity.
 *   high   — canonical metadata (lockfile + dist-info + checksum)
 *   medium — reliable name+partial version (one canonical source)
 *   low    — config path only / inferred from launcher command
 */
export const INVENTORY_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type InventoryConfidence = (typeof INVENTORY_CONFIDENCES)[number];

/** Endpoint OS family. */
export const ENDPOINT_OS_VALUES = ['windows', 'darwin', 'linux'] as const;
export type EndpointOs = (typeof ENDPOINT_OS_VALUES)[number];

/**
 * Action the backend recommends in response to a finding.
 *
 * Focused subset of the full PackageDecision verdict union. The agent's
 * extwatch only needs three outcomes:
 *   ALLOW — let it stay
 *   BLOCK — quarantine the extension folder / refuse install
 *   ALERT — surface to SOC; no automatic agent action (sweep default)
 *
 * The full `Verdict` union in decision-contract is still used at install-
 * time via the existing PackageDecision wire shape. This narrower union
 * is intentional: extwatch and sweep do not need PROMPT/HOLD/ALLOW_FAST
 * semantics.
 */
export const ENDPOINT_FINDING_ACTIONS = ['ALLOW', 'BLOCK', 'ALERT'] as const;
export type EndpointFindingAction = (typeof ENDPOINT_FINDING_ACTIONS)[number];

/**
 * Endpoint identity sent with every inventory upload.
 *
 * Minimum-disclosure: never includes file contents, user-data paths, or
 * environment secrets. MCP-config env values are redacted by the agent
 * before this object is ever constructed.
 */
export interface EndpointIdentity {
  endpointId: string;
  hostname: string;
  os: EndpointOs;
  arch: string;
  username: string;
  /** Unix UID; absent on Windows. */
  uid?: number;
}

/**
 * One inventoried item discovered on an endpoint.
 *
 * For ecosystem `'mcp'`:
 *   - `packageName` is the MCP server entry name (e.g. `'filesystem'`)
 *   - `version` is the launcher-inferred package version, or `'unknown'`
 *     when the launcher does not encode a version
 *   - `mcpClient` identifies which client config it lives in
 *
 * For ecosystem `'editor-extension'`:
 *   - `packageName` is the bare extension name (e.g. `'gitlens'`)
 *   - `publisher` is the publisher id (e.g. `'eamodio'`)
 *   - `editorHost` identifies the IDE variant
 *
 * For all other ecosystems, `packageName` is the canonical package name
 * in that registry's namespace (e.g. `'@scope/pkg'` for npm, `'pkg'` for
 * pypi); `publisher`, `editorHost`, `mcpClient` are absent.
 */
export interface EndpointInventoryItem {
  ecosystem: EndpointInventoryEcosystem;
  packageName: string;
  version: string;
  /** Path on disk where this item was discovered (lockfile / config / ext dir). */
  sourceFile?: string;
  /** Editor-extension only: publisher id. */
  publisher?: string;
  /** Editor-extension only. */
  editorHost?: EditorHost;
  /** MCP only: which client config this server entry lives in. */
  mcpClient?: McpClient;
  /** Identity confidence. */
  confidence: InventoryConfidence;
}

/**
 * Request body for `POST /api/v1/endpoint/inventory`.
 *
 * Sent by `cera sweep` on schedule (daemon tick) or on demand (operator).
 */
export interface EndpointInventoryBatch {
  endpoint: EndpointIdentity;
  profile: EndpointSweepProfile;
  items: EndpointInventoryItem[];
  /** ISO 8601 timestamp of when the sweep started on the endpoint. */
  scannedAt: string;
  /** Optional client-supplied correlation id for tracing. */
  clientCorrelationId?: string;
}

/**
 * A finding emitted by the backend after matching an inventory batch
 * (or a single-extension check) against the verdict store.
 */
export interface EndpointFinding {
  /** Backend-assigned. Stable across re-uploads of the same item. */
  findingId: string;
  source: EndpointFindingSource;
  item: EndpointInventoryItem;
  severity: SecuritySeverity;
  /** Identifiers of advisories that triggered this finding. */
  advisoryIds: string[];
  recommendedAction: EndpointFindingAction;
  /** Human-readable evidence summary, e.g. `'exact name+version match'`. */
  evidence?: string;
  /** ISO 8601 timestamp from the backend. */
  createdAt: string;
}

/**
 * Response body for `POST /api/v1/endpoint/inventory`.
 *
 * Returns zero or more findings — one per matched item. Items that did
 * not match the catalog produce no finding (silence == clean).
 */
export interface EndpointInventoryResponse {
  correlationId: string;
  findings: EndpointFinding[];
}

/**
 * Request body for `POST /api/v1/endpoint/check-extension`.
 *
 * Sent by the daemon's `extwatch` the moment a new IDE extension folder
 * appears on disk. The agent waits on this verdict before deciding to
 * quarantine.
 */
export interface EndpointExtensionCheckRequest {
  endpoint: EndpointIdentity;
  publisher: string;
  packageName: string;
  version: string;
  editorHost: EditorHost;
  /** Absolute path to the newly-created extension folder. */
  extensionPath: string;
  /** ISO 8601 timestamp when the folder was first observed. */
  detectedAt: string;
}

/**
 * Response body for `POST /api/v1/endpoint/check-extension`.
 *
 * Narrow shape — extwatch only needs an action + reason + linkage to a
 * finding record (for evidence-chain referencing). The full
 * `PackageDecision` wire shape used at install-time is intentionally NOT
 * reused here: extwatch does not need PromptPayload, TyposquatResult,
 * AsyncState, etc.
 */
export interface EndpointExtensionCheckResponse {
  correlationId: string;
  action: EndpointFindingAction;
  reason?: string;
  /** Risk score in the same 0–100 range as the install-time verdict. */
  riskScore?: number;
  severity?: SecuritySeverity;
  /** Identifiers of advisories that triggered this verdict (when BLOCK/ALERT). */
  advisoryIds?: string[];
  /**
   * Backend-assigned finding id so the agent can link a subsequent
   * quarantine-evidence event back to this decision.
   */
  findingId?: string;
}

// ════════════════════════════════════════════════════════════════════
// READ-SIDE (console UI) contract — Inventory list, triage, stats.
// Added 2026-05-28 (Endpoint Supply-Chain Inventory & Analysis UI plan).
// Backend persists ONE row per (org, endpoint, ecosystem, canonicalName,
// version) — safe items included — and the console reads them via
// GET /api/v1/endpoint/inventory.
// ════════════════════════════════════════════════════════════════════

/** Operational state of an inventoried item on its endpoint. */
export const ENDPOINT_INVENTORY_STATES = ['active', 'quarantined', 'restored'] as const;
export type EndpointInventoryState = (typeof ENDPOINT_INVENTORY_STATES)[number];

/** Human triage status (SOC workflow). Mirrors the repo-finding status model. */
export const ENDPOINT_TRIAGE_STATUSES = ['open', 'acknowledged', 'resolved', 'allowlisted'] as const;
export type EndpointTriageStatus = (typeof ENDPOINT_TRIAGE_STATUSES)[number];

/** A persisted inventory record as the console reads it (one per install). */
export interface EndpointInventoryRecord {
  id: string;
  endpointId: string;
  hostname: string;
  os: EndpointOs;
  ecosystem: EndpointInventoryEcosystem;
  /** Canonical identity (lowercased publisher.name / server id / pkg name). */
  name: string;
  publisher?: string;            // editor-extension only
  editorHost?: EditorHost;       // editor-extension only
  mcpClient?: McpClient;         // mcp only
  version: string;
  verdict: EndpointFindingAction;       // ALLOW | ALERT | BLOCK
  state: EndpointInventoryState;        // active | quarantined | restored
  triageStatus: EndpointTriageStatus;
  riskScore?: number;
  severity?: SecuritySeverity;
  advisoryIds?: string[];
  /** Latest finding id (links to Analysis detail + evidence chain). */
  findingId?: string;
  source: EndpointFindingSource;
  confidence: InventoryConfidence;
  firstSeen: string;             // ISO 8601
  lastSeen: string;              // ISO 8601
}

/** Query params for GET /api/v1/endpoint/inventory. */
export interface EndpointInventoryListQuery {
  type?: EndpointInventoryEcosystem | 'all';
  ecosystem?: EndpointInventoryEcosystem;
  endpointId?: string;
  verdict?: EndpointFindingAction;
  state?: EndpointInventoryState;
  triageStatus?: EndpointTriageStatus;
  search?: string;
  page?: number;        // 1-based
  pageSize?: number;    // default 50, max 200
  sort?: 'lastSeen' | 'riskScore' | 'name';
  order?: 'asc' | 'desc';
}

/** Facet counts for the filter chips. */
export interface EndpointInventoryFacets {
  byType: Record<string, number>;
  byVerdict: Partial<Record<EndpointFindingAction, number>>;
  byState: Partial<Record<EndpointInventoryState, number>>;
  byTriage: Partial<Record<EndpointTriageStatus, number>>;
  byEndpoint: Array<{ endpointId: string; hostname: string; count: number }>;
}

/** Response for GET /api/v1/endpoint/inventory. */
export interface EndpointInventoryListResponse {
  items: EndpointInventoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  facets: EndpointInventoryFacets;
}

/** Response for GET /api/v1/endpoint/inventory/stats (Overview card). */
export interface EndpointInventoryStats {
  totalItems: number;
  byType: Record<string, number>;
  flagged: number;       // verdict !== 'ALLOW'
  quarantined: number;
  restored: number;
  openTriage: number;
  trend: Array<{ date: string; flagged: number }>;  // last 14 days
}

/** POST /api/v1/endpoint/inventory/:id/triage. */
export interface EndpointTriageUpdateRequest {
  triageStatus: EndpointTriageStatus;
  note?: string;
}
export interface EndpointTriageUpdateResponse {
  id: string;
  triageStatus: EndpointTriageStatus;
  updatedAt: string;
}
