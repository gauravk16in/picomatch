# Review Remediation — Documentation, Status Lines & Plan Drift (M6–M7, MINORS)

This document covers all documentation updates, status corrections, cross-reference repairs, and plan reconciliation performed during review remediation.

---

## 1. Finding M6: `bug-reports.md` Status Corrections

### Problem Description
`bug-reports.md` documented upstream bugs and claimed "Fixed" in the Rust port for BUG-001 and BUG-002:
- **BUG-001**: Claimed to re-order recovery loops to fix invalid output for unclosed braces (`{abc`). As shown in finding F-1, shipping this fix violated constitution §1 ("bug-for-bug parity").
- **BUG-002**: Claimed `opts.prepend` was fixed for `./`-prefixed patterns. In reality, `main_loop.rs:502-503` clears `state.output` on `./` collapse exactly like JS `lib/parse.js` L983, discarding `opts.prepend` unless a backtrack occurs.

Additionally, BUG-004 cross-referenced decision `D-024` in `DECISIONS.md`. Following decision renumbering, `D-024` referred to benchmark timing while the `regress` engine decision lived at `D-027`.

### Updates Applied
1. **BUG-001 Status** ([bug-reports.md:15](file:///Users/abhinav/Projects/pico-big/picomatch-rust/bug-reports.md#L15)):
   - Updated to: `**Status in Rust port:** Reproduced upstream bug, ported bug-for-bug (constitution §1)`
2. **BUG-002 Status** ([bug-reports.md:164](file:///Users/abhinav/Projects/pico-big/picomatch-rust/bug-reports.md#L164)):
   - Updated to: `**Status in Rust port:** Ported bug-for-bug — ./ collapse clears prepend exactly as JS does (constitution §1)`
3. **BUG-004 Cross-References** ([bug-reports.md:355, 367](file:///Users/abhinav/Projects/pico-big/picomatch-rust/bug-reports.md#L355)):
   - Updated decision references from `D-024` to `D-027`.

---

## 2. Finding M7a: Root `README.md` Creation

### Problem Description
Rulebook §5 and §9 require a project root `README.md` detailing:
- Architecture and crate layout
- Escape-hatch audit table (`unsafe`, `unwrap`, `expect`, `panic`, `todo`)
- Performance disclosure (including slower-than-JS benchmarks per §9)
- Build and verification instructions

No `README.md` existed at the project root (`picomatch-rust/README.md`).

### Updates Applied
Created [README.md](file:///Users/abhinav/Projects/pico-big/picomatch-rust/README.md) containing:
- Crate structure table (`pmx-core`, `pmx-exec`, `pmx-cli`, `pmx-node`)
- Full escape-hatch audit table showing zero `unsafe`/`unwrap` in production Rust source
- Benchmark performance summary (13 scenarios faster, 5 slower, 2 inconclusive)
- Known divergence disclosure (astral-input surrogate pair handling in `regress`)
- Complete build and test command guide

---

## 3. Decision Log & Plan Reconciliation (`DECISIONS.md`, `ADAPTER_PLAN.md`, `LATEST-UPDATES.md`)

### `DECISIONS.md` Numbering Notes
- Added explanatory notes documenting the draft numbering gaps (`D-05` and `D-09` through `D-014`).
- Confirmed single ownership for depth model decision `D-017`.

### `ADAPTER_PLAN.md` Process Spawn Note
- Section A2 specified *"thin forwarders spawning one long-lived pmx --serve process"*.
- In `adapter/_bridge.js`, synchronous `execFileSync` was implemented per-op for correctness-first test runner parity.
- Updated `ADAPTER_PLAN.md` with an explicit implementation note clarifying that single long-lived process transport is deferred to a performance optimization pass, while `PMX_ADAPTER=napi` bypasses process spawning entirely.

### `LATEST-UPDATES.md` Status Note
- The file contained historical notes stating "In progress: C3".
- Added a current status header linking to `AGENTS.md` and confirming that all parser chunks C0–C9 are complete with 100% test pass rate.
