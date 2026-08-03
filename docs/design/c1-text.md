# C1_DESIGN.md — Main loop dispatcher: NUL, escapes, quotes, text + inline fastpath

Scope locked by PARSE_CHUNKS.md C1: inline fastpath (parse.js:L606-L655), main-loop NUL skip (L661-L666), escape handling (L672-L711, brackets==0 path only), quote handling (L765-L782), plain-text branch (L1109-L1122). Nothing else: no slash/dot/braces/brackets/extglobs/stars/globstars/negation.

## 1. How this section works

Two alternate production routes, chosen per pattern:

**Route A — inline fastpath** (L606): if `opts.fastpaths !== false` AND the routing regex `/(^[*!]|[/()[\]{}"])/` does NOT match the (prefix-stripped) input, the whole tokenizer is bypassed: one `String.replace` with `REGEX_SPECIAL_CHARS_BACKREF` rewrites non-word chars in a single pass, a backslash-collapse pass runs if any literal backslash was seen, then `utils.wrapOutput` anchors the output and the state returns *early*. No tokens are created (tokens stay `[bos]`, index stays −1, consumed stays `''`).

**Route B — main loop** (L661): `while (!eos()) advance one char` with a fixed-order decision chain. C1 implements four of its links:
1. NUL skip (L664): ``'\u0000'`` is silently dropped.
2. Escape `\` (L672): several guards (drop `\/` unless bash, drop `\.` and `\;`, trailing `\` doubles, >2-run collapse with odd-parity rule), then the escaped char is emitted as text — *unless* `state.brackets > 0`, in which case control falls through to the C6 bracket branch (which doesn't exist yet; C1's counter is always 0 today).
3. Quotes (L765-L782): inside quotes, every char is individually `escapeRegex`'d and appended into the *previous* token's value; `"` toggles `state.quotes` 0↔1, emitted as text only under `keepQuotes === true`. Unclosed quotes are legal — no recovery loop cares about `quotes`.
4. Plain text (L1109): `$` and `^` get a backslash prefix; a literal run is greedily coalesced via `REGEX_NON_SPECIAL_CHARS` (`/^[^@![\].,$*+?^{}()|\\/]+/` — stops at any of `@ ! [ \ ] . , $ * + ? ^ { } ( ) | \ /`) and pushed as `text`, merging into a preceding `text` token through C0's `push`.

## 2. Why the JS is written this way

- The single-replace fastpath exists because most glob inputs are nearly literal: one regex sweep beats a state machine when no structural construct can appear. The routing regex is the *contract*: any char that later chunks reinterpret (`/ ( ) [ ] { } "`) or that changes BOS semantics (`*`, `!`) forces the slow loop, so fastpath bytes stay correct by construction.
- `REGEX_SPECIAL_CHARS_BACKREF` = `/ (\\?) ((\W) (\3*)) /g`: one match captures an optional escape backslash + a *run of the same* non-word char, letting the callback emit per-char operators once per run (`??` → `QMARK`×2 from one match) and detect "pattern contains a literal backslash" in the same pass.
- Quote chars are individually escaped because quoted text must be pure literal; escaping through the shared `escapeRegex` keeps the special-char table single-sourced.
- Text-run coalescing + `push`'s text-merge (C0) exist for the *star disambiguator* (C3/C8): lookbehind checks read whole segments via `prev`, so literal runs must be single tokens.

## 3. Every JS semantic that matters

1. **Routing first, on stripped input.** `./` is removed (C0) before the routing regex tests (L606 sees the stripped string). `fastpaths !== false` (undefined counts as on).
2. **Backref callback dispatch order**: `first==='\\'` → mark backslashes, echo unchanged. `first==='?'` → escaped: `esc + '?' + QMARK×rest`; at offset 0: `qmarkNoDot + QMARK×rest`; else `QMARK×chars.length`. `first==='.'` → `DOT_LITERAL×chars.length`. `first==='*'` → escaped: `esc + '*' + (rest ? star : '')`; else just `star` (a *run* of stars collapses to ONE fragment — `a**b` ≠ `a*b*`). Anything else → escaped echo (`esc ? m : '\\'+m`).
3. **Backslash collapse** (only if '\\' was seen): `output.replace(/\\/g,'')` under `unescape===true`, else run-length parity: even run → TWO backslashes, odd run → ONE (length is *collapsed*, runs don't add).
4. **`contains`/`negated` exit**: `output === input && opts.contains === true` → `state.output = input` bare (no wrap). Negation wrap is dormant here: routing excludes leading `!`, so `state.negated` is always false on this route; the wrapper is still ported faithfully for the `contains` anchoring difference.
5. **Escape branch guards, in order**: `\/` dropped unless `bash`; `\.` and `\;` dropped unconditionally; trailing `\` (peek:none) → push double-backslash text; `/^\\+/` run on `remaining()`: length > 2 ⇒ cursor += run, `value += '\\'` iff run odd; then `value += advance()` (or `= advance()` under `unescape===true`); pushed as `text` **only if `state.brackets === 0`** (C6 will make that branch reachable — today never taken, but the check is coded, not elided, to keep the chunk boundary honest).
6. **`escapeRegex` set** (constants.js:L101): `- * + ? . ^ $ { } ( ) | [ \ ]` — quote contents escape one char at a time, appended into `prev.value` (not pushed).
7. **`keepQuotes`** emits the quote char as text; quote toggling is unconditional otherwise.
8. **`REGEX_NON_SPECIAL_CHARS` coalescing** (literal-run set: stops at `@ ! [ \ ] . , $ * + ? ^ { } ( ) | \ /`) and `state.index += match[0].length` — length in UTF-16 units (C-1), the astral-index behavior the corpus pins.
9. **`\u0000` skip** precedes everything — NUL never reaches tokens under any option.
10. **Text merge` sees `tok.value`, not `tok.output`** (C0 push, L512-L516) — so `$`/`^` escaping done before push survives, and the merge path reproduces the original's "first-token-output + later raw values" shape.

## 4. Rust ownership/borrowing decisions

- `impl Parser` extension in a new `parse/inline_fastpath.rs` + `parse/main_loop.rs`: both are methods on the same C0 `Parser` (single owner, no context passes). `Fragments` moves from parser.rs into `parse/fragments.rs` so inline fastpath (called *before* the loop exists conceptually) and the loop share it — C0's only sanctioned integration edit (also removes the C0 `#[allow(dead_code)]` on the `fragments` field).
- Inline fastpath: `fn try_inline(&mut self) -> bool` — reads `input_chars`, writes `state.output`, returns "handled". Called from `mod.rs::parse` before `main_loop`. No `Result` — inline fastpath never errors.
- The backref replace pass is a hand-rolled left-to-right simulator over `&[u16]` producing a `String` (see pitfalls #1): no regex crate, no allocations beyond the output buffer with `with_capacity(input.len()*2)`.
- `state.quotes` counter semantics stay `i32` (field already exists — no layout change). `keepQuotes` accessor lands now with citation (parse.js:L778).
- `utils::escape_regex(&str)` added (constants.js:L101 set); `utils::wrap_output(output, negated, contains)` added port of utils.js:L52-L61 (negation branch present but provably dead on this route — documented, not deleted).
- New option accessors this chunk: `keep_quotes()` (`=== true`, L778), `unescape()` (`=== true`, L639/L701), `contains()` (truthy, utils.js:L53-54).

## 5. Interactions with existing C0 structures

- Storage (`Vec<u16>` input), cursor ops (`peek/advance/remaining/char_at`), `push` with its empty-empty skip, text-merge, and extglob-inner accumulation are reused unchanged — the escape branch's `value += advance()` and quote branch's token mutation exercise them exactly as designed.
- `Parser::finish` (recovery → maybe_slash → rebuild) is unchanged; C1 patterns legitimately can't dirty `backtrack`, so the rebuild stays dormant. maybe_slash's `prev.kind` check now sees real `Text` tokens (never Star/Bracket in C1) — no-op, correct.
- `Options` gains three accessors; **no** `Options` fields change. `Fragments::{qmark_no_dot, star, nodot}` are read for the first time (dead-code allow removed).
- `c0_oracle.json` rows with `chunk: 1` activate by flipping the extractor's active threshold `chunk <= 1`; all 20 chunk-0 rows must remain green (C0 behavior regressed = automatic loop failure).

## 6. Pitfalls

1. **The backref simulator must be semantics-first, not regex-shaped.** `/ (\\?) ((\W)(\3*)) /g` on `'a\bc'`: greedy `\\?` fails → backtrack, then `\W` matches the backslash itself. My simulator handles that as: backslash followed by a word char ⇒ `first='\\'`, chars = the backslash run. Word chars are `[A-Za-z0-9_]` (JS `\W` is ASCII-based; astral surrogates are non-word — each half escaped individually, the ill-formed-UTF-16 output case from C0 findings).
2. **Offset, not index-0 semantics confusion:** the callback's 6th arg (`index`) is the *match offset into input* — `index === 0` ⇒ pattern-start `?`. Only ONE match can sit at offset 0, so qmarkNoDot fires at most once.
3. **Star runs collapse to a single fragment** in the fastpath (`a**b` → one `star`), while qmark runs repeat (`??` → `QMARK`×2) and dot runs repeat-encoded. Easy to "rationalize" and diverge.
4. **The trailing-backslash and JS-string-`value` nuance:** `value += '\\'` makes a two-*char* value pushed as text (raw form), distinct from `escapeRegex` output — corpus bytes decide, and they say `a\` → text value `a\` (one raw) then `\\\\` (the doubled one)... extraction will pin all of these; do not guess.
5. **Quote branch order**: quote-content branch must run BEFORE the quote-toggle branch (L765 before L776) — and both AFTER the escape branch, since `"` can't be escaped away by `\.`/`\/` guards (only `\.`, `\;`, `\/` are dropped — `\\"` passes through escape first: peek('\"') not in drop sets → `value = '\\' + '"'` pushed as text; the `"` never toggles quote state).
6. **Routing-edge honesty:** with C2-C9 branches absent, `'a\/b'` or `'a\\.b'` would fall into my text branch and produce *different bytes* than full-lib (which routes `/` to the slash branch, `.` through the dot branch). The corpus must therefore contain **only** patterns whose bytes are identical under both interpretations — proven by extraction (every row is re-derived from the real lib, so staging is enforced by the corpus itself). For `a\\.b`: full-lib dot branch produces the same bytes as C1's text fallback (verified during extraction, both `a.b`); the row is included with a note.
7. `advance()` returning `None` for trailing backslash must map to JS `value === ''` handling — JS pushes `value + '\\'`; my Option maps `None` → that branch (peek returns None ⇒ trailing).
8. `wrapOutput`'s empty-body shape: `wrapOutput('', {...})` → `^(?:)$` — the `state.empty-pattern` row activates, watch the parens.

## 7. Exact boundaries with future chunks

| Boundary | C1 duty | Owner |
|---|---|---|
| escape branch fall-through when `brackets > 0` | condition coded, never taken today | C6 |
| `\/` dropped escape → the `/` itself | unconsumed on `continue`; lands in loop next iteration as `-text` until C2's slash branch changes its bytes | C2 |
| `\.` dropped escape → the `.` itself | same; text-fallback happens to byte-match for plain sequences (corpus-enforced) | C2 |
| `!`, `+`, `@`, `?` + `(` extglob openers | not probed by C1 (C1 text would treat them literally) | C7 |
| `*` and `**` | unmatched by routing (start) or the C1 `*` probe absence — pattern-level exclusions in corpus | C3/C8 |
| `push` demotion | insertion comment remains untouched | C8 |
| `parse.fastpaths` gallery (L1330+) | NOT this chunk (fastpath *gallery* == C4; inline fastpath == C1) — keep naming distinct | C4 |
| `state.output` anchoring | via `utils.wrap_output` only (compileRe wraps again outside parse — untouched, picomatch.js layer) | picomatch layer |

## 8. Unit-test plan

In-file `#[cfg(test)]` (parser module): byte-pinned cases captured from node on the reference:
- `REGEX_SPECIAL_CHARS_BACKREF` simulator: `a*b`, `a**b`, `?ab`, `a??b`, `a\\bc`, `a\\\\b`(2/3/4 runs), `a^b`, `a,b` — each with expected output from node.
- backslash collapse: unescape true/false × run-length parity 1..5.
- `escape_regex` table across the 15-char set.
- `wrap_output`: anchored/bare-contains/empty.
- routing predicate: start-`*`, start-`!`, contains-`/`, clean — duplicate of corpus but local.
- quote escapes bytewise (`a"+*^"b`).

## 9. Oracle strategy

- `fixtures/extract-c1.js` → `fixtures/c1_oracle.json` (own corpus; rows all `chunk:1`, `active:true`) — ~30 rows: inline-fastpath family (default opts), slow family (`fastpaths:false`), mixed options (unescape/keepQuotes/contains/dot), quote/NUL/collapse families. Capturing full state (oracles 2) — C1 rows can carry the `assert-all` default because every char in them is C1-owned, plus route-equivalence via `fastpaths:false` double-coverage where the routing regex allows both.
- `fixtures/extract-c0.js` active threshold flips to `chunk <= 1`: activates its 7 staged C1 rows (`state.empty-pattern`, `text.*`, `state.defaults`, `guard.len.astral.ok`). C0 rows keep passing = C0 unregressed.
- `verify-c1.js` determinism harness; accept = full state byte + unit-sequence equality.
- Route bookkeeping printed by tests: fastpath vs slow distribution across both corpora.
