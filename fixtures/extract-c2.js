'use strict';

/**
 * C2 corpus extractor — segment semantics: slash handling, dot handling,
 * and leading "./" collapse (lib/parse.js:L975-L991, L997-L1015).
 * node fixtures/extract-c2.js → fixtures/c2_oracle.json
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REF = path.join(__dirname, '..', '..', 'picomatch');
const parse = require(path.join(REF, 'lib', 'parse'));

const { canonState } = require('./canon');

const SLOW = { fastpaths: false };

const CASES = [
  // ---- slash & dot segment family ----
  { id: 'c2.dotslash.lead', pattern: './a', options: SLOW, note: 'leading ./ collapse via main loop' },
  { id: 'c2.dotslash.lead.multi', pattern: '././a', options: SLOW, note: 'double ./: first by removePrefix, second by main loop slash_branch' },
  { id: 'c2.dotslash.only', pattern: './', options: SLOW, note: 'leading ./ only' },
  { id: 'c2.dotslash.path', pattern: './a/b', options: SLOW, note: 'leading ./ with slash segment' },
  { id: 'c2.dot.single', pattern: '.', options: SLOW, note: 'single dot at bos -> type dot' },
  { id: 'c2.dot.double', pattern: '..', options: SLOW, note: 'dotdot at bos -> [dot, text]' },
  { id: 'c2.dot.triple', pattern: '...', options: SLOW, note: '3 dots -> [dot, text("..")]' },
  { id: 'c2.slash.lead', pattern: '/a', options: SLOW, note: 'leading slash' },
  { id: 'c2.slash.trail', pattern: 'a/', options: SLOW, note: 'trailing slash' },
  { id: 'c2.slash.mid', pattern: 'a/b', options: SLOW, note: 'mid-path slash' },
  { id: 'c2.slash.double', pattern: 'a//b', options: SLOW, note: 'consecutive slashes' },
  { id: 'c2.dot.mid', pattern: 'a.b', options: SLOW, note: 'dot in text segment -> merged text' },
  { id: 'c2.dotslash.mid', pattern: 'a/./b', options: SLOW, note: 'mid-path ./ does NOT collapse (index > start+1)' },
  { id: 'c2.dotdot.mid', pattern: 'a/../b', options: SLOW, note: 'mid-path ..' },
  { id: 'c2.escape.dot', pattern: 'a\\.b', options: SLOW, note: 'escaped dot dropped by escape_branch, processed by dot_branch' },
  { id: 'c2.escape.slash.bash', pattern: 'a\\/b', options: { ...SLOW, bash: true }, note: 'escaped slash in bash mode' },
  { id: 'c2.windows.slash', pattern: 'a/b', options: { ...SLOW, windows: true }, note: 'slash_literal on windows' },
  { id: 'c2.windows.dot', pattern: 'a.b', options: { ...SLOW, windows: true }, note: 'dot_literal on windows' },
];

const runCase = c => {
  try {
    const s = parse(c.pattern, c.options || {});
    return { kind: 'ok', utf16Length: c.pattern.length, state: canonState(s) };
  } catch (err) {
    return { kind: 'error', class: err.constructor.name, message: err.message };
  }
};

const rows = CASES.map(c => ({
  id: c.id,
  chunk: c.chunk == null ? 2 : c.chunk,
  layer: 'core',
  jsOnly: false,
  active: (c.chunk == null ? 2 : c.chunk) <= 2,
  pattern: c.pattern,
  options: c.options || {},
  assert: c.assert,
  note: c.note,
  expect: runCase(c)
}));

const doc = {
  meta: {
    corpus: 'c2-segments',
    generator: 'fixtures/extract-c2.js',
    reference: path.join('..', 'picomatch') + ' (read-only checkout)',
    picomatchVersion: require(path.join(REF, 'package.json')).version,
    fieldPolicy: 'u16-unit sequences for emitted text (canon.js); assert-all when no assert list'
  },
  cases: rows
};

const json = JSON.stringify(doc, null, 1) + '\n';
const out = path.join(__dirname, 'c2_oracle.json');
fs.writeFileSync(out, json);
const sha = crypto.createHash('sha256').update(json).digest('hex');
process.stderr.write(`wrote ${out}\nsha256 ${sha}\ncases ${rows.length}\n`);
