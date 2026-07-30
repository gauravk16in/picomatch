# Differential Testing Strategy

Status: strategy complete (spec §16, D-006 Accepted); implementation Phase 1 (corpus), Phases 4–8 (replay). Governing rule: **JavaScript executes only in dev/test tooling, never in the shipped Rust artifact** (event rule 05).

## 1. Architecture

```
upstream JS (oracle, @4f41a8e)
  └─ tools/oracle/generate-corpus.js (Node, dev-only)
       → tests/corpus/v1/*.jsonl + v1.manifest.json (SHA-256 per file)
crates/picomatch-cli (Rust artifact)
  ← JSONL replay via CLI protocol (stdin/stdout)
  ← mocha adapter (test/adapter/run-mocha.js) executing ORIGINAL test files against the CLI
```

## 2. Ops

`match` (matcher bool), `matchObject` (rich result, P1 normalized), `isMatch`, `makeRe` (source+flags; `compareSource` flag), `parse` (state projection), `scan` (full normalized state), `test`, `matchBase`, `error` (errorClass+message), `events` (callback sequence).

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
  "meta": {"sourceFile": "test/extglobs.js", "node": "v24.13.0", "oracleCommit": "4f41a8e"}
}
```

Normalization (spec §5.3): `Infinity` → `{"__inf__":true}`; RegExp → `{source,flags}`; match arrays → JSON arrays (undefined → null); errors → `{errorClass,message}`; functions → `"@name"` registry ids; explicit undefined → `{"__undefined__":true}`; absent keys omitted.

## 4. Named-function registry

Functions used by upstream tests are registered identically in JS (`tools/oracle/named-fns.js`) and Rust (`src/registry.rs`): e.g. `@format/stripDotSlash`, `@expandRange/fillRange01_25`, `@onResult/collect`. Corpus references the `@name`; both sides execute the local implementation. Event sequences record `{event: "onResult"|"onIgnore"|"onMatch", input, output, isMatch}`.

## 5. CLI protocol (v0 → v1)

Request: one JSON object per line on stdin `{id, op, pattern|patterns, input, options}`.
Response: `{id, ok, result|error}` with the same normalization. Deterministic: same request → same bytes. The adapter maps mocha assertions onto ops; the replay driver maps corpus records onto ops. Exit codes: 0 all-ok; 2 protocol error; 3 internal failure (never on valid ops after Phase 8).

## 6. Generation grammar (Phase 9 property/fuzz inputs)

Grammar produces valid and malformed patterns: literals (incl. spaces, unicode), escapes, quotes, `*` runs (1–4), `?`, globstars in all positions, brackets (valid/negated/ranges/posix/unknown/unclosed), braces (lists/ranges/nested/no-comma), extglobs (all operators, nesting ≤4, pipes, risky forms, unterminated), negations (single/double), slashes (leading/trailing/double), dot segments. Inputs: short paths, deep paths, dotfiles, backslash paths, unicode, empty string, NUL-containing, 64k±1 lengths.

Seeds: deterministic master seed recorded in the run manifest (`PROPTEST_SEED`/fuzz `-seed`); every mismatch must be shrinkable (proptest auto-shrink; `cargo fuzz tmin` for fuzz crashes) and promoted to `tests/fixtures/` with an ID.

## 7. Mismatch triage protocol

1. Reproduce against pinned oracle commit (never a moving target).
2. Classify: PORT-BUG (oracle and spec agree, port differs) → fix port; SPEC-GAP (behavior not in spec) → add spec requirement + corpus case + implement; ORACLE-QUIRK (oracle contradicts docs/Bash) → document in docs/compatibility-matrix.md + DECISIONS.md, keep oracle behavior (authority order spec §5.2); UPSTREAM-BUG (oracle self-inconsistent) → document, keep parity, Bug Catcher candidate (e.g. issue #175 line, D-011).
3. Promote the case to tests/fixtures with the classification in metadata.
4. Never delete or skip a divergent case silently.

## 8. Curated edge corpus

Drawn from: FR-090 inventory, test/malicious.js, options matrix interactions, issue regressions (#15/#21/#23/#24/#58/#83/#89/#93/#171), ReDoS PoCs (GHSA PoCs + `+(ab|abab)`), windows drive/backslash sets, unicode/case-fold sets.

## 9. Cross-platform CI cases

Replay matrix: {ubuntu, windows, macos} × {posix mode, windows mode} with OS-detection forced off (data-driven); plus one OS-detected smoke per platform (G-18). The single posix-only upstream assertion is gated by corpus `platforms` metadata (G-12).

## 10. Reporting

Every replay emits `artifacts/parity-report.json`: totals per suite/op, failing ids with first-diff context, engine split (regex vs fallback), and a SHA-256 of the corpus used. Phase 8 attaches the mocha-adapter per-file table (1977 target).
