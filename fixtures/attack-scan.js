'use strict';

/**
 * Scanner adversarial differential harness — drives BOTH the JS reference
 * (../Main/lib/scan.js) and the Rust scanprobe binary over a generated set
 * of adversarial inputs, then byte-compares the full structured result.
 *
 *   node fixtures/attack-scan.js
 *
 * Requires `cargo build --example scanprobe` first.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'Main');
const scan = require(path.join(REF, 'lib', 'scan'));

const PROBE = path.join(
  __dirname,
  '..',
  'target',
  'debug',
  'examples',
  process.platform === 'win32' ? 'scanprobe.exe' : 'scanprobe'
);

if (!fs.existsSync(PROBE)) {
  throw new Error(
    '[attack-scan] scanprobe not found at ' +
      PROBE +
      '. Run `cargo build --example scanprobe`.'
  );
}

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
      if (t.isGlobstar === true) tok.isGlobstar = true;
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
  if (t.isGlobstar === true) tk.isGlobstar = true;
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
    if (input.charCodeAt(i) > 0x7f) {
      isAscii = false;
      break;
    }
  }
  if (!isAscii) {
    encInput = {
      __u16: Array.from({ length: input.length }, function (_, i) {
        return input.charCodeAt(i);
      }),
    };
  }
  const line =
    JSON.stringify({ i: 0, input: encInput, options: opts || {} }) + '\n';
  const res = spawnSync(PROBE, [], {
    input: line,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(
      '[attack-scan] scanprobe exited ' +
        res.status +
        ': ' +
        (res.stderr || '(no stderr)')
    );
  }
  const lines = res.stdout.split(/\r?\n/).filter(function (l) {
    return l.trim();
  });
  if (lines.length === 0) throw new Error('[attack-scan] no output');
  const row = JSON.parse(lines[lines.length - 1]);
  if (row.probeError) throw new Error('[attack-scan] probeError ' + row.probeError);
  return decState(row.state);
}

// --- adversarial input generation (deterministic, seeded)
const chars = 'abcdefghijk/.{}[]()!@+*?,$\\^|~';
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
function genInput(maxLen) {
  const len = 1 + Math.floor(rng() * maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(rng() * chars.length)];
  }
  return s;
}

const inputs = [];
for (let i = 0; i < 300; i++) inputs.push(genInput(20));
// a few long backslash runs and nested braces (complexity edges)
for (let i = 0; i < 50; i++) {
  let s = '';
  for (let j = 0; j < 40; j++) s += '\\';
  inputs.push(s);
}
for (let i = 0; i < 50; i++) {
  let s = '';
  for (let j = 0; j < 20; j++) s += '{';
  for (let j = 0; j < 20; j++) s += '}';
  inputs.push(s);
}
// max-length-ish plain
let big = '';
for (let i = 0; i < 1000; i++) big += 'a';
inputs.push(big);

const optionCombos = [
  {},
  { parts: true },
  { tokens: true },
  { scanToEnd: true },
  { noext: true },
  { nonegate: true },
  { noparen: true },
  { unescape: true },
];

const assert = require('assert');
let divergences = 0;
let compared = 0;
let panics = 0;
for (const input of inputs) {
  for (const opts of optionCombos) {
    compared++;
    let jsState, rustState, jsErr, rustErr;
    try {
      jsState = canonState(scan(input, opts));
    } catch (e) {
      jsErr = e.message;
    }
    try {
      rustState = canonState(rustScan(input, opts));
    } catch (e) {
      rustErr = e.message;
    }
    if (jsErr || rustErr) {
      if (jsErr !== rustErr) {
        divergences++;
        console.error(
          'DIVERGE (error) input=' +
            JSON.stringify(input) +
            ' opts=' +
            JSON.stringify(opts) +
            ' js=' +
            jsErr +
            ' rust=' +
            rustErr
        );
      }
      continue;
    }
    try {
      assert.deepStrictEqual(rustState, jsState);
    } catch (e) {
      divergences++;
      console.error(
        'DIVERGE (state) input=' +
          JSON.stringify(input) +
          ' opts=' +
          JSON.stringify(opts) +
          '\n  js=' +
          JSON.stringify(jsState) +
          '\n  rust=' +
          JSON.stringify(rustState)
      );
    }
  }
}

console.log(
  'attack-scan: inputs=' +
    inputs.length +
    ' compared=' +
    compared +
    ' divergences=' +
    divergences +
    ' panics=' +
    panics
);
if (divergences > 0) process.exit(1);