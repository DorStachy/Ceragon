// ═══════════════════════════════════════════════════════════════════════════
// Trusted-package contract — Phase 0 (foundation).
//
// Surfaces the calibration manifest's "always-allow" hot set into a
// strongly-typed read-only structure that Backend's FastGate, Static-Worker
// trusted-allowlist branch, and the Phase 6 #17 calibration runner all
// share. The manifest itself ([test/fixtures/calibration-manifest-v1.json])
// is the source of truth; this module describes the shape and exposes
// a frozen-at-runtime accessor that refuses mutation.
//
// IMPORTANT — this is a CONTRACT, not a data file. The manifest's contents
// (i.e., which packages are in the trusted set) are loaded at runtime from
// the signed JSON; this file only declares the schema and exposes a
// `parseTrustedPackagesManifest` helper. The detached-signature verification
// (Appendix D §D.1) is performed by `scripts/verify-calibration-manifest.cjs`
// before any consumer reads the parsed result.
// ═══════════════════════════════════════════════════════════════════════════

export type TrustedEcosystem = 'npm' | 'pypi' | 'cargo' | 'go';

export interface TrustedPackageNpm {
  name: string;
  version: string;
  /** SHA-256 of the registry tarball at this exact version. */
  sha256: string;
}

export interface TrustedPackagePypi {
  name: string;
  version: string;
  sha256: string;
}

export interface TrustedPackageCargo {
  name: string;
  version: string;
  sha256: string;
}

export interface TrustedPackageGo {
  module: string;
  version: string;
  /** SHA-256 of the `.zip` from the Go module proxy. */
  sha256: string;
}

export interface TrustedPackagesManifestPrimarySource {
  endpoint: string;
  /** Optional download-stat endpoint used by the refresh job. */
  stat?: string;
  method: string;
}

export interface TrustedPackagesManifest {
  /** Calibration-manifest schema version — independent of cache schema. */
  schemaVersion: number;
  /** ISO-8601 date the snapshot was taken. */
  snapshotDate: string;
  primarySources: Record<TrustedEcosystem, TrustedPackagesManifestPrimarySource>;
  packages: {
    npm: ReadonlyArray<TrustedPackageNpm>;
    pypi: ReadonlyArray<TrustedPackagePypi>;
    cargo: ReadonlyArray<TrustedPackageCargo>;
    go: ReadonlyArray<TrustedPackageGo>;
  };
}

/**
 * Parses a manifest JSON object (already verified by
 * `verify-calibration-manifest.cjs`) into a deeply frozen
 * `TrustedPackagesManifest`. Throws on any structural mismatch.
 *
 * Consumers MUST NOT call this on unverified bytes. The signature check
 * runs in CI and at calibration-runner startup; on a Phase 6 #17 mismatch
 * the gate fails before reaching this function.
 */
export function parseTrustedPackagesManifest(raw: unknown): TrustedPackagesManifest {
  if (!isPlainObject(raw)) {
    throw new Error('parseTrustedPackagesManifest: manifest is not an object');
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion)) {
    throw new Error('parseTrustedPackagesManifest: schemaVersion must be integer');
  }
  if (typeof m.snapshotDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.snapshotDate)) {
    throw new Error('parseTrustedPackagesManifest: snapshotDate must be YYYY-MM-DD');
  }
  if (!isPlainObject(m.primarySources)) {
    throw new Error('parseTrustedPackagesManifest: primarySources missing');
  }
  if (!isPlainObject(m.packages)) {
    throw new Error('parseTrustedPackagesManifest: packages missing');
  }
  const sources = m.primarySources as Record<string, unknown>;
  const pkgs = m.packages as Record<string, unknown>;
  for (const eco of ['npm', 'pypi', 'cargo', 'go'] as const) {
    const src = sources[eco];
    if (!isPlainObject(src)) {
      throw new Error(`parseTrustedPackagesManifest: primarySources.${eco} missing`);
    }
    const s = src as Record<string, unknown>;
    if (typeof s.endpoint !== 'string' || typeof s.method !== 'string') {
      throw new Error(`parseTrustedPackagesManifest: primarySources.${eco} malformed`);
    }
    if (!Array.isArray(pkgs[eco])) {
      throw new Error(`parseTrustedPackagesManifest: packages.${eco} not array`);
    }
  }
  const parsed: TrustedPackagesManifest = {
    schemaVersion: m.schemaVersion,
    snapshotDate: m.snapshotDate,
    primarySources: {
      npm: parseSource(sources.npm),
      pypi: parseSource(sources.pypi),
      cargo: parseSource(sources.cargo),
      go: parseSource(sources.go),
    },
    packages: {
      npm: (pkgs.npm as unknown[]).map(parseNpm),
      pypi: (pkgs.pypi as unknown[]).map(parsePypi),
      cargo: (pkgs.cargo as unknown[]).map(parseCargo),
      go: (pkgs.go as unknown[]).map(parseGo),
    },
  };
  return deepFreeze(parsed);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseSource(v: unknown): TrustedPackagesManifestPrimarySource {
  const s = v as Record<string, unknown>;
  return {
    endpoint: s.endpoint as string,
    stat: typeof s.stat === 'string' ? s.stat : undefined,
    method: s.method as string,
  };
}

function parseNpm(v: unknown): TrustedPackageNpm {
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.version !== 'string' || typeof o.sha256 !== 'string') {
    throw new Error('parseTrustedPackagesManifest.npm: malformed entry');
  }
  return { name: o.name, version: o.version, sha256: o.sha256 };
}

function parsePypi(v: unknown): TrustedPackagePypi {
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.version !== 'string' || typeof o.sha256 !== 'string') {
    throw new Error('parseTrustedPackagesManifest.pypi: malformed entry');
  }
  return { name: o.name, version: o.version, sha256: o.sha256 };
}

function parseCargo(v: unknown): TrustedPackageCargo {
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.version !== 'string' || typeof o.sha256 !== 'string') {
    throw new Error('parseTrustedPackagesManifest.cargo: malformed entry');
  }
  return { name: o.name, version: o.version, sha256: o.sha256 };
}

function parseGo(v: unknown): TrustedPackageGo {
  const o = v as Record<string, unknown>;
  if (typeof o.module !== 'string' || typeof o.version !== 'string' || typeof o.sha256 !== 'string') {
    throw new Error('parseTrustedPackagesManifest.go: malformed entry');
  }
  return { module: o.module, version: o.version, sha256: o.sha256 };
}

function deepFreeze<T>(o: T): T {
  if (o === null || typeof o !== 'object') return o;
  for (const k of Object.keys(o as Record<string, unknown>)) {
    deepFreeze((o as Record<string, unknown>)[k]);
  }
  return Object.freeze(o);
}
