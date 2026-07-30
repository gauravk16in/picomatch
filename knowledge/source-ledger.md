# Source Ledger â€” Bootstrap Research

Every non-trivial claim in `spec.md`, `plan.md`, `DECISIONS.md`, `docs/`, and `knowledge/` should trace to a source listed here, to a local file/commit read in-session, or be marked `[assumed]`. Format: title â€” exact URL/file/command â€” access date â€” type â€” claims supported â€” reliability â€” notes.

## Primary: local repository (fork HEAD 4f41a8e, tag 4.0.5)

| Source | Access | Type | Claims supported | Reliability |
|---|---|---|---|---|
| `package.json` (local, commit 4f41a8e) | read 2026-07-31 | repo file | version 4.0.5; engines node>=12; scripts lint/mocha/test/test:ci/test:cover; devDeps eslint 8.57, mocha 10.4, nyc 15.1, fill-range, gulp-format-md; files index.js/posix.js/lib; sideEffects false; license MIT; no lockfile committed (.npmrc package-lock=false) | primary |
| `index.js`, `posix.js` (local) | read 2026-07-31 | repo file | index wraps lib/picomatch, sets windows=utils.isWindows() only when option null/undefined; posix = raw lib/picomatch re-export | primary |
| `lib/picomatch.js` (361 LOC) | read 2026-07-31 | repo file | full public API: picomatch(), .test, .matchBase, .isMatch, .parse, .scan, .compileRe, .makeRe, .toRegex, .constants; error messages; callback order; ignore handling; toRegex /$^/ fallback; state shapes | primary |
| `lib/parse.js` (1416 LOC) | read 2026-07-31 | repo file | parser state machine, token model, fastpaths, extglob open/close, brace/bracket/quote handling, risky-extglob analysis (splitTopLevel, isPlainBranch, normalizeSimpleBranch, hasRepeatedCharPrefixOverlap, parseRepeatedExtglob, getStarExtglobSequenceChars, repeatedExtglobRecursion, analyzeRepeatedExtglob, buildCharClassStar), expandRange default, syntaxError format | primary |
| `lib/scan.js` (391 LOC) | read 2026-07-31 | repo file | scanner contract: prefix/input/start/base/glob/isBrace/isBracket/isGlob/isExtglob/isGlobstar/negated/negatedExtglob + tokens/parts/slashes/maxDepth; options parts, tokens, scanToEnd, noext, noparen, nonegate, unescape; depth Infinity for globstar tokens | primary |
| `lib/constants.js` (184 LOC) | read 2026-07-31 | repo file | POSIX_CHARS/WINDOWS_CHARS regex fragments; POSIX_REGEX_SOURCE (14 classes, __proto__:null); MAX_LENGTH 65536; DEFAULT_MAX_EXTGLOB_RECURSION 0; REPLACEMENTS; helper regexes; extglobChars/globChars factories | primary |
| `lib/utils.js` (72 LOC) | read 2026-07-31 | repo file | isObject, hasRegexChars, isRegexChar, escapeRegex, toPosixSlashes, isWindows (navigator then process.platform), removeBackslashes, escapeLast, removePrefix, wrapOutput, basename (trailing-slash handling) | primary |
| `test/` tree (16,961 LOC, 38 files + support/match.js) | listed/read selected 2026-07-31 | repo files | test families and behavior coverage; support/match.js semantics (returns matched outputs via returnObject) | primary |
| `test/malicious.js`, `test/options.maxExtglobRecursion.js` | read 2026-07-31 | repo files | security test contracts: 65536 limit, custom maxLength, prototype-property patterns, risky-extglob literalization sources, capture preservation, maxExtglobRecursion:1/false behavior | primary |
| `test/api.picomatch.js` | read 2026-07-31 | repo file | API validation errors, array patterns, dotfiles, token shapes from parse(), negatedExtglob state | primary |
| `test/options.js` (partial, lines 1â€“120) | read 2026-07-31 | repo file | matchBase windows behavior (4.0.5 fix), flags/nocase, noextglob, unescape, nonegate, windows defaults | primary |
| `.github/workflows/test.yml` | read 2026-07-31 | repo file | CI matrix node 12/14/16/18/20/22/24/25 Ã— ubuntu/windows/macos (macos excludes node 12/14); actions/checkout@v6 pin de0fac2e, setup-node@v6 pin 53b8394; npm install; npm run test:ci; coverage upload only ubuntu+node25 | primary |
| `bench/index.js`, `bench/package.json` | read 2026-07-31 | repo file | benchmark.js suite vs minimatch; deps benchmark/ansi-colors/minimist + devDeps glob-parent, minimatch 10.2.4; filter via --run | primary |
| `CHANGELOG.md` | read 2026-07-31 | repo file | history to 4.0.0 only; 4.0.1â€“4.0.5 omitted (documentation gap) | primary |
| `LICENSE` | read 2026-07-31 | repo file | MIT, copyright 2017â€“present Jon Schlinkert | primary |
| `git log` (local) | 2026-07-31 | command | HEAD 4f41a8e "4.0.5" 2026-07-02; security merges 5eceecd (extglob ReDoS fix + maxExtglobRecursion), 4516eb5 (null-proto POSIX map); ab8bc4d (matchBase windows), 6289307 (branch-preserving rewrite); origin/master == upstream/master (0 0) | primary |
| `npm install` | 2026-07-31 01:39 | command | success; npm audit warns (dev-only, no fix applied) | primary |
| `npm run mocha` | 2026-07-31 01:39 | command | 1977 passing (270ms), 0 failing | primary |
| `npm run lint` | 2026-07-31 01:40 | command | exit 0 | primary |
| `npm run test:cover` | 2026-07-31 01:40 | command | 1977 passing; coverage: statements 93.2% (1084/1163), branches 89.81% (873/972), functions 91.66% (66/72), lines 93.75% (1051/1121) | primary |
| `node tools/research/probe-regex-sources.js` â†’ `scratch/probe-regex-sources.json` | 2026-07-31 01:54 | command | exact makeRe sources for ~60 pattern/option combos; error strings; match samples (windows backslash, negation, dot) | primary |
| `node -e` probes (API shapes) | 2026-07-31 01:51 | command | exported keys (9); parse state keys incl. peek/advance; matcher state keys {negated,fastpaths,output}; scan tokens JSON (Infinityâ†’null); result object keys; posix entry !== index entry on windows | primary |
| `node -e` ReDoS timing probe | 2026-07-31 02:12 | command | `+(ab|abab)` NOT literalized on 4.0.5; n=35/len=71 â†’ 963ms; confirms issue #175 bypass on baseline | primary |

## Primary: web (accessed 2026-07-31)

| Source | URL | Type | Claims supported | Reliability |
|---|---|---|---|---|
| Port Mortem 2026 â€” Devfolio page | https://portmortem.devfolio.co/ | official event | tracks (JSâ†’Go or Rust), judging 40/30/20/10, submission artifacts, rules (single command, no source-runtime wrappers, preserve tests, license, plagiarism), timeline, $1,800, Discord exclusivity | primary (official) |
| Port Mortem â€” official event site | https://coderesurrection.com/2026 | official event | kickoff Jul 31 18:00 UTC; freeze Aug 03 18:00 UTC; test hashing at kickoff; thin-adapter test model; scoring details; bonus table (+5/+5/+3/+3); anatomy layout incl. .port-mortem.toml; repo pool ~30, 2kâ€“8k LOC â‰¥80% coverage, 4h pick window; flaky-test handling; 60s fuzz bonus; no pre-kickoff code; evaluation protocol; judges; Write-Up side quest $300 | primary (official) |
| Unstop listing | https://unstop.com/hackathons/port-mortem-2026-code-resurrection-hackathon-hackathon-raptors-1704134 | aggregator | kickoff 31 Jul 02:00 PM EDT (=18:00 UTC, corroborates); close 3 Aug 02:00 PM EDT; winners 14 Aug; 2,528 registered; DISCREPANCY: lists Community Choice $300 prize which official site replaced with Write-Up | secondary (aggregator; official wins) |
| GHSA-c2c7-rcm5-vvqj | https://github.com/advisories/GHSA-c2c7-rcm5-vvqj | advisory | CVE-2026-33671 ReDoS via extglob quantifiers; PoC patterns; timings; fixed 4.0.4/3.0.2/2.3.2; commit 5eceecd; mitigations | primary |
| GHSA-3v7f-55p6-f55p | https://github.com/micromatch/picomatch/security/advisories/GHSA-3v7f-55p6-f55p | advisory | CVE-2026-33672 method injection (CWE-1321) via POSIX_REGEX_SOURCE prototype; [[:constructor:]]; fix __proto__:null; same fixed versions | primary |
| picomatch issue #175 | https://github.com/micromatch/picomatch/issues/175 | issue (third-party audit) | incomplete ReDoS fix: multi-char prefix overlap +(ab|abab) still exponential in 4.0.4; proposed generalization of hasRepeatedCharPrefixOverlap | secondary (user-filed, unconfirmed by maintainers; reproduced locally by us) |
| picomatch issue #171 | https://github.com/micromatch/picomatch/issues/171 | issue | parens not treated as literals â€” picomatch `/foo/(a)` matches `/foo/a`, bash 5.2 does not; open | primary (behavior divergence documented) |
| picomatch issue #89 | https://github.com/micromatch/picomatch/issues/89 | issue | basename/matchBase applies to patterns with slashes too, contradicting README description; open | primary |
| picomatch issue #83 | https://github.com/micromatch/picomatch/issues/83 | issue | `**/!(*.d).ts` over-excludes (fixed by 56083ef + 9f241ef in 2.3.x) | primary |
| picomatch releases page | https://github.com/micromatch/picomatch/releases | releases | 4.0.4 security release notes; 2.3.2/3.0.2 backports; 4.0.3 #144 constructor exception | primary |
| micromatch/picomatch commit 5eceecd | https://github.com/micromatch/picomatch/commit/5eceecd | commit | maxExtglobRecursion option, analyzeRepeatedExtglob implementation, tests, docs (README/.verb rows) | primary |
| micromatch/picomatch commit 4516eb5 | local + GitHub | commit | __proto__:null on POSIX_REGEX_SOURCE + malicious tests | primary |
| micromatch/picomatch commit 032e3f5 | https://github.com/micromatch/picomatch/commit/032e3f5 | commit | negatedExtglob set even when extglob doesn't span whole pattern | primary |
| micromatch/picomatch commit 9f241ef | https://github.com/micromatch/picomatch/commit/9f241ef | commit | negation extglob with expression after closing paren (parse rest, disable fastpaths) | primary |
| micromatch/picomatch commit 5b8d33f | https://github.com/micromatch/picomatch/commit/5b8d33f | commit | parse() always disables fastpaths | primary |
| Bash Reference Manual â€” Pattern Matching | https://www.gnu.org/software/bash/manual/html_node/Pattern-Matching.html | manual | extglob operators, dotglob semantics, globstar ** meaning | primary |
| regex crate README/docs | https://github.com/rust-lang/regex , https://docs.rs/regex | crate docs | no lookaround/backrefs; O(m*n); simple case folding; Unicode props; bytes submodule; inline flags | primary |
| Context7 /rust-lang/regex | Context7 server, resolved 2026-07-31 | MCP docs | builders size_limit/dfa_size_limit mapping; UNICODE.md RL1.2/RL1.5 details | primary (MCP) |
| fancy-regex docs | https://docs.rs/crate/fancy-regex/latest , https://github.com/fancy-regex/fancy-regex | crate docs | backtracking VM over regex crate; lookaround/backrefs; linear only for non-fancy subset; 0.17.0 latest (mid-2026) | primary |
| regex-automata docs | https://docs.rs/regex-automata | crate docs | nfa::thompson / hybrid / dfa engines; hybrid no capture offsets; all O(m*n) | primary |
| Context7 /proptest-rs/proptest | Context7 server, resolved 2026-07-31 | MCP docs | failure persistence proptest-regressions/, FileFailurePersistence::WithSource, seed replay, commit regressions | primary (MCP) |
| Context7 /bheisler/criterion.rs | Context7 server, resolved 2026-07-31 | MCP docs | sample_size/warm_up/measurement defaults; baselines (--save-baseline, --baseline, --baseline-lenient); Flat sampling; thresholds | primary (MCP) |
| Rust Fuzz Book (cargo-fuzz) | https://rust-fuzz.github.io/book/cargo-fuzz.html | book | cargo-fuzz + libfuzzer-sys; nightly + Unix-only; structure-aware fuzzing via arbitrary | primary |
| releases.rs | https://releases.rs/ | version tracker | Rust stable 1.95.0 / beta 1.96.0 / nightly 1.97.0 (Juneâ€“July 2026) | secondary |
| crates.io regex | https://crates.io/crates/regex | registry | regex 1.12.4, updated 2026-07-15 | primary |
| crates.io picomatch-rs | https://crates.io/crates/picomatch-rs | registry | Maidang1 workspace; Rust core + napi binding; shims; published 2026-03-19 | primary |
| crates.io satch | https://crates.io/crates/satch | registry | satch 0.1.0 MIT 899 SLoC "high-performance Rust implementation of picomatch/micromatch pattern matching" | primary |
| devongovett/glob-match | https://github.com/devongovett/glob-match | repo | fast in-place glob matching, no regex, captures, brace nesting â‰¤10, cargo-fuzz present | primary |
| oxc-project/fast-glob | https://github.com/oxc-project/fast-glob | repo | glob-match fork; benchmark table; glob-match brace limitations | primary |
| glob crate docs | https://docs.rs/glob | crate docs | MatchOptions(case_sensitive, require_literal_separator, require_literal_leading_dot); ASCII-only case-insensitivity | primary |
| globset docs | https://docs.rs/globset | crate docs | GlobBuilder literal_separator, case_insensitive; multi-pattern sets | primary |
| Miri repo | https://github.com/rust-lang/miri | repo docs | cargo +nightly miri test; UB detection scope and slowdowns | primary |
| napi-rs | https://napi.rs/ | framework docs | Node addons in Rust, prebuilt binaries, no node-gyp | primary |
| Trail of Bits DIFFER | https://blog.trailofbits.com/2024/01/31/introducing-differ-a-new-tool-for-testing-and-validating-transformed-programs/ | blog (referenced from event site) | differential testing tool for transformed programs | secondary |
| Hackathon Raptors X profile | https://x.com/raptors_hack | social | Port Mortem 2026 exists, registration open | secondary |
| DevUpdate.io picomatch page | https://devupdate.io/explore/micromatch/picomatch | aggregator | 4.0.4/4.0.5 change summaries (used only to cross-check, not authoritative) | tertiary |

## Inaccessible / failed sources (recorded per protocol)

| Source | Attempt | Status | Fallback |
|---|---|---|---|
| Official repo-pool page listing picomatch (user-supplied lead) | Search MCP searches #4/#5, GitHub repo+code search #6 | NOT FOUND as of 2026-07-31 01:57; likely Discord-only or not yet published | Treat pool listing as `(user)` fact; verify via Discord at kickoff |
| Hackathon Raptors Discord announcements | no credentials | inaccessible | Team member checks #announcements at kickoff |
| coderesurrection.com/2026/code-of-conduct and /terms | linked from event site | not fetched (low value for port design) | Devfolio CoC link recorded |
| "zeromatch" project | Search MCP #30 | not found | mark unverified lead |

## License notes

- Upstream code: MIT Â© 2017â€“present Jon Schlinkert (local LICENSE).
- regex, regex-automata, fancy-regex, proptest, criterion: MIT or MIT/Apache-2.0 dual (registry pages above) â€” all compatible with MIT submission.
- Quoted documentation kept to short excerpts with links; no bulk copying.
