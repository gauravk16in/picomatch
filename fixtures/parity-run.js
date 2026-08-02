'use strict';

/**
 * parity-run.js — first parity numbers (ADAPTER_PLAN B1).
 * Runs the original (byte-frozen) mocha suite files through the adapter and
 * records honest per-file counts into bench/parity.json.
 *
 *   node fixtures/parity-run.js [testfiles...]
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_FILES = ['api.scan.js', 'api.picomatch.js'];
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;

const execSync_ = cmd => spawnSync(cmd, arguments, { encoding: 'utf8', maxBuffer: 1 << 27 });

function runFile(file) {
  const target = path.join('tests', 'original', file);
  const res = spawnSync('npx', ['mocha', target, '--reporter', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 27,
    env: { ...process.env, PMX_QUIET: '1' }
  });
  if (!res.stdout || !res.stdout.trim()) {
    return { file, pass: 0, fail: 0, total: 0, error: (res.stderr || res.error?.message || 'no output').slice(0, 300) };
  }
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch (e) {
    return { file, pass: 0, fail: 0, total: 0, error: `mocha json parse: ${e.message}` };
  }
  const failures = (report.failures || []).map(f => ({
    title: f.fullTitle || f.title,
    err: (f.err && f.err.message || '').split('\n')[0].slice(0, 140)
  }));
  return { file, pass: report.stats.passes, fail: report.stats.failures, total: report.stats.tests, failures };
}

const rows = files.map(runFile);
fs.mkdirSync(path.join(ROOT, 'bench'), { recursive: true });
const out = path.join(ROOT, 'bench', 'parity.json');
fs.writeFileSync(out, JSON.stringify({ generatedBy: 'fixtures/parity-run.js', files: rows }, null, 1) + '\n');

let totalPass = 0, totalFail = 0;
for (const r of rows) {
  const line = r.error
    ? `${r.file}: ERROR — ${r.error}`
    : `${r.file}: ${r.pass}/${r.total}`;
  console.log(line);
  if (r.failures) {
    for (const f of r.failures.slice(0, 5)) console.log(`   ✗ ${f.title} — ${f.err}`);
    if (r.failures.length > 5) console.log(`   ✗ … ${r.failures.length - 5} more (see bench/parity.json)`);
  }
  totalPass += r.pass; totalFail += r.fail;
}
console.log(`parity: ${totalPass}/${totalPass + totalFail} across ${rows.length} files → bench/parity.json`);
process.exitCode = totalFail === 0 ? 0 : 2; // 2 = parity-incomplete, not a tool error
