'use strict';

/**
 * Integration attack set — cross-surface deterministic differential
 * harness. Scanner probe calls are BATCHED (one spawn per option combo,
 * not per case). Parser uses c0probe with JSONL batching.
 *
 * Uses shared harness core from integrated-harness-core.js.
 *
 *   node fixtures/attack-integrated.js
 *
 * Deterministic seed: 42 (mulberry32 PRNG).
 * Exits nonzero on any divergence.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const assert = require('assert');

const {
  ErrorCodes, HarnessError, compareStates,
  classifyProbeResult, parseProbeOutput, correlateByIds, assertCoverage,
} = require('./integrated-harness-core');

const RUST_DIR = path.join(__dirname, '..');
const MAIN_DIR = path.join(RUST_DIR, '..', 'Main');
const REF = MAIN_DIR;
const SEED = 42;

const SCAN_PROBE = path.join(RUST_DIR, 'target', 'debug', 'examples',
  process.platform === 'win32' ? 'scanprobe.exe' : 'scanprobe');
const C0_PROBE = path.join(RUST_DIR, 'target', 'debug', 'examples',
  process.platform === 'win32' ? 'c0probe.exe' : 'c0probe');

if (!fs.existsSync(SCAN_PROBE)) throw new Error('[attack-integrated] scanprobe not found.');
if (!fs.existsSync(C0_PROBE)) throw new Error('[attack-integrated] c0probe not found.');

const scan = require(path.join(REF, 'lib', 'scan'));
const { enc } = require('./canon-scan');

function canonState(s) {
  const out = {
    prefix: enc(s.prefix), input: enc(s.input), start: s.start,
    base: enc(s.base), glob: enc(s.glob),
    isBrace: s.isBrace === true, isBracket: s.isBracket === true,
    isGlob: s.isGlob === true, isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true, negated: s.negated === true,
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
  if (v && typeof v === 'object' && Array.isArray(v.__u16)) return String.fromCharCode.apply(null, v.__u16);
  return '';
}
function decNum(v) {
  if (v && typeof v === 'object' && typeof v.__num === 'string') return Number(v.__num);
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
    prefix: decStr(s.prefix), input: decStr(s.input), start: s.start,
    base: decStr(s.base), glob: decStr(s.glob),
    isBrace: s.isBrace === true, isBracket: s.isBracket === true,
    isGlob: s.isGlob === true, isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true, negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  if (s.tokens !== undefined && s.tokens !== null) state.tokens = s.tokens.map(decToken);
  if (s.maxDepth !== undefined && s.maxDepth !== null) state.maxDepth = decNum(s.maxDepth);
  if (s.slashes !== undefined && s.slashes !== null) state.slashes = s.slashes.map(Number);
  if (s.parts !== undefined && s.parts !== null) state.parts = s.parts.map(decStr);
  return state;
}

function encodeInput(input) {
  let isAscii = true;
  for (let i = 0; i < input.length; i++) { if (input.charCodeAt(i) > 0x7f) { isAscii = false; break; } }
  if (!isAscii) return { __u16: Array.from({ length: input.length }, function (_, i) { return input.charCodeAt(i); }) };
  return input;
}

// --- deterministic PRNG (mulberry32, seed=42) ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

const scanInputs = [
  '', 'a', 'abc', 'a.b', 'a/b', 'a//b',
  '/', '//', '\\', '\\\\', 'a\\b', 'a/b/c',
  './', './.', '..', 'a/./b', '.',
  '\\*', '\\?', '\\[', '\\]', '\\{', '\\}', '\\!', '\\@', '\\(',
  'a\\*b', '\\[a-z\\]', '\\{a,b\\}',
  '!a', '!!a', '!!!a', '!foo/bar', '!!foo',
  '*', '**', '*/', '**/', 'a/*', 'a/**', 'a/**/b', '**/*.js', '*/*',
  'a*b', 'a**b', '***', 'a/*/*.js',
  '{a,b}', '{a,{b,c}}', '[abc]', '[a-z]', '[!a-z]', '[[:alpha:]]',
  '{}', '{a,}', '[', ']', '[]', '[!]',
  '@(a|b)', '+(a)', '*(a)', '?(a)', '!(a)',
  '.foo', '..', '.a', './foo', './.foo',
  '\u00e9', 'a\u00e9b', '\u00e9/*.js', '\u4e2d/\u6587',
  '\uD83D\uDE00', 'a\uD83D\uDE00b', '\uD83D\uDE00/*.js',
  '/', './', '/foo', 'foo/', './foo/', '.foo.',
  '{a,b}/*.js', '**/*/{a,b}', '!(**/*.tmp)', '[!a]*.js',
  'a/b/c/**/d', '{a,b,c}/{x,y}/z', '*.{js,ts,jsx}',
  '!{a,b}/!{c,d}', '[[', ']]', '{{', '}}',
  'a'.repeat(100), '\\'.repeat(20), '{'.repeat(10) + '}'.repeat(10),
  // trailing escape-advance inside extglob/paren inner loops (final-audit
  // F-01/F-02): residual `code` decides the final-token push (scan.js:344).
  '@(\\a', '@(\\/', '@(a\\', '@(a\\)', 'a@(b\\c', 'x(\\y', '((/', '((a',
  // line terminators for the unescape path (final-audit F-07).
  'a\\\rb', 'a\\\u2028b', '[a\rb\\x]',
];

// Lone surrogates excluded from random alphabet (D-016 boundary).
const chars = 'abcdefgh/.{}[]()!@+*?,$\\^|~\u00e9';
for (let i = 0; i < 100; i++) {
  const len = 1 + Math.floor(rng() * 25);
  let s = '';
  for (let j = 0; j < len; j++) s += chars[Math.floor(rng() * chars.length)];
  scanInputs.push(s);
}

const scanOptionCombos = [
  {}, { parts: true }, { tokens: true }, { scanToEnd: true },
  { noext: true }, { nonegate: true }, { noparen: true }, { unescape: true },
  { parts: true, tokens: true }, { parts: true, scanToEnd: true },
  { tokens: true, scanToEnd: true }, { tokens: true, parts: true, scanToEnd: true },
  { noext: true, nonegate: true }, { noext: true, noparen: true },
  { nonegate: true, noparen: true }, { noext: true, nonegate: true, noparen: true },
  { unescape: true, parts: true }, { unescape: true, tokens: true, scanToEnd: true },
  { unescape: true, parts: true, tokens: true, scanToEnd: true },
  { parts: true, noext: true, nonegate: true, noparen: true, unescape: true },
];

const parserInputs = [
  '', 'a', 'abc', 'a/b', '.x', './a', '***', '**', './',
  '*.js', 'a*b', '[a-z]', '{a,b}', '!(a)',
  '\\*', '\\.', '^a$', 'a"b', '[', ']', '{', '}',
  'a[', 'a{', '!(foo)', '!!!a', '@(a|b)',
  '\u00e9', '\uD83D\uDE00',
];

// --- counters ---
let scannerAttempted = 0, scannerCompared = 0, scannerDivergences = 0;
let parserAttempted = 0, parserCompared = 0, parserSkippedUnsupported = 0, parserDivergences = 0;
let processFailures = 0, timeouts = 0, transportFailures = 0;
let globstarTokenComparisons = 0;
let scanProbeSpawns = 0;

function hasGlobstarToken(state) {
  return state && state.tokens && state.tokens.some(function (t) { return t.isGlobstar === true; });
}

console.log('=== Integration Attack Set ===');
console.log('Seed: ' + SEED);
console.log('Scan inputs: ' + scanInputs.length + ' x ' + scanOptionCombos.length + ' option combos');
console.log('Parser inputs: ' + parserInputs.length + ' (default opts only via c0probe)');
console.log('');

// --- SCANNER: batched per option combo ---
console.log('[Scanner differential]');
for (const opts of scanOptionCombos) {
  // Build JSONL for all inputs with this option combo
  const jsonl = scanInputs.map(function (input, i) {
    return JSON.stringify({ i: i, input: encodeInput(input), options: opts });
  }).join('\n') + '\n';

  let rsOut;
  try {
    rsOut = execFileSync(SCAN_PROBE, [], { input: jsonl, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    scanProbeSpawns++;
    processFailures++;
    console.error('RUST PROC FAIL opts=' + JSON.stringify(opts) + ' err=' + e.message);
    for (let i = 0; i < scanInputs.length; i++) scannerAttempted++;
    continue;
  }
  scanProbeSpawns++;

  // Parse batch output through shared harness core
  let rustRows;
  try {
    rustRows = parseProbeOutput(rsOut);
  } catch (e) {
    if (e instanceof HarnessError) {
      transportFailures++;
      console.error('TRANSPORT FAIL opts=' + JSON.stringify(opts) + ' code=' + e.code + ' msg=' + e.message);
      for (let i = 0; i < scanInputs.length; i++) scannerAttempted++;
      continue;
    }
    throw e;
  }

  // Correlate by ID
  const expectedIds = scanInputs.map(function (_, i) { return i; });
  let rustMap;
  try {
    rustMap = correlateByIds(rustRows, expectedIds);
  } catch (e) {
    if (e instanceof HarnessError) {
      transportFailures++;
      console.error('CORRELATION FAIL opts=' + JSON.stringify(opts) + ' code=' + e.code + ' msg=' + e.message);
      for (let i = 0; i < scanInputs.length; i++) scannerAttempted++;
      continue;
    }
    throw e;
  }

  // Compare each case
  for (let i = 0; i < scanInputs.length; i++) {
    scannerAttempted++;
    const input = scanInputs[i];
    let jsState, rustState, jsErr;
    try {
      jsState = canonState(scan(input, opts));
    } catch (e) {
      jsErr = e;
    }
    if (jsErr) {
      scannerDivergences++;
      console.error('DIVERGE(scan-js-exception) input=' + JSON.stringify(input) + ' opts=' + JSON.stringify(opts) + ' jsErr=' + jsErr.message);
      continue;
    }
    const rustRow = rustMap.get(i);
    if (!rustRow || rustRow.kind !== 'ok') {
      transportFailures++;
      console.error('TRANSPORT FAIL input=' + JSON.stringify(input) + ' opts=' + JSON.stringify(opts) + ' row=' + JSON.stringify(rustRow));
      continue;
    }
    try {
      rustState = canonState(decState(rustRow.state));
    } catch (e) {
      transportFailures++;
      console.error('TRANSPORT FAIL (decode) input=' + JSON.stringify(input) + ' opts=' + JSON.stringify(opts) + ' err=' + e.message);
      continue;
    }
    scannerCompared++;
    try {
      compareStates(jsState, rustState);
      if (hasGlobstarToken(jsState)) globstarTokenComparisons++;
    } catch (e) {
      if (e instanceof HarnessError && e.code === ErrorCodes.SEMANTIC_DIVERGENCE) {
        scannerDivergences++;
        console.error('DIVERGE(scan-state) input=' + JSON.stringify(input) + ' opts=' + JSON.stringify(opts));
        console.error('  js=' + JSON.stringify(jsState));
        console.error('  rust=' + JSON.stringify(rustState));
      } else {
        throw e;
      }
    }
  }
}
console.log('  Scanner: attempted=' + scannerAttempted + ' compared=' + scannerCompared +
  ' divergences=' + scannerDivergences + ' probeSpawns=' + scanProbeSpawns);
console.log('');

// --- PARSER: batched JSONL via c0probe ---
console.log('[Parser C0/C1/C2 differential]');
const parserJsonl = parserInputs.map(function (p, i) {
  return JSON.stringify({ i: i, pattern: p, options: {} });
}).join('\n') + '\n';

const parserRef = path.join(__dirname, 'probe-c0.js');
const jsParserOut = execFileSync('node', [parserRef], { input: parserJsonl, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' });
const rsParserOut = execFileSync(C0_PROBE, [], { input: parserJsonl, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' });

const jsParserMap = new Map(jsParserOut.trim().split('\n').map(function (l) { const r = JSON.parse(l); return [r.i, r]; }));
const rsParserMap = new Map(rsParserOut.trim().split('\n').map(function (l) { const r = JSON.parse(l); return [r.i, r]; }));

const canonSort = function (v) {
  return Array.isArray(v) ? v.map(canonSort)
    : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(function (k) { return [k, canonSort(v[k])]; })) : v);
};
const eq = function (a, b) { return JSON.stringify(canonSort(a)) === JSON.stringify(canonSort(b)); };

for (let i = 0; i < parserInputs.length; i++) {
  parserAttempted++;
  const a = jsParserMap.get(i);
  const b = rsParserMap.get(i);
  if (!a || !b) {
    parserDivergences++;
    console.error('DIVERGE(parser-missing-row) i=' + i + ' input=' + JSON.stringify(parserInputs[i]));
    continue;
  }
  if (a.kind === 'error' || b.kind === 'error') {
    if (a.kind === 'error' && a.c0Owned === false) {
      parserSkippedUnsupported++;
      continue;
    }
    if (a.kind !== b.kind || a.class !== b.class || a.message !== b.message) {
      parserDivergences++;
      console.error('DIVERGE(parser-error) i=' + i + ' input=' + JSON.stringify(parserInputs[i]) +
        ' js=' + JSON.stringify({ kind: a.kind, class: a.class, message: a.message }) +
        ' rs=' + JSON.stringify({ kind: b.kind, class: b.class, message: b.message }));
    }
    // If they match, it's a compared case
    parserCompared++;
    continue;
  }
  parserCompared++;
  for (const f of ['input', 'prefix', 'dot']) {
    if (!eq(a[f], b[f])) {
      parserDivergences++;
      console.error('DIVERGE(parser-field:' + f + ') i=' + i + ' input=' + JSON.stringify(parserInputs[i]));
    }
  }
}
console.log('  Parser: attempted=' + parserAttempted + ' compared=' + parserCompared +
  ' skippedUnsupported=' + parserSkippedUnsupported + ' divergences=' + parserDivergences);
console.log('');

// --- coverage assertion ---
try {
  assertCoverage(globstarTokenComparisons, 'globstarTokens');
} catch (e) {
  console.error('COVERAGE FAILURE: no globstar-token comparisons executed');
  process.exit(1);
}

// --- summary ---
const totalCompared = scannerCompared + parserCompared;
const totalDivergences = scannerDivergences + parserDivergences;
console.log('=== INTEGRATION ATTACK SUMMARY ===');
console.log('Scanner: attempted=' + scannerAttempted + ' compared=' + scannerCompared + ' divergences=' + scannerDivergences + ' probeSpawns=' + scanProbeSpawns);
console.log('Parser: attempted=' + parserAttempted + ' compared=' + parserCompared + ' skippedUnsupported=' + parserSkippedUnsupported + ' divergences=' + parserDivergences);
console.log('Total compared: ' + totalCompared);
console.log('Total divergences: ' + totalDivergences);
console.log('Process failures: ' + processFailures);
console.log('Transport failures: ' + transportFailures);
console.log('Timeouts: ' + timeouts);
console.log('Globstar token comparisons: ' + globstarTokenComparisons);
console.log('Probe spawns: ' + scanProbeSpawns + ' (bounded by option combos: ' + scanOptionCombos.length + ')');
console.log('');

if (totalDivergences > 0 || processFailures > 0 || transportFailures > 0) {
  console.error('INTEGRATION ATTACK FAILED: ' + totalDivergences + ' divergences, ' + processFailures + ' process failures, ' + transportFailures + ' transport failures');
  process.exit(1);
} else {
  console.log('INTEGRATION ATTACK PASSED: ' + totalCompared + ' compared, 0 divergences, 0 process failures');
  process.exit(0);
}
