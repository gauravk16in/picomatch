# Parser and Scanner — Decomposition, Invariants, Migration Risk

Status: analysis complete (spec §9–10); implementation Phases 4–7. Evidence: full reads of lib/scan.js (391 LOC), lib/parse.js (1416 LOC), lib/constants.js, lib/utils.js @4f41a8e.

## Call/dependency graph

```
index.js ──> lib/picomatch.js ──> lib/scan.js ──> lib/utils.js ──> lib/constants.js
posix.js ──┘        │    └─────> lib/parse.js ──┘            ▲
                    └─────────────────────────────────────────┘
```

- `picomatch()` → `makeRe` (fastpath attempt → `parse`) → `compileRe` → `toRegex`; `matcher` → `picomatch.test` (+ `matchBase`).
- `parse` is standalone (also exposed via `.parse` with fastpaths disabled). `scan` shares nothing with `parse` — separate char-code machine.

## Module responsibilities

| Module | Responsibility | Key invariants |
|---|---|---|
| `scan.js` | cheap structural scan: negation, base/glob split, glob detection, tokens/parts/slashes/maxDepth | output field set constant; globstar token depth = Infinity; never throws on any input |
| `parse.js` | full compile to regex-source: fastpaths, tokenizer+state machine, extglob/brace/bracket, risky-extglob analysis, backtrack rebuild | `bos` first; counters (brackets/braces/parens/quotes) never negative at end (strictBrackets throws instead); `backtrack` ⇒ output rebuilt from tokens; throws TypeError/SyntaxError only |
| `constants.js` | regex fragment tables (POSIX/WINDOWS), POSIX classes (14), char codes, REPLACEMENTS, factories `globChars(win32)`/`extglobChars(chars)` | tables closed; POSIX map null-proto'd (CVE-2026-33672) |
| `utils.js` | escaping/regex/path helpers: escapeRegex, toPosixSlashes, removeBackslashes, escapeLast, removePrefix, wrapOutput, basename, isWindows, isObject, hasRegexChars | pure functions; basename trailing-slash rule |
| `picomatch.js` | public API + matching: factory, test, matchBase, isMatch, compileRe/makeRe/toRegex, callbacks, ignore | callback order; toRegex never-match fallback; TypeErrors verbatim |
| `index.js`/`posix.js` | entry variants (OS detection on/off) | options object never mutated (spread copy) |

## Parser state machine — port-relevant structure

1. Pre-pass: REPLACEMENTS → maxLength → `removePrefix('./')` (records `state.prefix`).
2. Fastpath inside parse() when input lacks `[*!/\[\]{}()"]`-ish chars (lib/parse.js:606-655): regex-based replacement for `?`/`.`/`*` runs + backslash collapsing; separate `parse.fastpaths` table for `makeRe` (8 shapes + `*.ext` recursion).
3. Main loop per char with context: escaped chars; inside-bracket accumulation (posix expansion inline); quotes; parens (+extglob open/close via stack); brackets; braces (+dots ranges); pipes; commas; slashes (`./` reset); dots (brace-range detection); `?`; `!`; `+`; `@`; text-run optimization (REGEX_NON_SPECIAL_CHARS); stars (six globstar forms + bash/noglobstar variants).
4. Close-out: unbalanced counters → escapeLast (or strictBrackets throw); maybe_slash after star/bracket; backtrack rebuild if flagged.

## Extglob machinery (Phase 7 core)

- `extglobOpen(type, value)`: captures EXTGLOB_CHARS open/close, tracks `conditions`, `inner`, `parens`, `output`, `startIndex`, `tokensIndex`.
- `extglobClose(token)`: computes body → `analyzeRepeatedExtglob` (ReDoS safeguard: literalize / safe class-star rewrite / allow) → negate variants (`)$))STAR`, expression-after-close re-parse) → `negatedExtglob` at bos.
- Safeguard helpers: splitTopLevel, isPlainBranch, normalizeSimpleBranch, hasRepeatedCharPrefixOverlap, parseRepeatedExtglob, getStarExtglobSequenceChars, repeatedExtglobRecursion, buildCharClassStar (lib/parse.js:48-347).

## Migration risk classification

| Component | Risk | Justification |
|---|---|---|
| scan.js | **LOW** | self-contained char machine; clear outputs; UTF-16 index care only |
| constants.js | **LOW** | pure data tables |
| utils.js | **LOW** | small pure helpers; regexes re-expressible |
| picomatch.js API/matcher | **MEDIUM** | callback pipeline + result shapes + ignore recursion; engine boundary touches test() |
| parse.js main loop (text/star/qmark/dot/slash/quote) | **MEDIUM** | mechanical but context-heavy; probes pin outputs |
| globstar six forms + backtrack rebuild | **HIGH** | subtle output rewrites; six context forms; probes + globstars.js pinned |
| brackets + POSIX expansion | **MEDIUM** | accumulation + inline expansion; class-table parity; edge rules (`]` first, `-` before `]`) |
| braces + expandRange | **MEDIUM** | output-index rewinds; custom fn registry |
| extglob open/close + negate variants | **HIGH** | four close variants + expression-after-close re-parse + lookahead engine requirement |
| analyzeRepeatedExtglob safeguard | **HIGH** | newest code (4.0.4/4.0.5), subtle branch classification; security-relevant; must match exactly incl. `+(ab|abab)` non-catch (D-011) |
| fastpaths | **LOW-MEDIUM** | closed table; strictSlashes/contains interactions |
| engine boundary (regex vs fallback) | **HIGH** | lookaround subset correctness; backtrack-budgeted fallback with typed limit errors (D-003) |

## What cannot be copied mechanically from JS to Rust

- **RegExp construction/exec** — replaced by engine layer (D-002/D-003).
- **UTF-16 indexing** — Rust strings are UTF-8; all index arithmetic must be byte-based with char-boundary safety; corpus includes non-ASCII patterns.
- **Mutable linked `prev` token chain** — model as arena indices (`Vec<Token>` + `prev: usize`) rather than references.
- **Prototype-chain maps** — POSIX map as closed `phf`/match; REPLACEMENTS as match (N/A vulnerability class, NFR-005).
- **JS sort() default** — code-unit sort == byte-order sort for UTF-8 (identical for ASCII; document for non-ASCII endpoints).
- **Regex literals inside utils/constants** (REGEX_BACKSLASH etc.) — re-express as the same regexes via the engine or as hand-written scans (they are simple; prefer hand-written to avoid regex-in-parser bootstrapping).
