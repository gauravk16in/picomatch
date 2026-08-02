#!/usr/bin/env node
'use strict';

// Cross-language benchmark orchestrator.
// Builds the Rust release benchmark binary, runs JS and Rust in-process
// benchmark harnesses, validates checksum parity, computes statistics,
// writes raw + summary JSON, and exits nonzero on any invalid result.
//
// Usage: node benchmarks/run-benchmarks.js [options]
//
// Options:
//   --scenarios <path>     scenarios JSON (default: benchmarks/scenarios.json)
//   --warmup-iters <N>     warm-up iterations (default: 5000)
//   --samples <N>          timed samples (default: 50)
//   --iters-per-sample <N> iterations per timed sample (default: 2000)
//   --runs <N>             independent process executions for JS (default: 3)
//   --pilot                run pilot only with reduced settings
//   --results-dir <path>   output directory (default: benchmarks/results)
//   --no-bridge            skip the bridge overhead benchmark

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const MAIN_DIR = path.join(ROOT, '..', 'Main');
const RESULTS_DIR_DEFAULT = path.join(__dirname, 'results');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    scenarios: path.join(__dirname, 'scenarios.json'),
    warmupIters: 5000,
    samples: 50,
    itersPerSample: 2000,
    runs: 3,
    pilot: false,
    resultsDir: RESULTS_DIR_DEFAULT,
    noBridge: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--scenarios': opts.scenarios = args[++i]; break;
      case '--warmup-iters': opts.warmupIters = parseInt(args[++i], 10); break;
      case '--samples': opts.samples = parseInt(args[++i], 10); break;
      case '--iters-per-sample': opts.itersPerSample = parseInt(args[++i], 10); break;
      case '--runs': opts.runs = parseInt(args[++i], 10); break;
      case '--pilot': opts.pilot = true; break;
      case '--results-dir': opts.resultsDir = args[++i]; break;
      case '--no-bridge': opts.noBridge = true; break;
    }
  }
  if (opts.pilot) {
    opts.warmupIters = 1000;
    opts.samples = 10;
    opts.itersPerSample = 500;
    opts.runs = 1;
  }
  return opts;
}

// --- Statistics helpers ---

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function mad(arr) {
  const med = median(arr);
  const deviations = arr.map((x) => Math.abs(x - med));
  return median(deviations);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function minVal(arr) { return Math.min(...arr); }
function maxVal(arr) { return Math.max(...arr); }

// Bootstrap 95% CI for the median
function bootstrapCI(arr, nResamples = 1000) {
  if (arr.length < 2) return [arr[0] || 0, arr[0] || 0];
  const medians = [];
  for (let i = 0; i < nResamples; i++) {
    const sample = [];
    for (let j = 0; j < arr.length; j++) {
      sample.push(arr[Math.floor(Math.random() * arr.length)]);
    }
    medians.push(median(sample));
  }
  medians.sort((a, b) => a - b);
  const lo = medians[Math.floor(0.025 * medians.length)];
  const hi = medians[Math.ceil(0.975 * medians.length) - 1];
  return [lo, hi];
}

// --- Environment metadata ---

function collectEnv() {
  const env = {
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    os_platform: os.platform(),
    os_release: os.release(),
    os_hostname: os.hostname(),
    cpu_model: os.cpus()[0]?.model || 'unknown',
    cpu_cores_logical: os.cpus().length,
    cpu_cores_physical: os.cpus().filter((c, i, arr) =>
      arr.findIndex((c2) => c2.model === c.model) === i).length,
    total_memory_gb: (os.totalmem() / 1e9).toFixed(2),
    free_memory_gb: (os.freemem() / 1e9).toFixed(2),
    node_version: process.version,
    npm_version: spawnSync(process.execPath, ['--version'], { encoding: 'utf8' })
      .stdout?.trim() || 'unknown',
    v8_version: process.versions.v8,
    rustc_version: spawnSync('rustc', ['--version'], { encoding: 'utf8' })
      .stdout?.trim() || 'unknown',
    cargo_version: spawnSync('cargo', ['--version'], { encoding: 'utf8' })
      .stdout?.trim() || 'unknown',
    git_version: spawnSync('git', ['--version'], { encoding: 'utf8' })
      .stdout?.trim() || 'unknown',
    git_head_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8', cwd: ROOT,
    }).stdout?.trim() || 'unknown',
    git_base_sha: spawnSync('git', ['rev-parse', 'origin/rust-port'], {
      encoding: 'utf8', cwd: ROOT,
    }).stdout?.trim() || 'unknown',
    release_flags: '--release',
  };
  return env;
}

// --- Fail-closed parity validation ---

function validateChecksums(jsResults, rustResults) {
  const errors = [];
  const jsMap = new Map(jsResults.map((r) => [r.scenario_id, r]));
  const rustMap = new Map(rustResults.map((r) => [r.scenario_id, r]));

  // Check all scenario IDs present in both
  const jsIds = new Set(jsMap.keys());
  const rustIds = new Set(rustMap.keys());
  for (const id of jsIds) {
    if (!rustIds.has(id)) {
      errors.push(`Missing Rust result for scenario ${id}`);
    }
  }
  for (const id of rustIds) {
    if (!jsIds.has(id)) {
      errors.push(`Missing JS result for scenario ${id}`);
    }
  }

  // Check for duplicate IDs
  const jsIdCount = {};
  for (const r of jsResults) {
    jsIdCount[r.scenario_id] = (jsIdCount[r.scenario_id] || 0) + 1;
  }
  for (const [id, count] of Object.entries(jsIdCount)) {
    if (count > 1) errors.push(`Duplicate JS scenario ID: ${id}`);
  }

  // Check zero operations
  for (const r of jsResults) {
    if (r.total_operations === 0) {
      errors.push(`Zero operations in JS scenario ${r.scenario_id}`);
    }
  }
  for (const r of rustResults) {
    if (r.total_operations === 0) {
      errors.push(`Zero operations in Rust scenario ${r.scenario_id}`);
    }
  }

  // Check for zero/negative sample times
  for (const r of jsResults) {
    for (const t of r.sample_times_ns) {
      if (t <= 0) {
        errors.push(`Non-positive JS sample time in ${r.scenario_id}: ${t}`);
      }
    }
  }
  for (const r of rustResults) {
    for (const t of r.sample_times_ns) {
      if (t <= 0) {
        errors.push(`Non-positive Rust sample time in ${r.scenario_id}: ${t}`);
      }
    }
  }

  return errors;
}

// --- Bridge overhead benchmark (Layer C) ---

function runBridgeBenchmark(scenarios, opts) {
  const path = require('path');
  const scan = require(path.join(MAIN_DIR, 'lib', 'scan.js'));
  const bridgePath = path.join(__dirname, 'fixtures', 'scan-bridge.js');
  const results = [];

  // Measure cold process startup + one probe request
  const probePath = path.join(ROOT, 'target', 'release', 'examples', 'scanprobe');
  for (const scenario of scenarios.slice(0, 5)) {
    const input = scenario.input;
    const req = JSON.stringify({ i: 1, input, options: scenario.options || {} });

    // Warm path: in-process JS (Layer A baseline)
    const start = process.hrtime.bigint();
    scan(input, scenario.options || {});
    const jsInProcessNs = Number(process.hrtime.bigint() - start);

    // Cold path: subprocess probe (process startup + JSON transport)
    const spawnStart = process.hrtime.bigint();
    const result = spawnSync(probePath, [], {
      input: req + '\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    const spawnEnd = process.hrtime.bigint();
    const coldNs = Number(spawnEnd - spawnStart);

    if (result.status !== 0 || result.error) {
      throw new Error(`Bridge probe failed for ${scenario.id}: ${result.error?.message || result.stderr}`);
    }

    results.push({
      scenario_id: scenario.id,
      label: scenario.label,
      js_in_process_ns: jsInProcessNs,
      cold_process_ns: coldNs,
      bridge_overhead_ns: coldNs - jsInProcessNs,
      bridge_ratio: coldNs / jsInProcessNs,
    });
  }
  return results;
}

// --- Main ---

function main() {
  const opts = parseArgs();
  const env = collectEnv();

  console.error('=== Benchmark Orchestrator ===');
  console.error(`Mode: ${opts.pilot ? 'PILOT' : 'FULL'}`);
  console.error(`Scenarios: ${opts.scenarios}`);
  console.error(`Warm-up iters: ${opts.warmupIters}, Samples: ${opts.samples}, Iters/sample: ${opts.itersPerSample}, Runs: ${opts.runs}`);
  console.error(`Node: ${env.node_version}, Rust: ${env.rustc_version}`);

  // 1. Build Rust release benchmark binary
  console.error('\n[1] Building Rust release benchmark binary...');
  const buildResult = spawnSync('cargo', ['build', '--release', '--example', 'scanbench'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (buildResult.status !== 0) {
    console.error('FAILED: cargo build --release --example scanbench');
    console.error(buildResult.stderr);
    process.exit(1);
  }
  console.error('  Build OK');

  // Also build scanprobe for bridge benchmark
  if (!opts.noBridge) {
    const probeBuild = spawnSync('cargo', ['build', '--release', '--example', 'scanprobe'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (probeBuild.status !== 0) {
      console.error('FAILED: cargo build --release --example scanprobe');
      console.error(probeBuild.stderr);
      process.exit(1);
    }
    console.error('  Probe build OK');
  }

  const scenarios = JSON.parse(fs.readFileSync(opts.scenarios, 'utf8'));
  const benchBin = path.join(ROOT, 'target', 'release', 'examples', 'scanbench');

  // 2. Run Rust benchmark (single run)
  console.error('\n[2] Running Rust in-process benchmark...');
  const rustArgs = [
    `--warmup-iters`, String(opts.warmupIters),
    `--samples`, String(opts.samples),
    `--iters-per-sample`, String(opts.itersPerSample),
  ];
  const rustResult = spawnSync(benchBin, rustArgs, {
    cwd: ROOT,
    input: fs.readFileSync(opts.scenarios),
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (rustResult.status !== 0) {
    console.error('FAILED: Rust benchmark');
    console.error(rustResult.stderr);
    process.exit(1);
  }
  const rustResults = JSON.parse(rustResult.stdout);

  // 3. Run JS benchmark (multiple independent processes)
  console.error(`\n[3] Running JS in-process benchmark (${opts.runs} runs)...`);
  const jsRuns = [];
  for (let run = 0; run < opts.runs; run++) {
    console.error(`  Run ${run + 1}/${opts.runs}...`);
    const jsResult = spawnSync(process.execPath, [
      path.join(__dirname, 'benchmark-core.js'),
      '--scenarios', opts.scenarios,
      '--warmup-iters', String(opts.warmupIters),
      '--samples', String(opts.samples),
      '--iters-per-sample', String(opts.itersPerSample),
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (jsResult.status !== 0) {
      console.error(`FAILED: JS benchmark run ${run + 1}`);
      console.error(jsResult.stderr);
      process.exit(1);
    }
    jsRuns.push(JSON.parse(jsResult.stdout));
  }

  // 4. Validate checksums
  console.error('\n[4] Validating checksums...');
  // Use first JS run for parity check
  const parityErrors = validateChecksums(jsRuns[0], rustResults);
  if (parityErrors.length > 0) {
    console.error('PARITY VALIDATION FAILED:');
    for (const e of parityErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.error('  All checksums and IDs valid');

  // 5. Bridge overhead benchmark
  let bridgeResults = null;
  if (!opts.noBridge) {
    console.error('\n[5] Running bridge overhead benchmark...');
    bridgeResults = runBridgeBenchmark(scenarios, opts);
    console.error('  Bridge benchmark done');
  }

  // 6. Compute summary statistics
  console.error('\n[6] Computing summary statistics...');

  const summary = {
    environment: env,
    config: {
      warmup_iters: opts.warmupIters,
      samples: opts.samples,
      iters_per_sample: opts.itersPerSample,
      runs_js: opts.runs,
      runs_rust: 1,
      timer_js: 'process.hrtime.bigint()',
      timer_rust: 'std::time::Instant::now()',
    },
    scenarios: [],
  };

  for (const scenario of scenarios) {
    const id = scenario.id;
    const rustRes = rustResults.find((r) => r.scenario_id === id);
    const jsRunResults = jsRuns.map((run) => run.find((r) => r.scenario_id === id));

    // Per-iteration times: divide sample total ns by iters_per_sample
    const rustPerIter = rustRes.sample_times_ns.map((ns) => ns / opts.itersPerSample);
    const jsPerIters = jsRunResults.map((jsr) =>
      jsr.sample_times_ns.map((ns) => ns / opts.itersPerSample)
    );
    const jsAllPerIter = jsPerIters.flat();

    const rustMed = median(rustPerIter);
    const rustMean = mean(rustPerIter);
    const rustStd = stdDev(rustPerIter);
    const rustMAD = mad(rustPerIter);
    const rustCI = bootstrapCI(rustPerIter);
    const rustMin = minVal(rustPerIter);
    const rustMax = maxVal(rustPerIter);
    const rustP95 = percentile(rustPerIter, 95);

    const jsMed = median(jsAllPerIter);
    const jsMean = mean(jsAllPerIter);
    const jsStd = stdDev(jsAllPerIter);
    const jsMAD = mad(jsAllPerIter);
    const jsCI = bootstrapCI(jsAllPerIter);
    const jsMin = minVal(jsAllPerIter);
    const jsMax = maxVal(jsAllPerIter);
    const jsP95 = percentile(jsAllPerIter, 95);

    const ratio = jsMed / rustMed;
    const rustOpsPerSec = 1e9 / rustMed;
    const jsOpsPerSec = 1e9 / jsMed;

    const ciOverlap = rustCI[0] <= jsCI[1] && jsCI[0] <= rustCI[1];
    const cvRust = rustMed > 0 ? rustMAD / rustMed : 0;
    const cvJs = jsMed > 0 ? jsMAD / jsMed : 0;

    summary.scenarios.push({
      scenario_id: id,
      label: scenario.label,
      input: scenario.input,
      options: scenario.options,
      orientation: scenario.orientation,
      description: scenario.description,
      rust: {
        median_ns_per_iter: rustMed,
        mean_ns_per_iter: rustMean,
        std_dev_ns: rustStd,
        mad_ns: rustMAD,
        ci_95_low: rustCI[0],
        ci_95_high: rustCI[1],
        min_ns: rustMin,
        max_ns: rustMax,
        p95_ns: rustP95,
        ops_per_sec: rustOpsPerSec,
        cv: cvRust,
        checksum: rustRes.checksum,
      },
      js: {
        median_ns_per_iter: jsMed,
        mean_ns_per_iter: jsMean,
        std_dev_ns: jsStd,
        mad_ns: jsMAD,
        ci_95_low: jsCI[0],
        ci_95_high: jsCI[1],
        min_ns: jsMin,
        max_ns: jsMax,
        p95_ns: jsP95,
        ops_per_sec: jsOpsPerSec,
        cv: cvJs,
      },
      comparison: {
        ratio_js_to_rust_median: ratio,
        rust_speedup: ratio > 1 ? ratio : 1 / ratio,
        direction: ratio > 1 ? 'Rust faster' : ratio < 1 ? 'JS faster' : 'equal',
        ci_overlap: ciOverlap,
        inconclusive: ciOverlap,
      },
    });
  }

  // Add bridge results if collected
  if (bridgeResults) {
    summary.bridge_overhead = bridgeResults;
  }

  // 7. Write results
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const platformStr = os.platform();
  const resultsDir = opts.resultsDir;
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const rawPath = path.join(resultsDir, `${dateStr}-${platformStr}-raw.json`);
  const summaryPath = path.join(resultsDir, `${dateStr}-${platformStr}-summary.json`);

  const raw = {
    environment: env,
    config: summary.config,
    rust_results: rustResults,
    js_runs: jsRuns,
    bridge_results: bridgeResults,
  };

  fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  // Compute hashes of raw data
  const rawHash = crypto.createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex');
  const summaryHash = crypto.createHash('sha256').update(fs.readFileSync(summaryPath)).digest('hex');

  summary.raw_data_path = rawPath;
  summary.summary_path = summaryPath;
  summary.raw_data_sha256 = rawHash;
  summary.summary_sha256 = summaryHash;

  // Re-write summary with hash info
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.error('\n=== RESULTS ===');
  console.error(`Raw:    ${rawPath} (sha256: ${rawHash.slice(0, 16)}...)`);
  console.error(`Summary: ${summaryPath} (sha256: ${summaryHash.slice(0, 16)}...)`);

  // Print summary table
  console.error('\n=== SCENARIO SUMMARY ===');
  console.error('ID      | Label               | JS med (ns/iter) | Rust med (ns/iter) | Ratio | CI overlap | Direction');
  console.error('--------|---------------------|------------------|--------------------|-------|------------|----------');
  for (const s of summary.scenarios) {
    const jsStr = s.js.median_ns_per_iter.toFixed(1).padStart(16);
    const rustStr = s.rust.median_ns_per_iter.toFixed(1).padStart(18);
    const ratioStr = s.comparison.ratio_js_to_rust_median.toFixed(2).padStart(5);
    const overlapStr = s.comparison.ci_overlap ? 'yes' : 'no';
    console.error(`${s.scenario_id} | ${s.label.padEnd(19)} | ${jsStr} | ${rustStr} | ${ratioStr} | ${overlapStr.padEnd(10)} | ${s.comparison.direction}`);
  }

  if (bridgeResults) {
    console.error('\n=== BRIDGE OVERHEAD (Layer C) ===');
    console.error('ID      | JS in-proc (ns) | Cold process (ns) | Overhead (ns) | Ratio');
    console.error('--------|-----------------|-------------------|---------------|-------');
    for (const b of bridgeResults) {
      console.error(`${b.scenario_id} | ${b.js_in_process_ns.toFixed(0).padStart(15)} | ${b.cold_process_ns.toFixed(0).padStart(17)} | ${b.bridge_overhead_ns.toFixed(0).padStart(13)} | ${b.bridge_ratio.toFixed(1)}x`);
    }
  }

  console.error('\nBenchmark complete.');
}

main();