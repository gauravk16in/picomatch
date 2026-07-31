'use strict';
// DISPOSABLE RESEARCH HARNESS (tools/research/) — not part of the port.
// Generates a deterministic SHA-256 manifest of the pinned upstream test suite
// (event: original test suite hashed at kickoff). Deterministic by design:
// sorted POSIX relative paths, fixed key order, no timestamps — running it twice
// must produce byte-identical output.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCOPE = 'test';
const OUT = path.join('tests', 'test-hash-manifest.json');

const walk = dir => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
};

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

const files = walk(SCOPE)
  .map(p => p.split(path.sep).join('/'))
  .sort()
  .map(rel => {
    const buf = fs.readFileSync(rel);
    return { path: rel, sha256: sha256(buf), bytes: buf.length };
  });

const aggregate = sha256(Buffer.from(files.map(f => `${f.sha256}  ${f.path}\n`).join(''), 'utf8'));

const manifest = {
  manifestVersion: 1,
  scope: 'test/ (entire upstream suite incl. support/ and .eslintrc.json; no exclusions)',
  oracleCommit: execSync('git rev-parse 4f41a8edade7a5ab19832f7b40ecce46b288767f').toString().trim(),
  algorithm: 'sha256',
  fileCount: files.length,
  aggregateSha256: aggregate,
  generator: 'tools/research/hash-tests.js',
  deterministic: 'sorted POSIX paths; fixed key order; no timestamps; regenerate with: node tools/research/hash-tests.js',
  nodeVersionAtFirstGeneration: process.version,
  files
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`wrote ${OUT}: ${files.length} files, aggregate sha256 ${aggregate}`);
