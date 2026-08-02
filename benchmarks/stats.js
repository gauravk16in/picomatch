'use strict';

// Shared benchmark statistics — the ONE implementation used by both the
// benchmark controller (run-benchmarks.js) and the independent verifier
// (verify-artifacts.js). Extracting this removes the duplication risk of
// two drifting statistic implementations.

const { mulberry32 } = require('./prng');

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mad(arr) {
  const med = median(arr);
  return median(arr.map(x => Math.abs(x - med)));
}

/**
 * Analyze one scenario across process pairs.
 *
 * Estimator (documented in BENCHMARKS.md):
 *  - per pair: per-iteration times = sample_times_ns / itersPerSample;
 *    pair estimate = median over samples, per runtime;
 *  - per pair: ratio = js_median / rust_median; log ratio = ln(ratio);
 *  - point estimate = exp(median of per-pair log ratios);
 *  - CI: cluster bootstrap over PAIRS (resample whole pair log-ratios with
 *    replacement, never flattened samples), deterministic seed
 *    (seed + scenarioIndex), `resamples` draws, percentile interval with
 *    symmetric indices ceil(p*n)-1, exponentiated to the ratio scale.
 *
 * Returns the summary row. Throws on non-finite intermediate values.
 */
function analyzeScenario(scenario, scenarioIndex, measurements, itersPerSample, seed, resamples) {
  const id = scenario.id;
  const pairLogSpeedups = [];
  const pairRatios = [];

  for (const m of measurements) {
    const jsRes = (m.js.results || []).find(r => r.scenario_id === id);
    const rustRes = (m.rust.results || []).find(r => r.scenario_id === id);
    if (!jsRes || !rustRes) continue;
    const jsPerIter = jsRes.sample_times_ns.map(ns => ns / itersPerSample);
    const rustPerIter = rustRes.sample_times_ns.map(ns => ns / itersPerSample);
    const jsMed = median(jsPerIter);
    const rustMed = median(rustPerIter);
    const ratio = jsMed / rustMed;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new Error('non-finite or non-positive ratio for scenario ' + id + ': ' + ratio);
    }
    pairLogSpeedups.push(Math.log(ratio));
    pairRatios.push(ratio);
  }

  const bootRng = mulberry32(seed + scenarioIndex);
  const bootMedians = [];
  for (let b = 0; b < resamples; b++) {
    const sample = [];
    for (let j = 0; j < pairLogSpeedups.length; j++) {
      sample.push(pairLogSpeedups[Math.floor(bootRng() * pairLogSpeedups.length)]);
    }
    bootMedians.push(median(sample));
  }
  bootMedians.sort((a, b) => a - b);
  const n = bootMedians.length;
  // Symmetric percentile indices: ceil(p*n)-1 at both tails.
  const ciLo = Math.exp(bootMedians[Math.ceil(0.025 * n) - 1]);
  const ciHi = Math.exp(bootMedians[Math.ceil(0.975 * n) - 1]);
  const pointEstimate = Math.exp(median(pairLogSpeedups));

  return {
    scenario_id: id,
    label: scenario.label,
    input: scenario.input,
    options: scenario.options,
    orientation: scenario.orientation,
    description: scenario.description,
    pairs: pairRatios.length,
    point_estimate_ratio: pointEstimate,
    median_ratio: median(pairRatios),
    mad_ratio: mad(pairRatios),
    ci_95_low: ciLo,
    ci_95_high: ciHi,
    ci_overlap: ciLo <= 1 && 1 <= ciHi,
    all_ratios: pairRatios,
  };
}

module.exports = { median, mad, analyzeScenario };
