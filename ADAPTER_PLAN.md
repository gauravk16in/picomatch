# ADAPTER_PLAN.md — JS↔Rust adapter, build system, CI (chunked, one at a time)

This plan sequence is from the constitution (`../agents.md` §2 crates layout, §4 test parity, §4b subprocess adapter, §9 benchmarks, §11 loop discipline, §12 prohibitions). It parallels the parser track (C0–C9) without interrupting it.

**Order of work rule (same as parser): exactly ONE sub-chunk at a time; each ends with a green verification gate; nothing proceeds while red.**

## Current reality (starting state, verified this week)

- Parser: pmx-core has C0–C3 (orphan: adversarial-attack + final review pending on C3 — see S0).
- `fixtures/*_oracle.json` corpora pass; `scan.rs` port merged with 3,072-case oracle; `DECISIONS.md` D-01..D-04.
- No adapter, no `tests/original/`, no `pmx-exec`, no CLI, no CI for the pmx workspace, no BUILD.md.
- Reference runs at `../Main` (symlink → `picomatch`) for all fixture tooling.

## S0 — Close out C3 (bounded; do this first or park explicitly)

**STATUS: PARKED (user decision, 2026-08-02).** C3 is implemented, corpus generated, all gates green — final adversarial attack + independent implementation review + freeze remain open. Nothing is lost: `wildcards.rs` stays green in `cargo test` and `verify-c3 35/35` deterministic; S0 resumes the moment the user calls it. All open work is itemized in `LATEST-UPDATES.md` → Immediate next steps.
- Tasks: cap `attack-c3.js` at ~400 generated cases w/ prebuilt binary (`cargo build --examples` then `target/debug/examples/c3probe` — previous slowness was probe-per-row startup, not the parser), expect `0` divergences; spawn independent implementation review (`../promptreview.md` profile) on `wildcards.rs` + dispatcher + corpus rows; make fixes; freeze.
- Verify: `node fixtures/attack-c3.js` → `divergences: 0`; review verdict ACCEPT written to `reviews/c3-1.md`; gates green.

## S1 — Workspace spine & git hygiene

- Tasks: confirm `[workspace] members` covers what exists and what we're about to add (`pmx-exec`, `pmx-cli` stubs created EMPTY but compiling — empty crates only, no behavior); add `crates/pmx-exec` + `crates/pmx-cli` skeletons with `#![forbid(unsafe_code)]`; write **`BUILD.md` v1** (cargo fmt/clippy/test commands, corpus regen cycle, layout map); commit.
- Verify: `cargo build --workspace` green from a clean `target`; `BUILD.md` commands all execute unchanged on a fresh checkout.

## S2 — `tests/original/` byte-frozen copy

- Tasks: copy `../Main/test/**` → `tests/original/` **verbatim**, generate `tests/original/HASHES.txt` (sha256 of every file), never edit again. Include `test/support/match.js`.
- Verify: `cd tests/original && node -e "`for hashes…`"` matches a fresh re-hash of `../Main/test`; `sha256sum -c HASHES.txt` clean on two consecutive runs.

## A1 — `pmx-cli` + `pmx --serve` (subprocess adapter, §4b — no FFI)

**STATUS: DONE (2026-08-02).** `pmx --serve` reads JSONL ops `ping|parse|scan` on stdin → projected answers (u16-unit emitted text, error class+message) on stdout; `pmx --version` works. Verification: `fixtures/a1-smoke.js` → `50 requests | pass: 50 | fail: 0` against the reference (15 c1 + 15 c3 parse rows + 20 scan_oracle rows), plus ping/version checks. Gates across workspace green. Note: the `makeReSource` op is *deliberately deferred* — `makeRe` needs the C4 fastpaths-gallery + compileRe wrap (parser-track work), not an adapter stub.

- Tasks: `pmx` binary: `pmx --serve` reads JSONL `{"op":"parse|scan|makeReSource","pattern":…,"options":{…}}` on stdin → JSONL results on stdout (same projection encoding as c3probe: `Vec<u16>` units, error class+message, exact `js_number` semantics already in core). Also `pmx --version`.
- Verify: a 20-line node harness round-trips 50 corpus patterns; outputs equal the reference byte-for-byte (reuse `fixtures/attack-c3.js`'s comparator, now over the --serve op).

## A2 — JS adapter shims (the 4 require surfaces, §4)

**STATUS: DONE (2026-08-02).** `adapter/{package.json(=picomatch),_bridge.js,index.js,posix.js,lib/scan.js,lib/utils.js}` implemented. `index.js` exposes `.parse` (forces `fastpaths:false` per reference semantics) and `.scan`; the matcher factory and `makeRe/compileRe/toRegex/test/matchBase/isMatch` throw loud `TODO(pmx): …` (never silent stubs). `index.js` windows-defaulting quirk `{133}` preserved; spawnSync transport (sync test surfaces), `PMX_QUIET` banner control. Verification `fixtures/a2-smoke.js`: `parse 18 ✓ | scan 20 ✓ | quirk ✓ | TODO-loud 6 ✓ | basename 6 ✓` + all workspace gates green.

**Discovered by smoke (now on record — chunk-boundary public-surface limitations, NOT adapter bugs):**
- `.parse` on comma-containing patterns can't be byte-compared until **C5** (JS `parse.js:L958-L969` emits `comma` tokens even outside braces; rows `fp.literal.run` class). `id fp.literal.run → C5(,)`.
- `.parse` on `**`-containing patterns can't be byte-compared until **C8** (second-star empty-output L1145-class). `id fp.star.run → C8(**)`.
- Both are deliberately visible in `a2-smoke.js` as printed "open-surface notices", never expected-fail corpus entries.

- Tasks: `adapter/` package mirroring the required require-paths:
  - `adapter/package.json` = `{"name":"picomatch"}` so tests' `require('..')` resolves here;
  - `adapter/index.js`, `adapter/posix.js`, `adapter/lib/scan.js`, `adapter/lib/utils.js` — thin forwarders spawning **one long-lived** `pmx --serve` process; cover the scan/utils APIs first (they exist end-to-end; `index/posix` initially expose only what parse supports today and throw explicit `TODO(pmx): …` for unsupported *match* paths — never silent stubs).
    > **Implementation note (2026-08-03):** The current adapter uses synchronous
    > `execFileSync` spawn-per-op for correctness-first parity testing. The long-lived
    > process optimization is deferred to a future performance chunk. The napi transport
    > (`PMX_ADAPTER=napi`) bypasses this entirely.
- Verify: `node -e` assertions per surface vs reference on corpus-derived cases; shim handles malformed input without crashing the worker.

## A3 — `pmx-exec`: ECMAScript regex execution (dependency for all boolean parity)

**STATUS: DONE (2026-08-02).** `pmx-exec` on `regress` 0.11.1 (`utf16` feature): `is_match(source_units, input_units, ExecFlags)`; CLI op `regexTest`; adapter `picomatch.toRegex` implemented with flags resolution and `.test` engine-backed (`.exec` TODO-loud until capture plumbing). Verified: `fixtures/attack-a3.js` → **148,488 compared | other divergences: 0 | engine errors: 0**; `a3-smoke` 12/12 toRegex.test parity; boundary boundary test `engine_boundary_astral_class_is_documented` encodes the one known engine difference (regress coalesces astral surrogate-pairs in bracket classes where V8 consumes one unit — 114/148k = 0.077%), documented in DECISIONS.md **D-018** with boundary mechanics so an engine fix flips the test loudly. Gates: fmt/clippy `-D warnings`/test all green workspace-wide.

- Tasks: add `regress` crate (pure-Rust ES-regex engine, per constitution §2/D-07 template = Design entry D-05 to write); `pmx-exec::test(state.output, input, options) -> bool`; wire into CLI op `test`/`isMatch` and extend adapter shims.
- Verify: differential boolean corpus (extracted from `../Main` via new `fixtures/extract-match.js`) over the C0–C3 surface (wildcards/slashes/text/quotes/escapes): 0 divergences in ≥400 cases; gates green. **This is the chunk that turns the original suite's red `isMatch` rows into real numbers.**

## B1 — First parity numbers (scan + parse-adjacent suite files)

**STATUS: BASELINE ESTABLISHED (2026-08-02).** `npm run parity` (`fixtures/parity-run.js`) runs original-suite files one-by-one through the adapter with mocha `--reporter json`, writes `bench/parity.json` (per-file pass/fail + itemized failure titles). Factory input validation (`TypeError 'Expected pattern to be a non-empty string'`) implemented exactly per picomatch.js:L56-L60 → api.picomatch validation test passes. Current baseline:

```
api.scan.js:      40/40  (100% — scan port + bridge fully green)
api.picomatch.js:  2/24  (validation ✓, parse-describe ✓; 22 fail on matcher/makeRe surfaces, TODO-loud until A3-wiring/C4)
parity:           42/64 across 2 files → bench/parity.json
```

The 22 competently-red rows decompose: isMatch (needs makeRe + matcher, parser-track), matcher factory (same), `state`/`returnState` (matcher.state). Each re-fails visibly per run until its chunk lands — never hidden.

- Tasks: `npm run parity` harness (package.json script): `npx mocha tests/original/api.scan.js tests/original/api.picomatch.js --reporter dot` via the adapter; write `bench/parity.json` with **per-file, honest counts** (pass/total per file).
- Verify: JSON written with real numbers; failures are itemized, not summarized.

## B2 — Resume parser track C4–C9 to the API surface

- Tasks: existing chunk loop (`../pmx/PARSE_CHUNKS.md`), one chunk at a time. Each chunk: adapter surface grows correspondingly (no API promises ahead of chunks).
- Verify: per-chunk corpus + gates + parity delta always moving up; per-file parity table updated.

## B3 — `pmx-node` (napi-rs adapter, fast path, optional per rulebook)

**STATUS: DONE (2026-08-03).** `crates/pmx-cli` split into lib+dispatch+bin; `crates/pmx-node` (napi-rs 2.x + napi-build) exports ONE synchronous generic op plus version; `_bridge` transport selector via `PMX_ADAPTER` (`serve` default, `napi` opt-in). Addon build: `cargo build -p pmx-node && cp target/debug/libpmx_node.* adapter/native/pmx_node.node`. Verified: `b3-smoke` transport-equal 16/16, parity IDENTICAL under both transports (42/64), `a2-smoke` green both modes, all gates green. DECISIONS.md **D-019** records the unsafe accounting table (pmx-node = napi-macro-generated, everything else 0).

- Tasks: napi crate exposing the four entry surfaces natively behind the same adapter JS files, selectable (`PMX_ADAPTER=napi|serve`, default serve). Keep `pmx-core` free of any Node linkage (§12).
- Verify: identical parity table under both adapters; unsafe/ffi confined to `pmx-node` and listed in DECISIONS.md (D-06) with counts.

## C1 — CI for the pmx workspace (GitHub Actions)

- Tasks: `.github/workflows/pmx.yml` in pmx repo: matrix {fmt-check, clippy -D warnings, cargo test, corpora verify (extract+verify), parity script} on ubuntu-latest (mac latest optional to keep minutes low). Rust 1.97 stable + Node 24 setup; reference available as `Main` via submodule/symlink step documented in the workflow.
- Verify: push a test commit; workflow passes with logs pasted into the loop report.

## C2 — BUILD.md final + demo

- Tasks: extend BUILD.md: one-command build (`cargo build --release`), adapter usage, parity commands, cold-start comparison stub (`node -e "require('picomatch')('*')"` vs `pmx '*'` shape, rulebook §9 numbers come later), troubleshooting (the `Main` link, corpus regen, chunk activation).
- Verify: a teammate can clone, run `make` or `cargo build --release`, run `pmx --serve`, and reproduce the parity table without help. Demo script recorded (`demo/demo.sh`), output pasted.

## Explicit non-goals for this plan stage

- No `pmx-native` (fast direct matcher) — rulebook says only merge when differential-clean against pmx-exec; that's later.
- No claiming performance numbers until §9 methodology exists.
- No editing `tests/original/` ever (byte-frozen).

## Dependency chain

```
S0 → S1 → S2 → A1 → A2 → A3 → B1 → (B2 parser C4–C9 in parallel loops) → B3 → C1 → C2
                        (A1/A2 don't need pmx-exec; A3 unblocks all boolean parity)
```

Ready to start with **S0** on your word, or **S1** if you want C3 formally parked in the plan's status page instead.
