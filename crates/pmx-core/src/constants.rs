//! constants.rs — port: reference/lib/constants.js (entire file).
//!
//! Static regex-fragment tables. Emitted output is built ONLY from these
//! fragments (or escaped literal text) — the "fragment law" (ARCHITECTURE.md §13).

/// parse.js:L93 constant — `MAX_LENGTH: 1024 * 64`.
pub const MAX_LENGTH: usize = 1024 * 64;

/// constants.js:L6 — `DEFAULT_MAX_EXTGLOB_RECURSION = 0`.
#[allow(dead_code)] // consumed by C7 (analyzeRepeatedExtglob, parse.js:L292-L295)
pub const DEFAULT_MAX_EXTGLOB_RECURSION: f64 = 0.0;

/// The per-platform regex fragment dictionary (constants.js:L12-L67).
/// Field names mirror the JS keys 1:1 so citations stay greppable.
#[derive(Debug)]
pub struct PlatformChars {
    pub dot_literal: &'static str,   // "\\."
    pub plus_literal: &'static str,  // "\\+"
    pub qmark_literal: &'static str, // "\\?"
    pub slash_literal: &'static str, // "\\/" or "[\\\\/]"
    pub one_char: &'static str,      // "(?=.)"
    pub qmark: &'static str,         // "[^/]" or "[^\\\\/]"
    pub end_anchor: &'static str,
    pub dots_slash: &'static str,
    pub no_dot: &'static str,
    pub no_dots: &'static str,
    pub no_dot_slash: &'static str,
    pub no_dots_slash: &'static str,
    pub qmark_no_dot: &'static str,
    pub star: &'static str, // "[^/]*?" or "[^\\\\/]*?"
    pub start_anchor: &'static str,
    pub sep: &'static str, // "/" or "\\"
}

/// constants.js:L29-L46 (POSIX_CHARS).
pub static POSIX_CHARS: PlatformChars = PlatformChars {
    dot_literal: r"\.",
    plus_literal: r"\+",
    qmark_literal: r"\?",
    slash_literal: r"\/",
    one_char: "(?=.)",
    qmark: "[^/]",
    end_anchor: r"(?:\/|$)",
    dots_slash: r"\.{1,2}(?:\/|$)",
    no_dot: r"(?!\.)",
    no_dots: r"(?!(?:^|\/)\.{1,2}(?:\/|$))",
    no_dot_slash: r"(?!\.{0,1}(?:\/|$))",
    no_dots_slash: r"(?!\.{1,2}(?:\/|$))",
    qmark_no_dot: r"[^.\/]",
    star: "[^/]*?",
    start_anchor: r"(?:^|\/)",
    sep: "/",
};

/// constants.js:L52-L67 (WINDOWS_CHARS). WIN_SLASH is the 3 chars
/// backslash-backslash-slash (constants.js:L3 `'\\\\/'`).
pub static WINDOWS_CHARS: PlatformChars = PlatformChars {
    dot_literal: r"\.",
    plus_literal: r"\+",
    qmark_literal: r"\?",
    slash_literal: r"[\\/]",
    one_char: "(?=.)",
    qmark: r"[^\\/]",
    end_anchor: r"(?:[\\/]|$)",
    dots_slash: r"\.{1,2}(?:[\\/]|$)",
    no_dot: r"(?!\.)",
    no_dots: r"(?!(?:^|[\\/])\.{1,2}(?:[\\/]|$))",
    no_dot_slash: r"(?!\.{0,1}(?:[\\/]|$))",
    no_dots_slash: r"(?!\.{1,2}(?:[\\/]|$))",
    qmark_no_dot: r"[^.\\/]",
    star: r"[^\\/]*?",
    start_anchor: r"(?:^|[\\/])",
    sep: r"\",
};

/// constants.js:L181-L183 — `globChars(win32) = win32 === true ? WINDOWS : POSIX`.
pub fn glob_chars(win32: bool) -> &'static PlatformChars {
    if win32 {
        &WINDOWS_CHARS
    } else {
        &POSIX_CHARS
    }
}

/// One extglob operator's fragments (constants.js:L167-L175).
#[derive(Debug)]
pub struct ExtglobEntry {
    pub kind: &'static str, // JS `type` ('negate','qmark','plus','star','at')
    pub open: &'static str,
    pub close: &'static str,
}

/// constants.js:L167-L175, per platform. JS builds these per call by
/// interpolating `chars.STAR` into the negate close; here they are
/// compile-time constants per platform (review note N-1), values identical.
#[derive(Debug)]
pub struct ExtglobChars {
    pub negate: ExtglobEntry,
    pub qmark: ExtglobEntry,
    pub plus: ExtglobEntry,
    pub star: ExtglobEntry,
    pub at: ExtglobEntry,
}

macro_rules! extglob_chars {
    ($star:literal) => {
        ExtglobChars {
            negate: ExtglobEntry {
                kind: "negate",
                open: "(?:(?!(?:",
                close: concat!("))", $star, ")"),
            },
            qmark: ExtglobEntry {
                kind: "qmark",
                open: "(?:",
                close: ")?",
            },
            plus: ExtglobEntry {
                kind: "plus",
                open: "(?:",
                close: ")+",
            },
            star: ExtglobEntry {
                kind: "star",
                open: "(?:",
                close: ")*",
            },
            at: ExtglobEntry {
                kind: "at",
                open: "(?:",
                close: ")",
            },
        }
    };
}

// NOTE: star fragments are duplicated as literals here because `concat!`
// requires literals; values are the same strings as POSIX_CHARS.star /
// WINDOWS_CHARS.star (constants.js:L172 `close: `))${chars.STAR})``).
pub static EXTGLOB_CHARS_POSIX: ExtglobChars = extglob_chars!(r"[^/]*?");
pub static EXTGLOB_CHARS_WINDOWS: ExtglobChars = extglob_chars!(r"[^\\/]*?");

pub fn extglob_chars(win32: bool) -> &'static ExtglobChars {
    if win32 {
        &EXTGLOB_CHARS_WINDOWS
    } else {
        &EXTGLOB_CHARS_POSIX
    }
}

/// constants.js:L73-L89 — POSIX bracket class map (`__proto__: null` in JS;
/// prototype-key lookups are impossible here by construction).
#[allow(dead_code)] // consumed by C6 (parse.js:L719-L741)
pub fn posix_regex_source(name: &str) -> Option<&'static str> {
    Some(match name {
        "alnum" => "a-zA-Z0-9",
        "alpha" => "a-zA-Z",
        "ascii" => r"\x00-\x7F",
        "blank" => r" \t",
        "cntrl" => r"\x00-\x1F\x7F",
        "digit" => "0-9",
        "graph" => r"\x21-\x7E",
        "lower" => "a-z",
        "print" => r"\x20-\x7E ",
        "punct" => r##"\-!"#$%&'()\*+,./:;<=>?@[\]^_`{|}~"##,
        "space" => r" \t\r\n\v\f",
        "upper" => "A-Z",
        "word" => "A-Za-z0-9_",
        "xdigit" => "A-Fa-f0-9",
        _ => return None,
    })
}

/// constants.js:L105-L110 — whole-pattern pre-substitution map.
pub fn replacement(input: &str) -> &str {
    match input {
        "***" => "*",
        "**/**" => "**",
        "**/**/**" => "**",
        other => other,
    }
}

/// Character-code constants (constants.js:L112-L161). JS exports them as
/// doubles; they are consumed by scan.js via `charCodeAt` comparisons, so the
/// typed replacement is exact `u16` code units (all values < 0x10000).
/// Call sites: scan.js destructure (15 of the 45, L5-L20); the rest are
/// public-API surface via `picomatch.constants`.
pub const CHAR_0: u16 = 48; /* 0 */
pub const CHAR_9: u16 = 57; /* 9 */
pub const CHAR_UPPERCASE_A: u16 = 65; /* A */
pub const CHAR_LOWERCASE_A: u16 = 97; /* a */
pub const CHAR_UPPERCASE_Z: u16 = 90; /* Z */
pub const CHAR_LOWERCASE_Z: u16 = 122; /* z */
pub const CHAR_LEFT_PARENTHESES: u16 = 40; /* ( */
pub const CHAR_RIGHT_PARENTHESES: u16 = 41; /* ) */
pub const CHAR_ASTERISK: u16 = 42; /* * */
pub const CHAR_AMPERSAND: u16 = 38; /* & */
pub const CHAR_AT: u16 = 64; /* @ */
pub const CHAR_BACKWARD_SLASH: u16 = 92; /* \ */
pub const CHAR_CARRIAGE_RETURN: u16 = 13; /* \r */
pub const CHAR_CIRCUMFLEX_ACCENT: u16 = 94; /* ^ */
pub const CHAR_COLON: u16 = 58; /* : */
pub const CHAR_COMMA: u16 = 44; /* , */
pub const CHAR_DOT: u16 = 46; /* . */
pub const CHAR_DOUBLE_QUOTE: u16 = 34; /* " */
pub const CHAR_EQUAL: u16 = 61; /* = */
pub const CHAR_EXCLAMATION_MARK: u16 = 33; /* ! */
pub const CHAR_FORM_FEED: u16 = 12; /* \f */
pub const CHAR_FORWARD_SLASH: u16 = 47; /* / */
pub const CHAR_GRAVE_ACCENT: u16 = 96; /* ` */
pub const CHAR_HASH: u16 = 35; /* # */
pub const CHAR_HYPHEN_MINUS: u16 = 45; /* - */
pub const CHAR_LEFT_ANGLE_BRACKET: u16 = 60; /* < */
pub const CHAR_LEFT_CURLY_BRACE: u16 = 123; /* { */
pub const CHAR_LEFT_SQUARE_BRACKET: u16 = 91; /* [ */
pub const CHAR_LINE_FEED: u16 = 10; /* \n */
pub const CHAR_NO_BREAK_SPACE: u16 = 160; /* \u00A0 */
pub const CHAR_PERCENT: u16 = 37; /* % */
pub const CHAR_PLUS: u16 = 43; /* + */
pub const CHAR_QUESTION_MARK: u16 = 63; /* ? */
pub const CHAR_RIGHT_ANGLE_BRACKET: u16 = 62; /* > */
pub const CHAR_RIGHT_CURLY_BRACE: u16 = 125; /* } */
pub const CHAR_RIGHT_SQUARE_BRACKET: u16 = 93; /* ] */
pub const CHAR_SEMICOLON: u16 = 59; /* ; */
pub const CHAR_SINGLE_QUOTE: u16 = 39; /* ' */
pub const CHAR_SPACE: u16 = 32; /*   */
pub const CHAR_TAB: u16 = 9; /* \t */
pub const CHAR_UNDERSCORE: u16 = 95; /* _ */
pub const CHAR_VERTICAL_LINE: u16 = 124; /* | */
pub const CHAR_ZERO_WIDTH_NOBREAK_SPACE: u16 = 65279; /* \uFEFF */

#[cfg(test)]
mod tests {
    use super::*;

    // Byte pins derived from Main/lib/constants.js (oracle source, read at
    // 00cf02c) — the fragment law (ARCHITECTURE.md §13): every emitted piece
    // comes from these tables, so the tables themselves are pinned verbatim.
    #[test]
    fn posix_chars_bytes_match_reference() {
        let p = &POSIX_CHARS;
        assert_eq!(p.dot_literal, r"\.");
        assert_eq!(p.plus_literal, r"\+");
        assert_eq!(p.qmark_literal, r"\?");
        assert_eq!(p.slash_literal, r"\/");
        assert_eq!(p.one_char, "(?=.)");
        assert_eq!(p.qmark, "[^/]");
        assert_eq!(p.end_anchor, r"(?:\/|$)");
        assert_eq!(p.dots_slash, r"\.{1,2}(?:\/|$)");
        assert_eq!(p.no_dot, r"(?!\.)");
        assert_eq!(p.no_dots, r"(?!(?:^|\/)\.{1,2}(?:\/|$))");
        assert_eq!(p.no_dot_slash, r"(?!\.{0,1}(?:\/|$))");
        assert_eq!(p.no_dots_slash, r"(?!\.{1,2}(?:\/|$))");
        assert_eq!(p.qmark_no_dot, r"[^.\/]");
        assert_eq!(p.star, "[^/]*?");
        assert_eq!(p.start_anchor, r"(?:^|\/)");
        assert_eq!(p.sep, "/");
    }

    #[test]
    fn windows_chars_bytes_match_reference() {
        let w = &WINDOWS_CHARS;
        assert_eq!(w.dot_literal, r"\.");
        assert_eq!(w.plus_literal, r"\+");
        assert_eq!(w.qmark_literal, r"\?");
        assert_eq!(w.slash_literal, r"[\\/]");
        assert_eq!(w.one_char, "(?=.)");
        assert_eq!(w.qmark, r"[^\\/]");
        assert_eq!(w.end_anchor, r"(?:[\\/]|$)");
        assert_eq!(w.dots_slash, r"\.{1,2}(?:[\\/]|$)");
        assert_eq!(w.no_dot, r"(?!\.)");
        assert_eq!(w.no_dots, r"(?!(?:^|[\\/])\.{1,2}(?:[\\/]|$))");
        assert_eq!(w.no_dot_slash, r"(?!\.{0,1}(?:[\\/]|$))");
        assert_eq!(w.no_dots_slash, r"(?!\.{1,2}(?:[\\/]|$))");
        assert_eq!(w.qmark_no_dot, r"[^.\\/]");
        assert_eq!(w.star, r"[^\\/]*?");
        assert_eq!(w.start_anchor, r"(?:^|[\\/])");
        assert_eq!(w.sep, r"\");
    }

    #[test]
    fn glob_chars_selects_by_strict_true() {
        // constants.js:L181-L183 — `win32 === true ? WINDOWS : POSIX`.
        assert!(std::ptr::eq(glob_chars(true), &WINDOWS_CHARS));
        assert!(std::ptr::eq(glob_chars(false), &POSIX_CHARS));
    }

    #[test]
    fn extglob_chars_bytes_match_reference() {
        // constants.js:L167-L175 — negate close interpolates the platform STAR.
        let p = &EXTGLOB_CHARS_POSIX;
        assert_eq!(
            (p.negate.kind, p.negate.open, p.negate.close),
            ("negate", "(?:(?!(?:", "))[^/]*?)")
        );
        assert_eq!(
            (p.qmark.kind, p.qmark.open, p.qmark.close),
            ("qmark", "(?:", ")?")
        );
        assert_eq!(
            (p.plus.kind, p.plus.open, p.plus.close),
            ("plus", "(?:", ")+")
        );
        assert_eq!(
            (p.star.kind, p.star.open, p.star.close),
            ("star", "(?:", ")*")
        );
        assert_eq!((p.at.kind, p.at.open, p.at.close), ("at", "(?:", ")"));
        let w = &EXTGLOB_CHARS_WINDOWS;
        assert_eq!(
            (w.negate.kind, w.negate.open, w.negate.close),
            ("negate", "(?:(?!(?:", r"))[^\\/]*?)")
        );
        assert!(std::ptr::eq(extglob_chars(true), &EXTGLOB_CHARS_WINDOWS));
        assert!(std::ptr::eq(extglob_chars(false), &EXTGLOB_CHARS_POSIX));
    }

    #[test]
    fn posix_regex_source_all_14_classes_bytes() {
        // constants.js:L73-L89; also byte-pinned as one concatenation by the
        // original suite (Main/test/posix-classes.js:24).
        let expect: [(&str, &str); 14] = [
            ("alnum", "a-zA-Z0-9"),
            ("alpha", "a-zA-Z"),
            ("ascii", r"\x00-\x7F"),
            ("blank", r" \t"),
            ("cntrl", r"\x00-\x1F\x7F"),
            ("digit", "0-9"),
            ("graph", r"\x21-\x7E"),
            ("lower", "a-z"),
            ("print", r"\x20-\x7E "),
            ("punct", r##"\-!"#$%&'()\*+,./:;<=>?@[\]^_`{|}~"##),
            ("space", " \\t\\r\\n\\v\\f"),
            ("upper", "A-Z"),
            ("word", "A-Za-z0-9_"),
            ("xdigit", "A-Fa-f0-9"),
        ];
        for (name, bytes) in expect {
            assert_eq!(posix_regex_source(name), Some(bytes), "class {name}");
        }
        // prototype-pollution guard (GHSA-3v7f-55p6-f55p): unknown/prototype
        // keys resolve to None, never to inherited members
        // (Main/test/malicious.js:34-44).
        assert_eq!(posix_regex_source("constructor"), None);
        assert_eq!(posix_regex_source("__proto__"), None);
        assert_eq!(posix_regex_source("toString"), None);
        assert_eq!(posix_regex_source(""), None);
    }

    #[test]
    fn replacements_exact_keys_and_near_misses() {
        assert_eq!(replacement("***"), "*");
        assert_eq!(replacement("**/**"), "**");
        assert_eq!(replacement("**/**/**"), "**");
        // near-misses stay verbatim (attack-c0-2 categories)
        assert_eq!(replacement("****"), "****");
        assert_eq!(replacement(" ***"), " ***");
        assert_eq!(replacement("*** "), "*** ");
        assert_eq!(replacement("**/**/"), "**/**/");
        assert_eq!(replacement("x**/**"), "x**/**");
        assert_eq!(replacement("**//**"), "**//**");
        assert_eq!(replacement(""), "");
        assert_eq!(replacement("abc"), "abc");
    }

    #[test]
    fn char_code_constants_match_reference_values() {
        assert_eq!(MAX_LENGTH, 65536);
        assert_eq!(DEFAULT_MAX_EXTGLOB_RECURSION, 0.0);
        assert_eq!((CHAR_0, CHAR_9), (48, 57));
        assert_eq!((CHAR_UPPERCASE_A, CHAR_LOWERCASE_A), (65, 97));
        assert_eq!((CHAR_UPPERCASE_Z, CHAR_LOWERCASE_Z), (90, 122));
        assert_eq!(CHAR_NO_BREAK_SPACE, 160);
        assert_eq!(CHAR_ZERO_WIDTH_NOBREAK_SPACE, 65279);
        assert_eq!(
            (CHAR_LEFT_SQUARE_BRACKET, CHAR_RIGHT_SQUARE_BRACKET),
            (91, 93)
        );
        assert_eq!((CHAR_LEFT_CURLY_BRACE, CHAR_RIGHT_CURLY_BRACE), (123, 125));
        assert_eq!((CHAR_LEFT_PARENTHESES, CHAR_RIGHT_PARENTHESES), (40, 41));
        assert_eq!(CHAR_BACKWARD_SLASH, 92);
        assert_eq!(CHAR_FORWARD_SLASH, 47);
        // scan.js consumes exactly these 15 (constants.js:L5-L20)
        let scan_set = [
            CHAR_ASTERISK,
            CHAR_AT,
            CHAR_BACKWARD_SLASH,
            CHAR_COMMA,
            CHAR_DOT,
            CHAR_EXCLAMATION_MARK,
            CHAR_FORWARD_SLASH,
            CHAR_LEFT_CURLY_BRACE,
            CHAR_LEFT_PARENTHESES,
            CHAR_LEFT_SQUARE_BRACKET,
            CHAR_PLUS,
            CHAR_QUESTION_MARK,
            CHAR_RIGHT_CURLY_BRACE,
            CHAR_RIGHT_PARENTHESES,
            CHAR_RIGHT_SQUARE_BRACKET,
        ];
        assert_eq!(
            scan_set,
            [42, 64, 92, 44, 46, 33, 47, 123, 40, 91, 43, 63, 125, 41, 93]
        );
    }
}
