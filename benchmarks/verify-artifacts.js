#!/usr/bin/env node
'use strict';

// Standalone artifact verifier — recomputes all SHA-256 sidecars from disk
// and validates raw + summary artifacts. Fails on any mismatch.
//
// Usage: node benchmarks/verify-artifacts.js <results-dir>

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { validateRaw, validateSummary } = require('./validator');

function main() {
  const resultsDir = process.argv[2];
  if (!resultsDir) {
    console.error('Usage: node verify-artifacts.js <results-dir>');
    process.exit(1);
  }

  const files = fs.readdirSync(resultsDir);
  const rawFiles = files.filter(f => f.endsWith('-raw.json'));
  const summaryFiles = files.filter(f => f.endsWith('-summary.json'));
  const errors = [];

  for (const f of rawFiles) {
    const filePath = path.join(resultsDir, f);
    const sidecarPath = filePath + '.sha256';
    if (!fs.existsSync(sidecarPath)) {
      errors.push('Missing sidecar: ' + sidecarPath);
      continue;
    }
    const content = fs.readFileSync(filePath);
    const expectedSha = fs.readFileSync(sidecarPath, 'utf8').trim();
    const actualSha = crypto.createHash('sha256').update(content).digest('hex');
    if (expectedSha !== actualSha) {
      errors.push('Hash mismatch for ' + f + ': expected ' + expectedSha + ', got ' + actualSha);
    }
    // Validate raw artifact
    const raw = JSON.parse(content);
    const rawErrors = validateRaw(raw, {});
    for (const e of rawErrors) errors.push(f + ' [' + e.code + '] ' + e.message);
  }

  for (const f of summaryFiles) {
    const filePath = path.join(resultsDir, f);
    const sidecarPath = filePath + '.sha256';
    if (!fs.existsSync(sidecarPath)) {
      errors.push('Missing sidecar: ' + sidecarPath);
      continue;
    }
    const content = fs.readFileSync(filePath);
    const expectedSha = fs.readFileSync(sidecarPath, 'utf8').trim();
    const actualSha = crypto.createHash('sha256').update(content).digest('hex');
    if (expectedSha !== actualSha) {
      errors.push('Hash mismatch for ' + f + ': expected ' + expectedSha + ', got ' + actualSha);
    }
    const summary = JSON.parse(content);
    const summaryErrors = validateSummary(summary, {});
    for (const e of summaryErrors) errors.push(f + ' [' + e.code + '] ' + e.message);
  }

  if (errors.length > 0) {
    console.error('VERIFICATION FAILED:');
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }
  console.log('All artifacts verified (' + rawFiles.length + ' raw, ' + summaryFiles.length + ' summary).');
}

main();
