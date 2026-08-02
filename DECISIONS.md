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
---

### D-05: Brackets & POSIX Class Parity (#187 & Asymmetric Options)

- **Original**: `lib/parse.js` L718-L758 & L814-L875 handles `[...]` character classes, 14 POSIX classes, `[!...]` literal `!` default, and `literalBrackets` 3-way output state.
- **Port**: Port POSIX class lookups via `posix_regex_source`, asymmetric `opts.posix !== false` vs `opts.posix === true`, `[^...]` `/]` injection, `strictBrackets` throws (`MissingOpening`/`MissingClosing`), and 3-way `literalBrackets` (`Some(true)`, `Some(false)`, `None`).
- **Why**: Preserves upstream bug-parity #187 (`[!...]` literal `!`) and 3-way `literalBrackets` regex alternation output.
- **Cost**: None; exact behavioral match verified across 203 oracle cases and 60 adversarial cases.
