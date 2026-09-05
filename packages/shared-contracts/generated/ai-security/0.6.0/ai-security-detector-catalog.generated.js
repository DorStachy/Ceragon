// GENERATED from fixtures/ai-security-detector-catalog.v2.json. Do not edit.
export const AI_SECURITY_DETECTOR_CATALOG_VERSION = 'detector-catalog-v2';
export const AI_SECURITY_DETECTOR_CATALOG_DIGEST = 'sha256:b252ee021229da77cc36a302898a0843758326084e8504ac4ce32d9f8ecf7553';
export const AI_SECURITY_DETECTOR_CLASS_IDS = Object.freeze([
  "private-key",
  "aws-credential-pair",
  "gcp-service-account",
  "azure-connection-string",
  "payment-card",
  "iban",
  "db-connection-string",
  "aws-access-key",
  "aws-secret-key",
  "gcp-key",
  "azure-key",
  "openai-key",
  "anthropic-key",
  "github-token",
  "gitlab-token",
  "slack-token",
  "slack-webhook",
  "stripe-live",
  "sendgrid-key",
  "twilio-key",
  "npm-token",
  "pypi-token",
  "google-oauth-secret",
  "jwt",
  "bearer-auth-token",
  "generic-api-key",
  "high-entropy",
  "base64-wrapped-secret",
  "private-key-candidate",
  "internal-url",
  "kubeconfig",
  "national-id",
  "custom-blocklist",
  "high-risk-file-type",
  "image-upload",
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
]);
export const AI_SECURITY_DETECTOR_PRESENTATION = Object.freeze([
  {
    "classId": "private-key",
    "label": "Private Key",
    "copyKey": "ai.security.class.private-key",
    "securityCardId": "private-key",
    "family": "PRIVATE_KEY",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "aws-credential-pair",
    "label": "Aws Credential Pair",
    "copyKey": "ai.security.class.aws-credential-pair",
    "securityCardId": "aws-credential-pair",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "gcp-service-account",
    "label": "Gcp Service Account",
    "copyKey": "ai.security.class.gcp-service-account",
    "securityCardId": "gcp-service-account",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "azure-connection-string",
    "label": "Azure Connection String",
    "copyKey": "ai.security.class.azure-connection-string",
    "securityCardId": "azure-connection-string",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "payment-card",
    "label": "Payment Card",
    "copyKey": "ai.security.class.payment-card",
    "securityCardId": "payment-card",
    "family": "FINANCIAL_DATA",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "iban",
    "label": "IBAN",
    "copyKey": "ai.security.class.iban",
    "securityCardId": "iban",
    "family": "FINANCIAL_DATA",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "db-connection-string",
    "label": "DB Connection String",
    "copyKey": "ai.security.class.db-connection-string",
    "securityCardId": "db-connection-string",
    "family": "DATABASE_URI",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "aws-access-key",
    "label": "Aws Access Key",
    "copyKey": "ai.security.class.aws-access-key",
    "securityCardId": "aws-access-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "aws-secret-key",
    "label": "Aws Secret Key",
    "copyKey": "ai.security.class.aws-secret-key",
    "securityCardId": "aws-secret-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "gcp-key",
    "label": "Gcp Key",
    "copyKey": "ai.security.class.gcp-key",
    "securityCardId": "gcp-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "azure-key",
    "label": "Azure Key",
    "copyKey": "ai.security.class.azure-key",
    "securityCardId": "azure-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "openai-key",
    "label": "Openai Key",
    "copyKey": "ai.security.class.openai-key",
    "securityCardId": "openai-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "anthropic-key",
    "label": "Anthropic Key",
    "copyKey": "ai.security.class.anthropic-key",
    "securityCardId": "anthropic-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "github-token",
    "label": "Github Token",
    "copyKey": "ai.security.class.github-token",
    "securityCardId": "github-token",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "gitlab-token",
    "label": "Gitlab Token",
    "copyKey": "ai.security.class.gitlab-token",
    "securityCardId": "gitlab-token",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "slack-token",
    "label": "Slack Token",
    "copyKey": "ai.security.class.slack-token",
    "securityCardId": "slack-token",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "slack-webhook",
    "label": "Slack Webhook",
    "copyKey": "ai.security.class.slack-webhook",
    "securityCardId": "slack-webhook",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "stripe-live",
    "label": "Stripe Live",
    "copyKey": "ai.security.class.stripe-live",
    "securityCardId": "stripe-live",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "sendgrid-key",
    "label": "Sendgrid Key",
    "copyKey": "ai.security.class.sendgrid-key",
    "securityCardId": "sendgrid-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "twilio-key",
    "label": "Twilio Key",
    "copyKey": "ai.security.class.twilio-key",
    "securityCardId": "twilio-key",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "npm-token",
    "label": "Npm Token",
    "copyKey": "ai.security.class.npm-token",
    "securityCardId": "npm-token",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "pypi-token",
    "label": "Pypi Token",
    "copyKey": "ai.security.class.pypi-token",
    "securityCardId": "pypi-token",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "google-oauth-secret",
    "label": "Google Oauth Secret",
    "copyKey": "ai.security.class.google-oauth-secret",
    "securityCardId": "google-oauth-secret",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "jwt",
    "label": "Jwt",
    "copyKey": "ai.security.class.jwt",
    "securityCardId": "jwt",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "bearer-auth-token",
    "label": "Bearer Auth Token",
    "copyKey": "ai.security.class.bearer-auth-token",
    "securityCardId": "bearer-auth-token",
    "family": "CREDENTIAL",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "generic-api-key",
    "label": "Generic API Key",
    "copyKey": "ai.security.class.generic-api-key",
    "securityCardId": "generic-api-key",
    "family": "HEURISTIC",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "high-entropy",
    "label": "High Entropy",
    "copyKey": "ai.security.class.high-entropy",
    "securityCardId": "high-entropy",
    "family": "HEURISTIC",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "base64-wrapped-secret",
    "label": "Base64 Wrapped Secret",
    "copyKey": "ai.security.class.base64-wrapped-secret",
    "securityCardId": "base64-wrapped-secret",
    "family": "HEURISTIC",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "private-key-candidate",
    "label": "Private Key Candidate",
    "copyKey": "ai.security.class.private-key-candidate",
    "securityCardId": "private-key-candidate",
    "family": "PRIVATE_KEY",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "internal-url",
    "label": "Internal Url",
    "copyKey": "ai.security.class.internal-url",
    "securityCardId": "internal-url",
    "family": "TOPOLOGY",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "kubeconfig",
    "label": "Kubeconfig",
    "copyKey": "ai.security.class.kubeconfig",
    "securityCardId": "kubeconfig",
    "family": "CONFIGURATION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "national-id",
    "label": "National Id",
    "copyKey": "ai.security.class.national-id",
    "securityCardId": "national-id",
    "family": "PERSONAL_DATA",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "custom-blocklist",
    "label": "Custom Blocklist",
    "copyKey": "ai.security.class.custom-blocklist",
    "securityCardId": "custom-blocklist",
    "family": "POLICY_SYNTHESIZED",
    "owner": "POLICY",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "high-risk-file-type",
    "label": "High Risk File Type",
    "copyKey": "ai.security.class.high-risk-file-type",
    "securityCardId": "high-risk-file-type",
    "family": "UPLOAD",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "image-upload",
    "label": "Image Upload",
    "copyKey": "ai.security.class.image-upload",
    "securityCardId": "image-upload",
    "family": "UPLOAD",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-instruction-override",
    "label": "Injection Instruction Override",
    "copyKey": "ai.security.class.injection-instruction-override",
    "securityCardId": "injection-instruction-override",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-system-exfil",
    "label": "Injection System Exfil",
    "copyKey": "ai.security.class.injection-system-exfil",
    "securityCardId": "injection-system-exfil",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-role-marker",
    "label": "Injection Role Marker",
    "copyKey": "ai.security.class.injection-role-marker",
    "securityCardId": "injection-role-marker",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-obfuscation-unicode",
    "label": "Injection Obfuscation Unicode",
    "copyKey": "ai.security.class.injection-obfuscation-unicode",
    "securityCardId": "injection-obfuscation-unicode",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-encoded-payload",
    "label": "Injection Encoded Payload",
    "copyKey": "ai.security.class.injection-encoded-payload",
    "securityCardId": "injection-encoded-payload",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "jailbreak-persona",
    "label": "Jailbreak Persona",
    "copyKey": "ai.security.class.jailbreak-persona",
    "securityCardId": "jailbreak-persona",
    "family": "JAILBREAK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "jailbreak-restriction-removal",
    "label": "Jailbreak Restriction Removal",
    "copyKey": "ai.security.class.jailbreak-restriction-removal",
    "securityCardId": "jailbreak-restriction-removal",
    "family": "JAILBREAK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "jailbreak-role-reassign",
    "label": "Jailbreak Role Reassign",
    "copyKey": "ai.security.class.jailbreak-role-reassign",
    "securityCardId": "jailbreak-role-reassign",
    "family": "JAILBREAK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-credential-exfil",
    "label": "Injection Credential Exfil",
    "copyKey": "ai.security.class.injection-credential-exfil",
    "securityCardId": "injection-credential-exfil",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-authority-escalation",
    "label": "Injection Authority Escalation",
    "copyKey": "ai.security.class.injection-authority-escalation",
    "securityCardId": "injection-authority-escalation",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-decoded-payload",
    "label": "Injection Decoded Payload",
    "copyKey": "ai.security.class.injection-decoded-payload",
    "securityCardId": "injection-decoded-payload",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "ingress-tool-instruction-injection",
    "label": "Ingress Tool Instruction Injection",
    "copyKey": "ai.security.class.ingress-tool-instruction-injection",
    "securityCardId": "ingress-tool-instruction-injection",
    "family": "INGRESS_RISK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "ingress-exfil-instruction",
    "label": "Ingress Exfil Instruction",
    "copyKey": "ai.security.class.ingress-exfil-instruction",
    "securityCardId": "ingress-exfil-instruction",
    "family": "INGRESS_RISK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "ingress-sensitive-path-read",
    "label": "Ingress Sensitive Path Read",
    "copyKey": "ai.security.class.ingress-sensitive-path-read",
    "securityCardId": "ingress-sensitive-path-read",
    "family": "INGRESS_RISK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-override-exfil",
    "label": "Injection Override Exfil",
    "copyKey": "ai.security.class.injection-override-exfil",
    "securityCardId": "injection-override-exfil",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "jailbreak-persona-unrestricted",
    "label": "Jailbreak Persona Unrestricted",
    "copyKey": "ai.security.class.jailbreak-persona-unrestricted",
    "securityCardId": "jailbreak-persona-unrestricted",
    "family": "JAILBREAK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "injection-override-credexfil",
    "label": "Injection Override Credexfil",
    "copyKey": "ai.security.class.injection-override-credexfil",
    "securityCardId": "injection-override-credexfil",
    "family": "PROMPT_INJECTION",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "ingress-secret-exfil-combo",
    "label": "Ingress Secret Exfil Combo",
    "copyKey": "ai.security.class.ingress-secret-exfil-combo",
    "securityCardId": "ingress-secret-exfil-combo",
    "family": "INGRESS_RISK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "ingress-exfil-verb",
    "label": "Ingress Exfil Verb",
    "copyKey": "ai.security.class.ingress-exfil-verb",
    "securityCardId": "ingress-exfil-verb",
    "family": "INGRESS_RISK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  },
  {
    "classId": "ingress-tool-poisoning",
    "label": "Ingress Tool Poisoning",
    "copyKey": "ai.security.class.ingress-tool-poisoning",
    "securityCardId": "ingress-tool-poisoning",
    "family": "INGRESS_RISK",
    "owner": "DETECTOR",
    "lifecycle": "CURRENT"
  }
]);
