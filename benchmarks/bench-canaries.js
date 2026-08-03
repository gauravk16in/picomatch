#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { ErrorCodes, validateRaw, validateSummary } = require('./validator');
const { median, mad, analyzeScenario } = require('./stats');

// ---------- shared valid fixture (schema v2) ----------

const scenarioIds = ['S001', 'S002'];
const validSchedule = [
  { pair_id: 0, rust_first: false },
  { pair_id: 1, rust_first: true },
  { pair_id: 2, rust_first: false },
];

function makeValidRaw() {
  return {
    schema_version: 2,
    provenance: {
      harness_sha: 'abc123',
      dirty_tree: false,
      corpus_sha256: 'def456',
      corpus_path: 'benchmarks/scenarios.json',
      schedule_sha256: 'feed42',
      schedule: JSON.parse(JSON.stringify(validSchedule)),
      scanbench_sha256: 'aaaa',
      scanprobe_sha256: 'bbbb',
    },
    config: {
      mode: 'final',
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

function makeValidMeasurement(pairId, iters, samples) {
  const results = [];
  for (const id of scenarioIds) {
    const times = [];
    for (let i = 0; i < samples; i++) times.push(1000000 + i * 100);
    results.push({
      scenario_id: id, label: id, input: 'foo', options: {},
      warmup_iters: 1000, samples: samples, iters_per_sample: iters,
      pair_id: pairId, runtime_id: 0, runtime: 'js',
      sample_times_ns: times, digest: 12345, consumption: 6789,
      total_operations: 1000 + samples * iters,
    });
  }
  const rustResults = results.map(r => ({ ...r, runtime: 'rust', runtime_id: 1, digest: 12345, consumption: 6789 }));
  return {
    pair_id: pairId,
    rust_first: pairId < validSchedule.length ? validSchedule[pairId].rust_first : false,
    js: { runtime: 'js', results: results },
    rust: { runtime: 'rust', results: rustResults },
  };
}

const validExpected = {
  scenarios: scenarioIds, pairs: 3, itersPerSample: 5000, samples: 20, warmupIters: 1000,
  seed: 42, corpusSha: 'def456', harnessSha: 'abc123', dirtyTree: false, mode: 'final',
  schedule: validSchedule,
};

// ---------- raw canaries ----------

const canaries = [];
function register(name, mutate, expectedCode) {
  canaries.push({ name, mutate, expectedCode });
}

function runCanary(c) {
  const raw = makeValidRaw();
  raw.measurements = [
    makeValidMeasurement(0, 5000, 20),
    makeValidMeasurement(1, 5000, 20),
    makeValidMeasurement(2, 5000, 20),
  ];
  c.mutate(raw);
  const errors = validateRaw(raw, validExpected);
  const found = errors.some(e => e.code === c.expectedCode);
  if (!found) throw new Error('Expected ' + c.expectedCode + ' but got: ' + JSON.stringify(errors.map(e => e.code)));
}

register('missing-runtime', (raw) => { raw.measurements[0].rust = null; }, ErrorCodes.MISSING_RUNTIME);
register('duplicate-runtime', (raw) => { raw.measurements[0].rust.runtime = 'js'; }, ErrorCodes.MISSING_RUNTIME);
register('missing-results-array', (raw) => { raw.measurements[0].js = { runtime: 'js' }; }, ErrorCodes.MALFORMED_MEASUREMENT);
register('missing-pair', (raw) => { raw.measurements = raw.measurements.slice(0, 2); }, ErrorCodes.WRONG_PROCESS_COUNT);
register('duplicate-pair-id', (raw) => { raw.measurements[1].pair_id = 0; }, ErrorCodes.DUPLICATE_PAIR_ID);
register('noncontiguous-pair-id', (raw) => { raw.measurements[2].pair_id = 3; raw.measurements[2].js.results.forEach(r => r.pair_id = 3); raw.measurements[2].rust.results.forEach(r => r.pair_id = 3); }, ErrorCodes.NONCONTIGUOUS_PAIR_ID);
register('nested-pair-id-mismatch', (raw) => { raw.measurements[1].js.results[0].pair_id = 99; }, ErrorCodes.NESTED_PAIR_ID_MISMATCH);
register('duplicate-scenario', (raw) => { raw.measurements[0].js.results.push({ ...raw.measurements[0].js.results[0] }); }, ErrorCodes.DUPLICATE_SCENARIO);
register('unknown-scenario', (raw) => { raw.measurements[0].js.results[0].scenario_id = 'S999'; raw.measurements[0].rust.results[0].scenario_id = 'S999'; }, ErrorCodes.UNKNOWN_SCENARIO);
register('missing-scenario', (raw) => { raw.measurements[0].js.results = raw.measurements[0].js.results.slice(0, 1); raw.measurements[0].rust.results = raw.measurements[0].rust.results.slice(0, 1); }, ErrorCodes.MISSING_SCENARIO);
register('wrong-scenario-count', (raw) => { raw.measurements[0].js.results.push({ ...raw.measurements[0].js.results[0], scenario_id: 'S003' }); raw.measurements[0].rust.results.push({ ...raw.measurements[0].rust.results[0], scenario_id: 'S003' }); }, ErrorCodes.UNKNOWN_SCENARIO);
register('wrong-process-count', (raw) => { raw.measurements.push(makeValidMeasurement(3, 5000, 20)); raw.provenance.schedule.push({ pair_id: 3, rust_first: false }); }, ErrorCodes.WRONG_PROCESS_COUNT);
register('zero-elapsed', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = 0; }, ErrorCodes.ZERO_ELAPSED);
register('negative-elapsed', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = -100; }, ErrorCodes.NEGATIVE_ELAPSED);
register('zero-iterations', (raw) => { raw.measurements[0].js.results[0].total_operations = 0; }, ErrorCodes.TOTAL_OPS_MISMATCH);
register('nan-value', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = NaN; }, ErrorCodes.NAN_VALUE);
register('infinity-value', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = Infinity; }, ErrorCodes.INFINITY_VALUE);
register('unsafe-integer', (raw) => { raw.measurements[0].js.results[0].sample_times_ns[0] = Number.MAX_SAFE_INTEGER + 1; }, ErrorCodes.UNSAFE_INTEGER);
register('wrong-seed', (raw) => { raw.config.seed = 99; }, ErrorCodes.WRONG_SEED);
register('unknown-prng', (raw) => { raw.config.prng = 'unknown'; }, ErrorCodes.UNKNOWN_PRNG);
register('missing-parity', (raw) => { raw.parity = []; }, ErrorCodes.MISSING_PARITY_PROOF);
register('missing-parity-row', (raw) => { raw.parity = raw.parity.slice(0, 1); }, ErrorCodes.MISSING_PARITY_ROW);
register('altered-semantic', (raw) => { raw.parity[0].ok = false; raw.parity[0].detail = 'mismatch'; }, ErrorCodes.ALTERED_SEMANTIC_OUTPUT);
register('wrong-corpus-sha', (raw) => { raw.provenance.corpus_sha256 = 'wrong'; }, ErrorCodes.WRONG_CORPUS_SHA);
register('wrong-harness-commit', (raw) => { raw.provenance.harness_sha = 'wrong'; }, ErrorCodes.WRONG_HARNESS_COMMIT);
register('dirty-tree', (raw) => { raw.provenance.dirty_tree = true; }, ErrorCodes.DIRTY_TREE);
register('missing-sample-times', (raw) => { raw.measurements[0].js.results[0].sample_times_ns = null; }, ErrorCodes.MISSING_SCENARIO);
register('wrong-iters', (raw) => { raw.measurements[0].js.results[0].iters_per_sample = 999; }, ErrorCodes.WRONG_ITERS_PER_SAMPLE);
register('wrong-samples', (raw) => { raw.measurements[0].js.results[0].samples = 99; }, ErrorCodes.WRONG_SAMPLES);
register('wrong-warmup', (raw) => { raw.measurements[0].js.results[0].warmup_iters = 500; }, ErrorCodes.WRONG_WARMUP);
register('sample-length-mismatch', (raw) => { raw.measurements[0].js.results[0].sample_times_ns = raw.measurements[0].js.results[0].sample_times_ns.slice(0, 19); }, ErrorCodes.SAMPLE_LENGTH_MISMATCH);
register('total-ops-mismatch', (raw) => { raw.measurements[0].js.results[0].total_operations = 42; }, ErrorCodes.TOTAL_OPS_MISMATCH);
register('mismatched-digest', (raw) => { raw.measurements[1].rust.results[0].digest = 54321; }, ErrorCodes.MISMATCHED_DIGEST);
register('malformed-digest', (raw) => { raw.measurements[1].rust.results[0].digest = -5; }, ErrorCodes.MALFORMED_DIGEST);
register('consumption-mismatch', (raw) => { raw.measurements[1].rust.results[0].consumption = 111; }, ErrorCodes.CONSUMPTION_MISMATCH);
register('consumption-missing', (raw) => { delete raw.measurements[0].js.results[0].consumption; }, ErrorCodes.MALFORMED_DIGEST);
register('wrong-execution-order', (raw) => { const tmp = raw.measurements[1]; raw.measurements[1] = raw.measurements[2]; raw.measurements[2] = tmp; }, ErrorCodes.WRONG_EXECUTION_ORDER);
register('schedule-measurement-contradiction', (raw) => { raw.measurements[1].rust_first = false; }, ErrorCodes.WRONG_EXECUTION_ORDER);
register('wrong-schedule', (raw) => { raw.provenance.schedule[1].rust_first = false; raw.measurements[1].rust_first = false; }, ErrorCodes.WRONG_SCHEDULE);
register('wrong-mode', (raw) => { raw.config.mode = 'pilot'; }, ErrorCodes.WRONG_MODE);
register('wrong-mode-bogus', (raw) => { raw.config.mode = 'bogus'; }, ErrorCodes.WRONG_MODE);
register('full-is-not-final', (raw) => { raw.config.mode = 'full'; }, ErrorCodes.WRONG_MODE);
register('missing-binary-hashes', (raw) => { delete raw.provenance.scanbench_sha256; }, ErrorCodes.MISSING_PROVENANCE);
register('config-mismatch', (raw) => { raw.config.samples = 10; }, ErrorCodes.CONFIG_MISMATCH);
register('bootstrap-too-few', (raw) => { raw.config.bootstrap_resamples = 100; }, ErrorCodes.BOOTSTRAP_TOO_FEW);
register('bootstrap-missing', (raw) => { delete raw.config.bootstrap_resamples; }, ErrorCodes.BOOTSTRAP_TOO_FEW);
register('schema-version', (raw) => { raw.schema_version = 1; }, ErrorCodes.SCHEMA_VERSION);

// ---------- summary canaries ----------

function makeValidSummary() {
  return {
    schema_version: 2,
    provenance: { harness_sha: 'abc', dirty_tree: false, corpus_sha256: 'def', corpus_path: 'b/s.json', schedule_sha256: 'x', schedule: [], scanbench_sha256: 'a', scanprobe_sha256: 'b' },
    config: { mode: 'final', warmup_iters: 1000, samples: 20, iters_per_sample: 5000, pairs: 5, seed: 42, prng: 'mulberry32', bootstrap_resamples: 10000 },
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
registerSummary('summary-schema-version', (s) => { s.schema_version = 1; }, ErrorCodes.SCHEMA_VERSION);
registerSummary('summary-malformed-ci', (s) => { s.scenarios[0].ci_95_low = NaN; }, ErrorCodes.MALFORMED_CI);
registerSummary('summary-nonfinite-ci', (s) => { s.scenarios[0].ci_95_high = Infinity; }, ErrorCodes.MALFORMED_CI);
registerSummary('summary-reversed-ci', (s) => { s.scenarios[0].ci_95_low = 3.0; s.scenarios[0].ci_95_high = 2.0; }, ErrorCodes.REVERSED_CI);
registerSummary('summary-missing-scenarios', (s) => { s.scenarios = null; }, ErrorCodes.MISSING_SCENARIO);
registerSummary('summary-duplicate-scenario', (s) => { s.scenarios.push({ ...s.scenarios[0] }); }, ErrorCodes.DUPLICATE_SCENARIO);
registerSummary('summary-config-mismatch', (s) => { s.config.samples = 99; }, ErrorCodes.CONFIG_MISMATCH);

// ---------- CLI integration canaries (execute the real CLI/parser paths) ----------

const ROOT = path.join(__dirname, '..');
const cliCanaries = [];
function registerCli(name, exec, args, input) {
  cliCanaries.push({ name, exec, args, input });
}

const RUNNER = path.join(__dirname, 'run-benchmarks.js');
const WORKER = path.join(__dirname, 'bench-worker.js');
// Resolve scanbench from EITHER build mode — silently skipping the scanbench
// canaries when the debug binary is absent would be a fail-open coverage hole
// (run-benchmarks.js builds --release; a debug build may not exist).
const SCANBENCH_CANDIDATES = ['release', 'debug'].map(m =>
  path.join(ROOT, 'target', m, 'examples', process.platform === 'win32' ? 'scanbench.exe' : 'scanbench'));
const SCANBENCH = SCANBENCH_CANDIDATES.find(p => fs.existsSync(p));
if (!SCANBENCH) {
  throw new Error('[bench-canaries] scanbench binary not found in release or debug examples. Run `cargo build --example scanbench` (or `--release`) first.');
}

registerCli('cli-runner-unknown-flag', process.execPath, [RUNNER, '--bogus'], null);
registerCli('cli-runner-positional', process.execPath, [RUNNER, 'positional'], null);
registerCli('cli-runner-fractional', process.execPath, [RUNNER, '--pairs', '2.5'], null);
registerCli('cli-runner-negative', process.execPath, [RUNNER, '--pairs', '-3'], null);
registerCli('cli-runner-missing-value', process.execPath, [RUNNER, '--pairs'], null);
registerCli('cli-runner-duplicate', process.execPath, [RUNNER, '--pairs', '3', '--pairs', '4'], null);
registerCli('cli-runner-pilot-conflict', process.execPath, [RUNNER, '--pilot', '--pairs', '3'], null);
registerCli('cli-runner-unsafe-integer', process.execPath, [RUNNER, '--pairs', '9007199254740993'], null);
registerCli('cli-runner-bad-sha', process.execPath, [RUNNER, '--harness-sha', 'xyz'], null);
registerCli('cli-worker-unknown-flag', process.execPath, [WORKER, '--bogus'], null);
registerCli('cli-worker-fractional', process.execPath, [WORKER, '--samples', '2.5'], null);
registerCli('cli-worker-zero', process.execPath, [WORKER, '--samples', '0'], null);
registerCli('cli-worker-missing-value', process.execPath, [WORKER, '--samples'], null);
registerCli('cli-scanbench-unknown-flag', SCANBENCH, ['--bogus'], '[]\n');
registerCli('cli-scanbench-malformed', SCANBENCH, ['--samples', 'abc'], '[]\n');
registerCli('cli-scanbench-missing-value', SCANBENCH, ['--samples'], '[]\n');
registerCli('cli-scanbench-negative', SCANBENCH, ['--samples', '-1'], '[]\n');

// ---------- statistics synthetic fixture (hand-verifiable) ----------

function statsCanary() {
  // median/mad hand checks
  if (median([1, 2, 3]) !== 2) throw new Error('median odd');
  if (median([1, 2, 3, 4]) !== 2.5) throw new Error('median even');
  if (mad([1, 2, 3]) !== 1) throw new Error('mad');

  // 2 pairs x 1 scenario, iters_per_sample=1000. Hand-computed:
  // pair0: js [2000,3000] -> per-iter [2,3] -> med 2.5; rust [1000,1000] -> med 1 -> ratio 2.5
  // pair1: js [4000,2000] -> [4,2] -> med 3; rust [2000,1000] -> [2,1] -> med 1.5 -> ratio 2
  // point estimate exp(median([ln2.5, ln2])) = sqrt(2.5*2) = sqrt(5) ~ 2.2360679...
  // median_ratio = median([2.5, 2]) = 2.25
  const mkRes = (id, pair, runtime, times, iters) => ({
    scenario_id: id, label: id, input: 'x', options: {},
    warmup_iters: 100, samples: times.length, iters_per_sample: iters,
    pair_id: pair, runtime_id: runtime === 'js' ? 0 : 1, runtime,
    sample_times_ns: times, digest: 1, total_operations: 100 + times.length * iters,
  });
  const scenario = { id: 'S001', label: 's', input: 'x', options: {}, orientation: 'latency', description: 'd' };
  const measurements = [
    { pair_id: 0, rust_first: false, js: { runtime: 'js', results: [mkRes('S001', 0, 'js', [2000, 3000], 1000)] }, rust: { runtime: 'rust', results: [mkRes('S001', 0, 'rust', [1000, 1000], 1000)] } },
    { pair_id: 1, rust_first: true, js: { runtime: 'js', results: [mkRes('S001', 1, 'js', [4000, 2000], 1000)] }, rust: { runtime: 'rust', results: [mkRes('S001', 1, 'rust', [2000, 1000], 1000)] } },
  ];
  const row = analyzeScenario(scenario, 0, measurements, 1000, 42, 10000);
  const expectPoint = Math.sqrt(5);
  if (Math.abs(row.point_estimate_ratio - expectPoint) > 1e-9) {
    throw new Error('point estimate ' + row.point_estimate_ratio + ' != sqrt(5) ' + expectPoint);
  }
  if (row.median_ratio !== 2.25) throw new Error('median_ratio ' + row.median_ratio + ' != 2.25');
  if (row.pairs !== 2) throw new Error('pairs');
  // bootstrap CI: deterministic (seeded) and bounded by the two pair ratios
  if (!(row.ci_95_low >= 2 && row.ci_95_high <= 2.5 && row.ci_95_low <= row.ci_95_high)) {
    throw new Error('CI out of pair-ratio bounds: [' + row.ci_95_low + ', ' + row.ci_95_high + ']');
  }
  const row2 = analyzeScenario(scenario, 0, measurements, 1000, 42, 10000);
  if (JSON.stringify(row) !== JSON.stringify(row2)) throw new Error('analysis not deterministic');
  return 'point=sqrt(5)~' + row.point_estimate_ratio.toFixed(6) + ', CI=[' + row.ci_95_low.toFixed(4) + ',' + row.ci_95_high.toFixed(4) + ']';
}

// ---------- runner ----------

function main() {
  let executed = 0, failed = 0;
  const failures = [];
  const registered = canaries.length + summaryCanaries.length + cliCanaries.length + 1 + 7;

  for (const c of canaries) {
    try { runCanary(c); executed++; } catch (e) { failed++; failures.push(c.name + ': ' + e.message); }
  }
  for (const c of summaryCanaries) {
    try {
      const s = makeValidSummary(); c.mutate(s);
      const errors = validateSummary(s, { config: makeValidSummary().config });
      const found = errors.some(e => e.code === c.expectedCode);
      if (!found) throw new Error('Expected ' + c.expectedCode + ' but got: ' + JSON.stringify(errors.map(e => e.code)));
      executed++;
    } catch (e) { failed++; failures.push(c.name + ': ' + e.message); }
  }
  for (const c of cliCanaries) {
    try {
      const out = spawnSync(c.exec, c.args, { input: c.input || undefined, encoding: 'utf8', timeout: 30000 });
      // Fail closed: a process that failed to START (spawn error / null
      // status) is a canary failure, not a pass. Only a non-zero exit
      // status from a successfully started process is the expected
      // rejection of malformed input.
      if (out.error) throw new Error('process failed to start: ' + out.error.message);
      if (out.status === null) throw new Error('process terminated by signal ' + out.signal + ' (no exit status)');
      if (out.status === 0) throw new Error('CLI accepted malformed input (exit 0): ' + c.args.slice(1).join(' '));
      executed++;
    } catch (e) { failed++; failures.push(c.name + ': ' + e.message); }
  }
  try {
    const detail = statsCanary();
    console.log('  stats synthetic fixture OK (' + detail + ')');
    executed++;
  } catch (e) { failed++; failures.push('stats-synthetic: ' + e.message); }

  // ---------- verifier crash-path canaries ----------
  // These exercise the trust-boundary guards in verify-artifacts.js by
  // crafting malformed artifact directories and invoking the verifier as a
  // subprocess. Each must exit non-zero with a structured error message,
  // NOT crash with an uncaught exception.
  const VERIFY = path.join(__dirname, 'verify-artifacts.js');
  // tmpDirBase MUST reside under ROOT so that corpus_path references
  // (relative to ROOT) resolve within the repo and pass the verifier's
  // ROOT confinement check. Using os.tmpdir() would cause the path to
  // escape ROOT, rejecting the artifact before reaching the target code.
  const tmpDirBase = fs.mkdtempSync(path.join(ROOT, 'target', 'canary-verify-'));

  function makeFinalRawBase() {
    const raw = makeValidRaw();
    raw.measurements = [
      makeValidMeasurement(0, 5000, 20),
      makeValidMeasurement(1, 5000, 20),
      makeValidMeasurement(2, 5000, 20),
    ];
    return raw;
  }

  // A minimal valid summary so the verifier gets past the "Missing summary"
  // check and reaches the target code path (corpus/schedule/recompute).
  function makeMinimalSummary(raw) {
    return {
      schema_version: 2,
      provenance: raw.provenance,
      config: raw.config,
      scenarios: [],
    };
  }

  function runVerifierCanary(name, setupFn, expectedCode) {
    const dir = path.join(tmpDirBase, name);
    fs.mkdirSync(dir, { recursive: true });
    setupFn(dir);
    const out = spawnSync(process.execPath, [VERIFY, dir], { encoding: 'utf8', timeout: 30000 });
    if (out.error) throw new Error('verifier crashed (spawn error): ' + out.error.message);
    if (out.status === null) throw new Error('verifier killed by signal ' + out.signal);
    if (out.status === 0) throw new Error('verifier accepted malformed input (exit 0)');
    const stderr = (out.stderr || '') + (out.stdout || '');
    if (!stderr.includes('VERIFICATION FAILED')) {
      throw new Error('verifier exited ' + out.status + ' but did not print VERIFICATION FAILED (possible uncaught exception). stderr: ' + stderr.slice(0, 200));
    }
    if (expectedCode && !stderr.includes(expectedCode)) {
      throw new Error('verifier exited ' + out.status + ' but stderr missing expected code ' + expectedCode + '. stderr: ' + stderr.slice(0, 200));
    }
  }

  // Canary: corpus path pointing to a directory — must produce MALFORMED_CORPUS
  try {
    runVerifierCanary('corpus-is-dir', (dir) => {
      const raw = makeFinalRawBase();
      const corpusDir = path.join(dir, 'corpusdir');
      fs.mkdirSync(corpusDir, { recursive: true });
      raw.provenance.corpus_path = path.relative(ROOT, corpusDir).replace(/\\/g, '/');
      raw.provenance.schedule_sha256 = 'a'.repeat(64);
      raw.provenance.harness_sha = 'b'.repeat(40);
      fs.writeFileSync(path.join(dir, 'test-raw.json'), JSON.stringify(raw));
      fs.writeFileSync(path.join(dir, 'test-summary.json'), JSON.stringify(makeMinimalSummary(raw)));
    }, 'MALFORMED_CORPUS');
    executed++;
  } catch (e) { failed++; failures.push('verify-corpus-is-dir: ' + e.message); }

  // Canary: missing/unreadable corpus — must report corpus not found
  try {
    runVerifierCanary('corpus-missing', (dir) => {
      const raw = makeFinalRawBase();
      raw.provenance.corpus_path = 'benchmarks/nonexistent-scenarios.json';
      raw.provenance.schedule_sha256 = 'a'.repeat(64);
      raw.provenance.harness_sha = 'b'.repeat(40);
      fs.writeFileSync(path.join(dir, 'test-raw.json'), JSON.stringify(raw));
      fs.writeFileSync(path.join(dir, 'test-summary.json'), JSON.stringify(makeMinimalSummary(raw)));
    }, 'Referenced corpus not found');
    executed++;
  } catch (e) { failed++; failures.push('verify-corpus-missing: ' + e.message); }

  // Canary: malformed corpus JSON — must produce MALFORMED_CORPUS
  try {
    runVerifierCanary('corpus-malformed-json', (dir) => {
      const raw = makeFinalRawBase();
      const corpusFile = path.join(dir, 'scenarios.json');
      fs.writeFileSync(corpusFile, '{ invalid json !!!');
      raw.provenance.corpus_path = path.relative(ROOT, corpusFile).replace(/\\/g, '/');
      raw.provenance.schedule_sha256 = 'a'.repeat(64);
      raw.provenance.harness_sha = 'b'.repeat(40);
      fs.writeFileSync(path.join(dir, 'test-raw.json'), JSON.stringify(raw));
      fs.writeFileSync(path.join(dir, 'test-summary.json'), JSON.stringify(makeMinimalSummary(raw)));
    }, 'MALFORMED_CORPUS');
    executed++;
  } catch (e) { failed++; failures.push('verify-corpus-malformed-json: ' + e.message); }

  // Canary: malformed raw JSON — must produce MALFORMED_RAW
  try {
    runVerifierCanary('raw-malformed-json', (dir) => {
      fs.writeFileSync(path.join(dir, 'test-raw.json'), '{ broken raw !!!');
    }, 'MALFORMED_RAW');
    executed++;
  } catch (e) { failed++; failures.push('verify-raw-malformed-json: ' + e.message); }

  // Canary: malformed summary JSON — must produce MALFORMED_SUMMARY
  try {
    runVerifierCanary('summary-malformed-json', (dir) => {
      const raw = makeFinalRawBase();
      raw.provenance.schedule_sha256 = 'a'.repeat(64);
      raw.provenance.harness_sha = 'b'.repeat(40);
      fs.writeFileSync(path.join(dir, 'test-raw.json'), JSON.stringify(raw));
      fs.writeFileSync(path.join(dir, 'test-summary.json'), '{ broken summary !!!');
    }, 'MALFORMED_SUMMARY');
    executed++;
  } catch (e) { failed++; failures.push('verify-summary-malformed-json: ' + e.message); }

  // Canary: malformed schedule JSON — must produce MALFORMED_SCHEDULE
  try {
    runVerifierCanary('schedule-malformed-json', (dir) => {
      const raw = makeFinalRawBase();
      raw.provenance.schedule_sha256 = 'a'.repeat(64);
      raw.provenance.harness_sha = 'b'.repeat(40);
      fs.writeFileSync(path.join(dir, 'test-raw.json'), JSON.stringify(raw));
      fs.writeFileSync(path.join(dir, 'test-summary.json'), JSON.stringify(makeMinimalSummary(raw)));
      fs.writeFileSync(path.join(dir, 'test-schedule.json'), '{ broken schedule !!!');
    }, 'MALFORMED_SCHEDULE');
    executed++;
  } catch (e) { failed++; failures.push('verify-schedule-malformed-json: ' + e.message); }

  // Canary: missing results array followed by attempted recomputation — must produce MALFORMED_MEASUREMENT
  try {
    runVerifierCanary('missing-results-recompute', (dir) => {
      const raw = makeFinalRawBase();
      raw.provenance.schedule_sha256 = 'a'.repeat(64);
      raw.provenance.harness_sha = 'b'.repeat(40);
      raw.measurements[0].js = { runtime: 'js' }; // missing results array
      fs.writeFileSync(path.join(dir, 'test-raw.json'), JSON.stringify(raw));
      fs.writeFileSync(path.join(dir, 'test-summary.json'), JSON.stringify(makeMinimalSummary(raw)));
    }, 'MALFORMED_MEASUREMENT');
    executed++;
  } catch (e) { failed++; failures.push('verify-missing-results-recompute: ' + e.message); }

  // Clean up temp dir
  try { fs.rmSync(tmpDirBase, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  console.log('\n=== BENCHMARK CANARY RESULTS ===');
  console.log('Executed: ' + executed + '/' + registered);
  console.log('Failed: ' + failed);
  if (failures.length > 0) for (const f of failures) console.error('FAIL: ' + f);
  if (executed !== registered || failed > 0) { console.error('BENCHMARK CANARIES FAILED'); process.exit(1); }
  console.log('BENCHMARK CANARIES PASSED: all ' + registered + ' mutations detected.');
  process.exit(0);
}
main();
