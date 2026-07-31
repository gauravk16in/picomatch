# Rust Design Options — Engine Strategy Comparison

Status: analysis complete; decision **D-003 (hybrid, Proposed)** pending Phase 5 validation. No dependencies added in bootstrap.

## The constraint (verified)

The oracle emits JS regex sources rich in lookarounds: dot guards `(?!.)`, `(?=.)`, negated extglobs `(?:(?!X))STAR`, top-level negation `^(?!S).*$`. Rust `regex` **does not support look-around or backreferences** and guarantees worst-case `O(m·n)` (docs.rs/regex; Context7 /rust-lang/regex). JS RegExp is a backtracking engine (exponential worst case) — the very source of CVE-2026-33671. So the port must (a) reproduce behavior exactly, (b) not reintroduce unbounded backtracking beyond what the oracle has, and (c) stay honest about source-string parity (D-002).

## Strategy comparison

| Axis | S1: compile to `regex` | S2: `regex-automata` direct | S3: custom AST + matcher/VM | S4: hybrid (regex + guarded fallback) |
|---|---|---|---|---|
| Semantic fidelity | fails on lookaround subset (~negation, dot guards) | same lookaround gap as S1 (no engine in the crate supports it) | highest possible but must re-prove every regex behavior | high: regex where exact, fallback for the rest |
| ReDoS resistance | linear-time guaranteed | linear-time guaranteed | exponential if backtracking; must invent budgets | linear for primary; explicit backtrack_limit on fallback |
| Capture support | yes (capture groups, exec) | NFA Thompson yes; hybrid DFA no capture offsets | must build | yes via regex + fancy-regex captures |
| Unicode/case folding | simple fold ≈ JS `i` (G-10) | same | self-managed | same as regex |
| Windows/POSIX handling | orthogonal (pattern-level) | orthogonal | orthogonal | orthogonal |
| Performance | excellent | excellent (more control, more work) | unknown, likely slower | excellent common case, bounded worst |
| Implementation complexity | low | medium-high (expert API) | very high | medium |
| Dependency/license impact | +regex (MIT/Apache) | +regex-automata (MIT/Apache) | none | +regex, +fancy-regex (MIT/Apache) |
| Testability | easy (differential) | easy | hard (new engine needs its own proof) | easy (same corpus both engines) |

## Candidates for the fallback (lookaround subset)

- **fancy-regex 0.19.0** (MIT per registry; current as of 2026-07-31): backtracking VM delegating to `regex` for non-fancy spans; supports lookaround/backrefs; worst case exponential (docs.rs/fancy-regex; repo README). **Chosen as the fallback engine under an explicit `backtrack_limit`** (candidate 1,000,000 steps = crate default, lib.rs-verified); budget trip surfaces as typed `ResourceLimitError` (D-003, DV-6), never silent no-match.
- **Hand-rolled mini backtracker: REMOVED from the committed plan (2026-07-31).** A prose-only contingency is not an implementation plan; if Phase 7 differential evidence shows a fancy-regex mismatch class, a bounded spec (constructs, input model, complexity bound, operation budget, captures, errors, trigger criteria, differential tests) is written as a new ADR before any implementation (D-003 reversal trigger).
- regex-automata PikeVM: still no lookaround → cannot serve alone.

## Decision (D-003, Accepted 2026-07-31)

Primary `regex`; fallback `fancy-regex` (explicit `backtrack_limit`, typed `ResourceLimitError` on trip — DV-6) for the lookaround subset; no mini-backtracker in the committed plan (reversal trigger: bounded spec as new ADR if Phase 7 evidence demands). Engine selection deterministic via source inspection `(?=` / `(?!` / `(?<`). Every corpus case records the selected engine; Phase 9 fuzzes both paths.

## Prior art note (non-copy, D-010)

`Maidang1/picomatch-rs` (napi binding) and `satch` (899 SLoC) exist and target the same semantics; their approaches were **not** read. Our design is derived from the JS oracle + the constraints above. Related crates `glob`, `globset`, `glob-match`, `fast-glob` are semantic mismatches (no extglobs/POSIX classes/picomatch dot rules) and are used only as comparators (knowledge/dependency-evaluation.md).
