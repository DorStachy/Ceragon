/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: 93bf85b67c69e1aff176151dbc9274691b5ac128
 * Artifact: sha256:096d6c8f181408bb60a1440173f04efdd99764736d97d01169decdecad0c6feb
 * Regenerate with: npm run generate:ai-security-backend-consumer
 *
 * C03 is an inert consumer projection. It enables no V2 writer, policy bundle,
 * signature, evaluator, detector, or runtime enforcement path.
 */

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

export const AI_SECURITY_PORTABLE_SOURCE_COMMIT = "93bf85b67c69e1aff176151dbc9274691b5ac128" as const;
export const AI_SECURITY_PORTABLE_ARTIFACT_DIGEST = "sha256:096d6c8f181408bb60a1440173f04efdd99764736d97d01169decdecad0c6feb" as const;
export const AI_SECURITY_PORTABLE_ARTIFACT_BYTES = 776486 as const;
export const AI_SECURITY_PORTABLE_FORMAT_VERSION = 1 as const;
export const AI_SECURITY_POLICY_SCHEMA_VERSION = 1 as const;
export const AI_SECURITY_PORTABLE_GENERATOR_NAME = "ceragon-ai-security-artifact" as const;
export const AI_SECURITY_PORTABLE_GENERATOR_VERSION = "1.3.0" as const;
export const AI_SECURITY_BACKEND_PROJECTION_GENERATOR_VERSION = "1.3.0" as const;
export const AI_SECURITY_PORTABLE_REQUIRED_INTEGRATION_GATE = "P0-C07" as const;
export const AI_SECURITY_PORTABLE_RUNTIME_ACTIVATABLE = false as const;
export const AI_SECURITY_PORTABLE_SIGNED_RUNTIME_POLICY_BUNDLE = false as const;
export const AI_SECURITY_V2_WRITER_ENABLED = false as const;

export const AI_SECURITY_PORTABLE_ORDERED_TUPLES = deepFreeze({
  "AI_ACTUAL_EFFECT_OBSERVERS": [
    "NONE",
    "RUNTIME_ACK",
    "BROWSER_CHECKPOINT",
    "PROXY_CHECKPOINT",
    "MCP_BROKER",
    "FINAL_STATE_GRADER"
  ],
  "AI_DATA_DISPOSITIONS": [
    "SENT_ALLOWED",
    "REDACTED_THEN_SENT",
    "BLOCKED_BEFORE_EGRESS",
    "HELD",
    "NEVER_LEFT",
    "BLOCKED_EGRESS_HOST",
    "RELEASED_ONCE"
  ],
  "AI_DLP_BLOCK_CLASSES": [
    "private-key",
    "aws-credential-pair",
    "gcp-service-account"
  ],
  "AI_DLP_CLASSES": [
    "private-key",
    "aws-secret-key",
    "aws-access-key",
    "gcp-key",
    "azure-key",
    "generic-api-key",
    "jwt",
    "slack-token",
    "github-token",
    "internal-url",
    "openai-key",
    "anthropic-key",
    "stripe-live",
    "slack-webhook",
    "sendgrid-key",
    "twilio-key",
    "npm-token",
    "pypi-token",
    "gitlab-token",
    "google-oauth-secret",
    "high-entropy",
    "kubeconfig",
    "db-connection-string",
    "aws-credential-pair",
    "gcp-service-account",
    "azure-connection-string",
    "bearer-auth-token",
    "payment-card",
    "iban",
    "national-id"
  ],
  "AI_DLP_REDACT_CLASSES": [
    "aws-access-key",
    "gcp-key",
    "generic-api-key",
    "jwt",
    "slack-token",
    "github-token",
    "internal-url",
    "openai-key",
    "anthropic-key",
    "stripe-live",
    "slack-webhook",
    "sendgrid-key",
    "twilio-key",
    "npm-token",
    "pypi-token",
    "gitlab-token",
    "google-oauth-secret",
    "db-connection-string",
    "azure-connection-string",
    "payment-card",
    "iban"
  ],
  "AI_DLP_WARN_CLASSES": [
    "aws-secret-key",
    "azure-key",
    "high-entropy",
    "kubeconfig",
    "bearer-auth-token",
    "national-id"
  ],
  "AI_ENFORCEMENT_PROTOCOL_VERSIONS": [
    "1",
    "2"
  ],
  "AI_EVENT_TYPES": [
    "PROMPT_SUBMITTED",
    "PROMPT_REDACTED",
    "PROMPT_BLOCKED",
    "AI_RESPONSE_RECEIVED",
    "TOOL_CALL_REQUESTED",
    "TOOL_CALL_BLOCKED",
    "MCP_SERVER_ADDED",
    "MCP_SERVER_APPROVED",
    "MCP_SERVER_BLOCKED",
    "MCP_QUARANTINE_APPLIED",
    "MCP_QUARANTINE_RESTORED",
    "MCP_TOOL_INVOKED",
    "PACKAGE_INSTALL_REQUESTED",
    "PACKAGE_INSTALL_BLOCKED",
    "PACKAGE_INSTALL_ALLOWED",
    "FILE_WRITE_OBSERVED",
    "DIFF_SCAN_COMPLETED",
    "GIT_PUSH_BLOCKED",
    "POLICY_EXCEPTION_REQUESTED",
    "POSTURE_DRIFT",
    "CODE_DIFF_SCANNED",
    "CODE_DIFF_FLAGGED",
    "EXCEPTION_REQUESTED",
    "AGENT_CONTROL_TAMPER",
    "INGRESS_REDACTED",
    "CONTEXT_TAINTED",
    "TOOL_CALL_HELD",
    "UPLOAD_BLOCKED",
    "UPLOAD_NOT_INSPECTED"
  ],
  "AI_FAILURE_ORACLE_CHECKPOINTS": [
    "PRE_PROMPT",
    "PRE_TOOL",
    "POST_TOOL",
    "PRE_UPSTREAM_DISPATCH",
    "POST_UPSTREAM_RESPONSE",
    "PRE_SUBMIT",
    "POST_SUBMIT",
    "PRE_UPLOAD_DISPATCH",
    "POST_UPLOAD_DISPATCH"
  ],
  "AI_FAILURE_ORACLE_FAILURES": [
    "POLICY_UNAVAILABLE",
    "POLICY_INVALID",
    "POLICY_EXPIRED",
    "PARTIAL",
    "UNSUPPORTED",
    "BUDGET_EXCEEDED",
    "PARSER_FAILED",
    "ENCRYPTED",
    "TIMED_OUT",
    "EFFECT_EXTRACTION_INCOMPLETE",
    "UNSUPPORTED_EFFECT",
    "TRANSLATION_FAILED",
    "RUNTIME_ACK_MISSING",
    "INTERVENTION_UNAVAILABLE"
  ],
  "AI_FAILURE_ORACLE_IMPACTS": [
    "LOW_IMPACT",
    "SENSITIVE_DATA",
    "ACTIVE_SECRET",
    "FORBIDDEN_DESTINATION",
    "DESTRUCTIVE_OR_PRIVILEGED",
    "APPROVAL_REQUIRED",
    "TRUST_INTEGRITY"
  ],
  "AI_FAILURE_ORACLE_OUTCOMES": [
    "PROCEED_OBSERVED_ONLY",
    "RESTRICT_CAPABILITY",
    "REQUIRE_CONFIRMATION",
    "HOLD",
    "DENY"
  ],
  "AI_FAILURE_ORACLE_RECOVERY_ACTIONS": [
    "RETRY_AFTER_PROTECTION_RESTORED",
    "RESTORE_TRUSTED_POLICY",
    "USE_TRUSTED_CONFIRMATION",
    "REQUEST_DELEGATED_APPROVAL",
    "REMOVE_ACTIVE_SECRET",
    "CHANGE_FORBIDDEN_DESTINATION",
    "REDUCE_CAPABILITY_AND_RETRY",
    "USE_SUPPORTED_SURFACE",
    "START_NEW_PROPOSAL"
  ],
  "AI_FAILURE_ORACLE_SURFACES": [
    "RUNTIME_ADAPTER",
    "LOCAL_PROXY",
    "BROWSER_COMPOSER",
    "BROWSER_UPLOAD"
  ],
  "AI_INSPECTION_STATUSES": [
    "COMPLETE",
    "PARTIAL",
    "UNSUPPORTED",
    "BUDGET_EXCEEDED",
    "PARSER_FAILED",
    "ENCRYPTED",
    "TIMED_OUT",
    "NOT_APPLICABLE"
  ],
  "AI_INVENTORY_KINDS": [
    "ai-tool",
    "ai-rule"
  ],
  "AI_NOTIFY_AUDIENCES": [
    "USER",
    "ADMIN",
    "SOC"
  ],
  "AI_OBLIGATION_KINDS": [
    "AUDIT",
    "NOTIFY",
    "SANITIZE",
    "RESTRICT_CAPABILITY",
    "REQUIRE_CONFIRMATION",
    "REQUIRE_DELEGATED_APPROVAL",
    "DENY",
    "QUARANTINE"
  ],
  "AI_OBLIGATION_STATES": [
    "REQUIRED",
    "SATISFIED",
    "UNSATISFIED",
    "UNSUPPORTED",
    "SUPERSEDED",
    "FAILED"
  ],
  "AI_POLICY_DECISIONS": [
    "ALLOW",
    "ALLOW_FAST",
    "PROMPT",
    "HOLD",
    "BLOCK",
    "PENDING",
    "INCONCLUSIVE"
  ],
  "AI_POLICY_SCOPES": [
    "org",
    "site",
    "team"
  ],
  "AI_PRIMARY_STATES": [
    "SCANNING",
    "CONTINUED_SAFELY",
    "SANITIZED_AND_CONTINUED",
    "CONTINUED_WITH_RESTRICTION",
    "NEEDS_CONFIRMATION",
    "APPROVAL_REQUESTED",
    "BLOCKED_BEFORE_EFFECT",
    "PROTECTION_DEGRADED"
  ],
  "AI_PROMPT_DECISIONS": [
    "allow",
    "warn",
    "redact",
    "block"
  ],
  "AI_PROVIDER_POLICY_STATUSES": [
    "approved",
    "tolerated",
    "blocked",
    "observed"
  ],
  "AI_QUARANTINE_UNTIL_STATES": [
    "INSPECTION_COMPLETE",
    "USER_RESUME",
    "ADMIN_DECISION"
  ],
  "AI_RECEIPT_ASSURANCE": [
    "UNVERIFIED_LEGACY",
    "VERIFIED_ENDPOINT_REPORT",
    "INDEPENDENTLY_OBSERVED"
  ],
  "AI_SECURITY_OUTCOMES": [
    "PREVENTED",
    "SANITIZED",
    "RESTRICTED_COMPLETION",
    "AUTHORIZED_COMPLETION",
    "UNAUTHORIZED_EFFECT",
    "UNKNOWN",
    "NOT_APPLICABLE"
  ],
  "AI_SECURITY_POLICY_V1_BROWSER_PROVIDER_KEYS": [
    "openai",
    "anthropic",
    "google",
    "github",
    "perplexity",
    "poe"
  ],
  "AI_SECURITY_POLICY_V1_DLP_ACTIONS": [
    "block",
    "redact",
    "warn",
    "allow"
  ],
  "AI_SECURITY_POLICY_V1_ENFORCEMENT_TIERS": [
    "detect",
    "strict"
  ],
  "AI_SECURITY_POLICY_V1_EXCLUSION_ACTIONS": [
    "allow",
    "block"
  ],
  "AI_SECURITY_POLICY_V1_GOVERNABLE_PROVIDER_KEYS": [
    "openai",
    "anthropic",
    "google",
    "github",
    "perplexity",
    "poe",
    "cursor",
    "claude-code",
    "windsurf",
    "github-copilot",
    "cline",
    "gemini-cli",
    "codex"
  ],
  "AI_SECURITY_POLICY_V1_GOVERNANCE_MODES": [
    "enforce",
    "monitor",
    ""
  ],
  "AI_SECURITY_POLICY_V1_INGRESS_ACTIONS": [
    "redact",
    "warn",
    "hold",
    "off"
  ],
  "AI_SECURITY_POLICY_V1_INGRESS_CONFIGURABLE_CLASSES": [
    "injection-instruction-override",
    "injection-system-exfil",
    "injection-role-marker",
    "injection-obfuscation-unicode",
    "injection-encoded-payload",
    "jailbreak-persona",
    "jailbreak-restriction-removal",
    "jailbreak-role-reassign",
    "injection-credential-exfil",
    "injection-authority-escalation",
    "injection-decoded-payload",
    "ingress-tool-instruction-injection",
    "ingress-exfil-instruction",
    "ingress-sensitive-path-read",
    "injection-override-exfil",
    "jailbreak-persona-unrestricted",
    "injection-override-credexfil",
    "ingress-secret-exfil-combo",
    "ingress-exfil-verb",
    "ingress-tool-poisoning"
  ],
  "AI_SECURITY_POLICY_V1_MCP_ENFORCE_MODES": [
    "off",
    "enforce"
  ],
  "AI_SECURITY_POLICY_V1_PROMPT_ACTIONS": [
    "block",
    "warn",
    "allow"
  ],
  "AI_SECURITY_POLICY_V1_PROMPT_CLASSES": [
    "injection-instruction-override",
    "injection-system-exfil",
    "injection-role-marker",
    "injection-obfuscation-unicode",
    "injection-encoded-payload",
    "jailbreak-persona",
    "jailbreak-restriction-removal",
    "jailbreak-role-reassign",
    "injection-credential-exfil",
    "injection-authority-escalation",
    "injection-decoded-payload",
    "ingress-tool-instruction-injection",
    "ingress-exfil-instruction",
    "ingress-sensitive-path-read",
    "injection-override-exfil",
    "jailbreak-persona-unrestricted",
    "injection-override-credexfil",
    "ingress-secret-exfil-combo"
  ],
  "AI_SECURITY_POLICY_V1_PROMPT_CONFIGURABLE_CLASSES": [
    "injection-instruction-override",
    "injection-system-exfil",
    "injection-role-marker",
    "injection-obfuscation-unicode",
    "injection-encoded-payload",
    "jailbreak-persona",
    "jailbreak-restriction-removal",
    "jailbreak-role-reassign",
    "injection-credential-exfil",
    "injection-authority-escalation",
    "injection-decoded-payload",
    "ingress-tool-instruction-injection",
    "ingress-exfil-instruction",
    "ingress-sensitive-path-read"
  ],
  "AI_SECURITY_POLICY_V1_PROMPT_DERIVED_CLASSES": [
    "injection-override-exfil",
    "jailbreak-persona-unrestricted",
    "injection-override-credexfil",
    "ingress-secret-exfil-combo"
  ],
  "AI_SECURITY_POLICY_V1_PROXY_FAIL_MODES": [
    "closed",
    "open"
  ],
  "AI_SECURITY_POLICY_V1_TOOL_PROVIDER_KEYS": [
    "cursor",
    "claude-code",
    "windsurf",
    "github-copilot",
    "cline",
    "gemini-cli",
    "codex"
  ],
  "AI_SECURITY_POLICY_V1_UPLOAD_ACTIONS": [
    "block",
    "warn",
    "allow"
  ],
  "AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS": [
    "1"
  ],
  "AI_TRANSLATION_DISPOSITIONS": [
    "EXPRESSED",
    "UNSUPPORTED_EFFECT",
    "TRANSLATION_FAILED",
    "NOT_APPLICABLE"
  ],
  "AI_TRUSTED_CONFIRMATION_SURFACES": [
    "BROWSER_EXTENSION",
    "MANAGEMENT_CONSOLE"
  ],
  "CANONICAL_HOOK_EVENTS": [
    "USER_PROMPT_SUBMIT",
    "PRE_TOOL_USE",
    "POST_TOOL_USE",
    "CONFIG_CHANGE",
    "SESSION_START",
    "SESSION_END",
    "SUBAGENT_STOP",
    "PERMISSION_REQUEST",
    "PRE_COMPACT",
    "POST_COMPACT",
    "SUBAGENT_START"
  ],
  "CERTIFICATION_STATES": [
    "documented",
    "configured",
    "loaded",
    "observed",
    "enforcement-tested"
  ],
  "COVERAGE_DEPTHS": [
    "full-loop-governed",
    "partial-native-governance",
    "provider-traffic-governed",
    "security-context-only",
    "detected-only",
    "not-endpoint-governed",
    "provider-egress-control"
  ],
  "ENFORCEMENT_EFFECTS": [
    "deny-prompt",
    "deny-tool",
    "rewrite-input",
    "replace-output",
    "stop-continuation",
    "audit-only",
    "none",
    "add-developer-context",
    "deny-escalation",
    "allow-escalation",
    "replace-tool-result-with-feedback-and-continue",
    "restrict-capability"
  ],
  "GOVERNANCE_DISPOSITIONS": [
    "devoid-mediated",
    "delegated-and-attested",
    "restricted-intent-unverified",
    "observed-only",
    "not-governed",
    "wire-observed-after-dispatch",
    "hook-failed-original-action-proceeded",
    "native-hook-unverified",
    "effect-expressed-runtime-unverified",
    "effect-unsupported-original-action-proceeded",
    "translation-failed-original-action-proceeded",
    "runtime-acknowledged-effect"
  ],
  "MCP_APPROVAL_STATUSES": [
    "pending",
    "approved",
    "blocked"
  ],
  "MCP_GOVERNANCE_ROWS": [
    "mcp-config-startup",
    "mcp-runtime-hook",
    "mcp-transport"
  ],
  "MCP_STATIC_VERDICTS": [
    "allow",
    "warn",
    "block"
  ],
  "PROMPT_EVIDENCE_MODES": [
    "OFF",
    "HASH_ONLY",
    "REDACTED",
    "FULL_WITH_APPROVAL"
  ]
} as const);
export const AI_ENFORCEMENT_PROTOCOL_VERSIONS =
  AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_ENFORCEMENT_PROTOCOL_VERSIONS;
export type AiEnforcementProtocolVersion =
  (typeof AI_ENFORCEMENT_PROTOCOL_VERSIONS)[number];
export const AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS =
  AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS;
export type AiSecurityWritableProtocolVersion =
  (typeof AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS)[number];

export const AI_SECURITY_PORTABLE_POLICY_CATALOG = deepFreeze({
  "browserProviderKeys": [
    "openai",
    "anthropic",
    "google",
    "github",
    "perplexity",
    "poe"
  ],
  "completeDetectorInventory": false,
  "dlpClasses": [
    "private-key",
    "aws-secret-key",
    "aws-access-key",
    "gcp-key",
    "azure-key",
    "generic-api-key",
    "jwt",
    "slack-token",
    "github-token",
    "internal-url",
    "openai-key",
    "anthropic-key",
    "stripe-live",
    "slack-webhook",
    "sendgrid-key",
    "twilio-key",
    "npm-token",
    "pypi-token",
    "gitlab-token",
    "google-oauth-secret",
    "high-entropy",
    "kubeconfig",
    "db-connection-string",
    "aws-credential-pair",
    "gcp-service-account",
    "azure-connection-string",
    "bearer-auth-token",
    "payment-card",
    "iban",
    "national-id"
  ],
  "ingressConfigurableClasses": [
    "injection-instruction-override",
    "injection-system-exfil",
    "injection-role-marker",
    "injection-obfuscation-unicode",
    "injection-encoded-payload",
    "jailbreak-persona",
    "jailbreak-restriction-removal",
    "jailbreak-role-reassign",
    "injection-credential-exfil",
    "injection-authority-escalation",
    "injection-decoded-payload",
    "ingress-tool-instruction-injection",
    "ingress-exfil-instruction",
    "ingress-sensitive-path-read",
    "injection-override-exfil",
    "jailbreak-persona-unrestricted",
    "injection-override-credexfil",
    "ingress-secret-exfil-combo",
    "ingress-exfil-verb",
    "ingress-tool-poisoning"
  ],
  "knownNonPolicyAddressableSignals": {
    "degradedRuleIds": [
      "injection-decoded-payload-budget-exceeded"
    ],
    "policySynthesized": [
      "custom-blocklist"
    ]
  },
  "phaseDPolicyAddressableInventoryComplete": true,
  "promptRiskConfigurableClasses": [
    "injection-instruction-override",
    "injection-system-exfil",
    "injection-role-marker",
    "injection-obfuscation-unicode",
    "injection-encoded-payload",
    "jailbreak-persona",
    "jailbreak-restriction-removal",
    "jailbreak-role-reassign",
    "injection-credential-exfil",
    "injection-authority-escalation",
    "injection-decoded-payload",
    "ingress-tool-instruction-injection",
    "ingress-exfil-instruction",
    "ingress-sensitive-path-read"
  ],
  "promptRiskDerivedClasses": [
    "injection-override-exfil",
    "jailbreak-persona-unrestricted",
    "injection-override-credexfil",
    "ingress-secret-exfil-combo"
  ],
  "schemaVersion": 1,
  "scope": "v1-policy-addressable",
  "toolProviderKeys": [
    "cursor",
    "claude-code",
    "windsurf",
    "github-copilot",
    "cline",
    "gemini-cli",
    "codex"
  ]
} as const);
export const AI_SECURITY_PORTABLE_DIRECT_OMISSION_DEFAULTS = deepFreeze({
  "agents": {
    "enforcementTier": "detect"
  },
  "ingress": {
    "actionForUnlistedClass": "redact",
    "builtInClassOverrides": {
      "ingress-exfil-verb": "warn"
    },
    "enabled": true,
    "taintHold": true
  },
  "promptRisk": {
    "obfuscationEscalates": true
  },
  "proxy": {
    "failClosedUnlessLiteralOpen": true,
    "failMode": "closed"
  }
} as const);
export const AI_SECURITY_PORTABLE_READER_FALLBACKS = deepFreeze({
  "agents": {
    "absentOrNonStrictEnforcementTier": "detect-equivalent",
    "emptyAllowlistUnderEnforce": "allow",
    "unknownMode": "allow",
    "unsetMode": "allow"
  },
  "dlp": {
    "actionResolutionOrder": [
      "configured-actions",
      "legacy-class-arrays",
      "built-in-default"
    ],
    "builtInDefaultByClass": {
      "allOtherClasses": "warn",
      "high-entropy": "allow"
    },
    "configuredResolutionRequiresEnabled": true
  },
  "egress": {
    "blockedPrecedesAllowed": true,
    "omittedSectionZeroValueMode": "allow",
    "unknownMode": "allow",
    "unsetMode": "allow"
  },
  "ingress": {
    "actionResolutionOrder": [
      "configured-actions",
      "built-in-default"
    ],
    "nilPolicyOrAbsentSection": {
      "actionForUnlistedClass": "redact",
      "builtInClassOverrides": {
        "ingress-exfil-verb": "warn"
      },
      "enabled": true,
      "taintHold": true
    }
  },
  "legacyOrgWire": {
    "expandedPolicySections": "absent"
  },
  "mcp": {
    "decodedPolicyWithOmittedSection": {
      "autoEnforce": false,
      "enabled": false
    },
    "nilPolicy": {
      "autoEnforce": false,
      "enabled": true
    }
  },
  "promptRisk": {
    "actionResolutionOrder": [
      "configured-actions",
      "legacy-dlp-class-arrays",
      "severity-default"
    ],
    "configuredResolutionRequiresEnabled": true,
    "obfuscationEscalatesWhenPolicyOrFieldAbsent": true,
    "severityDefault": {
      "high": "block",
      "medium": "warn",
      "other": "allow"
    }
  },
  "providers": {
    "blockedPrecedesTolerated": true,
    "membershipSourcesConsulted": [
      "nested-providers",
      "legacy-top-level-providers"
    ],
    "unlisted": "allow"
  },
  "proxy": {
    "failClosedUnlessLiteralOpen": true
  }
} as const);
export const AI_SECURITY_PORTABLE_RECOMMENDED_POLICY_DATA = deepFreeze({
  "dlp": {
    "enabled": true,
    "actions": {
      "private-key": "block",
      "aws-secret-key": "warn",
      "aws-access-key": "redact",
      "gcp-key": "redact",
      "azure-key": "warn",
      "generic-api-key": "redact",
      "jwt": "redact",
      "slack-token": "redact",
      "github-token": "redact",
      "internal-url": "redact",
      "openai-key": "redact",
      "anthropic-key": "redact",
      "stripe-live": "redact",
      "slack-webhook": "redact",
      "sendgrid-key": "redact",
      "twilio-key": "redact",
      "npm-token": "redact",
      "pypi-token": "redact",
      "gitlab-token": "redact",
      "google-oauth-secret": "redact",
      "high-entropy": "warn",
      "kubeconfig": "warn",
      "db-connection-string": "redact",
      "aws-credential-pair": "block",
      "gcp-service-account": "block",
      "azure-connection-string": "redact",
      "bearer-auth-token": "warn",
      "payment-card": "redact",
      "iban": "redact",
      "national-id": "warn"
    }
  },
  "promptRisk": {
    "enabled": true,
    "actions": {
      "injection-instruction-override": "warn",
      "injection-system-exfil": "warn",
      "injection-role-marker": "warn",
      "injection-obfuscation-unicode": "warn",
      "injection-encoded-payload": "warn",
      "jailbreak-persona": "warn",
      "jailbreak-restriction-removal": "warn",
      "jailbreak-role-reassign": "warn",
      "injection-credential-exfil": "warn",
      "injection-authority-escalation": "warn",
      "injection-decoded-payload": "warn",
      "ingress-tool-instruction-injection": "warn",
      "ingress-exfil-instruction": "warn",
      "ingress-sensitive-path-read": "warn",
      "injection-override-exfil": "block",
      "jailbreak-persona-unrestricted": "block",
      "injection-override-credexfil": "block",
      "ingress-secret-exfil-combo": "block"
    }
  },
  "providers": {
    "blocked": [],
    "tolerated": []
  },
  "exclusions": {
    "allow": [],
    "block": [],
    "patterns": []
  },
  "mcp": {
    "enabled": true,
    "autoEnforce": false
  },
  "ingress": {
    "enabled": true,
    "actions": {
      "injection-instruction-override": "redact",
      "injection-system-exfil": "redact",
      "injection-role-marker": "redact",
      "injection-obfuscation-unicode": "redact",
      "injection-encoded-payload": "redact",
      "jailbreak-persona": "redact",
      "jailbreak-restriction-removal": "redact",
      "jailbreak-role-reassign": "redact",
      "injection-credential-exfil": "redact",
      "injection-authority-escalation": "redact",
      "injection-decoded-payload": "redact",
      "ingress-tool-instruction-injection": "redact",
      "ingress-exfil-instruction": "redact",
      "ingress-sensitive-path-read": "redact",
      "injection-override-exfil": "redact",
      "jailbreak-persona-unrestricted": "redact",
      "injection-override-credexfil": "redact",
      "ingress-secret-exfil-combo": "redact",
      "ingress-exfil-verb": "warn",
      "ingress-tool-poisoning": "redact"
    },
    "taintHold": true
  },
  "uploads": {
    "files": "warn",
    "images": "warn",
    "blockAllImages": false,
    "maxSizeKb": 5120
  },
  "paths": {
    "blocked": [],
    "allowed": []
  },
  "agents": {
    "allowed": [],
    "mode": "",
    "enforcementTier": "detect"
  },
  "egress": {
    "mode": "",
    "allowed": [],
    "blocked": [],
    "includeDefaults": true
  },
  "proxy": {
    "failMode": "closed"
  }
} as const);
