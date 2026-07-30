# Glob Semantics — Picomatch Pattern Language

Status: contract defined (spec §7 FR-020..039). Verified from lib/parse.js, lib/constants.js, test suites, and probe outputs (`scratch/probe-regex-sources.json`).

## Core atoms (posix mode; windows swaps `/` for `[\\/]`)

| Construct | Emitted JS regex source | Evidence |
|---|---|---|
| literal `foo/bar.js` | `foo\/bar\.js` | probe:literal |
| `*` | `(?!(?:(?!(?:^|\/)\.).)*?)` = `[^/]*?` | probe:star `^(?:(?!\.)(?=.)[^/]*?\/?)$` |
| `?` | `[^/]` (segment start, dot:false → `[^./]`) | probe:qmark, qmark_after_slash |
| `**` | globstar `(?:(?!(?:^|\/)\.).)*?` wrapped per six context forms | probe:globstar*; lib/parse.js:1128-1244 |
| `[abc]` | class; undefined literalBrackets → `(?:\[abc\]|[abc])` | probe:bracket |
| `[[:alpha:]]` | `[a-zA-Z]` (+ `(?=.)` when bos-adjacent) | probe:posix_class; lib/parse.js:719-741 |
| `{a,b}` | `(a|b)` | probe:brace |
| `{1..3}` | `[1-3]` (sorted; fallback escaped `a..b`) | probe:brace_range; lib/parse.js:22-38 |
| `@(a\|b)` | `(a|b)` | probe:extglob_at |
| `?(a\|b)` | `(?=.)(?:a\|b)?` | probe:extglob_qmark |
| `+(a\|b)` | `(?=.)(?:a\|b)+` | probe:extglob_plus |
| `*(a\|b)` | `(?=.)(?:a\|b)*` | probe:extglob_star |
| `!(a\|b)` | `(?=.)(?:(?!(?:a\|b)$))[^/]*?` | probe:extglob_neg |
| leading `!` | negation wrap `^(?!^(?:…)$).*$` | probe:makeRe negated |
| trailing (star/bracket) | optional `/?` unless strictSlashes | probe:star vs strictSlashes |

## Wildcard rules

- `*`/`?` never cross `/`. Consecutive `***` pre-rewritten to `*`; `**/**` → `**` (REPLACEMENTS). More than two stars within a segment = single star `[README basic globbing; lib/constants.js:105-110]`.
- `*` at segment start carries dot-guard `(?!.)` + `(?=.)` when `dot:false`; after `.` adds NO_DOT_SLASH; with `dot:true` uses NO_DOTS/NO_DOTS_SLASH `[lib/parse.js:1263-1281]`.
- `?` after `(` is literal unless forming a valid group (`(?:`, `?=`, `?!`, `?<`, `?P`…); see lib/parse.js:1028-1038.

## Globstar rules (six context forms, highest-risk region)

1. `**` alone → `(?:^|…full…)` form (probe:globstar).
2. `a/**` end → `(?:a(?:\/GS|$))` (probe:globstar_after_slash; `|$` dropped when strictSlashes).
3. `**/a` start → `(?:^|\/|GS\/)a` (probe:globstar_before_slash).
4. `a/**/b` middle → `(?:a(?:\/GS\/|\/|$)b)` (probe:globstar_middle).
5. consecutive `/**/` collapsed (lib/parse.js:1169-1176).
6. non-segment `a**b` ⇒ single-star semantics (README: `foo**bar` ≡ `foo*bar`; probe:star_after_dot etc.).

`noglobstar` demotes `**`→star; `bash:true` makes single `*` behave as globstar.

## Dotfile rules

- Wildcards never match a segment's leading dot unless `dot:true` or the pattern states the dot explicitly. Globstar respects the same via `(?!(?:^|\/)\.)` (or DOTS_SLASH with dot:true) `[test/dotfiles.js; lib/constants.js]`.
- `..` segments: patterns starting `../` keep dot semantics (issue #2 historical; test/dots-invalid.js).

## Brace rules

- Only comma lists and `..` ranges are matched (no brace *expansion* library semantics; micromatch does increments). Braces without comma/dots are literal `{…}` `[lib/parse.js:925-934; README Braces]`.
- Ranges sort endpoints then emit `[a-b]`; invalid classes fall back to escaped `a..b`; custom `expandRange(a,b,options)` output inserted raw `[lib/parse.js:22-38; test/options.expandRange.js]`.

## Extglob rules

- `@ ? + * !` + `(` open; pipes add conditions; `!(...)` inner containing `/` (len>1) upgrades STAR to globstar `[lib/parse.js:523-600]`.
- Negate-close special cases: at eos or remaining `^\\)+$` → `)$))STAR`; expression-after-close `!(*.d).ts` re-parses the suffix (fastpaths disabled) and emits `)EXPR)STAR)` (fixes #83/#93) `[lib/parse.js:571-596; commit 9f241ef]`.
- `negatedExtglob` set when negate-extglob is first token at bos (even if not spanning the pattern) `[commit 032e3f5; test/api.picomatch.js:367-380]`.

## Risky extglobs (4.0.4+ safeguard — semantic, must port)

- Default `maxExtglobRecursion: 0`: risky `+()`/`*()` are **literalized** (e.g. `+(a|aa)` → `\+\(a\|aa\)`) or, when every branch reduces to single chars, rewritten to a safe class-star preserving ALL branches (`+(*(a)|*(b))` → `(?=.)[ab]*`) `[lib/parse.js:273-347,539-566; test/options.maxExtglobRecursion.js]`.
- `maxExtglobRecursion: false` disables; number allows nested depth for non-combinable branches; ambiguous alternation still blocked.
- Known baseline hole: `+(ab|abab)` is NOT caught (issue #175; verified locally) — port must reproduce (D-011).

## Bash divergences (intentional, keep)

- Bash `*` crosses directories; picomatch only `**` does.
- Bash `!(foo)*` greedily matches `foo`/`foobar`; picomatch returns false for both `[README §Matching behavior vs. Bash]`.
- issue #171 (open): picomatch treats bare parens in `/foo/(a)` as a group, Bash 5.2 as literals — picomatch behavior is the oracle.

## Windows mode

`windows:true` (or OS-detected index mode): separator class `[\\/]`; `format` defaults to toPosixSlashes for inputs; basename splits on both; drive letters work (`E:\a\b\c.md` vs `E:/**/*.md`) `[test/slashes-windows.js; test/options.js:113-120]`.
