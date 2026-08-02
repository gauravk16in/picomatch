//! scan.rs — port: lib/scan.js (391 lines), the public `scan()` API.
//!
//! A self-contained char-code machine over UTF-16 code units (`&[u16]`), exactly
//! mirroring JS `String.prototype.charCodeAt` indexing (D-016). The scanner
//! never throws; it returns a `ScanState` describing `prefix`/`base`/`glob`,
//! brace/bracket/extglob/globstar flags, negation, and (when requested) tokens,
//! slashes, parts, and `maxDepth`.
//!
//! Option surface (D-015): `parts`, `scanToEnd`, `tokens`, `noext`, `nonegate`,
//! `noparen`, `unescape` — a **distinct** set from the parser `Options`.
//!
//! Depth model (D-017): `Option<f64>` with `Infinity` for globstar tokens.

use crate::constants::{
    CHAR_ASTERISK, CHAR_AT, CHAR_BACKWARD_SLASH, CHAR_COMMA, CHAR_DOT, CHAR_EXCLAMATION_MARK,
    CHAR_FORWARD_SLASH, CHAR_LEFT_CURLY_BRACE, CHAR_LEFT_PARENTHESES, CHAR_LEFT_SQUARE_BRACKET,
    CHAR_PLUS, CHAR_QUESTION_MARK, CHAR_RIGHT_CURLY_BRACE, CHAR_RIGHT_PARENTHESES,
    CHAR_RIGHT_SQUARE_BRACKET,
};
use crate::utils::remove_backslashes;

/// Scanner options — mirrors the JS `scan(input, options)` surface exactly.
///
/// Each field is `Option<bool>` to preserve JS `undefined` vs `false` vs `true`
/// distinctions, though the scanner only checks `=== true` (or `!== true` for
/// `noext`/`nonegate`/`noparen`), so `None` and `Some(false)` are behaviorally
/// identical for every key. We keep `Option<bool>` for clarity and future
/// adapter fidelity.
#[derive(Debug, Clone, Default)]
pub struct ScanOptions {
    /// `opts.parts === true` (also enables `scanToEnd`).
    pub parts: Option<bool>,
    /// `opts.scanToEnd === true`.
    pub scan_to_end: Option<bool>,
    /// `opts.tokens === true` (also enables `parts`).
    pub tokens: Option<bool>,
    /// `opts.noext === true` — post-processes `isExtglob`/`isGlob` to false.
    pub noext: Option<bool>,
    /// `opts.nonegate !== true` gate (default: negation active).
    pub nonegate: Option<bool>,
    /// `opts.noparen !== true` gate (default: parens active).
    pub noparen: Option<bool>,
    /// `opts.unescape === true` — strips backslashes from `glob`/`base`.
    pub unescape: Option<bool>,
}

impl ScanOptions {
    /// Builder helpers for tests and the probe/bridge.
    pub fn with_parts(mut self, v: bool) -> Self {
        self.parts = Some(v);
        self
    }
    pub fn with_scan_to_end(mut self, v: bool) -> Self {
        self.scan_to_end = Some(v);
        self
    }
    pub fn with_tokens(mut self, v: bool) -> Self {
        self.tokens = Some(v);
        self
    }
    pub fn with_noext(mut self, v: bool) -> Self {
        self.noext = Some(v);
        self
    }
    pub fn with_nonegate(mut self, v: bool) -> Self {
        self.nonegate = Some(v);
        self
    }
    pub fn with_noparen(mut self, v: bool) -> Self {
        self.noparen = Some(v);
        self
    }
    pub fn with_unescape(mut self, v: bool) -> Self {
        self.unescape = Some(v);
        self
    }
}

/// A scan token — mirrors the JS `token` object shape (lib/scan.js L51, L148,
/// L342-L386). Fields present vs absent matters (D-013/D-017):
/// - `value`, `isGlob` always present.
/// - `depth` present unless `isPrefix === true` (JS omits it).
/// - `backslashes`, `isBrace`, `isExtglob`, `isGlobstar`, `negated`, `isPrefix`
///   present only when set to `true`.
#[derive(Debug, Clone, Default)]
pub struct ScanToken {
    pub value: String,
    /// `None` = property absent (prefix tokens when `isPrefix === true`).
    pub depth: Option<f64>,
    pub is_glob: bool,
    pub backslashes: Option<bool>,
    pub is_brace: Option<bool>,
    pub is_bracket: Option<bool>,
    pub is_extglob: Option<bool>,
    pub is_globstar: Option<bool>,
    pub negated: Option<bool>,
    pub is_prefix: Option<bool>,
}

/// Scanner state — mirrors the JS `scan()` return object (lib/scan.js
/// L327-L386). Always-present fields are plain; conditional fields
/// (`slashes`, `parts`, `tokens`, `max_depth`) are `Option` and `None` when
/// the JS property is absent.
#[derive(Debug, Clone, Default)]
pub struct ScanState {
    pub prefix: String,
    pub input: String,
    pub start: usize,
    pub base: String,
    pub glob: String,
    pub is_brace: bool,
    pub is_bracket: bool,
    pub is_glob: bool,
    pub is_extglob: bool,
    pub is_globstar: bool,
    pub negated: bool,
    pub negated_extglob: bool,
    /// Present only when `opts.tokens === true` or `opts.parts === true`.
    pub slashes: Option<Vec<usize>>,
    /// Present only when `opts.tokens === true` or `opts.parts === true`.
    pub parts: Option<Vec<String>>,
    /// Present only when `opts.tokens === true`.
    pub tokens: Option<Vec<ScanToken>>,
    /// Present only when `opts.tokens === true`. `Infinity` when any globstar.
    pub max_depth: Option<f64>,
}

/// `lib/scan.js` L22-L24 — `isPathSeparator(code)`.
fn is_path_separator(code: u16) -> bool {
    code == CHAR_FORWARD_SLASH || code == CHAR_BACKWARD_SLASH
}

/// `lib/scan.js` L26-L30 — `depth(token)`: sets `token.depth` to `Infinity`
/// for globstar, `1` otherwise, UNLESS `isPrefix === true` (then no depth set).
fn set_depth(tok: &mut ScanToken) {
    if tok.is_prefix != Some(true) {
        tok.depth = Some(if tok.is_globstar == Some(true) {
            f64::INFINITY
        } else {
            1.0
        });
    }
}

/// The core scanner over UTF-16 code units, mirroring JavaScript
/// `charCodeAt` indexing (D-016). The returned state's `input` field is
/// populated by the higher-level `scan(&str, ...)` wrapper or by the
/// calling adapter when unit-level input is used.
pub fn scan_utf16(units: &[u16], opts: &ScanOptions) -> ScanState {
    // lib/scan.js L52-L54
    let length = units.len().saturating_sub(1);
    let scan_to_end = opts.parts == Some(true) || opts.scan_to_end == Some(true);

    let mut slashes: Vec<usize> = Vec::new();
    let mut tokens: Vec<ScanToken> = Vec::new();
    let mut parts: Vec<String> = Vec::new();

    // lib/scan.js L56-L69 — mutable state
    let mut start = 0usize;
    let mut last_index = 0usize;
    let mut is_brace = false;
    let mut is_bracket = false;
    let mut is_glob = false;
    let mut is_extglob = false;
    let mut is_globstar = false;
    let mut brace_escaped = false;
    let mut backslashes = false;
    let mut negated = false;
    let mut negated_extglob = false;
    let mut finished = false;
    let mut braces = 0i32;
    #[allow(unused_assignments)]
    let mut prev: Option<u16> = None;
    let mut code: u16 = 0;
    let mut token = ScanToken {
        depth: Some(0.0),
        ..ScanToken::default()
    };

    let mut index: i64 = -1;

    // eos() = index >= length  (JS L75)
    let eos = |idx: i64| idx >= length as i64;
    // peek() = str.charCodeAt(index + 1)  (JS L76)
    let peek = |idx: i64| -> Option<u16> {
        let n = idx + 1;
        if (0..units.len() as i64).contains(&n) {
            Some(units[n as usize])
        } else {
            None
        }
    };
    // advance() = prev = code; return str.charCodeAt(++index)  (JS L77-L80)
    // Returns the new code; index is mutated via the mutable variable.

    while index < length as i64 {
        // advance()
        index += 1;
        let i = index as usize;
        prev = Some(code);
        code = units.get(i).copied().unwrap_or(0);

        // lib/scan.js L86-L94 — backslash escape
        if code == CHAR_BACKWARD_SLASH {
            backslashes = true;
            token.backslashes = Some(true);
            // advance()
            index += 1;
            let i2 = index as usize;
            code = units.get(i2).copied().unwrap_or(0);
            if code == CHAR_LEFT_CURLY_BRACE {
                brace_escaped = true;
            }
            continue;
        }

        // lib/scan.js L96-L150 — braces (escaped-open or literal-open)
        if brace_escaped || code == CHAR_LEFT_CURLY_BRACE {
            braces += 1;
            while !eos(index) {
                // advance() — but the JS inner `(code = advance())` returns
                // falsy at end (0 is falsy! so `\u0000` would break the loop
                // in JS). We replicate: if advance returns 0 the while exits.
                index += 1;
                let i2 = index as usize;
                code = units.get(i2).copied().unwrap_or(0);
                if code == 0 {
                    break;
                }

                if code == CHAR_BACKWARD_SLASH {
                    backslashes = true;
                    token.backslashes = Some(true);
                    // advance()
                    index += 1;
                    // (the JS `advance()` return value is discarded here)
                    continue;
                }

                if code == CHAR_LEFT_CURLY_BRACE {
                    braces += 1;
                    continue;
                }

                // `..` range detection: `braceEscaped !== true && code === DOT
                // && (code = advance()) === DOT`
                if !brace_escaped && code == CHAR_DOT {
                    // advance()
                    index += 1;
                    let i3 = index as usize;
                    code = units.get(i3).copied().unwrap_or(0);
                    if code == CHAR_DOT {
                        is_brace = true;
                        token.is_brace = Some(true);
                        is_glob = true;
                        token.is_glob = true;
                        finished = true;
                        if scan_to_end {
                            continue;
                        }
                        break;
                    }
                    // Not `..`: fall through to the comma/`}` checks below with
                    // the newly-advanced `code`. Do NOT `continue` — the JS
                    // `if (… && (code = advance()) === DOT)` is a short-circuit
                    // AND; when the advanced char is not DOT the whole `if` is
                    // false and execution falls through to the COMMA check,
                    // which is load-bearing (e.g. `{.,*}`: `.` advances to `,`,
                    // the DOT `if` is false, the COMMA `if` fires).
                }

                if !brace_escaped && code == CHAR_COMMA {
                    is_brace = true;
                    token.is_brace = Some(true);
                    is_glob = true;
                    token.is_glob = true;
                    finished = true;
                    if scan_to_end {
                        continue;
                    }
                    break;
                }

                if code == CHAR_RIGHT_CURLY_BRACE {
                    braces -= 1;
                    if braces == 0 {
                        brace_escaped = false;
                        is_brace = true;
                        token.is_brace = Some(true);
                        finished = true;
                        break;
                    }
                }
            }

            if scan_to_end {
                continue;
            }
            break;
        }

        // lib/scan.js L152-L168 — forward slash
        if code == CHAR_FORWARD_SLASH {
            slashes.push(index as usize);
            tokens.push(token.clone());
            token = ScanToken {
                depth: Some(0.0),
                ..ScanToken::default()
            };

            if finished {
                continue;
            }
            if prev == Some(CHAR_DOT) && index as usize == start + 1 {
                start += 2;
                continue;
            }
            last_index = (index + 1) as usize;
            continue;
        }

        // lib/scan.js L170-L200 — extglob open (`+(@*?!` followed by `(`)
        if opts.noext != Some(true) {
            let is_extglob_char = code == CHAR_PLUS
                || code == CHAR_AT
                || code == CHAR_ASTERISK
                || code == CHAR_QUESTION_MARK
                || code == CHAR_EXCLAMATION_MARK;

            if is_extglob_char && peek(index) == Some(CHAR_LEFT_PARENTHESES) {
                is_glob = true;
                token.is_glob = true;
                is_extglob = true;
                token.is_extglob = Some(true);
                finished = true;
                if code == CHAR_EXCLAMATION_MARK && index as usize == start {
                    negated_extglob = true;
                }

                if scan_to_end {
                    while !eos(index) {
                        index += 1;
                        let i2 = index as usize;
                        code = units.get(i2).copied().unwrap_or(0);
                        if code == 0 {
                            break;
                        }
                        if code == CHAR_BACKWARD_SLASH {
                            backslashes = true;
                            token.backslashes = Some(true);
                            index += 1;
                            continue;
                        }
                        if code == CHAR_RIGHT_PARENTHESES {
                            is_glob = true;
                            token.is_glob = true;
                            finished = true;
                            break;
                        }
                    }
                    continue;
                }
                break;
            }
        }

        // lib/scan.js L202-L211 — asterisk
        if code == CHAR_ASTERISK {
            if prev == Some(CHAR_ASTERISK) {
                is_globstar = true;
                token.is_globstar = Some(true);
            }
            is_glob = true;
            token.is_glob = true;
            finished = true;
            if scan_to_end {
                continue;
            }
            break;
        }

        // lib/scan.js L213-L222 — question mark
        if code == CHAR_QUESTION_MARK {
            is_glob = true;
            token.is_glob = true;
            finished = true;
            if scan_to_end {
                continue;
            }
            break;
        }

        // lib/scan.js L224-L243 — left square bracket
        if code == CHAR_LEFT_SQUARE_BRACKET {
            while !eos(index) {
                index += 1;
                let i2 = index as usize;
                let next = units.get(i2).copied().unwrap_or(0);
                if next == 0 {
                    break;
                }
                if next == CHAR_BACKWARD_SLASH {
                    backslashes = true;
                    token.backslashes = Some(true);
                    index += 1;
                    continue;
                }
                if next == CHAR_RIGHT_SQUARE_BRACKET {
                    is_bracket = true;
                    token.is_bracket = Some(true);
                    is_glob = true;
                    token.is_glob = true;
                    finished = true;
                    break;
                }
            }
            if scan_to_end {
                continue;
            }
            break;
        }

        // lib/scan.js L245-L250 — beginning-only negation `!`
        if opts.nonegate != Some(true) && code == CHAR_EXCLAMATION_MARK && index as usize == start {
            negated = true;
            token.negated = Some(true);
            start += 1;
            continue;
        }

        // lib/scan.js L252-L272 — ordinary parentheses (not extglob)
        if opts.noparen != Some(true) && code == CHAR_LEFT_PARENTHESES {
            is_glob = true;
            token.is_glob = true;

            if scan_to_end {
                while !eos(index) {
                    index += 1;
                    let i2 = index as usize;
                    code = units.get(i2).copied().unwrap_or(0);
                    if code == 0 {
                        break;
                    }
                    // JS L263: `if (code === CHAR_LEFT_PARENTHESES)` sets
                    // backslashes (a quirk — see BEHAVIORAL_ORACLE); then advance.
                    if code == CHAR_LEFT_PARENTHESES {
                        backslashes = true;
                        token.backslashes = Some(true);
                        index += 1;
                        continue;
                    }
                    if code == CHAR_RIGHT_PARENTHESES {
                        finished = true;
                        break;
                    }
                }
                continue;
            }
            break;
        }

        // lib/scan.js L274-L283 — isGlob already true → finish
        if is_glob {
            finished = true;
            if scan_to_end {
                continue;
            }
            break;
        }
    }

    // lib/scan.js L285-L289 — noext post-processing
    if opts.noext == Some(true) {
        is_extglob = false;
        is_glob = false;
    }

    // lib/scan.js L291-L317 — base/glob/prefix split
    let mut base: String;
    let mut prefix = String::new();
    let mut glob = String::new();

    // str = input (we keep `units` as the source of truth for slicing)
    let mut str_start: usize = 0; // start offset into units for `str`
    let mut str_len = units.len(); // length of `str`

    if start > 0 {
        // prefix = str.slice(0, start); str = str.slice(start);
        prefix = slice_units_to_string(units, 0, start);
        str_start = start;
        str_len = str_len.saturating_sub(start);
        // last_index -= start
        last_index = last_index.saturating_sub(start);
    }

    // Reconstruct `str` boundaries for slicing: units[str_start..str_start+str_len]
    let str_units = &units[str_start..str_start + str_len];

    if str_len > 0 && is_glob && last_index > 0 {
        // base = str.slice(0, last_index); glob = str.slice(last_index)
        base = slice_units_to_string(str_units, 0, last_index);
        glob = slice_units_to_string(str_units, last_index, str_len);
    } else if is_glob {
        base = String::new();
        glob = slice_units_to_string(str_units, 0, str_len);
    } else {
        base = slice_units_to_string(str_units, 0, str_len);
    }

    // lib/scan.js L309-L313 — trim trailing separator from base
    if !base.is_empty() && base != "/" && base != slice_units_to_string(units, 0, units.len()) {
        // `base !== str` — compare base to the full `str` (post-prefix slice)
        let full_str = slice_units_to_string(str_units, 0, str_len);
        if base != full_str {
            // JS: `base.charCodeAt(base.length - 1)` — last UTF-16 unit.
            let last_unit = base.encode_utf16().last().unwrap_or(0);
            if is_path_separator(last_unit) {
                // Safe here: the branch runs only when the final UTF-16 unit is ASCII
                // '/' or '\', so removing one Rust char removes exactly one UTF-16 unit.
                base.pop();
            }
        }
    }

    // lib/scan.js L319-L325 — unescape
    if opts.unescape == Some(true) {
        if !glob.is_empty() {
            glob = remove_backslashes(&glob);
        }
        if !base.is_empty() && backslashes {
            base = remove_backslashes(&base);
        }
    }

    // lib/scan.js L327-L340 — state (always-present fields)
    let mut state = ScanState {
        prefix,
        input: String::new(), // set below from original
        start,
        base,
        glob,
        is_brace,
        is_bracket,
        is_glob,
        is_extglob,
        is_globstar,
        negated,
        negated_extglob,
        ..ScanState::default()
    };

    // lib/scan.js L342-L347 — tokens
    if opts.tokens == Some(true) {
        state.max_depth = Some(0.0);
        // `if (!isPathSeparator(code))` — `code` is the last-advanced value
        if !is_path_separator(code) {
            tokens.push(token.clone());
        }
        state.tokens = Some(tokens.clone());
    }

    // lib/scan.js L349-L386 — parts/slashes assembly
    if opts.parts == Some(true) || opts.tokens == Some(true) {
        let mut prev_index: Option<usize> = None;

        for (idx, &slash) in slashes.iter().enumerate() {
            // JS L354: `const n = prevIndex ? prevIndex + 1 : start;`
            // JS `0` is falsy → when prev_index is Some(0), n = start (not 1).
            // This mirrors the same prevIndex-falsy quirk as the trailing-part
            // check below (L373: `if (prevIndex && ...)`).
            let n = match prev_index {
                Some(p) if p != 0 => p + 1,
                _ => start,
            };
            let i = slash;
            // value = input.slice(n, i)
            let value = slice_units_to_string(units, n, i);
            if opts.tokens == Some(true) {
                let toks = state.tokens.as_mut().unwrap();
                if idx == 0 && start != 0 {
                    toks[idx].is_prefix = Some(true);
                    toks[idx].value = state.prefix.clone();
                } else {
                    toks[idx].value = value.clone();
                }
                set_depth(&mut toks[idx]);
                let d = toks[idx].depth.unwrap_or(0.0);
                state.max_depth = Some(state.max_depth.unwrap_or(0.0) + d);
            }
            if idx != 0 || !value.is_empty() {
                parts.push(value);
            }
            prev_index = Some(i);
        }

        // lib/scan.js L378-L386 — trailing part
        if let Some(pi) = prev_index {
            if pi != 0 && pi + 1 < units.len() {
                let value = slice_units_to_string(units, pi + 1, units.len());
                parts.push(value.clone());
                if opts.tokens == Some(true) {
                    let toks = state.tokens.as_mut().unwrap();
                    let last = toks.len().saturating_sub(1);
                    if last < toks.len() {
                        toks[last].value = value;
                        set_depth(&mut toks[last]);
                        let d = toks[last].depth.unwrap_or(0.0);
                        state.max_depth = Some(state.max_depth.unwrap_or(0.0) + d);
                    }
                }
            }
        }

        state.slashes = Some(slashes.clone());
        state.parts = Some(parts.clone());
    }

    state
}

/// Slice a UTF-16 unit range back into a Rust `String`. Per D-013, pattern-side
/// text is well-formed UTF-8, so this never encounters lone surrogates through
/// the `scan(&str)` entry. The unit-level `scan_utf16` could in principle
/// receive lone surrogates; we use `from_utf16_lossy` there to avoid panicking
/// (replacing with U+FFFD, matching D-013's ingestion policy). For well-formed
/// input (the only path from `scan(&str)` and all corpus cases) this is exact.
fn slice_units_to_string(units: &[u16], from: usize, to: usize) -> String {
    let f = from.min(units.len());
    let t = to.min(units.len());
    if f >= t {
        return String::new();
    }
    String::from_utf16_lossy(&units[f..t])
}

/// Ergonomic wrapper: encode `&str` to UTF-16 units and scan (D-016).
/// `input` is stored verbatim into `ScanState.input`.
pub fn scan(input: &str, opts: &ScanOptions) -> ScanState {
    let units: Vec<u16> = input.encode_utf16().collect();
    let mut state = scan_utf16(&units, opts);
    state.input = input.to_string();
    state
}

#[cfg(test)]
mod tests {
    use super::*;

    // Every expected value below is from the oracle (Main/lib/scan.js) via
    // Main/test/api.scan.js — original-derived pins, not hand-derived.

    fn s(input: &str) -> ScanState {
        scan(input, &ScanOptions::default())
    }

    #[test]
    fn plain_path_base_glob() {
        // api.scan.js L33: both('foo/bar') => ['foo/bar','']
        let st = s("foo/bar");
        assert_eq!(st.base, "foo/bar");
        assert_eq!(st.glob, "");
        assert!(!st.is_glob);
    }

    #[test]
    fn at_in_segment_is_not_extglob_without_paren() {
        // both('foo/@bar') => ['foo/@bar','']
        let st = s("foo/@bar");
        assert_eq!(st.base, "foo/@bar");
        assert_eq!(st.glob, "");
        assert!(!st.is_glob);
    }

    #[test]
    fn trailing_plus_is_not_extglob() {
        // both('foo/bar+') => ['foo/bar+','']
        let st = s("foo/bar+");
        assert_eq!(st.base, "foo/bar+");
        assert!(!st.is_glob);
    }

    #[test]
    fn star_splits_base_glob() {
        // both('foo/bar*') => ['foo','bar*']
        let st = s("foo/bar*");
        assert_eq!(st.base, "foo");
        assert_eq!(st.glob, "bar*");
        assert!(st.is_glob);
    }

    #[test]
    fn leading_dot_slash() {
        // scan('./foo/bar/*.js') deep-equal
        let st = s("./foo/bar/*.js");
        assert_eq!(st.input, "./foo/bar/*.js");
        assert_eq!(st.prefix, "./");
        assert_eq!(st.start, 2);
        assert_eq!(st.base, "foo/bar");
        assert_eq!(st.glob, "*.js");
        assert!(st.is_glob);
        assert!(!st.is_globstar);
        assert!(!st.is_extglob);
        assert!(!st.negated);
        assert!(!st.negated_extglob);
    }

    #[test]
    fn detect_braces_scan_to_end() {
        let st = scan(
            "foo/{a,b,c}/*.js",
            &ScanOptions::default().with_scan_to_end(true),
        );
        assert_eq!(st.base, "foo");
        assert_eq!(st.glob, "{a,b,c}/*.js");
        assert!(st.is_brace);
        assert!(st.is_glob);
    }

    #[test]
    fn detect_globstars_scan_to_end() {
        let st = scan(
            "./foo/**/*.js",
            &ScanOptions::default().with_scan_to_end(true),
        );
        assert_eq!(st.prefix, "./");
        assert_eq!(st.start, 2);
        assert_eq!(st.base, "foo");
        assert_eq!(st.glob, "**/*.js");
        assert!(st.is_globstar);
        assert!(st.is_glob);
    }

    #[test]
    fn detect_extglobs() {
        let st = s("./foo/@(foo)/*.js");
        assert_eq!(st.base, "foo");
        assert_eq!(st.glob, "@(foo)/*.js");
        assert!(st.is_extglob);
        assert!(!st.negated_extglob);
    }

    #[test]
    fn detect_extglobs_and_globstars_parts() {
        let st = scan(
            "./foo/@(bar)/**/*.js",
            &ScanOptions::default().with_parts(true),
        );
        assert_eq!(st.base, "foo");
        assert_eq!(st.glob, "@(bar)/**/*.js");
        assert!(st.is_extglob);
        assert!(st.is_globstar);
        assert_eq!(st.slashes.as_deref(), Some(&[1usize, 5, 12, 15][..]));
        assert_eq!(
            st.parts.as_deref(),
            Some(
                &[
                    "foo".to_string(),
                    "@(bar)".to_string(),
                    "**".to_string(),
                    "*.js".to_string()
                ][..]
            )
        );
    }

    #[test]
    fn leading_bang_negation() {
        let st = s("!foo/bar/*.js");
        assert_eq!(st.prefix, "!");
        assert_eq!(st.start, 1);
        assert_eq!(st.base, "foo/bar");
        assert_eq!(st.glob, "*.js");
        assert!(st.negated);
        assert!(!st.negated_extglob);
    }

    #[test]
    fn negated_extglob_at_start() {
        let st = s("!(foo)*");
        assert_eq!(st.base, "");
        assert_eq!(st.glob, "!(foo)*");
        assert!(st.is_extglob);
        assert!(st.negated_extglob);
        assert!(!st.negated);
    }

    #[test]
    fn negated_extglob_alone() {
        let st = s("!(foo)");
        assert_eq!(st.glob, "!(foo)");
        assert!(st.is_extglob);
        assert!(st.negated_extglob);
    }

    #[test]
    fn not_negated_extglob_in_middle() {
        let st = s("test/!(foo)/*");
        assert_eq!(st.base, "test");
        assert_eq!(st.glob, "!(foo)/*");
        assert!(st.is_extglob);
        assert!(!st.negated_extglob);
    }

    #[test]
    fn dot_slash_bang_negated() {
        let st = s("./!foo/bar/*.js");
        assert_eq!(st.prefix, "./!");
        assert_eq!(st.start, 3);
        assert_eq!(st.base, "foo/bar");
        assert!(st.negated);
        let st2 = s("!./foo/bar/*.js");
        assert_eq!(st2.prefix, "!./");
        assert_eq!(st2.start, 3);
        assert!(st2.negated);
    }

    #[test]
    fn noext_disables_glob() {
        let st = scan("./foo/bar/*.js", &ScanOptions::default().with_noext(true));
        assert_eq!(st.base, "foo/bar/*.js");
        assert_eq!(st.glob, "");
        assert!(!st.is_glob);
        assert!(!st.is_extglob);
    }

    #[test]
    fn nonegate_disables_negation() {
        let st = scan("!foo/bar/*.js", &ScanOptions::default().with_nonegate(true));
        assert_eq!(st.prefix, "");
        assert_eq!(st.start, 0);
        assert_eq!(st.base, "!foo/bar");
        assert_eq!(st.glob, "*.js");
        assert!(!st.negated);
    }

    #[test]
    fn parts_basic() {
        let st = scan("./foo", &ScanOptions::default().with_parts(true));
        assert_eq!(st.parts.as_deref(), Some(&["foo".to_string()][..]));
        let st = scan("foo/bar", &ScanOptions::default().with_parts(true));
        assert_eq!(
            st.parts.as_deref(),
            Some(&["foo".to_string(), "bar".to_string()][..])
        );
    }

    #[test]
    fn parts_globstar() {
        let st = scan("foo/**/*", &ScanOptions::default().with_parts(true));
        assert_eq!(
            st.parts.as_deref(),
            Some(&["foo".to_string(), "**".to_string(), "*".to_string()][..])
        );
    }

    #[test]
    fn parts_bmp_non_ascii() {
        // api.scan.js L360 — BMP non-ASCII in parts
        let st = scan("フォルダ/**/*", &ScanOptions::default().with_parts(true));
        assert_eq!(
            st.parts.as_deref(),
            Some(&["フォルダ".to_string(), "**".to_string(), "*".to_string()][..])
        );
    }

    #[test]
    fn parts_extglob_and_parens() {
        let st = scan("foo/!(abc)", &ScanOptions::default().with_parts(true));
        assert_eq!(
            st.parts.as_deref(),
            Some(&["foo".to_string(), "!(abc)".to_string()][..])
        );
        let st = scan("foo/(bar|baz)", &ScanOptions::default().with_parts(true));
        assert_eq!(
            st.parts.as_deref(),
            Some(&["foo".to_string(), "(bar|baz)".to_string()][..])
        );
    }

    #[test]
    fn unescape_brackets() {
        let opts = ScanOptions::default().with_unescape(true);
        // base('foo\\[a\\/]') => 'foo[a\\/]'  (api.scan.js L281)
        let st = scan("foo\\[a\\/]", &opts);
        assert_eq!(st.base, "foo[a\\/]");
    }

    #[test]
    fn noparen_keeps_parens_in_base() {
        let opts = ScanOptions::default().with_noparen(true);
        assert_eq!(scan("a/(b c)", &opts).base, "a/(b c)");
        assert_eq!(scan("a/(b c)/d", &opts).base, "a/(b c)/d");
    }

    #[test]
    fn empty_input() {
        let st = s("");
        assert_eq!(st.base, "");
        assert_eq!(st.glob, "");
        assert!(!st.is_glob);
    }

    #[test]
    fn lone_surrogate_unit_level_boundary() {
        // D-016 boundary: scan_utf16 accepts lone surrogates. A lone high
        // surrogate is not a structural char; it scans as plain text.
        let units: Vec<u16> = vec![0x0061, 0xD83D, 0x0062]; // a, lone high, b
        let st = scan_utf16(&units, &ScanOptions::default());
        // is_glob false, base is the lossy-decoded string
        assert!(!st.is_glob);
    }

    #[test]
    fn utf16_index_exact_on_astral() {
        // An astral char is 2 UTF-16 units; a slash after it is at unit index 2.
        let st = scan("😀/*", &ScanOptions::default().with_parts(true));
        assert_eq!(st.slashes.as_deref(), Some(&[2usize][..]));
    }

    #[test]
    fn tokens_max_depth_no_slashes_stays_zero() {
        // Oracle: scan('**',{tokens:true}).maxDepth === 0 (no slashes → the
        // parts/depth loop body never runs; the final token's depth is set
        // by `depth()` at push time, but maxDepth is only accumulated in the
        // slashes loop). isGlobstar is also false here (the 2nd `*` breaks
        // before scan_to_end; only scan_to_end paths see globstar propagate).
        let st = scan("**", &ScanOptions::default().with_tokens(true));
        assert_eq!(st.max_depth, Some(0.0));
    }

    #[test]
    fn tokens_max_depth_accumulates_per_segment() {
        // Oracle: scan('foo/bar',{tokens:true}).maxDepth === 2 (one slash →
        // tokens[0] depth=1, trailing part tokens[last] depth=1).
        let st = scan("foo/bar", &ScanOptions::default().with_tokens(true));
        assert_eq!(st.max_depth, Some(2.0));
    }

    #[test]
    fn tokens_absent_without_tokens_opt() {
        let st = s("foo/bar");
        assert!(st.tokens.is_none());
        assert!(st.max_depth.is_none());
        assert!(st.slashes.is_none());
        assert!(st.parts.is_none());
    }

    // Regression test for the prevIndex=0 falsy bug in parts assembly.
    // JS L354: `const n = prevIndex ? prevIndex + 1 : start;` — when the
    // first slash is at index 0, prevIndex becomes 0 after the first iteration,
    // and JS treats `0` as falsy → n = start (not 1). The Rust port
    // incorrectly used Some(0) => 0 + 1 = 1, producing wrong parts for
    // inputs like `//` with parts:true.
    #[test]
    fn parts_double_slash_previndex_zero_falsy() {
        // scan('//', {parts:true}) — JS: parts = ['/'] (not [''])
        let st = scan("//", &ScanOptions::default().with_parts(true));
        assert_eq!(
            st.parts.as_deref(),
            Some(&["/".to_string()][..]),
            "parts should be ['/'] not [''] for input '//"
        );
        // Also check tokens
        let st = scan("//", &ScanOptions::default().with_tokens(true));
        assert_eq!(
            st.tokens.as_ref().map(|t| &t[1].value),
            Some(&"/".to_string()),
            "token[1].value should be '/' not '' for input '//'"
        );
    }
}
