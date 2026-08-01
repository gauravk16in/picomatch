'use strict';

/**
 * REVIEW PROBE — JS side of the C0 differential. Reads the same JSONL cases
 * as crates/pmx-core/examples/c0probe.rs, projects the ORIGINAL's C0-observable
 * surface. Adds `route`: 'fastpath' when the original returned through the
 * inline fastpath intercept (tokens [bos], index -1) — only fastpath-route
 * rows are shape-comparable in pure C0 (loop-free).
 *
 * node fixtures/probe-c0.js < cases.jsonl > js.jsonl
 */

const path = require('path');
const parse = require(path.join(__dirname, '..', '..', 'picomatch', 'lib', 'parse'));

const units = s => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));

const projectOk = s => ({
  kind: 'ok',
  route: s.tokens.length === 1 && s.index === -1 ? 'fastpath' : 'loop',
  input: units(s.input),
  prefix: s.prefix,
  dot: s.dot,
  index: s.index,
  start: s.start,
  consumedUnits: s.consumed.length,
  negated: s.negated,
  backtrack: s.backtrack,
  brackets: s.brackets,
  braces: s.braces,
  parens: s.parens,
  quotes: s.quotes,
  globstar: s.globstar,
  negatedExtglob: s.negatedExtglob === true,
  output: s.output,
  tokens: s.tokens.map(t => ({
    type: t.type,
    value: units(t.value),
    output: t.output === undefined ? null : units(t.output)
  }))
});

const runCase = c => {
  const opts = { ...(c.options || {}) };
  // JSON-encoded non-finite maxLength sentinels (+ exact decimal transport
  // "num:<String(v)>" — review c0-2: serde_json's default f64 parse is not
  // correctly rounded; Number() is)
  if (opts.maxLength === 'NaN') opts.maxLength = NaN;
  else if (opts.maxLength === 'Infinity') opts.maxLength = Infinity;
  else if (opts.maxLength === '-Infinity') opts.maxLength = -Infinity;
  else if (opts.maxLength === '-0') opts.maxLength = -0;
  else if (typeof opts.maxLength === 'string' && opts.maxLength.startsWith('num:')) opts.maxLength = Number(opts.maxLength.slice(4));
  try {
    return { i: c.i, ...projectOk(parse(c.pattern, opts)) };
  } catch (err) {
    const c0Owned = /^Input length: /.test(err.message) || err.message === 'Expected a string';
    return { i: c.i, kind: 'error', class: err.constructor.name, message: err.message, c0Owned };
  }
};

require('readline')
  .createInterface({ input: process.stdin })
  .on('line', l => {
    if (l.trim()) console.log(JSON.stringify(runCase(JSON.parse(l))));
  });
