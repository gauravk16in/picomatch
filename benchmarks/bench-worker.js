#!/usr/bin/env node
'use strict';

// JavaScript benchmark harness — calls Main/lib/scan.js directly in-process.
// Uses process.hrtime.bigint() for high-resolution timing.
//
// Timed operation: "scanner + minimal symmetric consumption" — per call, a
// small identical integer accumulator consumes the state's scalar surface
// (start, field unit-lengths, flags, counts) so V8 cannot dead-code the
// scan. Per-call consumption work is deliberately tiny and identical in op
// sequence on both runtimes; any residual per-op cost asymmetry is small,
// bounded, and documented in BENCHMARKS.md.
//
// Full canonical result consumption (the rich tagged/length-framed FNV-1a
// digest, byte-identical to the Rust worker) runs ONCE per scenario OUTSIDE
// the timed region and is compared JS-vs-Rust for every scenario and every
// process pair by the controller/validator (MISMATCHED_DIGEST on any drift).
// The in-loop accumulator value is also emitted and must match across
// runtimes (CONSUMPTION_MISMATCH).

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
  const seen = new Set();
  const fail = (msg) => {
    console.error('bench-worker: ' + msg);
    process.exit(2);
  };
  const parseCount = (name, raw, allowZero) => {
    // Integer-only, safe, positive (or non-negative when allowZero).
    if (!/^\d+$/.test(raw)) fail('invalid value for ' + name + ': ' + raw + ' (must be a non-negative integer)');
    const v = Number(raw);
    if (!Number.isSafeInteger(v)) fail('invalid value for ' + name + ': ' + raw + ' (unsafe integer)');
    if (!allowZero && v <= 0) fail('invalid value for ' + name + ': ' + raw + ' (must be positive)');
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    let name, allowZero;
    switch (flag) {
      case '--scenarios':
        if (seen.has('scenarios')) fail('duplicate flag: --scenarios');
        seen.add('scenarios');
        if (i + 1 >= args.length) fail('missing value for --scenarios');
        opts.scenarios = args[++i];
        continue;
      case '--warmup-iters': name = 'warmupIters'; allowZero = false; break;
      case '--samples': name = 'samples'; allowZero = false; break;
      case '--iters-per-sample': name = 'itersPerSample'; allowZero = false; break;
      case '--pair-id': name = 'pairId'; allowZero = true; break;
      default: fail('unknown argument: ' + flag);
    }
    if (seen.has(name)) fail('duplicate flag: ' + flag);
    seen.add(name);
    if (i + 1 >= args.length) fail('missing value for ' + flag);
    opts[name] = parseCount(name, args[++i], allowZero);
  }
  return opts;
}

// Minimal symmetric consumption — identical op sequence on both runtimes.
// Consumes the state's scalar surface (start, unit-lengths, flags, counts)
// per call: enough to force full materialization, small enough not to
// dominate the timed operation. FNV-1a-style u32 mixing (Math.imul).
function makeConsumer() {
  let acc = 0x811c9dc5;
  const prime = 0x01000193;
  const step = (v) => {
    acc = (acc ^ (v >>> 0)) >>> 0;
    acc = Math.imul(acc, prime) >>> 0;
  };
  const depthMap = (d) => (d === Infinity ? 0x7F800000 : d >>> 0);
  const consume = (state) => {
    step(state.start);
    step(state.prefix.length);
    step(state.input.length);
    step(state.base.length);
    step(state.glob.length);
    step(
      (state.isBrace ? 1 : 0) |
      (state.isBracket ? 2 : 0) |
      (state.isGlob ? 4 : 0) |
      (state.isExtglob ? 8 : 0) |
      (state.isGlobstar ? 16 : 0) |
      (state.negated ? 32 : 0) |
      (state.negatedExtglob ? 64 : 0)
    );
    step(
      (Array.isArray(state.slashes) ? 1 : 0) |
      (Array.isArray(state.parts) ? 2 : 0) |
      (Array.isArray(state.tokens) ? 4 : 0) |
      (state.maxDepth !== undefined ? 8 : 0)
    );
    if (Array.isArray(state.slashes)) step(state.slashes.length);
    if (Array.isArray(state.parts)) {
      step(state.parts.length);
      for (const p of state.parts) step(p.length);
    }
    if (Array.isArray(state.tokens)) {
      step(state.tokens.length);
      for (const t of state.tokens) {
        step(t.value.length);
        step(depthMap(t.depth));
        step(
          (t.backslashes === true ? 1 : 0) |
          (t.isBrace === true ? 2 : 0) |
          (t.isBracket === true ? 4 : 0) |
          (t.isExtglob === true ? 8 : 0) |
          (t.isGlobstar === true ? 16 : 0) |
          (t.negated === true ? 32 : 0) |
          (t.isPrefix === true ? 64 : 0)
        );
      }
    }
    if (state.maxDepth !== undefined) step(depthMap(state.maxDepth));
  };
  return { consume, value: () => acc };
}

// Canonical u32 FNV-1a digest over scanner output fields — byte-identical to
// the Rust worker's digest (crates/pmx-core/examples/scanbench.rs). ONE spec,
// two implementations; equality is verified outside timing per scenario/pair.
// Spec: tag bytes per field, u32le counts, strings as u32le unit count +
// each UTF-16 code unit as lo,hi bytes. Infinity depth => 0x7F800000.
// Runs OUTSIDE the timed region (post-timing semantic equality proof).
function canonicalDigest(state) {
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  const prime = 0x01000193; // FNV-1a 32-bit prime

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
  const foldStr = (s) => {
    foldU32(s.length >>> 0);
    for (let i = 0; i < s.length; i++) {
      const u = s.charCodeAt(i);
      foldByte(u & 0xff);
      foldByte((u >>> 8) & 0xff);
    }
  };
  const foldDepth = (d) => {
    if (d === undefined) {
      foldByte(0);
    } else {
      foldByte(1);
      foldU32(d === Infinity ? 0x7F800000 : d >>> 0);
    }
  };

  foldByte(0x50); // 'P'
  foldStr(state.prefix);
  foldByte(0x49); // 'I'
  foldStr(state.input);
  foldByte(0x42); // 'B'
  foldStr(state.base);
  foldByte(0x47); // 'G'
  foldStr(state.glob);
  foldByte(0x46); // 'F'
  foldByte(state.isBrace ? 1 : 0);
  foldByte(state.isBracket ? 1 : 0);
  foldByte(state.isGlob ? 1 : 0);
  foldByte(state.isExtglob ? 1 : 0);
  foldByte(state.isGlobstar ? 1 : 0);
  foldByte(state.negated ? 1 : 0);
  foldByte(state.negatedExtglob ? 1 : 0);
  foldByte(0x73); // 's'
  foldU32(state.start >>> 0);

  foldByte(0x53); // 'S'
  if (Array.isArray(state.slashes)) {
    foldByte(1);
    foldU32(state.slashes.length >>> 0);
    for (const s of state.slashes) foldU32(s >>> 0);
  } else {
    foldByte(0);
  }
  foldByte(0x70); // 'p'
  if (Array.isArray(state.parts)) {
    foldByte(1);
    foldU32(state.parts.length >>> 0);
    for (const p of state.parts) foldStr(p);
  } else {
    foldByte(0);
  }
  foldByte(0x54); // 'T'
  if (Array.isArray(state.tokens)) {
    foldByte(1);
    foldU32(state.tokens.length >>> 0);
    for (const t of state.tokens) {
      foldByte(0x74); // 't'
      foldStr(t.value);
      foldByte(t.isGlob ? 1 : 0);
      foldDepth(t.depth);
      foldByte(t.backslashes === true ? 1 : 0);
      foldByte(t.isBrace === true ? 1 : 0);
      foldByte(t.isBracket === true ? 1 : 0);
      foldByte(t.isExtglob === true ? 1 : 0);
      foldByte(t.isGlobstar === true ? 1 : 0);
      foldByte(t.negated === true ? 1 : 0);
      foldByte(t.isPrefix === true ? 1 : 0);
    }
  } else {
    foldByte(0);
  }
  foldByte(0x6d); // 'm'
  foldDepth(state.maxDepth);
  return h;
}

function main() {
  const opts = parseArgs();
  const scenarios = JSON.parse(fs.readFileSync(opts.scenarios, 'utf8'));
  const results = [];

  for (const scenario of scenarios) {
    const input = scenario.input;
    const scanOpts = scenario.options || {};
    const consumer = makeConsumer();

    // Warm-up — discard timings (consume to keep the work real)
    for (let i = 0; i < opts.warmupIters; i++) {
      consumer.consume(scan(input, scanOpts));
    }

    // Timed samples
    const sampleTimesNs = [];
    let lastState = null;
    for (let s = 0; s < opts.samples; s++) {
      const start = process.hrtime.bigint();
      for (let i = 0; i < opts.itersPerSample; i++) {
        lastState = scan(input, scanOpts);
        consumer.consume(lastState);
      }
      const end = process.hrtime.bigint();
      const ns = Number(end - start);
      if (!Number.isInteger(ns) || ns <= 0) {
        throw new Error('Invalid timing for ' + scenario.id + ': ' + ns);
      }
      sampleTimesNs.push(ns);
    }

    // Post-timing (outside the timed region): full canonical digest of a
    // fresh state for the cross-runtime equality proof.
    const proofDigest = canonicalDigest(scan(input, scanOpts));

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
      digest: proofDigest,
      consumption: consumer.value(),
      total_operations: opts.warmupIters + opts.samples * opts.itersPerSample,
    });
  }

  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

main();
