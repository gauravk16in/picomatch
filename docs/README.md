# docs/ — Stable Engineering Documentation

One canonical home per topic. Cite evidence, state current status, link to spec requirements (FR/NFR) and decisions (D-xxx). Update rule: change only when reality changes; record the change in `implementation.md`.

| File | Topic | Answers | Links |
|---|---|---|---|
| `upstream-baseline.md` | The exact oracle | commits, versions, scripts, CI, LOC, baseline results | repo-inventory |
| `api-compatibility.md` | JS API → Rust API mapping | every export, shape, error, callback | spec §6 |
| `glob-semantics.md` | Pattern language semantics | wildcards, globstars, braces, extglobs, dots, Bash divergences | spec §7 |
| `parser-and-scanner.md` | Module decomposition | scanner contract, parser state machine, invariants, migration risk | spec §9–10 |
| `rust-design-options.md` | Engine strategy comparison | 4 strategies compared; why hybrid | D-002..D-004 |
| `differential-testing.md` | Oracle-based testing | JSONL schema, runners, normalization, triage | spec §16, D-006 |
| `fuzzing.md` | Fuzz strategy | targets, seeds, structure-aware inputs, gates | spec §16, D-007 |
| `benchmarking.md` | Benchmark methodology | workloads, metrics, controls, reporting | spec §15, §18, D-008 |
| `security.md` | Security & failure modes | CVE history, threat matrix, safeguards, unsafe policy | spec §14, D-009, D-011 |
| `compatibility-matrix.md` | Behavior-by-behavior status | requirement → oracle evidence → port status | spec §20 |
| `build-and-ci.md` | Build/test/CI contract | one-command builds, matrix, Docker | spec §17 |
| `licensing.md` | License compliance | MIT obligations, attribution, dep licenses | spec §19, D-005 |
| `submission-checklist.md` | Submission readiness | every artifact + evidence + owner | context §3 |
| `demo-plan.md` | Demo video plan | script, environment, fallback | context §3 |

Where facts belong: stable explanations here; distilled cited facts in `knowledge/`; raw outputs in `scratch/`; decisions in `DECISIONS.md`; progress in `implementation.md`.
