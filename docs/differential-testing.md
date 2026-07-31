# Differential Testing Strategy

Status: strategy complete (spec §16, D-006 Accepted + amended 2026-07-31); implementation Phase 1 (corpus), Phases 4–8 (replay), Phase 2/3 (adapter spike), Phase 8 (adapter completion). Governing rule: **JavaScript executes only in dev/test tooling, never in the shipped Rust artifact** (event rule 05).

## 1. Architecture — three separate artifacts

```
(A) tools/oracle/* (Node, dev-only)  — Phase 1 PUBLIC-API ORACLE GENERATOR
     per-op case generators calling the original public API (+ lib/scan) directly
       → tests/corpus/v1/*.jsonl + v1.manifest.json (SHA-256 per file)

(B) corpus replay / differential runner — Phase 1 onward
     Node oracle records  vs  Rust CLI records  (same canonical schema)
       → artifacts/parity-report.json

(C) test/adapter/* (Node, dev-only) — ORIGINAL-MOCHA THIN ADAPTER
     require-interception facade redirecting the UNMODIFIED upstream suite
     to the Rust CLI (spike Phase 2/3, completion Phase 8)
       → per-file mocha parity table in the parity report
```

- (A) defines correctness data. It does **not** mechanically extract arbitrary Mocha assertions (see §10, explicit non-goal).
- (B) proves behavioral equivalence continuously.
- (C) proves original-suite compatibility for the 40% Functionality criterion. (C) is the highest-risk artifact and is pulled forward into a named spike (§11).

## 2. Ops

Canonical op enum (10) — defined ONLY in `tests/corpus/schema.v1.json`: `match`, `matchObject`, `isMatch`, `makeRe`, `parse`, `scan`, `test`, `matchBase`, `error`, `events`. Other documents reference the schema instead of restating the list.

## 3. JSONL corpus schema (v1)

```json
{
  "id": "extglobs/0042",
  "suite": "extglobs",
  "op": "match",
  "pattern": "+(a|b)",
  "patterns": null,
  "input": "abab",
  "options": {"dot": false, "windows": false},
  "expected": {"isMatch": true, "output": "abab"},
  "compareSource": false,
  "engine": null,
  "platforms": ["linux", "darwin", "win32"],
  "meta": {"sourceFile": "test/extglobs.js", "node": "v24.13.0", "oracleCommit": "4f41a8edade7a5ab19832f7b40ecce46b288767f", "indexUnits": "utf16_code_unit"}
}
```

Normalization (spec §5.3): `Infinity` → `{"__inf__":true}`; RegExp → `{source,flags}`; match arrays → JSON arrays (undefined → null); errors → `{errorClass,message}`; functions → `"@name"` registry ids; explicit undefined → `{"__undefined__":true}`; absent keys omitted. **Observable positions are UTF-16 code-unit offsets (D-013)**; scan/parse records declare `meta.indexUnits: "utf16_code_unit"`. Resource-limit outcomes (D-003) use `expected: {"errorClass": "ResourceLimitError", "kind": "backtrack_limit"|"stack_overflow"|"runtime"}` plus `meta.limitNote` and are classified `EXPECTED_LIMIT` (§7).

## 4. Named-function registry

Functions used by upstream tests are registered identically in JS (`tools/oracle/named-fns.js`) and Rust (`src/registry.rs`): e.g. `@format/stripDotSlash` (the exact `str => str.replace(/^\.\//, '')` from `test/options.onMatch.js:12` and `options.format.js`), `@expandRange/fillRange01_25` (README options example), `@onMatch/collect`, `@onResult/collect`, `@onIgnore/collect`. Corpus references the `@name`; both sides execute the local implementation. Event sequences record `{event: "onResult"|"onIgnore"|"onMatch", input, output, isMatch}`.

## 5. CLI protocol (v0 → v1)

Request: one JSON object per line on stdin `{id, op, pattern|patterns, input, options}`.
Response: `{id, ok, result|error}` with the same normalization. Deterministic: same request → same bytes. The adapter maps mocha assertions onto ops; the replay driver maps corpus records onto ops. Exit codes: 0 all-ok; 2 protocol error; 3 internal failure (never on valid ops after Phase 8).

## 6. Generation grammar (Phase 9 property/fuzz inputs)

Grammar produces valid and malformed patterns: literals (incl. spaces, unicode), escapes, quotes, `*` runs (1–4), `?`, globstars in all positions, brackets (valid/negated/ranges/posix/unknown/unclosed), braces (lists/ranges/nested/no-comma), extglobs (all operators, nesting ≤4, pipes, risky forms, unterminated), negations (single/double), slashes (leading/trailing/double), dot segments. Inputs: short paths, deep paths, dotfiles, backslash paths, unicode, empty string, NUL-containing, 64k±1 lengths.

Seeds: deterministic master seed recorded in the run manifest (`PROPTEST_SEED`/fuzz `-seed`); every mismatch must be shrinkable (proptest auto-shrink; `cargo fuzz tmin` for fuzz crashes) and promoted to `tests/fixtures/` with an ID.

## 7. Mismatch triage protocol

1. Reproduce against pinned oracle commit (never a moving target).
2. Classify: PORT-BUG (oracle and spec agree, port differs) → fix port; SPEC-GAP (behavior not in spec) → add spec requirement + corpus case + implement; ORACLE-QUIRK (oracle contradicts docs/Bash) → document in docs/compatibility-matrix.md + DECISIONS.md, keep oracle behavior (authority order spec §5.2); UPSTREAM-BUG (oracle self-inconsistent) → document, keep parity, Bug Catcher candidate (e.g. issue #175 line, D-011). **EXPECTED_LIMIT** (D-003): fallback backtrack budget tripped — not a mismatch; recorded with the typed `ResourceLimitError` outcome, reported in its own bucket in the fuzz/parity log, excluded from zero-divergence counting with the exclusion published.
3. Promote the case to tests/fixtures with the classification in metadata.
4. Never delete or skip a divergent case silently.

## 8. Curated edge corpus

Drawn from: FR-090 inventory, test/malicious.js, options matrix interactions, issue regressions (#15/#21/#23/#24/#58/#83/#89/#93/#171), ReDoS PoCs (GHSA PoCs + `+(ab|abab)`), windows drive/backslash sets, unicode/case-fold sets. **Non-ASCII index cases (D-013 acceptance, Phase 1 must generate):** BMP before/after slash (`フォルダ/**/*`, mirrors `test/api.scan.js:360`), astral (emoji) in base and glob segments, non-ASCII adjacent to prefix (`./`), brace, bracket, and extglob boundaries — asserting `start`/`slashes`/`parts` values in UTF-16 units.

## 9. Cross-platform CI cases

Replay matrix: {ubuntu, windows, macos} × {posix mode, windows mode} with OS-detection forced off (data-driven); plus one OS-detected smoke per platform (G-18). The single posix-only upstream assertion is gated by corpus `platforms` metadata (G-12).

## 10. Phase 1 public-API oracle generator (design — replaces any "extract every Mocha assertion" notion)

**Explicit non-goal:** mechanically walking upstream test files and converting arbitrary Mocha assertions into JSONL. That approach cannot preserve callbacks, closures, thrown-error assertions, helper state, and control flow without per-file engineering; the earlier "loses zero fidelity" claim is withdrawn (readiness-review F-03).

**Design (executable without guessing):**

- Per-op generator modules under `tools/oracle/`: `gen-match.js`, `gen-matchobject.js`, `gen-ismatch.js`, `gen-makere.js`, `gen-parse.js`, `gen-scan.js`, `gen-test.js`, `gen-matchbase.js`, `gen-error.js`, `gen-events.js`. Each builds cases by calling the **public API** of the pinned checkout (`require('../..')` and `require('../../posix')`; scan cases also call `require('../../lib/scan')` exactly as `test/api.scan.js` does).
- Case sources, in priority order: (1) machine-readable suites where expectations are already data (the large `match()`-driven suites via `test/support/match.js` semantics re-implemented in the generator, not imported); (2) hand-curated per-suite case lists mirroring each suite's intent, derived from reading the suite (the 37-suite mapping in `knowledge/test-inventory.md`); (3) the FR-090 edge inventory; (4) options-matrix interaction matrix; (5) D-013 non-ASCII index cases (§8); (6) ReDoS/safeguard set incl. `EXPECTED_LIMIT` demonstrations.
- Determinism: no randomness, no timestamps inside records; IDs `{suite}/{NNNN}` assigned in sorted order; `meta.node` and `meta.oracleCommit` recorded; generator output is byte-stable across runs (verified by double-run diff, same rule as the test-hash manifest).
- `events` records: produced by invoking matchers with the registry callbacks and capturing the ordered callback list; covers `onResult`/`onIgnore`/`onMatch` order and payloads, and the ignore-pipeline suppression rules (FR-005/FR-006).
- `error` records: exact class + message strings for every FR-018/FR-090 throw path.
- Self-replay: `tools/oracle/replay.js` re-executes every corpus record against the oracle and requires 100% agreement. Meaning and limit: self-replay proves the corpus is internally consistent with the pinned oracle; it does **not** prove the corpus covers the whole suite — coverage is evidenced by the per-suite case counts in the manifest and by the Phase 8 mocha-adapter run, not by self-replay.
- Manifest: SHA-256 per corpus file + aggregate, written to `tests/corpus/v1/v1.manifest.json`; linked from the parity report.
- Upstream-suite hash: the Phase 0 manifest `tests/test-hash-manifest.json` (aggregate `cc5a06a6…82cd`) pins the suite the corpus was derived from.

**Coverage standard (Phase 1 acceptance — what "covers the suite" means):** self-replay is never a coverage claim. The generator emits a quantified `coverage.json` report counting cases per dimension, and Phase 1 is done only when every dimension below is at 100% or has a named, reasoned exclusion:

| Dimension | Rule |
|---|---|
| Suite | every one of the 37 `.js` files has ≥1 generated case family (36 suites + the support-helper semantics) |
| Operation | each of the 10 ops is exercised by ≥1 suite per the op's schema entry |
| Behavior family | every family in the `knowledge/test-inventory.md` table maps to ≥1 case group per suite |
| Option | every canonical main+scan option (33/7 rows) has ≥1 positive and ≥1 interaction case from `options-matrix.md §interactions` |
| Platform mode | `windows:false` canonical + `windows:true` variants for separator-sensitive families; the 5 posix-only guard sites carry `platforms:["linux","darwin"]` |
| Error category | every FR-018/FR-090 throw path has an `error` op with exact class+message |
| Callback event | onResult/onIgnore/onMatch sequences + ignore suppression (FR-005/006) as `events` ops |
| UTF-16 edge | D-013 non-ASCII index cases (BMP + astral + boundary-adjacent) as `scan`/`parse` ops with `indexUnits` |
| Security case | maxLength boundaries, prototype names, risky-extglob literalization/rewrite, EXPECTED_LIMIT demonstrations |
| compareSource | the `.source` strictEqual family (options.maxExtglobRecursion, posix-classes `convert()`, extglobs L28, malicious L41) has `compareSource:true` where the port emits the identical string |
| Exclusions | any `it()`/assertion family not represented is listed with a one-line reason (e.g. RegExp-brand assertions that cannot cross JSON — covered instead by the adapter at Phase 8) |

Mechanical note: most suites are table-driven (`T` in the inventory), so per-suite case lists are derived from the suite's own data tables and cited as `meta.sourceFile`; the generator never fabricates expectations.

## 11. Original-Mocha thin adapter (spike Phase 2/3; completion Phase 8)

**Goal:** run the UNMODIFIED `test/*.js` suites under stock Mocha while every picomatch import resolves to a JS facade backed by the Rust CLI artifact.

**Interception/redirect strategy (no upstream file edits):** a bootstrap module registered via Mocha's `--require test/adapter/hook.js` (flag exists in mocha 10.x — verified locally 2026-07-31, mocha 10.8.2) patches `Module._load` and redirects exactly the request strings the suites use (probe-verified 2026-07-31): `..` and `../..` (package root), `../lib/scan` (api.scan.js), `../lib/utils` (regex-features.js), `../posix` (api.posix.js), `./support/match`, plus bare `picomatch`/`picomatch/posix` for robustness. All other requires (`assert`, `mocha`) pass through untouched. The patch is installed before suite loading and removed in a root `afterAll` hook. The upstream `test/` tree stays byte-identical to `tests/test-hash-manifest.json`.

**Facade surface (JS objects the tests actually use, verified by reading all 36 suites + the support helper):**

- `picomatch(glob, options?, returnState?)` → matcher function `(input, returnObject?)`; `matcher.state` when `returnState`.
- Static methods: `test`, `matchBase`, `isMatch`, `parse`, `scan`, `compileRe`, `makeRe`, `toRegex`, `constants`; plus the `posix` entry variant.
- **Facade regex (probe-verified design):** a REAL `new RegExp(jsFormSource, flags)` constructed in the adapter process, with `.test`/`.exec` replaced by own, non-enumerable, Rust-routed implementations. Evidence (2026-07-31, local probes): (a) a plain object with `RegExp.prototype` FAILS `assert.deepStrictEqual` against a regex literal; (b) a real RegExp PASSES it; (c) a real RegExp with shadowed non-enumerable `.test`/`.exec` STILL passes; (d) `.source`/`.flags`/`.toString()` stay intact; (e) `deepStrictEqual` compares `lastIndex` — kept at 0 (DV-2). Because the facade regex IS a real RegExp, `lib/picomatch.js:173`'s `glob instanceof RegExp` in matchBase is true, so matchBase works unmodified. Custom `.exec` returns JS-shaped arrays (`index`, `input`, holes as `undefined`, `groups`/`indices` only when present); `.test` tolerates extra arguments (test/slashes-windows.js:9 passes an options object).
- `scan` results: plain data objects with exact key presence/absence per options (e.g. no `slashes`/`parts` keys unless requested — `test/api.scan.js` uses `assert.deepStrictEqual` on whole objects).
- `test/support/match.js`: re-exported from the adapter with identical semantics (it calls the facade `picomatch(pattern, options, true)` and collects `match.output` into the provided `options.matches` Set or a new Set — helper is dev tooling, so the adapter MAY ship its own copy; the original file is never modified).
- Function-valued options (`format`, `expandRange`, `onMatch`, `onIgnore`, `onResult`) execute **in the adapter process** (they are JS closures): the facade applies `format` before/after the CLI call per `lib/picomatch.js:138-145` semantics, and invokes callbacks with the normalized result object in the FR-005 order. Only matching behavior crosses the CLI; closures never cross the wire.

**Synchronous IPC over an async process boundary:** two candidates, spike decides. (1) Per-call `child_process.spawnSync` — round-trip proven locally 2026-07-31 (JSON request/response, exit 0); at 1977 tests × a few ms per spawn this is the simplicity-first default with a recorded wall-clock budget (target <60s for the full adapter run on the dev box). (2) ONE long-lived CLI child per worker (stdin/stdout JSONL) with synchronous receive via `Atomics.wait` on a SharedArrayBuffer reader or `node:worker_threads` — the throughput optimization if (1) misses the budget. Matcher identity/caching: facade matchers keyed by `{pattern(s), options, posix}`; one `compile` request + N `match` requests per key.

**Errors:** thrown-error assertions (`assert.throws(() => …, /…/)` and class checks) map `PicomatchError` classes to facade error classes `TypeError`/`SyntaxError` with byte-identical `message`; `ResourceLimitError` (DV-6) maps to a named facade class for the safeguard suites' expectations where the oracle does NOT throw — recorded as divergence, not faked as a throw.

**Deep equality and captures:** exec/capture arrays cross the CLI as JSON arrays (`undefined` holes → `null`); the facade ALWAYS converts `null` back to `undefined` when rebuilding JS-shaped exec arrays (probe 2026-07-31: `assert.deepStrictEqual` distinguishes them — `/^(?:(a)|(b))$/.exec('b')` yields `[ 'b', undefined, 'b' ]`, and Node 24 exec arrays carry `index`/`input` with `groups`/`indices` absent without named groups or `/d`). RegExp-source comparisons run only where `compareSource` is achievable (D-002; the JS-form source is preserved for shape assertions regardless).

**Lifecycle/protocol:** JSONL framing; per-request timeout (default 5 s, kill + `internal error` on expiry); child stderr captured into the adapter log; crash → restart once, then fail the suite with a named error; deterministic shutdown at Mocha root-hook teardown; no orphaned processes on Windows.

**Spike (Phase 2/3, named `adapter-spike`):** prove the design on 2 representative suites before broad implementation: `test/api.scan.js` (deep-equality data shapes, internal `../lib/scan` require) and `test/options.onMatch.js` (function options, callbacks, `require('..')` + support helper). Success criteria: both suites pass unmodified, or every failure has a named mechanism gap with a fix plan. Failure criteria → fallback: per-suite custom drivers for the 36 suites (mechanical, already mapped in `knowledge/test-inventory.md`) with the same parity-report format; the fallback is documented as a scoring-risk mitigation, never as silent scope reduction.

**Completion (Phase 8):** all 36 suite files (37 `.js` incl. `test/support/match.js`) driven through the adapter; per-file pass table in `artifacts/parity-report.json`; target 1977/1977 or an honest named subset (spec §20).

## 12. Reporting

Every replay emits `artifacts/parity-report.json`: totals per suite/op, failing ids with first-diff context, engine split (regex vs fallback), `EXPECTED_LIMIT` bucket, and a SHA-256 of the corpus used. Phase 8 attaches the mocha-adapter per-file table (1977 target).
