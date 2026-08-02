#!/usr/bin/env node
'use strict';

// JavaScript benchmark harness — calls the real Main/lib/scan.js directly
// in-process (no subprocess, no JSON transport, no file I/O in timed regions).
// Uses process.hrtime.bigint() for high-resolution timing.
//
// Usage:
//   node benchmarks/benchmark-core.js [options]
//
// Options:
//   --scenarios <path>     path to scenarios JSON (default: benchmarks/scenarios.json)
//   --warmup-iters <N>     warm-up iterations per scenario (default 5000)
//   --samples <N>          timed samples per scenario (default 50)
//   --iters-per-sample <N> iterations per timed sample (default 2000)
//
// Output: JSON array of scenario results to stdout.

const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');

// Import the real scanner from the JS reference implementation
const scan = require(path.join(__dirname, '..', '..', 'Main', 'lib', 'scan.js'));

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    scenarios: path.join(__dirname, 'scenarios.json'),
    warmupIters: 5000,
    samples: 50,
    itersPerSample: 2000,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--scenarios':
        opts.scenarios = args[++i];
        break;
      case '--warmup-iters':
        opts.warmupIters = parseInt(args[++i], 10);
        break;
      case '--samples':
        opts.samples = parseInt(args[++i], 10);
        break;
      case '--iters-per-sample':
        opts.itersPerSample = parseInt(args[++i], 10);
        break;
    }
  }
  return opts;
}

// Compute a deterministic checksum of the scanner state to ensure work is
// consumed and not optimized away by V8. We fold key observable fields.
function stateChecksum(state) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const foldStr = (s) => {
    if (typeof s !== 'string') return;
    for (let i = 0; i < s.length; i++) {
      h ^= BigInt(s.charCodeAt(i));
      h = (h * prime) & 0xFFFFFFFFFFFFFFFFn;
    }
  };
  const foldNum = (n) => {
    h ^= BigInt(n);
    h = (h * prime) & 0xFFFFFFFFFFFFFFFFn;
  };
  const foldBool = (b) => {
    h ^= BigInt(b ? 1 : 0);
    h = (h * prime) & 0xFFFFFFFFFFFFFFFFn;
  };

  foldStr(state.prefix);
  foldStr(state.input);
  foldStr(state.base);
  foldStr(state.glob);
  foldBool(state.isBrace);
  foldBool(state.isBracket);
  foldBool(state.isGlob);
  foldBool(state.isExtglob);
  foldBool(state.isGlobstar);
  foldBool(state.negated);
  foldBool(state.negatedExtglob);
  foldNum(state.start);

  if (Array.isArray(state.slashes)) {
    for (const s of state.slashes) foldNum(s);
  }
  if (Array.isArray(state.parts)) {
    for (const p of state.parts) foldStr(p);
  }
  if (Array.isArray(state.tokens)) {
    for (const t of state.tokens) {
      foldStr(t.value);
      foldBool(t.isGlob);
      if (t.depth !== undefined) foldNum(typeof t.depth === 'number' ? t.depth : 0);
      if (t.backslashes) foldBool(t.backslashes);
      if (t.isBrace) foldBool(t.isBrace);
      if (t.isBracket) foldBool(t.isBracket);
      if (t.isExtglob) foldBool(t.isExtglob);
      if (t.isGlobstar) foldBool(t.isGlobstar);
      if (t.negated) foldBool(t.negated);
      if (t.isPrefix) foldBool(t.isPrefix);
    }
  }
  if (state.maxDepth !== undefined) {
    foldNum(typeof state.maxDepth === 'number' ? state.maxDepth : 0);
  }
  return Number(h & 0xFFFFFFFFFFFFFFFFn);
}

function main() {
  const opts = parseArgs();
  const scenarios = JSON.parse(fs.readFileSync(opts.scenarios, 'utf8'));
  const results = [];

  for (const scenario of scenarios) {
    const input = scenario.input;
    const scanOpts = scenario.options || {};

    // Warm-up — discard timings
    let warmupChecksum = 0;
    for (let i = 0; i < opts.warmupIters; i++) {
      const state = scan(input, scanOpts);
      warmupChecksum = (warmupChecksum + stateChecksum(state)) >>> 0;
    }

    // Timed samples
    const sampleTimesNs = [];
    let finalChecksum = 0;
    for (let s = 0; s < opts.samples; s++) {
      const start = process.hrtime.bigint();
      let localChecksum = 0;
      for (let i = 0; i < opts.itersPerSample; i++) {
        const state = scan(input, scanOpts);
        localChecksum = (localChecksum + stateChecksum(state)) >>> 0;
      }
      const end = process.hrtime.bigint();
      finalChecksum = (finalChecksum + localChecksum) >>> 0;
      const ns = Number(end - start);
      sampleTimesNs.push(ns);
    }

    results.push({
      scenario_id: scenario.id,
      label: scenario.label,
      input: scenario.input,
      options: scenario.options,
      warmup_iters: opts.warmupIters,
      samples: opts.samples,
      iters_per_sample: opts.itersPerSample,
      sample_times_ns: sampleTimesNs,
      checksum: finalChecksum,
      total_operations: opts.warmupIters + opts.samples * opts.itersPerSample,
    });
  }

  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

main();