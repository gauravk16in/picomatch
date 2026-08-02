#!/usr/bin/env node
'use strict';

// Benchmark controller — orchestrates semantic parity, digest-equality gate,
// process-pair execution, statistics, and artifact writing. Refuses to run
// in final mode unless HEAD matches the declared harness commit and the tree
// is clean.
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
//   --pilot                 reduced settings for quick validation (cannot be
//                           combined with explicit count flags)

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('node:crypto');

const { mulberry32 } = require('./prng');
const { validateRaw, validateSummary } = require('./validator');
const { analyzeScenario } = require('./stats');

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
  };
  const fail = (msg) => {
    console.error('run-benchmarks: ' + msg);
    process.exit(2);
  };
  const parseCount = (name, raw, allowZero) => {
    if (!/^\d+$/.test(raw)) fail('invalid value for ' + name + ': ' + raw + ' (must be a non-negative integer)');
    const v = Number(raw);
    if (!Number.isSafeInteger(v)) fail('invalid value for ' + name + ': ' + raw + ' (unsafe integer)');
    if (!allowZero && v <= 0) fail('invalid value for ' + name + ': ' + raw + ' (must be positive)');
    return v;
  };
  const countFlags = new Set(['--pairs', '--warmup-iters', '--samples', '--iters-per-sample']);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--pilot') {
      if (seen.has('pilot')) fail('duplicate flag: --pilot');
      seen.add('pilot');
      opts.pilot = true;
      continue;
    }
    if (seen.has(flag)) fail('duplicate flag: ' + flag);
    seen.add(flag);
    switch (flag) {
      case '--scenarios':
        if (i + 1 >= args.length) fail('missing value for --scenarios');
        opts.scenarios = args[++i];
        break;
      case '--pairs':
        if (i + 1 >= args.length) fail('missing value for --pairs');
        opts.pairs = parseCount('pairs', args[++i], false);
        break;
      case '--warmup-iters':
        if (i + 1 >= args.length) fail('missing value for --warmup-iters');
        opts.warmupIters = parseCount('warmup-iters', args[++i], false);
        break;
      case '--samples':
        if (i + 1 >= args.length) fail('missing value for --samples');
        opts.samples = parseCount('samples', args[++i], false);
        break;
      case '--iters-per-sample':
        if (i + 1 >= args.length) fail('missing value for --iters-per-sample');
        opts.itersPerSample = parseCount('iters-per-sample', args[++i], false);
        break;
      case '--seed':
        if (i + 1 >= args.length) fail('missing value for --seed');
        opts.seed = parseCount('seed', args[++i], true);
        break;
      case '--results-dir':
        if (i + 1 >= args.length) fail('missing value for --results-dir');
        opts.resultsDir = args[++i];
        break;
      case '--harness-sha':
        if (i + 1 >= args.length) fail('missing value for --harness-sha');
        opts.harnessSha = args[++i];
        if (!/^[0-9a-f]{40}$/i.test(opts.harnessSha)) fail('malformed --harness-sha (expected 40 hex chars)');
        break;
      default:
        fail('unknown argument: ' + flag);
    }
  }
  if (opts.pilot) {
    const explicitCounts = countFlags.intersection(seen);
    if (explicitCounts.size > 0) {
      fail('--pilot cannot be combined with explicit count flags: ' + [...explicitCounts].join(', '));
    }
    opts.pairs = 3;
    opts.warmupIters = 500;
    opts.samples = 10;
    opts.itersPerSample = 2000;
  }
  if (opts.pilot && opts.harnessSha) {
    fail('--pilot and --harness-sha are mutually exclusive (final mode requires a non-pilot run)');
  }
  return opts;
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
  const binExt = process.platform === 'win32' ? '.exe' : '';
  const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const benchBinSha = sha256File(benchBin + binExt);
  const probeBinSha = sha256File(probeBin + binExt);
  const toolchain = fs.readFileSync(path.join(ROOT, 'rust-toolchain.toml'), 'utf8');
  const toolchainChannel = (toolchain.match(/channel\s*=\s*"([^"]+)"/) || [])[1] || 'unknown';

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
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const platformStr = os.platform();
  const runBase = dateStr + '-' + platformStr;
  const schedulePath = path.join(opts.resultsDir, runBase + '-schedule.json');
  if (!fs.existsSync(opts.resultsDir)) fs.mkdirSync(opts.resultsDir, { recursive: true });
  const scheduleBuf = Buffer.from(JSON.stringify(schedule, null, 2));
  fs.writeFileSync(schedulePath, scheduleBuf);
  const scheduleSha = crypto.createHash('sha256').update(scheduleBuf).digest('hex');
  console.error('  Schedule saved (' + opts.pairs + ' pairs, sha256 ' + scheduleSha.slice(0, 12) + '…)');

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

  console.error('\n[5] Digest-equality gate (outside timing)...');
  // The canonical digest is byte-identical across runtimes by spec; per
  // scenario, every pair's JS digest must equal its Rust digest. The in-loop
  // consumption accumulator is content-derived with an identical op sequence
  // and must also match. Together these are whole-run semantic equality
  // proofs on the measured result consumption.
  let digestChecks = 0;
  const digestMismatches = [];
  for (const m of measurements) {
    for (const jsRes of m.js.results) {
      const rustRes = (m.rust.results || []).find(r => r.scenario_id === jsRes.scenario_id);
      digestChecks++;
      if (!rustRes || rustRes.digest !== jsRes.digest) {
        digestMismatches.push('pair ' + m.pair_id + ' ' + jsRes.scenario_id +
          ': js=' + jsRes.digest + ' rust=' + (rustRes ? rustRes.digest : 'missing'));
      }
      if (rustRes && rustRes.consumption !== jsRes.consumption) {
        digestMismatches.push('pair ' + m.pair_id + ' ' + jsRes.scenario_id +
          ' consumption: js=' + jsRes.consumption + ' rust=' + rustRes.consumption);
      }
    }
  }
  if (digestMismatches.length > 0) {
    console.error('DIGEST/CONSUMPTION EQUALITY FAILED (' + digestMismatches.length + ' mismatches):');
    for (const d of digestMismatches.slice(0, 10)) console.error('  ' + d);
    process.exit(1);
  }
  console.error('  Digest + consumption equality OK (' + digestChecks + ' scenario/pair checks)');

  console.error('\n[6] Validating raw results...');
  const mode = opts.pilot ? 'pilot' : 'final';
  const rawArtifact = {
    schema_version: 2,
    provenance: {
      harness_sha: headSha,
      dirty_tree: isDirty,
      corpus_sha256: corpusSha,
      corpus_path: path.relative(ROOT, opts.scenarios),
      schedule_sha256: scheduleSha,
      schedule: schedule,
      scanbench_sha256: benchBinSha,
      scanprobe_sha256: probeBinSha,
      cargo: {
        profile: 'release',
        opt_level: 3,
        lto: 'default (off)',
        codegen_units: 16,
        toolchain_channel: toolchainChannel,
      },
      environment: {
        platform: os.platform(),
        os_release: os.release(),
        arch: os.arch(),
        cpu: (os.cpus()[0] || {}).model || 'unknown',
        node: process.version,
      },
    },
    config: {
      mode: mode,
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
    mode: mode,
    schedule: schedule,
  });
  if (rawErrors.length > 0) {
    console.error('RAW VALIDATION FAILED:');
    for (const e of rawErrors) console.error('  [' + e.code + '] ' + e.message);
    process.exit(1);
  }
  console.error('  Raw validation OK');

  console.error('\n[7] Computing statistics...');
  const summary = {
    schema_version: 2,
    provenance: rawArtifact.provenance,
    config: rawArtifact.config,
    scenarios: [],
  };

  for (const scenario of scenarios) {
    summary.scenarios.push(analyzeScenario(
      scenario,
      scenarioIds.indexOf(scenario.id),
      measurements,
      opts.itersPerSample,
      opts.seed,
      rawArtifact.config.bootstrap_resamples
    ));
  }

  const summaryErrors = validateSummary(summary, {});
  if (summaryErrors.length > 0) {
    console.error('SUMMARY VALIDATION FAILED:');
    for (const e of summaryErrors) console.error('  [' + e.code + '] ' + e.message);
    process.exit(1);
  }
  console.error('  Summary validation OK');

  console.error('\n[8] Writing artifacts...');
  const rawPath = path.join(opts.resultsDir, runBase + '-raw.json');
  const summaryPath = path.join(opts.resultsDir, runBase + '-summary.json');

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
