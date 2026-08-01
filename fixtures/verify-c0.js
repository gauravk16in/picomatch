'use strict';

/**
 * C0 corpus verifier — re-drives every case against the reference checkout and
 * byte-compares to the frozen corpus. Proves the corpus is deterministic and
 * faithful TODAY (before the Rust side exists).
 *
 * node fixtures/verify-c0.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'picomatch');
const parse = require(path.join(REF, 'lib', 'parse'));
const pm = require(REF);

const corpusPath = path.join(__dirname, 'c0_oracle.json');
const doc = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

const { canonState, decOptions } = require('./canon');

let pass = 0;
for (const c of doc.cases) {
  const input = c.jsOnly && c.pattern === undefined ? undefined : c.pattern;
  let actual;
  try {
    if (c.layer === 'adapter') {
      pm(c.pattern, c.options)('foo');
      actual = { kind: 'ok' };
    } else {
      const s = parse(c.jsOnly ? (c.id === 'guard.type.nonstring' ? 123 : input) : input, decOptions(c.options));
      actual = { kind: 'ok', utf16Length: (c.jsOnly ? '' : input).length, state: canonState(s) };
    }
  } catch (err) {
    actual = { kind: 'error', class: err.constructor.name, message: err.message };
  }
  assert.deepStrictEqual(actual, c.expect, `case ${c.id} drifted`);
  pass++;
}

const fresh = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
assert.deepStrictEqual(fresh, doc, 'corpus file unstable');
const sha = crypto.createHash('sha256').update(fs.readFileSync(corpusPath)).digest('hex');
console.log(`verify-c0: ${pass}/${doc.cases.length} cases deterministic, corpus sha256 ${sha.slice(0, 12)}…`);
