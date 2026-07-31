# Submission Checklist — Port Mortem 2026

Status: tracking template; verified against official submission contract (coderesurrection.com/2026 §04/§05/§11, read 2026-07-31). Each item needs evidence + owner + phase. Check items only with links.

| # | Requirement | Evidence artifact | Owner | Phase | Status |
|---|---|---|---|---|---|
| 1 | Public GitHub repo with the port, OSI license | repo URL + LICENSE + pool listing (`https://coderesurrection.com/2026/repo-pool`, verified 2026-07-31) | team | 11 | ☐ (repo exists; MIT present; eligibility pool-listed) |
| 2 | Single documented build command → runnable artifact | docs/build-and-ci.md §one-command + Dockerfile | team | 2/11 | ☐ |
| 3 | Original test suite (hashed at kickoff) passing vs port via thin adapter; edits (if any) documented | `tests/test-hash-manifest.json` (38 files, aggregate `cc5a06a6f38b7353c75835448e09422a1b41527206f036e50d1277c2c35082cd`, deterministic) + artifacts/parity-report.json + DECISIONS.md notes | team | 0/8 | ☑ manifest created 2026-07-31 (regenerate if kickoff mandates an official format) |
| 4 | Differential fuzz harness + ≥60s zero-divergence log (bonus) | fuzz/harness + fuzz/log.txt | team | 9 | ☐ |
| 5 | DECISIONS.md with rationale (≥10 non-trivial for bonus) | DECISIONS.md (13 ADRs: D-001..D-013; 12 Accepted, 1 Proposed by design — D-004 with Phase 5 gate) | team | 0→11 | ☑ seeded + Phase 0 ratifications 2026-07-31 |
| 6 | Benchmark report: original vs port, shared workload, p99/RSS/startup/throughput + methodology | bench/methodology.md + bench/results.json | team | 10 | ☐ |
| 7 | 5-minute demo video (original suite passing live) | docs/demo-plan.md + recording | team | 11 | ☐ |
| 8 | `.port-mortem.toml` (track letter, source URL, kickoff hash) | .port-mortem.toml | team | 11 | ☐ |
| 9 | No source-language runtime wrappers/proxy in shipped artifact | dependency graph inspection (no node), grep CI | team | 2/11 | ☑ by design (verify in CI) |
| 10 | Original tests preserved unmodified | git diff --stat on `test/` (expect empty) | team | all | ☑ (guard) |
| 11 | License compliance + attribution | docs/licensing.md + LICENSES-THIRD-PARTY.md | team | 11 | ☑ planned |
| 12 | All port code written inside 72h window | git history on `chirag` | team | all | ☑ (bootstrap = docs only) |
| 13 | unsafe count vs kickoff threshold (bonus) | `grep -rn "unsafe" crates/*/src` → 0 + report | team | 9/11 | ☑ policy (D-009) |
| 14 | Bug Catcher (bonus): upstream issue filed/evidenced | issue #175 comment with our PoC data (or new issue if a new bug is found) | team | 9 | ☐ |
| 15 | Test-parity honesty: any failure named with owner + rationale | docs/compatibility-matrix.md | team | 8 | ☑ template |
| 16 | Flaky tests (if any) documented, not silently skipped | DECISIONS.md + parity report | team | 8/11 | ☑ policy |

Gate: submission is blocked until every ☐ is ☑ with an evidence link, or explicitly waived by team lead with a DECISIONS.md entry.
