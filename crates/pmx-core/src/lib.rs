//! pmx-core — pure-Rust port of picomatch v4.0.5's compiler core.
//!
//! Implements the C0 foundation slice of `lib/parse.js`: guards, state,
//! token machinery, recovery, and rebuild. Later chunks (C1..C9) extend
//! `Parser` in their own modules, one chunk per loop.
#![forbid(unsafe_code)]

pub mod constants;
pub mod error;
pub mod options;
pub mod parse;
pub mod utils;

pub use error::PmxError;
pub use options::{ExtglobRecursion, Options};
pub use parse::{fastpaths, parse, ParseState, Token, TokenKind};
