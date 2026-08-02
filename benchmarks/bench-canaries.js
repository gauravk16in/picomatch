#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { ErrorCodes, validateRaw, validateSummary } = require('./validator');

function makeValidRaw() {
  return {
    schema_version: 1,
    provenance: {
      harness_sha: 'abc123',
      dirty_tree: false,
      corpus_sha256: 'def456',
      corpus_path: 'benchmarks/scenarios.json',
    },
    config: {
      warmup_iters: 1000,
      samples: 20,
      iters_per_sample: 5000,
      pairs: 3,
      seed: 42,
      prng: 'mulberry32',
      timer_js: 'process.hrtime.bigint()',
      timer_rust: 'std::time::Instant',
      bootstrap_resamples: 10000,
    },
    parity: [{ scenario_id: 'S001', ok: true }, { scenario_id: 'S002', ok: true }],
    measurements: [],
  };
}

function makeValidMeasurement(pairId, scenarioIds, iters, samples) {
  const results = [];
  for (const id of scenarioIds) {
    const times = [];
    for (let i = 0; i < samples; i++) times.push(1000000 + i * 100);
    results.push({
      scenario_id: id, label: id, input: 'foo', options: {},
      warmup_iters: 1000, samples: samples, iters_per_sample: iters,
      pair_id: pairId, runtime_id: 0, runtime: 'js',
      sample_times_ns: times, digest: 12345,
      total_operations: 1000 + samples * iters,
    });
  }
  const rustResults = results.map(r => ({ ...r, runtime: 'rust', runtime_id: 1, digest: 12345 }));
  return {
    pair_id: pairId, rust_first: false,
    js: { runtime: 'js', results: results },
    rust: { runtime: 'rust', results: rustResults },
  };
}

const canaries = [];
function register(name, mutate, expectedCode) {
  canaries.push({ name, mutate, expectedCode });
}

const scenarioIds = ['S001', 'S002'];
const validExpected = {
  scenarios: scenarioIds, pairs: 3, itersPerSample: 5000, samples: 20,
  seed: 42, corpusSha: 'def456', harnessSha: 'abc123', dirtyTree: false,
};

function runCanary(c) {
  const raw = makeValidRaw();
  raw.measurements = [
    makeValidMeasurement(0, scenarioIds, 5000, 20),
    makeValidMeasurement(1, scenarioIds, 5000, 20),
    makeValidMeasurement(2, scenarioIds, 5000, 20),
  ];
  c.mutate(raw);
  const errors = validateRaw(raw, validExpected);
  const found = errors.some(e => e.code === c.expectedCode);
  if (!found) throw new Error('Expected ' + c.expectedCode + ' but got: ' + JSON.stringify(errors.map(e => e.code)));
}

register('missing-runtime', (raw) => { raw.measurements[0].rust = null; }, ErrorCodes.MISSING_RUNTIME);
register('duplicate-runtime', (raw) => { raw.measurements[0].rust.runtime = 'js'; }, ErrorCodes.MISSING_RUNTIME);
register('missing-pair', (raw) => { raw.measurements = raw.measurements.slice(0, 2); }, ErrorCodes.WRONG_PROCESS_COUNT);
register('duplicate-pair-id', (raw) => { raw.measurements[1].pair_id = 0; }, ErrorCodes.DUPLICATE_PAIR_ID);
register('duplicate-scenario', (raw) => { raw.measurements[0].js.results.push({ ...raw.measurements[0].js.results[0] }); }, ErrorCodes.DUPLICATE_SCENARIO);
register('unknown-scenario', (raw) => { raw.measurements[0].js.results[0].scenario_id = 'S999'; raw.measurements[0].rust.results[0].scenario_id = 'S999'; }, ErrorCodes.UNKNOWN_SCENARIO);
register('missing-scenario', (raw) => { raw.measurements[0].js.results = raw.measurements[0].js.results.slice(0, 1); raw.measurements[0].rust.results = raw.measurements[0].rust.results.slice(0, 1); }, ErrorCodes.MISSING_SCENARIO);
register('wrong-scenario-count', (raw) => { raw.measurements[0].js.results.push({ ...raw.measurements[0].js.results[0], scenario_id: 'S003' }); raw.measurements[0].rust.results.push({ ...raw.measurements[0].rust.results[0], scenario_id: 'S003' }); }, ErrorCodes.UNKNOWN_SCENARIO);
register('wrong-process-count', (raw) => { raw.measurements.push(makeValidMeasurement(3, scenarioIds, 5000, 20)); }, ErrorCodes.WRONG_PROCESS_COUNT);
register('zero-elapsed', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = 0; }, ErrorCodes.ZERO_ELAPSED);
register('negative-elapsed', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = -100; }, ErrorCodes.NEGATIVE_ELAPSED);
register('zero-iterations', (raw) => { raw.measurements[0].js.results[0].total_operations = 0; }, ErrorCodes.ZERO_ITERATIONS);
register('nan-value', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = NaN; }, ErrorCodes.NAN_VALUE);
register('infinity-value', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = Infinity; }, ErrorCodes.INFINITY_VALUE);
register('unsafe-integer', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = Number.MAX_SAFE_INTEGER + 1; }, ErrorCodes.UNSAFE_INTEGER);
register('wrong-seed', (raw) => { raw.config.seed = 99; }, ErrorCodes.WRONG_SEED);
register('unknown-prng', (raw) => { raw.config.prng = 'unknown'; }, ErrorCodes.UNKNOWN_PRNG);
register('missing-parity', (raw) => { raw.parity = []; }, ErrorCodes.MISSING_PARITY_PROOF);
register('altered-semantic', (raw) => { raw.parity[0].ok = false; raw.parity[0].detail = 'mismatch'; }, ErrorCodes.ALTERED_SEMANTIC_OUTPUT);
register('wrong-corpus-sha', (raw) => { raw.provenance.corpus_sha256 = 'wrong'; }, ErrorCodes.WRONG_CORPUS_SHA);
register('wrong-harness-commit', (raw) => { raw.provenance.harness_sha = 'wrong'; }, ErrorCodes.WRONG_HARNESS_COMMIT);
register('dirty-tree', (raw) => { raw.provenance.dirty_tree = true; }, ErrorCodes.DIRTY_TREE);
register('missing-sample-times', (raw) => { raw.measurements[0].js.results[0].sample_times_ns = null; }, ErrorCodes.MISSING_SCENARIO);
register('wrong-iters', (raw) => { raw.measurements[0].js.results[0].iters_per_sample = 999; }, ErrorCodes.WRONG_ITERS_PER_SAMPLE);
register('wrong-samples', (raw) => { raw.measurements[0].js.results[0].samples = 99; }, ErrorCodes.WRONG_SAMPLES);
register('bootstrap-too-few', (raw) => { raw.config.bootstrap_resamples = 100; }, ErrorCodes.BOOTSTRAP_TOO_FEW);
register('schema-version', (raw) => { raw.schema_version = 2; }, ErrorCodes.SCHEMA_VERSION);

function makeValidSummary() {
  return {
    schema_version: 1,
    provenance: { harness_sha: 'abc', dirty_tree: false, corpus_sha256: 'def', corpus_path: 'b/s.json' },
    config: { warmup_iters: 1000, samples: 20, iters_per_sample: 5000, pairs: 5, seed: 42, prng: 'mulberry32', bootstrap_resamples: 10000 },
    scenarios: [{
      scenario_id: 'S001', label: 'test', input: 'foo', options: {}, orientation: 'latency', description: 'test',
      pairs: 5, point_estimate_ratio: 2.5, median_ratio: 2.5, mad_ratio: 0.1,
      ci_95_low: 2.0, ci_95_high: 3.0, ci_overlap: false, all_ratios: [2.5],
    }],
  };
}

const summaryCanaries = [];
function registerSummary(name, mutate, expectedCode) {
  summaryCanaries.push({ name, mutate, expectedCode });
}
registerSummary('summary-schema-version', (s) => { s.schema_version = 2; }, ErrorCodes.SCHEMA_VERSION);
registerSummary('summary-malformed-ci', (s) => { s.scenarios[0].ci_95_low = NaN; }, ErrorCodes.MALFORMED_CI);
registerSummary('summary-reversed-ci', (s) => { s.scenarios[0].ci_95_low = 3.0; s.scenarios[0].ci_95_high = 2.0; }, ErrorCodes.REVERSED_CI);
registerSummary('summary-missing-scenarios', (s) => { s.scenarios = null; }, ErrorCodes.MISSING_SCENARIO);

function main() {
  let executed = 0, failed = 0;
  let registered = canaries.length + summaryCanaries.length;
  const failures = [];
  for (const c of canaries) {
    try { runCanary(c); executed++; } catch (e) { failed++; failures.push(c.name + ': ' + e.message); }
  }
  for (const c of summaryCanaries) {
    try {
      const s = makeValidSummary(); c.mutate(s);
      const errors = validateSummary(s, {});
      const found = errors.some(e => e.code === c.expectedCode);
      if (!found) throw new Error('Expected ' + c.expectedCode + ' but got: ' + JSON.stringify(errors.map(e => e.code)));
      executed++;
    } catch (e) { failed++; failures.push(c.name + ': ' + e.message); }
  }
  console.log('\n=== BENCHMARK CANARY RESULTS ===');
  console.log('Executed: ' + executed + '/' + registered);
  console.log('Failed: ' + failed);
  if (failures.length > 0) for (const f of failures) console.error('FAIL: ' + f);
  if (executed !== registered || failed > 0) { console.error('BENCHMARK CANARIES FAILED'); process.exit(1); }
  console.log('BENCHMARK CANARIES PASSED: all ' + registered + ' mutations detected.');
  process.exit(0);
}
main();
