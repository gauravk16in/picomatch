'use strict';

/**
 * C8 corpus extractor — Globstar machinery and push demotion
 * (lib/parse.js:L493-L505, L1128-L1244).
 *
 * node fixtures/extract-c8.js → fixtures/c8_oracle.json
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

function requiredChunk(pattern) {
  if (typeof pattern !== 'string') return 0;
  if (pattern.length > 65536) return 0;
  if (pattern.includes('**')) return 8;
  if (pattern.startsWith('!')) return 9;
  if (/[?*+@!]\(|[()]|\|/.test(pattern)) return 7;
  if (/[\[\]]/.test(pattern)) return 6;
  if (/[\{\},]/.test(pattern)) return 5;
  if (/[*?+@]/.test(pattern)) return 3;
  if (/[.\/]/.test(pattern)) return 2;
  if (/["'\\]/.test(pattern)) return 1;
  return 0;
}

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
  'globstars.js',
  'stars.js',
  'options.noglobstar.js',
  'bash.js'
];
testFiles.forEach(file => {
  const filePath = path.join(REF, 'test', file);
  if (fs.existsSync(filePath)) {
    mocha.addFile(filePath);
  }
});

mocha.run(() => {
  require.cache[parsePath].exports = origParse;

  const runCase = c => {
    try {
      const s = origParse(c.pattern, c.options || {});
      return { kind: 'ok', utf16Length: typeof c.pattern === 'string' ? c.pattern.length : 0, state: canonState(s) };
    } catch (err) {
      return { kind: 'error', class: err.constructor.name, message: err.message };
    }
  };

  const rows = captured.map((c, idx) => {
    const chunk = requiredChunk(c.pattern);
    return {
      id: `c8.orig.${idx}`,
      chunk: chunk,
      layer: 'core',
      jsOnly: false,
      active: chunk <= 8,
      pattern: c.pattern,
      options: encOptions(c.options || {}),
      note: `extracted from original test file ${c.sourceFile}`,
      expect: runCase(c)
    };
  });

  const doc = {
    meta: {
      corpus: 'c8-globstar',
      generator: 'fixtures/extract-c8.js',
      reference: path.join('..', '..', 'picomatch-original') + ' (read-only checkout)',
      picomatchVersion: require(path.join(REF, 'package.json')).version,
      fieldPolicy: 'u16-unit sequences for emitted text (canon.js); assert-all when no assert list'
    },
    cases: rows
  };

  const json = JSON.stringify(doc, null, 1) + '\n';
  const out = path.join(__dirname, 'c8_oracle.json');
  fs.writeFileSync(out, json);
  const sha = crypto.createHash('sha256').update(json).digest('hex');
  const activeCount = rows.filter(r => r.active).length;
  process.stderr.write(`wrote ${out}\nsha256 ${sha}\ncases ${rows.length} (active ${activeCount})\n`);
});
