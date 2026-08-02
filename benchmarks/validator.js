'use strict';

const ErrorCodes = {
  MISSING_RUNTIME: 'MISSING_RUNTIME',
  DUPLICATE_RUNTIME: 'DUPLICATE_RUNTIME',
  MISSING_PAIR: 'MISSING_PAIR',
  DUPLICATE_PAIR_ID: 'DUPLICATE_PAIR_ID',
  DUPLICATE_PROCESS_ID: 'DUPLICATE_PROCESS_ID',
  MISSING_SCENARIO: 'MISSING_SCENARIO',
  DUPLICATE_SCENARIO: 'DUPLICATE_SCENARIO',
  UNKNOWN_SCENARIO: 'UNKNOWN_SCENARIO',
  WRONG_SCENARIO_COUNT: 'WRONG_SCENARIO_COUNT',
  WRONG_PROCESS_COUNT: 'WRONG_PROCESS_COUNT',
  UNEQUAL_RUNTIME_COUNTS: 'UNEQUAL_RUNTIME_COUNTS',
  WRONG_EXECUTION_ORDER: 'WRONG_EXECUTION_ORDER',
  WRONG_SEED: 'WRONG_SEED',
  UNKNOWN_PRNG: 'UNKNOWN_PRNG',
  MISSING_PARITY_ROW: 'MISSING_PARITY_ROW',
  ALTERED_SEMANTIC_OUTPUT: 'ALTERED_SEMANTIC_OUTPUT',
  MISMATCHED_DIGEST: 'MISMATCHED_DIGEST',
  WRONG_CORPUS_SHA: 'WRONG_CORPUS_SHA',
  WRONG_HARNESS_COMMIT: 'WRONG_HARNESS_COMMIT',
  DIRTY_TREE: 'DIRTY_TREE',
  ZERO_ELAPSED: 'ZERO_ELAPSED',
  NEGATIVE_ELAPSED: 'NEGATIVE_ELAPSED',
  ZERO_ITERATIONS: 'ZERO_ITERATIONS',
  NAN_VALUE: 'NAN_VALUE',
  INFINITY_VALUE: 'INFINITY_VALUE',
  UNSAFE_INTEGER: 'UNSAFE_INTEGER',
  ALTERED_RAW: 'ALTERED_RAW',
  ALTERED_SUMMARY: 'ALTERED_SUMMARY',
  WRONG_SIDECAR_HASH: 'WRONG_SIDECAR_HASH',
  INVALID_CLI_OPTION: 'INVALID_CLI_OPTION',
  MISSING_CLI_VALUE: 'MISSING_CLI_VALUE',
  UNEXPECTED_POSITIONAL: 'UNEXPECTED_POSITIONAL',
  BOOTSTRAP_TOO_FEW: 'BOOTSTRAP_TOO_FEW',
  MALFORMED_CI: 'MALFORMED_CI',
  REVERSED_CI: 'REVERSED_CI',
  MISSING_PARITY_PROOF: 'MISSING_PARITY_PROOF',
  SCHEMA_VERSION: 'SCHEMA_VERSION',
  WRONG_ITERS_PER_SAMPLE: 'WRONG_ITERS_PER_SAMPLE',
  WRONG_SAMPLES: 'WRONG_SAMPLES',
};

function validateRaw(raw, expected) {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    errors.push({ code: ErrorCodes.SCHEMA_VERSION, message: 'raw is not an object' });
    return errors;
  }
  const exp = expected || {};
  const expScenarios = exp.scenarios || [];
  const expPairs = exp.pairs || 0;
  const expIters = exp.itersPerSample || 0;
  const expSamples = exp.samples || 0;
  const expSeed = exp.seed;
  const expPrng = exp.prng || 'mulberry32';
  const expHarnessSha = exp.harnessSha;
  const expCorpusSha = exp.corpusSha;
  const expDirty = exp.dirtyTree;

  if (raw.schema_version !== 1) {
    errors.push({ code: ErrorCodes.SCHEMA_VERSION, message: 'expected schema_version=1, got ' + raw.schema_version });
  }
  if (expDirty === false && raw.provenance && raw.provenance.dirty_tree !== false) {
    errors.push({ code: ErrorCodes.DIRTY_TREE, message: 'tree was dirty when benchmark was run' });
  }
  if (expHarnessSha && raw.provenance && raw.provenance.harness_sha !== expHarnessSha) {
    errors.push({ code: ErrorCodes.WRONG_HARNESS_COMMIT, message: 'expected ' + expHarnessSha + ', got ' + (raw.provenance && raw.provenance.harness_sha) });
  }
  if (expCorpusSha && raw.provenance && raw.provenance.corpus_sha256 !== expCorpusSha) {
    errors.push({ code: ErrorCodes.WRONG_CORPUS_SHA, message: 'expected ' + expCorpusSha + ', got ' + (raw.provenance && raw.provenance.corpus_sha256) });
  }
  if (expSeed !== undefined && raw.config && raw.config.seed !== expSeed) {
    errors.push({ code: ErrorCodes.WRONG_SEED, message: 'expected seed ' + expSeed + ', got ' + (raw.config && raw.config.seed) });
  }
  if (raw.config && raw.config.prng !== expPrng) {
    errors.push({ code: ErrorCodes.UNKNOWN_PRNG, message: 'expected prng ' + expPrng + ', got ' + (raw.config && raw.config.prng) });
  }
  if (!raw.parity || !Array.isArray(raw.parity) || raw.parity.length === 0) {
    errors.push({ code: ErrorCodes.MISSING_PARITY_PROOF, message: 'no semantic parity proof in raw' });
  } else {
    for (const p of raw.parity) {
      if (!p.ok) {
        errors.push({ code: ErrorCodes.ALTERED_SEMANTIC_OUTPUT, message: 'parity failed for ' + (p.scenario_id || '?') + ': ' + (p.detail || '') });
      }
    }
  }
  if (!raw.measurements || !Array.isArray(raw.measurements)) {
    errors.push({ code: ErrorCodes.MISSING_PAIR, message: 'no measurements array' });
    return errors;
  }
  const measurements = raw.measurements;
  if (expPairs > 0 && measurements.length !== expPairs) {
    errors.push({ code: ErrorCodes.WRONG_PROCESS_COUNT, message: 'expected ' + expPairs + ' pairs, got ' + measurements.length });
  }
  const pairIds = new Set();
  for (const m of measurements) {
    if (pairIds.has(m.pair_id)) {
      errors.push({ code: ErrorCodes.DUPLICATE_PAIR_ID, message: 'duplicate pair_id: ' + m.pair_id });
    }
    pairIds.add(m.pair_id);
  }
  for (const m of measurements) {
    if (!m.js || !m.rust) {
      errors.push({ code: ErrorCodes.MISSING_RUNTIME, message: 'pair ' + m.pair_id + ' missing runtime (js or rust)' });
    }
    if (m.js && m.rust) {
      if (m.js.runtime !== 'js') {
        errors.push({ code: ErrorCodes.MISSING_RUNTIME, message: 'pair ' + m.pair_id + ' js has wrong runtime label: ' + m.js.runtime });
      }
      if (m.rust.runtime !== 'rust') {
        errors.push({ code: ErrorCodes.MISSING_RUNTIME, message: 'pair ' + m.pair_id + ' rust has wrong runtime label: ' + m.rust.runtime });
      }
    }
  }
  for (const m of measurements) {
    for (const runtime of ['js', 'rust']) {
      if (!m[runtime] || !Array.isArray(m[runtime].results)) continue;
      const res = m[runtime].results;
      const seenScenarios = new Set();
      for (const r of res) {
        if (seenScenarios.has(r.scenario_id)) {
          errors.push({ code: ErrorCodes.DUPLICATE_SCENARIO, message: 'pair ' + m.pair_id + ' ' + runtime + ' duplicate scenario: ' + r.scenario_id });
        }
        seenScenarios.add(r.scenario_id);
        if (expScenarios.length > 0 && !expScenarios.includes(r.scenario_id)) {
          errors.push({ code: ErrorCodes.UNKNOWN_SCENARIO, message: 'pair ' + m.pair_id + ' ' + runtime + ' unknown scenario: ' + r.scenario_id });
        }
        if (expSamples > 0 && r.samples !== expSamples) {
          errors.push({ code: ErrorCodes.WRONG_SAMPLES, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' expected ' + expSamples + ' samples, got ' + r.samples });
        }
        if (expIters > 0 && r.iters_per_sample !== expIters) {
          errors.push({ code: ErrorCodes.WRONG_ITERS_PER_SAMPLE, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' expected ' + expIters + ' iters, got ' + r.iters_per_sample });
        }
        if (!Array.isArray(r.sample_times_ns)) {
          errors.push({ code: ErrorCodes.MISSING_SCENARIO, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' missing sample_times_ns' });
          continue;
        }
        for (let i = 0; i < r.sample_times_ns.length; i++) {
          const t = r.sample_times_ns[i];
          if (typeof t !== 'number' || Number.isNaN(t)) {
            errors.push({ code: ErrorCodes.NAN_VALUE, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' sample ' + i + ' is NaN' });
          } else if (t === Infinity) {
            errors.push({ code: ErrorCodes.INFINITY_VALUE, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' sample ' + i + ' is Infinity' });
          } else if (t === 0) {
            errors.push({ code: ErrorCodes.ZERO_ELAPSED, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' sample ' + i + ' is zero' });
          } else if (t < 0) {
            errors.push({ code: ErrorCodes.NEGATIVE_ELAPSED, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' sample ' + i + ' is negative: ' + t });
          } else if (t > Number.MAX_SAFE_INTEGER) {
            errors.push({ code: ErrorCodes.UNSAFE_INTEGER, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' sample ' + i + ' is unsafe: ' + t });
          }
        }
        if (r.total_operations === 0) {
          errors.push({ code: ErrorCodes.ZERO_ITERATIONS, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' has zero operations' });
        }
      }
      if (expScenarios.length > 0) {
        for (const expId of expScenarios) {
          if (!seenScenarios.has(expId)) {
            errors.push({ code: ErrorCodes.MISSING_SCENARIO, message: 'pair ' + m.pair_id + ' ' + runtime + ' missing scenario: ' + expId });
          }
        }
      }
    }
  }
  // Note: digest is for anti-optimization (prevent DCE), NOT for cross-runtime
  // correctness comparison. Semantic parity is proven separately by the parity
  // gate using deepStrictEqual. Digests use different string encodings and are
  // not expected to match.
  if (raw.config && raw.config.bootstrap_resamples !== undefined) {
    if (raw.config.bootstrap_resamples < 10000) {
      errors.push({ code: ErrorCodes.BOOTSTRAP_TOO_FEW, message: 'bootstrap_resamples must be >= 10000, got ' + raw.config.bootstrap_resamples });
    }
  }
  return errors;
}

function validateSummary(summary, expected) {
  const errors = [];
  if (!summary || typeof summary !== 'object') {
    errors.push({ code: ErrorCodes.SCHEMA_VERSION, message: 'summary is not an object' });
    return errors;
  }
  if (summary.schema_version !== 1) {
    errors.push({ code: ErrorCodes.SCHEMA_VERSION, message: 'expected schema_version=1, got ' + summary.schema_version });
  }
  if (!Array.isArray(summary.scenarios)) {
    errors.push({ code: ErrorCodes.MISSING_SCENARIO, message: 'no scenarios array in summary' });
    return errors;
  }
  for (const s of summary.scenarios) {
    const lo = s.comparison ? s.comparison.ci_95_low : s.ci_95_low;
    const hi = s.comparison ? s.comparison.ci_95_high : s.ci_95_high;
    if (lo !== undefined && hi !== undefined) {
      if (typeof lo !== 'number' || typeof hi !== 'number' || Number.isNaN(lo) || Number.isNaN(hi)) {
        errors.push({ code: ErrorCodes.MALFORMED_CI, message: 'scenario ' + s.scenario_id + ' has malformed CI' });
      } else if (lo > hi) {
        errors.push({ code: ErrorCodes.REVERSED_CI, message: 'scenario ' + s.scenario_id + ' has reversed CI: lo=' + lo + ' hi=' + hi });
      }
    }
  }
  return errors;
}

module.exports = { ErrorCodes, validateRaw, validateSummary };
