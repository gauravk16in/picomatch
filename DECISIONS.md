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
