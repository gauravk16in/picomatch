# knowledge/ — Distilled, Cited Facts

This directory holds the evidence base: distilled facts with sources. Stable explanations live in `docs/`; raw outputs live in `scratch/`; decisions in `DECISIONS.md`.

| File | Contents | Update rule |
|---|---|---|
| `search-ledger.md` | every purposeful research query (61), tool, result, follow-up, saturation status | append during research sessions only |
| `source-ledger.md` | every source used: URL/file/command, date, type, claims supported, reliability | append when a new source is cited anywhere |
| `repo-inventory.md` | upstream tree, LOC, test inventory summary, CI, provenance, baseline results | update when baseline re-run or sync considered |
| `test-inventory.md` | upstream test file → port mapping + normalization rules | update when corpus schema changes |
| `options-matrix.md` | documented main + scan options (canonical counts: 33 main rows incl. 2 aliases, 7 scan rows incl. 3 shared): defaults, scope, behavior, interactions, removed options | update if upstream changes or a gap is found |
| `dependency-evaluation.md` | crate candidates, versions, licenses, verdicts, policy | update at every dependency decision |
| `prior-art.md` | pre-existing ports (do-not-copy register) + comparators | update if new prior art surfaces |
| `research-gaps.md` | G-01..G-18: unresolved facts, defaults, blast radius, verification phase | close gaps as they verify; add new ones as found |
| `sources/` | reserved for small captured evidence excerpts (quotes) with attribution | only short excerpts, never bulk copies |

Citation format for commands: `(verified: ran \`<cmd>\` from \`<cwd>\` on \`<timestamp>\`; exit \`<code>\`; see \`<log path>\`)`.
