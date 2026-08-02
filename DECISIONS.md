# DECISIONS.md — Architecture & Parity Decisions

Formally records material design decisions, tradeoffs, and parity locks per constitution §10.

---

### D-01: JSON / f64 Transport Rounding

- **Original**: JS `maxLength` option accepts JS numbers (including non-finite f64s, decimals, and subnormals).
- **Port**: Serde JSON without `float_roundtrip` can shift double-precision floats by 1 ULP during string transport. To prevent loss of precision in adapters and harnesses, float options carrying non-finite or decimal values are encoded as exact string representations (e.g., `num:<String>` or `{ "__num": "..." }`) and parsed using `std::str::FromStr` on `f64`.
- **Why**: Found during C0 review iteration 2: lossy float transport caused ~30% false divergences on random f64 bit patterns. Exact string transport guarantees bit-exact double rounding between V8 and Rust.
- **Cost**: Minor serialization overhead in test and IPC adapters.
- **Alternative rejected**: Default `serde_json` float parsing without string transport (rejected due to 1 ULP drift).

---

### D-02: `Vec<u16>` Emitted-Text Representation

- **Original**: JS strings are sequences of UTF-16 code units. Fastpath escaping and lone surrogate handling can produce ill-formed UTF-16 strings (e.g. escaping individual astral halves).
- **Port**: All emitted text in `ParseState` (`output`, `consumed`, token values, outputs, suffixes) is represented as `Vec<u16>` (UTF-16 code units). Pattern-side inputs are `String` at boundary.
- **Why**: Storing emitted text in Rust `String` (`UTF-8`) would fail or panic on lone surrogates, violating JS string parity.
- **Cost**: Conversion required when displaying human-readable strings in non-IPC contexts.
- **Alternative rejected**: `String` with lossy replacement (rejected because byte identity would be destroyed for ill-formed UTF-16 inputs).

---

### D-03: Fastpath vs Slow-Path Divergence Lock-in

- **Original**: `parse.fastpaths` engine and main loop produce byte-divergent regexes for identical patterns (e.g. `.*`, `*.js`). `makeRe` routes patterns starting with `.` or `*` through fastpath templates, whose regexes differ from the slow path.
- **Port**: Port BOTH routes exactly as designed without unifying or "fixing" their templates.
- **Why**: Upstream picomatch tests pin the fastpath outputs. Any attempt to homogenize fastpath and slow-path outputs breaks test parity.
- **Cost**: Maintaining two separate code paths.
- **Alternative rejected**: Unifying fastpath regex generation with main loop output (rejected due to test failures).

---

### D-04: Fragment Byte-Pinning at Definition Site

- **Original**: `lib/parse.js` L371-L405 constructs fragment templates using platform character tables and option flags.
- **Port**: Fragment generators (such as `build_fragments` in `fragments.rs`) are covered by inline unit tests that assert byte-exact match against JS reference strings across POSIX and Windows.
- **Why**: C0 review iteration 1 revealed that a single misplaced parenthesis inside lookahead templates distorts all downstream regexes.
- **Cost**: Extra inline byte-pin unit tests.
- **Alternative rejected**: Relying solely on end-to-end corpus tests (rejected because fragment errors are hard to trace).

---

### D-015 — Scanner option model is distinct from parser `Options`

- **Status**: Accepted (2026-08-02, Teammate 2 Chunk 2)
- **Context**: `lib/scan.js` consumes a different option set (`parts`, `scanToEnd`, `tokens`, `noext`, `nonegate`, `noparen`, `unescape`) with different semantics than `lib/parse.js` (`dot`, `bash`, `capture`, `windows`, `maxLength`, `strictBrackets`, …). `noext` in scan post-processes `isExtglob`/`isGlob` to false; in parse it aliases to `noextglob`. Forcing the parser `Options` struct onto the scanner would conflate two contracts and require unused fields.
- **Decision**: a dedicated `ScanOptions` struct in `scan.rs` mirrors the JS scan option surface exactly. It does **not** reuse `options::Options`. The bridge/corpus decode their own option object into `ScanOptions`. The `unescape` helper (`utils::remove_backslashes`) is shared — that is a utility, not an option coupling.
- **Evidence**: `lib/scan.js` L52-L54, L171, L250, L256, L288-L291, L319-L325; `docs/parser-and-scanner.md` §"lib/scan.js"; prompt rule §9 ("do not force parser `Options` onto scanner if option sets/semantics differ").
- **Rejected**: reuse `options::Options` with `Option<bool>` for the scan keys — rejected because it imports ~30 unused parser fields and the `noext` semantics diverge.

---

### D-016 — Scanner core operates on `&[u16]` (UTF-16 code units), exactly mirroring JS `charCodeAt`

- **Status**: Accepted (2026-08-02, Teammate 2 Chunk 2; specializes D-013 for the scanner)
- **Context**: D-013 mandates UTF-16-unit-observable positions. The scanner's `advance()` returns one UTF-16 code unit (`charCodeAt(++index)`), and backslash-escape advancement skips exactly one unit. Iterating Rust `char` (scalar values) would advance two units for an astral char inside an escape, diverging the index on inputs like `\😀` (JS: escape consumes the high-surrogate half; scalar iteration would consume the whole pair). All structural chars (`{ } [ ] ( ) , . / \ * ? + @ !`) are ASCII (< 0x80), so a lone surrogate half is never a structural char — but the *positions* and *escape advancement* still differ per-unit.
- **Decision**: the core is `scan_utf16(input: &[u16], opts: &ScanOptions) -> ScanState`. The ergonomic wrapper `scan(input: &str, opts: &ScanOptions)` calls `scan_utf16(&input.encode_utf16().collect::<Vec<_>>(), opts)`. `ScanState` stores `input` as the original `&str` (pattern-side, well-formed per D-013) and `base`/`glob`/`prefix`/`parts` as `String`s sliced by UTF-16-unit offsets via a unit→byte mapping computed once. Token `value` is `String` (pattern-side text, well-formed). This is provably unit-exact: the cursor index is a `usize` into `&[u16]`, identical to JS `index`.
- **Boundary**: lone surrogates cannot arrive through `scan(&str)` (Rust `String` is valid UTF-8). The unit-level `scan_utf16(&[u16])` accepts them and is tested directly (unit-level, no `&str` round-trip). The corpus/bridge encode non-ASCII as `__u16` per `canon.js`; lone surrogates are a unit-test-only boundary (D-013: no corpus case may contain unpaired surrogates).
- **Evidence**: `lib/scan.js` L60-L84 (`charCodeAt`/`advance`), L78/L81 (`peek`/`eos`), L157 (`slashes.push(index)`); D-013; prompt §9 ("If lone-surrogate input cannot be represented through `&str`, the limitation/boundary must be explicit and tested at the unit-level interface").
- **Rejected**: scalar-value iteration + parallel unit counter (D-013's general plan) — rejected for the scanner because escape advancement is per-unit and direct `&[u16]` is simpler and provably exact.
- **Links**: D-013; `docs/parser-and-scanner.md` §"lib/scan.js"; `crates/pmx-core/src/scan.rs`.

---

### D-017 — Scanner depth model: `Option<f64>` with `Infinity` for globstar

- **Status**: Accepted (2026-08-02, Teammate 2 Chunk 2)
- **Context**: `lib/scan.js` L26-L30 sets `token.depth = token.isGlobstar ? Infinity : 1` (only when `isPrefix !== true`), and `state.maxDepth` accumulates token depths. `maxDepth` is `Infinity` when any globstar token is present. JSON has no `Infinity` literal; the corpus/bridge must transport it as `{ "__num": "Infinity" }` per `canon.js`/D-014. A sentinel like `u32::MAX` would be lossy and diverge from JS `JSON.stringify(Infinity)` behavior.
- **Decision**: `ScanToken.depth: Option<f64>` — `None` when `isPrefix === true` (JS omits the property), `Some(1.0)` or `Some(f64::INFINITY)` otherwise. `ScanState.max_depth: Option<f64>` — `None` when `tokens !== true` (property absent), `Some(0.0)` or `Some(f64::INFINITY)` when tokens are computed. The bridge/corpus encode `None` as absent and `Some(Infinity)` as `{ "__num": "Infinity" }`.
- **Evidence**: `lib/scan.js` L26-L30, L356-L361, L375; D-014 (non-finite transport); `Rust/fixtures/canon.js` `encOptions`.
- **Rejected**: `u32` depth with a sentinel — rejected because it loses the `Infinity` observable and breaks JSON transport parity.
- **Links**: D-013, D-014; `crates/pmx-core/src/scan.rs`; `Rust/fixtures/canon-scan.js`.

---

### D-018 — Benchmark remediation: replacement after PR #5/PR #6

- **Status:** Accepted (2026-08-02, Teammate 2 Chunk 4 remediation)
- **Context:** PR #5 was independently reviewed and found to have 5 blocking defects: asymmetric checksum overhead (BigInt vs u64), false parity validation, invalid self-referential SHA-256, artifacts not bound to reviewed source, and violated statistical independence (flattened bootstrap). PR #6 reverted PR #5.
- **Decision:** Complete independent replacement benchmark system designed from scratch. No code or evidence from PR #5 reused.
- **Evidence:** PR #5 review at https://github.com/gauravk16in/picomatch/pull/5#pullrequestreview-4839150197; PR #6 revert commit `b19e762`.
- **Rejected:** Patching PR #5 code — rejected because the defects were structural, not line-level.

---

### D-019 — Process-pair experimental unit for benchmarks

- **Status:** Accepted (2026-08-02)
- **Context:** PR #5 flattened JS samples from 3 process runs into one pool and bootstrapped at individual-sample level, violating independence. Rust ran only 1 process.
- **Decision:** Both runtimes use equal fresh-process repetition. 20 process pairs, each with one fresh JS worker and one fresh Rust worker. Execution order deterministically randomized using seeded mulberry32 PRNG. Per-pair median ns/op is the process-level estimate. Log ratios bootstrapped at the process-pair level (cluster bootstrap).
- **Evidence:** Research confirms cluster bootstrap is correct for correlated within-process data (https://en.wikipedia.org/wiki/Bootstrapping_(statistics)#Block_bootstrap).
- **Rejected:** Flattened individual-level bootstrap — rejected because it underestimates variance and produces anti-conservative CIs.

---

### D-020 — Semantic parity gate outside timing

- **Status:** Accepted (2026-08-02)
- **Context:** PR #5 claimed "checksum parity" but never actually compared JS and Rust checksums. A checksum may bind an artifact but must not substitute for direct semantic equality.
- **Decision:** Before any timing, each scenario is run through both runtimes and states compared using `assert.deepStrictEqual` via `fixtures/integrated-harness-core.js`. Aborts on mismatch. The parity result is recorded in the raw artifact.
- **Rejected:** Checksum-based parity — rejected because checksums are incomparable across runtimes with different string encodings.

---

### D-021 — Honest operation definition: scanner plus result consumption

- **Status:** Accepted (2026-08-02)
- **Context:** PR #5 timed "scanner + BigInt checksum" for JS and "scanner + u64 checksum" for Rust, calling it pure scanner time.
- **Decision:** The timed region honestly measures "scanner plus canonical result consumption". Both runtimes use the same u32 FNV-1a digest algorithm with native arithmetic (no BigInt). Rust uses `std::hint::black_box` for anti-optimization. The operation is named honestly in documentation.
- **Rejected:** Pure scanner time claim — rejected because the digest is inside the timed region.

---

### D-022 — Two-commit provenance and sidecar integrity

- **Status:** Accepted (2026-08-02)
- **Context:** PR #5 computed summary SHA-256 before adding hash fields, then rewrote the file, making the hash invalid. Artifacts recorded the base SHA, not the PR head.
- **Decision:** Two-commit workflow: H (harness/source) then E (evidence/publication). Sidecar SHA-256 files (not self-referential). The benchmark refuses to run unless HEAD matches the declared harness SHA and the tree is clean.
- **Rejected:** Self-referential hash — rejected because the hash changes when added to the file.

---

### D-023 — Fail-closed shared validation

- **Status:** Accepted (2026-08-02)
- **Context:** PR #5's canaries copied validation logic instead of importing it, making them tautological. The validator never compared checksums.
- **Decision:** One exported production validator (`benchmarks/validator.js`) used by the benchmark runner, analyzer, verifier, and all canaries. Canaries apply mutations to valid fixtures and require expected error codes. 31 canaries, all import the real validator.
- **Rejected:** Copied validation in canaries — rejected because it cannot detect breakage in the production validator.
