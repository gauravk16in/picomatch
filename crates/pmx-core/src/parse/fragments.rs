//! Fragment bundle — moved from parser.rs in C1 (shared by inline fastpath
//! + main loop). port: lib/parse.js:L371-L405.

use crate::constants::PlatformChars;
use crate::options::Options;

/// Per-call fragment bundle — the JS closures `globstar(opts)`, `star`,
/// `nodot`, `qmarkNoDot`, and the `capture` prefix (parse.js:L371-L405).
#[derive(Debug)]
pub(crate) struct Fragments {
    pub star: String,
    pub globstar: String,
    #[allow(dead_code)] // callers use opts.capture() directly; field kept for structural parity
    pub capture: &'static str,
    pub nodot: &'static str,
    pub qmark_no_dot: &'static str,
}

pub(crate) fn build_fragments(opts: &Options, p: &'static PlatformChars) -> Fragments {
    let capture: &'static str = if opts.capture() { "" } else { "?:" };
    // L396 — globstar template: `(${capture}(?:(?!${START}${SCOPE}).)*?)`
    // The `.` is AFTER the lookahead's closing paren — misplacing it inside
    // poisons every downstream byte comparison (review c0-1 BLOCKER).
    let globstar = format!(
        "({capture}(?:(?!{}{}).)*?)",
        p.start_anchor,
        if opts.dot() {
            p.dots_slash
        } else {
            p.dot_literal
        }
    );
    // L399-L400
    let nodot = if opts.dot() { "" } else { p.no_dot };
    let qmark_no_dot = if opts.dot() { p.qmark } else { p.qmark_no_dot };
    // L401-L405 — bash mode substitutes the whole globstar for a single star
    let star_base = if opts.bash() {
        globstar.clone()
    } else {
        p.star.to_string()
    };
    let star = if opts.capture() {
        format!("({star_base})")
    } else {
        star_base
    };
    Fragments {
        star,
        globstar,
        capture,
        nodot,
        qmark_no_dot,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::glob_chars;

    // Review c0-1 BLOCKER evidence: exact bytes from reference
    // `parse('**', { fastpaths: false, ... }).output` — posix + windows pinned.
    #[test]
    fn globstar_fragment_bytes_match_reference() {
        let p = glob_chars(false);
        let f = |o: &Options| build_fragments(o, p).globstar;
        assert_eq!(f(&Options::default()), r"(?:(?:(?!(?:^|\/)\.).)*?)");
        assert_eq!(
            f(&Options::default().with_dot(true)),
            r"(?:(?:(?!(?:^|\/)\.{1,2}(?:\/|$)).)*?)"
        );
        assert_eq!(
            f(&Options::default().with_capture(true)),
            r"((?:(?!(?:^|\/)\.).)*?)"
        );
        assert_eq!(
            f(&Options::default().with_bash(true)),
            r"(?:(?:(?!(?:^|\/)\.).)*?)"
        );
    }

    #[test]
    fn globstar_fragment_bytes_match_reference_windows() {
        let w = glob_chars(true);
        let f = |o: &Options| build_fragments(o, w).globstar;
        let base = Options::default().with_windows(true);
        assert_eq!(f(&base), r"(?:(?:(?!(?:^|[\\/])\.).)*?)");
        assert_eq!(
            f(&base.clone().with_dot(true)),
            r"(?:(?:(?!(?:^|[\\/])\.{1,2}(?:[\\/]|$)).)*?)"
        );
        assert_eq!(
            f(&base.clone().with_capture(true)),
            r"((?:(?!(?:^|[\\/])\.).)*?)"
        );
        assert_eq!(
            f(&base.clone().with_bash(true)),
            r"(?:(?:(?!(?:^|[\\/])\.).)*?)"
        );
    }
}
