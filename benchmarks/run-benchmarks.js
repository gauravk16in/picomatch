#!/usr/bin/env node
'use strict';

// Benchmark controller — orchestrates semantic parity, process-pair execution,
// statistics, and artifact writing. Refuses to run unless HEAD matches the
// declared harness commit and the tree is clean.
//
// Usage: node benchmarks/run-benchmarks.js [options]
//
// Options:
//   --scenarios <path>     scenarios JSON (default: benchmarks/scenarios.json)
//   --pairs <N>             process pairs (default: 20)
//   --warmup-iters <N>      warm-up iterations (default 1000)
//   --samples <N>           timed samples (default 20)
//   --iters-per-sample <N>  iterations per timed sample (default 5000)
//   --seed <N>              PRNG seed (default 42)
//   --results-dir <path>    output directory (default: benchmarks/results)
//   --harness-sha <sha>     expected harness commit SHA (required for final run)
//   --pilot                 reduced settings for quick validation
//   --no-bridge             skip bridge overhead benchmark

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('node:crypto');

const { mulberry32 } = require('./prng');
const { validateRaw, validateSummary, ErrorCodes } = require('./validator');

const ROOT = path.join(__dirname, '..');
const MAIN_DIR = path.join(ROOT, '..', 'Main');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    scenarios: path.join(__dirname, 'scenarios.json'),
    pairs: 20,
    warmupIters: 1000,
    samples: 20,
    itersPerSample: 5000,
    seed: 42,
    resultsDir: path.join(__dirname, 'results'),
    harnessSha: null,
    pilot: false,
    noBridge: false,
  };
  const validOpts = new Set(['--scenarios', '--pairs', '--warmup-iters', '--samples', '--iters-per-sample', '--seed', '--results-dir', '--harness-sha', '--pilot', '--no-bridge']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!validOpts.has(arg)) {
      throw new Error('Unknown CLI option: ' + arg);
    }
    switch (arg) {
      case '--scenarios': opts.scenarios = args[++i]; break;
      case '--pairs': opts.pairs = parseInt(args[++i], 10); break;
      case '--warmup-iters': opts.warmupIters = parseInt(args[++i], 10); break;
      case '--samples': opts.samples = parseInt(args[++i], 10); break;
      case '--iters-per-sample': opts.itersPerSample = parseInt(args[++i], 10); break;
      case '--seed': opts.seed = parseInt(args[++i], 10); break;
      case '--results-dir': opts.resultsDir = args[++i]; break;
      case '--harness-sha': opts.harnessSha = args[++i]; break;
      case '--pilot': opts.pilot = true; break;
      case '--no-bridge': opts.noBridge = true; break;
    }
  }
  for (const [k, v] of Object.entries(opts)) {
    if (['scenarios', 'resultsDir', 'harnessSha', 'pilot', 'noBridge'].includes(k)) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new Error('Invalid ' + k + ': ' + v + ' (must be positive integer)');
    }
  }
  if (opts.pilot) {
    opts.pairs = 3;
    opts.warmupIters = 500;
    opts.samples = 10;
    opts.itersPerSample = 2000;
  }
  return opts;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mad(arr) {
  const med = median(arr);
  return median(arr.map(x => Math.abs(x - med)));
}

// Encode input as UTF-16 code units for the Rust probe
function encodeInput(input) {
  let isAscii = true;
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 0x7f) { isAscii = false; break; }
  }
  if (isAscii) return input;
  // Iterate by code unit index, not by code point iterator
  const units = [];
  for (let i = 0; i < input.length; i++) {
    units.push(input.charCodeAt(i));
  }
  return { __u16: units };
}

function decodeRustState(s) {
  function decStr(v) {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && Array.isArray(v.__u16)) {
      // Reconstruct from UTF-16 code units (handles surrogate pairs correctly)
      let str = '';
      for (let i = 0; i < v.__u16.length; i++) str += String.fromCharCode(v.__u16[i]);
      return str;
    }
    return '';
  }
  function decNum(v) {
    if (v && typeof v === 'object' && typeof v.__num === 'string') return Number(v.__num);
    return typeof v === 'number' ? v : undefined;
  }
  function decToken(t) {
    const tok = { value: decStr(t.value), isGlob: t.isGlob === true };
    if (t.depth !== undefined && t.depth !== null) tok.depth = decNum(t.depth);
    if (t.backslashes === true) tok.backslashes = true;
    if (t.isBrace === true) tok.isBrace = true;
    if (t.isBracket === true) tok.isBracket = true;
    if (t.isExtglob === true) tok.isExtglob = true;
    if (t.isGlobstar === true) tok.isGlobstar = true;
    if (t.negated === true) tok.negated = true;
    if (t.isPrefix === true) tok.isPrefix = true;
    return tok;
  }
  const state = {
    prefix: decStr(s.prefix), input: decStr(s.input), start: s.start,
    base: decStr(s.base), glob: decStr(s.glob),
    isBrace: s.isBrace === true, isBracket: s.isBracket === true,
    isGlob: s.isGlob === true, isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true, negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  if (s.tokens !== undefined && s.tokens !== null) state.tokens = s.tokens.map(decToken);
  if (s.maxDepth !== undefined && s.maxDepth !== null) state.maxDepth = decNum(s.maxDepth);
  if (s.slashes !== undefined && s.slashes !== null) state.slashes = s.slashes.map(Number);
  if (s.parts !== undefined && s.parts !== null) state.parts = s.parts.map(decStr);
  return state;
}

function runSemanticParity(scenarios, scanBridgePath) {
  const parity = [];
  const scan = require(path.join(MAIN_DIR, 'lib', 'scan.js'));
  const { compareStates } = require(path.join(ROOT, 'fixtures', 'integrated-harness-core.js'));

  for (const scenario of scenarios) {
    const input = scenario.input;
    const scanOpts = scenario.options || {};

    let jsState;
    try {
      jsState = scan(input, scanOpts);
    } catch (e) {
      parity.push({ scenario_id: scenario.id, ok: false, detail: 'JS threw: ' + e.message });
      return parity;
    }

    const encInput = encodeInput(input);
    const req = JSON.stringify({ i: 0, input: encInput, options: scanOpts }) + '\n';
    const result = spawnSync(scanBridgePath, [], { input: req, encoding: 'utf8', timeout: 10000 });
    if (result.status !== 0 || result.error) {
      parity.push({ scenario_id: scenario.id, ok: false, detail: 'Rust probe failed: ' + (result.error ? result.error.message : result.stderr) });
      return parity;
    }
    const lines = result.stdout.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) {
      parity.push({ scenario_id: scenario.id, ok: false, detail: 'Rust probe empty output' });
      return parity;
    }
    const row = JSON.parse(lines[lines.length - 1]);
    if (row.probeError) {
      parity.push({ scenario_id: scenario.id, ok: false, detail: 'Rust probe error: ' + row.probeError });
      return parity;
    }

    const rustDecoded = decodeRustState(row.state);
    try {
      compareStates(jsState, rustDecoded);
      parity.push({ scenario_id: scenario.id, ok: true });
    } catch (e) {
      parity.push({ scenario_id: scenario.id, ok: false, detail: e.message });
    }
  }
  return parity;
}

function main() {
  const opts = parseArgs();

  const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: ROOT }).stdout.trim();
  const dirtyStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8', cwd: ROOT }).stdout.trim();
  const isDirty = dirtyStatus.length > 0;

  if (opts.harnessSha && headSha !== opts.harnessSha) {
    throw new Error('HEAD (' + headSha + ') does not match declared harness SHA (' + opts.harnessSha + ')');
  }
  if (opts.harnessSha && isDirty) {
    throw new Error('Worktree is dirty. Clean tree required for final benchmark run.\n' + dirtyStatus);
  }

  console.error('=== Benchmark Controller ===');
  console.error('Mode: ' + (opts.pilot ? 'PILOT' : 'FULL'));
  console.error('Pairs: ' + opts.pairs + ', Warmup: ' + opts.warmupIters + ', Samples: ' + opts.samples + ', Iters: ' + opts.itersPerSample);
  console.error('Seed: ' + opts.seed + ', HEAD: ' + headSha + ', Dirty: ' + isDirty);

  console.error('\n[1] Building Rust release binaries...');
  const buildResult = spawnSync('cargo', ['build', '--release', '--example', 'scanbench', '--example', 'scanprobe'], {
    cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
  });
  if (buildResult.status !== 0) {
    console.error('Build failed:'); console.error(buildResult.stderr);
    process.exit(1);
  }
  console.error('  Build OK');

  const scenarios = JSON.parse(fs.readFileSync(opts.scenarios, 'utf8'));
  const scenarioIds = scenarios.map(s => s.id);
  const corpusContent = fs.readFileSync(opts.scenarios);
  const corpusSha = crypto.createHash('sha256').update(corpusContent).digest('hex');

  const benchBin = path.join(ROOT, 'target', 'release', 'examples', 'scanbench');
  const probeBin = path.join(ROOT, 'target', 'release', 'examples', 'scanprobe');

  console.error('\n[2] Running semantic parity gate...');
  const parity = runSemanticParity(scenarios, probeBin);
  const parityFailures = parity.filter(p => !p.ok);
  if (parityFailures.length > 0) {
    console.error('PARITY GATE FAILED:');
    for (const p of parityFailures) console.error('  ' + p.scenario_id + ': ' + p.detail);
    process.exit(1);
  }
  console.error('  Parity OK (' + parity.length + ' scenarios)');

  console.error('\n[3] Generating execution order schedule...');
  const rng = mulberry32(opts.seed);
  const schedule = [];
  for (let p = 0; p < opts.pairs; p++) {
    schedule.push({ pair_id: p, rust_first: rng() < 0.5 });
  }
  const schedulePath = path.join(opts.resultsDir, 'execution-schedule.json');
  if (!fs.existsSync(opts.resultsDir)) fs.mkdirSync(opts.resultsDir, { recursive: true });
  fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
  console.error('  Schedule saved (' + opts.pairs + ' pairs)');

  console.error('\n[4] Running ' + opts.pairs + ' process pairs...');
  const measurements = [];
  const scenariosBuf = fs.readFileSync(opts.scenarios);

  for (const entry of schedule) {
    const pairId = entry.pair_id;
    const rustFirst = entry.rust_first;
    console.error('  Pair ' + (pairId + 1) + '/' + opts.pairs + '...');

    const runJsWorker = () => {
      const result = spawnSync(process.execPath, [
        path.join(__dirname, 'bench-worker.js'),
        '--scenarios', opts.scenarios,
        '--warmup-iters', String(opts.warmupIters),
        '--samples', String(opts.samples),
        '--iters-per-sample', String(opts.itersPerSample),
        '--pair-id', String(pairId),
      ], { cwd: ROOT, encoding: 'utf8', timeout: 600000, maxBuffer: 100 * 1024 * 1024 });
      if (result.status !== 0) throw new Error('JS worker failed (pair ' + pairId + '): ' + result.stderr);
      return JSON.parse(result.stdout);
    };

    const runRustWorker = () => {
      const result = spawnSync(benchBin, [
        '--warmup-iters', String(opts.warmupIters),
        '--samples', String(opts.samples),
        '--iters-per-sample', String(opts.itersPerSample),
        '--pair-id', String(pairId),
      ], { cwd: ROOT, input: scenariosBuf, encoding: 'utf8', timeout: 600000, maxBuffer: 100 * 1024 * 1024 });
      if (result.status !== 0) throw new Error('Rust worker failed: ' + result.stderr);
      return JSON.parse(result.stdout);
    };

    let jsResults, rustResults;
    if (rustFirst) {
      rustResults = runRustWorker();
      jsResults = runJsWorker();
    } else {
      jsResults = runJsWorker();
      rustResults = runRustWorker();
    }

    measurements.push({
      pair_id: pairId, rust_first: rustFirst,
      js: { runtime: 'js', results: jsResults },
      rust: { runtime: 'rust', results: rustResults },
    });
  }
  console.error('  All pairs complete');

  console.error('\n[5] Validating raw results...');
  const rawArtifact = {
    schema_version: 1,
    provenance: {
      harness_sha: headSha,
      dirty_tree: isDirty,
      corpus_sha256: corpusSha,
      corpus_path: path.relative(ROOT, opts.scenarios),
    },
    config: {
      warmup_iters: opts.warmupIters,
      samples: opts.samples,
      iters_per_sample: opts.itersPerSample,
      pairs: opts.pairs,
      seed: opts.seed,
      prng: 'mulberry32',
      timer_js: 'process.hrtime.bigint()',
      timer_rust: 'std::time::Instant',
      bootstrap_resamples: 10000,
    },
    parity: parity,
    measurements: measurements,
  };

  const rawErrors = validateRaw(rawArtifact, {
    scenarios: scenarioIds,
    pairs: opts.pairs,
    itersPerSample: opts.itersPerSample,
    samples: opts.samples,
    seed: opts.seed,
    corpusSha: corpusSha,
    harnessSha: opts.harnessSha ? headSha : null,
    dirtyTree: opts.harnessSha ? false : null,
  });
  if (rawErrors.length > 0) {
    console.error('RAW VALIDATION FAILED:');
    for (const e of rawErrors) console.error('  [' + e.code + '] ' + e.message);
    process.exit(1);
  }
  console.error('  Raw validation OK');

  console.error('\n[6] Computing statistics...');
  const summary = {
    schema_version: 1,
    provenance: rawArtifact.provenance,
    config: rawArtifact.config,
    scenarios: [],
  };

  for (const scenario of scenarios) {
    const id = scenario.id;
    const pairLogSpeedups = [];
    const pairRatios = [];

    for (const m of measurements) {
      const jsRes = (m.js.results || []).find(r => r.scenario_id === id);
      const rustRes = (m.rust.results || []).find(r => r.scenario_id === id);
      if (!jsRes || !rustRes) continue;
      const jsPerIter = jsRes.sample_times_ns.map(ns => ns / opts.itersPerSample);
      const rustPerIter = rustRes.sample_times_ns.map(ns => ns / opts.itersPerSample);
      const jsMed = median(jsPerIter);
      const rustMed = median(rustPerIter);
      const ratio = jsMed / rustMed;
      pairLogSpeedups.push(Math.log(ratio));
      pairRatios.push(ratio);
    }

    const bootRng = mulberry32(opts.seed + scenarioIds.indexOf(id));
    const bootMedians = [];
    for (let b = 0; b < 10000; b++) {
      const sample = [];
      for (let j = 0; j < pairLogSpeedups.length; j++) {
        sample.push(pairLogSpeedups[Math.floor(bootRng() * pairLogSpeedups.length)]);
      }
      bootMedians.push(median(sample));
    }
    bootMedians.sort((a, b) => a - b);
    const ciLo = Math.exp(bootMedians[Math.floor(0.025 * bootMedians.length)]);
    const ciHi = Math.exp(bootMedians[Math.ceil(0.975 * bootMedians.length) - 1]);
    const pointEstimate = Math.exp(median(pairLogSpeedups));

    summary.scenarios.push({
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
    });
  }

  const summaryErrors = validateSummary(summary, {});
  if (summaryErrors.length > 0) {
    console.error('SUMMARY VALIDATION FAILED:');
    for (const e of summaryErrors) console.error('  [' + e.code + '] ' + e.message);
    process.exit(1);
  }
  console.error('  Summary validation OK');

  console.error('\n[7] Writing artifacts...');
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const platformStr = os.platform();
  const rawPath = path.join(opts.resultsDir, dateStr + '-' + platformStr + '-raw.json');
  const summaryPath = path.join(opts.resultsDir, dateStr + '-' + platformStr + '-summary.json');

  fs.writeFileSync(rawPath, JSON.stringify(rawArtifact, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  const rawSha = crypto.createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex');
  const summarySha = crypto.createHash('sha256').update(fs.readFileSync(summaryPath)).digest('hex');
  fs.writeFileSync(rawPath + '.sha256', rawSha + '\n');
  fs.writeFileSync(summaryPath + '.sha256', summarySha + '\n');

  console.error('\n=== RESULTS ===');
  console.error('Raw:     ' + rawPath + ' (sha256: ' + rawSha.slice(0, 16) + '...)');
  console.error('Summary: ' + summaryPath + ' (sha256: ' + summarySha.slice(0, 16) + '...)');

  console.error('\n=== SCENARIO SUMMARY ===');
  console.error('ID     | Label               | Ratio  | CI low | CI high | Overlap');
  console.error('-------|---------------------|--------|--------|---------|--------');
  for (const s of summary.scenarios) {
    const ratio = s.point_estimate_ratio.toFixed(2).padStart(5);
    const lo = s.ci_95_low.toFixed(2).padStart(5);
    const hi = s.ci_95_high.toFixed(2).padStart(5);
    const overlap = s.ci_overlap ? 'yes' : 'no';
    console.error(s.scenario_id + ' | ' + s.label.padEnd(19) + ' | ' + ratio + ' | ' + lo + ' | ' + hi + '    | ' + overlap);
  }

  console.error('\nBenchmark complete.');
}

main();
