#!/usr/bin/env node
'use strict';

// JavaScript benchmark harness — calls Main/lib/scan.js directly in-process.
// Uses process.hrtime.bigint() for high-resolution timing.
// Anti-optimization: result consumption via a u32 FNV-1a digest (same algorithm
// as the Rust worker). The timed region honestly measures
// "scanner + canonical result consumption". No BigInt is used in the digest.
//
// Usage:
//   node benchmarks/bench-worker.js [options]
//
// Options:
//   --scenarios <path>     path to scenarios JSON
//   --warmup-iters <N>     warm-up iterations (default 1000)
//   --samples <N>          timed samples (default 20)
//   --iters-per-sample <N> iterations per timed sample (default 5000)
//   --pair-id <N>          process-pair ID for provenance
//
// Output: JSON array of scenario results to stdout.

const path = require('path');
const fs = require('fs');

const scan = require(path.join(__dirname, '..', '..', 'Main', 'lib', 'scan.js'));

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    scenarios: path.join(__dirname, 'scenarios.json'),
    warmupIters: 1000,
    samples: 20,
    itersPerSample: 5000,
    pairId: 0,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--scenarios': opts.scenarios = args[++i]; break;
      case '--warmup-iters': opts.warmupIters = parseInt(args[++i], 10); break;
      case '--samples': opts.samples = parseInt(args[++i], 10); break;
      case '--iters-per-sample': opts.itersPerSample = parseInt(args[++i], 10); break;
      case '--pair-id': opts.pairId = parseInt(args[++i], 10); break;
    }
  }
  // Validate: all must be non-negative integers (pairId can be 0)
  for (const [k, v] of Object.entries(opts)) {
    if (k === 'scenarios') continue;
    if (k === 'pairId') {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        throw new Error('Invalid ' + k + ': ' + v + ' (must be non-negative integer)');
      }
    } else {
      if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
        throw new Error('Invalid ' + k + ': ' + v + ' (must be positive integer)');
      }
    }
  }
  return opts;
}

// Canonical u32 FNV-1a fold over scanner output fields.
// SAME algorithm as Rust worker: FNV-1a 32-bit, folds UTF-16 code units
// via charCodeAt (JS native), uses >>> 0 for u32 wrapping.
function canonicalDigest(state) {
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  const prime = 0x01000193; // FNV-1a 32-bit prime

  const foldStr = (s) => {
    if (typeof s !== 'string') return;
    for (let i = 0; i < s.length; i++) {
      h = (h ^ (s.charCodeAt(i) & 0xff)) >>> 0;
      h = Math.imul(h, prime) >>> 0;
    }
  };
  const foldByte = (b) => {
    h = (h ^ (b & 0xff)) >>> 0;
    h = Math.imul(h, prime) >>> 0;
  };
  const foldU32 = (n) => {
    foldByte(n & 0xff);
    foldByte((n >>> 8) & 0xff);
    foldByte((n >>> 16) & 0xff);
    foldByte((n >>> 24) & 0xff);
  };

  foldStr(state.prefix);
  foldStr(state.input);
  foldStr(state.base);
  foldStr(state.glob);
  foldByte(state.isBrace ? 1 : 0);
  foldByte(state.isBracket ? 1 : 0);
  foldByte(state.isGlob ? 1 : 0);
  foldByte(state.isExtglob ? 1 : 0);
  foldByte(state.isGlobstar ? 1 : 0);
  foldByte(state.negated ? 1 : 0);
  foldByte(state.negatedExtglob ? 1 : 0);
  foldU32(state.start >>> 0);

  if (Array.isArray(state.slashes)) {
    for (const s of state.slashes) foldU32(s >>> 0);
  }
  if (Array.isArray(state.parts)) {
    for (const p of state.parts) foldStr(p);
  }
  if (Array.isArray(state.tokens)) {
    for (const t of state.tokens) {
      foldStr(t.value);
      foldByte(t.isGlob ? 1 : 0);
      if (t.depth !== undefined) {
        const d = typeof t.depth === 'number' ? t.depth : 0;
        // Encode Infinity as 0x7F800000
        if (d === Infinity) foldU32(0x7F800000);
        else foldU32(d >>> 0);
      }
      if (t.backslashes) foldByte(1);
      if (t.isBrace) foldByte(1);
      if (t.isBracket) foldByte(1);
      if (t.isExtglob) foldByte(1);
      if (t.isGlobstar) foldByte(1);
      if (t.negated) foldByte(1);
      if (t.isPrefix) foldByte(1);
    }
  }
  if (state.maxDepth !== undefined) {
    const md = typeof state.maxDepth === 'number' ? state.maxDepth : 0;
    if (md === Infinity) foldU32(0x7F800000);
    else foldU32(md >>> 0);
  }
  return h;
}

function main() {
  const opts = parseArgs();
  const scenarios = JSON.parse(fs.readFileSync(opts.scenarios, 'utf8'));
  const results = [];

  for (const scenario of scenarios) {
    const input = scenario.input;
    const scanOpts = scenario.options || {};

    // Warm-up — discard timings
    let warmupDigest = 0;
    for (let i = 0; i < opts.warmupIters; i++) {
      const state = scan(input, scanOpts);
      warmupDigest = (warmupDigest + canonicalDigest(state)) >>> 0;
    }

    // Timed samples
    const sampleTimesNs = [];
    let finalDigest = 0;
    for (let s = 0; s < opts.samples; s++) {
      const start = process.hrtime.bigint();
      let localDigest = 0;
      for (let i = 0; i < opts.itersPerSample; i++) {
        const state = scan(input, scanOpts);
        localDigest = (localDigest + canonicalDigest(state)) >>> 0;
      }
      const end = process.hrtime.bigint();
      finalDigest = (finalDigest + localDigest) >>> 0;
      const ns = Number(end - start);
      if (!Number.isInteger(ns) || ns <= 0) {
        throw new Error('Invalid timing for ' + scenario.id + ': ' + ns);
      }
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
      pair_id: opts.pairId,
      runtime_id: 0,
      runtime: 'js',
      sample_times_ns: sampleTimesNs,
      digest: finalDigest,
      total_operations: opts.warmupIters + opts.samples * opts.itersPerSample,
    });
  }

  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

main();
