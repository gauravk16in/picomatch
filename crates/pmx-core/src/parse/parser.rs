//! Parser — the single owner of all mutable parse context (design §6.1).
//! Replaces the JS pattern "N closures aliasing N mutable locals" with one
//! struct and methods. port: lib/parse.js:L439-L521 (token machinery),
//! L1286-L1322 (recovery + maybe_slash + rebuild).

use super::fragments::{build_fragments, Fragments};
use super::state::{ParseState, Token, TokenKind};
use crate::constants::{extglob_chars, glob_chars, ExtglobChars, PlatformChars};
use crate::error::PmxError;
use crate::options::Options;
use crate::utils;

/// Type-name stack for the three countable constructs (design I-2; replaces
/// JS string keys 'braces'|'brackets'|'parens', parse.js:L475-L484).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CounterKind {
    Braces,
    Brackets,
    Parens,
}

#[derive(Debug, Clone)]
pub(crate) struct ExtglobFrame {
    pub(crate) kind: &'static str,
    pub(crate) open: &'static str,
    pub(crate) close: String,
    pub(crate) conditions: usize,
    pub(crate) inner: Vec<u16>,
    pub(crate) prev_tok: usize,
    pub(crate) parens: i32,
    pub(crate) output: Vec<u16>,
    pub(crate) start_index: isize,
    pub(crate) tokens_index: usize,
}

/// Brace open frame (parse.js:L884-L890).
#[derive(Debug, Clone)]
pub(crate) struct BraceFrame {
    pub output_index: usize,
    pub tokens_index: usize,
    pub dots: bool,
    pub comma: bool,
}

pub(crate) struct Parser {
    pub state: ParseState,
    /// input buffer as UTF-16 code units — JS string semantics (C-1).
    /// pub(crate): sibling modules (inline_fastpath, main_loop) read slices.
    pub(crate) input_chars: Vec<u16>,
    /// index arena link for `prev` (design §6.2); mutated only via push.
    pub(crate) prev: usize,
    pub(crate) extglobs: Vec<ExtglobFrame>,
    pub(crate) braces: Vec<BraceFrame>,
    pub(crate) stack: Vec<CounterKind>,
    /// platform fragment table — selected once at init (parse.js:L377).
    pub(crate) platform: &'static PlatformChars,
    /// per-call fragment bundle — now read by C1's fastpath/text paths.
    pub(crate) fragments: Fragments,
    pub(crate) extglob_chars: &'static ExtglobChars,
    pub(crate) opts: Options,
}

impl Parser {
    /// port: lib/parse.js:L371-L437 (init).
    pub(crate) fn new(substituted_input: String, body: &str, prefix: &str, opts: Options) -> Self {
        let platform = glob_chars(opts.windows());
        let extglob_chars = extglob_chars(opts.windows());
        let fragments = build_fragments(&opts, platform);
        let mut tokens = Vec::with_capacity(16);

        // L371-L372 — bos token, output = opts.prepend || ''
        let bos = Token {
            kind: TokenKind::Bos,
            value: Vec::new(),
            output: Some(opts.prepend().encode_utf16().collect()),
            suffix: None,
            prev: 0,
            posix: false,
            star: false,
            extglob: false,
        };
        tokens.push(bos);

        Parser {
            state: ParseState {
                input: substituted_input,
                index: -1,
                start: 0,
                dot: opts.dot(),
                consumed: Vec::new(),
                output: Vec::new(),
                prefix: prefix.to_string(),
                backtrack: false,
                negated: false,
                brackets: 0,
                braces: 0,
                parens: 0,
                quotes: 0,
                globstar: false,
                negated_extglob: false,
                tokens,
            },
            input_chars: body.encode_utf16().collect(),
            prev: 0,
            extglobs: Vec::new(),
            braces: Vec::new(),
            stack: Vec::new(),
            platform,
            fragments,
            extglob_chars,
            opts,
        }
    }

    // ---------------- cursor ops (parse.js:L439-L450) ----------------

    /// L443 — `eos = () => state.index === len - 1`
    pub(crate) fn eos(&self) -> bool {
        self.state.index == self.len() - 1
    }

    fn len(&self) -> isize {
        isize::try_from(self.input_chars.len()).unwrap_or(isize::MAX)
    }

    /// L444 — `peek(n = 1) => input[state.index + n]`; JS `undefined` ⇒ None.
    pub(crate) fn peek(&self, n: usize) -> Option<u16> {
        let n = isize::try_from(n).ok()?;
        self.char_at(self.state.index + n)
    }

    /// L445 — `advance() => input[++state.index] || ''`; past-end ⇒ None, but
    /// the cursor still moves (JS keeps incrementing past the end).
    pub(crate) fn advance(&mut self) -> Option<u16> {
        self.state.index += 1;
        self.char_at(self.state.index)
    }

    /// L446 — `remaining() => input.slice(state.index + 1)`; borrowed slice,
    /// no allocation (design I-3).
    pub(crate) fn remaining(&self) -> &[u16] {
        // index + 1 >= 0 whenever index >= -1, the loop's precondition
        let start = match usize::try_from(self.state.index + 1) {
            Ok(u) => u,
            Err(_) => return &[],
        };
        self.input_chars.get(start..).unwrap_or(&[])
    }

    /// Bounds-checked helper — no panics (rulebook §5), no narrowing casts.
    pub(crate) fn char_at(&self, i: isize) -> Option<u16> {
        let u: usize = i.try_into().ok()?;
        self.input_chars.get(u).copied()
    }

    /// L447-L450 — `consume(value = '', num = 0)`
    pub(crate) fn consume(&mut self, value: &[u16], num: isize) {
        self.state.consumed.extend_from_slice(value);
        self.state.index += num;
    }

    // ---------------- token ops (parse.js:L452-L521) ----------------

    /// L452-L455 — `append`: emit `output ?? value` and consume VALUE units.
    pub(crate) fn append_parts(&mut self, value: &[u16], output: Option<&[u16]>) {
        let piece = output.unwrap_or(value);
        self.state.output.extend_from_slice(piece);
        self.consume(value, 0);
    }

    fn append_token(&mut self, tok: &Token) {
        let piece: Vec<u16> = tok.output.clone().unwrap_or_else(|| tok.value.clone());
        self.state.output.extend_from_slice(&piece);
        let value = tok.value.clone();
        self.consume(&value, 0);
    }

    /// L493-L521 — `push(tok)`.
    /// NOTE: this is the demotion insertion point. C8 adds the globstar→star
    /// demotion block (L493-L505) verbatim HERE; its presence is behaviorally
    /// inert until globstar tokens exist, which only C8 creates.
    pub(crate) fn push(&mut self, mut tok: Token) {
        // L494-L505 — globstar demotion block
        const STAR_UNIT: u16 = b'*' as u16;
        if let Some(prev) = self.state.tokens.get_mut(self.prev) {
            if prev.kind == TokenKind::Globstar {
                let is_brace = self.state.braces > 0
                    && (tok.kind == TokenKind::Comma || tok.kind == TokenKind::Brace);
                let is_pipe = tok.value == [b'|' as u16];
                let is_extglob = tok.extglob
                    || (!self.extglobs.is_empty() && (is_pipe || tok.kind == TokenKind::Paren));

                if tok.kind != TokenKind::Slash
                    && tok.kind != TokenKind::Paren
                    && !is_brace
                    && !is_extglob
                {
                    let prev_output_len = prev.output.as_ref().map_or(0, |o| o.len());
                    if self.state.output.len() >= prev_output_len {
                        self.state
                            .output
                            .truncate(self.state.output.len() - prev_output_len);
                    }
                    prev.kind = TokenKind::Star;
                    prev.value = vec![STAR_UNIT];
                    let star_out: Vec<u16> = self.fragments.star.encode_utf16().collect();
                    prev.output = Some(star_out.clone());
                    self.state.output.extend_from_slice(&star_out);
                }
            }
        }

        // L507-L509 — accumulate raw value into the open extglob frame's inner
        if tok.kind != TokenKind::Paren {
            if let Some(frame) = self.extglobs.last_mut() {
                frame.inner.extend_from_slice(&tok.value);
            }
        }

        // L511 — `if (tok.value || tok.output) append(tok)`. A token with BOTH
        // empty skips append and therefore skips consume (design I-4).
        if !tok.is_empty() {
            self.append_token(&tok);
        }

        // L512-L516 — merge adjacent text tokens (no two consecutive `text`).
        let prev_is_text =
            matches!(self.state.tokens.get(self.prev), Some(t) if t.kind == TokenKind::Text);
        if prev_is_text && tok.kind == TokenKind::Text {
            let prev_tok = &mut self.state.tokens[self.prev];
            // JS: `prev.output = (prev.output || prev.value) + tok.value` —
            // '' is FALSY in JS, so an empty stored output falls back to value.
            let mut base = match prev_tok.output.take() {
                Some(o) if !o.is_empty() => o,
                _ => prev_tok.value.clone(),
            };
            base.extend_from_slice(&tok.value);
            prev_tok.output = Some(base);
            prev_tok.value.extend_from_slice(&tok.value);
            return;
        }

        tok.prev = self.prev;
        self.state.tokens.push(tok);
        self.prev = self.state.tokens.len() - 1;
    }

    /// L475-L484 — counter+stack ops (single mutation point).
    pub(crate) fn increment(&mut self, kind: CounterKind) {
        self.counter_mut(kind, 1);
        self.stack.push(kind);
    }

    pub(crate) fn decrement(&mut self, kind: CounterKind) {
        self.counter_mut(kind, -1);
        self.stack.pop();
    }

    fn counter_mut(&mut self, kind: CounterKind, delta: i32) {
        match kind {
            CounterKind::Braces => self.state.braces += delta,
            CounterKind::Brackets => self.state.brackets += delta,
            CounterKind::Parens => self.state.parens += delta,
        }
    }

    // ---------------- exit path (parse.js:L1286-L1322) ----------------

    /// Recovery ("unbalanced constructs"), then `maybe_slash`, then the
    /// backtrack rebuild. Mirrors the source order exactly.
    pub(crate) fn finish(mut self) -> Result<ParseState, PmxError> {
        // L1286-L1302 — recovery
        self.recovery()?;

        // L1304-L1306 — maybe_slash
        if !self.opts.strict_slashes()
            && matches!(
                self.state.tokens.get(self.prev).map(|t| t.kind),
                Some(TokenKind::Star) | Some(TokenKind::Bracket)
            )
        {
            let mut output = Vec::new();
            utils::extend_units(&mut output, self.platform.slash_literal);
            output.push(b'?' as u16);
            self.push(Token::units(TokenKind::MaybeSlash, &[], Some(output)));
        }

        // L1308-L1319 — rebuild from the token journal when dirty
        if self.state.backtrack {
            self.state.output.clear();
            for token in &self.state.tokens {
                // JS L1313: `token.output != null ? token.output : token.value`
                // Note: this is a NULL check, NOT a truthiness check — empty string
                // output IS used here (unlike the brace-close rebuild at L931 which
                // uses `t.output || t.value` where '' is falsy).
                let piece = token.output.as_deref().unwrap_or(&token.value);
                self.state.output.extend_from_slice(piece);
                if let Some(suffix) = &token.suffix {
                    self.state.output.extend_from_slice(suffix);
                }
            }
        }

        Ok(self.state)
    }

    /// L1286-L1302 — three loops in source order; strictBrackets converts the
    /// FIRST non-empty counter into a throw (before any escape happens).
    fn recovery(&mut self) -> Result<(), PmxError> {
        for (kind, opener, closer) in [
            (CounterKind::Brackets, '[', ']'),
            (CounterKind::Parens, '(', ')'),
            (CounterKind::Braces, '{', '}'), // JS L1298: escapeLast(output, '{') — no-ops because output has '(' not '{'; bug-for-bug per constitution §1
        ] {
            while self.counter(kind) > 0 {
                if self.opts.strict_brackets() {
                    return Err(PmxError::MissingClosing { c: closer });
                }
                self.state.output = utils::escape_last(&self.state.output, opener, None);
                self.decrement(kind);
            }
        }
        Ok(())
    }

    fn counter(&self, kind: CounterKind) -> i32 {
        match kind {
            CounterKind::Braces => self.state.braces,
            CounterKind::Brackets => self.state.brackets,
            CounterKind::Parens => self.state.parens,
        }
    }
}
