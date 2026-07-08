/**
 * M3 Rollout Governance — Team auto-sort rule matcher (LOCK-3).
 *
 * A Team (an `endpoint_group`) can carry auto-sort rules: an endpoint that
 * matches a rule joins the Team automatically at enroll / inventory-upsert
 * time. This file is the SINGLE source of truth for the rule tuple + the pure,
 * deterministic {@link matchesAutoSortRule} matcher + the shared
 * {@link AUTOSORT_VECTORS} fixture battery.
 *
 * Consumed by:
 *   - Backend (`endpoint-group.service` `evaluateAutoSortForAgent`) — imports
 *     {@link matchesAutoSortRule} directly.
 *   - Frontend (`lib/ai/team-rules.ts`) — reimplements the matcher, gated by
 *     {@link AUTOSORT_VECTORS} run in the FE jest suite (M2.5 JS-in-CI pattern).
 *
 * Server-authoritative: the FE preview is display-only; the server is the sole
 * writer of membership.
 */

/** The dimensions an auto-sort rule can match on (PRD Decision 1). */
export const AUTOSORT_MATCH_FIELDS = ['hostname', 'site', 'tool'] as const;
export type AutoSortMatchField = (typeof AUTOSORT_MATCH_FIELDS)[number];

/**
 * One auto-sort rule. Conditions present are ANDed. A rule with NO condition
 * set matches NOTHING (never a catch-all — PRD story 7: an endpoint matching
 * no rule stays ungrouped and is never silently swept into a Team).
 */
export interface AutoSortRule {
  /**
   * Glob over the endpoint hostname (case-insensitive). `*` matches any run of
   * characters, `?` matches one. All other characters are literal. Empty /
   * undefined = this condition is not used.
   */
  hostnamePattern?: string;
  /** Exact siteId the endpoint must belong to. Empty / undefined = unused. */
  siteId?: string;
  /**
   * A detected tool/provider key the endpoint must have (e.g. "cursor",
   * "claude-code"). Case-insensitive membership test. Empty / undefined = unused.
   */
  detectedTool?: string;
}

/** The endpoint facts a rule is evaluated against. */
export interface AutoSortEndpointFacts {
  hostname: string;
  siteId: string | null;
  /** Detected tool/provider keys on the endpoint (matched case-insensitively). */
  detectedTools: string[];
}

/** True if `rule` declares at least one usable condition. */
export function autoSortRuleHasCondition(rule: AutoSortRule): boolean {
  return (
    hasText(rule.hostnamePattern) ||
    hasText(rule.siteId) ||
    hasText(rule.detectedTool)
  );
}

function hasText(v: string | undefined | null): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Escape a string for literal use inside a RegExp (everything except our
 *  glob metacharacters `*` and `?`, which the caller substitutes first). */
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Case-insensitive glob match anchored to the whole string. `*` → `.*`,
 * `?` → `.`; every other character is literal. Deterministic; no catastrophic
 * backtracking (single `.*`/`.` substitutions over an escaped literal).
 */
export function globMatch(pattern: string, value: string): boolean {
  const escaped = escapeRegexLiteral(pattern)
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const re = new RegExp(`^${escaped}$`, 'i');
  return re.test(value);
}

/**
 * Deterministic matcher: does `endpoint` satisfy every declared condition of
 * `rule`? A rule with no declared condition matches NOTHING.
 *
 * Matching semantics:
 *   - hostnamePattern → case-insensitive glob over `endpoint.hostname`.
 *   - siteId          → exact string equality with `endpoint.siteId`.
 *   - detectedTool    → case-insensitive membership in `endpoint.detectedTools`.
 */
export function matchesAutoSortRule(
  rule: AutoSortRule,
  endpoint: AutoSortEndpointFacts,
): boolean {
  if (!autoSortRuleHasCondition(rule)) return false;

  if (hasText(rule.hostnamePattern)) {
    const host = typeof endpoint.hostname === 'string' ? endpoint.hostname : '';
    if (!globMatch(rule.hostnamePattern.trim(), host)) return false;
  }

  if (hasText(rule.siteId)) {
    if (endpoint.siteId !== rule.siteId.trim()) return false;
  }

  if (hasText(rule.detectedTool)) {
    const want = rule.detectedTool.trim().toLowerCase();
    const tools = Array.isArray(endpoint.detectedTools)
      ? endpoint.detectedTools
      : [];
    const has = tools.some(
      (t) => typeof t === 'string' && t.trim().toLowerCase() === want,
    );
    if (!has) return false;
  }

  return true;
}

/** A single auto-sort matcher fixture. */
export interface AutoSortVector {
  rule: AutoSortRule;
  endpoint: AutoSortEndpointFacts;
  expected: boolean;
  note: string;
}

/**
 * The shared auto-sort matcher fixture battery. `matchesAutoSortRule` MUST
 * satisfy every vector; the FE reimplementation is checked against the SAME
 * array so both agree.
 */
export const AUTOSORT_VECTORS: readonly AutoSortVector[] = [
  {
    rule: {},
    endpoint: { hostname: 'dev-01', siteId: 's1', detectedTools: ['cursor'] },
    expected: false,
    note: 'empty rule matches nothing (no catch-all)',
  },
  {
    rule: { hostnamePattern: 'dev-*' },
    endpoint: { hostname: 'dev-01', siteId: 's1', detectedTools: [] },
    expected: true,
    note: 'hostname glob prefix',
  },
  {
    rule: { hostnamePattern: 'dev-*' },
    endpoint: { hostname: 'prod-01', siteId: 's1', detectedTools: [] },
    expected: false,
    note: 'hostname glob prefix miss',
  },
  {
    rule: { hostnamePattern: 'DEV-*' },
    endpoint: { hostname: 'dev-99', siteId: 's1', detectedTools: [] },
    expected: true,
    note: 'hostname glob is case-insensitive',
  },
  {
    rule: { hostnamePattern: '*.corp.local' },
    endpoint: { hostname: 'ws1.corp.local', siteId: 's1', detectedTools: [] },
    expected: true,
    note: 'hostname glob suffix',
  },
  {
    rule: { hostnamePattern: 'host?' },
    endpoint: { hostname: 'host7', siteId: 's1', detectedTools: [] },
    expected: true,
    note: 'single-char glob ?',
  },
  {
    rule: { hostnamePattern: 'host?' },
    endpoint: { hostname: 'host77', siteId: 's1', detectedTools: [] },
    expected: false,
    note: '? matches exactly one char',
  },
  {
    rule: { hostnamePattern: 'a.b' },
    endpoint: { hostname: 'axb', siteId: 's1', detectedTools: [] },
    expected: false,
    note: 'dot is a literal, not any-char',
  },
  {
    rule: { siteId: 's1' },
    endpoint: { hostname: 'anything', siteId: 's1', detectedTools: [] },
    expected: true,
    note: 'site exact match',
  },
  {
    rule: { siteId: 's1' },
    endpoint: { hostname: 'anything', siteId: 's2', detectedTools: [] },
    expected: false,
    note: 'site mismatch',
  },
  {
    rule: { siteId: 's1' },
    endpoint: { hostname: 'anything', siteId: null, detectedTools: [] },
    expected: false,
    note: 'null site never matches a site rule',
  },
  {
    rule: { detectedTool: 'cursor' },
    endpoint: { hostname: 'h', siteId: 's1', detectedTools: ['Cursor', 'npm'] },
    expected: true,
    note: 'tool membership case-insensitive',
  },
  {
    rule: { detectedTool: 'cursor' },
    endpoint: { hostname: 'h', siteId: 's1', detectedTools: ['claude-code'] },
    expected: false,
    note: 'tool not present',
  },
  {
    rule: { hostnamePattern: 'dev-*', siteId: 's1', detectedTool: 'cursor' },
    endpoint: { hostname: 'dev-01', siteId: 's1', detectedTools: ['cursor'] },
    expected: true,
    note: 'all three conditions ANDed — all satisfied',
  },
  {
    rule: { hostnamePattern: 'dev-*', siteId: 's1', detectedTool: 'cursor' },
    endpoint: { hostname: 'dev-01', siteId: 's2', detectedTools: ['cursor'] },
    expected: false,
    note: 'ANDed conditions — site fails the whole match',
  },
  {
    rule: { hostnamePattern: '   ', siteId: 's1' },
    endpoint: { hostname: 'x', siteId: 's1', detectedTools: [] },
    expected: true,
    note: 'whitespace-only condition is treated as unused',
  },
];
