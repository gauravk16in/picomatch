# context.md — Hackathon and Project Context

Read this second (after `CLAUDE.md`). Canonical home for event facts, repo identity, commit identifiers, team assumptions, glossary, and open clarifications. Status markers: `(user)` = supplied by team; `(verified: source)` = observed this session; `[assumed: default — if wrong: impact]`.

## 1. Event

| Fact | Value | Status |
|---|---|---|
| Event | Port Mortem 2026 — Code Resurrection Hackathon (Hackathon Raptors, Wave 2) | `(user)`, `(verified: coderesurrection.com/2026, portmortem.devfolio.co)` |
| Format | 72-hour online migration hackathon | `(verified: same)` |
| Kickoff | 2026-07-31 **18:00 UTC** (original test suites hashed/pinned at kickoff) | `(verified: coderesurrection.com/2026 §08)` |
| Code freeze / submissions due | 2026-08-03 **18:00 UTC** | `(verified: same; corroborated by Unstop 02:00 PM EDT)` |
| Judging window | Aug 3–13, 2026; winners Aug 14, 2026 | `(verified: same)` |
| Selected track | **F — JavaScript → Rust** (Go also allowed; team chose Rust) | `(user)`, track exists `(verified)` |
| Selected project | `micromatch/picomatch` | `(user)`; pool-page listing not publicly verifiable — see research-gaps G-01 |
| Prize pool | $1,800 (1st $800 / 2nd $400 / 3rd $200 / Bug Catcher $100 / Write-Up side-quest 3×$100) | `(verified: coderesurrection.com/2026 §10)` |
| Team size rule | 1–4 members | `(verified)` |

## 2. Judging (verified: coderesurrection.com/2026 §09)

| Criterion | Weight | What judges look for |
|---|---|---|
| Functionality & Reliability | 40% | one-command build, runs, passes original test suite unmodified (file-hash verified); partial passes score proportionally |
| Behavioral Equivalence | 30% | differential fuzz survival on shared inputs, property tests, honest p99/RSS/startup with methodology, distributions not averages |
| Code Quality | 20% | idiomatic target-language code, unsafe/escape-hatch ratio vs comparable projects, decision-log quality (Engineering Discipline ~15% sub-weight), native error handling |
| Innovation | 10% | defensible pair choices, latent bugs caught in original via differential testing, architecture a senior would adopt upstream |

Bonus: Differential Fuzz Survivor +5 (≥60 continuous seconds, zero divergence, published log) · Zero Unsafe +5 (under per-pair threshold published at kickoff) · Bug Catcher +3 (file upstream issue during hackathon) · Decision Log +3 (≥10 non-trivial divergences with rationale).

## 3. Submission contract (verified: coderesurrection.com/2026 §04/§05/§11)

1. Public GitHub repo with the port, OSI-approved license.
2. Single documented build command producing a runnable artifact (`cargo build`, `make`, or `docker compose up` class).
3. Original test suite, hashed at kickoff, passing against the port via thin adapter (ideal; partial scores).
4. Differential fuzz harness + ≥60s zero-divergence log if claiming bonus.
5. `DECISIONS.md` — every non-trivial architectural divergence with rationale (≥10 for bonus).
6. Benchmark report — original vs port on shared workload: p99, RSS, startup, throughput + methodology.
7. 5-minute demo video showing original test suite passing live against the port.
8. Advisory layout: `README.md`, `DECISIONS.md`, `Dockerfile`, `src/`, `tests/original/` (hashed), `tests/port/`, `fuzz/harness.* + log.txt`, `bench/methodology.md + results.json`, `.port-mortem.toml`.

Hard rules: all port code written inside the 72h window (planning/scouting/prompt-tuning before kickoff is fine; **no port code before kickoff**); no source-language runtime wrappers/FFI/proxy; preserve original tests (edits weighed against DECISIONS.md rationale, not auto-DQ); license compliance; team 1–4; AI tools expected.

## 4. Repository identity (verified this session)

| Fact | Value |
|---|---|
| Team fork | `https://github.com/gauravk16in/picomatch` |
| Upstream | `https://github.com/micromatch/picomatch.git` (remote `upstream` pre-configured) |
| Fork HEAD == upstream HEAD | `4f41a8edade7a5ab19832f7b40ecce46b288767f` ("4.0.5", 2026-07-02 12:44:52 -0400); divergence 0/0 at 2026-07-31 01:32 IST |
| Work branch | `chirag`, created from 4f41a8e; did not previously exist locally or on origin |
| Package version | 4.0.5; engines node>=12; MIT; no lockfile committed (`.npmrc package-lock=false`) |
| Source size | lib 2,424 LOC (index/posix incl. 2,444); tests 16,961 LOC, 1977 tests |
| Baseline | `npm install` OK; `npm run mocha` → **1977 passing**; `npm run lint` → exit 0; `npm run test:cover` → stmts 93.2% / branches 89.81% / funcs 91.66% / lines 93.75% (Node v24.13.0, Windows 11) |
| CI matrix (upstream) | node 12/14/16/18/20/22/24/25 × ubuntu/windows/macos (macos excludes 12/14); pinned actions checkout@v6, setup-node@v6 |

## 5. Team assumptions (safe defaults — confirm in Phase 0)

- **A-1 (product shape):** pure Rust library crate `picomatch-rs-port` + thin CLI (`picomatch-cli`) used for differential/adapter testing; N-API/JS binding is STRETCH only. Confirmation gate: plan.md Phase 0 / DECISIONS.md D-001. `[assumed — if judges require in-process JS adapter: add napi wrapper without changing the core]`
- **A-2 (parity boundary):** match-result parity (isMatch/output/error class+message/callback order/scan+parse data shapes) is MUST; exact `makeRe().source` string parity is STRETCH subject to a defined normalization, because Rust `regex` cannot express JS lookaround. `(verified: regex crate docs)` See spec §5.4.
- **A-3 (oracle):** JavaScript runs only in development/test tooling (Node oracle runner generating JSONL + mocha adapter), never in the shipped Rust artifact. `(verified: event rule 05)`
- **A-4 (prior art):** no code read or copied from `Maidang1/picomatch-rs` or `satch`; independent derivation from the JS oracle. See `knowledge/prior-art.md`.
- **A-5 (this bootstrap itself):** research + scaffolding produced before kickoff contains **no port code** — consistent with the "no port code before kickoff" rule; only docs, plans, and disposable research harnesses under `tools/research/` + `scratch/`.

## 6. Glossary

- **Oracle** — the original JS implementation executed in dev tooling to produce expected results.
- **Corpus** — JSONL records of {op, pattern, input, options, expected, meta} used by both the mocha adapter and Rust tests.
- **Risky extglob** — `+()`/`*()` extglob forms picomatch ≥4.0.4 literalizes or rewrites to a safe char-class star (CVE-2026-33671 fix).
- **Thin adapter** — the event-sanctioned shim that lets the original mocha tests execute against the port's artifact (CLI JSON protocol in our plan).
- **Lookaround subset** — patterns whose JS regex source uses `(?!...)`, `(?=.)`, or top-level negation `^(?!...).*$` — the subset Rust `regex` cannot compile.
- **Fast path** — `parse.fastpaths` 8-shape table (+ `*.ext` recursion) used by `makeRe` when pattern starts with `.` or `*`.

## 7. Open clarifications (owned by team, checked at kickoff)

1. Discord #announcements: adapter templates, per-pair unsafe thresholds, test-hash manifest format, submission portal URL. (research-gaps G-02)
2. Confirm A-1 product shape with full team before Phase 2 production code. (D-001)
3. Confirm whether Write-Up side quest will be attempted (no impact on main score).
