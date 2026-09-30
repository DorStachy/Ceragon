# Service provider processing inventory

Reviewed: 2026-09-30. Review due: 2026-10-30. Owner: Security / Legal.

**Implementation review draft; contractual and deployed status unverified.** This replaces the May 2026 inventory's unsupported statements about activated providers, notification delivery, fixed retention, and per-organization opt-out. It is not a representation that every provider below is currently receiving customer data or is approved under a signed customer agreement.

The authoritative claim status is [the processing and claims register](../docs/customer-claims/processing-claims-register.json), especially CP-003, CP-012, and CP-013. Before a customer deployment, record the actual processor entity, purpose, data categories, processing locations, agreement, transfer mechanism where applicable, retention/training terms, selected account settings, and notice obligations. These are release gates, not values inferred from public vendor marketing.

| Provider or service | Processing path requiring review | Approval evidence still required |
|---|---|---|
| AWS | Hosted application, databases, object storage, queues and optional processing infrastructure; repository archives and evidence may be included | Actual accounts, services, regions, processing hosts, encryption settings, backup lifetimes, agreements and access controls |
| Google / Gemini | Configured external model analysis may receive selected source, findings and analysis context when authorized | Deployed provider/model routes, payload boundaries, account-specific retention and training terms, locations and agreement |
| Anthropic / Claude | Configured external repository analysis may include broad filtered repository context when authorized | Deployed routes, actual input scope, provider agreement, retention/training terms, locations and notices; no zero-retention claim is made |
| NVIDIA-hosted model services | Optional configured inference route identified in implementation | Whether enabled, exact service/entity, payload, locations, agreement and account settings |
| Cloudflare | Configured edge, DNS or access infrastructure can process request and operational metadata | Actual enabled products, traffic visibility, logging, locations and agreement |
| Brevo | Configured transactional email can process recipients and message contents | Enabled workflows, template minimization, delivery/retention settings, locations and agreement |
| GitHub | Connected repository and application integration; customer's repository host and integration counterpart | Actual integration permissions and exchanged data; determine contractual role for each flow |
| Other configured hosting or processing operators, including Hetzner if used | Historical infrastructure references require verification against actual deployment | Confirm current use and actual operator before adding an approved processor entry |

The September 2026 readiness handover records a temporary pre-customer home-box processing topology. Infrastructure files mentioning AWS Stockholm do not prove that every source-processing host is there. Before customer processing, inventory and authorize every actual host and operator, including any temporary host, and record its deletion and access controls.

Local invocation can upload content to remote processing. Source acquisition and external model analysis are separately authorized product actions. Filtered source can still contain customer secrets; a path filter is not a guarantee of secret-free payloads. Prompt capture, external AI analysis, tenant-local evaluation, and any shared learning or intelligence use are distinct purposes.

An external model provider's retention, training exclusion, regional processing, or deletion guarantee must be supported by the agreement and configuration for the actual service account. Application encryption using operator-managed keys does not mean that operators cannot decrypt data or that the customer owns the keys.

Notice periods and objection processes depend on the executed customer agreement. The repository does not establish that a notice was sent or that a customer accepted a provider. Track such evidence in the controlled legal register; do not add customer details or contract secrets to this source repository. This implementation task sends no notices and changes no provider account settings.
