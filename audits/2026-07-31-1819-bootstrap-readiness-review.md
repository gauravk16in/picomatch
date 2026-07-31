# Bootstrap Readiness Review — Picomatch JavaScript→Rust

- **Review type:** Independent evidence-only readiness audit of the bootstrap (second session; no subagents used — every read, command, fetch, and check performed personally by the primary reviewer).
- **Reviewed commit:** `4c27d9abed712d1b2e11530b460058f96cf27ee2` (branch `chirag`).
- **Review date/time:** 2026-07-31, ~17:47–18:19 IST (before the 18:00 UTC kickoff).
- **Reviewer posture:** treat the bootstrap as if produced by a different team; every claim re-verified or marked `NOT VERIFIED`.

## 1. Verdict

**READY WITH CONDITIONS**

**Implementation start gate:** **GO only for Phase 0** (kickoff governance: Discord confirmation, D-001/D-002 ratification, test-hash manifest) and for non-port-code work already allowed by the event rules. **NO-GO for Phase 2+ (any Rust port code)** until finding F-01 (repo eligibility vs. the "not already ported to the target" rule) is explicitly resolved at kickoff and D-001/D-002 are ratified. **Phase 4 is blocked on F-02** (UTF-16/UTF-8 index model must be specified first); **Phases 1 and 8 need the F-03 adapter/oracle-harness design** before their "Done when" gates are credible.

Rationale in one line: Git provenance, oracle pinning, baseline tests, event rules, security research, and the architecture *direction* are all verified sound; the defects are one existential-but-kickoff-resolvable eligibility gap, two unspecified design points in MUST-scope areas, a red lint baseline, four encoding-corrupted files (one of them a scored artifact), and a set of stale/contradictory evidence items.

## 2. Executive Summary

The Git state is exemplary and fully reproduced: branch `chirag` at `4c27d9a` equals `origin/chirag` on GitHub; the oracle commit `4f41a8edade7a5ab19832f7b40ecce46b288767f` (tag 4.0.5) is the merge-base, `origin/master`, *and* the live `micromatch/picomatch` master HEAD as of this review; the working tree was clean before this audit; the two bootstrap commits contain documentation/scaffolding only, with a single additive `.gitignore` change and zero modifications to upstream source or test files. No Rust port code was smuggled in, satisfying the event's "no port code before kickoff" rule.

The baseline was rerun personally: `npm run mocha` passes 1977/1977 (221 ms, exit 0) and `npm run test:cover` reproduces the claimed coverage exactly (93.2/89.81/91.66/93.75). However, `npm run lint` now **fails (exit 1)** with two comma-dangle errors inside the bootstrap's own committed file `tools/research/probe-regex-sources.js` — the prior session linted at 01:40, created the harness at ~01:51, and never re-linted. The "lint clean" claim is contradicted on the committed checkout, and the prior adversarial audit missed it.

The event contract was re-fetched in full from the official site (the first extraction attempt returned an empty page; a second tool succeeded): kickoff/freeze times (Jul 31 / Aug 03, 18:00 UTC), kickoff test-suite hashing, thin-adapter test model, 40/30/20/10 scoring, bonus table (+5/+5/+3/+3), submission deliverables, anatomy layout incl. `.port-mortem.toml`, and the "no pre-kickoff code" rule all verify. Two material discrepancies were found against the bootstrap's ledger: the official page now says bring-your-own-repo needs **no pre-approval** (ledger said judge approval was needed), and official rule 01 requires a BYO repo to be **"not already ported to the target"** — while picomatch already has two Rust ports (`picomatch-rs`, `satch`, both registry-verified). If picomatch is not on the official recommended pool, the project is plausibly ineligible. The bootstrap records the pool question (G-01) but rates its blast radius "Low"; that rating is wrong. This is the single blocker, and it is resolvable only via the kickoff Discord/pool publication.

The proposed architecture (transliterated parser/scanner + dual regex engines) is feasible and honestly gated: `regex`'s missing lookaround is verified, `fancy-regex`'s `RegexBuilder::backtrack_limit` and `RuntimeError::BacktrackLimitExceeded` are verified to exist, and the reproduce-don't-fix decision for the issue-#175 ReDoS hole (D-011) is explicit and event-compatible. Three genuine design gaps remain: (a) scan/parse expose numeric fields computed as UTF-16 code-unit offsets in JS, and no index convention is specified for the Rust port — a MUST-level parity break for non-ASCII patterns that one line of risk prose does not cover; (b) the central judging artifact — running the unmodified mocha suite through a JSON CLI — has no specified mechanism (tests `require('..')` *and* `../lib/scan` directly, use a stateful helper, and assert on RegExp objects), and Phase 1's "walk every test and emit JSONL" has no instrumentation design and an implausible "loses zero fidelity" fallback claim; (c) the observable behavior when the fallback engine's backtrack budget is exceeded is undefined in the spec.

Documentation quality is high in structure and traceability (60 FRs and 22 NFRs, all covered by at least one plan phase; 12 ADRs with full field sets; 18 registered gaps with defaults and gates), but four files — including the judge-scored `DECISIONS.md` — are double-encoded UTF-8 with BOM (mojibake: `â€”`, `Â§`) as a result of the PowerShell rename pass that touched exactly those four files; several version claims are stale (fancy-regex 0.17.0 vs latest 0.19.0; Rust stable 1.95.0 vs 1.97.1; `regex` 1.12.4 not verifiable); requirement-count range notation ("FR-001..091", "NFR-001..050") overstates the actual 60/22 requirements; and the previous audit's "fixed" disposition for its F-01 is partially false (the "38 files" error survives in `knowledge/source-ledger.md:16`).

## 3. Scope and Review Method

- **Local repository:** `d:\picomatch\picomatch`; branch `chirag`; HEAD `4c27d9abed712d1b2e11530b460058f96cf27ee2`.
- **Base commit / comparison range:** `4f41a8edade7a5ab19832f7b40ecce46b288767f` (tag 4.0.5) `..chirag`; `git rev-list --left-right --count origin/master...chirag` → `0 2`.
- **Tools used:** local Git/Bash/Node v24.13.0; GitHub tools (commits, issues); search MCP search/contents tools; Context7 (resolve/query); direct web extraction (FetchURL); crates.io/OSV/releases.rs fetches.
- **Tools unavailable or degraded (recorded as limitations):** Discord (no credentials — kickoff channel unreadable); Context7 has no `fancy-regex` or `regex-automata` library entry (fell back to docs.rs primary pages); crates.io API rate-limited local `curl` (used web extraction instead); the `regex` crate's exact latest version could not be re-verified (extraction returned an empty body).
- **Method:** Stage 0 Git baseline → full tracked-file inventory with SHA-256/line counts → complete read of all 43 tracked Markdown files plus CI, manifests, schema, harness, and probe JSON → claim-by-claim re-verification of the prior session's nine claim groups → programmatic ID/link/count/traceability checks → safe baseline reruns (mocha, lint, coverage, probe regeneration, bounded timing probe with subprocess timeout) → external search→fetch→verify of event rules, advisories, issues, and crate documentation.
- **Files reviewed:** all 43 tracked `*.md` (manifest in §5), `.github/workflows/test.yml`, `package.json`, `.npmrc`, `.gitattributes`, `.gitignore` diff, `tests/corpus/schema.v1.json`, `tools/research/probe-regex-sources.js`, `scratch/probe-regex-sources.json` (UTF-16LE), `scratch/git-log.txt`, plus targeted reads of `lib/*.js`, `index.js`, `posix.js`, and cited test-file ranges.
- **Explicit exclusions:** no Rust implementation; no fixes to any reviewed file; no reading of prior-port source code (provenance-only per scope); Discord content (inaccessible); the older Code Resurrection (Wave 1) event content, which shares the event domain, is flagged where encountered and not used as evidence for Port Mortem 2026 rules.

## 4. Git and Repository Integrity

| Check | Evidence (command, exit) | Result |
|---|---|---|
| Branch is `chirag` | `git branch --show-current` → `chirag` (exit 0) | VERIFIED |
| HEAD == claimed | `git rev-parse HEAD` → `4c27d9abed712d1b2e11530b460058f96cf27ee2` | VERIFIED |
| HEAD == remote | `git rev-parse --verify origin/chirag` → same hash | VERIFIED |
| Oracle commit | `git merge-base chirag origin/master` → `4f41a8edade7a5ab19832f7b40ecce46b288767f` = tag `4.0.5` = `origin/master` = `upstream/master` | VERIFIED |
| Divergence | `git rev-list --left-right --count origin/master...chirag` → `0 2` | VERIFIED |
| Clean tree (pre-audit) | `git status --short`, `git status --porcelain=v1` → empty | VERIFIED |
| Remotes | `origin` → gauravk16in/picomatch; `upstream` → micromatch/picomatch.git | VERIFIED |
| Bootstrap commit 1 | `git show --stat 54c9eb0282d7332666c639251acffec89c8f6a49` → 44 files, +2881, docs/scaffolding/research only | VERIFIED |
| Bootstrap commit 2 | `git show --stat 4c27d9a` → audit + implementation.md finalization (+20/−7) | VERIFIED |
| Upstream files untouched | `git diff --name-status origin/master...chirag` → 43 additions + `M .gitignore` only | VERIFIED |
| `.gitignore` change | additive 13 lines (Rust `target/`, fuzz, artifacts, `scratch/out/`) — reviewed line by line; benign | VERIFIED |
| No Rust port code | no `Cargo.toml`/`*.rs` in `git ls-files`; `rustc`/`cargo` absent on this machine (Rust checks NOT APPLICABLE YET) | VERIFIED |
| Commit timing | 54c9eb0 2026-07-31T03:35:31+05:30; 4c27d9a 2026-07-31T03:40:43+05:30 — both before the 18:00 UTC kickoff and containing no port code (rule-compliant) | VERIFIED |
| GitHub push state | API `list_commits(chirag)` → head `4c27d9a`, parents `54c9eb0` → `4f41a8e` | VERIFIED |
| Upstream not moved | API `list_commits(micromatch/picomatch, master)` → head still `4f41a8ed...` as of review | VERIFIED |

**Bootstrap-only determination:** confirmed. The branch contains documentation, research ledgers, a disposable probe harness, corpus schema, and strategy READMEs only.

## 5. Complete File Review Manifest

All 43 tracked Markdown files, read fully (first line to last) at commit `4c27d9a`. Hashes are SHA-256 truncated to 16 hex chars; full hashes reproducible via `sha256sum <file>`.

| Path | Lines | SHA-256 (16) | Read fully | Role | Issues/findings |
|---|---|---|---|---|---|
| `.github/contributing.md` | 57 | a30b750cd0250a0a | yes | upstream contributing guide | none |
| `.verb.md` | 521 | 62570d64fa9070c4 | yes | upstream README template | none (intentional `../../issues/new` web-relative link) |
| `ARCHITECTURE.md` | 111 | b93319e0f99909a0 | yes | port architecture | F-14 (7-op CLI list) |
| `CHANGELOG.md` | 155 | b40b2d9334d913e3 | yes | upstream history (stops at 4.0.0 — verified) | none (gap documented in repo-inventory) |
| `CLAUDE.md` | 78 | 1fe5de8e8ca894ca | yes | session governance | none |
| `DECISIONS.md` | 130 | 4473a92068d76358 | yes | 12 ADRs | F-05 (BOM + double-encoded mojibake, entire file) |
| `Prompts/Session-0.md` | 523 | fa1de4f8b1bba952 | yes | original bootstrap prompt (verbatim, user-authored) | none |
| `README.md` | 743 | a69b87120fe2b9cb | yes | upstream README | F-15 (posix-default prose stale vs source) |
| `audits/2026-07-31-0134-bootstrap-research.md` | 118 | 76d9b284d29843b5 | yes | previous session audit | F-09 (F-01 disposition partially false; lint/encoding missed) |
| `audits/README.md` | 27 | 8c3ee8c6480ddd12 | yes | audit rules (naming followed by this file) | none |
| `context.md` | 77 | 58a21229f262d60f | yes | event/repo facts | F-01 (G-01 framing); F-08 (baseline lint claim at L53) |
| `docs/README.md` | 22 | 90e84a122d972869 | yes | docs index | none |
| `docs/api-compatibility.md` | 47 | e63b7ebf3c96a3a5 | yes | JS→Rust API mapping | none (spot-checked citations all resolve) |
| `docs/benchmarking.md` | 37 | 974a1b8cb44041ce | yes | benchmark methodology | none |
| `docs/build-and-ci.md` | 48 | beed2ef6fd714801 | yes | build/CI contract | F-07 (inherits 1.95.0 pin) |
| `docs/compatibility-matrix.md` | 48 | 1f05d12946b8d6e6 | yes | requirement→evidence→status | none (all rows SPEC at bootstrap, honest) |
| `docs/demo-plan.md` | 31 | 4ea22d7866234881 | yes | demo video plan | none |
| `docs/differential-testing.md` | 73 | 61eae370362452d8 | yes | corpus/adapter strategy | F-03 (adapter mechanism); F-12 (example violates schema) |
| `docs/fuzzing.md` | 37 | 95106dd2bc6a418e | yes | fuzz strategy | none |
| `docs/glob-semantics.md` | 72 | 045f422b595c4d84 | yes | pattern language semantics | none (probe claims verified) |
| `docs/licensing.md` | 33 | 9adb265f455cd8c8 | yes | license compliance | F-07 (fancy-regex license cell) |
| `docs/parser-and-scanner.md` | 64 | d90a1556ca26c2f0 | yes | module decomposition/risk | F-02 (UTF-16 note insufficient, L60) |
| `docs/rust-design-options.md` | 35 | 50c8498d3449f619 | yes | engine strategy comparison | F-07 (0.17.0 staleness) |
| `docs/security.md` | 43 | 26a696e19f8d8835 | yes | threat matrix, advisories | F-17 (963 ms figure) |
| `docs/submission-checklist.md` | 24 | 96922f9597f9fc60 | yes | submission tracking | none |
| `docs/upstream-baseline.md` | 30 | 1ffdf2724feddec6 | yes | baseline narrative + sync policy | F-08 (inherits lint claim) |
| `implementation.md` | 101 | 3d6155e1553c95e0 | yes | chronological log | F-08 (lint row L17, FR/NFR ranges L58); F-18 ("43 files" L94) |
| `knowledge/README.md` | 17 | ad5f236d21177f21 | yes | knowledge index | F-11 (inherits "32+7") |
| `knowledge/dependency-evaluation.md` | 49 | e3cf62a1b2f03651 | yes | crate candidates | F-07 (0.17.0/1.95.0/1.12.4, license) |
| `knowledge/options-matrix.md` | 71 | 623e3d7082832647 | yes | 33 main + 7 scan option rows | F-11 (count wording); F-15 (posix conflict unnoted) |
| `knowledge/prior-art.md` | 32 | 042df904ad5993df | yes | do-not-copy register | F-05 (encoding) |
| `knowledge/repo-inventory.md` | 114 | f921d6b35771f930 | yes | tree/LOC/CI/provenance | none (F-01 fix applied here correctly) |
| `knowledge/research-gaps.md` | 24 | 6540de0a90e800b5 | yes | G-01..G-18 register | F-01 (G-01 blast radius "Low") |
| `knowledge/search-ledger.md` | 81 | c933961263debd39 | yes | 61 research queries | F-05 (encoding); F-01 (row-3 pool claims) |
| `knowledge/source-ledger.md` | 87 | 100c5ff6824dfcd0 | yes | source register | F-05 (encoding); F-09 ("38 files" L16) |
| `knowledge/test-inventory.md` | 67 | 0a74928f87e64c68 | yes | suite→port mapping | F-13 (Infinity sentinel L13 vs L56) |
| `plan.md` | 147 | e0b39c320c85a751 | yes | 12-phase plan | F-02/F-03 (Phase 1/4 designs); F-08 (Phase 1 "FR-001..091") |
| `scratch/README.md` | 12 | deeb0497ad129a83 | yes | scratch rules | F-16 (inherits UTF-16 artifacts) |
| `spec.md` | 194 | fa97f2cb7eb93e65 | yes | behavioral contract (60 FR + 22 NFR) | F-06 (FR-073); F-08 (§20 ranges); §5.4 `[assumed]` marker → gate G-C |
| `tests/README.md` | 17 | 3db04562ee28db29 | yes | port test strategy | none |
| `tests/differential/README.md` | 3 | 99779e958248cc57 | yes | placeholder README | none |
| `tests/fixtures/README.md` | 3 | 3fe568eacdb66317 | yes | placeholder README | none |
| `tests/fuzz/README.md` | 3 | 939e532daee47d73 | yes | placeholder README | none |

**Non-Markdown evidence reviewed:** `.github/workflows/test.yml` (CI matrix claims all verified), `package.json` (scripts/devDeps verified), `.npmrc` (`package-lock=false` verified; no lockfile on disk), `.gitattributes`, `.gitignore` diff, `tests/corpus/schema.v1.json` (valid JSON; F-12), `tools/research/probe-regex-sources.js` (F-04 lint errors at 68:43/93:50), `scratch/probe-regex-sources.json` (UTF-16LE+BOM; content re-verified identical to a fresh run), `scratch/git-log.txt` (UTF-16LE), plus targeted source reads (`lib/picomatch.js`, `lib/parse.js`, `lib/scan.js`, `lib/constants.js`, `lib/utils.js` cited regions, `index.js`, `posix.js`, `test/support/match.js`, `test/api.scan.js` header, `test/options.js:25-33`, `test/malicious.js:21-32`, `test/api.picomatch.js:317-320,367-370`). Untracked/ignored state: only `.nyc_output/`, `coverage/`, `node_modules/` (all expected, ignored).

## 6. Previous Summary Verification

The prior session's final summary is not itself a repository artifact; its nine claim groups are verified here against their persisted form (`implementation.md`, `audits/2026-07-31-0134-bootstrap-research.md`, `knowledge/*`) and against fresh evidence.

| ID | Claim (as documented) | Evidence | Result | Notes |
|---|---|---|---|---|
| A | Repo/git: fork==upstream @`4f41a8e`, branch `chirag`, HEAD `4c27d9a`, clean tree, commits 54c9eb0+4c27d9a, pushed | `git` commands (§4); GitHub API | VERIFIED | every element reproduced locally and remotely |
| B | Baseline: mocha 1977 pass; lint exit 0; coverage 93.2/89.81/91.66/93.75 | reruns (§8) | CONTRADICTED (lint only) | mocha+coverage exact; **lint now exit 1** (F-04) |
| C | Files created: 7 root docs, docs/×16, knowledge/×10, tests/ strategy, audits, scratch, tools harness, `.gitignore` +13; upstream untouched | `git show --stat`, `git diff --name-status` | VERIFIED | 44 changed files total; "43 files" in log counts additions only (F-18, trivial) |
| D | "Entire observable contract" captured: 9 exports, 32+7 options, test inventory, ~60 regex probes, exact errors, callback order, parse/scan shapes, win/posix behavior | probe regeneration (62 keys identical); source spot-checks; option-row count (33+7) | CONTRADICTED (the "entire" framing only) | enumerated probes/errors/shapes verified as far as they go; interactions/callbacks rest on selective test reads, not execution (F-10); option count wording imprecise (F-11) |
| E | Security: CVE-2026-33671/672 ids + ranges + fix commits; #175 reproduces; exponential | GHSA fetches; OSV aliases; `git log`; bounded timing probe | VERIFIED with caveat | ids/ranges/fixes/issue all verified; growth curve confirmed (5.8→6.4→39.6→164.9 ms @ n=24/28/32/35); **963 ms figure not reproduced** (F-17); reproduce-not-fix resolved by D-011 (event-compatible) |
| F | Event contract: times, hashing, adapter, scoring, bonuses, deliverables, dependency/wrapper/plagiarism rules, deadline | full fetch of coderesurrection.com/2026; Devfolio fetch | VERIFIED with discrepancies | all core claims verified; pool sub-claims (~30 repos, ≥80% coverage, 4h window, off-pool approval) NOT re-verified; "off-pool approval" contradicted by current page (F-01) |
| G | Architecture: transliteration + dual engine + fancy-regex step budget + mini-backtracker contingency | docs.rs fetches (RegexBuilder, RuntimeError, index) | VERIFIED (feasible; 3 design gaps) | `backtrack_limit` + `BacktrackLimitExceeded` verified real; UTF-16 indexing (F-02), adapter mechanism (F-03), budget-exceeded semantics (F-06) unspecified |
| H | Gaps/assumptions registered with defaults+gates (G-01..G-18) | `knowledge/research-gaps.md` (18 rows) | VERIFIED, one mis-rated | register exists and is disciplined; G-01 blast radius mis-rated Low (F-01); spec §5.4 judge-acceptance `[assumed]` is gated at Phase 0 (D-002) |
| I | Previous audit: complete scope, right severities, fixes verified, "no critical/high" justified | independent re-review | CONTRADICTED (two closure claims) | scope thorough, but F-01 "fixed in both places" is false (source-ledger L16), and lint failure + 4-file encoding corruption were missed (F-09) |

## 7. External Evidence Matrix

Search → full-content fetch → verify protocol followed; no claim below rests on a search snippet.

| Claim | Query/tool | Full content fetched | Primary source | Result |
|---|---|---|---|---|
| Kickoff Jul 31 18:00 UTC; freeze Aug 03 18:00 UTC; tests hashed at kickoff | event site fetch (2nd extractor; 1st returned empty page) | yes (full §08 Timeline) | coderesurrection.com/2026 §08 | VERIFIED |
| Judging Aug 03–13; winners Aug 14; Write-Up $300 (3×$100) closes Aug 10 | same | yes (§08, §10) | same | VERIFIED |
| Track F = JavaScript → Go or Rust | same + Devfolio fetch | yes (§03 track card F) | same + portmortem.devfolio.co | VERIFIED |
| Original tests run via thin adapter against port artifact; templates promised | same | yes (§16 FAQ "What counts as passing…") | same | VERIFIED |
| Scoring 40/30/20/10; Engineering Discipline 15% for DECISIONS.md | same | yes (§09, §05 anatomy item 03) | same | VERIFIED |
| Bonuses: Fuzz +5 (≥60 s zero-divergence), Zero Unsafe +5 (thresholds at kickoff), Bug Catcher +3 (file during event), Decision Log +3 (≥10) | same | yes (§06) | same | VERIFIED |
| Deliverables 1–7 (repo, one-command build, hashed suite, fuzz harness, DECISIONS.md, bench report, 5-min demo) | same | yes (§04) | same | VERIFIED |
| Anatomy layout incl. `.port-mortem.toml` (advisory) | same | yes (§05) | same | VERIFIED |
| No port code before kickoff (planning/scouting allowed); deps + AI tools fair game | same | yes (§16 FAQ; rule 04) | same | VERIFIED |
| No source-language runtime wrappers/FFI | same + Devfolio | yes (rule 05) | same | VERIFIED |
| Pre-existing-port/plagiarism clause | same + Devfolio | yes (rule 04; Devfolio rules) | same | VERIFIED |
| Repo pool ~30 repos, 2k–8k LOC, ≥80% coverage, 4h pick window (ledger row 3) | search MCP search + fetch attempts (incl. `/2026/pool` → legacy Wave-1 page) | pool page NOT found | none | NOT VERIFIED |
| Off-pool repo needs judge approval (ledger row 3) | event site fetch | yes | coderesurrection.com/2026 §11 rule 01 + §16 FAQ | CONTRADICTED ("no pre-approval needed") |
| BYO repo must be ≥1,000 LOC, <~8,000, OSS, **"not already ported to the target"** | same | yes (rule 01, §16 FAQ) | same | VERIFIED (basis of F-01) |
| CVE-2026-33671 = GHSA-c2c7-rcm5-vvqj; ReDoS extglob `+()`/` *()`; fixed 4.0.4/3.0.2/2.3.2; PoCs/timings | GHSA page fetch + OSV API | yes (Impact/Patches/Workarounds) | github.com/advisories/GHSA-c2c7-rcm5-vvqj; api.osv.dev | VERIFIED (alias + CVSS 7.5 vector) |
| CVE-2026-33672 = GHSA-3v7f-55p6-f55p; method injection via POSIX map; `__proto__:null` fix | GHSA page fetch + OSV API | yes | github.com/.../GHSA-3v7f-55p6-f55p; api.osv.dev | VERIFIED (alias + CVSS 5.3 vector) |
| Issue #175 open; `+(ab|abab)` bypass; multi-char prefix gap | GitHub issue API | yes (full body) | micromatch/picomatch#175 | VERIFIED (open, 2026-06-09; issue's own table: 134 ms @ len 71) |
| Issue #171 open (parens-vs-bash divergence) | GitHub issue API | yes | micromatch/picomatch#171 | VERIFIED (open) |
| Issue #89 open (matchBase docs-vs-source) | GitHub issue API | yes | micromatch/picomatch#89 | VERIFIED (open) |
| Rust `regex`: no lookaround/backrefs; O(m·n); MSRV 1.65; MIT/Apache | docs.rs fetch (latest) | yes (crate docs) | docs.rs/regex | VERIFIED |
| `regex` latest = 1.12.4 (updated 2026-07-15) | crates.io API (curl rate-limited; extraction empty) | no | — | NOT VERIFIED (gated at Phase 2 per G-14) |
| fancy-regex `RegexBuilder::backtrack_limit` exists | docs.rs fetch | yes (struct.RegexBuilder) | docs.rs/fancy-regex | VERIFIED |
| fancy-regex limit-exceeded error type | docs.rs fetch | yes (enum.RuntimeError) | docs.rs/fancy-regex | VERIFIED (`RuntimeError::BacktrackLimitExceeded`; also `StackOverflow`) |
| fancy-regex delegates non-fancy spans to `regex`; exponential worst case possible | docs.rs fetch | yes (crate index docs) | docs.rs/fancy-regex | VERIFIED |
| fancy-regex latest 0.17.0 "mid-2026" (dependency-evaluation) | crates.io API fetch | yes | crates.io/api/v1/crates/fancy-regex | CONTRADICTED (latest 0.19.0, 2026-07-28; 0.17.0 is 2025-12-13; license field "MIT", rust_version 1.66) |
| Rust stable 1.95.0 "current" (D-012, NFR-030) | releases.rs fetch | yes | releases.rs (generated 2026-07-31) | CONTRADICTED (stable 1.97.1, beta 1.98.0, nightly 1.99.0) |
| picomatch-rs prior art: Maidang1, published 2026-03-19, MIT | crates.io API fetch | yes | crates.io/api/v1/crates/picomatch-rs | VERIFIED (0.1.0, 2026-03-19, MIT) |
| satch prior art: 0.1.0, MIT, 899 SLoC, 2021 edition | crates.io API fetch | yes | crates.io/api/v1/crates/satch | VERIFIED (899 Rust code lines exactly; "~9 months"/"~390 downloads" slightly stale: 2025-08-09, 413) |
| Unstop aggregator times (18:00 UTC corroboration); Community Choice discrepancy | ledger only this review | not re-fetched (aggregator; official site authoritative) | — | NOT RE-VERIFIED (official site already settles it: Write-Up replaces Community Choice) |
| Bash manual semantics | prior ledger | not re-fetched (subordinate to JS oracle per spec §5.2) | — | NOT RE-VERIFIED (non-load-bearing) |

## 8. Baseline Checks

All run personally on this machine (Windows 11, Git Bash), cwd `d:\picomatch\picomatch`, Node v24.13.0, npm 11.6.2, git 2.53.0.windows.3, 2026-07-31 ~18:00 IST. Rust toolchain absent (`rustc`/`cargo`: command not found) — matches research-gaps G-13; Rust build checks are NOT APPLICABLE YET, not failures.

| Command | Environment | Exit | Result | Difference from prior claim |
|---|---|---|---|---|
| `npm run mocha` | as above | 0 | **1977 passing (221 ms), 0 failing** | none — matches (prior 270 ms) |
| `npm run lint` | as above | **1** | **2 errors: `tools/research/probe-regex-sources.js` 68:43 and 93:50, comma-dangle** | **CONTRADICTS "exit 0 clean"** (F-04) |
| `npm run test:cover` | as above | 0 | 1977 passing; stmts 93.2% (1084/1163), branches 89.81% (873/972), funcs 91.66% (66/72), lines 93.75% (1051/1121) | none — exact match |
| `node tools/research/probe-regex-sources.js` | as above | 0 | 62 keys; content **identical** to committed `scratch/probe-regex-sources.json` | none (artifact is UTF-16LE — F-16) |
| `node -e` API probes | as above | 0 | 9 exported keys; `+(ab|abab)` → `^(?:(?=.)(?:ab|abab)+)$` (not literalized); `+(a|aa)` → `^(?:\+\(a\|aa\))$` (literalized); posix≠index on win32; scan sample matches README | none |
| bounded timing probe (`timeout 30 node`) | as above | 0 | n=24→5.8 ms, n=28→6.4 ms, n=32→39.6 ms, n=35→164.9 ms (`'ab'×n+'a'`) | growth confirmed; **prior "963 ms @ len 71" NOT reproduced** (F-17) |
| `npm install` | not rerun (node_modules present; `.npmrc package-lock=false`; tree clean, no lockfile) | — | prior run left no metadata/lockfile mutation (`git status` clean) | none |

Audit-only checks (all exit 0 unless noted): markdown inventory + SHA-256 (43 files); FR/NFR/ADR/G-ID extraction and sequence analysis; internal relative-link check (0 broken; 2 intentional web-relative `../../issues/new` upstream links); JSON parse of schema (valid); secret scan (no secrets — only prose words "token"/"secret"); TODO/FIXME scan (none); mojibake byte scan (`C3 A2` marker) and BOM scan (exactly 4 files — F-05); traceability matrix computation (§9).

## 9. Documentation and Traceability Assessment

- **Spec completeness:** `spec.md` defines **60 FRs and 22 NFRs** (counted programmatically from bold definitions; unique IDs; no undefined references). Every requirement carries a source citation; ~25 cited source ranges were spot-checked against `lib/*.js` and test files — all resolved correctly (e.g., `lib/picomatch.js:43-60` factory+TypeError, `:264-284` compileRe, `lib/parse.js:44-46` syntaxError format, `:364-368` maxLength, `:48-347` analyzeRepeatedExtglob family, `lib/scan.js:327-340` 12-field state, `test/malicious.js:21-32` maxLength tests, `test/options.js:25-33` matchBase-windows regression).
- **FR/NFR metrics:** FR IDs are unique but **non-sequential** — 31 gaps (FR-019, 042–049, 054–059, 066–069, 075–079, 083–089); max ID 091. NFRs: 22, max ID 050. Range notation in `spec.md:182` ("FR-001..091"), `implementation.md:58` ("FR-001..091, NFR-001..050"), and `plan.md:24` ("foundation for FR-001..091") overstates the true counts (F-08).
- **ADR consistency:** 12 ADRs (D-001..D-012), each with status/date/context/options/decision/evidence/consequences/rejected/reversal-trigger/links. 5 Proposed (D-001, D-002, D-003, D-004, D-012), 7 Accepted — consistent with `docs/submission-checklist.md:11`. Tension: `spec.md:11` states the pure-Rust library+CLI shape as product fact while `DECISIONS.md:7` keeps D-001 **Proposed** and `context.md:58` marks it an assumption — an internal-status mismatch a fresh agent could misread (resolved by gates G-B/G-C in §13). `spec.md:53` contains an explicit judge-acceptance `[assumed: …]` marker; it is gated by the Phase-0 D-002 ratification, so it is a decision gate, not a defect.
- **Phase feasibility:** all 12 phases have the required shape; every one of the 60 FRs and 22 NFRs is referenced by at least one phase's Covers field (computed, no orphans); commands reference files that exist or are explicit deliverables. Two feasibility exceptions are findings: Phase 1's oracle-extraction mechanism (F-03) and Phase 4's indexing model (F-02). Failing-test-first strategy is credible and consistent. Fuzz/benchmark ordering is sane (late enough to avoid premature optimization; Phase 9 gates influence architecture via step-budget proof). Cross-platform gates exist in Phase 4/8/11 before platform-dependent decisions harden.
- **Link/citation validation:** 0 broken relative links across all 43 markdown files; GitHub commit references (5eceecd, 4516eb5, ab8bc4d, 6289307, 9f241ef, 032e3f5, 5b8d33f) all exist in local history; schema/differential-testing op lists drift (7 vs 9 vs 10 — F-14); corpus example violates its own schema (F-12).
- **Requirement→phase→test coverage:** FR→phase 60/60; NFR→phase 22/22; FR→test-family mapping exists via `docs/compatibility-matrix.md` (all rows honestly marked SPEC) and `knowledge/test-inventory.md` (35 suites + helper mapped). Traceability is real but the range-notation overstatement and the ID gaps should be corrected before Phase 1 starts emitting requirement-keyed corpus metadata.

## 10. Architecture Feasibility Assessment

- **Parser/scanner model (D-004):** transliteration of a 1,416-LOC context-sensitive state machine is the lowest-drift option and is mechanically reviewable against the oracle; arena-index token links and enum boundaries are the right Rust idioms. Feasible.
- **Engine strategy (D-002/D-003):** the lookaround subset is real (probe-verified: `^(?:(?!\.)(?=.)[^/]*?\/?)$`, `^(?!…).*$`); `regex` cannot compile it (docs.rs-verified); `fancy-regex` supports the constructs and has a real, documented `backtrack_limit` and `RuntimeError::BacktrackLimitExceeded` (docs.rs-verified). Capture numbering and greedy/lazy behavior of a backtracking VM are the closest available match to JS RegExp. Feasible with the two gaps below.
- **Unicode/indexing (F-02):** JS computes scan/parse indices as **UTF-16 code units** (`lib/scan.js:78,81,157` `charCodeAt`/`index`; `slashes`/`start` are unit offsets; string indexing throughout `lib/parse.js` is unit-based). Rust byte offsets diverge for non-ASCII patterns in *observable* fields (scan `start`/`slashes`, parse `index`/`start`/`consumed`, FR-011/FR-050/FR-051 — all MUST). `docs/parser-and-scanner.md:60` acknowledges byte arithmetic but no index convention (UTF-16-unit emulation vs byte offsets + documented divergence + corpus normalization) is specified. This is a design gap, not a note.
- **Captures/errors/callbacks:** capture arrays normalize cleanly (Option-per-group → null); error classes/messages are verbatim-verified and mapped (`PicomatchError::{TypeError,SyntaxError}`); callback order and the ignore pipeline are source-verified; the named-function registry is credible for the suite's small function set. `flags:'g'` statefulness is an explicitly recorded divergence (DV-2/FR-091) — acceptable.
- **Security bounds:** maxLength, the risky-extglob safeguard (incl. the 4.0.5 branch-preserving rewrite), null-prototype maps, and `#![forbid(unsafe_code)]` are all verified present in the oracle and correctly specified. D-011 (reproduce #175, document, bound our own worst case) is explicit and event-compatible — the "reproduce vs fix" question is decided, not guessed. Gap: FR-073/NFR-004 never define the observable result when the fallback budget trips (error? `isMatch:false`? never-match sentinel?), and that path *will* diverge from the oracle on adversarial inputs by design — it needs a named divergence entry and corpus handling (F-06).
- **Fallback viability:** fancy-regex is a viable primary fallback; the "mini-backtracker fallback-of-fallback" is currently prose-only — it has a defensible sketch in `docs/rust-design-options.md:26` (anchored, fixed-position lookarounds → negative check + linear scan) but no bounded specification, trigger criteria, security model, or phase budget beyond "Phase 7 if needed". Acceptable as a contingency note, not as a plan (folded into F-06's required action).
- **Strongest objection:** the two-engine split must produce *identical* accept/reject and capture behavior across engine boundaries for every corpus case; a selection bug or a fancy-regex semantic edge (e.g., laziness inside lookarounds, empty-match handling) would silently break parity on MUST behavior. The bootstrap mitigates this honestly (deterministic selection, per-case engine recording, forced-both-engines test seam, Phase 5/7 differential spikes) and correctly keeps D-003 Proposed pending those spikes. This is the right level of skepticism in the plan — the objection stands open until Phase 5/7 evidence, and the start gate reflects that.

## 11. Findings

### [BLOCKER] F-01 — Repo eligibility unresolved: pool listing unverified and official rule 01 excludes "already ported" BYO repos

**Status:** Evidence required (resolves only via kickoff Discord / official pool publication)

**Impact:** If `micromatch/picomatch` is *not* on the official recommended pool, the team's repo choice is plausibly ineligible under the current official rules, because two pre-existing Rust ports of picomatch exist (registry-verified: `picomatch-rs` 0.1.0 published 2026-03-19; `satch` 0.1.0 published 2025-08-09). An ineligible repo invalidates the entire submission regardless of engineering quality. The bootstrap's own risk register rates this blast radius "Low", which is incorrect; the plan's Phase 0 does schedule the check, but the severity of the outcome (project pivot, not doc fix) is not reflected anywhere.

**Evidence:**
- `knowledge/research-gaps.md:7` — G-01: pool listing "`(user)` — NOT found publicly… Blast radius if wrong: **Low** — repo choice already made".
- `knowledge/search-ledger.md:12` (row 3, double-encoded but legible) — claims "repo pool ~30 repos 2k–8k LOC ≥80% coverage, pick within first 4h of kickoff; **off-pool needs judge approval**". These sub-claims are NOT re-verifiable: the pool page was not found by search or by two fetch attempts (2026-07-31; `/2026/pool` returns the older Wave-1 "Code Resurrection" page).
- coderesurrection.com/2026 §11 rule 01 (fetched in full 2026-07-31): "bring your own public repo — **no pre-approval needed**. Your own repo should be at least 1,000 source lines… **and not already ported to the target**." §16 FAQ repeats it. This both contradicts the ledger's "judge approval" claim and creates the eligibility clause the bootstrap never analyzes.
- crates.io API records for `picomatch-rs` and `satch` (fetched 2026-07-31) proving prior ports exist.
- `knowledge/prior-art.md` treats prior art solely as a plagiarism risk, not as an eligibility risk.

**Why it matters:** Every subsequent phase assumes this repository. Event rules are the highest authority in this project; an unverified load-bearing rule blocks an unconditional start by the review's own evidence policy.

**Required action:** At kickoff (Phase 0), confirm from the official pool publication / Discord #announcements that `micromatch/picomatch` is pool-listed for track F, or obtain explicit organizer confirmation that it is accepted despite prior partial ports; record the answer (screenshot/message link) in `context.md` §7 and re-rate G-01. If the answer is negative, invoke the repo-change fallback before any port code. Update `knowledge/research-gaps.md` G-01 blast radius and `knowledge/search-ledger.md` row-3 claims to match the current official page.

**Validation:** Discord/pool-page citation committed in `context.md`; G-01 status changed from `(user)` to `(verified: <source>)`.

**Blocks:** All phases ≥2 (port code); Phase 0 deliverable "freeze this plan" cannot complete without it.

### [HIGH] F-02 — UTF-16 vs UTF-8 indexing has no specified model; observable MUST fields diverge for non-ASCII

**Status:** Open

**Impact:** `scan()` and `parse()` expose numeric fields (scan `start` and `slashes[]`; parse-state `index`/`start`/`consumed`) computed in JS as UTF-16 code-unit offsets. A Rust port using byte offsets returns *different numbers* for any pattern containing non-ASCII characters, breaking P0 data-shape parity (FR-011, FR-050, FR-051) and any corpus case with Unicode. A note that "the corpus includes non-ASCII patterns" (plan.md:62, docs/parser-and-scanner.md:60) does not define which convention the port implements or how the corpus normalizes it.

**Evidence:**
- `lib/scan.js:78,81` (`str.charCodeAt(index…)`), `lib/scan.js:157` (`slashes.push(index)`) — unit-based indices.
- `spec.md:67` (FR-011 state keys), `spec.md:105-108` (FR-050..052 contract) — MUST-level.
- `docs/parser-and-scanner.md:60` and `plan.md:62` — the only treatments; both are risk prose, not a convention; `spec.md` §5.3 normalization defines no index rule.

**Why it matters:** This is exactly the class of silent parity break the differential corpus is meant to catch — except the corpus schema itself has no field-level rule for indices, so the mismatch would surface as unexplained diffs in Phase 4.

**Required action:** Before Phase 4, add an explicit index model to `spec.md` §5.3/§9 and `docs/parser-and-scanner.md`: either (a) emulate UTF-16-unit offsets for all observable fields (recommended for parity), or (b) use byte offsets with a recorded DV-x divergence and corpus-side normalization; add non-ASCII scan/parse corpus cases proving the choice.

**Validation:** Non-ASCII scan/parse corpus cases replay green with the chosen convention documented; `docs/compatibility-matrix.md` row for FR-050..053 cites the convention.

**Blocks:** Phase 4 (scanner), Phase 5 (parser state), NFR-020 corpus schema.

### [HIGH] F-03 — Thin-adapter and Phase-1 oracle-extraction mechanisms are unspecified

**Status:** Open

**Impact:** The 40%-weighted judging criterion is "original test suite, unmodified, passing against the port via thin adapter". Upstream test files `require('..')` *and* `require('../lib/scan')` directly, use a stateful helper (`test/support/match.js`, which itself requires `../..` and accepts a `matches` Set option), and assert on RegExp objects and thrown errors with `assert`. No document specifies how `test/adapter/run-mocha.js` intercepts those requires, how RegExp/assert semantics cross a JSON CLI, or how hooks/suite state are handled. Phase 1's step "walks every upstream test file, executes assertions, and emits normalized JSONL" has no instrumentation design; its fallback ("hand-write extractor per file… loses zero fidelity") is an unverified and implausible claim for callback-order, error-class, and deep-state assertions, and implies substantial per-file engineering inside a 72-hour window.

**Evidence:**
- `test/api.scan.js:4` — `require('../lib/scan')` (bypasses package root); `test/extglobs.js:5`, `test/options.onMatch.js:5` — `require('..')`; `test/support/match.js` — requires `../..`, uses `options.matches` Set.
- `plan.md:20` (Phase 1 step 1), `plan.md:26` (fallback "loses zero fidelity"), `docs/differential-testing.md:13` (adapter named, mechanism absent), `spec.md:30` (U-2 judge scenario relies on it).

**Why it matters:** This is the highest-leverage artifact in the submission and currently rests on an unnamed mechanism; discovering its real cost at Phase 8 is a schedule-critical risk.

**Required action:** Add an adapter design section to `docs/differential-testing.md` (module-require interception map for `..`, `../..`, `../lib/scan`, `./support/match`; assert shim for RegExp/deepEqual; error-assertion mapping; event-sequence capture) and narrow Phase 1: generate the corpus from the *public API* with a per-op generator (no claim of full-fidelity mocha-assertion extraction), with the mocha adapter as a Phase-2-or-3 spike that proves require interception on 2 representative suites (`api.scan.js`, `options.onMatch.js`) before committing to it.

**Validation:** Phase-1 design doc names the mechanism; spike adapter runs 2 suites end-to-end against the CLI in Phase 3 at the latest; "loses zero fidelity" claim removed or evidenced.

**Blocks:** Phase 1 (corpus design), Phase 8 (adapter), FR acceptance (spec §20).

### [MEDIUM] F-04 — `npm run lint` fails on the committed checkout; baseline-green claim contradicted

**Status:** Open

**Impact:** The repository's own lint gate — which Phase 0 is instructed to re-verify (`plan.md:9`) and which `context.md:53`, `implementation.md:17`, and `docs/upstream-baseline.md:15` record as "exit 0 / clean" — currently fails. CI-style parity claims and the demo plan's "1977 passing" narrative inherit a red baseline.

**Evidence:**
- `npm run lint` (this review, 2026-07-31 ~18:00 IST) → **exit 1**: `tools\research\probe-regex-sources.js` 68:43 and 93:50, `comma-dangle` errors (log: this audit §16).
- Prior lint run (01:40 IST) predates the harness creation (~01:51 IST) per `implementation.md:15-19` — the file was never re-linted.

**Why it matters:** A bootstrap whose final commit breaks the baseline it certifies undermines the evidence discipline the whole repo is built on; it also slipped through both the end-of-session checklist and the adversarial audit.

**Required action:** Remove the two trailing commas (or add the harness to the eslint ignore set with a DECISIONS note) in the next session; re-run `npm run lint` and record exit 0; add "re-run baseline after adding any committed file" to the end-of-session checklist practice.

**Validation:** `npm run lint` exit 0 on `chirag`; updated baseline table in `implementation.md`.

**Blocks:** Phase 0 "baseline green" gate; none beyond (cosmetic fix).

### [MEDIUM] F-05 — Four files are double-encoded UTF-8 with BOM (incl. the judge-scored DECISIONS.md)

**Status:** Open

**Impact:** `DECISIONS.md`, `knowledge/search-ledger.md`, `knowledge/source-ledger.md`, and `knowledge/prior-art.md` render with mojibake (`â€”` for em-dash, `Â§` for §, `â†’` for →, `Ã—` for ×, `â‰¥` for ≥) on GitHub and in editors, and carry a UTF-8 BOM the repo's other docs do not. `DECISIONS.md` is read by judges and targets the Decision Log bonus (+3) and Engineering Discipline sub-weight; the ledgers are the project's evidence trail. All four are exactly the files rewritten by the PowerShell rename pass (`implementation.md:92`), which re-encoded them (PS 5.1 read-as-ANSI/write-UTF-8 double encoding, confirmed bytewise: BOM `EF BB BF` + `C3 A2 E2 82 AC` sequences).

**Evidence:**
- Byte scan (this review): `grep -l $'\xc3\xa2'` over tracked md → exactly those 4 files; BOM check → same 4.
- `DECISIONS.md:1` renders `# DECISIONS.md â€” Architecture Decision Records`; control file `spec.md:1` is clean UTF-8 (`E2 80 94`).
- `implementation.md:92` documents the rename pass touching these 4 files.

**Why it matters:** Judging-visible quality defect in a scored artifact plus corrupted evidence ledgers; also a trap for future sessions appending with correct encoding (mixed-encoding files).

**Required action:** Re-encode the 4 files to clean UTF-8 (no BOM) in the next session (lossless: decode as the double-encoded form and re-emit); verify with a byte scan; add an encoding check to the session checklist.

**Validation:** `grep -l $'\xc3\xa2' $(git ls-files '*.md')` → empty; no BOM; visual check of `DECISIONS.md` headings and § symbols.

**Blocks:** None (pre-submission cleanup; must land before Phase 11 at the latest, ideally before judges ever see the repo).

### [MEDIUM] F-06 — Fallback-engine budget-exceeded observable behavior is undefined

**Status:** Open (design decision required; fold into D-003 ratification)

**Impact:** FR-073/NFR-004 require a bounded fallback engine but never state what the port returns when the budget trips. fancy-regex surfaces this as `Error::RuntimeError(RuntimeError::BacktrackLimitExceeded)` at *match time* (not a compile failure, so the `/ $^ /` never-match rule does not literally apply). Any mapping (error vs `isMatch:false` vs never-match sentinel) is a deliberate divergence from the oracle — which eventually returns an answer — and must be named, normalized in the corpus, and reconciled with the Differential Fuzz Survivor bonus (a tripped budget during the 60 s run is a divergence unless specified otherwise).

**Evidence:**
- `spec.md:124` (FR-073), `spec.md:143` (NFR-004), `ARCHITECTURE.md:97` ("exceeding budget ⇒ deterministic no-match fallback") — ARCHITECTURE says "no-match", spec is silent; the corpus schema has no budget-exceeded expectation value.
- docs.rs/fancy-regex `enum.RuntimeError` (fetched 2026-07-31): `BacktrackLimitExceeded`, `StackOverflow` variants.
- `docs/rust-design-options.md:26` — mini-backtracker contingency has a defensible sketch but no trigger/spec/budget.

**Why it matters:** Security boundary + observable parity intersect here; guessing it during Phase 5/7 would produce exactly the kind of undocumented divergence the event penalizes.

**Required action:** Amend FR-073 (spec.md) and D-003 with: the limit value + rationale, the exact observable mapping on `BacktrackLimitExceeded` and on `StackOverflow`, a named DV-x divergence entry with oracle-behavior comparison, corpus/fuzz handling for budget-tripped cases, and either a bounded spec for the mini-backtracker contingency or its removal.

**Validation:** Corpus schema field (or expectation convention) for budget-exceeded; adversarial Phase-9 cases show the documented behavior; DECISIONS.md entry ratified.

**Blocks:** Phase 5 (engine layer v1), Phase 7 (extglob fallback), Phase 9 (fuzz bonus).

### [MEDIUM] F-07 — Stale or unverified dependency/toolchain version facts

**Status:** Open

**Impact:** `knowledge/dependency-evaluation.md` records fancy-regex "0.17.0 (docs.rs latest mid-2026)" — the registry shows 0.17.0 is from 2025-12-13 and **0.19.0 is current** (2026-07-28), so Phase 2 would adopt against stale facts (0.18/0.19 change default features, e.g. `variable-lookbehinds`). D-012/NFR-030 pin Rust **1.95.0** as "current stable" — releases.rs shows **1.97.1** current. The `regex` "1.12.4 (updated 2026-07-15)" claim could not be re-verified (crates.io API rate-limited curl; extraction returned empty). The fancy-regex license is recorded as "MIT or Apache-2.0"; the registry field is "MIT". None of these are design-breaking (re-pin gates exist: G-14, D-012 reversal trigger), but the dependency file's core promise is version accuracy.

**Evidence:**
- crates.io/api/v1/crates/fancy-regex (fetched 2026-07-31): `max_stable_version 0.19.0`; 0.17.0 `created_at 2025-12-13`; `license "MIT"`; `rust_version "1.66"`.
- releases.rs (fetched 2026-07-31): Stable 1.97.1, Beta 1.98.0, Nightly 1.99.0.
- `knowledge/dependency-evaluation.md:11,41`; `DECISIONS.md:127`; `spec.md:163`; `docs/licensing.md:20`.

**Why it matters:** Toolchain/dependency staleness at adoption time causes avoidable churn (feature flags, MSRV surprises) exactly when the 72 h clock is running.

**Required action:** At Phase 2, re-run the version/license/MSRV checks and update `knowledge/dependency-evaluation.md`, D-012 (pin current stable or justify the older pin), and `docs/licensing.md`; mark the `regex` version as verified from the actual `cargo add`/Cargo.lock.

**Validation:** Updated rows cite crates.io/docs.rs with access dates; `rust-toolchain.toml` matches D-012.

**Blocks:** Phase 2 (toolchain/dependency adoption).

### [MEDIUM] F-08 — Requirement-range notation overstates requirement counts; IDs non-sequential

**Status:** Open

**Impact:** "FR-001..091" and "NFR-001..050" read as 91 functional and 50 non-functional requirements; the actual defined sets are 60 FRs and 22 NFRs with 31 ID gaps. Traceability metrics, corpus metadata keyed on requirement IDs, and any judge-side counting inherit the overstatement. The acceptance table (`spec.md:182`) and the plan (`plan.md:24`) both propagate it.

**Evidence:**
- Programmatic count (this review): 60 bold `**FR-` definitions, 22 bold `**NFR-` definitions in `spec.md`; gaps FR-019, 042–049, 054–059, 066–069, 075–079, 083–089.
- `spec.md:182`, `implementation.md:58`, `plan.md:24`.

**Why it matters:** Review rule: counts are inventory claims, not quality; mislabeled ranges make the inventory itself wrong and will confuse requirement-keyed reporting (NFR-040 parity report).

**Required action:** Either renumber sequentially (with a mapping note) or replace range claims with explicit counts ("FR-001..091 (60 defined, IDs non-sequential)") in `spec.md` §20, `implementation.md`, and `plan.md` Phase 1; keep IDs stable thereafter for corpus keys.

**Validation:** A script recount matches the documented counts; no range spans undefined IDs in normative text.

**Blocks:** Phase 1 (corpus metadata keys), NFR-040 reporting.

### [MEDIUM] F-09 — Previous audit's closure claims are unreliable in two verified instances

**Status:** Open

**Impact:** The prior audit's F-01 disposition says "Fixed (…file updated in both places)", but `knowledge/source-ledger.md:16` still reads "16,961 LOC, **38 files** + support/match.js" (the corrected count, 36, is only in `knowledge/repo-inventory.md:26`). The same audit cycle missed the lint failure (F-04) and the 4-file encoding corruption (F-05), then concluded "No critical or high findings open". The audit's *scope* and most dispositions hold up (F-02 `prepend` row is now precise with `lib/parse.js:371` citation; F-03..F-08 dispositions are as recorded), but its "fixed" claims cannot be trusted without independent re-verification — which is material because Phase 0 instructions tell the next session to trust audit dispositions.

**Evidence:**
- `audits/2026-07-31-0134-bootstrap-research.md:86` (F-01 disposition) vs `knowledge/source-ledger.md:16` (still "38 files").
- F-04/F-05 evidence above (both predate the audit's finalization commits and were reachable by its stated method).

**Why it matters:** The audit trail is a load-bearing governance artifact; overstated closure invites the next session to skip re-verification.

**Required action:** Correct `knowledge/source-ledger.md:16`; annotate the prior audit's F-01 disposition (or this audit's index entry) noting the residual; adopt "re-verify before closing" as the disposition rule (already implied by CLAUDE.md rule 4).

**Validation:** `grep -rn "38 files" knowledge/` → no matches; audits/README index note updated.

**Blocks:** None (governance hygiene; feeds Phase 0 re-verification step).

### [MEDIUM] F-10 — "Entire observable contract captured" is an overclaim

**Status:** Open

**Impact:** The observable-contract capture rests on ~60 `makeRe` probe sources, error strings, 9 match samples, and selective test-file reads (audit §3 lists `api.picomatch.js`, `malicious.js`, `options.maxExtglobRecursion.js`, `options.js:1-120` as fully read). Callback sequencing, the option-interaction matrix, and most suite files (extglobs, globstars, brackets, braces, slashes-*, etc.) are mapped in `knowledge/test-inventory.md` but were not executed or fully read — so their contract rows rest on source analysis, not observation. This is fine as bootstrap scope, but the "entire/exhaustive" framing in the session summary overstates coverage and could lead Phase 1 to skip re-derivation.

**Evidence:**
- `audits/2026-07-31-0134-bootstrap-research.md:33` (files read fully — 6 test files of 36, one partially).
- Probe artifact: 62 keys (verified regenerable and identical).
- `knowledge/test-inventory.md` mapping table (35 suites) with no per-suite execution evidence.

**Why it matters:** Phase 1 is supposed to *freeze* the contract; it must re-derive expectations by executing the oracle per suite rather than trusting the bootstrap's static mapping.

**Required action:** Reword the summary-level claim in `implementation.md` (or annotate) to "contract analysis complete; execution capture is Phase 1"; keep Phase 1's per-suite oracle execution mandatory.

**Validation:** Phase 1 corpus manifest shows per-suite case counts derived from executed tests.

**Blocks:** None directly; expectation-setting for Phase 1.

### [LOW] F-11 — "32 main + 7 scan options" count is imprecise

**Status:** Open

**Impact:** `knowledge/options-matrix.md` contains **33 main rows** (including the `matchBase` and `noext` aliases) and **7 scan rows** (of which `noext`, `nonegate`, `unescape` duplicate main options). No consistent counting yields "32 + 7" (33 rows; 31 without aliases; 37 distinct names across both tables). The matrix itself is complete and canonical, so implementation impact is nil; the headline number (spec.md:19, spec.md:101, context.md:19, knowledge/README.md:11) is wrong and propagates into FR-040.

**Evidence:** row count script over `knowledge/options-matrix.md` (33/7); README.md:325-359 upstream table (33 rows, aliases marked).

**Required action:** Say "33 documented main options (31 distinct + 2 aliases) and 7 scan options (4 scan-specific, 3 shared)" once in `knowledge/options-matrix.md` and let other files link to it.

**Validation:** Count sentence matches a scripted recount.

**Blocks:** none.

### [LOW] F-12 — Corpus example violates the corpus schema

**Status:** Open

**Impact:** `tests/corpus/schema.v1.json` requires `meta.oracleCommit` to match `^[0-9a-f]{40}$`, but the schema's companion example in `docs/differential-testing.md:35` uses `"oracleCommit": "4f41a8e"` (7 chars) — the example would fail validation, misleading the Phase 1 generator.

**Evidence:** `tests/corpus/schema.v1.json:48`; `docs/differential-testing.md:35`.

**Required action:** Use the full 40-hex `4f41a8edade7a5ab19832f7b40ecce46b288767f` in the example (or relax the pattern deliberately and record why).

**Validation:** Example validates against the schema with a JSON Schema validator.

**Blocks:** Phase 1 (schema conformance).

### [LOW] F-13 — Infinity normalization is stated two different ways in one file

**Status:** Open

**Impact:** `knowledge/test-inventory.md:13` says scan normalization is `Infinity→"Infinity"` (string sentinel) while the same file's normalization table (line 56), `spec.md:48`, and `docs/differential-testing.md:39` all define `Infinity → {"__inf__": true}`. A Phase-1 implementer reading the mapping row first would emit non-conforming JSONL.

**Evidence:** `knowledge/test-inventory.md:13` vs `knowledge/test-inventory.md:56`, `spec.md:48`.

**Required action:** Change line 13's note to the canonical `{"__inf__": true}` form.

**Validation:** Single canonical Infinity rule repository-wide (grep).

**Blocks:** Phase 1.

### [LOW] F-14 — CLI op list is stated three ways (7 vs 9 vs 10)

**Status:** Open

**Impact:** `ARCHITECTURE.md:45` lists 7 ops; `plan.md:20` lists 9 (omits `events`); `tests/corpus/schema.v1.json:12` and `docs/differential-testing.md:18` define 10. The schema is the contract; the other two are stale summaries.

**Evidence:** cited lines; schema enum verified to include `events`.

**Required action:** Point both summaries at the schema's 10-op enum.

**Validation:** Single canonical op list referenced from ARCHITECTURE/plan.

**Blocks:** none (Phase 1 hygiene).

### [LOW] F-15 — README-vs-source `posix` default conflict not registered

**Status:** Open

**Impact:** Upstream README (`README.md:353` default `false`; `README.md:563` "POSIX classes are disabled by default") contradicts the source (`lib/parse.js:719`: classes expand when `opts.posix !== false`, i.e. enabled by default). `knowledge/options-matrix.md:37` correctly records the source behavior but does not note the README conflict, and `spec.md:44`'s known-conflicts list omits it — a fresh reader of the README would take the wrong default.

**Evidence:** cited lines; options-matrix header promises conflicts are noted (`knowledge/options-matrix.md:3`).

**Required action:** Add the conflict note to the `posix` row and to `spec.md` §5.2.

**Validation:** Note present; corpus includes a default-posix case proving enabled-by-default.

**Blocks:** none.

### [LOW] F-16 — Committed probe artifacts are UTF-16LE (binary to git and to standard tooling)

**Status:** Open

**Impact:** `scratch/probe-regex-sources.json` and `scratch/git-log.txt` are UTF-16LE with BOM/CRLF (PowerShell redirect artifacts). Git treats them as binary (no text diffs), and `jq`/`JSON.parse(fs.readFileSync(f,'utf8'))` fail on them without transcoding — yet docs cite the JSON as `[probe:…]` evidence (F-05 of the prior audit accepted "regenerable", which mitigates but does not fix the committed artifact).

**Evidence:** `file scratch/probe-regex-sources.json` → "UTF-16, little-endian … CRLF"; `xxd` head shows `FF FE`; regeneration this review produced identical content (so no information loss).

**Required action:** Re-emit both files as UTF-8 LF from the harness (or pipe through `iconv`) in the next session and re-commit; keep the harness as the source of truth.

**Validation:** `file` reports UTF-8/ASCII; `node -e "JSON.parse(require('fs').readFileSync('scratch/probe-regex-sources.json','utf8'))"` exits 0.

**Blocks:** none.

### [LOW] F-17 — The 963 ms issue-#175 timing is not reproducible as recorded

**Status:** Open

**Impact:** `implementation.md:21`, `docs/security.md:11`, and `DECISIONS.md:117` cite "963 ms @ len 71" as the local evidence for the Bug Catcher candidate. Re-measured on the same machine: **164.9 ms** for the identical n=35/len=71 case (bounded probe, warm-up curve 5.8/6.4/39.6/164.9 ms for n=24/28/32/35); the upstream issue's own table says 134 ms @ len 71 (M1). The exponential-growth claim is confirmed; the specific figure is unstable single-point evidence and would weaken an upstream comment.

**Evidence:** bounded probe log (this audit §8); micromatch/picomatch#175 body (timing table).

**Required action:** Before Phase 9's Bug Catcher submission, re-measure with median-of-N and environment recording per `docs/benchmarking.md`; cite the curve, not a single point.

**Validation:** Recorded median + spread in `docs/security.md`.

**Blocks:** Phase 9 (Bug Catcher artifact quality).

### [INFO] F-18 — "43 files" vs 44 changed files in the bootstrap commit

**Status:** Open (trivial)

**Impact:** None. `implementation.md:94` and the prior audit say "43 files"; `git show --stat 54c9eb0` shows 44 changed files (43 additions + 1 modification). The number counts additions only.

**Evidence:** `git show --stat --oneline 54c9eb0` (44 files); `git diff --name-status origin/master...chirag` (43 A + 1 M).

**Required action:** Optional wording fix at next log update.

**Validation:** n/a.

**Blocks:** none.

### [INFO] F-19 — Tool limitations encountered (Context7 coverage; crates.io access)

**Status:** Open (environment note)

**Impact:** Context7 has no `fancy-regex` or `regex-automata` entry (resolution returned `/rust-lang/regex`), so their API verification used docs.rs primary pages instead — acceptable per protocol but recorded. The `regex` crate's latest version is `NOT VERIFIED` (crates.io API rate-limited local curl; web extraction returned an empty body; docs.rs crate page does not state its version). Discord is inaccessible from this environment.

**Evidence:** tool outputs recorded in this audit §16; ledger rows.

**Required action:** Phase 2 verifies `regex` version from Cargo.lock after `cargo add`.

**Validation:** Cargo.lock committed.

**Blocks:** none (G-14 already gates).

### [INFO] F-20 — Event-site content drift between the two sessions

**Status:** Open (observation)

**Impact:** The prior session's scrape recorded pool details (~30 repos, ≥80% coverage, 4h pick window, off-pool approval) that are absent from the current official page; the current page additionally says the pool was published Jul 30 and BYO needs no approval. Either the page changed after 2026-07-31 01:55 IST or the details live on an unfetched pool subpage. This is the evidentiary root of F-01 and is recorded separately so future sessions do not treat the ledger's pool claims as current.

**Evidence:** `knowledge/search-ledger.md:12` vs full fetch of coderesurrection.com/2026 (this review, §7).

**Required action:** Reconcile at kickoff with the pool publication/Discord; annotate ledger row 3.

**Validation:** same as F-01.

**Blocks:** none beyond F-01.

## 12. Confirmed-Good Checks

Only items reproduced personally during this review:

1. Git integrity end-to-end: branch/HEAD/remote/oracle commit/divergence/clean tree/additive-only `.gitignore`; GitHub push state and unmoved upstream master (§4).
2. Baseline: `npm run mocha` 1977/1977 green; `npm run test:cover` reproduces the exact claimed coverage fractions.
3. Probe harness regenerates the committed probe JSON with identical content (62 keys) — scratch evidence is reproducible.
4. Oracle identity: `4f41a8edade7a5ab19832f7b40ecce46b288767f` == tag 4.0.5 == fork master == upstream master == GitHub `micromatch/picomatch` master HEAD.
5. All ~25 spot-checked source citations in spec/docs resolve to the exact claimed code (error strings, callback order, compileRe/makeRe/toRegex logic, scan state fields, maxLength, safeguard helpers, constants tables, `__proto__: null` fix, 14 POSIX classes, REPLACEMENTS).
6. Test/LOC inventories: 36 test `.js` files (incl. `support/match.js`), 16,961 test LOC, 2,424/2,444 lib LOC, 13 examples — all match.
7. CI claims match `.github/workflows/test.yml` exactly (matrix, exclusions, SHA-pinned actions, coverage upload condition).
8. Security chain: both GHSAs fetched and match `docs/security.md`; OSV confirms CVE-2026-33671/33672 aliases and CVSS vectors; fix commits present in the oracle; issue #175 reproduces (`+(ab|abab)` not literalized; super-linear timing curve confirmed on a bounded probe).
9. Event contract: official site fully fetched; kickoff/freeze times, test hashing, thin adapter, scoring, bonuses, deliverables, anatomy, BYO/pre-kickoff/plagiarism rules all verified (§7).
10. fancy-regex safety API is real: `RegexBuilder::backtrack_limit`, `delegate_size_limit`, `RuntimeError::BacktrackLimitExceeded`, delegation to `regex` for non-fancy spans — all docs.rs-verified.
11. `regex` crate constraints verified from docs.rs: no lookaround/backrefs, O(m·n), MSRV 1.65, MIT/Apache.
12. Prior-art provenance verified without reading any port source: picomatch-rs (2026-03-19, MIT) and satch (0.1.0, MIT, 899 Rust code lines, 2021 edition).
13. Traceability computation: 60/60 FRs and 22/22 NFRs are covered by at least one plan phase; no dangling FR/NFR references; no duplicate IDs.
14. Governance artifacts exist and are internally consistent: 12 ADRs with full fields (5 Proposed/7 Accepted), 18 research gaps with defaults+gates, 61-entry search ledger with saturation status, audit naming rules (followed by this file).
15. No secrets in tracked files; no TODO/FIXME placeholders; no empty decorative files (placeholder READMEs carry purpose + update rules).
16. D-011 resolves the reproduce-vs-fix tension explicitly and in an event-compatible way (parity preserved, bug documented, Bug Catcher path defined).
17. The bootstrap stayed within scope: zero upstream behavior changes, zero port code, recovery points recorded.

## 13. Decision and Evidence Gates

| Gate | Required evidence/decision | Owner | Blocks | Closure check |
|---|---|---|---|---|
| G-A (F-01) | Pool listing / organizer acceptance of picomatch for track F recorded from kickoff Discord or pool page; G-01 re-rated | team member with Discord | all port code (Phase ≥2) | citation in `context.md` §7; G-01 `(verified)` |
| G-B | D-001 product shape ratified (Accepted or revised) | full team, Phase 0 | Phase 2+ | `DECISIONS.md` status flip with evidence link |
| G-C | D-002 parity boundary ratified (settles the `spec.md:53` `[assumed]` judge-acceptance marker) | full team, Phase 0 | Phase 5+ source-parity claims | status flip; spec §5.4 marker removed |
| G-D (F-02) | UTF-16-unit vs byte-index convention added to spec §5.3/§9 + corpus schema | architect, pre-Phase 4 | Phase 4/5 | non-ASCII corpus cases green |
| G-E (F-03) | Adapter + oracle-generator mechanism design; spike on 2 suites | architect, Phase 1–3 | Phase 1 gate, Phase 8 | spike report; design section in `docs/differential-testing.md` |
| G-F (F-06) | Budget-exceeded observable mapping + DV-x entry + mini-backtracker spec-or-remove | architect, Phase 5 spike | Phase 5/7/9 | FR-073 amendment; DECISIONS.md entry |
| G-G (F-07) | Re-verify dependency versions/licenses/MSRV and toolchain pin at adoption | implementer, Phase 2 | Phase 2 | updated dependency-evaluation; Cargo.lock |
| G-H | Kickoff test-suite hash manifest (upstream `test/`) | team, Phase 0 | Phase 1 corpus pinning | manifest committed in `knowledge/repo-inventory.md` |
| G-I | Rust toolchain install on dev machine (currently absent) | team, pre-Phase 2 | Phase 2 | `rustc --version` log |
| G-J (F-04/F-05) | Baseline re-green (lint) + re-encode 4 corrupted files | next session, pre-Phase 0 close | Phase 0 "baseline green" gate | `npm run lint` exit 0; byte-scan clean |

## 14. Remediation Order

1. **Blocker:** resolve G-A at kickoff (F-01); re-rate G-01 and reconcile ledger row 3 (F-20) in the same edit.
2. **High-risk architecture/test issues:** write the index-model convention (F-02) and the adapter/oracle mechanism design (F-03) before Phase 1 corpus generation; fix the lint baseline and re-encode the four corrupted files (F-04, F-05) as the first commit of the next session; specify budget-exceeded semantics (F-06) before the Phase 5 engine spike.
3. **Evidence/citation corrections:** dependency/toolchain refresh (F-07), FR/NFR count/range correction (F-08), source-ledger "38 files" fix (F-09), summary overclaim rewording (F-10), schema-example hash fix (F-12), Infinity rule unification (F-13), op-list canonization (F-14), posix-conflict note (F-15), probe artifact transcoding (F-16), option-count wording (F-11).
4. **Medium/low cleanup:** Bug Catcher timing methodology (F-17) at Phase 9; trivial log wording (F-18); verify `regex` version from Cargo.lock (F-19).

## 15. Start Recommendation

- **Phase 0 (governance/kickoff block): GO.** It is exactly the phase designed to close the blocker (G-A) and the D-001/D-002 ratifications, and it requires no port code.
- **Phase 1 (oracle corpus): CONDITIONAL GO** — start only after G-A is closed and the F-03 design narrows the generator scope; the F-12/F-13/F-14 schema hygiene fixes should land in the same session.
- **Phase 2+ (Rust workspace and all port code): NO-GO until** G-A (eligibility) and G-B/G-C (D-001/D-002) are closed, and the Rust toolchain exists (G-I). Event rules independently forbid port code before the 2026-07-31 18:00 UTC kickoff.
- **Prohibited until gates close:** creating `Cargo.toml`/`crates/`, writing any `*.rs`, adopting dependencies, publishing parity claims based on the current spec §5.4 assumption marker, and filing the Bug Catcher comment with the 963 ms figure.
- **Not prohibited:** documentation fixes (F-04/F-05/F-08..F-16 remediation), the F-02/F-03/F-06 design work, and the Phase-0 kickoff checklist.

## 16. Checks and Sources

**Commands (all from `d:\picomatch\picomatch`, Git Bash, 2026-07-31 ~17:47–18:19 IST; exit codes shown):**
`git status --short` (0, empty) · `git branch --show-current` (0, `chirag`) · `git rev-parse HEAD` / `--verify origin/chirag` (0, both `4c27d9abed712d1b2e11530b460058f96cf27ee2`) · `git remote -v` (0) · `git log --oneline --decorate --graph -n 20` (0) · `git show --stat 54c9eb0` / `4c27d9a` (0) · `git merge-base chirag origin/master` (0, `4f41a8ed…`) · `git rev-list --left-right --count origin/master...chirag` (0, `0 2`) · `git diff --name-status/--stat origin/master...chirag` (0) · `git status --porcelain=v1` (0, empty) · `git ls-files` (0; 121 files; 43 md) · `node --version` (v24.13.0) · `npm --version` (11.6.2) · `git --version` (2.53.0.windows.3) · `rustc --version` / `cargo --version` (command not found) · `npm run mocha` (**0**, 1977 passing) · `npm run lint` (**1**, 2 comma-dangle errors in `tools/research/probe-regex-sources.js` 68:43/93:50; log `/tmp/pm-review/lint.log`) · `npm run test:cover` (**0**, coverage table §8) · `node tools/research/probe-regex-sources.js` (0; identical to committed artifact) · `node -e` API/probe one-liners (0; §8) · `timeout 30 node -e` bounded timing probe (0; 5.8/6.4/39.6/164.9 ms) · ID/link/count/traceability Node scripts (0; §9) · mojibake byte scan `grep -l $'\xc3\xa2'` + BOM scan (4 files) · secret-pattern scan (no findings) · `file`/`xxd` on scratch artifacts (UTF-16LE confirmed).

**GitHub (API, this review):** `gauravk16in/picomatch` commits on `chirag` (head `4c27d9a`, parents chain verified) · `micromatch/picomatch` commits on `master` (head `4f41a8ed…`) · issues `#175` (open, 2026-06-09), `#171` (open), `#89` (open).

**Advisories:** github.com/advisories/GHSA-c2c7-rcm5-vvqj (fetched, ReDoS extglob, fixed 4.0.4/3.0.2/2.3.2) · github.com/micromatch/picomatch/security/advisories/GHSA-3v7f-55p6-f55p (fetched, method injection CWE-1321) · api.osv.dev aliases CVE-2026-33671 / CVE-2026-33672 + CVSS vectors.

**Event sources (full-content fetched 2026-07-31):** coderesurrection.com/2026 (official; sections §01–§16 read in extraction; first extraction attempt returned an empty page and was retried with a second extractor) · portmortem.devfolio.co (official Devfolio page) · coderesurrection.com/2026/pool (returns the older Wave-1 "Code Resurrection" page — recorded as legacy content, not used as Port Mortem evidence) · Discord: inaccessible (no credentials).

**Crate/toolchain documentation (fetched):** docs.rs/fancy-regex `struct.RegexBuilder` (`backtrack_limit`, `delegate_size_limit`, …) · docs.rs/fancy-regex `enum.Error` / `enum.RuntimeError` (`BacktrackLimitExceeded`, `StackOverflow`) · docs.rs/fancy-regex index (delegation + exponential warning; `variable-lookbehinds` feature) · docs.rs/regex (no lookaround, O(m·n), MSRV 1.65, MIT/Apache) · crates.io/api/v1/crates/fancy-regex (0.19.0 current; 0.17.0 dated 2025-12-13; MIT; rust_version 1.66) · crates.io/api/v1/crates/picomatch-rs and /satch (provenance metadata) · releases.rs (stable 1.97.1) · crates.io/api/v1/crates/regex (NOT retrieved — rate limit + empty extraction).

**Context7:** resolve-library-id for `fancy-regex` returned only `/rust-lang/regex` (no dedicated entry — limitation recorded; prior session successfully used `/rust-lang/regex`, `/proptest-rs/proptest`, `/bheisler/criterion.rs`, which this review did not need to re-query).

## 17. Confidence and Unreviewed Surface

**Overall confidence: High** for Git/baseline/security/event/architecture evidence (all primary-sourced and reproduced); **Medium** for completeness of external event sub-claims (pool page and Discord remain inaccessible after bounded attempts); **High** for the finding set itself (every finding cites file:line, command+exit, commit, or fetched primary source).

Unreviewed or partially reviewed surface, explicitly:
- Discord #announcements (inaccessible) — kickoff adapter templates, unsafe thresholds, test-hash format, submission portal: NOT VERIFIED (gated at Phase 0).
- Official repo-pool listing: NOT FOUND after bounded attempts (F-01/F-20).
- `regex` crate exact latest version: NOT VERIFIED (F-19).
- Upstream test files beyond the cited/listed reads: not re-read in full by this review (the previous session's selective reads are recorded in its audit §3); the mocha run executed all of them green, which is the load-bearing fact.
- `bench/` execution: not run (deferred by design to Phase 10; setup verified from `bench/package.json`).
- The npm `audit` warning details from `npm install` (dev-only dependency advisories): not re-enumerated; non-load-bearing for the port.
- Unstop/X (aggregator/social) corroboration: not re-fetched; official sources already settle every conflicting claim they carried.
