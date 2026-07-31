'use strict';
// DISPOSABLE RESEARCH HARNESS (tools/research/) — inventory + test-architecture extractor.
// Produces: scratch/repo-inventory.json (file metadata) and scratch/test-architecture.json
// (per-suite mechanical analysis). Read-only against the repo.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKIP = new Set(['.git', 'node_modules', 'coverage', '.nyc_output']);
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p.split(path.sep).join('/'));
  }
  return out;
};

const category = p => {
  if (/^(CLAUDE|context|spec|plan|implementation|DECISIONS|ARCHITECTURE)\.md$/.test(p)) return 'governance';
  if (p.startsWith('docs/')) return 'docs';
  if (p.startsWith('knowledge/')) return 'knowledge';
  if (p.startsWith('audits/')) return 'audits';
  if (p.startsWith('Prompts/')) return 'prompts(historical)';
  if (p.startsWith('scratch/')) return 'scratch(disposable)';
  if (p.startsWith('tools/')) return 'tools(research)';
  if (p === 'tests/test-hash-manifest.json') return 'tests(port,evidence)';
  if (p.startsWith('tests/')) return 'tests(port)';
  if (p.startsWith('test/')) return 'upstream-test(oracle)';
  if (p.startsWith('lib/') || p === 'index.js' || p === 'posix.js') return 'upstream-source(oracle)';
  if (p.startsWith('bench/')) return 'upstream-bench(oracle)';
  if (p.startsWith('examples/')) return 'upstream-examples(oracle)';
  if (p.startsWith('.github/')) return 'upstream-ci(oracle)';
  return 'config';
};

const files = walk('.').sort();
const inv = files.map(p => {
  const b = fs.readFileSync(p);
  const isText = !b.includes(0) && b.length < 4000000;
  let enc = 'binary';
  let lines = null;
  let eol = null;
  if (isText) {
    const hasBom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
    enc = hasBom ? 'utf8-bom' : 'utf8';
    const s = b.toString('utf8');
    eol = s.includes('\r\n') ? 'CRLF' : s.includes('\r') ? 'CR' : 'LF';
    lines = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
    if (s.length && !s.endsWith('\n')) lines += 0; // count matches Read tool convention
  }
  return { path: p, bytes: b.length, lines, sha256: sha256(b).slice(0, 16), enc, eol, category: category(p) };
});

fs.writeFileSync('scratch/repo-inventory.json', JSON.stringify({ generated: 'inventory.js', fileCount: inv.length, files: inv }, null, 2) + '\n');
console.log('inventory:', inv.length, 'files | text:', inv.filter(f => f.lines !== null).length, '| binary:', inv.filter(f => f.lines === null).length);
console.log('by category:');
const byCat = {};
for (const f of inv) byCat[f.category] = (byCat[f.category] || 0) + 1;
for (const [c, n] of Object.entries(byCat)) console.log(' ', c, n);

// ---- test architecture extraction ----
const testFiles = inv.filter(f => f.category === 'upstream-test(oracle)' && f.path.endsWith('.js'));
const markers = ['instanceof RegExp', 'Object.prototype.toString', '.constructor', '.source', '.flags', '.exec', '.test(', 'lastIndex', '.index', 'groups', 'indices', 'deepStrictEqual', 'throws', 'process.platform', 'require('];
const arch = testFiles.map(f => {
  const s = fs.readFileSync(f.path, 'utf8');
  const lines = s.split('\n');
  const itCount = (s.match(/\bit\(/g) || []).length;
  const assertCalls = (s.match(/\bassert\.(strictEqual|deepStrictEqual|deepEqual|ok|throws|doesNotThrow|equal)\b/g) || []).length;
  const requires = [...s.matchAll(/require\((['"`][^)'"`]+['"`])\)/g)].map(m => m[1]);
  const hits = {};
  for (const mk of markers) {
    const ln = [];
    lines.forEach((l, i) => { if (l.includes(mk)) ln.push(i + 1); });
    if (ln.length) hits[mk] = ln.slice(0, 12);
  }
  const loopAroundAssert = /for\s*\(|forEach|\.map\(/.test(s);
  const windowsOpt = (s.match(/windows:\s*(true|false)/g) || []);
  return { file: f.path, lines: lines.length, itBlocks: itCount, assertCallSites: assertCalls, requires: [...new Set(requires)], loopAroundAssert, windowsOpts: [...new Set(windowsOpt)], markers: hits };
});
fs.writeFileSync('scratch/test-architecture.json', JSON.stringify(arch, null, 2) + '\n');
console.log('test architecture:', arch.length, 'suites extracted to scratch/test-architecture.json');
console.log('total it() blocks:', arch.reduce((a, b) => a + b.itBlocks, 0), '| total assert call sites:', arch.reduce((a, b) => a + b.assertCallSites, 0));
