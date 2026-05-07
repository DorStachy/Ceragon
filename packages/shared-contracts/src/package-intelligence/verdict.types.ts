// ═══════════════════════════════════════════════════════════════════════
// Shared Verdict Types
// Used by: Ingestion (writes verdicts), Backend (reads for install-time)
// ═══════════════════════════════════════════════════════════════════════

export interface ArtifactVerdictRow {
  artifactSha256: string;
  engineGenerationPolicyGeneration: string; // sort key: engineGen#policyGen
  finalVerdict: 'ALLOW' | 'PROMPT' | 'BLOCK';
  riskScore: number;
  confidence: 'high' | 'medium' | 'low';
  decisionSource: string;
  analysisCompletedAt: string;
  staticEngineVersion: string;
  dynamicEngineVersion: string | null;
  policyBundleVersion: string;
  signalSummary: string[]; // max 32 signals
  richSnapshotPointer: string | null;
  current: boolean;
  engineGeneration: number;
}

export type VerdictConfidence = 'high' | 'medium' | 'low' | 'critical_degradation';

export interface VerdictLookupResult {
  /** Whether a precomputed verdict was found */
  found: boolean;
  /** The resolved artifact SHA-256 */
  artifactSha256: string | null;
  /** The current verdict if available */
  verdict: ArtifactVerdictRow | null;
  /** Effective confidence level */
  confidence: VerdictConfidence;
  /** Install-time policy recommendation */
  recommendation: 'allow' | 'allow_with_warning' | 'hold' | 'soft_block' | 'hard_block';
  /** Human-readable reason for the recommendation */
  reason: string;
  /** Whether the alias had an immutability violation */
  immutabilityViolation: boolean;
  /** Whether the verdict is stale (below GLOBAL_MIN_ENGINE_GENERATION) */
  stale: boolean;
}
