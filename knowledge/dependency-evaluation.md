# Dependency Evaluation — Rust crates under consideration

Rule: **no dependencies are added in the bootstrap session.** This file records candidates, evidence, and the decision gates for Phase 2+. Versions recorded as of 2026-07-31 research; re-pin exactly at adoption time and record in Cargo.lock.

## Candidate engines

| Crate | Version (as of 2026-07) | License | Role candidate | Evidence | Verdict |
|---|---|---|---|---|---|
| `regex` | 1.12.4 (crates.io updated 2026-07-15) | MIT or Apache-2.0 | primary linear-time engine for the no-lookaround subset (~most patterns) | Context7 /rust-lang/regex + docs.rs: no lookaround/backrefs; worst case O(m·n); simple case folding; Unicode \p{}; `bytes` submodule; RegexBuilder size_limit/dfa_size_limit | **Proposed: primary** |
| `regex-automata` | 0.4.x (docs.rs) | MIT or Apache-2.0 | lower-level NFA/hybrid engines if captures or custom compilation needs finer control | docs.rs: nfa::thompson supports captures; hybrid lazy DFA cannot resolve capture offsets; all O(m·n) | **Proposed: only if regex API insufficient** (defer) |
| `fancy-regex` | 0.17.0 (docs.rs latest mid-2026) | MIT or Apache-2.0 | lookaround-dependent subset (negated extglobs `!(...)`, pattern negation `^(?!...).*$`, extglob close `(?:(?!X))STAR`) | repo/docs: backtracking VM delegating to `regex` when no fancy features; exponential blowup possible in worst case | **Proposed: fallback engine behind a step limit**, decision D-003 |
| `regex-lite` | current | MIT/Apache | minimal regex if binary size matters | mentioned in regex docs | Deferred (stretch) |

## NOT candidates for the semantic engine (documented to avoid misuse)

| Crate | Why not |
|---|---|
| `glob` (0.3) | MatchOptions only (case_sensitive, require_literal_separator, require_literal_leading_dot); ASCII-only case folding; no extglob/brace/posix classes; cannot reach picomatch parity. Usable only as a differential comparator. |
| `globset` | gitignore-style sets; literal_separator option; no extglob/brace expansion semantics like picomatch. Comparator only. |
| `devongovett/glob-match` | fast in-place matcher with captures and brace expansion, but brace nesting ≤10 and semantics differ from picomatch (no extglob). Reference/comparator only. |
| `oxc-project/fast-glob` | glob-match fork; same semantic-gap caveat. Comparator only. |
| `satch` (0.1.0) | claims picomatch/micromatch-compatible Rust implementation (MIT, 899 SLoC, ~390 downloads). **Pre-existing port — using it as the implementation would be a plagiarism risk. May be studied ONLY for provenance/comparison, never copied.** |
| `Maidang1/picomatch-rs` (+ npm @maidang1/picomatch-rs) | Rust core + napi Node binding with compatibility shims for `./lib/picomatch`, `./posix`, `./lib/scan`. **Pre-existing port of the same project — same prohibition: do not copy code; document provenance only.** |

## Test/benchmark tooling candidates

| Crate/tool | Version | License | Role | Evidence | Verdict |
|---|---|---|---|---|---|
| `proptest` | current (Context7 /proptest-rs/proptest) | MIT/Apache | differential property tests vs JS oracle JSONL | failure persistence via proptest-regressions/; seeds replayed first; FileFailurePersistence::WithSource; commit regressions to VCS | **Proposed** |
| `criterion` | current (/bheisler/criterion.rs) | MIT/Apache | benchmark harness (parse/compile, cold, cached, adversarial) | defaults sample 100, warm-up 3s, measurement 5s; baselines --save-baseline/--baseline(-lenient); Flat sampling for slow ops | **Proposed** |
| `cargo-fuzz` + `libfuzzer-sys` | current | MIT/Apache | structure-aware fuzzing of parser/matcher | Rust Fuzz Book: nightly + Unix-like only (NOT Windows); arbitrary derive; tmin/cmin | **Proposed: run on Linux CI** |
| `arbitrary` (via libfuzzer-sys) | current | MIT/Apache | structured fuzz inputs (pattern grammar) | same as above | **Proposed** |
| Miri (nightly component) | nightly | — | UB detection if any unsafe appears | cargo +nightly miri test; 10–100× slowdown; run on unsafe-touching subset | **Conditional (only if unsafe introduced)** |
| `cargo-careful` | current | MIT/Apache | extra std checks without nightly | recorded as lighter alternative | Optional |
| `serde` + `serde_json` | current | MIT/Apache | JSONL corpus parsing in runners/tools | standard | **Proposed (dev/tooling)** |
| `napi-rs` | current | MIT | STRETCH ONLY: Node-API binding if team chooses JS-API-compat surface | napi.rs docs; prebuilt binaries | Stretch, gate required |
| `cargo-make` or `just` | current | MIT/Apache | single-command task runner | cargo-make Makefile.toml flows | Optional (plain cargo may suffice) |

## Toolchain facts

- Rust stable **1.95.0**, beta 1.96.0, nightly 1.97.0 as of 2026-06/07 (releases.rs). Proposed pin: stable 1.95.0 via `rust-toolchain.toml`; MSRV = the pinned stable (no lower MSRV promise during hackathon).
- cargo-fuzz requires nightly + Unix → fuzzing runs in Linux CI job, not locally on this Windows dev machine.

## Dependency policy (proposed, to ratify in DECISIONS.md D-005)

1. Runtime deps kept minimal: target `regex` (+ possibly `fancy-regex`) only; everything else dev-dependency.
2. Every new dep requires: license check (MIT/Apache/BSD/ISC/CC0 ok), docs.rs review, `cargo audit` clean, and an entry added to this file with rationale.
3. No `unsafe` in our code without written justification per block; deps' internal unsafe is acceptable (regex/regex-automata are memory-safe by construction).
4. Pin exact versions in Cargo.lock and commit it.
