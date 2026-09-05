/**
 * M3 Rollout Governance — console RBAC role vocabulary (LOCK-5).
 *
 * The canonical console-role vocabulary shared by Backend (RolesGuard admission
 * map + invite DTO + JWT hydration) and Frontend (`lib/roles.ts` capability
 * matrix + invite Select). This is the CONSOLE/RBAC axis — who logs into the
 * dashboard and what they may change — NOT the team-policy runtime axis (do not
 * conflate; PRD Further Notes).
 *
 * M3 revives the dead `admin_viewer` site slot as a real, enforced read-only
 * **Auditor**:
 *   - ADMISSION maps to `organization_admin` (§A/C1) so the Auditor can READ
 *     the admin GETs a MEMBER would be 403'd from.
 *   - READ-ONLY is enforced SOLELY by the server-side, site-context-aware
 *     write-block (non-GET → 403), NOT by admission.
 *
 * Deferred (not in this vocabulary as first-class console roles): analyst,
 * developer (PRD Out of Scope).
 */

/** Account-level roles (mirrors Backend `UserRole`). */
export const CONSOLE_ACCOUNT_ROLES = [
  'owner',
  'organization_admin',
  'member',
  'viewer',
] as const;

export type ConsoleAccountRole = (typeof CONSOLE_ACCOUNT_ROLES)[number];

/**
 * Per-site roles (mirrors `user_site_assignments.role`). `admin_viewer` is the
 * revived read-only Auditor slot.
 */
export const CONSOLE_SITE_ROLES = [
  'site_admin',
  'analyst',
  'viewer',
  'admin_viewer',
] as const;

export type ConsoleSiteRole = (typeof CONSOLE_SITE_ROLES)[number];

/** Human labels for the site roles (the console renders these). */
export const CONSOLE_SITE_ROLE_LABELS: Record<ConsoleSiteRole, string> = {
  site_admin: 'Site Admin',
  analyst: 'Analyst',
  viewer: 'Viewer',
  admin_viewer: 'Auditor',
};

/**
 * Site-role → account-role ADMISSION mapping used by RolesGuard. `admin_viewer`
 * ADMITS as `organization_admin` (§A/C1) — a read-only Auditor must be able to
 * READ the admin GETs; read-only is enforced by the write-block, not here.
 */
export const CONSOLE_SITE_ROLE_ADMISSION: Record<
  ConsoleSiteRole,
  ConsoleAccountRole
> = {
  site_admin: 'organization_admin',
  analyst: 'member',
  viewer: 'viewer',
  admin_viewer: 'organization_admin',
};

/**
 * The site roles that are READ-ONLY at the console: admitted for reads, but
 * every non-GET (and every lazily-writing GET tagged `@ActAsReaderBlocked`)
 * must be blocked server-side. Currently just the Auditor.
 */
export const CONSOLE_READ_ONLY_SITE_ROLES = ['admin_viewer'] as const;

export type ConsoleReadOnlySiteRole =
  (typeof CONSOLE_READ_ONLY_SITE_ROLES)[number];

/** True if a site role is read-only (an Auditor). */
export function isReadOnlyConsoleSiteRole(role: string | null | undefined): boolean {
  return (
    typeof role === 'string' &&
    (CONSOLE_READ_ONLY_SITE_ROLES as readonly string[]).includes(role)
  );
}

/** The wire value + label for the M3 Auditor role (convenience constants). */
export const AUDITOR_SITE_ROLE = 'admin_viewer';
export const AUDITOR_LABEL = 'Auditor';
