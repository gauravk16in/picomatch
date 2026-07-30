# API Compatibility — JS → Rust Mapping

Status: contract defined (spec §6 FR-001..018); implementation Phase 3/8. All behaviors verified from `lib/picomatch.js` @4f41a8e + probes (`scratch/probe-regex-sources.json`, 2026-07-31 01:51–01:54).

## Export inventory (9 keys, verified)

| JS export | Rust equivalent | Parity class | Notes |
|---|---|---|---|
| `picomatch(glob, options?, returnState?)` | `picomatch::new(glob, options) -> Result<Matcher>` / `Matcher::with_state` | P0 | string\|array\|state inputs; TypeError on empty/non-string/non-state `[lib/picomatch.js:43-60]` |
| `picomatch.test(input, regex, options?, {glob, posix}?)` | `test(input, &CompiledRegex, options, ctx) -> TestResult` | P0 | empty input → `{isMatch:false, output:''}`; equality fast paths; capture forces exec `[lib/picomatch.js:128-156]` |
| `picomatch.matchBase(input, glob\|regex, options?, posix?)` | `match_base(input, glob_or_regex, options, posix) -> bool` | P0 | basename split semantics; windows `[\\/]`; trailing-slash = previous segment `[lib/picomatch.js:172-175; lib/utils.js:63-72]` |
| `picomatch.isMatch(str, patterns, options)` | `is_match(str, patterns, options) -> Result<bool>` | P0 | ≡ factory + call `[lib/picomatch.js:194]` |
| `picomatch.parse(pattern, options)` | `parse(pattern, options) -> Result<ParseState>` | P0 (data fields) | fastpaths always false; state incl. `tokens`; function fields (`peek`, `advance`) not ported (G-06) |
| `picomatch.scan(input, options)` | `scan(input, options) -> ScanState` | P0 | full field contract + tokens/parts/maxDepth `[lib/scan.js:327-388]` |
| `picomatch.compileRe(state, options, returnOutput, returnState)` | `compile_re(state, options) -> Compiled`; `compile_output(state) -> String` | P0 | wrap `^(?:…)$`/contains; negated `^(?!S).*$` `[lib/picomatch.js:264-284]` |
| `picomatch.makeRe(input, options, returnOutput, returnState)` | `make_re(input, options) -> Result<Compiled>`; `make_output` | P0 | TypeError on empty; fastpath gate `input[0] ∈ {'.','*'}` `[lib/picomatch.js:305-321]` |
| `picomatch.toRegex(source, options)` | `to_regex(source, options) -> Compiled` | P0 | flags `opts.flags \|\| (nocase?'i':'')`; debug rethrow; else never-match `[lib/picomatch.js:340-348]` |
| `picomatch.constants` | `pub mod constants` | P0 | MAX_LENGTH 65536, DEFAULT_MAX_EXTGLOB_RECURSION 0, POSIX_REGEX_SOURCE (14), helper regexes, REPLACEMENTS, char codes, `extglobChars()`, `globChars()` `[lib/constants.js]` |

## Matcher behavior

- `matcher(input)` → `bool`; `matcher(input, true)` → rich object `{glob, state, regex, posix, input, output, match, isMatch}` (P1, normalized per spec §5.3) `[probe: keys verified]`.
- `returnState=true` → `.state` on matcher `[lib/picomatch.js:104-106]`.
- Callback pipeline per call: `onResult` (always, first) → `onIgnore` (matched but ignored) → `onMatch` (accepted) `[lib/picomatch.js:81-100]`. Rust: `Options` carries boxed callback slots invoked in the same order; corpus asserts event sequences.
- `ignore`: inner matcher built with `{...options, ignore:null, onMatch:null, onResult:null}` `[lib/picomatch.js:71-75]`.
- Array patterns: first truthy result wins; else `false` `[lib/picomatch.js:44-54]`.

## Error model (verbatim strings)

| Condition | JS class | Message | Rust |
|---|---|---|---|
| bad/empty pattern to `picomatch()` | TypeError | `Expected pattern to be a non-empty string` | `PicomatchError::TypeError(&'static str)` with identical text |
| non-string input to `.test` | TypeError | `Expected input to be a string` | same |
| empty input to `.makeRe` | TypeError | `Expected a non-empty string` | same |
| pattern > maxLength | SyntaxError | `Input length: {N}, exceeds maximum allowed length: {M}` | `PicomatchError::SyntaxError(String)` identical formatting |
| strictBrackets imbalance | SyntaxError | `Missing {opening|closing}: "{c}" - use "\\\\{c}" to match literal characters` | same |
| invalid regex internally | — | rethrow iff `debug:true`; else never-match `/ $^ /` equivalent | same semantics (engine compile failure → never-match matcher) |

## Entry modes

- `index.js` mode: `windows` auto-detected from host OS only when option is null/undefined (does not mutate caller's options object) `[index.js:6-13]`.
- `posix.js` mode: never detects; `windows:false` default `[posix.js]`.
- Detection rule: `navigator.platform` (browser) else `process.platform === 'win32'`; Rust: `cfg!(windows)` / `std::env::consts::OS` at construction `[lib/utils.js:17-28]`.

## Explicit non-goals

No `RegExp` object leakage into the public Rust API (Compiled is opaque; `{source, flags}` exposed for adapter); no JS `this`, no function-valued option transport beyond the named registry (D-006); no removed APIs (`split`, `cwd`, caching).
