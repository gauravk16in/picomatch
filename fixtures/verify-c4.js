'use strict';

/**
 * C4 corpus verifier — re-drives every c4 case against reference parse.fastpaths and
 * byte-compares. node fixtures/verify-c4.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');

const REF = process.env.PICOMATCH_REF || path.join(__dirname, '..', '..', 'picomatch-original');
const parse = require(path.join(REF, 'lib', 'parse'));

const corpusPath = path.join(__dirname, 'c4_oracle.json');
const doc = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

let pass = 0;
for (const c of doc.cases) {
  let actual;
  try {
    const res = parse.fastpaths(c.pattern, c.options || {});
    actual = { kind: 'ok', output: res === undefined ? null : res };
  } catch (err) {
    actual = { kind: 'error', class: err.constructor.name, message: err.message };
  }
  assert.deepStrictEqual(actual, c.expect, `case ${c.id} drifted`);
  pass++;
}

const sha = crypto.createHash('sha256').update(fs.readFileSync(corpusPath)).digest('hex');
console.log(`verify-c4: ${pass}/${doc.cases.length} cases deterministic, corpus sha256 ${sha.slice(0, 12)}…`);
