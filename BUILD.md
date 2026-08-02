# BUILD.md — pmx Rust port

One workspace, one command set. Everything here runs from the workspace root (this directory).

## Layout

- `crates/pmx-core/` — the compiler (pattern → JS-RegExp source + state). Pure Rust, `#![forbid(unsafe_code)]`.
- `crates/pmx-exec/` — regex execution of those sources under ECMAScript semantics (skeleton; wires in ADAPTER_PLAN **A3**).
- `crates/pmx-cli/` — `pmx` binary; `--serve` subprocess adapter for the JS parity harness (skeleton; wires in **A1**).
- `fixtures/` — JS-side oracle: `extract-cN.js` regenerates `cN_oracle.json` from the reference, `verify-cN.js` proves it deterministic, `attack-c*.js` adversarially differentiates.
- `tests/` — acceptance runners consuming the corpora (`crates/pmx-core/tests/` for now).

## Reference checkout

All fixture tooling expects the original picomatch at **`../Main`** (usually a symlink to the pinned `../picomatch` v4.0.5 checkout). Create it once: `ln -s picomatch ../Main`. The reference is read-only for us; don't edit it.

## Build

```
cargo build --workspace            # debug
cargo build --workspace --release  # optimized
```

## Gates (run after every change; paste real output)

```
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Corpus lifecycle (per chunk N)

1. `node fixtures/extract-cN.js` — regenerate `fixtures/cN_oracle.json` from the reference.
2. `node fixtures/verify-cN.js` — prove the corpus is deterministic.
3. `cargo test` — the acceptance runner (`crates/pmx-core/tests/c0_foundation.rs`) loads all `cN_oracle.json` files; rows activate when `chunk <= current`.
4. `node fixtures/attack-cN.js` — adversarial differential vs the reference (where authored).

Rules: never expected-fail — a row needing an unbuilt branch gets re-chunked (`chunk: N`) and stays inactive; extract and verify are two mandatory steps, never skipped.

## Current state / pending

- **C0–C2** frozen and reviewed; **C3 PARKED** (implemented + gates green; review/freeze pending — status in `ADAPTER_PLAN.md`).
- The CLI/exec crates are compiling skeletons by design. `pmx --serve` lands in **A1**; boolean `isMatch` parity begins at **A3**.
