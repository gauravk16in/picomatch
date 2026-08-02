'use strict';

/**
 * C6 differential attack harness — tests C6 bracket and POSIX features against Rust c0probe.
 * node fixtures/attack-c6.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parse = require(path.join(REF, 'lib', 'parse'));
const { canonState, enc } = require('./canon');

const cases = [];
const add = (pattern, options) => cases.push({ i: cases.length, pattern, options: options || { fastpaths: false } });

// --- category: plain character classes ---
['[abc]', '[a-z]', '[0-9]', '[a-zA-Z0-9]', '[abc]/d', 'a/[abc]/b', '[a]'].forEach(p => add(p));

// --- category: negated character classes ---
['[^abc]', '[!abc]', '[^a-z]', '[!a-z]', '[^/]', '[!/]'].forEach(p => add(p));

// --- category: POSIX classes ---
['[[:alnum:]]', '[[:alpha:]]', '[[:digit:]]', '[[:space:]]', '[[:punct:]]', '[[:word:]]', '[[:xdigit:]]', '[[:lower:]]', '[[:upper:]]'].forEach(p => add(p));
['[[:foo:]]', '[[:alnum:]]/b', 'a/[[:digit:]]'].forEach(p => add(p));

// --- category: in-class escaping & special chars ---
['[\\^a]', '[\\]]', '[\\[]', '[-a]', '[a-]', '[-]', '[\\]-]'].forEach(p => add(p));

// --- category: options matrix ---
['[abc]', '[^abc]', '[!abc]', '[[:alnum:]]'].forEach(p => {
  add(p, { fastpaths: false, posix: true });
  add(p, { fastpaths: false, posix: false });
  add(p, { fastpaths: false, nobracket: true });
  add(p, { fastpaths: false, literalBrackets: true });
  add(p, { fastpaths: false, literalBrackets: false });
  add(p, { fastpaths: false, strictBrackets: true });
  add(p, { fastpaths: false, windows: true });
});

console.log(`Generated ${cases.length} adversarial C6 attack cases.`);

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
    const rustOutputStr = enc(String.fromCharCode(...rust.output));

    if (rust.start !== jsState.start) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": start rust=${rust.start} js=${jsState.start}`);
      diff = true;
    }
    if (rust.prefix !== jsState.prefix) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": prefix rust="${rust.prefix}" js="${jsState.prefix}"`);
      diff = true;
    }

    if (JSON.stringify(rustOutputStr) !== JSON.stringify(jsState.output)) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": output rust=${JSON.stringify(rustOutputStr)} js=${JSON.stringify(jsState.output)}`);
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

console.log(`C6 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C6 attack!`);
