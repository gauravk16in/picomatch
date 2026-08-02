//! REVIEW PROBE — C0 differential sidecar (review tooling; not part of the
//! port). Reads JSONL cases from stdin, one per line:
//!   {"i": n, "pattern": "...", "options": { ... }}
//! Writes JSONL projections of the C0-observable state surface, matching
//! fixtures/probe-c0.js. Options carry JS values; options keys are read
//! with the same truthiness the JS would apply to real JS values.

use pmx_core::{parse, Options, PmxError};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

fn units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

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
    if let Some(x) = b("nobrace") {
        o = o.with_nobrace(x);
    }
    if let Some(x) = b("strictBrackets") {
        o = o.with_strict_brackets(x);
    }
    if let Some(x) = b("strictSlashes") {
        o = o.with_strict_slashes(x);
    }
    if let Some(x) = b("unescape") {
        o = o.with_unescape(x);
    }
    if let Some(x) = b("keepQuotes") {
        o = o.with_keep_quotes(x);
    }
    if let Some(x) = b("contains") {
        o = o.with_contains(x);
    }
    if let Some(x) = b("regex") {
        o = o.with_regex(x);
    }
    if let Some(x) = b("noglobstar") {
        o = o.with_noglobstar(x);
    }
    if let Some(x) = b("nobracket") {
        o = o.with_nobracket(x);
    }
    if let Some(x) = b("literalBrackets") {
        o = o.with_literal_brackets(x);
    }
    if let Some(x) = b("posix") {
        o = o.with_posix(x);
    }
    if let Some(x) = b("noext") {
        o = o.with_noext(x);
    }
    if let Some(x) = b("noextglob") {
        o = o.with_noextglob(x);
    }
    match v.get("maxExtglobRecursion") {
        Some(Value::Bool(false)) => {
            o = o.with_max_extglob_recursion(pmx_core::ExtglobRecursion::Disabled);
        }
        Some(Value::Number(n)) => {
            if let Some(f) = n.as_f64() {
                o = o.with_max_extglob_recursion(pmx_core::ExtglobRecursion::Limit(f));
            }
        }
        _ => {}
    }
    if let Some(s) = v.get("prepend").and_then(|x| x.as_str()) {
        o = o.with_prepend(s);
    }
    match v.get("maxLength") {
        Some(Value::Number(n)) => o = o.with_max_length(n.as_f64().unwrap_or(f64::NAN)),
        // Exact transport: "num:<JS String(v)>" — std parse is correctly
        // rounded (serde_json's default f64 path is NOT: +1 ulp on ~30% of
        // adversarial decimals — review c0-2). JS side: `Number(rest)`.
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
        let row = match parse(pattern, &opts) {
            Ok(s) => json!({
                "i": id,
                "kind": "ok",
                "input": units(&s.input),
                "prefix": s.prefix,
                "output": s.output,
                "dot": s.dot,
                "index": s.index,
                "start": s.start,
                "consumedUnits": s.consumed.len(),
                "negated": s.negated,
                "backtrack": s.backtrack,
                "brackets": s.brackets,
                "braces": s.braces,
                "parens": s.parens,
                "quotes": s.quotes,
                "globstar": s.globstar,
                "negatedExtglob": s.negated_extglob,
                "tokens": s.tokens.iter().map(|t| json!({
                    "type": t.kind.to_js_str(),
                    "value": t.value,
                    "output": t.output
                })).collect::<Vec<_>>()
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
