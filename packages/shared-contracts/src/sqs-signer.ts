// ═══════════════════════════════════════════════════════════════════════════
// SQS signer envelope contract — Phase 0 (verify-only).
//
// Phase 1.0 lands the producer (Backend `sqs-signer.service.ts` calling
// `KMS GenerateMac`) and the verifier (Sandbox-Worker / Static-Worker using
// `verifyEnvelope` defined here, calling `KMS VerifyMac`). This module is
// the single shared envelope schema and the single canonicalization
// definition both sides agree on.
//
// Canonicalization: RFC 8785 (JCS). The producer canonicalizes the envelope
// once and signs the UTF-8 bytes of that canonical form. The verifier
// re-canonicalizes the envelope it received and compares byte-for-byte
// against the message's `signedEnvelope` attribute BEFORE calling KMS —
// any mismatch is rejected as `INVALID_ENVELOPE` without burning a KMS
// quota call. KMS is invoked only when the envelope bytes match.
//
// Master-key non-exportability: KMS keys with KeyUsage=GENERATE_VERIFY_MAC
// (KeySpec=HMAC_256) cannot be exported via GetParametersForImport. Tenant
// scope is enforced by the `tenantId` field IN THE SIGNED BYTES (verified
// against `MessageAttributes.tenantId` and the body's `tenantId` for triple
// binding consistency — see Phase 1.0 verify spec step 6).
//
// THIS FILE INTENTIONALLY DOES NOT CONTAIN A `signEnvelope` IMPLEMENTATION.
// Producer-side signing lives in Backend/src/jobs/sqs-signer.service.ts and
// uses the `@aws-sdk/client-kms` SDK directly. Verify-only stays here so
// shared-contracts has no AWS-SDK dependency at build time.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schema version for the signed envelope. Bumping this requires a
 * backwards-compatible verifier (Phase 1.0 7-day soak window emits both
 * versions). Currently locked to 1.
 */
export const SQS_SIGNED_ENVELOPE_VERSION = 1 as const;
export type SqsSignedEnvelopeVersion = typeof SQS_SIGNED_ENVELOPE_VERSION;

/**
 * Job intent — must match SQS-job intent enums in Backend's
 * `job-queue.service.ts`. Used to scope replay-cache keys per intent so
 * a same-jti static job cannot replay as a sandbox job.
 */
export type SqsJobIntent =
  | 'STATIC_FETCH'
  | 'STATIC_PRESCAN'
  | 'SANDBOX_DYNAMIC'
  | 'SANDBOX_FORENSICS'
  | 'INTEL_RESULT_WRITE'
  | 'VERDICT_WRITE'
  | 'INTEL_DYNAMIC_BG'
  | 'CACHE_PREWARM';

/**
 * Signed-envelope payload (JCS-canonicalized, UTF-8 encoded, fed to
 * `KMS GenerateMac` / `KMS VerifyMac`).
 *
 *   v             — schema version (always SQS_SIGNED_ENVELOPE_VERSION).
 *   bodyHash      — base64url(SHA-256(utf8(MessageBody))). Body bytes are
 *                   sent literally as the SQS MessageBody (no double-encoding);
 *                   the verifier recomputes SHA-256 over received bytes.
 *   queueUrl      — the producer's intended target queue. Verifier compares
 *                   against the queue URL it polled from (`receivedQueueUrl`).
 *   intent        — `SqsJobIntent` — the job class.
 *   attrs         — additional MessageAttributes that participate in signing
 *                   (sorted-key map, string values only).
 *   tenantId      — owning tenant; verifier checks triple-binding consistency
 *                   (envelope == body == MessageAttributes).
 *   iat / nbf / exp — unix seconds; verifier rejects on clock skew, future
 *                     `nbf`, expired `exp`.
 *   jti           — UUIDv7 (monotonic). Replay cache keyed by
 *                   (kid, tenantId, queueUrl, intent, jti).
 *   kid           — KMS key id used to sign. Verifier looks up the key in
 *                   the registry and rejects if revoked.
 *   producerSessionArn — STS session ARN that produced the signature.
 *                        Bound at signing time via sts:GetCallerIdentity
 *                        and verified server-side by the CloudTrail rule
 *                        `kms_generate_mac_anomaly`. (Phase 6 fixture #15)
 */
export interface SqsSignedEnvelope {
  v: SqsSignedEnvelopeVersion;
  bodyHash: string;
  queueUrl: string;
  intent: SqsJobIntent;
  attrs: Readonly<Record<string, string>>;
  tenantId: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  kid: string;
  producerSessionArn: string;
}

/**
 * Verification rejection reasons. Must match the metric labels emitted by
 * Sandbox-Worker / Static-Worker so dashboards stay consistent.
 */
export type SqsVerifyError =
  | 'UNSUPPORTED_VERSION'
  | 'KEY_REVOKED'
  | 'KEY_NOT_TRUSTED'
  | 'NOT_YET_VALID'
  | 'EXPIRED_TOKEN'
  | 'CLOCK_SKEW_REJECTED'
  | 'TTL_TOO_LONG'
  | 'INVALID_SIGNATURE'
  | 'INVALID_ENVELOPE'
  | 'TENANT_BINDING_INCONSISTENT'
  | 'ATTRIBUTE_MISMATCH'
  | 'QUEUE_MISMATCH'
  | 'REPLAY_DETECTED'
  | 'KMS_VERIFY_UNAVAILABLE'
  | 'MISSING_SIGNATURE';

export interface SqsVerifyResult {
  ok: boolean;
  /** Populated when `ok === false`. */
  error?: SqsVerifyError;
  /** Free-form diagnostic; never user-facing. */
  detail?: string;
}

/**
 * RFC 8785 (JCS) canonicalizer — minimal, dependency-free implementation
 * shared by producer and verifier. Worker bundles import THIS function so
 * canonicalization can never drift between producer and verifier.
 *
 * Constraints (matches RFC 8785 §3):
 *   • Object keys sorted by code-unit (UTF-16) ordering.
 *   • Numbers serialized using ECMAScript ToString — but throws on
 *     non-finite numbers (NaN/Infinity are not JSON-representable per
 *     RFC 8785 §3.2.2.3 cross-reference to RFC 7159 / RFC 8259).
 *   • Strings UTF-16 escaped per RFC 8259 §7.
 *   • No insignificant whitespace. No BOM.
 *
 * Output is UTF-8-safe ASCII (escape sequences for control chars, raw UTF-8
 * for printable chars). Caller passes the result to `TextEncoder().encode(...)`
 * before signing.
 *
 * NOT a general-purpose JSON canonicalizer for arbitrary inputs. Throws on:
 *   • bigint, function, symbol, undefined values
 *   • Map / Set / Date / typed-array (callers must pre-serialize)
 *   • cycles
 */
export function canonicalizeJcs(value: unknown): string {
  return canonicalize(value, new WeakSet());
}

function canonicalize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  const t = typeof value;
  if (t === 'string') return canonicalizeString(value as string);
  if (t === 'number') {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new Error('canonicalizeJcs: non-finite number is not JSON-representable');
    }
    // ECMAScript ToString (RFC 8785 §3.2.2.3 references this directly).
    return Number.prototype.toString.call(n);
  }
  if (t === 'bigint') {
    throw new Error('canonicalizeJcs: bigint is not JSON-representable');
  }
  if (t === 'undefined' || t === 'function' || t === 'symbol') {
    throw new Error(`canonicalizeJcs: ${t} is not JSON-representable`);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('canonicalizeJcs: cycle detected');
    seen.add(value);
    const parts = value.map((v) => canonicalize(v, seen));
    seen.delete(value);
    return '[' + parts.join(',') + ']';
  }
  if (t === 'object') {
    const obj = value as object;
    if (
      obj instanceof Map ||
      obj instanceof Set ||
      obj instanceof Date ||
      ArrayBuffer.isView(obj as ArrayBufferView)
    ) {
      throw new Error('canonicalizeJcs: unsupported container type — pre-serialize before signing');
    }
    if (seen.has(obj)) throw new Error('canonicalizeJcs: cycle detected');
    seen.add(obj);
    const o = obj as Record<string, unknown>;
    // RFC 8785 §3.2.3: keys sorted by code-unit value (UTF-16). Default
    // string compare in V8/JSC matches that ordering for BMP keys; we use
    // a code-unit comparator for explicit cross-runtime safety.
    const keys = Object.keys(o).sort(compareCodeUnits);
    const parts: string[] = [];
    for (const k of keys) {
      const v = o[k];
      if (v === undefined) continue; // RFC 7159 omits undefined; matches stdlib JSON.stringify
      parts.push(canonicalizeString(k) + ':' + canonicalize(v, seen));
    }
    seen.delete(obj);
    return '{' + parts.join(',') + '}';
  }
  throw new Error(`canonicalizeJcs: unhandled value type ${t}`);
}

function compareCodeUnits(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a.charCodeAt(i);
    const bv = b.charCodeAt(i);
    if (av !== bv) return av - bv;
  }
  return a.length - b.length;
}

function canonicalizeString(s: string): string {
  // RFC 8785 §3.2.2.2: serialize per RFC 8259 §7 minimally — escape
  // backslash, double-quote, and U+0000..U+001F. Use the short escape forms
  // for \b \f \n \r \t; \u00XX otherwise. Higher code points (incl. supp.
  // pairs) emitted as raw UTF-8.
  //
  // Phase 1.0 v2: RFC 8785 / I-JSON requires VALID Unicode. Lone
  // surrogates (high without paired low, or low without preceding high)
  // are NOT valid Unicode; emitting them through TextEncoder substitutes
  // U+FFFD and would break byte-equality between producer and verifier.
  // Reject them explicitly.
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) {
        throw new Error(
          `canonicalizeJcs: lone high surrogate at index ${i}; RFC 8785 requires valid Unicode`,
        );
      }
      out += s.charAt(i) + s.charAt(i + 1);
      i++;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      throw new Error(
        `canonicalizeJcs: lone low surrogate at index ${i}; RFC 8785 requires valid Unicode`,
      );
    }
    if (c === 0x22) {
      out += '\\"';
    } else if (c === 0x5c) {
      out += '\\\\';
    } else if (c === 0x08) {
      out += '\\b';
    } else if (c === 0x09) {
      out += '\\t';
    } else if (c === 0x0a) {
      out += '\\n';
    } else if (c === 0x0c) {
      out += '\\f';
    } else if (c === 0x0d) {
      out += '\\r';
    } else if (c < 0x20) {
      out += '\\u' + c.toString(16).padStart(4, '0');
    } else {
      out += s.charAt(i);
    }
  }
  out += '"';
  return out;
}

/**
 * Triple-binding consistency check (Phase 1.0 verify spec step 6).
 * Returns the rejection error if any of the three tenant-id sources
 * disagree, or `null` if consistent. The verifier must then ALSO check
 * that `expectedQueueUrl === envelope.queueUrl` (separately because the
 * received queue URL is environmental, not in the message).
 */
export function checkTripleTenantBinding(args: {
  envelopeTenantId: string;
  bodyTenantId: string;
  attributesTenantId: string | undefined;
}): SqsVerifyError | null {
  if (args.attributesTenantId === undefined) return 'TENANT_BINDING_INCONSISTENT';
  if (args.envelopeTenantId !== args.bodyTenantId) return 'TENANT_BINDING_INCONSISTENT';
  if (args.envelopeTenantId !== args.attributesTenantId) return 'TENANT_BINDING_INCONSISTENT';
  return null;
}

/**
 * Time-window check (Phase 1.0 verify spec steps 3). 60s clock-skew
 * tolerance for `iat` future-drift; otherwise strict.
 */
export function checkEnvelopeTimeWindow(
  envelope: Pick<SqsSignedEnvelope, 'iat' | 'nbf' | 'exp'>,
  nowUnixSeconds: number,
): SqsVerifyError | null {
  if (envelope.iat > nowUnixSeconds + 60) return 'CLOCK_SKEW_REJECTED';
  if (envelope.nbf > nowUnixSeconds) return 'NOT_YET_VALID';
  if (envelope.exp <= nowUnixSeconds) return 'EXPIRED_TOKEN';
  return null;
}

/**
 * Build the canonical bytes for an envelope. Producer signs these bytes;
 * verifier recomputes them and compares against the received attribute.
 */
export function canonicalEnvelopeBytes(envelope: SqsSignedEnvelope): Uint8Array {
  const json = canonicalizeJcs(envelope);
  return new TextEncoder().encode(json);
}
