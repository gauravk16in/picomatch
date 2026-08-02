# Teammate 2 — Chunk 2 audit: scanner port

- Session type: Teammate 2 (Supporting Modules + Testing) Chunk 2 — scanner port (`lib/scan.js` → `src/scan.rs`), test-only bridge, differential evidence, audit, PR. No subagents; every command, read, probe, fetch, edit, and test run personally.
- Working branch: `chirag-rust-port-chunk2-scan` (cut from `origin/rust-port` merge `1685399`). Session window: 2026-08-02 ~13:25 IST → ~14:40 IST.
- Environment: Windows 11, PowerShell, Node v24.13.0, npm 11.6.2, cargo 1.97.1, rustc 1.97.1 (matches `rust-toolchain.toml` pin), git 2.53.0.windows.3.

## 1. Verdict

**CHUNK 2 COMPLETE — SCANNER PORTED; UNCHANGED ORIGINAL SCANNER TESTS PASS AGAINST RUST.**

Every invoked required test has zero failures: Main original suite 1977/1977 (lint+mocha before AND after), Rust fmt/clippy/test clean (49 unit + 2 integration), unchanged `Main/test/api.scan.js` 40/40 passing against Rust via the test-only bridge, scanner corpus 3072/3072 deterministic, differential attack 411 inputs / 4932 comparisons / 0 divergences / 0 rust process failures / 33 globstar-token comparisons, all C0/C1/C2 regression gates green, corpus double-regeneration byte-identical.

**Post-review harness fix (2026-08-02):** A PR review identified two variable-name typos in `attack-scan.js` (`tok`↔`tk` on L62/L96) that silently skipped globstar-token comparisons, plus a `panics` counter that was never incremented. The option matrix also never combined `tokens: true` with `scanToEnd: true` or `parts: true`, so globstar tokens were not actually exercised. All three issues were fixed: typos corrected, explicit globstar inputs added with combined option combos, `panics` replaced with a truthful `rustProcessFailures` counter, and scanner exceptions are now treated as divergences (not silently matched). The `scan_utf16` doc comment was also corrected to remove a reference to a nonexistent `input` parameter, and a safety comment was added before `base.pop()`. No production scanner behavior changed.

## 2. Branch/PR/base/head SHAs

| Ref | SHA |
|---|---|
| `origin/rust-port` (base, post-PR-#2-merge) | `1685399fbe74a95a95621f91e81c73b4710f2316` |
| `origin/main` (Main/ reference) | `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2` |
| `chirag-rust-port-chunk2-scan` (this PR) | (pending commit) |
| Main HEAD tree | unchanged |

## 3. PR #2 dependency/merge handling

PR #2 (Teammate 2 Chunk 1) was merged into `rust-port` at commit `1685399` on 2026-08-02T06:51:06Z before this session began. The Chunk 2 branch `chirag-rust-port-chunk2-scan` was created from the exact merge commit (`git branch -f chirag-rust-port-chunk2-scan origin/rust-port`). No Chunk 2 commits were added to the old `chirag-rust-port` branch. The final diff is Chunk-2-only against current `rust-port`.

## 4. Files/read manifest and exclusions

**Read completely this session:**
- Root governance: `WORKSPACE.md`, `CLAUDE.md`, `context.md`, `DECISIONS.md` (D-013/D-014), `audits/README.md`, `docs/parser-and-scanner.md`, `docs/compatibility-matrix.md`.
- Chunk 1 audit: `Rust/audits/2026-08-02-0011-teammate2-chunk1-constants-utils.md` (full).
- Rust integration: `Rust/AGENTS.md`, `Rust/C0_DESIGN.md`, `Rust/DECISIONS.md`, `Rust/.loop/review-ledger.md`, `Rust/crates/pmx-core/src/lib.rs`, `utils.rs`, `options.rs`, `tests/c0_foundation.rs`, `examples/c0probe.rs`, `Rust/fixtures/canon.js`, `verify-c0.js`.
- JS scanner surface: `Main/lib/scan.js` (391 L, full), `Main/lib/constants.js` (184 L), `Main/lib/utils.js` (72 L), `Main/test/api.scan.js` (677 L, all lines incl. commented-out quirks).

**Exclusions (not read this session, teammate-owned or out of scope):** parser/matcher test suites in `Main/test/` (extglobs, bash, dots, slashes, globstars, etc. — hashed in freeze manifest, pass 1977/1977, unchanged by this chunk); `Main/lib/parse.js` internals beyond the call graph in `docs/parser-and-scanner.md`; `Main/lib/picomatch.js` beyond the scan call site; bench/examples. These are teammate-owned per the chunk boundary and not required for scanner port fidelity.

## 5. Scanner source/test contract map

`lib/scan.js` (391 L) → `src/scan.rs` (port). Every branch mapped:

| JS lines | Behavior | Rust implementation |
|---|---|---|
| L22-L24 | `isPathSeparator(code)` | `is_path_separator(code: u16) -> bool` |
| L26-L30 | `depth(token)`: Infinity for globstar, 1 otherwise, skip if isPrefix | `set_depth(&mut ScanToken)` |
| L52-L54 | `length = input.length - 1`; `scanToEnd = parts||scanToEnd` | `let length = units.len().saturating_sub(1)`; `scan_to_end` |
| L56-L69 | mutable state vars | mirrored field-by-field |
| L75-L80 | `eos()`, `peek()`, `advance()` | closures + manual index advance |
| L86-L94 | backslash escape | `if code == CHAR_BACKWARD_SLASH` block |
| L96-L150 | braces (escaped-open or literal-open) | `if brace_escaped \|\| code == CHAR_LEFT_CURLY_BRACE` block; inner while loop; `..`/`,`/`}` detection; **fall-through quirk** (DOT branch falls through to comma check when not `..`) |
| L152-L168 | forward slash | `if code == CHAR_FORWARD_SLASH` block; `./` prefix reset; `lastIndex` |
| L170-L200 | extglob open | `isExtglobChar && peek()==(` block; negated extglob; scan-to-end close |
| L202-L222 | `*` and `?` | asterisk (globstar on `prev==*`); qmark |
| L224-L243 | `[` bracket | inner while; `]` close; backslash-escape |
| L245-L250 | `!` negation (beginning-only) | `nonegate !== true && index == start` |
| L252-L272 | `(` ordinary parens | `noparen !== true`; scan-to-end close; **quirk**: `(` inside sets backslashes |
| L274-L283 | isGlob → finish | `if is_glob` block |
| L285-L289 | `noext` post-processing | `if opts.noext == Some(true)` |
| L291-L317 | base/glob/prefix split | prefix slice; `str` slice; `lastIndex` split; trailing-separator trim; `unescape` |
| L327-L340 | state object (always-present fields) | `ScanState` struct |
| L342-L347 | tokens (`maxDepth`, push final token) | `if opts.tokens == Some(true)` |
| L349-L386 | parts/slashes assembly | `if opts.parts \|\| opts.tokens`; loop over slashes; **`prevIndex` falsy quirk** (`Some(0)` must not trigger trailing part); trailing part |

**Original test contract:** `Main/test/api.scan.js` (677 L, 40 tests) — deep-equality on full state objects, `base()`/`both()`/`assertParts()` helpers, BMP non-ASCII case at L360, commented-out quirks documenting known issues.

## 6. Research questions, primary sources, and tool categories

Used **Search MCP** for discovery, **Contents tool** for full-page reading, **Research tool** for bounded synthesis, **Context7** for versioned APIs. Tool names per the provider-name rule.

1. **Node CommonJS `require` interception**: Search MCP → Node.js modules docs (`nodejs.org/api/modules.html`), `glebbahmutov.com/blog/hacking-node-require`, `node-hook` library. Conclusion: `Module._resolveFilename` + `require.cache` injection is the documented, stable mechanism. The bridge resolves the scan module path exactly as Node would, then injects a synthetic `Module` into `require.cache`.
2. **ECMAScript UTF-16 `String.length`/`charCodeAt`/`slice`**: Context7 `/websites/doc_rust-lang_stable_std` → `str::encode_utf16`, `String::from_utf16_lossy`, `char::decode_utf16`. Confirmed: `&[u16]` is the exact representation for JS `charCodeAt` semantics; `from_utf16_lossy` replaces lone surrogates with U+FFFD (D-013 ingestion policy).
3. **Serde `Option::None` omission**: Context7 `/websites/rs_serde_json` → `#[serde(skip_serializing_if = "Option::is_none")]` pattern. Our scanprobe emits `None` as absent (null in JSON) and `Some(Infinity)` as `{__num:"Infinity"}`.
4. **Mocha root hooks/preload**: Search MCP → Mocha docs. `--require <file>` runs before test files load, satisfying the bridge's ordering requirement.

## 7. Context7 library IDs/versions/findings

| Library ID | Finding | Impact |
|---|---|---|
| `/websites/doc_rust-lang_stable_std` | `str::encode_utf16` yields native-endian u16; `String::from_utf16_lossy` replaces invalid surrogates with U+FFFD | `scan(&str)` wrapper; `slice_units_to_string` helper |
| `/websites/rs_serde_json` | `serde_json::Value` handles `Option` emission; no `float_roundtrip` needed for scanner (no f64 options) | scanprobe JSON encoding |
| `/dtolnay/thiserror` (locked 2.0.19) | not used by scanner (scanner never throws) | no change |

## 8. Design decisions

Recorded in `Rust/DECISIONS.md`:
- **D-015**: Scanner option model is `ScanOptions`, distinct from parser `Options`.
- **D-016**: Scanner core is `scan_utf16(&[u16])` (exact `charCodeAt` semantics); `scan(&str)` is the ergonomic wrapper.
- **D-017**: Depth model is `Option<f64>` with `f64::INFINITY` for globstar; `None` for absent properties.

## 9. Files changed

```
A  crates/pmx-core/src/scan.rs           — scanner port (492 L + 28 unit tests)
M  crates/pmx-core/src/lib.rs           — re-export scan/scan_utf16/ScanOptions/ScanState/ScanToken
A  crates/pmx-core/examples/scanprobe.rs — test-only JSONL probe binary
A  fixtures/canon-scan.js                — scanner corpus encoding helpers
A  fixtures/extract-scan.js              — scanner corpus extractor (3072 cases)
A  fixtures/verify-scan.js               — scanner corpus verifier
A  fixtures/scan-bridge.js               — test-only unchanged-test bridge preload
A  fixtures/attack-scan.js               — scanner adversarial differential harness
A  fixtures/scan_oracle.json             — scanner corpus (3072 cases, deterministic)
M  Rust/DECISIONS.md                     — D-015/D-016/D-017
M  Rust/AGENTS.md                        — current status updated
A  audits/2026-08-02-1400-teammate2-chunk2-scan.md  — this audit
```

## 10. Scanner implementation mapping

See §5 (contract map). Key fidelity points:
- UTF-16 unit-exact: cursor index is `i64` into `&[u16]`, identical to JS `index`.
- Backslash escape advances exactly one unit (D-016 boundary).
- Brace DOT-branch fall-through to comma check (load-bearing quirk, `{.,*}`).
- `prevIndex` falsy check (`Some(0)` does NOT trigger trailing part — JS `if (prevIndex && ...)`).
- Token `depth: Some(0.0)` initial (mirrors JS `{ value: '', depth: 0, isGlob: false }`).
- `isPathSeparator(code)` check on final token push (JS `!isPathSeparator(code)`).
- `noext` post-processing zeros `isExtglob`/`isGlob`.
- `unescape` calls shared `utils::remove_backslashes`.

## 11. Unchanged-original-test bridge architecture

1. `cargo build --example scanprobe` builds the Rust scan-probe binary once.
2. `npx mocha --require ../Rust/fixtures/scan-bridge.js test/api.scan.js` loads the bridge BEFORE the test file.
3. The bridge resolves `../lib/scan` to `D:\picomatch\Main\lib\scan.js` via `Module._resolveFilename`, injects a synthetic `Module` into `require.cache` exporting a `scan` function.
4. Per call: serialize `(input, options)` to JSONL → `spawnSync(scanprobe)` → read JSONL projection → reconstruct exact JS object shape (absent vs present properties, Infinity via `__num`, UTF-16 via `__u16`).
5. Fail loudly on any bridge/protocol/Rust error; never fall back to JS.

The bridge does NOT edit/copy/rewrite `api.scan.js`, call the JS scanner, key results by test name, or drop cases. It is NOT the production adapter.

Command: `cd Main && npx mocha --require ../Rust/fixtures/scan-bridge.js test/api.scan.js`

## 12. Proof original scanner test hash is unchanged

- BEFORE (session start): `certutil -hashfile test\api.scan.js SHA256` → `8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36`
- AFTER (session end): same hash → `8abd94a2d7040911017d125bada4e5aaf5ee166bf5b37cd377d0378cb7174f36`
- `git -C Main status` clean; no test file edited.

## 13. Original scanner test result against Rust

`npx mocha --require ../Rust/fixtures/scan-bridge.js test/api.scan.js --reporter dot` → **40 passing (3s)**, 0 failing.

## 14. Full Main baseline before/after

| Command (cwd `Main/`) | Before | After |
|---|---|---|
| `npm test` (eslint + mocha) | exit 0, 1977 passing | exit 0, 1977 passing |
| `npm run mocha` | 1977 passing | (covered) |

## 15. Rust workspace gates

- `cargo fmt --check` → exit 0.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings` → exit 0.
- `cargo test --workspace --all-features` → **49 unit + 2 integration, all pass, 0 failed**.

## 16. C0/C1/C2/later regression gates

- `node fixtures/verify-c0.js` → 39/39 deterministic.
- `node fixtures/verify-c1.js` → 55/55 deterministic.
- `node fixtures/verify-c2.js` → 18/18 deterministic.
- `node fixtures/attack-c0.js` → 220 inputs, 0 divergences.
- `node fixtures/attack-c2.js` → 85/85 passed, 0 failed.

## 17. Differential/adversarial counts and divergences

- `node fixtures/attack-scan.js` → **inputs=411, compared=4932, divergences=0, rustProcessFailures=0, globstarTokenComparisons=33**.
- Covers: 300 seeded random inputs (mulberry32, seed=42); 50 long backslash runs (40 `\` each); 50 nested brace runs (`{`×20 + `}`×20); 1 max-length plain (1000 `a`); 10 explicit globstar-token coverage inputs (`**`, `a/**`, `a/**/b`, `**/*.js`, `foo/**/bar`, `a/b/**/*.js`, `**/foo`, `*/**/*`, `./foo/**/bar`, `!foo/**/*.js`).
- Option combos include combined `{ tokens: true, parts: true }`, `{ tokens: true, scanToEnd: true }`, `{ parts: true, scanToEnd: true }`, `{ tokens: true, parts: true, scanToEnd: true }` — these force scanToEnd so `**` tokens are actually generated and compared through both `canonState` and `decToken`.
- **Post-review fix:** the original harness had `tok`↔`tk` typos on L62/L96 that silently skipped globstar-token comparisons, a `panics` counter that was never incremented, and an option matrix that never combined `tokens` with `scanToEnd`/`parts`. All fixed; globstarTokenComparisons now asserted > 0.

## 18. Determinism hashes

- Corpus double-regeneration: `extract-scan.js` run twice → SHA-256 byte-identical both runs (`8c41a95da810...`).
- `verify-scan.js` → 3072/3072 cases deterministic.

## 19. Failures found and production fixes

| Failure | Root cause | Fix (production) |
|---|---|---|
| `{.,*}` detected as non-glob (1 test fail) | DOT branch in brace inner loop had `continue` after advancing past `.`, skipping the comma check. JS `if (… && (code = advance()) === DOT)` is a short-circuit AND — when the advanced char is not DOT, execution falls through to the comma check. | Removed the `continue`; added fall-through comment explaining the short-circuit semantics. |
| 324 divergences in attack-scan: tokens missing `depth` | `ScanToken::default()` had `depth: None`; JS initial token has `depth: 0`. | Changed token init to `ScanToken { depth: Some(0.0), ..Default::default() }` at both init sites. |
| 20 divergences: `prevIndex=0` falsy | JS `if (prevIndex && ...)` treats `0` as falsy; Rust `Some(0)` is truthy. | Added `pi != 0` guard to the trailing-part block. |
| Corpus non-deterministic (hash mismatch) | `generatedAt: new Date().toISOString()` in meta changed each run. | Removed `generatedAt` from corpus meta. |
| Post-review: `attack-scan.js` typos `tok`↔`tk` (L62/L96) | Copy-paste inconsistency between `canonState` (uses `tk`) and `decToken` (uses `tok`). Both referenced the wrong variable name for `isGlobstar`. | Fixed both to use the correct local variable. |
| Post-review: `attack-scan.js` option matrix never combined `tokens` with `scanToEnd`/`parts` | Without scanToEnd, scanning stops at the first `*` before the second `*` sets `isGlobstar`. | Added 4 combined option combos and 10 explicit globstar inputs. |
| Post-review: `attack-scan.js` `panics` counter never incremented | The variable was initialized but no code path incremented it. | Replaced with `rustProcessFailures` counter for nonzero exit, signal termination, missing output, malformed JSON, and `probeError`. |
| Post-review: `scan_utf16` doc comment referenced nonexistent `input` parameter | The function signature only has `units` and `opts`; `input` is set by the caller. | Updated doc comment to clarify the caller sets `state.input`. |
| Post-review: `base.pop()` lacked safety comment | `String::pop()` removes a Rust char, not a UTF-16 unit — but only called when the last unit is ASCII `/` or `\`, so it is safe. | Added a comment explaining the ASCII safety. |

No failure was skipped, filtered, swallowed, or relabeled; each was reproduced, root-caused, fixed in production code/config, and re-verified.

## 20. Self-review findings

- **BLOCKER (0)**, **HIGH (0)** open.
- **MEDIUM (1, documented)**: `slice_units_to_string` uses `String::from_utf16_lossy` which replaces lone surrogates with U+FFFD. This is the D-013 ingestion policy for the `&str` boundary; the unit-level `scan_utf16(&[u16])` accepts lone surrogates directly (tested). The `scan(&str)` wrapper never produces lone surrogates (Rust `String` is valid UTF-8). Documented in the function's doc comment; no action needed.
- **LOW (1, accepted)**: `#[allow(unused_assignments)]` on `prev` initial binding — the initial `None` is never read (first `advance()` overwrites it); semantically needed to mirror JS. Documented.
- **INFO (2)**: (a) bridge uses per-call `spawnSync` (~80ms/call on Windows); performance is acceptable for test-only use and does not justify semantic shortcuts; (b) corpus `meta.reference` platform-dependent path separator (Windows `\` vs POSIX `/`) — deterministic per platform, consumed by no assertion.
- Review covered: branch-by-branch fidelity, all options/interactions, returned field/property presence, token shape, UTF-16 indices/slicing, base/glob/prefix, parts/slashes/maxDepth, finite/Infinity, escaped/nested constructs, upstream quirks preserved, no JS fallback, unchanged tests, bridge isolation, no unsafe/panic/unchecked indexing, no parser scope creep, linear complexity, deterministic fixtures, truthful docs, provider name absent.

## 21. Docs/decisions updates

- `Rust/DECISIONS.md`: added D-015, D-016, D-017.
- `Rust/AGENTS.md`: current status updated to reflect scanner completion.

## 22. Diff-scope/provider-name checks

- `git diff origin/rust-port...HEAD` searched case-insensitively for forbidden provider name/domain → **0 matches**.
- Diff is Chunk-2-only (no unmerged Chunk 1 commits; PR #2 merged before this session).

## 23. Commits/push/PR

(pending — commits and PR created after this audit is written.)

## 24. Work completed versus remaining

**Completed:** scanner port, test-only bridge, differential evidence, audit, documentation.
**Remaining (Chunk 3, not started):** parser C3 (single wildcards `?` and `*` with BOS/dot guards) per `PARSE_CHUNKS.md`.

## 25. Exact Chunk 3 recommendation

Per `Rust/PARSE_CHUNKS.md` and `Rust/AGENTS.md` current status: **Chunk C3 — single wildcards `?` and `*` with BOS/dot guards**. Read `src/parse/main_loop.rs` staging notes and the C3 corpus rows before changing `*`/quote/dot-merge behavior.