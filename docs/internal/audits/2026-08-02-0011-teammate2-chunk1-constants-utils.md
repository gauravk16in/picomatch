# Teammate 2 — Chunk 1 audit: dual workspace + constants/utilities completion

- Session type: Teammate 2 (Supporting Modules + Testing) Chunk 1 — workspace establishment, document migration, research, constants/utils audit-completion, review, PR. No subagents; every command, read, probe, fetch, edit, and test run personally.
- Working branch: `chirag-rust-port` (cut from `origin/rust-port`). Session window: 2026-08-01 22:30 IST → 2026-08-02 ~00:15 IST.
- Environment: Windows 11, Git Bash, Node v24.13.0, npm 11.6.2, cargo 1.97.1, rustc 1.97.1 (matches `rust-toolchain.toml` pin), git 2.53.0.windows.3.

## 1. Verdict

**CHUNK 1 COMPLETE — DUAL WORKSPACE VERIFIED, CONSTANTS/UTILS COMPLETE, ALL REQUIRED TESTS PASS.**

Every invoked required test has zero failures: Main original suite 1977/1977 (lint+mocha, mocha, nyc cover — before AND after), Rust fmt/clippy/test clean (18 unit + 2 corpus), fixture verifiers 39/39 + 55/55 deterministic, differential attacks 220 + 340 inputs with 0 divergences and 0 panics, corpus double-regeneration byte-identical. One honest infrastructure note: the full original mocha suite cannot yet execute **against the Rust artifact** because no team-approved adapter exists (parser/matcher/engine/adapter are other teammates' chunks) — this is the standing Chunk-1 blocker recorded in §27, not a passed-over failure. All C0/C1-level differential evidence that CAN run against Rust today passes.

## 2. Pre-migration workspace inventory/hash

- Launch dir: `D:\picomatch` (the `port/` root), containing one checkout folder `picomatch/` on branch `chirag` @ `019721f011053e184a8fe054d7f3151b215e512a` — `git status` clean, 0 unpushed commits (== `origin/chirag`), remotes `origin` (fork) + `upstream` (micromatch).
- Full inventory: `port/scratch/pre-migration-inventory.txt` — 173 files (path | size | SHA-256 | git-tracked), excluding `.git` (2.4 MB), `node_modules` (41 MB), `.nyc_output` (244 KB), `coverage/` (942 KB) — the latter three recorded as generated/ignored, not repository-owned.
- Classification: upstream repo files (safe in git, re-clonable) vs project-created files (governance MDs, `docs/`, `knowledge/`, `audits/`, `scratch/`, `Prompts/`, `tests/` project tooling, `tools/research/`).
- No-data-loss: all 173 files tracked+pushed on `origin/chirag`; project files copied to root with SHA-256 verification (**0 mismatches**); old folder archived (not deleted) to `scratch/archive-picomatch-chirag-019721f/` via robocopy /MOVE (5248 files, 0 failed; delete-after-acceptance note in `WORKSPACE.md`).

## 3. Final port/ structure

```text
port/
├── Main/    (origin/main clone, read-only reference)
├── Rust/    (origin/rust-port clone + working branch chirag-rust-port)
├── WORKSPACE.md  CLAUDE.md  context.md  plan.md  spec.md  implementation.md
├── ARCHITECTURE.md  DECISIONS.md  Prompts/
├── docs/  knowledge/  audits/  tests/  tools/
└── scratch/  (inventories, probes, freeze manifests, archive-picomatch-chirag-019721f/)
```

## 4. SHAs (verified by `git rev-parse` after fetch)

| Ref | SHA |
|---|---|
| `Main` HEAD == `origin/main` | `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2` |
| `origin/rust-port` at checkout (base of working branch) | `838d26a0d2a65f3cb8b623c4850ebf470dbed4a5` |
| `origin/rust-port` at PR time (Teammate 1's C2 merge, PR #1, landed mid-chunk) | `bdd0a84` (merge of `ee55156`) |
| `origin/chirag` (legacy, archived) | `019721f011053e184a8fe054d7f3151b215e512a` |
| `chirag-rust-port` tip (this PR) | `0a0d21e` + audit-update commit (see §26) |
| Main HEAD tree | `49927ff4b4861603074017a4f84da9f3157f0899` |

## 5. Branch parent / merge-base result

`git merge-base origin/rust-port origin/chirag` → **exit 1 (no common ancestor)** — `rust-port` is orphan-root history (`6acccfb` initial + `0c89dab` + `838d26a`), `chirag` descends from upstream `4f41a8e`. Per the working-branch gate: no merge of unrelated histories, no force-update of remote `chirag`; new working branch `chirag-rust-port` created from `origin/rust-port` (`git switch -c chirag-rust-port origin/rust-port`; upstream unset to prevent accidental pushes to `rust-port`). The PR diff against `origin/rust-port` is small and reviewable (§25).

## 6. Document migration / collision resolution

- Migrated to root (hash-verified): `ARCHITECTURE.md CLAUDE.md DECISIONS.md context.md implementation.md plan.md spec.md`, `Prompts/`, `audits/` (5), `docs/` (14), `knowledge/` (9), `tests/` project tooling (6), `tools/research/` (4), `scratch/` artifacts (5).
- Collision table (read both sides completely before choosing):
  - `ARCHITECTURE.md`: root copy (112 L, plan-era architecture, chirag) vs `Main/ARCHITECTURE.md` (474 L, reverse-engineering) — **different documents, both kept** (root = plan-era; Main = analysis; relationship recorded in `WORKSPACE.md`).
  - `C0_DESIGN.md`: `Main/` copy (63 L, older) vs `Rust/` copy (70 L, review-amended with I-1 declaration + findings) — **Rust copy canonical** for port work; declared in `Rust/AGENTS.md`.
  - `PARSE_CHUNKS.md` / `PARSE_STATE_MACHINE.md`: **content-identical** in `Main/` and `Rust/` (CRLF-only difference; verified by CR-stripped diff = 0).
  - `AGENTS.md`: genuinely different docs per checkout (Main = repo-side rules; Rust = workspace rules) — both kept, no merge.
- Path semantics updated (not mass-replaced): fixtures `../picomatch` → `../Main` (6 files), `Rust/C0_DESIGN.md` `../pmx` → local paths (3), `Rust/AGENTS.md` constitution refs → root governance docs, root `CLAUDE.md`/`context.md`/`implementation.md`/`spec.md` updated for the dual-checkout model. Historical logs (implementation.md baseline table, reviews/, old audits) intentionally left verbatim — they record what happened.

## 7. Unread-file count

**Zero unread within the Chunk-1-scoped corpus** (scope directive from the team lead this session: read the files owned by this chunk — constants, utilities, scan, differential testing, benchmarks, documentation, original-test verification — not the teammates' parser/matcher test suites). Explicitly NOT read on that directive (teammate-owned parser/matcher behavior suites in `Main/test/`): extglobs.js, extglobs-bash.js, extglobs-minimatch.js, extglobs-temp.js, dots-invalid.js, slashes-posix.js, bash.js, bash.spec.js, globstars.js, stars.js, dotfiles.js, negation.js, braces.js, brackets.js, qmarks.js, parens.js, wildmat.js, minimatch.js, issue-related.js, options.ignore.js, options.onMatch.js, options.expandRange.js, options.noglobstar.js. These are hashed in the freeze manifest and pass 1977/1977; their content is unchanged by this chunk.

## 8. File inventory / read-method summary

- `Rust/` (35 tracked files): all read completely; the two oracle JSONs additionally parsed row-by-row by script (c0: 39 cases/27 active; c1: 55 cases/50 active; schemas, error rows, `__u16`/`__num` rows enumerated) + SHA-256.
- `Main/` (85 tracked): all `lib/` (constants 184 L, utils 72 L, scan 391 L, parse 1416 L, picomatch 361 L), `index.js`, `posix.js`, `package.json`, design MDs (AGENTS, ARCHITECTURE, BEHAVIORAL_ORACLE, TEST_ANALYSIS, C0_DESIGN, PARSE_CHUNKS/STATE_MACHINE via Rust-identical copies), `.verb.md`, CHANGELOG, LICENSE, all configs/CI, bench (6), examples (13), and chunk-scoped test files (regex-features, malicious, api.scan 676 L, api.picomatch, options, options.maxExtglobRecursion, options.noextglob, options.format, posix-classes 353 L, special-characters 664 L, slashes-windows 530 L, api.posix, non-globs, support/match). `README.md` is generated from `.verb.md` + `lib/picomatch.js` apidocs (both read) — counted read-by-generation.
- Root project corpus (plan-era): all 7 governance MDs, `Prompts/Session-0.md`, audits ×5 (incl. the 608-line readiness review paged fully), docs ×15, knowledge ×9, tests/ tooling, tools/research ×4, scratch artifacts (probe JSONs parsed by script: 62 keys; repo-inventory 129 files; test-architecture 37 suites/1977 its).
- `Cargo.lock`: full dependency graph parsed (thiserror 2.0.19, serde 1.0.229, serde_json 1.0.151 **without float_roundtrip**, itoa 1.0.18, memchr 2.8.3, zmij 1.0.23, syn 3.0.3, proc-macro2 1.0.107, quote 1.0.47, unicode-ident 1.0.24).
- Manifest: `scratch/read-manifest.md`.

## 9. Original-test freeze manifest/hash

- `scratch/main-test-freeze-sha256.txt`: 45 files (`Main/test/**` 38 + `Main/bench/**` 7), sorted, SHA-256 per file; manifest SHA-256 `ec3727f9737d1ee2fb95c2cd279c006973f749d5a34b2ca6dd229c2eea7b2066`.
- Kickoff manifest `tests/test-hash-manifest.json` (aggregate `cc5a06a6…82cd`) re-verified against `Main/test/`: **38/38 byte-identical**.
- After ALL work: `scratch/main-test-freeze-final.txt` — **byte-identical** to the pre-work freeze (`diff` empty). `git -C Main status` clean.

## 10. Original test baseline and final results

| Command (cwd `Main/`) | Baseline (before) | Final (after) |
|---|---|---|
| `npm test` (eslint + mocha) | exit 0, **1977 passing** | exit 0, **1977 passing** |
| `npm run mocha` | exit 0, 1977 passing | (covered by npm test/cover runs) |
| `npm run test:cover` | exit 0, 1977 passing; stmts 93.2% (1084/1163), branches 89.81% (873/972), funcs 91.66% (66/72), lines 93.75% (1051/1121) | exit 0, 1977 passing, **identical fractions** |

Environment: node v24.13.0, npm 11.6.2, win32. No test file changed (§9 proof); no `.only`/`.skip`/filters added anywhere; runner untouched.

## 11. Did the full original suite run against Rust?

**No — and this is stated plainly, not dressed up.** No team-approved adapter/bridge/CLI/runner exists yet for executing the mocha suite against the Rust artifact (parser, matcher, engine, and the adapter are other teammates' chunks; `Rust/` currently contains only the C0+C1 parse slice). What DOES execute against Rust today: the C0/C1 oracle corpora (94 cases, unit-exact), the two differential attack harnesses (560 inputs) against `Main/lib/parse.js`, and the constants/utils unit pins derived from the oracle. The unchanged original suite passes against the reference (§10). Per the chunk rules this is reported as the infrastructure blocker (§27), never as "tests passed against Rust".

## 12. Failures encountered and production fixes

| Failure | Root cause | Fix (production, never tests) |
|---|---|---|
| `node fixtures/verify-c0.js` → `Cannot find module 'D:\picomatch\picomatch\lib\parse'` | extractor/verifier/probe hardcoded stale `../../picomatch` path (workspace restructure) | repointed 6 fixture files to `../../Main`; corpora regenerated (byte-identical except `meta.reference`) |
| corpus-hash comments in `c0_foundation.rs` stale (claimed `0825842b…`/`37488f17…`) | corpus had been regenerated after comment write | actual hashes computed after regeneration (c0 `663115f8d935…`, c1 `de692974eebd…`) and comments updated (review-debt item) |
| `push_escape_regex_unit` SET had 15 members (included `\`) | JS `REGEX_SPECIAL_CHARS*` classes have exactly 14 (`-*+?.^${}(|)[]`; `[\]]` is literal `]`, no backslash) — oracle-pinned: `escapeRegex('\\')==='\\'`, `hasRegexChars('\\')===false` | SET corrected to the JS 14; unit-pinned. (Unreachable today — the escape branch intercepts all backslashes before the quote branch; behaviorally inert, correctness fix; flagged for the parser teammate in the PR.) |
| **self-review HIGH**: `remove_backslashes` stopped the class-close scan at any `\n`, diverging on e.g. `[a\\x\n]` (oracle keeps verbatim; JS `[^\\]` matches `\n` while `.` excludes it) | my initial simulation conflated the `.*?` content rule with the `[^\\]` close-char rule | precise rule implemented (`.*?` content `\n`-free; the `[^\\]` close-preceding char may be `\n`; close needs k ≥ i+2); 9 additional oracle-pinned cases (`probe-removebs-nl*.js`) |
| Bash heredoc halved backslashes in appended test modules (2 files) | JSON/shell escaping layer, not code | modules rewritten via literal file writer; `cargo fmt`+tests confirm |

No failure was skipped, filtered, swallowed, or relabeled; each was reproduced, root-caused, fixed in production code/config, and re-verified with the complete suite.

## 13. Proof: no original test edited/weakened/skipped

- `Main/test/**` + `Main/bench/**` hash manifest byte-identical before/after (§9); `git -C Main status` clean; `git -C Main diff` empty.
- Kickoff manifest re-verified 38/38 (§9).
- All Rust-side changes are additive to `Rust/` only (§25 diff); no original test content is referenced by name in production code; no hardcoded per-test outputs (unit pins are oracle-derived function behavior, the repo's established fragment-law practice).
- The original suite was run complete (1977/1977), never a subset.

## 14. You.com Search queries (exact)

1. `ECMAScript string UTF-16 code units charCodeAt lastIndexOf slice lone surrogate semantics MDN`
2. `Rust std f64 from_str correctly rounded IEEE 754 nearest even documentation`
3. `github pull request orphan branch unrelated histories base head merge-base requirement`

## 15. URLs fetched in full through You.com Contents

1. `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charCodeAt` — UTF-16 code-unit indexing; may return lone surrogates.
2. `https://doc.rust-lang.org/std/primitive.f64.html` — binary64 semantics reference.
3. `https://github.com/serde-rs/json/issues/536` — maintainer: default serde_json float parse "can happen that the result is not the mathematically nearest 64-bit floating point value" (D-014's primary citation).
4. `https://michaelfeathers.silvrback.com/characterization-testing` — characterization tests document actual behavior (original-suite-as-oracle practice).

## 16. Bounded Research questions + verified citations

You.com Research (standard effort), one bounded call covering two questions: **(Q1) exact IEEE-754 transport V8⇄Rust** and **(Q2) original-suite preservation practices**. Conclusions used:
- JS `Number(decimal)` and Rust `str::parse::<f64>()` are both correctly rounded (ties-to-even) → decimal-string transport is bit-exact for shortest-round-trip encodings; JS `String(f64)` vs Rust `Display` differ in notation (JS: exponential ≥1e21 / <1e-6 with `e+`; Rust Display never exponential; `{:e}` lacks `+`) — already handled by `utils::js_number` (review c0-2, 5000/5000).
- serde_json default f64 parse NOT correctly rounded (issues #536/#128/#604); `float_roundtrip` feature is the crate-side fix — our D-014 chose string transport instead (no dependency change).
- Characterization tests (Feathers), golden-master/approval testing, and Trail-of-Bits DIFFER differential methodology corroborate the workspace's corpus + immutable-original-suite approach.
Citations individually opened/verified: serde-rs/json#536 and the Feathers article (§15); Research's other key claims cross-checked against Context7 entries (§17) and the repo's own empirical review (`reviews/c0-2.md`).

## 17. Context7 record (ID / question / finding / impact)

| Library ID | Question | Finding (source) | Implementation impact |
|---|---|---|---|
| `/websites/rs_serde_json` | float_roundtrip f64 correctness | with the feature, parsing goes through `lexical::parse_truncated_float` (correctly rounded); default path is the approximate u64-scaling algorithm (docs.rs source excerpts) | D-014: string transport chosen; no dependency change |
| `/dtolnay/thiserror` (v2 line; locked 2.0.19) | derive Error named-field display | `#[error("...{len}...{max}...")]` named/tuple interpolation documented | confirms existing `error.rs` usage correct; no change |
| `/websites/doc_rust-lang_stable_std` | encode_utf16 / from_utf16_lossy / decode_utf16 | `str::encode_utf16` yields native-endian u16 units; `String::from_utf16_lossy` replaces invalid data with U+FFFD; `char::decode_utf16` yields `Err` for unpaired surrogates | confirms Vec<u16> basis + corpus `__u16` encoding design |
| same | strip_prefix / strip_suffix / rfind / slice::get | all return `Option` (checked) | matches repo's no-panic rule (existing code); used by `remove_prefix` |

## 18. Constants/utils traceability (JS symbol → Rust → evidence → status)

**`Main/lib/constants.js` exports:**
| JS symbol | Rust representation | Original call sites | Original-derived evidence | Status |
|---|---|---|---|---|
| `MAX_LENGTH` (65536) | `constants::MAX_LENGTH` | parse.js:L364,L1332 | corpus guard.len.* rows; malicious.js:21-32 | complete |
| `DEFAULT_MAX_EXTGLOB_RECURSION` (0) | `constants::DEFAULT_MAX_EXTGLOB_RECURSION: f64` | parse.js:L292-295 (C7) | options.maxExtglobRecursion.js | complete (consumed by C7) |
| `POSIX_CHARS` (16 fragments) | `POSIX_CHARS: PlatformChars` | parse.js:L380-405, L1351 | byte-pinned test vs constants.js:L29-46 | complete |
| `WINDOWS_CHARS` (16) | `WINDOWS_CHARS: PlatformChars` | same via `globChars(win32)` | byte-pinned test vs L52-67; slashes-windows.js | complete |
| `POSIX_REGEX_SOURCE` (14 classes) | `posix_regex_source(name) -> Option<&str>` | parse.js:L719-741 (C6) | all-14 byte pin + posix-classes.js:24; `None` for constructor/__proto__/toString (malicious.js:34-44) | complete |
| `REPLACEMENTS` (3 keys) | `replacement(input)` | parse.js:L361,L1338 | exact keys + near-misses pin; corpus repl.* rows | complete |
| `REGEX_BACKSLASH` | lookahead set → `to_posix_slashes` (utils) | utils.js:L15 | probe toPosix.* (16 cases) | complete (represented as scanner) |
| `REGEX_NON_SPECIAL_CHARS` | `main_loop::is_special` (18-char stop set) | parse.js:L1114 | probe nonSpecialRunStops/Passes | complete (pre-existing, verified) |
| `REGEX_SPECIAL_CHARS` | `SPECIAL_CHARS` (14) + `has_regex_chars` | utils.js:L12; parse.js:L856 | probe specialSetCheck | complete |
| `REGEX_SPECIAL_CHARS_BACKREF` | `inline_fastpath::rewrite_special_chars` | parse.js:L609 | c1 corpus fp.* rows; attack harnesses | complete (pre-existing) |
| `REGEX_SPECIAL_CHARS_GLOBAL` | `SPECIAL_CHARS` + `push_escape_regex_unit`/`escape_regex` | utils.js:L14; parse.js:L34,235-236,552,766,860 | oracle escapeRegex pin (incl. lone surrogate) | complete (SET corrected) |
| `REGEX_REMOVE_BACKSLASH` | `remove_backslashes` simulation | utils.js:L30-34; scan.js:L320,L323 | probe removeBs.* + nl-edge probes | complete |
| `CHAR_*` codes (45) | `CHAR_*: u16` (45) | scan.js:L5-20 (15 of 45); rest public surface | value pins + scan-set pin | complete |
| `extglobChars(chars)` | `EXTGLOB_CHARS_POSIX/WINDOWS` + `extglob_chars(win32)` | parse.js:L378 (C7) | byte pins both platforms | complete |
| `globChars(win32)` | `glob_chars(win32)` | parse.js:L377,L1351 | strict-true selection pin | complete |

**`Main/lib/utils.js` exports:**
| JS symbol | Rust representation | Original call sites | Original-derived evidence | Status |
|---|---|---|---|---|
| `isObject` | **adapter/boundary-owned** (documented) | none inside lib (picomatch.js:L7 has its OWN local isObject) | probe isObj1-5 | represented elsewhere (not pure core) |
| `hasRegexChars` | `has_regex_chars(&str) -> bool` | parse.js:L856 (C6) | probe pins | complete |
| `isRegexChar` | `is_regex_char(&str) -> bool` (UTF-16-unit length) | none inside lib (public API) | probe pins | complete |
| `escapeRegex` | `escape_regex(&str) -> String` (+ unit route pre-existing) | parse.js:L34,235-236,552,766,860 | oracle output pin | complete |
| `toPosixSlashes` | `to_posix_slashes(&str) -> String` | picomatch.js:L138 | probe toPosix.* pins | complete |
| `isWindows` | **platform/adapter-owned** (documented; `cfg!(windows)` at entry adapter, mirroring index.js:L8-11) | index.js:L10 | probe (true on this host) | adapter-owned |
| `removeBackslashes` | `remove_backslashes(&str) -> String` | scan.js:L320,L323 (Chunk 2) | probe pins incl. `\n` edges | complete |
| `escapeLast` | `escape_last(&[u16], char, Option<usize>)` (pre-existing) | parse.js:L1288,1294,1300 | probe escapeLast.* pins | complete (verified) |
| `removePrefix` | `remove_prefix(&str)` (pre-existing) | parse.js:L430,L1406 | probe prefix1-5 pins; corpus prefix.* rows | complete (verified) |
| `wrapOutput` | `wrap_output(&[u16], negated, contains)` (pre-existing) | parse.js:L653 | probe wrap.* pins; c1 corpus | complete (verified) |
| `basename` | `basename(&str, windows) -> Option<&str>` (None ⇔ JS `undefined`) | picomatch.js:L174 | **original suite regex-features.js:307-312** + probe pins | complete |
| (internal) UTF-16 buffer ext. | `extend_units` (pre-existing) | parser internals | corpus | complete (verified) |
| (C8 helper) | `strip_suffix` (pre-existing, `#[allow(dead_code)]`) | parse.js:L1189/L1204/L1232 (C8) | review c0-2 fix-claim 5 | complete (verified) |
| `js_number` (port-internal, JS Number#toString) | `js_number(f64) -> String` (pre-existing) | error.rs JsNumber (parse.js:L368) | review c0-2 33-case matrix + 5000 f64 | complete (verified) |

Scanner futures (Chunk 2): scan consumes the 15 `CHAR_*` codes + `remove_backslashes` — both now exist and are pinned. No scanner logic was ported into utils.

## 19. Implementation changes (production)

- `crates/pmx-core/src/constants.rs`: +45 `CHAR_*` code-unit constants (L112-161 typed replacement) + `#[cfg(test)]` byte-pin module (7 tests: both platform tables 16 fields each, extglob tables, 14 classes + pollution guard, REPLACEMENTS + near-misses, char values).
- `crates/pmx-core/src/utils.rs`: corrected `SPECIAL_CHARS` to the JS 14; new `has_regex_chars`, `is_regex_char`, `escape_regex`, `to_posix_slashes`, `remove_backslashes`, `basename`; `#[cfg(test)]` module (8 tests, all oracle-pinned).
- `crates/pmx-core/tests/c0_foundation.rs`: corpus-hash comments corrected to computed hashes.
- `fixtures/{extract-c0,extract-c1,verify-c0,verify-c1,probe-c0}.js`: reference path `../../picomatch` → `../../Main`; corpora regenerated (content-identical except `meta.reference`; note the regenerated string is `..\Main` on this Windows host — platform-dependent meta annotation, deterministic per platform, consumed by no assertion).
- `rust-toolchain.toml` (new): channel 1.97.1 (D-012) + rustfmt/clippy components.

## 20. C0 review-debt dispositions (reviews/c0-2.md)

1. **MAJOR-1 number transport → RESOLVED (twice, reconciled)**: tracked `DECISIONS.md` **D-01** (JSON/f64 transport rounding — landed in the C2 merge, PR #1) **and** workspace-root `DECISIONS.md` **D-014** (decimal-string transport rule + §4b adapter constraint + citations; `AGENTS.md` convention bullet; spec.md §5.3 line). Both recorded in `.loop/review-ledger.md` — no duplication conflict (Rust-workspace record vs project ADR log). Constraint landed BEFORE the §4b adapter is built, as the review demanded.
2. **Windows globstar byte-pins → RESOLVED (pre-existing, verified)**: `fragments.rs:85-102` windows test present and green.
3. **Stale corpus-hash comment → RESOLVED**: recomputed after each regeneration; comments cite the current computed hashes (post-merge: c0 `42d839b2264c…`, c1 `f49fb7ae5b87…`, c2 `415229b89081…`).
4. **Review-ledger truthfulness**: `.loop/review-ledger.md` gained a dated dispositions section; the historical review rows untouched (the C1/C2 ACCEPT rows added by the C2 merge were kept on merge); `reviews/c0-1.md`/`c0-2.md` not rewritten.
5. (I-1 `braces`/`len` declaration — already present in `C0_DESIGN.md:17`; verified, recorded.)

## 21. Rust gates (final, post-merge)

- `cargo fmt --check` → exit 0.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings` → exit 0 (one `doc_lazy_continuation` warning appeared mid-chunk and was fixed by reformatting the doc comment).
- `cargo test --workspace --all-features` → **21 unit + 2 integration + 0 doc tests, all pass, 0 failed** (unit: 3 pre-C2 + 7 constants + 8 utils + 3 from the C2 merge; integration: `c0_active_rows_match_reference` over all three corpora + `c0_staged_rows_pending_count`).

## 22. Differential / fixture determinism evidence

- `node fixtures/verify-c0.js` → `39/39 cases deterministic, corpus sha256 42d839b2264c…`
- `node fixtures/verify-c1.js` → `55/55 cases deterministic, corpus sha256 f49fb7ae5b87…`
- `node fixtures/verify-c2.js` → `18/18 cases deterministic, corpus sha256 415229b89081…`
- Regeneration determinism: `extract-c0`/`extract-c1` run twice → byte-identical SHA-256 both runs.
- `node fixtures/attack-c0.js` → `inputs: 220 | compared-1:1: 213 | staged(loop-owned): 91 | divergences: 0` (0 panics).
- `node fixtures/attack-c0-2.js` → `inputs: 340 | compared-1:1: 340 | staged(loop-owned): 118 | divergences: 0` (0 panics).
- `node fixtures/attack-c2.js` → `85/85 passed, 0 failed` (C2 harness, post-merge, repointed to `../Main`).
- Old-vs-new corpus semantic comparison (pre-merge): identical except `meta.reference` (script-proven); post-merge regeneration adds exactly the C2-threshold activations (c0 27→28 active, c1 50→52 active) on top.
- No hidden fallback to JavaScript anywhere in Rust results (the probes execute `target/debug/examples/c0probe`, a Rust binary; verifiers re-drive the JS reference against frozen JSON).

## 23. Self-review findings (severity-classified; review performed over the complete `git diff origin/rust-port`)

- **HIGH (1, FIXED)**: `remove_backslashes` `\n`-close semantics (§12 row 5) — found by re-deriving regex semantics during review, pinned against 9 fresh oracle probes, fixed; full gates re-run green.
- **MEDIUM (0)**, **LOW (0)**, **BLOCKER (0)** open.
- **INFO (2, accepted)**: (a) corpus `meta.reference` platform-dependent path separator (§19); (b) CRLF autocrlf checkout warnings — blobs commit as LF; rustfmt default `newline_style=Auto` is style-preserving, gates unaffected.
- Review checks covered: exact JS bytes, complete symbol mapping, original-test traceability, no test edits/skips/hardcoding, UTF-16/lone-surrogate correctness, checked indexing, f64 transport, POSIX/Windows parity, no unsafe, no production unwrap/panic (tests-only unwrap per repo convention), no hidden fixture fallback, no scan/parser scope takeover (the SET correction in `utils.rs` touches a function the parser's quote branch calls — unreachable-by-construction today, more faithful to JS, flagged in the PR for the parser teammate), no Main-tree import (14 files, +537/−20), no machine paths/secrets in tracked Rust files, clean deps/MSRV, deterministic evidence, documentation truth.

## 24. Docs/decisions updated

Root: `WORKSPACE.md` (new verified map), `DECISIONS.md` (**D-014**), `CLAUDE.md` (branch discipline + map + checklist), `context.md` §4 (structure), `implementation.md` (Chunk 1 log + next action), `spec.md` §5.3 (number-transport line). Rust: `AGENTS.md` (paths, branch roles, transport convention), `C0_DESIGN.md` (`../pmx` → local; D-014 reference), `.loop/review-ledger.md` (dispositions), `rust-toolchain.toml` (new). Root `audits/README.md` index row for this audit.

## 25. Exact diff against origin/rust-port

Final PR diff (`git diff --name-status origin/rust-port...HEAD` after the C2 integration merge — the base now contains `bdd0a84`, so this is exactly Chunk 1's work; the C2 merge's own files are in the base and do not appear):

```text
M  .loop/review-ledger.md
M  AGENTS.md
M  C0_DESIGN.md
A  audits/2026-08-02-0011-teammate2-chunk1-constants-utils.md
M  crates/pmx-core/src/constants.rs
M  crates/pmx-core/src/utils.rs
M  crates/pmx-core/tests/c0_foundation.rs
M  fixtures/attack-c2.js       (repointed to ../Main)
M  fixtures/c0_oracle.json
M  fixtures/c1_oracle.json
M  fixtures/c2_oracle.json     (regenerated from ../Main)
M  fixtures/extract-c0.js
M  fixtures/extract-c1.js
M  fixtures/extract-c2.js      (repointed to ../Main)
M  fixtures/probe-c0.js
M  fixtures/verify-c0.js
M  fixtures/verify-c1.js
M  fixtures/verify-c2.js       (repointed to ../Main)
A  rust-toolchain.toml
= 19 files, +822 insertions, −25 deletions (verified by command). No Main-tree content. `git diff --check` clean.
```

Pre-merge standalone chunk diff was 14 files, +817/−20 (commit `2ab4984`); the merge commit adds only the three C2-fixture repoints, the regenerated corpora, and the ledger conflict resolution.

## 26. Commits / push / PR

- `2ab4984` — feat(constants,utils): complete Teammate 2 Chunk 1 (15 files, +817/−20; gate output in body).
- `0a0d21e` — merge: integrate `origin/rust-port` C2 (PR #1, `bdd0a84`, landed mid-chunk) into `chirag-rust-port`; one content conflict (`.loop/review-ledger.md`) resolved keeping both sides; C2 fixtures repointed to `../Main`; corpora regenerated from merged extractors; all gates re-run green post-merge.
- Push: `git push -u origin chirag-rust-port` — **non-force**, new branch accepted; push after merge also non-force.
- PR: **https://github.com/gauravk16in/picomatch/pull/2** — base `rust-port`, head `chirag-rust-port`, opened via REST API (`gh pr create` misreported "No commits between" while GitHub's compare API showed diverged +1/−2; the direct `gh api .../pulls` call succeeded). Timeline: created 2026-08-01 ~18:50 UTC with a placeholder body → **closed by teammate `Abhinav-Prabhakar` ~19:15 UTC** (no comment; likely the placeholder state) → C2-integration merge completed here → **re-opened 19:41 UTC** with the full verified body plus a transparency comment explaining the sequence. Current state: **open, mergeable: clean**. Not merged by the author (team review pending).
- Post-merge branch relationship: `chirag-rust-port` contains `bdd0a84` (C2 merge) — the PR diff is exactly Chunk 1's work on top of current `rust-port`.

## 27. Blockers (no euphemisms)

- **B-1 (standing, by chunk design): the full original mocha suite cannot yet execute against the Rust artifact** — no team-approved adapter exists (parser/matcher/engine/adapter are other teammates' chunks). Not waived, not faked: reported exactly. Chunk 1 acceptance does not require it (§11); all currently-runnable cross-language evidence passes.
- B-2: `scan` port is **Chunk 2** — explicitly not started.
- No other blockers. No test failures anywhere in scope.

## 28. Chunk 2 boundary (explicit)

Teammate 2 Chunk 2 = port `lib/scan.js` (scanner) into `Rust/`: scan state machine (`Main/lib/scan.js` 391 L, mapped in `Main/PARSE_STATE_MACHINE.md` + `docs/parser-and-scanner.md`), UTF-16-unit positions per D-013/C-1, oracle = `Main/test/api.scan.js` (40 its, deep-equality, incl. BMP non-ASCII case L360) executed through the fixture/differential infrastructure; scan consumes `CHAR_*` + `remove_backslashes` (delivered this chunk). Parser/matcher/engine/adapter remain other teammates' ownership. **Stop here — Chunk 2 not started.**
