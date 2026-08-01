//! Chunk acceptance tests — port: lib/parse.js (C0: L356-L437+L1286-L1322;
//! C1: L606-L655+L661-L711+L765-L782+L1109-L1122).
//!
//! Corpora: ../../fixtures/c0_oracle.json (C0/staged, frozen sha 0825842b…)
//! and ../../fixtures/c1_oracle.json (C1, frozen sha 37488f17…), extracted by
//! fixtures/extract-c*.js from the reference checkout. Rows have an `assert`
//! key list; rows without one assert all recorded fields.

#![cfg(test)]

use pmx_core::parse;
use pmx_core::{Options, PmxError};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Case {
    id: String,
    #[allow(dead_code)] // read by staged-row tests once chunks C1.. land
    chunk: u8,
    layer: String,
    #[serde(rename = "jsOnly")]
    #[allow(dead_code)] // adapter rows are filtered at the site level; kept for debugging
    js_only: bool,
    active: bool,
    pattern: Option<String>,
    options: serde_json::Value,
    assert: Option<Vec<String>>,
    expect: Expect,
}

#[derive(Deserialize)]
struct Expect {
    kind: String, // "ok" | "error"
    #[serde(rename = "utf16Length")]
    utf16_length: Option<usize>,
    class: Option<String>,
    message: Option<String>,
    state: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct Doc {
    #[allow(dead_code)]
    meta: serde_json::Value,
    cases: Vec<Case>,
}

fn corpus() -> Vec<Case> {
    let mut cases = Vec::new();
    for file in [
        "c0_oracle.json",
        "c1_oracle.json",
        "c2_oracle.json",
        "c3_oracle.json",
    ] {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures")
            .join(file)
            .canonicalize()
            .unwrap_or_else(|e| {
                panic!("fixtures/{file} missing ({e}) — run fixtures/extract-c*.js")
            });
        let doc: Doc = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        cases.extend(doc.cases);
    }
    cases
}

/// JSON has no Infinity/NaN literals; canon encOptions stores them as { "__num": "..." }.
fn f64_of(v: &serde_json::Value) -> Option<f64> {
    if let Some(n) = v.as_f64() {
        return Some(n);
    }
    match v.get("__num").and_then(|s| s.as_str()) {
        Some("-Infinity") => Some(f64::NEG_INFINITY),
        Some("Infinity") => Some(f64::INFINITY),
        Some("NaN") => Some(f64::NAN),
        _ => None,
    }
}

/// Build C0-era Options from the corpus options object. Accessor set per the
/// approved design (options.rs: windows/dot/bash/capture/prepend/max_length/
/// noextglob/strict_brackets/strict_slashes only; later chunks extend this).
fn options_of(v: &serde_json::Value) -> Options {
    let mut o = Options::default();
    if let Some(b) = v.get("dot").and_then(|x| x.as_bool()) {
        o = o.with_dot(b);
    }
    if let Some(s) = v.get("prepend").and_then(|x| x.as_str()) {
        o = o.with_prepend(s);
    }
    if let Some(n) = v.get("maxLength").and_then(f64_of) {
        o = o.with_max_length(n); // port: parse.js:L364 — float clamp semantics
    }
    if let Some(b) = v.get("strictBrackets").and_then(|x| x.as_bool()) {
        o = o.with_strict_brackets(b);
    }
    if let Some(b) = v.get("strictSlashes").and_then(|x| x.as_bool()) {
        o = o.with_strict_slashes(b);
    }
    if let Some(b) = v.get("windows").and_then(|x| x.as_bool()) {
        o = o.with_windows(b);
    }
    if let Some(b) = v.get("capture").and_then(|x| x.as_bool()) {
        o = o.with_capture(b);
    }
    if let Some(b) = v.get("bash").and_then(|x| x.as_bool()) {
        o = o.with_bash(b);
    }
    if let Some(b) = v.get("fastpaths").and_then(|x| x.as_bool()) {
        o = o.with_fastpaths(b);
    }
    if let Some(b) = v.get("unescape").and_then(|x| x.as_bool()) {
        o = o.with_unescape(b);
    }
    if let Some(b) = v.get("keepQuotes").and_then(|x| x.as_bool()) {
        o = o.with_keep_quotes(b);
    }
    if let Some(b) = v.get("contains").and_then(|x| x.as_bool()) {
        o = o.with_contains(b);
    }
    if let Some(b) = v.get("regex").and_then(|x| x.as_bool()) {
        o = o.with_regex(b);
    }
    o
}

/// JS error class of a variant — the oracle-4/5 mapping (BEHAVIORAL_ORACLE.md).
fn js_class(e: &PmxError) -> &'static str {
    match e {
        PmxError::ExpectedString => "TypeError",
        PmxError::InputTooLong { .. } => "SyntaxError",
        PmxError::MissingOpening { .. } => "SyntaxError",
        PmxError::MissingClosing { .. } => "SyntaxError",
    }
}

/// Corpus strings come as either plain JSON strings (ASCII) or { "__u16": [...] }.
/// Both decode to a UTF-16 unit sequence — the C-1 comparison basis.
fn units_of(v: &serde_json::Value) -> Vec<u16> {
    if let Some(s) = v.as_str() {
        s.encode_utf16().collect()
    } else {
        v.get("__u16")
            .expect("malformed corpus string")
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_u64().unwrap() as u16)
            .collect()
    }
}

/// Compares emitted-text fields on the C-1 basis: UTF-16 unit sequences.
/// Port fields ARE `Vec<u16>` (ill-formed-safe); `input`/`prefix` stay
/// Strings, so those call sites encode once before passing.
fn assert_units(case: &Case, actual: &[u16], expect: &serde_json::Value, what: &str) {
    let expect_units = units_of(expect);
    assert_eq!(
        actual,
        expect_units.as_slice(),
        "{}: {} UNITS differ",
        case.id,
        what
    );
}

fn assert_field(case: &Case, state: &pmx_core::ParseState, expect: &serde_json::Value, key: &str) {
    match key {
        "input" => assert_units(
            case,
            &state.input.encode_utf16().collect::<Vec<u16>>(),
            &expect["input"],
            "input",
        ),
        "index" => assert_eq!(
            state.index,
            expect["index"].as_i64().unwrap() as isize,
            "{}: index",
            case.id
        ),
        "start" => assert_eq!(
            state.start,
            expect["start"].as_u64().unwrap() as usize,
            "{}: start",
            case.id
        ),
        "dot" => assert_eq!(
            state.dot,
            expect["dot"].as_bool().unwrap(),
            "{}: dot",
            case.id
        ),
        "prefix" => assert_units(
            case,
            &state.prefix.encode_utf16().collect::<Vec<u16>>(),
            &expect["prefix"],
            "prefix",
        ),
        "backtrack" => assert_eq!(
            state.backtrack,
            expect["backtrack"].as_bool().unwrap(),
            "{}: backtrack",
            case.id
        ),
        "negated" => assert_eq!(
            state.negated,
            expect["negated"].as_bool().unwrap(),
            "{}: negated",
            case.id
        ),
        "brackets" => assert_eq!(
            state.brackets,
            expect["brackets"].as_i64().unwrap() as i32,
            "{}: brackets",
            case.id
        ),
        "braces" => assert_eq!(
            state.braces,
            expect["braces"].as_i64().unwrap() as i32,
            "{}: braces",
            case.id
        ),
        "parens" => assert_eq!(
            state.parens,
            expect["parens"].as_i64().unwrap() as i32,
            "{}: parens",
            case.id
        ),
        "quotes" => assert_eq!(
            state.quotes,
            expect["quotes"].as_i64().unwrap() as i32,
            "{}: quotes",
            case.id
        ),
        "globstar" => assert_eq!(
            state.globstar,
            expect["globstar"].as_bool().unwrap(),
            "{}: globstar",
            case.id
        ),
        "negatedExtglob" => assert_eq!(
            state.negated_extglob,
            expect["negatedExtglob"].as_bool().unwrap(),
            "{}: negatedExtglob",
            case.id
        ),
        "output" => assert_units(case, &state.output, &expect["output"], "output"),
        "consumed" => assert_units(case, &state.consumed, &expect["consumed"], "consumed"),
        "tokens" => assert_tokens(case, state, &expect["tokens"]),
        "tokens0" => assert_tokens(case, state, &serde_json::json!([expect["tokens"][0]])),
        "kind" => { /* handled by caller */ }
        other => panic!("unknown assert key {other} in case {}", case.id),
    }
}

fn assert_tokens(case: &Case, state: &pmx_core::ParseState, expect: &serde_json::Value) {
    let exp = expect.as_array().unwrap();
    assert_eq!(state.tokens.len(), exp.len(), "{}: token count", case.id);
    for (i, (t, e)) in state.tokens.iter().zip(exp.iter()).enumerate() {
        assert_eq!(
            t.kind.to_js_str(),
            e["type"].as_str().unwrap(),
            "{}: tokens[{i}].type",
            case.id
        );
        assert_units(case, &t.value, &e["value"], &format!("tokens[{i}].value"));
        // JS: output === undefined -> null; Some("") is a real empty output.
        match &t.output {
            Some(o) => assert_units(case, o, &e["output"], &format!("tokens[{i}].output")),
            None => assert!(
                e["output"].is_null(),
                "{}: tokens[{i}].output should be null",
                case.id
            ),
        }
    }
}

fn run_row(case: &Case) {
    let pattern = case.pattern.as_deref().unwrap_or("");
    let opts = options_of(&case.options);
    let got = parse(pattern, &opts);

    match case.expect.kind.as_str() {
        "error" => {
            let err = got.expect_err(&format!("{}: expected error", case.id));
            assert_eq!(
                js_class(&err),
                case.expect.class.as_deref().unwrap(),
                "{}: error class",
                case.id
            );
            assert_eq!(
                format!("{err}"),
                case.expect.message.as_deref().unwrap(),
                "{}: error message BYTES",
                case.id
            );
        }
        "ok" => {
            let state = got.unwrap_or_else(|e| panic!("{}: expected ok, got {e}", case.id));
            let expect = case.expect.state.as_ref().unwrap();
            match &case.assert {
                None => {
                    for key in [
                        "input",
                        "index",
                        "start",
                        "dot",
                        "prefix",
                        "backtrack",
                        "negated",
                        "brackets",
                        "braces",
                        "parens",
                        "quotes",
                        "globstar",
                        "negatedExtglob",
                        "output",
                        "consumed",
                        "tokens",
                    ] {
                        assert_field(case, &state, expect, key);
                    }
                }
                Some(keys) => {
                    for key in keys {
                        if key == "utf16Length" {
                            // C-1: pattern length is measured in UTF-16 units, like JS .length
                            let units: usize = pattern.encode_utf16().count();
                            assert_eq!(
                                units,
                                case.expect.utf16_length.unwrap(),
                                "{}: utf16Length",
                                case.id
                            );
                        } else {
                            assert_field(case, &state, expect, key);
                        }
                    }
                }
            }
        }
        other => panic!("bad corpus kind {other}"),
    }
}

#[test]
fn c0_active_rows_match_reference() {
    let rows = corpus();
    let expected_active = rows
        .iter()
        .filter(|c| c.active && c.layer == "core")
        .count();
    let mut run = 0usize;
    for case in &rows {
        if case.active && case.layer == "core" {
            run_row(case);
            run += 1;
        } else {
            // Staged rows activate with their chunk; jsOnly rows are adapter-owned (I-6).
        }
    }
    assert_eq!(run, expected_active, "active-row bookkeeping drifted");
    assert!(run >= 16, "corpus shrank? only {run} active rows");
}

/// Informational: how many rows each future chunk must keep green once active.
#[test]
fn c0_staged_rows_pending_count() {
    let rows = corpus();
    let staged = rows
        .iter()
        .filter(|c| !c.active && c.layer == "core")
        .count();
    let adapter = rows.iter().filter(|c| c.layer == "adapter").count();
    eprintln!(
        "c0 corpus: {} staged rows await chunks C1-C7; {adapter} adapter rows",
        staged
    );
}

// TokenKind::to_js_str() maps enum -> JS token type string exactly:
//   Bos->"bos" Text->"text" Slash->"slash" Dot->"dot" Comma->"comma"
//   Brace->"brace" Bracket->"bracket" Paren->"paren" Star->"star"
//   Globstar->"globstar" Qmark->"qmark" Plus->"plus" At->"at" MaybeSlash->"maybe_slash"
