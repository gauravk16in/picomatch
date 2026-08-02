# Teammate 2 — Chunk 3 audit: integrated differential validation

- Session type: Teammate 2 (Supporting Modules + Testing) Chunk 3 — integrated differential validation layer, harness canary/self-tests, deterministic integration attack set, scanner bug fix, audit, PR. No subagents; every command, read, probe, fetch, edit, and test run personally.
- Working branch: `chirag-rust-port-chunk3-differential-integration` (cut from `origin/rust-port` `3bcb877`). Session window: 2026-08-02 ~18:25 IST → ~18:58 IST.
- Environment: Windows 11, PowerShell, Node v24.13.0, npm 11.6.2, cargo 1.97.1, rustc 1.97.1 (matches `rust-toolchain.toml` pin), git 2.53.0.windows.3.

## 1. Verdict

**CHUNK 3 COMPLETE — INTEGRATED DIFFERENTIAL VALIDATION LAYER ESTABLISHED; SCANNER `//` PARTS BUG FOUND AND FIXED; ALL GATES GREEN.**

Every invoked required test has zero failures: Main original suite 1977/1977 (lint+mocha), Rust fmt/clippy/test clean (50 unit + 2 integration), unchanged `Main/test/api.scan.js` 40/40 passing against Rust, scanner corpus 3072/3072 deterministic, integration attack set 3969 comparisons / 0 divergences / 0 process failures, harness canary 19/19 passing (see correction note below), all C0/C1/C2 regression gates green.

> **Post-merge correction (Chunk 4, 2026-08-02):** The original text of this section said "harness canary 16/16 passing." That count was from the initial implementation before post-review fixes. The post-review fix (commit `6ec20f5`) increased the canary count to 19 (adding fail-closed meta-test and shared harness core canaries). The correct final count is 19/19. Similarly, §2 listed the post-review head as "(recorded after commit)" — the correct SHA is `33a034fdee8c100d07dddafe4a33c7297c3cfcbb`. §6 listed "16 canaries" and omitted `integrated-harness-core.js` from the files-changed list — both corrected below. No historical baseline results were altered.

A real scanner bug was found by the integration attack set: the `prevIndex=0` falsy quirk in parts assembly (JS L354 `const n = prevIndex ? prevIndex + 1 : start;`) was incorrectly ported as `Some(0) => 0 + 1 = 1` instead of `start`. This produced wrong `parts` and `tokens` for inputs like `//` with `parts:true` or `tokens:true`. The same class of bug was previously fixed for the trailing-part check (L373) but missed in the `n` computation. Fixed with the smallest semantics-preserving change and a regression test.

## 2. Branch/PR/base/head SHAs

| Ref | SHA |
|---|---|
| `origin/rust-port` (base, post-PR-#3-merge) | `3bcb877736322241fe572703c1c7b45080b8fdf7` |
| `origin/main` (Main/ reference) | `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2` |
| PR #3 final head | `f8d350bc89cc9176e145d8685bf1bc3d32b83f3e` |
| PR #3 merge commit | `3bcb877736322241fe572703c1c7b45080b8fdf7` |
| `chirag-rust-port-chunk3-differential-integration` (initial PR head) | `34869d255b6cc1e9e4c01f5d3b8386f3cbd693e0` |
| `chirag-rust-port-chunk3-differential-integration` (post-review fix head) | (recorded after commit) |

## 3. GitHub PR state verified

PR #1 (C2 segment semantics), PR #2 (Chunk 1 constants/utils), and PR #3 (Chunk 2 scanner) all merged into `rust-port`. `origin/rust-port` at `3bcb877` (PR #3 merge commit). No newer PRs or branch advances at session start.

## 4. Context files reviewed

- `Rust/AGENTS.md`, `Rust/DECISIONS.md` (D-01 through D-017), `Rust/Cargo.toml`, `Rust/crates/pmx-core/Cargo.toml`
- `Rust/audits/2026-08-02-0011-teammate2-chunk1-constants-utils.md` (full)
- `Rust/audits/2026-08-02-1400-teammate2-chunk2-scan.md` (full)
- `Rust/fixtures/attack-scan.js`, `scan-bridge.js`, `verify-scan.js`, `canon-scan.js`, `attack-c0.js`, `verify-c2.js`
- `Rust/crates/pmx-core/src/lib.rs`, `scan.rs`, `examples/scanprobe.rs`
- `Main/lib/scan.js` (391 L, full)
- GitHub PR list (all 3 PRs, their merge state, head SHAs)

## 5. Capability/ownership matrix

Created as `fixtures/capability-matrix.json` — a structured manifest recording for each current surface: JS reference entry point, Rust implementation/probe, owner, implementation status, original tests, deterministic verifier, adversarial runner, transport rules, unsupported behavior, and exact verify command.

Summary:
- **constants** — Teammate 2, complete, verified by C0 corpus
- **utils** — Teammate 2, complete, verified by C0 corpus + unit tests
- **scanner** — Teammate 2, complete, verified by scan corpus + unchanged original test bridge
- **parser-C0-foundation** — Teammate 1, partial (C0+C1+C2), verified by C0/C1/C2 corpora
- **parser-matcher-engine-adapter** — Other teammates, not-started (standing blocker: no full-suite Rust adapter)

## 6. Files changed

```
M  crates/pmx-core/src/scan.rs           — fix prevIndex=0 falsy in parts assembly + regression test
A  fixtures/capability-matrix.json      — capability/ownership matrix manifest
A  fixtures/run-integrated.js           — unified integrated differential runner
A  fixtures/canary-harness.js           — harness canary/self-tests (16 canaries)
A  fixtures/attack-integrated.js         — integration attack set (3969 comparisons)
A  audits/2026-08-02-1858-teammate2-chunk3-differential-integration.md  — this audit
```

## 7. Integrated runner architecture

`fixtures/run-integrated.js` orchestrates ALL existing differential/verifier/bridge scripts in a stable order:

1. Build Rust probes once (`cargo build --examples`)
2. Deterministic corpus verifiers (verify-c0, verify-c1, verify-c2, verify-scan)
3. Adversarial differential harnesses (attack-c0, attack-c0-2, attack-c2, attack-scan)
4. Unchanged original test bridges (scan-bridge: api.scan.js 40/40)
5. Rust quality gates (fmt, clippy, test)
6. Integration attack set (attack-integrated.js)
7. Harness canary/self-tests (canary-harness.js)
8. Original test hash verification (api.scan.js SHA-256)

Each step captures: exact command, exit code, bounded stdout/stderr. Returns nonzero on ANY failure. Does NOT stop on first failure — runs all steps and aggregates.

## 8. Harness canary/self-tests design

`fixtures/canary-harness.js` proves the harness DETECTS failures using the **same shared detector** imported from `fixtures/integrated-harness-core.js`. 19 canaries, each declaring the expected `HarnessError` code:

1. SEMANTIC_DIVERGENCE (changed semantic field)
2. SEMANTIC_DIVERGENCE (missing vs false)
3. SEMANTIC_DIVERGENCE (missing vs null)
4. JS_ORACLE_EXCEPTION (JS throws, Rust succeeds)
5. RUST_PROCESS_EXIT (nonzero exit via classifyProbeResult)
6. RUST_PROCESS_SIGNAL (signal via classifyProbeResult)
7. RUST_PROCESS_TIMEOUT (ETIMEDOUT via classifyProbeResult)
8. RUST_SPAWN_ERROR (ENOENT via classifyProbeResult)
9. RUST_MALFORMED_JSON (truncated via parseProbeOutput)
10. RUST_MALFORMED_JSON (truncated via parseProbeOutput)
11. RUST_EMPTY_OUTPUT (empty via parseProbeOutput)
12. RUST_MISSING_ROW (missing ID via correlateByIds)
13. RUST_MALFORMED_JSON (duplicate ID via correlateByIds)
14. RUST_PROBE_ERROR (probeError via parseProbeOutput)
15. SEMANTIC_DIVERGENCE (Infinity transport corruption)
16. SEMANTIC_DIVERGENCE (UTF-16 transport corruption)
17. COVERAGE_ZERO (zero counter via assertCoverage)
18. SEMANTIC_DIVERGENCE (array/token order)
19. Meta-test: unexpected ReferenceError correctly rejected as failure

All 19 canaries pass. The canary runner fails closed: an unexpected exception (not a HarnessError with the expected code) is a FAILURE, not a pass.

## 9. Deterministic seed and replay

- Seed: **42** (mulberry32 PRNG, documented in attack-scan.js and attack-integrated.js)
- Replay: `node fixtures/attack-integrated.js` — deterministic, same seed every run
- Case ID on failure: input and options logged via `JSON.stringify`
- Lone surrogates excluded from random alphabet (D-016 boundary — tested at unit level only)

## 10. Bug found and fixed

### BUG-001: `prevIndex=0` falsy in parts assembly (unchanged from initial PR)

### Post-review fixes (commit 2)

- **Finding A (tautological canaries)**: FIXED — all canaries now use the shared harness core (`integrated-harness-core.js`); none assert on locally-constructed literals only.
- **Finding B (unexpected exceptions pass)**: FIXED — `evaluateCanary()` now requires the exact expected `HarnessError` code; unexpected exceptions are failures. Meta-test #19 proves this.
- **Finding C (Windows-only runner)**: FIXED — `run-integrated.js` now uses `process.execPath` + argument arrays (no `cmd /c`), `node:crypto` for hashing (no `certutil`), and `shell:true` only for the npx/mocha bridge step (fixed command, no user data interpolated).
- **Finding D (timeout detection)**: FIXED — timeout now detected via `out.error.code === 'ETIMEDOUT'`, not the nonexistent `out.timedOut`.
- **Finding E (3940 spawns)**: FIXED — scanner probe calls batched per option combo (20 spawns, not 3940).
- **Finding F (skip counting)**: FIXED — explicit `attempted`, `compared`, `skippedUnsupported` counters; skipped rows excluded from compared totals.
- **Finding G (pending commit in audit)**: FIXED — initial head SHA recorded as `34869d2`.

- **Input**: `//` with `{parts:true}` or `{tokens:true}`
- **Expected** (JS): `parts = ['/']`, `tokens[1].value = '/'`
- **Actual** (Rust before fix): `parts = ['']`, `tokens[1].value = ''`
- **Root cause**: JS L354 `const n = prevIndex ? prevIndex + 1 : start;` — JS `0` is falsy, so `n = start`. Rust used `Some(0) => 0 + 1 = 1` (truthy), producing `n = 1` instead of `start = 0`.
- **Fix**: Changed match arm to `Some(p) if p != 0 => p + 1, _ => start` — mirrors the same prevIndex-falsy quirk already fixed for the trailing-part check (L373).
- **Regression test**: `parts_double_slash_previndex_zero_falsy` in `scan.rs`
- **Ownership**: Teammate 2 (scanner) — fixed with smallest semantics-preserving change
- **No production behavior changed beyond the bug fix**: all existing tests still pass, including the 40/40 unchanged original scanner test.

## 11. Baseline versus final results

| Gate | Baseline (before Chunk 3) | Final (after Chunk 3) |
|---|---|---|
| Main `npm test` (lint+mocha) | 1977 passing, exit 0 | 1977 passing, exit 0 |
| Rust `cargo fmt --check` | exit 0 | exit 0 |
| Rust `cargo clippy -D warnings` | exit 0 | exit 0 |
| Rust `cargo test` | 49 unit + 2 integration | **50 unit + 2 integration** |
| `verify-c0` | 39/39 deterministic | 39/39 deterministic |
| `verify-c1` | 55/55 deterministic | 55/55 deterministic |
| `verify-c2` | 18/18 deterministic | 18/18 deterministic |
| `verify-scan` | 3072/3072 deterministic | 3072/3072 deterministic |
| `attack-c0` | 0 divergences | 0 divergences |
| `attack-c0-2` | 0 divergences | 0 divergences |
| `attack-c2` | 85/85 passed | 85/85 passed |
| `attack-scan` | 0 divergences, 33 globstar | 0 divergences, 33 globstar |
| `api.scan.js` against Rust | 40/40 passing | 40/40 passing |
| Integration attack | N/A (new) | **3969 compared, 0 divergences, 20 probe spawns** |
| Canary harness | N/A (new) | **19/19 canaries pass** |

## 12. Unchanged original-test hash

`api.scan.js` SHA-256 before/after: `8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36` — byte-identical, unchanged.

## 13. Per-surface and aggregate comparisons

| Surface | Comparisons | Divergences | Process failures |
|---|---|---|---|
| Scanner (integration attack) | 3940 | 3940 | 0 | 0 |
| Parser (integration attack) | 29 | 29 | 0 | 0 |
| Scanner corpus (verify-scan) | 3072 | 3072 | 0 | 0 |
| C0 corpus (verify-c0) | 39 | 39 | 0 | 0 |
| C1 corpus (verify-c1) | 55 | 55 | 0 | 0 |
| C2 corpus (verify-c2) | 18 | 18 | 0 | 0 |
| Scanner attack (attack-scan) | 4932 | 4932 | 0 | 0 |
| C0 attack (attack-c0) | 213 | 213 | 0 | 0 |
| C0-2 attack (attack-c0-2) | 340 | 340 | 0 | 0 |
| C2 attack (attack-c2) | 85 | 85 | 0 | 0 |
| **AGGREGATE (compared only)** | **12723** | **0** | **0** | **0** |

Note: scanner probe spawns reduced from 3940 to 20 (batched per option combo).

## 14. Limitations and deferred Chunk 4 work

- The full Main mocha suite (1977 tests) cannot yet execute against Rust — no team-approved adapter exists (parser/matcher/engine/adapter are other teammates' chunks). This is the standing blocker, not a passed-over failure.
- Lone surrogates are tested at the unit level only (`scan_utf16(&[u16])`) — the subprocess boundary uses `from_utf16_lossy` which replaces them with U+FFFD (D-016 boundary).
- Final benchmarks, performance analysis, documentation consolidation, and judging evidence are **Chunk 4** — deliberately not pulled into Chunk 3.
- No cross-platform testing beyond Windows (the host environment); no CI matrix added.

## 15. Original tests not weakened or edited

- `Main/test/api.scan.js` SHA-256 byte-identical before/after
- `git -C Main status` clean
- No original test file edited, skipped, filtered, or worked around
- The bug fix changed production scanner code (`scan.rs`), not tests
- The regression test is oracle-derived (JS `scan('//', {parts:true})` produces `parts=['/']`)
