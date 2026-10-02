/**
 * SC7-04 — the `semantic-injection` evidence class.
 *
 * One content-free record of one devoid-semantic model vote. The model is ONE
 * vote that never interrupts on its own: its standalone ceiling on the endpoint
 * is `monitor` on every preset, whatever action a policy stores for the class.
 *
 * Producer: Installers `internal/policyeval/semantic.go`. The producer vector
 * `semantic-evidence.v1.json` (beside this package's other vendored vectors) is
 * a byte-identical copy of `Installers/parity-vectors/semantic-evidence.v1.json`
 * and is the authority for every list below.
 *
 * Copies: Backend/packages/shared-contracts (built, ships), Ceragon-Intelligence/
 * packages/shared-contracts (built, vendored) and the workspace-root
 * packages/shared-contracts (the parity reference). The three files are
 * identical.
 *
 * CONTENT-FREE BY CONSTRUCTION. A record carries the class, the scored surface,
 * the band, an optional family slug, the pack digest and model version, the
 * disposition, the structural partner's KIND, and cause=semantic. No score, no
 * window, no span, no text: {@link parseSemanticInjectionEvidence} refuses any
 * other key and any value that is not a short token.
 */

export const SEMANTIC_INJECTION_EVIDENCE_CLASS = 'semantic-injection' as const;
export const SEMANTIC_EVIDENCE_CAUSE = 'semantic' as const;
/** The promptRisk action-map value every preset stores for the class. */
export const SEMANTIC_INJECTION_DEFAULT_ACTION = 'monitor' as const;

export const SEMANTIC_SURFACES = ['prompt', 'ingest', 'mcp_skill'] as const;
export type SemanticSurface = (typeof SEMANTIC_SURFACES)[number];

/** Only these bands produce a record; below τ_mid and inside a guard band is no vote. */
export const SEMANTIC_BANDS = ['mid', 'hi'] as const;
export type SemanticBand = (typeof SEMANTIC_BANDS)[number];

export const SEMANTIC_DISPOSITIONS = [
  'monitor-record',
  'evidence',
  'soft-taint-record',
  'high-precision-cue',
  'admin-queue',
] as const;
export type SemanticDisposition = (typeof SEMANTIC_DISPOSITIONS)[number];

/** Which dispositions each surface can produce. */
export const SEMANTIC_DISPOSITION_BY_SURFACE: Readonly<
  Record<SemanticSurface, readonly SemanticDisposition[]>
> = Object.freeze({
  prompt: Object.freeze(['monitor-record', 'evidence'] as const),
  ingest: Object.freeze(['soft-taint-record', 'high-precision-cue'] as const),
  mcp_skill: Object.freeze(['admin-queue'] as const),
});

/** The structural partner kinds an ingest high-precision cue names. */
export const SEMANTIC_INGEST_CORROBORATIONS = ['obfuscation', 'hidden-carrier', 'lexical'] as const;
export type SemanticIngestCorroboration = (typeof SEMANTIC_INGEST_CORROBORATIONS)[number];

/** The SC3 cue reason an ingest high-precision cue contributes. */
export const SEMANTIC_CUE_REASON = 'semantic-corroborated' as const;

export const SEMANTIC_RECORD_FIELDS = [
  'class',
  'surface',
  'band',
  'family',
  'packDigest',
  'modelVersion',
  'disposition',
  'corroboration',
  'cause',
] as const;

export const SEMANTIC_REQUIRED_RECORD_FIELDS = [
  'class',
  'surface',
  'band',
  'packDigest',
  'modelVersion',
  'disposition',
  'cause',
] as const;

export interface SemanticInjectionEvidence {
  class: typeof SEMANTIC_INJECTION_EVIDENCE_CLASS;
  surface: SemanticSurface;
  band: SemanticBand;
  family?: string;
  packDigest: string;
  modelVersion: string;
  disposition: SemanticDisposition;
  /**
   * Present only on a corroborated record: the prompt-risk class name on a
   * prompt `evidence` record, a {@link SemanticIngestCorroboration} on an
   * ingest `high-precision-cue`.
   */
  corroboration?: string;
  cause: typeof SEMANTIC_EVIDENCE_CAUSE;
}

/** Pack digest, model version and family: a short token, never prose. */
const SEMANTIC_TOKEN = /^[A-Za-z0-9][A-Za-z0-9:._+-]{0,127}$/;
/** A prompt-risk class name. */
const SEMANTIC_CLASS_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * Parse one record, or return null. Refuses: a non-object, any key outside
 * {@link SEMANTIC_RECORD_FIELDS}, a missing required field, an unknown class,
 * surface, band, disposition or cause, a disposition the surface cannot
 * produce, a digest / version / family that is not a short token, and a
 * corroboration that is absent from a corroborated record, present on an
 * uncorroborated one, or not of its surface's kind.
 */
export function parseSemanticInjectionEvidence(value: unknown): SemanticInjectionEvidence | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!includes(SEMANTIC_RECORD_FIELDS, key)) return null;
  }
  for (const key of SEMANTIC_REQUIRED_RECORD_FIELDS) {
    if (record[key] === undefined) return null;
  }
  if (record.class !== SEMANTIC_INJECTION_EVIDENCE_CLASS) return null;
  if (record.cause !== SEMANTIC_EVIDENCE_CAUSE) return null;
  if (!includes(SEMANTIC_SURFACES, record.surface)) return null;
  if (!includes(SEMANTIC_BANDS, record.band)) return null;
  if (!includes(SEMANTIC_DISPOSITION_BY_SURFACE[record.surface], record.disposition)) return null;
  for (const key of ['packDigest', 'modelVersion'] as const) {
    if (typeof record[key] !== 'string' || !SEMANTIC_TOKEN.test(record[key] as string)) return null;
  }
  if (
    record.family !== undefined &&
    (typeof record.family !== 'string' || !SEMANTIC_TOKEN.test(record.family))
  ) {
    return null;
  }
  const corroborated =
    record.disposition === 'evidence' || record.disposition === 'high-precision-cue';
  if (corroborated !== (record.corroboration !== undefined)) return null;
  if (record.disposition === 'evidence') {
    if (
      typeof record.corroboration !== 'string' ||
      !SEMANTIC_CLASS_SLUG.test(record.corroboration)
    ) {
      return null;
    }
  }
  if (
    record.disposition === 'high-precision-cue' &&
    !includes(SEMANTIC_INGEST_CORROBORATIONS, record.corroboration)
  ) {
    return null;
  }
  const out: SemanticInjectionEvidence = {
    class: SEMANTIC_INJECTION_EVIDENCE_CLASS,
    surface: record.surface,
    band: record.band,
    packDigest: record.packDigest as string,
    modelVersion: record.modelVersion as string,
    disposition: record.disposition as SemanticDisposition,
    cause: SEMANTIC_EVIDENCE_CAUSE,
  };
  if (record.family !== undefined) out.family = record.family as string;
  if (record.corroboration !== undefined) out.corroboration = record.corroboration as string;
  return out;
}
