# Teammate 2 — Chunk 4 remediation audit: benchmark system replacement

- Session type: Teammate 2 Chunk 4 remediation — independent replacement benchmark system after PR #5 revert. No subagents.
- Working branch: `chirag-rust-port-chunk4-benchmarks-remediation` (cut from `origin/rust-port` `b19e762`).
- Environment: Windows 11, Node v24.13.0, cargo 1.97.1, rustc 1.97.1.

## 1. Verdict

**CHUNK 4 REMEDIATION COMPLETE — INDEPENDENT REPLACEMENT BENCHMARK SYSTEM ESTABLISHED; HONEST MIXED RESULTS; ALL GATES GREEN; NO PR #5 CODE OR EVIDENCE REUSED.**

## 2. Branch/PR/base/head SHAs

| Ref | SHA |
|---|---|
| Base (`origin/rust-port`, post-PR-#6-revert) | `b19e762417ad75c4f11cf5ba3fa94abe33e9d950` |
| Harness commit (H) | `cc8db2cefb5d9e1b17f9e9a87f87136aa11b7a90` |
| Evidence commit (E) | (this commit) |

## 3. Why PR #5 was reverted

PR #5 was independently reviewed (https://github.com/gauravk16in/picomatch/pull/5#pullrequestreview-4839150197) and found to have 5 blocking defects:
1. Asymmetric checksum overhead (BigInt vs u64) in timed regions
2. Checksum parity never compared
3. Summary SHA-256 did not match committed file
4. Artifacts not bound to reviewed source commit
5. Statistical independence violated by flattened bootstrap

PR #6 reverted PR #5. This PR is a complete independent replacement.

## 4. Files changed

```
A  benchmarks/.gitignore
A  benchmarks/README.md
A  benchmarks/bench-canaries.js
A  benchmarks/bench-worker.js
A  benchmarks/prng.js
A  benchmarks/run-benchmarks.js
A  benchmarks/scenarios.json
A  benchmarks/validator.js
A  benchmarks/verify-artifacts.js
A  crates/pmx-core/examples/scanbench.rs
A  BENCHMARKS.md
A  JUDGING_EVIDENCE.md
M  AGENTS.md
M  DECISIONS.md
A  audits/2026-08-02-2300-teammate2-chunk4-benchmarks-remediation.md  (this audit)
```

## 5. Research-based decisions

- **Rust anti-optimization:** `std::hint::black_box` is stable and is the standard approach (per Rust std docs and RFC 2360). Used to wrap inputs and outputs.
- **JS anti-optimization:** u32 FNV-1a digest with native arithmetic (no BigInt). Research confirms asymmetric overhead in anti-optimization mechanisms makes benchmarks unfair.
- **Process isolation:** Node.js benchmark suite guidance mandates separate processes to avoid V8 optimization pollution. Both runtimes get equal fresh-process repetition.
- **Cluster bootstrap:** Research confirms naive bootstrap at individual level underestimates variance for correlated data. Cluster bootstrap at process-pair level is correct.
- **Sidecar SHA-256:** Self-referential hashes are invalid because the hash changes the file content. Sidecar files avoid this.

## 6. Commands run and outcomes

| Gate | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | exit 0 |
| `cargo test --workspace --all-features` | 50 unit + 2 integration, 0 failed |
| `node benchmarks/bench-canaries.js` | 31/31 mutations detected |
| `node benchmarks/run-benchmarks.js --pilot` | end-to-end success (3 pairs) |
| `node benchmarks/run-benchmarks.js --harness-sha cc8db2c... --pairs 20` | 20 pairs, clean tree, success |
| `node benchmarks/verify-artifacts.js benchmarks/results` | All artifacts verified |

## 7. Benchmark configuration

| Parameter | Value |
|---|---|
| Process pairs | 20 |
| Warm-up iterations | 1,000 |
| Samples per scenario | 20 |
| Iterations per sample | 5,000 |
| PRNG | mulberry32 |
| Seed | 42 |
| Bootstrap resamples | 10,000 |
| Scenarios | 20 |

## 8. Artifact hashes

| File | SHA-256 |
|---|---|
| Raw data | `859f85ed9e17f011630bbca3cd538980a86630facc370c5aeb54dbfd2415633f` |
| Summary | `bd55501be7509bb0552dbf42f69c0e13c058836c1a3b1c646a215f92452d105c` |

## 9. Headline results

- Rust faster: 4 scenarios (ratio >1, CI excludes 1.0)
- JS faster: 14 scenarios (ratio <1, CI excludes 1.0)
- Inconclusive: 2 scenarios (CI overlaps 1.0)
- **No universal speedup claimed** — results are mixed and scenario-dependent

## 10. Limitations

1. Windows-only
2. Single machine
3. Scanner-only
4. Result consumption included in timed region (honestly named)
5. 20 pairs — limited statistical power
6. No memory measurement
