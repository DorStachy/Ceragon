/**
 * Portable description of the deployed AI security policy V1 surface.
 *
 * This module freezes existing Backend/Go behavior. It does not activate a new
 * protocol, detector, evaluator, writer, signature, or runtime bundle.
 */
import {
  AI_DLP_CLASSES,
  AI_DLP_DEFAULT_POLICY,
  type AiDlpClass,
  type AiDlpPolicyShape,
  type AiPolicyScope,
  type PromptEvidenceMode,
} from './ai-governance-contract';

/** Recursive readonly view for JSON-shaped contract data. */
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  const seen = new WeakSet<object>();

  const visit = (candidate: unknown): void => {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      seen.has(candidate)
    ) {
      return;
    }

    seen.add(candidate);
    for (const nested of Object.values(candidate)) visit(nested);
    Object.freeze(candidate);
  };

  visit(value);
  return value as DeepReadonly<T>;
}

export const AI_SECURITY_POLICY_V1_DLP_ACTIONS = deepFreeze([
  'block',
  'redact',
  'warn',
  'allow',
] as const);
export type AiSecurityPolicyV1DlpAction =
  (typeof AI_SECURITY_POLICY_V1_DLP_ACTIONS)[number];

export const AI_SECURITY_POLICY_V1_PROMPT_CONFIGURABLE_CLASSES = deepFreeze([
  'injection-instruction-override',
  'injection-system-exfil',
  'injection-role-marker',
  'injection-obfuscation-unicode',
  'injection-encoded-payload',
  'jailbreak-persona',
  'jailbreak-restriction-removal',
  'jailbreak-role-reassign',
] as const);

export const AI_SECURITY_POLICY_V1_PROMPT_DERIVED_CLASSES = deepFreeze([
  'injection-override-exfil',
  'jailbreak-persona-unrestricted',
] as const);

export const AI_SECURITY_POLICY_V1_PROMPT_CLASSES = deepFreeze([
  ...AI_SECURITY_POLICY_V1_PROMPT_CONFIGURABLE_CLASSES,
  ...AI_SECURITY_POLICY_V1_PROMPT_DERIVED_CLASSES,
] as const);
export type AiSecurityPolicyV1PromptClass =
  (typeof AI_SECURITY_POLICY_V1_PROMPT_CLASSES)[number];

export const AI_SECURITY_POLICY_V1_PROMPT_ACTIONS = deepFreeze([
  'block',
  'warn',
  'allow',
] as const);
export type AiSecurityPolicyV1PromptAction =
  (typeof AI_SECURITY_POLICY_V1_PROMPT_ACTIONS)[number];

export const AI_SECURITY_POLICY_V1_BROWSER_PROVIDER_KEYS = deepFreeze([
  'openai',
  'anthropic',
  'google',
  'github',
  'perplexity',
  'poe',
] as const);

export const AI_SECURITY_POLICY_V1_TOOL_PROVIDER_KEYS = deepFreeze([
  'cursor',
  'claude-code',
  'windsurf',
  'github-copilot',
  'cline',
  'gemini-cli',
  'codex',
] as const);

export const AI_SECURITY_POLICY_V1_GOVERNABLE_PROVIDER_KEYS = deepFreeze([
  ...AI_SECURITY_POLICY_V1_BROWSER_PROVIDER_KEYS,
  ...AI_SECURITY_POLICY_V1_TOOL_PROVIDER_KEYS,
] as const);

export const AI_SECURITY_POLICY_V1_EXCLUSION_ACTIONS = deepFreeze([
  'allow',
  'block',
] as const);
export type AiSecurityPolicyV1ExclusionAction =
  (typeof AI_SECURITY_POLICY_V1_EXCLUSION_ACTIONS)[number];

/** Kept for V1 vocabulary parity; the stored MCP shape uses two booleans. */
export const AI_SECURITY_POLICY_V1_MCP_ENFORCE_MODES = deepFreeze([
  'off',
  'enforce',
] as const);

export const AI_SECURITY_POLICY_V1_UPLOAD_ACTIONS = deepFreeze([
  'block',
  'warn',
  'allow',
] as const);
export type AiSecurityPolicyV1UploadAction =
  (typeof AI_SECURITY_POLICY_V1_UPLOAD_ACTIONS)[number];

export const AI_SECURITY_POLICY_V1_GOVERNANCE_MODES = deepFreeze([
  'enforce',
  'monitor',
  '',
] as const);
export type AiSecurityPolicyV1GovernanceMode =
  (typeof AI_SECURITY_POLICY_V1_GOVERNANCE_MODES)[number];

export const AI_SECURITY_POLICY_V1_ENFORCEMENT_TIERS = deepFreeze([
  'detect',
  'strict',
] as const);
export type AiSecurityPolicyV1EnforcementTier =
  (typeof AI_SECURITY_POLICY_V1_ENFORCEMENT_TIERS)[number];

export const AI_SECURITY_POLICY_V1_PROXY_FAIL_MODES = deepFreeze([
  'closed',
  'open',
] as const);
export type AiSecurityPolicyV1ProxyFailMode =
  (typeof AI_SECURITY_POLICY_V1_PROXY_FAIL_MODES)[number];

export const AI_SECURITY_POLICY_V1_INGRESS_ACTIONS = deepFreeze([
  'redact',
  'warn',
  'hold',
  'off',
] as const);
export type AiSecurityPolicyV1IngressAction =
  (typeof AI_SECURITY_POLICY_V1_INGRESS_ACTIONS)[number];

/**
 * This is deliberately a policy-addressable catalog, not a detector catalog.
 * The named non-policy signals document current exclusions from the 23-class
 * map without implying completeness or making ingress keys a closed enum.
 */
export const AI_SECURITY_POLICY_V1_CATALOG = deepFreeze({
  schemaVersion: 1,
  scope: 'v1-policy-addressable',
  completeDetectorInventory: false,
  dlpClasses: [...AI_DLP_CLASSES],
  promptRiskConfigurableClasses: [
    ...AI_SECURITY_POLICY_V1_PROMPT_CONFIGURABLE_CLASSES,
  ],
  promptRiskDerivedClasses: [...AI_SECURITY_POLICY_V1_PROMPT_DERIVED_CLASSES],
  browserProviderKeys: [...AI_SECURITY_POLICY_V1_BROWSER_PROVIDER_KEYS],
  toolProviderKeys: [...AI_SECURITY_POLICY_V1_TOOL_PROVIDER_KEYS],
  knownNonPolicyAddressableSignals: {
    engineEmittedDlp: ['base64-wrapped-secret'],
    policySynthesized: ['custom-blocklist'],
    ingressEngineClasses: [
      'ingress-exfil-instruction',
      'ingress-exfil-verb',
      'ingress-sensitive-path-read',
      'ingress-tool-poisoning',
    ],
  },
} as const);

/**
 * Literal defaults for directly omitted optional V1 fields only.
 *
 * This is intentionally not the full reader oracle; ordered evaluator
 * fallbacks and zero-value section behavior are captured separately below.
 */
export const AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS = deepFreeze({
  promptRisk: { obfuscationEscalates: true },
  ingress: {
    enabled: true,
    taintHold: true,
    actionForUnlistedClass: 'redact',
  },
  agents: { enforcementTier: 'detect' },
  proxy: { failMode: 'closed', failClosedUnlessLiteralOpen: true },
} as const);

/** Exact deployed Go V1 reader/evaluator fallback semantics. */
export const AI_SECURITY_POLICY_V1_READER_FALLBACKS = deepFreeze({
  legacyOrgWire: { expandedPolicySections: 'absent' },
  dlp: {
    configuredResolutionRequiresEnabled: true,
    actionResolutionOrder: [
      'configured-actions',
      'legacy-class-arrays',
      'built-in-default',
    ],
    builtInDefaultByClass: {
      'high-entropy': 'allow',
      allOtherClasses: 'warn',
    },
  },
  promptRisk: {
    configuredResolutionRequiresEnabled: true,
    actionResolutionOrder: [
      'configured-actions',
      'legacy-dlp-class-arrays',
      'severity-default',
    ],
    severityDefault: { high: 'block', medium: 'warn', other: 'allow' },
    obfuscationEscalatesWhenPolicyOrFieldAbsent: true,
  },
  providers: {
    membershipSourcesConsulted: [
      'nested-providers',
      'legacy-top-level-providers',
    ],
    blockedPrecedesTolerated: true,
    unlisted: 'allow',
  },
  mcp: {
    nilPolicy: { enabled: true, autoEnforce: false },
    decodedPolicyWithOmittedSection: {
      enabled: false,
      autoEnforce: false,
    },
  },
  agents: {
    absentOrNonStrictEnforcementTier: 'detect-equivalent',
    unsetMode: 'allow',
    emptyAllowlistUnderEnforce: 'allow',
    unknownMode: 'allow',
  },
  egress: {
    omittedSectionZeroValueMode: 'allow',
    unsetMode: 'allow',
    unknownMode: 'allow',
    blockedPrecedesAllowed: true,
  },
  ingress: {
    nilPolicyOrAbsentSection: {
      enabled: true,
      taintHold: true,
      actionForUnlistedClass: 'redact',
    },
  },
  proxy: {
    failClosedUnlessLiteralOpen: true,
  },
} as const);

export interface AiSecurityPolicyPatternRuleV1 {
  prefix: string;
  suffix: string;
  action: AiSecurityPolicyV1ExclusionAction;
}

export interface AiSecurityPolicyDlpConfigV1 {
  enabled: boolean;
  actions: Record<AiDlpClass, AiSecurityPolicyV1DlpAction>;
}

export interface AiSecurityPolicyPromptRiskConfigV1 {
  enabled: boolean;
  actions: Record<AiSecurityPolicyV1PromptClass, AiSecurityPolicyV1PromptAction>;
  /** Absent means enabled. */
  obfuscationEscalates?: boolean;
}

export interface AiSecurityPolicyProvidersConfigV1 {
  blocked: string[];
  tolerated: string[];
}

export interface AiSecurityPolicyExclusionsConfigV1 {
  allow: string[];
  block: string[];
  patterns: AiSecurityPolicyPatternRuleV1[];
}

export interface AiSecurityPolicyMcpConfigV1 {
  enabled: boolean;
  autoEnforce: boolean;
}

export interface AiSecurityPolicyUploadsConfigV1 {
  files: AiSecurityPolicyV1UploadAction;
  images: AiSecurityPolicyV1UploadAction;
  blockAllImages: boolean;
  maxSizeKb: number;
}

export interface AiSecurityPolicyPathsConfigV1 {
  blocked: string[];
  allowed: string[];
}

export interface AiSecurityPolicyAgentsConfigV1 {
  allowed: string[];
  mode: AiSecurityPolicyV1GovernanceMode;
  enforcementTier: AiSecurityPolicyV1EnforcementTier;
}

export interface AiSecurityPolicyEgressConfigV1 {
  mode: AiSecurityPolicyV1GovernanceMode;
  allowed: string[];
  blocked: string[];
  includeDefaults: boolean;
}

export interface AiSecurityPolicyProxyConfigV1 {
  failMode: AiSecurityPolicyV1ProxyFailMode;
}

export interface AiSecurityPolicyIngressConfigV1 {
  /** Absent means enabled. */
  enabled?: boolean;
  /** Keys remain free-form; only values are closed. */
  actions?: Record<string, AiSecurityPolicyV1IngressAction>;
  /** Absent means taint-and-hold is enabled. */
  taintHold?: boolean;
}

export interface AiSecurityPolicyStoredConfigV1 {
  dlp: AiSecurityPolicyDlpConfigV1;
  promptRisk: AiSecurityPolicyPromptRiskConfigV1;
  providers: AiSecurityPolicyProvidersConfigV1;
  exclusions: AiSecurityPolicyExclusionsConfigV1;
  mcp: AiSecurityPolicyMcpConfigV1;
  uploads: AiSecurityPolicyUploadsConfigV1;
  paths: AiSecurityPolicyPathsConfigV1;
  agents: AiSecurityPolicyAgentsConfigV1;
  egress: AiSecurityPolicyEgressConfigV1;
  proxy: AiSecurityPolicyProxyConfigV1;
  /** An absent section activates the on-box default-on posture. */
  ingress?: AiSecurityPolicyIngressConfigV1;
}

/** A present DLP section merges its partial map over the current complete map. */
export interface AiSecurityPolicyDlpUpdateV1 {
  enabled: boolean;
  actions: Partial<Record<AiDlpClass, AiSecurityPolicyV1DlpAction>>;
}

/** A present prompt section merges its partial map over the current map. */
export interface AiSecurityPolicyPromptRiskUpdateV1 {
  enabled: boolean;
  actions: Partial<
    Record<AiSecurityPolicyV1PromptClass, AiSecurityPolicyV1PromptAction>
  >;
  obfuscationEscalates?: boolean;
}

export interface AiSecurityPolicyAgentsUpdateV1 {
  allowed: string[];
  mode: AiSecurityPolicyV1GovernanceMode;
  /** Absent normalizes to detect. */
  enforcementTier?: AiSecurityPolicyV1EnforcementTier;
}

/**
 * PUT semantics: omitted top-level sections retain the base. Present sections
 * replace their scalar/list fields; only DLP and prompt action maps merge.
 * Explicit null is invalid and is represented only in the later write schema.
 */
export interface AiSecurityPolicyUpdateV1 {
  dlp?: AiSecurityPolicyDlpUpdateV1;
  promptRisk?: AiSecurityPolicyPromptRiskUpdateV1;
  providers?: AiSecurityPolicyProvidersConfigV1;
  exclusions?: AiSecurityPolicyExclusionsConfigV1;
  mcp?: AiSecurityPolicyMcpConfigV1;
  uploads?: AiSecurityPolicyUploadsConfigV1;
  paths?: AiSecurityPolicyPathsConfigV1;
  agents?: AiSecurityPolicyAgentsUpdateV1;
  egress?: AiSecurityPolicyEgressConfigV1;
  proxy?: AiSecurityPolicyProxyConfigV1;
  /** A present empty object deletes the stored override. */
  ingress?: AiSecurityPolicyIngressConfigV1;
}

export interface AiEffectiveDlpPolicyWireV1 {
  enabled: boolean;
  actions: Record<AiDlpClass, AiSecurityPolicyV1DlpAction>;
  blockClasses: AiDlpClass[];
  redactClasses: AiDlpClass[];
  warnClasses: AiDlpClass[];
}

/** The deployed org fallback remains a real, exact five-field V1 branch. */
export interface AiLegacyPolicyWireV1 {
  evidenceMode: PromptEvidenceMode;
  blockedProviders: string[];
  toleratedProviders: string[];
  dlp: AiDlpPolicyShape;
  updatedAt: string;
}

/** Core fields of the full site/team branch currently emitted by the Backend. */
export interface AiEffectiveSecurityPolicyWireBaseV1 {
  evidenceMode: PromptEvidenceMode;
  siteId: string;
  blockedProviders: string[];
  toleratedProviders: string[];
  providers: AiSecurityPolicyProvidersConfigV1;
  dlp: AiEffectiveDlpPolicyWireV1;
  promptRisk: AiSecurityPolicyPromptRiskConfigV1;
  exclusions: AiSecurityPolicyExclusionsConfigV1;
  mcp: AiSecurityPolicyMcpConfigV1;
  uploads: AiSecurityPolicyUploadsConfigV1;
  paths: AiSecurityPolicyPathsConfigV1;
  agents: AiSecurityPolicyAgentsConfigV1;
  egress: AiSecurityPolicyEgressConfigV1;
  proxy: AiSecurityPolicyProxyConfigV1;
  ingress?: AiSecurityPolicyIngressConfigV1;
  updatedAt: string;
}

/** No Team fold: every Team-resolution key is genuinely absent. */
export interface AiEffectiveSecurityPolicyNoTeamResolutionV1 {
  resolvedScope?: never;
  teamId?: never;
  appliedProfileId?: never;
  effective?: never;
}

/** Team fold: the Backend emits all four resolution keys atomically. */
export interface AiEffectiveSecurityPolicyTeamResolutionV1 {
  resolvedScope: AiPolicyScope;
  teamId: string | null;
  appliedProfileId: string | null;
  effective: true;
}

export type AiEffectiveSecurityPolicyWireV1 =
  AiEffectiveSecurityPolicyWireBaseV1 &
    (
      | AiEffectiveSecurityPolicyNoTeamResolutionV1
      | AiEffectiveSecurityPolicyTeamResolutionV1
    );

export type AiPolicyWireV1 =
  | AiLegacyPolicyWireV1
  | AiEffectiveSecurityPolicyWireV1;

function buildRecommendedDlpActions(): Record<
  AiDlpClass,
  AiSecurityPolicyV1DlpAction
> {
  const actions = {} as Record<AiDlpClass, AiSecurityPolicyV1DlpAction>;
  for (const name of AI_DLP_DEFAULT_POLICY.blockClasses) actions[name] = 'block';
  for (const name of AI_DLP_DEFAULT_POLICY.redactClasses) actions[name] = 'redact';
  for (const name of AI_DLP_DEFAULT_POLICY.warnClasses) actions[name] = 'warn';
  return actions;
}

function buildRecommendedPromptActions(): Record<
  AiSecurityPolicyV1PromptClass,
  AiSecurityPolicyV1PromptAction
> {
  const actions = {} as Record<
    AiSecurityPolicyV1PromptClass,
    AiSecurityPolicyV1PromptAction
  >;
  for (const name of AI_SECURITY_POLICY_V1_PROMPT_CONFIGURABLE_CLASSES) {
    actions[name] = 'warn';
  }
  for (const name of AI_SECURITY_POLICY_V1_PROMPT_DERIVED_CLASSES) {
    actions[name] = 'block';
  }
  return actions;
}

/** Exact executable Backend recommended preset; optional default-on keys omit. */
export const RECOMMENDED_AI_SECURITY_POLICY_V1: DeepReadonly<
  AiSecurityPolicyStoredConfigV1
> = deepFreeze<AiSecurityPolicyStoredConfigV1>({
  dlp: {
    enabled: AI_DLP_DEFAULT_POLICY.enabled,
    actions: buildRecommendedDlpActions(),
  },
  promptRisk: {
    enabled: true,
    actions: buildRecommendedPromptActions(),
  },
  providers: {
    blocked: [],
    tolerated: [],
  },
  exclusions: {
    allow: [],
    block: [],
    patterns: [],
  },
  mcp: { enabled: true, autoEnforce: false },
  uploads: {
    files: 'warn',
    images: 'warn',
    blockAllImages: false,
    maxSizeKb: 5120,
  },
  paths: {
    blocked: [],
    allowed: [],
  },
  agents: {
    allowed: [],
    mode: '',
    enforcementTier: 'detect',
  },
  egress: {
    mode: '',
    allowed: [],
    blocked: [],
    includeDefaults: true,
  },
  proxy: { failMode: 'closed' },
});

export function cloneRecommendedAiSecurityPolicyV1(): AiSecurityPolicyStoredConfigV1 {
  return JSON.parse(
    JSON.stringify(RECOMMENDED_AI_SECURITY_POLICY_V1),
  ) as AiSecurityPolicyStoredConfigV1;
}
