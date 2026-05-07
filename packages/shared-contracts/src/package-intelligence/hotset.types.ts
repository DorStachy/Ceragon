// ═══════════════════════════════════════════════════════════════════════
// Shared Hotset / Priority Types
// Used by: Ingestion (writes), Backend (reads for priority decisions)
// ═══════════════════════════════════════════════════════════════════════

export type EcosystemPopularityTier = 'top-100' | 'top-1000' | 'top-10000' | 'long-tail';

export type CustomerCriticalityTier = 'critical' | 'high' | 'normal' | 'none';

export interface HotsetPriorityRow {
  hotsetKey: string; // ecosystem#packageName
  ecosystem: string;
  packageName: string;
  customerManifestCount: number;
  recentInstallCount: number;
  ecosystemPopularityTier: EcosystemPopularityTier;
  customerCriticalityTier: CustomerCriticalityTier;
  priorityUntil: string; // ISO 8601 — after this date, row is cold
  lastManifestUpdateAt: string;
  lastInstallAt: string | null;
  updatedAt: string;
}

/**
 * Lightweight hotset lookup result (no DynamoDB overhead in the type).
 */
export interface HotsetLookupResult {
  found: boolean;
  customerRelevant: boolean;
  hotPackage: boolean;
  hotPackageTier: number; // 0 = not hot, 10–20 scaled
  customerCriticalityTier: CustomerCriticalityTier;
}

/**
 * Customer manifest event — emitted by Backend when a customer
 * registers packages in their lockfile / manifest.
 */
export interface CustomerManifestEvent {
  tenantId: string;
  ecosystem: string;
  packageName: string;
  version: string;
  reportedAt: string; // ISO 8601
  source: 'lockfile-scan' | 'install-check' | 'manual-registration';
}
