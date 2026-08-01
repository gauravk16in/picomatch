//! main loop — C1 slice of lib/parse.js:L661-L1122.
//! Branch order is the source order; C2-C9 branches are physically absent,
//! so their characters currently fall through to the text branch — SAME as
//! JS when all its preceding ifs miss. Corpus rows only ever contain
//! characters whose two interpretations agree (C1_DESIGN.md §6).

use super::parser::{BraceFrame, CounterKind, Parser};
use super::state::{Token, TokenKind};
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

            // L1071-L1089 — plus
            if value == PLUS {
                self.plus_branch();
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

        if self.opts.nobrace() || brace.is_none() {
            self.push(Token::units(TokenKind::Text, &[RBRACE], Some(vec![RBRACE])));
            return;
        }

        let brace = brace.unwrap();
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
                let piece = t.output.as_deref().unwrap_or(&t.value);
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
                let mut out = prev_tok.output.take().unwrap_or_else(|| prev_tok.value.clone());
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

/// Helper: parse.js:L22-L38 — `expandRange(args, options)`
pub(crate) fn expand_range(args: &[Vec<u16>], options: &Options) -> Vec<u16> {
    if let Some(ref expand_fn) = options.expand_range {
        let args_str: Vec<String> = args
            .iter()
            .map(|u| String::from_utf16_lossy(u))
            .collect();
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
            let escaped = utils::escape_regex(item);
            out.extend_from_slice(&escaped);
        }
        out
    }
}

fn validate_js_range_class(args: &[Vec<u16>]) -> bool {
    for i in 0..args.len().saturating_sub(1) {
        let last_a = match args[i].last() {
            Some(&c) => c,
            None => continue,
        };
        let first_b = match args[i + 1].first() {
            Some(&c) => c,
            None => continue,
        };
        if last_a > first_b {
            return false;
        }
    }
    if let Some(last_arg) = args.last() {
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
        assert_eq!(res_lit.output, "\\{abc\\}".encode_utf16().collect::<Vec<_>>());

        // nobrace option
        let res_nobrace = parse("{a,b}", &opts.clone().with_nobrace(true)).unwrap();
        assert_eq!(res_nobrace.output, "{a,b}".encode_utf16().collect::<Vec<_>>());

        // custom expand_range
        let res_custom = parse("{1..100}", &opts.clone().with_expand_range(|args, _| {
            format!("({},{})", args[0], args[1])
        })).unwrap();
        assert_eq!(res_custom.output, "(1,100)".encode_utf16().collect::<Vec<_>>());
    }
}
