//! pmx-cli — shared op-dispatch library for the pmx binary and the napi
//! adapter (crates/pmx-node). Holds constitute §4b's JSONL ops so both
//! transports (`--serve` subprocess, napi-rs FFI) produce byte-identical
//! answers from one implementation.
#![forbid(unsafe_code)]

pub mod dispatch {
    use pmx_core::{parse, scan, Options, PmxError, ScanOptions};
    use serde_json::{json, Value};

    pub const VERSION: &str = env!("CARGO_PKG_VERSION");

    fn class_of(e: &PmxError) -> &'static str {
        match e {
            PmxError::ExpectedString => "TypeError",
            PmxError::InputTooLong { .. }
            | PmxError::MissingOpening { .. }
            | PmxError::MissingClosing { .. } => "SyntaxError",
        }
    }

    fn parse_options_of(v: &Value) -> Options {
        let mut o = Options::default();
        let b = |k: &str| v.get(k).and_then(|x| x.as_bool());
        if let Some(x) = b("windows") {
            o = o.with_windows(x);
        }
        if let Some(x) = b("dot") {
            o = o.with_dot(x);
        }
        if let Some(x) = b("bash") {
            o = o.with_bash(x);
        }
        if let Some(x) = b("capture") {
            o = o.with_capture(x);
        }
        if let Some(x) = b("contains") {
            o = o.with_contains(x);
        }
        if let Some(x) = b("fastpaths") {
            o = o.with_fastpaths(x);
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
        if let Some(x) = b("regex") {
            o = o.with_regex(x);
        }
        if let Some(x) = b("noglobstar") {
            o = o.with_noglobstar(x);
        }
        if let Some(x) = b("noextglob") {
            o = o.with_noextglob(x);
        }
        if let Some(x) = b("nonegate") {
            o = o.with_nonegate(x);
        }
        if let Some(x) = b("posix") {
            o = o.with_posix(x);
        }
        if let Some(x) = b("nobrace") {
            o = o.with_nobrace(x);
        }
        if let Some(x) = b("nobracket") {
            o = o.with_nobracket(x);
        }
        if let Some(x) = b("literalBrackets") {
            o = o.with_literal_brackets(x);
        }
        // parse.js:L408-L410 — minimatch `noext` boolean aliases onto noextglob
        // and OVERWRITES it, exact reference order
        if let Some(x) = b("noext") {
            o = o.with_noextglob(x);
        }
        if let Some(s) = v.get("prepend").and_then(|x| x.as_str()) {
            o = o.with_prepend(s);
        }
        if let Some(n) = f64_of(v.get("maxLength")) {
            o = o.with_max_length(n);
        }
        // parse.js:L288-L295 — maxExtglobRecursion: false disables; number sets limit
        if let Some(x) = v.get("maxExtglobRecursion") {
            if let Some(false) = x.as_bool() {
                o = o.with_max_extglob_recursion(pmx_core::ExtglobRecursion::Disabled);
            } else if let Some(n) = x.as_f64() {
                o = o.with_max_extglob_recursion(pmx_core::ExtglobRecursion::Limit(n));
            }
        }
        o
    }

    fn f64_of(v: Option<&Value>) -> Option<f64> {
        let v = v?;
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

    fn scan_options_of(v: &Value) -> ScanOptions {
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

    fn parse_projection(state: pmx_core::ParseState) -> Value {
        json!({
            "kind": "ok",
            "input": state.input.encode_utf16().collect::<Vec<u16>>(),
            "index": state.index,
            "start": state.start,
            "dot": state.dot,
            "consumed": state.consumed,
            "output": state.output,
            "prefix": state.prefix.encode_utf16().collect::<Vec<u16>>(),
            "backtrack": state.backtrack,
            "negated": state.negated,
            "brackets": state.brackets,
            "braces": state.braces,
            "parens": state.parens,
            "quotes": state.quotes,
            "globstar": state.globstar,
            "negatedExtglob": state.negated_extglob,
            "tokens": state.tokens.iter().map(|t| json!({
                "type": t.kind.to_js_str(),
                "value": t.value,
                "output": t.output,
            })).collect::<Vec<_>>(),
        })
    }

    fn scan_projection(s: pmx_core::ScanState) -> Value {
        json!({
            "kind": "ok",
            "prefix": s.prefix,
            "input": s.input,
            "start": s.start,
            "base": s.base,
            "glob": s.glob,
            "isBrace": s.is_brace,
            "isBracket": s.is_bracket,
            "isGlob": s.is_glob,
            "isExtglob": s.is_extglob,
            "isGlobstar": s.is_globstar,
            "negated": s.negated,
            "negatedExtglob": s.negated_extglob,
            "slashes": s.slashes,
            "parts": s.parts,
            "tokens": s.tokens.map(|ts| ts.iter().map(|t| json!({
                "value": t.value,
                "depth": t.depth.map(|d| if d.is_infinite() { Value::String("Infinity".to_string()) } else { json!(d) }),
                "isGlob": t.is_glob,
                "backslashes": t.backslashes,
                "isBrace": t.is_brace,
                "isBracket": t.is_bracket,
                "isExtglob": t.is_extglob,
                "isGlobstar": t.is_globstar,
                "negated": t.negated,
                "isPrefix": t.is_prefix,
            })).collect::<Vec<_>>()),
            "maxDepth": s.max_depth,
        })
    }

    fn regex_test_op(req: &Value) -> Value {
        let Some(source) = units_of_json(req.get("source")) else {
            return json!({"kind":"error","class":"SyntaxError","message":"missing/invalid 'source'"});
        };
        let input: Vec<u16> = req
            .get("input")
            .and_then(|i| i.as_str())
            .map(|s| s.encode_utf16().collect())
            .unwrap_or_default();
        let flags = req.get("flags").and_then(|f| f.as_str()).unwrap_or("");
        let exec_flags = pmx_exec::ExecFlags {
            nocase: flags.contains('i'),
        };

        match pmx_exec::is_match(&source, &input, exec_flags) {
            Ok(matched) => json!({"kind":"ok","matched":matched}),
            Err(e) => json!({"kind":"error","class":"SyntaxError","message":format!("{e}")}),
        }
    }

    /* A3+1 engine exec op: capture groups, first match only (JS exec() without /g).
     * {"op":"regexExec","source":units,"input":"...","flags":"i"} groups as
     * [start,end] unit ranges or null. */
    fn regex_exec_op(req: &Value) -> Value {
        let Some(source) = units_of_json(req.get("source")) else {
            return json!({"kind":"error","class":"SyntaxError","message":"missing/invalid 'source'"});
        };
        let input: Vec<u16> = req
            .get("input")
            .and_then(|i| i.as_str())
            .map(|s| s.encode_utf16().collect())
            .unwrap_or_default();
        let flags = req.get("flags").and_then(|f| f.as_str()).unwrap_or("");
        let exec_flags = pmx_exec::ExecFlags {
            nocase: flags.contains('i'),
        };

        match pmx_exec::exec_captures(&source, &input, exec_flags) {
            Ok(Some(groups)) => json!({"kind":"ok","matched":true,"groups":groups}),
            Ok(None) => json!({"kind":"ok","matched":false}),
            Err(e) => json!({"kind":"error","class":"SyntaxError","message":format!("{e}")}),
        }
    }

    /* makeRe/compileRe wrap — closes with the toRegex swallow emulation, port:
     * lib/picomatch.js:L340-L348. If the engine can't construct the wrapped
     * source, makeRe().source MUST be "$^" — the reference's exact answer for
     * unconstructible sources, before any flags/debug rules. */
    fn js_to_regex_source(source: &[u16], flags: pmx_exec::ExecFlags) -> Vec<u16> {
        match pmx_exec::is_match(source, &[], flags) {
            Ok(_) | Err(pmx_exec::ExecError::IllFormedSource) => source.to_vec(),
            Err(pmx_exec::ExecError::Construction(_)) => "$^".encode_utf16().collect(),
        }
    }

    /* port: lib/picomatch.js:L264-L284 anchors + negation wrapper. */
    fn wrap_source(output: &[u16], negated: bool, contains: bool) -> Vec<u16> {
        let caret = b'^' as u16;
        let dollar = b'$' as u16;
        let mut wrapped = Vec::with_capacity(output.len() + 4);
        if !contains {
            wrapped.push(caret);
        }
        wrapped.extend("(?:".encode_utf16());
        wrapped.extend_from_slice(output);
        wrapped.extend(")".encode_utf16());
        if !contains {
            wrapped.push(dollar);
        }
        if negated {
            let mut inner = Vec::with_capacity(wrapped.len() + 6);
            inner.extend("^(?!".encode_utf16());
            inner.append(&mut wrapped);
            inner.extend(").*$".encode_utf16());
            inner
        } else {
            wrapped
        }
    }

    /* port: lib/picomatch.js:L305-L321 — makeRe.
     * Gate: fastpaths only when pattern[0] ∈ {'.','*'} and fastpaths enabled;
     * on gallery-miss fall through to full parse, then wrap (or returnOutput). */
    fn make_re_op(
        req: &Value,
        opts: &Options,
        _hook: Option<&pmx_core::options::ExpandRangeFn>,
    ) -> Value {
        let pattern = req.get("pattern").and_then(|p| p.as_str()).unwrap_or("");
        if pattern.is_empty() {
            return json!({"kind":"error","class":"TypeError","message":"Expected a non-empty string"});
        }
        // opts already assembled by dispatch_with_options (incl. any expansion hook)
        let options = req.get("options").cloned().unwrap_or_else(|| json!({}));
        let return_output = req.get("returnOutput").and_then(|v| v.as_bool()) == Some(true);
        let return_state = req.get("returnState").and_then(|v| v.as_bool()) == Some(true);

        let mut extracted: Option<(Vec<u16>, Value, bool)> = None;
        if opts.fastpaths() && (pattern.starts_with('.') || pattern.starts_with('*')) {
            match pmx_core::fastpaths(pattern, opts) {
                Ok(Some(src)) => {
                    // picomatch.js:308-316 gallery-hit state = synthetic {negated:false, fastpaths:true, output}
                    extracted = Some((
                        src.encode_utf16().collect(),
                        json!({"negated": false, "fastpaths": true}),
                        true,
                    ));
                }
                Ok(None) => {}
                Err(e) => {
                    return json!({"kind":"error","class":class_of(&e),"message":format!("{e}")});
                }
            }
        }

        let (output, state_json) = match extracted {
            Some((out, st, _)) => (out, st),
            None => match parse(pattern, opts) {
                Ok(s) => (s.output.clone(), parse_projection(s)),
                Err(e) => {
                    return json!({"kind":"error","class":class_of(&e),"message":format!("{e}")});
                }
            },
        };

        if return_output {
            return json!({"kind":"ok","output":output});
        }

        let negated = state_json.get("negated").and_then(|v| v.as_bool()) == Some(true);
        let source = wrap_source(&output, negated, opts.contains());
        // picomatch.js:L340-L348 — the toRegex construction swallow: sources the
        // engine can't construct report as "$^", matching makeRe().source.
        let source = js_to_regex_source(
            &source,
            pmx_exec::ExecFlags {
                nocase: options
                    .get("nocase")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            },
        );
        let mut row = json!({"kind":"ok","source":source});
        if return_state {
            row["state"] = state_json;
        }
        row
    }

    /* port: lib/picomatch.js:L264-L284 — compileRe from a parse-state object. */
    fn compile_re_op(req: &Value) -> Value {
        let Some(state) = req.get("state").cloned() else {
            return json!({"kind":"error","class":"SyntaxError","message":"missing 'state' object"});
        };
        let options = req.get("options").cloned().unwrap_or_else(|| json!({}));
        let opts = parse_options_of(&options);
        let return_output = req.get("returnOutput").and_then(|v| v.as_bool()) == Some(true);
        let return_state = req.get("returnState").and_then(|v| v.as_bool()) == Some(true);

        let Some(output) = units_of_json(state.get("output")) else {
            return json!({"kind":"error","class":"SyntaxError","message":"missing/invalid 'state.output'"});
        };
        if return_output {
            return json!({"kind":"ok","output":output});
        }
        let negated = state.get("negated").and_then(|v| v.as_bool()) == Some(true);
        let source = wrap_source(&output, negated, opts.contains());
        let source = js_to_regex_source(
            &source,
            pmx_exec::ExecFlags {
                nocase: options
                    .get("nocase")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            },
        );
        let mut row = json!({"kind":"ok","source":source});
        if return_state {
            row["state"] = state;
        }
        row
    }

    fn units_of_json(v: Option<&Value>) -> Option<Vec<u16>> {
        match v? {
            Value::Array(items) => {
                let mut out = Vec::with_capacity(items.len());
                for n in items {
                    let n = n.as_u64()?;
                    let u = u16::try_from(n).ok()?;
                    out.push(u);
                }
                Some(out)
            }
            Value::String(s) => Some(s.encode_utf16().collect()),
            _ => None,
        }
    }

    /// One JSON request object -> one answer object. The single source of
    /// truth for both transports (`pmx --serve` and `pmx-node`).
    pub fn dispatch(req: &Value) -> Value {
        dispatch_inner(req, None)
    }

    /// Same dispatch with a custom `expandRange` hook injected into Options
    /// (the napi transport passes a JS callback this way; BUG-005).
    pub fn dispatch_with_expansion(
        req: &Value,
        expander: pmx_core::options::ExpandRangeFn,
    ) -> Value {
        dispatch_inner(req, Some(expander))
    }

    fn dispatch_inner(
        req: &Value,
        expansion_hook: Option<pmx_core::options::ExpandRangeFn>,
    ) -> Value {
        let options = req.get("options").cloned().unwrap_or_else(|| json!({}));
        let mut opts = parse_options_of(&options);
        if let Some(f) = &expansion_hook {
            opts.expand_range = Some(f.clone());
        }
        dispatch_with_options(req, &opts, expansion_hook.as_ref())
    }

    fn dispatch_with_options(
        req: &Value,
        opts: &Options,
        hook: Option<&pmx_core::options::ExpandRangeFn>,
    ) -> Value {
        let pattern = req.get("pattern").and_then(|p| p.as_str()).unwrap_or("");
        match req.get("op").and_then(|o| o.as_str()) {
            Some("ping") => json!({"kind":"ok","op":"ping","version":VERSION}),
            Some("parse") => match parse(pattern, opts) {
                Ok(s) => parse_projection(s),
                Err(e) => json!({"kind":"error","class":class_of(&e),"message":format!("{e}")}),
            },
            Some("scan") => {
                let options = req.get("options").cloned().unwrap_or_else(|| json!({}));
                scan_projection(scan(pattern, &scan_options_of(&options)))
            }
            Some("regexTest") => regex_test_op(req),
            Some("regexExec") => regex_exec_op(req),
            Some("makeRe") => make_re_op(req, opts, hook),
            Some("compileRe") => compile_re_op(req),
            other => {
                json!({"kind":"error","class":"SyntaxError","message":format!("unknown op: {other:?}")})
            }
        }
    }

    /// Line-oriented convenience: one JSONL request string -> one answer
    /// string (always exactly one JSON object).
    pub fn dispatch_str(line: &str) -> String {
        match serde_json::from_str::<Value>(line) {
            Ok(req) => dispatch(&req).to_string(),
            Err(_) => {
                json!({"kind":"error","class":"SyntaxError","message":"invalid JSON request"})
                    .to_string()
            }
        }
    }
}
