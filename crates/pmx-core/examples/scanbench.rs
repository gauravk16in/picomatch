//! Dependency-free release benchmark binary for the Rust scanner.
//!
//! Reads a scenarios JSON array from stdin, runs each scenario in-process
//! calling `scan_utf16` directly, and writes raw timing samples as JSON to
//! stdout. No process spawning, no JSON transport, no file I/O inside timed
//! regions.
//!
//! Timed operation: "scanner + minimal symmetric consumption" — per call, a
//! small identical integer accumulator consumes the state's scalar surface
//! (start, field unit-lengths, flags, counts); `std::hint::black_box`
//! additionally guards against dead-code elimination. The op sequence is
//! identical to the JS worker (benchmarks/bench-worker.js).
//!
//! The full canonical FNV-1a digest (byte-identical to the JS worker) runs
//! ONCE per scenario OUTSIDE the timed region and is compared JS-vs-Rust
//! for every scenario and process pair by the controller/validator.
//!
//! Usage:
//!   cargo build --release --example scanbench
//!   ./target/release/examples/scanbench < benchmarks/scenarios.json > raw.json
//!
//! Arguments:
//!   --warmup-iters <N>     warm-up iterations (default 1000)
//!   --samples <N>          timed samples (default 20)
//!   --iters-per-sample <N> iterations per timed sample (default 5000)
//!   --pair-id <N>          process-pair ID for provenance
//!   --runtime-id <N>       runtime identifier (0=js, 1=rust) for provenance

use pmx_core::{scan_utf16, ScanOptions, ScanState};
use serde_json::{json, Value};
use std::hint::black_box;
use std::io::{self, Read, Write};
use std::time::Instant;

fn opts_of(v: &Value) -> ScanOptions {
    let mut o = ScanOptions::default();
    let b = |k: &str| v.get(k).and_then(|x| x.as_bool());
    if let Some(x) = b("parts") {
        o = o.with_parts(x);
    }
    if let Some(x) = b("scanToEnd") {
        o = o.with_scan_to_end(x);
    }
    if let Some(x) = b("tokens") {
        o = o.with_tokens(x);
    }
    if let Some(x) = b("noext") {
        o = o.with_noext(x);
    }
    if let Some(x) = b("nonegate") {
        o = o.with_nonegate(x);
    }
    if let Some(x) = b("noparen") {
        o = o.with_noparen(x);
    }
    if let Some(x) = b("unescape") {
        o = o.with_unescape(x);
    }
    o
}

/// Minimal symmetric consumption — identical op sequence to the JS worker
/// (bench-worker.js `makeConsumer`). Consumes the state's scalar surface
/// (start, unit-lengths, flags, counts) per call: enough to force full
/// materialization (with `black_box`), small enough not to dominate the
/// timed operation. FNV-1a-style u32 mixing.
struct Consumer {
    acc: u32,
}

impl Consumer {
    fn new() -> Self {
        Consumer { acc: 0x811c9dc5 }
    }
    #[inline(always)]
    fn step(&mut self, v: u32) {
        self.acc ^= v;
        self.acc = self.acc.wrapping_mul(0x01000193);
    }
    fn unit_len(s: &str) -> u32 {
        s.encode_utf16().count() as u32
    }
    fn depth_map(d: Option<f64>) -> u32 {
        match d {
            None => 0,
            Some(v) if v.is_infinite() => 0x7F800000,
            Some(v) => v as u32,
        }
    }
    fn consume(&mut self, state: &ScanState, input_units: &[u16]) {
        self.step(state.start as u32);
        self.step(Self::unit_len(&state.prefix));
        self.step(input_units.len() as u32);
        self.step(Self::unit_len(&state.base));
        self.step(Self::unit_len(&state.glob));
        self.step(
            (state.is_brace as u32)
                | ((state.is_bracket as u32) << 1)
                | ((state.is_glob as u32) << 2)
                | ((state.is_extglob as u32) << 3)
                | ((state.is_globstar as u32) << 4)
                | ((state.negated as u32) << 5)
                | ((state.negated_extglob as u32) << 6),
        );
        self.step(
            (state.slashes.is_some() as u32)
                | ((state.parts.is_some() as u32) << 1)
                | ((state.tokens.is_some() as u32) << 2)
                | ((state.max_depth.is_some() as u32) << 3),
        );
        if let Some(ref sl) = state.slashes {
            self.step(sl.len() as u32);
        }
        if let Some(ref p) = state.parts {
            self.step(p.len() as u32);
            for part in p {
                self.step(Self::unit_len(part));
            }
        }
        if let Some(ref tk) = state.tokens {
            self.step(tk.len() as u32);
            for t in tk {
                self.step(Self::unit_len(&t.value));
                self.step(Self::depth_map(t.depth));
                self.step(
                    ((t.backslashes == Some(true)) as u32)
                        | (((t.is_brace == Some(true)) as u32) << 1)
                        | (((t.is_bracket == Some(true)) as u32) << 2)
                        | (((t.is_extglob == Some(true)) as u32) << 3)
                        | (((t.is_globstar == Some(true)) as u32) << 4)
                        | (((t.negated == Some(true)) as u32) << 5)
                        | (((t.is_prefix == Some(true)) as u32) << 6),
                );
            }
        }
        if state.max_depth.is_some() {
            self.step(Self::depth_map(state.max_depth));
        }
    }
}

/// Canonical u32 FNV-1a digest over scanner output fields — byte-identical
/// to the JS worker's digest (benchmarks/bench-worker.js). ONE spec, two
/// implementations; equality is verified outside timing per scenario/pair.
///
/// Spec (little-endian framing, UTF-16 code-unit string encoding):
///   tag 'P' + str(prefix), 'I' + str(input), 'B' + str(base), 'G' + str(glob)
///   tag 'F' + 7 flag bytes (isBrace..negatedExtglob)
///   tag 's' + u32le(start)
///   tag 'S' + presence + u32le count + u32le each slash
///   tag 'p' + presence + u32le count + str each part
///   tag 'T' + presence + u32le count + per token:
///     tag 't' + str(value) + isGlob byte + depth (presence + u32le,
///     Infinity => 0x7F800000) + 7 conditional-flag bytes (1 iff present &&
///     true: backslashes,isBrace,isBracket,isExtglob,isGlobstar,negated,
///     isPrefix)
///   tag 'm' + maxDepth (presence + u32le, Infinity => 0x7F800000)
/// str(s) = u32le unit count, then each UTF-16 code unit as lo,hi bytes.
///
/// Note on input: `scan_utf16` leaves `ScanState.input` empty (the `scan()`
/// wrapper fills it), so the worker folds the ORIGINAL scenario units for
/// the 'I' field — identical content to JS `state.input` (scan.js:329).
/// The UTF-16 re-encode on the Rust side (`encode_utf16`) is slightly more
/// work than V8's native unit reads; the asymmetry disfavors Rust only and
/// is documented in BENCHMARKS.md.
fn canonical_digest(state: &ScanState, input_units: &[u16]) -> u32 {
    let mut h: u32 = 0x811c9dc5; // FNV-1a 32-bit offset basis
    const PRIME: u32 = 0x01000193; // FNV-1a 32-bit prime

    fn fold_byte(h: &mut u32, b: u8) {
        *h ^= b as u32;
        *h = h.wrapping_mul(PRIME);
    }
    fn fold_u32(h: &mut u32, n: u32) {
        for b in n.to_le_bytes() {
            fold_byte(h, b);
        }
    }
    fn fold_tag(h: &mut u32, tag: u8) {
        fold_byte(h, tag);
    }
    fn fold_units(h: &mut u32, count: usize, units: impl Iterator<Item = u16>) {
        fold_u32(h, count as u32);
        for u in units {
            fold_byte(h, (u & 0xff) as u8);
            fold_byte(h, (u >> 8) as u8);
        }
    }
    fn fold_str(h: &mut u32, s: &str) {
        fold_units(h, s.encode_utf16().count(), s.encode_utf16());
    }
    fn fold_depth(h: &mut u32, d: Option<f64>) {
        match d {
            None => fold_byte(h, 0),
            Some(v) => {
                fold_byte(h, 1);
                if v.is_infinite() {
                    fold_u32(h, 0x7F800000);
                } else {
                    fold_u32(h, v as u32);
                }
            }
        }
    }

    fold_tag(&mut h, b'P');
    fold_str(&mut h, &state.prefix);
    fold_tag(&mut h, b'I');
    fold_units(&mut h, input_units.len(), input_units.iter().copied());
    fold_tag(&mut h, b'B');
    fold_str(&mut h, &state.base);
    fold_tag(&mut h, b'G');
    fold_str(&mut h, &state.glob);
    fold_tag(&mut h, b'F');
    for b in [
        state.is_brace,
        state.is_bracket,
        state.is_glob,
        state.is_extglob,
        state.is_globstar,
        state.negated,
        state.negated_extglob,
    ] {
        fold_byte(&mut h, b as u8);
    }
    fold_tag(&mut h, b's');
    fold_u32(&mut h, state.start as u32);

    fold_tag(&mut h, b'S');
    match state.slashes {
        None => fold_byte(&mut h, 0),
        Some(ref sl) => {
            fold_byte(&mut h, 1);
            fold_u32(&mut h, sl.len() as u32);
            for &s in sl {
                fold_u32(&mut h, s as u32);
            }
        }
    }
    fold_tag(&mut h, b'p');
    match state.parts {
        None => fold_byte(&mut h, 0),
        Some(ref p) => {
            fold_byte(&mut h, 1);
            fold_u32(&mut h, p.len() as u32);
            for part in p {
                fold_str(&mut h, part);
            }
        }
    }
    fold_tag(&mut h, b'T');
    match state.tokens {
        None => fold_byte(&mut h, 0),
        Some(ref tk) => {
            fold_byte(&mut h, 1);
            fold_u32(&mut h, tk.len() as u32);
            for t in tk {
                fold_tag(&mut h, b't');
                fold_str(&mut h, &t.value);
                fold_byte(&mut h, t.is_glob as u8);
                fold_depth(&mut h, t.depth);
                for b in [
                    t.backslashes,
                    t.is_brace,
                    t.is_bracket,
                    t.is_extglob,
                    t.is_globstar,
                    t.negated,
                    t.is_prefix,
                ] {
                    fold_byte(&mut h, (b == Some(true)) as u8);
                }
            }
        }
    }
    fold_tag(&mut h, b'm');
    fold_depth(&mut h, state.max_depth);

    h
}

fn main() {
    // Strict CLI parsing (fail closed): unknown flags, positionals, missing
    // values, and malformed numbers all abort with a nonzero exit.
    let args: Vec<String> = std::env::args().collect();
    let mut warmup_iters: u64 = 1000;
    let mut samples: u64 = 20;
    let mut iters_per_sample: u64 = 5000;
    let mut pair_id: u64 = 0;
    let mut runtime_id: u64 = 1; // 1 = rust
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    let fail = |msg: String| -> ! {
        eprintln!("scanbench: {msg}");
        std::process::exit(2);
    };
    let parse_count = |name: &str, raw: &str, allow_zero: bool| -> u64 {
        if raw.starts_with('-') && raw.len() > 1 {
            // a negative value is a malformed count, not another flag
            fail(format!(
                "invalid value for {name}: {raw} (must be positive integer)"
            ));
        }
        match raw.parse::<u64>() {
            Ok(v) if allow_zero || v > 0 => v,
            _ => fail(format!(
                "invalid value for {name}: {raw} (must be {}positive integer)",
                if allow_zero { "non-negative " } else { "" }
            )),
        }
    };
    let mut i = 1;
    while i < args.len() {
        let flag = args[i].as_str();
        let (name, allow_zero) = match flag {
            "--warmup-iters" => ("warmup_iters", false),
            "--samples" => ("samples", false),
            "--iters-per-sample" => ("iters_per_sample", false),
            "--pair-id" => ("pair_id", true),
            "--runtime-id" => ("runtime_id", true),
            other => fail(format!("unknown argument: {other}")),
        };
        if !seen.insert(name) {
            fail(format!("duplicate flag: {flag}"));
        }
        if i + 1 >= args.len() {
            fail(format!("missing value for {flag}"));
        }
        let v = parse_count(name, &args[i + 1], allow_zero);
        match name {
            "warmup_iters" => warmup_iters = v,
            "samples" => samples = v,
            "iters_per_sample" => iters_per_sample = v,
            "pair_id" => pair_id = v,
            "runtime_id" => runtime_id = v,
            _ => unreachable!(),
        }
        i += 2;
    }

    let mut input_str = String::new();
    if io::stdin().read_to_string(&mut input_str).is_err() {
        eprintln!("scanbench: failed to read stdin");
        std::process::exit(2);
    }
    let scenarios: Vec<Value> = match serde_json::from_str(&input_str) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("scanbench: failed to parse scenarios JSON: {e}");
            std::process::exit(2);
        }
    };

    let mut results = Vec::new();

    for scenario in &scenarios {
        let id = scenario["id"].as_str().unwrap_or("?").to_string();
        let input_val = &scenario["input"];
        let units: Vec<u16> = if let Some(s) = input_val.as_str() {
            s.encode_utf16().collect()
        } else if let Some(arr) = input_val.get("__u16").and_then(|a| a.as_array()) {
            arr.iter().map(|n| n.as_u64().unwrap_or(0) as u16).collect()
        } else {
            Vec::new()
        };
        let opts = opts_of(&scenario["options"]);
        let mut consumer = Consumer::new();

        // Warm-up — discard timings. Use black_box to prevent DCE.
        for _ in 0..warmup_iters {
            let state = scan_utf16(black_box(&units), black_box(&opts));
            consumer.consume(black_box(&state), black_box(&units));
        }

        // Timed samples
        let mut sample_times_ns: Vec<u64> = Vec::new();
        for _ in 0..samples {
            let start = Instant::now();
            for _ in 0..iters_per_sample {
                let state = scan_utf16(black_box(&units), black_box(&opts));
                consumer.consume(black_box(&state), black_box(&units));
            }
            let elapsed = start.elapsed();
            let ns = elapsed.as_nanos() as u64;
            sample_times_ns.push(ns);
        }

        // Post-timing (outside the timed region): full canonical digest of a
        // fresh state for the cross-runtime equality proof.
        let proof_state = scan_utf16(&units, &opts);
        let proof_digest = canonical_digest(&proof_state, &units);

        results.push(json!({
            "scenario_id": id,
            "label": scenario["label"],
            "input": scenario["input"],
            "options": scenario["options"],
            "warmup_iters": warmup_iters,
            "samples": samples,
            "iters_per_sample": iters_per_sample,
            "pair_id": pair_id,
            "runtime_id": runtime_id,
            "runtime": "rust",
            "sample_times_ns": sample_times_ns,
            "digest": proof_digest,
            "consumption": consumer.acc,
            "total_operations": warmup_iters + samples * iters_per_sample,
        }));
    }

    let stdout = io::stdout();
    let mut out = stdout.lock();
    writeln!(out, "{}", serde_json::to_string_pretty(&results).unwrap()).unwrap();
}
