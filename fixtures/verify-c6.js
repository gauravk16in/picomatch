'use strict';

/**
 * C6 corpus verifier — re-drives every c6 case against the reference and
 * byte-compares. node fixtures/verify-c6.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parse = require(path.join(REF, 'lib', 'parse'));
const { canonState, decOptions } = require('./canon');

const corpusPath = path.join(__dirname, 'c6_oracle.json');
const doc = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

let pass = 0;
for (const c of doc.cases) {
  let actual;
  try {
    const s = parse(c.pattern, decOptions(c.options));
    actual = { kind: 'ok', utf16Length: typeof c.pattern === 'string' ? c.pattern.length : 0, state: canonState(s) };
  } catch (err) {
    actual = { kind: 'error', class: err.constructor.name, message: err.message };
  }
  assert.deepStrictEqual(actual, c.expect, `case ${c.id} drifted`);
  pass++;
}

const sha = crypto.createHash('sha256').update(fs.readFileSync(corpusPath)).digest('hex');
console.log(`verify-c6: ${pass}/${doc.cases.length} cases deterministic, corpus sha256 ${sha.slice(0, 12)}…`);
