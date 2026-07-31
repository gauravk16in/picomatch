# Fuzzing Strategy

Status: strategy complete (spec §16, D-007 Accepted); implementation Phase 9. Bonus target: **Differential Fuzz Survivor +5** (≥60 continuous seconds, zero divergence, published log).

## Targets

| Target | Input | Assertions |
|---|---|---|
| `fuzz_scan` | arbitrary byte strings (UTF-8-filtered) + scan options bitset | never panics; output field set complete; base+glob reconstructs input prefix-invariant |
| `fuzz_parse` | grammar-structured patterns (arbitrary derive) + options | never panics; either Ok(state) with bounded output or the exact SyntaxError classes; maxLength honored |
| `fuzz_match` | (pattern, input, options) triples | never panics; result equals oracle JSONL batch for the same triples (differential); fallback budget respected (wall-clock bound) |

## Harnesses and tooling

- `cargo-fuzz` + `libfuzzer-sys` with `arbitrary` derive for structured inputs (Rust Fuzz Book; **requires nightly + Unix — runs in Linux CI**, not on Windows dev machines).
- Seeds: upstream suite patterns (all distinct patterns collected by the Phase 1 corpus — count recorded in `tests/corpus/v1/v1.manifest.json`, not estimated), malicious set, ReDoS PoCs, unicode/quotes/escapes packs; `tests/fuzz/seeds/`.
- Minimization: `cargo fuzz tmin <target> <crash>`; corpus hygiene `cargo fuzz cmin`.
- proptest for the *differential property* layer (pattern grammar → both engines agree with oracle JSONL batch); `proptest-regressions/` committed (Context7: failures persist + replay first).

## Differential fuzz protocol (bonus-eligible)

1. Generate structured cases with the grammar (docs/differential-testing.md §6).
2. Batch them through the Node oracle (dev tooling) → expected JSONL.
3. Replay through the Rust CLI; diff normalized results.
4. Run ≥60s continuous with `-max_total_time=60..600`; log to `fuzz/log.txt` with exec counts, coverage stats, zero divergences.
5. Any divergence → triage per differential-testing §7; minimized case committed to `tests/fixtures/`; fix and re-run from scratch (clock resets).

## Panic-safety and resource rules

- `#![forbid(unsafe_code)]` (D-009); fuzz asserts no panic/abort on ANY input including invalid UTF-8 boundaries, NULs, 64k±1 lengths, 10k-deep nesting attempts.
- Fallback engine wall-clock bound per case (explicit `backtrack_limit`, D-003); adversarial set (`+(a|aa)`, `+(ab|abab)`, `+(+(a))`, `*(*(a)|*(b))`, 65k escape runs) must complete under the documented bound — matching oracle *behavior* while bounding worst case (FR-073, NFR-004, D-011). Cases that trip the budget are classified **EXPECTED_LIMIT**: recorded with the typed `ResourceLimitError` outcome, reported in a separate published bucket, and excluded from the zero-divergence count with the exclusion rule printed in `fuzz/log.txt` (they are NOT silent passes and NOT mismatches).
- Memory: no unbounded growth — output length is linear in pattern length (NFR-006); fuzz monitors RSS on the adversarial set.

## Memory-safety tooling

- If any `unsafe` is ever introduced: `cargo +nightly miri test` on the affected crate in CI (Miri docs: UB detection, 10–100× slowdown — scoped subset). Target remains zero unsafe blocks.
- `cargo audit` in CI for dependency advisories (RustSec).
