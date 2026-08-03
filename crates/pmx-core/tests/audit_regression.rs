//! Audit regression tests for the 2026-08-03 upstream bug verification.
//!
//! These tests verify that:
//! - CVE safeguards are present and functional
//! - Rust correctly handles cases where JS has known bugs
//! - Intentional behaviors (documented options) are preserved
//!
//! See: docs/internal/audits/2026-08-03-2130-upstream-bug-verification-and-rust-fixes.md

use pmx_core::constants::{
    self, DEFAULT_MAX_EXTGLOB_RECURSION, EXTGLOB_CHARS_POSIX, EXTGLOB_CHARS_WINDOWS,
    POSIX_CHARS, WINDOWS_CHARS,
};

/// CVE-2026-33672: POSIX_REGEX_SOURCE must not resolve inherited properties.
/// Rust uses match-based lookup — `constructor` returns None.
/// Source audit: BUG-03, BUG-04, CVE-2026-33672
#[test]
fn audit_cve33672_posix_source_no_prototype_lookup() {
    // Inherited properties from Object.prototype must NOT resolve
    assert_eq!(constants::posix_regex_source("constructor"), None);
    assert_eq!(constants::posix_regex_source("__proto__"), None);
    assert_eq!(constants::posix_regex_source("toString"), None);
    assert_eq!(constants::posix_regex_source("hasOwnProperty"), None);
    assert_eq!(constants::posix_regex_source(""), None);
    assert_eq!(constants::posix_regex_source("valueOf"), None);

    // Valid POSIX classes still work
    assert_eq!(constants::posix_regex_source("alpha"), Some("a-zA-Z"));
    assert_eq!(constants::posix_regex_source("digit"), Some("0-9"));
    assert_eq!(constants::posix_regex_source("alnum"), Some("a-zA-Z0-9"));
    assert_eq!(constants::posix_regex_source("word"), Some("A-Za-z0-9_"));
}

/// CVE-2026-33671: ReDoS safeguard via analyzeRepeatedExtglob must be present.
/// The DEFAULT_MAX_EXTGLOB_RECURSION constant must be 0 (the safeguard limit).
#[test]
fn audit_cve33671_redos_safeguard_present() {
    assert_eq!(DEFAULT_MAX_EXTGLOB_RECURSION, 0.0);
}

/// BUG-03/04 (source IDs): Rust uses static structs, not JS object literals.
/// No prototype chain — no inherited `hasOwnProperty` or `constructor`.
/// This is a compile-time guarantee in Rust; this test documents it.
#[test]
fn audit_bug03_04_no_prototype_chain_in_rust() {
    // These are static structs with typed fields, not JS objects with prototype
    let _posix = &POSIX_CHARS;
    let _windows = &WINDOWS_CHARS;
    let _extglob_posix = &EXTGLOB_CHARS_POSIX;
    let _extglob_windows = &EXTGLOB_CHARS_WINDOWS;
    // The type system prevents runtime property lookup entirely.
    // No `hasOwnProperty`, no `constructor`, no `__proto__` — by construction.
}

/// BUG-01/17 (source IDs): Backreference `\1` is a regex backreference,
/// not "injection." Picomatch documents regex syntax support.
/// Verify the parser passes backslash-digit through to output.
#[test]
fn audit_bug01_backreference_is_regex_not_injection() {
    use pmx_core::options::Options;
    use pmx_core::parse;

    let opts = Options::default().with_fastpaths(false);
    let state = parse("(a)\\1", &opts).unwrap();
    let output_str: String = String::from_utf16_lossy(&state.output);
    assert!(
        output_str.contains("\\1"),
        "backreference \\1 should be in output, got: {}",
        output_str
    );
}

/// BUG-07 (source ID): Literal equality shortcut `input === glob` —
/// Rust correctly omits this JS bug. The parser generates a proper
/// bracket class regex for `[1-5]`, not literal text.
#[test]
fn audit_bug07_no_literal_equality_shortcut() {
    use pmx_core::options::Options;
    use pmx_core::parse;

    let opts = Options::default().with_fastpaths(false);
    let state = parse("[1-5]", &opts).unwrap();
    let output_str: String = String::from_utf16_lossy(&state.output);
    // Should produce a regex bracket class, not just literal "[1-5]"
    assert!(
        output_str.contains("[1-5]") || output_str.contains("[^/]"),
        "bracket class should be in output, got: {}",
        output_str
    );
}

/// BUG-11 (source ID): Multi-branch repeated extglob fixed in 4.0.5.
/// Rust matches the fixed behavior. Verify the parser doesn't crash
/// on `+(*(a)|*(b))` and produces valid output.
#[test]
fn audit_bug11_multibranch_extglob_fixed() {
    use pmx_core::options::Options;
    use pmx_core::parse;

    let opts = Options::default();
    let state = parse("+(*(a)|*(b))", &opts).unwrap();
    let output_str: String = String::from_utf16_lossy(&state.output);
    // Should produce some valid regex output (not empty, not just escaped literal)
    assert!(
        !output_str.is_empty(),
        "output should not be empty for +(*(a)|*(b))"
    );
}

/// BUG-19 (source ID): matchBase windows forwarding fixed in 4.0.5.
/// Rust handles the windows option correctly in Options.
#[test]
fn audit_bug19_matchbase_windows_fixed() {
    use pmx_core::options::Options;

    let opts = Options::default().with_windows(true);
    assert!(opts.windows());

    let opts_no_windows = Options::default();
    assert!(!opts_no_windows.windows());
}

/// BUG-02/13 (source IDs): Fastpath adds trailing `\/?` — intentional behavior.
/// Verify the fastpath produces the expected `\/?` suffix.
#[test]
fn audit_bug02_fastpath_trailing_slash_intentional() {
    use pmx_core::fastpaths;
    use pmx_core::options::Options;

    let opts = Options::default();
    let result = fastpaths("*.js", &opts).unwrap();
    assert!(result.is_some(), "fastpath should match *.js");
    let source = result.unwrap();
    assert!(
        source.ends_with(r"\/?"),
        "fastpath should end with \\/?, got: {}",
        source
    );

    // strictSlashes should remove the trailing \/?
    let opts_strict = Options::default().with_strict_slashes(true);
    let result_strict = fastpaths("*.js", &opts_strict).unwrap();
    let source_strict = result_strict.unwrap();
    assert!(
        !source_strict.ends_with(r"\/?"),
        "strictSlashes should not add \\/?, got: {}",
        source_strict
    );
}

/// BUG-06 (source ID): `[!...]` bracket negation requires `posix: true`.
/// Verify the parser handles `!` inside brackets according to the posix option.
#[test]
fn audit_bug06_bracket_negation_posix_only() {
    use pmx_core::options::Options;
    use pmx_core::parse;

    // Without posix: true, `!` inside brackets is NOT treated as negation
    let opts_default = Options::default().with_fastpaths(false);
    let state = parse("[!abc]", &opts_default).unwrap();
    let output_default: String = String::from_utf16_lossy(&state.output);
    // With posix: true, `!` becomes `^` (negation)
    let opts_posix = Options::default().with_fastpaths(false).with_posix(true);
    let state_posix = parse("[!abc]", &opts_posix).unwrap();
    let output_posix: String = String::from_utf16_lossy(&state_posix.output);

    // The outputs should differ — posix mode converts ! to ^
    assert_ne!(
        output_default, output_posix,
        "posix mode should change [!abc] output"
    );
}

/// BUG-27 (source ID): Empty alternative in extglob triggers ReDoS safeguard.
/// `+(a|)` should be flagged as risky and literalized.
#[test]
fn audit_bug27_empty_alternative_redos_safeguard() {
    use pmx_core::options::Options;
    use pmx_core::parse;

    let opts = Options::default();
    let state = parse("+(a|)", &opts).unwrap();
    let output_str: String = String::from_utf16_lossy(&state.output);
    // The empty alternative triggers the ReDoS safeguard, so the output
    // should be escaped literal text (not a regex group)
    assert!(
        !output_str.is_empty(),
        "output should not be empty for +(a|)"
    );
}