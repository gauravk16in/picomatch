//! Dependency-free release benchmark binary for the Rust scanner.
//!
//! Reads a scenarios JSON array from stdin (same format as benchmarks/scenarios.json),
//! runs each scenario in-process calling `scan_utf16` directly, and writes raw
//! timing samples as JSON to stdout. No process spawning, no JSON transport,
//! no file I/O inside timed regions.
//!
//! Usage:
//!   cargo build --release --example scanbench
//!   ./target/release/examples/scanbench < benchmarks/scenarios.json > raw-rust.json
//!
//! The binary accepts two arguments:
//!   --warmup-iters <N>     warm-up iterations per scenario (default 5000)
//!   --samples <N>          timed samples per scenario (default 50)
//!   --iters-per-sample <N> iterations per timed sample (default 2000)
//!
//! Each sample runs `iters_per_sample` calls to `scan_utf16` and records
//! the total nanoseconds. Output is a JSON array of scenario results.

use pmx_core::{scan_utf16, ScanOptions};
use serde_json::{json, Value};
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

/// Compute a deterministic checksum of the ScanState to ensure the work is
/// consumed and not optimized away. We fold key observable fields into a
/// single u64 accumulator.
fn state_checksum(state: &pmx_core::ScanState) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325; // FNV offset basis
    let mut fold = |chunk: &[u8]| {
        for &b in chunk {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
    };
    fold(state.prefix.as_bytes());
    fold(state.input.as_bytes());
    fold(state.base.as_bytes());
    fold(state.glob.as_bytes());
    fold(&[
        state.is_brace as u8,
        state.is_bracket as u8,
        state.is_glob as u8,
    ]);
    fold(&[
        state.is_extglob as u8,
        state.is_globstar as u8,
        state.negated as u8,
    ]);
    fold(&[state.negated_extglob as u8]);
    fold(&state.start.to_le_bytes());
    if let Some(ref sl) = state.slashes {
        for s in sl {
            fold(&s.to_le_bytes());
        }
    }
    if let Some(ref p) = state.parts {
        for part in p {
            fold(part.as_bytes());
        }
    }
    if let Some(ref tk) = state.tokens {
        for t in tk {
            fold(t.value.as_bytes());
            fold(&[t.is_glob as u8]);
            if let Some(d) = t.depth {
                fold(&d.to_le_bytes());
            }
            if let Some(b) = t.backslashes {
                fold(&[b as u8]);
            }
            if let Some(b) = t.is_brace {
                fold(&[b as u8]);
            }
            if let Some(b) = t.is_bracket {
                fold(&[b as u8]);
            }
            if let Some(b) = t.is_extglob {
                fold(&[b as u8]);
            }
            if let Some(b) = t.is_globstar {
                fold(&[b as u8]);
            }
            if let Some(b) = t.negated {
                fold(&[b as u8]);
            }
            if let Some(b) = t.is_prefix {
                fold(&[b as u8]);
            }
        }
    }
    if let Some(d) = state.max_depth {
        fold(&d.to_le_bytes());
    }
    h
}

fn main() {
    // Parse args
    let args: Vec<String> = std::env::args().collect();
    let mut warmup_iters: u64 = 5000;
    let mut samples: u64 = 50;
    let mut iters_per_sample: u64 = 2000;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--warmup-iters" => {
                if i + 1 < args.len() {
                    warmup_iters = args[i + 1].parse().unwrap_or(warmup_iters);
                    i += 2;
                    continue;
                }
            }
            "--samples" => {
                if i + 1 < args.len() {
                    samples = args[i + 1].parse().unwrap_or(samples);
                    i += 2;
                    continue;
                }
            }
            "--iters-per-sample" if i + 1 < args.len() => {
                iters_per_sample = args[i + 1].parse().unwrap_or(iters_per_sample);
                i += 2;
                continue;
            }
            _ => {}
        }
        i += 1;
    }

    // Read all stdin
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

        // Warm-up — discard timings
        let mut warmup_checksum: u64 = 0;
        for _ in 0..warmup_iters {
            let state = scan_utf16(&units, &opts);
            warmup_checksum = warmup_checksum.wrapping_add(state_checksum(&state));
        }

        // Verify checksum is nonzero (prevents dead-code elimination)
        if warmup_checksum == 0 && !units.is_empty() {
            eprintln!("WARNING: zero checksum for scenario {}", id);
        }

        // Timed samples
        let mut sample_times_ns: Vec<f64> = Vec::new();
        let mut final_checksum: u64 = 0;
        for _ in 0..samples {
            let start = Instant::now();
            let mut local_checksum: u64 = 0;
            for _ in 0..iters_per_sample {
                let state = scan_utf16(&units, &opts);
                local_checksum = local_checksum.wrapping_add(state_checksum(&state));
            }
            let elapsed = start.elapsed();
            final_checksum = final_checksum.wrapping_add(local_checksum);
            let ns = elapsed.as_nanos() as f64;
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
            "sample_times_ns": sample_times_ns,
            "checksum": final_checksum,
            "total_operations": warmup_iters + samples * iters_per_sample,
        }));
    }

    // Output JSON
    let stdout = io::stdout();
    let mut out = stdout.lock();
    writeln!(out, "{}", serde_json::to_string_pretty(&results).unwrap()).unwrap();
}
