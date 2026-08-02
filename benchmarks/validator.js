'use strict';

const ErrorCodes = {
  MISSING_RUNTIME: 'MISSING_RUNTIME',
  DUPLICATE_RUNTIME: 'DUPLICATE_RUNTIME',
  MISSING_PAIR: 'MISSING_PAIR',
  DUPLICATE_PAIR_ID: 'DUPLICATE_PAIR_ID',
  NONCONTIGUOUS_PAIR_ID: 'NONCONTIGUOUS_PAIR_ID',
  NESTED_PAIR_ID_MISMATCH: 'NESTED_PAIR_ID_MISMATCH',
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
  MALFORMED_DIGEST: 'MALFORMED_DIGEST',
  CONSUMPTION_MISMATCH: 'CONSUMPTION_MISMATCH',
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
  SAMPLE_LENGTH_MISMATCH: 'SAMPLE_LENGTH_MISMATCH',
  TOTAL_OPS_MISMATCH: 'TOTAL_OPS_MISMATCH',
  WRONG_WARMUP: 'WRONG_WARMUP',
  WRONG_MODE: 'WRONG_MODE',
  MISSING_PROVENANCE: 'MISSING_PROVENANCE',
  WRONG_SCHEDULE: 'WRONG_SCHEDULE',
  CONFIG_MISMATCH: 'CONFIG_MISMATCH',
};

function isU32(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xFFFFFFFF;
}

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
  const expWarmup = exp.warmupIters || 0;
  const expSeed = exp.seed;
  const expPrng = exp.prng || 'mulberry32';
  const expHarnessSha = exp.harnessSha;
  const expCorpusSha = exp.corpusSha;
  const expDirty = exp.dirtyTree;
  const expMode = exp.mode;
  const expSchedule = exp.schedule;

  if (raw.schema_version !== 2) {
    errors.push({ code: ErrorCodes.SCHEMA_VERSION, message: 'expected schema_version=2, got ' + raw.schema_version });
  }

  // --- config surface ---
  const cfg = raw.config || {};
  if (cfg.mode !== 'pilot' && cfg.mode !== 'full' && cfg.mode !== 'final') {
    errors.push({ code: ErrorCodes.WRONG_MODE, message: 'config.mode must be "pilot", "full", or "final", got ' + cfg.mode });
  }
  if (expMode && cfg.mode !== expMode) {
    errors.push({ code: ErrorCodes.WRONG_MODE, message: 'expected mode ' + expMode + ', got ' + cfg.mode });
  }
  if (expSeed !== undefined && cfg.seed !== expSeed) {
    errors.push({ code: ErrorCodes.WRONG_SEED, message: 'expected seed ' + expSeed + ', got ' + cfg.seed });
  }
  if (cfg.prng !== expPrng) {
    errors.push({ code: ErrorCodes.UNKNOWN_PRNG, message: 'expected prng ' + expPrng + ', got ' + cfg.prng });
  }
  if (cfg.bootstrap_resamples !== undefined && cfg.bootstrap_resamples < 10000) {
    errors.push({ code: ErrorCodes.BOOTSTRAP_TOO_FEW, message: 'bootstrap_resamples must be >= 10000, got ' + cfg.bootstrap_resamples });
  }

  // --- provenance surface ---
  const prov = raw.provenance || {};
  if (expDirty === false && prov.dirty_tree !== false) {
    errors.push({ code: ErrorCodes.DIRTY_TREE, message: 'tree was dirty when benchmark was run' });
  }
  if (expHarnessSha && prov.harness_sha !== expHarnessSha) {
    errors.push({ code: ErrorCodes.WRONG_HARNESS_COMMIT, message: 'expected ' + expHarnessSha + ', got ' + prov.harness_sha });
  }
  if (expCorpusSha && prov.corpus_sha256 !== expCorpusSha) {
    errors.push({ code: ErrorCodes.WRONG_CORPUS_SHA, message: 'expected ' + expCorpusSha + ', got ' + prov.corpus_sha256 });
  }
  if (!prov.schedule_sha256 || !Array.isArray(prov.schedule)) {
    errors.push({ code: ErrorCodes.MISSING_PROVENANCE, message: 'provenance must embed schedule_sha256 and the schedule entries' });
  }
  if (!prov.scanbench_sha256 || !prov.scanprobe_sha256) {
    errors.push({ code: ErrorCodes.MISSING_PROVENANCE, message: 'provenance must embed benchmark binary SHA-256 hashes' });
  }

  // --- parity proof: present, passing, and covering every expected scenario ---
  if (!raw.parity || !Array.isArray(raw.parity) || raw.parity.length === 0) {
    errors.push({ code: ErrorCodes.MISSING_PARITY_PROOF, message: 'no semantic parity proof in raw' });
  } else {
    const covered = new Set();
    for (const p of raw.parity) {
      if (!p.ok) {
        errors.push({ code: ErrorCodes.ALTERED_SEMANTIC_OUTPUT, message: 'parity failed for ' + (p.scenario_id || '?') + ': ' + (p.detail || '') });
      }
      if (p.scenario_id) covered.add(p.scenario_id);
    }
    for (const expId of expScenarios) {
      if (!covered.has(expId)) {
        errors.push({ code: ErrorCodes.MISSING_PARITY_ROW, message: 'parity proof missing scenario: ' + expId });
      }
    }
  }

  // --- measurements ---
  if (!raw.measurements || !Array.isArray(raw.measurements)) {
    errors.push({ code: ErrorCodes.MISSING_PAIR, message: 'no measurements array' });
    return errors;
  }
  const measurements = raw.measurements;
  if (expPairs > 0 && measurements.length !== expPairs) {
    errors.push({ code: ErrorCodes.WRONG_PROCESS_COUNT, message: 'expected ' + expPairs + ' pairs, got ' + measurements.length });
  }

  // Pair IDs: unique and contiguous 0..n-1, executed in schedule order.
  const pairIds = measurements.map(m => m.pair_id);
  const seenPairIds = new Set();
  for (const pid of pairIds) {
    if (seenPairIds.has(pid)) {
      errors.push({ code: ErrorCodes.DUPLICATE_PAIR_ID, message: 'duplicate pair_id: ' + pid });
    }
    seenPairIds.add(pid);
  }
  const sortedIds = [...pairIds].sort((a, b) => a - b);
  for (let k = 0; k < sortedIds.length; k++) {
    if (sortedIds[k] !== k) {
      errors.push({ code: ErrorCodes.NONCONTIGUOUS_PAIR_ID, message: 'pair IDs are not contiguous 0..' + (sortedIds.length - 1) + ': found ' + sortedIds.join(',') });
      break;
    }
  }
  for (let k = 0; k < measurements.length; k++) {
    if (measurements[k].pair_id !== k) {
      errors.push({ code: ErrorCodes.WRONG_EXECUTION_ORDER, message: 'measurement ' + k + ' has pair_id ' + measurements[k].pair_id + ' (execution must follow schedule order)' });
      break;
    }
  }

  // Schedule agreement: measurements' rust_first must match the embedded schedule.
  const sched = Array.isArray(prov.schedule) ? prov.schedule : [];
  if (expSchedule) {
    if (JSON.stringify(sched) !== JSON.stringify(expSchedule)) {
      errors.push({ code: ErrorCodes.WRONG_SCHEDULE, message: 'embedded schedule does not match the seeded expectation' });
    }
  }
  for (const m of measurements) {
    const se = sched.find(s => s.pair_id === m.pair_id);
    if (se && se.rust_first !== m.rust_first) {
      errors.push({ code: ErrorCodes.WRONG_EXECUTION_ORDER, message: 'pair ' + m.pair_id + ' rust_first=' + m.rust_first + ' contradicts schedule (' + se.rust_first + ')' });
    }
  }

  // Runtimes: exactly one js and one rust per pair, correctly labeled.
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

  // Per-scenario rows: structure, counts, values, digest equality.
  for (const m of measurements) {
    const perRuntime = {};
    for (const runtime of ['js', 'rust']) {
      if (!m[runtime] || !Array.isArray(m[runtime].results)) continue;
      const res = m[runtime].results;
      perRuntime[runtime] = res;
      const seenScenarios = new Set();
      for (const r of res) {
        if (seenScenarios.has(r.scenario_id)) {
          errors.push({ code: ErrorCodes.DUPLICATE_SCENARIO, message: 'pair ' + m.pair_id + ' ' + runtime + ' duplicate scenario: ' + r.scenario_id });
        }
        seenScenarios.add(r.scenario_id);
        if (expScenarios.length > 0 && !expScenarios.includes(r.scenario_id)) {
          errors.push({ code: ErrorCodes.UNKNOWN_SCENARIO, message: 'pair ' + m.pair_id + ' ' + runtime + ' unknown scenario: ' + r.scenario_id });
        }
        if (r.pair_id !== m.pair_id) {
          errors.push({ code: ErrorCodes.NESTED_PAIR_ID_MISMATCH, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' has nested pair_id ' + r.pair_id });
        }
        if (expSamples > 0 && r.samples !== expSamples) {
          errors.push({ code: ErrorCodes.WRONG_SAMPLES, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' expected ' + expSamples + ' samples, got ' + r.samples });
        }
        if (expIters > 0 && r.iters_per_sample !== expIters) {
          errors.push({ code: ErrorCodes.WRONG_ITERS_PER_SAMPLE, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' expected ' + expIters + ' iters, got ' + r.iters_per_sample });
        }
        if (expWarmup > 0 && r.warmup_iters !== expWarmup) {
          errors.push({ code: ErrorCodes.WRONG_WARMUP, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' expected ' + expWarmup + ' warmup, got ' + r.warmup_iters });
        }
        // Internal consistency: worker row counts must agree with raw.config.
        if (cfg.samples !== undefined && r.samples !== cfg.samples) {
          errors.push({ code: ErrorCodes.CONFIG_MISMATCH, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' samples=' + r.samples + ' contradicts config.samples=' + cfg.samples });
        }
        if (cfg.iters_per_sample !== undefined && r.iters_per_sample !== cfg.iters_per_sample) {
          errors.push({ code: ErrorCodes.CONFIG_MISMATCH, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' iters=' + r.iters_per_sample + ' contradicts config.iters_per_sample=' + cfg.iters_per_sample });
        }
        if (!Array.isArray(r.sample_times_ns)) {
          errors.push({ code: ErrorCodes.MISSING_SCENARIO, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' missing sample_times_ns' });
          continue;
        }
        if (r.sample_times_ns.length !== r.samples) {
          errors.push({ code: ErrorCodes.SAMPLE_LENGTH_MISMATCH, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' sample_times_ns length ' + r.sample_times_ns.length + ' != declared samples ' + r.samples });
        }
        if (r.total_operations !== r.warmup_iters + r.samples * r.iters_per_sample) {
          errors.push({ code: ErrorCodes.TOTAL_OPS_MISMATCH, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' total_operations=' + r.total_operations + ' != warmup+samples*iters=' + (r.warmup_iters + r.samples * r.iters_per_sample) });
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
        if (!isU32(r.digest)) {
          errors.push({ code: ErrorCodes.MALFORMED_DIGEST, message: 'pair ' + m.pair_id + ' ' + runtime + ' ' + r.scenario_id + ' digest is not a u32: ' + r.digest });
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
    // Canonical digest equality: identical spec on both runtimes, verified
    // outside timing for every scenario of every pair. The in-loop
    // consumption accumulator must also match (content-derived, identical
    // op sequence on both runtimes).
    if (perRuntime.js && perRuntime.rust) {
      for (const jsRes of perRuntime.js) {
        const rustRes = perRuntime.rust.find(r => r.scenario_id === jsRes.scenario_id);
        if (rustRes && isU32(jsRes.digest) && isU32(rustRes.digest) && jsRes.digest !== rustRes.digest) {
          errors.push({ code: ErrorCodes.MISMATCHED_DIGEST, message: 'pair ' + m.pair_id + ' ' + jsRes.scenario_id + ' js digest ' + jsRes.digest + ' != rust digest ' + rustRes.digest });
        }
        if (rustRes && isU32(jsRes.consumption) && isU32(rustRes.consumption) && jsRes.consumption !== rustRes.consumption) {
          errors.push({ code: ErrorCodes.CONSUMPTION_MISMATCH, message: 'pair ' + m.pair_id + ' ' + jsRes.scenario_id + ' js consumption ' + jsRes.consumption + ' != rust consumption ' + rustRes.consumption });
        }
      }
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
  if (summary.schema_version !== 2) {
    errors.push({ code: ErrorCodes.SCHEMA_VERSION, message: 'expected schema_version=2, got ' + summary.schema_version });
  }
  if (!Array.isArray(summary.scenarios)) {
    errors.push({ code: ErrorCodes.MISSING_SCENARIO, message: 'no scenarios array in summary' });
    return errors;
  }
  const exp = expected || {};
  if (exp.config !== undefined && JSON.stringify(summary.config) !== JSON.stringify(exp.config)) {
    errors.push({ code: ErrorCodes.CONFIG_MISMATCH, message: 'summary config does not match raw config' });
  }
  if (exp.provenance !== undefined && JSON.stringify(summary.provenance) !== JSON.stringify(exp.provenance)) {
    errors.push({ code: ErrorCodes.CONFIG_MISMATCH, message: 'summary provenance does not match raw provenance' });
  }
  const seen = new Set();
  for (const s of summary.scenarios) {
    if (seen.has(s.scenario_id)) {
      errors.push({ code: ErrorCodes.DUPLICATE_SCENARIO, message: 'summary duplicate scenario: ' + s.scenario_id });
    }
    seen.add(s.scenario_id);
    const lo = s.comparison ? s.comparison.ci_95_low : s.ci_95_low;
    const hi = s.comparison ? s.comparison.ci_95_high : s.ci_95_high;
    if (lo !== undefined && hi !== undefined) {
      if (typeof lo !== 'number' || typeof hi !== 'number' || Number.isNaN(lo) || Number.isNaN(hi)) {
        errors.push({ code: ErrorCodes.MALFORMED_CI, message: 'scenario ' + s.scenario_id + ' has malformed CI' });
      } else if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0) {
        errors.push({ code: ErrorCodes.MALFORMED_CI, message: 'scenario ' + s.scenario_id + ' has non-finite or non-positive CI' });
      } else if (lo > hi) {
        errors.push({ code: ErrorCodes.REVERSED_CI, message: 'scenario ' + s.scenario_id + ' has reversed CI: lo=' + lo + ' hi=' + hi });
      }
    }
    for (const k of ['point_estimate_ratio', 'median_ratio', 'mad_ratio']) {
      if (s[k] !== undefined && (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || s[k] < 0)) {
        errors.push({ code: ErrorCodes.MALFORMED_CI, message: 'scenario ' + s.scenario_id + ' has invalid ' + k + ': ' + s[k] });
      }
    }
  }
  if (exp.scenarios && Array.isArray(exp.scenarios)) {
    for (const expId of exp.scenarios) {
      if (!seen.has(expId)) {
        errors.push({ code: ErrorCodes.MISSING_SCENARIO, message: 'summary missing scenario: ' + expId });
      }
    }
    if (summary.scenarios.length !== exp.scenarios.length) {
      errors.push({ code: ErrorCodes.WRONG_SCENARIO_COUNT, message: 'summary has ' + summary.scenarios.length + ' scenarios, expected ' + exp.scenarios.length });
    }
  }
  return errors;
}

module.exports = { ErrorCodes, validateRaw, validateSummary };
