# Benchmark Suite

Reproducible performance benchmark for the Rust scanner port vs the JavaScript reference.

## Quick Start

```bash
# Run pilot (fast, reduced settings)
node benchmarks/run-benchmarks.js --pilot

# Run full benchmark (20 process pairs, ~10 min)
node benchmarks/run-benchmarks.js

# Run final benchmark from clean harness commit
node benchmarks/run-benchmarks.js --harness-sha <H_SHA>

# Run benchmark canaries
node benchmarks/bench-canaries.js

# Verify artifacts
node benchmarks/verify-artifacts.js benchmarks/results
```

## Architecture

1. **Semantic parity gate** — Before timing, each scenario is run through both JS and Rust scanners. States are compared using `deepStrictEqual` via the shared `integrated-harness-core.js`. Aborts on any mismatch.

2. **Process-pair execution** — Each pair spawns one fresh JS worker and one fresh Rust worker. Execution order is deterministically randomized using a seeded mulberry32 PRNG. Both runtimes get equal fresh-process isolation.

3. **Statistics** — Per-pair median ns/op is computed for each runtime. Log ratios (ln(js/rust)) are bootstrapped at the process-pair level (cluster bootstrap) with 10,000 resamples and a deterministic seed. 95% CIs are exponentiated.

4. **Artifact integrity** — Sidecar SHA-256 files (not self-referential). Raw + summary JSON validated by the shared validator.

## Files

| File | Purpose |
|---|---|
| `scenarios.json` | 20-scenario benchmark manifest |
| `run-benchmarks.js` | Benchmark controller + statistics |
| `bench-worker.js` | JavaScript in-process worker |
| `scanbench.rs` | Rust in-process worker (uses `black_box`) |
| `validator.js` | Shared production validator |
| `bench-canaries.js` | Mutation-tested canary suite |
| `prng.js` | Deterministic PRNG (mulberry32) |
| `verify-artifacts.js` | Standalone artifact verifier |
