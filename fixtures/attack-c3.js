'use strict';

/**
 * attack-c3.js — adversarial differential for C3's wildcard surface.
 * Generates patterns from the C3-legal alphabet (no `**`, no paren/brace/
 * bracket/pipe/comma, no extglob openers) × option matrix, and deep-compares
 * Rust (examples/c3probe.rs) vs reference projections on:
 * output units, consumed units, index, start, prefix, dot, counters, negated,
 * backtrack, globstar, negatedExtglob, and full token streams.
 *
 * node fixtures/attack-c3.js
 */

const path = require('path');
const assert = require('assert');
const { execFileSync, execFile } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'Main');
const parse = require(path.join(REF, 'lib', 'parse'));
const { enc } = require('./canon');

const E = '\u{1F600}';

/** Reference projection, normalized exactly like c3probe's row. */
function jsProject(i, pattern, options) {
  try {
    const s = parse(pattern, options);
    return {
      i, kind: 'ok', index: s.index, start: s.start, dot: s.dot, prefix: s.prefix,
      output: enc(s.output), consumed: enc(s.consumed), negated: s.negated,
      backtrack: s.backtrack, brackets: s.brackets, braces: s.braces,
      parens: s.parens, quotes: s.quotes, globstar: s.globstar,
      negatedExtglob: s.negatedExtglob === true,
      tokens: s.tokens.map(t => ({ type: t.type, value: enc(t.value), output: t.output === undefined ? null : enc(t.output) }))
    };
  } catch (err) {
    return { i, kind: 'error', class: err.constructor.name, message: err.message };
  }
}

// ---- generator: C3-legal alphabet strings ----
const UNITS = ['', 'a', 'b', '.', '/', '?', '*', '\\', '"', ' ', E];
const pieces = ['a', '?', '*', '/', '.', '\\', '"', 'ab', '?.', '*a', 'a/', '\\\\', E, ' '];
const patterns = new Set();
for (const p of pieces) patterns.add(p);
for (const a of pieces) for (const b of pieces) patterns.add(a + b);
for (const a of pieces) for (const b of pieces) for (const c of ['a', '?', '*', '/']) {
  patterns.add(a + b + c);
}
// explicit guard/site shapes
for (const p of ['.', './', '/', 'a/', '/a', '.a', 'a.', '"', 'a"', '"a', '\\', '\\\\']) {
  for (const q of ['?', '*', '?a', '*a', 'a?', 'a*']) patterns.add(p + q);
}
const optsMatrix = [
  {}, { dot: true }, { bash: true }, { capture: true }, { windows: true },
  { unescape: true }, { fastpaths: false }, { dot: true, bash: true },
  { capture: true, bash: true }, { windows: true, dot: true }
];

const cases = [];
let i = 0;
for (const pattern of patterns) {
  // never allow `**` (C8) — drop runs of adjacent stars
  if (/\*\*/.test(pattern)) continue;
  // never allow NUL of `(` issues: alphabet already safe; also drop bare '(' from "\\(" none here.
  for (const options of optsMatrix) cases.push({ i: i++, pattern, options });
}

console.log(`attack-c3: ${cases.length} cases`);

// ---- rust side: build + drive probe ----
const lit = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
// Rust side driven via the prebuilt probe binary (no `cargo run` — spawns once)
const rsOut = execFileSync(path.join(__dirname, '..', 'target', 'debug', 'examples', 'c3probe'), [], {
  input: lit, encoding: 'utf8', maxBuffer: 1 << 26
});
const rs = new Map();
for (const line of rsOut.split('\n')) {
  if (line.trim()) rs.set(JSON.parse(line).i, JSON.parse(line));
}

let divergences = 0;
for (const c of cases) {
  const expected = jsProject(c.i, c.pattern, c.options);
  let actual = rs.get(c.i);
  if (!actual) {
    divergences++;
    console.log(JSON.stringify({ i: c.i, kind: 'missing-rs-row', c }));
    continue;
  }
  // normalize actual: enc() fields arrive as {__u16} or plain strings from JS side;
  // c3probe emits arrays/ints/bools directly. Canonicalize both through JS values.
  const norm = v => (v && typeof v === 'object' && Array.isArray(v.__u16) ? { __u16: v.__u16 } : v);
  const canonRow = r => ({
    ...r,
    output: JSON.stringify(norm(r.output)),
    consumed: JSON.stringify(norm(r.consumed)),
    prefix: JSON.stringify(norm(r.prefix)),
    tokens: JSON.stringify(r.tokens ?? [])
  });
  try {
    assert.deepStrictEqual(canonRow(actual), canonRow({ ...expected, kind: actual.kind }));
  } catch (e) {
    divergences++;
    if (divergences <= 8) console.log(JSON.stringify({ i: c.i, c, expected: canonRow(expected), actual: canonRow(actual) }).slice(0, 900));
  }
}
console.log(`divergences: ${divergences}`);
process.exitCode = divergences === 0 ? 0 : 1;
