'use strict';

const { TextDecoder } = require('node:util');

/**
 * Defensive limits for security-policy and evidence artifacts. Limits are
 * inclusive. A node is each JSON value (containers and scalars); property
 * names are not nodes. Root scalar depth is zero and every entered object or
 * array adds one level.
 */
const STRICT_JSON_MAX_BYTES = 1_048_576;
const STRICT_JSON_MAX_DEPTH = 64;
const STRICT_JSON_MAX_NODES = 100_000;
const DEFAULT_STRICT_JSON_LIMITS = Object.freeze({
  maxBytes: STRICT_JSON_MAX_BYTES,
  maxDepth: STRICT_JSON_MAX_DEPTH,
  maxNodes: STRICT_JSON_MAX_NODES,
});
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
).get;
const TYPED_ARRAY_SET = Uint8Array.prototype.set;

class StrictJsonError extends SyntaxError {
  constructor(code, message, offset) {
    super(`strict JSON ${code} at character ${offset}: ${message}`);
    this.name = 'StrictJsonError';
    this.code = code;
    this.offset = offset;
  }
}

function reject(code, message, offset) {
  throw new StrictJsonError(code, message, offset);
}

function isUnicodeNoncharacter(codePoint) {
  return (
    (codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe
  );
}

function normalizeLimits(overrides) {
  if (overrides === undefined) return DEFAULT_STRICT_JSON_LIMITS;
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    reject('INVALID_LIMITS', 'limits must be an object', 0);
  }

  const allowed = new Set(['maxBytes', 'maxDepth', 'maxNodes']);
  for (const key of Object.keys(overrides)) {
    if (!allowed.has(key)) reject('INVALID_LIMITS', `unknown limit ${key}`, 0);
  }

  function resolveLimit(key) {
    const value = overrides[key];
    return value === undefined ? DEFAULT_STRICT_JSON_LIMITS[key] : value;
  }

  const limits = {
    maxBytes: resolveLimit('maxBytes'),
    maxDepth: resolveLimit('maxDepth'),
    maxNodes: resolveLimit('maxNodes'),
  };
  for (const [key, value] of Object.entries(limits)) {
    const minimum = key === 'maxDepth' ? 0 : 1;
    if (
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > DEFAULT_STRICT_JSON_LIMITS[key]
    ) {
      reject(
        'INVALID_LIMITS',
        `${key} must be a safe integer within its supported hard ceiling`,
        0,
      );
    }
  }
  return limits;
}

/**
 * Parse untrusted UTF-8 JSON into ordinary JavaScript JSON values while
 * enforcing the mandatory UTF-8, Unicode, and duplicate-name I-JSON/JCS
 * constraints that JSON.parse cannot enforce, plus Ceragon's mandatory
 * safe-integral-value ingestion policy and RFC 8785 erratum 7920.
 *
 * This is deliberately a byte-only API: callers cannot accidentally skip
 * fatal UTF-8 and BOM validation by handing it an already-decoded string.
 * It does not canonicalize or sign anything; callers explicitly pass the
 * result to the existing canonicalizeJcs implementation when required.
 */
function parseStrictJsonUtf8(input, limitOverrides) {
  const limits = normalizeLimits(limitOverrides);
  if (!(input instanceof Uint8Array)) {
    reject('INVALID_INPUT_TYPE', 'input must be a Uint8Array or Buffer', 0);
  }
  let actualByteLength;
  try {
    actualByteLength = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH, input, []);
  } catch {
    reject('INVALID_INPUT_TYPE', 'input must have Uint8Array internal slots', 0);
  }
  if (actualByteLength > limits.maxBytes) {
    reject('MAX_BYTES_EXCEEDED', `input exceeds ${limits.maxBytes} bytes`, 0);
  }

  // Intrinsic typed-array set ignores attacker-controlled iterators and own
  // byteLength properties while snapshotting before decode/parse.
  const stableBytes = new Uint8Array(actualByteLength);
  try {
    Reflect.apply(TYPED_ARRAY_SET, stableBytes, [input]);
  } catch {
    reject('INVALID_INPUT_TYPE', 'input became unavailable while copying', 0);
  }
  if (
    stableBytes.byteLength >= 3 &&
    stableBytes[0] === 0xef &&
    stableBytes[1] === 0xbb &&
    stableBytes[2] === 0xbf
  ) {
    reject('BOM_NOT_ALLOWED', 'a UTF-8 BOM is not permitted', 0);
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(stableBytes);
  } catch {
    reject('INVALID_UTF8', 'input is not well-formed UTF-8', 0);
  }

  let offset = 0;
  let nodes = 0;
  const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

  function fail(code, message, at = offset) {
    reject(code, message, at);
  }

  function skipWhitespace() {
    while (offset < text.length) {
      const code = text.charCodeAt(offset);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
        offset++;
      } else {
        return;
      }
    }
  }

  function countNode() {
    nodes++;
    if (nodes > limits.maxNodes) {
      fail('MAX_NODES_EXCEEDED', `document exceeds ${limits.maxNodes} nodes`);
    }
  }

  function enterContainer(ancestorDepth) {
    const depth = ancestorDepth + 1;
    if (depth > limits.maxDepth) {
      fail('MAX_DEPTH_EXCEEDED', `document exceeds depth ${limits.maxDepth}`);
    }
    return depth;
  }

  function readHex4(start) {
    if (start + 4 > text.length) fail('SYNTAX_ERROR', 'incomplete Unicode escape', start);
    const token = text.slice(start, start + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(token)) {
      fail('SYNTAX_ERROR', 'invalid Unicode escape', start);
    }
    return Number.parseInt(token, 16);
  }

  function parseString() {
    if (text.charCodeAt(offset) !== 0x22) fail('SYNTAX_ERROR', 'expected string');
    offset++;
    let result = '';

    while (offset < text.length) {
      const code = text.charCodeAt(offset);
      if (code === 0x22) {
        offset++;
        return result;
      }
      if (code < 0x20) fail('SYNTAX_ERROR', 'unescaped control character in string');

      if (code === 0x5c) {
        const escapeOffset = offset;
        offset++;
        if (offset >= text.length) fail('SYNTAX_ERROR', 'unterminated escape', escapeOffset);
        const escaped = text.charAt(offset++);
        const simple = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        if (Object.hasOwn(simple, escaped)) {
          result += simple[escaped];
          continue;
        }
        if (escaped !== 'u') fail('SYNTAX_ERROR', 'invalid string escape', escapeOffset);

        const firstOffset = offset;
        const first = readHex4(offset);
        offset += 4;
        if (first >= 0xd800 && first <= 0xdbff) {
          if (text.slice(offset, offset + 2) !== '\\u') {
            fail('LONE_SURROGATE', 'high surrogate is not followed by a low surrogate', firstOffset);
          }
          const secondOffset = offset + 2;
          const second = readHex4(secondOffset);
          if (second < 0xdc00 || second > 0xdfff) {
            fail('LONE_SURROGATE', 'high surrogate is not followed by a low surrogate', firstOffset);
          }
          const codePoint =
            0x10000 + (first - 0xd800) * 0x400 + (second - 0xdc00);
          if (isUnicodeNoncharacter(codePoint)) {
            fail('NONCHARACTER', 'I-JSON forbids Unicode noncharacters', firstOffset);
          }
          result += String.fromCharCode(first, second);
          offset += 6;
          continue;
        }
        if (first >= 0xdc00 && first <= 0xdfff) {
          fail('LONE_SURROGATE', 'low surrogate has no preceding high surrogate', firstOffset);
        }
        if (isUnicodeNoncharacter(first)) {
          fail('NONCHARACTER', 'I-JSON forbids Unicode noncharacters', firstOffset);
        }
        result += String.fromCharCode(first);
        continue;
      }

      if (code >= 0xd800 && code <= 0xdbff) {
        const next = offset + 1 < text.length ? text.charCodeAt(offset + 1) : -1;
        if (next < 0xdc00 || next > 0xdfff) {
          fail('LONE_SURROGATE', 'raw high surrogate is not paired');
        }
        const codePoint =
          0x10000 + (code - 0xd800) * 0x400 + (next - 0xdc00);
        if (isUnicodeNoncharacter(codePoint)) {
          fail('NONCHARACTER', 'I-JSON forbids Unicode noncharacters');
        }
        result += text.charAt(offset) + text.charAt(offset + 1);
        offset += 2;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        fail('LONE_SURROGATE', 'raw low surrogate has no preceding high surrogate');
      }
      if (isUnicodeNoncharacter(code)) {
        fail('NONCHARACTER', 'I-JSON forbids Unicode noncharacters');
      }
      result += text.charAt(offset++);
    }
    fail('SYNTAX_ERROR', 'unterminated string');
  }

  function parseNumber() {
    const start = offset;
    numberPattern.lastIndex = offset;
    const match = numberPattern.exec(text);
    if (!match) fail('SYNTAX_ERROR', 'invalid number');
    const token = match[0];
    offset += token.length;
    const value = Number(token);
    if (!Number.isFinite(value)) {
      fail('NON_FINITE_NUMBER', 'number is outside binary64 range', start);
    }
    if (Object.is(value, -0)) {
      fail('NEGATIVE_ZERO', 'negative zero is forbidden by RFC 8785 erratum 7920', start);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      fail('UNSAFE_INTEGER', 'Ceragon policy requires integral values in the safe range', start);
    }
    return value;
  }

  function parseArray(ancestorDepth) {
    const depth = enterContainer(ancestorDepth);
    offset++;
    const result = [];
    skipWhitespace();
    if (text.charCodeAt(offset) === 0x5d) {
      offset++;
      return result;
    }
    while (true) {
      result.push(parseValue(depth));
      skipWhitespace();
      const code = text.charCodeAt(offset);
      if (code === 0x5d) {
        offset++;
        return result;
      }
      if (code !== 0x2c) fail('SYNTAX_ERROR', 'expected comma or closing bracket');
      offset++;
      skipWhitespace();
    }
  }

  function parseObject(ancestorDepth) {
    const depth = enterContainer(ancestorDepth);
    offset++;
    const result = {};
    const names = new Set();
    skipWhitespace();
    if (text.charCodeAt(offset) === 0x7d) {
      offset++;
      return result;
    }
    while (true) {
      if (text.charCodeAt(offset) !== 0x22) fail('SYNTAX_ERROR', 'expected property name');
      const nameOffset = offset;
      const name = parseString();
      if (names.has(name)) {
        fail('DUPLICATE_PROPERTY', 'decoded property name is duplicated', nameOffset);
      }
      names.add(name);
      skipWhitespace();
      if (text.charCodeAt(offset) !== 0x3a) fail('SYNTAX_ERROR', 'expected colon');
      offset++;
      const value = parseValue(depth);
      Object.defineProperty(result, name, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      skipWhitespace();
      const code = text.charCodeAt(offset);
      if (code === 0x7d) {
        offset++;
        return result;
      }
      if (code !== 0x2c) fail('SYNTAX_ERROR', 'expected comma or closing brace');
      offset++;
      skipWhitespace();
    }
  }

  function parseLiteral(literal, value) {
    if (text.slice(offset, offset + literal.length) !== literal) {
      fail('SYNTAX_ERROR', `expected ${literal}`);
    }
    offset += literal.length;
    return value;
  }

  function parseValue(ancestorDepth) {
    skipWhitespace();
    countNode();
    const code = text.charCodeAt(offset);
    if (code === 0x7b) return parseObject(ancestorDepth);
    if (code === 0x5b) return parseArray(ancestorDepth);
    if (code === 0x22) return parseString();
    if (code === 0x74) return parseLiteral('true', true);
    if (code === 0x66) return parseLiteral('false', false);
    if (code === 0x6e) return parseLiteral('null', null);
    if (code === 0x2d || (code >= 0x30 && code <= 0x39)) return parseNumber();
    fail('SYNTAX_ERROR', 'expected JSON value');
  }

  skipWhitespace();
  const result = parseValue(0);
  skipWhitespace();
  if (offset !== text.length) fail('SYNTAX_ERROR', 'trailing token after root value');
  return result;
}

module.exports = {
  DEFAULT_STRICT_JSON_LIMITS,
  STRICT_JSON_MAX_BYTES,
  STRICT_JSON_MAX_DEPTH,
  STRICT_JSON_MAX_NODES,
  StrictJsonError,
  parseStrictJsonBytes: parseStrictJsonUtf8,
  parseStrictJsonUtf8,
};
