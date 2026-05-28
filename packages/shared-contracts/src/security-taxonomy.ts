export const SECURITY_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

export const DEPENDENCY_DISPOSITIONS = [
  'NO_FINDING',
  'NEEDS_REVIEW',
  'MALICIOUS',
  'UNKNOWN',
  'FAILED',
] as const;
export type DependencyDisposition = (typeof DEPENDENCY_DISPOSITIONS)[number];

export const REPO_ANALYSIS_STATES = [
  'NOT_STARTED',
  'CACHED',
  'QUEUED',
  'ANALYZING',
  'COMPLETED',
  'DEFERRED',
  'FAILED',
] as const;
export type RepoAnalysisState = (typeof REPO_ANALYSIS_STATES)[number];

export const REPO_EVIDENCE_STATES = [
  'NONE',
  'CACHE_HIT',
  'COMPLETE',
  'PARTIAL',
  'COVERAGE_DEGRADED',
  'BACKPRESSURED',
] as const;
export type RepoEvidenceState = (typeof REPO_EVIDENCE_STATES)[number];

export const LEGACY_INSTALL_VERDICTS = [
  'ALLOW',
  'ALLOW_FAST',
  'PROMPT',
  'HOLD',
  'BLOCK',
  'PENDING',
  'INCONCLUSIVE',
] as const;
export type LegacyInstallVerdict = (typeof LEGACY_INSTALL_VERDICTS)[number];

export const SCAN_VERDICTS = ['PASS', 'WARN', 'FAIL'] as const;
export type ScanVerdict = (typeof SCAN_VERDICTS)[number];

export const REPO_REPORT_VERDICTS = [
  'NO_FINDING',
  'REVIEW',
  'MALICIOUS',
  'UNKNOWN',
  'FAILED',
] as const;
export type RepoReportVerdict = (typeof REPO_REPORT_VERDICTS)[number];

export function riskScoreToSeverity(score: number | null | undefined): SecuritySeverity | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null;
  }
  if (score >= 80) {
    return 'CRITICAL';
  }
  if (score >= 60) {
    return 'HIGH';
  }
  if (score >= 40) {
    return 'MEDIUM';
  }
  if (score >= 20) {
    return 'LOW';
  }
  return 'INFO';
}

export function reportVerdictToDisposition(
  reportVerdict: string | null | undefined,
): DependencyDisposition {
  switch ((reportVerdict ?? '').toUpperCase()) {
    case 'NO_FINDING':
      return 'NO_FINDING';
    case 'REVIEW':
    case 'NEEDS_REVIEW':
      return 'NEEDS_REVIEW';
    case 'MALICIOUS':
      return 'MALICIOUS';
    case 'FAILED':
      return 'FAILED';
    case 'UNKNOWN':
    default:
      return 'UNKNOWN';
  }
}

export function dispositionToReportVerdict(
  disposition: DependencyDisposition | null | undefined,
): RepoReportVerdict {
  switch (disposition) {
    case 'NO_FINDING':
      return 'NO_FINDING';
    case 'NEEDS_REVIEW':
      return 'REVIEW';
    case 'MALICIOUS':
      return 'MALICIOUS';
    case 'FAILED':
      return 'FAILED';
    case 'UNKNOWN':
    default:
      return 'UNKNOWN';
  }
}

export function legacyInstallVerdictToDisposition(
  verdict: string | null | undefined,
  riskScore?: number | null,
): DependencyDisposition {
  switch ((verdict ?? '').toUpperCase()) {
    case 'BLOCK':
      return 'MALICIOUS';
    case 'PROMPT':
      return 'NEEDS_REVIEW';
    case 'ALLOW':
    case 'ALLOW_FAST':
      return 'NO_FINDING';
    case 'HOLD':
    case 'PENDING':
    case 'INCONCLUSIVE':
      break;
    default:
      break;
  }

  if (typeof riskScore !== 'number' || !Number.isFinite(riskScore)) {
    return 'UNKNOWN';
  }
  if (riskScore >= 80) {
    return 'MALICIOUS';
  }
  if (riskScore >= 40) {
    return 'NEEDS_REVIEW';
  }
  return 'NO_FINDING';
}
