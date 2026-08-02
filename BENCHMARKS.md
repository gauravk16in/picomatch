# Picomatch Rust Port — Scanner Benchmark Report

## Benchmark Definition

**Operation measured (timed region):** one call to `scan(input, options)` plus **minimal symmetric result consumption** — per call, both workers consume the state's scalar surface (start, field unit-lengths, 7 state flags, 4 presence bits, array counts, per-part unit-lengths, per-token unit-length/depth/flags, maxDepth) with an **identical op sequence** into one u32 accumulator. This defeats dead-code elimination without letting consumption dominate the measurement. Rust additionally wraps inputs/outputs in `std::hint::black_box`.

**Outside the timed region:** once per scenario, each worker computes the **full canonical FNV-1a digest** of a fresh state (tag bytes, u32le length framing, UTF-16 code-unit encoding, explicit presence markers, `Infinity => 0x7F800000`). The spec is byte-identical across runtimes; JS digest == Rust digest **and** JS consumption == Rust consumption is required for every scenario and every process pair (400/400 checks passed in this run). This is a whole-run semantic equality proof on the measured result consumption.

**What is NOT timed:** process startup, JSON transport, file I/O, semantic parity checks, fixture loading, statistics computation, artifact hashing, the canonical digest.

**Residual consumption asymmetry (honest note):** Rust counts UTF-16 units (`encode_utf16().count()`) where V8 reads `.length` in O(1). This disfavors Rust slightly (bounded per call) and cannot inflate a Rust win. The scanner core itself operates on `&[u16]` in both implementations: the JS scanner reads `charCodeAt` directly and the Rust scanner reads pre-converted units — the UTF-8→UTF-16 conversion happens outside the timed region on both sides (scenario setup), mirroring the fact that a JS string is already UTF-16 in memory.

## Exact Commits

| Ref | SHA |
|---|---|
| Integration base at audit start (`origin/rust-port`, PR #8 merge) | `a2b1ce1db2952ef667a2165568d1101ec8947a29` |
| Scanner correctness fixes (final audit) | `a09db41` |
| Scanner optimizations (final audit) | `1edcd50` |
| Harness/source commit (H2) | `14e3128cf458bca684927e76c54499e6bdfa305b` |
| Evidence commit (E2) | recorded in `JUDGING_EVIDENCE.md` and the final audit file (this document is committed in E2; the E2 SHA only exists afterwards) |

**Superseded evidence (kept for history, not final):** the PR #7 benchmark evidence (harness H `cc8db2cefb5d9e1b17f9e9a87f87136aa11b7a90`, evidence E `0087dd796f4b0a026863adcde66a5ff9779f29d5`, raw `2026-08-02T17-32-13-win32-raw.json`) measured pre-optimization scanner code with the defective (non-identical) worker digests — the final audit verified the two digests were not the same algorithm (empirically: S001 js 2649926880 ≠ rust 2876329472 in that raw). The `2026-08-02T17-29-50` file is a 3-pair pilot that recorded the pre-harness base SHA. Both are retained as superseded legacy artifacts and are skipped by the verifier.

## Methodology

### Semantic Parity Gate

Before any timing, each scenario is run through both JS (`Main/lib/scan.js`) and Rust (`scanprobe` binary). States are compared using `assert.deepStrictEqual` via the shared `fixtures/integrated-harness-core.js`. The benchmark aborts on any mismatch. 20/20 scenarios passed in this run.

### Anti-Optimization

- **Rust:** `std::hint::black_box` wraps inputs and outputs (best effort); the consumption accumulator forces full state materialization.
- **JS:** the same consumption accumulator (identical op sequence) consumes every returned state.
- The accumulator value is content-derived and must match across runtimes (CONSUMPTION_MISMATCH otherwise).

### Process-Pair Execution

- 20 process pairs, each with one fresh JS worker and one fresh Rust worker
- Execution order deterministically randomized using seeded mulberry32 PRNG (seed=42)
- Both runtimes get equal fresh-process isolation
- Schedule embedded in the raw artifact and written to `2026-08-02T20-14-55-win32-schedule.json` (sha256 `8800b0ff…71bf2b`)

### Timing

- JS: `process.hrtime.bigint()` (monotonic nanoseconds)
- Rust: `std::time::Instant` (monotonic)
- Warm-up: 1,000 iterations (discarded)
- Samples: 20 per scenario per process pair
- Iterations per sample: 5,000 (fixed, disclosed; no post-hoc calibration)
- Integer nanoseconds stored; floating-point ns/op derived during analysis

### Statistical Analysis

- Per-pair median ns/op computed for each runtime
- Log ratios: `ln(js_median / rust_median)` per pair
- Cluster bootstrap at process-pair level (10,000 resamples, seeded per scenario)
- 95% percentile CI (symmetric indices `ceil(p*n)-1`), exponentiated to ratio scale
- A ratio >1 means Rust faster; <1 means JS faster; CI overlapping 1.0 means inconclusive
- Implementation: `benchmarks/stats.js` (shared by controller and verifier; the verifier independently recomputes every summary row from the raw measurements)

## Environment

| Field | Value |
|---|---|
| OS | Windows 11 (win32, 10.0.26200) |
| CPU | 12th Gen Intel(R) Core(TM) i7-12650H |
| Node.js | v24.13.0 |
| Rust | rustc 1.97.1 (pinned via rust-toolchain.toml) |
| Cargo profile | release (opt-level 3, default lto, codegen-units 16) |
| Harness SHA (H2) | `14e3128cf458bca684927e76c54499e6bdfa305b` |
| Dirty tree | false |
| Corpus SHA-256 | `70f7c2b85cca25916cb992b7985ecb6139e4b9986f780a7334f685cb22104cd6` |
| scanbench SHA-256 | `0d4e7011ea517fd17b15e41382aca8fcff5f835a5e5c7ca48b5c1658bde35566` |
| scanprobe SHA-256 | `4136092b46528a48d7af97945cf6b5c280fb521c353e6de1f8456b497205ec8a` |

## Per-Scenario Results (H2/E2, final)

| ID | Label | Ratio (js/rust) | CI 95% Low | CI 95% High | Overlap 1.0? |
|---|---|---:|---:|---:|---|
| S001 | plain-path-short | 0.66 | 0.64 | 0.68 | no |
| S002 | plain-path-long | 0.75 | 0.74 | 0.77 | no |
| S003 | star-glob | 1.11 | 1.08 | 1.15 | no |
| S004 | question-mark | 1.02 | 0.99 | 1.07 | **yes** |
| S005 | globstar-deep | 0.74 | 0.72 | 0.76 | no |
| S006 | braces | 1.00 | 0.98 | 1.03 | **yes** |
| S007 | brackets | 0.96 | 0.95 | 1.00 | no |
| S008 | extglob | 1.16 | 1.12 | 1.22 | no |
| S009 | negation | 1.26 | 1.24 | 1.29 | no |
| S010 | negated-extglob | 1.36 | 1.32 | 1.42 | no |
| S011 | escaped-metachar | 1.29 | 1.21 | 1.29 | no |
| S012 | parts-basic | 0.86 | 0.84 | 0.88 | no |
| S013 | tokens-basic | 1.38 | 1.35 | 1.43 | no |
| S014 | noext-globstar | 1.72 | 1.67 | 1.78 | no |
| S015 | nonegate | 1.92 | 1.86 | 1.98 | no |
| S016 | noparen | 1.69 | 1.62 | 1.77 | no |
| S017 | bmp-unicode | 1.07 | 1.04 | 1.10 | no |
| S018 | astral-unicode | 1.29 | 1.24 | 1.35 | no |
| S019 | mixed-realistic | 1.33 | 1.29 | 1.36 | no |
| S020 | complex-parts-tokens | 1.11 | 1.07 | 1.15 | no |

**Summary:**
- Rust faster (ratio >1, CI excludes 1.0): 13 scenarios (S003, S008, S009, S010, S011, S013, S014, S015, S016, S017, S018, S019, S020)
- JS faster (ratio <1, CI excludes 1.0): 5 scenarios (S001, S002, S005, S007, S012)
- Inconclusive (CI overlaps 1.0): 2 scenarios (S004, S006)
- **No universal speedup claim** — results are mixed and scenario-dependent. V8 remains faster on short/long plain paths, deep globstar scanning, and parts assembly; the Rust port is faster on glob/extglob/negation/token-heavy and Unicode scenarios.

**Comparison to superseded PR #7 evidence:** the scanner optimizations landed between E and E2 (allocation-free base trim, move-instead-of-clone) reduced Rust scan time 18–50% per scenario (counting-allocator + Instant microbench evidence in the final audit), and the timed operation no longer includes the heavy per-field digest (which had ~2.3x inflated the JS side after unification). Direction flips vs the old evidence are expected from these two measured changes, not from retuning.

## Artifact Integrity

| File | SHA-256 |
|---|---|
| Raw data (`2026-08-02T20-14-55-win32-raw.json`) | `a0447699e004f0517cfc8fdc3346fd4079616cee310f135b8fbb60c973ccab98` |
| Summary (`2026-08-02T20-14-55-win32-summary.json`) | `affc4b79894d54d3d0bff8a244d32fbe5b5c4a713c5a4f95a8cf5f8ff9494485` |
| Schedule (`2026-08-02T20-14-55-win32-schedule.json`) | `8800b0ff1e4b422be512d5a00dc8fd956cb8dea1733a907a1a49b4c80471bf2b` |

Sidecar SHA-256 files verify correctly via `node benchmarks/verify-artifacts.js benchmarks/results` (which also re-validates the raw with full expectations and independently recomputes every summary row from the raw measurements).

## Reproduction Commands

```bash
# Run canaries (67 validator/CLI/stats mutations)
node benchmarks/bench-canaries.js

# Run pilot (artifact marked mode "pilot"; never final evidence)
node benchmarks/run-benchmarks.js --pilot

# Run final benchmark (requires clean tree at the harness commit)
git checkout 14e3128cf458bca684927e76c54499e6bdfa305b  # or a descendant
node benchmarks/run-benchmarks.js --harness-sha 14e3128cf458bca684927e76c54499e6bdfa305b

# Verify artifacts (final set selection + independent recompute)
node benchmarks/verify-artifacts.js benchmarks/results
```

## Limitations

1. **Windows-only:** Only Windows 11 tested
2. **Single machine:** Environment-specific (i7-12650H); absolute numbers vary with machine state
3. **Scanner-only:** Only `scan()` benchmarked (parser/matcher are other teammates' scope)
4. **Consumption included:** Timed region includes the minimal consumption accumulator (bounded, documented above), not pure scanner time
5. **20 pairs:** Statistical power limited with 20 process pairs (small-cluster caveat for the cluster bootstrap)
6. **No memory measurement**
7. **Rust-side unit counting:** the consumption's UTF-16 unit counting slightly disfavors Rust (see above)
