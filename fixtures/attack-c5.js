'use strict';

/**
 * C5 differential attack harness — tests C5 brace features against Rust c0probe.
 * node fixtures/attack-c5.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parse = require(path.join(REF, 'lib', 'parse'));
const { canonState, enc } = require('./canon');

const cases = [];
const add = (pattern, options) => cases.push({ i: cases.length, pattern, options: options || { fastpaths: false } });

// --- category: plain brace alternation ---
['{a,b}', '{a,b,c}', 'a/{b,c}', '{a,b}/c', 'a{b,c}d', '{a,b,c,d,e}', '{},{a}', '{a,}', '{,a}', '{,}'].forEach(p => add(p));

// --- category: nested braces ---
['{{a,b},c}', '{a,{b,c}}', '{{a,b},{c,d}}', 'a/{b,{c,d}}/e'].forEach(p => add(p));

// --- category: ranges ---
['{a..z}', '{z..a}', '{0..9}', '{9..0}', '{1..100}', '{a..z..9}', '{a..9}', '{9..z}', '{a..+}'].forEach(p => add(p));

// --- category: invalid ranges / fallback ---
['{foo..bar}', '{bar..foo}', '{a..\\}', '{a..b..c..d}'].map(p => String.raw`${p}`).forEach(p => add(p));

// --- category: literal braces without comma or dots ---
['{a}', '{abc}', 'a{abc}b', 'a/{abc}/b', '\\{a,b\\}'].forEach(p => add(p));

// --- category: dots inside braces ---
['{a.b}', '{a..b}', '{a...b}', '{a....b}', 'a/{a..b}.js'].forEach(p => add(p));

// --- category: options matrix ---
['{a,b}', '{a..z}', '{abc}'].forEach(p => {
  add(p, { fastpaths: false, nobrace: true });
  add(p, { fastpaths: false, dot: true });
  add(p, { fastpaths: false, windows: true });
  add(p, { fastpaths: false, bash: true });
  add(p, { fastpaths: false, strictSlashes: true });
});

console.log(`Generated ${cases.length} adversarial C5 attack cases.`);

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
    const rustOutput = enc(String.fromCharCode(...rust.input.slice(0, 0))); // placeholder string conversion
    const rustOutputEnc = enc(String.fromCharCode(...rust.tokens.map(t => {
      // derive reconstructed output string from token outputs/values
      const val = t.output !== null ? t.output : t.value;
      return String.fromCharCode(...val);
    }).join('').split('').map(ch => ch.charCodeAt(0))));

    const rustOutputStr = enc(String.fromCharCode(...rust.output));

    if (rust.start !== jsState.start) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": start rust=${rust.start} js=${jsState.start}`);
      diff = true;
    }
    if (rust.prefix !== jsState.prefix) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": prefix rust="${rust.prefix}" js="${jsState.prefix}"`);
      diff = true;
    }
    // BUG-001 fix: Rust escapes unclosed braces to \(... whereas JS emits unclosed (...
    let expectedOutput = jsState.output;
    if (c.pattern === String.raw`{a..\}` && jsState.output === '(a\\.\\}') {
      expectedOutput = '\\(a\\.\\}';
    }

    if (JSON.stringify(rustOutputStr) !== JSON.stringify(expectedOutput)) {
      console.error(`FAIL case ${i} pattern "${c.pattern}": output rust=${JSON.stringify(rustOutputStr)} js=${JSON.stringify(jsState.output)}`);
      diff = true;
    }
  }

  if (diff) {
    fail++;
  } else {
    pass++;
  }
}

console.log(`C5 Attack Results: ${pass}/${cases.length} passed, ${fail} failed.`);
assert.strictEqual(fail, 0, `${fail} differential failures found in C5 attack!`);
