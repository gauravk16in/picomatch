# Benchmark Suite

Reproducible performance benchmark for the Rust scanner port vs the JavaScript reference.

## Quick Start

```bash
# Run full benchmark (builds Rust release binary, runs JS 3×, Rust 1×)
node benchmarks/run-benchmarks.js

# Run pilot (faster, reduced settings)
node benchmarks/run-benchmarks.js --pilot

# Run benchmark self-tests
node benchmarks/bench-canaries.js
```

## Architecture

Three layers, kept separate:

1. **Layer A (core):** In-process benchmark calling the real scanner function directly
   - Rust: `crates/pmx-core/examples/scanbench.rs` → calls `scan_utf16()` with `std::time::Instant`
   - JS: `benchmarks/benchmark-core.js` → calls `require('Main/lib/scan.js')` with `process.hrtime.bigint()`
   - No subprocess, no JSON, no file I/O in timed regions
   - Output consumed via FNV-1a checksum to prevent dead-code elimination

2. **Layer B (orchestrator):** `benchmarks/run-benchmarks.js`
   - Builds Rust release binary
   - Runs both harnesses under the same scenario manifest
   - Validates scenario ID parity and checksum structure
   - Computes statistics (median, MAD, bootstrap 95% CI)
   - Writes raw + summary JSON to `benchmarks/results/`

3. **Layer C (bridge overhead):** Cold process startup + one JSONL probe request
   - Measures test-only transport overhead, not core performance
   - Labeled separately in all reports

## Files

| File | Purpose |
|---|---|
| `scenarios.json` | 20-scenario benchmark manifest (stable IDs) |
| `run-benchmarks.js` | Cross-language orchestrator + statistics |
| `benchmark-core.js` | JavaScript in-process benchmark harness |
| `bench-canaries.js` | 14 benchmark self-test canaries |
| `results/` | Raw and summary JSON output |

## Scenarios

20 scenarios covering: plain paths, stars, question marks, globstars, braces, brackets, extglobs, negation, escaped metacharacters, parts/tokens assembly, noext/nonegate/noparen options, BMP and astral Unicode, and mixed realistic patterns.

See `scenarios.json` for the full manifest and `BENCHMARKS.md` for results.

## Options

```
--warmup-iters <N>     warm-up iterations (default 5000)
--samples <N>          timed samples (default 50)
--iters-per-sample <N> iterations per timed sample (default 2000)
--runs <N>             independent JS process executions (default 3)
--pilot                reduced settings for quick validation
--no-bridge            skip bridge overhead benchmark
--results-dir <path>   output directory (default: results/)
```

## Reproducibility

All results are from raw measurements. The summary JSON is recomputable from the raw JSON. See `BENCHMARKS.md` for full methodology, environment, and limitations.