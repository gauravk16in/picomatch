# Judging Evidence — Picomatch JavaScript-to-Rust Migration

## Problem and Migration Objective

**Original:** [micromatch/picomatch](https://github.com/micromatch/picomatch) v4.0.5 — a blazing fast glob matcher in JavaScript.

**Objective:** Port to Rust for the Port Mortem 2026 hackathon, preserving bug-for-bug parity.

**Team Repository:** [gauravk16in/picomatch](https://github.com/gauravk16in/picomatch)

## PR Timeline (Verified)

| PR | Title | Merge SHA | Merged |
|---|---|---|---|
| #1 | C2 segment semantics | `bdd0a84` | 2026-08-01 |
| #2 | Constants and utilities | `1685399` | 2026-08-02 |
| #3 | Scanner port | `3bcb877` | 2026-08-02 |
| #4 | Integrated differential validation | `e115174` | 2026-08-02 |
| #5 | Benchmarks (defective, reverted) | `3a1b780` | merged then reverted |
| #6 | Revert PR #5 | `b19e762` | 2026-08-02 |
| #7 | Benchmark remediation | `4d234c1` | 2026-08-02 |
| #8 | C2 segment semantics (later integration) | `a2b1ce1` | 2026-08-02 |

PR #7 harness commit H `cc8db2cefb5d9e1b17f9e9a87f87136aa11b7a90`, evidence commit E `0087dd796f4b0a026863adcde66a5ff9779f29d5`. **PR #7's benchmark evidence is now SUPERSEDED** (see below).

## Why PR #5 Was Reverted

PR #5 was independently reviewed (https://github.com/gauravk16in/picomatch/pull/5#pullrequestreview-4839150197) and found to have 5 blocking defects:
1. Asymmetric checksum overhead (BigInt vs u64) in timed regions
2. Checksum parity never actually compared
3. Summary SHA-256 did not match committed file
4. Artifacts not bound to reviewed source commit
5. Statistical independence violated by flattened bootstrap

PR #6 reverted PR #5 (verified complete: `git diff 3a1b780^ b19e762` is empty). PR #7 was an independent replacement.

## Final Audit and H2/E2 Evidence (2026-08-03, supersedes PR #7 benchmark evidence)

A full-repository final audit of Teammate 2's work ran on branch `chirag-rust-port-final-full-audit-optimize-fix` (from `origin/rust-port` `a2b1ce1`). It found and fixed two BLOCKER scanner divergences, one BLOCKER utility divergence, and repaired the benchmark operation equivalence (the PR #7 worker digests were **not** the same algorithm — empirically S001 js 2649926880 ≠ rust 2876329472 in the old raw). Full details: `audits/` (final end-to-end audit file).

| Ref | SHA |
|---|---|
| Scanner correctness fixes | `a09db41` |
| Scanner optimizations (profile-backed) | `1edcd50` |
| Harness/source commit (H2) | `14e3128cf458bca684927e76c54499e6bdfa305b` |
| Evidence commit (E2) | `2fc52d2` |

## Benchmark Design (H2)

- **Timed operation:** scanner + minimal symmetric consumption (identical op sequence both runtimes; scanner-only timing with `black_box` alone was rejected — `black_box` is best-effort, and a rich per-field digest inside the loop dominated the JS side)
- **Semantic parity gate:** `deepStrictEqual` via shared `integrated-harness-core.js` before timing (20/20 in the final run)
- **Canonical digest equality, outside timing:** byte-identical FNV-1a spec (tags, u32le framing, UTF-16 code units, presence markers); JS == Rust for all 400 scenario/pair checks
- **Consumption equality:** the in-loop accumulator is content-derived; JS == Rust for all 400 checks
- **Process-pair design:** 20 pairs, equal fresh processes for both runtimes
- **Deterministic order:** seeded mulberry32 PRNG (seed=42); schedule embedded + per-run file bound by SHA-256
- **Cluster bootstrap:** 10,000 resamples at process-pair level (Cameron & Miller JHR 2015; Davison & Hinkley 1997)
- **Schema v2 artifacts:** mode (pilot|final), binary SHA-256, effective Cargo profile + toolchain, environment metadata
- **Fail-closed validator + verifier:** verifier selects exactly one final set and independently recomputes every summary row from raw
- **Mutation-tested canaries:** 72 canaries (validator mutations + real-CLI canaries + stats synthetic fixture), all importing the production validator

## Correctness Evidence

- `cargo test`: 66 unit + 2 integration, 0 failed
- `cargo fmt --check` / `cargo clippy -D warnings`: clean
- `node fixtures/run-integrated.js`: 16/16 steps green (includes scanner corpus 3,216/3,216 deterministic, attack-scan 4,932 comparisons/0 divergences, attack-integrated 4,189/0, unchanged-original-test bridge 40/40, 19 harness canaries, 72 benchmark canaries, original-test hash pin)
- Original mocha suite (JavaScript oracle): 1977/1977 unchanged
- Semantic parity: 20/20 scenarios pass `deepStrictEqual`

## Benchmark Headline Results (H2/E2, final)

**No universal speedup claim.** Results are mixed and scenario-dependent:
- Rust faster: 13 scenarios (ratio >1, CI excludes 1.0)
- JS faster: 5 scenarios (S001, S002, S005, S007, S012)
- Inconclusive: 2 scenarios (S004, S006)

See `BENCHMARKS.md` for the full per-scenario table, artifact hashes, and the explicit superseded-evidence note for PR #7.

## Reproducibility

```bash
cd Rust
node benchmarks/bench-canaries.js
node benchmarks/run-benchmarks.js --pilot
node benchmarks/run-benchmarks.js --harness-sha 14e3128cf458bca684927e76c54499e6bdfa305b
node benchmarks/verify-artifacts.js benchmarks/results
```

## Statement

This project provides honest, reproducible benchmark evidence. No universal speedup is claimed. The final audit corrected earlier evidence defects (non-identical worker digests, weak verifier, unmarked pilot artifacts) in the open: PR #7's benchmark artifacts are retained as superseded legacy files, and the H2/E2 artifacts bind exact source, binary, corpus, schedule, environment, and run mode.
