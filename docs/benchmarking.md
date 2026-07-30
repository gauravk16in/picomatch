# Benchmarking Methodology

Status: methodology defined (spec §15/§18, D-008 Accepted); execution Phase 10. Hard rule: **no cherry-picked claims** — every number ships with workload, environment, command, and raw results JSON (event §09).

## Workloads (shared by JS oracle and Rust port)

| ID | Workload | What it measures |
|---|---|---|
| B1 compile | `makeRe` over the upstream bench pattern set (star, dot-star, globstar, globstars, leading star, braces) | parse/compile throughput |
| B2 cold one-shot | construct matcher + single match, fresh per iteration (e.g. `*.txt` vs `foo/bar/baz/qux.js`) | startup + first-use latency |
| B3 cached hit | one precompiled matcher × N matching inputs (`**/*.js` over corpus paths) | steady-state match throughput (matching) |
| B4 cached miss | same × N non-matching inputs | steady-state match throughput (non-matching) |
| B5 adversarial | risky/pathological set: `+(a|aa)`, `+(ab|abab)` (bounded), `+(+(a))`, deep globstars, 65k-escape pattern, 64k input | worst-case behavior vs oracle (both bounded by budgets) |
| B6 allocations/size | compile-time allocation profile (dhat/counted-alloc) + stripped binary size | memory footprint, artifact size |

## Metrics

p50, p95, **p99** latency; ops/sec throughput; **RSS** (peak); **startup time** (process spawn to first answer, CLI); binary/library size; distributions (histograms), not just averages. Confounders recorded: CPU, cores, RAM, OS, governor/turbo state, Node version, rustc version, crate versions, background load class, warmup.

## Controls

- Criterion (Rust): defaults sample 100 / warm-up 3s / measurement 5s; Flat sampling for slow benches (B5); significance 0.05, noise threshold 0.01; `--save-baseline v1` then `--baseline v1` for regressions (Context7 /bheisler/criterion.rs).
- JS: upstream `bench/index.js` (benchmark.js) for B1/B2-class numbers + a small `tools/bench/js-baseline.js` for B3–B5 (same workloads, same machine, recorded env).
- Same machine for JS and Rust runs in one sitting; AC power; three repetitions; median-of-runs reported with spread.
- Benches smoke-run in CI (`cargo test --benches`) but **numbers are produced on documented hardware**, never from shared CI runners.

## Honesty rules

- Slower results are published as-is with analysis (event FAQ: hiding a regression scores worse than disclosing it).
- Any optimization lands only after a measured baseline identifies the blocker (plan Phase 10); before/after numbers recorded.
- The risky-extglob adversarial set is reported against the ORACLE's own timings as well (documenting, not fixing, upstream behavior — D-011).

## Report shape (`bench/`)

- `bench/methodology.md` — this file's content rendered with the actual environment table.
- `bench/results.json` — raw per-workload distributions + environment + tool versions + corpus hash.
- README section summarizes ratios with links to results.json (no bare "X× faster" claims without the JSON).
