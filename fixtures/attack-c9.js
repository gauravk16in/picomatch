'use strict';

/**
 * C9 Differential Attack Suite — Pattern negation and `negate()`
 * Tests the leading ! parity algorithm, nonegate option, and interactions
 * with extglobs, globstar, and other options.
 *
 * node fixtures/attack-c9.js
 */

const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parsePath = require.resolve(path.join(REF, 'lib', 'parse'));
const parse = require(parsePath);

const { canonState, enc } = require('./canon');

const attackPatterns = [
  // Basic single negation
  { pattern: '!a', options: { fastpaths: false } },
  { pattern: '!abc', options: { fastpaths: false } },
  { pattern: '!a.js', options: { fastpaths: false } },
  { pattern: '!a/b', options: { fastpaths: false } },
  { pattern: '!a/b/c', options: { fastpaths: false } },

  // Double negation (even parity = non-negated)
  { pattern: '!!a', options: { fastpaths: false } },
  { pattern: '!!abc', options: { fastpaths: false } },
  { pattern: '!!a.js', options: { fastpaths: false } },

  // Triple negation (odd parity = negated)
  { pattern: '!!!a', options: { fastpaths: false } },
  { pattern: '!!!abc', options: { fastpaths: false } },

  // Quad and quint
  { pattern: '!!!!a', options: { fastpaths: false } },
  { pattern: '!!!!!a', options: { fastpaths: false } },
  { pattern: '!!!!!!a', options: { fastpaths: false } },

  // nonegate option: ! falls through to text
  { pattern: '!a', options: { fastpaths: false, nonegate: true } },
  { pattern: '!!a', options: { fastpaths: false, nonegate: true } },
  { pattern: '!!!a', options: { fastpaths: false, nonegate: true } },
  { pattern: '!abc', options: { fastpaths: false, nonegate: true } },

  // With extglob: !( should open extglob, not trigger negate()
  { pattern: '!(a)', options: { fastpaths: false } },
  { pattern: '!!(a)', options: { fastpaths: false } },
  { pattern: '!!!(a)', options: { fastpaths: false } },
  { pattern: '!(a|b)', options: { fastpaths: false } },
  { pattern: '!(*.js)', options: { fastpaths: false } },

  // With noextglob: !( should not open extglob
  { pattern: '!(a)', options: { fastpaths: false, noextglob: true } },
  { pattern: '!!(a)', options: { fastpaths: false, noextglob: true } },

  // Interaction with globstar
  { pattern: '!**', options: { fastpaths: false } },
  { pattern: '!!**', options: { fastpaths: false } },
  { pattern: '!**/*', options: { fastpaths: false } },
  { pattern: '!**/a', options: { fastpaths: false } },

  // Wildcards after negation
  { pattern: '!*', options: { fastpaths: false } },
  { pattern: '!!*', options: { fastpaths: false } },
  { pattern: '!!!*', options: { fastpaths: false } },
  { pattern: '!?', options: { fastpaths: false } },
  { pattern: '!!?', options: { fastpaths: false } },

  // Braces after negation
  { pattern: '!{a,b}', options: { fastpaths: false } },
  { pattern: '!!{a,b}', options: { fastpaths: false } },
  { pattern: '!{a,b,c}', options: { fastpaths: false } },

  // Brackets after negation
  { pattern: '![a-z]', options: { fastpaths: false } },
  { pattern: '!![a-z]', options: { fastpaths: false } },

  // Options interactions
  { pattern: '!a', options: { fastpaths: false, dot: true } },
  { pattern: '!!a', options: { fastpaths: false, dot: true } },
  { pattern: '!a', options: { fastpaths: false, capture: true } },
  { pattern: '!!a', options: { fastpaths: false, capture: true } },
  { pattern: '!a', options: { fastpaths: false, windows: true } },
  { pattern: '!!a', options: { fastpaths: false, windows: true } },
  { pattern: '!a', options: { fastpaths: false, bash: true } },
  { pattern: '!!a', options: { fastpaths: false, bash: true } },

  // Non-leading ! (should be literal text)
  { pattern: 'a!b', options: { fastpaths: false } },
  { pattern: 'a!!b', options: { fastpaths: false } },
  { pattern: 'a!!!b', options: { fastpaths: false } },
  { pattern: 'foo!.md', options: { fastpaths: false } },
  { pattern: '*!*.*', options: { fastpaths: false } },

  // Edge: just !
  { pattern: '!', options: { fastpaths: false } },
  { pattern: '!!', options: { fastpaths: false } },

  // Negation with rest being complex
  { pattern: '!foo/**/*.js', options: { fastpaths: false } },
  { pattern: '!foo/{a,b}/*.js', options: { fastpaths: false } },
  { pattern: '!.*', options: { fastpaths: false } },
  { pattern: '!!.*', options: { fastpaths: false } },
];

const cases = attackPatterns.map((c, i) => ({ i, pattern: c.pattern, options: c.options }));
console.log(`Generated ${cases.length} adversarial C9 attack cases.`);

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
    const jsOutput = jsState.output;
    if (rustOutputStr !== jsOutput) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": output rust=${JSON.stringify(rustOutputStr)} js=${JSON.stringify(jsOutput)}`);
      diff = true;
    }
    // Also check negated and start fields (key C9 fields)
    if (rust.negated !== jsState.negated) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": negated rust=${rust.negated} js=${jsState.negated}`);
      diff = true;
    }
    if (rust.start !== jsState.start) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": start rust=${rust.start} js=${jsState.start}`);
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

console.log(`C9 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C9 attack!`);
