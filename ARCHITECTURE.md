# ARCHITECTURE.md — Picomatch→Rust Port Architecture

High-level, stable architecture. Detailed semantics live in `spec.md`; rationale lives in `DECISIONS.md`. Baseline source: picomatch 4.0.5 @ `4f41a8e`.

## 1. Context

Picomatch compiles glob patterns into regular-expression sources, then matches strings. The port mirrors this two-stage design: a faithful Rust transliteration of the scanner/parser producing a regex-source IR, and a dual-engine matcher because Rust's `regex` crate (linear-time, no lookaround) cannot express the lookaround subset of the emitted sources (D-002, D-003).

## 2. Component diagram

```mermaid
flowchart LR
    subgraph Input
        P[Pattern string] --> S
        O[Options] --> S
    end

    subgraph crates/picomatch
        S[scan.rs\n(scanner: base/glob split,\ntokens/parts/maxDepth)]
        P2[parse.rs\n(parser state machine,\ntokens + backtrack rebuild)]
        C[compile.rs\n(compileRe: anchors,\nnegation wrap, fastpaths)]
        IR[Regex-source IR\n(JS-form string + analysis)]
        ES{{engine_select.rs\nlookahead present?}}
        RE[regex_engine.rs\n(rust `regex`, linear-time)]
        FB[fallback.rs\n(fancy-regex, backtrack-limited)]
        M[matcher.rs\n(test: equality fast path,\nformat, matchBase, capture)]
        API[lib.rs public API\n(picomatch(), Matcher,\nisMatch, parse, scan,\nmakeRe, compileRe, toRegex,\nmatchBase, constants)]
        UT[utils.rs + constants.rs\n(POSIX/WINDOWS tables,\nescapes, basename)]
    end

    P --> S
    S --> P2
    P2 --> C
    C --> IR
    IR --> ES
    ES -->|no lookaround| RE
    ES -->|lookaround subset| FB
    RE --> M
    FB --> M
    M --> API
    UT --> P2
    UT --> M

    subgraph crates/picomatch-cli
        CLI[JSON stdin/stdout protocol\n(ops: 10, canonical enum in\ntests/corpus/schema.v1.json)]
    end
    API --> CLI

    subgraph Dev-only tooling
        ORA[tools/oracle (Node.js)\ngenerates JSONL corpus\nfrom upstream JS]
        ADP[test/adapter (mocha)\nruns original suite vs CLI]
        CORP[(tests/corpus/v1\nJSONL + SHA-256 manifest)]
    end
    ORA --> CORP
    CORP --> CLI
    CLI --> ADP
```

## 3. Data flow

1. `picomatch(glob, options)` → REPLACEMENTS pre-pass → maxLength check → (fastpath attempt if `.`/`*`-led) → full parse producing token stream + `output` (JS-form regex source) → compileRe wraps `^(?:…)$` / negation → engine selection → compiled matcher.
2. `matcher(input)` → equality fast path (`input===glob`, `format(input)===glob`) → matchBase branch or regex exec → result `{isMatch, match, output}` → callback pipeline (`onResult`→`onIgnore`→`onMatch`).
3. `scan(input)` → independent lightweight scanner (never shares state with parser).
4. CLI: one JSONL request in → one normalized JSON response out; adapter drives the original mocha suite through it.

## 4. Module boundaries and invariants

| Module | Owns | Invariants |
|---|---|---|
| `scan.rs` | FR-050..053 | output field set fixed; depth Infinity sentinel only for globstar tokens; no panics on malformed input; **observable positions are UTF-16 code-unit offsets (D-013)** |
| `parse.rs` | FR-060..065, 020..029, 035..039 | `bos` first token; counters never negative; backtrack ⇒ full rebuild from tokens; output is JS-form source; **index/start/consumed are UTF-16 code-unit offsets (D-013)** |
| `compile.rs` | FR-013..015, 037 | wrap/negate/flag rules identical to lib/picomatch.js; `/ $^ /`-equivalent never-match on internal failure (unless debug) |
| `engine/*` | FR-070..074 | deterministic selection; fallback `backtrack_limit` enforced; identical accept/reject across engines for same source; budget trip ⇒ typed `ResourceLimitError` (DV-6) |
| `matcher.rs` | FR-008, 009, 071, 082 | equality fast path before regex; format defaulting per windows mode |
| `api (lib.rs)` | FR-001..018, 040, 041 | argument errors = TypeError messages verbatim; no state mutation across calls (except documented flags:'g' edge, FR-091) |
| `options.rs`, `result.rs`, `error.rs` | Phase 3 types | serde-round-trip == CLI JSON schema |
| `constants.rs`, `utils.rs` | FR-016, 080, 081 | tables byte-identical to lib/constants.js; POSIX class map closed (14 keys) |

## 5. Platform abstraction

- `PlatformMode::{Posix, Windows}` selects the fragment table (WINDOWS_CHARS vs POSIX_CHARS) — ported verbatim from lib/constants.js.
- Constructors: `picomatch::new` (OS-detect when `windows` unset, mirroring index.js) and `picomatch::posix` (never detects, mirroring posix.js).
- No `std::path` usage anywhere in matching — inputs are plain strings; separators are handled as character classes (`/` vs `[\\/]`), matching upstream exactly.

## 6. Testing seams

- **Corpus seam:** every public op is reachable through the CLI protocol → differential replay without Rust test-code duplication.
- **Adapter seam:** the unmodified upstream mocha suite reaches the CLI through `test/adapter/hook.js` require interception (docs/differential-testing.md §11); mechanism proven by the Phase 2/3 adapter-spike before broad implementation.
- **Engine seam:** engine selection is injectable in tests to force both engines over the same case.
- **Named-function seam:** format/expandRange/callbacks resolve through a registry so JSONL can reference them (D-006).
- **Time/step seam:** fallback engine budget configurable via Options (default documented in docs/security.md).

## 7. Security boundaries

- `#![forbid(unsafe_code)]` (D-009). No FFI, no process spawning in library code.
- maxLength enforced before any allocation proportional to pattern length (NFR-001).
- Risky-extglob safeguard ported 1:1 (NFR-002) — it is a *semantic* feature (changes match results), not just hardening.
- Fallback engine budget = bounded worst case for lookaround subset (NFR-004, D-003); exceeding budget ⇒ typed `ResourceLimitError` (DV-6) — a visible, testable outcome, never a silent no-match and never a hang.
- Node.js exists only in dev tooling (oracle generator, mocha adapter driver); shipped crates have zero JS dependency (D-006, event rule 05).

## 8. Dependency rules

- Runtime: `regex` (primary engine), `fancy-regex` (fallback, pending Phase 5 validation), `serde` only where CLI schema requires.
- Dev: proptest, criterion, serde_json, libfuzzer-sys (Linux CI only).
- Everything pinned via Cargo.lock; policy and license table in knowledge/dependency-evaluation.md (D-005).

## 9. What this architecture deliberately does NOT do

- No custom regex engine for the whole language (ReDoS + scope, D-002).
- No filesystem walking (upstream is in-memory only).
- No pre-existing-port code or design copying (D-010).
- No caching layer (upstream removed caching in 2.0.0 — nothing to port).
