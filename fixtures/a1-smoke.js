'use strict';

/**
 * A1 smoke test — `pmx --serve` subprocess adapter.
 * Sends parse+scan ops from the frozen corpora to one long-lived `pmx --serve`
 * process and byte-compares adapter answers against the reference projection.
 *
 * node fixtures/a1-smoke.js
 */

const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'Main');
const parse = require(path.join(REF, 'lib', 'parse'));
const scanRef = require(path.join(REF, 'lib', 'scan'));
const { enc, decOptions } = require('./canon');

const BIN = path.join(__dirname, '..', 'target', 'debug', 'pmx');

// sample: 15 c1 parse rows + 15 c3 parse rows + 20 scan rows
const c1 = require('./c1_oracle.json').cases.filter(c => c.active).slice(0, 15);
const c3 = require('./c3_oracle.json').cases.filter(c => c.active).slice(0, 15);
const scanCases = require('./scan_oracle.json').cases.slice(0, 20);

const requests = [];
let i = 0;
for (const c of [...c1, ...c3]) requests.push({ i: i++, op: 'parse', pattern: c.pattern, options: c.options });
for (const c of scanCases) requests.push({ i: i++, op: 'scan', pattern: c.pattern ?? c.input, options: c.options || {} });

// normalize any string/encoded form to a u16 unit ARRAY (adapter answers are arrays)
const unitsOf = v => {
  if (v == null) return v;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return Array.from({ length: v.length }, (_, k) => v.charCodeAt(k));
  if (typeof v === 'object' && Array.isArray(v.__u16)) return v.__u16;
  return v;
};

const input = requests.map(r => JSON.stringify(r)).join('\n') + '\n';
const res = spawnSync(BIN, ['--serve'], { input, encoding: 'utf8', maxBuffer: 1 << 26 });
if (res.status !== 0) { console.error('pmx --serve failed:', res.stderr.slice(0, 500)); process.exit(1); }
const answers = res.stdout.trim().split('\n').map(line => JSON.parse(line));
assert.strictEqual(answers.length, requests.length, `answer count ${answers.length} != requests ${requests.length}`);

const jsParse = (pattern, options) => {
  try {
    const s = parse(pattern, decOptions(options));
    return {
      kind: 'ok', output: unitsOf(enc(s.output)), negated: s.negated,
      class: null, message: null
    };
  } catch (err) {
    return { kind: 'error', class: err.constructor.name, message: err.message };
  }
};

const jsScan = (pattern, options) => {
  try {
    const s = scanRef(pattern, decOptions(options));
    const canon = {
      kind: 'ok',
      prefix: s.prefix, input: s.input, start: s.start, base: s.base, glob: s.glob,
      isBrace: s.isBrace, isBracket: s.isBracket, isGlob: s.isGlob, isExtglob: s.isExtglob,
      isGlobstar: s.isGlobstar, negated: s.negated, negatedExtglob: s.negatedExtglob
    };
    if (s.slashes) canon.slashes = s.slashes;
    if (s.parts) canon.parts = s.parts;
    if (s.tokens) canon.tokens = s.tokens.map(t => ({ value: t.value, depth: t.depth === Infinity ? 'Infinity' : t.depth, isGlob: t.isGlob }));
    if (s.maxDepth !== undefined) canon.maxDepth = s.maxDepth;
    return canon;
  } catch (err) {
    return { kind: 'error', class: err.constructor.name, message: err.message };
  }
};

let pass = 0, fail = 0;
for (let k = 0; k < requests.length; k++) {
  const req = requests[k], ans = answers[k];
  let ok = true, detail = '';
  if (req.op === 'parse') {
    const exp = jsParse(req.pattern, req.options);
    const got = { kind: ans.kind, output: unitsOf(ans.output), negated: ans.negated, class: ans.class ?? null, message: ans.message ?? null };
    try { assert.deepStrictEqual(got, exp); } catch (e) { ok = false; detail = 'parse mismatch'; }
  } else {
    const exp = jsScan(req.pattern, req.options);
    const got = {
      kind: ans.kind,
      prefix: ans.prefix, input: ans.input, start: ans.start, base: ans.base, glob: ans.glob,
      isBrace: ans.isBrace, isBracket: ans.isBracket, isGlob: ans.isGlob, isExtglob: ans.isExtglob,
      isGlobstar: ans.isGlobstar, negated: ans.negated, negatedExtglob: ans.negatedExtglob
    };
    if (ans.slashes !== null && ans.slashes !== undefined) got.slashes = ans.slashes;
    if (ans.parts !== null && ans.parts !== undefined) got.parts = ans.parts;
    if (ans.tokens !== null && ans.tokens !== undefined) got.tokens = ans.tokens.map(t => ({ value: t.value, depth: t.depth, isGlob: t.isGlob }));
    if (ans.maxDepth !== null && ans.maxDepth !== undefined) got.maxDepth = ans.maxDepth;
    if (exp.kind === 'error') { got.class = ans.class; got.message = ans.message; }
    try { assert.deepStrictEqual(got, exp); } catch (e) { ok = false; detail = `scan mismatch: ${e.message.slice(0, 150)}`; }
  }
  if (ok) pass++; else { fail++; if (fail <= 5) console.log(`FAIL [${req.op}] ${JSON.stringify(req.pattern)} ${detail}`); }
}

// liveness
const ping = spawnSync(BIN, ['--serve'], { input: '{"op":"ping"}\n', encoding: 'utf8' });
const pong = JSON.parse(ping.stdout.trim());
assert.strictEqual(pong.op, 'ping', 'ping op answer');
const ver = spawnSync(BIN, ['--version'], { encoding: 'utf8' });
assert.match(ver.stdout.trim(), /^pmx \d+\.\d+\.\d+$/, 'pmx --version shape');

console.log(`a1-smoke: ${requests.length} requests | parse+scan pass: ${pass} | fail: ${fail} | ping+version ok`);
process.exitCode = fail === 0 ? 0 : 1;
