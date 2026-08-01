'use strict';

/**
 * C2 differential attack harness — tests C2 surface against Rust c0probe.
 * node fixtures/attack-c2.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'picomatch');
const parse = require(path.join(REF, 'lib', 'parse'));
const { canonState } = require('./canon');

const cases = [];
const add = (pattern, options) => cases.push({ i: cases.length, pattern, options: options || { fastpaths: false } });

// --- category: dot / slash combinations ---
['.', '..', '...', '....', '/', '//', '///', '////', './', './.', '././', '././.', './a', '././a', './a/b', './a/./b'].forEach(p => add(p));
['a/b', 'a//b', 'a///b', 'a/./b', 'a/../b', 'a/../../b', 'a.b', 'a..b', 'a...b', 'a.b.c', 'a.b/c.d', 'a/b.c/d'].forEach(p => add(p));
['/a', '//a', 'a/', 'a//', '/a/', '//a//', '/a/b/', './a/', './a/b/'].forEach(p => add(p));
['.a', '..a', '...a', '.a.b', '.a/b', 'a/.b', 'a/..b', 'a/.b/c'].forEach(p => add(p));

// --- category: escaped dots and slashes ---
['a\\.b', 'a\\\\.b', 'a\\/b', 'a\\\\/b', '\\.a', '\\/a', 'a/\\.', 'a/\\/'].forEach(p => add(p));
['a\\.b', 'a\\/b'].forEach(p => add(p, { fastpaths: false, bash: true }));
['a\\.b', 'a\\/b'].forEach(p => add(p, { fastpaths: false, unescape: true }));

// --- category: windows option variants ---
['.', '..', './a', 'a/b', 'a/./b', 'a.b', 'a//b', 'a\\b'].forEach(p => {
  add(p, { fastpaths: false, windows: true });
  add(p, { fastpaths: false, windows: false });
});

// --- category: dot option variants ---
['.', '..', './a', 'a/b', 'a.b', '.a'].forEach(p => {
  add(p, { fastpaths: false, dot: true });
  add(p, { fastpaths: false, dot: false });
});

// Cap at 250 cases for fast execution
cases.splice(250);

console.log(`Generated ${cases.length} adversarial C2 attack cases.`);

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

  // Compare Rust vs JS projection
  let diff = false;
  if (rust.kind === 'ok') {
    const jsStart = jsState.start;
    const jsPrefix = jsState.prefix;
    const jsOutput = jsState.output;

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

console.log(`C2 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C2 attack!`);
