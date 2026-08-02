'use strict';

/**
 * Unified integrated differential runner — orchestrates ALL existing
 * deterministic verifiers, adversarial differential harnesses, and
 * unchanged-original-test bridges in a stable order. Returns nonzero
 * on ANY failure.
 *
 *   node fixtures/run-integrated.js
 *
 * Architecture:
 *  1. Build required Rust probes once (cargo build --examples).
 *  2. Run all deterministic corpus verifiers (verify-c0, verify-c1,
 *     verify-c2, verify-scan).
 *  3. Run all adversarial differential harnesses (attack-c0, attack-c0-2,
 *     attack-c2, attack-scan).
 *  4. Run all unchanged-original-test bridges (api.scan.js via scan-bridge).
 *  5. Run the integration attack set (attack-integrated.js).
 *  6. Run harness canary/self-tests (canary-harness.js).
 *  7. Print truthful per-surface and aggregate totals.
 *
 * Each step captures: exact command, exit code, and bounded output.
 * Failures are recorded and reported; the runner does NOT stop on the
 * first failure — it runs all steps and aggregates.
 *
 * Deterministic seed: 42 (documented; used by attack-scan.js and
 * attack-integrated.js).
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUST_DIR = path.join(__dirname, '..');
const MAIN_DIR = path.join(RUST_DIR, '..', 'Main');
const SEED = 42;

// --- step runner ---
function runStep(label, command, cwd, options) {
  const opts = options || {};
  const fullCwd = cwd || RUST_DIR;
  const result = {
    label,
    command,
    cwd: fullCwd,
    exitCode: null,
    stdout: '',
    stderr: '',
    signal: null,
    error: null,
    timedOut: false,
  };

  try {
    const out = spawnSync('cmd', ['/c', command], {
      cwd: fullCwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: opts.timeout || 120000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    result.exitCode = out.status;
    result.stdout = (out.stdout || '').slice(0, 4096);
    result.stderr = (out.stderr || '').slice(0, 4096);
    result.signal = out.signal;
    result.timedOut = out.timedOut || false;
    if (out.error) result.error = out.error.message;
  } catch (e) {
    result.error = e.message;
    result.exitCode = -1;
  }

  return result;
}

// --- main ---
console.log('=== Integrated Differential Validation Runner ===');
console.log('Seed: ' + SEED);
console.log('Rust dir: ' + RUST_DIR);
console.log('Main dir: ' + MAIN_DIR);
console.log('Timestamp: ' + new Date().toISOString());
console.log('');

// Step 0: Build probes
console.log('[0/7] Building Rust probes (cargo build --examples)...');
const buildResult = runStep(
  'build-probes',
  'cargo build --examples',
  RUST_DIR,
  { timeout: 180000 }
);
if (buildResult.exitCode !== 0) {
  console.error('  FAILED: cargo build --examples exit=' + buildResult.exitCode);
  console.error('  stderr: ' + buildResult.stderr.slice(0, 500));
  process.exit(1);
}
console.log('  OK: probes built.');
console.log('');

const steps = [];
let totalPass = 0;
let totalFail = 0;

// Step 1: Deterministic corpus verifiers
const verifiers = [
  { label: 'verify-c0', cmd: 'node fixtures/verify-c0.js' },
  { label: 'verify-c1', cmd: 'node fixtures/verify-c1.js' },
  { label: 'verify-c2', cmd: 'node fixtures/verify-c2.js' },
  { label: 'verify-scan', cmd: 'node fixtures/verify-scan.js' },
];

console.log('[1/7] Deterministic corpus verifiers:');
for (const v of verifiers) {
  const r = runStep(v.label, v.cmd, RUST_DIR);
  steps.push(r);
  const pass = r.exitCode === 0;
  if (pass) totalPass++;
  else totalFail++;
  console.log(
    '  ' + (pass ? 'PASS' : 'FAIL') + ' ' + v.label +
    ' (exit=' + r.exitCode + '): ' +
    (r.stdout.trim().split('\n')[0] || '(no output)')
  );
  if (!pass) {
    console.error('    stderr: ' + r.stderr.trim().slice(0, 500));
  }
}
console.log('');

// Step 2: Adversarial differential harnesses
const attacks = [
  { label: 'attack-c0', cmd: 'node fixtures/attack-c0.js' },
  { label: 'attack-c0-2', cmd: 'node fixtures/attack-c0-2.js' },
  { label: 'attack-c2', cmd: 'node fixtures/attack-c2.js' },
  { label: 'attack-scan', cmd: 'node fixtures/attack-scan.js' },
];

console.log('[2/7] Adversarial differential harnesses:');
for (const a of attacks) {
  const r = runStep(a.label, a.cmd, RUST_DIR);
  steps.push(r);
  const pass = r.exitCode === 0;
  if (pass) totalPass++;
  else totalFail++;
  console.log(
    '  ' + (pass ? 'PASS' : 'FAIL') + ' ' + a.label +
    ' (exit=' + r.exitCode + '): ' +
    (r.stdout.trim().split('\n').pop() || '(no output)')
  );
  if (!pass) {
    console.error('    stderr: ' + r.stderr.trim().slice(0, 500));
  }
}
console.log('');

// Step 3: Unchanged-original-test bridges
console.log('[3/7] Unchanged original test bridges:');
const bridgeCmd =
  'npx mocha --require ../Rust/fixtures/scan-bridge.js test/api.scan.js --reporter dot';
const bridgeR = runStep('scan-bridge', bridgeCmd, MAIN_DIR, { timeout: 120000 });
steps.push(bridgeR);
if (bridgeR.exitCode === 0) totalPass++;
else totalFail++;
// Extract passing count from output
const passMatch = bridgeR.stdout.match(/(\d+) passing/);
const passCount = passMatch ? parseInt(passMatch[1], 10) : 0;
const failMatch = bridgeR.stdout.match(/(\d+) failing/);
const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;
console.log(
  '  ' + (bridgeR.exitCode === 0 ? 'PASS' : 'FAIL') +
  ' scan-bridge (exit=' + bridgeR.exitCode + '): ' +
  passCount + ' passing, ' + failCount + ' failing'
);
if (bridgeR.exitCode !== 0) {
  console.error('    stderr: ' + bridgeR.stderr.trim().slice(0, 500));
}
console.log('');

// Step 4: Rust fmt + clippy + test
console.log('[4/7] Rust quality gates:');
const gates = [
  { label: 'cargo-fmt', cmd: 'cargo fmt --check' },
  { label: 'cargo-clippy', cmd: 'cargo clippy --workspace --all-targets --all-features -- -D warnings' },
  { label: 'cargo-test', cmd: 'cargo test --workspace --all-features' },
];
for (const g of gates) {
  const r = runStep(g.label, g.cmd, RUST_DIR, { timeout: 180000 });
  steps.push(r);
  const pass = r.exitCode === 0;
  if (pass) totalPass++;
  else totalFail++;
  // Extract test count
  let summary = '';
  const testMatch = r.stdout.match(/test result: ok\. (\d+) passed; (\d+) failed/);
  if (testMatch) {
    summary = testMatch[1] + ' passed, ' + testMatch[2] + ' failed';
  } else {
    summary = r.stdout.trim().split('\n').pop().slice(0, 100) || '(no output)';
  }
  console.log(
    '  ' + (pass ? 'PASS' : 'FAIL') + ' ' + g.label +
    ' (exit=' + r.exitCode + '): ' + summary
  );
  if (!pass) {
    console.error('    stderr: ' + r.stderr.trim().slice(0, 500));
  }
}
console.log('');

// Step 5: Integration attack set
console.log('[5/7] Integration attack set:');
const intAttackR = runStep(
  'attack-integrated',
  'node fixtures/attack-integrated.js',
  RUST_DIR,
  { timeout: 300000 }
);
steps.push(intAttackR);
if (intAttackR.exitCode === 0) totalPass++;
else totalFail++;
console.log(
  '  ' + (intAttackR.exitCode === 0 ? 'PASS' : 'FAIL') +
  ' attack-integrated (exit=' + intAttackR.exitCode + '): ' +
  (intAttackR.stdout.trim().split('\n').pop() || '(no output)')
);
if (intAttackR.exitCode !== 0) {
  console.error('    stderr: ' + intAttackR.stderr.trim().slice(0, 1000));
}
console.log('');

// Step 6: Harness canary/self-tests
console.log('[6/7] Harness canary/self-tests:');
const canaryR = runStep(
  'canary-harness',
  'node fixtures/canary-harness.js',
  RUST_DIR,
  { timeout: 120000 }
);
steps.push(canaryR);
if (canaryR.exitCode === 0) totalPass++;
else totalFail++;
console.log(
  '  ' + (canaryR.exitCode === 0 ? 'PASS' : 'FAIL') +
  ' canary-harness (exit=' + canaryR.exitCode + '): ' +
  (canaryR.stdout.trim().split('\n').pop() || '(no output)')
);
if (canaryR.exitCode !== 0) {
  console.error('    stderr: ' + canaryR.stderr.trim().slice(0, 1000));
}
console.log('');

// Step 7: Original test hash verification
console.log('[7/7] Original test hash verification:');
const hashR = runStep(
  'test-hash',
  'certutil -hashfile test\\api.scan.js SHA256',
  MAIN_DIR
);
steps.push(hashR);
const hashMatch = hashR.stdout.match(/([a-f0-9]{64})/i);
const expectedHash = '8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36';
const actualHash = hashMatch ? hashMatch[1].toLowerCase() : '';
const hashPass = actualHash === expectedHash;
if (hashPass) totalPass++;
else totalFail++;
console.log(
  '  ' + (hashPass ? 'PASS' : 'FAIL') +
  ' test-hash (exit=' + hashR.exitCode + '): ' +
  (actualHash || 'HASH NOT FOUND') +
  (hashPass ? ' (matches expected)' : ' (MISMATCH! expected ' + expectedHash + ')')
);
console.log('');

// --- Aggregate summary ---
console.log('=== AGGREGATE SUMMARY ===');
console.log('Steps passed: ' + totalPass);
console.log('Steps failed: ' + totalFail);
console.log('Total steps: ' + (totalPass + totalFail));
console.log('');

// Print detail table
console.log('=== STEP DETAILS ===');
for (const s of steps) {
  const status = s.exitCode === 0 ? 'PASS' : 'FAIL';
  console.log(
    status + ' | ' + s.label + ' | exit=' + s.exitCode +
    (s.signal ? ' signal=' + s.signal : '') +
    (s.timedOut ? ' TIMEOUT' : '') +
    (s.error ? ' error=' + s.error : '')
  );
}
console.log('');

if (totalFail > 0) {
  console.error('INTEGRATED VALIDATION FAILED: ' + totalFail + ' step(s) failed.');
  process.exit(1);
} else {
  console.log('INTEGRATED VALIDATION PASSED: all ' + totalPass + ' steps green.');
  process.exit(0);
}