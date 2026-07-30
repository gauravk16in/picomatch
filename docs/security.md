# Security and Failure Modes

Status: analysis complete (spec §14); hardening Phase 9. Evidence: GHSA-c2c7-rcm5-vvqj, GHSA-3v7f-55p6-f55p, lib/parse.js safeguard code, local probes (2026-07-31), issue #175.

## Advisory history (verified)

| ID | Class | Affected | Fixed | What it is |
|---|---|---|---|---|
| CVE-2026-33671 / GHSA-c2c7-rcm5-vvqj | ReDoS (CWE-1333), CVSS 7.5 | <4.0.4, <3.0.2, <2.3.2 | 4.0.4/3.0.2/2.3.2 | extglob quantifiers `+()`/`*()` with overlapping alternatives or nesting compile to catastrophic-backtracking regexes (e.g. `+(a|aa)` ~2s @41 chars; `+(+(a))` ~29s @33 chars). Fix = `maxExtglobRecursion` safeguard (commit 5eceecd) + branch-preserving rewrite (commit 6289307 in 4.0.5). |
| CVE-2026-33672 / GHSA-3v7f-55p6-f55p | Method injection (CWE-1321), CVSS 5.3 | same lines | same | `POSIX_REGEX_SOURCE` inherited `Object.prototype`, so `[[:constructor:]]` resolved inherited methods into the generated regex. Fix = `__proto__: null` (commit 4516eb5). |
| Issue #175 (OPEN, third-party audit, not a CVE) | incomplete ReDoS fix | ≤4.0.5 (verified on our baseline) | — | `hasRepeatedCharPrefixOverlap` only catches single-char repeats; `+(ab|abab)` still compiles to `^(?:(?=.)(?:ab|abab)+)$` — verified locally 2026-07-31: n=35 (len 71) → 963 ms; exponential. |
| Issue #144 (fixed in 4.0.3) | exception | <4.0.3 | 4.0.3 | pattern containing `constructor` threw via REPLACEMENTS prototype lookup (same root class as CVE-2026-33672). |

## Threat / failure matrix → port controls

| Threat | Oracle behavior today | Port control | Req |
|---|---|---|---|
| Pattern > 65536 chars | SyntaxError (exact message) | identical check pre-allocation | NFR-001 |
| Risky repeated extglobs (`+(a|aa)`, `+(*|?)`, `+(+(a))`, `*(+(a))`) | literalized or safe-rewrite per `maxExtglobRecursion` | 1:1 port of analyzeRepeatedExtglob + tests | NFR-002, FR-064 |
| `+(ab|abab)` (issue #175) | **compiles to catastrophic regex** (baseline) | reproduce oracle behavior (D-011); document; fallback engine step budget bounds OUR worst case; Bug Catcher report | D-011, NFR-004 |
| Catastrophic backtracking generally | JS engine exponential on some non-risky lookahead patterns | primary engine linear-time; fallback step-budgeted with deterministic no-match degradation | FR-073 |
| Malformed delimiters (`[( { (` unclosed) | escaped literal (non-strict) / SyntaxError (strict) | identical | FR-090 |
| Prototype/property tricks (`constructor`, `__proto__`, `toString`) | treated as literals (post-fix) | closed maps by construction (no prototype chain in Rust) | NFR-005 |
| Path-separator ambiguity (`\` on windows) | `[\\/]` classes + format normalization | identical tables | FR-080..082 |
| Unicode edge cases (case fold, astral chars) | JS `i` simple fold; UTF-16 indexing | regex simple fold; byte-index discipline; corpus unicode sets | G-10 |
| Panics/aborts | none expected | `#![forbid(unsafe_code)]`, Result-based errors, fuzz-proven | NFR-003, FR-074 |
| Allocation/memory growth | bounded by output ∝ input | same bound; fuzz RSS monitor | NFR-006 |
| Recursion depth | iterative in JS (loops) | iterative port; expression-after-close re-parse recursion mirrors JS (bounded by pattern length) | NFR-006 |
| Integer overflow | JS doubles | usize arithmetic checked in length paths | NFR-001 |
| DoS via huge inputs (64k input strings) | linear-ish on safe patterns | linear primary engine; documented fallback bound | FR-073 |

## Unsafe-code policy (D-009)

`#![forbid(unsafe_code)]` in our crates. Exceptions need a DECISIONS.md entry, minimal scope, and a Miri CI run. Submission reports the exact `unsafe` count (target 0 → Zero Unsafe bonus +5, threshold per kickoff Discord).

## Bug Catcher candidates (document, don't fix — D-011)

1. Issue #175: add our reproduction evidence (963ms @ len 71, Node v24.13.0, Windows 11) as a comment candidate on the existing issue (no duplicate filing). Owner: team, Phase 9.
2. Any NEW divergence found by differential fuzzing gets the same treatment: minimized PoC, upstream issue filed during the event, submission reference.

## Residual risk statement

The port can only be *at least as safe* as the oracle: we reproduce its behavior (including the #175 hole) while bounding our own worst case via the fallback budget. Untrusted-pattern deployments should still follow the GHSA mitigations (noextglob for untrusted patterns, allowlists, isolation) — documented for downstream users in README.
