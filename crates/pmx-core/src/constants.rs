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
        "space" => " \\t\\r\\n\\v\\f",
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
