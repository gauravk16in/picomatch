# General Deep Review — pmx Rust port (`rust-port` @ `0f393f8`)

_Reviewer persona: lead maintainer, adversarial profile (`/Users/kr/port/promptreview.md`).
Every claim cites file:line on both sides or fresh command output (reproduced during this
review on the reviewer's machine, macOS arm64, node v26.3.0, cargo 1.97.1)._

## Metric table (all re-measured live, 2026-08-03)

| Metric | Claimed | Measured live | Verdict |
|---|---|---|---|
| `cargo fmt --check` | green | exit 0 | ✓ |
| `cargo clippy --workspace --all-targets -- -D warnings` | green | exit 0 | ✓ |
| `cargo test --workspace` | green | 66 unit + 2 corpus + 1 cli = 69 tests, 0 failures | ✓ |
| Original mocha suite via adapter (all 36 files, `PMX_ADAPTER=napi`) | 1974/1977 | **1974/1977** — failures: `braces.js` 16/17, `extglobs-bash.js` 647/648, `options.expandRange.js` 0/1 | ✓ |
| Corpus determinism (`verify-c0..c9`, `verify-scan`) | green | 3,273 parse rows + 3,216 scan rows deterministic, sha-pinned | ✓ |
| Corpus rows (BRANCH_REPORT §2) | **6,937** | **6,489** | ✗ doc metric wrong by 448 |
| pmx-core src LOC (BRANCH_REPORT §2) | **6,839** | **5,412** (wc -l) | ✗ doc metric wrong |
| attack-integrated | 4,189 compared, 0 div | 4,189 compared, 0 div | ✓ |
| attack-scan | — | 411 inputs / 4,932 compared / 0 div | ✓ |
| attack-c0/c5/c6/c7/c8/c9 | green | 220 inputs + 52/60/61/59/57 cases, all 0 div | ✓ |
| attack-a3 (engine differential) | 148,488, 114 astral boundary | 148,488 compared — 114 D-018 boundary, **0 other**, 0 engine errors | ✓ |
| bench-canaries | 69/69 | 69/69 (note: "scanprobe binary not present locally") | ✓ |
| Reference suite intactness (`npm test` in `/Users/kr/port/picomatch`) | 1977/1977 | 1977/1977 | ✓ oracle untouched |
| `benchmarks/verify-artifacts.js` (final E2 set) | verifies | **FAILS on macOS**: `Referenced corpus not found: /Users/kr/port/pmx/benchmarks\scenarios.json` | ✗ win32-only |
| Rust src LOC total (4 crates) | — | pmx-core 5,412 · pmx-exec 115 · pmx-cli 432 · pmx-node 22 = **5,981** (tests 450, examples 977 extra) | vs original 2,444 |
| Fuzz harness (rulebook §7: `fuzz/`, ≥60 s clean `log.txt`) | — | **absent** (no `fuzz/` directory anywhere) | ✗ |
| Independent reviews (`reviews/*.md`, `.loop/review-ledger.md`) | per-chunk | **stop at C4** (ledger rows C0–C3; review files c0-1, c0-2, c2-1, c3-1, c4-1 only) | ✗ C5–C9 unreviewed |
| CI workflow in pmx workspace | — | none (no `.github/`) | ✗ |

**Confirmed live divergences found by this review (all reproduced both sides below):**

| # | Severity | Class | Example | JS | pmx |
|---|---|---|---|---|---|
| F-1 | **BLOCKER** | BUG-001 "fix" changes observable matching | `makeRe('{abc').source`; `pm('{abc')('(abc')` | `$^` / **false** | `^(?:\(abc)$` / **true** |
| F-2 | **BLOCKER** | extglobClose rest-test mistranslation (root-causes known-open BUG-006) | `x!(*a).b.c` output | `(?!(?:[^/]*?a))` | `(?!(?:[^/]*?a)\.b\.c)` |
| F-3 | **BLOCKER** | brace literal-close rebuild drops empty-output token values | `pm('{a@(bc)}')('{abc}')` | **false** | **true** |
| F-6 | **BLOCKER** | `negate()` while-condition ported from wrong source line | `parse('!!(!a)')` | negated extglob, `start=1` | literal `(!a)`, `negated=false` |
| F-7 | **MAJOR** | `expandRange` RegExp-validity approximated | `pm('{a-..z}')('a-..z')` | **true** (`^(?:a\-..z)$`) | **false** (`$^`) |
| F-4 | **MAJOR** | stray close-paren output when `parens < 0` | `parse('a))b').output` | `a\))b` | `a\)\)b` |

---

## 1. Architecture

The crate split matches the constitution (rulebook §2) cleanly:

```
crates/pmx-core   pure parser+scanner, #![forbid(unsafe_code)], deps = thiserror only
crates/pmx-exec   regress-backed ECMAScript regex execution (D-027)      — 115 lines
crates/pmx-cli    pmx binary + shared op-dispatch (one JSONL dispatcher
                  serving BOTH the --serve subprocess and the napi addon)
crates/pmx-node   22-line napi shim, documented unsafe exception (D-028)
```

Strengths:

- **Single dispatch, two transports.** `pmx-cli/src/lib.rs:373-384` (`dispatch`) is the one
  source of truth for ops; `pmx --serve` (`crates/pmx-cli/src/main.rs:9-34`) and the napi
  `bridge_op` (`crates/pmx-node/src/lib.rs:15-17`) both call it. Divergence between
  transports is structurally impossible. Good design.
- **Parser architecture is a faithful but genuine *port*, not transliteration.** The JS
  pattern "N closures aliasing N mutable locals" (parse.js L439-L600) becomes one
  `Parser` struct (`crates/pmx-core/src/parse/parser.rs:45-61`) owning `state`,
  `prev: usize` arena index, `extglobs`/`braces`/`stack` vectors. Tokens live in a
  `Vec<Token>` arena with index links (`state.rs:63-73`) — the honest way to port JS
  object-reference webs without `Rc<RefCell>`.
- **Module boundaries mirror PARSE_CHUNKS.md**: `mod.rs` (entry ordering), `parser.rs`
  (machinery), `main_loop.rs` (dispatch + branches), `inline_fastpath.rs`, `fastpath.rs`,
  `extglob.rs`, `fragments.rs`, `state.rs`. `mod.rs:25-55` encodes the load-bearing order
  (REPLACEMENTS → length guard → `./` strip → inline fastpath → loop → finish) as three
  calls with comments; verified against parse.js L361/L364/L430/L606/L655/L1286.
- **Adapter layering per rulebook §4.** `adapter/` exposes exactly the four require
  surfaces; `adapter/index.js:202-207` preserves the `windows`-only-with-options-object
  quirk (reference index.js L8-L11, upstream issue #133) — verified present.

Concerns:

- **[MAJOR] Process-per-call in the serve transport.** `adapter/_bridge.js:42-60`
  `spawnAnswer` uses `execFileSync(BIN, ['--serve'], ...)` — a full process spawn *per
  op*, contradicting ADAPTER_PLAN.md A2's own text ("thin forwarders spawning **one
  long-lived** `pmx --serve` process"). Harmless for correctness (the 36-file parity run
  still finished), but the plan/implementation drift is real, and it makes the default
  (`PMX_ADAPTER` unset) path ~100× slower than it needs to be. Either fix the plan text
  or implement the long-lived process.
- **[MINOR] `fastpaths` gallery lives in pmx-core but its *gate* lives in pmx-cli.**
  `make_re_op` (`pmx-cli/src/lib.rs:254-264`) re-implements the
  `input[0] === '.' || '*'` gate from picomatch.js L307-L309 instead of pmx-core exposing
  a `make_re_source`. pmx-core's public API cannot answer the product-level question
  ("regex source for this pattern") without a consumer re-implementing picomatch.js's
  orchestration. A `pmx_core::make_re_source(pattern, opts)` would put the last JS file
  (picomatch.js L305-L321) into the port where it belongs.
- **[MINOR] `pmx-core` exposes no boolean API at all.** There is no
  `is_match(str, pattern, opts)` convenience; the only route from Rust to matching is
  through the CLI JSONL protocol. Acceptable for the hackathon deliverable, thin for a
  "production Rust library" story.
- Under-engineered: nothing. Over-engineered: the benchmark evidence apparatus
  (process-pair schedules, artifact schema v2, harness/evidence commit chains — see §5),
  which is more rigorous than the thing it measures covers (scanner only).

The adapter **should** stay JS (rulebook §4 requires the original suite's
`require('..')` to hit the port); `pmx-node` as test-adapter-only is correctly bounded
and documented (D-028). Verdict: architecture is the strongest axis.

## 2. Fidelity of the port

Method: line-class walk of `parse/*` vs parse.js L356-L1416 and `scan.rs` vs scan.js,
plus targeted differentials (`c0probe` JSONL vs `node -e` on the same patterns).

### 2.1 Confirmed divergences (findings)

**F-1 [BLOCKER] BUG-001 "fix" alters observable behavior — constitution §1 violation.**
`crates/pmx-core/src/parse/parser.rs:307-318` escapes the LAST `(` in output for
unclosed braces; parse.js L1298-L1302 searches for `{` (which never matches, because
brace open emitted `(` — parse.js L886). Empirical, both sides:

```
JS:   parse('{abc',{fastpaths:false}).output = "(abc"
      pm.makeRe('{abc').source = "$^"     pm('{abc')('(abc') = false
pmx:  probe  {abc → output [92,40,97,98,99] = "\(abc"
      pmx adapter: makeRe('{abc').source = "^(?:\(abc)$"; pm('{abc')('(abc') = true
```

Because JS's *invalid* output is what triggers the `/$^/` fallback in
`toRegex` (picomatch.js L344-L346), repairing the output *before* the fallback
changes `makeRe` source AND boolean answers. `bug-reports.md`'s rebuttal ("Neither is
tested by the original test suite") is true of the 1,977 rows but irrelevant: the
constitution §1 says *bug-for-bug on behavior, not on the suite's coverage*. Note the
shipped code is additionally inconsistent with its own doc: bug-reports.md BUG-001's
"Fix" promises a reorder (rebuild before recovery) **that is not shipped** —
`parser.rs:272-302` `finish()` runs recovery *first*, exactly like JS (and `{{a..z}`
still yields `([a-z]` — pinned at `main_loop.rs:1310-1311`). So the fix is partial:
`{abc` diverges, `{{a..z}` doesn't. Worst of both worlds.

**Requested change:** restore `escape_last(output, '{')` in the braces arm of
`recovery` (`parser.rs:310`), delete the BUG-001 "fix" claim, keep the analysis as a
*reproduced* upstream bug (the bug-catcher prize is the GitHub issue, not the behavior
change), and pin corpus rows for `{abc`, `a{b`, `{a,b`.

**F-2 [BLOCKER] extglobClose rest-test mistranslated.**
`crates/pmx-core/src/parse/extglob.rs:562-564`:

```rust
if rem_str.starts_with('.') && !rem_str.contains('/') && !rem_str.contains('\\') {
```

vs parse.js L582 `/^\.[^\\/.]+$/.test(rest)` — requires (a) ≥2 chars, (b) **no further
dots**. Rust implements neither constraint. Empirical (both sides, `{fastpaths:false}`):

```
x!(*a).b.c : JS  "x(?:(?!(?:[^/]*?a))[^/]*?)\.b\.c"
            pmx "x(?:(?!(?:[^/]*?a)\.b\.c)[^/]*?)\.b\.c"
x!(*a).    : JS  "x(?:(?!(?:[^/]*?a))[^/]*?)\."
            pmx "x(?:(?!(?:[^/]*?a)\.)[^/]*?)\."
a!(*b)..x  : JS  "a(?:(?!(?:[^/]*?b))[^/]*?)\.\.x"
            pmx "a(?:(?!(?:[^/]*?b)\.\.x)[^/]*?)\.\.x"
```

This is the **root cause of their own open BUG-006** (bug-reports.md:404-429 — the
`moo.cow`/`!(*.*).!(*.*)` suite failure and its "fix directions" paragraph point at
exactly this test). BUG-006 demonstrates a boolean flip; my variants show the class is
*any* rest containing a second dot or a lone `.`.

**Requested change:** implement the regex exactly: `rem.len() >= 2 && rem[0] == DOT &&
rem[1..].iter().all(|u| ![BS, FSLASH, DOT].contains(u))`; add corpus rows for
`x!(*a).b.c`, `x!(*a).`, `a!(*b)..x`, `!(a|b).c.d`.

**F-3 [BLOCKER] brace literal-close rebuild mishandles empty output.**
`crates/pmx-core/src/parse/main_loop.rs:467-470`:

```rust
for t in &toks {
    let piece = t.output.as_deref().unwrap_or(&t.value);
```

vs parse.js L931-L933 `state.output += (t.output || t.value)` — JS `||` treats `''` as
falsy and falls back to `value`. The `@` extglob token is pushed with `output: ''`
when state.output is non-empty (parse.js L534, ported at `extglob.rs:451-455`); inside
a literalized brace its empty output must fall back to `@`, and does not:

```
JS  parse('{a@(bc)}',{fastpaths:false}).output = "\{a@(bc)\}"
pmx probe                                      '\{a(bc)\}'     ← '@' dropped
pm('{a@(bc)}')('{abc}')  = JS false | pmx true   (boolean flip, user-visible)
```

The team's own AGENTS.md warns "push truthiness is subtle… `(prev.output || prev.value)`"
— applied correctly in `push` (`parser.rs:233-236`) but missed here.

**Requested change:** emit `t.output` only when `Some(non-empty)`, else `t.value`
(mirror JS truthiness, not null-ness); corpus row `{a@(bc)}` + `!`-and-`@` variants.

**F-6 [BLOCKER] `negate()` loop condition ported from the wrong function.**
`crates/pmx-core/src/parse/main_loop.rs:694-702`:

```rust
while self.peek(1) == Some(EXCLAMATION)
    && (self.peek(2) != Some(LPAREN)
        || self.peek(3).is_some_and(|u| u == EXCLAMATION || u == b'=' || u == b'<' || u == COLON || u == b'?'))
```

vs parse.js L460 `while (peek() === '!' && (peek(2) !== '(' || peek(3) === '?'))` —
JS accepts only `'?'` at peek(3); the `!=<:` set belongs to the *extglobOpen* guard at
L1055 and was transplanted into the wrong function. Empirical:

```
!!(!a)  : JS  negated=true  start=1  "(?=.)(?:(?!(?:!a)$))[^/]*?"
         pmx negated=false start=1  "(!a)"
!!(!x   : JS  negated=true           "(?=.)(?:(?!\(?:!x"
         pmx negated=false           "\(!x"
```

The whole pattern is semantically re-routed (extglob negation vs literal group) — the
single worst mistranslation in the port. The 1974/1977 suite passes only because no
suite row combines `!!` with `(`; the attack harnesses cover `!!!!a` (`attack-c9.js:39-41`)
but never `!!(…`, which is exactly the generator gap, see §5.

**Requested change:** `self.peek(3) == Some(b'?' as u16)`; corpus rows for `!!(a)`,
`!!(!a)`, `!!(=a)`, `!!(<a)`, `!!(?!a)` × {fastpaths true/false}.

**F-7 [MAJOR] `expandRange` validity approximated.**
JS parse.js L27-37 sorts (`args.sort()` — UTF-16-unit lexicographic) then **probes
`new RegExp(value)`**. Rust `main_loop.rs:1140-1141` uses `sorted.sort()` (same basis ✓)
but `validate_js_range_class` (`main_loop.rs:1167-1192`) approximates: adjacent-pair
endpoint comparison + odd trailing backslash count. It misses ECMAScript class grammar
where a `-` ending an argument becomes a range dash against the *next* argument:

```
{a-..z} : JS  "a\-..z"  (new RegExp('[a--z]') throws "Range out of order")
         pmx "[a--z]"  (validator passed it)
JS  pm('{a-..z}')('a-..z') = true   vs   pmx = false  (source "^(?:a\-..z)$" vs "$^")
```

Even regress agrees with V8 here (`regexTest "[a--z]" → SyntaxError`), so the pmx
adapter collapses to `/$^/` where JS matches the literal.

**Requested change:** replace the approximation with an actual ECMAScript
class-item scan of the joined `[…]` payload (atoms, `\` escapes, `-` ranges with
`ClassSetRange` reversal detection), or construct the candidate and validate via the
same regress construction used by pmx-exec behind a feature flag — but keep the
JS-sort and join bytes identical. Corpus rows `{a-..z}`, `{-..a}` (coincidentally
fine), `{a..-}`, `{a-..z-}` .

**F-4 [MAJOR] close-paren output when `state.parens < 0`.**
parse.js L805 `output: state.parens ? ')' : '\\)'` is a *truthiness* test — `-1` is
truthy. `main_loop.rs:665-669` uses `self.state.parens > 0` — `-1 > 0` false:

```
a))b : JS "a\))b"   pmx probe "a\)\)b"   (oracle-1 source divergence)
```

Boolean answers coincide here (V8/regress both treat an unbalanced `)` literally), but
oracle-1 (source identity, the strongest claim in rulebook §3) breaks. Fix is one
character: `!= 0`.

### 2.2 Areas walked with NO divergence found (with evidence)

- **Ordering dependencies** — `mod.rs:25-55` vs parse.js: REPLACEMENTS (L361, exact-key,
  incl. near-miss pins `constants.rs:352-361`), maxLength guard with JS-NaN semantics
  (`options.rs:127-136`), `./` strip, inline fastpath with early return, recovery →
  maybe_slash → rebuild (`parser.rs:268-302`) in exact source order. ✓
- **Inline fastpath** (`inline_fastpath.rs:44-207`): the `REGEX_SPECIAL_CHARS_BACKREF`
  simulation is genuinely excellent — including the lonely-backslash-at-EOS backtrack,
  the `a**b → ONE star fragment` collapse (unit-pinned `inline_fastpath.rs:227-241`),
  and the silent dropping of an escaped dot run (comment at L169-172). Spot-checked
  `a\**b`, `a\??b`, `?ab` against the oracle — byte-identical.
- **Globstar machine** (`main_loop.rs:817-1043`): all five JS sub-branches present in JS
  order (prev-globstar collapse L1128, bash L1156, isBrace/isExtglob L1161-1166,
  `/**/` strip with `input[state.index + 4]` semantics L1169-1176, bos+EOS L1178,
  slash+EOS `(?:…|$)` L1188, slash+rest `/` L1201, bos+rest `/` L1220, default L1231).
  Verified `!(a|**)`, `!(a|**)b`, `@(x|**)` byte-identical both sides. (Note: I flagged
  Rust's `is_pipe = prior.value == [PIPE]` at `main_loop.rs:870` and
  `parser.rs:189` as a candidate "silent improvement" of JS's dead `type === 'pipe'`
  check (pipe tokens are typed `text`, parse.js L950); adversarial probing
  (`!(a|**)`, `@(x|**)`) produced **identical output**, because the neighboring
  `prior.type !== 'paren'`/`tok.kind != Paren` conditions mask it on every input I could
  construct. Demoted to a watch item, not a finding — but the forked semantics should be
  reconciled with a comment.)
- **Bracket/POSIX/`literalBrackets` 3-way** (`main_loop.rs:309-401` vs L829-L873):
  `hasRegexChars(prevValue)` recomputed pre-append-equivalent by slicing off the just
  -appended close (nice), 3-way literalBrackets (false/regex-chars → stay; true → escape;
  unset → `(?:escaped|raw)` alternation) is exact.
- **Fragment gallery** (`fragments.rs`): globstar capture/dot/bash variants pinned
  against reference bytes for posix AND windows (`fragments.rs:65-102`).
- **scan.rs**: base/glob arithmetic, `prevIndex`-falsy quirk (`scan.rs:590-598` vs
  scan.js L354-L356), `depth()`/`isPrefix` initial-0 semantics (D-017), conditional
  field presence as `Option`. 4,932-case scan attack + 4,189 integrated comparisons
  green. The teammate audit trail (`audits/2026-08-02-1400-*`, plus the final
  end-to-end audit catching 2 scanner BLOCKERs itself) is credible.

### 2.3 Option coercion spot-checks (≥8 sites, both sides read)

| Option | JS site / coercion | Rust accessor | OK |
|---|---|---|---|
| `dot` | L416 `=== true` | `options.rs:104` `== Some(true)` | ✓ |
| `capture` | L374 truthy | `options.rs:111` `Some(true)` | ✓ |
| `fastpaths` | L606 `!== false` | `options.rs:150` `!= Some(false)` | ✓ |
| `unescape` | L639/L701 `=== true` | `options.rs:155` | ✓ |
| `noext`→`noextglob` | L408 `typeof … 'boolean'` overwrite | `options.rs:175-180` + CLI order (`pmx-cli/src/lib.rs:64-67`) | ✓ |
| `posix` (2 coercions!) | L719 `!== false` **and** L751 `=== true` | `posix_not_false`/`posix_true` (options.rs:232-240) | ✓ (correctly two accessors) |
| `literalBrackets` | L856 `=== false` / L865 `=== true` / else 3-way | `Option<bool>` passthrough (options.rs:243) | ✓ |
| `maxLength` | L364 typeof number + Math.min, NaN falsy-guard | `options.rs:127-136` NaN mirror | ✓ |
| `maxExtglobRecursion` | L288 `=== false` / L293 typeof number | `ExtglobRecursion` tri-state + CLI mapping (lib.rs:74-80) | ✓ |
| `regexp` | L1257 `opts.regex === true` vs L1077 `opts.regex === false` | `regex()` + `regex == Some(false)` (main_loop.rs:799) | ✓ |
| `strictBrackets`/`strictSlashes` | L1287 `=== true` / L1304 `!== true` | `options.rs:139-146` | ✓ |

(BUG-003 — 7 adapter keys dropped — is documented fixed in bug-reports.md and the fix
is visible at `pmx-cli/src/lib.rs:22-83`; verified `slashes-posix.js: 18/18` in the
live parity run.)

### 2.4 Error messages

Byte-identity verified live: `Missing opening: "(" - use "\\(" to match literal
characters"` both sides; `Input length: 70000, exceeds maximum allowed length: 65536`
both sides. `error.rs` `JsNumber` Display routing through `utils::js_number`
(`utils.rs:226-247`) handles `-0→0`, exponent thresholds — the c0-1 review's MAJOR and
its fix are real.

## 3. Rust quality

**Escape-hatch inventory (grepped):**
`crates/pmx-core|pmx-exec|pmx-cli/src` — zero `unsafe` (`#![forbid(unsafe_code)]` on
all three: `lib.rs:6`, `pmx-exec/src/lib.rs:10`, `pmx-cli/src/lib.rs:5`); **3
production-code `unwrap()`s** (`main_loop.rs:431`, `scan.rs:602`, `scan.rs:625`) — all capacity-and-condition-guarded but violating the workspace's own rule
(pmx/AGENTS.md "No escape hatches in `src/`"; promptreview §5 greps for exactly these).
Everything else matching `unwrap/expect/panic/todo/unreachable` is in `#[cfg(test)]`
blocks or `examples/`. pmx-node's napi-generated unsafe is the documented D-028
exception.

**`as`-cast inventory:** ~100 matches, dominated by `b'x' as u16` constant promotion
(harmless) — but `scan.rs` uses `as usize` pervasively (e.g. `scan.rs:205,215,231,256,
310,320,324,342,349,362,408,435,450,464`) after its own `i64` cursor arithmetic, which
contradicts pmx/AGENTS.md's stated convention ("Index arithmetic goes through
`try_into().ok()`") — a convention the parse side actually honors (`parser.rs:123,
151-154`). The scanner is where the audit's perf work landed and the convention was
apparently traded away silently. Not a soundness bug (all sites guarded by
`0..len as i64` ranges), but it makes the *stated* invariant grep-false. [MINOR]

**Ownership/idiom — the good:**

- `Vec<u16>` for all emitted text, `String` only for pattern-side well-formed text
  (state.rs:107-116 + D-02/D-016) — this is the single most consequential design
  decision and it's right (JS can emit lone surrogates; corpus `__u16` encoding matches).
- `PmxError` with thiserror; `JsNumber` newtype to route Display through JS number
  formatting (`error.rs:36-48`). Elegant.
- `ExtglobRecursion` tri-state enum instead of `Option<f64>` + sentinel (options.rs:22-30).
- Borrow-checker workaround quality: arena indices instead of `prev: &Token` are
  pragmatic and well-commented (`state.rs:59-62`); `pop_if` for extglob frame close
  (`main_loop.rs:658-663`) is idiomatic and exact.
- Enums for token kinds and counter kinds (`state.rs:16-33`, `parser.rs:16-20`) instead
  of stringly state — with `to_js_str` (`state.rs:37-57`) as the only outward mapping.

**The mediocre:**

- `append_token` (`parser.rs:171-176`) clones the token's output **and** value on every
  push (`tok.output.clone().unwrap_or_else(|| tok.value.clone())` — two allocations in
  the *hottest* helper). Borrow + extend would do. [MINOR, behavior-preserving]
- Every star/globstar emission re-encodes `fragments.star.encode_utf16().collect()`
  (`main_loop.rs:777,782,824,896,1047,1053` …). Pre-encoding fragments into `Vec<u16>`
  once at `Parser::new` is allocation-free hoisting with identical bytes. [MINOR perf]
- Stale `#[allow(dead_code)]` noise (`parser.rs:249` — `increment` is called from 5
  sites; `fragments.rs:12-16` — all three fields are read). Cosmetic. [NIT]
- `rest_str.clone()` + `String::from_utf16_lossy` churn in the globstar `/**/` strip
  (`main_loop.rs:859-892`) — cold path, acceptable.
- `close_brace_branch` deep-clones the entire token journal per range close
  (`main_loop.rs:436`) where JS `tokens.slice()` copies references. Correct but the
  deepest allocation in the parser; nested `{a..z}{b..y}{c..x}…` is O(n²) with a heavy
  constant. [MINOR perf]

## 4. Performance

- **Scanner**: a properly instrumented win — the final audit documents 18–50% per-scenario
  improvement, allocations 6–22→4–13 (`audit_findings.md`/PMX AGENTS.md), and the
  end-to-end benchmark says "Rust faster 13, JS faster 5, inconclusive 2 — **no universal
  speedup**" (BENCHMARKS.md). Honest and evidence-backed.
- **Parser hot paths** (unmeasured by any artifact): the three allocation items in §3
  (push clones, per-emission fragment re-encoding, journal deep-clone). The biggest
  structural cost is inherent: JIT-free fragment `format!`ing is *cheaper* than JS string
  concat, so the port is probably fine; the point is **nothing in the repo measures the
  parser at all** (see §5).
- **UTF-16 conversion costs**: one `encode_utf16` per parse on the input (`parser.rs:103`),
  per-op conversions in the CLI. Correct basis (D-016), acceptable cost.
- **Adapter**: process-per-op in serve mode (§1) dominates anything else by orders of
  magnitude; napi mode bypasses it.
- Rulebook §9's required numbers (cold-start hyperfine 200×, compile patterns/sec, match
  p50/p95/p99/max, RSS peak) are **absent**; BENCHMARKS.md covers scan() only. [MAJOR
  vs the constitution; MINOR vs engineering reality — the numbers that exist are honest.
  BRANCH_REPORT §4 item 6 admits it.]

## 5. Tests

**What exists and is strong:**

- **Corpus design**: the `chunk`/`active` threshold encoding (pmx AGENTS.md), `__u16`
  ill-formed-string encoding, `__num` non-finite f64 encoding with the correctly-rounded
  decimal-string transport (D-01/D-014 — this was a genuine review catch,
  serde-rs/json#536), extractor/verify split with sha pins. 6,489 rows, deterministic.
- **Differential attacks**: 11 harnesses, all green live (table above), including a
  148k-case engine differential with the 114-case known boundary split out and loud
  (`attack-a3` classifies, doesn't hide).
- **Fail-closed canaries**: 19 canary assertions + 69/69 benchmark-validator mutations
  (`bench-canaries.js` re-run).
- **Original suite through the adapter**: 1974/1977 with the 3 failures itemized and
  mapped to a bug ledger (BUG-005 ×2, BUG-006 ×1). Honest reporting.
- **tests/original byte-frozen** with `HASHES.txt`; `npm test` in the reference still
  1977/1977 — oracle intact.

**Gaps (the review's second-most-important section):**

1. **[BLOCKER-class process gap] No independent review of C5–C9.** `reviews/` contains
   c0-1, c0-2, c2-1, c3-1, c4-1 and nothing later; `.loop/review-ledger.md` has rows for
   C0–C3 only. The prime-directive-breaking findings F-2, F-3, F-6 live precisely in the
   unreviewed chunks (C7 extglob close, C5 brace close, C9 negate). Implementer ≠ reviewer
   was the rulebook's own §11; it was abandoned at the exact point the chunks got hard.
2. **[MAJOR] No grammar-differential fuzzer.** Rulebook §7 requires `fuzz/` with a
   seeded grammar generator, shrinking, `fuzz/divergences/`, and a shipped ≥60 s clean
   `fuzz/log.txt`. There is no `fuzz/` directory. The attack harnesses are *curated*
   generators: they cover `!!!!a` but not `!!(a` (F-6), cover extglob-but-not-dotted-rest
   (F-2), braces-but-not-extglob-inside (F-3). A seeded grammar fuzzer would have found
   all four blockers immediately — the corpus/`active` machinery cannot cover what its
   author didn't think of. BRANCH_REPORT §4 item 5 admits it openly.
3. **[MAJOR] `benchmarks/verify-artifacts.js` is not portable.** The final E2 artifact's
   `provenance.corpus_path` is `"benchmarks\\scenarios.json"` (win32);
   `verify-artifacts.js:121` `path.join`s it verbatim, and on macOS the verification of
   the *canonical final evidence* fails (output shown ↑). The benchmark evidence chain
   was produced and verified on one OS only — ironic given the reference repo's own CI
   runs three.
4. **[MINOR] Benchmark coverage is scanner-only.** The required compile/match/RSS/
   cold-start numbers don't exist (admission in BRANCH_REPORT).
5. **[MINOR] Corpus coverage asymmetry is invisible.** There's no mechanism that would
   tell a maintainer "the `!(x).y.z` production has zero corpus rows"; every gap found in
   §2 was a row that simply doesn't exist in 6,489.

## 6. Documentation

- **DECISIONS.md** (21 `###` headings, numbered into the D-20s): the good entries are
  excellent — D-016 (+unit-exact scanner over `&[u16]`), D-017 (Infinity depth
  transport), D-026 (LTO *rejected* with interleaved A/B evidence), D-024 superseding
  D-021 *because the digests were proven non-identical*. That last one is what decision
  logs are for. **Defects**: numbering has holes (no D-05, D-09…D-14) and a collision
  (two D-017s); BUG-004's "DECISIONS.md D-024" reference died in the renumbering (it
  now lives at D-027). [MINOR]
- **bug-reports.md**: genuinely valuable upstream analysis (BUG-001/002/004 are
  well-root-caused). **But it misstates the shipped state**: BUG-002 says
  "Status in Rust port: Fixed" — empirically false; the shipped `slash_branch`
  (`main_loop.rs:502-503`) clears `state.output` exactly like JS L983 and the unit test
  `test_bug002_prepend_dotslash_collapse` (`main_loop.rs:1314-1328`) pins the buggy
  behavior as "documented bug-for-bug" (the *correct* choice). BUG-001's documented
  reorder is not shipped (F-1). Fix the doc status lines. [MAJOR as documentation]
- **LATEST-UPDATES.md**: stale (still describes "in progress: C3"); the real state lives
  in BRANCH_REPORT.md. [NIT]
- **BRANCH_REPORT.md**: excellent structure and honesty; metric errors (6,937 vs 6,489
  corpus rows; 6,839 vs 5,412 pmx-core LOC) need correcting. [MINOR]
- **No `README.md` at the pmx root.** Rulebook §5 wants the unsafe/unwrap/panic table in
  README; §9 wants regressions disclosed there; the benchmark README
  (`benchmarks/README.md`) exists but the *project* README doesn't. A new contributor
  lands on AGENTS.md, which is good but assumes you already know what "C4" means. [MINOR]
- **AGENTS.md (pmx)**: the "Conventions (would-be-missed)" section is the best
  institutional memory in the repo — the `__u16`, `__num`, push-truthiness, and
  fastpath/slow-path divergence locks are exactly the things a naive agent would break.
  (And F-3 shows even it didn't get its own advice read in one place.)
- Would a new contributor land correctly? **Yes, with one trap** — they'd trust
  bug-reports.md's "Fixed" statuses and BRANCH_REPORT's metrics. Fix those and the docs
  are genuinely superior to most OSS projects.

## 7. Code quality

- **Dead code**: `todo()` helper in `adapter/index.js:11-14` is now unused (all TODO-loud
  surfaces were implemented by the makeRe commit). `ExtglobChars.kind` field is written,
  never read. Minor.
- **Duplicated logic**: options mapping exists twice by design (JS-side defaulting in
  `adapter/index.js` + `parse_options_of` at `pmx-cli/src/lib.rs:22-83`) and BUG-003
  proves the duplication is *dangerous*: seven keys silently dropped until a suite row
  caught it. One JSON schema, one mapper would be better; the current shape at least has
  the BUG-003 regression noted. `wrap_source` (pmx-cli) vs `wrap_output` (pmx-core utils)
  are *deliberately* different wraps and correctly not unified (comment at lib.rs:240-243).
- **Large functions**: `main_loop.rs` is 1,366 lines total, but the dispatch is 156 lines
  of diagnostic `if`/`continue` (`main_loop.rs:66-222`) and every branch is its own fn
  mirroring a JS comment block. The supposed "750-line god function" does not exist —
  `star_branch` at ~280 lines (`main_loop.rs:817-1098`) is the largest, and it has to be
  (JS's is one `if` of the same length, L1128-L1283). Acceptable.
- **Citation hygiene** (verified 6 random sites):
  - `parser.rs:3` "L439-L521 token machinery" → parse.js L439-L521 ✓ exact
  - `state.rs:21` `Dots // L1001` → parse.js L1001 `prev.type = 'dots'` ✓
  - `main_loop.rs:493` "L975-L991 slash branch" → parse.js L975-991 ✓
  - `inline_fastpath.rs:1` "L606-L655" → parse.js L606-655 ✓
  - `extglob.rs:1` "L523-L600 extglobOpen/Close" → parse.js L523/L539 ✓
  - `utils.rs:90` "utils.js:L15" → `exports.toPosixSlashes` at utils.js L15 ✓
  One *semantic* citation failure: `main_loop.rs:689-690` documents the negate guard's
  `peek(3)` condition with the extglobOpen lookaround set — the citation-level origin of
  F-6. A wrong comment that reproduced a wrong port: exactly why promptreview §2 exists.
- **Naming discipline**: consistent (`is_special` vs `REGEX_NON_SPECIAL_CHARS`; unit
  suffixes `_units` distinguish `&[u16]` helpers from `&str` ones).

## 8. Compare against the original

**Cleaner than JS:**

1. `Options` with one accessor per *distinct JS coercion site* (options.rs) instead of
   30 inline `=== true`/`!== false` reads scattered over 1,400 lines — the promptreview
   §4 table-check becomes mechanically auditable. This is the port's best idea.
2. `PmxError`/`thiserror` + `JsNumber` vs ad-hoc `throw new SyntaxError(…)` with template
   interpolation (error.rs) — plus the JS-NaN maxLength quirk made *explicit*.
3. Arena `Vec<Token>` + `prev: usize` vs JS reference-webs that let `tokens[1] === prev`
   identity checks work (`main_loop.rs:247` `self.prev == 1` reproduces
   `tokens.indexOf(prev) === 1` honestly — `parser.rs` and `main_loop.rs:254`).
4. `ScanToken`'s conditional-field presence as `Option<bool>` (scan.rs:89-103) makes
   JS's "property only present when true" a *type*, not a comment.
5. `remove_backslashes` line-terminator quadrant (`utils.rs:125-133`) — JS's regex hides
   four characters; Rust names them, with the oracle probes cited.

**More complicated than JS:**

1. Every emitted string is `Vec<u16>`; concatenation is `extend_from_slice` and equality
   is slice comparison — 2–3× the token budget of JS `+=`. Unavoidable and documented
   (D-02); the price of lone-surrogate honesty.
2. `push()`'s borrow-splitting dance around the token journal (`parser.rs:185-241`).
   JS's aliasing (`prev.output += …`) is four characters shorter and exactly as safe;
   Rust pays the borrow-checker tax in clone-on-merge.
3. The brace-close `tokens.clone()` journal copy (JS `slice()` is shallow).
4. The CLI/JSONL ceremony between pmx-core and the mocha suite (JS: direct calls).

**Clever, name-worthy:**

- Simulating `REGEX_SPECIAL_CHARS_BACKREF` without a regex engine (`inline_fastpath.rs:
  106-199`) — a hand-rolled leftmost non-overlapping scan including the group-3
  backreference run semantics, with byte-pins.
- `hasRegexChars(prevValue)` pre-append slicing trick at `main_loop.rs:360-365`.
- `pop_if` for the extglob frame close (zero drift from JS's stack-pop condition).
- Tests that pin the JS *quirk*, not the intent (`main_loop.rs:1314-1328` BUG-002).

## 9. Maintainer review — the verdict question

**Would I merge this to a production Rust library today? No — CHANGES REQUESTED.**
The infrastructure is world-class for a student event; the parser behavior is not yet
what it says on the tin.

**BLOCKERS (must fix before merge):**

- **B1 (F-1)** `parser.rs:310` — BUG-001 escape-char change alters `makeRe` output and
  boolean matching (`{abc` → `(abc` matches). Requested: revert to JS `escapeLast(output, '{')`
  (parse.js L1300); keep the upstream analysis; amend `bug-reports.md`; add corpus rows and a makeRe-level pin (`$^` for `{abc`).
- **B2 (F-2)** `extglob.rs:562-564` — rest-test too weak. Requested: exact `/^\.[^\\/.]+$/`
  translation (≥2 chars, no subsequent `.`); fixes root cause of their own BUG-006; corpus rows.
- **B3 (F-3)** `main_loop.rs:467-470` — JS truthiness (`t.output || t.value`), not
  null-check. Requested: empty-string output falls back to `value`; corpus rows `{a@(bc)}` etc.
- **B4 (F-6)** `main_loop.rs:694-702` — negate `peek(3)` must be `=== '?'` only
  (parse.js L460). Requested: one-line fix + `!!(` corpus rows + fix the comment at
  main_loop.rs:689-690 that caused it.
- **B5 (process)** No independent reviews for C5–C9 (`reviews/`, `.loop/review-ledger.md`
  stop at C4) — and all four blockers live there. Requested: review cycle per promptreview
  on main_loop/extglob regions before calling the parser "done", and the missing grammar
  fuzzer (rulebook §7) or an explicit waiver with the risk it carried demonstrated here.

**MAJORS:**

- **M1 (F-7)** `main_loop.rs:1167-1192` — `validate_js_range_class` doesn't reproduce
  V8's class grammar (`{a-..z}` flips true↔false at the public API).
- **M2 (F-4)** `main_loop.rs:665` — `> 0` → `!= 0` for JS paren-count truthiness (L805).
- **M3** No fuzz deliverable (§5.2); **M4** `verify-artifacts.js:121` non-portable path
  join — canonical benchmark evidence unverifiable off-win32. **M5** 3 production
  `unwrap()`s (main_loop.rs:431, scan.rs:602, 625) + scan.rs's `as usize` convention
  breach — either honor the workspace's own grep-gate or amend the rulebook text.
- **M6** bug-reports.md status lines disagree with shipped code (BUG-002 "Fixed" — false;
  BUG-001 reorder — not shipped).
- **M7** Missing rulebook §9 numbers (compile/match/RSS/cold-start) and missing pmx root
  README (unsafe table, slower-than-JS disclosure per §9).

**MINORS:** metric errors in BRANCH_REPORT (6,937→6,489; 6,839→5,412); DECISIONS.md
numbering holes + stale cross-reference (BUG-004 → D-027); committed binary
`adapter/native/pmx_node.node` (Mach-O arm64) in git; dead `todo()` in
adapter/index.js:11; stale `#[allow(dead_code)]`s; `picomatch.capture` and
`picomatch.constants` not exposed by the adapter (untested by the suite but public API);
`adapter/_bridge.js` spawn-per-op vs ADAPTER_PLAN's "one long-lived process" text;
`adapter/lib/utils.js` is a near-verbatim JS re-implementation of lib/utils.js —
rulebook §12's "do not vendor" applies to the *port*, so this is defensible as the only
way to serve `require('../lib/utils')`, but it deserves an explicit decision entry.

**NITS:** LATEST-UPDATES.md staleness; `bench-canaries` "scanprobe binary not present"
note unaddressed; `is_pipe` semantic fork (main_loop.rs:870, parser.rs:189) needs a
comment even if unreachable.

## 10. Final assessment

Scores (harsh, justified in one line):

| Axis | Score | One line |
|---|---|---|
| Architecture | **8/10** | Layering, single-dispatch transports, and parse module decomposition are genuinely good; docked for the leaky makeRe boundary and spawn-per-op. |
| Rust quality | **7/10** | Real Rust (UTF-16 discipline, error enums, arena) with 3 self-rule-breaking unwraps and a scanner full of `as usize`. |
| Performance | **6/10** | Scanner is measurably excellent with honest negative results; parser is unmeasured and carries three avoidable allocation habits. |
| Maintainability | **7/10** | Citation culture + chunk docs + ledger are superb; reviewer coverage ends at C4 and two docs lie about shipped state. |
| Documentation | **6/10** | Volume and honesty are above OSS norms; metric errors, stale statuses, renumbering drift, and the missing README cost it. |
| Testing | **6/10** | Corpus+attack+canary machinery is elite *at what it covers*; the coverage model demonstrably missed four divergence classes, and fuzz/CI are absent. |
| Behavioral fidelity | **5/10** | 1974/1977 + 150k clean comparisons — yet a one-afternoon audit produced four user-visible behavior changes, including one *self-inflicted* (F-1). |
| **Overall** | **6.5/10** |

**Questions:**

1. **Does this look like a serious engineering project?** Yes — the corpus/oracle design,
   decision log with supersessions, adversarial review of the benchmark PR that actually
   reverted it (PR #5), and honest bug ledger are the habits of professional teams, not a
   student repo.
2. **Would it strengthen a systems portfolio?** Strongly — *especially* paired with this
   review's follow-up fixes; "ported picomatch bug-for-bug, built the differential
   machinery, caught the engine boundary, and survived adversarial review" is a top-tier
   systems story. The current divergences must be fixed first, or the story has a hole
   exactly where the claim (bug-for-bug) is made.
3. **Comparable to professional OSS Rust work?** The *process and tooling* are comparable
   to good OSS practice (better than most). The *parser correctness bar* is not yet —
   professional parsers ship with fuzzers precisely because curated corpora miss what
   authors can't imagine (see §5.2).
4. **Top 10 strongest parts:**
   1. Corpus/oracle system with chunk-activation + `__u16`/`__num` encodings (`fixtures/canon.js`, `fixtures/verify-*.js` — 6,489 deterministic rows verified live).
   2. Options coercion model — one accessor per JS truthiness site (`crates/pmx-core/src/options.rs`; 11-site spot-check all exact).
   3. The inline fastpath regex simulation (`crates/pmx-core/src/parse/inline_fastpath.rs:106-199`) — byte-perfect, hand-verified.
   4. Single-dispatch dual transport (`pmx-cli/src/lib.rs:373` + `pmx-node/src/lib.rs:15`).
   5. Honest engineering culture: PR #5 reverted over 5 blocking defects; D-021→D-024 supersession *with the disproof evidence kept*; "Rust faster 13, JS faster 5, inconclusive 2".
   6. `PmxError` + `JsNumber` byte-exact JS error reproduction (`crates/pmx-core/src/error.rs`), verified live against both classes.
   7. Scan track: 4,932-case attack + integrated harness at 0 divergences, plus a genuine audit that found and fixed its own blockers (`audits/2026-08-03-0230-*`).
   8. `Vec<u16>` emitted-text law with the astral-surrogate rationale (`state.rs`, D-02/D-016).
   9. pmx/AGENTS.md "Conventions" — institutional memory that names the traps (f64 transport, push truthiness, fastpath lock).
   10. Fastpaths gallery with byte-pins per platform (`crates/pmx-core/src/parse/fastpath.rs:140-232`, `fragments.rs:65-102`).
5. **Top 10 weaknesses:**
   1. Four confirmed behavioral divergences in unreviewed chunk code (F-1, F-2, F-3, F-6 — §2.1).
   2. A deliberate constitution violation shipped as a "fix" (BUG-001; F-1) — the one place the project improved instead of porting.
   3. Independent review coverage ends at C4; blockers live in C5–C9 (`reviews/`, `.loop/review-ledger.md`).
   4. No grammar fuzzer (rulebook §7 deliverable absent; attack generators provably blind to `!!(`, dotted rests, extglob-in-literal-brace).
   5. `expandRange` approximates a RegExp-parse probe it can't approximate safely (F-7).
   6. bug-reports.md documents fixes that aren't shipped / statuses that aren't true (BUG-001 reorder, BUG-002 "Fixed").
   7. Benchmark final evidence non-verifiable outside win32 (`verify-artifacts.js:121` + backslash path in artifact).
   8. Missing rulebook-required README tables + §9 performance numbers; no CI workflow.
   9. Adapter perf architecture (process-per-op) and doc drift vs ADAPTER_PLAN A2; committed Mach-O binary in git.
   10. Self-declared grep-gate breached: 3 production unwraps + scan.rs `as usize` proliferation.

---

_Reviewer's note: F-1 through F-7 were each reproduced with the exact command pairs shown
in §2.1 (+ the side-by-side adapter run in §9's evidence); nothing above is "looks fine".
Fix B1–B4 + M1–M2, add the corpus rows, and this flips to MERGE with enthusiasm._
