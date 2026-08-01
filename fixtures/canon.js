'use strict';

/**
 * Shared canonicalization for C0 corpus extraction + verification.
 * Strings that may contain lone UTF-16 surrogates (JS strings are allowed
 * to; Rust Strings and STRICT JSON parsers like serde_json are not) are
 * stored as explicit u16 code-unit arrays: { __u16: [...] }.
 *
 * Rule: ASCII-only strings stay plain (corpus readable); any string with a
 * code unit > 0x7F becomes { __u16 }. The Rust side compares UNIT sequences
 * in both cases — exactly the C-1 amendment's comparison basis.
 */

const isAscii = s => {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
};

// CODE-UNIT based encoding: Array.from({length}) — NOT the string iterator,
// which counts code POINTS and eats trailing surrogate halves (review c0-1
// MAJOR: 'a😀a' must encode 4 units, not 3).
const u16of = s => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));

const enc = s => (isAscii(s) ? s : { __u16: u16of(s) });

// JSON has no Infinity/NaN literals: encode non-finite numbers explicitly so
// the Rust side can restore the exact f64 (review c0-1 MAJOR class).
const encOptions = o => {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    out[k] = typeof v === 'number' && !Number.isFinite(v) ? { __num: String(v) } : v;
  }
  return out;
};

// inverse of encOptions, for re-driving the original from frozen rows
const decOptions = o => {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    out[k] = v && typeof v === 'object' && typeof v.__num === 'string' ? Number(v.__num) : v;
  }
  return out;
};

const canonToken = t => ({
  type: t.type,
  value: enc(t.value),
  output: t.output === undefined ? null : enc(t.output)
});

const canonState = s => ({
  input: enc(s.input),
  index: s.index,
  start: s.start,
  dot: s.dot,
  consumed: enc(s.consumed),
  output: enc(s.output),
  prefix: enc(s.prefix),
  backtrack: s.backtrack,
  negated: s.negated,
  brackets: s.brackets,
  braces: s.braces,
  parens: s.parens,
  quotes: s.quotes,
  globstar: s.globstar,
  negatedExtglob: s.negatedExtglob === true ? true : false,
  tokens: s.tokens.map(canonToken)
});

module.exports = { enc, encOptions, decOptions, canonToken, canonState };
