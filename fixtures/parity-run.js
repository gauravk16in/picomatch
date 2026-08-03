'use strict';

/**
 * parity-run.js
 *
 * Runs the original Picomatch test suites through the Rust adapter and
 * records per-file parity results into bench/parity.json.
 *
 * Usage:
 *   node fixtures/parity-run.js
 *      -> runs every *.js file in tests/original
 *
 *   node fixtures/parity-run.js api.scan.js api.picomatch.js
 *      -> runs only the specified files
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'tests', 'original');

const DEFAULT_FILES = fs
  .readdirSync(TEST_DIR)
  .filter(file => file.endsWith('.js'))
  .sort();

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : DEFAULT_FILES;

// Harness-level transport choice (never the suite's): napi when the addon is
// built (it alone can carry JS callbacks like expandRange); else serve with a
// printed note. Explicit `PMX_ADAPTER` env always wins.
const NATIVE_ADDON = path.join(ROOT, 'adapter', 'native', 'pmx_node.node');
const TRANSPORT = fs.existsSync(NATIVE_ADDON) ? 'napi' : 'serve';
console.log(`[parity-run] transport: ${TRANSPORT}${TRANSPORT === 'serve' ? '  (addon absent → build: cargo build -p pmx-node && cp target/debug/libpmx_node.* adapter/native/pmx_node.node)' : ''}`);

function runFile(file) {
  const target = path.join('tests', 'original', file);

  const res = spawnSync(
    'npx',
    ['mocha', target, '--reporter', 'json', '--timeout', '20000'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 27,
      env: {
        ...process.env,
        PMX_QUIET: '1',
        PMX_ADAPTER: process.env.PMX_ADAPTER || TRANSPORT,
      },
    }
  );

  if (!res.stdout || !res.stdout.trim()) {
    return {
      file,
      pass: 0,
      fail: 0,
      total: 0,
      error: (
        res.stderr ||
        res.error?.message ||
        'no output'
      ).slice(0, 300),
    };
  }

  let report;

  try {
    report = JSON.parse(res.stdout);
  } catch (e) {
    return {
      file,
      pass: 0,
      fail: 0,
      total: 0,
      error: `mocha json parse: ${e.message}`,
    };
  }

  return {
    file,
    pass: report.stats.passes,
    fail: report.stats.failures,
    total: report.stats.tests,
    failures: (report.failures || []).map(f => ({
      title: f.fullTitle || f.title,
      err: ((f.err && f.err.message) || '')
        .split('\n')[0]
        .slice(0, 140),
    })),
  };
}

const rows = files.map(runFile);

fs.mkdirSync(path.join(ROOT, 'bench'), {
  recursive: true,
});

const output = {
  generatedBy: 'fixtures/parity-run.js',
  generatedAt: new Date().toISOString(),
  files: rows,
};

fs.writeFileSync(
  path.join(ROOT, 'bench', 'parity.json'),
  JSON.stringify(output, null, 2) + '\n'
);

let totalPass = 0;
let totalFail = 0;
let totalTests = 0;

for (const row of rows) {
  if (row.error) {
    console.log(`${row.file}: ERROR — ${row.error}`);
    continue;
  }

  console.log(`${row.file}: ${row.pass}/${row.total}`);

  if (row.failures.length) {
    for (const failure of row.failures.slice(0, 5)) {
      console.log(`   ✗ ${failure.title} — ${failure.err}`);
    }

    if (row.failures.length > 5) {
      console.log(
        `   ✗ … ${row.failures.length - 5} more (see bench/parity.json)`
      );
    }
  }

  totalPass += row.pass;
  totalFail += row.fail;
  totalTests += row.total;
}

console.log('');
console.log('='.repeat(70));
console.log(`Files Run : ${rows.length}`);
console.log(`Tests     : ${totalTests}`);
console.log(`Passed    : ${totalPass}`);
console.log(`Failed    : ${totalFail}`);
console.log(`Success   : ${((totalPass / Math.max(totalTests, 1)) * 100).toFixed(2)}%`);
console.log(`Report    : bench/parity.json`);
console.log('='.repeat(70));

process.exitCode = totalFail === 0 ? 0 : 2;