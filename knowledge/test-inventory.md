# Test Inventory — upstream suite → Rust port mapping

Baseline: **1977 passing, 0 failing** (`npm run mocha`, Node v24.13.0, Windows 11, 2026-07-31). Coverage: stmts 93.2%, branches 89.81%, funcs 91.66%, lines 93.75% (`npm run test:cover`). Lint clean.

Event rule (verified): original tests are hashed at kickoff and ideally run **unmodified** against the port via a thin adapter. Strategy: extract each assertion into the JSONL corpus (Phase 1) so (a) a mocha adapter can execute the original files against the Rust artifact, and (b) Rust-native integration tests replay the same cases.

## Mapping table

| Upstream file | Cases exercise | Port destination | Notes |
|---|---|---|---|
| `api.picomatch.js` | validation errors, array patterns, dotfiles, parse token shapes, negatedExtglob state | `tests/differential` (JSONL) + Rust `tests/api.rs` | token-shape assertions map to [type,value] pairs only |
| `api.posix.js` | posix entry behavior | `tests/differential` + Rust posix ctor tests | posix entry = windows:false always |
| `api.scan.js` | scanner outputs incl. tokens/parts | `tests/differential` op=`scan` | normalize Infinity→`{"__inf__":true}` (canonical, spec §5.3); includes a BMP non-ASCII parts case (`フォルダ/**/*`, line 360) — D-013 index-semantics reference case |
| `bash.js`, `bash.spec.js` | bash-derived matching | `tests/corpus` (match op) | README documents 2 intentional Bash divergences — keep as-is |
| `braces.js` | brace lists, ranges, nesting, literals | `tests/corpus` | includes {a..z} class ranges + expandRange |
| `brackets.js` | classes, negation `[!..]`, ranges, literal cases | `tests/corpus` | literalBrackets tri-state |
| `dotfiles.js` | dot rules per segment | `tests/corpus` |  |
| `dots-invalid.js` | malformed dot patterns | `tests/corpus` (error op where thrown) |  |
| `extglobs.js` | all five operators, nesting, pipes | `tests/corpus` | includes risky forms now literalized |
| `extglobs-bash.js` | bash extglob parity cases | `tests/corpus` |  |
| `extglobs-minimatch.js` | minimatch-comparison extglob cases | `tests/corpus` |  |
| `extglobs-temp.js` | regression-targeted extglob cases (issues #83/#93 family) | `tests/corpus` |  |
| `globstars.js` | `**` positions, strictSlashes, dot | `tests/corpus` |  |
| `issue-related.js` | issue regressions (#15, #23, #24, #89 family…) | `tests/corpus` + `tests/fixtures` promotion |  |
| `malicious.js` | 65536 limit, custom maxLength, prototype-property patterns, long escapes | `tests/corpus` (error op) + `tests/fuzz` seeds | 1 assertion posix-only (skipped on win32) |
| `minimatch.js` | minimatch-comparison matching | `tests/corpus` |  |
| `negation.js` | leading `!`, double `!!`, nonegate | `tests/corpus` |  |
| `non-globs.js` | literal patterns, escaping | `tests/corpus` |  |
| `options.js` | matchBase/windows/flags/nocase/noextglob/unescape/nonegate | `tests/corpus` with options payload |  |
| `options.expandRange.js` | custom expandRange fn | `tests/corpus` (fn serialized as named built-ins) | callback option — see normalization §below |
| `options.format.js` | custom format fn | `tests/corpus` (named formats) |  |
| `options.ignore.js` | ignore patterns + onIgnore | `tests/corpus` + callback-order assertions |  |
| `options.noextglob.js` | noextglob/noext | `tests/corpus` |  |
| `options.noglobstar.js` | noglobstar | `tests/corpus` |  |
| `options.onMatch.js` | onMatch/onResult ordering and payloads | Rust callback-order tests + JSONL expected event sequence |  |
| `options.maxExtglobRecursion.js` | risky-extglob literalization, rewrites, capture preservation, opt-out | `tests/corpus` + dedicated Rust unit tests | security-critical |
| `parens.js` | paren grouping/quantifiers | `tests/corpus` |  |
| `posix-classes.js` | all 14 classes, disabled mode, invalid classes | `tests/corpus` |  |
| `qmarks.js` | `?` semantics, dot rule | `tests/corpus` |  |
| `regex-features.js` | regex syntax inside patterns (groups, quantifiers) | `tests/corpus` |  |
| `slashes-posix.js` | `/` behavior, trailing slashes | `tests/corpus` |  |
| `slashes-windows.js` | `[\\/]` behavior, drive letters | `tests/corpus` (windows:true) |  |
| `special-characters.js` | escaping, quotes, specials | `tests/corpus` |  |
| `stars.js` | `*` semantics incl. consecutive stars | `tests/corpus` |  |
| `wildmat.js` | wildmat-derived cases | `tests/corpus` |  |
| `support/match.js` | helper semantics (collect outputs) | replicated in Rust test helper |  |

## Callback/function-valued options — normalization for the oracle corpus

JS options may be functions (`format`, `expandRange`, `onMatch`, `onIgnore`, `onResult`). The JSONL corpus cannot transport JS closures, so the oracle runner registers a **named library** of the exact functions used by the test suite (e.g. `format: "@stripDotSlash"`, `expandRange: "@fillRange01_25"`). The Rust runner implements the same named functions. Event sequences from onMatch/onIgnore/onResult are recorded in the corpus as an ordered array of `{event, input, output, isMatch}` entries and asserted identically in Rust.

## Non-portable values — normalization rules

| JS value | JSONL representation |
|---|---|
| `Infinity` (scan token depth / maxDepth) | `{"__inf__": true}` |
| RegExp object (result.regex) | `{ "source": "...", "flags": "..." }` (source compared only when `compareSource: true`) |
| `match` array from exec | JSON array of strings/nulls |
| `state` on matcher (returnState) | subset projection: `{negated, negatedExtglob?, output?}` per op |
| thrown errors | `{ "errorClass": "TypeError|SyntaxError", "message": "exact string" }` |
| `undefined` vs missing keys | missing keys omitted; explicit undefined → `{"__undefined__": true}` |

## Platform-sensitivity register

- `test/malicious.js` line ~14: one assertion guarded by `process.platform !== 'win32'` — corpus records `platforms: ["linux","darwin"]` for that case.
- Suites that do not force `windows:` inherit OS detection — the oracle runner forces `windows:false` for canonical cases and adds explicit `windows:true` variants; OS-dependent behavior is then data, not environment.
- Node version sensitivity: none observed in suite output between local Node 24 and CI matrix (12–25) — CI re-confirms in Phase 1/11.
