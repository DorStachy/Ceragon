export const SOURCE_IDENTITY_TYPES = [
  'REGISTRY',
  'ALIAS',
  'GIT',
  'GITHUB',
  'URL_TARBALL',
  'URL',
  'FILE_PROTOCOL',
  'LOCAL_DIR',
  'LOCAL_TARBALL',
  'WORKSPACE',
] as const;

export type SourceIdentityType = (typeof SOURCE_IDENTITY_TYPES)[number];

export type SourceIdentityDependencyType = 'direct' | 'dev' | 'transitive';
export type SourceIdentityDependencyScope =
  | 'prod'
  | 'dev'
  | 'optional'
  | 'peer'
  | 'bundled'
  | 'workspace';

export interface SourceIdentity {
  sourceType: SourceIdentityType;
  aliasName?: string;
  requestedName: string;
  requestedVersion?: string;
  resolvedName?: string;
  resolvedVersion?: string;
  sourceSpec?: string;
  sourceHost?: string;
  sourceRef?: string;
  integrity?: string;
  sourceIntegrity?: string;
  artifactS3Key?: string;
  registryUrl?: string;
  dependencyType?: SourceIdentityDependencyType;
  dependencyScope?: SourceIdentityDependencyScope;
  lockfilePath?: string;
  packagePath?: string;
  lockfileRestoreKey?: string;
  parentNames?: string[];
  introducedBy?: string;
  optional?: boolean;
  dev?: boolean;
  workspaceName?: string;
}
