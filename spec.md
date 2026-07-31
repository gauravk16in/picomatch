# spec.md — Picomatch→Rust Port: Product & Behavioral Specification

Read third. This is the standalone contract a fresh agent implements against. Every requirement cites its evidence. Status markers per CLAUDE.md. Baseline: picomatch **4.0.5** @ `4f41a8e` (the oracle).

**Source reference shorthand:** `[lib/picomatch.js]`, `[lib/parse.js]`, `[lib/scan.js]`, `[lib/constants.js]`, `[lib/utils.js]`, `[index.js]`, `[posix.js]`, `[test/<file>]`, `[README]`, `[probe:scratch/probe-regex-sources.json]`, `[GHSA-...]`, `[issue#N]`, `[event: coderesurrection.com/2026 §…]`. All local paths are at commit `4f41a8e`.

---

## 1. Product Overview

A pure-Rust reimplementation of picomatch 4.0.5: a glob→matcher compiler exposing the same observable behavior as the JavaScript original, plus a thin CLI for differential testing and the event's "thin adapter" test model. No Node.js or JavaScript runtime is used by the shipped artifact `(verified: event rule 05)`.

## 2. Background and Goals

Picomatch compiles glob patterns to JavaScript `RegExp` objects and matches strings with them. The port must reproduce **observable behavior** — match results, outputs, data shapes, error classes/messages, callback sequences, and resource limits — while being idiomatic, memory-safe Rust. Goals in judging-weight order: (G1) original-test parity unmodified (40%); (G2) demonstrated behavioral equivalence incl. differential fuzzing and honest benchmarks (30%); (G3) idiomatic quality + decision log (20%); (G4) innovation: zero-unsafe target + upstream bug documentation (10%+bonuses).

## 3. Scope and Non-Goals

**MUST (must-have parity):** `picomatch()` matcher construction (string|array|state), `.test`, `.matchBase`, `.isMatch`, `.parse`, `.scan`, `.compileRe`, `.makeRe`, `.toRegex`, `.constants`; all documented main + scan options (`knowledge/options-matrix.md` — canonical counts: 33 main rows incl. 2 aliases, 7 scan rows incl. 3 shared); POSIX + Windows separator modes; error model; resource limits; the risky-extglob safeguard.

**SHOULD:** rich result-object parity (normalized), `capture` group values, scan tokens/parts/maxDepth, callback sequences, fastpaths table, cross-platform CI (linux/windows/macos).

**STRETCH:** exact `makeRe().source` string parity under a documented normalization (§5.4); N-API binding for in-process JS adapter; WASM build; performance exceeding JS on compile-heavy workloads.

**OUT OF SCOPE:** filesystem walking/globbing of directories (picomatch is in-memory matching only); `micromatch` API; brace *expansion* library features (micromatch `braces`); removed options (`knowledge/options-matrix.md` §removed); `picomatch.split`/`cwd` (removed upstream); Bash itself.

## 4. Users and User Scenarios

- **U-1 Library consumer (Rust):** constructs a matcher once, matches many paths; expects picomatch semantics (`*`, `**`, extglobs, braces, dotfiles rules, windows mode).
- **U-2 Judge/evaluator:** clones repo, runs one build command, runs the original mocha suite against the artifact via the adapter, inspects parity report, benchmark report, DECISIONS.md, fuzz log, unsafe count. Scenario: `cargo build --release && node test/adapter/run-mocha.js` → sees 1977/1977 or an honest subset with named gaps.
- **U-3 Differential tester:** feeds pattern+input pairs to JS oracle and Rust port, diffs normalized JSONL.
- **U-4 Security reviewer:** supplies pathological patterns (long, nested extglobs, prototype names, malformed delimiters) and expects bounded time/memory and no panics.

## 5. Compatibility Contract

### 5.1 Parity levels

- **P0 — Behavioral parity (MUST):** for every corpus case: identical `isMatch`, identical `output`, identical error class + message, identical callback event sequence, identical scan/parse data shapes (normalized), identical thrown-vs-returned distinction.
- **P1 — Rich result parity (SHOULD):** `matcher(input, true)` object fields after normalization (§5.3): `{glob, state, regex, posix, input, output, match, isMatch}`.
- **P2 — Regex-source parity (STRETCH only):** `makeRe().source` string equality after the normalization in §5.4. Not promised globally `(verified: Rust regex lacks lookaround; boundary ratified D-002 2026-07-31)`.

### 5.2 Oracle authority order

When sources conflict: **JS test suite (executed) > JS source code > README > Bash**. Every recorded conflict must appear in `docs/compatibility-matrix.md`. Known conflicts at bootstrap: README vs issue #89 (matchBase applies to slash patterns — source wins); README options table vs removed options; README `posix` row/prose ("disabled by default") vs source (`lib/parse.js:719` expands classes unless `posix === false` — source wins, enabled by default); CHANGELOG stops at 4.0.0 (git log wins); Bash vs picomatch intentional divergences (`*` doesn't cross `/`; `!(foo)*` non-greedy) — picomatch wins, `[README §Matching behavior vs. Bash]`.

### 5.3 Normalization (for corpus + adapter)

- `Infinity` → `{"__inf__":true}`; RegExp → `{source, flags}`; match arrays → JSON arrays (holes/undefined → null); errors → `{errorClass, message}`; functions → named-library identifiers (`knowledge/test-inventory.md` §callbacks); `undefined` vs absent distinguished.
- Regex-source comparison (`compareSource: true`) is only enabled for cases where the Rust compiler emits the identical string; otherwise behavioral comparison.
- **Observable positions are UTF-16 code-unit offsets (D-013).** Every numeric position exposed by scan/parse (`start`, `slashes[]`, parse-state `index`/`start`/`consumed`) is the exact UTF-16-unit value the JS oracle produces (BMP char = 1 unit, astral char = 2 units, ASCII fast path identical). Corpus scan/parse records declare `meta.indexUnits: "utf16_code_unit"`. Rust internals iterate scalar values and derive unit positions from a cumulative counter (never byte offsets). Unpaired surrogates cannot exist in Rust `String`; the JSON protocol replaces them with U+FFFD at ingestion and records the replacement in `meta` — corpus cases never contain unpaired surrogates.
- Resource-limit outcomes (D-003): when the fallback engine's backtrack budget trips, `expected` carries `{"errorClass": "ResourceLimitError", "kind": "backtrack_limit"}` (or `"stack_overflow"` / `"runtime"`) plus `meta.limitNote`; these cases are classified `EXPECTED_LIMIT` in differential runs (docs/fuzzing.md), not match-result mismatches.

### 5.4 Regex-source parity boundary

JS sources contain lookarounds — `(?!.)`, `(?=.)`, `^(?!...).*$`, `(?:(?!X))STAR` — that Rust `regex` rejects `(verified: docs.rs/regex)`. Therefore: the Rust compiler emits a **Rust-regex-compatible source** for the non-lookaround subset and routes the lookaround subset to the fallback engine (D-003). P2 claims are made only per-case with a recorded mapping, never as a blanket guarantee. `(decided: D-002, ratified 2026-07-31 — the official rubric scores behavioral/test-suite parity, not source strings; differential parity + explanation in DECISIONS.md D-002/D-004 is the accepted mitigation)`

## 6. Public API Surface

**FR-001 (must)** `picomatch(glob, options?, returnState?) -> matcher`: string, array-of-strings, or parse-state object (`{tokens, input}`); else `TypeError('Expected pattern to be a non-empty string')` `[lib/picomatch.js:43-60]`. Empty string throws identically.
**FR-002 (must)** Array input → matcher returning FIRST truthy per-pattern result else `false` `[lib/picomatch.js:44-54]`.
**FR-003 (must)** State-object input → `compileRe(state, options)` path `[lib/picomatch.js:56,64-66]`.
**FR-004 (must)** `matcher(input, returnObject?)`: boolean by default; rich object when `returnObject=true` `[lib/picomatch.js:77-102]`.
**FR-005 (must)** Callback order per input: `onResult` (always, first) → if not match: return; else if ignored: `onIgnore` then isMatch=false; else `onMatch` `[lib/picomatch.js:81-100; test/options.onMatch.js; test/options.ignore.js]`.
**FR-006 (must)** `ignore` option builds inner matcher with `{...options, ignore:null, onMatch:null, onResult:null}` `[lib/picomatch.js:71-75]`.
**FR-007 (must)** `returnState=true` attaches `.state` to matcher `[lib/picomatch.js:104-106]`.
**FR-008 (must)** `.test(input, regex, options?, {glob, posix}?)`: non-string input → `TypeError('Expected input to be a string')`; empty input → `{isMatch:false, output:''}`; equality fast paths `input===glob` then `format(input)===glob`; `matchBase/basename` branch; `capture:true` forces exec; returns `{isMatch, match, output}` `[lib/picomatch.js:128-156]`.
**FR-009 (must)** `.matchBase(input, glob|regex, options?, posix?)`: tests `utils.basename(input, {windows:posix})`; windows mode splits on `[\\/]`; trailing-slash basename = previous segment `[lib/picomatch.js:172-175; lib/utils.js:63-72; test/options.js:25-33]`.
**FR-010 (must)** `.isMatch(str, patterns, options)` ≡ `picomatch(patterns, options)(str)` `[lib/picomatch.js:194]`.
**FR-011 (must)** `.parse(pattern, options)`: array → mapped array; always `fastpaths:false`; returns state with keys `{input,index,start,dot,consumed,output,prefix,backtrack,negated,brackets,braces,parens,quotes,globstar,tokens,peek,advance}` (functions normalized out in corpus). All numeric positions (`index`, `start`, `consumed`, token boundaries) are **UTF-16 code-unit offsets** identical to the oracle (D-013, §5.3) `[lib/picomatch.js:210-213; probe]`.
**FR-012 (must)** `.scan(input, options)` full contract incl. `negatedExtglob`, tokens/parts/slashes/maxDepth per options `[lib/scan.js:327-388; test/api.scan.js]`.
**FR-013 (must)** `.compileRe(state, options, returnOutput, returnState)`: `returnOutput:true` → `state.output`; wraps `^(?:…)$` (or unanchored when `contains`); negated → `^(?!SOURCE).*$`; `returnState` attaches state `[lib/picomatch.js:264-284]`.
**FR-014 (must)** `.makeRe(input, options, returnOutput, returnState)`: non-string/empty → `TypeError('Expected a non-empty string')`; fastpath attempt when `input[0] ∈ {'.','*'}` and `fastpaths!==false`; falls back to full parse `[lib/picomatch.js:305-321]`.
**FR-015 (must)** `.toRegex(source, options)`: flags = `opts.flags || (nocase ? 'i' : '')`; on construction error: rethrow iff `debug:true`, else return never-match `/ $^ /` `[lib/picomatch.js:340-348; probe:toRegex bad]`.
**FR-016 (must)** `.constants` export with `MAX_LENGTH=65536`, `DEFAULT_MAX_EXTGLOB_RECURSION=0`, `POSIX_REGEX_SOURCE` (14 classes), helper regexes, `REPLACEMENTS` (`***`→`*`, `**/**`→`**`, `**/**/**`→`**`), char codes, `extglobChars()`, `globChars()` `[lib/constants.js]`.
**FR-017 (must)** Two entry modes mirroring `index.js` vs `posix.js`: OS-detecting constructor (windows default from host) and always-posix constructor; detection applies only when `windows` option is null/undefined `[index.js:6-13; posix.js]`.
**FR-018 (must)** Error model: `TypeError` for argument validation (messages in FR-001/008/014), `SyntaxError` for `maxLength` overflow (`'Input length: N, exceeds maximum allowed length: M'`) and `strictBrackets` imbalance (`'Missing <opening|closing>: "<c>" - use "\\\\<c>" to match literal characters'`) `[lib/parse.js:44-46,364-368; test/malicious.js; test/dots-invalid.js]`.

## 7. Pattern Language and Semantics

**FR-020 (must)** Literals/escaping: backslash escapes special chars; `\u0000` ignored; `\/` skipped unless `bash:true`; `\.`/`\;` skipped; 3+ consecutive backslashes collapsed (odd keeps one); `$`/`^` escaped in text; quotes toggle literal mode (contents regex-escaped, kept only with `keepQuotes`) `[lib/parse.js:661-782; test/special-characters.js]`.
**FR-021 (must)** `*` = `[^/]*?` (windows `[^\\/]*?`) with dot-guard `(?!.)` + `(?=.)` at segment starts when `dot:false`; consecutive `**` handling per FR-023; trailing optional `/?` unless `strictSlashes` `[lib/constants.js; lib/parse.js:1246-1284; lib/parse.js:1304-1306]`.
**FR-022 (must)** `?` = `[^/]`; at segment start with `dot:false` → `[^./]`; after `(` without group-prefix → literal `\?` unless valid group syntax `[lib/parse.js:1021-1047; test/qmarks.js]`.
**FR-023 (must)** `**` globstar: full-segment only semantics; collapses consecutive `/**/`; end-anchored forms with `|$` unless `strictSlashes`; leading `(?:^|/|GS/)` form; dot rule `(?!(?:^|/)\.)` (or DOTS_SLASH when `dot:true`); `noglobstar` demotes to star `[lib/parse.js:1128-1244; test/globstars.js]`.
**FR-024 (must)** Brackets: classes, ranges, `[!`→`[^` (or per posix rules), literal-`]` first-position handling, `-` before `]` escaped, `[:class:]` expansion via 14-class table when `posix!==false`, unknown class stays literal, `/` inside class handling (`[^/]…` rewrite on close when no slash present); `literalBrackets` tri-state; `nobracket` literal; unclosed `[` escaped unless `strictBrackets` `[lib/parse.js:713-758,814-875; lib/constants.js:73-89; test/brackets.js; test/posix-classes.js]`.
**FR-025 (must)** Braces: `{a,b}` → `(a|b)`; `{a..z}`/`{1..3}` → sorted class via `expandRange` (default or custom); braces without comma/dots → literal `\{…\}`; nested braces; `nobrace` literal; unclosed `{` escaped unless `strictBrackets` `[lib/parse.js:881-941; test/braces.js]`.
**FR-026 (must)** Extglobs: `@(x)` → `(x)`; `?(x)` → `(?=.)?(?:x)?`... exact outputs: `?(` → `(?:` + `)?`, `+(` → `(?:` + `)+`, `*(` → `(?:` + `)*`, `@(` → `(?:` + `)`, `!(` → `(?:(?!` + `))STAR)` with STAR=globstar when inner contains `/` and length>1; negate-close variants at eos/paren-runs and expression-after-close `!(*.d).ts` (re-parse rest with fastpaths disabled); `negatedExtglob` state flag when negate-extglob at bos `[lib/constants.js:167-175; lib/parse.js:523-600; test/extglobs.js; test/extglobs-temp.js; commit 9f241ef]`.
**FR-027 (must)** Pipes `|` inside extglobs/parens increment condition count; outside → literal text `[lib/parse.js:946-952]`.
**FR-028 (must)** Negation: leading `!` (not before `(`-extglob) toggles `state.negated` with `!!` even-count cancellation; `nonegate` disables; scan sets `negated` `[lib/parse.js:457-473,1053-1065; lib/scan.js:250-254; test/negation.js]`.
**FR-029 (must)** Dotfiles: `*`/`?`/globstar/brackets don't match leading dot of a segment unless `dot:true` or pattern has explicit dot; `..` segment handling `[test/dotfiles.js; test/dots-invalid.js; lib/constants.js NO_DOT/NO_DOTS/NO_DOT_SLASH/NO_DOTS_SLASH]`.
**FR-030 (must)** Separators: posix `/` vs windows `[\\/]` affecting STAR/QMARK/anchors/basename/format; drive-letter paths `[test/slashes-posix.js; test/slashes-windows.js; lib/constants.js WINDOWS_CHARS]`.
**FR-031 (must)** Trailing slash: optional after final star/bracket unless `strictSlashes`; globstar-end `|$` variant `[lib/parse.js:1193,1304-1306; probe]`.
**FR-032 (must)** `basename/matchBase`: source behavior including issue #89 quirk `[FR-008/009; issue#89]`.
**FR-033 (must)** `contains` mode: unanchored matching; negated → `^(?!(?:...)).*$` `[lib/picomatch.js:270-276; probe:contains_neg]`.
**FR-034 (must)** `capture` mode: capturing groups; test returns match array `[lib/parse.js:374,403-405,531,546,568; lib/picomatch.js:147-153; test/options.maxExtglobRecursion.js:120-134]`.
**FR-035 (must)** `bash` mode: star→globstar semantics + escape behavior change `[FR-020/021; test/bash.js; test/bash.spec.js]`.
**FR-036 (must)** `regex` mode: `+` regex rules; star after `)`/`]` stays regex quantifier `[lib/parse.js:1077-1089,1257-1261; test/regex-features.js]`.
**FR-037 (must)** Fastpaths: 8 shapes + `*.ext` recursion; only via `makeRe` with `fastpaths!==false` and leading `.`/`*`; `strictSlashes` respected; `contains` special case `[lib/parse.js:1330-1414,606-655]`.
**FR-038 (must)** REPLACEMENTS pre-pass on pattern (`***`, `**/**`, `**/**/**`) before parsing in both parse and fastpaths `[lib/parse.js:361,1338; lib/constants.js:105-110]`.
**FR-039 (must)** `./` prefix stripping: leading `./` removed, recorded in `state.prefix`; dot+slash at start resets start `[lib/utils.js:43-50; lib/parse.js:980-987]`.

## 8. Options and Configuration

**FR-040 (must)** All defaults and aliases (`matchBase`=`basename`, `noext`→`noextglob`) as tabulated in `knowledge/options-matrix.md` (canonical counts: 33 main rows = 31 distinct + 2 aliases; 7 scan rows = 4 scan-specific + 3 shared). **FR-041 (must)** Option interactions: flags-over-nocase; windows+matchBase; dot+globstar; capture+extglob wrappers; contains+negation; strictSlashes+fastpaths; bash+escapes `[options-matrix §interactions; test/options.js]`.

## 9. Scanner Contract

**FR-050 (must)** Output fields `{prefix,input,start,base,glob,isBrace,isBracket,isGlob,isExtglob,isGlobstar,negated,negatedExtglob}` always present; `start` is a **UTF-16 code-unit offset** (D-013) `[lib/scan.js:327-340]`.
**FR-051 (must)** `parts:true` adds `slashes:number[]` + `parts:string[]`; `tokens:true` implies parts and adds `tokens` + `maxDepth` (globstar depth=Infinity→normalized); prefix token `isPrefix:true, depth:0` when `start!==0`. `slashes[]` entries are **UTF-16 code-unit offsets**; `parts[]` are unit-derived substrings (D-013) `[lib/scan.js:342-386; test/api.scan.js]`.
**FR-052 (must)** Options `parts, tokens, scanToEnd, noext, noparen, nonegate, unescape` behaviors as source `[lib/scan.js:53,171,250,256,288,319-325]`.
**FR-053 (must)** Base/glob split: last slash before first glob marker; trailing separator stripped from base unless base is `/` or whole input; escaped-brace handling `[lib/scan.js:293-317]`.

## 10. Parser and Intermediate Representation

**FR-060 (must)** Token stream: `bos` first (output = `opts.prepend || ''`); typed tokens (`text, star, globstar, qmark, bracket, brace, paren, slash, dot, dots, comma, plus, at, maybe_slash`) with `prev` links; text-token coalescing `[lib/parse.js:371-373,493-521; test/api.picomatch.js:317-364]`.
**FR-061 (must)** State fields and invariants (brackets/braces/parens/quotes counters; stack discipline; backtrack flag → rebuild output from tokens incl. `suffix`) `[lib/parse.js:412-437,475-484,1308-1319]`.
**FR-062 (must)** globstar→star demotion when next token isn't slash/paren/brace/extglob context `[lib/parse.js:494-505]`.
**FR-063 (must)** maxLength check in both parse and fastpaths `[lib/parse.js:364-369,1332-1336]`.
**FR-064 (must)** Risky-extglob safeguard: full `analyzeRepeatedExtglob` port — splitTopLevel, isPlainBranch, normalizeSimpleBranch, hasRepeatedCharPrefixOverlap, parseRepeatedExtglob, getStarExtglobSequenceChars, repeatedExtglobRecursion, buildCharClassStar; literalize vs safe-rewrite vs allow, honoring `maxExtglobRecursion` (false|number) and capture `[lib/parse.js:48-347,539-566; test/options.maxExtglobRecursion.js; GHSA-c2c7-rcm5-vvqj]`.
**FR-065 (must)** expandRange default: sort args, `[a-b]` if valid regex class else escaped `a..b`; custom fn output raw `[lib/parse.js:22-38; test/options.expandRange.js]`.

## 11. Matching Engine

**FR-070 (must)** Two-engine design (D-003): primary Rust `regex` for sources without lookaround; fallback engine for the lookaround subset with identical accept/reject behavior; engine selection is deterministic by source inspection and recorded per corpus case.
**FR-071 (must)** Equality fast path before regex (FR-008) including `format` handling.
**FR-072 (must)** Flags mapping: `nocase`→case-insensitive (simple fold parity G-10); `flags` passthrough limited to `{i,m,s,u}` subset semantics — `g`/`y` documented as stateful-JS edge case, rejected or normalized. **Unicode class/boundary semantics:** JS without `/u` treats `\b\w\d\s\W\D\S\B` as ASCII; the Rust engines are Unicode-aware by default, so the emission layer ASCII-maps passthrough escapes with inline `(?-u:…)` groups (verified against `test/extglobs.js:765-769`, `test/regex-features.js:10-15`). `flags:'u'`/`'iu'` leaves Unicode semantics on. Astral `.` scalar-vs-unit edge recorded as DV-7 `[lib/picomatch.js:343; knowledge/research-gaps.md G-10; docs/rust-design-options.md §engine-semantics]`.
**FR-073 (must)** No catastrophic-backtracking guarantee at least as strong as oracle: risky extglobs literalized identically; fallback engine runs under an explicit `backtrack_limit` (candidate 1,000,000 backtrack steps, matching the fancy-regex upstream default; engine option `maxBacktrackSteps`). On `BacktrackLimitExceeded`/`StackOverflow` the matcher returns a typed `PicomatchError::ResourceLimit` (CLI `{"errorClass":"ResourceLimitError","kind":...}`) — a typed, visible failure, never a silent `isMatch:false`; divergence **DV-6** registered (oracle eventually answers a boolean). Never-match `/ $^ /` remains for internal compile failure only (FR-015) `[GHSA-c2c7-rcm5-vvqj; lib/picomatch.js:344-347; D-003 budget semantics 2026-07-31]`.
**FR-074 (must)** No panics on adversarial input: all parse/compile/match paths return `Result` or controlled values; fuzz-proven in Phase 9 `[NFR-003]`.

## 12. Platform and Path Semantics

**FR-080 (must)** WINDOWS_CHARS vs POSIX_CHARS fragment tables ported exactly (SLASH_LITERAL, QMARK, STAR, DOTS_SLASH, NO_DOT, NO_DOTS, NO_DOT_SLASH, NO_DOTS_SLASH, QMARK_NO_DOT, START_ANCHOR, END_ANCHOR, SEP) `[lib/constants.js:3-67]`.
**FR-081 (must)** `toPosixSlashes` = replace `\` not followed by `[*+?^${}(|)[\]]` with `/`; `basename` split semantics incl. trailing slash; `removeBackslashes` semantics `[lib/utils.js:15,30-34,63-72; lib/constants.js:97,102]`.
**FR-082 (must)** windows+format default: test formats input to posix slashes before matching (FR-008) `[lib/picomatch.js:138-145]`.

## 13. Errors, Edge Cases, and Failure Modes

**FR-090 (must)** Full edge inventory implemented and corpus-covered: empty pattern; empty input; pattern==input; `!` only; `**` only; `/` only (scan empty-parts quirk issue #58); unbalanced `[( { (` (non-strict → escaped; strict → SyntaxError); NUL chars; 65535/65536/65537 length boundaries; `[[::]]` unknown classes; `[]` empty class; `[!]`; `{}` `{,}` `{a..}`; `()`; `?(`, `+(`, `*(`, `@(`, `!(` unterminated; `a\` trailing backslash; quotes unterminated; `E:\a\b` windows drives; `foo//baz` double slashes; `.` and `..` inputs; `../` prefixed patterns `[test/dots-invalid.js; test/malicious.js; test/special-characters.js; issue#58; probe]`.
**FR-091 (must)** `flags:'g'` statefulness documented; port behavior defined (fresh exec per call, i.e. JS-with-lastIndex-0) and recorded as divergence if any `[research: MDN lastIndex; DECISIONS.md]`.

## 14. Security and Resource Limits

**NFR-001 (must)** `maxLength` 65536 enforced identically; pattern length arithmetic cannot overflow `[lib/parse.js:364-368]`.
**NFR-002 (must)** Risky-extglob safeguard parity incl. branch-preserving rewrite `[FR-064; commit 6289307]`.
**NFR-003 (must)** Zero panics/UB: `#![forbid(unsafe_code)]` in our crates by default; any approved exception documented per-block (D-009); Miri run if any unsafe exists `[event bonus; Miri docs]`.
**NFR-004 (must)** Fallback-engine worst case bounded (explicit `backtrack_limit`; see FR-073/D-003); limit-exceeded outcome is the typed `ResourceLimitError` (DV-6) with corpus `EXPECTED_LIMIT` classification; documented residual risk for pathological non-risky lookahead patterns `[research-gaps G-15; D-003]`.
**NFR-005 (should)** Prototype-injection class of bugs is N/A in Rust by construction (no prototype chain); POSIX class table is a closed map `[GHSA-3v7f-55p6-f55p]`.
**NFR-006 (should)** Allocation growth bounded by output size ∝ input length; recursion depth in parser is loop-based (no unbounded recursion) — extglob analysis recursion mirrors JS iteration `[lib/parse.js:164-285]`.

## 15. Performance Requirements

**NFR-010 (should)** Compile (makeRe) throughput within the same order of magnitude as JS baseline on the upstream bench corpus; report honest ratios with methodology — no cherry-picking `[event §09; bench/index.js]`.
**NFR-011 (should)** Matching throughput ≥ JS for cached-matcher repeated matching on the shared workload (regex crate is expected to win; measured, not claimed) `[regex linear-time docs]`.
**NFR-012 (must)** Benchmark report includes p50/p99, RSS, startup time, throughput, distributions, hardware/toolchain recording `[event §04 deliverable 06]`.

## 16. Differential Testing and Fuzzing

**NFR-020 (must)** JSONL corpus v1 (schema in `docs/differential-testing.md` §3) generated from the oracle at pinned commit; SHA-256 manifest recorded.
**NFR-021 (must)** Differential runner: JS oracle (dev-only) + Rust runner; normalization per §5.3; mismatch triage → fixtures promotion `[docs/differential-testing.md]`.
**NFR-022 (must)** Property tests (proptest) over the pattern grammar with shrinking; regression files committed `[Context7 proptest]`.
**NFR-023 (must)** cargo-fuzz targets for scanner, parser, matcher (Linux CI, nightly); ≥60s zero-divergence run published for bonus `[Rust Fuzz Book; event bonus]`.
**NFR-024 (should)** Cross-implementation comparators (glob-match/globset) on the common subset as secondary signals, never as oracles `[knowledge/dependency-evaluation.md]`.

## 17. Build, Packaging, and Distribution

**NFR-030 (must)** One-command build: `cargo build --release` from repo root after `rustup` install; `rust-toolchain.toml` pins **1.97.1** (current stable as of 2026-07-31, D-012); Cargo.lock committed `[event §05; research-gaps G-13]`.
**NFR-031 (must)** One-command test: `cargo test` (unit+integration+doc) and documented adapter command for original mocha suite `[docs/build-and-ci.md]`.
**NFR-032 (must)** Crate layout: `crates/picomatch` (lib) + `crates/picomatch-cli` (differential/adapter CLI); no Node in dependency graph of shipped artifacts.
**NFR-033 (should)** Dockerfile reproducing build+test in one command `[event anatomy]`.

## 18. Observability and Benchmark Reporting

**NFR-040 (must)** Parity report generated per run: total/passed/failed per suite file + per-op, diffable against baseline manifest.
**NFR-041 (must)** Criterion-based benches: parse/compile, cold one-shot, cached repeated match (matching & non-matching), adversarial input set, allocations; binary size recorded `[criterion docs]`.
**NFR-042 (must)** All performance claims reproducible: committed methodology + raw results JSON `[docs/benchmarking.md]`.

## 19. Licensing and Attribution

**NFR-050 (must)** MIT license retained; `LICENSE` preserved; NOTICE/attribution to Jon Schlinkert and micromatch in README; dependency licenses reviewed per policy D-005 `[LICENSE; knowledge/dependency-evaluation.md]`.

## 20. Acceptance Criteria and Traceability

| Requirement class | Acceptance test | Evidence artifact |
|---|---|---|
| FR-001..091 — 60 defined IDs, gaps reserved (behavior) | corpus replay 100% P0 pass + mocha adapter run | parity report (Phase 8) |
| NFR-001..006 (security) | malicious corpus + fuzz + panic-free | fuzz log, Miri report |
| NFR-010..012 (perf) | benchmark suite executed | bench/results.json + methodology |
| NFR-020..024 (diff/fuzz) | 60s zero-divergence | fuzz/log.txt |
| NFR-030..033 (build) | fresh-clone one-command build/test on 3 OSes | CI green |
| NFR-050 (license) | license files present | repo inspection |
| Bonus targets | unsafe count = 0 (goal), upstream issue filed (#175), DECISIONS.md ≥10 entries | submission checklist |

Traceability matrix requirement→test lives in `plan.md` phases (Covers fields) and `docs/compatibility-matrix.md`.

## 21. Unresolved Items with Safe Defaults

See `knowledge/research-gaps.md` G-01..G-18. As of Phase 0 remediation (2026-07-31): G-01 eligibility is closed (pool-listed, VERIFIED); **D-001/D-002/D-003/D-012/D-013 are Accepted**; the only `Proposed` ADR is D-004 (Phase 5 validation gate, by design). Remaining open items are Discord/kickoff logistics (G-02) and phase-gated validations with owners — no load-bearing `[assumed: ...]` markers remain in Phase 0/1 claims.
