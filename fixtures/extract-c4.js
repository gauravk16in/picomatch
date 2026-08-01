'use strict';

/**
 * C4 corpus extractor — Fastpath gallery (parse.fastpaths)
 * (lib/parse.js:L1324-L1414).
 * Extracts test cases across all fastpath templates, extension chains, and options.
 *
 * node fixtures/extract-c4.js → fixtures/c4_oracle.json
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Mocha = require('mocha');

const REF = path.join(__dirname, '..', '..', 'picomatch-original');
const parsePath = require.resolve(path.join(REF, 'lib', 'parse'));
const origParse = require(parsePath);

const captured = [];
const seen = new Set();

function addCase(pattern, options, sourceFile) {
  const opts = options || {};
  const key = JSON.stringify({ pattern, options: opts });
  if (!seen.has(key)) {
    seen.add(key);
    captured.push({ pattern, options: opts, sourceFile });
  }
}

// Systematic fastpaths patterns
const patterns = [
  '*', '.*', '*.*', '*/*', '**', '**/*', '**/*.*', '**/.*',
  '*.js', '*.tar.gz', '*.a.b.c',
  'foo.js', 'a/b/c', '*.js/bar', './a/b', './*.js', '***', '**/**', '**/**/**'
];

const optionCombinations = [
  {},
  { dot: true },
  { bash: true },
  { capture: true },
  { noglobstar: true },
  { strictSlashes: true },
  { windows: true },
  { dot: true, windows: true },
  { bash: true, capture: true },
  { noglobstar: true, windows: true },
  { maxLength: 5 }
];

patterns.forEach(p => {
  optionCombinations.forEach(opts => {
    addCase(p, opts, 'systematic');
  });
});

// Hook parse.fastpaths during mocha test suite runs
const origFastpaths = origParse.fastpaths;
origParse.fastpaths = function(input, options) {
  addCase(input, options, 'mocha');
  return origFastpaths.call(this, input, options);
};

function SilentReporter(runner) {}

const mocha = new Mocha({ reporter: SilentReporter });
const testFiles = [
  'stars.js',
  'dotfiles.js',
  'options.js',
  'api.picomatch.js'
];
testFiles.forEach(file => {
  const filePath = path.join(REF, 'test', file);
  if (fs.existsSync(filePath)) {
    mocha.addFile(filePath);
  }
});

mocha.run(() => {
  // Restore original fastpaths
  origParse.fastpaths = origFastpaths;

  const runCase = c => {
    try {
      const res = origParse.fastpaths(c.pattern, c.options || {});
      return { kind: 'ok', output: res === undefined ? null : res };
    } catch (err) {
      return { kind: 'error', class: err.constructor.name, message: err.message };
    }
  };

  const rows = captured.map((c, idx) => {
    return {
      id: `c4.orig.${idx}`,
      chunk: 4,
      layer: 'core',
      pattern: c.pattern,
      options: c.options || {},
      note: `fastpaths test case from ${c.sourceFile}`,
      expect: runCase(c)
    };
  });

  const doc = {
    meta: {
      corpus: 'c4-fastpaths',
      generator: 'fixtures/extract-c4.js',
      reference: path.join('..', '..', 'picomatch-original') + ' (read-only checkout)',
      picomatchVersion: require(path.join(REF, 'package.json')).version
    },
    cases: rows
  };

  const json = JSON.stringify(doc, null, 1) + '\n';
  const out = path.join(__dirname, 'c4_oracle.json');
  fs.writeFileSync(out, json);
  const sha = crypto.createHash('sha256').update(json).digest('hex');
  process.stderr.write(`wrote ${out}\nsha256 ${sha}\ncases ${rows.length}\n`);
});
