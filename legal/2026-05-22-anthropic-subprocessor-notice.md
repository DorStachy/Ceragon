# Historical Anthropic notice draft — not delivery evidence

Status reviewed: 2026-09-30. Owner: Legal / Security. Review due: 2026-10-30.

The former May 22 draft asserted a June 21 effective date, customer notice delivery, provider retention and residency terms, and an organization-specific environment flag without verified supporting evidence. Those assertions are withdrawn from this repository's current customer claims. This file is retained to avoid treating the existence of the old draft as proof of notification or contractual approval.

Before issuing a replacement notice, Legal and Engineering must confirm the customer's executed agreement and notice process, the actual provider entity and service, the deployed model routes and affected scan types, the source and metadata sent, account-specific retention/training/location terms, and a tested customer control. Disabling one provider does not by itself establish that source is never sent to another provider.

The current implementation separates source processing authorization from external model analysis authorization. Broad filtered repository context may be sent on an authorized route. Filtering cannot guarantee that customer secrets are absent. Provider configuration and contractual promises remain unverified until recorded for the actual deployment.

Use [the current provider inventory](subprocessors.md) and [claims register](../docs/customer-claims/processing-claims-register.json) to prepare a reviewed, customer-specific notice. No notice is sent by this document or implementation task.
