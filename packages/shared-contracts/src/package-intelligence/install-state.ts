// ═══════════════════════════════════════════════════════════════════════
// Shared Install-State Types
// Used by: Backend (install-time decision serving)
// ═══════════════════════════════════════════════════════════════════════

/**
 * The install-time recommendation returned to the customer-facing API.
 * Maps from internal verdict semantics to actionable install policy.
 */
export type InstallRecommendation =
  | 'allow'
  | 'allow_with_warning'
  | 'hold'
  | 'soft_block'
  | 'hard_block';
