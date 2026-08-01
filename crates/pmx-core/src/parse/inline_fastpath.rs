//! inline fastpath — port: lib/parse.js:L606-L655. Bypasses the whole
//! tokenizer for construct-free patterns: one simulated `String.replace`
//! pass with REGEX_SPECIAL_CHARS_BACKREF, a backslash collapse pass when any
//! literal backslash appeared, then utils.wrapOutput anchors and the state
//! returns EARLY (no recovery/maybe_slash/rebuild — mod.rs honors that).

use super::parser::Parser;
use crate::utils;

const BS: u16 = b'\\' as u16;
const QMARK_CH: u16 = b'?' as u16;
const DOT_CH: u16 = b'.' as u16;
const STAR_CH: u16 = b'*' as u16;

/// JS `\W` complement: word chars are ASCII letters/digits/underscore.
fn is_word(u: u16) -> bool {
    (u >= b'a' as u16 && u <= b'z' as u16)
        || (u >= b'A' as u16 && u <= b'Z' as u16)
        || (u >= b'0' as u16 && u <= b'9' as u16)
        || u == b'_' as u16
}

/// The routing regex of L606: `!/(^[*!]|[/()[\]{}"])/` on the stripped input.
fn routes_to_loop(body: &[u16]) -> bool {
    if matches!(body.first(), Some(c) if *c == b'*' as u16 || *c == b'!' as u16) {
        return true;
    }
    body.iter().any(|&c| {
        matches!(c, x if x == b'/' as u16
            || x == b'(' as u16
            || x == b')' as u16
            || x == b'[' as u16
            || x == b']' as u16
            || x == b'{' as u16
            || x == b'}' as u16
            || x == b'"' as u16)
    })
}

impl Parser {
    /// port: parse.js:L606-L655. Returns true iff the fastpath handled the
    /// pattern — `state.output` is written here and the caller returns EARLY:
    /// NO recovery, maybe_slash, or rebuild runs on this route (L654).
    pub(crate) fn try_inline_fastpath(&mut self) -> bool {
        // L606 — `opts.fastpaths !== false` (undefined ⇒ enabled)
        if !self.opts.fastpaths() {
            return false;
        }
        if routes_to_loop(&self.input_chars) {
            return false;
        }

        // L607-L636 — simulated REGEX_SPECIAL_CHARS_BACKREF replace pass.
        // Field-splitting: fragments read-only, output written after.
        let (mut output, backslashes) = rewrite_special_chars(
            &self.input_chars,
            self.fragments.star.as_str(),
            self.fragments.qmark_no_dot,
            self.platform.qmark,
            self.platform.dot_literal,
        );

        // L638-L646 — collapse literal backslash runs (parity: even→2, odd→1),
        // or strip entirely under unescape === true.
        if backslashes {
            if self.opts.unescape() {
                output.retain(|&u| u != BS);
            } else {
                output = collapse_backslash_runs(&output);
            }
        }

        // L648-L651 — no-op output + contains => bare state, unanchored
        if output == self.input_chars && self.opts.contains() {
            self.state.output = self.input_chars.clone();
            return true;
        }

        // L653-L654 — utils.wrapOutput, then state returns EARLY.
        self.state.output = utils::wrap_output(&output, self.state.negated, self.opts.contains());
        true
    }
}

/// parity-collapse of consecutive backslash runs (L642-L644).
fn collapse_backslash_runs(output: &[u16]) -> Vec<u16> {
    let mut collapsed = Vec::with_capacity(output.len());
    let mut i = 0;
    while i < output.len() {
        if output[i] == BS {
            let mut run = 1;
            while i + run < output.len() && output[i + run] == BS {
                run += 1;
            }
            let emit = if run % 2 == 0 { 2 } else { 1 };
            collapsed.extend(std::iter::repeat_n(BS, emit));
            i += run;
        } else {
            collapsed.push(output[i]);
            i += 1;
        }
    }
    collapsed
}

/// Simulated `/ (\\?) ((\W) (\3*)) /g` replace (parse.js:L609-L636).
/// Returns (rewritten units, saw-literal-backslash).
///
/// The regex's leftmost non-overlapping scan, simulated without a regex
/// engine: word chars copy through untouched. At a backslash followed by a
/// NON-word char n, the match is esc=backslash and chars = maximal run of
/// `n`, total span 1+run. Otherwise the backslash itself is the matched
/// non-word (`(\\?)` backtracked to empty) with chars = backslash-run.
/// At any other non-word char, esc = None and chars = maximal run of it.
fn rewrite_special_chars(
    body: &[u16],
    star: &str,
    qmark_no_dot: &str,
    qmark: &str,
    dot_literal: &str,
) -> (Vec<u16>, bool) {
    let mut out = Vec::with_capacity(body.len() * 2);
    let mut backslashes = false;
    let mut i = 0;

    while i < body.len() {
        let u = body[i];
        if is_word(u) {
            out.push(u);
            i += 1;
            continue;
        }

        let (escaped, first, chars_len): (bool, u16, usize) = if u == BS {
            match body.get(i + 1) {
                Some(&n) if !is_word(n) => (true, n, run_len(body, i + 1, n)),
                _ => (false, BS, run_len(body, i, BS)),
            }
        } else {
            (false, u, run_len(body, i, u))
        };
        let span = chars_len + usize::from(escaped);

        // Callback dispatch in exact source order (L610-L635).
        if first == BS {
            // L610-L613 — literal backslash: flag + echo as-is
            backslashes = true;
            out.extend_from_slice(&body[i..i + span]);
        } else if first == QMARK_CH {
            if escaped {
                // L616-L618 — keep the escape, then QMARK for any EXTRA '?'s
                out.push(BS);
                out.push(QMARK_CH);
                for _ in 1..chars_len {
                    out.extend(qmark.encode_utf16());
                }
            } else if i == 0 {
                // L619-L621 — pattern-start '?' uses QMARK_NO_DOT
                out.extend(qmark_no_dot.encode_utf16());
                for _ in 1..chars_len {
                    out.extend(qmark.encode_utf16());
                }
            } else {
                // L622 — QMARK per char in the run
                for _ in 0..chars_len {
                    out.extend(qmark.encode_utf16());
                }
            }
        } else if first == DOT_CH {
            // L625-L627 — NO escaped-dot special case (unlike '?' and '*'):
            // a backslash preceding a dot run is silently dropped here.
            for _ in 0..chars_len {
                out.extend(dot_literal.encode_utf16());
            }
        } else if first == STAR_CH {
            if escaped {
                // L630-L631 — keep escape; star fragment only for extra '*'s
                out.push(BS);
                out.push(STAR_CH);
                if chars_len > 1 {
                    out.extend(star.encode_utf16());
                }
            } else {
                // L633 — a whole run of '*'s becomes ONE star fragment
                out.extend(star.encode_utf16());
            }
        } else {
            // L635 — any other non-word char: escape unless already escaped
            if !escaped {
                out.push(BS);
            }
            out.extend_from_slice(&body[i..i + span]);
        }

        i += span;
    }

    (out, backslashes)
}

fn run_len(body: &[u16], from: usize, u: u16) -> usize {
    let mut run = 0;
    while from + run < body.len() && body[from + run] == u {
        run += 1;
    }
    run
}

#[cfg(test)]
mod tests {
    use super::*;

    const P_STAR: &str = "[^/]*?";
    const P_QND: &str = "[^.\\/]";
    const P_Q: &str = "[^/]";
    const P_DOT: &str = "\\.";

    fn rw(s: &str) -> String {
        let body: Vec<u16> = s.encode_utf16().collect();
        let (out, _) = rewrite_special_chars(&body, P_STAR, P_QND, P_Q, P_DOT);
        String::from_utf16(&out).unwrap()
    }

    // Expected values captured from reference/lib/parse.js on the inline
    // fastpath route (pre-wrap fragment outputs).
    #[test]
    fn backref_replace_bytes() {
        assert_eq!(rw("abc"), "abc");
        assert_eq!(rw("a.b"), "a\\.b");
        assert_eq!(rw("a..b"), "a\\.\\.b");
        assert_eq!(rw("a*b"), "a[^/]*?b");
        assert_eq!(rw("a**b"), "a[^/]*?b"); // star runs collapse to ONE fragment
        assert_eq!(rw("?ab"), "[^.\\/]ab"); // start '?' uses QMARK_NO_DOT
        assert_eq!(rw("a??b"), "a[^/][^/]b"); // qmark runs repeat
        assert_eq!(rw("a^b"), "a\\^b");
        assert_eq!(rw("a,b"), "a\\,b");
        assert_eq!(rw("a\\*b"), "a\\*b"); // escaped star kept
        assert_eq!(rw("a\\**b"), "a\\*[^/]*?b"); // escape + star for the rest
        assert_eq!(rw("a\\?b"), "a\\?b");
        assert_eq!(rw("a\\??b"), "a\\?[^/]b");
    }
}
