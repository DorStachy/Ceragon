/**
 * Release manifest contract — must match Installers/internal/release/manifest.go
 * one-to-one. The release tooling generates the manifest from live ECS state
 * at release-cut time and signs it; consumers (CLI, backend, retest harness)
 * read it to detect drift.
 *
 * See docs/CERAGON_POST_SCHEMA_RETEST_ISSUE_FIX_PLAN_2026-05-07.md §R0.
 */

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ReleaseChannel = 'stable' | 'beta' | 'dev';

/**
 * Canonical list of components in manifest order. Release tooling MUST
 * include all eight; manifest generation fails if any is missing.
 */
export const RELEASE_COMPONENT_NAMES = [
  'backend',
  'frontend',
  'staticWorker',
  'sandboxWorker',
  'intelStaticWorker',
  'intelSandboxWorker',
  'intelArtifactFetcher',
  'intelMultiFollower',
] as const;

export type ReleaseComponentName = (typeof RELEASE_COMPONENT_NAMES)[number];

/**
 * (cluster, service, runningExpected) per component. Verified live during
 * the third advisory review (2026-05-07): all eight services exist with
 * these exact identifiers. Intel-pipeline services run at desiredCount=0
 * as documented steady state per AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md
 * §5.3, hence runningExpected=false for those four.
 */
export const RELEASE_COMPONENT_CLUSTER_SERVICE: Record<
  ReleaseComponentName,
  { cluster: string; service: string; runningExpected: boolean }
> = {
  backend: { cluster: 'backend', service: 'backend-service', runningExpected: true },
  frontend: { cluster: 'frontend', service: 'frontend', runningExpected: true },
  staticWorker: {
    cluster: 'cera-workers-staging',
    service: 'cera-fetch-worker-staging',
    runningExpected: true,
  },
  sandboxWorker: {
    cluster: 'cera-workers-staging',
    service: 'cera-sandbox-worker-staging',
    runningExpected: true,
  },
  intelStaticWorker: {
    cluster: 'ceragon-intelligence-production',
    service: 'ceragon-intel-static-worker-production',
    runningExpected: false,
  },
  intelSandboxWorker: {
    cluster: 'ceragon-intelligence-production',
    service: 'ceragon-intel-sandbox-worker-production',
    runningExpected: false,
  },
  intelArtifactFetcher: {
    cluster: 'ceragon-intelligence-production',
    service: 'ceragon-intelligence-artifact-fetcher-production',
    runningExpected: false,
  },
  intelMultiFollower: {
    cluster: 'ceragon-intelligence-production',
    service: 'ceragon-multi-follower-production',
    runningExpected: false,
  },
};

export interface ReleaseComponent {
  cluster: string;
  service: string;
  taskDefinitionArn: string;
  taskDefinitionRevision: number;
  imageDigest: string;
  /**
   * SHA-256 of the sorted task-definition environment entries. Secret
   * VALUES are excluded but secret NAMES/ARNs are included so a same-image,
   * different-secret-source deployment is correctly classified as drift.
   */
  envHash: string;
  /** Workers only: the worker→backend message-schema version this component speaks. */
  workerContractVersion?: string;
  /** True for services that must report runningCount>=1; false for desired=0 steady-state. */
  runningExpected: boolean;
}

export interface ReleaseArtifacts {
  cliArtifactSha256: string;
  msiArtifactSha256: string;
  /** SHA-256 of the file at the install path AFTER install — not the build artifact SHA. */
  installedBinarySha256: string;
  installerDownloadUrl: string;
}

export interface ReleaseManifest {
  schemaVersion: number;
  channel: ReleaseChannel;
  /** Semver. */
  version: string;
  sourceCommit: string;
  /** RFC3339 UTC. Informational; gate decisions use digests/revisions, not timestamps. */
  releaseTimestamp: string;
  /** Semver range, e.g. ">=2.3.0 <3.0.0". */
  compatibleBackendRange: string;
  /** Backend refuses to remove legacy wire fields while CLI version below this; doctor refuses "verified". */
  minimumSupportedCliVersion: string;
  /**
   * Worker→backend message-schema semver range. Producer: release tooling
   * reads Static-Worker/package.json + Sandbox-Worker/package.json; the
   * lowest is the lower bound, current major is the upper bound.
   * Failure mode: gate fails with `RELEASE_GATE_WORKER_CONTRACT_MISMATCH`.
   */
  compatibleWorkerContractVersion: string;
  signingChain: string[];
  artifacts: ReleaseArtifacts;
  components: Record<ReleaseComponentName, ReleaseComponent>;
}

/**
 * Drift reasons — must match Installers/internal/release/manifest.go DriftReason.
 * Backend reports these per-component; doctor renders them on the
 * releaseManifest row.
 */
export const DRIFT_REASONS = [
  'INSTALLED_BINARY_SHA_MISMATCH',
  'IMAGE_DIGEST_MISMATCH',
  'TASK_DEFINITION_REVISION_MISMATCH',
  'ENV_HASH_MISMATCH',
  'RUNNING_COUNT_BELOW_EXPECTED',
  'CLI_BELOW_MINIMUM_SUPPORTED',
  'WORKER_CONTRACT_VERSION_OUT_OF_RANGE',
  'COMPONENT_MISSING_FROM_MANIFEST',
  'MANIFEST_UNREACHABLE',
] as const;

export type DriftReason = (typeof DRIFT_REASONS)[number];

export interface DriftFinding {
  /** Matches a ReleaseComponentName, "cli", or "manifest". */
  component: string;
  reason: DriftReason;
  expected: string;
  observed: string;
}

export interface DriftReport {
  /** Empty when manifestUnreachable=true. */
  manifestVersion?: string;
  manifestUnreachable: boolean;
  hasDrift: boolean;
  reasons: DriftFinding[];
}
