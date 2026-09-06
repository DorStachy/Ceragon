'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { canonicalizeJcs } = require('../dist/sqs-signer.js');
const {
  DEFAULT_STRICT_JSON_LIMITS,
  STRICT_JSON_MAX_BYTES,
  STRICT_JSON_MAX_DEPTH,
  STRICT_JSON_MAX_NODES,
  StrictJsonError,
  parseStrictJsonBytes,
  parseStrictJsonUtf8,
} = require('./lib/strict-json.cjs');

const root = path.resolve(__dirname, '..');
const conformance = parseStrictJsonBytes(
  fs.readFileSync(path.join(root, 'vectors', 'rfc8785-conformance.v1.json')),
);
const rejections = parseStrictJsonBytes(
  fs.readFileSync(path.join(root, 'vectors', 'rfc8785-rejections.v1.json')),
);

function bytes(text) {
  return Buffer.from(text, 'utf8');
}

function assertStrictError(fn, code, label) {
  assert.throws(
    fn,
    (error) =>
      error instanceof StrictJsonError &&
      error.code === code &&
      Number.isInteger(error.offset) &&
      error.offset >= 0,
    label,
  );
}

// RFC 8785 §3.2.2 complete primitive serialization example.
assert.equal(
  canonicalizeJcs(JSON.parse(conformance.primitiveExample.inputJson)),
  conformance.primitiveExample.expectedCanonical,
);

// RFC 8785 Appendix B: every listed binary64 sample, constructed from the
// official bit pattern rather than a decimal parse that could mask drift.
for (const vector of conformance.numberVectors) {
  const value = Buffer.from(vector.ieee754Hex, 'hex').readDoubleBE(0);
  if (vector.reject) {
    assert.throws(() => canonicalizeJcs(value), /non-finite number/, vector.ieee754Hex);
  } else {
    assert.equal(canonicalizeJcs(value), vector.expected, vector.ieee754Hex);
  }
}

// Erratum 7920 is an ingestion rule, not an in-memory serialization change.
assert.equal(canonicalizeJcs(-0), '0');

// RFC 8785 §3.2.3 sorts unsigned UTF-16 code units, recursively.
assert.equal(
  canonicalizeJcs(Object.fromEntries(conformance.utf16Ordering.entries)),
  conformance.utf16Ordering.expectedCanonical,
);
for (const input of conformance.permutations.inputs) {
  assert.equal(canonicalizeJcs(JSON.parse(input)), conformance.permutations.expectedCanonical);
}

// RFC 8785 §3.1 explicitly forbids Unicode normalization.
const nonNormalized = Object.fromEntries(conformance.nonNormalization.entries);
assert.notEqual(Object.keys(nonNormalized)[0], Object.keys(nonNormalized)[1]);
assert.equal(canonicalizeJcs(nonNormalized), conformance.nonNormalization.expectedCanonical);
const ingestedNonNormalized = parseStrictJsonBytes(bytes('{"é":1,"e\\u0301":2}'));
assert.equal(canonicalizeJcs(ingestedNonNormalized), '{"é":2,"é":1}');

// Pin current programmatic-input rejection behavior at the canonicalizer.
for (const value of [undefined, 1n, Symbol('x'), () => 1, Number.NaN, Infinity, -Infinity]) {
  assert.throws(() => canonicalizeJcs(value));
}
for (const value of [new Map(), new Set(), new Date(0), new Uint8Array([1])]) {
  assert.throws(() => canonicalizeJcs(value), /unsupported container type/);
}
const objectCycle = {};
objectCycle.self = objectCycle;
assert.throws(() => canonicalizeJcs(objectCycle), /cycle detected/);
const arrayCycle = [];
arrayCycle.push(arrayCycle);
assert.throws(() => canonicalizeJcs(arrayCycle), /cycle detected/);
assert.throws(() => canonicalizeJcs('\ud800'), /lone high surrogate/);
assert.throws(() => canonicalizeJcs('\udc00'), /lone low surrogate/);
for (const noncharacter of ['\ufdd0', '\uffff', '\u{1fffe}']) {
  assert.throws(
    () => canonicalizeJcs(noncharacter),
    /Unicode noncharacter/,
    `noncharacter value U+${noncharacter.codePointAt(0).toString(16).toUpperCase()}`,
  );
  assert.throws(
    () => canonicalizeJcs({ [noncharacter]: true }),
    /Unicode noncharacter/,
    `noncharacter member name U+${noncharacter.codePointAt(0).toString(16).toUpperCase()}`,
  );
}
assert.equal(canonicalizeJcs({ omitted: undefined, kept: true }), '{"kept":true}');
assert.throws(
  () => canonicalizeJcs([undefined]),
  /canonicalizeJcs: undefined is not JSON-representable/,
);
for (const sparse of [new Array(1), [1, , 2]]) {
  assert.throws(
    () => canonicalizeJcs(sparse),
    /canonicalizeJcs: undefined is not JSON-representable/,
    'sparse array holes must reject exactly like explicit undefined elements',
  );
}

assert.deepEqual(DEFAULT_STRICT_JSON_LIMITS, {
  maxBytes: 1_048_576,
  maxDepth: 64,
  maxNodes: 100_000,
});
assert.equal(STRICT_JSON_MAX_BYTES, DEFAULT_STRICT_JSON_LIMITS.maxBytes);
assert.equal(STRICT_JSON_MAX_DEPTH, DEFAULT_STRICT_JSON_LIMITS.maxDepth);
assert.equal(STRICT_JSON_MAX_NODES, DEFAULT_STRICT_JSON_LIMITS.maxNodes);
assert.equal(Object.isFrozen(DEFAULT_STRICT_JSON_LIMITS), true);
assert.equal(parseStrictJsonBytes, parseStrictJsonUtf8, 'stable bytes API and explicit UTF-8 alias');
assertStrictError(() => parseStrictJsonUtf8('{}'), 'INVALID_INPUT_TYPE', 'bytes only');
const hostileIterator = new Uint8Array(0);
hostileIterator[Symbol.iterator] = function* hostileByteIterator() {
  yield* bytes('null');
};
assertStrictError(
  () => parseStrictJsonBytes(hostileIterator, { maxBytes: 1 }),
  'SYNTAX_ERROR',
  'copy must ignore a typed-array custom iterator',
);
const shadowedLength = bytes('null');
Object.defineProperty(shadowedLength, 'byteLength', { value: 0 });
assertStrictError(() => parseStrictJsonBytes(shadowedLength, { maxBytes: 1 }), 'MAX_BYTES_EXCEEDED');
for (const limits of [
  { maxBytes: 0 },
  { maxDepth: -1 },
  { maxNodes: 1.5 },
  { maxBytes: null },
  { maxDepth: null },
  { maxNodes: null },
  { maxBytes: 4, maxDepth: null, maxNodes: 1 },
  { maxBytes: Number.MAX_SAFE_INTEGER + 1 },
  { maxBytes: DEFAULT_STRICT_JSON_LIMITS.maxBytes + 1 },
  { maxDepth: DEFAULT_STRICT_JSON_LIMITS.maxDepth + 1 },
  { maxDepth: 5_000 },
  { maxNodes: DEFAULT_STRICT_JSON_LIMITS.maxNodes + 1 },
]) {
  assertStrictError(() => parseStrictJsonUtf8(bytes('null'), limits), 'INVALID_LIMITS');
}

// Hostile UTF-8 / token vectors. Duplicate detection is on decoded property
// names, so literal, escaped, and surrogate-pair spellings cannot alias. The
// safe-integer rule is an explicit Ceragon application policy, not an RFC MUST.
assert.match(rejections.profile, /Ceragon strict UTF-8 JCS ingestion/);
for (const vector of rejections.cases) {
  if (vector.code === 'UNSAFE_INTEGER') {
    assert.equal(vector.basis, 'CERAGON_SAFE_INTEGER_POLICY');
  }
  const input = vector.hex ? Buffer.from(vector.hex, 'hex') : bytes(vector.utf8);
  assertStrictError(() => parseStrictJsonUtf8(input), vector.code, vector.name);
}

// Boundary values are inclusive and deterministic: root/container/scalars
// each count as one node; property names do not count; root depth is zero and
// each entered array/object adds one level.
const sevenBytes = bytes('{"a":1}');
assert.equal(sevenBytes.length, 7);
assert.deepEqual(parseStrictJsonUtf8(sevenBytes, { maxBytes: 7 }), { a: 1 });
assertStrictError(
  () => parseStrictJsonUtf8(sevenBytes, { maxBytes: 6 }),
  'MAX_BYTES_EXCEEDED',
);
assert.equal(parseStrictJsonUtf8(bytes('null'), { maxDepth: 0 }), null);
assertStrictError(() => parseStrictJsonUtf8(bytes('[]'), { maxDepth: 0 }), 'MAX_DEPTH_EXCEEDED');
assert.deepEqual(parseStrictJsonUtf8(bytes('[[]]'), { maxDepth: 2 }), [[]]);
assertStrictError(() => parseStrictJsonUtf8(bytes('[[[]]]'), { maxDepth: 2 }), 'MAX_DEPTH_EXCEEDED');
assert.deepEqual(parseStrictJsonUtf8(bytes('[1,2]'), { maxNodes: 3 }), [1, 2]);
assertStrictError(() => parseStrictJsonUtf8(bytes('[1,2]'), { maxNodes: 2 }), 'MAX_NODES_EXCEEDED');

const atDepthCeiling = `${'['.repeat(DEFAULT_STRICT_JSON_LIMITS.maxDepth)}null${']'.repeat(DEFAULT_STRICT_JSON_LIMITS.maxDepth)}`;
assert.doesNotThrow(() => parseStrictJsonUtf8(bytes(atDepthCeiling)));
assertStrictError(
  () => parseStrictJsonUtf8(bytes(`[${atDepthCeiling}]`)),
  'MAX_DEPTH_EXCEEDED',
);
const atNodeCeiling = `[${Array(DEFAULT_STRICT_JSON_LIMITS.maxNodes - 1).fill('null').join(',')}]`;
assert.equal(parseStrictJsonUtf8(bytes(atNodeCeiling)).length, 99_999);
assertStrictError(
  () => parseStrictJsonUtf8(bytes(`${atNodeCeiling.slice(0, -1)},null]`)),
  'MAX_NODES_EXCEEDED',
);

assert.equal(parseStrictJsonUtf8(bytes('9007199254740991')), Number.MAX_SAFE_INTEGER);
assert.equal(parseStrictJsonUtf8(bytes('-9007199254740991')), Number.MIN_SAFE_INTEGER);
assert.equal(parseStrictJsonUtf8(bytes('0')), 0);
assert.equal(Object.is(parseStrictJsonUtf8(bytes('0')), -0), false);
assert.deepEqual(parseStrictJsonUtf8(bytes(' \r\n {"emoji":"😀","pair":"\\ud83d\\ude00"}\t')), {
  emoji: '😀',
  pair: '😀',
});

const prototypeKey = parseStrictJsonUtf8(bytes('{"__proto__":{"polluted":true}}'));
assert.equal(Object.hasOwn(prototypeKey, '__proto__'), true);
assert.equal({}.polluted, undefined);
assert.equal(canonicalizeJcs(prototypeKey), '{"__proto__":{"polluted":true}}');

const composed = parseStrictJsonUtf8(bytes('{"z":0,"a":{"b":2,"a":1}}'));
assert.equal(canonicalizeJcs(composed), '{"a":{"a":1,"b":2},"z":0}');

console.log(
  `JCS/strict JSON conformance: PASS (${conformance.numberVectors.length} Appendix B numbers, ${rejections.cases.length} hostile inputs)`,
);
