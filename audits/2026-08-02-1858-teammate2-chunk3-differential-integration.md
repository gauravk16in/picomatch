# Teammate 2 — Chunk 3 audit: integrated differential validation

- Session type: Teammate 2 (Supporting Modules + Testing) Chunk 3 — integrated differential validation layer, harness canary/self-tests, deterministic integration attack set, scanner bug fix, audit, PR. No subagents; every command, read, probe, fetch, edit, and test run personally.
- Working branch: `chirag-rust-port-chunk3-differential-integration` (cut from `origin/rust-port` `3bcb877`). Session window: 2026-08-02 ~18:25 IST → ~18:58 IST.
- Environment: Windows 11, PowerShell, Node v24.13.0, npm 11.6.2, cargo 1.97.1, rustc 1.97.1 (matches `rust-toolchain.toml` pin), git 2.53.0.windows.3.

## 1. Verdict

**CHUNK 3 COMPLETE — INTEGRATED DIFFERENTIAL VALIDATION LAYER ESTABLISHED; SCANNER `//` PARTS BUG FOUND AND FIXED; ALL GATES GREEN.**

Every invoked required test has zero failures: Main original suite 1977/1977 (lint+mocha), Rust fmt/clippy/test clean (50 unit + 2 integration), unchanged `Main/test/api.scan.js` 40/40 passing against Rust, scanner corpus 3072/3072 deterministic, integration attack set 3969 comparisons / 0 divergences / 0 process failures, harness canary 16/16 passing, all C0/C1/C2 regression gates green.

A real scanner bug was found by the integration attack set: the `prevIndex=0` falsy quirk in parts assembly (JS L354 `const n = prevIndex ? prevIndex + 1 : start;`) was incorrectly ported as `Some(0) => 0 + 1 = 1` instead of `start`. This produced wrong `parts` and `tokens` for inputs like `//` with `parts:true` or `tokens:true`. The same class of bug was previously fixed for the trailing-part check (L373) but missed in the `n` computation. Fixed with the smallest semantics-preserving change and a regression test.

## 2. Branch/PR/base/head SHAs

| Ref | SHA |
|---|---|
| `origin/rust-port` (base, post-PR-#3-merge) | `3bcb877736322241fe572703c1c7b45080b8fdf7` |
| `origin/main` (Main/ reference) | `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2` |
| PR #3 final head | `f8d350bc89cc9176e145d8685bf1bc3d32b83f3e` |
| PR #3 merge commit | `3bcb877736322241fe572703c1c7b45080b8fdf7` |
| `chirag-rust-port-chunk3-differential-integration` (this PR) | (pending commit) |

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

`fixtures/canary-harness.js` proves the harness DETECTS failures using test-only dependency injection (fake probe responses, deliberately corrupted data, simulated process failures). 16 canaries:

1. Changed semantic field (flip isGlob)
2. Missing vs explicit false (delete isGlob)
3. Missing vs explicit null (isGlob = null)
4. JS oracle exception (simulated throw)
5. Rust probe nonzero exit (status=1)
6. Rust probe signal/timeout (signal=SIGTERM)
7. Malformed JSON (truncated)
8. Truncated JSON
9. Empty output
10. Missing row
11. Infinity transport corruption ({__num:"Infinity"} vs null)
12. UTF-16 transport corruption (__u16 vs mojibake)
13. Coverage counter zero (globstarTokenComparisons=0)
14. Boolean vs undefined (false vs undefined)
15. Zero vs falsy (0 vs undefined)
16. Array order (token swap)

All 16 canaries pass (harness detects each fault).

## 9. Deterministic seed and replay

- Seed: **42** (mulberry32 PRNG, documented in attack-scan.js and attack-integrated.js)
- Replay: `node fixtures/attack-integrated.js` — deterministic, same seed every run
- Case ID on failure: input and options logged via `JSON.stringify`
- Lone surrogates excluded from random alphabet (D-016 boundary — tested at unit level only)

## 10. Bug found and fixed

### BUG-001: `prevIndex=0` falsy in parts assembly

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
| Integration attack | N/A (new) | **3969 compared, 0 divergences** |
| Canary harness | N/A (new) | **16/16 canaries pass** |

## 12. Unchanged original-test hash

`api.scan.js` SHA-256 before/after: `8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36` — byte-identical, unchanged.

## 13. Per-surface and aggregate comparisons

| Surface | Comparisons | Divergences | Process failures |
|---|---|---|---|
| Scanner (integration attack) | 3940 | 0 | 0 |
| Parser C0 (integration attack) | 29 | 0 | 0 |
| Scanner corpus (verify-scan) | 3072 | 0 | 0 |
| C0 corpus (verify-c0) | 39 | 0 | 0 |
| C1 corpus (verify-c1) | 55 | 0 | 0 |
| C2 corpus (verify-c2) | 18 | 0 | 0 |
| Scanner attack (attack-scan) | 4932 | 0 | 0 |
| C0 attack (attack-c0) | 213 | 0 | 0 |
| C0-2 attack (attack-c0-2) | 340 | 0 | 0 |
| C2 attack (attack-c2) | 85 | 0 | 0 |
| **AGGREGATE** | **12723** | **0** | **0** |

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
