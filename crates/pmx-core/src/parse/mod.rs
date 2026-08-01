//! parse module — entry point. port: lib/parse.js:L356-... (chunked per
//! PARSE_CHUNKS.md). Order per call: guards + init → inline fastpath (C1) →
//! main loop (C1: NUL/escapes/quotes/text) → finish (C0: recovery →
//! maybe_slash → rebuild). The inline fastpath returns the state EARLY;
//! finish() must NOT run on that route (L654).

mod fastpath;
mod fragments;
mod inline_fastpath;
mod main_loop;
mod parser;
mod state;

pub use fastpath::fastpaths;
pub use state::{ParseState, Token, TokenKind};

use crate::constants;
use crate::error::PmxError;
use crate::options::Options;
use crate::utils;
use parser::Parser;

/// port: lib/parse.js:L356 — `parse(input, options)`.
pub fn parse(input: &str, options: &Options) -> Result<ParseState, PmxError> {
    // L361 — exact-key REPLACEMENTS, before anything else
    let substituted = constants::replacement(input);

    // L364-L369 — length guard on the SUBSTITUTED, pre-`./`-strip input;
    // JS .length counts UTF-16 units (C-1), so we count encode_utf16().
    let len = substituted.encode_utf16().count();
    let max = options.max_length();
    if (len as f64) > max {
        return Err(PmxError::InputTooLong {
            len,
            max: max.into(),
        });
    }

    // L430 — strip './' for the tokenizer only; state.input retains it
    let (prefix, body) = utils::remove_prefix(substituted);

    let mut parser = Parser::new(substituted.to_string(), body, prefix, options.clone());

    // C1: L606-L655 inline fastpath — returns EARLY when it claims the pattern
    if parser.try_inline_fastpath() {
        return Ok(parser.state);
    }

    // C1: main loop (NUL / escapes / quotes / text)
    parser.main_loop();

    // C0: recovery → maybe_slash → rebuild
    parser.finish()
}
