# Phase 0 Remediation and Phase 1 Readiness

- **Session type:** Phase 0 remediation (no Rust port code, no Phase 1 corpus/oracle implementation).
- **Agent:** Primary agent. No subagents used; every tool call, fetch, edit, check, commit, and push performed personally.
- **Trigger:** `audits/2026-07-31-1819-bootstrap-readiness-review.md` (20 findings: 1 BLOCKER, 2 HIGH, 7 MEDIUM, 7 LOW, 3 INFO).
- **Session date/time:** 2026-07-31, ~19:20–21:45 IST (session ran before the 18:00 UTC kickoff; the official repo pool was already published 2026-07-30 per the event timeline).

## 1. Verdict

**PHASE 1 READY**

Every readiness checklist item passes (§11): eligibility is verified from the official pool page, D-001/D-002 are Accepted with evidence, the test-hash manifest exists and is deterministic, all final baselines are green, the F-02/F-03/F-06 design contracts are normative, encoding/consistency defects are repaired with proof, and no BLOCKER/HIGH finding remains open.

## 2. Repository State

- Branch `chirag`; start HEAD `f8a4863f4cd8e4b5b8b8902a9eed912ddadc0163`; end HEAD `2bba38a4f45e8e3fc8f6d90ea6e8cb318631c7f9` (+ this audit commit on top).
- Remotes unchanged: `origin` → gauravk16in/picomatch; `upstream` → micromatch/picomatch.git.
- Working tree clean at session start; at session end the only untracked file is this audit.
- Commits this session: `a041e94 fix: restore lint and text encodings` (7 files); `2bba38a docs: close bootstrap readiness findings` (34 files, incl. `tests/test-hash-manifest.json`, `tools/research/hash-tests.js`, `tools/research/redos-timing.js`); audit commit (this file).

## 3. Authoritative Kickoff Evidence

- **Eligibility: POOL-LISTED — VERIFIED.** The event site HTML links `https://coderesurrection.com/2026/repo-pool` ("Recommended Repo Pool — Port Mortem", footer version marker `v2026.07`; fetched 2026-07-31 ~19:25 IST via curl with browser UA — the no-UA request returned 0 bytes). The page lists: `micromatch/picomatch | JavaScript → Go,Rust | 2000-2500 | Standard (2k–8k) | MIT | zero-dep bash-style glob matcher`, linking `https://github.com/micromatch/picomatch`.
- Pool facts (same fetch): ~104 repositories across 8 tracks; "This is a recommendation, not a requirement … bring your own public repo, no pre-approval needed … at least 1,000 source lines (and under ~8,000), OSS-licensed, and not already ported to your target language"; "passing the original suite unmodified is the ideal to aim for, not a requirement"; LOC figures are "rough estimates". Earlier ledger sub-claims ("~30 repos", "≥80% coverage", "4h pick window", "off-pool approval") are NOT on the page and are corrected in `knowledge/search-ledger.md` (Corrections section) and `knowledge/source-ledger.md`.
- Because picomatch is pool-listed by the organizers, the BYO-only "not already ported" clause does not apply to this repo choice. The prior-art register (`knowledge/prior-art.md`) now states this explicitly: it is a clean-room control, not an eligibility question.
- Rules re-confirmed: kickoff Jul 31 18:00 UTC / freeze Aug 03 18:00 UTC with test hashing at kickoff; thin adapter against the port's artifact (templates promised); scoring 40/30/20/10; bonuses +5/+5/+3/+3; no pre-kickoff port code (coderesurrection.com/2026 §04–§16, fetched in both sessions).
- **D-001/D-002 evidence:** pool listing (above); event FAQ §16 ("the original repo's tests run against your port's binary/artifact via a thin adapter"); official scoring §09 (no rubric scores regex-source strings); team instruction (this session's assignment) selecting the pure-Rust lib + JSON CLI shape and the behavioral-parity boundary.
- **Test-hash instructions:** no official manifest FORMAT is published pre-kickoff (Discord templates arrive at kickoff). Per the deterministic fallback: `tests/test-hash-manifest.json` built with `tools/research/hash-tests.js` (§7). If Discord mandates a format, the manifest is regenerated — recorded as a non-blocking gate (context.md §7).
- Discord #announcements: inaccessible (no credentials) and pre-kickoff — remains a tracked, non-blocking item (G-02).

## 4. Findings Closure Matrix

| Finding | Original severity | Disposition | Files changed | Validation | Residual gate |
|---|---|---|---|---|---|
| F-01 eligibility/pool | BLOCKER | **CLOSED — VERIFIED** | context.md §1/§5/§7, knowledge/research-gaps.md (G-01), knowledge/search-ledger.md, knowledge/source-ledger.md, knowledge/prior-art.md, docs/submission-checklist.md | pool page fetched; picomatch row quoted above | none for Phase 1 (Discord logistics only, G-02) |
| F-02 UTF-16 index model | HIGH | **CLOSED — DECISION RECORDED** (D-013) | DECISIONS.md (D-013), spec.md §5.3/FR-011/FR-050/051, docs/parser-and-scanner.md, docs/api-compatibility.md, docs/compatibility-matrix.md, ARCHITECTURE.md, plan.md Phase 4, tests/corpus/schema.v1.json (`meta.indexUnits`), docs/differential-testing.md §8 | contract is normative; acceptance cases enumerated (BMP `フォルダ/**/*` mirroring test/api.scan.js:360, astral, boundary-adjacent) | Phase 4/5 implementation proof via non-ASCII corpus replay |
| F-03 oracle/adapter mechanism | HIGH | **CLOSED — DECISION RECORDED** (D-006 amendment) | docs/differential-testing.md (§1, §10, §11), plan.md Phase 1/2/3/8, DECISIONS.md, ARCHITECTURE.md §6 | "loses zero fidelity" claim removed (sweep-verified); oracle generator specified per-op; adapter mechanics named (require-interception map, facade surface, sync-IPC candidates, error/assert mapping, lifecycle); spike gated on 2 named suites | Phase 2/3 adapter-spike execution gate |
| F-04 lint red | MEDIUM | **CLOSED — VERIFIED** | tools/research/probe-regex-sources.js | final `npm run lint` exit 0 on final checkout; probe output semantically identical (62 keys) | none |
| F-05 double-encoded files | MEDIUM | **CLOSED — VERIFIED** | DECISIONS.md, knowledge/search-ledger.md, knowledge/source-ledger.md, knowledge/prior-art.md | per-file CP1252 round-trip proof (script); byte scan: no BOM, no mojibake, no CR; visual check (— § → × ≥ render) | none |
| F-06 budget-exceeded semantics | MEDIUM | **CLOSED — DECISION RECORDED** (D-003 amendment) | DECISIONS.md, spec.md FR-073/NFR-004, ARCHITECTURE.md, docs/rust-design-options.md, docs/security.md, docs/fuzzing.md, docs/compatibility-matrix.md (DV-6), tests/corpus/schema.v1.json (`limitNote`) | fancy-regex default `backtrack_limit` 1_000_000 verified from crate source; typed `ResourceLimitError` mapping + EXPECTED_LIMIT classification defined; mini-backtracker removed from plan | Phase 5/7 engine implementation + Phase 9 budget-trip test |
| F-07 stale versions | MEDIUM | **CLOSED — VERIFIED** | knowledge/dependency-evaluation.md, DECISIONS.md (D-012), docs/licensing.md, docs/build-and-ci.md, docs/rust-design-options.md, spec.md NFR-030, knowledge/source-ledger.md | crates.io API: fancy-regex 0.19.0 (MIT, rust_version 1.66), regex 1.13.1 (MIT/Apache, rust_version 1.65); releases.rs: stable 1.97.1; candidate≠locked rule recorded | Phase 2 adoption re-verification + Cargo.lock |
| F-08 FR/NFR counts | MEDIUM | **CLOSED — VERIFIED** | spec.md §20, implementation.md, plan.md Phase 1 | scripted recount: 60 FR / 22 NFR; wording "60 defined IDs, gaps reserved" | none |
| F-09 prior-audit reliability | MEDIUM | **CLOSED — VERIFIED** | knowledge/source-ledger.md (count now proven by manifest), audits/README.md (index + supersession note + "re-run closure validation" rule) | `grep "38 files" knowledge/` → only the corrected, proven form; manifest proves 38 files = 37 .js + .eslintrc.json | none |
| F-10 "entire contract" overclaim | MEDIUM | **CLOSED — VERIFIED** | implementation.md (accurate wording), plan.md Phase 1 (execution-capture is Phase 1) | repo-wide sweep: no "entire observable contract" instance outside immutable audits/Prompts | none |
| F-11 option counts | LOW | **CLOSED — VERIFIED** | knowledge/options-matrix.md (canonical sentence), spec.md §3/§8, knowledge/README.md, plan.md Phase 3 | scripted recount: 33 main rows (31+2 aliases), 7 scan rows (4+3 shared) | none |
| F-12 schema example hash | LOW | **CLOSED — VERIFIED** | docs/differential-testing.md §3 | example now 40-hex; regex-tested against schema pattern | none |
| F-13 Infinity rule | LOW | **CLOSED — VERIFIED** | knowledge/test-inventory.md | single canonical `{"__inf__":true}`; sweep finds no string-sentinel | none |
| F-14 op enum drift | LOW | **CLOSED — VERIFIED** | ARCHITECTURE.md, plan.md Phase 1 | schema is sole owner of the 10-op enum; summaries reference it | none |
| F-15 posix default conflict | LOW | **CLOSED — VERIFIED** | knowledge/options-matrix.md, spec.md §5.2, docs/compatibility-matrix.md | conflict registered in all three homes; default-posix corpus case planned (Phase 1) | Phase 1 case generation |
| F-16 UTF-16 artifacts | LOW | **CLOSED — VERIFIED** | scratch/probe-regex-sources.json, scratch/git-log.txt | `file` → JSON text / ASCII text; `JSON.parse` ok; no BOM/CR | none |
| F-17 963 ms timing | LOW | **DEFERRED — NON-BLOCKING, phase gate specified** | tools/research/redos-timing.js (new), docs/security.md, docs/benchmarking.md, DECISIONS.md D-011 evidence | bounded harness medians recorded (147.6 ms @ len 71, spread 135–176, super-linear curve); single-point claim withdrawn | Phase 9: extended measurement under worker-thread timeout before any upstream comment |
| F-18 "43 files" wording | INFO | **CLOSED — VERIFIED** | implementation.md (new log entry uses Git-proven wording: 44 changed paths in 54c9eb0, 34 in remediation commit) | `git show --stat` cross-check | none |
| F-19 tool limitations / regex version | INFO | **CLOSED — VERIFIED** | knowledge/dependency-evaluation.md, knowledge/source-ledger.md | regex latest = 1.13.1 verified (crates.io API with UA; earlier curl block bypassed); Context7 fancy-regex absence remains a recorded neutral limitation | none |
| F-20 event-content drift | INFO | **CLOSED — VERIFIED** | knowledge/search-ledger.md (Corrections), knowledge/source-ledger.md | pool page fetched with access date; stale snapshot claims marked superseded, not rewritten | none |

## 5. Decisions Recorded

- **D-001 — Accepted (2026-07-31):** pure Rust library + JSON-protocol CLI; N-API/WASM stretch only. Evidence: pool listing, event FAQ thin-adapter model, team instruction.
- **D-002 — Accepted (2026-07-31):** behavioral parity MUST; regex-source parity per-case STRETCH with normalization. Evidence: official rubric scores behavior, not source strings.
- **D-003 — Accepted with budget-semantics amendment (2026-07-31):** regex primary + fancy-regex fallback under explicit `backtrack_limit` (candidate 1,000,000 = crate default); budget trip ⇒ typed `PicomatchError::ResourceLimit` / CLI `{"errorClass":"ResourceLimitError","kind":...}`; divergence **DV-6**; corpus `EXPECTED_LIMIT` classification; mini-backtracker removed from committed plan (bounded spec as new ADR only if Phase 7 evidence demands).
- **D-006 — Amended (2026-07-31):** three-artifact separation (public-API oracle generator / replay runner / mocha thin adapter); no arbitrary-Mocha-assertion extraction; adapter spike Phase 2/3.
- **D-012 — Accepted (2026-07-31):** pin Rust 1.97.1 (current stable); nightly only for fuzz/Miri.
- **D-013 — Accepted (new, 2026-07-31):** all externally observable scan/parse positions are UTF-16 code-unit offsets; internals iterate scalar values with a cumulative unit counter; conversions centralized; unpaired surrogates → U+FFFD at protocol ingestion (never in corpus); corpus `meta.indexUnits: "utf16_code_unit"`.
- Remaining Proposed: **D-004** only (transliteration strategy; Phase 5 validation gate — by design).
- Divergences on record: DV-1..DV-5 (bootstrap) + **DV-6** (budget-trip typed error).

## 6. Documentation and Encoding Repairs

- **Encoding (F-05):** 4 files reversed from CP1252 double-encoding to UTF-8 (no BOM, LF) with a per-file round-trip proof (re-corrupting the repaired text reproduces the corrupted bytes exactly). Backups held outside the repo. Post-repair byte scan: no BOM, no mojibake markers, no CR.
- **Artifacts (F-16):** `scratch/probe-regex-sources.json` regenerated via the harness (UTF-8, `file`: "JSON text data", parses, 62 keys, semantically identical to pre-fix); `scratch/git-log.txt` regenerated via `git log --oneline -30 4f41a8e` (ASCII).
- **Counts (F-08/F-11):** FR 60 / NFR 22 (scripted, gaps documented); options 33 main (31+2) / 7 scan (4+3) (scripted).
- **Schema/examples (F-12/F-13/F-14):** 40-hex example (pattern-validated); single Infinity rule; schema-owned 10-op enum.
- **Terminology:** remaining mentions of old versions/wording are either historical log entries (implementation.md/search-ledger, intentionally preserved) or correction contexts; sweep confirms no live stale claim (§8).
- **Links:** 0 broken relative links across all markdown (2 intentional upstream web-relative links).

## 7. Test Hash Manifest

- **Path:** `tests/test-hash-manifest.json` (aggregate SHA-256 `cc5a06a6f38b7353c75835448e09422a1b41527206f036e50d1277c2c35082cd`).
- **Scope:** entire upstream `test/` tree — 38 files (37 `.js` incl. `support/match.js` + `.eslintrc.json`); no exclusions. The file count also corrected the historical 36/38 confusion with a machine-proven count.
- **Generator:** `tools/research/hash-tests.js` (team-owned, disposable): sorted POSIX relative paths, sha256 per file, aggregate over `hash␣␣path\n` lines, oracle commit `4f41a8edade7a5ab19832f7b40ecce46b288767f`, no timestamps (deterministic by construction).
- **Reproducibility:** two consecutive runs produced byte-identical output (file sha256 `32cba7ac…` twice).
- **Fallback note:** if kickoff Discord mandates an official hash format, regenerate in that format and record both (context.md §7).

## 8. Checks Run

All from `d:\picomatch\picomatch` (Git Bash, Node v24.13.0, npm 11.6.2, git 2.53.0.windows.3, Windows 11, 2026-07-31 19:20–21:45 IST):

| Check | Exit | Result |
|---|---|---|
| `npm run lint` (before) | 1 | F-04 reproduced (68:43/93:50 comma-dangle) |
| encoding repair script (CP1252 round-trip) | 0 | 4 files FIXED, proof OK, 0 residual markers |
| `npm run lint` (after) | 0 | clean |
| `npm run mocha` (after) | 0 | 1977 passing (251–254 ms) |
| `npm run test:cover` (after) | 0 | 1977 passing; 93.2/89.81/91.66/93.75 (identical fractions) |
| `node tools/research/probe-regex-sources.js` | 0 | output semantically identical to committed artifact (62 keys) |
| `node tools/research/redos-timing.js` | 0 | medians 0.1/0.7/4.9/13.5/34.4/88.6/147.6 ms @ n=20–35 |
| `node tools/research/hash-tests.js` ×2 | 0 | byte-identical manifest (38 files) |
| consistency sweep (stale wording, BOM/mojibake, assumed markers, links, counts, schema/example pattern, ADR statuses, upstream diff, rust-file absence) | 0 | clean except intentional historical/correction mentions (listed §6) |
| `git diff --check` | 0 | no whitespace errors |
| `git diff --name-only origin/master -- index.js posix.js lib test bench examples` | 0 | empty (upstream preserved) |
| crates.io API (regex, fancy-regex, picomatch-rs, satch) + releases.rs + fancy-regex lib.rs + event site + pool page fetches | 0 | facts in §3/§5/§7 |

## 9. Upstream Preservation

`git diff --name-only origin/master -- index.js posix.js lib test bench examples` → **empty** at every checkpoint this session. The oracle tree (source, tests, bench, examples) is byte-identical to the pinned commit; the only upstream-file change on the branch remains the additive `.gitignore` (bootstrap). Team-owned additions are confined to governance/docs/knowledge/audits/tests(`test-hash-manifest.json`, `corpus/schema.v1.json`)/tools/scratch. No production Rust code exists (no `Cargo.toml`, no `*.rs` tracked).

## 10. Remaining Non-Blocking Future Gates

| Gate | When | Why non-blocking for Phase 1 |
|---|---|---|
| Discord #announcements (adapter templates, unsafe thresholds, official hash FORMAT, submission portal) | kickoff (G-02) | Phase 1 corpus generation needs none of them; manifest regenerable if a format is mandated |
| F-02 implementation proof (non-ASCII corpus replay) | Phase 4/5 | contract is normative now (D-013); Phase 1 only generates the cases |
| Adapter-spike execution (2 suites through hook+facade) | Phase 2/3 | design is executable; Phase 1 is the corpus, not the adapter |
| F-06 budget-trip behavior test | Phase 5/7/9 | semantics decided; engine doesn't exist yet |
| Dependency adoption re-verification + Cargo.lock | Phase 2 | candidates verified current 2026-07-31; nothing locked yet |
| Rust toolchain install (G-13) | Phase 2 prep | Phase 1 is Node-only tooling |
| F-17 extended measurement under worker timeout | Phase 9 | bounded protocol + medians already recorded; no Phase 1 dependency |
| D-004 validation (transliteration strategy) | Phase 5 spike | only remaining Proposed ADR, by design |

## 11. Phase 1 Start Gate

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | F-01 eligibility verified from authoritative kickoff evidence | PASS | §3 pool-page quote |
| 2 | D-001/D-002 Accepted with evidence | PASS | DECISIONS.md ratification notes |
| 3 | Phase 0 test-hash manifest generated and reproducible | PASS | §7 double-run byte-identical |
| 4 | Final `npm run lint` exit 0 | PASS | §8 |
| 5 | Final `npm run mocha` exit 0, accurate count | PASS | 1977 passing |
| 6 | Final `npm run test:cover` exit 0, results recorded | PASS | §8 fractions |
| 7 | F-02 UTF-16 contract normative + in schema/design | PASS | D-013; spec §5.3; schema `indexUnits` |
| 8 | F-03 oracle design executable; overclaim removed; adapter spike scheduled with mechanics + gates | PASS | differential-testing §10–§11; plan Phase 2/3 |
| 9 | F-05/F-16 encoding checks pass | PASS | §6 byte/visual scans |
| 10 | F-06 budget behavior decided and testable | PASS | D-003 amendment; FR-073; DV-6; EXPECTED_LIMIT |
| 11 | F-08/F-11 counts script-verified and consistent | PASS | §8 sweep recounts |
| 12 | F-12/F-13/F-14 schema/example/normalization/op-list checks pass | PASS | §6/§8 |
| 13 | F-15 conflict registered with planned oracle case | PASS | options-matrix/spec §5.2/compat-matrix; Phase 1 case list |
| 14 | Load-bearing Phase 1 claims contain no assumptions | PASS | G-01/G-04/G-14 closed; remaining `[assumed]` markers are non-load-bearing phase-gated items (G-09 Phase 8, G-10 Phase 9, G-18 Phase 11) |
| 15 | No BLOCKER/HIGH finding remains open for Phase 1 | PASS | §4 matrix |
| 16 | Upstream source/test diff empty | PASS | §9 |
| 17 | No production Rust code added | PASS | §9 |
| 18 | Remediation audit complete | PASS | this file |
| 19 | `implementation.md` names one Phase 1 next action | PASS | its "Next exact action" |

**Phase 0 completion:** all plan.md Phase 0 "Done when" criteria are observably true (D-001/D-002 Accepted with evidence; test-hash manifest committed; baseline green recorded). plan.md Phase 0 marked `[x]` with the completion evidence and the Discord residual noted.

## 12. Exact Next Action

**One assignment for the next session: Phase 1 public-API oracle/corpus implementation.** Build `tools/oracle/` per-op generators per `docs/differential-testing.md` §10 (public API + `lib/scan` only; named-function registry; `events` records; D-013 non-ASCII index cases; EXPECTED_LIMIT demonstrations), emit `tests/corpus/v1/*.jsonl` + `v1.manifest.json`, and prove: schema validation 100%, oracle self-replay 100%, byte-identical regeneration, with per-suite case counts recorded in `implementation.md`. No Rust code in Phase 1. (Parallel prep allowed: install Rust toolchain for Phase 2, G-13; read Discord at kickoff, context.md §7.)
