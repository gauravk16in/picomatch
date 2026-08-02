//! ParseState / Token — port: lib/parse.js:L356-L428 state shape.
//! This is the public, observable product of `parse()` (oracle 2,
//! BEHAVIORAL_ORACLE.md §2). JS attaches `peek`/`advance` functions to state
//! (parse.js:L444-L445); adapters drop them during serialization.
//!
//! Representation (C1 decision, C0_DESIGN.md findings): all *emitted* text —
//! `output`, `consumed`, token values/outputs/suffixes — is `Vec<u16>`
//! (UTF-16 units), because the original can emit strings with lone
//! surrogates (fastpath escapes astral halves individually). Only
//! `input` (a guaranteed-well-formed &str at the boundary) stays `String`.

/// Token types (parse.js `tok.type` strings). Variants land behavior with
/// their owning chunk (review N-2); the full set is declared now because
/// corpus token comparisons need the complete mapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenKind {
    Bos,        // L371
    Text,       // C1 — L1120
    Slash,      // C2 — L989
    Dot,        // C2 — L1013
    Dots,       // C5 — L1001
    Comma,      // C5 — L967
    Brace,      // C5 — L884/L936
    Bracket,    // C6 — L825
    Paren,      // C7 — L790/L805 etc.
    Star,       // C3 — L1246
    Globstar,   // C8 — L1179+
    Qmark,      // C3 — L1041/L1045
    Plus,       // C7 — L1078+
    At,         // C7 — L1097
    MaybeSlash, // C0 — L1305
}

impl TokenKind {
    /// The exact JS `type` string for oracle-2 comparisons.
    pub fn to_js_str(self) -> &'static str {
        match self {
            TokenKind::Bos => "bos",
            TokenKind::Text => "text",
            TokenKind::Slash => "slash",
            TokenKind::Dot => "dot",
            TokenKind::Dots => "dots",
            TokenKind::Comma => "comma",
            TokenKind::Brace => "brace",
            TokenKind::Bracket => "bracket",
            TokenKind::Paren => "paren",
            TokenKind::Star => "star",
            TokenKind::Globstar => "globstar",
            TokenKind::Qmark => "qmark",
            TokenKind::Plus => "plus",
            TokenKind::At => "at",
            TokenKind::MaybeSlash => "maybe_slash",
        }
    }
}

/// A parser token. JS links `tok.prev` by object reference; here tokens live
/// in an index arena and `prev` is an index. `output == None` ⇔ JS
/// `output === undefined` (falls back to `value` on emit — L453).
/// `Some(vec![])` is a real, distinct empty output.
#[derive(Debug, Clone)]
pub struct Token {
    pub kind: TokenKind,
    pub value: Vec<u16>,
    pub output: Option<Vec<u16>>,
    pub suffix: Option<Vec<u16>>, // honored only by the backtrack rebuild (L1315-L1317)
    pub prev: usize,
    pub posix: bool,
}

impl Token {
    pub fn units(kind: TokenKind, value: &[u16], output: Option<Vec<u16>>) -> Self {
        Token {
            kind,
            value: value.to_vec(),
            output,
            suffix: None,
            prev: 0,
            posix: false,
        }
    }

    pub fn text_str(kind: TokenKind, value: &str, output: Option<Vec<u16>>) -> Self {
        Token {
            kind,
            value: value.encode_utf16().collect(),
            output,
            suffix: None,
            prev: 0,
            posix: false,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.value.is_empty() && self.output.as_ref().is_none_or(|o| o.is_empty())
    }
}

/// The parse() state object. Field set mirrors parse.js:L412-L428(+L594):
/// exactly the observable JSON keys of the JS state, minus fn attachments.
#[derive(Debug, Clone)]
pub struct ParseState {
    pub input: String, // substituted pattern; RETAINS a stripped './' (utils.js:L43-50)
    pub index: isize,  // cursor; JS counts UTF-16 units (C-1) — -1 possible
    pub start: usize,  // logical pattern start (moved by C2/C9)
    pub dot: bool,
    pub consumed: Vec<u16>, // raw units consumed by token values
    pub output: Vec<u16>,   // regex body; UNANCHORED (compileRe anchors, out of scope)
    pub prefix: String,
    pub backtrack: bool,
    pub negated: bool,
    pub brackets: i32, // i32: JS counters go negative on unmatched closers (L805-L806)
    pub braces: i32,
    pub parens: i32,
    pub quotes: i32,
    pub globstar: bool,
    pub negated_extglob: bool, // JS `state.negatedExtglob`, set at L594
    pub tokens: Vec<Token>,
}
