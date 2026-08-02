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

### D-06: Extglob & ReDoS Triage Parity

- **Original**: `lib/parse.js` L48-L347 & L523-L600 handles ReDoS vulnerability analysis for repeated extglobs (`analyzeRepeatedExtglob`), single-character star extglob consolidation, `!(...)` magic suffix parsing via sub-`parse(rest, { fastpaths: false })`, and `opts.maxExtglobRecursion`.
- **Port**: Ported ReDoS triage static analysis helpers and `extglobOpen`/`extglobClose` routines in `extglob.rs`.
- **Why**: Ensures ReDoS mitigation logic matches V8 output byte-for-byte without breaking nested extglob expressions.
- **Cost**: None; verified across 841 oracle cases and 61 adversarial cases.

---

### D-07: Globstar Machine & `push` Demotion Parity

- **Original**: `lib/parse.js` L493-L505 & L1128-L1244 implements `**` second-star context transitions, consecutive `/**/` stripping, `push()` demotion of `globstar` to `star` for non-slash tokens, and `bash` mode empty-output star semantics.
- **Port**: Implemented `push()` demotion in `parser.rs` and the 6 globstar context branches in `main_loop.rs`.
- **Why**: Guarantees byte-identical regex output for `**`, `a/**/b`, `a/**`, `/**/a`, and `a**b` across POSIX and Windows.
---

### D-08: Pattern Negation (`!`) & `negate()` Parity

- **Original**: `lib/parse.js` L457-L473 & L1053-L1065 implements leading `!` parity counting (`negate()`), double-negation folding (`count % 2 === 0`), `state.start` pointer advancement, extglob opener disambiguation (`!(...`), and `nonegate` option bypassing.
- **Port**: Implemented `negate()` method in `main_loop.rs` adhering to exact parity counting and De Morgan paren boundary guards.
- **Why**: Ensures leading `!`, `!!`, `!!!`, `!(...)`, `!!(...)`, `!a.js`, and `opts.nonegate` match V8 parse state output byte-for-byte.
- **Cost**: None; verified across 73 oracle cases and 57 adversarial cases.

