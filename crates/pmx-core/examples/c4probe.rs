//! C4 differential sidecar for fastpaths.
//! Reads JSONL cases from stdin, one per line:
//!   {"i": n, "pattern": "...", "options": { ... }}
//! Writes JSONL projections of the fastpaths output.

use pmx_core::{fastpaths, Options, PmxError};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

fn opts_of(v: &Value) -> Options {
    let mut o = Options::default();
    let b = |k: &str| v.get(k).and_then(|x| x.as_bool());
    if let Some(x) = b("dot") {
        o = o.with_dot(x);
    }
    if let Some(x) = b("windows") {
        o = o.with_windows(x);
    }
    if let Some(x) = b("bash") {
        o = o.with_bash(x);
    }
    if let Some(x) = b("capture") {
        o = o.with_capture(x);
    }
    if let Some(x) = b("fastpaths") {
        o = o.with_fastpaths(x);
    }
    if let Some(x) = b("noglobstar") {
        o = o.with_noglobstar(x);
    }
    if let Some(x) = b("strictBrackets") {
        o = o.with_strict_brackets(x);
    }
    if let Some(x) = b("strictSlashes") {
        o = o.with_strict_slashes(x);
    }
    if let Some(s) = v.get("prepend").and_then(|x| x.as_str()) {
        o = o.with_prepend(s);
    }
    match v.get("maxLength") {
        Some(Value::Number(n)) => o = o.with_max_length(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(s)) if s.starts_with("num:") => {
            if let Ok(x) = s[4..].parse::<f64>() {
                o = o.with_max_length(x);
            }
        }
        Some(Value::String(s)) if s == "NaN" => o = o.with_max_length(f64::NAN),
        Some(Value::String(s)) if s == "Infinity" => o = o.with_max_length(f64::INFINITY),
        Some(Value::String(s)) if s == "-Infinity" => o = o.with_max_length(f64::NEG_INFINITY),
        Some(Value::String(s)) if s == "-0" => o = o.with_max_length(-0.0),
        _ => {}
    }
    o
}

fn class_of(e: &PmxError) -> &'static str {
    match e {
        PmxError::ExpectedString => "TypeError",
        _ => "SyntaxError",
    }
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
        let pattern = case["pattern"].as_str().unwrap_or("");
        let opts = opts_of(&case["options"]);
        let row = match fastpaths(pattern, &opts) {
            Ok(s) => json!({
                "i": id,
                "kind": "ok",
                "output": s
            }),
            Err(e) => json!({
                "i": id,
                "kind": "error",
                "class": class_of(&e),
                "message": format!("{e}")
            }),
        };
        writeln!(out, "{row}").ok();
    }
}
