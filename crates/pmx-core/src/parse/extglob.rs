//! extglob.rs — port: lib/parse.js:L48-L347 (S1 ReDoS triage helpers) & L523-L600 (extglobOpen/extglobClose).

use std::collections::HashSet;

use super::parser::{CounterKind, ExtglobFrame, Parser};
use super::state::{Token, TokenKind};
use crate::constants;
use crate::error::PmxError;
use crate::options::{ExtglobRecursion, Options};
use crate::utils;

const LPAREN: u16 = b'(' as u16;
const RPAREN: u16 = b')' as u16;
const STAR: u16 = b'*' as u16;

/// lib/parse.js:L48-L98 — `splitTopLevel(input)`
pub(crate) fn split_top_level(input: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut bracket = 0i32;
    let mut paren = 0i32;
    let mut quote = 0i32;
    let mut value = String::new();
    let mut escaped = false;

    for ch in input.chars() {
        if escaped {
            value.push(ch);
            escaped = false;
            continue;
        }

        if ch == '\\' {
            value.push(ch);
            escaped = true;
            continue;
        }

        if ch == '"' {
            quote = if quote == 1 { 0 } else { 1 };
            value.push(ch);
            continue;
        }

        if quote == 0 {
            if ch == '[' {
                bracket += 1;
            } else if ch == ']' && bracket > 0 {
                bracket -= 1;
            } else if bracket == 0 {
                if ch == '(' {
                    paren += 1;
                } else if ch == ')' && paren > 0 {
                    paren -= 1;
                } else if ch == '|' && paren == 0 {
                    parts.push(value);
                    value = String::new();
                    continue;
                }
            }
        }

        value.push(ch);
    }

    parts.push(value);
    parts
}

/// lib/parse.js:L100-L120 — `isPlainBranch(branch)`
pub(crate) fn is_plain_branch(branch: &str) -> bool {
    let mut escaped = false;
    static SPECIAL: &[char] = &['?', '*', '+', '@', '!', '(', ')', '[', ']', '{', '}'];

    for ch in branch.chars() {
        if escaped {
            escaped = false;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            continue;
        }

        if SPECIAL.contains(&ch) {
            return false;
        }
    }

    true
}

/// lib/parse.js:L122-L140 — `normalizeSimpleBranch(branch)`
pub(crate) fn normalize_simple_branch(branch: &str) -> Option<String> {
    let mut value = branch.trim().to_string();
    let mut changed = true;

    while changed {
        changed = false;
        if value.starts_with("@(") && value.ends_with(')') {
            let inner = &value[2..value.len() - 1];
            if !inner
                .chars()
                .any(|c| matches!(c, '\\' | '(' | ')' | '[' | ']' | '{' | '}' | '|'))
            {
                value = inner.to_string();
                changed = true;
            }
        }
    }

    if !is_plain_branch(&value) {
        return None;
    }

    let mut unescaped = String::new();
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(next) = chars.next() {
                unescaped.push(next);
            } else {
                unescaped.push('\\');
            }
        } else {
            unescaped.push(ch);
        }
    }

    Some(unescaped)
}

/// lib/parse.js:L142-L162 — `hasRepeatedCharPrefixOverlap(branches)`
pub(crate) fn has_repeated_char_prefix_overlap(branches: &[String]) -> bool {
    let values: Vec<String> = branches
        .iter()
        .filter_map(|b| normalize_simple_branch(b))
        .collect();

    for i in 0..values.len() {
        for j in (i + 1)..values.len() {
            let a = &values[i];
            let b = &values[j];
            let Some(first_char) = a.chars().next() else {
                continue;
            };

            let is_a_repeated = !a.is_empty() && a.chars().all(|c| c == first_char);
            let is_b_repeated = !b.is_empty() && b.chars().all(|c| c == first_char);

            if !is_a_repeated || !is_b_repeated {
                continue;
            }

            if a == b || a.starts_with(b) || b.starts_with(a) {
                return true;
            }
        }
    }

    false
}

#[derive(Debug)]
pub(crate) struct RepeatedExtglobMatch {
    pub kind: u16,
    pub body: String,
    pub end: usize,
}

/// lib/parse.js:L164-L231 — `parseRepeatedExtglob(pattern, requireEnd)`
pub(crate) fn parse_repeated_extglob(
    pattern: &str,
    require_end: bool,
) -> Option<RepeatedExtglobMatch> {
    let bytes = pattern.as_bytes();
    if bytes.len() < 2 {
        return None;
    }
    let first = bytes[0] as u16;
    if (first != b'+' as u16 && first != b'*' as u16) || bytes[1] != b'(' {
        return None;
    }

    let mut bracket = 0i32;
    let mut paren = 0i32;
    let mut quote = 0i32;
    let mut escaped = false;
    let chars: Vec<char> = pattern.chars().collect();

    for i in 1..chars.len() {
        let ch = chars[i];

        if escaped {
            escaped = false;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            continue;
        }

        if ch == '"' {
            quote = if quote == 1 { 0 } else { 1 };
            continue;
        }

        if quote == 1 {
            continue;
        }

        if ch == '[' {
            bracket += 1;
            continue;
        }

        if ch == ']' && bracket > 0 {
            bracket -= 1;
            continue;
        }

        if bracket > 0 {
            continue;
        }

        if ch == '(' {
            paren += 1;
            continue;
        }

        if ch == ')' {
            paren -= 1;

            if paren == 0 {
                if require_end && i != chars.len() - 1 {
                    return None;
                }

                let body: String = chars[2..i].iter().collect();
                return Some(RepeatedExtglobMatch {
                    kind: first,
                    body,
                    end: i,
                });
            }
        }
    }

    None
}

/// lib/parse.js:L233-L239 — `buildCharClassStar(chars)`
pub(crate) fn build_char_class_star(chars: &[String]) -> Vec<u16> {
    let mut out = Vec::new();
    if chars.len() == 1 {
        let esc = utils::escape_regex(&chars[0].encode_utf16().collect::<Vec<_>>());
        out.extend_from_slice(&esc);
    } else {
        out.push(b'[' as u16);
        for ch in chars {
            let esc = utils::escape_regex(&ch.encode_utf16().collect::<Vec<_>>());
            out.extend_from_slice(&esc);
        }
        out.push(b']' as u16);
    }
    out.push(STAR);
    out
}

/// lib/parse.js:L241-L271 — `getStarExtglobSequenceChars(pattern)`
pub(crate) fn get_star_extglob_sequence_chars(pattern: &str) -> Option<Vec<String>> {
    let mut index = 0;
    let mut chars = Vec::new();

    while index < pattern.len() {
        let match_res = parse_repeated_extglob(&pattern[index..], false)?;

        if match_res.kind != b'*' as u16 {
            return None;
        }

        let branches: Vec<String> = split_top_level(&match_res.body)
            .into_iter()
            .map(|b| b.trim().to_string())
            .collect();

        if branches.len() != 1 {
            return None;
        }

        let branch = normalize_simple_branch(&branches[0])?;
        if branch.chars().count() != 1 {
            return None;
        }

        chars.push(branch);
        index += match_res.end + 1;
    }

    if chars.is_empty() {
        return None;
    }

    Some(chars)
}

/// lib/parse.js:L273-L285 — `repeatedExtglobRecursion(pattern)`
pub(crate) fn repeated_extglob_recursion(pattern: &str) -> usize {
    let mut depth = 0;
    let mut value = pattern.trim().to_string();
    let mut match_res = parse_repeated_extglob(&value, true);

    while let Some(m) = match_res {
        depth += 1;
        value = m.body.trim().to_string();
        match_res = parse_repeated_extglob(&value, true);
    }

    depth
}

pub(crate) struct ExtglobAnalysis {
    pub risky: bool,
    pub safe_output: Option<Vec<u16>>,
}

/// lib/parse.js:L287-L347 — `analyzeRepeatedExtglob(body, options)`
pub(crate) fn analyze_repeated_extglob(body: &[u16], options: &Options) -> ExtglobAnalysis {
    if matches!(options.max_extglob_recursion, ExtglobRecursion::Disabled) {
        return ExtglobAnalysis {
            risky: false,
            safe_output: None,
        };
    }

    let max = match options.max_extglob_recursion {
        ExtglobRecursion::Limit(n) => n as usize,
        _ => constants::DEFAULT_MAX_EXTGLOB_RECURSION as usize,
    };

    let body_str = String::from_utf16_lossy(body);
    let branches: Vec<String> = split_top_level(&body_str)
        .into_iter()
        .map(|b| b.trim().to_string())
        .collect();

    if branches.len() > 1 {
        let has_empty = branches.iter().any(|b| b.is_empty());
        let has_star_qmark = branches
            .iter()
            .any(|b| !b.is_empty() && b.chars().all(|c| c == '*' || c == '?'));
        if has_empty || has_star_qmark || has_repeated_char_prefix_overlap(&branches) {
            return ExtglobAnalysis {
                risky: true,
                safe_output: None,
            };
        }
    }

    let mut safe_chars = Vec::new();
    let mut saw_star_sequence = false;
    let mut combinable = true;

    for branch in &branches {
        if let Some(chars) = get_star_extglob_sequence_chars(branch) {
            saw_star_sequence = true;
            safe_chars.extend(chars);
            continue;
        }

        if let Some(literal) = normalize_simple_branch(branch) {
            if literal.chars().count() == 1 {
                safe_chars.push(literal);
                continue;
            }
        }

        combinable = false;

        if repeated_extglob_recursion(branch) > max {
            return ExtglobAnalysis {
                risky: true,
                safe_output: None,
            };
        }
    }

    if saw_star_sequence {
        if combinable {
            let mut unique_chars = Vec::new();
            let mut seen = HashSet::new();
            for c in safe_chars {
                if seen.insert(c.clone()) {
                    unique_chars.push(c);
                }
            }
            return ExtglobAnalysis {
                risky: true,
                safe_output: Some(build_char_class_star(&unique_chars)),
            };
        } else {
            return ExtglobAnalysis {
                risky: true,
                safe_output: None,
            };
        }
    }

    ExtglobAnalysis {
        risky: false,
        safe_output: None,
    }
}

impl Parser {
    /// lib/parse.js:L523-L537 — `extglobOpen(type, value)`
    #[allow(non_snake_case)]
    pub(crate) fn extglobOpen(&mut self, kind: &'static str, value: u16) {
        let ext_entry = match kind {
            "negate" => &self.extglob_chars.negate,
            "qmark" => &self.extglob_chars.qmark,
            "plus" => &self.extglob_chars.plus,
            "star" => &self.extglob_chars.star,
            "at" => &self.extglob_chars.at,
            _ => &self.extglob_chars.qmark,
        };

        let token = ExtglobFrame {
            kind,
            open: ext_entry.open,
            close: ext_entry.close.to_string(),
            conditions: 1,
            inner: Vec::new(),
            prev_tok: self.prev,
            parens: self.state.parens,
            output: self.state.output.clone(),
            start_index: self.state.index,
            tokens_index: self.state.tokens.len(),
        };

        let mut output = Vec::new();
        if self.opts.capture() {
            output.push(LPAREN);
        }
        utils::extend_units(&mut output, token.open);

        self.increment(CounterKind::Parens);

        let one_char: Vec<u16> = self.platform.one_char.encode_utf16().collect();
        let first_output = if self.state.output.is_empty() {
            Some(one_char)
        } else {
            Some(vec![])
        };

        let tok_kind = match kind {
            "negate" => TokenKind::Negate,
            "qmark" => TokenKind::Qmark,
            "plus" => TokenKind::Plus,
            "star" => TokenKind::Star,
            "at" => TokenKind::At,
            _ => TokenKind::Paren,
        };

        self.push(Token::units(tok_kind, &[value], first_output));

        let open_paren = self.advance().unwrap_or(LPAREN);
        self.push(Token::units(TokenKind::Paren, &[open_paren], Some(output)));

        self.extglobs.push(token);
    }

    /// lib/parse.js:L539-L600 — `extglobClose(token)`
    #[allow(non_snake_case)]
    pub(crate) fn extglobClose(&mut self, token: ExtglobFrame) -> Result<(), PmxError> {
        let start_u = usize::try_from(token.start_index).unwrap_or(0);
        let curr_u = usize::try_from(self.state.index).unwrap_or(0);

        let literal = if curr_u >= start_u && curr_u < self.input_chars.len() {
            self.input_chars[start_u..=curr_u].to_vec()
        } else {
            Vec::new()
        };

        let body = if curr_u > start_u + 1 && curr_u <= self.input_chars.len() {
            self.input_chars[start_u + 2..curr_u].to_vec()
        } else {
            Vec::new()
        };

        let analysis = analyze_repeated_extglob(&body, &self.opts);

        if (token.kind == "plus" || token.kind == "star") && analysis.risky {
            let one_char: Vec<u16> = self.platform.one_char.encode_utf16().collect();
            let pfx = if token.output.is_empty() {
                &one_char[..]
            } else {
                &[]
            };

            let safe_output = if let Some(so) = analysis.safe_output {
                let mut out = pfx.to_vec();
                if self.opts.capture() {
                    out.push(LPAREN);
                    out.extend_from_slice(&so);
                    out.push(RPAREN);
                } else {
                    out.extend_from_slice(&so);
                }
                Some(out)
            } else {
                None
            };

            let esc_lit = utils::escape_regex(&literal);
            let final_open_out = safe_output.unwrap_or(esc_lit);

            if token.tokens_index < self.state.tokens.len() {
                let open_tok = &mut self.state.tokens[token.tokens_index];
                open_tok.kind = TokenKind::Text;
                open_tok.value = literal;
                open_tok.output = Some(final_open_out.clone());
            }

            for i in (token.tokens_index + 1)..self.state.tokens.len() {
                self.state.tokens[i].value.clear();
                self.state.tokens[i].output = Some(vec![]);
                self.state.tokens[i].suffix = None;
            }

            let mut new_out = token.output.clone();
            new_out.extend_from_slice(&final_open_out);
            self.state.output = new_out;
            self.state.backtrack = true;

            self.push(Token::units(TokenKind::Paren, &[RPAREN], Some(vec![])));
            self.decrement(CounterKind::Parens);
            return Ok(());
        }

        let mut close_str = format!(
            "{}{}",
            token.close,
            if self.opts.capture() { ")" } else { "" }
        );

        if token.kind == "negate" {
            let mut extglob_star = self.fragments.star.clone();
            if token.inner.len() > 1 && token.inner.contains(&(b'/' as u16)) {
                extglob_star = self.fragments.globstar.clone();
            }

            let remaining_units = self.remaining();
            let is_all_parens =
                !remaining_units.is_empty() && remaining_units.iter().all(|&u| u == RPAREN);

            if extglob_star != self.fragments.star || self.eos() || is_all_parens {
                close_str = format!(")$)){extglob_star}");
            }

            if token.inner.contains(&STAR) {
                let rem_str = String::from_utf16_lossy(remaining_units);
                if rem_str.starts_with('.') && !rem_str.contains('/') && !rem_str.contains('\\') {
                    let sub_opts = self.opts.clone().with_fastpaths(false);
                    if let Ok(sub_state) = super::parse(&rem_str, &sub_opts) {
                        let sub_out = String::from_utf16_lossy(&sub_state.output);
                        close_str = format!("){sub_out}){extglob_star})");
                    }
                }
            }

            if self
                .state
                .tokens
                .get(token.prev_tok)
                .is_some_and(|t| t.kind == TokenKind::Bos)
            {
                self.state.negated_extglob = true;
            }
        }

        let close_units: Vec<u16> = close_str.encode_utf16().collect();
        self.push(Token::units(TokenKind::Paren, &[RPAREN], Some(close_units)));
        self.decrement(CounterKind::Parens);

        Ok(())
    }
}
