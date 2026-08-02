# Judging Evidence — Picomatch JavaScript-to-Rust Migration

## Problem and Migration Objective

**Original:** [micromatch/picomatch](https://github.com/micromatch/picomatch) v4.0.5 — a blazing fast glob matcher in JavaScript, zero dependencies, used by GraphQL, Jest, Astro, Storybook, and more.

**Objective:** Port the JavaScript implementation to Rust for the Port Mortem 2026 | Code Resurrection Hackathon, preserving bug-for-bug parity (including upstream quirks).

**Team Repository:** [gauravk16in/picomatch](https://github.com/gauravk16in/picomatch)

## Teammate 2 Scope

Teammate 2 owns:
- Constants (`lib/constants.js`)
- Utilities (`lib/utils.js`)
- Scanner (`lib/scan.js`)
- Differential testing infrastructure
- Benchmarks
- Documentation and judging evidence

## PR Timeline (Verified)

| PR | Title | Owner | Head SHA | Merge SHA | Merged |
|---|---|---|---|---|---|
| #1 | feat(parse): Chunk C2 — segment semantics | Teammate 1 | `ee55156` | (squash) | 2026-08-01T18:36Z |
| #2 | Teammate 2 chunk 1: constants and utilities | Teammate 2 | `0f004bd` | `1685399` | 2026-08-02T06:51Z |
| #3 | Teammate 2 chunk 2: port scanner | Teammate 2 | `f8d350b` | `3bcb877` | 2026-08-02T12:23Z |
| #4 | Teammate 2 chunk 3: harden integrated differential validation | Teammate 2 | `33a034f` | `e115174` | 2026-08-02T15:05Z |
| Chunk 4 | Teammate 2 chunk 4: benchmarks and final evidence | Teammate 2 | (this branch) | (pending) | (pending) |

**Verification method:** Git merge commit graph (`git log --oneline --graph --all`) cross-checked with GitHub PR list API. The GitHub PR API reported `merged:false` for PR #4 despite the merge commit existing in git history — this is a known stale-cache issue. Git history is ground truth.

**Latest `rust-port` base SHA:** `e115174120bb9460157c74679cfca6282c4dae4f`

## Modules Delivered

### Chunk 1 — Constants and Utilities (PR #2, merged)

- `crates/pmx-core/src/constants.rs` — all 16 POSIX + 16 Windows fragments, 14 POSIX class sources, extglob tables, REPLACEMENTS, 45 `CHAR_*` code constants
- `crates/pmx-core/src/utils.rs` — `remove_backslashes`, `has_regex_chars`, `is_regex_char`, `escape_regex`, `to_posix_slashes`, `basename`, and verified pre-existing functions
- Fix: `push_escape_regex_unit` char set corrected to exact JS 14 (`-*+?.^${}(|)[]`, no backslash)

### Chunk 2 — Scanner (PR #3, merged)

- `crates/pmx-core/src/scan.rs` — complete port of `lib/scan.js` (391 lines): `scan()`, `scan_utf16()`, `ScanOptions`, `ScanState`, `ScanToken`
- `crates/pmx-core/examples/scanprobe.rs` — test-only JSONL probe binary
- `fixtures/scan-bridge.js` — test-only CommonJS preload (unchanged original test bridge)
- `fixtures/scan_oracle.json` — 3,072-case scanner corpus
- 28 oracle-pinned unit tests + regression tests

### Chunk 3 — Integrated Differential Validation (PR #4, merged)

- `fixtures/run-integrated.js` — unified integrated differential runner (15 steps)
- `fixtures/integrated-harness-core.js` — shared harness detector
- `fixtures/canary-harness.js` — 19 fail-closed harness canaries
- `fixtures/attack-integrated.js` — 3,969-comparison integration attack set
- `fixtures/capability-matrix.json` — capability/ownership matrix
- Bug fix: `prevIndex=0` falsy in scanner parts assembly

### Chunk 4 — Benchmarks and Final Evidence (this PR)

- `benchmarks/scenarios.json` — 20-scenario benchmark manifest
- `benchmarks/run-benchmarks.js` — cross-language benchmark orchestrator
- `benchmarks/benchmark-core.js` — JavaScript in-process benchmark harness
- `crates/pmx-core/examples/scanbench.rs` — Rust release benchmark binary
- `benchmarks/bench-canaries.js` — 14 benchmark self-test canaries
- `benchmarks/results/` — raw and summary JSON with SHA-256 hashes
- `BENCHMARKS.md` — full benchmark report
- `JUDGING_EVIDENCE.md` — this document
- `audits/2026-08-02-2112-teammate2-chunk4-benchmarks-final-evidence.md` — Chunk 4 audit

## Architecture and Parity Decisions

- **D-013:** UTF-16 units for pattern text; `from_utf16_lossy` at `&str` boundary replaces lone surrogates with U+FFFD
- **D-014:** Non-finite f64 transport as decimal strings (serde_json default is not correctly rounded)
- **D-015:** `ScanOptions` is a dedicated struct (distinct from parser `Options`)
- **D-016:** `scan_utf16(&[u16])` mirrors JS `charCodeAt` exactly; `scan(&str)` is ergonomic wrapper
- **D-017:** Depth as `Option<f64>` with `Infinity` for globstar

## Unchanged Original-Test Evidence

- `Main/test/api.scan.js` passes **40/40** against Rust via the scan-bridge (unchanged test, no edits)
- `api.scan.js` SHA-256: `8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36` (byte-identical before/after)
- Full Main mocha suite: **1,977 passing** (unchanged reference)

## Deterministic Corpus/Differential Totals

| Surface | Comparisons | Divergences |
|---|---|---|
| Scanner corpus (verify-scan) | 3,072 | 0 |
| C0 corpus (verify-c0) | 39 | 0 |
| C1 corpus (verify-c1) | 55 | 0 |
| C2 corpus (verify-c2) | 18 | 0 |
| Scanner attack (attack-scan) | 4,932 | 0 |
| C0 attack (attack-c0) | 213 | 0 |
| C0-2 attack (attack-c0-2) | 340 | 0 |
| C2 attack (attack-c2) | 85 | 0 |
| Integration attack (attack-integrated) | 3,969 | 0 |
| **Aggregate** | **12,723** | **0** |

## Harness Canary Evolution

- Chunk 3 initially had 16 canaries with tautological assertions (Finding A)
- Post-review: 19 fail-closed canaries using shared harness core
- Meta-test #19 proves unexpected exceptions are rejected as failures (not passes)
- Chunk 4 adds 14 benchmark-specific canaries (scenario ID validation, zero-time detection, checksum structure, statistics correctness)

## Real Bugs Found and Fixed

### BUG-001: Scanner `prevIndex=0` falsy in parts assembly

- **Discovered by:** Chunk 3 integration attack set
- **Input:** `//` with `{parts:true}` or `{tokens:true}`
- **Expected (JS):** `parts = ['/']`
- **Actual (Rust before fix):** `parts = ['']`
- **Root cause:** JS L354 `const n = prevIndex ? prevIndex + 1 : start;` — JS `0` is falsy -> `n = start`. Rust used `Some(0) => 0 + 1 = 1` (truthy)
- **Fix:** `Some(p) if p != 0 => p + 1, _ => start`
- **Regression test:** `parts_double_slash_previndex_zero_falsy`

## Benchmark Headline Results (Scope-Labeled)

**Surface:** `scan()` API only (scanner). Parser/matcher/compiler not yet ported.

**Core in-process results (Layer A):**
- Rust faster in all 20 scenarios
- Speedup range: **2.01x-7.10x** (median: **3.32x**)
- No 95% CI overlap in any scenario — statistically supported on this machine
- Tested on: Windows 11, Node v24.13.0, Rust 1.97.1

**Bridge overhead (Layer C, test-only transport):**
- Cold process startup + one probe: 5.8-10.1 ms per invocation (41x-714x in-process JS time)
- This is test infrastructure overhead, not core scanner performance

## Reproducibility Commands

```bash
# Correctness gates (must pass before benchmarking)
cd Rust && cargo fmt --check && cargo clippy --workspace --all-targets --all-features -- -D warnings && cargo test --workspace --all-features && node fixtures/run-integrated.js && cd ../Main && npm test

# Benchmark
cd Rust && node benchmarks/run-benchmarks.js

# Benchmark canaries
cd Rust && node benchmarks/bench-canaries.js
```

## Exact Remaining Limitations

1. **Parser C3+:** Only C0-C2 (foundation, fastpath, segment semantics) are ported; C3+ (wildcards, braces, brackets, extglobs) are other teammates' pending work
2. **No matcher/compiler:** The regex compilation and matching pipeline is not yet ported
3. **No production adapter:** The full 1,977-test mocha suite cannot run against Rust yet
4. **No cross-platform benchmarks:** Only Windows 11 was tested
5. **No memory measurement:** Memory consumption was not measured

## What a Judge Can Independently Rerun Quickly

1. `cd Rust && node fixtures/run-integrated.js` — full correctness validation (15 steps, ~30s)
2. `cd Rust && node benchmarks/bench-canaries.js` — benchmark self-tests (14 canaries, ~2s)
3. `cd Rust && node benchmarks/run-benchmarks.js` — full benchmark (~5 min)
4. `cd Main && npm test` — original JS reference suite (1,977 tests, ~3s)

## Statement

Teammate 2's assigned work — constants, utilities, scanner, differential testing, benchmarks, and documentation — is complete. The entire picomatch migration is **not** complete; parser C3+, matcher, compiler, and adapter remain as other teammates' pending work.
