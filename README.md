# pmx — Rust port of picomatch v4.0.5

A bug-for-bug faithful Rust port of [picomatch](https://github.com/micromatch/picomatch) v4.0.5, the JavaScript glob-pattern-to-regex compiler.

## Architecture

```
crates/pmx-core   Pure parser + scanner, #![forbid(unsafe_code)]
                  Deps: thiserror, regress (optional, for range validation)
crates/pmx-exec   regress-backed ECMAScript regex execution (D-027)
crates/pmx-cli    pmx binary + shared op-dispatch (JSONL protocol)
crates/pmx-node   napi shim (test adapter only, documented unsafe — D-028)
```

**Single dispatch, two transports:** `pmx-cli/src/lib.rs` `dispatch()` is the one source
of truth for ops; `pmx --serve` (CLI) and the napi `bridge_op` (addon) both call it.

## Escape Hatch Audit

| Crate | `unsafe` | `unwrap()`/`expect()` | `panic!()` | `todo!()` |
|---|---|---|---|---|
| pmx-core | 0 (`#![forbid(unsafe_code)]`) | 0 in `src/` | 0 | 0 |
| pmx-exec | 0 (`#![forbid(unsafe_code)]`) | 0 in `src/` | 0 | 0 |
| pmx-cli | 0 (`#![forbid(unsafe_code)]`) | 0 in `src/` | 0 | 0 |
| pmx-node | napi-generated (D-028) | 0 | 0 | 0 |

## Performance

Scanner performance was measured via a 20-scenario benchmark suite:
- **Rust faster**: 13 scenarios
- **JS faster**: 5 scenarios
- **Inconclusive**: 2 scenarios

No universal speedup. See `BENCHMARKS.md` for full evidence.

Parser performance is not yet benchmarked (tracked as a known gap).

## Known Divergences

| # | Pattern | Behavior | Root Cause |
|---|---|---|---|
| D-027 | Astral input + bracket class | 114/148,488 cases (0.077%) | `regress` surrogate-pair coalescing |

See `bug-reports.md` for upstream bugs ported bug-for-bug.

## Build & Test

```bash
# Full gate
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# Adapter parity (requires Node.js)
node fixtures/run-integrated.js

# Benchmark canaries
node benchmarks/bench-canaries.js
```

## Documentation

- [DECISIONS.md](DECISIONS.md) — Architecture & parity decisions
- [AGENTS.md](AGENTS.md) — Workspace conventions and institutional memory
- [bug-reports.md](bug-reports.md) — Upstream bugs, reproduced and ported
- [PARSE_CHUNKS.md](PARSE_CHUNKS.md) — Parser chunk decomposition (C0–C9)
- [BENCHMARKS.md](BENCHMARKS.md) — Scanner benchmark methodology and results
