// ═══════════════════════════════════════════════════════════════════════
// Shared SQS Message Contracts
// Used by: Ingestion (enqueues background), Backend (enqueues interactive)
// ═══════════════════════════════════════════════════════════════════════

import type { Ecosystem } from './alias.types';

export interface ReleaseObservationMessage {
  messageType: 'release-observation.v1';
  idempotencyKey: string;
  ecosystem: Ecosystem;
  source: string;
  sourceCursor: string;
  packageName: string;
  version: string | null;
  filename: string | null;
  observedAt: string; // ISO 8601
  hints: {
    projectSerial?: number;
    customerRelevant?: boolean;
    hotPackage?: boolean;
    upstreamDigestType?: string;
    upstreamDigestValue?: string;
    upstreamUrl?: string;
    yanked?: boolean;
    retracted?: boolean;
    deleted?: boolean;
    packageCreatedAt?: string;
    previousVersionPublishedAt?: string;
    currentVersionPublishedAt?: string;
    versionCount?: number;
    newlyAddedDepsCount?: number;
    newlyAddedDepNames?: string[];
    maintainerSetChanged?: boolean;
    publisherChanged?: boolean;
    currentPublisher?: string;
    currentMaintainerCount?: number;
    distTagChanged?: boolean;
  };
}

export interface EnrichmentHints {
  packageCreatedAt?: string;
  previousVersionPublishedAt?: string;
  currentVersionPublishedAt?: string;
  versionCount?: number;
  newlyAddedDepsCount?: number;
  newlyAddedDepNames?: string[];
  maintainerSetChanged?: boolean;
  publisherChanged?: boolean;
  currentPublisher?: string;
  currentMaintainerCount?: number;
  distTagChanged?: boolean;
}

export interface ArtifactFetchMessage {
  messageType: 'artifact-fetch.v1';
  idempotencyKey: string;
  ecosystem: Ecosystem;
  packageName: string;
  version: string;
  filename: string;
  upstreamUrl: string;
  upstreamDigestType: string | null;
  upstreamDigestValue: string | null;
  sourceCursor: string;
  priorityClass: 'interactive' | 'background-high' | 'background-normal';
  preFetchScore: number;
  enrichmentHints?: EnrichmentHints;
}

export interface AnalysisStaticMessage {
  messageType: 'analysis-static.v1';
  idempotencyKey: string;
  artifactSha256: string;
  contentHash: string;
  ecosystem: Ecosystem;
  packageName: string;
  version: string;
  engineGeneration: number;
  postFetchScore: number;
  priorityClass: 'interactive' | 'background-high' | 'background-normal';
  s3RawUri: string;
}

export interface AnalysisDynamicMessage {
  messageType: 'analysis-dynamic.v1';
  idempotencyKey: string;
  artifactSha256: string;
  ecosystem: Ecosystem;
  packageName: string;
  version: string;
  engineGeneration: number;
  staticVerdictHint: string;
  staticRiskScore: number;
  escalationReasons: string[];
  priorityClass: 'interactive' | 'background-high' | 'background-normal';
}

export interface VerdictWriteMessage {
  messageType: 'verdict-write.v1';
  idempotencyKey: string;
  artifactSha256: string;
  engineGeneration: number;
  policyGeneration: number;
  finalVerdict: 'ALLOW' | 'PROMPT' | 'BLOCK';
  riskScore: number;
  confidence: 'high' | 'medium' | 'low';
  signalSummary: string[];
  richSnapshotPointer: string | null;
}

export type IngestionMessage =
  | ReleaseObservationMessage
  | ArtifactFetchMessage
  | AnalysisStaticMessage
  | AnalysisDynamicMessage
  | VerdictWriteMessage;
