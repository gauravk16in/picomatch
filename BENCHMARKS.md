# Picomatch Rust Port — Scanner Benchmark Report

## Benchmark Definition

**Operation measured:** One call to `scan(input, options)` plus canonical result consumption (u32 FNV-1a digest over scanner output fields). This is honestly named "scanner plus result consumption" — not pure scanner time. The digest prevents dead-code elimination in both runtimes.

**What is NOT timed:** Process startup, JSON transport, file I/O, semantic parity checks, fixture loading, statistics computation, artifact hashing.

## Exact Commits

| Ref | SHA |
|---|---|
| Base (`origin/rust-port`) | `b19e762417ad75c4f11cf5ba3fa94abe33e9d950` |
| Harness commit (H) | `cc8db2cefb5d9e1b17f9e9a87f87136aa11b7a90` |
| Evidence commit (E) | (this commit) |

## Methodology

### Semantic Parity Gate

Before any timing, each scenario is run through both JS (`Main/lib/scan.js`) and Rust (`scanprobe` binary). States are compared using `assert.deepStrictEqual` via the shared `fixtures/integrated-harness-core.js`. The benchmark aborts on any mismatch.

### Anti-Optimization

- **Rust:** `std::hint::black_box` wraps inputs and outputs to prevent DCE
- **JS:** Result is consumed into a u32 FNV-1a digest accumulator (no BigInt)
- Both use the same u32 FNV-1a algorithm with native arithmetic
- The digest is for anti-optimization, NOT cross-runtime correctness comparison

### Process-Pair Execution

- 20 process pairs, each with one fresh JS worker and one fresh Rust worker
- Execution order deterministically randomized using seeded mulberry32 PRNG (seed=42)
- Both runtimes get equal fresh-process isolation
- Schedule saved before execution

### Timing

- JS: `process.hrtime.bigint()` (monotonic nanoseconds)
- Rust: `std::time::Instant` (monotonic)
- Warm-up: 1,000 iterations (discarded)
- Samples: 20 per scenario per process pair
- Iterations per sample: 5,000
- Integer nanoseconds stored; floating-point ns/op derived during analysis

### Statistical Analysis

- Per-pair median ns/op computed for each runtime
- Log ratios: `ln(js_median / rust_median)` per pair
- Cluster bootstrap at process-pair level (10,000 resamples, seeded)
- 95% percentile CI, exponentiated to ratio scale
- A ratio >1 means Rust faster; <1 means JS faster; CI overlapping 1.0 means inconclusive

## Environment

| Field | Value |
|---|---|
| OS | Windows 11 (win32, 10.0.26200) |
| CPU | 12th Gen Intel(R) Core(TM) i7-12650H |
| Node.js | v24.13.0 |
| Rust | rustc 1.97.1 |
| Harness SHA | `cc8db2c...` |
| Dirty tree | false |
| Corpus SHA-256 | `70f7c2b8...` |

## Per-Scenario Results

| ID | Label | Ratio (js/rust) | CI 95% Low | CI 95% High | Overlap 1.0? |
|---|---|---:|---:|---:|---|
| S001 | plain-path-short | 0.96 | 0.94 | 0.98 | no |
| S002 | plain-path-long | 1.25 | 1.22 | 1.28 | no |
| S003 | star-glob | 0.70 | 0.68 | 0.72 | no |
| S004 | question-mark | 0.36 | 0.35 | 0.39 | no |
| S005 | globstar-deep | 0.75 | 0.72 | 0.79 | no |
| S006 | braces | 0.73 | 0.70 | 0.86 | no |
| S007 | brackets | 0.74 | 0.70 | 0.87 | no |
| S008 | extglob | 0.92 | 0.87 | 0.96 | no |
| S009 | negation | 0.83 | 0.80 | 0.85 | no |
| S010 | negated-extglob | 1.75 | 1.70 | 1.81 | no |
| S011 | escaped-metachar | 0.99 | 0.95 | 1.01 | **yes** |
| S012 | parts-basic | 0.63 | 0.61 | 0.63 | no |
| S013 | tokens-basic | 0.80 | 0.79 | 0.82 | no |
| S014 | noext-globstar | 0.51 | 0.50 | 0.52 | no |
| S015 | nonegate | 0.99 | 0.97 | 1.01 | **yes** |
| S016 | noparen | 1.22 | 1.21 | 1.30 | no |
| S017 | bmp-unicode | 0.64 | 0.62 | 0.69 | no |
| S018 | astral-unicode | 0.69 | 0.66 | 0.74 | no |
| S019 | mixed-realistic | 1.43 | 1.36 | 1.59 | no |
| S020 | complex-parts-tokens | 0.90 | 0.89 | 0.92 | no |

**Summary:**
- Rust faster (ratio >1): 4 scenarios (S002, S010, S016, S019)
- JS faster (ratio <1): 14 scenarios
- Inconclusive (CI overlaps 1.0): 2 scenarios (S011, S015)
- No universal speedup claim — results are mixed and scenario-dependent

## Artifact Integrity

| File | SHA-256 |
|---|---|
| Raw data | `859f85ed9e17f011630bbca3cd538980a86630facc370c5aeb54dbfd2415633f` |
| Summary | `bd55501be7509bb0552dbf42f69c0e13c058836c1a3b1c646a215f92452d105c` |

Sidecar SHA-256 files verify correctly via `node benchmarks/verify-artifacts.js benchmarks/results`.

## Reproduction Commands

```bash
# Run canaries
node benchmarks/bench-canaries.js

# Run pilot
node benchmarks/run-benchmarks.js --pilot

# Run final benchmark (requires clean tree + harness SHA)
node benchmarks/run-benchmarks.js --harness-sha cc8db2cefb5d9e1b17f9e9a87f87136aa11b7a90

# Verify artifacts
node benchmarks/verify-artifacts.js benchmarks/results
```

## Limitations

1. **Windows-only:** Only Windows 11 tested
2. **Single machine:** Environment-specific
3. **Scanner-only:** Only `scan()` benchmarked
4. **Result consumption included:** Timed region includes u32 digest, not pure scanner time
5. **20 pairs:** Statistical power limited with 20 process pairs
6. **No memory measurement**
