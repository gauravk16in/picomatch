'use strict';

/**
 * Scanner corpus verifier — re-drives every case against the reference
 * checkout (../Main) `lib/scan.js` and byte-compares to the frozen corpus.
 * Proves the corpus is deterministic and faithful TODAY.
 *
 *   node fixtures/verify-scan.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'Main');
const scan = require(path.join(REF, 'lib', 'scan'));

const corpusPath = path.join(__dirname, 'scan_oracle.json');
const doc = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

const { enc, decOptions } = require('./canon-scan');

function canonState(s) {
  const out = {
    prefix: enc(s.prefix),
    input: enc(s.input),
    start: s.start,
    base: enc(s.base),
    glob: enc(s.glob),
    isBrace: s.isBrace === true,
    isBracket: s.isBracket === true,
    isGlob: s.isGlob === true,
    isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true,
    negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  if (s.tokens !== undefined) {
    out.tokens = s.tokens.map(function (t) {
      const tk = { value: enc(t.value), isGlob: t.isGlob === true };
      if (t.depth !== undefined) tk.depth = t.depth;
      if (t.backslashes === true) tk.backslashes = true;
      if (t.isBrace === true) tk.isBrace = true;
      if (t.isBracket === true) tk.isBracket = true;
      if (t.isExtglob === true) tk.isExtglob = true;
      if (t.isGlobstar === true) tk.isGlobstar = true;
      if (t.negated === true) tk.negated = true;
      if (t.isPrefix === true) tk.isPrefix = true;
      return tk;
    });
    out.maxDepth = s.maxDepth;
  }
  if (s.slashes !== undefined) out.slashes = s.slashes.slice();
  if (s.parts !== undefined) out.parts = s.parts.map(enc);
  return out;
}

function decStr(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && Array.isArray(v.__u16)) {
    return String.fromCharCode.apply(null, v.__u16);
  }
  return '';
}

let pass = 0;
for (const c of doc.cases) {
  const input = decStr(c.input);
  const opts = decOptions(c.options);
  const s = scan(input, opts);
  const actual = { kind: 'ok', state: canonState(s) };
  assert.deepStrictEqual(actual, c.expect, 'case ' + c.id + ' drifted');
  pass++;
}

const fresh = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
assert.deepStrictEqual(fresh, doc, 'corpus file unstable');
const sha = crypto
  .createHash('sha256')
  .update(fs.readFileSync(corpusPath))
  .digest('hex');
console.log(
  'verify-scan: ' +
    pass +
    '/' +
    doc.cases.length +
    ' cases deterministic, corpus sha256 ' +
    sha.slice(0, 12) +
    '…'
);