#![no_main]

use libfuzzer_sys::fuzz_target;
use pmx_core::options::Options;
use pmx_core::parse;

/// Grammar-differential fuzzer for pmx-core parse.
///
/// This fuzzer generates arbitrary patterns and parses them through pmx-core,
/// checking for panics/crashes. For full differential testing against the JS
/// oracle, the companion script `fuzz/differential.js` should be used to
/// compare outputs.
///
/// Run: `cargo +nightly fuzz run parse_differential -- -max_len=256`
///
/// Seeded corpus entries should cover:
/// - Extglob combinations: `!()`, `@()`, `*()`, `+()`, `?()`
/// - Brace ranges: `{a..z}`, `{a,b}`, `{a@(bc)}`
/// - Negation with parens: `!!(a)`, `!!(!a)`
/// - Dotted rests: `!(*a).b.c`, `!(*a).`
/// - Globstars: `**`, `/**/`, `!(a|**)`
/// - Edge cases: `{abc`, `a))b`, `{a-..z}`
fuzz_target!(|data: &[u8]| {
    // Interpret fuzz input as a UTF-8 pattern (skip invalid)
    let Ok(pattern) = std::str::from_utf8(data) else {
        return;
    };

    // Skip excessively long patterns (matches maxLength default)
    if pattern.len() > 65536 {
        return;
    }

    // Parse with default options (fastpaths enabled)
    let _ = parse::parse(pattern, &Options::default());

    // Parse with fastpaths disabled (slow path)
    let opts_slow = Options::default().with_fastpaths(false);
    let _ = parse::parse(pattern, &opts_slow);
});
