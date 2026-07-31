# DECISIONS.md — Architecture Decision Records

Lightweight ADRs. Fields: status (Proposed/Accepted/Superseded), date, context, options, decision, evidence, consequences, rejected alternatives, reversal trigger, links. Judges read this — entries must be non-trivial and evidence-backed (≥10 targets the Decision Log bonus).

## D-001 — Product shape: pure Rust library + differential CLI; N-API only as stretch

- Status: **Accepted** (ratified 2026-07-31, Phase 0)
- Date: 2026-07-31
- Context: Event allows any artifact that builds with one command and runs the original tests via a thin adapter `(verified: coderesurrection.com/2026 §04/FAQ)`. Team has not formally chosen the shipping surface.
- Options: (a) pure Rust lib + CLI adapter; (b) lib + napi-rs Node binding for in-process adapter; (c) WASM; (d) CLI-only.
- Decision: (a) default. CLI speaks JSON (stdin/stdout) so both the mocha adapter and differential runner use one artifact. (b) is a stretch goal only, never required for parity.
- Evidence: event FAQ "tests run against your port's binary/artifact via a thin adapter"; napi-rs docs (prebuilt binaries per platform add packaging risk); research-gaps G-04.
- Ratification evidence (2026-07-31): eligibility verified — official repo pool lists `micromatch/picomatch` for JavaScript → Go,Rust (`https://coderesurrection.com/2026/repo-pool`, fetched 2026-07-31); event FAQ §16 confirms the artifact-level thin-adapter model, which the JSON CLI satisfies; team instruction (this session's assignment) selects (a). G-04 closed.
- Consequences: simplest single-command build (`cargo build --release`); adapter fidelity depends on CLI protocol completeness (spec §16, docs/differential-testing.md §5).
- Rejected: (b) as core — packaging/ABI risk inside 72h; (c) WASM — perf + toolchain risk; (d) CLI-only — loses library judging points for idiomatic Rust API.
- Reversal trigger: Discord template mandates in-process JS loading, or team vote at Phase 0.
- Links: plan Phase 0/2/8; spec §3, §17; context.md A-1.

## D-002 — Parity boundary: behavioral parity MUST; regex-source parity STRETCH with normalization

- Status: **Accepted** (ratified 2026-07-31, Phase 0)
- Date: 2026-07-31
- Context: JS `makeRe().source` strings embed lookarounds `(?!.)`, `(?=.)`, `^(?!...).*$` that Rust `regex` cannot compile `(verified: docs.rs/regex)`. Exact string parity is therefore impossible without a custom regex engine for the whole language (huge scope) — but behavior parity is fully achievable.
- Options: (a) behavior parity + documented source normalization; (b) custom backtracking engine for everything to preserve sources; (c) emit JS-form sources but match with translated sources.
- Decision: (a). Corpus records behavior always; `compareSource` recorded only where identical strings are achievable (literal-heavy patterns). (c) is adopted as presentation detail: we MAY retain the JS-form source string as metadata while executing a translated Rust-regex — documented, not hidden.
- Evidence: probe corpus (scratch/probe-regex-sources.json — ~60 source strings, most contain lookarounds); regex docs (no lookaround); research-gaps G-05.
- Ratification evidence (2026-07-31): the official scoring rubric (coderesurrection.com/2026 §09, fetched 2026-07-31) scores original-test-suite parity and behavioral equivalence — no rubric scores `makeRe` source-string equality; judges weigh documented divergences per rule 02/§05. G-05 closed as DECIDED (boundary, not a risk).
- Consequences: honest scope; Behavior Equivalence judging is served by differential proof, not string diffs.
- Rejected: (b) — ReDoS re-introduction + schedule risk.
- Reversal trigger: judges publish a rubric explicitly scoring `makeRe` source equality (none found in research).
- Links: spec §5.4; docs/rust-design-options.md; DECISIONS D-003/D-004.

## D-003 — Two-engine architecture: `regex` primary, guarded fallback for lookaround subset

- Status: **Accepted** (ratified 2026-07-31 with budget-semantics amendment, Phase 0)
- Date: 2026-07-31
- Context: Only a subset of compiled sources needs lookaround (dot guards at segment starts, negate extglobs, top-level negation). Everything else maps cleanly to Rust `regex` (linear-time, capture support).
- Options: (1) regex only + rewrite lookarounds away (NOT generally possible: negated extglob `!(x)` is true negation); (2) regex-automata NFA directly (captures ok, but still no lookaround); (3) fancy-regex fallback (backtracking VM over regex crate); (4) hand-rolled mini backtracker for the lookaround subset.
- Decision: primary `regex`; fallback `fancy-regex` wrapped in an explicit backtrack-step budget. Engine selection is deterministic (source inspection) and logged per corpus case. **Option (4) is removed from the committed plan** — it is not implemented, specced, or scheduled; if Phase 7 differential evidence shows a fancy-regex mismatch class, a bounded spec is written then, with real data, as a new ADR (reversal trigger below).
- Budget semantics (amendment, ratified 2026-07-31; closes readiness-review F-06):
  - Configuration: the port sets `fancy_regex::RegexBuilder::backtrack_limit(n)` explicitly — never relies on an implicit default. Candidate `n = 1_000_000` backtracking steps, matching the crate's documented upstream default `(verified: fancy-regex lib.rs, RegexBuilder::backtrack_limit, "Default is 1_000_000", fetched 2026-07-31)`; exposed as engine option `maxBacktrackSteps` for tests. The limit counts **backtracking steps of the fancy-regex VM**; subexpressions delegated to the `regex` crate run in linear time and are not the blowup risk.
  - On `RuntimeError::BacktrackLimitExceeded` (match time): the matcher returns a typed resource-limit error — library: `PicomatchError::ResourceLimit { kind: BacktrackLimit, pattern }`; CLI: `{ "errorClass": "ResourceLimitError", "kind": "backtrack_limit", "message": ... }`. It is **never** silently mapped to `isMatch:false` and never to the `/ $^ /` never-match path (that path remains for internal compile failure only, per FR-015).
  - On `RuntimeError::StackOverflow` or any other runtime error: same typed mapping with `kind: "stack_overflow"` / `"runtime"`.
  - Divergence registration: **DV-6** — the JS oracle eventually returns a boolean after unbounded backtracking; the port answers with a typed error once the budget trips. This is a deliberate, documented safety divergence (docs/compatibility-matrix.md, docs/security.md). Corpus cases expected to trip the budget carry `expected: {"errorClass": "ResourceLimitError"}` plus `meta.limitNote`; differential-fuzz classification is `EXPECTED_LIMIT` — reported separately in the fuzz log, not counted as a zero-divergence failure, with the classification published (docs/fuzzing.md).
- Evidence: fancy-regex docs (VM delegates to regex when non-fancy; exponential worst case possible; `backtrack_limit` API + `RuntimeError::{BacktrackLimitExceeded, StackOverflow}` variants — docs.rs, fetched 2026-07-31); regex-automata docs (no lookaround anywhere); Search MCP research #61 (hybrid recommended); GHSA-c2c7-rcm5-vvqj (backtracking danger — mitigated by backtrack budget + risky-extglob literalization parity).
- Consequences: near-linear performance for the common case; bounded worst case for the lookaround subset with a deterministic, observable, typed failure mode; dependency surface +1 (MIT/Apache, acceptable per D-005).
- Rejected: (1) — semantically impossible for `!(...)`; (2) — no lookaround; full custom VM — ReDoS + complexity; silent no-match on budget trip — hides a real answer and would corrupt parity evidence.
- Reversal trigger: Phase 5/7 differential corpus shows systematic fancy-regex mismatch → write the bounded mini-backtracker spec as a new ADR (supported constructs, input model, complexity bound, operation budget, captures, errors, trigger criteria, differential tests) before any implementation.
- Links: spec §11 (FR-070..074); docs/rust-design-options.md; plan Phase 5/7/9.

## D-004 — Compile strategy: transliterate parse.js 1:1 to a Rust IR emitting engine-specific sources

- Status: **Proposed** (validate Phase 5)
- Date: 2026-07-31
- Context: The JS parser is a hand-rolled, context-sensitive state machine with backtracking output rewrites. Clean-room redesign risks semantic drift; direct transliteration preserves behavior and is mechanically reviewable against the oracle.
- Options: (a) transliterate parse.js to Rust with the same token model; (b) redesign a clean AST parser, then compile; (c) grammar-based (pest/nom).
- Decision: (a) for the parser/tokenizer (with Rust-idiomatic boundaries: enums, no nulls, slices not mutation of shared string), then a thin emission layer translating the JS-source string into engine-appropriate regex (identity translation for fallback; lookaround-eliminating translation where a documented equivalence exists for the primary engine, e.g. `(?!.)`+`(?=.)` guards folded into segment classes where provably equivalent — otherwise route to fallback).
- Evidence: lib/parse.js read fully (1416 LOC, six globstar context forms, extglob close variants); probe sources; transliterate-first recommendation from porting methodology (libinjectionrs PORTING_PLAN: "start with transliteration to reach full test parity fast; then refactor behind tests").
- Consequences: highest fidelity per effort; some un-idiomatic shapes acceptable behind module boundaries; later refactor allowed ONLY behind green corpus.
- Rejected: (b) — drift risk; (c) — the language is context-sensitive (brace/extglob state), grammars fight it.
- Reversal trigger: corpus divergence density > 2% in Phase 5 → revisit (b) for offending constructs only.
- Links: spec §10; docs/parser-and-scanner.md; ARCHITECTURE.md.

## D-005 — Dependency policy

- Status: **Accepted** (bootstrap governance)
- Date: 2026-07-31
- Context: Hackathon allows ecosystem dependencies; judging rewards engineering discipline.
- Decision: runtime deps minimal (`regex`, +`fancy-regex` if Phase 5 confirms); dev deps for testing (proptest, criterion, serde_json, libfuzzer-sys on Linux CI). Each dep needs: MIT/Apache/BSD/ISC/CC0 license, docs.rs review, `cargo audit` clean, entry in knowledge/dependency-evaluation.md. Cargo.lock committed. No prior-art port code (D-010).
- Evidence: knowledge/dependency-evaluation.md (versions/licenses recorded 2026-07-31); event rule 04 (deps fair game).
- Consequences: predictable audit trail; reproducible builds.
- Rejected: "batteries included" crates (glob/globset/glob-match) as semantic engine — proven incompatible with picomatch semantics (comparators only).
- Reversal trigger: any dep shows advisory or behavior mismatch → replace per evaluation doc.
- Links: knowledge/dependency-evaluation.md; docs/licensing.md.

## D-006 — Differential oracle design: JS only in dev tooling, JSONL corpus, named-function registry

- Status: **Accepted** (bootstrap architecture; amended 2026-07-31, Phase 0)
- Date: 2026-07-31
- Context: Event forbids source-language runtime in the shipped artifact; the original suite must run against the port via thin adapter.
- Decision: Node oracle runner generates normalized JSONL corpus (ops + options + expected + meta) with SHA-256 manifest; Rust runner + mocha adapter consume the same corpus/CLI protocol. Function-valued options map to a named-function registry implemented identically in JS and Rust. Infinity/RegExp/match-array/error normalization per spec §5.3.
- Amendment (2026-07-31; closes readiness-review F-03): three artifacts are explicitly separated — (1) the Phase 1 **public-API oracle generator** (per-op case generators calling the original public API + `lib/scan` directly; **no mechanical extraction of arbitrary Mocha assertions** — the "loses zero fidelity" claim is withdrawn); (2) the corpus replay/differential runner; (3) the **original-Mocha thin adapter** (require-interception facade over the Rust CLI), which is high-risk enough to earn a named spike with measurable gates in Phase 2/3 (design: docs/differential-testing.md §11) before the Phase 8 completion. Callback event sequences are captured as first-class `events` records.
- Evidence: knowledge/test-inventory.md; event rule 05; DIFFER-style methodology (event reference #9).
- Consequences: corpus is the executable spec; any behavior change upstream would be caught by manifest hash.
- Rejected: live JS-in-the-loop differential at runtime (violates rule 05).
- Reversal trigger: none anticipated; extend corpus schema by versioning (v2) not edits.
- Links: docs/differential-testing.md; spec §16; plan Phase 1.

## D-007 — Fuzzing strategy: proptest grammar + cargo-fuzz on Linux CI; 60s zero-divergence gate

- Status: **Accepted** (bootstrap architecture)
- Date: 2026-07-31
- Decision: three fuzz targets (scan/parse/match) with structure-aware arbitrary inputs; seeds from upstream suite + malicious cases; proptest for differential properties with committed regression files; ≥60s zero-divergence run published for the bonus. Windows dev machines can't run cargo-fuzz → Linux CI job owns fuzzing.
- Evidence: Rust Fuzz Book (nightly + Unix-only); Context7 proptest failure-persistence docs; event bonus criteria.
- Links: docs/fuzzing.md; plan Phase 9.

## D-008 — Benchmark methodology: shared workload, distributions, no cherry-picking

- Status: **Accepted** (bootstrap governance)
- Date: 2026-07-31
- Decision: JS baseline via upstream bench harness on a documented workload; Rust via criterion mirroring identical operations (compile, cold, cached hit/miss, adversarial); report p50/p99/RSS/startup/throughput + environment; publish raw results JSON; slower results disclosed as-is.
- Evidence: event §09 scoring ("Throughput-only benchmarks score below honest p99 regressions"); criterion baseline docs.
- Links: docs/benchmarking.md; plan Phase 10.

## D-009 — Unsafe policy: forbid by default; any exception needs per-block justification + Miri

- Status: **Accepted** (bootstrap governance)
- Date: 2026-07-31
- Decision: `#![forbid(unsafe_code)]` in our crates. If a measured hotspot ever demands unsafe, it requires: written rationale in this file, minimal scope, Miri run in CI, and count reported in submission (Zero Unsafe bonus target = 0 blocks).
- Evidence: event bonus (+5); Miri docs; Bun-merge cautionary tale quoted on event site.
- Links: spec NFR-003; docs/security.md; plan Phase 9.

## D-010 — Prior-art non-copy policy and independent-derivation evidence

- Status: **Accepted** (binding)
- Date: 2026-07-31
- Decision: no reading or copying of `Maidang1/picomatch-rs` or `satch` code; all behavior derived from the JS oracle + test suite; convergence explained by shared oracle; provenance documented in knowledge/prior-art.md and surfaced in submission README to preempt plagiarism confusion.
- Evidence: event rule 04 + plagiarism clause; knowledge/prior-art.md.
- Links: knowledge/prior-art.md; context.md A-4.

## D-011 — Reproduce-or-document for upstream bugs (issue #175 class)

- Status: **Accepted** (bootstrap governance)
- Date: 2026-07-31
- Context: Baseline 4.0.5 still compiles `+(ab|abab)` to a catastrophic regex (verified locally 2026-07-31 with the bounded harness `tools/research/redos-timing.js`: medians 0.1→147.6 ms over n=20→35, spread recorded; issue #175 open, third-party). "Fixing" it in the port would create oracle divergence.
- Decision: match the oracle behavior exactly (do NOT literalize `+(ab|abab)`), document the hazard in docs/security.md, and prepare a Bug Catcher report referencing existing issue #175 (add reproduction evidence; no duplicate filing). If maintainers fix it mid-hackathon, follow the fork HEAD — do not cherry-pick.
- Evidence: local probe 2026-07-31; issue #175 text; GHSA-c2c7-rcm5-vvqj fix scope.
- Reversal trigger: upstream releases a patch during the event AND team adopts an upstream sync via new ADR.
- Links: docs/security.md; research-gaps G-08; plan Phase 7/9.

## D-012 — MSRV/toolchain pin

- Status: **Accepted** (updated and ratified 2026-07-31, Phase 0; re-confirm at first build)
- Date: 2026-07-31
- Decision: pin stable Rust **1.97.1** via rust-toolchain.toml (current stable per releases.rs, fetched 2026-07-31; supersedes the earlier 1.95.0 note, which was stale by two releases); MSRV = that pin; nightly used ONLY for cargo-fuzz/Miri jobs.
- Evidence: releases.rs (stable 1.97.1, beta 1.98.0, nightly 1.99.0 — 2026-07-31); cargo-fuzz nightly requirement; research-gaps G-13/G-14; regex current candidate 1.13.1 has rust_version 1.65 (crates.io API, 2026-07-31) and fancy-regex 0.19.0 has rust_version 1.66 — both far below the pin.
- Reversal trigger: any adopted dependency requires newer → bump pin, record here; a judge-environment constraint requires older → re-pin with recorded rationale.
- Links: docs/build-and-ci.md; knowledge/dependency-evaluation.md.

## D-013 — Observable index convention: UTF-16 code-unit offsets

- Status: **Accepted** (2026-07-31, Phase 0; closes readiness-review F-02)
- Date: 2026-07-31
- Context: JavaScript strings index by UTF-16 code unit; every numeric position the oracle exposes (scan `start`/`slashes[]`, parse-state `index`/`start`/`consumed`, token/part slice boundaries) is a UTF-16-unit offset. Rust `String`/`&str` indexes by UTF-8 byte. Behavioral parity (D-002) is the MUST boundary, and these positions are observable through `picomatch.scan()` and `picomatch.parse()` (FR-011, FR-050..FR-053) and asserted by the original suite (e.g. `test/api.scan.js` deep-equality on full state, incl. `slashes: [1, 5, 12, 15]`; a BMP non-ASCII case exists at `test/api.scan.js:360`).
- Decision: all **externally observable** positions are UTF-16 code-unit offsets, matching the oracle exactly. Internally the Rust scanner/parser iterates Unicode scalar values (chars) and maintains a parallel cumulative UTF-16-unit position (BMP char = 1 unit, astral char = 2 units, ASCII fast path = byte index == unit index). Slicing internally uses UTF-8 byte ranges derived from the same iteration; observable positions are computed from the unit counter, never from byte offsets. Conversions are centralized in one helper module (`src/text.rs`: `utf16_len(str) -> usize`, `byte_to_utf16_offset`, unit-aware slicing) so the convention has exactly one home.
- Unpaired surrogates: Rust `String` is valid UTF-8 and cannot represent them. The JSON corpus/adapter protocol treats strings as Unicode scalar sequences; any unpaired surrogate arriving over the wire is replaced with U+FFFD at ingestion and the replacement is recorded in the record's `meta` (the oracle corpus generator emits only well-formed UTF-8, so this is an adapter edge case, not a corpus case). No corpus case may contain unpaired surrogates.
- Corpus contract: scan/parse records carry `meta.indexUnits: "utf16_code_unit"`; Phase 1 adds non-ASCII acceptance cases — BMP before/after slash (`フォルダ/**/*`, mirroring `test/api.scan.js:360`), astral (emoji) in base and glob segments, non-ASCII adjacent to prefix/brace/bracket/extglob boundaries — asserting `start`/`slashes`/`parts` values in UTF-16 units (spec §5.3, docs/differential-testing.md §3).
- Evidence: lib/scan.js read fully (charCodeAt indexing, `slashes.push(index)`); test/api.scan.js read fully (deep-equality on numeric fields); docs.rs/str (UTF-8 indexing); readiness-review F-02.
- Consequences: zero observable divergence on index fields; small runtime cost (one unit counter alongside byte iteration); no `unsafe` or transcoding of stored strings.
- Rejected: byte-offset observable positions + corpus normalization — a real observable divergence against MUST-level parity, disallowed by D-002.
- Reversal trigger: none (a change here would be a parity regression; any proposal requires a new ADR plus event-evidence that judges accept the divergence).
- Links: spec §5.3/§9/§10; docs/parser-and-scanner.md; ARCHITECTURE.md §4/§6; plan Phase 4/5.
