//! PmxError — port: lib/parse.js error contract (oracle 4/5, BEHAVIORAL_ORACLE.md §4/§5).
//!
//! Byte-exact `Display` reproduction of the original message strings. Every
//! variant is annotated with its JS error class; adapters compare classes,
//! the corpus compares message bytes (fixtures/c0_oracle.json).

use thiserror::Error;

/// port: parse.js:L368 — `${max}` is JS Number#toString interpolation, not
/// Rust f64 Display (review c0-1 MAJOR: "-inf"≠"-Infinity", "-0"≠"0").
#[derive(Debug, Error)]
pub enum PmxError {
    /// port: lib/parse.js:L357-L359 (`throw new TypeError('Expected a string')`).
    /// Unreachable from `parse(&str)`; the napi/subprocess adapters re-create
    /// it for raw JS values (design amendment I-6).
    #[error("Expected a string")]
    ExpectedString,

    /// port: lib/parse.js:L364-L369. `{max}` is the CLAMPED limit with JS
    /// number formatting applied via `js_number` (utils.js semantics).
    #[error("Input length: {len}, exceeds maximum allowed length: {max}")]
    InputTooLong { len: usize, max: JsNumber },

    /// port: lib/parse.js:syntaxError L44-L46. Two literal backslashes precede
    /// the char, matching the corpus bytes (e.g. `Missing opening: "(" - use "\\(" ...`).
    #[error("Missing opening: \"{c}\" - use \"\\\\{c}\" to match literal characters")]
    MissingOpening { c: char },

    /// port: lib/parse.js:syntaxError L44-L46 (see MissingOpening).
    #[error("Missing closing: \"{c}\" - use \"\\\\{c}\" to match literal characters")]
    MissingClosing { c: char },
}

/// Newtype routing f64 through the JS Number#toString formatter on Display.
#[derive(Debug, Clone, Copy)]
pub struct JsNumber(pub f64);

impl std::fmt::Display for JsNumber {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.pad(&crate::utils::js_number(self.0))
    }
}

impl From<f64> for JsNumber {
    fn from(v: f64) -> Self {
        JsNumber(v)
    }
}
