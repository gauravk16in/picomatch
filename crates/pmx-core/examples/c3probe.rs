//! c3probe — wildcard-surface JSONL projection probe (review tooling; not
//! part of the port). stdin: {"i":n,"pattern":P,"options":{...}} per line.
//! stdout: one JSONL projection per input, normalized for byte comparison
//! against fixtures/attack-c3.js's JS projector (units, not strings).

use pmx_core::{parse, Options, PmxError};
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
    if let Some(x) = b("unescape") {
        o = o.with_unescape(x);
    }
    if let Some(x) = b("keepQuotes") {
        o = o.with_keep_quotes(x);
    }
    if let Some(x) = b("strictBrackets") {
        o = o.with_strict_brackets(x);
    }
    if let Some(x) = b("strictSlashes") {
        o = o.with_strict_slashes(x);
    }
    if let Some(x) = b("fastpaths") {
        o = o.with_fastpaths(x);
    }
    if let Some(x) = b("regex") {
        o = o.with_regex(x);
    }
    if let Some(n) = v.get("maxLength").and_then(|x| x.as_f64()) {
        o = o.with_max_length(n);
    }
    o
}

fn class_of(e: &PmxError) -> &'static str {
    match e {
        PmxError::ExpectedString => "TypeError",
        PmxError::InputTooLong { .. }
        | PmxError::MissingOpening { .. }
        | PmxError::MissingClosing { .. } => "SyntaxError",
    }
}

fn main() {
    let stdin = std::io::stdin();
    let mut out = std::io::BufWriter::new(std::io::stdout());
    for line in stdin.lock().lines() {
        let Ok(line) = line else { continue };
        let Ok(case) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let id = case["i"].as_u64().unwrap_or(0);
        let pattern = case["pattern"].as_str().unwrap_or("");
        let opts = opts_of(&case["options"]);
        let row = match parse(pattern, &opts) {
            Ok(s) => json!({
                "i": id,
                "kind": "ok",
                "index": s.index,
                "start": s.start,
                "dot": s.dot,
                "prefix": s.prefix,
                "output": s.output,        // Vec<u16> — units, comparison-core
                "consumed": s.consumed,
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
