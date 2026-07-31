# Compatibility Matrix — Requirement → Oracle Evidence → Port Status

Status legend: **SPEC** = contracted (this bootstrap) · **PASS** = parity proven by corpus/adapter · **DIVERGE** = documented intentional divergence · **GAP** = known missing. Updated every phase.

| Area | Req IDs | Oracle evidence | Status |
|---|---|---|---|
| Factory + arrays + state input | FR-001..003, 007 | lib/picomatch.js:43-66,104-106; test/api.picomatch.js | SPEC |
| Matcher + rich object + callbacks | FR-004..006 | lib/picomatch.js:71-102; test/options.onMatch.js, options.ignore.js | SPEC |
| test/matchBase/isMatch | FR-008..010, 032 | lib/picomatch.js:128-194; test/options.js; issue #89 note | SPEC |
| parse/scan API + shapes | FR-011, 012, 050..053 | probes; test/api.scan.js; positions are UTF-16 code-unit offsets (D-013) | SPEC |
| compileRe/makeRe/toRegex | FR-013..015 | lib/picomatch.js:264-348; probe sources | SPEC |
| constants | FR-016 | lib/constants.js | SPEC |
| Entry modes (index/posix) | FR-017 | index.js, posix.js | SPEC |
| Error model | FR-018, 090 | test/malicious.js, dots-invalid.js; probe errors | SPEC |
| Literals/escaping/quotes | FR-020 | lib/parse.js:661-782; test/special-characters.js | SPEC |
| `*`/`?` semantics | FR-021, 022 | probe star/qmark; test/stars.js, qmarks.js | SPEC |
| Globstar six forms | FR-023 | probe globstar*; test/globstars.js | SPEC |
| Brackets/POSIX classes | FR-024 | test/brackets.js, posix-classes.js; lib/parse.js:713-758 | SPEC |
| Braces/ranges | FR-025, 065 | test/braces.js, options.expandRange.js | SPEC |
| Extglobs (5 operators + negate variants) | FR-026, 027 | test/extglobs*.js; lib/parse.js:523-600 | SPEC |
| Negation `!` | FR-028, 033 | test/negation.js; probe contains_neg | SPEC |
| Dot rules | FR-029 | test/dotfiles.js, dots-invalid.js | SPEC |
| Separators/platform | FR-030, 080..082 | test/slashes-*.js; lib/constants.js | SPEC |
| Trailing slash/strictSlashes | FR-031 | probe strictSlashes; lib/parse.js:1304-1306 | SPEC |
| capture mode | FR-034 | test/options.maxExtglobRecursion.js:120-134 | SPEC |
| bash/regex modes | FR-035, 036 | test/bash*.js, regex-features.js | SPEC |
| Fastpaths + REPLACEMENTS | FR-037, 038 | lib/parse.js:1330-1414,606-655; constants | SPEC |
| `./` prefix | FR-039 | lib/utils.js:43-50; lib/parse.js:980-987 | SPEC |
| Options defaults/aliases/interactions | FR-040, 041 | knowledge/options-matrix.md; test/options*.js | SPEC |
| Token model/backtrack | FR-060..063 | lib/parse.js; test/api.picomatch.js:317-364 | SPEC |
| Risky-extglob safeguard | FR-064 | test/options.maxExtglobRecursion.js; commits 5eceecd, 6289307 | SPEC |
| Two-engine matching | FR-070..074 | D-003; regex/fancy-regex docs | SPEC (validate Phase 5) |
| maxLength | NFR-001 | test/malicious.js:21-32 | SPEC |
| unsafe/panic policy | NFR-003, FR-074 | D-009 | SPEC |
| Differential corpus/CLI | NFR-020..024 | D-006/D-007; docs/differential-testing.md | SPEC |
| Build/CI/packaging | NFR-030..033 | D-012; docs/build-and-ci.md | SPEC |
| Perf methodology | NFR-010..012, 041, 042 | D-008; docs/benchmarking.md | SPEC |
| Licensing | NFR-050 | LICENSE; docs/licensing.md | SPEC |

## Documented intentional divergences / boundaries (with rationale)

| ID | Divergence | Rationale | Status |
|---|---|---|---|
| DV-1 | `makeRe().source` string equality not guaranteed | Rust regex lacks lookaround (D-002); behavior parity is the MUST; per-case compareSource where achievable | STRETCH |
| DV-2 | `flags:'g'`/`'y'` statefulness not reproduced; fresh exec per call | JS lastIndex semantics are an observable side effect of a stateful RegExp; documented rather than emulated (FR-091) | DIVERGE (recorded) |
| DV-3 | Issue #175 `+(ab|abab)` catastrophic compile retained | oracle parity beats safety change (D-011); bounded by fallback budget | DIVERGE-from-ideal (documented) |
| DV-4 | Function-valued fields on parse state (`peek`, `advance`) not ported | functions aren't data; token/output parity covers observable use (G-06) | DIVERGE (recorded) |
| DV-5 | `hasRegexChars`-driven literal bracket alternation emits both forms | kept — it IS oracle behavior; noted because surprising | PASS-by-design |
| DV-6 | Fallback budget trip returns typed `ResourceLimitError` where the oracle eventually answers a boolean | safety bound required by NFR-004; typed + visible chosen over silent no-match (D-003, ratified 2026-07-31); corpus marks these `EXPECTED_LIMIT` | DIVERGE (recorded) |

## README-vs-source conflicts on record

| Conflict | Resolution | Evidence |
|---|---|---|
| README `posix` row/prose ("disabled by default") vs source (classes expand unless `posix === false`, `lib/parse.js:719`) | source wins — enabled by default; corpus includes a default-posix case (Phase 1) | options-matrix `posix` row; spec §5.2 |
