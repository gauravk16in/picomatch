//! main loop — C1 slice of lib/parse.js:L661-L1122.
//! Branch order is the source order; C2-C9 branches are physically absent,
//! so their characters currently fall through to the text branch — SAME as
//! JS when all its preceding ifs miss. Corpus rows only ever contain
//! characters whose two interpretations agree (C1_DESIGN.md §6).

use super::parser::{BraceFrame, CounterKind, Parser};
use super::state::{Token, TokenKind};
use crate::constants;
use crate::error::PmxError;
use crate::options::Options;
use crate::utils;

const NUL: u16 = 0;
const BS: u16 = b'\\' as u16;
const DOT: u16 = b'.' as u16;
const SEMI: u16 = b';' as u16;
const FSLASH: u16 = b'/' as u16;
const DQ: u16 = b'"' as u16;
const DOLLAR: u16 = b'$' as u16;
const CARET: u16 = b'^' as u16;

const QMARK: u16 = b'?' as u16;
const STAR: u16 = b'*' as u16;
const PLUS: u16 = b'+' as u16;

const LBRACE: u16 = b'{' as u16;
const RBRACE: u16 = b'}' as u16;
const COMMA: u16 = b',' as u16;
const LPAREN: u16 = b'(' as u16;
const RPAREN: u16 = b')' as u16;
const PIPE: u16 = b'|' as u16;

const LBRACK: u16 = b'[' as u16;
const RBRACK: u16 = b']' as u16;
const COLON: u16 = b':' as u16;
const MINUS: u16 = b'-' as u16;
const EXCLAMATION: u16 = b'!' as u16;

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
    pub(crate) fn main_loop(&mut self) -> Result<(), PmxError> {
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
                self.escape_branch()?;
                continue;
            }

            // L718-L758 — in-class character accumulation & POSIX expansion
            if self.state.brackets > 0 {
                let is_close_bracket = value == RBRACK;
                let prev_val_is_open = self
                    .state
                    .tokens
                    .get(self.prev)
                    .is_some_and(|t| t.value == [LBRACK] || t.value == [LBRACK, CARET]);
                if !is_close_bracket || prev_val_is_open {
                    self.bracket_accumulation_branch(value)?;
                    continue;
                }
            }

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

            // L788 — open paren
            if value == LPAREN {
                self.open_paren_branch();
                continue;
            }

            // L794 — close paren
            if value == RPAREN {
                self.close_paren_branch()?;
                continue;
            }

            // L814-L827 — open bracket branch
            if value == LBRACK {
                self.open_bracket_branch()?;
                continue;
            }

            // L829-L875 — close bracket branch
            if value == RBRACK {
                self.close_bracket_branch()?;
                continue;
            }

            // L881 — brace open
            if value == LBRACE && !self.opts.nobrace() {
                self.open_brace_branch();
                continue;
            }

            // L897 — brace close
            if value == RBRACE {
                self.close_brace_branch();
                continue;
            }

            // L946 — pipe
            if value == PIPE {
                self.pipe_branch();
                continue;
            }

            // L958 — comma
            if value == COMMA {
                self.comma_branch();
                continue;
            }

            // L975-L991 — slashes
            if value == FSLASH {
                self.slash_branch();
                continue;
            }

            // L997-L1015 — dots
            if value == DOT {
                self.dot_branch();
                continue;
            }

            // L1021-L1047 — question marks
            if value == QMARK {
                self.qmark_branch();
                continue;
            }

            // L1053 — exclamation
            if value == EXCLAMATION {
                self.exclamation_branch();
                continue;
            }

            // L1071-L1089 — plus
            if value == PLUS {
                self.plus_branch();
                continue;
            }

            // L1095 — at
            const AT: u16 = b'@' as u16;
            if value == AT
                && !self.opts.noextglob()
                && self.peek(1) == Some(LPAREN)
                && self.peek(2) != Some(QMARK)
            {
                let mut tok = Token::units(TokenKind::At, &[AT], Some(vec![]));
                tok.extglob = true;
                self.push(tok);
                continue;
            }

            // L1109-L1122 — plain text
            if value != STAR {
                self.text_branch(value);
                continue;
            }

            // L1246-L1283 — plain star
            if value == STAR {
                self.star_branch();
                continue;
            }
        }
        Ok(())
    }

    /// L718-L758 — in-class character accumulation and POSIX class expansion
    fn bracket_accumulation_branch(&mut self, mut value: u16) -> Result<(), PmxError> {
        if self.opts.posix_not_false() && value == COLON {
            let prev_tok = &mut self.state.tokens[self.prev];
            if prev_tok.value.len() > 1 && prev_tok.value[1..].contains(&LBRACK) {
                prev_tok.posix = true;
                if prev_tok.value[1..].contains(&COLON) {
                    if let Some(idx) = prev_tok.value.iter().rposition(|&u| u == LBRACK) {
                        let pre = prev_tok.value[..idx].to_vec();
                        let rest_units = if idx + 2 <= prev_tok.value.len() {
                            &prev_tok.value[idx + 2..]
                        } else {
                            &[]
                        };
                        let rest_bytes: Vec<u8> = rest_units.iter().map(|&u| u as u8).collect();
                        if let Ok(rest_str) = std::str::from_utf8(&rest_bytes) {
                            if let Some(posix_src) = constants::posix_regex_source(rest_str) {
                                let mut new_val = pre;
                                new_val.extend(posix_src.encode_utf16());
                                self.state.tokens[self.prev].value = new_val;
                                self.state.backtrack = true;
                                self.advance(); // skip closing ':'

                                let is_second_token = self.prev == 1;
                                let bos_has_no_output = self
                                    .state
                                    .tokens
                                    .first()
                                    .and_then(|t| t.output.as_ref())
                                    .is_none_or(|o| o.is_empty());
                                if bos_has_no_output && is_second_token {
                                    let chars = constants::glob_chars(self.opts.windows());
                                    let one_char: Vec<u16> =
                                        chars.one_char.encode_utf16().collect();
                                    if let Some(bos) = self.state.tokens.first_mut() {
                                        bos.output = Some(one_char);
                                    }
                                }
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }

        let mut val_units = Vec::new();
        let prev_val = &self.state.tokens[self.prev].value;
        let prev_is_open = prev_val == &[LBRACK] || prev_val == &[LBRACK, CARET];

        if (value == LBRACK && self.peek(1) != Some(COLON))
            || (value == MINUS && self.peek(1) == Some(RBRACK))
        {
            val_units.push(BS);
        }
        if value == RBRACK && prev_is_open {
            val_units.push(BS);
        }
        if self.opts.posix_true() && value == EXCLAMATION && prev_val == &[LBRACK] {
            value = CARET;
        }
        val_units.push(value);

        let prev_tok = &mut self.state.tokens[self.prev];
        prev_tok.value.extend_from_slice(&val_units);
        self.append_parts(&val_units, None);
        Ok(())
    }

    /// L814-L827 — open bracket branch
    fn open_bracket_branch(&mut self) -> Result<(), PmxError> {
        let mut val_units = vec![LBRACK];
        if self.opts.nobracket() || !self.remaining().contains(&RBRACK) {
            if !self.opts.nobracket() && self.opts.strict_brackets() {
                return Err(PmxError::MissingClosing { c: ']' });
            }
            val_units = vec![BS, LBRACK];
        } else {
            self.increment(CounterKind::Brackets);
        }

        self.push(Token::units(TokenKind::Bracket, &val_units, None));
        Ok(())
    }

    /// L829-L875 — close bracket branch
    fn close_bracket_branch(&mut self) -> Result<(), PmxError> {
        let prev_tok = self.state.tokens.get(self.prev);
        let prev_is_bracket_single =
            prev_tok.is_some_and(|t| t.kind == TokenKind::Bracket && t.value.len() == 1);

        if self.opts.nobracket() || prev_is_bracket_single {
            self.push(Token::units(
                TokenKind::Text,
                &[RBRACK],
                Some(vec![BS, RBRACK]),
            ));
            return Ok(());
        }

        if self.state.brackets == 0 {
            if self.opts.strict_brackets() {
                return Err(PmxError::MissingOpening { c: '[' });
            }
            self.push(Token::units(
                TokenKind::Text,
                &[RBRACK],
                Some(vec![BS, RBRACK]),
            ));
            return Ok(());
        }

        self.decrement(CounterKind::Brackets);

        let prev_tok = &self.state.tokens[self.prev];
        let prev_val = &prev_tok.value;
        let prev_val_sliced = if prev_val.len() > 1 {
            &prev_val[1..]
        } else {
            &[]
        };
        let prev_posix = prev_tok.posix;

        let mut append_val = vec![RBRACK];
        if !prev_posix
            && prev_val_sliced.starts_with(&[CARET])
            && !prev_val_sliced.contains(&FSLASH)
        {
            append_val = vec![FSLASH, RBRACK];
        }

        self.state.tokens[self.prev]
            .value
            .extend_from_slice(&append_val);
        self.append_parts(&append_val, None);

        let prev_tok = &self.state.tokens[self.prev];
        let prev_val_sliced = if prev_tok.value.len() > append_val.len() {
            &prev_tok.value[1..prev_tok.value.len() - append_val.len()]
        } else {
            &[]
        };

        if self.opts.literal_brackets() == Some(false)
            || utils::has_regex_chars_units(prev_val_sliced)
        {
            return Ok(());
        }

        let escaped = utils::escape_regex_units(&prev_tok.value);
        let prev_len = prev_tok.value.len();
        if self.state.output.len() >= prev_len {
            self.state
                .output
                .truncate(self.state.output.len() - prev_len);
        }

        if self.opts.literal_brackets() == Some(true) {
            self.state.output.extend_from_slice(&escaped);
            self.state.tokens[self.prev].value = escaped;
            return Ok(());
        }

        // 3-way alternation default (literalBrackets unset)
        let capture = if self.opts.capture() { "" } else { "?:" };
        let mut alt_val = Vec::new();
        alt_val.push(LPAREN);
        utils::extend_units(&mut alt_val, capture);
        alt_val.extend_from_slice(&escaped);
        alt_val.push(PIPE);
        alt_val.extend_from_slice(&self.state.tokens[self.prev].value);
        alt_val.push(RPAREN);

        self.state.tokens[self.prev].value = alt_val.clone();
        self.state.output.extend_from_slice(&alt_val);

        Ok(())
    }

    /// L881-L895 — brace open branch
    fn open_brace_branch(&mut self) {
        self.increment(CounterKind::Braces);

        let open = BraceFrame {
            output_index: self.state.output.len(),
            tokens_index: self.state.tokens.len(),
            dots: false,
            comma: false,
        };

        self.braces.push(open);
        self.push(Token::units(
            TokenKind::Brace,
            &[LBRACE],
            Some(vec![LPAREN]),
        ));
    }

    /// L897-L940 — brace close branch
    fn close_brace_branch(&mut self) {
        let brace = self.braces.last().cloned();

        let brace = match brace {
            Some(b) if !self.opts.nobrace() => b,
            _ => {
                self.push(Token::units(TokenKind::Text, &[RBRACE], Some(vec![RBRACE])));
                return;
            }
        };
        let mut value = vec![RBRACE];
        let mut output = vec![RPAREN];

        if brace.dots {
            let arr = self.state.tokens.clone();
            let mut range = Vec::new();

            for i in (0..arr.len()).rev() {
                self.state.tokens.pop();
                if arr[i].kind == TokenKind::Brace {
                    break;
                }
                if arr[i].kind != TokenKind::Dots {
                    range.push(arr[i].value.clone());
                }
            }

            range.reverse();
            output = expand_range(&range, &self.opts);
            self.state.backtrack = true;
        }

        if !brace.comma && !brace.dots {
            let out = self.state.output[..brace.output_index].to_vec();

            if brace.tokens_index < self.state.tokens.len() {
                self.state.tokens[brace.tokens_index].value = vec![BS, LBRACE];
                self.state.tokens[brace.tokens_index].output = Some(vec![BS, LBRACE]);
            }

            let toks = self.state.tokens[brace.tokens_index..].to_vec();
            value = vec![BS, RBRACE];
            output = vec![BS, RBRACE];

            self.state.output = out;
            for t in &toks {
                // JS L931: `state.output += (t.output || t.value)` — '' is falsy in JS.
                let piece = match t.output.as_deref() {
                    Some(o) if !o.is_empty() => o,
                    _ => &t.value,
                };
                self.state.output.extend_from_slice(piece);
            }
        }

        self.push(Token::units(TokenKind::Brace, &value, Some(output)));
        self.decrement(CounterKind::Braces);
        self.braces.pop();
    }

    /// L958-L969 — comma branch
    fn comma_branch(&mut self) {
        let mut output = vec![COMMA];

        if let Some(brace) = self.braces.last_mut() {
            if self.stack.last() == Some(&CounterKind::Braces) {
                brace.comma = true;
                output = vec![PIPE];
            }
        }

        self.push(Token::units(TokenKind::Comma, &[COMMA], Some(output)));
    }

    /// L975-L991 — slash branch
    fn slash_branch(&mut self) {
        // L980 — if the beginning of the glob is "./", advance start to current index,
        // don't add "./" to state.
        let prev_kind = self.state.tokens.get(self.prev).map(|t| t.kind);
        let start_plus_1 = isize::try_from(self.state.start + 1).unwrap_or(-1);
        if prev_kind == Some(TokenKind::Dot) && self.state.index == start_plus_1 {
            if let Ok(next_start) = usize::try_from(self.state.index + 1) {
                self.state.start = next_start;
            }
            self.state.consumed.clear();
            self.state.output.clear();
            self.state.tokens.pop();
            self.prev = 0; // reset prev to bos (token at index 0)
            return;
        }

        let slash_lit = self.platform.slash_literal.encode_utf16().collect();
        self.push(Token::units(TokenKind::Slash, &[FSLASH], Some(slash_lit)));
    }

    /// L997-L1015 — dot branch
    fn dot_branch(&mut self) {
        // L998-L1006 — brace dots hook: state.braces > 0 && prev.type === 'dot'
        let prev_kind = self.state.tokens.get(self.prev).map(|t| t.kind);
        if self.state.braces > 0 && prev_kind == Some(TokenKind::Dot) {
            if let Some(prev_tok) = self.state.tokens.get_mut(self.prev) {
                if prev_tok.value == [DOT] {
                    let dot_lit = self.platform.dot_literal.encode_utf16().collect();
                    prev_tok.output = Some(dot_lit);
                }
                prev_tok.kind = TokenKind::Dots;
                let mut out = prev_tok
                    .output
                    .take()
                    .unwrap_or_else(|| prev_tok.value.clone());
                out.push(DOT);
                prev_tok.output = Some(out);
                prev_tok.value.push(DOT);
            }
            if let Some(brace) = self.braces.last_mut() {
                brace.dots = true;
            }
            return;
        }

        // L1008-L1011 — text dot when not adjacent to bos/slash and outside braces/parens
        if (self.state.braces + self.state.parens) == 0
            && prev_kind != Some(TokenKind::Bos)
            && prev_kind != Some(TokenKind::Slash)
        {
            let dot_lit = self.platform.dot_literal.encode_utf16().collect();
            self.push(Token::units(TokenKind::Text, &[DOT], Some(dot_lit)));
            return;
        }

        // L1013 — dot token
        let dot_lit = self.platform.dot_literal.encode_utf16().collect();
        self.push(Token::units(TokenKind::Dot, &[DOT], Some(dot_lit)));
    }

    /// L672-L711. Backslash already consumed when this is called.
    fn escape_branch(&mut self) -> Result<(), PmxError> {
        let next = self.peek(1);

        // L675 — `\/` dropped unless bash
        if next == Some(FSLASH) && !self.opts.bash() {
            return Ok(());
        }

        // L679 — `\.` and `\;` dropped unconditionally
        if next == Some(DOT) || next == Some(SEMI) {
            return Ok(());
        }

        // L683-L687 — trailing backslash: double it into raw text
        if next.is_none() {
            let val = vec![BS, BS];
            if self.state.brackets == 0 {
                self.push(Token::units(TokenKind::Text, &val, None));
            } else {
                self.bracket_accumulation_units(&val)?;
            }
            return Ok(());
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

        // L707-L710 — pushed as text ONLY outside a character class
        if self.state.brackets == 0 {
            self.push(Token::units(TokenKind::Text, &value, None));
        } else {
            self.bracket_accumulation_units(&value)?;
        }
        Ok(())
    }

    fn bracket_accumulation_units(&mut self, units: &[u16]) -> Result<(), PmxError> {
        if units.is_empty() {
            return Ok(());
        }
        if units.len() == 1 {
            return self.bracket_accumulation_branch(units[0]);
        }
        let prev_tok = &mut self.state.tokens[self.prev];
        prev_tok.value.extend_from_slice(units);
        self.append_parts(units, None);
        Ok(())
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

    /// L788 — open paren branch
    fn open_paren_branch(&mut self) {
        self.increment(CounterKind::Parens);
        self.push(Token::units(TokenKind::Paren, &[LPAREN], None));
    }

    /// L794-L808 — close paren branch
    fn close_paren_branch(&mut self) -> Result<(), PmxError> {
        if self.state.parens == 0 && self.opts.strict_brackets() {
            return Err(PmxError::MissingOpening { c: '(' });
        }

        if let Some(frame) = self
            .extglobs
            .pop_if(|ext| self.state.parens == ext.parens + 1)
        {
            return self.extglobClose(frame);
        }

        let out = if self.state.parens != 0 {
            vec![RPAREN]
        } else {
            vec![BS, RPAREN]
        };
        self.push(Token::units(TokenKind::Paren, &[RPAREN], Some(out)));
        self.decrement(CounterKind::Parens);
        Ok(())
    }

    /// L946-L952 — pipe branch
    fn pipe_branch(&mut self) {
        if let Some(ext) = self.extglobs.last_mut() {
            ext.conditions += 1;
        }
        self.push(Token::units(TokenKind::Text, &[PIPE], None));
    }

    /// L457-L473 — `negate()`: consume leading `!` run and set parity.
    /// Called only when `!` is the FIRST character (state.index == 0) and
    /// nonegate is false. The outer dispatch always continues after this,
    /// regardless of whether negation was set.
    ///
    /// Parity rule: odd count of leading `!` → negated; even → not negated.
    /// The while-loop guard stops eating `!` if the next `!` opens an extglob:
    ///   `peek(2) === '(' && peek(3) !== '?'`  (parse.js L460; the `!=<:` set belongs to extglobOpen L1055)
    fn negate(&mut self) {
        let mut count: u32 = 1;
        // peek(1) is the char after the current '!' (which is already at state.index)
        while self.peek(1) == Some(EXCLAMATION)
            && (self.peek(2) != Some(LPAREN) || self.peek(3) == Some(b'?' as u16))
        {
            self.advance();
            self.state.start += 1;
            count += 1;
        }
        // Even parity → cancelled (double negation = positive): no state.negated, no final start++
        if count.is_multiple_of(2) {
            return;
        }
        self.state.negated = true;
        self.state.start += 1;
    }

    /// L1053-L1065 — exclamation branch
    fn exclamation_branch(&mut self) {
        if !self.opts.noextglob() && self.peek(1) == Some(LPAREN) {
            let p2 = self.peek(2);
            let p3 = self.peek(3);
            let is_special_lookaround = p2 == Some(QMARK)
                && p3.is_some_and(|u| {
                    u == EXCLAMATION || u == b'=' as u16 || u == b'<' as u16 || u == COLON
                });
            if !is_special_lookaround {
                self.extglobOpen("negate", EXCLAMATION);
                return;
            }
        }
        if !self.opts.nonegate() && self.state.index == 0 {
            self.negate();
            return;
        }
        self.text_branch(EXCLAMATION);
    }

    /// L1021-L1047 — question marks branch
    fn qmark_branch(&mut self) {
        let prev_tok = self.state.tokens.get(self.prev);
        let prev_is_open_paren = prev_tok.is_some_and(|t| t.value == [LPAREN]);
        if !prev_is_open_paren
            && !self.opts.noextglob()
            && self.peek(1) == Some(LPAREN)
            && self.peek(2) != Some(QMARK)
        {
            self.extglobOpen("qmark", QMARK);
            return;
        }

        let prev_kind = prev_tok.map(|t| t.kind);

        if prev_kind == Some(TokenKind::Paren) {
            let next = self.peek(1);
            let mut output = vec![QMARK];

            let is_open_paren = prev_tok.is_some_and(|t| t.value == [b'(' as u16]);
            let not_lookaround_char = match next {
                Some(c) => {
                    c != b'!' as u16 && c != b'=' as u16 && c != b'<' as u16 && c != b':' as u16
                }
                None => true,
            };
            let cond1 = is_open_paren && not_lookaround_char;
            let cond2 = next == Some(b'<' as u16) && !matches_lookbehind_spec(self.remaining());

            if cond1 || cond2 {
                output = vec![BS, QMARK];
            }

            self.push(Token::units(TokenKind::Text, &[QMARK], Some(output)));
            return;
        }

        if !self.opts.dot()
            && (prev_kind == Some(TokenKind::Slash) || prev_kind == Some(TokenKind::Bos))
        {
            let qmark_no_dot = self.fragments.qmark_no_dot.encode_utf16().collect();
            self.push(Token::units(TokenKind::Qmark, &[QMARK], Some(qmark_no_dot)));
            return;
        }

        let qmark = self.platform.qmark.encode_utf16().collect();
        self.push(Token::units(TokenKind::Qmark, &[QMARK], Some(qmark)));
    }

    /// L1071-L1089 — plus branch
    fn plus_branch(&mut self) {
        if !self.opts.noextglob() && self.peek(1) == Some(LPAREN) && self.peek(2) != Some(QMARK) {
            self.extglobOpen("plus", PLUS);
            return;
        }

        let prev_tok = self.state.tokens.get(self.prev);
        let prev_kind = prev_tok.map(|t| t.kind);
        let prev_val_is_open_paren = prev_tok.is_some_and(|t| t.value == [b'(' as u16]);

        let plus_lit: Vec<u16> = self.platform.plus_literal.encode_utf16().collect();

        if prev_val_is_open_paren || self.opts.regex == Some(false) {
            self.push(Token::units(TokenKind::Plus, &[PLUS], Some(plus_lit)));
            return;
        }

        if matches!(
            prev_kind,
            Some(TokenKind::Bracket) | Some(TokenKind::Paren) | Some(TokenKind::Brace)
        ) || self.state.parens > 0
        {
            self.push(Token::units(TokenKind::Plus, &[PLUS], None));
            return;
        }

        self.push(Token::units(TokenKind::Plus, &plus_lit, None));
    }

    /// L1246-L1283 — plain star branch & C8 globstar machine
    fn star_branch(&mut self) {
        // L1128-L1137 — prev star run collapse
        if let Some(prev) = self.state.tokens.get_mut(self.prev) {
            if prev.kind == TokenKind::Globstar || prev.star {
                prev.kind = TokenKind::Star;
                prev.star = true;
                prev.value.push(STAR);
                let star_out: Vec<u16> = self.fragments.star.encode_utf16().collect();
                prev.output = Some(star_out);
                self.state.backtrack = true;
                self.state.globstar = true;
                self.consume(&[STAR], 0); // L1135: consume(value)
                return;
            }
        }

        let mut rest = self.remaining();
        if !self.opts.noextglob() && rest.starts_with(&[LPAREN]) && rest.get(1) != Some(&QMARK) {
            self.extglobOpen("star", STAR);
            return;
        }

        // L1145-L1244 — globstar second star machine
        if let Some(prev_kind) = self.state.tokens.get(self.prev).map(|t| t.kind) {
            if prev_kind == TokenKind::Star {
                if self.opts.noglobstar() {
                    self.consume(&[STAR], 0);
                    return;
                }

                let prior_idx = self.state.tokens[self.prev].prev;
                let prior = &self.state.tokens[prior_idx];
                let before = if prior_idx > 0 {
                    Some(&self.state.tokens[prior.prev])
                } else {
                    None
                };

                let is_start = prior.kind == TokenKind::Slash || prior.kind == TokenKind::Bos;
                let after_star = before
                    .is_some_and(|b| b.kind == TokenKind::Star || b.kind == TokenKind::Globstar);

                let rest_str = String::from_utf16_lossy(rest);

                if self.opts.bash()
                    && (!is_start || rest_str.chars().next().is_some_and(|c| c != '/'))
                {
                    self.push(Token::units(TokenKind::Star, &[STAR], Some(vec![])));
                    return;
                }

                let is_brace = self.state.braces > 0
                    && (prior.kind == TokenKind::Comma || prior.kind == TokenKind::Brace);
                // JS L1161 checks `prev.type === 'pipe'` — but pipe tokens are typed `text`
                // (parse.js L950), so the JS check is dead code. Rust checks value instead,
                // which is also functionally dead (masked by the `prior.kind != Paren` guard
                // at L1167/L874). Semantically equivalent; forked approach noted.
                let is_pipe = prior.value == [PIPE];
                let is_extglob =
                    !self.extglobs.is_empty() && (is_pipe || prior.kind == TokenKind::Paren);

                if !is_start && prior.kind != TokenKind::Paren && !is_brace && !is_extglob {
                    self.push(Token::units(TokenKind::Star, &[STAR], Some(vec![])));
                    return;
                }

                // Strip consecutive `/**/`
                let mut rem_chars = rest_str.clone();
                while rem_chars.starts_with("/**") {
                    let after = rem_chars.chars().nth(3);
                    if after.is_some_and(|c| c != '/') {
                        break;
                    }
                    rem_chars = rem_chars[3..].to_string();
                    let inc = isize::try_from(3).unwrap_or(3);
                    self.state.index += inc;
                    let consumed_units: Vec<u16> = "/**".encode_utf16().collect();
                    self.state.consumed.extend_from_slice(&consumed_units);
                }
                rest = self.remaining();
                let rest_bytes: Vec<u16> = rest.to_vec();

                let globstar_str = self.fragments.globstar.to_string();
                let globstar_units: Vec<u16> = globstar_str.encode_utf16().collect();

                // 1) prior.kind == Bos && eos()
                if prior.kind == TokenKind::Bos && self.eos() {
                    let prev = &mut self.state.tokens[self.prev];
                    prev.kind = TokenKind::Globstar;
                    prev.value.push(STAR);
                    prev.output = Some(globstar_units.clone());
                    self.state.output = globstar_units;
                    self.state.globstar = true;
                    self.consume(&[STAR], 0); // L1184: consume(value)
                    return;
                }

                // 2) prior.kind == Slash && prior.prev != Bos && !after_star && eos()
                if prior.kind == TokenKind::Slash && prior.prev != 0 && !after_star && self.eos() {
                    let prev_output_len = self.state.tokens[self.prev]
                        .output
                        .as_ref()
                        .map_or(0, |o| o.len());
                    let prior_output_len = prior.output.as_ref().map_or(0, |o| o.len());
                    let total_strip = prior_output_len + prev_output_len;
                    if self.state.output.len() >= total_strip {
                        self.state
                            .output
                            .truncate(self.state.output.len() - total_strip);
                    }

                    let prior_tok = &mut self.state.tokens[prior_idx];
                    let mut new_prior_out = vec![LPAREN, b'?' as u16, b':' as u16];
                    new_prior_out
                        .extend_from_slice(prior_tok.output.as_deref().unwrap_or(&prior_tok.value));
                    prior_tok.output = Some(new_prior_out.clone());

                    let mut new_prev_out = globstar_units.clone();
                    if self.opts.strict_slashes() {
                        new_prev_out.push(RPAREN);
                    } else {
                        new_prev_out.extend(b"|$)".iter().map(|&b| b as u16));
                    }

                    let prev_tok = &mut self.state.tokens[self.prev];
                    prev_tok.kind = TokenKind::Globstar;
                    prev_tok.value.push(STAR);
                    prev_tok.output = Some(new_prev_out.clone());

                    self.state.globstar = true;
                    self.state.output.extend_from_slice(&new_prior_out);
                    self.state.output.extend_from_slice(&new_prev_out);
                    self.consume(&[STAR], 0); // L1197: consume(value)
                    return;
                }

                // 3) prior.kind == Slash && prior.prev != Bos && rest[0] == '/'
                if prior.kind == TokenKind::Slash
                    && prior.prev != 0
                    && rest_bytes.first() == Some(&(b'/' as u16))
                {
                    let end = if rest_bytes.get(1).is_some() {
                        "|$"
                    } else {
                        ""
                    };
                    let prev_output_len = self.state.tokens[self.prev]
                        .output
                        .as_ref()
                        .map_or(0, |o| o.len());
                    let prior_output_len = prior.output.as_ref().map_or(0, |o| o.len());
                    let total_strip = prior_output_len + prev_output_len;
                    if self.state.output.len() >= total_strip {
                        self.state
                            .output
                            .truncate(self.state.output.len() - total_strip);
                    }

                    let prior_tok = &mut self.state.tokens[prior_idx];
                    let mut new_prior_out = vec![LPAREN, b'?' as u16, b':' as u16];
                    new_prior_out
                        .extend_from_slice(prior_tok.output.as_deref().unwrap_or(&prior_tok.value));
                    prior_tok.output = Some(new_prior_out.clone());

                    let slash_lit = self.platform.slash_literal;
                    let glob_out = format!("{globstar_str}{slash_lit}|{slash_lit}{end})");
                    let glob_units: Vec<u16> = glob_out.encode_utf16().collect();

                    let prev_tok = &mut self.state.tokens[self.prev];
                    prev_tok.kind = TokenKind::Globstar;
                    prev_tok.value.push(STAR);
                    prev_tok.output = Some(glob_units.clone());

                    self.state.output.extend_from_slice(&new_prior_out);
                    self.state.output.extend_from_slice(&glob_units);
                    self.state.globstar = true;

                    // L1214: consume(value + advance()) — star + slash both consumed
                    self.state.consumed.push(STAR);
                    let slash_ch = self.advance(); // consume '/'
                    if let Some(s) = slash_ch {
                        self.state.consumed.push(s);
                    }
                    self.push(Token::units(TokenKind::Slash, &[FSLASH], Some(vec![])));
                    return;
                }

                // 4) prior.kind == Bos && rest[0] == '/'
                if prior.kind == TokenKind::Bos && rest_bytes.first() == Some(&(b'/' as u16)) {
                    let slash_lit = self.platform.slash_literal;
                    let glob_out = format!("(?:^|{slash_lit}|{globstar_str}{slash_lit})");
                    let glob_units: Vec<u16> = glob_out.encode_utf16().collect();

                    let prev_tok = &mut self.state.tokens[self.prev];
                    prev_tok.kind = TokenKind::Globstar;
                    prev_tok.value.push(STAR);
                    prev_tok.output = Some(glob_units.clone());

                    self.state.output = glob_units;
                    self.state.globstar = true;

                    // L1226: consume(value + advance()) — star + slash both consumed
                    self.state.consumed.push(STAR);
                    let slash_ch = self.advance(); // consume '/'
                    if let Some(s) = slash_ch {
                        self.state.consumed.push(s);
                    }
                    self.push(Token::units(TokenKind::Slash, &[FSLASH], Some(vec![])));
                    return;
                }

                // Default globstar replacement
                let prev_output_len = self.state.tokens[self.prev]
                    .output
                    .as_ref()
                    .map_or(0, |o| o.len());
                if self.state.output.len() >= prev_output_len {
                    self.state
                        .output
                        .truncate(self.state.output.len() - prev_output_len);
                }

                let prev_tok = &mut self.state.tokens[self.prev];
                prev_tok.kind = TokenKind::Globstar;
                prev_tok.value.push(STAR);
                prev_tok.output = Some(globstar_units.clone());

                self.state.output.extend_from_slice(&globstar_units);
                self.state.globstar = true;
                self.consume(&[STAR], 0); // L1242: consume(value)
                return;
            }
        }

        let star_output: Vec<u16> = self.fragments.star.encode_utf16().collect();
        let mut token_output = star_output;

        let prev_kind = self.state.tokens.get(self.prev).map(|t| t.kind);

        if self.opts.bash() {
            token_output = ".*?".encode_utf16().collect();
            if prev_kind == Some(TokenKind::Bos) || prev_kind == Some(TokenKind::Slash) {
                let mut nodot: Vec<u16> = self.fragments.nodot.encode_utf16().collect();
                nodot.extend(token_output);
                token_output = nodot;
            }
            self.push(Token::units(TokenKind::Star, &[STAR], Some(token_output)));
            return;
        }

        if (prev_kind == Some(TokenKind::Bracket) || prev_kind == Some(TokenKind::Paren))
            && self.opts.regex()
        {
            token_output = vec![STAR];
            self.push(Token::units(TokenKind::Star, &[STAR], Some(token_output)));
            return;
        }

        let is_start = self.state.index == isize::try_from(self.state.start).unwrap_or(-1);
        if is_start || prev_kind == Some(TokenKind::Slash) || prev_kind == Some(TokenKind::Dot) {
            let guard_str = if prev_kind == Some(TokenKind::Dot) {
                self.platform.no_dot_slash
            } else if self.opts.dot() {
                self.platform.no_dots_slash
            } else {
                self.fragments.nodot
            };

            let mut addition: Vec<u16> = guard_str.encode_utf16().collect();
            if self.peek(1) != Some(STAR) {
                addition.extend(self.platform.one_char.encode_utf16());
            }

            self.state.output.extend_from_slice(&addition);
            if let Some(prev_tok) = self.state.tokens.get_mut(self.prev) {
                let mut out = match prev_tok.output.take() {
                    Some(o) => o,
                    None => prev_tok.value.clone(),
                };
                out.extend_from_slice(&addition);
                prev_tok.output = Some(out);
            }
        }

        self.push(Token::units(TokenKind::Star, &[STAR], Some(token_output)));
    }
}

fn matches_lookbehind_spec(rem: &[u16]) -> bool {
    for i in 0..rem.len() {
        if rem[i] == b'<' as u16 {
            if let Some(&next) = rem.get(i + 1) {
                if next == b'!' as u16 || next == b'=' as u16 {
                    return true;
                }
                let mut j = i + 1;
                while j < rem.len() && is_word_char(rem[j]) {
                    j += 1;
                }
                if j > i + 1 && j < rem.len() && rem[j] == b'>' as u16 {
                    return true;
                }
            }
        }
    }
    false
}

fn is_word_char(u: u16) -> bool {
    let Ok(c) = u8::try_from(u) else {
        return false;
    };
    c.is_ascii_alphanumeric() || c == b'_'
}

fn count_run(units: &[u16], u: u16) -> usize {
    units.iter().take_while(|&&x| x == u).count()
}

/// Helper: parse.js:L22-L38 — `expandRange(args, options)`
pub(crate) fn expand_range(args: &[Vec<u16>], options: &Options) -> Vec<u16> {
    if let Some(ref expand_fn) = options.expand_range {
        let args_str: Vec<String> = args.iter().map(|u| String::from_utf16_lossy(u)).collect();
        let res_str = expand_fn(&args_str, options);
        return res_str.encode_utf16().collect();
    }

    let mut sorted = args.to_vec();
    sorted.sort();

    if validate_js_range_class(&sorted) {
        let mut out = vec![b'[' as u16];
        for (i, item) in sorted.iter().enumerate() {
            if i > 0 {
                out.push(b'-' as u16);
            }
            out.extend_from_slice(item);
        }
        out.push(b']' as u16);
        out
    } else {
        let mut out = Vec::new();
        for (i, item) in sorted.iter().enumerate() {
            if i > 0 {
                out.push(b'.' as u16);
                out.push(b'.' as u16);
            }
            let escaped = utils::escape_regex_units(item);
            out.extend_from_slice(&escaped);
        }
        out
    }
}

/// Validate whether the sorted range args form a valid ECMAScript character class.
/// JS: `new RegExp('[' + args.join('-') + ']')` — if it throws, the range is invalid.
///
/// With the `validate-regex` feature (default), we construct the candidate class string
/// and try to parse it with `regress::Regex::new()` — exactly mirroring the JS probe.
/// Without the feature, falls back to a conservative approximation.
fn validate_js_range_class(sorted: &[Vec<u16>]) -> bool {
    // Build the candidate class string: [arg0-arg1-arg2-...]
    let mut candidate = String::from('[');
    for (i, item) in sorted.iter().enumerate() {
        if i > 0 {
            candidate.push('-');
        }
        candidate.push_str(&String::from_utf16_lossy(item));
    }
    candidate.push(']');

    #[cfg(feature = "validate-regex")]
    {
        regress::Regex::new(&candidate).is_ok()
    }

    #[cfg(not(feature = "validate-regex"))]
    {
        // Conservative fallback: adjacent-pair endpoint comparison + trailing backslash.
        for i in 0..sorted.len().saturating_sub(1) {
            let last_a = match sorted[i].last() {
                Some(&c) => c,
                None => continue,
            };
            let first_b = match sorted[i + 1].first() {
                Some(&c) => c,
                None => continue,
            };
            if last_a > first_b {
                return false;
            }
        }
        if let Some(last_arg) = sorted.last() {
            let num_trailing_slashes = last_arg
                .iter()
                .rev()
                .take_while(|&&c| c == b'\\' as u16)
                .count();
            if num_trailing_slashes % 2 == 1 {
                return false;
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::options::Options;
    use crate::parse::parse;

    #[test]
    fn test_leading_dotslash_collapse() {
        let opts = Options::default().with_fastpaths(false);
        let res = parse("./a/b", &opts).unwrap();
        assert_eq!(res.prefix, "./");
        assert_eq!(res.output, "a\\/b".encode_utf16().collect::<Vec<_>>());
        assert_eq!(res.start, 0);
        assert_eq!(res.tokens.len(), 4); // bos, text("a"), slash("/"), text("b")
    }

    #[test]
    fn test_dots_and_slashes() {
        let opts = Options::default().with_fastpaths(false);
        let res = parse("a.b/c..d", &opts).unwrap();
        assert_eq!(
            res.output,
            "a\\.b\\/c\\.\\.d".encode_utf16().collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_dot_token_types() {
        let opts = Options::default().with_fastpaths(false);
        let res = parse(".", &opts).unwrap();
        assert_eq!(res.tokens[1].kind.to_js_str(), "dot");

        let res2 = parse("..", &opts).unwrap();
        assert_eq!(res2.tokens[1].kind.to_js_str(), "dot");
        assert_eq!(res2.tokens[2].kind.to_js_str(), "text");
    }

    #[test]
    fn test_qmark_tokens_and_guards() {
        let opts = Options::default().with_fastpaths(false);
        let res = parse("?", &opts).unwrap();
        assert_eq!(res.tokens[1].kind.to_js_str(), "qmark");
        assert_eq!(res.output, "[^.\\/]".encode_utf16().collect::<Vec<_>>());

        let res_dot = parse("?", &opts.clone().with_dot(true)).unwrap();
        assert_eq!(res_dot.output, "[^/]".encode_utf16().collect::<Vec<_>>());
    }

    #[test]
    fn test_star_tokens_and_guards() {
        let opts = Options::default().with_fastpaths(false);
        let res = parse("a*", &opts).unwrap();
        assert_eq!(res.tokens[1].kind.to_js_str(), "text");
        assert_eq!(res.tokens[2].kind.to_js_str(), "star");
        assert_eq!(res.output, "a[^/]*?\\/?".encode_utf16().collect::<Vec<_>>());

        let res_bos = parse("*", &opts).unwrap();
        assert_eq!(
            res_bos.output,
            "(?!\\.)(?=.)[^/]*?\\/?".encode_utf16().collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_brace_alternation_and_ranges() {
        let opts = Options::default().with_fastpaths(false);

        // Plain alternation
        let res = parse("{a,b,c}", &opts).unwrap();
        assert_eq!(res.output, "(a|b|c)".encode_utf16().collect::<Vec<_>>());
        assert_eq!(res.tokens[1].kind.to_js_str(), "brace");

        // Range expansion
        let res_range = parse("{a..z}", &opts).unwrap();
        assert_eq!(res_range.output, "[a-z]".encode_utf16().collect::<Vec<_>>());

        // Range expansion reverse order
        let res_rev = parse("{9..0}", &opts).unwrap();
        assert_eq!(res_rev.output, "[0-9]".encode_utf16().collect::<Vec<_>>());

        // Single brace without comma/dots -> literal escape
        let res_lit = parse("{abc}", &opts).unwrap();
        assert_eq!(
            res_lit.output,
            "\\{abc\\}".encode_utf16().collect::<Vec<_>>()
        );

        // nobrace option
        let res_nobrace = parse("{a,b}", &opts.clone().with_nobrace(true)).unwrap();
        assert_eq!(
            res_nobrace.output,
            "{a,b}".encode_utf16().collect::<Vec<_>>()
        );

        // custom expand_range
        let res_custom = parse(
            "{1..100}",
            &opts
                .clone()
                .with_expand_range(|args, _| format!("({},{})", args[0], args[1])),
        )
        .unwrap();
        assert_eq!(
            res_custom.output,
            "(1,100)".encode_utf16().collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_bug001_unclosed_brace_recovery() {
        let opts = Options::default().with_fastpaths(false);

        // BUG-001 bug-for-bug: JS escapeLast(output, '{') searches for '{' but
        // output contains '(' (brace open emits '(' as regex). Recovery no-ops.
        // Output is "(abc" — invalid regex, which toRegex collapses to /$^/.
        let res1 = parse("{abc", &opts).unwrap();
        assert_eq!(res1.output, "(abc".encode_utf16().collect::<Vec<_>>());

        // Unclosed brace with range inside (triggers backtrack + recovery): should emit ([a-z]
        let res2 = parse("{{a..z}", &opts).unwrap();
        assert_eq!(res2.output, "([a-z]".encode_utf16().collect::<Vec<_>>());
    }

    #[test]
    fn test_bug002_prepend_dotslash_collapse() {
        let opts = Options::default().with_fastpaths(false).with_prepend("PFX");

        // ./foo with prepend (no backtrack): output is "foo" (documented bug-for-bug JS behavior)
        let res = parse("./foo", &opts).unwrap();
        assert_eq!(res.output, "foo".encode_utf16().collect::<Vec<_>>());

        // ./src/{a..z}.js with prepend (backtrack=true): output has PFX
        let res2 = parse("./src/{a..z}.js", &opts).unwrap();
        assert_eq!(
            res2.output,
            "PFXsrc\\/[a-z]\\.js".encode_utf16().collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_brackets_and_posix_classes() {
        let opts = Options::default().with_fastpaths(false);

        // nobracket option
        let res_nobracket = parse("[abc]", &opts.clone().with_nobracket(true)).unwrap();
        assert_eq!(
            res_nobracket.output,
            "\\[abc\\]".encode_utf16().collect::<Vec<_>>()
        );

        // literalBrackets = true (last token is Bracket, maybe_slash appends \/?)
        let res_lit_true = parse("[abc]", &opts.clone().with_literal_brackets(true)).unwrap();
        assert_eq!(
            res_lit_true.output,
            "\\[abc\\]\\/?".encode_utf16().collect::<Vec<_>>()
        );

        // literalBrackets = false (last token is Bracket, maybe_slash appends \/?)
        let res_lit_false = parse("[abc]", &opts.clone().with_literal_brackets(false)).unwrap();
        assert_eq!(
            res_lit_false.output,
            "[abc]\\/?".encode_utf16().collect::<Vec<_>>()
        );

        // POSIX class [[:alnum:]]
        let res_posix = parse("[[:alnum:]]", &opts).unwrap();
        assert!(!res_posix.output.is_empty());
    }

    #[test]
    fn test_extglob_simple() {
        let opts = Options::default().with_fastpaths(false);
        let res = parse("?(a|b)", &opts).unwrap();
        println!("output: {:?}", String::from_utf16_lossy(&res.output));
    }

    // ---- Review finding regression tests (2026-08-03) ----

    /// F-2 (B2): extglobClose rest-test must enforce ≥2 chars and no subsequent dot.
    /// JS: /^\.[^\\/.]+$/.test(rest) — `x!(*a).b.c` must NOT absorb `.b.c` into
    /// the negation lookahead.
    #[test]
    fn test_f2_extglob_rest_dotted() {
        let opts = Options::default().with_fastpaths(false);

        // x!(*a).b.c — rest ".b.c" contains a second dot → rest-test must FAIL
        let res = parse("x!(*a).b.c", &opts).unwrap();
        let out = String::from_utf16_lossy(&res.output);
        // JS output: "x(?:(?!(?:[^/]*?a))[^/]*?)\.b\.c"
        // The negation group must NOT contain ".b.c"
        assert!(
            !out.contains("(?!(?:[^/]*?a)\\.b\\.c)"),
            "F-2: rest `.b.c` should NOT be absorbed into the negation lookahead. Got: {out}"
        );

        // x!(*a). — rest "." is only 1 char → rest-test must FAIL (≥2 chars required)
        let res2 = parse("x!(*a).", &opts).unwrap();
        let out2 = String::from_utf16_lossy(&res2.output);
        assert!(
            !out2.contains("(?!(?:[^/]*?a)\\.)"),
            "F-2: single-char rest '.' should NOT be absorbed. Got: {out2}"
        );
    }

    /// F-3 (B3): brace literal-close must use JS truthiness (empty string is falsy).
    /// `{a@(bc)}` — the `@` token has output: Some("") which must fall back to value "@".
    #[test]
    fn test_f3_brace_literal_close_empty_output() {
        let opts = Options::default().with_fastpaths(false);

        let res = parse("{a@(bc)}", &opts).unwrap();
        let out = String::from_utf16_lossy(&res.output);
        // JS output: "\{a@(bc)\}" — braces are literalized, '@' preserved in value
        assert_eq!(
            out, "\\{a@(bc)\\}",
            "F-3: empty output must fall back to value '@'"
        );
    }

    /// F-6 (B4): negate peek(3) must accept only '?' (not '!', '=', '<', ':').
    /// `!!(!a)` — the inner `!(` is an extglob, not a second negation.
    #[test]
    fn test_f6_negate_peek3_only_question() {
        let opts = Options::default().with_fastpaths(false);

        let res = parse("!!(!a)", &opts).unwrap();
        // JS: negated=true, the pattern is a negated extglob
        assert!(res.negated, "F-6: !!(!a) must be negated");

        // Also test !!(=a) — should also be negated (peek(3) is '=' which is NOT '?')
        let res2 = parse("!!(=a)", &opts).unwrap();
        assert!(res2.negated, "F-6: !!(=a) must be negated");
    }

    /// F-4 (M2): close-paren with parens < 0 must emit raw ')' not '\\)'.
    /// JS: `state.parens ? ')' : '\\)'` — -1 is truthy.
    #[test]
    fn test_f4_close_paren_negative_count() {
        let opts = Options::default().with_fastpaths(false);

        let res = parse("a))b", &opts).unwrap();
        let out = String::from_utf16_lossy(&res.output);
        // JS output: "a\))b" — first ')' escapes (parens=0), second ')' raw (parens=-1, truthy)
        assert_eq!(
            out, "a\\))b",
            "F-4: stray ')' with parens<0 must emit raw ')'"
        );
    }

    /// F-7 (M1): expandRange validation must reject `{a-..z}` (produces `[a--z]`
    /// which is a reversed range in ECMAScript).
    #[test]
    fn test_f7_expand_range_reversed() {
        let opts = Options::default().with_fastpaths(false);

        // {a-..z} — args ["a-", "z"], sorted → ["a-", "z"], class → "[a--z]"
        // V8 throws SyntaxError on [a--z] → JS falls back to escaped dot-join
        let res = parse("{a-..z}", &opts).unwrap();
        let out = String::from_utf16_lossy(&res.output);
        // Must NOT contain "[a--z]" (that's the invalid class)
        assert!(
            !out.contains("[a--z]"),
            "F-7: {{a-..z}} must not produce [a--z] (reversed range). Got: {out}"
        );
        // Should contain the escaped fallback: "a\\-..z" or similar
        assert!(
            out.contains("a\\-") || out.contains("a\\x2d"),
            "F-7: {{a-..z}} should produce escaped fallback. Got: {out}"
        );
    }
}
