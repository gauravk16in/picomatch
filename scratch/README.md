# scratch/ — Disposable, Non-Authoritative Workspace

Everything here is **disposable research material**: raw command outputs, generated corpora experiments, diagrams, temporary scripts, probe JSON. Nothing here is evidence until promoted into `knowledge/` with a source citation. Do not reference scratch files from `spec.md`, `plan.md`, or `DECISIONS.md` as authority — they may be deleted at any time.

Current contents (bootstrap):

| File | What | Disposition |
|---|---|---|
| `probe-regex-sources.json` | ~60 exact `makeRe` sources + errors + match samples (from `tools/research/probe-regex-sources.js`, 2026-07-31) | cited as `[probe:...]` shorthand in docs; regenerate anytime with the harness |
| `git-log.txt` | recent upstream history | informational |

Large/generated artifacts (node_modules, target/, artifacts/, corpus v1 outputs later) belong to `.gitignore` — see root `.gitignore` additions on the `chirag` branch. Required submission evidence (parity reports, fuzz logs, bench results) is NOT scratch and lives in `artifacts/`, `fuzz/`, `bench/` respectively.
