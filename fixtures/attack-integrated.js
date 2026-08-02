'use strict';

/**
 * Integration attack set — cross-surface deterministic differential
 * harness that exercises representative interactions across ALL
 * currently implemented surfaces: scanner, C0/C1/C2 parser corpus,
 * and option combinations.
 *
 *   node fixtures/attack-integrated.js
 *
 * Reuses existing corpora and fixtures first. Supplements with
 * representative interactions:
 *  - empty/plain input
 *  - / and \\ separators
 *  - escaped metacharacters
 *  - negation and repeated !
 *  - stars and globstars
 *  - braces, brackets, extglob-like syntax
 *  - parts, tokens, scanToEnd, noext, nonegate, noparen, unescape interactions
 *  - BMP Unicode, astral code points
 *  - leading/trailing separators and dots
 *  - nested/adversarial but bounded patterns
 *  - option combinations selected pairwise plus explicit high-risk
 *
 * Deterministic seed: 42 (mulberry32 PRNG).
 * Every input x every option combo is compared JS-vs-Rust.
 * Scanner uses scanprobe; parser uses c0probe.
 * Exits nonzero on any divergence.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');
const assert = require('assert');

const RUST_DIR = path.join(__dirname, '..');
const MAIN_DIR = path.join(RUST_DIR, '..', 'Main');
const REF = MAIN_DIR;
const SEED = 42;

// --- probes ---
const SCAN_PROBE = path.join(
  RUST_DIR, 'target', 'debug', 'examples',
  process.platform === 'win32' ? 'scanprobe.exe' : 'scanprobe'
);
const C0_PROBE = path.join(
  RUST_DIR, 'target', 'debug', 'examples',
  process.platform === 'win32' ? 'c0probe.exe' : 'c0probe'
);

if (!fs.existsSync(SCAN_PROBE)) {
  throw new Error('[attack-integrated] scanprobe not found. Run `cargo build --example scanprobe`.');
}
if (!fs.existsSync(C0_PROBE)) {
  throw new Error('[attack-integrated] c0probe not found. Run `cargo build --example c0probe`.');
}

// --- reference functions ---
const scan = require(path.join(REF, 'lib', 'scan'));

// --- canon helpers (from canon-scan) ---
const { enc } = require('./canon-scan');

function canonState(s) {
  const out = {
    prefix: enc(s.prefix),
    input: enc(s.input),
    start: s.start,
    base: enc(s.base),
    glob: enc(s.glob),
    isBrace: s.isBrace === true,
    isBracket: s.isBracket === true,
    isGlob: s.isGlob === true,
    isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true,
    negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  if (s.tokens !== undefined) {
    out.tokens = s.tokens.map(function (t) {
      const tk = { value: enc(t.value), isGlob: t.isGlob === true };
      if (t.depth !== undefined) tk.depth = t.depth;
      if (t.backslashes === true) tk.backslashes = true;
      if (t.isBrace === true) tk.isBrace = true;
      if (t.isBracket === true) tk.isBracket = true;
      if (t.isExtglob === true) tk.isExtglob = true;
      if (t.isGlobstar === true) tk.isGlobstar = true;
      if (t.negated === true) tk.negated = true;
      if (t.isPrefix === true) tk.isPrefix = true;
      return tk;
    });
    out.maxDepth = s.maxDepth;
  }
  if (s.slashes !== undefined) out.slashes = s.slashes.slice();
  if (s.parts !== undefined) out.parts = s.parts.map(enc);
  return out;
}

function decStr(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && Array.isArray(v.__u16)) {
    return String.fromCharCode.apply(null, v.__u16);
  }
  return '';
}

function decNum(v) {
  if (v && typeof v === 'object' && typeof v.__num === 'string') {
    return Number(v.__num);
  }
  return typeof v === 'number' ? v : undefined;
}

function decToken(t) {
  const tok = { value: decStr(t.value), isGlob: t.isGlob === true };
  if (t.depth !== undefined && t.depth !== null) tok.depth = decNum(t.depth);
  if (t.backslashes === true) tok.backslashes = true;
  if (t.isBrace === true) tok.isBrace = true;
  if (t.isBracket === true) tok.isBracket = true;
  if (t.isExtglob === true) tok.isExtglob = true;
  if (t.isGlobstar === true) tok.isGlobstar = true;
  if (t.negated === true) tok.negated = true;
  if (t.isPrefix === true) tok.isPrefix = true;
  return tok;
}

function decState(s) {
  const state = {
    prefix: decStr(s.prefix),
    input: decStr(s.input),
    start: s.start,
    base: decStr(s.base),
    glob: decStr(s.glob),
    isBrace: s.isBrace === true,
    isBracket: s.isBracket === true,
    isGlob: s.isGlob === true,
    isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true,
    negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  if (s.tokens !== undefined && s.tokens !== null) {
    state.tokens = s.tokens.map(decToken);
  }
  if (s.maxDepth !== undefined && s.maxDepth !== null) {
    state.maxDepth = decNum(s.maxDepth);
  }
  if (s.slashes !== undefined && s.slashes !== null) {
    state.slashes = s.slashes.map(Number);
  }
  if (s.parts !== undefined && s.parts !== null) {
    state.parts = s.parts.map(decStr);
  }
  return state;
}

function rustScan(input, opts) {
  let encInput = input;
  let isAscii = true;
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 0x7f) { isAscii = false; break; }
  }
  if (!isAscii) {
    encInput = { __u16: Array.from({ length: input.length }, function (_, i) { return input.charCodeAt(i); }) };
  }
  const line = JSON.stringify({ i: 0, input: encInput, options: opts || {} }) + '\n';
  const res = spawnSync(SCAN_PROBE, [], { input: line, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0) {
    const err = new Error('[attack-integrated] scanprobe exited ' + res.status + ': ' + (res.stderr || ''));
    err.rustProcessFailure = true;
    throw err;
  }
  const lines = res.stdout.split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (lines.length === 0) {
    const err = new Error('[attack-integrated] no output from scanprobe');
    err.rustProcessFailure = true;
    throw err;
  }
  let row;
  try { row = JSON.parse(lines[lines.length - 1]); } catch (e) {
    const err = new Error('[attack-integrated] malformed JSON: ' + e.message);
    err.rustProcessFailure = true;
    throw err;
  }
  if (row.probeError) {
    const err = new Error('[attack-integrated] probeError: ' + row.probeError);
    err.rustProcessFailure = true;
    throw err;
  }
  return decState(row.state);
}

// --- deterministic PRNG (mulberry32, seed=42) ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

// --- representative input sets ---
const scanInputs = [
  // empty / plain
  '', 'a', 'abc', 'a.b', 'a/b', 'a//b',
  // separators
  '/', '//', '\\', '\\\\', 'a\\b', 'a/b/c',
  './', './.', '..', 'a/./b', '.',
  // escaped metacharacters
  '\\*', '\\?', '\\[', '\\]', '\\{', '\\}', '\\!', '\\@', '\\(',
  'a\\*b', '\\[a-z\\]', '\\{a,b\\}',
  // negation and repeated !
  '!a', '!!a', '!!!a', '!foo/bar', '!!foo',
  // stars and globstars
  '*', '**', '*/', '**/', 'a/*', 'a/**', 'a/**/b', '**/*.js', '*/*',
  'a*b', 'a**b', '***', 'a/*/*.js',
  // braces, brackets
  '{a,b}', '{a,{b,c}}', '[abc]', '[a-z]', '[!a-z]', '[[:alpha:]]',
  '{}', '{a,}', '[', ']', '[]', '[!]',
  // extglob-like
  '@(a|b)', '+(a)', '*(a)', '?(a)', '!(a)',
  // dots
  '.foo', '..', '.a', './foo', './.foo',
  // BMP Unicode
  '\u00e9', 'a\u00e9b', '\u00e9/*.js', '\u4e2d/\u6587',
  // astral code points
  '\uD83D\uDE00', 'a\uD83D\uDE00b', '\uD83D\uDE00/*.js',
  // leading/trailing separators and dots
  '/', './', '/foo', 'foo/', './foo/', '.foo.',
  // nested/adversarial but bounded
  '{a,b}/*.js', '**/*/{a,b}', '!(**/*.tmp)', '[!a]*.js',
  'a/b/c/**/d', '{a,b,c}/{x,y}/z', '*.{js,ts,jsx}',
  '!{a,b}/!{c,d}', '[[', ']]', '{{', '}}',
  'a'.repeat(100),
  '\\'.repeat(20),
  '{'.repeat(10) + '}'.repeat(10),
];

// Add some random-generated inputs (deterministic, bounded).
// NOTE: Lone surrogates are intentionally excluded from the random alphabet.
// They are a D-016 unit-test-only boundary: scan_utf16(&[u16]) accepts them
// directly, but scanprobe's from_utf16_lossy replaces them with U+FFFD.
// Testing lone surrogates through the subprocess boundary would diverge by
// design, not by bug. They are tested at the unit level in scan.rs.
const chars = 'abcdefgh/.{}[]()!@+*?,$\\^|~\u00e9';
for (let i = 0; i < 100; i++) {
  const len = 1 + Math.floor(rng() * 25);
  let s = '';
  for (let j = 0; j < len; j++) s += chars[Math.floor(rng() * chars.length)];
  scanInputs.push(s);
}

// --- scan option combinations (pairwise + explicit high-risk) ---
const scanOptionCombos = [
  {},
  { parts: true },
  { tokens: true },
  { scanToEnd: true },
  { noext: true },
  { nonegate: true },
  { noparen: true },
  { unescape: true },
  { parts: true, tokens: true },
  { parts: true, scanToEnd: true },
  { tokens: true, scanToEnd: true },
  { tokens: true, parts: true, scanToEnd: true },
  { noext: true, nonegate: true },
  { noext: true, noparen: true },
  { nonegate: true, noparen: true },
  { noext: true, nonegate: true, noparen: true },
  { unescape: true, parts: true },
  { unescape: true, tokens: true, scanToEnd: true },
  { unescape: true, parts: true, tokens: true, scanToEnd: true },
  { parts: true, noext: true, nonegate: true, noparen: true, unescape: true },
];

// --- C0/C1/C2 parser input set (subset for integrated coverage) ---
const parserInputs = [
  '', 'a', 'abc', 'a/b', '.x', './a', '***', '**', './',
  '*.js', 'a*b', '[a-z]', '{a,b}', '!(a)',
  '\\*', '\\.', '^a$', 'a"b', '[', ']', '{', '}',
  'a[', 'a{', '!(foo)', '!!!a', '@(a|b)',
  '\u00e9', '\uD83D\uDE00',
];

// --- main ---
let divergences = 0;
let compared = 0;
let rustProcessFailures = 0;
let scannerComparisons = 0;
let parserComparisons = 0;
let scannerDivergences = 0;
let parserDivergences = 0;
let globstarTokenComparisons = 0;

function hasGlobstarToken(state) {
  return state && state.tokens && state.tokens.some(function (t) { return t.isGlobstar === true; });
}

console.log('=== Integration Attack Set ===');
console.log('Seed: ' + SEED);
console.log('Scan inputs: ' + scanInputs.length + ' x ' + scanOptionCombos.length + ' option combos');
console.log('Parser inputs: ' + parserInputs.length + ' (default opts only via c0probe)');
console.log('');

// --- scanner differential ---
console.log('[Scanner differential]');
for (const input of scanInputs) {
  for (const opts of scanOptionCombos) {
    compared++;
    scannerComparisons++;
    let jsState, rustState, jsErr, rustErr, rustProcFail;
    try {
      jsState = canonState(scan(input, opts));
    } catch (e) {
      jsErr = e;
    }
    try {
      rustState = canonState(rustScan(input, opts));
    } catch (e) {
      if (e.rustProcessFailure) { rustProcFail = e; } else { rustErr = e; }
    }

    if (rustProcFail) {
      rustProcessFailures++;
      divergences++;
      scannerDivergences++;
      console.error('RUST PROC FAIL input=' + JSON.stringify(input) + ' opts=' + JSON.stringify(opts) + ' err=' + rustProcFail.message);
      continue;
    }

    if (jsErr || rustErr) {
      divergences++;
      scannerDivergences++;
      console.error('DIVERGE(scan-exception) input=' + JSON.stringify(input) + ' opts=' + JSON.stringify(opts) +
        ' jsErr=' + (jsErr ? jsErr.name + ': ' + jsErr.message : 'none') +
        ' rustErr=' + (rustErr ? rustErr.name + ': ' + rustErr.message : 'none'));
      continue;
    }

    try {
      assert.deepStrictEqual(rustState, jsState);
      if (hasGlobstarToken(jsState)) globstarTokenComparisons++;
    } catch (e) {
      divergences++;
      scannerDivergences++;
      console.error('DIVERGE(scan-state) input=' + JSON.stringify(input) + ' opts=' + JSON.stringify(opts));
      console.error('  js=' + JSON.stringify(jsState));
      console.error('  rust=' + JSON.stringify(rustState));
    }
  }
}
console.log('  Scanner: ' + scannerComparisons + ' compared, ' + scannerDivergences + ' divergences');
console.log('');

// --- parser C0 differential (via c0probe) ---
console.log('[Parser C0/C1/C2 differential]');
const parserJsonl = parserInputs.map(function (p, i) {
  return JSON.stringify({ i: i, pattern: p, options: {} });
}).join('\n') + '\n';

const parserRef = path.join(__dirname, 'probe-c0.js');
const jsParserOut = execFileSync('node', [parserRef], { input: parserJsonl, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' });
const rsParserOut = execFileSync(C0_PROBE, [], { input: parserJsonl, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' });

const jsParserMap = new Map(jsParserOut.trim().split('\n').map(function (l) {
  const r = JSON.parse(l);
  return [r.i, r];
}));
const rsParserMap = new Map(rsParserOut.trim().split('\n').map(function (l) {
  const r = JSON.parse(l);
  return [r.i, r];
}));

const canonSort = function (v) {
  return Array.isArray(v) ? v.map(canonSort)
    : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(function (k) { return [k, canonSort(v[k])]; })) : v);
};
const eq = function (a, b) { return JSON.stringify(canonSort(a)) === JSON.stringify(canonSort(b)); };

for (let i = 0; i < parserInputs.length; i++) {
  compared++;
  parserComparisons++;
  const a = jsParserMap.get(i);
  const b = rsParserMap.get(i);
  if (!a || !b) {
    divergences++;
    parserDivergences++;
    console.error('DIVERGE(parser-missing-row) i=' + i + ' input=' + JSON.stringify(parserInputs[i]));
    continue;
  }
  if (a.kind === 'error' || b.kind === 'error') {
    if (a.kind === 'error' && a.c0Owned === false) continue; // staged
    if (a.kind !== b.kind || a.class !== b.class || a.message !== b.message) {
      divergences++;
      parserDivergences++;
      console.error('DIVERGE(parser-error) i=' + i + ' input=' + JSON.stringify(parserInputs[i]) +
        ' js=' + JSON.stringify({ kind: a.kind, class: a.class, message: a.message }) +
        ' rs=' + JSON.stringify({ kind: b.kind, class: b.class, message: b.message }));
    }
    continue;
  }
  for (const f of ['input', 'prefix', 'dot']) {
    if (!eq(a[f], b[f])) {
      divergences++;
      parserDivergences++;
      console.error('DIVERGE(parser-field:' + f + ') i=' + i + ' input=' + JSON.stringify(parserInputs[i]));
    }
  }
}
console.log('  Parser: ' + parserComparisons + ' compared, ' + parserDivergences + ' divergences');
console.log('');

// --- coverage assertion ---
if (globstarTokenComparisons === 0) {
  console.error('COVERAGE FAILURE: no globstar-token comparisons executed');
  process.exit(1);
}

// --- summary ---
console.log('=== INTEGRATION ATTACK SUMMARY ===');
console.log('Total compared: ' + compared);
console.log('Total divergences: ' + divergences);
console.log('Rust process failures: ' + rustProcessFailures);
console.log('Globstar token comparisons: ' + globstarTokenComparisons);
console.log('Scanner: ' + scannerComparisons + ' compared, ' + scannerDivergences + ' divergences');
console.log('Parser: ' + parserComparisons + ' compared, ' + parserDivergences + ' divergences');
console.log('');

if (divergences > 0 || rustProcessFailures > 0) {
  console.error('INTEGRATION ATTACK FAILED: ' + divergences + ' divergences, ' + rustProcessFailures + ' process failures');
  process.exit(1);
} else {
  console.log('INTEGRATION ATTACK PASSED: ' + compared + ' comparisons, 0 divergences, 0 process failures');
  process.exit(0);
}