'use strict';

/**
 * Unified integrated differential runner — orchestrates ALL existing
 * deterministic verifiers, adversarial differential harnesses, and
 * unchanged-original-test bridges in a stable order. Returns nonzero
 * on ANY failure.
 *
 *   node fixtures/run-integrated.js
 *
 * Platform-neutral: uses process.execPath (Node) and direct argument
 * arrays instead of shell commands. No cmd/certutil dependency.
 * Hash via node:crypto, not certutil.
 *
 * Deterministic seed: 42 (documented; used by attack-scan.js and
 * attack-integrated.js).
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const RUST_DIR = path.join(__dirname, '..');
const MAIN_DIR = path.join(RUST_DIR, '..', 'Main');
const SEED = 42;
const NODE = process.execPath;

// --- step runner: direct executable + args, no shell ---
function runStep(label, exec, args, cwd, options) {
  const opts = options || {};
  const fullCwd = cwd || RUST_DIR;
  const result = {
    label, exec, args, cwd: fullCwd,
    exitCode: null, stdout: '', stderr: '',
    signal: null, error: null, timedOut: false,
  };
  try {
    const out = spawnSync(exec, args, {
      cwd: fullCwd, encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: opts.timeout || 120000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    result.exitCode = out.status;
    result.stdout = (out.stdout || '').slice(0, 4096);
    result.stderr = (out.stderr || '').slice(0, 4096);
    result.signal = out.signal;
    if (out.error) {
      result.error = out.error.message;
      result.timedOut = Boolean(out.error.code === 'ETIMEDOUT');
    }
  } catch (e) {
    result.error = e.message;
    result.exitCode = -1;
  }
  return result;
}

// --- classify step as pass/fail ---
function stepPassed(r) {
  return !r.error && !r.signal && r.exitCode === 0 && !r.timedOut;
}

// --- step runner with shell (for npx/cmd wrappers that need it) ---
function runStepWithShell(label, command, cwd, options) {
  const opts = options || {};
  const fullCwd = cwd || RUST_DIR;
  const result = {
    label, exec: command, args: [], cwd: fullCwd,
    exitCode: null, stdout: '', stderr: '',
    signal: null, error: null, timedOut: false,
  };
  try {
    const out = spawnSync(command, {
      cwd: fullCwd, encoding: 'utf8',
      shell: true,
      maxBuffer: 32 * 1024 * 1024,
      timeout: opts.timeout || 120000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    result.exitCode = out.status;
    result.stdout = (out.stdout || '').slice(0, 4096);
    result.stderr = (out.stderr || '').slice(0, 4096);
    result.signal = out.signal;
    if (out.error) {
      result.error = out.error.message;
      result.timedOut = Boolean(out.error.code === 'ETIMEDOUT');
    }
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
console.log('Platform: ' + process.platform);
console.log('');

// Step 0: Build probes
console.log('[0/8] Building Rust probes (cargo build --examples)...');
const buildResult = runStep('build-probes', 'cargo', ['build', '--examples'], RUST_DIR, { timeout: 180000 });
if (!stepPassed(buildResult)) {
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
  { label: 'verify-c0', script: 'fixtures/verify-c0.js' },
  { label: 'verify-c1', script: 'fixtures/verify-c1.js' },
  { label: 'verify-c2', script: 'fixtures/verify-c2.js' },
  { label: 'verify-scan', script: 'fixtures/verify-scan.js' },
];

console.log('[1/8] Deterministic corpus verifiers:');
for (const v of verifiers) {
  const r = runStep(v.label, NODE, [path.join(RUST_DIR, v.script)], RUST_DIR);
  steps.push(r);
  const pass = stepPassed(r);
  if (pass) totalPass++; else totalFail++;
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + ' ' + v.label +
    ' (exit=' + r.exitCode + '): ' + (r.stdout.trim().split('\n')[0] || '(no output)'));
  if (!pass) console.error('    stderr: ' + r.stderr.trim().slice(0, 500));
}
console.log('');

// Step 2: Adversarial differential harnesses
const attacks = [
  { label: 'attack-c0', script: 'fixtures/attack-c0.js' },
  { label: 'attack-c0-2', script: 'fixtures/attack-c0-2.js' },
  { label: 'attack-c2', script: 'fixtures/attack-c2.js' },
  { label: 'attack-scan', script: 'fixtures/attack-scan.js' },
];

console.log('[2/8] Adversarial differential harnesses:');
for (const a of attacks) {
  const r = runStep(a.label, NODE, [path.join(RUST_DIR, a.script)], RUST_DIR);
  steps.push(r);
  const pass = stepPassed(r);
  if (pass) totalPass++; else totalFail++;
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + ' ' + a.label +
    ' (exit=' + r.exitCode + '): ' + (r.stdout.trim().split('\n').pop() || '(no output)'));
  if (!pass) console.error('    stderr: ' + r.stderr.trim().slice(0, 500));
}
console.log('');

// Step 3: Unchanged-original-test bridges
console.log('[3/8] Unchanged original test bridges:');
// npx.cmd needs shell:true on Windows; the command string is fixed
// (no user-generated data interpolated), so shell is safe here.
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const bridgeCommand = npxCmd + ' mocha --require ' +
  path.join(RUST_DIR, 'fixtures', 'scan-bridge.js') +
  ' test/api.scan.js --reporter dot';
const bridgeR = runStepWithShell('scan-bridge', bridgeCommand, MAIN_DIR, { timeout: 120000 });
steps.push(bridgeR);
if (stepPassed(bridgeR)) totalPass++; else totalFail++;
const passMatch = bridgeR.stdout.match(/(\d+) passing/);
const passCount = passMatch ? parseInt(passMatch[1], 10) : 0;
const failMatch = bridgeR.stdout.match(/(\d+) failing/);
const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;
console.log('  ' + (stepPassed(bridgeR) ? 'PASS' : 'FAIL') +
  ' scan-bridge (exit=' + bridgeR.exitCode + '): ' + passCount + ' passing, ' + failCount + ' failing');
if (!stepPassed(bridgeR)) console.error('    stderr: ' + bridgeR.stderr.trim().slice(0, 500));
console.log('');

// Step 4: Rust fmt + clippy + test
console.log('[4/8] Rust quality gates:');
const gates = [
  { label: 'cargo-fmt', exec: 'cargo', args: ['fmt', '--check'] },
  { label: 'cargo-clippy', exec: 'cargo', args: ['clippy', '--workspace', '--all-targets', '--all-features', '--', '-D', 'warnings'] },
  { label: 'cargo-test', exec: 'cargo', args: ['test', '--workspace', '--all-features'] },
];
for (const g of gates) {
  const r = runStep(g.label, g.exec, g.args, RUST_DIR, { timeout: 180000 });
  steps.push(r);
  const pass = stepPassed(r);
  if (pass) totalPass++; else totalFail++;
  let summary = '';
  const testMatch = r.stdout.match(/test result: ok\. (\d+) passed; (\d+) failed/);
  if (testMatch) summary = testMatch[1] + ' passed, ' + testMatch[2] + ' failed';
  else summary = r.stdout.trim().split('\n').pop().slice(0, 100) || '(no output)';
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + ' ' + g.label + ' (exit=' + r.exitCode + '): ' + summary);
  if (!pass) console.error('    stderr: ' + r.stderr.trim().slice(0, 500));
}
console.log('');

// Step 5: Integration attack set
console.log('[5/8] Integration attack set:');
const intAttackR = runStep('attack-integrated', NODE, [path.join(RUST_DIR, 'fixtures', 'attack-integrated.js')], RUST_DIR, { timeout: 300000 });
steps.push(intAttackR);
if (stepPassed(intAttackR)) totalPass++; else totalFail++;
console.log('  ' + (stepPassed(intAttackR) ? 'PASS' : 'FAIL') +
  ' attack-integrated (exit=' + intAttackR.exitCode + '): ' +
  (intAttackR.stdout.trim().split('\n').pop() || '(no output)'));
if (!stepPassed(intAttackR)) console.error('    stderr: ' + intAttackR.stderr.trim().slice(0, 1000));
console.log('');

// Step 6: Harness canary/self-tests
console.log('[6/8] Harness canary/self-tests:');
const canaryR = runStep('canary-harness', NODE, [path.join(RUST_DIR, 'fixtures', 'canary-harness.js')], RUST_DIR, { timeout: 120000 });
steps.push(canaryR);
if (stepPassed(canaryR)) totalPass++; else totalFail++;
console.log('  ' + (stepPassed(canaryR) ? 'PASS' : 'FAIL') +
  ' canary-harness (exit=' + canaryR.exitCode + '): ' +
  (canaryR.stdout.trim().split('\n').pop() || '(no output)'));
if (!stepPassed(canaryR)) console.error('    stderr: ' + canaryR.stderr.trim().slice(0, 1000));
console.log('');

// Step 7: Benchmark validator/CLI/stats canaries
console.log('[7/8] Benchmark canary/self-tests:');
const benchCanaryR = runStep('bench-canaries', NODE, [path.join(RUST_DIR, 'benchmarks', 'bench-canaries.js')], RUST_DIR, { timeout: 180000 });
steps.push(benchCanaryR);
if (stepPassed(benchCanaryR)) totalPass++; else totalFail++;
console.log('  ' + (stepPassed(benchCanaryR) ? 'PASS' : 'FAIL') +
  ' bench-canaries (exit=' + benchCanaryR.exitCode + '): ' +
  (benchCanaryR.stdout.trim().split('\n').pop() || '(no output)'));
if (!stepPassed(benchCanaryR)) console.error('    stderr: ' + benchCanaryR.stderr.trim().slice(0, 1000));
console.log('');

// Step 8: Original test hash verification (using node:crypto, not certutil)
console.log('[8/8] Original test hash verification:');
const testFile = path.join(MAIN_DIR, 'test', 'api.scan.js');
const expectedHash = '8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36';
let actualHash = '';
let hashPass = false;
try {
  const bytes = fs.readFileSync(testFile);
  actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
  hashPass = actualHash === expectedHash;
} catch (e) {
  // file not found
}
const hashStep = { label: 'test-hash', exitCode: hashPass ? 0 : 1, stdout: actualHash, stderr: '' };
steps.push(hashStep);
if (hashPass) totalPass++; else totalFail++;
console.log('  ' + (hashPass ? 'PASS' : 'FAIL') + ' test-hash: ' +
  (actualHash || 'FILE NOT FOUND') +
  (hashPass ? ' (matches expected)' : ' (MISMATCH! expected ' + expectedHash + ')'));
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
  const status = stepPassed(s) || s.exitCode === 0 ? 'PASS' : 'FAIL';
  console.log(status + ' | ' + s.label + ' | exit=' + s.exitCode +
    (s.signal ? ' signal=' + s.signal : '') +
    (s.timedOut ? ' TIMEOUT' : '') +
    (s.error ? ' error=' + s.error : ''));
}
console.log('');

if (totalFail > 0) {
  console.error('INTEGRATED VALIDATION FAILED: ' + totalFail + ' step(s) failed.');
  process.exit(1);
} else {
  console.log('INTEGRATED VALIDATION PASSED: all ' + totalPass + ' steps green.');
  process.exit(0);
}
