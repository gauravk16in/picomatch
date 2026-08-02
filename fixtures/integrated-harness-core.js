'use strict';

/**
 * Shared harness core — used by both attack-integrated.js (real detector)
 * and canary-harness.js (fault injection). This module extracts the
 * minimum shared detection logic so canaries exercise the SAME code
 * paths as the real attack runner.
 *
 * Stable error codes for fault classification:
 *  SEMANTIC_DIVERGENCE, JS_ORACLE_EXCEPTION, RUST_PROCESS_EXIT,
 *  RUST_PROCESS_SIGNAL, RUST_PROCESS_TIMEOUT, RUST_SPAWN_ERROR,
 *  RUST_MALFORMED_JSON, RUST_EMPTY_OUTPUT, RUST_MISSING_ROW,
 *  RUST_PROBE_ERROR, COVERAGE_ZERO, UNEXPECTED_EXCEPTION
 */

const assert = require('assert');

const ErrorCodes = {
  SEMANTIC_DIVERGENCE: 'SEMANTIC_DIVERGENCE',
  JS_ORACLE_EXCEPTION: 'JS_ORACLE_EXCEPTION',
  RUST_PROCESS_EXIT: 'RUST_PROCESS_EXIT',
  RUST_PROCESS_SIGNAL: 'RUST_PROCESS_SIGNAL',
  RUST_PROCESS_TIMEOUT: 'RUST_PROCESS_TIMEOUT',
  RUST_SPAWN_ERROR: 'RUST_SPAWN_ERROR',
  RUST_MALFORMED_JSON: 'RUST_MALFORMED_JSON',
  RUST_EMPTY_OUTPUT: 'RUST_EMPTY_OUTPUT',
  RUST_MISSING_ROW: 'RUST_MISSING_ROW',
  RUST_PROBE_ERROR: 'RUST_PROBE_ERROR',
  COVERAGE_ZERO: 'COVERAGE_ZERO',
  UNEXPECTED_EXCEPTION: 'UNEXPECTED_EXCEPTION',
};

class HarnessError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.name = 'HarnessError';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

/**
 * Strict state comparison — the same deepStrictEqual used by the real attack.
 * Throws HarnessError(SEMANTIC_DIVERGENCE) on mismatch.
 */
function compareStates(jsState, rustState) {
  try {
    assert.deepStrictEqual(rustState, jsState);
  } catch (e) {
    throw new HarnessError(
      ErrorCodes.SEMANTIC_DIVERGENCE,
      e.message,
      { js: jsState, rust: rustState }
    );
  }
}

/**
 * Classify a spawnSync result for a probe invocation.
 * Returns null on success, or a HarnessError with the appropriate code.
 * `out` is the spawnSync return object.
 */
function classifyProbeResult(out) {
  if (out.error) {
    if (out.error.code === 'ETIMEDOUT') {
      return new HarnessError(ErrorCodes.RUST_PROCESS_TIMEOUT, 'probe timed out');
    }
    if (out.error.code === 'ENOENT') {
      return new HarnessError(ErrorCodes.RUST_SPAWN_ERROR, 'probe not found: ' + out.error.message);
    }
    return new HarnessError(ErrorCodes.RUST_SPAWN_ERROR, out.error.message);
  }
  if (out.signal) {
    return new HarnessError(ErrorCodes.RUST_PROCESS_SIGNAL, 'signal: ' + out.signal);
  }
  if (out.status !== 0) {
    return new HarnessError(
      ErrorCodes.RUST_PROCESS_EXIT,
      'probe exited ' + out.status + ': ' + (out.stderr || '').slice(0, 200)
    );
  }
  return null; // success
}

/**
 * Parse JSONL probe output lines and return an array of parsed rows.
 * Throws HarnessError on malformed JSON or empty output.
 */
function parseProbeOutput(stdout) {
  const lines = stdout.split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (lines.length === 0) {
    throw new HarnessError(ErrorCodes.RUST_EMPTY_OUTPUT, 'probe produced no output');
  }
  const rows = [];
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (e) {
      throw new HarnessError(ErrorCodes.RUST_MALFORMED_JSON, 'malformed JSON: ' + e.message + ' line=' + line.slice(0, 100));
    }
    if (row.probeError) {
      throw new HarnessError(ErrorCodes.RUST_PROBE_ERROR, 'probeError: ' + row.probeError);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Correlate response rows by case ID, rejecting missing/duplicate IDs.
 * Returns a Map<number, row>.
 */
function correlateByIds(rows, expectedIds) {
  const map = new Map();
  for (const row of rows) {
    const id = row.i;
    if (map.has(id)) {
      throw new HarnessError(ErrorCodes.RUST_MALFORMED_JSON, 'duplicate response ID: ' + id);
    }
    map.set(id, row);
  }
  for (const expectedId of expectedIds) {
    if (!map.has(expectedId)) {
      throw new HarnessError(ErrorCodes.RUST_MISSING_ROW, 'missing response for case ID: ' + expectedId);
    }
  }
  return map;
}

/**
 * Assert that a coverage counter is greater than zero.
 * Throws HarnessError(COVERAGE_ZERO) if not.
 */
function assertCoverage(counter, label) {
  if (counter <= 0) {
    throw new HarnessError(ErrorCodes.COVERAGE_ZERO, 'coverage counter zero: ' + (label || 'unnamed'));
  }
}

/**
 * Run a single differential case with injected JS and Rust functions.
 * jsFn(input, opts) -> state or throws.
 * rustFn(input, opts) -> state or throws.
 * Returns { ok: true } on match, or throws HarnessError on divergence/failure.
 */
function runDiffCase(input, opts, jsFn, rustFn) {
  let jsState, rustState, jsErr, rustErr;
  try {
    jsState = jsFn(input, opts);
  } catch (e) {
    jsErr = e;
  }
  try {
    rustState = rustFn(input, opts);
  } catch (e) {
    if (e instanceof HarnessError) {
      throw e; // process/transport failure — re-throw
    }
    rustErr = e;
  }
  if (jsErr) {
    throw new HarnessError(ErrorCodes.JS_ORACLE_EXCEPTION, 'JS oracle threw: ' + jsErr.message);
  }
  if (rustErr) {
    throw new HarnessError(ErrorCodes.RUST_PROBE_ERROR, 'Rust threw: ' + rustErr.message);
  }
  compareStates(jsState, rustState);
  return { ok: true };
}

module.exports = {
  ErrorCodes,
  HarnessError,
  compareStates,
  classifyProbeResult,
  parseProbeOutput,
  correlateByIds,
  assertCoverage,
  runDiffCase,
};
