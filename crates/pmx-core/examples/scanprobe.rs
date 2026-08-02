//! TEST-ONLY probe — scanner differential sidecar (review tooling; not part
//! of the production port). Reads JSONL cases from stdin, one per line:
//!   {"i": n, "input": "...", "options": { ... }}
//! Writes JSONL projections of the scanner's observable state surface,
//! matching fixtures/scan-bridge.js (the unchanged-test bridge).
//!
//! This binary is invoked synchronously by the test-only bridge preload. It
//! never calls JavaScript; it computes scanner results in pure Rust.

use pmx_core::{scan_utf16, ScanOptions, ScanState, ScanToken};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

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

/// Encode a string as ASCII-plain or {__u16:[...]} per canon.js convention.
fn enc_str(s: &str) -> Value {
    if s.is_ascii() {
        Value::String(s.to_string())
    } else {
        Value::Object(
            [(
                "__u16".to_string(),
                Value::Array(s.encode_utf16().map(|u| Value::Number(u.into())).collect()),
            )]
            .into_iter()
            .collect(),
        )
    }
}

/// Encode a depth as a plain number, or {__num:"Infinity"} for f64::INFINITY.
fn enc_depth(d: Option<f64>) -> Value {
    match d {
        None => Value::Null,
        Some(v) if v.is_infinite() => Value::Object(
            [("__num".to_string(), Value::String("Infinity".to_string()))]
                .into_iter()
                .collect(),
        ),
        Some(v) => json!(v),
    }
}

fn enc_token(t: &ScanToken) -> Value {
    let mut o = json!({
        "value": enc_str(&t.value),
        "isGlob": t.is_glob,
    });
    let map = o.as_object_mut().unwrap();
    if t.depth.is_some() {
        map.insert("depth".to_string(), enc_depth(t.depth));
    }
    if let Some(b) = t.backslashes {
        map.insert("backslashes".to_string(), json!(b));
    }
    if let Some(b) = t.is_brace {
        map.insert("isBrace".to_string(), json!(b));
    }
    if let Some(b) = t.is_bracket {
        map.insert("isBracket".to_string(), json!(b));
    }
    if let Some(b) = t.is_extglob {
        map.insert("isExtglob".to_string(), json!(b));
    }
    if let Some(b) = t.is_globstar {
        map.insert("isGlobstar".to_string(), json!(b));
    }
    if let Some(b) = t.negated {
        map.insert("negated".to_string(), json!(b));
    }
    if let Some(b) = t.is_prefix {
        map.insert("isPrefix".to_string(), json!(b));
    }
    o
}

fn enc_state(s: &ScanState) -> Value {
    let mut o = json!({
        "prefix": enc_str(&s.prefix),
        "input": enc_str(&s.input),
        "start": s.start,
        "base": enc_str(&s.base),
        "glob": enc_str(&s.glob),
        "isBrace": s.is_brace,
        "isBracket": s.is_bracket,
        "isGlob": s.is_glob,
        "isExtglob": s.is_extglob,
        "isGlobstar": s.is_globstar,
        "negated": s.negated,
        "negatedExtglob": s.negated_extglob,
    });
    let map = o.as_object_mut().unwrap();
    if let Some(ref tk) = s.tokens {
        map.insert(
            "tokens".to_string(),
            Value::Array(tk.iter().map(enc_token).collect()),
        );
    }
    if let Some(d) = s.max_depth {
        map.insert("maxDepth".to_string(), enc_depth(Some(d)));
    }
    if let Some(ref sl) = s.slashes {
        map.insert(
            "slashes".to_string(),
            Value::Array(
                sl.iter()
                    .map(|u| Value::Number((*u as u64).into()))
                    .collect(),
            ),
        );
    }
    if let Some(ref p) = s.parts {
        map.insert(
            "parts".to_string(),
            Value::Array(p.iter().map(|s| enc_str(s)).collect()),
        );
    }
    o
}

fn main() {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let case: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                writeln!(out, "{{\"probeError\":{}}}", json!(e.to_string())).ok();
                continue;
            }
        };
        let id = case["i"].as_u64().unwrap_or(0);
        // Input may arrive as a plain string (ASCII) or {__u16:[...]} (non-ASCII
        // / lone surrogates). Decode to UTF-16 units.
        let input_val = &case["input"];
        let units: Vec<u16> = if let Some(s) = input_val.as_str() {
            s.encode_utf16().collect()
        } else if let Some(arr) = input_val.get("__u16").and_then(|a| a.as_array()) {
            arr.iter().map(|n| n.as_u64().unwrap_or(0) as u16).collect()
        } else {
            Vec::new()
        };
        // For the public scan(&str) shape, also recover a &str for `state.input`
        // when the units are well-formed UTF-16.
        let input_str = String::from_utf16_lossy(&units);
        let opts = opts_of(&case["options"]);
        let mut state = scan_utf16(&units, &opts);
        state.input = input_str;
        let row = json!({
            "i": id,
            "kind": "ok",
            "state": enc_state(&state),
        });
        writeln!(out, "{row}").ok();
    }
}
