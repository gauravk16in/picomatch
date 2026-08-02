# Judging Evidence — Picomatch JavaScript-to-Rust Migration

## Problem and Migration Objective

**Original:** [micromatch/picomatch](https://github.com/micromatch/picomatch) v4.0.5 — a blazing fast glob matcher in JavaScript.

**Objective:** Port to Rust for the Port Mortem 2026 hackathon, preserving bug-for-bug parity.

**Team Repository:** [gauravk16in/picomatch](https://github.com/gauravk16in/picomatch)

## PR Timeline (Verified)

| PR | Title | Merge SHA | Merged |
|---|---|---|---|
| #1 | C2 segment semantics | (squash) | 2026-08-01 |
| #2 | Constants and utilities | `1685399` | 2026-08-02 |
| #3 | Scanner port | `3bcb877` | 2026-08-02 |
| #4 | Integrated differential validation | `e115174` | 2026-08-02 |
| #5 | Benchmarks (defective, reverted) | `3a1b780` | merged then reverted |
| #6 | Revert PR #5 | `b19e762` | 2026-08-02 |
| #7 | Benchmark remediation (this PR) | (pending) | (pending) |

## Why PR #5 Was Reverted

PR #5 was independently reviewed (https://github.com/gauravk16in/picomatch/pull/5#pullrequestreview-4839150197) and found to have 5 blocking defects:
1. Asymmetric checksum overhead (BigInt vs u64) in timed regions
2. Checksum parity never actually compared
3. Summary SHA-256 did not match committed file
4. Artifacts not bound to reviewed source commit
5. Statistical independence violated by flattened bootstrap

PR #6 reverted PR #5. This PR (#7) is a complete independent replacement.

## Benchmark Design (Remediation)

- **Semantic parity gate:** `deepStrictEqual` via shared `integrated-harness-core.js` before timing
- **Anti-optimization:** Rust `std::hint::black_box`; JS u32 FNV-1a digest (no BigInt)
- **Process-pair design:** 20 pairs, equal fresh processes for both runtimes
- **Deterministic order:** Seeded mulberry32 PRNG (seed=42)
- **Cluster bootstrap:** 10,000 resamples at process-pair level
- **Sidecar SHA-256:** Non-self-referential integrity
- **Two-commit workflow:** H (harness) then E (evidence)
- **Shared validator:** One production validator used by runner and canaries
- **Mutation-tested canaries:** 31 canaries, all import the real validator

## Correctness Evidence

- `cargo test`: 50 unit + 2 integration, 0 failed
- `node fixtures/run-integrated.js`: 15/15 steps green
- `node benchmarks/bench-canaries.js`: 31/31 mutations detected
- Semantic parity: 20/20 scenarios pass `deepStrictEqual`

## Benchmark Headline Results

**No universal speedup claim.** Results are mixed and scenario-dependent:
- Rust faster: 4 scenarios (ratio >1, CI excludes 1.0)
- JS faster: 14 scenarios (ratio <1, CI excludes 1.0)
- Inconclusive: 2 scenarios (CI overlaps 1.0)

See `BENCHMARKS.md` for the full per-scenario table.

## Reproducibility

```bash
cd Rust
node benchmarks/bench-canaries.js
node benchmarks/run-benchmarks.js --pilot
node benchmarks/run-benchmarks.js --harness-sha cc8db2cefb5d9e1b17f9e9a87f87136aa11b7a90
node benchmarks/verify-artifacts.js benchmarks/results
```

## Statement

This PR provides honest, reproducible benchmark evidence. No universal speedup is claimed. The benchmark infrastructure is independently designed and does not reuse any code or evidence from PR #5.
