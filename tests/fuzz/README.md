# tests/fuzz/ — Fuzz Seed Corpus & References

Seed inputs for the cargo-fuzz targets (`fuzz_scan`, `fuzz_parse`, `fuzz_match`): upstream suite patterns, malicious cases, ReDoS PoCs, unicode/quote/escape packs. The executable targets live in the workspace `fuzz/` member (Rust Fuzz Book layout) from Phase 9 and run on Linux CI (cargo-fuzz needs nightly + Unix). See `docs/fuzzing.md`.
