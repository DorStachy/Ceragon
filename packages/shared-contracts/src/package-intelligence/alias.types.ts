// ═══════════════════════════════════════════════════════════════════════
// Shared Alias & Artifact Types
// Used by: Ingestion (writes), Backend (reads for install-time lookup)
// ═══════════════════════════════════════════════════════════════════════

export type Ecosystem = 'npm' | 'pypi' | 'cargo' | 'go';

export type IntegrityThreatKind =
  | 'none'
  | 'upstream_checksum_mismatch'
  | 'same_version_byte_change';

export interface IntegrityThreatState {
  kind: IntegrityThreatKind;
  detectedAt: string | null;
  previousArtifactSha256: string | null;
  currentArtifactSha256: string | null;
  previousContentHash: string | null;
  currentContentHash: string | null;
  reason: string | null;
}

export interface ArtifactCatalogRow {
  artifactSha256: string;
  contentHash: string;
  ecosystem: Ecosystem;
  packageName: string;
  version: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  s3RawUri: string;
  s3ExtractedMetadataUri: string | null;
  upstreamDigestType: string | null;
  upstreamDigestValue: string | null;
  upstreamUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  normalizedManifestFingerprint: string | null;
  treeFingerprint: string | null;
}

export interface ArtifactAliasRow {
  aliasKey: string; // ecosystem#package#version#filename
  ecosystemPackage: string;
  currentArtifactSha256: string;
  currentContentHash: string;
  registryCursor: string;
  registryLastSeenAt: string;
  upstreamUrl: string;
  upstreamDigest: string | null;
  yanked: boolean;
  retracted: boolean;
  deleted: boolean;
  immutabilityViolation: boolean;
  immutabilityViolationFirstDetectedAt: string | null;
  lastIntegrityThreatAt: string | null;
  integrityThreat: IntegrityThreatState;
  recentPreviousArtifactSha256s: string[]; // capped at 8
  aliasHistoryCount: number;
  aliasHistoryPointer: string | null;
}
