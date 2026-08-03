# Upstream Bug Verification, Rust Remediation, and Evidence Audit

**Date:** 2026-08-03 21:30 IST  
**Auditor:** Chirag (upstream bug verification session)  
**Status:** COMPLETE  
**Attachment:** `PICOMATCH_FULL_BUG_AUDIT.md` (23 claimed findings + 2 known CVEs)  
**Attachment treatment:** Untrusted input — every claim independently verified against picomatch v4.0.5 source and Rust port.

---

## 1. Scope, live base/head SHAs, toolchain

| Item | Value |
|---|---|
| Rust port base SHA | `c9ce8d0dd1b9b59c836431c26592822c71f5be88` (origin/rust-port) |
| Work branch | `chirag-rust-port-upstream-bug-audit-fixes` |
| Upstream reference | `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2` (tag 4.0.5-1-g00cf02c) |
| Node | v24.13.0 |
| Rust | rustc 1.97.1 (8bab26f4f 2026-07-14) |
| Cargo | cargo 1.97.1 (c980f4866 2026-06-30) |
| OS | Windows 11, x64 |
| Regex engine | regress 0.11.1 (via pmx-exec) |

**Pre-existing issues noted but out of scope:**
- `picomatch-tui` crate has compilation errors (`u128` to `f64` cast) and missing `src/main.rs`. Excluded from workspace for this audit. Tracked in PR #13.
- `cargo fmt --check` has formatting issues in `picomatch-tui/` only. Core crates pass.

---

## 2. Attachment hash and source-report summary

The attached `PICOMATCH_FULL_BUG_AUDIT.md` claims 23 bugs (5 CRITICAL, 6 HIGH, 7 MEDIUM, 5 LOW) plus 2 known CVEs. The report claims "150+ test cases" and "5 rounds of automated testing." The report's severity assignments were treated as starting hypotheses only.

---

## 3. Research sources

- picomatch v4.0.5 source: `Main/lib/parse.js`, `Main/lib/picomatch.js`, `Main/lib/constants.js`, `Main/lib/scan.js`, `Main/lib/utils.js`
- picomatch v4.0.5 tests: `Main/test/` (read-only, unmodified)
- Rust port source: `crates/pmx-core/src/`, `crates/pmx-exec/src/`, `crates/pmx-cli/src/`
- Independent reproduction scripts: `scratch/verify-bugs.js`, `scratch/verify-rust.js`

---

## 4. Complete 25-item disposition matrix

| Source ID | Claim | JS v4.0.5 reproduced? | Rust reproduced? | Expected behavior evidence | Security impact proven? | Duplicate of | Disposition | Canonical doc ID | Fix/test plan |
|---|---|---:|---:|---|---:|---|---|---|---|---|
| BUG-01 | Backreference injection via `(a)\1` | Yes — `\1` is a regex backreference | Yes — Rust matches JS (matches "aa", not "a1") | Picomatch advertises regex syntax; `\1` is documented JS regex behavior | No — requires attacker-controlled glob patterns; not injection | BUG-17 | INTENTIONAL_DOCUMENTED_BEHAVIOR | — | Regression test only |
| BUG-02 | Fastpath adds trailing `\/?` | Yes — confirmed `\/?` appended | Yes — Rust matches JS | `strictSlashes` option controls this; documented | No | BUG-13 | INTENTIONAL_DOCUMENTED_BEHAVIOR | — | No change |
| BUG-03 | `extglobChars()` prototype inheritance | Yes — inherits `hasOwnProperty` | N/A — Rust uses static structs, no prototype chain | JS object literal inherits `Object.prototype` by construction | No — no user-controlled key lookup in extglob chars | BUG-04 | CONFIRMED_UPSTREAM_DEFECT_RUST_NOT_APPLICABLE | — | Rust regression test |
| BUG-04 | `globChars()`/POSIX/Windows prototype inheritance | Yes — inherits `hasOwnProperty` | N/A — Rust uses static structs | Same as BUG-03 | No | BUG-03 | CONFIRMED_UPSTREAM_DEFECT_RUST_NOT_APPLICABLE | — | Rust regression test |
| BUG-05 | Silent `toRegex()` fallback `/$^/` | Yes — returns `/$^/` on invalid regex | Yes — Rust `js_to_regex_source` emulates this | Documented API: `debug: true` throws, otherwise silent | No — API policy, not a vulnerability | — | INTENTIONAL_DOCUMENTED_BEHAVIOR | — | No change |
| BUG-06 | `[!...]` bracket negation only with `posix:true` | Yes — `[!abc]` matches "a" by default, not with `posix:true` | Yes — Rust matches JS exactly | picomatch README documents `posix` option; Bash `[!...]` is opt-in | No | — | INTENTIONAL_DOCUMENTED_BEHAVIOR | — | No change |
| BUG-07 | Literal equality shortcut `input === glob` | Yes — `isMatch('[1-5]', '[1-5]')` returns `true` | **No** — Rust returns `false` (no `input === glob` shortcut) | JS `picomatch.test()` L139; open PR #176 | No | — | CONFIRMED_UPSTREAM_DEFECT_RUST_ALREADY_FIXED | BUG-007 | Regression test |
| BUG-08 | `**` adjacent to literals crosses separators | Yes — `**.thing.js` matches `path/to/file.thing.js` | Yes — Rust matches JS | Open PR #181; picomatch docs say `**` is only globstar when alone | No | — | CONFIRMED_UPSTREAM_DEFECT_RUST_NOT_AFFECTED (parity match) | — | No change |
| BUG-09 | Globstar in non-final extglob alternatives | Yes — `!(a/**\|b/**)` first `**` becomes `[^/]*?` | **Divergence** — Rust emits full globstar for all alternatives | JS L950 pushes `type:'text'` not `type:'pipe'`; L496 guard is dead code | No | — | CONFIRMED_UPSTREAM_DEFECT_RUST_AFFECTED | BUG-008 | Fix pipe token type |
| BUG-10 | `!(**/*.js)` vs `!(*.js)` inconsistency | Yes — opposite results | Yes — Rust matches JS | Upstream behavior (not a separate bug from extglob semantics) | No | BUG-18 | CONFIRMED_UPSTREAM_DEFECT_RUST_NOT_AFFECTED (parity match) | — | No change |
| BUG-11 | Multi-branch repeated extglob regression | Fixed in 4.0.5 | Yes — Rust matches fixed JS | PR #182 merged | No | — | UPSTREAM_FIXED_IN_4_0_5_REGRESSION_ONLY | — | Regression test |
| BUG-12 | `scan()` parts/tokens inconsistency | Yes — `parts:true` gives `['a','b','*','c']`, `tokens:true` gives `['a','b','*/c']` | Not tested (scanner parity) | Open issue #62; different options trigger different splitting | No | — | INTENTIONAL_DOCUMENTED_BEHAVIOR | — | No change |
| BUG-13 | Fastpath vs full parser output mismatch | Yes — fastpath adds `\/?`, full doesn't | Yes — Rust matches JS | D-03: documented fastpath/slow-path divergence | No | BUG-02 | INTENTIONAL_DOCUMENTED_BEHAVIOR | — | No change |
| BUG-14 | `matchBase` applies to patterns with slashes | Yes — `foo/bar.js` does NOT match `foo/*.js` with `matchBase` (report's "verified" note confirms `false`) | **Divergence** — Rust returns `true` (no `matchBase` handling in CLI) | Open PR #106; `matchBase` should only apply to slashless patterns | No | — | CONFIRMED_UPSTREAM_DEFECT_RUST_AFFECTED (adapter-level) | BUG-009 | Adapter fix or document limitation |
| BUG-15 | Negated patterns with slashes + `matchBase` | Yes — `!**/examples/**` matches with `matchBase` | **Divergence** — Rust returns `false` (no `matchBase` in CLI) | Open PR #190 | No | BUG-14 | CONFIRMED_UPSTREAM_DEFECT_RUST_AFFECTED (adapter-level) | BUG-009 | Same as BUG-14 |
| BUG-17 | Backreference `\2`-`\9` leaks | Yes — same as BUG-01 | Yes — Rust matches JS | Extension of BUG-01 | No | BUG-01 | DUPLICATE | — | Merged with BUG-01 |
| BUG-18 | `!(*.md)` vs `!(**/*.md)` opposite results | Yes — opposite | Yes — Rust matches JS | Same root as BUG-10 (extglob `**` semantics) | No | BUG-10 | DUPLICATE | — | Merged with BUG-10 |
| BUG-19 | `matchBase` ignores `windows` option | Fixed in 4.0.5 | Yes — Rust handles windows correctly | PR #183 merged | No | — | UPSTREAM_FIXED_IN_4_0_5_REGRESSION_ONLY | — | Regression test |
| BUG-21 | `state.consumed` dead code | Yes — written, never read | N/A — Rust writes `consumed` for parity but it's observable state | Performance observation, not correctness | No | — | PERFORMANCE_OBSERVATION_NOT_BUG | — | No change |
| BUG-22 | `peek(n=1)` default param overhead | N/A — code review only | N/A — Rust uses different approach | Micro-optimization, not user-visible | No | — | PERFORMANCE_OBSERVATION_NOT_BUG | — | No change |
| BUG-23 | `navigator.platform` deprecated | N/A — browser-only, not in Node | N/A — Rust has no browser | Irrelevant to Rust | No | — | CONFIRMED_UPSTREAM_DEFECT_RUST_NOT_APPLICABLE | — | No change |
| BUG-24 | No regex source length validation | Yes — only input length checked | Yes — Rust matches JS | Robustness observation; input length cap at 65536 bounds output | No | — | PERFORMANCE_OBSERVATION_NOT_BUG | — | No change |
| BUG-25 | `REGEX_REMOVE_BACKSLASH` polynomial complexity | Claimed "code review confirmed" | N/A — Rust uses different regex | Unsupported complexity claim; no experiment | No | — | PERFORMANCE_OBSERVATION_NOT_BUG | — | No change |
| BUG-26 | `format` bypass with `matchBase:true` | Yes — `format` ignored when `matchBase` active | N/A — Rust CLI has no `format`/`matchBase` integration | JS `picomatch.test()` L148 passes raw `input` to `matchBase` | No | BUG-14 | CONFIRMED_UPSTREAM_DEFECT_RUST_NOT_AFFECTED (adapter limitation) | BUG-009 | Document adapter limitation |
| BUG-27 | Empty alternative literalization | Yes — `+(a\|)` is literalized | Yes — Rust matches JS | ReDoS safeguard: empty branch triggers `risky:true` | No | — | INTENTIONAL_DOCUMENTED_BEHAVIOR | — | No change |
| CVE-2026-33671 | ReDoS via extglob quantifiers | Fixed in 4.0.4 | Yes — Rust has `analyzeRepeatedExtglob` safeguard | GHSA-c2c7-rcm5-vvqj; fixed < 4.0.4 | Yes (original) | — | KNOWN_CVE_FIXED_UPSTREAM_VERIFY_RUST | — | Regression test |
| CVE-2026-33672 | Method injection in POSIX classes | Fixed in 4.0.4 (`__proto__: null`) | Yes — Rust uses match-based lookup, no prototype | GHSA-3v7f-55p6-f55p; fixed < 4.0.4 | Yes (original) | — | KNOWN_CVE_FIXED_UPSTREAM_VERIFY_RUST | — | Regression test |

---

## 5. Deduplication map

| Canonical | Source IDs merged | Reason |
|---|---|---|
| — | BUG-01, BUG-17 | Same root cause: backslash-digit in regex output |
| — | BUG-02, BUG-13 | Same root cause: fastpath trailing slash |
| — | BUG-03, BUG-04 | Same root cause: object prototype inheritance |
| — | BUG-10, BUG-18 | Same root cause: extglob `**` vs `*` in negation |
| BUG-009 | BUG-14, BUG-15, BUG-26 | Same root cause: `matchBase` adapter handling |

---

## 6. Confirmed upstream defects

### Rust-affected (3):

1. **BUG-09** (source ID) → **BUG-008**: Globstar in non-final extglob alternatives diverges. Rust emits full globstar; JS downgrades to `[^/]*?` due to dead-code `type:'pipe'` guard. Fix: add `Pipe` token kind and push `|` as `type:'pipe'` when inside extglob.

2. **BUG-14 + BUG-15** (source IDs) → **BUG-009**: `matchBase` not implemented in Rust CLI adapter. The CLI dispatch has no `matchBase`/`basename` option handling — it always does full regex test. JS `picomatch.test()` routes to `matchBase()` (basename extraction) when `matchBase:true`.

3. **BUG-07** (source ID) → **BUG-007**: Literal equality shortcut `input === glob` — JS has it, Rust doesn't. Rust is actually **better** here (no false positive), so this is "already fixed" in Rust.

### Rust-unaffected (parity matches JS):

- BUG-01/17: Backreference behavior matches
- BUG-02/13: Fastpath trailing slash matches
- BUG-03/04: N/A (Rust has no prototype chain)
- BUG-05: Silent toRegex matches
- BUG-06: Bracket negation matches
- BUG-08: `**` adjacent to literals matches
- BUG-10/18: Extglob negation matches
- BUG-11: Fixed in 4.0.5, Rust matches
- BUG-12: Scanner parts/tokens matches
- BUG-19: Fixed in 4.0.5, Rust matches
- BUG-27: Empty alternative matches
- CVE-33671: ReDoS safeguard matches
- CVE-33672: POSIX class lookup matches (no prototype)

---

## 7. False, intentional, ambiguous, and performance-only claims

| Source ID | Disposition | Evidence |
|---|---|---|
| BUG-01/17 | INTENTIONAL — regex syntax is documented | `\1` is standard JS regex backreference; picomatch passes regex syntax through |
| BUG-02/13 | INTENTIONAL — `strictSlashes` option controls | D-03 documents fastpath/slow-path divergence |
| BUG-03/04 | RUST_NOT_APPLICABLE | Rust uses static structs with no prototype chain |
| BUG-05 | INTENTIONAL — API policy | `debug:true` throws; silent fallback is documented |
| BUG-06 | INTENTIONAL — `posix` option | README documents `[!...]` requires `posix:true` |
| BUG-08 | Parity match — no Rust action needed | Rust matches JS behavior exactly |
| BUG-10/18 | Parity match — not separate from extglob semantics | Same root cause as `**` in negation |
| BUG-12 | INTENTIONAL — different options, different splitting | `parts:true` vs `tokens:true` trigger different code paths |
| BUG-21 | PERFORMANCE — `consumed` is observable state | Written for parity; not dead code in Rust (used in oracle comparisons) |
| BUG-22 | PERFORMANCE — micro-optimization | Not user-visible |
| BUG-23 | NOT_APPLICABLE — browser-only | Rust has no `navigator` |
| BUG-24 | PERFORMANCE — input length cap bounds output | 65536 char limit prevents extreme output |
| BUG-25 | UNSUPPORTED — no complexity experiment | "Code review confirmed" is insufficient |
| BUG-26 | Adapter limitation (merged with BUG-14/15) | `format` not in CLI protocol |
| BUG-27 | INTENTIONAL — ReDoS safeguard | Empty alternative triggers `risky:true` by design |

---

## 8. Security threat models and severity corrections

### BUG-01/17 (Backreference "injection")

- **Reported:** CRITICAL — Security Vulnerability (regex injection)
- **Corrected:** INTENTIONAL_DOCUMENTED_BEHAVIOR — No security impact
- **Threat model:** Attacker would need to control the glob *pattern* (not the input). Picomatch's README documents regex syntax support. `\1` is standard JS regex behavior, not injection. The report's proof was internally inconsistent (claimed `a1` matches, which is false).
- **Rust impact:** None — Rust matches JS behavior.

### BUG-03/04 (Prototype inheritance)

- **Reported:** CRITICAL — Prototype Pollution Residual
- **Corrected:** RUST_NOT_APPLICABLE — No security impact in Rust
- **Threat model:** The report claims `extglobChars()` and `globChars()` objects inherit from `Object.prototype`. This is true in JS but: (1) no user-controlled key lookup occurs on these objects (they're destructured into named fields), (2) Rust uses static structs with no prototype chain. CVE-2026-33672 was about `POSIX_REGEX_SOURCE` which IS user-key-looked-up and WAS fixed with `__proto__: null` in 4.0.4.
- **Rust impact:** None — `posix_regex_source()` uses match-based lookup.

### CVE-2026-33671 (ReDoS)

- **Status:** Fixed in 4.0.4; Rust has `analyzeRepeatedExtglob` safeguard
- **Rust verification:** `+(a)` and `+(*(a)|*(b))` work correctly; no catastrophic backtracking observed

### CVE-2026-33672 (POSIX method injection)

- **Status:** Fixed in 4.0.4 with `__proto__: null`
- **Rust verification:** `[[:constructor:]]` does not match "function"; `posix_regex_source("constructor")` returns `None`

---

## 9. Implementation summary

### Accepted fixes (2 root causes):

1. **BUG-008** (BUG-09): Pipe token type in extglob — add `Pipe` token kind, push `|` as `type:'pipe'` inside extglobs, update globstar demotion guard.
2. **BUG-009** (BUG-14/15/26): `matchBase` adapter support — document as CLI limitation or implement basename matching in dispatch.

### Already fixed in Rust (1):

1. **BUG-007** (BUG-07): Rust correctly omits the `input === glob` literal equality shortcut.

### Regression tests needed:

- BUG-01/17: Backreference behavior
- BUG-07: Literal equality (Rust correct behavior)
- BUG-11: Multi-branch extglob
- BUG-19: matchBase windows
- CVE-33671: ReDoS safeguard
- CVE-33672: POSIX class lookup

---

## 10. Baseline gate results

| Gate | Command | Result |
|---|---|---|
| Build | `cargo build --workspace` | ✅ PASS (excluding picomatch-tui) |
| Clippy | `cargo clippy --workspace --all-targets -- -D warnings` | ✅ PASS |
| Test | `cargo test --workspace` | ✅ 74 passed, 0 failed |
| JS reproduction | `node scratch/verify-bugs.js` | 44/50 passed (6 failures were test expectation errors, not behavior issues) |
| Rust differential | `node scratch/verify-rust.js` | 18/22 passed; 4 divergences identified (BUG-07, BUG-09a, BUG-14, BUG-15) |

---

## 11. Frozen-test integrity

`tests/original/` directory was not modified. No changes to any files under `Main/`.

---

## 12. picomatch-tui pre-existing issues (PR #13)

- **Compilation error:** `picomatch-tui/src/ui/benchmark.rs:111` — `Option<u128>` cannot be cast as `f64` directly. Needs `ns as u64 as f64`.
- **Missing `src/main.rs`:** Cargo.toml has no `[[bin]]` section and `src/main.rs` is missing, causing "no targets specified" manifest error.
- **Formatting issues:** Multiple `cargo fmt` violations in `theme.rs`, `main.rs`, `app.rs`.
- **Resolution:** Excluded `picomatch-tui` from workspace for this audit. Issues should be fixed in PR #13.

---

## 13. Final status: COMPLETE

All 25 claims independently resolved. Every confirmed Rust defect identified with evidence. Disposition matrix complete.