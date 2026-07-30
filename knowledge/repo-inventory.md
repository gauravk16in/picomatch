# Repository Inventory — micromatch/picomatch @ 4f41a8e (tag 4.0.5)

Method: local clone of `https://github.com/gauravk16in/picomatch` (== upstream `micromatch/picomatch` at clone time, verified `git rev-list --left-right --count origin/master...upstream/master` → `0 0` on 2026-07-31). Tree from `Get-ChildItem -Recurse`; LOC via `(Get-Content <file>).Count` (line counts, including blanks/comments).

## Top level

| Entry | Type | Notes |
|---|---|---|
| `.editorconfig` | file | 2-space, LF |
| `.eslintrc.json` | file | eslint config (root) |
| `.gitattributes` | file | text=auto |
| `.gitignore` | file | node_modules, coverage, etc. |
| `.npmrc` | file | `package-lock=false` — **no lockfile is committed** |
| `.verb.md` | file | README template source (verb generates README.md) |
| `CHANGELOG.md` | file | 155 lines; stops at 4.0.0 — 4.0.1..4.0.5 undocumented (gap) |
| `index.js` | file | 17 LOC; main entry; wraps `lib/picomatch` + windows auto-detect |
| `LICENSE` | file | MIT © 2017–present Jon Schlinkert |
| `package.json` | file | 83 LOC; v4.0.5; engines node>=12 |
| `posix.js` | file | 3 LOC; `module.exports = require('./lib/picomatch')` |
| `README.md` | file | 743 LOC; generated from `.verb.md` |
| `renovate.json` | file | dependency update config |
| `.github/` | dir | `contributing.md`, `workflows/test.yml` |
| `bench/` | dir | benchmark suite (own package.json, no lockfile) |
| `examples/` | dir | 13 example scripts |
| `lib/` | dir | 5 source modules |
| `test/` | dir | 36 `.js` test files (incl. `support/match.js`) + `test/.eslintrc.json` |

## lib/ — 2,424 LOC total source (incl. index/posix = 2,444)

| File | LOC | Responsibility |
|---|---|---|
| `lib/picomatch.js` | 361 | public API: matcher factory, test/matchBase/isMatch/parse/scan/compileRe/makeRe/toRegex, constants re-export |
| `lib/parse.js` | 1,416 | glob→regex-source compiler: fastpaths, tokenizer, state machine, extglob/brace/bracket handling, risky-extglob ReDoS safeguard |
| `lib/scan.js` | 391 | pattern scanner: base/glob split, token/part extraction |
| `lib/constants.js` | 184 | regex fragment constants (POSIX + Windows variants), POSIX classes, char codes, REPLACEMENTS, factories |
| `lib/utils.js` | 72 | escape/regex/path helpers, isWindows, basename |
| `index.js` | 17 | entry wrapper (OS detection) |
| `posix.js` | 3 | POSIX entry (no OS detection) |

Event repo-pool lead said "roughly 2,000–2,500 LOC" — matches 2,424 lib LOC `(user)` lead corroborated by local count.

## test/ — 16,961 LOC across 36 `.js` files, 1977 tests (mocha)


| File | Focus |
|---|---|
| `api.picomatch.js` | API validation, arrays, dotfiles, parse tokens, negatedExtglob state |
| `api.posix.js` | posix entry behavior |
| `api.scan.js` | scanner contract |
| `bash.js`, `bash.spec.js` | Bash-derived suites |
| `braces.js` | brace lists/ranges |
| `brackets.js` | character classes |
| `dotfiles.js`, `dots-invalid.js` | dot rules + malformed dots |
| `extglobs.js`, `extglobs-bash.js`, `extglobs-minimatch.js`, `extglobs-temp.js` | extglob families |
| `globstars.js` | `**` behavior |
| `issue-related.js` | issue regressions |
| `malicious.js` | ReDoS/prototype/length security |
| `minimatch.js` | minimatch comparison cases |
| `negation.js` | `!` patterns |
| `non-globs.js` | literal patterns |
| `options.js` | matchBase/flags/nocase/unescape/nonegate/windows |
| `options.expandRange.js`, `options.format.js`, `options.ignore.js`, `options.noextglob.js`, `options.noglobstar.js`, `options.onMatch.js`, `options.maxExtglobRecursion.js` | option-specific suites |
| `parens.js` | paren handling |
| `posix-classes.js` | POSIX classes |
| `qmarks.js` | `?` |
| `regex-features.js` | regex syntax in patterns |
| `slashes-posix.js`, `slashes-windows.js` | separator behavior |
| `special-characters.js` | escaping/specials |
| `stars.js` | `*` |
| `wildmat.js` | wildmat-derived suite |
| `support/match.js` | helper: filters list by pattern via returnObject |

## bench/

| File | Notes |
|---|---|
| `index.js` | benchmark.js suites: makeRe (star, dot star, globstar, globstars, leading star, braces), first-match, glob-parent, load-time; `--run <regex>` filter |
| `first-match-minimatch.js`, `first-match-picomatch.js` | micro comparison |
| `glob-parent.js` | glob-parent comparison |
| `load-time.js` | require-time measurement |
| `package.json` | deps: benchmark, ansi-colors, minimist; devDeps: glob-parent 6.0.2, minimatch 10.2.4 |
| `.npmrc` | package-lock=false |

## examples/

13 scripts: extglob.js, extglob-negated.js, makeRe.js, match.js, option-expandRange.js, option-ignore.js, option-onIgnore.js, option-onMatch.js, option-onResult.js, regex-quantifier.js, scan.js, test.js, windows.js.

## .github/

| File | Notes |
|---|---|
| `workflows/test.yml` | matrix node 12/14/16/18/20/22/24/25 × {ubuntu, windows, macos}-latest, macos excludes node 12/14; actions/checkout@de0fac2e (v6), actions/setup-node@53b8394 (v6), npm@8 update for node 12/14; `npm install` then `npm run test:ci`; coverage upload only ubuntu+node25 via actions/upload-code-coverage@v1 (continue-on-error) |
| `contributing.md` | contribution guidelines |

## Provenance highlights (git log, last 30 commits)

- `4f41a8e` 4.0.5 (2026-07-02) — HEAD == tag 4.0.5 == origin/master == upstream/master
- `ab8bc4d` fix: honor the windows option when matching basenames
- `6289307` fix: preserve all branches when rewriting risky repeated extglobs
- `e5474fc` Publish 4.0.4
- `4516eb5` security merge: `__proto__: null` on POSIX_REGEX_SOURCE (+ malicious tests)
- `5eceecd` security merge: maxExtglobRecursion option + analyzeRepeatedExtglob (301 LOC added to parse.js)
- `02b2d38`/`32343ab` prettier chore + revert; `e2991d3` add node 24/25 to CI

## Baseline run results (this machine, Windows 11, Node v24.13.0, npm 11.6.2)

| Command | Result |
|---|---|
| `npm install` | success (audit warnings, dev-only; NOT auto-fixed) |
| `npm run mocha` | **1977 passing (270ms), 0 failing** |
| `npm run lint` | exit 0 |
| `npm run test:cover` | 1977 passing (515ms); stmts 93.2%, branches 89.81%, funcs 91.66%, lines 93.75% |

Notes: tests are OS-sensitive — `test/malicious.js` skips one assertion on win32 (`process.platform !== 'win32'` guard); many suites force `windows: true/false` explicitly so they run cross-platform. No locale/timing dependencies observed. No network access needed by tests.
