'use strict';

/**
 * C7 Differential Attack Suite — Parens, Extglobs, and ReDoS triage
 * Runs 61 adversarial extglob patterns through Rust c0probe vs V8 reference.
 *
 * node fixtures/attack-c7.js
 */

const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parsePath = require.resolve(path.join(REF, 'lib', 'parse'));
const parse = require(parsePath);

const { canonState, enc } = require('./canon');

const attackPatterns = [
  // Basic extglobs
  { pattern: '?(a|b)', options: { fastpaths: false } },
  { pattern: '!(a|b)', options: { fastpaths: false } },
  { pattern: '+(a|b)', options: { fastpaths: false } },
  { pattern: '@(a|b)', options: { fastpaths: false } },
  { pattern: '*(a|b)', options: { fastpaths: false } },

  // Capture option
  { pattern: '?(a|b)', options: { fastpaths: false, capture: true } },
  { pattern: '+(a|b)', options: { fastpaths: false, capture: true } },
  { pattern: '*(a|b)', options: { fastpaths: false, capture: true } },
  { pattern: '!(a|b)', options: { fastpaths: false, capture: true } },

  // Noextglob option
  { pattern: '?(a|b)', options: { fastpaths: false, noextglob: true } },
  { pattern: '!(a|b)', options: { fastpaths: false, noextglob: true } },
  { pattern: '+(a|b)', options: { fastpaths: false, noextglob: true } },
  { pattern: '*(a|b)', options: { fastpaths: false, noextglob: true } },

  // ReDoS Triage & Combinable safe output
  { pattern: '+(*(a)|*(b))', options: { fastpaths: false } },
  { pattern: '*(*(a)|*(b))', options: { fastpaths: false } },
  { pattern: '+(*(a)|*(b))', options: { fastpaths: false, capture: true } },
  { pattern: '+(*(a)|*(b))', options: { fastpaths: false, maxExtglobRecursion: false } },

  // Magic suffix & Negate recursion
  { pattern: '**/!(*.d).ts', options: { fastpaths: false } },
  { pattern: '**/!(*-dbg).@(js)', options: { fastpaths: false } },
  { pattern: '!(*.d).{ts,tsx}', options: { fastpaths: false } },

  // Nested extglobs
  { pattern: '?(a|+(b|*(c)))', options: { fastpaths: false } },
  { pattern: '!(a|!(b))', options: { fastpaths: false } },
  { pattern: '@(foo/*|bar/*)', options: { fastpaths: false } },

  // Pipe conditions
  { pattern: '(a|b|c|d)', options: { fastpaths: false } },
  { pattern: '@(a|b|c|d)', options: { fastpaths: false } },

  // Unclosed parens with strictBrackets
  { pattern: '(abc', options: { fastpaths: false } },
  { pattern: '(abc', options: { fastpaths: false, strictBrackets: true } },
  { pattern: 'abc)', options: { fastpaths: false } },
  { pattern: 'abc)', options: { fastpaths: false, strictBrackets: true } },

  // Edge cases with slashes inside extglobs
  { pattern: '!(foo/bar)', options: { fastpaths: false } },
  { pattern: '!(foo/bar)', options: { fastpaths: false, windows: true } },
  { pattern: '+(foo/bar|baz)', options: { fastpaths: false } },

  // Adversarial patterns
  { pattern: '+(' + 'a|'.repeat(10) + 'z)', options: { fastpaths: false } },
  { pattern: '*(a|b|c)?(d)', options: { fastpaths: false } },
  { pattern: '@(a)?(b)*(c)+(d)!(e)', options: { fastpaths: false } },
  { pattern: '*(a)*(*b)*(*c)', options: { fastpaths: false } },
  { pattern: '+(a)+(*b)+(*c)', options: { fastpaths: false } },
  { pattern: '!(a)!(*b)!(*c)', options: { fastpaths: false } },
  { pattern: '?(a)?(*b)?(*c)', options: { fastpaths: false } },
  { pattern: '@(a)@(*b)@(*c)', options: { fastpaths: false } },
  { pattern: '((a|b))', options: { fastpaths: false } },
  { pattern: '(((a)))', options: { fastpaths: false } },
  { pattern: '(?=foo)', options: { fastpaths: false } },
  { pattern: '(?!foo)', options: { fastpaths: false } },
  { pattern: '(?<=foo)', options: { fastpaths: false } },
  { pattern: '(?<!foo)', options: { fastpaths: false } },

  // Extra combinations
  { pattern: 'a/(b|c)/d', options: { fastpaths: false } },
  { pattern: 'a/!(b|c)/d', options: { fastpaths: false } },
  { pattern: 'a/*(b|c)/d', options: { fastpaths: false } },
  { pattern: 'a/+(b|c)/d', options: { fastpaths: false } },
  { pattern: 'a/?(b|c)/d', options: { fastpaths: false } },
  { pattern: 'a/@(b|c)/d', options: { fastpaths: false } },
  { pattern: '!(**/*)', options: { fastpaths: false } },
  { pattern: '+(*)', options: { fastpaths: false } },
  { pattern: '*(*)', options: { fastpaths: false } },
  { pattern: '?(*)', options: { fastpaths: false } },
  { pattern: '@(*)', options: { fastpaths: false } },
  { pattern: '!(*)', options: { fastpaths: false } },
  { pattern: '!(.)', options: { fastpaths: false } },
  { pattern: '!(..)', options: { fastpaths: false } },
  { pattern: '!(./*)', options: { fastpaths: false } }
];

const cases = attackPatterns.map((c, i) => ({ i, pattern: c.pattern, options: c.options }));
console.log(`Generated ${cases.length} adversarial C7 attack cases.`);

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

console.log(`C7 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C7 attack!`);
