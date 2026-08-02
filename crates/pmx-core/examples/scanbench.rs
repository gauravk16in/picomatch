//! Dependency-free release benchmark binary for the Rust scanner.
//!
//! Reads a scenarios JSON array from stdin, runs each scenario in-process
//! calling `scan_utf16` directly, and writes raw timing samples as JSON to
//! stdout. No process spawning, no JSON transport, no file I/O inside timed
//! regions.
//!
//! Anti-optimization: uses `std::hint::black_box` to prevent dead-code
//! elimination. The result consumption (a u32 FNV-1a fold over canonical
//! output fields) is identical in algorithm to the JS worker, ensuring
//! comparable overhead. The timed region honestly measures
//! "scanner + canonical result consumption".
//!
//! Usage:
//!   cargo build --release --example scanbench
//!   ./target/release/examples/scanbench < benchmarks/scenarios.json > raw.json
//!
//! Arguments:
//!   --warmup-iters <N>     warm-up iterations (default 1000)
//!   --samples <N>          timed samples (default 20)
//!   --iters-per-sample <N> iterations per timed sample (calibrated)
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

/// Canonical u32 FNV-1a fold over scanner output fields.
/// This is the SAME algorithm used by the JS worker, ensuring comparable
/// result-consumption overhead. It folds UTF-8 bytes (Rust strings are UTF-8)
/// and uses native u32 wrapping arithmetic — no BigInt.
fn canonical_digest(state: &ScanState) -> u32 {
    let mut h: u32 = 0x811c9dc5; // FNV-1a 32-bit offset basis
    let prime: u32 = 0x01000193; // FNV-1a 32-bit prime

    let fold = |h: &mut u32, chunk: &[u8]| {
        for &b in chunk {
            *h ^= b as u32;
            *h = h.wrapping_mul(prime);
        }
    };

    fold(&mut h, state.prefix.as_bytes());
    fold(&mut h, state.input.as_bytes());
    fold(&mut h, state.base.as_bytes());
    fold(&mut h, state.glob.as_bytes());

    // Booleans as single bytes
    fold(
        &mut h,
        &[
            state.is_brace as u8,
            state.is_bracket as u8,
            state.is_glob as u8,
            state.is_extglob as u8,
            state.is_globstar as u8,
            state.negated as u8,
            state.negated_extglob as u8,
        ],
    );

    // start as little-endian bytes
    fold(&mut h, &state.start.to_le_bytes());

    if let Some(ref sl) = state.slashes {
        for s in sl {
            fold(&mut h, &s.to_le_bytes());
        }
    }
    if let Some(ref p) = state.parts {
        for part in p {
            fold(&mut h, part.as_bytes());
        }
    }
    if let Some(ref tk) = state.tokens {
        for t in tk {
            fold(&mut h, t.value.as_bytes());
            fold(&mut h, &[t.is_glob as u8]);
            if let Some(d) = t.depth {
                fold(&mut h, &d.to_le_bytes());
            }
            if let Some(b) = t.backslashes {
                fold(&mut h, &[b as u8]);
            }
            if let Some(b) = t.is_brace {
                fold(&mut h, &[b as u8]);
            }
            if let Some(b) = t.is_bracket {
                fold(&mut h, &[b as u8]);
            }
            if let Some(b) = t.is_extglob {
                fold(&mut h, &[b as u8]);
            }
            if let Some(b) = t.is_globstar {
                fold(&mut h, &[b as u8]);
            }
            if let Some(b) = t.negated {
                fold(&mut h, &[b as u8]);
            }
            if let Some(b) = t.is_prefix {
                fold(&mut h, &[b as u8]);
            }
        }
    }
    if let Some(d) = state.max_depth {
        fold(&mut h, &d.to_le_bytes());
    }

    h
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut warmup_iters: u64 = 1000;
    let mut samples: u64 = 20;
    let mut iters_per_sample: u64 = 5000;
    let mut pair_id: u64 = 0;
    let mut runtime_id: u64 = 1; // 1 = rust
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--warmup-iters" if i + 1 < args.len() => {
                warmup_iters = args[i + 1].parse().unwrap_or(warmup_iters);
                i += 2;
                continue;
            }
            "--samples" if i + 1 < args.len() => {
                samples = args[i + 1].parse().unwrap_or(samples);
                i += 2;
                continue;
            }
            "--iters-per-sample" if i + 1 < args.len() => {
                iters_per_sample = args[i + 1].parse().unwrap_or(iters_per_sample);
                i += 2;
                continue;
            }
            "--pair-id" if i + 1 < args.len() => {
                pair_id = args[i + 1].parse().unwrap_or(pair_id);
                i += 2;
                continue;
            }
            "--runtime-id" if i + 1 < args.len() => {
                runtime_id = args[i + 1].parse().unwrap_or(runtime_id);
                i += 2;
                continue;
            }
            _ => {}
        }
        i += 1;
    }

    let mut input_str = String::new();
    io::stdin()
        .read_to_string(&mut input_str)
        .expect("failed to read stdin");
    let scenarios: Vec<Value> =
        serde_json::from_str(&input_str).expect("failed to parse scenarios JSON");

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

        // Warm-up — discard timings. Use black_box to prevent DCE.
        let mut warmup_digest: u32 = 0;
        for _ in 0..warmup_iters {
            let state = scan_utf16(black_box(&units), black_box(&opts));
            warmup_digest = warmup_digest.wrapping_add(canonical_digest(black_box(&state)));
        }
        // Prevent warmup from being optimized away
        if warmup_digest == 0 && !units.is_empty() {
            eprintln!("WARNING: zero warmup digest for scenario {}", id);
        }

        // Timed samples
        let mut sample_times_ns: Vec<u64> = Vec::new();
        let mut final_digest: u32 = 0;
        for _ in 0..samples {
            let start = Instant::now();
            let mut local_digest: u32 = 0;
            for _ in 0..iters_per_sample {
                let state = scan_utf16(black_box(&units), black_box(&opts));
                local_digest = local_digest.wrapping_add(canonical_digest(black_box(&state)));
            }
            let elapsed = start.elapsed();
            final_digest = final_digest.wrapping_add(local_digest);
            let ns = elapsed.as_nanos() as u64;
            sample_times_ns.push(ns);
        }

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
            "digest": final_digest,
            "total_operations": warmup_iters + samples * iters_per_sample,
        }));
    }

    let stdout = io::stdout();
    let mut out = stdout.lock();
    writeln!(out, "{}", serde_json::to_string_pretty(&results).unwrap()).unwrap();
}
