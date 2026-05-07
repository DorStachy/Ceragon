// ═══════════════════════════════════════════════════════════════════════
// Shared S3 Layout Conventions
// Both Ingestion (writes) and Backend (reads presigned URLs) must agree.
// ═══════════════════════════════════════════════════════════════════════

const BUCKET_PREFIX = process.env.CERAGON_S3_BUCKET_PREFIX || 'ceragon';
const ENV = process.env.CERAGON_ENV || 'staging';

export const S3_BUCKETS = {
  RAW_ARTIFACTS: `${BUCKET_PREFIX}-${ENV}-raw-artifacts`,
  EXTRACTED_METADATA: `${BUCKET_PREFIX}-${ENV}-extracted-metadata`,
  VERDICT_SNAPSHOTS: `${BUCKET_PREFIX}-${ENV}-verdict-snapshots`,
} as const;

export function rawArtifactKey(artifactSha256: string): string {
  // Two-level prefix for even distribution
  const prefix = artifactSha256.substring(0, 2);
  return `raw/${prefix}/${artifactSha256}`;
}

export function extractedMetadataKey(artifactSha256: string): string {
  const prefix = artifactSha256.substring(0, 2);
  return `metadata/${prefix}/${artifactSha256}/`;
}

export function verdictSnapshotKey(
  artifactSha256: string,
  engineGeneration: number,
  policyGeneration: number,
): string {
  const prefix = artifactSha256.substring(0, 2);
  return `snapshots/${prefix}/${artifactSha256}/eg${engineGeneration}_pg${policyGeneration}.json`;
}
