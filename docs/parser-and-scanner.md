# Parser and Scanner — Decomposition, Invariants, Migration Risk

Status: implementation-grade map (spec §9–10); implementation Phases 4–7. Evidence: FULL reads of `lib/scan.js` (391), `lib/parse.js` (1416), `lib/picomatch.js` (361), `lib/constants.js` (184), `lib/utils.js` (72), `index.js` (17), `posix.js` (3) @`4f41a8e` — every function below is line-referenced to that commit. No behavior in this file is asserted from memory.

## Call/dependency graph

```
index.js ──> lib/picomatch.js ──> lib/scan.js ──> lib/utils.js ──> lib/constants.js
posix.js ──┘        │    └─────> lib/parse.js ──┘            ▲
                    └─────────────────────────────────────────┘
```

- `picomatch()` → `makeRe` (fastpath attempt → `parse`) → `compileRe` → `toRegex`; `matcher` → `picomatch.test` (+ `matchBase`).
- `parse` is standalone (also exposed via `.parse` with fastpaths disabled). `scan` shares nothing with `parse` — separate char-code machine.

## Complete function/call inventory

### lib/parse.js (1416)

| Function | Lines | Role | Calls |
|---|---|---|---|
| `expandRange` | 22–38 | default brace-range expander (sort, `[a-b]`, escaped fallback; custom fn raw) | `utils.escapeRegex` |
| `syntaxError` | 44–46 | strictBrackets message format | — |
| `splitTopLevel` | 48–98 | split extglob body on top-level `\|` (bracket/paren/quote/escape aware) | — |
| `isPlainBranch` | 100–120 | branch has no glob metachars | — |
| `normalizeSimpleBranch` | 122–140 | unwrap `@(x)` layers + unescape; undefined if not plain | `isPlainBranch` |
| `hasRepeatedCharPrefixOverlap` | 142–162 | single-char-repeat prefix overlap (issue #175 gap: no multi-char) | `normalizeSimpleBranch` |
| `parseRepeatedExtglob` | 164–231 | parse `+(`/`*(...)` header → `{type, body, end}` | — |
| `buildCharClassStar` | 233–239 | `[ab]*` or `a*` from char set | `utils.escapeRegex` |
| `getStarExtglobSequenceChars` | 241–271 | all-single-char `*(x)` sequence detection | `parseRepeatedExtglob`, `splitTopLevel`, `normalizeSimpleBranch` |
| `repeatedExtglobRecursion` | 273–285 | nesting depth of repeated extglob | `parseRepeatedExtglob` |
| `analyzeRepeatedExtglob` | 287–347 | risky decision: literalize / safe class-star rewrite / allow | all of the above |
| `parse` (main) | 356–1322 | glob → JS regex source (state machine) | below |
| `parse.fastpaths` | 1330–1414 | closed 8-shape table + `*.ext` recursion | `utils.removePrefix` |

`parse` internals: REPLACEMENTS pre-pass (361) → maxLength (364–369) → bos token (371) → `globChars(win)`/`extglobChars(chars)` factories (377–378) → `globstar` builder (395–397) → `star`/`nodot` setup (399–405) → noext alias (408–410) → state init (412–428) → `utils.removePrefix` (430) → helpers `eos/peek/advance/remaining/consume/append` (443–455), `negate` (457–473), `increment/decrement` (475–483), `push` (493–521: globstar→star demotion 494–505, text coalescing 512–516, extglob inner accumulation 507–509), `extglobOpen` (523–537), `extglobClose` (539–600) → inline fastpath (606–655) → main loop (661–1284) → close-out (1286–1306) → backtrack rebuild (1309–1319).

### Main-loop token transitions (line-referenced)

| Construct | Lines | Key behavior |
|---|---|---|
| NUL skip | 664–666 | `\u0000` ignored |
| backslash | 672–711 | `\/` skip unless bash; `\.`/`\;` skip; 3+ backslash collapse (odd keeps one); unescape mode |
| bracket continuation | 718–758 | POSIX class expansion inline (719–741, `opts.posix !== false` gate, bos ONE_CHAR 734–736); `[`-escape rules; `!`→`^` when posix:true (751) |
| quote continuation | 765–770 | regex-escape contents |
| quotes toggle | 776–782 | keepQuotes retains literals |
| paren open/close | 788–808 | strictBrackets throw (796); extglobClose dispatch (799–802); literal `\\)` when unbalanced non-strict |
| bracket open | 814–827 | nobracket/unclosed-`]` missing → literal or strictBrackets throw |
| bracket close | 829–875 | `^`-class `/` handling (847–849); literalBrackets tri-state: false→class, true→escape, undefined→dual alternation `(?:\[x]|[x])` (860–873) |
| brace open | 881–895 | push open token (`output: '('`, outputIndex/tokensIndex tracked) |
| brace close | 897–940 | dots-range expansion via token-pop loop (907–923, sets backtrack); no comma/dots → literal rebuild `\{…\}` (925–934) |
| pipes | 946–952 | extglob `conditions++`; else literal text |
| commas | 958–969 | inside braces → `\|` |
| slashes | 975–991 | `./` prefix reset (980–987) |
| dots | 997–1015 | brace-range `..` detection (998–1006); DOT_LITERAL vs dot token |
| `?` | 1021–1047 | extglobOpen('qmark') or group-escape rules or QMARK/QMARK_NO_DOT |
| `!` | 1053–1065 | extglobOpen('negate') or leading `negate()` at index 0 |
| `+` | 1071–1089 | extglobOpen('plus'); regex-option rules (1077–1088) |
| `@` | 1095–1103 | extglob marker or text |
| text runs | 1109–1122 | `$`/`^` escaped; REGEX_NON_SPECIAL_CHARS run optimization (1114–1118) |
| stars | 1128–1284 | globstar context forms below |

### Globstar context forms (the six forms, line-referenced)

1. `prev.star` collapse (1128–1137): consecutive `**` after star → demote, set backtrack+globstar.
2. `**/`-collapse (1169–1176): consecutive `/**/` consumed.
3. bos+eos `**` alone (1178–1186): full globstar output.
4. slash+`**`+eos (1188–1199): `(?:a(?:\/GS|$))` — `|$` dropped under strictSlashes.
5. slash+`**`+slash (1201–1218): `(?:a(?:\/GS\/|\/|$)b)` middle form.
6. bos+`**`+slash (1220–1229): `(?:^|\/|GS\/)` leading form; generic reset (1231–1243) otherwise; non-segment `a**b` stays single-star via push-demotion (494–505).
Star construction (1246–1283): bash star `.*?` (1249–1253); regex-mode quantifier passthrough after `)`/`]` (1257–1261); segment-start dot guards — after dot: NO_DOT_SLASH (1264–1266), dot:true: NO_DOTS_SLASH (1268–1270), else nodot (1272–1274); ONE_CHAR when not followed by `*` (1277–1280).

### extglobClose variants (539–600)

1. Risky path (544–566): `+()`/`*()` + analysis.risky → literalize (`escapeRegex(literal)`) or safe rewrite (`safeOutput`), tokens rewound, `state.backtrack = true`.
2. Standard close (568): `token.close + (capture ? ')' : '')`.
3. Negate close upgrades (571–596): STAR→globstar when inner has `/` and length>1 (574–576); eos or `/^\)+$/` remaining → `)$))STAR` (578–580); expression-after-close (`/^\.\[^\\/.]+$/`, e.g. `!(*.d).ts`) → recursive `parse(rest, {...options, fastpaths:false})` and `)EXPR)STAR)` (582–591); `negatedExtglob` when prev is bos (593–595).

### parse state fields (412–428 + mutations)

`input, index(-1→len-1, UTF-16 units), start, dot, consumed, output, prefix, backtrack, negated, brackets, braces, parens, quotes, globstar, tokens` — plus `peek`/`advance` attached (444–445). Stack discipline via `increment/decrement` (475–483). Extglob token extras: `conditions, inner, parens, startIndex, tokensIndex, output` (523–531). Brace token extras: `outputIndex, tokensIndex, comma, dots` (884–890).

### lib/scan.js (391)

State: `{prefix, input, start, base, glob, isBrace, isBracket, isGlob, isExtglob, isGlobstar, negated, negatedExtglob}` (327–340) + optional `maxDepth, tokens, slashes, parts` (342–386). All positions are UTF-16 code-unit offsets (`charCodeAt` 78/81, `slashes.push(index)` 157, slices 293–317/353–374). Options: `parts||scanToEnd` (53), `noext` (171/288), `nonegate` (250), `noparen` (256), `unescape` (319–325), `tokens⇒parts` (342/350). `depth` = 1 or Infinity for globstar (26–30); prefix token `isPrefix:true, depth:0` when `start!==0` (358–360). Never throws.

### lib/picomatch.js (361)

Factory (43–109): array first-truthy (44–54), state input via `isObject && tokens && input` (56), TypeError (59), `posix = opts.windows` (63), ignore pipeline with stripped callbacks (71–75), result object `{glob,state,regex,posix,input,output,match,isMatch}` (79), callback order onResult→onIgnore→onMatch (81–100), returnState (104–106). `.test` (128–156), `.matchBase` (172–175 — uses `glob instanceof RegExp`), `.isMatch` (194), `.parse` (210–213), `.scan` (242), `.compileRe` (264–284), `.makeRe` (305–321), `.toRegex` (340–348 — `/$^/` never-match unless debug), `.constants` (355).

### Two fastpath mechanisms (do not conflate)

1. **Inline fastpath inside `parse()`** (606–655): regex-replacement transform when input lacks `/(^[*!]|[/()[\]{}"])/`; output wrapped via `utils.wrapOutput` (negation form `(?:^(?!OUT).*$)` — differs from compileRe's `^(?!SOURCE).*$`).
2. **`parse.fastpaths` table** (1330–1414) used only by `makeRe` when `input[0] ∈ {'.','*'}` and `fastpaths !== false`: 8 shapes + `*.ext` recursion (1394–1402), strictSlashes trailing handling (1409–1411). `.parse()` always disables it (lib/picomatch.js:212).

## Emitted-construct inventory → engine routing (D-003)

| Emitted construct | Example | Engine |
|---|---|---|
| literals/escapes | `foo\/bar\.js`, `\+\(a\|aa\)` | primary (`regex`) |
| character classes | `[^/]`, `[^./]`, `[a-z]`, `[A-Za-z0-9_]` | primary |
| groups/alternation | `(?:...)`, `(...)`, `a|b` | primary |
| anchors/quantifiers | `^ $ * + ? *? +? ??` | primary |
| lookahead | `(?=.)`, `(?!.)`, `^(?!...).*$`, `(?:(?!X))STAR` | **fallback** (fancy-regex) |
| lookbehind (passthrough) | `(?<=c)`, `(?<!d)` (test/regex-features.js:20-23) | **fallback** |
| backreferences (passthrough) | `\1` (test/regex-features.js:29-41) | **fallback** |
| `\b` (passthrough) | `a\b` | primary — but must be ASCII-mapped: JS `\b` is ASCII without `/u`, rust `\b` is Unicode-aware by default → emit `(?-u:\b)` (see §engine-semantics) |
| `\w \d \s \W \D \S` (passthrough) | `[\w]+` (test/extglobs.js:765-769) | primary — same ASCII mapping `(?-u:\w)` etc.; glob-generated POSIX classes expand to explicit ASCII ranges and need none |

Deterministic selection rule: **fallback iff the source contains `(?=`, `(?!`, `(?<` (covers `?<=`/`?<!` and named groups `(?<name>`), or a backreference `\1`–`\9`/`\k<…>`; otherwise primary.** Recorded per corpus case (`engine` field). fancy-regex 0.19.0 supports all fallback constructs incl. constant lookbehind (variable-lookbehind feature default-on for variable length).

## UTF-16 index production (D-013 implementation map)

- scan: every `index/start/lastIndex/slashes[]/start` is a charCodeAt-based unit offset; `base/glob/parts` are unit slices.
- parse: `state.index/start/consumed` unit offsets; `state.output` built by concatenation (no re-indexing); extglob `startIndex` unit offsets.
- Rust implementation: iterate `char_indices()`, keep a parallel `units` counter (BMP 1, astral 2, ASCII fast path = byte index); observable fields read from `units`; internal slices from byte ranges. Centralized in `src/text.rs` (utf16_len, byte↔unit conversion, unit-aware slice).
- unpaired surrogates: impossible in Rust `String`; protocol replaces with U+FFFD at ingestion + records in `meta` (D-013). JS can hold them; corpus never contains them.

## Engine-semantics notes (class/boundary/flags)

- JS regex without `/u`: `\b`, `\w`, `\d`, `\s` (and negations) are ASCII. The `regex` crate (and fancy-regex via delegation) is Unicode-aware by default (its UNICODE.md RL1.2/RL1.5). The emission layer ASCII-maps passthrough escapes with inline `(?-u:…)` groups — preserving `.` as Unicode-scalar (closest to JS for BMP).
- JS `.` matches one UTF-16 code unit (astral = lone surrogate possible); rust `.` matches a full scalar value. Astral inputs to passthrough patterns are a documented boundary (DV-7) — glob constructs never emit bare `.`.
- `flags:'u'`/`'iu'` → leave Unicode semantics on (JS `/u` behavior ≈ rust default); `flags:'g'/'y'` → DV-2 (fresh exec, lastIndex 0, documented); `nocase`/`i` → `(?i)` (simple fold parity, G-10 corpus-verified in Phase 9).

## Migration risk classification

| Component | Risk | Justification |
|---|---|---|
| scan.js | **LOW** | self-contained char machine; clear outputs; D-013 unit discipline only |
| constants.js | **LOW** | pure data tables (POSIX/WINDOWS fragments verified line-by-line) |
| utils.js | **LOW** | small pure helpers; regexes re-expressible as hand scans (avoid regex-in-parser bootstrapping) |
| picomatch.js API/matcher | **MEDIUM** | callback pipeline + result shapes + ignore recursion; `instanceof RegExp` in matchBase |
| parse.js main loop (text/star/qmark/dot/slash/quote) | **MEDIUM** | mechanical but context-heavy; probes pin outputs |
| globstar six forms + backtrack rebuild | **HIGH** | subtle output rewrites; six context forms; probes + globstars.js pinned |
| brackets + POSIX expansion | **MEDIUM** | accumulation + inline expansion; class-table parity; literalBrackets tri-state |
| braces + expandRange | **MEDIUM** | output-index rewinds; custom fn registry |
| extglob open/close + negate variants | **HIGH** | four close variants + expression-after-close recursive re-parse |
| analyzeRepeatedExtglob safeguard | **HIGH** | newest code (4.0.4/4.0.5), subtle branch classification; must match exactly incl. `+(ab|abab)` non-catch (D-011) |
| fastpaths (both) | **LOW-MEDIUM** | closed tables; wrapOutput-vs-compileRe negation forms must both be pinned |
| engine boundary (regex vs fallback) | **HIGH** | lookaround/lookbehind/backref correctness; ASCII-class mapping; budget semantics (D-003) |

## Recommended implementation order (dependency-driven, maps to corpus slices)

1. `src/text.rs` UTF-16 helpers (D-013 foundation for everything).
2. `src/scan.rs` (Phase 4) — corpus op `scan` incl. non-ASCII index cases.
3. `src/parse.rs` main loop without brackets/braces/extglobs (Phase 5) — stars/qmarks/globstars/dotfiles/slashes/negation/non-globs/fastpaths/REPLACEMENTS/maxLength; wrapOutput + compileRe; engine selection v1 (dot-guard lookaheads → fallback).
4. Brackets/POSIX/braces/ranges/quotes/escaping (Phase 6) — brackets, posix-classes, braces, special-characters slices + expandRange registry.
5. Extglobs + safeguard + interactions (Phase 7) — extglob open/close, negate variants, analyzeRepeatedExtglob, ignore pipeline, captures, option-interaction matrix; extglobs*/bash/minimatch/temp + options.maxExtglobRecursion slices.
6. Public API + adapter (Phase 8) — factory/array/state, rich objects, callbacks, matchBase, entry modes, mocha adapter.

## What cannot be copied mechanically from JS to Rust

- **RegExp construction/exec** — replaced by engine layer (D-002/D-003) with JS-form source preserved as metadata where needed (D-002(c)).
- **UTF-16 indexing** — D-013 unit discipline (above).
- **Mutable linked `prev` token chain** — arena indices (`Vec<Token>` + `prev: usize`).
- **Prototype-chain maps** — POSIX map as closed `phf`/match; REPLACEMENTS as match (N/A vulnerability class, NFR-005).
- **JS sort() default** — code-unit sort == byte-order sort for UTF-8 (identical for ASCII; document for non-ASCII endpoints).
- **Regex literals inside utils/constants** (REGEX_BACKSLASH etc.) — hand-written scans preferred (avoid regex-in-parser bootstrapping).
- **`instanceof RegExp`** — Rust type system: `Glob::Pattern(String) | Glob::Compiled(Compiled)` enum in the matchBase surface instead.
