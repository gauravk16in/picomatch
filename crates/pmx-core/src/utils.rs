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

/// constants.js:L101 — `REGEX_SPECIAL_CHARS_GLOBAL = /([-*+?.^${}(|)[\]])/g`,
/// utils.js:L14 (`escapeRegex`). The quote branch escapes one JS char (= one
/// UTF-16 unit, possibly a lone surrogate half) at a time; the &str-shaped
/// wrapper lands when a later chunk needs it (C6).
pub(crate) fn push_escape_regex_unit(buf: &mut Vec<u16>, u: u16) {
    static SET: &[u8] = b"-*+?.^${}()|[]\\";
    if u < 0x80 && SET.contains(&(u as u8)) {
        buf.push(b'\\' as u16);
    }
    buf.push(u);
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

/// lib/utils.js:L14 — `escapeRegex(str)` over a u16 unit slice.
pub(crate) fn escape_regex(units: &[u16]) -> Vec<u16> {
    let mut out = Vec::with_capacity(units.len());
    for &u in units {
        push_escape_regex_unit(&mut out, u);
    }
    out
}

