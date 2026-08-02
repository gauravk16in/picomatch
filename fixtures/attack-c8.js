'use strict';

/**
 * C8 Differential Attack Suite — Globstar machinery and push demotion
 * Runs 60 adversarial globstar patterns through Rust c0probe vs V8 reference.
 *
 * node fixtures/attack-c8.js
 */

const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parsePath = require.resolve(path.join(REF, 'lib', 'parse'));
const parse = require(parsePath);

const { canonState, enc } = require('./canon');

const attackPatterns = [
  // Basic globstar patterns
  { pattern: '**', options: { fastpaths: false } },
  { pattern: '**/*', options: { fastpaths: false } },
  { pattern: 'a/**', options: { fastpaths: false } },
  { pattern: '**/a', options: { fastpaths: false } },
  { pattern: 'a/**/b', options: { fastpaths: false } },
  { pattern: 'a/**/b/**/c', options: { fastpaths: false } },

  // Strict slashes
  { pattern: 'a/**', options: { fastpaths: false, strictSlashes: true } },
  { pattern: 'a/**/b', options: { fastpaths: false, strictSlashes: true } },

  // Windows path separators
  { pattern: 'a/**/b', options: { fastpaths: false, windows: true } },
  { pattern: 'a/**/b/**', options: { fastpaths: false, windows: true } },

  // Bash mode
  { pattern: '**', options: { fastpaths: false, bash: true } },
  { pattern: 'a/**', options: { fastpaths: false, bash: true } },
  { pattern: 'a/**/b', options: { fastpaths: false, bash: true } },

  // Noglobstar mode
  { pattern: '**', options: { fastpaths: false, noglobstar: true } },
  { pattern: 'a/**', options: { fastpaths: false, noglobstar: true } },
  { pattern: 'a/**/b', options: { fastpaths: false, noglobstar: true } },

  // Consecutive /**/ collapsing
  { pattern: 'a/**/**/b', options: { fastpaths: false } },
  { pattern: 'a/**/**/**/b', options: { fastpaths: false } },
  { pattern: 'a/**/**/**/**/b', options: { fastpaths: false } },

  // Mid-segment / partial globstar (demotion)
  { pattern: 'a**b', options: { fastpaths: false } },
  { pattern: 'a**', options: { fastpaths: false } },
  { pattern: '**b', options: { fastpaths: false } },
  { pattern: 'a/**b', options: { fastpaths: false } },
  { pattern: 'a/**b/c', options: { fastpaths: false } },

  // Combinations with extglobs and braces
  { pattern: 'a/**/{b,c}', options: { fastpaths: false } },
  { pattern: 'a/**/@(b|c)', options: { fastpaths: false } },
  { pattern: 'a/**/!(b|c)', options: { fastpaths: false } },

  // Edge case globstar positioning
  { pattern: '/**', options: { fastpaths: false } },
  { pattern: '/**/', options: { fastpaths: false } },
  { pattern: '/**/a', options: { fastpaths: false } },
  { pattern: '/**/a/**', options: { fastpaths: false } },

  // Dot option interactions
  { pattern: '**', options: { fastpaths: false, dot: true } },
  { pattern: 'a/**', options: { fastpaths: false, dot: true } },
  { pattern: 'a/**/b', options: { fastpaths: false, dot: true } },

  // Capture option with globstars
  { pattern: '**', options: { fastpaths: false, capture: true } },
  { pattern: 'a/**', options: { fastpaths: false, capture: true } },
  { pattern: 'a/**/b', options: { fastpaths: false, capture: true } },

  // More adversarial combinations
  { pattern: '***', options: { fastpaths: false } },
  { pattern: '****', options: { fastpaths: false } },
  { pattern: 'a/***', options: { fastpaths: false } },
  { pattern: 'a/****', options: { fastpaths: false } },
  { pattern: 'a/**/*', options: { fastpaths: false } },
  { pattern: 'a/**/b/*', options: { fastpaths: false } },
  { pattern: 'a/**/b*c', options: { fastpaths: false } },
  { pattern: 'a/**/b*c/d', options: { fastpaths: false } },
  { pattern: 'a/b**/c', options: { fastpaths: false } },
  { pattern: 'a/b**c/d', options: { fastpaths: false } },
  { pattern: 'foo/**/bar/**/*.js', options: { fastpaths: false } },
  { pattern: 'foo/**/bar/**/*.js', options: { fastpaths: false, windows: true } },
  { pattern: 'foo/**/bar/**/*.js', options: { fastpaths: false, strictSlashes: true } },
  { pattern: 'foo/**/bar/**/*.js', options: { fastpaths: false, bash: true } },
  { pattern: './**', options: { fastpaths: false } },
  { pattern: './**/a', options: { fastpaths: false } },
  { pattern: './a/**', options: { fastpaths: false } },
  { pattern: './a/**/b', options: { fastpaths: false } },
  { pattern: 'foo/bar/**', options: { fastpaths: false } },
  { pattern: 'foo/bar/**/baz', options: { fastpaths: false } },
  { pattern: 'foo/bar/**/baz/**', options: { fastpaths: false } },
  { pattern: 'foo/bar/**/baz/**/qux', options: { fastpaths: false } }
];

const cases = attackPatterns.map((c, i) => ({ i, pattern: c.pattern, options: c.options }));
console.log(`Generated ${cases.length} adversarial C8 attack cases.`);

const inputJsonl = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
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
    const rustOutputStr = enc(String.fromCharCode(...rust.output));
    if (rustOutputStr !== jsState.output) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": output rust="${JSON.stringify(rustOutputStr)}" js="${JSON.stringify(jsState.output)}"`);
      diff = true;
    }
  } else if (rust.kind === 'error') {
    if (jsState.kind !== 'error') {
      console.error(`FAIL case ${i} pattern "${c.pattern}": rust threw error but JS passed`);
      diff = true;
    }
  }

  if (diff) {
    fail++;
  } else {
    pass++;
  }
}

console.log(`C8 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C8 attack!`);
