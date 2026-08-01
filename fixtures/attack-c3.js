'use strict';

/**
 * C3 differential attack harness — tests C3 wildcard surface against Rust c0probe.
 * node fixtures/attack-c3.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'picomatch');
const parse = require(path.join(REF, 'lib', 'parse'));
const { canonState } = require('./canon');

const cases = [];
const add = (pattern, options) => cases.push({ i: cases.length, pattern, options: options || { fastpaths: false } });

// --- category: qmark variants ---
['?', '??', '???', 'a?', '?a', 'a?b', './?', 'a/?', '?/a', 'a/?/b', '.?', '?.', 'a.?', '?.a'].forEach(p => add(p));
['?', 'a?', '?/a', '.?'].forEach(p => {
  add(p, { fastpaths: false, dot: true });
  add(p, { fastpaths: false, dot: false });
  add(p, { fastpaths: false, windows: true });
});

// --- category: star variants ---
['*', 'a*', '*a', 'a*b', './*', 'a/*', '*/a', 'a/*/b', '.*', '*.', 'a.*', '*.a'].forEach(p => add(p));
['*', 'a*', '*/a', '.*'].forEach(p => {
  add(p, { fastpaths: false, dot: true });
  add(p, { fastpaths: false, dot: false });
  add(p, { fastpaths: false, bash: true });
  add(p, { fastpaths: false, capture: true });
  add(p, { fastpaths: false, windows: true });
  add(p, { fastpaths: false, strictSlashes: true });
});

// --- category: plus variants ---
['+', 'a+', '+a', 'a+b', './+', 'a/+', '+/a'].forEach(p => add(p));
['+', 'a+'].forEach(p => {
  add(p, { fastpaths: false, regex: false });
  add(p, { fastpaths: false, regex: true });
});

// --- category: lookaround and parens qmark ---
['(?)', '(?=a)', '(?!a)', '(?<=a)', '(?<!a)', '(?<name>a)', '(?<a)'].forEach(p => add(p));

// Cap at 300 cases
cases.splice(300);

console.log(`Generated ${cases.length} adversarial C3 attack cases.`);

// Build stdin JSONL for Rust c0probe
const inputJsonl = cases.map(c => JSON.stringify(c)).join('\n') + '\n';

// Run Rust c0probe
const probeBin = path.join(__dirname, '..', 'target', 'debug', 'examples', 'c0probe');
const rustStdout = execFileSync(probeBin, [], { input: inputJsonl, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

const rustRows = rustStdout.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

let pass = 0;
let fail = 0;

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const rust = rustRows[i];

  let jsState;
  try {
    const s = parse(c.pattern, c.options);
    jsState = canonState(s);
  } catch (err) {
    jsState = { kind: 'error', class: err.constructor.name, message: err.message };
  }

  let diff = false;
  if (rust.kind === 'ok') {
    const jsStart = jsState.start;
    const jsPrefix = jsState.prefix;

    if (rust.start !== jsStart) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": start rust=${rust.start} js=${jsStart}`);
      diff = true;
    }
    if (rust.prefix !== jsPrefix) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": prefix rust="${rust.prefix}" js="${jsPrefix}"`);
      diff = true;
    }
  }

  if (diff) {
    fail++;
  } else {
    pass++;
  }
}

console.log(`C3 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C3 attack!`);
