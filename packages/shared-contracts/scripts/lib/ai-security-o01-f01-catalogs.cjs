'use strict';

const crypto = require('node:crypto');

const APPROVAL = Object.freeze({
  decisionId: 'G-FAIL-ORACLE',
  approvalEventSha256:
    'sha256:2762f5819ed206d24abf435f4218cba4d05cfe8d458236598606a4d480c44eab',
  approvalRecordedAt: '2026-07-16T10:20:06Z',
  representedAuthorities: ['Product/Architecture', 'Security/CISO', 'Product', 'Privacy'],
  basis: 'BLUEPRINT_IR0_12_APPROVED_WRITTEN_RULE',
  restoration: 'P0_G02_RECORD_RESTORED_FROM_APPROVED_WRITTEN_RULE',
});

const HMACS = Object.freeze({
  field: `hmac-sha256:v1:field-path:${'a'.repeat(64)}`,
  resource: `hmac-sha256:v1:resource:${'b'.repeat(64)}`,
  destination: `hmac-sha256:v1:destination:${'c'.repeat(64)}`,
});

const OBLIGATION_PARAMETERS = Object.freeze({
  AUDIT: Object.freeze({
    eventClass: 'ai.security.enforcement',
    retentionClass: 'security.standard',
  }),
  NOTIFY: Object.freeze({
    copyKey: 'ai.security.notice.policy',
    audience: 'USER',
  }),
  SANITIZE: Object.freeze({
    transformIds: ['secret.mask.minimum-unit'],
    targetFieldPathHmacs: [HMACS.field],
    requireParse: true,
    requireRescan: true,
    requireStatePreservation: true,
  }),
  RESTRICT_CAPABILITY: Object.freeze({
    capabilities: ['network.egress'],
    resourceRefs: [],
    destinationRefs: [],
  }),
  REQUIRE_CONFIRMATION: Object.freeze({
    confirmationClass: 'sensitive-destination',
    trustedSurface: 'BROWSER_EXTENSION',
    ttlSeconds: 300,
  }),
  REQUIRE_DELEGATED_APPROVAL: Object.freeze({
    approvalClass: 'privileged-effect',
    reviewerRoles: ['security-admin'],
    ttlSeconds: 300,
    maxUses: 1,
  }),
  DENY: Object.freeze({
    invariantId: 'forbidden-destination',
    copyKey: 'ai.security.block.forbidden-destination',
    nonGrantable: true,
  }),
  QUARANTINE: Object.freeze({
    until: 'INSPECTION_COMPLETE',
    ttlSeconds: 900,
  }),
});

const SOURCE_SCOPE_BY_KIND = Object.freeze({
  AUDIT: Object.freeze({ type: 'org', id: 'org-fixture' }),
  NOTIFY: Object.freeze({ type: 'site', id: 'site-fixture' }),
  SANITIZE: Object.freeze({ type: 'team', id: 'team-fixture' }),
  RESTRICT_CAPABILITY: Object.freeze({ type: 'team', id: 'team-fixture' }),
  REQUIRE_CONFIRMATION: Object.freeze({ type: 'site', id: 'site-fixture' }),
  REQUIRE_DELEGATED_APPROVAL: Object.freeze({ type: 'org', id: 'org-fixture' }),
  DENY: Object.freeze({ type: 'org', id: 'org-fixture' }),
  QUARANTINE: Object.freeze({ type: 'site', id: 'site-fixture' }),
});

const HARD_FLOOR_KINDS = new Set(['AUDIT', 'DENY', 'QUARANTINE']);
const NON_GRANTABLE_KINDS = new Set(['AUDIT', 'DENY', 'QUARANTINE']);

const DOWN_CONVERSION = Object.freeze([
  Object.freeze({
    terminalRequirement: 'NON_GRANTABLE_DENY',
    v1Decision: 'BLOCK',
    requiredBehavior: 'CERTIFIED_DENY_BEFORE_EFFECT',
    mayProceedBeforeRequirement: false,
    trustedSurfaceRequired: false,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    terminalRequirement: 'QUARANTINE_OR_DELEGATED_APPROVAL',
    v1Decision: 'HOLD',
    requiredBehavior: 'HOLD_UNTIL_ORACLE_RESOLUTION',
    mayProceedBeforeRequirement: false,
    trustedSurfaceRequired: false,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    terminalRequirement: 'LOCAL_CONFIRMATION',
    v1Decision: 'PROMPT',
    requiredBehavior: 'TRUSTED_CONFIRMATION_ONLY',
    mayProceedBeforeRequirement: false,
    trustedSurfaceRequired: true,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    terminalRequirement: 'SATISFIABLE_SANITIZE',
    v1Decision: 'ALLOW',
    requiredBehavior: 'TRANSFORM_PARSE_RESCAN_BEFORE_ALLOW',
    mayProceedBeforeRequirement: false,
    trustedSurfaceRequired: false,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    terminalRequirement: 'SATISFIABLE_RESTRICTION',
    v1Decision: 'ALLOW',
    requiredBehavior: 'RESTRICTION_PROOF_BEFORE_ALLOW',
    mayProceedBeforeRequirement: false,
    trustedSurfaceRequired: false,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    terminalRequirement: 'AUDIT_NOTIFY_ONLY',
    v1Decision: 'ALLOW',
    requiredBehavior: 'AUDIT_NOTIFY_WITHOUT_EFFECT_CLAIM',
    mayProceedBeforeRequirement: true,
    trustedSurfaceRequired: false,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    terminalRequirement: 'INSPECTION_OR_EFFECT_INCOMPLETE',
    v1Decision: 'INCONCLUSIVE',
    requiredBehavior: 'FAILURE_ORACLE_BEFORE_RANKING',
    mayProceedBeforeRequirement: false,
    trustedSurfaceRequired: false,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    terminalRequirement: 'POLICY_AWAITING_AUTHORITY',
    v1Decision: 'PENDING',
    requiredBehavior: 'HOLD_PENDING_AUTHORITY',
    mayProceedBeforeRequirement: false,
    trustedSurfaceRequired: false,
    onUnsupported: 'FAILURE_ORACLE',
  }),
]);

const LEGACY_WARN_BY_CHECKPOINT = Object.freeze([
  Object.freeze({
    surface: 'RUNTIME_ADAPTER',
    checkpoint: 'PRE_PROMPT',
    semantic: 'NOTIFY_ONLY',
    v1Decision: 'ALLOW',
    requestedEffect: 'audit-only',
    trustedSurface: null,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'RUNTIME_ADAPTER',
    checkpoint: 'PRE_TOOL',
    semantic: 'UNSUPPORTED',
    v1Decision: 'INCONCLUSIVE',
    requestedEffect: null,
    trustedSurface: null,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'RUNTIME_ADAPTER',
    checkpoint: 'POST_TOOL',
    semantic: 'NOTIFY_ONLY',
    v1Decision: 'ALLOW',
    requestedEffect: 'audit-only',
    trustedSurface: null,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'LOCAL_PROXY',
    checkpoint: 'PRE_UPSTREAM_DISPATCH',
    semantic: 'HOLD',
    v1Decision: 'HOLD',
    requestedEffect: 'stop-continuation',
    trustedSurface: null,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'LOCAL_PROXY',
    checkpoint: 'POST_UPSTREAM_RESPONSE',
    semantic: 'NOTIFY_ONLY',
    v1Decision: 'ALLOW',
    requestedEffect: 'audit-only',
    trustedSurface: null,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'BROWSER_COMPOSER',
    checkpoint: 'PRE_SUBMIT',
    semantic: 'CONFIRM',
    v1Decision: 'PROMPT',
    requestedEffect: 'deny-prompt',
    trustedSurface: 'BROWSER_EXTENSION',
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'BROWSER_COMPOSER',
    checkpoint: 'POST_SUBMIT',
    semantic: 'NOTIFY_ONLY',
    v1Decision: 'ALLOW',
    requestedEffect: 'audit-only',
    trustedSurface: null,
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'BROWSER_UPLOAD',
    checkpoint: 'PRE_UPLOAD_DISPATCH',
    semantic: 'CONFIRM',
    v1Decision: 'PROMPT',
    requestedEffect: 'stop-continuation',
    trustedSurface: 'BROWSER_EXTENSION',
    onUnsupported: 'FAILURE_ORACLE',
  }),
  Object.freeze({
    surface: 'BROWSER_UPLOAD',
    checkpoint: 'POST_UPLOAD_DISPATCH',
    semantic: 'NOTIFY_ONLY',
    v1Decision: 'ALLOW',
    requestedEffect: 'audit-only',
    trustedSurface: null,
    onUnsupported: 'FAILURE_ORACLE',
  }),
]);

const UNSUPPORTED_BY_KIND = Object.freeze({
  AUDIT: 'NO_CERTIFIED_AUDIT_SINK',
  NOTIFY: 'NO_CERTIFIED_NOTIFICATION_SINK',
  SANITIZE: 'TRANSFORM_OR_PROOF_PLAN_UNAVAILABLE',
  RESTRICT_CAPABILITY: 'RESTRICTION_HANDLER_OR_PROOF_PLAN_UNAVAILABLE',
  REQUIRE_CONFIRMATION: 'TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE',
  REQUIRE_DELEGATED_APPROVAL: 'DELEGATED_APPROVAL_AUTHORITY_UNAVAILABLE',
  DENY: 'DENY_EFFECT_UNAVAILABLE',
  QUARANTINE: 'QUARANTINE_OR_ZERO_RELEASE_UNAVAILABLE',
});

const SPECIAL_UNSUPPORTED = Object.freeze([
  Object.freeze({
    id: 'unsupported.transform-composition-conflict',
    obligationKind: null,
    trigger: 'TRANSFORM_COMPOSITION_CONFLICT',
  }),
  Object.freeze({
    id: 'unsupported.unknown-v2-token',
    obligationKind: null,
    trigger: 'UNKNOWN_V2_TOKEN',
  }),
  Object.freeze({
    id: 'unsupported.codex-pre-tool-warn-hold',
    obligationKind: null,
    trigger: 'CODEX_PRE_TOOL_WARN_OR_HOLD_UNSUPPORTED',
  }),
  Object.freeze({
    id: 'unsupported.post-checkpoint-retroactive-prevention',
    obligationKind: null,
    trigger: 'POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM',
  }),
]);

const PRE_EFFECTS = Object.freeze({
  PRE_PROMPT: 'deny-prompt',
  PRE_TOOL: 'deny-tool',
  PRE_UPSTREAM_DISPATCH: 'stop-continuation',
  PRE_SUBMIT: 'deny-prompt',
  PRE_UPLOAD_DISPATCH: 'stop-continuation',
});

const POST_CHECKPOINTS = new Set([
  'POST_TOOL',
  'POST_UPSTREAM_RESPONSE',
  'POST_SUBMIT',
  'POST_UPLOAD_DISPATCH',
]);

const TRUST_FAILURES = new Set(['POLICY_INVALID', 'POLICY_EXPIRED']);

const HARD_IMPACT_RULES = Object.freeze({
  ACTIVE_SECRET: Object.freeze({
    outcome: 'DENY',
    recoveryAction: 'REMOVE_ACTIVE_SECRET',
  }),
  FORBIDDEN_DESTINATION: Object.freeze({
    outcome: 'DENY',
    recoveryAction: 'CHANGE_FORBIDDEN_DESTINATION',
  }),
  DESTRUCTIVE_OR_PRIVILEGED: Object.freeze({
    outcome: 'HOLD',
    recoveryAction: 'REDUCE_CAPABILITY_AND_RETRY',
  }),
  APPROVAL_REQUIRED: Object.freeze({
    outcome: 'HOLD',
    recoveryAction: 'REQUEST_DELEGATED_APPROVAL',
  }),
  TRUST_INTEGRITY: Object.freeze({
    outcome: 'DENY',
    recoveryAction: 'RESTORE_TRUSTED_POLICY',
  }),
});

const FAILURE_RECOVERY = Object.freeze({
  POLICY_UNAVAILABLE: 'RETRY_AFTER_PROTECTION_RESTORED',
  POLICY_INVALID: 'RESTORE_TRUSTED_POLICY',
  POLICY_EXPIRED: 'RESTORE_TRUSTED_POLICY',
  PARTIAL: 'RETRY_AFTER_PROTECTION_RESTORED',
  UNSUPPORTED: 'USE_SUPPORTED_SURFACE',
  BUDGET_EXCEEDED: 'RETRY_AFTER_PROTECTION_RESTORED',
  PARSER_FAILED: 'RETRY_AFTER_PROTECTION_RESTORED',
  ENCRYPTED: 'USE_SUPPORTED_SURFACE',
  TIMED_OUT: 'RETRY_AFTER_PROTECTION_RESTORED',
  EFFECT_EXTRACTION_INCOMPLETE: 'USE_SUPPORTED_SURFACE',
  UNSUPPORTED_EFFECT: 'USE_SUPPORTED_SURFACE',
  TRANSLATION_FAILED: 'USE_SUPPORTED_SURFACE',
  RUNTIME_ACK_MISSING: 'START_NEW_PROPOSAL',
  INTERVENTION_UNAVAILABLE: 'USE_SUPPORTED_SURFACE',
});

function assertExactKeys(record, expected, label) {
  const actual = Object.keys(record);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} keys changed`);
  }
}

function digestCanonical(value, canonicalizeJcs) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(Buffer.from(canonicalizeJcs(value), 'utf8'))
    .digest('hex')}`;
}

function ruleIdForKind(kind) {
  return `rule.${kind.toLowerCase().replaceAll('_', '-')}`;
}

function obligationId(ruleId, kind, ordinal = 0) {
  return `${ruleId}:${kind.toLowerCase()}:${ordinal}`;
}

function buildObligation(kind, canonicalizeJcs, overrides = {}) {
  const sourceRuleId = overrides.sourceRuleId || ruleIdForKind(kind);
  const parameters = overrides.parameters || OBLIGATION_PARAMETERS[kind];
  return {
    obligationId:
      overrides.obligationId || obligationId(sourceRuleId, kind, overrides.ordinal || 0),
    kind,
    sourceRuleId,
    sourceScope: overrides.sourceScope || SOURCE_SCOPE_BY_KIND[kind],
    grantable:
      overrides.grantable === undefined
        ? !NON_GRANTABLE_KINDS.has(kind)
        : overrides.grantable,
    hardFloor:
      overrides.hardFloor === undefined
        ? HARD_FLOOR_KINDS.has(kind)
        : overrides.hardFloor,
    reasonCode: overrides.reasonCode || `fixture.${kind.toLowerCase().replaceAll('_', '-')}`,
    parameters,
    parametersDigest: digestCanonical(parameters, canonicalizeJcs),
  };
}

function buildUnsupportedMatrix(obligationKinds) {
  assertExactKeys(
    UNSUPPORTED_BY_KIND,
    obligationKinds,
    'unsupported obligation-kind matrix',
  );
  return [
    ...obligationKinds.map((kind) => ({
      id: `unsupported.${kind.toLowerCase().replaceAll('_', '-')}`,
      obligationKind: kind,
      trigger: UNSUPPORTED_BY_KIND[kind],
      resultState: 'UNSUPPORTED',
      includeInUnsatisfiedIds: true,
      mayDrop: false,
      mayRankAllow: false,
      resolution: 'FAILURE_ORACLE',
    })),
    ...SPECIAL_UNSUPPORTED.map((row) => ({
      ...row,
      resultState: 'UNSUPPORTED',
      includeInUnsatisfiedIds: true,
      mayDrop: false,
      mayRankAllow: false,
      resolution: 'FAILURE_ORACLE',
    })),
  ];
}

function buildO01Catalog(contracts, canonicalizeJcs) {
  const union = contracts.AI_OBLIGATION_KINDS.map((kind) =>
    buildObligation(kind, canonicalizeJcs),
  );
  const byKind = Object.fromEntries(union.map((obligation) => [obligation.kind, obligation]));
  const secondSanitize = buildObligation('SANITIZE', canonicalizeJcs, {
    sourceRuleId: 'rule.sanitize-extra',
  });

  return {
    format: 'ceragon.ai-security.obligation-contract',
    formatVersion: 1,
    protocolVersion: '2',
    productionV2WriterEnabled: false,
    orderedTuples: {
      obligationKinds: [...contracts.AI_OBLIGATION_KINDS],
      obligationStates: [...contracts.AI_OBLIGATION_STATES],
      primaryStates: [...contracts.AI_PRIMARY_STATES],
      inspectionStatuses: [...contracts.AI_INSPECTION_STATUSES],
    },
    obligationUnionCases: union,
    combiner: {
      phaseOrder: [
        'HARD_FLOORS',
        'AUDIT_NOTIFY_RESTRICTION_UNION',
        'TRANSFORM_ACCUMULATION',
        'CONFIRMATION_APPROVAL_PRESERVATION',
        'NON_GRANTABLE_DENY',
      ],
      scopeOrder: ['org', 'site', 'team'],
      transformOrder: ['SCOPE_ORDER', 'SOURCE_RULE_ID_ASCII', 'SOURCE_ORDINAL'],
      hardFloorsFirst: true,
      lowerScopeMayRemove: false,
      grantDischargesOnlyListedGrantableIds: true,
      nonGrantableHardFloorClasses: [
        'IDENTITY',
        'AUDIENCE',
        'TENANT_ISOLATION',
        'TAMPER',
        'TRUST_SIGNATURE',
        'FORBIDDEN_DESTINATION',
        'POLICY_HARD_FLOOR',
      ],
      incompatibleTransforms: {
        retainAll: true,
        resultState: 'UNSUPPORTED',
        resolution: 'FAILURE_ORACLE',
        mayDrop: false,
      },
      denySupersession: {
        onlyImpossibleEffects: true,
        auditAndNotifyStillExecute: true,
        recordSupersessionEdges: true,
      },
    },
    combinerCases: [
      {
        id: 'monotonic-scope-union',
        inputObligationIds: [
          byKind.AUDIT.obligationId,
          byKind.NOTIFY.obligationId,
          byKind.RESTRICT_CAPABILITY.obligationId,
        ],
        grantObligationIds: [],
        expectedOrderedObligationIds: [
          byKind.AUDIT.obligationId,
          byKind.NOTIFY.obligationId,
          byKind.RESTRICT_CAPABILITY.obligationId,
        ],
        expectedUnsatisfiedObligationIds: [],
        supersessionEdges: [],
        actionResolution: 'CONTINUE',
      },
      {
        id: 'grant-listed-only',
        inputObligationIds: [byKind.REQUIRE_CONFIRMATION.obligationId],
        grantObligationIds: [byKind.REQUIRE_CONFIRMATION.obligationId],
        expectedOrderedObligationIds: [byKind.REQUIRE_CONFIRMATION.obligationId],
        expectedUnsatisfiedObligationIds: [],
        supersessionEdges: [],
        actionResolution: 'CONTINUE',
      },
      {
        id: 'incompatible-transform-pair',
        inputObligationIds: [byKind.SANITIZE.obligationId, secondSanitize.obligationId],
        grantObligationIds: [],
        expectedOrderedObligationIds: [
          byKind.SANITIZE.obligationId,
          secondSanitize.obligationId,
        ],
        expectedUnsatisfiedObligationIds: [
          byKind.SANITIZE.obligationId,
          secondSanitize.obligationId,
        ],
        supersessionEdges: [],
        actionResolution: 'FAILURE_ORACLE',
      },
      {
        id: 'deny-selective-supersession',
        inputObligationIds: [
          byKind.AUDIT.obligationId,
          byKind.NOTIFY.obligationId,
          byKind.SANITIZE.obligationId,
          byKind.RESTRICT_CAPABILITY.obligationId,
          byKind.DENY.obligationId,
        ],
        grantObligationIds: [],
        expectedOrderedObligationIds: [
          byKind.AUDIT.obligationId,
          byKind.DENY.obligationId,
          byKind.NOTIFY.obligationId,
          byKind.SANITIZE.obligationId,
          byKind.RESTRICT_CAPABILITY.obligationId,
        ],
        expectedUnsatisfiedObligationIds: [],
        supersessionEdges: [
          {
            obligationId: byKind.SANITIZE.obligationId,
            supersededByObligationId: byKind.DENY.obligationId,
          },
          {
            obligationId: byKind.RESTRICT_CAPABILITY.obligationId,
            supersededByObligationId: byKind.DENY.obligationId,
          },
        ],
        actionResolution: 'DENY',
      },
    ],
    v2ToV1DownConversion: DOWN_CONVERSION.map((row) => ({ ...row })),
    legacyWarnByCheckpoint: LEGACY_WARN_BY_CHECKPOINT.map((row) => ({ ...row })),
    unsupportedMatrix: buildUnsupportedMatrix([...contracts.AI_OBLIGATION_KINDS]),
  };
}

function isPostCheckpoint(checkpoint) {
  return POST_CHECKPOINTS.has(checkpoint);
}

function preEffect(checkpoint) {
  const effect = PRE_EFFECTS[checkpoint];
  if (!effect) throw new Error(`no pre-effect mapping for ${checkpoint}`);
  return effect;
}

function hardRecovery(impact) {
  const rule = HARD_IMPACT_RULES[impact];
  if (!rule) throw new Error(`no hard-impact rule for ${impact}`);
  return rule.recoveryAction;
}

function buildFailureRow(surface, checkpoint, failure, impact) {
  const post = isPostCheckpoint(checkpoint);
  const trustFailure = TRUST_FAILURES.has(failure);
  let outcome;
  let primaryState;
  let requestedEffect;
  let recoveryAction;
  let policyFailOpenRequired = false;
  let nonGrantable = trustFailure || Object.hasOwn(HARD_IMPACT_RULES, impact);

  if (post) {
    if (impact === 'LOW_IMPACT' && !trustFailure) {
      outcome = 'PROCEED_OBSERVED_ONLY';
      requestedEffect = 'audit-only';
      recoveryAction = FAILURE_RECOVERY[failure];
      policyFailOpenRequired = true;
    } else {
      outcome = 'RESTRICT_CAPABILITY';
      requestedEffect = 'restrict-capability';
      recoveryAction =
        impact === 'LOW_IMPACT'
          ? 'RESTORE_TRUSTED_POLICY'
          : impact === 'SENSITIVE_DATA'
            ? 'START_NEW_PROPOSAL'
            : hardRecovery(impact);
    }
    primaryState = 'PROTECTION_DEGRADED';
  } else if (trustFailure) {
    outcome = 'DENY';
    primaryState = 'BLOCKED_BEFORE_EFFECT';
    requestedEffect = preEffect(checkpoint);
    recoveryAction = 'RESTORE_TRUSTED_POLICY';
    nonGrantable = true;
  } else if (impact === 'LOW_IMPACT') {
    outcome = 'PROCEED_OBSERVED_ONLY';
    primaryState = 'PROTECTION_DEGRADED';
    requestedEffect = 'audit-only';
    recoveryAction = FAILURE_RECOVERY[failure];
    policyFailOpenRequired = true;
  } else if (impact === 'SENSITIVE_DATA') {
    if (failure === 'INTERVENTION_UNAVAILABLE') {
      outcome = 'HOLD';
      primaryState = 'BLOCKED_BEFORE_EFFECT';
      recoveryAction = 'USE_SUPPORTED_SURFACE';
    } else {
      outcome = 'REQUIRE_CONFIRMATION';
      primaryState = 'NEEDS_CONFIRMATION';
      recoveryAction = 'USE_TRUSTED_CONFIRMATION';
    }
    requestedEffect = preEffect(checkpoint);
  } else {
    const rule = HARD_IMPACT_RULES[impact];
    if (!rule) throw new Error(`no explicit outcome for impact ${impact}`);
    outcome = rule.outcome;
    primaryState =
      impact === 'APPROVAL_REQUIRED'
        ? 'APPROVAL_REQUESTED'
        : 'BLOCKED_BEFORE_EFFECT';
    requestedEffect = preEffect(checkpoint);
    recoveryAction = rule.recoveryAction;
  }

  return {
    surface,
    checkpoint,
    failure,
    impact,
    outcome,
    primaryState,
    requestedEffect,
    copyKey: `ai.security.failure.${post ? 'post' : 'pre'}.${outcome
      .toLowerCase()
      .replaceAll('_', '-')}.${impact.toLowerCase().replaceAll('_', '-')}`,
    recoveryAction,
    policyFailOpenRequired,
    nonGrantable,
  };
}

function buildF01Catalog(contracts) {
  assertExactKeys(
    contracts.AI_FAILURE_ORACLE_SURFACE_CHECKPOINTS,
    [...contracts.AI_FAILURE_ORACLE_SURFACES],
    'failure-oracle surface checkpoint map',
  );
  assertExactKeys(
    FAILURE_RECOVERY,
    [...contracts.AI_FAILURE_ORACLE_FAILURES],
    'failure recovery map',
  );
  assertExactKeys(
    HARD_IMPACT_RULES,
    [...contracts.AI_FAILURE_ORACLE_IMPACTS].slice(2),
    'hard-impact rule map',
  );

  const surfaceCheckpoints = {};
  const rows = [];
  for (const surface of contracts.AI_FAILURE_ORACLE_SURFACES) {
    const checkpoints = contracts.AI_FAILURE_ORACLE_SURFACE_CHECKPOINTS[surface];
    surfaceCheckpoints[surface] = [...checkpoints];
    for (const checkpoint of checkpoints) {
      for (const failure of contracts.AI_FAILURE_ORACLE_FAILURES) {
        for (const impact of contracts.AI_FAILURE_ORACLE_IMPACTS) {
          rows.push(buildFailureRow(surface, checkpoint, failure, impact));
        }
      }
    }
  }

  return {
    format: 'ceragon.ai-security.failure-oracle',
    formatVersion: 1,
    authority: {
      ...APPROVAL,
      representedAuthorities: [...APPROVAL.representedAuthorities],
    },
    surfaceCheckpoints,
    orderedTuples: {
      surfaces: [...contracts.AI_FAILURE_ORACLE_SURFACES],
      checkpoints: [...contracts.AI_FAILURE_ORACLE_CHECKPOINTS],
      failures: [...contracts.AI_FAILURE_ORACLE_FAILURES],
      impacts: [...contracts.AI_FAILURE_ORACLE_IMPACTS],
      outcomes: [...contracts.AI_FAILURE_ORACLE_OUTCOMES],
      recoveryActions: [...contracts.AI_FAILURE_ORACLE_RECOVERY_ACTIONS],
    },
    invariants: {
      unknownOrUnsupportedMayRankAllow: false,
      lowImpactFailOpenRequiresExplicitPolicy: true,
      hardImpactPreOutcomes: ['HOLD', 'DENY'],
      postCheckpointOutcomes: [
        'PROCEED_OBSERVED_ONLY',
        'RESTRICT_CAPABILITY',
      ],
      postCheckpointMayClaimRetroactivePrevention: false,
      runtimeAckMissing: {
        requestedEffect: 'PRESERVE_DECISION_REQUEST',
        adapterExpressedEffect: 'PRESERVE_VALID_ADAPTER_OUTPUT_OR_NULL',
        translationDisposition: 'PRESERVE_EMITTER_TRANSLATION_FACT',
        observedActualEffect: null,
        actualEffectObserver: 'NONE',
        securityOutcome: 'UNKNOWN',
      },
    },
    rows,
  };
}

module.exports = {
  buildF01Catalog,
  buildO01Catalog,
};
