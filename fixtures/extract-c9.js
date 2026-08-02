'use strict';

/**
 * C9 corpus extractor — Pattern negation (`!`) and `negate()`
 * (lib/parse.js:L457-L473, L1061-L1065).
 *
 * node fixtures/extract-c9.js → fixtures/c9_oracle.json
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Mocha = require('mocha');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parsePath = require.resolve(path.join(REF, 'lib', 'parse'));
const origParse = require(parsePath);

const { canonState, encOptions } = require('./canon');

const captured = [];
const seen = new Set();

function addCase(pattern, options, sourceFile) {
  const opts = { fastpaths: false, ...(options || {}) };
  const key = JSON.stringify({ pattern, options: opts });
  if (!seen.has(key)) {
    seen.add(key);
    captured.push({ pattern, options: opts, sourceFile });
  }
}

require.cache[parsePath].exports = function(pattern, options) {
  addCase(pattern, options, 'mocha');
  return origParse.call(this, pattern, options);
};
Object.assign(require.cache[parsePath].exports, origParse);

function SilentReporter(runner) {}

const mocha = new Mocha({ reporter: SilentReporter });
const testFiles = [
  'negation.js',
  'options.js',
  'bash.js',
];
testFiles.forEach(file => {
  const filePath = path.join(REF, 'test', file);
  if (fs.existsSync(filePath)) {
    mocha.addFile(filePath);
  }
});

mocha.run(() => {
  require.cache[parsePath].exports = origParse;

  // Also add manual negate-specific cases
  const manualCases = [
    // Basic leading ! negation
    { pattern: '!a', options: { fastpaths: false } },
    { pattern: '!!a', options: { fastpaths: false } },
    { pattern: '!!!a', options: { fastpaths: false } },
    { pattern: '!!!!a', options: { fastpaths: false } },
    { pattern: '!!!!!a', options: { fastpaths: false } },
    // nonegate option
    { pattern: '!a', options: { fastpaths: false, nonegate: true } },
    { pattern: '!!a', options: { fastpaths: false, nonegate: true } },
    // With extglob interaction
    { pattern: '!!(a)', options: { fastpaths: false } },
    { pattern: '!!!(a)', options: { fastpaths: false } },
    // With globstar
    { pattern: '!**', options: { fastpaths: false } },
    { pattern: '!!**', options: { fastpaths: false } },
    { pattern: '!**/a', options: { fastpaths: false } },
    // Other options
    { pattern: '!a', options: { fastpaths: false, dot: true } },
    { pattern: '!a', options: { fastpaths: false, capture: true } },
    { pattern: '!a', options: { fastpaths: false, windows: true } },
    // mid-pattern ! (should be literal)
    { pattern: 'a!b', options: { fastpaths: false } },
    { pattern: 'a!!b', options: { fastpaths: false } },
    // Chains
    { pattern: '!{a,b}', options: { fastpaths: false } },
    { pattern: '![a-z]', options: { fastpaths: false } },
    { pattern: '!a.js', options: { fastpaths: false } },
    { pattern: '!!a.js', options: { fastpaths: false } },
    { pattern: '!!!a.js', options: { fastpaths: false } },
    { pattern: '!*', options: { fastpaths: false } },
    { pattern: '!!*', options: { fastpaths: false } },
    { pattern: '!!!*', options: { fastpaths: false } },
    { pattern: '!a/b', options: { fastpaths: false } },
    { pattern: '!a/b/c', options: { fastpaths: false } },
  ];
  for (const c of manualCases) {
    addCase(c.pattern, c.options, 'manual');
  }

  const runCase = c => {
    try {
      const s = origParse(c.pattern, c.options || {});
      return { kind: 'ok', utf16Length: typeof c.pattern === 'string' ? c.pattern.length : 0, state: canonState(s) };
    } catch (err) {
      return { kind: 'error', class: err.constructor.name, message: err.message };
    }
  };

  // Only include cases where pattern starts with '!' (negation patterns)
  // or has nonegate option (which is the other side of C9)
  const rows = captured
    .filter(c => {
      if (typeof c.pattern !== 'string') return false;
      return c.pattern.startsWith('!') || (c.options && c.options.nonegate);
    })
    .map((c, idx) => ({
      id: `c9.orig.${idx}`,
      chunk: 9,
      layer: 'core',
      jsOnly: false,
      active: true,
      pattern: c.pattern,
      options: encOptions(c.options || {}),
      note: `extracted from original test file ${c.sourceFile}`,
      expect: runCase(c)
    }));

  const doc = {
    meta: {
      corpus: 'c9-negation',
      generator: 'fixtures/extract-c9.js',
      reference: path.join('..', '..', 'picomatch-original') + ' (read-only checkout)',
      picomatchVersion: require(path.join(REF, 'package.json')).version,
      fieldPolicy: 'u16-unit sequences for emitted text (canon.js); assert-all when no assert list'
    },
    cases: rows
  };

  const json = JSON.stringify(doc, null, 1) + '\n';
  const out = path.join(__dirname, 'c9_oracle.json');
  fs.writeFileSync(out, json);
  const sha = crypto.createHash('sha256').update(json).digest('hex');
  const activeCount = rows.filter(r => r.active).length;
  process.stderr.write(`wrote ${out}\nsha256 ${sha}\ncases ${rows.length} (active ${activeCount})\n`);
});
