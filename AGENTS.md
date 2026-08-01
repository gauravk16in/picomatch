# AGENTS.md — pmx Rust workspace

Rust port of `micromatch/picomatch` v4.0.5, bug-for-bug (parity includes upstream bugs — never "fix" matching). The entire constitution lives at `../agents.md` + `../promptspec.md` + `../promptreview.md` + `../claude.md` — read those first. Reverse-engineering/analysis docs live in the reference checkout: `../picomatch/{ARCHITECTURE,TEST_ANALYSIS,BEHAVIORAL_ORACLE,PARSE_STATE_MACHINE,PARSE_CHUNKS,C0_DESIGN,C1_DESIGN}.md`, plus `../picomatch/AGENTS.md` (repo-side rules).

## Boundaries

- **Reference is read-only, by path.** `fixtures/extract-*.js` hardcode `path.join(__dirname, '..', '..', 'picomatch')` — never edit anything under `../picomatch/lib|test|index.js|posix.js`; the extractors break and so does the oracle. Verify with `npm test` over there if you suspect damage.
- This workspace has its own git (separate from the reference). Commit per chunk loop with fresh gate output in the body (rulebook §11); `Cargo.lock` is committed, `target/` is gitignored.

## Layout (chunk-mapped, per PARSE_CHUNKS.md C0–C9)

- `crates/pmx-core/` — the only crate so far. Pure Rust: `#![forbid(unsafe_code)]`; runtime dep = `thiserror` only (dev-deps serde/serde_json for tests).
- `src/parse/` — `mod.rs` (parse() entry: REPLACEMENTS → guards → inline fastpath → main_loop → finish), `state.rs` (ParseState/Token arena, `Vec<u16>` emitted text), `parser.rs` (C0 machinery: cursor/push/recovery/rebuild), `fragments.rs`, `inline_fastpath.rs` + `main_loop.rs` (C1). Later chunks: `impl Parser` in their own file (braces.rs, brackets.rs, …).
- `fixtures/` — JS side of the oracle: `extract-cN.js` → `cN_oracle.json` → `verify-cN.js`; `canon.js` shared encoding; `attack-c*.js` adversarial differential harnesses.
- `tests/c0_foundation.rs` — the combined corpus-runner (loads all `*_oracle.json`); unit byte-pins live inline in `src/`.
- `examples/c0probe.rs` — differential JSONL probe: `{"i":n,"pattern":P,"options":{...}}` stdin → state projection stdout; fed by `fixtures/probe-c0.js`.
- `reviews/` + `.loop/review-ledger.md` — review artifacts; implementer never reviews own work.

## Commands

- Gates, every loop, paste real output: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` (from workspace root).
- Regenerate + verify a corpus (two separate steps, always both): `node fixtures/extract-c0.js && node fixtures/verify-c0.js` (same for c1, …).
- Adversarial differential against the reference: `node fixtures/attack-c0.js` (harmess drives both sides over generated inputs).
- Manual probe: `echo '{"i":1,"pattern":"a\\/b","options":{"bash":true}}' | cargo run -q --example c0probe`.

## Conventions (would-be-missed)

- **Corpus rows carry `chunk` and activate by threshold** (`active = chunk <= current` in extractors). A row whose expectations need an unbuilt branch must be **re-chunked and the corpus regenerated** — staging markers live as `chunk: N` + `note:`, never as expected-fail. Extractor and verifier must both run, then `cargo test` must stay green.
- **Emitted text is `Vec<u16>` everywhere** (UTF-16 units): JS can emit ill-formed strings (fastpath escapes astral halves individually). Corpora therefore encode non-ASCII emitted strings as `{ "__u16": [...] }`; tests compare **unit sequences**, not `String`s. Rust `String` fields only ever hold pattern-side text (`state.input`, `prefix`).
- **Non-finite f64 can't live in JSON**: options carrying `Infinity`/`NaN` are encoded `{ "__num": "..." }` by `fixtures/canon.js` (decOptions reverses it) — decode before use (see `f64_of` in tests).
- **Errors are byte-exact JS**: `PmxError` `Display` reproduces original strings, including `Input length: N, exceeds maximum allowed length: M` with JS number formatting (`utils::js_number`: `-0`→`0`, `-Infinity`, exponent thresholds). Class mapping lives in the test helper.
- **No escape hatches in `src/`**: no `unsafe`, `unwrap()`, `expect()`, `panic!()`, `todo!()`, or narrowing `as` casts — reviewers grep for them. Index arithmetic goes through `try_into().ok()`.
- **Fastpath and slow loop are two separately-oracled routes.** They can diverge by design (verified: `.*`, `*.js` differ byte-wise and behave-wise). Port BOTH as-is; never "align" them. `fastpaths:false` forces the slow loop for corpus coverage.
- **JS order is load-bearing**: `REPLACEMENTS` → length guard → `./` strip → inline fastpath → loop branches in exact source if-order → recovery (brackets → parens → braces; strictBrackets converts the first hit to a throw) → maybe_slash → rebuild. Recovery/maybe_slash/rebuild do NOT run on the fastpath route.
- **`push` truthiness is subtle**: empty value AND empty output skips `append` (and `consume`); text merge pulls `(prev.output || prev.value) + tok.value` with JS falsy semantics on `''`. These were review findings; don't re-derive from intuition.

## Current status

C0 (foundation) and C1 (inline fastpath + NUL/escapes/quotes/text) done and accepted (`reviews/c0-1.md` rejected once, `c0-2.md` accepted). Next per PARSE_CHUNKS.md: **C2 (slash + dot segment semantics)**. Before changing behavior of `*`, quotes, or dot-merge: read the staging notes in `src/parse/main_loop.rs` and the corpus rows they explain.
