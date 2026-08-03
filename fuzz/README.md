# Fuzz Harnesses — pmx

Grammar-differential fuzzer for the pmx-core parser, per rulebook §7.

## Setup

```bash
# Install cargo-fuzz (requires nightly)
cargo install cargo-fuzz
```

## Running

```bash
# Quick smoke test (60 seconds)
cd /path/to/picomatch-rust
cargo +nightly fuzz run parse_differential -- -max_len=256 -max_total_time=60

# Extended run (recommended before merge)
cargo +nightly fuzz run parse_differential -- -max_len=512 -max_total_time=3600
```

## Seed Corpus

Add seed patterns to `fuzz/corpus/parse_differential/` to guide the fuzzer
toward interesting pattern classes:

```bash
mkdir -p fuzz/corpus/parse_differential
echo -n '!!(a)' > fuzz/corpus/parse_differential/negate_paren
echo -n '!!(!a)' > fuzz/corpus/parse_differential/negate_extglob
echo -n 'x!(*a).b.c' > fuzz/corpus/parse_differential/dotted_rest
echo -n '{a@(bc)}' > fuzz/corpus/parse_differential/brace_extglob
echo -n '{a-..z}' > fuzz/corpus/parse_differential/range_edge
echo -n 'a))b' > fuzz/corpus/parse_differential/stray_paren
echo -n '{abc' > fuzz/corpus/parse_differential/unclosed_brace
echo -n '!(a|**)' > fuzz/corpus/parse_differential/extglob_globstar
```

## Divergences

When a crash or divergence is found, minimize it and add to `fuzz/divergences/`:

```bash
cargo +nightly fuzz tmin parse_differential fuzz/artifacts/parse_differential/<crash_file>
```

## Current Status

Scaffolding created 2026-08-03 as part of review remediation.
Full differential mode (comparing against JS oracle via adapter bridge) is planned
as a follow-up.
