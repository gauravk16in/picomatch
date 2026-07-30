# Build, Test, and CI Contract

Status: contract defined (spec §17, D-012 Proposed); implementation Phases 2, 11.

## One-command contract (judges)

```bash
# prerequisite, one time: install Rust via https://rustup.rs (rust-toolchain.toml pins 1.95.0)
cargo build --release        # builds library + CLI (the runnable artifact)
cargo test                   # unit + integration + doc tests
node test/adapter/run-mocha.js   # original suite (unmodified) against the artifact
```

Docker alternative (event anatomy): `docker build -t picomatch-port . && docker run picomatch-port` — image runs build + full test + adapter parity and prints the parity summary.

## Workspace layout (Phase 2)

```
Cargo.toml            # workspace root
rust-toolchain.toml   # channel = "1.95.0"
crates/picomatch/     # library (#![forbid(unsafe_code)])
crates/picomatch-cli/ # differential/adapter CLI (JSON protocol)
Dockerfile
```

## CI matrix (Phase 11; mirrors upstream spirit)

| Job | OS | Steps |
|---|---|---|
| fmt/clippy | ubuntu | `cargo fmt --check`, `cargo clippy --workspace -- -D warnings` |
| test | ubuntu, windows, macos | `cargo test --workspace --release` |
| adapter-parity | ubuntu, windows, macos | node LTS + `node test/adapter/run-mocha.js --report artifacts/parity-report.json` (artifact upload) |
| corpus-replay | all three | CLI replay of tests/corpus/v1 (both platform modes) |
| proptest-short | ubuntu | short-case-count property run |
| fuzz-smoke | ubuntu (nightly) | `cargo fuzz run fuzz_parse -- -max_total_time=60` smoke; full 60s+ bonus run is a manual/scheduled job publishing fuzz/log.txt |
| audit | ubuntu | `cargo audit`, license grep, `grep -rn "unsafe" crates/*/src` (expect 0) |

Pins: actions/checkout + dtolnay/rust-toolchain (or actions-rust-lang) pinned by SHA, matching upstream's pin discipline `(verified: upstream test.yml pins v6 actions by SHA)`.

## Determinism and caching

- Cargo.lock committed; `cargo fetch --locked` in CI; `CARGO_TERM_COLOR=never` for log diffing.
- Node side: `npm install` (no lockfile upstream — mirrors upstream CI); oracle pinned by git commit, not by npm version.

## Local dev prerequisites

- Windows/macOS/Linux: rustup + Node ≥ 18 (oracle/adapter only). cargo-fuzz runs only on Linux (Rust Fuzz Book) — use CI or WSL.
- Verify everything: `cargo fmt --check && cargo clippy -- -D warnings && cargo test && node test/adapter/run-mocha.js`.
