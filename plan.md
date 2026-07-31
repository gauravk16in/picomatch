# plan.md — Execution Plan (12 phases)

Read fourth. Dependency-driven; every phase starts with failing/characterization tests and leaves the repo green. No time estimates — order is by dependency, risk, and judging impact. Gate rule: a phase is complete only when its "Done when" is observably true and `implementation.md` is updated.

- [x] Phase 0: Confirm rules, baseline, license, and scope gate — **COMPLETE 2026-07-31 (see audits/2026-07-31-1935-phase0-remediation.md §11)**
  - Objective: Ratify team assumptions before any production code; capture kickoff artifacts.
  - Inputs and required reading: CLAUDE.md, context.md, spec.md §1–5, knowledge/research-gaps.md (G-01..G-04, G-16), knowledge/prior-art.md.
  - Steps: (1) team reads Discord #announcements at kickoff; record adapter templates, unsafe thresholds, test-hash manifest in context.md §7; (2) ratify D-001 product shape and D-002 parity boundary (edit DECISIONS.md status → Accepted or revise); (3) record kickoff test-suite hash of upstream `test/` (sha256 per file + manifest) in knowledge/repo-inventory.md; (4) confirm LICENSE/attribution plan; (5) freeze this plan or amend via DECISIONS.md.
  - Tests/checks to write first: none (governance phase); verify baseline commands still green: `npm run mocha`, `npm run lint`.
  - Commands to run: `git status; git log -1 --format='%H %s'; npm run mocha; node tools/research/hash-tests.js` (create under tools/research, disposable).
  - Deliverables: updated context.md §7, ratified DECISIONS.md D-001/D-002, test-hash manifest.
  - Covers: governance for all FR/NFR; NFR-050.
  - References: spec §1–5, docs/licensing.md, docs/submission-checklist.md.
  - Risks and fallback: Discord template contradicts D-001 → fallback is CLI adapter (already default); pool-listing mismatch → record, keep repo (already cloned per team fact).
  - Done when: D-001/D-002 are `Accepted` with evidence links; test-hash manifest committed; baseline green recorded in implementation.md.
  - **Completion evidence (2026-07-31):** eligibility VERIFIED pool-listed (`https://coderesurrection.com/2026/repo-pool`); D-001/D-002/D-003/D-012/D-013 Accepted with evidence; `tests/test-hash-manifest.json` committed (38 files, aggregate `cc5a06a6f38b7353c75835448e09422a1b41527206f036e50d1277c2c35082cd`, deterministic double-run); baseline re-green after F-04 fix (lint 0 / mocha 1977 / cover 93.2-89.81-91.66-93.75). Residual (non-blocking): Discord #announcements items at kickoff (adapter templates, unsafe thresholds, test-hash FORMAT, submission portal) — if the mandated hash format differs, regenerate the manifest per official format before Phase 8 submission checks.

- [ ] Phase 1: Freeze the behavioral oracle and compatibility inventory
  - Objective: Produce the pinned JSONL corpus + oracle runner that defines correctness for all later phases.
  - Inputs and required reading: spec §5, §20; knowledge/test-inventory.md; docs/differential-testing.md §10 (oracle design); scratch/probe-regex-sources.json.
  - Steps: (1) build `tools/oracle/` per-op generator modules (dev-only) that call the original PUBLIC API (`index.js`, `posix.js`, and `lib/scan` for scan ops) with purpose-built case lists mirroring the 37-suite mapping in knowledge/test-inventory.md — **no mechanical extraction of arbitrary Mocha assertions** (D-006 amendment); (2) add options/edge matrices not covered by suites (options-matrix interactions, FR-090 edges, D-013 non-ASCII index cases, EXPECTED_LIMIT demonstrations); (3) record per-case engine-relevant fields (source when compareSource) and `meta.indexUnits`; (4) write corpus SHA-256 manifest; (5) verify corpus self-replays green against the JS oracle; (6) validate every record against `tests/corpus/schema.v1.json`.
  - Tests/checks to write first: corpus schema validator; self-replay check (oracle vs corpus = 100%); determinism check (double generation is byte-identical).
  - Commands to run: `node tools/oracle/generate-corpus.js --out tests/corpus/v1 --manifest tests/corpus/v1/v1.manifest.json; node tools/oracle/replay.js --corpus tests/corpus/v1`.
  - Deliverables: `tests/corpus/v1/*.jsonl`, `tests/corpus/v1/v1.manifest.json` (SHA-256 + aggregate), `tests/corpus/v1/coverage.json` (quantified coverage per docs/differential-testing.md §10 coverage standard), named-function library (`tools/oracle/named-fns.js`), replay report.
  - Covers: NFR-020, NFR-021; foundation for FR-001..091 (60 defined IDs, gaps reserved); G-05/G-06/G-11/G-12 verification.
  - References: spec §5.3, docs/differential-testing.md §3/§10, knowledge/test-inventory.md.
  - Risks and fallback: per-suite case lists miss an assertion family → the Phase 2/3 adapter spike (Phase 8 completion) exposes it as named adapter failures, which are then back-added as corpus cases; self-replay proves consistency, not coverage (coverage evidence = `coverage.json` dimensions + Phase 8 adapter run).
  - Done when: manifest committed; oracle self-replay 100%; schema validation 100%; determinism proven; `coverage.json` shows every dimension at 100% or named/reasoned exclusions; counts recorded in implementation.md.

- [ ] Phase 2: Create Rust workspace, walking skeleton, and one-command task runner
  - Objective: End-to-end thin slice: library crate + CLI that answers one corpus case (`*.js` match) via the real engine path.
  - Inputs and required reading: spec §17, docs/build-and-ci.md, knowledge/dependency-evaluation.md (G-13/G-14), ARCHITECTURE.md.
  - Steps: (1) `rust-toolchain.toml` (1.97.1, D-012); (2) workspace: `crates/picomatch` (lib, `#![forbid(unsafe_code)]`), `crates/picomatch-cli` (JSON stdin/stdout protocol per docs/differential-testing.md §5); (3) implement literal-pattern + `*` fastpath only, behind corpus runner; (4) CI skeleton (fmt, clippy -D warnings, test) on ubuntu/windows/macos; (5) Dockerfile one-command build+test; (6) START the named **adapter-spike**: build `test/adapter/hook.js` (require interception per docs/differential-testing.md §11) and choose the synchronous IPC mechanism (per-call `spawnSync` vs persistent child + `Atomics.wait`), proving one facade call end-to-end against the CLI thin slice.
  - Tests/checks to write first: characterization test: CLI answers `{"op":"match","pattern":"*.js","input":"a.js"}` → `{"isMatch":true,"output":"a.js"}`; failing until implemented.
  - Commands to run: `cargo build --release; cargo test; cargo clippy -- -D warnings; cargo fmt --check`.
  - Deliverables: workspace, CLI protocol v0, CI green on 3 OSes, Dockerfile.
  - Covers: NFR-030..033, NFR-003 (forbid unsafe), thin slice of FR-021/FR-037.
  - References: spec §17, docs/build-and-ci.md, ARCHITECTURE.md.
  - Risks and fallback: regex 1.12.x MSRV > 1.95 → pin older regex or raise toolchain (G-14); Windows dev lacks cargo-fuzz — fuzz deferred to Linux CI (by design).
  - Done when: fresh clone → `cargo build --release && cargo test` green on clean machine/VM; thin-slice corpus case passes.

- [ ] Phase 3: Define public Rust types, normalized results, and error model
  - Objective: Lock the API types and error taxonomy that every later phase uses.
  - Inputs and required reading: spec §5.3, §6 (FR-001..018), §13; docs/api-compatibility.md.
  - Steps: (1) `Options` struct covering the canonical options set (33 main rows incl. aliases + 7 scan rows per knowledge/options-matrix.md; serde for CLI); named-function registry (format/expandRange/callbacks); (2) `PicomatchError::{TypeError, SyntaxError, ResourceLimit}` with exact message strings; (3) normalized result/event types shared by lib and CLI; (4) `Matcher` type with `is_match`, `match_object`, `state` accessors.
  - Tests/checks to write first: error-message unit tests against FR-018 table (from corpus error ops); options default tests; **adapter-spike gate**: `test/api.scan.js` and `test/options.onMatch.js` running unmodified through the hook + facade (against the thin-slice CLI this will mostly fail — the gate is that the MECHANISM works: interception, facade calls, deep-equality transport, callbacks).
  - Commands to run: `cargo test -p picomatch types errors options; node test/adapter/run-mocha.js --suites api.scan,options.onMatch --report artifacts/adapter-spike.json`.
  - Deliverables: `src/options.rs`, `src/error.rs`, `src/result.rs`, registry, docs/api-compatibility.md updated with type mapping, **adapter-spike report** (`artifacts/adapter-spike.json` + mechanism decision recorded in implementation.md).
  - Covers: FR-001, 004, 008, 014, 015, 018, 040; NFR-020 (schema alignment).
  - References: spec §5.3, §6, §8, §13, docs/api-compatibility.md.
  - Risks and fallback: function-valued options can't be generic → named registry only (corpus already uses it); JS `undefined` vs absent → Option<T> + explicit absent semantics per §5.3. Adapter-spike fallback: if synchronous IPC cannot preserve API semantics, fall back to per-suite custom drivers (docs/differential-testing.md §11 fallback).
  - Done when: error corpus cases pass; options round-trip through CLI JSON; no public type changes needed by Phase 4 spike; **adapter-spike gate passed on both spike suites (mechanism proven) or fallback invoked with a recorded reason**.

- [ ] Phase 4: Port the scanner with characterization and differential tests
  - Objective: Full `scan()` parity including tokens/parts/maxDepth and scan options.
  - Inputs and required reading: spec §9 (FR-050..053), lib/scan.js, test/api.scan.js, docs/parser-and-scanner.md.
  - Steps: (1) port scan state machine 1:1 (char-code loop, brace/bracket/extglob/paren handling, negation, base/glob split); (2) tokens/parts/slashes/maxDepth with Infinity sentinel; (3) unescape + noext/noparen/nonegate/scanToEnd options; (4) differential runner over corpus scan ops.
  - Tests/checks to write first: replay corpus op=`scan` (must fail until port complete); unit tests for issue #58 `/` quirk and escaped braces.
  - Commands to run: `cargo test -p picomatch scan; cargo run -p picomatch-cli -- replay --corpus tests/corpus/v1 --op scan`.
  - Deliverables: `src/scan.rs`, scan differential report 100%, docs/parser-and-scanner.md updated.
  - Covers: FR-050..053; NFR-021.
  - References: spec §9, docs/parser-and-scanner.md, lib/scan.js.
  - Risks and fallback: JS index arithmetic on UTF-16 code units vs Rust UTF-8 — governed by the ratified D-013 contract: observable positions are UTF-16-unit offsets produced from a cumulative unit counter (ASCII fast path identical), conversions centralized in `src/text.rs`; D-013 non-ASCII corpus cases (BMP + astral) are the acceptance proof.
  - Done when: scan corpus replay 100% P0 on linux+windows incl. the D-013 non-ASCII cases; no panics under `cargo test` with malformed-input suite.

- [ ] Phase 5: Port parser/IR for literals, wildcards, separators, dot rules, and fast paths
  - Objective: parse() core without brackets/braces/extglobs: text, `*`, `?`, `**`, slashes, dots, quotes, escaping, negation, fastpaths, REPLACEMENTS, maxLength.
  - Inputs and required reading: spec §7 (FR-020..023, 028..031, 033, 035, 037..039), §10 (FR-060..063), lib/parse.js (main loop), docs/parser-and-scanner.md.
  - Steps: (1) token model + state (FR-060/061) with backtrack rebuild; (2) main-loop port for the in-scope token classes; (3) fastpaths table + `*.ext` recursion; (4) negation + wrapOutput/compileRe assembly; (5) engine selection (regex vs fallback) v1 with the dot-guard lookaheads routed to fallback; (6) differential replay of the in-scope corpus slice.
  - Tests/checks to write first: corpus replay for stars/qmarks/globstars/dotfiles/slashes/negation/non-globs/fastpath ops; makeRe source-pinning tests for the no-lookahead subset.
  - Commands to run: `cargo test -p picomatch parse; cargo run -p picomatch-cli -- replay --corpus tests/corpus/v1 --op makeRe --op match --op parse`.
  - Deliverables: `src/parse.rs`, `src/compile.rs`, `src/engine/{regex_engine.rs,fallback.rs}` v1, slice report.
  - Covers: FR-013..015, 020..023, 028..031, 033, 037..039, 060..063, 070..072, 080; NFR-001.
  - References: spec §7, §10, §11, docs/parser-and-scanner.md, docs/rust-design-options.md.
  - Risks and fallback: globstar context rules (FR-023 six forms) are the highest-risk port region — mitigate by pinning all six probe sources + every globstars.js case before coding; fallback: transliterate exactly, optimize never.
  - Done when: in-scope corpus slices replay 100% P0; `**/z*` family from api.picomatch.js passes; clippy clean.

- [ ] Phase 6: Add brackets, POSIX classes, braces/ranges, quoting, and escaping
  - Objective: Complete the character-class and grouping layer.
  - Inputs and required reading: spec FR-024, 025, 034, 065; lib/parse.js bracket/brace sections; test/brackets.js, test/posix-classes.js, test/braces.js, test/options.expandRange.js.
  - Steps: (1) bracket state machine incl. posix class expansion + literal-`]`/`-` edge rules; (2) literalBrackets tri-state and nobracket; (3) braces: comma alternation, dots ranges via default + custom expandRange registry, literal fallback, nesting; (4) strictBrackets errors; (5) quote/keepQuotes; (6) replay slice.
  - Tests/checks to write first: corpus replays for brackets/posix-classes/braces/expandRange/special-characters slices + strictBrackets error ops.
  - Commands to run: `cargo test -p picomatch brackets braces; cargo run -p picomatch-cli -- replay --corpus tests/corpus/v1 --suites brackets,posix-classes,braces,options.expandRange,special-characters`.
  - Deliverables: bracket/brace modules in `src/parse.rs` (or `src/parse/{bracket.rs,brace.rs}`), slice report 100%.
  - Covers: FR-024, 025, 034 (capture in classes), 065, 090 (malformed delimiters), 091; NFR-005.
  - References: spec §7, §10, docs/glob-semantics.md, docs/parser-and-scanner.md.
  - Risks and fallback: expandRange sort semantics are JS-locale-free but string-sort (code-unit) — port as byte-wise sort on UTF-8 (identical for ASCII corpus); prove with `{1..3}`/`{a..z}` + reversed inputs.
  - Done when: slice replays 100% P0; malicious.js length/prototype cases pass.

- [ ] Phase 7: Add globstars-in-context, extglobs, negation, ignore behavior, captures, and option interactions
  - Objective: The hard 20%: extglob open/close incl. risky-extglob safeguard, expression-after-close, negate extglob state, ignore pipeline, capture arrays, full option-interaction matrix.
  - Inputs and required reading: spec FR-005, 006, 026, 027, 032, 034, 041, 064; lib/parse.js extglob machinery + analyzeRepeatedExtglob; test/extglobs*.js, test/options.maxExtglobRecursion.js, test/options.ignore.js, test/options.onMatch.js; docs/security.md.
  - Steps: (1) extglobOpen/extglobClose with conditions/inner tracking; (2) negate-extglob close variants (eos/paren-run/expression-after-close with re-parse); (3) analyzeRepeatedExtglob 1:1 + buildCharClassStar; (4) ignore matcher pipeline + callback sequences; (5) capture mode end-to-end; (6) interactions replay (options-matrix §interactions).
  - Tests/checks to write first: options.maxExtglobRecursion corpus + source pins (must literalize/rewrite exactly); extglobs-temp regression cases (#83/#93); callback-order JSONL assertions.
  - Commands to run: `cargo test -p picomatch extglob; cargo run -p picomatch-cli -- replay --corpus tests/corpus/v1 --suites extglobs,extglobs-bash,extglobs-minimatch,extglobs-temp,options.maxExtglobRecursion,options.ignore,options.onMatch`.
  - Deliverables: extglob module, safeguard module, interactions report 100%, docs/security.md updated with safeguard parity table.
  - Covers: FR-005, 006, 026, 027, 032, 034, 041, 064; NFR-002, NFR-004; G-07/G-08.
  - References: spec §7, §10, §11, docs/security.md, docs/rust-design-options.md.
  - Risks and fallback: negate-extglob close has four context-sensitive forms — pin all from probes before coding; fallback engine (fancy-regex) covers `^(?!...).*$` and `(?:(?!X))STAR` under the ratified D-003 budget semantics (typed `ResourceLimitError` on budget trip, DV-6); if fancy-regex parity fails on a construct, the D-003 reversal trigger fires — a bounded mini-backtracker spec is written as a NEW ADR before any implementation (no prose-only contingency).
  - Done when: extglob suites + safeguard suites replay 100% P0; `+(ab|abab)` behavior matches oracle (NOT literalized — G-08) and is documented.

- [ ] Phase 8: Complete public API/helper parity and platform behavior
  - Objective: picomatch() factory (string/array/state), matcher rich objects, test/matchBase/isMatch, both entry modes, full upstream adapter run.
  - Inputs and required reading: spec §6, §12, §17; docs/api-compatibility.md, docs/build-and-ci.md; knowledge/test-inventory.md.
  - Steps: (1) factory + array matcher + state path; (2) result-object assembly + normalization for adapter; (3) index/posix constructor split with OS detection; (4) windows basename/format paths; (5) mocha thin adapter: original `test/*.js` executed against CLI (JSON protocol) with per-file parity report; (6) parity report generator (NFR-040).
  - Tests/checks to write first: adapter smoke (api.picomatch.js + api.posix.js) before full run; matchBase windows cases (4.0.5 regression trio).
  - Commands to run: `cargo test; node test/adapter/run-mocha.js --report artifacts/parity-report.json`.
  - Deliverables: `src/lib.rs` public API, adapter, parity report (target: 1977/1977; any gap named with owner + spec link), docs/compatibility-matrix.md final.
  - Covers: FR-001..018, 030..032, 080..082; NFR-040; G-04/G-09.
  - References: spec §6, §12, §20, docs/api-compatibility.md, docs/build-and-ci.md.
  - Risks and fallback: adapter fidelity (mocha hooks) → fallback: file-by-file custom drivers for the 36 suite files (37 `.js` incl. `test/support/match.js`; mechanical, already mapped in test-inventory).
  - Done when: original suite passes against the artifact (unmodified files) OR every failure has a named divergence in docs/compatibility-matrix.md with DECISIONS.md entry.

- [ ] Phase 9: Harden with property tests, differential fuzzing, panic/resource/security tests
  - Objective: Prove robustness beyond the suite: proptest grammar, cargo-fuzz (Linux CI), adversarial/resource matrix, unsafe/Miri verification.
  - Inputs and required reading: spec §14, §16; docs/fuzzing.md, docs/security.md, docs/differential-testing.md; knowledge/dependency-evaluation.md.
  - Steps: (1) pattern-grammar proptests (valid + malformed) differential vs oracle JSONL batches; (2) cargo-fuzz targets: `fuzz_scan`, `fuzz_parse`, `fuzz_match` (structure-aware via arbitrary); corpus seeds from upstream suite + malicious set; (3) 60s+ zero-divergence fuzz run → fuzz/log.txt; (4) adversarial bench: long patterns, deep nesting, `+(ab|abab)` class (document, do not "fix" — G-08), huge inputs; backtrack-budget proof for the fallback engine incl. `EXPECTED_LIMIT` classification (D-003/DV-6); (5) `cargo +nightly miri test` if any unsafe exists (target: none); (6) RustSec `cargo audit`.
  - Tests/checks to write first: panic-freedom property (no input can panic); backtrack-budget test proving the typed `ResourceLimitError` outcome on trip; seed corpus committed.
  - Commands to run: `cargo test -p proptest-suite; cargo +nightly fuzz run fuzz_parse -- -max_total_time=60; cargo audit`.
  - Deliverables: proptest-regressions committed, fuzz/log.txt (zero divergence), security matrix filled in docs/security.md, audit report.
  - Covers: NFR-001..006, NFR-020..024; FR-073, 074; G-08/G-10/G-15.
  - References: spec §14, §16, docs/fuzzing.md, docs/security.md.
  - Risks and fallback: fuzz infra on Windows → Linux CI only (documented); divergence found → triage per docs/differential-testing.md §7 (oracle wins unless documented bug; bug candidates feed Bug Catcher report, e.g. issue #175 follow-up).
  - Done when: 60s zero-divergence log committed; proptest clean with committed regressions; no unsafe or Miri-clean; cargo audit clean.

- [ ] Phase 10: Optimize only after baselines; produce reproducible benchmark report
  - Objective: Measure, then optimize only measured blockers; deliver the honest benchmark report.
  - Inputs and required reading: spec §15, §18; docs/benchmarking.md; upstream bench/index.js.
  - Steps: (1) JS baseline on shared workload (upstream bench + our corpus): makeRe compile, cold one-shot, cached repeated match (hit+miss), adversarial; record p50/p99/RSS/startup + environment; (2) Rust criterion benches mirroring the same workloads; (3) optimize ONLY if a measured ratio is worse than the NFR-010 band, prioritizing compile path (fastpaths, allocation) — never semantics; (4) publish bench/methodology.md + bench/results.json (distributions, hardware, toolchain, commands).
  - Tests/checks to write first: bench smoke test (benches run in `--test` mode in CI); regression threshold alarm vs Phase 8 parity report time.
  - Commands to run: `node bench/index.js --run makeRe; cargo bench -- --save-baseline v1; cargo bench -- --baseline v1`.
  - Deliverables: bench/methodology.md, bench/results.json, optimization changelog (if any) with before/after numbers.
  - Covers: NFR-010..012, NFR-041, NFR-042.
  - References: spec §15, §18, docs/benchmarking.md.
  - Risks and fallback: noise on shared CI runners → pin benchmark hardware description, use criterion statistics (significance/noise thresholds), report distributions; if slower, disclose honestly (event rule rewards honesty).
  - Done when: report committed with reproducible commands; no unexplained >order-of-magnitude compile regression; matching throughput reported against NFR-011.

- [ ] Phase 11: Cross-platform CI, docs, licensing, submission pack, and demo rehearsal
  - Objective: Assemble the submission: green CI matrix, final docs, license audit, .port-mortem.toml, demo video script + rehearsal, readiness re-audit.
  - Inputs and required reading: context.md §3, spec §17–20; docs/submission-checklist.md, docs/build-and-ci.md, docs/licensing.md, docs/demo-plan.md; audits/ latest.
  - Steps: (1) CI matrix (fmt, clippy, test, adapter parity, proptest short, fuzz smoke on linux) × {ubuntu, windows, macos}; (2) docs final pass: README (build/test/bench one-liners + attribution), DECISIONS.md ≥10 entries, ARCHITECTURE.md sync, compatibility-matrix sign-off; (3) license/attribution audit incl. dependency licenses; (4) `.port-mortem.toml` (track F, source URL, kickoff hash) + Dockerfile verification from clean container; (5) demo script per docs/demo-plan.md, record 5-minute video; (6) final adversarial re-audit of full repo (fresh read) → close findings.
  - Tests/checks to write first: submission-checklist automated greps (LICENSE present, DECISIONS.md entry count, no `unsafe` in src, no node deps in shipped crates).
  - Commands to run: `docker build -t picomatch-port . && docker run picomatch-port cargo test --release; grep -rn "unsafe" crates/*/src; wc -l DECISIONS.md`.
  - Deliverables: CI green, submission pack per docs/submission-checklist.md, demo video, final audit file.
  - Covers: NFR-030..033, NFR-050, NFR-040; FR acceptance (spec §20); G-13/G-16/G-18.
  - References: spec §17–20, docs/submission-checklist.md, docs/demo-plan.md, docs/licensing.md.
  - Risks and fallback: demo environment failure → pre-recorded fallback clip + live rerun script; CI flake → retry budget + documented quarantine (never silently).
  - Done when: docs/submission-checklist.md is fully checked with evidence links; final audit has no unresolved critical/high; push to origin accepted.
