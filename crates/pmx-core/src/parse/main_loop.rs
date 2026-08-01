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

const QMARK: u16 = b'?' as u16;
const STAR: u16 = b'*' as u16;
const PLUS: u16 = b'+' as u16;

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

            // L1071-L1089 — plus
            if value == PLUS {
                self.plus_branch();
                continue;
            }

            // (C7 parens, C6 brackets, C5 braces, C7 pipe, C5 comma,
            //  C7 '!', C7 '@': not present.)

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
        // L998-L1006 — (C5 brace dots hook: state.braces > 0 && prev.type === 'dot')
        // In C2 state.braces is 0, so this condition is skipped.

        // L1008-L1011 — text dot when not adjacent to bos/slash and outside braces/parens
        let prev_kind = self.state.tokens.get(self.prev).map(|t| t.kind);
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

    /// L1021-L1047 — question marks branch
    fn qmark_branch(&mut self) {
        let prev_tok = self.state.tokens.get(self.prev);
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

    /// L1246-L1283 — plain star branch
    fn star_branch(&mut self) {
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
}
