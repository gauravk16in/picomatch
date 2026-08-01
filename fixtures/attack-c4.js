'use strict';

/**
 * C4 differential attack harness — tests C4 fastpath gallery against Rust c4probe.
 * node fixtures/attack-c4.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parse = require(path.join(REF, 'lib', 'parse'));

const cases = [];
const add = (pattern, options) => cases.push({ i: cases.length, pattern, options: options || {} });

const patterns = [
  '*', '.*', '*.*', '*/*', '**', '**/*', '**/*.*', '**/.*',
  '*.js', '*.tar.gz', '*.a.b.c', '*.foo_bar',
  'foo.js', 'a/b/c', '*.js/bar', './a/b', './*.js',
  '***', '**/**', '**/**/**', '.**', '***.js'
];

patterns.forEach(p => {
  add(p, {});
  add(p, { dot: true });
  add(p, { bash: true });
  add(p, { capture: true });
  add(p, { noglobstar: true });
  add(p, { strictSlashes: true });
  add(p, { windows: true });
  add(p, { dot: true, windows: true, strictSlashes: true });
  add(p, { bash: true, capture: true, windows: true });
  add(p, { noglobstar: true, dot: true, windows: true });
  add(p, { maxLength: 5 });
  add(p, { maxLength: 1 });
  add(p, { maxLength: 0 });
});

console.log(`Generated ${cases.length} adversarial C4 attack cases.`);

// Build stdin JSONL for Rust c4probe
const inputJsonl = cases.map(c => JSON.stringify(c)).join('\n') + '\n';

// Run Rust c4probe
const probeBin = path.join(__dirname, '..', 'target', 'debug', 'examples', 'c4probe');
const rustStdout = execFileSync(probeBin, [], { input: inputJsonl, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

const rustRows = rustStdout.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

let pass = 0;
let fail = 0;

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const rust = rustRows[i];

  let jsRes;
  try {
    const s = parse.fastpaths(c.pattern, c.options);
    jsRes = { kind: 'ok', output: s === undefined ? null : s };
  } catch (err) {
    jsRes = { kind: 'error', class: err.constructor.name, message: err.message };
  }

  let diff = false;
  if (rust.kind !== jsRes.kind) {
    console.error(`FAIL case ${i} pattern "${c.pattern}": kind rust=${rust.kind} js=${jsRes.kind}`);
    diff = true;
  } else if (rust.kind === 'ok') {
    if (rust.output !== jsRes.output) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": output rust="${rust.output}" js="${jsRes.output}"`);
      diff = true;
    }
  } else if (rust.kind === 'error') {
    if (rust.class !== jsRes.class || rust.message !== jsRes.message) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": error rust=${rust.class}: "${rust.message}" js=${jsRes.class}: "${jsRes.message}"`);
      diff = true;
    }
  }

  if (diff) {
    fail++;
  } else {
    pass++;
  }
}

console.log(`C4 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C4 attack!`);
