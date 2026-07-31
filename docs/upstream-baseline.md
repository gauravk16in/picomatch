# Upstream Baseline

Status: **frozen** for bootstrap. Canonical repo facts live in `knowledge/repo-inventory.md`; this file is the stable narrative + the sync policy.

## Baseline identity (verified 2026-07-31)

- Oracle: picomatch **4.0.5**, commit `4f41a8edade7a5ab19832f7b40ecce46b288767f` (tag `4.0.5`, 2026-07-02).
- Fork `gauravk16in/picomatch` == upstream `micromatch/picomatch` (`0 0` divergence at clone). `upstream` remote configured; **do not merge/rebase/update automatically** — any sync requires a new ADR and re-validation of the corpus manifest.
- Package: engines `node>=12`; scripts `lint` (eslint), `mocha` (dot reporter), `test` = lint + mocha, `test:ci` = `test:cover` = nyc + mocha; dev deps eslint 8.57 / mocha 10.4 / nyc 15.1 / fill-range 7.0.1 / gulp-format-md 2.0.0; **no committed lockfile** (`.npmrc package-lock=false`) — `npm install` resolves floating dev deps; test behavior is the pinning mechanism, matching CI.
- CI (upstream `.github/workflows/test.yml`): node 12–25 × {ubuntu, windows, macos} (macos excludes 12/14); `npm install` then `npm run test:ci`; pinned actions (checkout v6 `de0fac2e`, setup-node v6 `53b8394`); coverage uploaded only on ubuntu+node25.
- README is generated from `.verb.md` (verb/gulp-format-md); CHANGELOG ends at 4.0.0 — 4.0.1..4.0.5 changes exist only in git log/releases (documented in repo-inventory §provenance).

## Baseline run (this machine, Windows 11, Node v24.13.0)

`npm install` exit 0 → `npm run mocha` **1977 passing** → `npm run test:cover` 1977 passing, stmts 93.2% / branches 89.81% / funcs 91.66% / lines 93.75% (all 2026-07-31 01:39–01:40 IST; see `implementation.md` baseline table). `npm run lint` exit 0 — re-verified 2026-07-31 ~19:45 IST after the F-04 fix (the bootstrap's own `tools/research/probe-regex-sources.js` had broken lint between 01:51 and the Phase 0 remediation; rule added: re-run baseline after adding/changing any tracked executable).

## Dependencies of test outcomes

- OS: `test/malicious.js` has one posix-only assertion (win32 guard). Many suites force `windows:` explicitly.
- Node version: none observed (CI spans 12–25).
- Locale/network/timing: none.
- Lockfile: none exists — dev-tooling drift is possible but does not affect the library code being ported.

## Bench baseline policy

Upstream `bench/` (benchmark.js vs minimatch) was **not** run in bootstrap (requires separate install, wall-clock heavy, machine-noisy). Recorded exact setup instead: `cd bench && npm install && node index.js [--run <regex>]`; deps benchmark 2.1.4, ansi-colors, minimist + devDeps glob-parent 6.0.2, minimatch 10.2.4. Measured baselines are Phase 10 work on a documented machine (D-008).

## Sync policy

The corpus manifest (Phase 1) hashes upstream `test/`. If upstream moves during the event, DO NOT follow automatically: file a new ADR, regenerate the corpus, and record behavior deltas. Current fork HEAD is the pinned oracle for the whole event unless that ADR says otherwise.
