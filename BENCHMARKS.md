# Picomatch Rust Port — Scanner Benchmark Report

## Scope and Non-Scope

### In Scope

- **Surface benchmarked:** `pmx_core::scan_utf16` (Rust) vs `Main/lib/scan.js` (JavaScript reference)
- **Behaviorally equivalent:** Both implementations produce identical scanner state across all 20 scenarios (verified by checksum parity and the existing 12,723-comparison differential suite)
- **What is measured:** In-process core scanner computation time per call, excluding process startup, JSON transport, file I/O, and corpus generation

### Non-Scope

- **Parser/matcher/compiler:** Not ported to Rust (C3+ partial, other teammates' work) — not benchmarkable
- **Full picomatch public API (`picomatch()`, `isMatch()`, etc.):** No team-approved adapter exists — not benchmarkable
- **Cross-platform performance:** Only Windows 11 was tested; results are not claimed for POSIX/Linux/macOS
- **Memory consumption:** Not measured; no memory improvement is claimed
- **Production API performance:** The bridge/process benchmark is labeled as test transport overhead, not production performance

## Exact Commits

| Ref | SHA |
|---|---|
| Base (`origin/rust-port`) | `e115174120bb9460157c74679cfca6282c4dae4f` |
| PR #4 merge commit | `e115174120bb9460157c74679cfca6282c4dae4f` |

## Methodology

### Architecture

Three layers, kept separate:

1. **Layer A — In-process core benchmark:** Rust calls `scan_utf16(&[u16], &ScanOptions)` directly in a release binary. JavaScript calls `require('Main/lib/scan.js')` directly. No subprocess, no JSON, no file I/O in timed regions. Both use the same frozen scenario manifest. Outputs are consumed into a deterministic FNV-1a checksum accumulator to prevent dead-code elimination.

2. **Layer B — Cross-language orchestrator:** A Node.js script (`run-benchmarks.js`) builds the Rust release binary, runs both harnesses, validates scenario ID parity and checksum structure, computes statistics, and writes raw + summary JSON. JS runs in 3 independent processes (separate V8 instances) to avoid JIT cross-contamination. Rust runs once (no JIT).

3. **Layer C — Bridge overhead benchmark:** Measures cold process startup + one JSONL probe request via the test-only `scanprobe` subprocess, compared against the in-process JS call. Labeled as transport overhead, not core performance.

### Timer Selection

| Runtime | Timer | Rationale |
|---|---|---|
| Rust | `std::time::Instant::now()` | Monotonic, nanosecond resolution, no overhead |
| Node.js | `process.hrtime.bigint()` | Monotonic, nanosecond resolution, recommended by Node.js benchmark suite |

### Warm-Up, Samples, and Repetition

| Parameter | Value | Rationale |
|---|---|---|
| Warm-up iterations (per scenario) | 5,000 | Exceeds V8 JIT warm-up threshold (~100+); ensures TurboFan optimization |
| Timed samples (per scenario) | 50 | Matches Criterion.rs default range; supports bootstrap CI |
| Iterations per timed sample | 2,000 | Each sample runs ~100ms+ to dwarf timer overhead |
| JS process runs | 3 | Independent V8 instances; per Node.js benchmark suite guidance |
| Rust runs | 1 | No JIT; release build is deterministic |

### Output Consumption

Both implementations fold every observable field of `ScanState` into a FNV-1a hash accumulator (`checksum`). The checksum is accumulated across all iterations and verified to be non-zero. This prevents the Rust optimizer and V8 JIT from eliminating the scanner call as dead code.

### Statistical Analysis

For each scenario, per-iteration times are computed as `sample_total_ns / iters_per_sample`. Then:

- **Median** (primary): robust to outliers, as recommended by Criterion.rs and benchmarking literature
- **MAD** (Median Absolute Deviation): robust dispersion measure
- **Bootstrap 95% CI** for the median: 1,000 resamples, percentile method
- **Mean, Std Dev, Min, Max, P95**: supplemental values
- **CV** (coefficient of variation): MAD/median, noise indicator

### Research Sources

- Criterion.rs official documentation (warm-up, sampling, outlier classification, bootstrap CIs)
- Rust Performance Book (benchmarking guidance)
- Node.js official documentation (`process.hrtime.bigint()`, `performance.now()`)
- Node.js benchmark suite (`doc/contributing/writing-and-running-benchmarks.md`)
- Leys et al. (2013) — MAD-based outlier detection
- V8 JIT optimization and dead-code elimination guidance

## Environment

| Field | Value |
|---|---|
| Date/Time | 2026-08-02T15:40:25Z |
| Timezone | Asia/Calcutta (UTC+5:30) |
| OS | Windows 11 (win32, 10.0.26200) |
| CPU | 12th Gen Intel(R) Core(TM) i7-12650H, 16 logical cores |
| RAM | 16.83 GB total, 1.69 GB free |
| Node.js | v24.13.0 (V8 13.6.233.17-node.37) |
| Rust | rustc 1.97.1 (8bab26f4f 2026-07-14) |
| Cargo | cargo 1.97.1 |
| Git | 2.53.0.windows.3 |
| Build profile | `--release` |
| Base SHA | `e115174120bb9460157c74679cfca6282c4dae4f` |

**Caveats:** CPU frequency scaling and background processes were not controlled. Antivirus may be active. Results are environment-specific and should not be generalized to other machines or OSes.

## Workload Table

20 scenarios derived from real Picomatch patterns, test fixtures, and scanner options:

| ID | Label | Input | Options | Orientation |
|---|---|---|---|---|
| S001 | plain-path-short | `foo/bar/baz.js` | `{}` | latency |
| S002 | plain-path-long | `src/components/deep/nested/path/to/module/file.tsx` | `{}` | latency |
| S003 | star-glob | `foo/bar/*.js` | `{}` | latency |
| S004 | question-mark | `foo/ba?.js` | `{}` | latency |
| S005 | globstar-deep | `./src/**/deep/**/*.js` | `{scanToEnd:true}` | throughput |
| S006 | braces | `foo/{a,b,c}/*.js` | `{scanToEnd:true}` | throughput |
| S007 | brackets | `foo/[abc]/*.js` | `{scanToEnd:true}` | throughput |
| S008 | extglob | `foo/+(bar\|baz)/*.js` | `{scanToEnd:true}` | throughput |
| S009 | negation | `!foo/bar/*.js` | `{}` | latency |
| S010 | negated-extglob | `!(foo)/bar/*.js` | `{scanToEnd:true}` | throughput |
| S011 | escaped-metachar | `foo/\[a\]/*.js` | `{unescape:true}` | latency |
| S012 | parts-basic | `foo/bar/baz/*.js` | `{parts:true}` | throughput |
| S013 | tokens-basic | `foo/bar/**/*.js` | `{tokens:true}` | throughput |
| S014 | noext-globstar | `./src/**/*.js` | `{noext:true,scanToEnd:true}` | throughput |
| S015 | nonegate | `!foo/bar/*.js` | `{nonegate:true}` | latency |
| S016 | noparen | `foo/(bar\|baz)/*.js` | `{noparen:true}` | latency |
| S017 | bmp-unicode | `フォルダ/**/*.js` | `{parts:true}` | throughput |
| S018 | astral-unicode | `😀/*.js` | `{parts:true}` | latency |
| S019 | mixed-realistic | `./src/components/{Footer,Header}/**/*.{js,ts,jsx,tsx}` | `{scanToEnd:true}` | throughput |
| S020 | complex-parts-tokens | `./foo/@(bar)/**/*.js` | `{tokens:true}` | throughput |

**Scenario count:** 20 (10 latency-oriented, 10 throughput-oriented)

## Core Results (Layer A)

| ID | Label | JS median (ns/iter) | Rust median (ns/iter) | Rust speedup | CI overlap | Direction |
|---|---|---:|---:|---:|---|---|
| S001 | plain-path-short | 1,569 | 357 | 4.39x | no | Rust faster |
| S002 | plain-path-long | 4,499 | 645 | 6.98x | no | Rust faster |
| S003 | star-glob | 1,332 | 420 | 3.17x | no | Rust faster |
| S004 | question-mark | 1,155 | 389 | 2.97x | no | Rust faster |
| S005 | globstar-deep | 2,150 | 673 | 3.20x | no | Rust faster |
| S006 | braces | 1,665 | 484 | 3.44x | no | Rust faster |
| S007 | brackets | 1,488 | 457 | 3.26x | no | Rust faster |
| S008 | extglob | 1,938 | 484 | 4.01x | no | Rust faster |
| S009 | negation | 1,455 | 480 | 3.03x | no | Rust faster |
| S010 | negated-extglob | 1,632 | 230 | 7.10x | no | Rust faster |
| S011 | escaped-metachar | 1,789 | 742 | 2.41x | no | Rust faster |
| S012 | parts-basic | 2,487 | 971 | 2.56x | no | Rust faster |
| S013 | tokens-basic | 3,301 | 1,447 | 2.28x | no | Rust faster |
| S014 | noext-globstar | 1,653 | 466 | 3.55x | no | Rust faster |
| S015 | nonegate | 1,526 | 438 | 3.49x | no | Rust faster |
| S016 | noparen | 2,022 | 476 | 4.25x | no | Rust faster |
| S017 | bmp-unicode | 2,107 | 1,009 | 2.09x | no | Rust faster |
| S018 | astral-unicode | 1,394 | 695 | 2.01x | no | Rust faster |
| S019 | mixed-realistic | 4,954 | 823 | 6.02x | no | Rust faster |
| S020 | complex-parts-tokens | 4,076 | 1,080 | 3.78x | no | Rust faster |

**Summary:**
- Rust is faster in all 20 scenarios
- Speedup range: 2.01x-7.10x (median: 3.32x)
- No 95% confidence intervals overlap in any scenario — all differences are statistically supported on this machine
- Rust CV (noise) range: 0.7%-7.8%; JS CV range: 3.0%-6.7%

## Bridge Overhead Results (Layer C)

| ID | Label | JS in-process (ns) | Cold process (ns) | Overhead (ns) | Ratio |
|---|---|---:|---:|---:|---:|
| S001 | plain-path-short | 251,900 | 10,386,500 | 10,134,600 | 41x |
| S002 | plain-path-long | 34,500 | 6,073,800 | 6,039,300 | 176x |
| S003 | star-glob | 131,600 | 5,895,500 | 5,763,900 | 45x |
| S004 | question-mark | 8,500 | 6,072,800 | 6,064,300 | 714x |
| S005 | globstar-deep | 25,300 | 6,224,900 | 6,199,600 | 246x |

**Interpretation:** The test-only JSONL/process bridge adds 5.8-10.1 ms per cold invocation, dominated by Rust process startup (~6 ms baseline). This is 41x-714x the in-process JS call time. The bridge is a testing transport, not a production API — its overhead must not be presented as core scanner performance.

## Statistics and Uncertainty

All results are from raw measurements with no post-hoc filtering. The pilot run (reduced settings: 1,000 warm-up, 10 samples, 500 iters/sample) confirmed the infrastructure works and produced consistent direction (Rust faster in all 20 scenarios). The full run (5,000 warm-up, 50 samples, 2,000 iters/sample, 3 JS process runs) confirms statistical significance with non-overlapping bootstrap 95% CIs.

**Noise indicators:**
- Rust CV (MAD/median): 0.7%-7.8% — low noise
- JS CV (MAD/median): 3.0%-6.7% — low noise
- No scenario has CI overlap — all differences are supported

## Limitations

1. **Windows-only:** Results are from Windows 11; POSIX/Linux performance is not claimed
2. **Single machine:** Results are environment-specific; CPU thermal/power state was not controlled
3. **Scanner-only:** Only the `scan()` API is benchmarked; the full picomatch public API (parser, matcher, compiler) is not yet ported to Rust
4. **No memory measurement:** Memory consumption was not measured; no memory improvement is claimed
5. **No end-to-end adapter:** No production adapter exists; bridge overhead is test-only transport
6. **Rust single run:** Rust was measured once (no JIT); JS was measured in 3 independent processes. This is justified because Rust release builds are deterministic, but a reader should note the asymmetry

## Exact Reproduction Commands

```bash
# 1. Build and run benchmark (from Rust/ directory)
node benchmarks/run-benchmarks.js

# 2. Run pilot (reduced settings, faster)
node benchmarks/run-benchmarks.js --pilot

# 3. Run benchmark canaries
node benchmarks/bench-canaries.js

# 4. Re-verify correctness before benchmarking
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
node fixtures/run-integrated.js
cd ../Main && npm test
```

## Raw Data Paths and Checksums

| File | SHA-256 |
|---|---|
| `benchmarks/results/2026-08-02T15-40-41-win32-raw.json` | `054bb5d64c5bd743eb6209108f2e13849783c6188842ce84462a0b456555cc56` |
| `benchmarks/results/2026-08-02T15-40-41-win32-summary.json` | `3a209d1411da98c78a3a3a928987cd8f244bb9a7a0e0b64c495398d5c5b9eb40` |

All reported table values are computed from the raw JSON. The summary is recomputable from the raw data.

## No Optimization Performed

No production code was modified for performance optimization in this chunk. The benchmark results reflect the scanner as implemented in Chunk 2 (PR #3) with the `prevIndex=0` bug fix from Chunk 3 (PR #4). No speculative optimization was justified or attempted — a truthful benchmark report is successful Chunk 4 work.
