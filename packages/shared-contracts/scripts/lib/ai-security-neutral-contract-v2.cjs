'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

const CONTRACT_VERSION = '0.7.0';
const FORMAT_VERSION = 2;
const SCORER_VERSION = '1.0.0';

const LABELS = Object.freeze(['ATTACK', 'BENIGN', 'BOUNDARY', 'DEGRADED']);
const DATA_PLANES = Object.freeze([
  'PUBLIC_SYNTHETIC',
  'PRIVATE_INCIDENT',
  'SEALED_HOLDOUT',
  'TENANT_LOCAL',
  'ISSUER_SANDBOX',
]);
const LICENSE_IDS = Object.freeze([
  'CC0-1.0',
  'Apache-2.0',
  'MIT',
  'BSD-3-Clause',
  'PROPRIETARY-APPROVED',
  'TENANT-LOCAL-NO-EXPORT',
  'ISSUER-SANDBOX',
]);
const TRUST_STATES = Object.freeze([
  'SYNTHETIC',
  'MAINTAINER_REVIEWED',
  'INDEPENDENT_REVIEWED',
  'SEALED',
  'TENANT_LOCAL',
  'ATTESTED_ISSUER',
]);
const EVIDENCE_TIERS = Object.freeze(['A', 'B', 'C', 'D']);
const CREDENTIAL_ROLES = Object.freeze([
  'STANDALONE_BEARER',
  'SECRET_COMPONENT',
  'IDENTIFIER_COMPONENT',
  'PRIVATE_KEY',
  'CAPABILITY_URL',
  'NONCREDENTIAL_SENSITIVE',
  'UNKNOWN',
]);
const EXPLOITABILITY_STATES = Object.freeze([
  'STANDALONE',
  'PAIRED',
  'CONTEXTUAL',
  'UNKNOWN',
  'NOT_APPLICABLE',
]);
const VALIDATION_STATES = Object.freeze(['VALID', 'INVALID', 'UNKNOWN', 'NOT_APPLICABLE']);
const ASSERTION_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN', 'NOT_APPLICABLE']);
const INSPECTION_STATUSES = Object.freeze([
  'COMPLETE',
  'PARTIAL',
  'UNSUPPORTED',
  'BUDGET_EXCEEDED',
  'PARSER_FAILED',
  'ENCRYPTED',
  'TIMED_OUT',
  'NOT_APPLICABLE',
]);
const OBLIGATION_KINDS = Object.freeze([
  'AUDIT',
  'NOTIFY',
  'SANITIZE',
  'RESTRICT_CAPABILITY',
  'REQUIRE_CONFIRMATION',
  'REQUIRE_DELEGATED_APPROVAL',
  'DENY',
  'QUARANTINE',
]);
const OBLIGATION_STATES = Object.freeze([
  'REQUIRED',
  'SATISFIED',
  'UNSATISFIED',
  'UNSUPPORTED',
  'SUPERSEDED',
  'FAILED',
]);
const PRIMARY_STATES = Object.freeze([
  'SCANNING',
  'CONTINUED_SAFELY',
  'SANITIZED_AND_CONTINUED',
  'CONTINUED_WITH_RESTRICTION',
  'NEEDS_CONFIRMATION',
  'APPROVAL_REQUESTED',
  'BLOCKED_BEFORE_EFFECT',
  'PROTECTION_DEGRADED',
]);
const ENFORCEMENT_EFFECTS = Object.freeze([
  'deny-prompt',
  'deny-tool',
  'rewrite-input',
  'replace-output',
  'stop-continuation',
  'audit-only',
  'none',
  'add-developer-context',
  'deny-escalation',
  'allow-escalation',
  'replace-tool-result-with-feedback-and-continue',
  'restrict-capability',
]);
const TRANSLATION_DISPOSITIONS = Object.freeze([
  'EXPRESSED',
  'UNSUPPORTED_EFFECT',
  'TRANSLATION_FAILED',
  'NOT_APPLICABLE',
]);
const ACTUAL_EFFECT_OBSERVERS = Object.freeze([
  'NONE',
  'RUNTIME_ACK',
  'BROWSER_CHECKPOINT',
  'PROXY_CHECKPOINT',
  'MCP_BROKER',
  'FINAL_STATE_GRADER',
]);
const GOVERNANCE_DISPOSITIONS = Object.freeze([
  'devoid-mediated',
  'delegated-and-attested',
  'restricted-intent-unverified',
  'observed-only',
  'not-governed',
  'wire-observed-after-dispatch',
  'hook-failed-original-action-proceeded',
  'native-hook-unverified',
  'effect-expressed-runtime-unverified',
  'effect-unsupported-original-action-proceeded',
  'translation-failed-original-action-proceeded',
  'runtime-acknowledged-effect',
]);
const DATA_DISPOSITIONS = Object.freeze([
  'SENT_ALLOWED',
  'REDACTED_THEN_SENT',
  'BLOCKED_BEFORE_EGRESS',
  'HELD',
  'NEVER_LEFT',
  'BLOCKED_EGRESS_HOST',
  'RELEASED_ONCE',
]);
const SECURITY_OUTCOMES = Object.freeze([
  'PREVENTED',
  'SANITIZED',
  'RESTRICTED_COMPLETION',
  'AUTHORIZED_COMPLETION',
  'UNAUTHORIZED_EFFECT',
  'UNKNOWN',
  'NOT_APPLICABLE',
]);
const RECEIPT_ASSURANCE = Object.freeze([
  'UNVERIFIED_LEGACY',
  'VERIFIED_ENDPOINT_REPORT',
  'INDEPENDENTLY_OBSERVED',
]);
const FAILURE_CODES = Object.freeze([
  'SCHEMA_INVALID_CASE',
  'SCHEMA_INVALID_RESULT',
  'CASE_DIGEST_MISMATCH',
  'RESULT_DIGEST_MISMATCH',
  'SEMANTIC_DIGEST_MISMATCH',
  'DUPLICATE_CASE',
  'DUPLICATE_RESULT',
  'RESULT_CASE_MISMATCH',
  'UNKNOWN_CASE_RESULT',
  'PROVENANCE_REJECTED',
  'LICENSE_REJECTED',
  'CLUSTER_SPLIT_DRIFT',
  'MISSING_RESULT',
  'MISSED_FINDING',
  'FALSE_FINDING',
  'WRONG_RULE',
  'WRONG_SPAN',
  'WRONG_EVIDENCE_TIER',
  'WRONG_ELIGIBILITY',
  'WRONG_CREDENTIAL_ROLE',
  'WRONG_EXPLOITABILITY',
  'WRONG_REPRESENTATION',
  'DECISION_MISMATCH',
  'OBLIGATION_MISMATCH',
  'EFFECT_MISMATCH',
  'OUTCOME_MISMATCH',
  'TRANSFORM_MISMATCH',
  'COMPLETENESS_MISMATCH',
  'FALSE_INTERVENTION',
  'MISSED_INTERVENTION',
  'FALSE_HARD_STOP',
  'MISSED_HARD_STOP',
  'FALSE_SOC_INCIDENT',
  'MISSED_SOC_INCIDENT',
  'FINAL_STATE_MISMATCH',
  'RESOURCE_BUDGET_EXCEEDED',
  'RESOURCE_EXHAUSTION_MISMATCH',
  'DIFFERENTIAL_MISMATCH',
]);

const ref = (name) => ({ $ref: `#/definitions/${name}` });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const arrayOf = (items, options = {}) => ({ type: 'array', items, ...options });
const closed = (required, properties, options = {}) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
  ...options,
});

function buildSchema() {
  const credentialValidation = closed(
    ['syntax', 'cryptography', 'issuerAudienceType', 'active', 'tenantOwned', 'revokedOrExpired', 'publicTest', 'paired'],
    {
      syntax: { enum: VALIDATION_STATES },
      cryptography: { enum: VALIDATION_STATES },
      issuerAudienceType: { enum: VALIDATION_STATES },
      active: { enum: ASSERTION_STATES },
      tenantOwned: { enum: ASSERTION_STATES },
      revokedOrExpired: { enum: ASSERTION_STATES },
      publicTest: { enum: ASSERTION_STATES },
      paired: { enum: ASSERTION_STATES },
    },
  );
  const source = closed(['kind', 'pathId', 'pathDigest'], {
    kind: { enum: ['CONTENT', 'FILE_METADATA'] },
    pathId: ref('slug'),
    pathDigest: nullable(ref('digest')),
  });
  const span = closed(['start', 'end', 'unit'], {
    start: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
    end: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
    unit: { const: 'UTF8_BYTE' },
  });
  const finding = closed(
    [
      'findingRef', 'classId', 'ruleId', 'detectorId', 'detectorVersion', 'severity',
      'evidenceTier', 'enforcementEligible', 'credentialRole', 'exploitability',
      'validation', 'representationId', 'canonicalizationPathIds', 'source', 'span',
      'normalizedOnly', 'limitations',
    ],
    {
      findingRef: ref('slug'),
      classId: ref('slug'),
      ruleId: nullable(ref('slug')),
      detectorId: nullable(ref('slug')),
      detectorVersion: nullable(ref('safeToken')),
      severity: nullable(ref('slug')),
      evidenceTier: nullable({ enum: EVIDENCE_TIERS }),
      enforcementEligible: nullable({ type: 'boolean' }),
      credentialRole: nullable({ enum: CREDENTIAL_ROLES }),
      exploitability: nullable({ enum: EXPLOITABILITY_STATES }),
      validation: nullable(credentialValidation),
      representationId: nullable(ref('slug')),
      canonicalizationPathIds: arrayOf(ref('slug'), { maxItems: 32, uniqueItems: true }),
      source,
      span: nullable(span),
      normalizedOnly: nullable({ type: 'boolean' }),
      limitations: arrayOf(ref('slug'), { maxItems: 32, uniqueItems: true }),
    },
    {
      allOf: [
        {
          if: { type: 'object', properties: { source: { type: 'object', properties: { kind: { const: 'CONTENT' } } } } },
          then: { type: 'object', properties: { span } },
        },
        {
          if: { type: 'object', properties: { source: { type: 'object', properties: { kind: { const: 'FILE_METADATA' } } } } },
          then: { type: 'object', properties: { span: { const: null } } },
        },
      ],
    },
  );
  const obligation = closed(['obligationId', 'kind', 'state', 'detailCode'], {
    obligationId: nullable(ref('slug')),
    kind: { enum: OBLIGATION_KINDS },
    state: { enum: OBLIGATION_STATES },
    detailCode: nullable(ref('slug')),
  });
  const decision = closed(['verdict', 'alert', 'reasons', 'primaryState'], {
    verdict: ref('slug'),
    alert: { type: 'boolean' },
    reasons: arrayOf(ref('slug'), { maxItems: 64, uniqueItems: true }),
    primaryState: nullable({ enum: PRIMARY_STATES }),
  });
  const effects = closed(
    [
      'requestedEffect', 'adapterExpressedEffect', 'translationDisposition',
      'observedActualEffect', 'actualEffectObserver', 'governanceDisposition',
      'dataDisposition', 'securityOutcome', 'certifiedSecurityOutcome', 'receiptAssurance',
    ],
    {
      requestedEffect: nullable({ enum: ENFORCEMENT_EFFECTS }),
      adapterExpressedEffect: nullable({ enum: ENFORCEMENT_EFFECTS }),
      translationDisposition: { enum: TRANSLATION_DISPOSITIONS },
      observedActualEffect: nullable({ enum: ENFORCEMENT_EFFECTS }),
      actualEffectObserver: { enum: ACTUAL_EFFECT_OBSERVERS },
      governanceDisposition: { enum: GOVERNANCE_DISPOSITIONS },
      dataDisposition: nullable({ enum: DATA_DISPOSITIONS }),
      securityOutcome: { enum: SECURITY_OUTCOMES },
      certifiedSecurityOutcome: { enum: SECURITY_OUTCOMES },
      receiptAssurance: { enum: RECEIPT_ASSURANCE },
    },
  );
  const sourceMapSegment = closed(['original', 'transformed'], {
    original: span,
    transformed: span,
  });
  const transform = closed(
    [
      'transformId', 'transformType', 'targetFindingRefs', 'inputDigest', 'outputDigest',
      'sourceMap', 'parseStatus', 'rescanStatus', 'syntaxPreserved', 'taskUtilityPreserved',
      'statePreserved', 'limitations',
    ],
    {
      transformId: ref('slug'),
      transformType: {
        enum: [
          'MASK_MINIMUM_UNIT',
          'REMOVE_FIELD',
          'REWRITE_VALUE',
          'REWRITE_URI',
          'REPLACE_OUTPUT',
          'RESTRICT_CAPABILITY',
        ],
      },
      targetFindingRefs: arrayOf(ref('slug'), { minItems: 1, maxItems: 64, uniqueItems: true }),
      inputDigest: ref('digest'),
      outputDigest: ref('digest'),
      sourceMap: arrayOf(sourceMapSegment, { maxItems: 128 }),
      parseStatus: { enum: VALIDATION_STATES },
      rescanStatus: { enum: ['CLEAN', 'FINDING_REMAINS', 'UNKNOWN', 'NOT_APPLICABLE'] },
      syntaxPreserved: { enum: ASSERTION_STATES },
      taskUtilityPreserved: { enum: ASSERTION_STATES },
      statePreserved: { enum: ASSERTION_STATES },
      limitations: arrayOf(ref('slug'), { maxItems: 32, uniqueItems: true }),
    },
  );
  const completeness = closed(['contentInspectionStatus', 'effectExtractionStatus', 'limitations'], {
    contentInspectionStatus: { enum: INSPECTION_STATUSES },
    effectExtractionStatus: { enum: INSPECTION_STATUSES },
    limitations: arrayOf(ref('slug'), { maxItems: 32, uniqueItems: true }),
  });
  const intervention = closed(['visible', 'hardStop', 'socIncident'], {
    visible: { type: 'boolean' },
    hardStop: { type: 'boolean' },
    socIncident: { type: 'boolean' },
  });
  const finalStateAssertion = closed(['assertionId', 'resourceType', 'state', 'valueDigest'], {
    assertionId: ref('slug'),
    resourceType: {
      enum: ['NETWORK', 'RECIPIENT', 'FILESYSTEM', 'PROCESS', 'PRIVILEGE', 'MCP', 'MEMORY', 'DURABLE_RESOURCE'],
    },
    state: ref('slug'),
    valueDigest: nullable(ref('digest')),
  });
  const finalState = closed(['graderId', 'required', 'outcome', 'observationRef', 'assertions'], {
    graderId: ref('slug'),
    required: { type: 'boolean' },
    outcome: { enum: SECURITY_OUTCOMES },
    observationRef: nullable(ref('digest')),
    assertions: arrayOf(finalStateAssertion, { maxItems: 128 }),
  });
  const resourceBudget = closed(
    ['maxCpuMs', 'maxWallMs', 'maxMemoryBytes', 'maxInputBytes', 'maxOutputBytes', 'maxFindings', 'expectExhaustion'],
    {
      maxCpuMs: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
      maxWallMs: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
      maxMemoryBytes: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
      maxInputBytes: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      maxOutputBytes: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      maxFindings: { type: 'integer', minimum: 0, maximum: 65536 },
      expectExhaustion: { type: 'boolean' },
    },
  );
  const resourceUsage = closed(
    ['cpuMs', 'wallMs', 'memoryBytes', 'inputBytes', 'outputBytes', 'findingCount', 'exhausted'],
    {
      cpuMs: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      wallMs: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      memoryBytes: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      inputBytes: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      outputBytes: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      findingCount: { type: 'integer', minimum: 0, maximum: 65536 },
      exhausted: { type: 'boolean' },
    },
  );
  const expected = closed(
    ['findings', 'obligations', 'decision', 'effects', 'transforms', 'completeness', 'intervention', 'finalState', 'resourceBudget'],
    {
      findings: arrayOf(finding, { maxItems: 256 }),
      obligations: arrayOf(obligation, { maxItems: 128 }),
      decision,
      effects,
      transforms: arrayOf(transform, { maxItems: 128 }),
      completeness,
      intervention,
      finalState,
      resourceBudget,
    },
  );
  const metric = closed(
    [
      'classId', 'representationId', 'surface', 'sampleCases', 'independentClusters',
      'effectiveClusterSize', 'truePositiveClusters', 'falsePositiveClusters',
      'falseNegativeClusters', 'trueNegativeClusters', 'benignClusters',
      'benignFalsePositiveClusters',
      'falseHardStopClusters', 'precision', 'precisionLowerBound', 'recall',
      'recallLowerBound', 'missRate', 'missRateUpperBound', 'falsePositiveRate',
      'falsePositiveRateUpperBound', 'falseHardStopRate', 'falseHardStopRateUpperBound',
      'unadjustedAlpha', 'adjustedAlpha', 'adjustmentMethod',
    ],
    {
      classId: nullable(ref('slug')),
      representationId: nullable(ref('slug')),
      surface: nullable(ref('slug')),
      sampleCases: { type: 'integer', minimum: 0 },
      independentClusters: { type: 'integer', minimum: 0 },
      effectiveClusterSize: { type: 'number', minimum: 0 },
      truePositiveClusters: { type: 'integer', minimum: 0 },
      falsePositiveClusters: { type: 'integer', minimum: 0 },
      falseNegativeClusters: { type: 'integer', minimum: 0 },
      trueNegativeClusters: { type: 'integer', minimum: 0 },
      benignClusters: { type: 'integer', minimum: 0 },
      benignFalsePositiveClusters: { type: 'integer', minimum: 0 },
      falseHardStopClusters: { type: 'integer', minimum: 0 },
      precision: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      precisionLowerBound: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      recall: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      recallLowerBound: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      missRate: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      missRateUpperBound: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      falsePositiveRate: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      falsePositiveRateUpperBound: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      falseHardStopRate: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      falseHardStopRateUpperBound: nullable({ type: 'number', minimum: 0, maximum: 1 }),
      unadjustedAlpha: { type: 'number', exclusiveMinimum: 0, maximum: 0.5 },
      adjustedAlpha: { type: 'number', exclusiveMinimum: 0, maximum: 0.5 },
      adjustmentMethod: { const: 'HOLM_CONSERVATIVE_FIRST_STEP' },
    },
  );
  const failure = closed(
    ['code', 'caseId', 'runnerId', 'classId', 'fieldPath', 'expectedDigest', 'observedDigest', 'inputIndex'],
    {
      code: { enum: FAILURE_CODES },
      caseId: nullable(ref('uuid')),
      runnerId: nullable(ref('slug')),
      classId: nullable(ref('slug')),
      fieldPath: nullable({ type: 'string', pattern: '^/(?:[A-Za-z0-9_.~:-]+(?:/[A-Za-z0-9_.~:-]+)*)?$' }),
      expectedDigest: nullable(ref('digest')),
      observedDigest: nullable(ref('digest')),
      inputIndex: nullable({ type: 'integer', minimum: 0 }),
    },
  );
  const clusterStat = closed(['clusterId', 'caseCount', 'semanticBaseCaseCount', 'resultCount', 'exact', 'weight'], {
    clusterId: ref('slug'),
    caseCount: { type: 'integer', minimum: 1 },
    semanticBaseCaseCount: { type: 'integer', minimum: 1 },
    resultCount: { type: 'integer', minimum: 0 },
    exact: { type: 'boolean' },
    weight: { type: 'number', exclusiveMinimum: 0 },
  });

  const caseSchema = closed(
    [
      'format', 'formatVersion', 'caseDigest', 'caseId', 'caseVersion',
      'semanticBaseCaseId', 'clusterId', 'label', 'split', 'threatIds', 'controlIds',
      'provenance', 'task', 'subject', 'context', 'input', 'representation',
      'statistics', 'expected', 'governance',
    ],
    {
      format: { const: 'ceragon.ai-security.neutral-evaluation-case' },
      formatVersion: { const: FORMAT_VERSION },
      caseDigest: ref('digest'),
      caseId: ref('uuid'),
      caseVersion: { type: 'integer', minimum: 1, maximum: 65535 },
      semanticBaseCaseId: ref('uuid'),
      clusterId: ref('slug'),
      label: { enum: LABELS },
      split: { enum: DATA_PLANES },
      threatIds: arrayOf(ref('slug'), { maxItems: 64, uniqueItems: true }),
      controlIds: arrayOf(ref('slug'), { minItems: 1, maxItems: 64, uniqueItems: true }),
      provenance: closed(
        ['sourcePlane', 'sourceId', 'sourceVersion', 'sourceDigest', 'licenseId', 'trust', 'admittedAt', 'reviewerIds'],
        {
          sourcePlane: { enum: DATA_PLANES },
          sourceId: ref('slug'),
          sourceVersion: ref('safeToken'),
          sourceDigest: ref('digest'),
          licenseId: { enum: LICENSE_IDS },
          trust: { enum: TRUST_STATES },
          admittedAt: ref('timestamp'),
          reviewerIds: arrayOf(ref('slug'), { minItems: 1, maxItems: 16, uniqueItems: true }),
        },
      ),
      task: closed(['taskId', 'family', 'expectedUtility'], {
        taskId: ref('slug'),
        family: ref('slug'),
        expectedUtility: { enum: ['PRESERVED', 'DEGRADED', 'NOT_APPLICABLE'] },
      }),
      subject: closed(['asset', 'destination', 'action'], {
        asset: closed(['classId', 'sensitivity', 'ownership', 'assetRef'], {
          classId: ref('slug'),
          sensitivity: ref('slug'),
          ownership: { enum: ['TENANT', 'PUBLIC', 'THIRD_PARTY', 'UNKNOWN'] },
          assetRef: nullable(ref('digest')),
        }),
        destination: closed(['zone', 'classId', 'destinationRef'], {
          zone: ref('slug'),
          classId: ref('slug'),
          destinationRef: nullable(ref('digest')),
        }),
        action: closed(['actionId', 'kind', 'checkpoint', 'reversibility', 'blastRadius', 'capabilities'], {
          actionId: ref('uuid'),
          kind: ref('slug'),
          checkpoint: ref('slug'),
          reversibility: { enum: ['REVERSIBLE', 'COMPENSATABLE', 'IRREVERSIBLE', 'UNKNOWN'] },
          blastRadius: { enum: ['LOCAL', 'TEAM', 'TENANT', 'EXTERNAL', 'UNKNOWN'] },
          capabilities: arrayOf(ref('slug'), { maxItems: 64, uniqueItems: true }),
        }),
      }),
      context: closed(['surface', 'runtime', 'provider', 'language', 'modality', 'format'], {
        surface: ref('slug'),
        runtime: ref('slug'),
        provider: ref('slug'),
        language: ref('slug'),
        modality: ref('slug'),
        format: ref('slug'),
      }),
      input: closed(['fixtureRef', 'artifactDigest', 'byteLength', 'mediaType', 'encoding'], {
        fixtureRef: ref('slug'),
        artifactDigest: ref('digest'),
        byteLength: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
        mediaType: ref('slug'),
        encoding: { enum: ['UTF8', 'BINARY', 'STRUCTURED'] },
      }),
      representation: closed(['representationId', 'lineage'], {
        representationId: ref('slug'),
        lineage: arrayOf(
          closed(['stepId', 'transformId', 'parentDigest', 'outputDigest'], {
            stepId: ref('slug'),
            transformId: ref('slug'),
            parentDigest: ref('digest'),
            outputDigest: ref('digest'),
          }),
          { maxItems: 32 },
        ),
      }),
      statistics: closed(['tenantClusterId', 'userClusterId', 'strata', 'weight', 'claimIds'], {
        tenantClusterId: nullable(ref('slug')),
        userClusterId: nullable(ref('slug')),
        strata: arrayOf(ref('slug'), { maxItems: 32, uniqueItems: true }),
        weight: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 },
        claimIds: arrayOf(ref('slug'), { minItems: 1, maxItems: 32, uniqueItems: true }),
      }),
      expected,
      governance: closed(['ownerId', 'labelers', 'adjudication', 'correction'], {
        ownerId: ref('slug'),
        labelers: arrayOf(closed(['labelerId', 'role'], {
          labelerId: ref('slug'),
          role: { enum: ['AUTHOR', 'SECURITY_REVIEWER', 'PRIVACY_REVIEWER', 'ADJUDICATOR'] },
        }), { minItems: 1, maxItems: 16 }),
        adjudication: closed(['status', 'adjudicatorIds', 'reasonCode', 'decidedAt'], {
          status: { enum: ['NOT_REQUIRED', 'AGREED', 'THIRD_REVIEW', 'UNRESOLVED'] },
          adjudicatorIds: arrayOf(ref('slug'), { maxItems: 8, uniqueItems: true }),
          reasonCode: nullable(ref('slug')),
          decidedAt: nullable(ref('timestamp')),
        }),
        correction: closed(['supersedesCaseDigest', 'reasonCode'], {
          supersedesCaseDigest: nullable(ref('digest')),
          reasonCode: nullable(ref('slug')),
        }),
      }),
    },
  );

  const resultSchema = closed(
    [
      'format', 'formatVersion', 'resultDigest', 'semanticDigest', 'caseId',
      'semanticBaseCaseId', 'clusterId', 'runner', 'provenance', 'findings',
      'decision', 'obligations', 'effects', 'transforms', 'completeness',
      'intervention', 'finalState', 'resourceUsage', 'errors',
    ],
    {
      format: { const: 'ceragon.ai-security.neutral-evaluation-result' },
      formatVersion: { const: FORMAT_VERSION },
      resultDigest: ref('digest'),
      semanticDigest: ref('digest'),
      caseId: ref('uuid'),
      semanticBaseCaseId: ref('uuid'),
      clusterId: ref('slug'),
      runner: closed(['runnerId', 'engineId', 'engineVersion', 'contractVersion', 'artifactDigest'], {
        runnerId: ref('slug'),
        engineId: ref('slug'),
        engineVersion: ref('safeToken'),
        contractVersion: { const: CONTRACT_VERSION },
        artifactDigest: ref('digest'),
      }),
      provenance: closed(['inputArtifactDigest', 'environmentDigest', 'startedAt', 'finishedAt'], {
        inputArtifactDigest: ref('digest'),
        environmentDigest: ref('digest'),
        startedAt: ref('timestamp'),
        finishedAt: ref('timestamp'),
      }),
      findings: arrayOf(finding, { maxItems: 256 }),
      decision,
      obligations: arrayOf(obligation, { maxItems: 128 }),
      effects,
      transforms: arrayOf(transform, { maxItems: 128 }),
      completeness,
      intervention,
      finalState,
      resourceUsage,
      errors: arrayOf(ref('slug'), { maxItems: 64, uniqueItems: true }),
    },
  );

  const reportSchema = closed(
    [
      'format', 'formatVersion', 'reportDigest', 'contractVersion', 'scorerVersion',
      'caseSetDigest', 'resultSetDigest', 'analysis', 'validation', 'summary',
      'clusters', 'metrics', 'differential', 'failures', 'pass',
    ],
    {
      format: { const: 'ceragon.ai-security.neutral-evaluation-scorer-report' },
      formatVersion: { const: 1 },
      reportDigest: ref('digest'),
      contractVersion: { const: CONTRACT_VERSION },
      scorerVersion: { const: SCORER_VERSION },
      caseSetDigest: ref('digest'),
      resultSetDigest: ref('digest'),
      analysis: closed(['confidenceLevel', 'alpha', 'clusterUnit', 'effectiveSizeFormula', 'intervalMethod', 'adjustmentMethod'], {
        confidenceLevel: { const: 0.95 },
        alpha: { const: 0.05 },
        clusterUnit: { const: 'semantic-cluster' },
        effectiveSizeFormula: { const: '(sum(w)^2)/sum(w^2),equal-total-weight-per-cluster,floor-for-intervals' },
        intervalMethod: { const: 'EXACT_ONE_SIDED_CLOPPER_PEARSON' },
        adjustmentMethod: { const: 'HOLM_CONSERVATIVE_FIRST_STEP' },
      }),
      validation: closed(['acceptedCases', 'rejectedCases', 'acceptedResults', 'rejectedResults'], {
        acceptedCases: { type: 'integer', minimum: 0 },
        rejectedCases: { type: 'integer', minimum: 0 },
        acceptedResults: { type: 'integer', minimum: 0 },
        rejectedResults: { type: 'integer', minimum: 0 },
      }),
      summary: closed(
        [
          'exactResults', 'missedFindings', 'falseFindings', 'falseInterventions',
          'falseHardStops', 'falseSocIncidents', 'wrongSpans', 'wrongRules',
          'wrongEvidenceTiers', 'wrongEligibility', 'wrongCredentialRoles',
          'wrongExploitability', 'wrongRepresentations', 'decisionFailures',
          'obligationFailures', 'transformFailures', 'outcomeFailures',
          'completenessFailures', 'finalStateFailures', 'resourceFailures',
          'differentialFailures', 'validationFailures',
        ],
        Object.fromEntries([
          'exactResults', 'missedFindings', 'falseFindings', 'falseInterventions',
          'falseHardStops', 'falseSocIncidents', 'wrongSpans', 'wrongRules',
          'wrongEvidenceTiers', 'wrongEligibility', 'wrongCredentialRoles',
          'wrongExploitability', 'wrongRepresentations', 'decisionFailures',
          'obligationFailures', 'transformFailures', 'outcomeFailures',
          'completenessFailures', 'finalStateFailures', 'resourceFailures',
          'differentialFailures', 'validationFailures',
        ].map((name) => [name, { type: 'integer', minimum: 0 }])),
      ),
      clusters: closed(
        ['caseCount', 'semanticBaseCaseCount', 'clusterCount', 'duplicateVariantCount', 'effectiveClusterSize', 'stats'],
        {
          caseCount: { type: 'integer', minimum: 0 },
          semanticBaseCaseCount: { type: 'integer', minimum: 0 },
          clusterCount: { type: 'integer', minimum: 0 },
          duplicateVariantCount: { type: 'integer', minimum: 0 },
          effectiveClusterSize: { type: 'number', minimum: 0 },
          stats: arrayOf(clusterStat),
        },
      ),
      metrics: closed(['overall', 'byClassRepresentationSurface'], {
        overall: metric,
        byClassRepresentationSurface: arrayOf(metric),
      }),
      differential: closed(['comparedCases', 'mismatches'], {
        comparedCases: { type: 'integer', minimum: 0 },
        mismatches: { type: 'integer', minimum: 0 },
      }),
      failures: arrayOf(failure),
      pass: { type: 'boolean' },
    },
  );

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://schemas.ceragon.ai/ai-security/neutral-evaluation-v2.schema.json',
    definitions: {
      uuid: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
      slug: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$' },
      safeToken: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._:+-]{0,127}$' },
      digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
      timestamp: { type: 'string', format: 'date-time', maxLength: 40 },
    },
    oneOf: [caseSchema, resultSchema, reportSchema],
  };
}

function canonicalizeJcs(value) {
  const compiled = require(path.resolve(__dirname, '..', '..', 'dist', 'sqs-signer.js'));
  return compiled.canonicalizeJcs(value);
}

function digestValue(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalizeJcs(value), 'utf8').digest('hex')}`;
}

function withoutTopLevel(value, key) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function caseDigest(value) {
  return digestValue(withoutTopLevel(value, 'caseDigest'));
}

function semanticProjection(result) {
  return {
    caseId: result.caseId,
    semanticBaseCaseId: result.semanticBaseCaseId,
    clusterId: result.clusterId,
    findings: result.findings,
    decision: result.decision,
    obligations: result.obligations,
    effects: result.effects,
    transforms: result.transforms,
    completeness: result.completeness,
    intervention: result.intervention,
    finalState: result.finalState,
    errors: result.errors,
  };
}

function semanticDigest(value) {
  return digestValue(semanticProjection(value));
}

function resultDigest(value) {
  return digestValue(withoutTopLevel(value, 'resultDigest'));
}

function reportDigest(value) {
  return digestValue(withoutTopLevel(value, 'reportDigest'));
}

function withCaseDigest(value) {
  const next = { ...value, caseDigest: `sha256:${'0'.repeat(64)}` };
  next.caseDigest = caseDigest(next);
  return next;
}

function withResultDigests(value) {
  const next = {
    ...value,
    resultDigest: `sha256:${'0'.repeat(64)}`,
    semanticDigest: `sha256:${'0'.repeat(64)}`,
  };
  next.semanticDigest = semanticDigest(next);
  next.resultDigest = resultDigest(next);
  return next;
}

function buildRepresentativeRecords() {
  const finding = {
    findingRef: 'finding-1',
    classId: 'aws-access-key',
    ruleId: 'aws-access-key-shape',
    detectorId: 'dlp.aws-access-key',
    detectorVersion: '1.0.0',
    severity: 'high',
    evidenceTier: 'B',
    enforcementEligible: false,
    credentialRole: 'IDENTIFIER_COMPONENT',
    exploitability: 'PAIRED',
    validation: {
      syntax: 'VALID',
      cryptography: 'UNKNOWN',
      issuerAudienceType: 'NOT_APPLICABLE',
      active: 'UNKNOWN',
      tenantOwned: 'UNKNOWN',
      revokedOrExpired: 'UNKNOWN',
      publicTest: 'NO',
      paired: 'NO',
    },
    representationId: 'plain-text',
    canonicalizationPathIds: [],
    source: { kind: 'CONTENT', pathId: 'root', pathDigest: null },
    span: { start: 11, end: 31, unit: 'UTF8_BYTE' },
    normalizedOnly: false,
    limitations: ['issuer-liveness-not-checked'],
  };
  const obligation = { obligationId: 'audit-1', kind: 'AUDIT', state: 'SATISFIED', detailCode: null };
  const decision = {
    verdict: 'warn',
    alert: true,
    reasons: ['aws-access-key'],
    primaryState: 'CONTINUED_SAFELY',
  };
  const effects = {
    requestedEffect: 'audit-only',
    adapterExpressedEffect: null,
    translationDisposition: 'NOT_APPLICABLE',
    observedActualEffect: null,
    actualEffectObserver: 'NONE',
    governanceDisposition: 'not-governed',
    dataDisposition: null,
    securityOutcome: 'UNKNOWN',
    certifiedSecurityOutcome: 'UNKNOWN',
    receiptAssurance: 'UNVERIFIED_LEGACY',
  };
  const transform = {
    transformId: 'no-transform',
    transformType: 'MASK_MINIMUM_UNIT',
    targetFindingRefs: ['finding-1'],
    inputDigest: `sha256:${'1'.repeat(64)}`,
    outputDigest: `sha256:${'1'.repeat(64)}`,
    sourceMap: [{
      original: { start: 11, end: 31, unit: 'UTF8_BYTE' },
      transformed: { start: 11, end: 31, unit: 'UTF8_BYTE' },
    }],
    parseStatus: 'NOT_APPLICABLE',
    rescanStatus: 'NOT_APPLICABLE',
    syntaxPreserved: 'NOT_APPLICABLE',
    taskUtilityPreserved: 'YES',
    statePreserved: 'YES',
    limitations: ['audit-only-no-mutation'],
  };
  const completeness = {
    contentInspectionStatus: 'COMPLETE',
    effectExtractionStatus: 'NOT_APPLICABLE',
    limitations: [],
  };
  const intervention = { visible: false, hardStop: false, socIncident: false };
  const finalState = {
    graderId: 'module-observer',
    required: false,
    outcome: 'UNKNOWN',
    observationRef: null,
    assertions: [],
  };
  const resourceBudget = {
    maxCpuMs: 50,
    maxWallMs: 100,
    maxMemoryBytes: 1048576,
    maxInputBytes: 4096,
    maxOutputBytes: 4096,
    maxFindings: 16,
    expectExhaustion: false,
  };
  const caseRecord = withCaseDigest({
    format: 'ceragon.ai-security.neutral-evaluation-case',
    formatVersion: FORMAT_VERSION,
    caseId: '11111111-1111-4111-8111-111111111111',
    caseVersion: 1,
    semanticBaseCaseId: '22222222-2222-4222-8222-222222222222',
    clusterId: 'aws-access-key.public-synthetic',
    label: 'ATTACK',
    split: 'PUBLIC_SYNTHETIC',
    threatIds: ['credential-exposure'],
    controlIds: ['dlp.aws-access-key'],
    provenance: {
      sourcePlane: 'PUBLIC_SYNTHETIC',
      sourceId: 'contract-fixture',
      sourceVersion: '1.0.0',
      sourceDigest: `sha256:${'2'.repeat(64)}`,
      licenseId: 'CC0-1.0',
      trust: 'SYNTHETIC',
      admittedAt: '2026-07-20T00:00:00Z',
      reviewerIds: ['security-fixture-owner'],
    },
    task: { taskId: 'document-deployment', family: 'developer-task', expectedUtility: 'PRESERVED' },
    subject: {
      asset: { classId: 'credential-identifier', sensitivity: 'high', ownership: 'TENANT', assetRef: null },
      destination: { zone: 'external-approved', classId: 'ai-provider', destinationRef: null },
      action: {
        actionId: '33333333-3333-4333-8333-333333333333',
        kind: 'prompt-submit',
        checkpoint: 'pre-prompt',
        reversibility: 'REVERSIBLE',
        blastRadius: 'EXTERNAL',
        capabilities: [],
      },
    },
    context: {
      surface: 'runtime-prompt',
      runtime: 'contract-fixture',
      provider: 'synthetic-provider',
      language: 'en',
      modality: 'text',
      format: 'plain-text',
    },
    input: {
      fixtureRef: 'public.aws-access-key.case-1',
      artifactDigest: `sha256:${'1'.repeat(64)}`,
      byteLength: 40,
      mediaType: 'text-plain',
      encoding: 'UTF8',
    },
    representation: { representationId: 'plain-text', lineage: [] },
    statistics: {
      tenantClusterId: null,
      userClusterId: null,
      strata: ['public-synthetic', 'english'],
      weight: 1,
      claimIds: ['dlp.aws-access-key.runtime-prompt'],
    },
    expected: {
      findings: [finding],
      obligations: [obligation],
      decision,
      effects,
      transforms: [transform],
      completeness,
      intervention,
      finalState,
      resourceBudget,
    },
    governance: {
      ownerId: 'ai-security-evaluation',
      labelers: [{ labelerId: 'security-fixture-owner', role: 'SECURITY_REVIEWER' }],
      adjudication: { status: 'NOT_REQUIRED', adjudicatorIds: [], reasonCode: null, decidedAt: null },
      correction: { supersedesCaseDigest: null, reasonCode: null },
    },
  });
  const resultRecord = withResultDigests({
    format: 'ceragon.ai-security.neutral-evaluation-result',
    formatVersion: FORMAT_VERSION,
    caseId: caseRecord.caseId,
    semanticBaseCaseId: caseRecord.semanticBaseCaseId,
    clusterId: caseRecord.clusterId,
    runner: {
      runnerId: 'contract-fixture',
      engineId: 'fixture-module',
      engineVersion: '1.0.0',
      contractVersion: CONTRACT_VERSION,
      artifactDigest: `sha256:${'3'.repeat(64)}`,
    },
    provenance: {
      inputArtifactDigest: caseRecord.input.artifactDigest,
      environmentDigest: `sha256:${'4'.repeat(64)}`,
      startedAt: '2026-07-20T00:00:01Z',
      finishedAt: '2026-07-20T00:00:01Z',
    },
    findings: [finding],
    decision,
    obligations: [obligation],
    effects,
    transforms: [transform],
    completeness,
    intervention,
    finalState,
    resourceUsage: {
      cpuMs: 1,
      wallMs: 2,
      memoryBytes: 1024,
      inputBytes: 40,
      outputBytes: 40,
      findingCount: 1,
      exhausted: false,
    },
    errors: [],
  });
  return { case: caseRecord, result: resultRecord };
}

module.exports = {
  CONTRACT_VERSION,
  FAILURE_CODES,
  FORMAT_VERSION,
  LICENSE_IDS,
  SCORER_VERSION,
  buildRepresentativeRecords,
  buildSchema,
  canonicalizeJcs,
  caseDigest,
  digestValue,
  reportDigest,
  resultDigest,
  semanticDigest,
  semanticProjection,
  withCaseDigest,
  withResultDigests,
};
