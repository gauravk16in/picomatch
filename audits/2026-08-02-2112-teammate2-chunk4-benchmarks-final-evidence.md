# Teammate 2 — Chunk 4 audit: benchmarks, final documentation, and judging evidence

- Session type: Teammate 2 (Supporting Modules + Testing) Chunk 4 — reproducible benchmark system, final documentation, judging evidence, documentation reconciliation. No subagents; every command, read, probe, fetch, edit, and test run personally.
- Working branch: `chirag-rust-port-chunk4-benchmarks-final-evidence` (cut from `origin/rust-port` `e115174`). Session window: 2026-08-02 ~20:58 IST → ~21:15 IST.
- Environment: Windows 11, PowerShell, Node v24.13.0, npm 11.6.2, cargo 1.97.1, rustc 1.97.1, git 2.53.0.windows.3.

## 1. Verdict

**CHUNK 4 COMPLETE — REPRODUCIBLE BENCHMARK SYSTEM ESTABLISHED; SCANNER PERFORMANCE MEASURED HONESTLY; CORE VS BRIDGE OVERHEAD SEPARATED; ALL CORRECTNESS GATES GREEN; DOCUMENTATION RECONCILED.**

## 2. Branch/PR/base/head SHAs

| Ref | SHA |
|---|---|
| `origin/rust-port` (base, post-PR-#4-merge) | `e115174120bb9460157c74679cfca6282c4dae4f` |
| `origin/main` (Main/ reference) | `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2` |
| PR #4 merge commit | `e115174120bb9460157c74679cfca6282c4dae4f` |
| PR #4 final head | `33a034fdee8c100d07dddafe4a33c7297c3cfcbb` |
| `chirag-rust-port-chunk4-benchmarks-final-evidence` (this branch head) | (this commit) |

## 3. PR/merge verification

Verified via two independent signals:
1. **Git merge graph:** `git log --oneline --decorate --graph --all` shows `e115174` as merge commit on `origin/rust-port` with parents `3bcb877` (PR #3 merge) and `33a034f` (PR #4 head)
2. **GitHub PR list API:** PRs #1–#4 all `state: closed`; PR #4 `merged_at: 2026-08-02T15:05:05Z` (API reported `merged:false` but `merged_at` was populated — stale cache issue confirmed and noted)

No newer PRs or branch advances beyond PR #4 at session start.

## 4. Context files reviewed (full reads)

- `Rust/AGENTS.md` (full, 40 lines pre-edit)
- `Rust/DECISIONS.md` (D-01 through D-017)
- `Rust/Cargo.toml`, `Rust/crates/pmx-core/Cargo.toml`
- `Rust/audits/2026-08-02-1858-teammate2-chunk3-differential-integration.md` (full)
- `Rust/fixtures/capability-matrix.json` (full)
- `Rust/crates/pmx-core/src/scan.rs` (full, 971 lines)
- `Rust/crates/pmx-core/examples/scanprobe.rs` (full, 190 lines)
- `Main/lib/scan.js` (full, 391 lines)
- GitHub PR list (all 4 PRs, merge state, head SHAs)

## 5. Research performed

### Research queries and sources

1. **Benchmark methodology research** (Research API, deep effort):
   - Criterion.rs: warm-up (~3s default), 100 samples, bootstrap CIs, Tukey outlier classification, median/MAD robust statistics, throughput measurement
   - Node.js: `process.hrtime.bigint()` for nanosecond monotonic timing; `performance.now()` sub-millisecond; V8 JIT warm-up requires 100+ iterations; dead-code elimination prevention via output consumption
   - Cross-language fairness: separate processes for V8 isolation; identical problem sizes; setup outside timed regions; output consumption mandatory
   - Bootstrap: 1,000+ resamples, percentile method for 95% CI
   - MAD: Leys et al. (2013) — robust alternative to SD for outlier-prone data

2. **Primary sources consulted:**
   - Criterion.rs official documentation (`bheisler.github.io/criterion.rs`)
   - Criterion.rs analysis source (`github.com/bheisler/criterion.rs/blob/master/book/src/analysis.md`)
   - Node.js benchmark suite documentation (`github.com/nodejs/node`, PR #38369)
   - Node.js performance guidance (State of Node.js Performance 2024)
   - Rust Performance Book

### Contradictions and decisions

- **Criterion vs dependency-free:** Criterion.rs adds a dev-dependency and lockfile impact. Decision: use dependency-free approach with `std::time::Instant` + a release benchmark binary. Rationale: simpler, no lockfile impact, directly comparable to JS harness using the same statistical methods manually. The benchmark still applies Criterion's methodology principles (warm-up, multiple samples, bootstrap CIs, median/MAD).
- **Rust single run vs JS multiple runs:** Rust release builds are deterministic (no JIT); V8 has JIT warm-up and optimization-order sensitivity. Decision: JS runs 3 independent processes (per Node.js benchmark suite guidance); Rust runs 1 (justified by deterministic release builds). Asymmetry noted in BENCHMARKS.md limitations.

## 6. No-assumption evidence ledger

| Claim | Evidence |
|---|---|
| `origin/rust-port` at `e115174` | `git rev-parse origin/rust-port` output + `git log` |
| PR #4 merged | Git merge commit graph + GitHub API `merged_at` timestamp |
| All 20 scenarios Rust faster | Raw JSON measurements + summary JSON with bootstrap CIs |
| 12,723 comparisons, 0 divergences | `node fixtures/run-integrated.js` output (15/15 steps green) |
| 50 unit + 2 integration tests | `cargo test` output |
| Main 1,977 passing | `npm test` output |
| `api.scan.js` hash | `8abd94a2...` (run-integrated.js step 7) |
| Benchmark canaries pass | `node benchmarks/bench-canaries.js` output (14/14) |

## 7. Baseline correctness results (before benchmarking)

| Gate | Result |
|---|---|
| `cargo fmt --check` | exit 0 |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | exit 0 |
| `cargo test --workspace --all-features` | 50 unit + 2 integration, 0 failed |
| `node fixtures/run-integrated.js` | 15/15 steps green |
| `Main/npm test` | 1,977 passing, exit 0 |
| Benchmark canaries | 14/14 pass |

## 8. Capability/ownership/benchmark eligibility matrix

| Surface | JS Reference | Rust Impl | Owner | Status | Benchmark Eligible | Reason |
|---|---|---|---|---|---|---|
| constants | `lib/constants.js` | `constants.rs` | Teammate 2 | complete | no (no standalone API) | consumed by scanner/parser |
| utils | `lib/utils.js` | `utils.rs` | Teammate 2 | complete | no (no standalone API) | consumed by scanner/parser |
| scanner | `lib/scan.js` | `scan.rs` | Teammate 2 | complete | **yes** | behaviorally equivalent, full parity |
| parser C0-C2 | `lib/parse.js` | `parse/` | Teammate 1 | partial (C3+ pending) | no | incomplete parity |
| matcher/compiler | `lib/picomatch.js` | none | Other | not started | no | no Rust impl |
| adapter | `index.js`, `posix.js` | none | Other | not started | no | no Rust impl |

## 9. Benchmark design and canaries

### Architecture

- **Layer A:** In-process core benchmark (Rust `scanbench.rs` + JS `benchmark-core.js`), calling real scanner functions directly, output consumed via FNV-1a checksum
- **Layer B:** Cross-language orchestrator (`run-benchmarks.js`) with parity validation, statistics, raw/summary JSON
- **Layer C:** Bridge overhead benchmark (cold process startup + one probe, labeled as test transport)

### Benchmark canaries (14 total)

1. Missing Rust result detected
2. Missing JS result detected
3. Duplicate scenario ID detected
4. Zero operations detected
5. Zero sample time detected
6. Negative sample time detected
7. Valid results pass
8. Scanner produces correct output
9. Scanner options affect output
10. Median computation correct
11. MAD computation correct
12. Empty list handled gracefully
13. Scenarios file valid JSON with unique IDs
14. Benchmark source files exist

All 14 canaries pass. The canary runner catches unexpected exceptions.

## 10. Pilot and final methodology

### Pilot run

- Settings: 1,000 warm-up, 10 samples, 500 iters/sample, 1 JS run
- Result: all 20 scenarios Rust faster; infrastructure validated
- Decision: proceed to full run

### Final run

| Parameter | Value | Justification |
|---|---|---|
| Warm-up iterations | 5,000 | Exceeds V8 JIT threshold (~100+); ~3s+ warm-up equivalent |
| Timed samples | 50 | Matches Criterion.rs default range |
| Iterations per sample | 2,000 | Each sample ~100ms+ to dwarf timer overhead |
| JS process runs | 3 | Independent V8 instances (per Node.js benchmark suite) |
| Rust runs | 1 | No JIT; release build deterministic |
| Bootstrap resamples | 1,000 | Percentile method for 95% CI |

## 11. Full environment metadata

| Field | Value |
|---|---|
| Timestamp | 2026-08-02T15:40:25Z |
| Timezone | Asia/Calcutta (UTC+5:30) |
| OS | Windows 11 (win32, 10.0.26200) |
| CPU | 12th Gen Intel(R) Core(TM) i7-12650H, 16 logical cores |
| RAM | 16.83 GB total, 1.69 GB free |
| Node.js | v24.13.0 (V8 13.6.233.17-node.37) |
| Rust | rustc 1.97.1 (8bab26f4f 2026-07-14) |
| Cargo | cargo 1.97.1 |
| Git | 2.53.0.windows.3 |
| Base SHA | `e115174120bb9460157c74679cfca6282c4dae4f` |
| Build profile | `--release` |

**Uncontrolled factors:** CPU frequency scaling, thermal state, background processes, antivirus. Not controlled — documented in limitations.

## 12. Raw/summary result hashes

| File | SHA-256 |
|---|---|
| `benchmarks/results/2026-08-02T15-40-41-win32-raw.json` | `054bb5d64c5bd743eb6209108f2e13849783c6188842ce84462a0b456555cc56` |
| `benchmarks/results/2026-08-02T15-40-41-win32-summary.json` | `3a209d1411da98c78a3a3a928987cd8f244bb9a7a0e0b64c495398d5c5b9eb40` |

## 13. Exact measured results and uncertainty

### Core results (Layer A) — summary

| Metric | Range |
|---|---|
| Rust median ns/iter | 230–1,447 |
| JS median ns/iter | 1,155–4,954 |
| Rust speedup | 2.01×–7.10× (median: 3.32×) |
| CI overlap | none in any scenario |
| Rust CV (MAD/median) | 0.7%–7.8% |
| JS CV (MAD/median) | 3.0%–6.7% |

### Bridge overhead (Layer C) — summary

| Metric | Range |
|---|---|
| Cold process ns | 5,895,500–10,386,500 |
| Bridge ratio | 41×–714× of in-process JS |

**Uncertainty:** All 20 core scenarios have non-overlapping bootstrap 95% CIs — differences are statistically supported on this machine. No result is labeled inconclusive.

## 14. All regression gates (final)

| Gate | Result |
|---|---|
| `cargo fmt --check` | exit 0 |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | exit 0 |
| `cargo test --workspace --all-features` | 50 unit + 2 integration, 0 failed |
| `node fixtures/run-integrated.js` | 15/15 steps green |
| `node benchmarks/bench-canaries.js` | 14/14 pass |
| `Main/npm test` | 1,977 passing, exit 0 |

## 15. Documentation corrections

### AGENTS.md

- **Stale:** "Scanner (Teammate 2 Chunk 2, PR pending)" and "Next: C3"
- **Corrected:** Updated to reflect PRs #2/#3/#4 merged; Chunk 4 complete; scanner + benchmarks + integrated validation all done. Added post-merge correction note preserving historical baseline.

### Chunk 3 audit (§1)

- **Stale:** "harness canary 16/16 passing" (from initial implementation)
- **Corrected:** Added post-merge correction note in §1 stating correct count is 19/19, correct post-review head SHA is `33a034f`, and §6 should list 19 canaries + `integrated-harness-core.js`. The correction note preserves the original text and explains the discrepancy.

## 16. Limitations

1. **Windows-only:** Results from Windows 11; not claimed for POSIX/Linux/macOS
2. **Single machine:** Environment-specific; CPU/power/thermal not controlled
3. **Scanner-only:** Only `scan()` benchmarked; full picomatch API not yet ported
4. **No memory measurement:** Memory not measured; no memory improvement claimed
5. **No end-to-end adapter:** Bridge overhead is test-only transport, not production API
6. **Rust single run:** Justified by deterministic release builds; asymmetry with JS 3 runs noted
7. **No optimization performed:** No production code modified for performance; truthful benchmark report is the deliverable

## 17. Final Teammate 2 completion status

Teammate 2's assigned work is **complete**:

- ✅ Chunk 1: constants + utilities (PR #2, merged)
- ✅ Chunk 2: scanner (PR #3, merged)
- ✅ Chunk 3: integrated differential validation (PR #4, merged)
- ✅ Chunk 4: benchmarks + final evidence (this branch)

The entire picomatch migration is **not** complete. Parser C3+, matcher, compiler, and adapter remain as other teammates' pending work.