| module | reviewed_at | verdict | findings_open |
|---|---|---|---|
| C0 | 2026-08-01 | REJECT | 1 BLOCKER (globstar fragment parens), 2 MAJOR (f64-Display message bytes; canon.js astral encoder corrupts corpus), 3 MINOR (I-1 struct delta, I-8 missing, as-casts) |
| C0 | 2026-08-01 | ACCEPT (iter 2) | 1 MAJOR (serde_json f64 decode in JSON transports is not correctly rounded — harness fixed review-side, 5000/5000 re-attack clean; implementer owes DECISIONS.md entry for §4b adapter), 4 MINOR (I-1 delta undeclared, windows globstar byte-pins missing, stale corpus-sha comment, workspace not a git repo) |

## Dispositions (Teammate 2 Chunk 1, 2026-08-01; historical rows above untouched)

| c0-2 finding | disposition | evidence |
|---|---|---|
| MAJOR-1 — implementer owes DECISIONS.md number-transport entry | **RESOLVED** | root `DECISIONS.md` **D-014** (decimal-string transport; serde_json default f64 not correctly rounded, serde-rs/json#536; §4b adapter constraint) + convention bullet in `AGENTS.md` |
| MINOR — windows globstar byte-pins missing | **RESOLVED (pre-existing, verified)** | `crates/pmx-core/src/parse/fragments.rs:85-102` `globstar_fragment_bytes_match_reference_windows` — 4 windows strings pinned; green under `cargo test` this chunk |
| MINOR — stale corpus-sha comment in c0_foundation.rs | **RESOLVED** | corpora regenerated against `../Main` (extractor path repaired `../picomatch` → `../Main`); actual hashes computed (c0 `663115f8d935…`, c1 `de692974eebd…`) and comments updated; verify-c0 39/39, verify-c1 55/55, double-regeneration byte-identical |
| MINOR — workspace not a git repo | **SUPERSEDED by restructure** | workspace is now dual-checkout: `../Main` (origin/main `00cf02c`, read-only reference) + `./` (origin/rust-port `838d26a`; working branch `chirag-rust-port`), each an independent git clone |
| MINOR — I-1 `braces`/`len` delta undeclared | **RESOLVED (pre-existing)** | declared in `C0_DESIGN.md:17` (post-review amendment note); brace frames remain C5-owned per design |
