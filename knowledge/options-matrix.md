# Options Matrix — picomatch 4.0.5

Canonical source: README options table (verified locally) + `lib/parse.js`, `lib/picomatch.js`, `lib/scan.js` behavior + probe results in `scratch/probe-regex-sources.json`. Where README and source disagree, **source wins** and the conflict is noted.

Legend: **Scope** = which entry points honor the option. Default = effective default when option absent.

**Canonical counts (script-verified 2026-07-31):** 33 documented main-option rows = 31 distinct behaviors + 2 aliases (`matchBase`, `noext`); 7 scan-option rows = 4 scan-specific (`parts`, `tokens`, `scanToEnd`, `noparen`) + 3 shared with main (`noext`, `nonegate`, `unescape`); 37 distinct option names total. Other documents link here instead of restating counts.

## Main options (picomatch() and API methods)

| Option | Type | Default | Scope | Behavior (verified) |
|---|---|---|---|---|
| `basename` | boolean | false | matcher/test | alias pair with `matchBase`; when true and full match fails, test `utils.basename(input)` against regex. NOTE (issue #89): applies even when pattern contains slashes — README claims otherwise; source wins. |
| `matchBase` | boolean | false | matcher/test | alias of `basename` (checked together in test()). |
| `bash` | boolean | false | parse | single `*` behaves as globstar; backslash before `/` NOT treated as escape skip; star output `.*?`. |
| `capture` | boolean | undefined(false) | parse/makeRe/test | emits capturing groups `(...)` instead of `(?:...)`; test() always execs regex when capture:true and returns match array. |
| `contains` | boolean | undefined(false) | compileRe/wrapOutput | omits `^`/`$` anchors; negated pattern becomes `^(?!(?:...)).*$`. |
| `debug` | boolean | undefined(false) | toRegex | when true, regex construction errors rethrow; otherwise fallback `/$^/` (never matches). |
| `dot` | boolean | false | parse | allows wildcards to match leading dots; changes NO_DOT→'', QMARK_NO_DOT→QMARK, globstar dot rule to DOTS_SLASH, nodot→NO_DOTS. |
| `expandRange` | function | undefined | parse (brace dots) | custom range expander `(a, b, options) => string`; default sorts endpoints and emits `[a-b]`, falling back to escaped `a..b` if invalid class. |
| `fastpaths` | boolean | true | makeRe only | when !== false and input starts with `.` or `*`, tries parse.fastpaths (8 shapes + `*.ext` recursion). `parse()` API always disables it. |
| `flags` | string | undefined | toRegex | regex flags verbatim (e.g. `'i'`, `'gi'`); overrides `nocase`. `g` flag makes matcher stateful via lastIndex — edge case, not used by default. |
| `format` | function | undefined | test | formats input before matching/output; default = `toPosixSlashes` when windows(posix) mode, else none. test() tries `input===glob`, then `format(input)===glob`, then regex exec. |
| `ignore` | string\|array | undefined | picomatch() | pattern(s) for exclusion; matched via separate inner matcher built with `{...options, ignore:null, onMatch:null, onResult:null}`; ignored match → `onIgnore` fires, result.isMatch=false. |
| `keepQuotes` | boolean | false | parse | retains `"` chars as literals in output; otherwise quotes are consumed and their contents regex-escaped. |
| `literalBrackets` | boolean | undefined | parse | true → brackets escaped to literals; false → treated as regex class; undefined → emits BOTH alternation `(?:\[abc\]|[abc])` when class has no regex chars. |
| `maxLength` | number | 65536 | parse + fastpaths | `Math.min(65536, maxLength)` cap; exceeding throws `SyntaxError: Input length: N, exceeds maximum allowed length: M`. |
| `maxExtglobRecursion` | number\|boolean | 0 (DEFAULT_MAX_EXTGLOB_RECURSION) | parse (extglob close) | risky repeated extglob handling: `false` disables safeguard; number = allowed nesting depth for non-combinable branches; risky `+()`/`*()` literalized, or rewritten to safe char-class star when all branches reduce to single chars (4.0.5 branch-preserving). |
| `nobrace` | boolean | false | parse | `{`/`}` treated as literals. |
| `nobracket` | boolean | undefined(false) | parse | `[`/`]` treated as literals. |
| `nocase` | boolean | false | toRegex | adds `i` flag unless `flags` set. Case folding semantics = JS RegExp `i` (Unicode simple fold in JS). |
| `noext` | boolean | false | parse, scan | alias: mapped to `noextglob` in parse; scan honors `noext` directly (minimatch compat). |
| `noextglob` | boolean | false | parse | disables `+@*?!` + `(` extglob parsing; parens become regex groups/literals per context. |
| `noglobstar` | boolean | false | parse | `**` collapses to single-star behavior; consecutive stars consumed. |
| `nonegate` | boolean | false | parse, scan | leading `!` treated as literal. |
| `onIgnore` | function | undefined | matcher | called with result object when input matched pattern but is ignored via `ignore`. Order: after onResult, instead of onMatch. |
| `onMatch` | function | undefined | matcher | called with result object on accepted match. |
| `onResult` | function | undefined | matcher | called FIRST with result object for every input regardless of outcome. |
| `posix` | boolean | true (non-strict) | parse (brackets) | enables `[:class:]` expansion; `posix:false` disables class expansion; `posix:true` also converts `[!` → `[^` inside brackets. CONFLICT (registered 2026-07-31, spec §5.2): README table says default `false` and prose says "disabled by default" — source expands classes unless `posix === false` (`lib/parse.js:719`), so classes are ENABLED by default; source wins. |
| `prepend` | string | undefined | parse (bos.output) | string assigned to the bos token's `output`, i.e. it seeds `state.output` ahead of all parsed tokens, before compileRe wraps `^(?:…)$` `[lib/parse.js:371]`. |
| `regex` | boolean | false | parse | regex rules for `+` (literal by default) and for `*` after `)`/`]`. |
| `strictBrackets` | boolean | undefined(false) | parse | imbalanced `[]{}()` throw `SyntaxError: Missing <opening|closing>: "<char>" - use "\\\\<char>" to match literal characters`. |
| `strictSlashes` | boolean | undefined(false) | parse | suppresses optional trailing `/?` after trailing star/bracket and `|$` globstar alternative. |
| `unescape` | boolean | undefined(false) | parse, scan | strips escaping backslashes in pattern (scan: in glob/base). |
| `windows` | boolean | OS-detected (index) / false (posix) | constants, test, matchBase | separator class becomes `[\\/]`; basename splits on `[\\/]`; format defaults to toPosixSlashes. index.js auto-detects ONLY when option is null/undefined. |

## Scan-only options

| Option | Type | Default | Behavior |
|---|---|---|---|
| `parts` | boolean | false | adds `parts` (path segments) and `slashes` (indices); forces scanToEnd. |
| `tokens` | boolean | false | implies parts; adds `tokens` (objects {value, depth, isGlob, ...flags}), `maxDepth` (sum; globstar token depth = Infinity). |
| `scanToEnd` | boolean | false | scan whole pattern instead of stopping at first glob marker. |
| `noext` | boolean | false | disables extglob detection in scan (isExtglob/isGlob=false). |
| `noparen` | boolean | false | disables paren group detection in scan. |
| `nonegate` | boolean | false | leading `!` not treated as negation. |
| `unescape` | boolean | false | removeBackslashes on glob (always) and base (if backslashes seen). |

## Removed/legacy options (NOT in 4.0.5 — must not be ported)

`lookbehinds` (≤2.x), `cwd`/`split`, `failglob`, `nodupes`, `noquantifiers`, `normalize`, `unixify`, `posixSlashes`, `unescapeRegex`, `cache` and caching options (removed in 2.0.0). Verified absent from current source and exports.

## Interactions worth dedicated tests

- `flags` overrides `nocase` (both set → flags win, no double `i`).
- `noext` ⇒ `noextglob` (parse), but scan needs `noext` itself.
- `dot:false` + pattern starting with literal `.` still matches dotfiles (explicit dot in pattern).
- `bash:true` changes star AND disables `\/` escape-skip in parse.
- `capture:true` changes extglob open/close wrappers and star wrapping; test() returns JS match array.
- `contains:true` + negated pattern → `^(?!(?:...)).*$` (probe `contains_neg`).
- `windows:true` + `matchBase:true` → basename splits on backslashes too (4.0.5 fix, test/options.js lines 25–33).
- `expandRange` only consulted for brace ranges with `..`; custom fn output inserted RAW into regex source (trusted).
- `strictSlashes:true` affects fastpaths too (no trailing `/?`).
