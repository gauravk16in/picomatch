//! main loop — C1 slice of lib/parse.js:L661-L1122.
//! Branch order is the source order; C2-C9 branches are physically absent,
//! so their characters currently fall through to the text branch — SAME as
//! JS when all its preceding ifs miss. Corpus rows only ever contain
//! characters whose two interpretations agree (C1_DESIGN.md §6).

use super::parser::Parser;
use super::state::{Token, TokenKind};
use crate::utils;

const NUL: u16 = 0;
const BS: u16 = b'\\' as u16;
const DOT: u16 = b'.' as u16;
const SEMI: u16 = b';' as u16;
const FSLASH: u16 = b'/' as u16;
const DQ: u16 = b'"' as u16;
const DOLLAR: u16 = b'$' as u16;
const CARET: u16 = b'^' as u16;

/// REGEX_NON_SPECIAL_CHARS set (constants.js:L98): chars that STOP a literal
/// run — `@ ! [ \ ] . , $ * + ? ^ { } ( ) | \ /`
fn is_special(u: u16) -> bool {
    matches!(u, x if x == b'@' as u16
        || x == b'!' as u16
        || x == b'[' as u16
        || x == b'\\' as u16
        || x == b']' as u16
        || x == b'.' as u16
        || x == b',' as u16
        || x == b'$' as u16
        || x == b'*' as u16
        || x == b'+' as u16
        || x == b'?' as u16
        || x == b'^' as u16
        || x == b'{' as u16
        || x == b'}' as u16
        || x == b'(' as u16
        || x == b')' as u16
        || x == b'|' as u16
        || x == b'/' as u16)
}

impl Parser {
    /// The while(!eos()) dispatch loop — C1 links only. Runs after the inline
    /// fastpath has declined (mod.rs ordering), before finish().
    pub(crate) fn main_loop(&mut self) {
        while !self.eos() {
            // L662 — one unit per iteration
            let Some(value) = self.advance() else {
                continue;
            };

            // L664-L666 — NUL is silently dropped
            if value == NUL {
                continue;
            }

            // L672-L711 — escape handling
            if value == BS {
                self.escape_branch();
                continue;
            }

            // (C6 bracket accumulation would sit here — L718)

            // L765-L770 — inside a quoted section: per-char escapeRegex into prev
            if self.state.quotes == 1 && value != DQ {
                let mut escaped = Vec::with_capacity(2);
                utils::push_escape_regex_unit(&mut escaped, value);
                if let Some(prev) = self.state.tokens.get_mut(self.prev) {
                    prev.value.extend_from_slice(&escaped);
                }
                self.append_parts(&escaped, None);
                continue;
            }

            // L776-L782 — quote toggle
            if value == DQ {
                self.state.quotes = if self.state.quotes == 1 { 0 } else { 1 };
                if self.opts.keep_quotes() {
                    self.push(Token::units(TokenKind::Text, &[DQ], None));
                }
                continue;
            }

            // (C7 parens, C6 brackets, C5 braces, C7 pipe, C5 comma,
            //  C2 slash+dot, C3 qmark, C7/C9 '!', C7 '+', C7 '@': not present.)

            // L1109-L1122 — plain text.
            // STAGING (removed in C3): the source guards `value !== '*'`
            // (L1109) because its star branch follows. C3 owns L1124-L1284;
            // until then '*' flows through text, which is why C1 corpus rows
            // contain no slow-path '*' cases (C1_DESIGN.md §7).
            self.text_branch(value);
        }
    }

    /// L672-L711. Backslash already consumed when this is called.
    fn escape_branch(&mut self) {
        let next = self.peek(1);

        // L675 — `\/` dropped unless bash
        if next == Some(FSLASH) && !self.opts.bash() {
            return;
        }

        // L679 — `\.` and `\;` dropped unconditionally
        if next == Some(DOT) || next == Some(SEMI) {
            return;
        }

        // L683-L687 — trailing backslash: double it into raw text
        if next.is_none() {
            self.push(Token::units(TokenKind::Text, &[BS, BS], None));
            return;
        }

        // L689-L699 — collapse backslash RUNS > 2: skip the run, keep one
        // backslash when the run length is odd.
        let run = count_run(self.remaining(), BS);
        let mut value = vec![BS];
        if run > 2 {
            self.state.index += isize::try_from(run).unwrap_or(isize::MAX);
            if run % 2 == 1 {
                value.push(BS);
            }
        }

        // L701-L705 — unescape drops the backslash; else keep it
        let escaped_char = self.advance();
        if self.opts.unescape() {
            value.clear();
        }
        if let Some(c) = escaped_char {
            value.push(c);
        }
        // (JS past-end: advance() => '' — appending nothing is equivalent)

        // L707-L710 — pushed as text ONLY outside a character class
        if self.state.brackets == 0 {
            self.push(Token::units(TokenKind::Text, &value, None));
        }
        // C6 (L718): bracket accumulation receives `value` here. Unreachable
        // today — no C1 branch can increment `brackets`.
    }

    /// L1109-L1122 — $ and ^ escaped, then greedy literal-run coalescing.
    fn text_branch(&mut self, first: u16) {
        let mut value = Vec::new();
        if first == DOLLAR || first == CARET {
            value.push(BS);
            value.push(first);
        } else {
            value.push(first);
        }

        // L1114-L1118 — REGEX_NON_SPECIAL_CHARS over remaining()
        let run = {
            let rem = self.remaining();
            rem.iter().take_while(|&&u| !is_special(u)).count()
        };
        if run > 0 {
            let start = usize::try_from(self.state.index + 1).unwrap_or(0);
            if let Some(slice) = self.input_chars.get(start..start + run) {
                value.extend_from_slice(slice);
            }
            self.state.index += isize::try_from(run).unwrap_or(isize::MAX);
        }

        self.push(Token::units(TokenKind::Text, &value, None));
    }
}

fn count_run(units: &[u16], u: u16) -> usize {
    units.iter().take_while(|&&x| x == u).count()
}
