'use strict';

/**
 * Shared canonicalization for scanner corpus extraction + verification +
 * the unchanged-test bridge. Mirrors canon.js conventions:
 *  - ASCII-only strings stay plain; any string with a code unit > 0x7F
 *    becomes { __u16: [...] }.
 *  - Non-finite numbers (Infinity) encoded as { __num: "Infinity" }.
 *  - Options with non-finite numbers encoded via encOptions.
 *
 * Rule: the Rust side compares UNIT sequences in both cases (D-013/D-017).
 */

const isAscii = function (s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
};

const u16of = function (s) {
  return Array.from({ length: s.length }, function (_, i) {
    return s.charCodeAt(i);
  });
};

const enc = function (s) {
  return isAscii(s) ? s : { __u16: u16of(s) };
};

const encOptions = function (o) {
  const out = {};
  for (const k in (o || {})) {
    const v = o[k];
    out[k] = typeof v === 'number' && !Number.isFinite(v)
      ? { __num: String(v) }
      : v;
  }
  return out;
};

// inverse of encOptions, for re-driving the original from frozen rows
const decOptions = function (o) {
  const out = {};
  for (const k in (o || {})) {
    const v = o[k];
    out[k] = v && typeof v === 'object' && typeof v.__num === 'string'
      ? Number(v.__num)
      : v;
  }
  return out;
};

module.exports = { enc, encOptions, decOptions };