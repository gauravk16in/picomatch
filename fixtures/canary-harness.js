'use strict';

/**
 * Harness canary/self-tests — proves the integrated differential harness
 * DETECTS failures. Uses the SAME shared detector as attack-integrated.js
 * (imported from integrated-harness-core.js), with dependency injection:
 * fake probe responses, deliberately corrupted data, simulated process
 * failures.
 *
 *   node fixtures/canary-harness.js
 *
 * Each canary declares the expected HarnessError code. The canary
 * PASSES only if the detector throws that exact code. An unexpected
 * exception (e.g., ReferenceError in canary code) is a FAILURE.
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  ErrorCodes,
  HarnessError,
  compareStates,
  classifyProbeResult,
  parseProbeOutput,
  correlateByIds,
  assertCoverage,
  runDiffCase,
} = require('./integrated-harness-core');

const RUST_DIR = path.join(__dirname, '..');
const MAIN_DIR = path.join(RUST_DIR, '..', 'Main');
const { enc } = require('./canon-scan');
const scan = require(path.join(MAIN_DIR, 'lib', 'scan'));

function canonState(s) {
  const out = {
    prefix: enc(s.prefix), input: enc(s.input), start: s.start,
    base: enc(s.base), glob: enc(s.glob),
    isBrace: s.isBrace === true, isBracket: s.isBracket === true,
    isGlob: s.isGlob === true, isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true, negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  if (s.tokens !== undefined) {
    out.tokens = s.tokens.map(function (t) {
      const tk = { value: enc(t.value), isGlob: t.isGlob === true };
      if (t.depth !== undefined) tk.depth = t.depth;
      if (t.backslashes === true) tk.backslashes = true;
      if (t.isBrace === true) tk.isBrace = true;
      if (t.isBracket === true) tk.isBracket = true;
      if (t.isExtglob === true) tk.isExtglob = true;
      if (t.isGlobstar === true) tk.isGlobstar = true;
      if (t.negated === true) tk.negated = true;
      if (t.isPrefix === true) tk.isPrefix = true;
      return tk;
    });
    out.maxDepth = s.maxDepth;
  }
  if (s.slashes !== undefined) out.slashes = s.slashes.slice();
  if (s.parts !== undefined) out.parts = s.parts.map(enc);
  return out;
}

// --- canary runner: fail closed ---
let canaryPass = 0;
let canaryFail = 0;

function evaluateCanary(name, expectedCode, fn) {
  try {
    fn();
    // If fn() returns without throwing, the fault was NOT detected
    console.error('  FAIL ' + name + ' — fault was not detected (no exception)');
    canaryFail++;
  } catch (error) {
    if (error instanceof HarnessError && error.code === expectedCode) {
      console.log('  PASS ' + name + ' — detected ' + error.code);
      canaryPass++;
    } else if (error instanceof HarnessError) {
      console.error('  FAIL ' + name + ' — wrong code: expected ' + expectedCode + ' got ' + error.code);
      canaryFail++;
    } else {
      console.error('  FAIL ' + name + ' — unexpected exception: ' + (error.stack || error));
      canaryFail++;
    }
  }
}

console.log('=== Harness Canary/Self-Tests ===');
console.log('');

// Get a reference ScanState for testing
const refInput = 'a/b/*.js';
const refOpts = { tokens: true, parts: true, scanToEnd: true };
const refState = canonState(scan(refInput, refOpts));

// 1: Semantic field divergence — flip isGlob
evaluateCanary('1-semantic-field', ErrorCodes.SEMANTIC_DIVERGENCE, function () {
  const corrupted = JSON.parse(JSON.stringify(refState));
  corrupted.isGlob = !corrupted.isGlob;
  compareStates(refState, corrupted);
});

// 2: Missing vs false — delete a true field
evaluateCanary('2-missing-vs-false', ErrorCodes.SEMANTIC_DIVERGENCE, function () {
  const corrupted = JSON.parse(JSON.stringify(refState));
  delete corrupted.isGlob;
  compareStates(refState, corrupted);
});

// 3: Missing vs null — set to null
evaluateCanary('3-missing-vs-null', ErrorCodes.SEMANTIC_DIVERGENCE, function () {
  const corrupted = JSON.parse(JSON.stringify(refState));
  corrupted.isGlob = null;
  compareStates(refState, corrupted);
});

// 4: JS oracle exception while Rust succeeds
evaluateCanary('4-js-oracle-exception', ErrorCodes.JS_ORACLE_EXCEPTION, function () {
  function jsThrows() { throw new TypeError('oracle'); }
  function rustOk() { return refState; }
  runDiffCase(refInput, refOpts, jsThrows, rustOk);
});

// 5: Rust nonzero exit — inject a fake probe result with status=1
const fakeNonzeroResult = {
  status: 1, signal: null, error: null,
  stdout: '', stderr: 'test error',
};
evaluateCanary('5-rust-nonzero-exit', ErrorCodes.RUST_PROCESS_EXIT, function () {
  const err = classifyProbeResult(fakeNonzeroResult);
  if (err) throw err;
});

// 6: Rust signal termination — inject a fake probe result with signal
const fakeSignalResult = {
  status: null, signal: 'SIGTERM', error: null,
  stdout: '', stderr: '',
};
evaluateCanary('6-rust-signal', ErrorCodes.RUST_PROCESS_SIGNAL, function () {
  const err = classifyProbeResult(fakeSignalResult);
  if (err) throw err;
});

// 7: Rust timeout — inject a fake probe result with error.code=ETIMEDOUT
const fakeTimeoutResult = {
  status: null, signal: null,
  error: { code: 'ETIMEDOUT', message: 'timed out' },
  stdout: '', stderr: '',
};
evaluateCanary('7-rust-timeout', ErrorCodes.RUST_PROCESS_TIMEOUT, function () {
  const err = classifyProbeResult(fakeTimeoutResult);
  if (err) throw err;
});

// 8: Rust spawn error (ENOENT) — inject a fake probe result with error.code=ENOENT
const fakeEnoentResult = {
  status: null, signal: null,
  error: { code: 'ENOENT', message: 'spawn ENOENT' },
  stdout: '', stderr: '',
};
evaluateCanary('8-rust-spawn-error', ErrorCodes.RUST_SPAWN_ERROR, function () {
  const err = classifyProbeResult(fakeEnoentResult);
  if (err) throw err;
});

// 9: Malformed JSON — parseProbeOutput on truncated JSON
evaluateCanary('9-malformed-json', ErrorCodes.RUST_MALFORMED_JSON, function () {
  parseProbeOutput('{"prefix":"a","input":"a",');
});

// 10: Truncated JSON
evaluateCanary('10-truncated-json', ErrorCodes.RUST_MALFORMED_JSON, function () {
  parseProbeOutput('{"prefix":"a","input"');
});

// 11: Empty output — parseProbeOutput on empty string
evaluateCanary('11-empty-output', ErrorCodes.RUST_EMPTY_OUTPUT, function () {
  parseProbeOutput('');
});

// 12: Missing response row — correlateByIds with a missing ID
evaluateCanary('12-missing-row', ErrorCodes.RUST_MISSING_ROW, function () {
  const rows = [{ i: 0, kind: 'ok' }, { i: 2, kind: 'ok' }];
  correlateByIds(rows, [0, 1, 2]);
});

// 13: Duplicate response ID — correlateByIds with duplicate
const dupRows = [{ i: 0, kind: 'ok' }, { i: 0, kind: 'ok' }];
evaluateCanary('13-duplicate-id', ErrorCodes.RUST_MALFORMED_JSON, function () {
  correlateByIds(dupRows, [0]);
});

// 14: Probe-declared error — parseProbeOutput with probeError
evaluateCanary('14-probe-error', ErrorCodes.RUST_PROBE_ERROR, function () {
  parseProbeOutput('{"i":0,"probeError":"something went wrong"}');
});

// 15: Infinity transport corruption — compare correct vs corrupted
evaluateCanary('15-infinity-transport', ErrorCodes.SEMANTIC_DIVERGENCE, function () {
  const correct = { maxDepth: { __num: 'Infinity' } };
  const corrupted = { maxDepth: null };
  compareStates(correct, corrupted);
});

// 16: UTF-16 transport corruption — compare correct vs mojibake
evaluateCanary('16-utf16-transport', ErrorCodes.SEMANTIC_DIVERGENCE, function () {
  const correct = { value: { __u16: [0x00e9] } };
  const corrupted = { value: '\u00c3\u00a9' };
  compareStates(correct, corrupted);
});

// 17: Coverage counter zero — assertCoverage with 0
evaluateCanary('17-coverage-zero', ErrorCodes.COVERAGE_ZERO, function () {
  assertCoverage(0, 'globstarTokens');
});

// 18: Array/token order divergence — compare swapped arrays
evaluateCanary('18-array-order', ErrorCodes.SEMANTIC_DIVERGENCE, function () {
  const a = { tokens: [{ value: 'a', isGlob: false }, { value: 'b', isGlob: true }] };
  const b = { tokens: [{ value: 'b', isGlob: true }, { value: 'a', isGlob: false }] };
  compareStates(a, b);
});

// 19: Unexpected ReferenceError in canary code is rejected (meta-test)
// This canary proves that evaluateCanary does NOT pass on unexpected exceptions.
// We use a separate helper to classify without console side effects.
function classifyCanaryResult(expectedCode, fn) {
  try {
    fn();
    return { passed: false, reason: 'fault was not detected (no exception)' };
  } catch (error) {
    if (error instanceof HarnessError && error.code === expectedCode) {
      return { passed: true };
    } else if (error instanceof HarnessError) {
      return { passed: false, reason: 'wrong code: expected ' + expectedCode + ' got ' + error.code };
    } else {
      return { passed: false, reason: 'unexpected exception: ' + (error.stack || error) };
    }
  }
}

const metaResult = classifyCanaryResult(ErrorCodes.SEMANTIC_DIVERGENCE, function () {
  undefinedVariable.foo;
});
if (!metaResult.passed && metaResult.reason.startsWith('unexpected exception')) {
  console.log('  PASS 19-meta-unexpected-exception — ReferenceError correctly rejected');
  canaryPass++;
} else {
  console.error('  FAIL 19-meta-unexpected-exception — unexpected exception was not rejected: ' + metaResult.reason);
  canaryFail++;
}

console.log('');
console.log('=== CANARY SUMMARY ===');
console.log('Canaries passed: ' + canaryPass);
console.log('Canaries failed: ' + canaryFail);
console.log('');

if (canaryFail > 0) {
  console.error('CANARY HARNESS FAILED: ' + canaryFail + ' canary(s) failed.');
  process.exit(1);
} else {
  console.log('CANARY HARNESS PASSED: all ' + canaryPass + ' canaries detected their faults.');
  process.exit(0);
}
