# Benchmark Suite

Reproducible performance benchmark for the Rust scanner port vs the JavaScript reference.

## Quick Start

```bash
# Run pilot (fast, reduced settings; artifact is marked mode "pilot" and is
# never accepted as final evidence)
node benchmarks/run-benchmarks.js --pilot

# Run full benchmark (20 process pairs, ~10 min, complete settings but NO
# declared harness binding; artifact is marked mode "full" and is NOT
# accepted as final evidence)
node benchmarks/run-benchmarks.js

# Run final benchmark from a clean harness commit (clean tree enforced;
# artifact is marked mode "final" — the ONLY mode accepted as final evidence)
node benchmarks/run-benchmarks.js --harness-sha <H_SHA>

# Run benchmark canaries (validator mutations + CLI canaries + stats fixture)
node benchmarks/bench-canaries.js

# Verify final artifacts (independent recompute; non-final artifacts are skipped)
node benchmarks/verify-artifacts.js benchmarks/results
```

## Architecture

1. **Semantic parity gate** — Before timing, each scenario is run through both JS and Rust scanners. States are compared using `deepStrictEqual` via the shared `fixtures/integrated-harness-core.js`. Aborts on any mismatch. Recorded in the raw artifact.

2. **Timed operation: scanner + minimal symmetric consumption** — Per call, both workers consume the state's scalar surface (start, field unit-lengths, flags, presence bits, array counts, per-token length/depth/flags) with an *identical op sequence* into a u32 accumulator. This defeats dead-code elimination without letting consumption dominate the measurement. Rust additionally uses `std::hint::black_box`. Residual asymmetry (Rust counts UTF-16 units where V8 reads `.length` in O(1)) disfavors Rust only and is bounded; see BENCHMARKS.md.

3. **Canonical digest equality, outside timing** — Once per scenario, each worker computes the full canonical FNV-1a digest of a fresh state (tag bytes, u32le length framing, UTF-16 code-unit encoding, explicit presence markers, `Infinity => 0x7F800000`). The spec is byte-identical across runtimes. The controller (and validator, and verifier) require JS digest == Rust digest **and** JS consumption == Rust consumption for every scenario and every process pair.

4. **Process-pair execution** — Each pair spawns one fresh JS worker and one fresh Rust worker. Execution order is deterministically randomized using a seeded mulberry32 PRNG (seed recorded in the artifact; schedule embedded in `provenance.schedule` and written to a per-run `<timestamp>-<platform>-schedule.json` file whose SHA-256 is bound in `provenance.schedule_sha256`).

5. **Statistics** — Per-pair median ns/op per runtime. Log ratios `ln(js/rust)` bootstrapped at the process-pair level (cluster bootstrap; 10,000 resamples; deterministic per-scenario seed), 95% percentile CI with symmetric indices, exponentiated. Implemented once in `benchmarks/stats.js` and used by both the controller and the verifier.

6. **Artifact integrity (schema v2)** — Raw artifact binds: harness commit (HEAD; clean tree enforced in final mode), corpus SHA-256, schedule + hash, scanbench/scanprobe binary SHA-256, effective Cargo profile + toolchain, environment metadata, and `config.mode` (`pilot` | `full` | `final` — only `final`, produced with `--harness-sha`, is accepted as final evidence; `full` is a complete but unbound run). Sidecar SHA-256 files (not self-referential). The verifier selects exactly one final set, re-derives expectations, and **independently recomputes every summary row from the raw measurements**. Legacy (v1) and non-final artifacts are reported and never accepted as final evidence.

## Files

| File | Purpose |
|---|---|
| `scenarios.json` | 20-scenario benchmark manifest |
| `run-benchmarks.js` | Benchmark controller (strict CLI, parity + equality gates) |
| `bench-worker.js` | JavaScript in-process worker |
| `scanbench.rs` | Rust in-process worker (uses `black_box`) |
| `validator.js` | Shared production validator (fail closed) |
| `stats.js` | Shared statistics (median/MAD/analyzeScenario) |
| `bench-canaries.js` | Mutation-tested canary suite (79 canaries) |
| `prng.js` | Deterministic PRNG (mulberry32) |
| `verify-artifacts.js` | Standalone final-evidence verifier |
