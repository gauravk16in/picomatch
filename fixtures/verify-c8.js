'use strict';

/**
 * C8 corpus verifier — asserts 100% determinism of c8_oracle.json
 * node fixtures/verify-c8.js
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const REF = process.env.PICOMATCH_REF || path.join(__dirname, '..', '..', 'picomatch-original');
const origParse = require(path.join(REF, 'lib', 'parse'));
const { canonState, decOptions } = require('./canon');

const file = path.join(__dirname, 'c8_oracle.json');
const json = fs.readFileSync(file, 'utf8');
const doc = JSON.parse(json);

let count = 0;
for (const c of doc.cases) {
  count++;
  let actual;
  try {
    const s = origParse(c.pattern, decOptions(c.options));
    actual = { kind: 'ok', utf16Length: typeof c.pattern === 'string' ? c.pattern.length : 0, state: canonState(s) };
  } catch (err) {
    actual = { kind: 'error', class: err.constructor.name, message: err.message };
  }
  assert.deepStrictEqual(actual, c.expect, `Divergence on ${c.id} pattern=${JSON.stringify(c.pattern)}`);
}

const sha = require('crypto').createHash('sha256').update(json).digest('hex');
console.log(`verify-c8: ${count}/${doc.cases.length} cases deterministic, corpus sha256 ${sha.slice(0, 12)}…`);
