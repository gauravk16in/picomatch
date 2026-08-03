# Teammate 2 — Final end-to-end audit: full-repository review, fixes, optimization, and evidence closure

- Session type: Final full-repository production audit and fix session (not a PR review). No subagents; every command, read, probe, research call, edit, test, profile, benchmark, and commit run personally.
- Working branch: `chirag-rust-port-final-full-audit-optimize-fix` (cut from `origin/rust-port` `a2b1ce1`).
- Session window: 2026-08-03 ~00:20 IST → ~02:40 IST.

## 1. Title and scope

Final verification of Teammate 2's Picomatch JavaScript→Rust migration work: constants, utilities, scanner port, scanner bridge/tests, deterministic scanner corpus, adversarial + integrated differential testing, regression canaries, benchmark workers/controller/validator/verifier/statistics, scanner performance, Cargo release configuration, documentation, judging evidence, Git history, and final completion status. Review covered the current integrated code at the `rust-port` tip plus the full relevant history, not a diff.

## 2. Audit date/environment

2026-08-03. Windows 11 (win32, 10.0.26200, MINGW64 Git Bash), Node v24.13.0, npm 11.6.2, cargo 1.97.1, rustc 1.97.1 (matches `rust-toolchain.toml` pin), CPU 12th Gen Intel Core i7-12650H.

## 3. Repositories, branches, and verified SHAs

| Item | Value | Verification |
|---|---|---|
| `Main/` (read-only oracle) | `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2` | `git rev-parse HEAD`; `git status` clean before AND after the session |
| `origin/rust-port` tip (audit base) | `a2b1ce1db2952ef667a2165568d1101ec8947a29` | fetched; matches the prompt's "PR #8 merge-era" anchor — not stale |
| Working branch | `chirag-rust-port-final-full-audit-optimize-fix` | created from `origin/rust-port` |
| Fixes commit | `a09db41` | scanner + utils correctness |
| Optimization commit | `1edcd50` | profile-backed scanner optimizations |
| Harness/source commit (H2) | `14e3128cf458bca684927e76c54499e6bdfa305b` | benchmark system overhaul |
| Evidence commit (E2) | `2fc52d2` | final artifacts + BENCHMARKS.md |
| Docs/audit commit (F) | the commit adding this file (SHA discoverable via `git log -1` on the branch; not evidence-binding — H2/E2 are the bound evidence commits) | `JUDGING_EVIDENCE.md`, `AGENTS.md`, this audit |

Verified historical anchors (all present via `git log`): Main ref `00cf02c`, PR #2 `1685399`, PR #3 `3bcb877`, PR #4 `e115174`, PR #5 `3a1b780`, PR #6 revert `b19e762`, PR #7 H `cc8db2c`, PR #7 E `0087dd7`, PR #7 merge `4d234c1`, PR #8 merge `a2b1ce1`. PR #5 revert completeness: `git diff 3a1b780^ b19e762` is **empty** (complete revert).

## 4. Teammate 2 responsibility map

Teammate 2 owned: `crates/pmx-core/src/constants.rs`, `src/utils.rs` (shared helpers), `src/scan.rs`, `examples/scanprobe.rs`, `examples/scanbench.rs`, `fixtures/{canon-scan,extract-scan,verify-scan,scan-bridge,attack-scan,integrated-harness-core,attack-integrated,canary-harness,run-integrated}.js`, `fixtures/scan_oracle.json`, `benchmarks/` (all), `BENCHMARKS.md`, `JUDGING_EVIDENCE.md`, `DECISIONS.md` D-015..D-026. Parser chunks (`src/parse/*`, C3–C9 fixtures/oracles, c0/c4 probes) are other teammates' — reviewed for integration effects only, not modified (PR #8 diff analysis: no scanner/benchmark/Teammate-2 semantic changes; `constants.rs` change was a no-op raw-string form, `utils.rs` changes additive `pub(crate)` helpers).

## 5. Historical PR/merge timeline

PR #1 (C2) → PR #2 (chunk 1 constants/utils) → PR #3 (chunk 2 scanner) → PR #4 (chunk 3 differential integration) → PR #5 (defective benchmarks, 5 blocking defects) → PR #6 (complete revert of PR #5) → PR #7 (benchmark remediation, H `cc8db2c` + E `0087dd7`, merged `4d234c1`) → PR #8 (later parser integration `a2b1ce1`). The old `JUDGING_EVIDENCE.md` listed PR #7 as "(pending)" after merge — corrected in this audit's F commit.

## 6. Files and systems reviewed

Workspace governance (`CLAUDE.md`, `context.md`, `plan.md`, `spec.md`, `implementation.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `WORKSPACE.md`); Rust repo governance (`AGENTS.md`, `C0_DESIGN.md`, `C1_DESIGN.md`, `DECISIONS.md`, both `Cargo.toml` + `Cargo.lock`, `rust-toolchain.md`); all 4 prior Teammate 2 audits; `Main/lib/{constants,utils,scan}.js` (full), `Main/test/api.scan.js` (hash-pinned `8abd94a2…4f36`, verified unchanged); `src/{constants,utils,scan}.rs` (full line-by-line vs the JS); scanprobe/scanbench examples; all scanner fixtures (bridge, canon, extract, verify, attack, integrated core + runner, canaries); all of `benchmarks/`; committed benchmark artifacts (both v1 sets); `BENCHMARKS.md`, `JUDGING_EVIDENCE.md`, `audit_findings.md`, `bug-reports.md`; Git history and PR #8 integration diff.

## 7. Research questions and primary sources

| Question | Sources (opened in full or primary) | Consequence |
|---|---|---|
| Cluster bootstrap correctness + citation | Cameron & Miller, *JHR* 50(2) 2015 (§IIF pairs cluster resampling); Davison & Hinkley 1997; MacKinnon (QED wp 1413) — 3 independent sources, consistent | D-019 evidence re-cited from Wikipedia to the primary literature |
| JS `.` metachar line-terminator set | ECMAScript semantics of `.` (excludes `\n`, `\r`, U+2028, U+2029), verified empirically against the oracle's `removeBackslashes` at unit level | F-07 fix in `utils::remove_backslashes` |
| LTO/codegen-units benefit for this workload | Project-specific interleaved A/B/A/B microbench experiment (4 rounds × 20 scenarios) — no consistent win; single-run "gains" were noise | D-026: default release profile retained (flag rejected on evidence) |
| Profiler availability on Windows | WPR present but WPA/ETL analysis unavailable; no samply/VTune installed (installing tools outside the workspace was out of scope) | Substitute: counting global allocator + `Instant` microbench (documented limitation) |
| `black_box` as anti-DCE guarantee | Rust std docs semantics (best effort, no guarantee) | D-024: symmetric consumption accumulator as primary mechanism, `black_box` supplementary |

## 8. Baseline results before final fixes

| Gate | Baseline result (pre-fix, at `a2b1ce1`) |
|---|---|
| `Main`: `npm test` | 1977 passing (npm `ci` impossible — no committed package-lock.json; documented blocker, `npm test` works from existing node_modules) |
| `cargo fmt --check` / `clippy -D warnings` | exit 0 / exit 0 |
| `cargo test` | 60 unit + 2 integration, 0 failed |
| `verify-scan` | 3072/3072 deterministic |
| `attack-scan` | 4,932 comparisons, 0 divergences (passed WITH the F-01/F-02 bugs — coverage gap) |
| `attack-integrated` | 3,969 compared, 0 divergences |
| scan-bridge (original tests vs Rust) | 40/40 passing |
| bench-canaries | 31/31 |
| `verify-artifacts` (v1 dir) | "verified" with EMPTY expectations (weak — F-10) |
| Scanner microbench | 6–22 allocs, 240–917 bytes per call (baseline for optimization) |

## 9. Findings table

| ID | Severity | Title | Status |
|---|---|---|---|
| F-01 | BLOCKER | Scanner residual-`code` not assigned in extglob scanToEnd escape → final-token divergence | FIXED |
| F-02 | BLOCKER | Same class in paren scanToEnd `(`-quirk branch | FIXED |
| F-07 | BLOCKER | `remove_backslashes` treats only `\n` as line terminator (JS `.` excludes 4) | FIXED |
| F-04 | HIGH | Rust bench worker folded EMPTY `state.input` (scanbench bypasses `scan()` wrapper) | FIXED |
| F-05 | HIGH | Worker digests not the same algorithm/encoding; never compared (empirically unequal) | FIXED |
| F-08 | HIGH | Corpus/attack input sets lacked the F-01/F-02 shapes (bugs shipped undetected) | FIXED |
| F-09 | HIGH | Validator gaps (no digest compare, no sample-length/ops/pair-contiguity/nested-ID/parity-coverage checks) | FIXED |
| F-10 | HIGH | Verifier called `validateRaw(raw, {})` with empty expectations; no summary recompute; no final selection | FIXED |
| F-12 | HIGH | Pilot artifacts indistinguishable from final (committed pilot raw recorded pre-harness SHA) | FIXED |
| F-15 | HIGH | JUDGING_EVIDENCE stale: PR #7 "(pending)" post-merge, PR #8 absent, stale counts | FIXED |
| F-11 | MEDIUM | CLI: fractional/unsafe counts silently truncated, dupes last-win, pilot silent-override, dead `--no-bridge`, scanbench swallowed bad args | FIXED |
| F-13 | MEDIUM | Schedule not cryptographically bound (shared overwritten filename, no agreement check) | FIXED |
| F-14 | MEDIUM | Binary SHA-256 + effective Cargo profile not recorded in artifacts | FIXED |
| F-16 | MEDIUM | BENCHMARKS.md `(this commit)` for evidence SHA; stale base | FIXED |
| F-06 | MEDIUM | Redundant whole-input String builds + avoidable clones in scanner hot path | FIXED |
| F-03 | MEDIUM | D-017/comments claimed JS omits token `depth` for prefix tokens (false) | FIXED |
| F-19 | LOW | Bootstrap percentile indices asymmetric by one | FIXED |
| F-17 | LOW | D-019 cited Wikipedia for cluster bootstrap | FIXED |
| F-21 | INFO | thin-LTO "win" was noise — flag rejected via interleaved experiment | REJECTED AS NOT A BUG |
| F-18 | INFO | Live counts legitimately differ from historical docs (60 unit tests post-PR-#8, etc.) | NOTED |
| F-20 | INFO | PR #5 revert verified complete; PR #8 caused no Teammate-2 semantic changes | NOTED |

## 10. Root causes

- **F-01/F-02:** the port used raw `index += 1` in two inner-loop escape branches where JS assigns `code = advance()`. The residual `code` at loop exit feeds `!isPathSeparator(code)` (scan.js:344), deciding the final-token push — an invisible-until-probed state dependency the 3,072-case corpus and seeded adversarial inputs never exercised.
- **F-07:** JS regex `.` semantics incompletely modeled (line terminators are `\n \r U+2028 U+2029`, not just `\n`).
- **F-04/F-05:** benchmark workers evolved independently; "same algorithm" was asserted in comments but never verified (the validator defined MISMATCHED_DIGEST but never emitted it; scanbench called the unit-level `scan_utf16` which leaves `ScanState.input` empty).
- **F-09/F-10/F-12/F-13/F-14:** the PR #7 remediation hardened the runner but left the standalone verifier structural-only and the artifact provenance under-bound.
- **F-06:** string-building convenience (`slice_units_to_string` for comparisons, defensive `.clone()`s) in the initial port; never profiled.

## 11. Fixes implemented

1. **Scanner (a09db41):** assign `code` on the escape advance in both inner loops (exact JS semantics, OOB→0); 6 oracle-pinned regression tests.
2. **Utils (a09db41):** `is_dot_line_terminator` (`\n|\r|\u2028|\u2029`) in both `remove_backslashes` alternatives; oracle-pinned regression tests.
3. **Coverage (a09db41):** trailing-escape-inner-loop + line-terminator inputs added to `extract-scan.js` (corpus regenerated 3,072→3,216, double-run byte-identical) and `attack-integrated.js`.
4. **Scanner optimization (1edcd50):** unit-range base trim (no whole-input String builds; `base !== str` → unequal lengths), move-instead-of-clone for tokens/slashes/parts.
5. **Benchmark operation (H2 14e3128):** timed region = scanner + minimal symmetric consumption (identical op sequence); rich canonical digest (tags, u32le framing, UTF-16 units, presence markers, Infinity→0x7F800000) moved OUTSIDE timing, byte-identical across runtimes (verified 20/20 scenarios, then 400/400 in the final run); scanbench folds the original scenario units for the input field.
6. **Controller (H2):** strict CLI; schema v2 (mode, schedule + hash, binary hashes, Cargo profile + toolchain, environment); digest+consumption equality gate; shared `stats.js` with symmetric bootstrap indices.
7. **Validator (H2):** full fail-closed set incl. MISMATCHED_DIGEST, CONSUMPTION_MISMATCH, SAMPLE_LENGTH_MISMATCH, TOTAL_OPS_MISMATCH, NONCONTIGUOUS_PAIR_ID, NESTED_PAIR_ID_MISMATCH, MISSING_PARITY_ROW, WRONG_EXECUTION_ORDER, WRONG_SCHEDULE, WRONG_MODE, CONFIG_MISMATCH.
8. **Verifier (H2):** final-set selection (v2 + mode final; legacy skipped as superseded), sidecar recompute, seeded-schedule re-derivation, full-expectation validation, harness-commit ancestry check, **independent per-row summary recomputation from raw**, binary-hash recompute when present.
9. **Canaries (H2):** 67 canaries (41 raw + 7 summary + 17 real-CLI + 1 stats synthetic + 1 consumption) all importing the production validator/executing real CLI paths; stats fixture proves `analyzeScenario` returns hand-computed values (point estimate = √5).
10. **Docs (F):** JUDGING_EVIDENCE rewritten (PR #7 merged status + H2/E2 + supersession), BENCHMARKS.md rewritten (exact SHAs, final table, superseded-evidence section), benchmarks/README.md updated, AGENTS.md status updated, DECISIONS.md D-017 errata + D-021 superseded + D-024/D-025/D-026 + D-019 re-cited.

## 12. Rejected fixes/optimizations and reasons

- **thin LTO / codegen-units=1 / fat LTO** — rejected: interleaved A/B/A/B (4 rounds × 20 scenarios) showed wins >3% on only 2/20 and losses >3% on 4/20; single-run gains were noise (D-026).
- **Rich digest inside the timed loop** — rejected after measurement: once unified, it cost ~2.3x the old digest on the JS side, dominating the measured operation (JS digest ≈ 600ns of 905ns for S001 vs Rust ≈ 62ns of 280ns).
- **Scanner-only timing with `black_box` alone** — rejected: `black_box` is best-effort and JS has no equivalent; symmetric consumption chosen instead.
- **Whole-workspace `[profile.release]` change** — rejected: no project-specific evidence; portability/reproducibility of defaults preferred.
- **Deleting legacy v1 artifacts** — rejected: history preserved; they are marked superseded and skipped by the verifier.

## 13. Profiling method and hot-path evidence

WPR exists on the host but no WPA/ETL analysis path; samply/VTune not installed (tool installation outside the workspace was out of scope). Substitute: a scratch-only micro-profiler (counting global allocator + `std::time::Instant`, best-of-5 medians, release build) over the 20 benchmark scenarios. Baseline: 6–22 allocs/op, 240–917 bytes/op; the whole-input `slice_units_to_string` + `encode_utf16` in the base-trim path and the three collection clones were the confirmed waste. Post-fix: 4–13 allocs/op, 240–758 bytes/op.

## 14. Before/after performance evidence

Scanner microbench (counting allocator + Instant, ns/op best-of-5):

| Scenario | before ns/op | after ns/op | allocs before→after |
|---|---:|---:|---|
| S001 plain-path-short | 303 | 218 | 6→4 |
| S002 plain-path-long | 553 | 452 | 8→6 |
| S005 globstar-deep | 632 | 427 | 12→8 |
| S011 escaped-metachar | 719 | 515 | 15→11 |
| S012 parts-basic | 994 | 554 | 21→11 |
| S017 bmp-unicode | 1009 | 555 | 22→11 |
| S020 complex-parts-tokens | 1074 | 625 | 22→13 |

18–50% faster on 19/20 scenarios (one flat within noise); behavior parity re-verified after the change (§15). Cross-runtime final results in §17/BENCHMARKS.md (mixed, honest).

## 15. Complete correctness command table

| Command (cwd) | Exit | Evidence |
|---|---:|---|
| `npm test` (Main) | 0 | 1977 passing, before and after; test hash `8abd94a2…` pinned by run-integrated step 8 |
| `cargo fmt --all -- --check` (Rust) | 0 | clean |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | 0 | clean |
| `cargo test --workspace --all-features` | 0 | 66 unit + 2 integration + 0 doc, 0 failed |
| `node fixtures/verify-scan.js` | 0 | 3216/3216 deterministic, sha256 `03eb9a7c…` (double-generation byte-identical) |
| `node fixtures/attack-scan.js` | 0 | 4,932 comparisons, 0 divergences, 0 process failures |
| `node fixtures/attack-integrated.js` | 0 | 4,189 compared, 0 divergences/process/transport failures |
| `npx mocha --require ../Rust/fixtures/scan-bridge.js test/api.scan.js` (Main) | 0 | 40/40 passing against Rust, original file unchanged |
| `node fixtures/verify-c0.js` | 0 | 39/39 deterministic |
| `node fixtures/verify-c1.js` | 0 | 55/55 deterministic |
| `node fixtures/verify-c2.js` | 0 | 487/487 deterministic |
| `node fixtures/run-integrated.js` | 0 | 16/16 steps green |
| `node benchmarks/bench-canaries.js` | 0 | 67/67 mutations detected |
| `node benchmarks/verify-artifacts.js benchmarks/results` | 0 | E2 final set verified incl. per-row summary recompute; 2 legacy sets skipped |
| `node benchmarks/run-benchmarks.js --harness-sha 14e3128cf458bca684927e76c54499e6bdfa305b` | 0 | final 20-pair run from clean H2; parity 20/20; digest+consumption equality 400/400 |

## 16. Differential and adversarial evidence

- Oracle probes (pre-fix) reproducing F-01/F-02: `@(\a`, `a@(b\c`, `@(a\`, `@(a\)`, `((/` under tokens+scanToEnd — JS vs Rust token arrays diverged; post-fix all 8 probe cases match the oracle exactly.
- F-07 unit-level probes: `61,5C,0D,62` → JS `61,5C,0D,62` vs Rust `61,0D,62` (pre-fix); post-fix identical across 7 terminator cases.
- Adversarial suites post-fix: 4,932 (attack-scan) + 4,189 (attack-integrated) comparisons, 0 divergences, 0 process failures, 0 panics; BMP + astral + escaped cases included in both suites; lone-surrogate handling covered at the unit-level Rust interface (`scan_utf16`) per D-016 boundary (unpaired surrogates cannot arrive via `scan(&str)` and never occur in corpus cases per D-013).
- Verifier mutations: 8/8 classes detected (summary flip, median-moving raw tamper, rust_first flip, schedule-file tamper, digest flip, stale sidecar, summary-from-another-run, pilot/legacy rejection). Boundary (honest): a raw alteration that leaves every derived statistic unchanged (e.g., +1ns on a non-median sample) is not detectable by internal consistency; bit-level integrity comes from the E2-committed artifact hashes + sidecars (verified: committed blobs == sidecars).

## 17. Benchmark methodology and equivalence proof

**Exact operation:** timed = scanner + minimal symmetric consumption (identical op sequence consuming start, field unit-lengths, flags, presence bits, counts, per-token length/depth/flags). Outside timing = canonical rich digest per scenario, compared JS==Rust per pair. **Equivalence proof:** (a) identical digest spec both workers — empirically all 20 scenario digests byte-identical, and 400/400 digest + consumption checks equal in the final run; (b) parity gate deepStrictEqual on full states for all 20 scenarios; (c) the digest is validated by MISMATCHED_DIGEST/CONSUMPTION_MISMATCH canaries. **Residual asymmetry (disclosed):** Rust counts UTF-16 units (O(n)) where V8 reads `.length` (O(1)) — disfavors Rust only. **Process/statistical design:** 20 fresh process pairs, seeded deterministic order (embedded + hashed), per-pair medians, cluster bootstrap 10,000 resamples (Cameron & Miller 2015; Davison & Hinkley 1997), symmetric percentile indices, fixed (disclosed) iteration counts — no post-hoc tuning.

## 18. Validator/canary coverage

Validator: schema v2, mode, parity coverage, pair count/contiguity/order, schedule agreement (embedded vs measurements vs seeded re-derivation in verifier), runtime labels, scenario set, declared-vs-actual sample length, total-operations consistency, worker-row vs config consistency, finite/positive/safe timings, u32 digest equality, consumption equality, provenance completeness (schedule hash, binary hashes), bootstrap floor, summary CI finiteness/order/duplicates/config equality. Canaries: 67, each importing the production validator or executing the real CLI (runner/worker/scanbench reject unknown/positional/duplicate/fractional/unsafe/pilot-conflict/missing-value inputs with exit 2).

## 19. Artifact provenance and hashes

| Binding | Value |
|---|---|
| H2 (source) | `14e3128cf458bca684927e76c54499e6bdfa305b` (clean tree at run, `dirty_tree:false`) |
| E2 (evidence) | `2fc52d2` |
| Raw SHA-256 | `a0447699e004f0517cfc8fdc3346fd4079616cee310f135b8fbb60c973ccab98` |
| Summary SHA-256 | `affc4b79894d54d3d0bff8a244d32fbe5b5c4a713c5a4f95a8cf5f8ff9494485` |
| Schedule SHA-256 | `8800b0ff1e4b422be512d5a00dc8fd956cb8dea1733a907a1a49b4c80471bf2b` |
| Corpus SHA-256 | `70f7c2b85cca25916cb992b7985ecb6139e4b9986f780a7334f685cb22104cd6` |
| scanbench SHA-256 | `0d4e7011ea517fd17b15e41382aca8fcff5f835a5e5c7ca48b5c1658bde35566` |
| scanprobe SHA-256 | `4136092b46528a48d7af97945cf6b5c280fb521c353e6de1f8456b497205ec8a` |
| Cargo profile | release, opt-level 3, default lto, codegen-units 16, toolchain 1.97.1 |
| Environment | win32 10.0.26200, x64, i7-12650H, Node v24.13.0 |
| Mode | final (pilot artifacts marked and rejected as final) |

Committed artifact blobs verified byte-identical to sidecars. Final results (ratio js/rust, CI95): Rust faster 13 scenarios, JS faster 5 (S001, S002, S005, S007, S012), inconclusive 2 (S004, S006). No universal speedup claimed.

## 20. Documentation corrections

- JUDGING_EVIDENCE.md: PR #7 "(pending)" → merged `4d234c1`; added PR #8; added H2/E2 table; supersession statement; live counts (66 unit tests, 67 canaries, 16 steps).
- BENCHMARKS.md: rewritten — exact H2 SHA (no `(this commit)`), final result table, artifact hashes, superseded-evidence section (PR #7 H/E values preserved), honest limitations incl. Rust-side unit counting and fixed (not calibrated) iterations.
- benchmarks/README.md: updated architecture/files for the redesigned operation.
- AGENTS.md: current status now records merges, the final audit remediation, H2/E2, and live gate counts.
- DECISIONS.md: D-017 errata (JS never omits token depth), D-021 marked superseded with the empirical evidence, D-024/D-025/D-026 added, D-019 re-cited to primary literature.

## 21. Limitations and unresolved unknowns

1. Windows-only, single-machine benchmark evidence; absolute numbers vary with machine state (the final run is authoritative for E2; the pilot's different ratios illustrate run-to-run variance and are not used as evidence).
2. Scanner-only benchmark (parser/matcher out of Teammate 2 scope).
3. 20 process pairs — limited statistical power; small-cluster bootstrap caveat disclosed.
4. The full original mocha suite executes against Rust only for `api.scan.js` (40/40 via bridge); whole-suite adapter is other teammates' chunk (standing program-level blocker, unchanged).
5. Verifier cannot detect raw alterations that leave every derived statistic unchanged — mitigated by E2-committed hashes (verified) and disclosed in §16.
6. No memory/RSS measurement; no CI checks exist on the repo (GitHub checks absent — status reported from local gates only).
7. Review coverage: Teammate-2-owned files reviewed line-by-line; other teammates' parser reviewed for integration effects only (covered by the integrated differential gates, 0 divergences).

## 22. Completion checklist

### Repository and history
- [x] Both Main and Rust checkouts exist; Main clean and unchanged (before + after)
- [x] Rust work began from current `origin/rust-port` (`a2b1ce1`)
- [x] Chunk 1–4 history and merges verified (§3/§5)
- [x] Later integration changes (PR #8) included and analyzed
- [x] Final diff contains no unrelated teammate work

### Correctness
- [x] Original JavaScript tests pass unchanged (1977/1977; test hash pinned)
- [x] Original scanner tests pass unchanged against Rust (40/40)
- [x] Rust formatting / clippy `-D warnings` / unit+integration tests pass
- [x] Constants and utilities match the JS contract (byte pins; F-07 fixed)
- [x] Scanner corpus passes (3216/3216)
- [x] Differential suite passes with zero unexplained divergences (4932 + 4189)
- [x] Adversarial/attack suite passes with zero divergences or panics
- [x] BMP, astral, escaped, and unit-level surrogate boundaries verified

### Harness and benchmark integrity
- [x] JS and Rust benchmark operations demonstrably equivalent (§17)
- [x] Canonical digest matches outside timing (400/400)
- [x] Both CLIs reject malformed explicit input (17 CLI canaries)
- [x] Validator fails closed on structure, counts, provenance, schedule, values
- [x] Verifier independently recomputes summary from raw (mutation-proven)
- [x] Canaries invoke production paths and fail for intended codes (67/67)
- [x] Process-pair/bootstrap implementation matches documentation
- [x] Fixed versus calibrated iteration policy truthful (fixed, disclosed)
- [x] Final artifacts bind exact source, binary, corpus, schedule, environment
- [x] Sidecars and manifest verify (committed blobs == sidecars)

### Optimization
- [x] Baseline captured before optimization (§8/§14)
- [x] Hot paths measured with documented substitute profiler
- [x] Every retained optimization has correctness and before/after evidence
- [x] Regressive/speculative optimizations reverted (thin LTO rejected)
- [x] No unsafe code introduced (`#![forbid(unsafe_code)]` intact)
- [x] No benchmark/test/scenario manipulated

### Documentation and audit
- [x] Stale PR #7 claims corrected
- [x] Historical defects and superseded evidence remain visible
- [x] Exactly one new final audit file (this file)
- [x] Documentation contains no research-provider/MCP names
- [x] Reproduction commands work (§15)
- [x] Limitations are honest
- [x] Final status matches evidence

## 23. Final verdict

**COMPLETE — TEAMMATE 2 DELIVERABLES VERIFIED, FIXED, OPTIMIZED, AND EVIDENCE-CLOSED.**

Three BLOCKER semantic divergences (F-01, F-02, F-07) were found by line-by-line oracle comparison, reproduced against the oracle, fixed, and regression-covered; the benchmark operation-equivalence defects (F-04/F-05) were empirically demonstrated in the old committed raw artifact and repaired with a verified-identical digest outside timing plus a minimal symmetric in-loop consumption; the validator/verifier now fail closed and recompute summary from raw; scanner performance improved 18–50% per scenario with allocation evidence; final H2/E2 evidence binds source, binaries, corpus, schedule, and environment; results are honestly mixed (Rust faster 13, JS faster 5, inconclusive 2) with no universal speedup claimed. "Rust faster in all scenarios" was not a completion gate.

## 24. Post-review addendum (2026-08-03, PR #9 automated review)

An automated PR review (Copilot) flagged that `run-benchmarks.js` derived `config.mode` from the pilot flag alone, so a plain full run without `--harness-sha` was emitted as `mode:"final"` — indistinguishable from a bound final-evidence run and conflicting with the verifier's final-set selection (an unbound full run into the same directory would also trip the "exactly one final set" rule).

- **Verification:** confirmed in source and by behavior: the artifact recorded `harness_sha` (HEAD at run time) but not whether `--harness-sha` was declared; two different run types produced identical-looking artifacts. VALID finding ( MEDIUM workflow/integrity gap in the F-12 fix).
- **Fix (commit after F):** three-mode model — `pilot` (reduced settings), `full` (complete settings, no declared binding), `final` (`--harness-sha` declared, clean tree enforced). The controller records the derived mode and prints a "NOT final evidence" note for full runs; the validator accepts exactly the three values; the verifier selects only `mode:"final"` and reports pilot/full/legacy skips explicitly. Two canaries added (`wrong-mode-bogus`, `full-is-not-final`) → 69/69 green.
- **Validation:** plain full run now records `mode:"full"` and is rejected as final evidence (exit 1); the E2 final set still verifies (exit 0); pilot runs unchanged.
- **E2 impact:** none — the E2 artifact was produced with `--harness-sha` and remains `mode:"final"`; the timed operation, workers, statistics, and artifact hashes are untouched by this fix.

## 25. Post-review addendum 2 (2026-08-03, CodeRabbit round + merge-integrity finding)

### 25.1 Merge-integrity finding (repo-critical)

PR #9 was merged at 2026-08-02T21:09:27Z via merge commit `f2b58b4` with parents `e47dd11` (rust-port) and `69d6aa0` (Copilot conflict-resolution). The CodeRabbit **autofix** commit `8562ab6` ("Fixed 8 file(s) based on 8 unresolved review comments", pushed 21:15:31Z, ~6 minutes AFTER the merge) **is not an ancestor of `origin/rust-port`** (`git merge-base --is-ancestor 8562ab6 origin/rust-port` fails; `git diff 8562ab6 f2b58b4` is exactly the inverse of the autofix). Despite the PR page showing "Fixes Applied Successfully", **none of the autofix changes are present in the merged tree** — the review fixes it claims were silently dropped. This follow-up branch re-applies every still-valid fix with evidence.

### 25.2 CodeRabbit finding dispositions (verified against the merged tree)

| Finding | Disposition |
|---|---|
| AGENTS.md C0–C9 "done" vs "other teammates' work" contradiction | FIXED — one status statement: chunks merged/accepted; parser/matcher release completion remains other teammates' work |
| Audit command table: slash-joined verifier command + abbreviated SHA | FIXED — three separate executable commands + full H2 SHA |
| `bench-canaries` scanbench resolution (debug-only) + spawn-failure counts as pass | FIXED — resolve release-then-debug, hard error if neither exists; spawn error / null status is a canary failure |
| `corpus_path` Windows separator breaks POSIX verification | FIXED — writer normalizes to POSIX (`run-benchmarks.js`); reader normalizes both styles with ROOT confinement (`verify-artifacts.js`). Existing E2 artifacts remain valid (read-side normalization); evidence was NOT regenerated for a cosmetic path form |
| Require `--harness-sha` for every non-pilot run | SKIPPED (reasoned) — duplicate of the Copilot finding already fixed by the merged three-mode model (pilot/full/final, `ba33c2c`); requiring the SHA would revert the accepted design and remove the documented full-run workflow. Final-evidence integrity is enforced by mode selection |
| `stats.js` zero valid pairs silently yields NaN | FIXED — explicit throw before bootstrap, matching the documented "throws on non-finite" contract (the verifier calls `analyzeScenario` on external data) |
| `validator` runtime with missing results array passes silently | FIXED — records `MALFORMED_MEASUREMENT` (code added to the map; the dropped autofix referenced it without defining it) |
| `verify-artifacts` unvalidated provenance (crash, path escape, git-arg shape) | FIXED — provenance guarded before use: presence, 64-hex schedule SHA, schedule array, 40-hex harness SHA, corpus_path normalized + confined beneath ROOT |
| Nitpick: `bootstrap_resamples` absence passes | FIXED — required (missing → `BOOTSTRAP_TOO_FEW`) |
| Nitpick: consumption comparison skips on missing | FIXED — required per-row u32 check (missing → `MALFORMED_DIGEST`) |

New canaries: `missing-results-array`, `bootstrap-missing`, `consumption-missing` → **72/72 green**.

### 25.3 Reviewed-and-accepted teammate change (INFO)

PR #10 (`90ee46b`, parser review remediation) also touched `benchmarks/verify-artifacts.js`: it added `summaryRowsMatch` (1e-8 tolerance) replacing the exact `JSON.stringify` comparison in the summary recomputation, and an independent corpus_path separator normalization. Reviewed: the analysis is deterministic (seeded PRNG, same `stats.js` on both sides), so exact comparison is strictly stronger; the 1e-8 tolerance still catches any material tamper, so the change is accepted rather than reverted (teammate ownership, no practical integrity loss). Recorded here for transparency.

### 25.4 Validation of this addendum's fixes

`node benchmarks/bench-canaries.js` 72/72; `node benchmarks/verify-artifacts.js benchmarks/results` verifies the E2 final set (exit 0); a fresh pilot run writes POSIX `corpus_path` and is rejected as final evidence (exit 1); `cargo fmt --check` / `clippy -D warnings` / `cargo test --workspace` (incl. teammates' new crates) green; `node fixtures/run-integrated.js` 16/16; Main `npm test` 1977/1977, tree clean.

## 26. Post-review addendum 3 (2026-08-03, PR #11 post-merge-verify review remediation)

### 26.1 Copilot review findings on PR #11 (two unresolved threads)

Copilot identified two valid crash paths in `verify-artifacts.js`:

1. **Unprotected filesystem and JSON operations** — the verifier performed `fs.readFileSync(corpusPath)` and `JSON.parse(fs.readFileSync(...))` guarded only by `existsSync`. An artifact could point to a directory (EISDIR), an unreadable file, invalid JSON, or an unexpected filesystem object, causing an uncaught exception instead of a structured `VERIFICATION FAILED` result. This applied to raw classification, summary reads, schedule reads, and corpus reads.

2. **Analysis continues after structural validation fails** — `validateRaw()` correctly detected missing/malformed `results` arrays, but the verifier then continued into `analyzeScenario(..., raw.measurements, ...)` which dereferences `m.js.results`/`m.rust.results`, crashing on malformed measurements.

### 26.2 Fixes applied

| Fix | Description |
|---|---|
| Raw classification guarded | `JSON.parse(fs.readFileSync(...))` for raw artifact classification wrapped in try/catch, records `[MALFORMED_RAW]` error, skips to legacy |
| Summary read guarded | Summary `readFileSync`+`JSON.parse` wrapped in try/catch, records `[MALFORMED_SUMMARY]` error |
| Schedule read guarded | Schedule file `readFileSync`+`JSON.parse` wrapped in try/catch, records `[MALFORMED_SCHEDULE]` error |
| Corpus read guarded | Corpus `statSync` (isFile check) + `readFileSync`+`JSON.parse` wrapped in try/catch, records `[MALFORMED_CORPUS]` error (directory, unreadable, invalid JSON, non-array) |
| Recomputation skipped on structural failure | If `validateRaw()` returns `MALFORMED_MEASUREMENT`, `MISSING_PAIR`, `MISSING_RUNTIME`, or `WRONG_PROCESS_COUNT`, summary recomputation is skipped (records `[SKIP_RECOMPUTE]`), preventing `analyzeScenario` from dereferencing invalid `m.js.results`/`m.rust.results` |
| Recomputation try/catch | `analyzeScenario` call wrapped in try/catch, records `[RECOMPUTE_CRASH]` instead of uncaught exception |
| Summary null guard | Recomputation skipped when summary is null or has no scenarios array |

### 26.3 CI workflow fix

The `adapter-parity` CI job built only `cargo build --release -p pmx-cli` but not the `scanbench` example. The fail-closed canary suite (which hard-errors if neither release nor debug `scanbench` exists) would fail because the required executable was never built. Added `cargo build --release --example scanbench` step before running benchmark canaries.

### 26.4 New mutation canaries (7)

| Canary | Tests |
|---|---|
| `verify-corpus-is-dir` | corpus_path pointing to a directory results in `[MALFORMED_CORPUS]` not crash |
| `verify-corpus-missing` | corpus_path pointing to nonexistent file results in error not crash |
| `verify-corpus-malformed-json` | corpus file with invalid JSON results in `[MALFORMED_CORPUS]` not crash |
| `verify-raw-malformed-json` | raw artifact file with invalid JSON results in `[MALFORMED_RAW]` not crash |
| `verify-summary-malformed-json` | summary file with invalid JSON results in `[MALFORMED_SUMMARY]` not crash |
| `verify-schedule-malformed-json` | schedule file with invalid JSON results in `[MALFORMED_SCHEDULE]` not crash |
| `verify-missing-results-recompute` | missing results array results in `[SKIP_RECOMPUTE]` not crash in `analyzeScenario` |

Total canaries: 72 + 7 = **79/79 green**.

### 26.5 Validation

`node benchmarks/bench-canaries.js` 79/79; `cargo fmt --check` 0; `cargo clippy --workspace --all-targets -- -D warnings` 0; `node benchmarks/verify-artifacts.js benchmarks/results` (E2 final set: binary hash mismatches are pre-existing — binaries rebuilt locally, not from harness commit).
