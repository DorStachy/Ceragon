// ═══════════════════════════════════════════════════════════════════════
// Shared DynamoDB Table Names
// Both Ingestion and Backend reference the same tables.
// Table creation logic (makeTableDefinitions) stays in Ingestion.
// ═══════════════════════════════════════════════════════════════════════

const ENV = process.env.CERAGON_ENV || 'staging';

export function tablePrefix(): string {
  return `ceragon-${ENV}`;
}

export const TABLE_NAMES = {
  ARTIFACT_CATALOG: `${tablePrefix()}-artifact-catalog`,
  ARTIFACT_ALIAS: `${tablePrefix()}-artifact-alias`,
  ARTIFACT_VERDICT: `${tablePrefix()}-artifact-verdict`,
  RELEASE_OBSERVATION_CURSORS: `${tablePrefix()}-release-observation-cursors`,
  ANALYSIS_LEASES: `${tablePrefix()}-analysis-leases`,
  SYSTEM_CONFIG: `${tablePrefix()}-system-config`,
  ARTIFACT_ALIAS_HISTORY: `${tablePrefix()}-artifact-alias-history`,
  HOTSET_PRIORITY: `${tablePrefix()}-hotset-priority`,
  PUBLISHER_PROFILE: `${tablePrefix()}-publisher-profile`,
  RELEASE_PROVENANCE: `${tablePrefix()}-release-provenance`,
} as const;
