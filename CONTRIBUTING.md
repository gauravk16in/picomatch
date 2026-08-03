# Contributing to pmx

Thank you for considering contributing to `pmx`! This document covers everything you need to get started.

## Prerequisites

| Tool | Version | Required? | Purpose |
|---|---|---|---|
| **Rust** | 1.97.1+ (pinned in `rust-toolchain.toml`) | ✅ Yes | Build and test the port |
| **Node.js** | 22+ | Optional | Run differential parity tests and benchmarks |
| **Original picomatch** | v4.0.5 at `../Main` (symlink) | Optional | Required only for oracle regeneration and differential harnesses |

## Quick Start

```bash
# Clone
git clone https://github.com/gauravk16in/picomatch.git
cd picomatch
git checkout rust-port

# Build
cargo build --workspace

# Verify (format + lint + test)
make verify
```

## Development Workflow

### Running Gates

Every change must pass these gates before committing:

```bash
cargo fmt --check                                      # formatting
cargo clippy --workspace --all-targets -- -D warnings  # lints (zero warnings)
cargo test --workspace                                 # all tests
```

Or use the Makefile shortcut:

```bash
make verify
```

### Differential Parity Testing (Optional)

If you have Node.js and the reference picomatch checkout at `../Main`:

```bash
# Run the full 16-step integrated differential harness
node fixtures/run-integrated.js

# Run adversarial attack generators
node fixtures/attack-scan.js
node fixtures/attack-integrated.js

# Run 79 benchmark canary mutations (build scanbench first)
cargo build --release --example scanbench
node benchmarks/bench-canaries.js
```

### Corpus Lifecycle

Oracle corpora (`fixtures/*_oracle.json`) are extracted from the JS reference:

```bash
# Regenerate + verify (always both steps, never skip verify)
node fixtures/extract-c0.js && node fixtures/verify-c0.js
```

Rules:
- Never use expected-fail markers — if a row needs an unbuilt feature, re-chunk it with `chunk: N`.
- Extractors and verifiers are two mandatory steps, never skipped.

## Project Structure

```
pmx/
├── crates/
│   ├── pmx-core/     # Pure-Rust compiler core (parse, scan, fastpaths)
│   ├── pmx-exec/     # ECMAScript regex execution via regress
│   ├── pmx-cli/      # pmx binary + JSONL IPC dispatch
│   └── pmx-node/     # NAPI-rs Node.js native addon
├── docs/              # Design docs, decisions, benchmarks, audits
├── fixtures/          # Oracle corpora, extractors, verifiers, attack harnesses
├── benchmarks/        # Process-pair benchmark runner and results
├── fuzz/              # cargo-fuzz differential harness
└── tests/original/    # Byte-frozen copy of the original JS test suite
```

## Pull Request Process

1. **Branch from `rust-port`** — never `main`.
2. **Pass all gates** — `make verify` must be green.
3. **Include gate output** — paste real `cargo fmt/clippy/test` output in the PR body.
4. **One logical change per PR** — keep PRs focused and reviewable.

## Code Conventions

- `#![forbid(unsafe_code)]` — enforced in `pmx-core`, `pmx-exec`, and `pmx-cli`. `pmx-node` is a NAPI-rs test
  adapter; its foreign-function boundary uses macro-generated NAPI code. All unsafe is confined there
  and documented in `docs/decisions.md` (D-019).
- No `unwrap()`, `expect()`, `panic!()`, `todo!()`, or narrowing `as` casts.
- Index arithmetic goes through `try_into().ok()`.
- Emitted text is `Vec<u16>` (UTF-16 units), not `String`. See `docs/decisions.md` D-02.
- Bug-for-bug parity with JS — never "fix" upstream behavior. Record deviations in `docs/decisions.md`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
