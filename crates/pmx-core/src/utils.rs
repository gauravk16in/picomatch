//! utils.rs — port: C0+C1 slice of reference/lib/utils.js.
//!
//! Representation note (C0_DESIGN.md findings): anything that can hold
//! *emitted* text is a `Vec<u16>` (UTF-16 units) — JS strings, and emitted
//! regex sources in particular, may contain lone surrogates (inline fastpath
//! escapes astral halves individually). Only `&str`-guaranteed-well-formed
//! values (like raw patterns) stay strings.

/// lib/utils.js:L43-L50 — strip a leading "./", recording the prefix.
pub fn remove_prefix(input: &str) -> (&'static str, &str) {
    match input.strip_prefix("./") {
        Some(rest) => ("./", rest),
        None => ("", input),
    }
}

/// Cheap unit-buffer extension for ASCII fragments.
pub(crate) fn extend_units(buf: &mut Vec<u16>, s: &str) {
    buf.extend(s.encode_utf16());
}

/// The 14-char REGEX_SPECIAL_CHARS set (constants.js:L99-L101):
/// `- * + ? . ^ $ { } ( | ) [ ]` — note: NO backslash (JS `[\]]` inside the
/// class is a literal `]`). Pinned empirically against the oracle
/// (scratch/probe-utils-semantics.json: escapeRegex leaves `\` untouched,
/// `hasRegexChars('\\') === false`).
pub(crate) const SPECIAL_CHARS: &[u8] = b"-*+?.^${}(|)[]";

/// constants.js:L101 — `REGEX_SPECIAL_CHARS_GLOBAL = /([-*+?.^${}(|)[\]])/g`,
/// utils.js:L14 (`escapeRegex`). The quote branch escapes one JS char (= one
/// UTF-16 unit, possibly a lone surrogate half) at a time; the &str-shaped
/// wrapper lands when a later chunk needs it (C6).
pub(crate) fn push_escape_regex_unit(buf: &mut Vec<u16>, u: u16) {
    if u < 0x80 && SPECIAL_CHARS.contains(&(u as u8)) {
        buf.push(b'\\' as u16);
    }
    buf.push(u);
}

/// utils.js:L12 — `hasRegexChars(str)` = `REGEX_SPECIAL_CHARS.test(str)`
/// (constants.js:L99). Used by parse.js:L856 (literalBrackets alternation).
pub fn has_regex_chars(s: &str) -> bool {
    s.bytes().any(|b| b < 0x80 && SPECIAL_CHARS.contains(&b))
}

/// Unit-slice variant used by parser internals over emitted UTF-16 buffers.
pub(crate) fn has_regex_chars_units(units: &[u16]) -> bool {
    units
        .iter()
        .any(|&u| u < 0x80 && SPECIAL_CHARS.contains(&(u as u8)))
}

/// utils.js:L13 — `isRegexChar(str)` = `str.length === 1 && hasRegexChars(str)`.
/// `str.length` is a UTF-16-unit count, so exactly one BMP char in the set.
/// Exported but never called inside lib/ (public API surface).
pub fn is_regex_char(s: &str) -> bool {
    let mut units = s.encode_utf16();
    matches!(units.next(), Some(u) if units.next().is_none() && u < 0x80 && SPECIAL_CHARS.contains(&(u as u8)))
}

/// utils.js:L14 — `escapeRegex(str)`: prefix every SPECIAL_CHARS member with
/// `\`. &str inputs are well-formed, so char-wise == unit-wise here
/// (the `Vec<u16>` route for possibly-ill-formed emitted text is
/// `push_escape_regex_unit`). Call sites: parse.js:L34, L235-L236, L552,
/// L766, L860.
pub fn escape_regex(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        if (c as u32) < 0x80 && SPECIAL_CHARS.contains(&(c as u8)) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// `escapeRegex` over a UTF-16 unit slice (parser-internal emitted buffers).
pub(crate) fn escape_regex_units(units: &[u16]) -> Vec<u16> {
    let mut out = Vec::with_capacity(units.len());
    for &u in units {
        push_escape_regex_unit(&mut out, u);
    }
    out
}

/// The 12-char negative-lookahead set of REGEX_BACKSLASH
/// (constants.js:L97 `/\\(?![*+?^${}(|)[\]])/g`): `* + ? ^ $ { } ( | ) [ ]`.
const GLOB_ESCAPE_SPECIALS: &[u8] = b"*+?^${}(|)[]";

/// utils.js:L15 — `toPosixSlashes(str)`: replace `\` with `/` UNLESS the next
/// char is in GLOB_ESCAPE_SPECIALS. A trailing `\` (no next char) becomes `/`;
/// `\` before `\` becomes `/` (backslash is not in the set).
/// Call site: lib/picomatch.js:L138 (test() format default when windows).
/// Evidence: scratch/probe-utils-semantics.json `toPosix` block.
pub fn to_posix_slashes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut it = input.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\\'
            && !matches!(it.peek(), Some(n) if (*n as u32) < 0x80 && GLOB_ESCAPE_SPECIALS.contains(&(*n as u8)))
        {
            out.push('/');
        } else {
            out.push(c);
        }
    }
    out
}

/// utils.js:L30-L34 — `removeBackslashes(str)` via REGEX_REMOVE_BACKSLASH
/// (constants.js:L102 `/(?:\[.*?[^\\]\]|\\(?=.))/g`, replacement drops matches
/// that are exactly `\`). Simulation rules (all pinned empirically against
/// the oracle — scratch/probe-utils-semantics.json, probe-removebs-edge.js,
/// probe-removebs-nl*.js):
///  - alternative 1 `\[.*?[^\\]\]`: a `[...]` expression closes at the first
///    `]` (position ≥ i+2) whose preceding char is not `\`, kept verbatim.
///    `.` never crosses a line terminator, so the CONTENT cannot contain one
///    — but the `[^\\]` close-preceding char MAY be one (e.g. `[a\\x\n]` and
///    `[a\n]` are kept).
///  - alternative 2 `\\(?=.)`: a `\` followed by any char except a line
///    terminator is deleted (the lookahead `.` excludes them).
///  - a trailing `\` (or one before a line terminator) is kept.
///
/// JS `.` excludes ALL FOUR line terminators — `\n`, `\r`, `<LS>`, `<PS>` —
/// not just `\n` (verified against the oracle: `removeBackslashes('a\\\rb')`
/// keeps the backslash; the span in `[a\rb\\x]` fails so the `\x` backslash
/// IS deleted).
///
/// Call sites: lib/scan.js:L320, L323 (scan unescape option, Chunk 2).
/// Returns true for the four ECMAScript line terminators that `.` excludes.
fn is_dot_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

pub fn remove_backslashes(input: &str) -> String {
    let s: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < s.len() {
        if s[i] == '[' {
            // alternative 1: `\[.*?[^\\]\]` — shortest close (k ≥ i+2), no
            // line terminator in the `.*?` content; the `[^\\]` char may
            // itself be a line terminator.
            let mut k = i + 1;
            let mut close = None;
            while k < s.len() {
                if is_dot_line_terminator(s[k]) {
                    // a terminator can still be the `[^\\]` char for a close
                    // at k+1; any later close would contain it in the content.
                    if k + 1 < s.len() && s[k + 1] == ']' {
                        close = Some(k + 1);
                    }
                    break;
                }
                if k >= i + 2 && s[k] == ']' && s[k - 1] != '\\' {
                    close = Some(k);
                    break;
                }
                k += 1;
            }
            if let Some(k) = close {
                out.extend(s[i..=k].iter());
                i = k + 1;
                continue;
            }
        }
        if s[i] == '\\' && i + 1 < s.len() && !is_dot_line_terminator(s[i + 1]) {
            // alternative 2: `\\(?=.)` — delete the backslash only.
            i += 1;
            continue;
        }
        out.push(s[i]);
        i += 1;
    }
    out
}

/// utils.js:L63-L72 — `basename(path, { windows })`: last segment after
/// splitting on `/` (posix) or `[\\/]` (windows); when the last segment is
/// empty (trailing slash) the PREVIOUS segment is returned. JS array indexing
/// yields `undefined` for `basename('')` — represented as `None`.
/// Call sites: lib/picomatch.js:L174 (matchBase);
/// original-suite evidence: Main/test/regex-features.js:307-312.
pub fn basename(path: &str, windows: bool) -> Option<&str> {
    let mut segs = path.split(|c| c == '/' || (windows && c == '\\'));
    let last = segs.next_back()?;
    if last.is_empty() {
        segs.next_back()
    } else {
        Some(last)
    }
}

/// utils.js:L52-L61 — `wrapOutput(input, state, options)`.
/// `(?:…)` wrap with ^/$ anchors unless `contains`; negation wrapper ported
/// verbatim but dormant on the inline-fastpath route (routing excludes leading
/// `!`, so `state.negated` is always false there — documented, not elided).
pub(crate) fn wrap_output(input: &[u16], negated: bool, contains: bool) -> Vec<u16> {
    let mut out = Vec::with_capacity(input.len() + 6);
    let mut wrapped = Vec::with_capacity(input.len() + 6);
    if !contains {
        wrapped.push(b'^' as u16);
    }
    extend_units(&mut wrapped, "(?:");
    wrapped.extend_from_slice(input);
    wrapped.push(b')' as u16);
    if !contains {
        wrapped.push(b'$' as u16);
    }
    if negated {
        extend_units(&mut out, "(?:^(?!");
        out.extend_from_slice(&wrapped);
        extend_units(&mut out, ").*$)");
        out
    } else {
        wrapped
    }
}

/// JS Number#toString semantics for template interpolation (`${max}`,
/// parse.js:L368). JS switches to exponent form for |v| >= 1e21 or |v| < 1e-6,
/// writes "+" on non-negative exponents (`1e+21`), normalizes -0 to 0, and
/// prints NaN/±Infinity by name — none of which match Rust's f64 Display.
/// Domain note: reachable values here are post-clamp `Math.min(65536, x)`,
/// i.e. bounded above; negatives (incl. -Infinity, -0, subnormals) are not.
pub fn js_number(v: f64) -> String {
    if v.is_nan() {
        return "NaN".to_string();
    }
    if v.is_infinite() {
        return if v > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    if v == 0.0 {
        return "0".to_string(); // JS String(-0) === "0"
    }
    let a = v.abs();
    // JS exponent threshold: |v| >= 1e21 or |v| < 1e-6 (NaN handled above).
    if !(1e-6..1e21).contains(&a) {
        // shortest-mantissa scientific; Rust {:e} omits the "+" on positive exponents
        let s = format!("{v:e}");
        if let Some(pos) = s.find('e') {
            if !s[pos + 1..].starts_with('-') {
                return format!("{}e+{}", &s[..pos], &s[pos + 1..]);
            }
        }
        s
    } else {
        format!("{v}")
    }
}

/// lib/utils.js:L36-L41 — escape the last UNESCAPED occurrence of `ch`
/// strictly before `last_idx`, inserting a `\` in front of it. u16-basis:
/// emitted text is a unit buffer; `ch` is an ASCII opener from the parser.
pub(crate) fn escape_last(input: &[u16], ch: char, last_idx: Option<usize>) -> Vec<u16> {
    let target = u32::from(ch);
    let mut cand = match last_idx {
        Some(i) if i < input.len() => Some(i),
        _ => input.len().checked_sub(1),
    };

    while let Some(i) = cand {
        if u32::from(input[i]) == target {
            if i > 0 && input[i - 1] == b'\\' as u16 {
                // preceding unit is a backslash => this occurrence is escaped;
                // JS recurses with lastIndexOf(char, i - 1)
                cand = i.checked_sub(1);
                continue;
            }
            let mut out = Vec::with_capacity(input.len() + 1);
            out.extend_from_slice(&input[..i]);
            out.push(b'\\' as u16);
            out.extend_from_slice(&input[i..]);
            return out;
        }
        cand = i.checked_sub(1);
    }
    input.to_vec()
}

/// C8-side helper, landed now per review c0-1: remove a *verified* trailing
/// sub-slice from `buf` (JS `slice(0, -s.length)` at sites where the removed
/// text was appended contiguously — parse.js:L1189/L1204/L1232).
#[allow(dead_code)] // first callers land in C8
pub(crate) fn strip_suffix(buf: &mut Vec<u16>, suffix: &[u16]) {
    debug_assert!(buf.ends_with(suffix), "strip_suffix called on non-suffix");
    if buf.ends_with(suffix) {
        buf.truncate(buf.len() - suffix.len());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Every expected value below was captured from the oracle
    // (Main/lib/utils.js) via scratch/probe-utils-semantics.js and
    // scratch/probe-removebs-edge.js — original-derived pins, not
    // hand-derived expectations.

    #[test]
    fn special_chars_set_is_exactly_the_js_14() {
        // constants.js:L99-L101 membership, oracle-pinned: `- * + ? . ^ $ { } ( | ) [ ]`.
        for &c in b"-*+?.^${}(|)[]" {
            assert!(SPECIAL_CHARS.contains(&c), "missing {c}");
        }
        assert!(!SPECIAL_CHARS.contains(&b'\\'), "JS set has NO backslash");
        assert_eq!(SPECIAL_CHARS.len(), 14);
    }

    #[test]
    fn push_escape_regex_unit_matches_oracle() {
        // oracle: escapeRegex('a.b[c]d$e^f(g)h{i}j|k\l-m+n?o*p')
        //       = 'a\.b\[c\]d\$e\^f\(g\)h\{i\}j\|k\l\-m\+n\?o\*p'
        // (backslash NOT escaped; lone surrogate halves pass through untouched).
        let input: Vec<u16> = "a.b[c]d$e^f(g)h{i}j|k\\l-m+n?o*p".encode_utf16().collect();
        let mut out = Vec::new();
        for &u in &input {
            push_escape_regex_unit(&mut out, u);
        }
        assert_eq!(
            String::from_utf16(&out).unwrap(),
            "a\\.b\\[c\\]d\\$e\\^f\\(g\\)h\\{i\\}j\\|k\\l\\-m\\+n\\?o\\*p"
        );
        // lone surrogate half: pushed through as-is (JS escapes per UTF-16 unit).
        let mut lone = Vec::new();
        for &u in [0x0061u16, 0xD83D, 0x0062].iter() {
            push_escape_regex_unit(&mut lone, u);
        }
        assert_eq!(lone, vec![0x0061, 0xD83D, 0x0062]);
    }

    #[test]
    fn has_regex_chars_and_is_regex_char_oracle() {
        assert!(!has_regex_chars("abc"));
        assert!(has_regex_chars("a.c"));
        assert!(!has_regex_chars(""));
        assert!(!has_regex_chars("\\")); // oracle: hasRegexChars('\\') === false
        assert!(is_regex_char("."));
        assert!(!is_regex_char("ab"));
        assert!(!is_regex_char(""));
    }

    #[test]
    fn escape_regex_str_wrapper_matches_oracle() {
        assert_eq!(
            escape_regex("a.b[c]d$e^f(g)h{i}j|k\\l-m+n?o*p"),
            "a\\.b\\[c\\]d\\$e\\^f\\(g\\)h\\{i\\}j\\|k\\l\\-m\\+n\\?o\\*p"
        );
        assert_eq!(escape_regex("a\u{1F600}b"), "a\u{1F600}b");
        assert_eq!(escape_regex(""), "");
    }

    #[test]
    fn to_posix_slashes_matches_oracle() {
        assert_eq!(to_posix_slashes("a\\b\\c"), "a/b/c");
        assert_eq!(to_posix_slashes("foo\\*"), "foo\\*");
        assert_eq!(to_posix_slashes("foo\\?"), "foo\\?");
        assert_eq!(to_posix_slashes("foo\\+"), "foo\\+");
        assert_eq!(to_posix_slashes("a\\^b"), "a\\^b");
        assert_eq!(to_posix_slashes("a\\$b"), "a\\$b");
        assert_eq!(to_posix_slashes("a\\{b"), "a\\{b");
        assert_eq!(to_posix_slashes("a\\(b"), "a\\(b");
        assert_eq!(to_posix_slashes("a\\|b"), "a\\|b");
        assert_eq!(to_posix_slashes("a\\]b"), "a\\]b");
        assert_eq!(to_posix_slashes("a\\[b"), "a\\[b");
        assert_eq!(to_posix_slashes("a\\"), "a/");
        assert_eq!(to_posix_slashes("a\\\\b"), "a//b");
        assert_eq!(to_posix_slashes("a\\\\\\b"), "a///b");
        assert_eq!(
            to_posix_slashes("C:\\Users\\foo\\*.js"),
            "C:/Users/foo\\*.js"
        );
        assert_eq!(to_posix_slashes(""), "");
    }

    #[test]
    fn remove_backslashes_matches_oracle() {
        assert_eq!(remove_backslashes("a\\b"), "ab");
        assert_eq!(remove_backslashes("\\*"), "*");
        assert_eq!(remove_backslashes("[\\/]"), "[\\/]");
        assert_eq!(remove_backslashes("foo\\[bar\\]baz"), "foo[bar]baz");
        assert_eq!(remove_backslashes("[a\\]b]"), "[a\\]b]");
        assert_eq!(remove_backslashes("a\\"), "a\\");
        assert_eq!(remove_backslashes("a\\\\b"), "ab");
        assert_eq!(remove_backslashes("\\{a,b\\}"), "{a,b}");
        assert_eq!(remove_backslashes("[a\\]b\\\\c]x"), "[a\\]b\\\\c]x");
        assert_eq!(remove_backslashes(""), "");
        // newline edges (probe-removebs-edge.js): JS `.` never crosses '\n'.
        assert_eq!(remove_backslashes("a\\\nb"), "a\\\nb");
        assert_eq!(remove_backslashes("[a\nb]\\x"), "[a\nb]x");
        assert_eq!(remove_backslashes("[abc\\x"), "[abcx");
        assert_eq!(remove_backslashes("[]\\x"), "[]x");
        assert_eq!(remove_backslashes("\\\\\nx"), "\\\nx");
        assert_eq!(remove_backslashes("[ab]\\cd"), "[ab]cd");
        assert_eq!(remove_backslashes("[a\u{1F600}b]\\x"), "[a\u{1F600}b]x");
        assert_eq!(remove_backslashes("[a\u{1F600}]\\x"), "[a\u{1F600}]x");
        assert_eq!(remove_backslashes("[\\]]x"), "[\\]]x");
        assert_eq!(remove_backslashes("\\\n"), "\\\n");
        assert_eq!(remove_backslashes("[ab]\\"), "[ab]\\");
        // '\n' as the `[^\\]` close-preceding char (probe-removebs-nl*.js):
        // content is '\n'-free but the close char itself may be '\n'.
        assert_eq!(remove_backslashes("[a\n\\x]"), "[a\nx]"); // content would span '\n': no match
        assert_eq!(remove_backslashes("[a\n]"), "[a\n]"); // close at '\n'+1: kept
        assert_eq!(remove_backslashes("[a\n\\x]q"), "[a\nx]q");
        assert_eq!(remove_backslashes("[a\n]\\y"), "[a\n]y");
        assert_eq!(remove_backslashes("a\\\n\\b"), "a\\\nb");
        assert_eq!(remove_backslashes("[a\\\\x\n]"), "[a\\\\x\n]"); // kept: bs inside content, '\n' close
        assert_eq!(remove_backslashes("[a\\x\n]"), "[a\\x\n]");
        assert_eq!(remove_backslashes("[ab\n]\\z"), "[ab\n]z");
        // JS `.` excludes ALL four line terminators (\n, \r, <LS>, <PS>) —
        // oracle-pinned 2026-08-03 (final-audit F-07):
        // removeBackslashes('a\\\rb') === 'a\\\rb' (backslash KEPT before CR),
        // same for <LS>/<PS>; and a bracket span cannot cross a terminator,
        // so the `\x` backslash inside `[a\rb\\x]` IS deleted.
        assert_eq!(remove_backslashes("a\\\rb"), "a\\\rb");
        assert_eq!(remove_backslashes("a\\\u{2028}b"), "a\\\u{2028}b");
        assert_eq!(remove_backslashes("a\\\u{2029}b"), "a\\\u{2029}b");
        assert_eq!(remove_backslashes("\\\r"), "\\\r");
        assert_eq!(remove_backslashes("[a\rb\\x]"), "[a\rbx]");
        assert_eq!(remove_backslashes("[a\u{2028}b\\x]"), "[a\u{2028}bx]");
        assert_eq!(remove_backslashes("[a\r]"), "[a\r]"); // CR as close-preceding char: kept
    }

    #[test]
    fn basename_matches_oracle_and_original_suite() {
        // Main/test/regex-features.js:307-312 (the original-suite basename pins).
        assert_eq!(basename("/a/b/c", false), Some("c"));
        assert_eq!(basename("/a/b/c/", false), Some("c"));
        assert_eq!(basename("/a\\b/c", true), Some("c"));
        assert_eq!(basename("/a\\b/c\\", true), Some("c"));
        assert_eq!(basename("\\a/b\\c", true), Some("c"));
        assert_eq!(basename("\\a/b\\c/", true), Some("c"));
        // probe-pinned remainder.
        assert_eq!(basename("c", false), Some("c"));
        assert_eq!(basename("/", false), Some(""));
        assert_eq!(basename("", false), None); // JS: segs[-1] === undefined
        assert_eq!(basename("a/b/", false), Some("b"));
        assert_eq!(basename("a/", false), Some("a"));
    }

    #[test]
    fn existing_helpers_still_oracle_pinned() {
        // remove_prefix (utils.js:L43-L50), probe prefix1..5.
        assert_eq!(remove_prefix("./a/b"), ("./", "a/b"));
        assert_eq!(remove_prefix("a/b"), ("", "a/b"));
        assert_eq!(remove_prefix("./"), ("./", ""));
        assert_eq!(remove_prefix(".//a"), ("./", "/a"));
        assert_eq!(remove_prefix("././a"), ("./", "./a"));
        // wrap_output (utils.js:L52-L61), probe wrap block.
        let s = |v: &[u16]| String::from_utf16(v).unwrap();
        let units = |t: &str| t.encode_utf16().collect::<Vec<_>>();
        assert_eq!(s(&wrap_output(&units("abc"), false, false)), "^(?:abc)$");
        assert_eq!(s(&wrap_output(&units("abc"), false, true)), "(?:abc)");
        assert_eq!(
            s(&wrap_output(&units("abc"), true, false)),
            "(?:^(?!^(?:abc)$).*$)"
        );
        assert_eq!(
            s(&wrap_output(&units("abc"), true, true)),
            "(?:^(?!(?:abc)).*$)"
        );
        assert_eq!(s(&wrap_output(&[], false, false)), "^(?:)$");
        // escape_last (utils.js:L36-L41), probe escapeLast block.
        let el = |input: &str, ch: char| s(&escape_last(&units(input), ch, None));
        assert_eq!(el("a[bc[d", '['), "a[bc\\[d");
        assert_eq!(el("a\\[bc[d", '['), "a\\[bc\\[d");
        assert_eq!(el("\\[", '['), "\\[");
        assert_eq!(el("abc", '['), "abc");
        assert_eq!(el("", '['), "");
        assert_eq!(el("x(y\\(z", '('), "x\\(y\\(z");
        assert_eq!(el("a[b\\\\[c[d", '['), "a[b\\\\[c\\[d");
    }
}
