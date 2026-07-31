# Test Inventory — upstream suite → Rust port mapping

Baseline: **1977 passing, 0 failing** (`npm run mocha`, Node v24.13.0, Windows 11, re-verified 2026-07-31 ~22:45). Coverage: stmts 93.2%, branches 89.81%, funcs 91.66%, lines 93.75% (`npm run test:cover`). Lint clean. Every suite file below was read in full for this mapping (2026-07-31).

Event rule (verified): original tests are hashed at kickoff and ideally run **unmodified** against the port via a thin adapter. Strategy: (a) Phase 1 public-API oracle generates the JSONL corpus (docs/differential-testing.md §10); (b) the Phase 2/3-spiked, Phase 8-completed mocha adapter executes the original files against the Rust artifact (§11).

## Count terminology (canonical — use exactly these)

- **Suite files:** 36 top-level `test/*.js` Mocha suite files + `test/support/match.js` (helper, not a suite) = **37 `.js` files**.
- **Hash-manifest files:** 38 (37 `.js` + `test/.eslintrc.json`) — see `tests/test-hash-manifest.json`.
- **Tests:** **1977** = exact count of `it()` blocks across suites (script-verified 2026-07-31) = mocha's "1977 passing".
- **Assertion call sites:** 623 `assert.<method>(...)` + 8,810 bare `assert(...)` = 9,433 static call sites (script-verified). Suites also assert via the `support/match` helper (deepStrictEqual on collected outputs).
- **Platform guards:** 5 sites — `malicious.js:13` (1 assertion), `qmarks.js:45` (whole `it`, 3 assertions), `extglobs.js:713` (1), `extglobs.js:753` (1), `bash.js:661` (2) — all `process.platform !== 'win32'`; corpus marks those cases `platforms: ["linux","darwin"]`.
- **Async its:** `dotfiles.js:227` and `dotfiles.js:294` are `async` (contain no `await`) — adapter-irrelevant, noted for exactness.

## Suite mapping table (37 `.js` files; generator category: **T** = table-driven mechanical, **C** = hand-curated per-op, **H** = helper/hybrid incl. events ops)

| Suite file | it() | requires | guard | Behavior families | Gen | Adapter / JSONL notes |
|---|---|---|---|---|---|---|
| `api.picomatch.js` | 24 | `..` | — | arg validation (throws), arrays, dotfiles, parse token shapes, negatedExtglob state | C | token-shape assertions map to `[type,value]` pairs; one case asserts `{output: undefined}` — needs `__undefined__` normalization |
| `api.posix.js` | 2 | `../posix` | — | posix entry default, windows override | C | adapter must intercept `../posix` too |
| `api.scan.js` | 40 | `../lib/scan` | — | scan contract: base/glob split, flags, parts/slashes/tokens/maxDepth, noext/noparen/nonegate/unescape, BMP non-ASCII (`フォルダ/**/*` L360) | C | deepStrictEqual on WHOLE state objects — exact key presence/absence; internal `../lib/scan` require |
| `bash.js` | 12 | `..` | L661 | Bash 4.3 tables: literals, classes, quotes, escapes, consolidation, malformed (`[]`, `[abc`) | T | 2 posix-only assertions |
| `bash.spec.js` | 111 | `..` | — | bash:true mode: dotglob, glob, globstar | T | |
| `braces.js` | 17 | `fill-range`, `./support/match`, `..` | — | nobrace, literal braces, lists, ranges, Kleene star/plus, slashes/empty elements, globstar braces, custom expandRange | T | expandRange fn → named registry (`@expandRange/fillRange`) |
| `brackets.js` | 3 | `..` | — | stars after brackets, `[/]` classes | T | |
| `dotfiles.js` | 23 | `./support/match`, `..` | — | dot rules per segment, negation on dotfiles, `..`/`../` patterns, explicit-dot | T | two `async` its (no awaits) |
| `dots-invalid.js` | 152 | `..` | — | exclusive single/double dots × {no-opts, dot, strictSlashes, dot+strictSlashes} matrix | T | fully mechanical matrix — ideal table-driven suite |
| `extglobs.js` | 42 | `./support/match`, `..` | L713, L753 | strictBrackets throws, paren-escape, negation extglobs (nested, multiple, ors), file-extension extglobs, empty parens, escaped parens/backslashes, regex-char classes `\w\W\d\D`, word boundary `\b` | T | `makeRe('c!(?:foo)?z').source` strictEqual (L28); 2 posix-only assertions; passthrough-class cases (ASCII mapping, FR-072) |
| `extglobs-bash.js` | 648 | `..` | — | extglob tables × {bash:true, windows:true} — single-assertion its | T | fully mechanical |
| `extglobs-minimatch.js` | 642 | `..` | — | extglob tables × {windows:true} — single-assertion its | T | fully mechanical |
| `extglobs-temp.js` | 11 | `..` | — | bash-derived extglob tables, alternation backtracking, exclusions, posix-in-extglob | T | all `{ windows: true }` |
| `globstars.js` | 18 | `./support/match`, `..` | — | globstar positions, braces after globstar, strictSlashes, dots | T | |
| `issue-related.js` | 7 | `..` | — | issues #8/#15/#23/#24/#58/#79, micromatch#127 (Japanese chars) | C | non-ASCII match cases |
| `malicious.js` | 5 | `..` | L13 | maxLength boundaries, custom maxLength, prototype-property patterns, long escapes | C | `makeRe(...).toString()` assert.equal (L41) — facade toString `/${source}/${flags}`; 1 posix-only assertion |
| `minimatch.js` | 8 | `..` | — | minimatch-comparison matching, format fn, nocase, windows | T | `makeRe(...).test(...)` — facade shadow test() |
| `negation.js` | 13 | `..` | — | leading-! runs incl. even-count cancellation, nonegate, quotes+keepQuotes, negated globstars | T | |
| `non-globs.js` | 4 | `..` | — | literals, literal dots, escaped literals, windows paths | T | |
| `options.js` | 16 | `./support/match`, `..` | — | matchBase (+windows regression trio L25-33), flags, nocase, noextglob literal parens (#116), unescape, nonegate, windows drives, format fn | C | format fn → named registry (`@format/stripDotSlash`) |
| `options.expandRange.js` | 1 | `fill-range`, `..` | — | custom expandRange functions | C | named registry |
| `options.format.js` | 1 | `./support/match`, `..` | — | custom format fn (`backslash+./` strip) | C | named registry (`@format/backslashDotStrip`) |
| `options.ignore.js` | 2 | `./support/match`, `..` | — | ignore patterns, dot+ignore, negation+ignore | C | ignore pipeline; events ops cover onIgnore |
| `options.maxExtglobRecursion.js` | 11 | `..` | — | risky-extglob literalization, safe class-star rewrite, branch preservation, capture preservation, maxExtglobRecursion 1/false, adjacent extglobs | C | `.source` strictEqual family (compareSource=true); `.exec` + Array.from capture arrays (facade exec, undefined-vs-null) |
| `options.noextglob.js` | 2 | `..` | — | noextglob + noext alias | T | |
| `options.noglobstar.js` | 1 | `..` | — | noglobstar | T | |
| `options.onMatch.js` | 1 | `./support/match`, `..` | — | onMatch callback payloads, format fn | C | events op records callback sequence |
| `parens.js` | 2 | `..` | — | non-extglob parens, stars after parens | T | |
| `posix-classes.js` | 34 | `..` | — | 14 POSIX classes, multi-class, invalid classes, literals, parse-output strictEqual (`convert()`), makeRe-vs-literal deepStrictEqual (L188-189) | C | `parse(...).output` strictEqual (compareSource=true); deepStrictEqual(makeRe(...), /literal/) — facade must be REAL RegExp (P6) |
| `qmarks.js` | 10 | `./support/match`, `..` | L45 | `?` semantics, dot rule, per-char enforcement, between-slash rules | T | whole-it posix-only (3 assertions) |
| `regex-features.js` | 26 | `../lib/utils`, `..` | — | `\b` word boundaries, **lookbehind** `(?<!d)`/`(?<=c)` (L20-23), **backreferences** `\1` (L29-41), classes, ranges, capture/non-capture groups, quantifier escapes, basename via `../lib/utils` | C | fallback-engine cases (lookbehind/backrefs — engine-selection rule); `../lib/utils` interception for adapter |
| `slashes-posix.js` | 18 | `..` | — | posix separators, trailing slashes, leading slashes, double slashes, escaped stars | T | uses unknown option `{relaxSlashes:true}` (L211) — ignored by oracle; generator passes unknown options through |
| `slashes-windows.js` | 12 | `..` | — | windows `[\\/]`, drives, mixed slashes, negation | T | `regex.test(input, {windows:true})` — facade .test tolerates extra arg |
| `special-characters.js` | 39 | `..` | — | numbers, qmarks, parens, path chars, brackets, star/plus, `$`/`^`, mixed specials, strictBrackets throws | T | throws assertions (`assert.throws(..., /Missing opening|closing/)`) |
| `stars.js` | 17 | `..` | — | `*` semantics, consecutive stars, segment rules, trailing slashes, extensions, array patterns | T | |
| `wildmat.js` | 2 | `..` | — | wildmat-derived features, recursion | T | |
| `support/match.js` | (helper) | `../..` | — | collects `match.output` into Set via returnObject | H | replicated as generator helper (data), and by adapter as dev-tooling copy (never modified) |

## Callback/function-valued options — normalization for the oracle corpus

JS options may be functions (`format`, `expandRange`, `onMatch`, `onIgnore`, `onResult`). The JSONL corpus cannot transport JS closures, so the oracle runner registers a **named library** of the exact functions used by the suite (`@format/stripDotSlash`, `@format/backslashDotStrip`, `@expandRange/fillRange`, `@expandRange/classRange`, `@onResult/collect`, `@onMatch/collect`, `@onIgnore/collect`). The Rust runner implements the same named functions; the adapter executes the suite's real closures in the adapter process (docs/differential-testing.md §11). Event sequences from onMatch/onIgnore/onResult are recorded in the corpus as an ordered array of `{event, input, output, isMatch}` entries and asserted identically in Rust.

## Non-portable values — normalization rules

| JS value | JSONL representation |
|---|---|
| `Infinity` (scan token depth / maxDepth) | `{"__inf__": true}` |
| RegExp object (result.regex, makeRe/toRegex returns) | `{ "source": "...", "flags": "..." }` (source compared only when `compareSource: true`; the JS-form source is preserved as metadata per D-002(c) even when the Rust engine compiles a translated form) |
| `match` array from exec | JSON array of strings/`null` for `undefined` holes; the adapter converts `null` back to `undefined` when rebuilding JS-shaped exec arrays (probe P9) |
| `state` on matcher (returnState) | subset projection: `{negated, negatedExtglob?, output?}` per op |
| thrown errors | `{ "errorClass": "TypeError|SyntaxError", "message": "exact string" }` |
| `undefined` vs missing keys | missing keys omitted; explicit undefined → `{"__undefined__": true}` |
| exec result object | `{ "match": [...], "index": n, "input": "..." }` (`groups`/`indices` only when present) |

## Platform-sensitivity register

- Guard sites (all `process.platform !== 'win32'`): `malicious.js:13` (1 assertion), `qmarks.js:45` (3), `extglobs.js:713` (1), `extglobs.js:753` (1), `bash.js:661` (2). Corpus marks these `platforms: ["linux","darwin"]`.
- Suites that do not force `windows:` inherit OS detection — the oracle runner forces `windows:false` for canonical cases and adds explicit `windows:true` variants; OS-dependent behavior is then data, not environment.
- `slashes-posix.js:211` uses unknown option `{relaxSlashes:true}` — the oracle ignores it; the generator passes unknown options through unchanged (recorded in `meta` when present).
- Node version sensitivity: none observed in suite output between local Node 24 and CI matrix (12–25) — CI re-confirms in Phase 1/11. Local dev mocha resolved to 10.8.2 (`^10.4.0`, no lockfile — expected drift, no behavioral impact observed).
