# Review Remediation — Verification & Gate Execution Logs

This document presents the complete execution output from all quality gates run against the post-remediation codebase (`review-remediation` branch @ commit `90ee46b`).

---

## 1. Rust Formatter Check (`cargo fmt --check`)

```
$ cargo fmt --check
Exit code: 0
Status: PASS (0 formatting differences)
```

---

## 2. Clippy Linter (`cargo clippy --workspace --all-targets -- -D warnings`)

```
$ cargo clippy --workspace --all-targets -- -D warnings
   Compiling pmx-node v0.1.0 (/Users/abhinav/Projects/pico-big/picomatch-rust/crates/pmx-node)
    Checking pmx-core v0.1.0 (/Users/abhinav/Projects/pico-big/picomatch-rust/crates/pmx-core)
    Checking pmx-exec v0.1.0 (/Users/abhinav/Projects/pico-big/picomatch-rust/crates/pmx-exec)
    Checking pmx-cli v0.1.0 (/Users/abhinav/Projects/pico-big/picomatch-rust/crates/pmx-cli)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.69s
Exit code: 0
Status: PASS (0 warnings)
```

---

## 3. Workspace Unit & Integration Tests (`cargo test --workspace`)

```
$ cargo test --workspace
     Running unittests src/lib.rs (pmx_core)

running 71 tests
test constants::tests::char_code_constants_match_reference_values ... ok
test constants::tests::posix_chars_bytes_match_reference ... ok
test constants::tests::windows_chars_bytes_match_reference ... ok
test constants::tests::extglob_chars_bytes_match_reference ... ok
test constants::tests::glob_chars_selects_by_strict_true ... ok
test constants::tests::replacements_exact_keys_and_near_misses ... ok
test constants::tests::posix_regex_source_all_14_classes_bytes ... ok
test parse::fastpath::tests::test_fastpaths_extension_chain ... ok
test parse::fastpath::tests::test_fastpaths_options ... ok
test parse::fastpath::tests::test_fastpaths_templates_posix ... ok
test parse::fragments::tests::globstar_fragment_bytes_match_reference ... ok
test parse::fragments::tests::globstar_fragment_bytes_match_reference_windows ... ok
test parse::inline_fastpath::tests::backref_replace_bytes ... ok
test parse::main_loop::tests::test_brackets_and_posix_classes ... ok
test parse::main_loop::tests::test_bug001_unclosed_brace_recovery ... ok
test parse::main_loop::tests::test_bug002_prepend_dotslash_collapse ... ok
test parse::main_loop::tests::test_dot_token_types ... ok
test parse::main_loop::tests::test_brace_alternation_and_ranges ... ok
test parse::main_loop::tests::test_dots_and_slashes ... ok
test parse::main_loop::tests::test_extglob_simple ... ok
test parse::main_loop::tests::test_f3_brace_literal_close_empty_output ... ok
test parse::main_loop::tests::test_f2_extglob_rest_dotted ... ok
test parse::main_loop::tests::test_f4_close_paren_negative_count ... ok
test parse::main_loop::tests::test_f6_negate_peek3_only_question ... ok
test parse::main_loop::tests::test_f7_expand_range_reversed ... ok
test parse::main_loop::tests::test_leading_dotslash_collapse ... ok
test parse::main_loop::tests::test_qmark_tokens_and_guards ... ok
test parse::main_loop::tests::test_star_tokens_and_guards ... ok
...
test result: ok. 71 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

     Running tests/c0_foundation.rs (pmx_core)
running 2 tests
test c0_staged_rows_pending_count ... ok
test c0_active_rows_match_reference ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.39s

     Running unittests src/lib.rs (pmx_exec)
running 1 test
test tests::engine_boundary_astral_class_is_documented ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

Exit code: 0
Status: PASS (74 tests passed, 0 failures)
```

---

## 4. Benchmark Artifact Verification (`verify-artifacts.js`)

```
$ node benchmarks/verify-artifacts.js benchmarks/results
SKIP legacy artifact: 2026-08-02T17-29-50-win32-raw.json (schema 1, superseded — not final evidence)
SKIP legacy artifact: 2026-08-02T17-32-13-win32-raw.json (schema 1, superseded — not final evidence)
NOTE: scanbench binary not present locally; hash binding recorded but not recomputed.
NOTE: scanprobe binary not present locally; hash binding recorded but not recomputed.
All final artifacts verified (1 final set: raw + summary + schedule + sidecars + independent summary recomputation; 2 legacy set(s) skipped as superseded).
Exit code: 0
Status: PASS
```

---

## 5. Benchmark Canary Suite (`bench-canaries.js`)

```
$ node benchmarks/bench-canaries.js
  stats synthetic fixture OK (point=sqrt(5)~2.236068, CI=[2.0000,2.5000])

=== BENCHMARK CANARY RESULTS ===
Executed: 69/69
Failed: 0
BENCHMARK CANARIES PASSED: all 69 mutations detected.
Exit code: 0
Status: PASS
```

---

## 6. Integrated Differential Validation Suite (`run-integrated.js`)

```
$ node fixtures/run-integrated.js
=== Integrated Differential Validation Runner ===
Seed: 42
Rust dir: /Users/abhinav/Projects/pico-big/picomatch-rust
Main dir: /Users/abhinav/Projects/pico-big/Main
Timestamp: 2026-08-03T11:02:15.519Z
Platform: darwin

[0/8] Building Rust probes (cargo build --examples)...
  OK: probes built.

[1/8] Deterministic corpus verifiers:
  PASS verify-c0 (exit=0): verify-c0: 39/39 cases deterministic, corpus sha256 42d839b2264c…
  PASS verify-c1 (exit=0): verify-c1: 55/55 cases deterministic, corpus sha256 b5a6986ee9e6…
  PASS verify-c2 (exit=0): verify-c2: 487/487 cases deterministic, corpus sha256 0699fd84f579…
  PASS verify-scan (exit=0): verify-scan: 3216/3216 cases deterministic, corpus sha256 03eb9a7c264f…

[2/8] Adversarial differential harnesses:
  PASS attack-c0 (exit=0): divergences: 0
  PASS attack-c0-2 (exit=0): divergences: 0
  PASS attack-c2 (exit=0): C2 Attack Results: 85/85 passed, 0 failed.
  PASS attack-scan (exit=0): attack-scan: inputs=411 compared=4932 divergences=0 rustProcessFailures=0 globstarTokenComparisons=33

[3/8] Unchanged original test bridges:
  PASS scan-bridge (exit=0): 40 passing, 0 failing

[4/8] Rust quality gates:
  PASS cargo-fmt (exit=0): (no output)
  PASS cargo-clippy (exit=0): (no output)
  PASS cargo-test (exit=0): 0 passed, 0 failed

[5/8] Integration attack set:
  PASS attack-integrated (exit=0): INTEGRATION ATTACK PASSED: 4189 compared, 0 divergences, 0 process failures

[6/8] Harness canary/self-tests:
  PASS canary-harness (exit=0): CANARY HARNESS PASSED: all 19 canaries detected their faults.

[7/8] Benchmark canary/self-tests:
  PASS bench-canaries (exit=0): BENCHMARK CANARIES PASSED: all 69 mutations detected.

[8/8] Original test hash verification:
  PASS test-hash: 8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36 (matches expected)

=== AGGREGATE SUMMARY ===
Steps passed: 16
Steps failed: 0
Total steps: 16

INTEGRATED VALIDATION PASSED: all 16 steps green.
Exit code: 0
Status: PASS
```
