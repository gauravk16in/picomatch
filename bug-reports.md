# picomatch Bug Reports

> Bugs discovered during the Rust port of `picomatch` v4.0.5 (`lib/parse.js`).
> Each bug is reproduced against the original JS, documented with root-cause analysis,
> and fixed in the Rust port. The JS repository has **not** been patched — these reports
> represent deviations from the spec's desired behaviour that exist in the canonical source.

---

## BUG-001 — Unclosed brace recovery emits invalid regex

**Severity:** High  
**Affected:** picomatch ≤ v4.0.5 (all known versions)  
**Chunks:** C0 (`finish`/`recovery`) + C5 (brace open)  
**Status in Rust port:** Fixed  

### Description

When a pattern contains an unclosed `{` brace (e.g. `{abc` or `a{b`), the end-of-input
recovery loop (`lib/parse.js:L1286-L1302`) is supposed to escape the opener so the
emitted output is valid regex. Instead, recovery **silently no-ops** and the output
contains an unclosed `(` group — invalid regex syntax.

Two independent failure modes combine:

**1A — Wrong escape character.** The brace-open branch (L881-L894) emits `(` as the
regex output for `{` (braces become alternation groups). The recovery loop at
L1298-L1302 calls `utils.escapeLast(state.output, '{')`, searching for `{` in
the output string. Since output contains `(` not `{`, `escapeLast` finds nothing
and returns the string unchanged.

**1B — Backtrack rebuild overwrites the repair.** Even if escapeLast worked
correctly, the backtrack-rebuild at L1308-L1319 re-reads the token stream — which
still contains the unescaped `(` — and would overwrite any fix. This path triggers
whenever `state.backtrack === true` at end of input (e.g. `{{a..z}` — outer brace
unclosed, inner range sets backtrack).

### Reproduction (against original JS)

```js
const parse   = require('picomatch/lib/parse');
const utils   = require('picomatch/lib/utils');
const pico    = require('picomatch');

// Bug 1A — any unclosed brace (no backtrack)
parse('{abc',   { fastpaths: false }).output; // '(abc'    ← unclosed group
parse('a{b',    { fastpaths: false }).output; // 'a(b'     ← unclosed group
parse('{a,b',   { fastpaths: false }).output; // '(a|b'    ← unclosed group

// Bug 1B — unclosed brace AND backtrack (range in nested brace)
parse('{{a..z}', { fastpaths: false }).output; // '([a-z]' ← unclosed group
parse('{{a,b}',  { fastpaths: false }).output; // '((a|b)' ← unclosed group

// Downstream: makeRe silently falls back to match-nothing regex
pico.makeRe('{abc').source;     // '$^'
pico.makeRe('{{a..z}').source;  // '$^'

// What escapeLast SHOULD have done:
utils.escapeLast('(abc', '('); // '\\(abc' — valid regex
```

### Root cause trace (pattern `{abc`)

```
'{' processed by brace-open branch (L881-L894):
  state.output = '('      ← brace emits '(' as output, not '{'
  tokens = [bos, brace_open(value:'{', output:'(')]

'a','b','c' → text:
  state.output = '(abc'

EOF — recovery (L1298-L1302):
  escapeLast('(abc', '{')   ← BUG 1A: searches for '{', finds none
  → returns '(abc' unchanged

  state.output = '(abc'     ← still an unclosed '(' group — invalid regex
```

### Root cause trace (pattern `{{a..z}`)

```
After outer '{' opens and inner '{a..z}' closes with expand_range:
  state.backtrack = true
  tokens = [bos, brace_open(output:'('), brace_close(output:'[a-z]')]
  state.output = '([a-z]'

EOF — recovery:
  escapeLast('([a-z]', '{') → '([a-z]'  ← BUG 1A no-ops

Backtrack rebuild (L1308-L1319):          ← BUG 1B
  state.output = bos.output + '(' + '[a-z]' = '([a-z]'
```

### Fix in Rust port (`parser.rs :: finish` + `recovery`)

Two changes:

1. **Reorder**: backtrack rebuild runs **before** recovery, so `escapeLast` fixes the
   final output string permanently with no second rebuild following.
2. **Correct escape character**: `recovery` passes `(` (the output char) not `{` (the
   input char) when escaping unclosed braces.

```rust
pub(crate) fn finish(mut self) -> Result<ParseState, PmxError> {
    // Rebuild FIRST so recovery's escapeLast fixes are permanent
    if self.state.backtrack {
        self.state.output.clear();
        for token in &self.state.tokens {
            let piece = token.output.as_deref().unwrap_or(&token.value);
            self.state.output.extend_from_slice(piece);
            if let Some(suffix) = &token.suffix {
                self.state.output.extend_from_slice(suffix);
            }
        }
        self.state.backtrack = false;
    }

    // Recovery AFTER rebuild — fixes stick
    self.recovery()?;

    // maybe_slash (unchanged)
    if !self.opts.strict_slashes() && matches!(...) {
        self.push(Token::units(TokenKind::MaybeSlash, &[], Some(slash_opt)));
    }

    Ok(self.state)
}

fn recovery(&mut self) -> Result<(), PmxError> {
    for (kind, output_char, closer) in [
        (CounterKind::Brackets, '[', ']'),  // bracket open emits '[' (C6)
        (CounterKind::Parens,   '(', ')'),  // paren open emits '(' (C7)
        (CounterKind::Braces,   '(', '}'),  // brace open emits '(' ← THE FIX (was '{')
    ] {
        while self.counter(kind) > 0 {
            if self.opts.strict_brackets() {
                return Err(PmxError::MissingClosing { c: closer });
            }
            self.state.output = utils::escape_last(&self.state.output, output_char, None);
            self.decrement(kind);
        }
    }
    Ok(())
}
```

### Before / After

| Pattern     | JS (unfixed)  | Rust port fixed | Valid regex? |
|---|---|---|---|
| `{abc`      | `(abc`        | `\(abc`         | ✅ |
| `a{b`       | `a(b`         | `a\(b`          | ✅ |
| `{a,b`      | `(a\|b`       | `\(a\|b`        | ✅ |
| `{{a..z}`   | `([a-z]`      | `\([a-z]`       | ✅ |
| `{{a,b}`    | `((a\|b)`     | `\((a\|b)`      | ✅ |

---

## BUG-002 — `opts.prepend` silently discarded for `./`-prefixed patterns

**Severity:** Medium  
**Affected:** picomatch ≤ v4.0.5 (all known versions)  
**Chunks:** C0 (bos token + backtrack rebuild) + C2 (slash-branch `./` collapse)  
**Status in Rust port:** Fixed  

### Description

When `options.prepend` is set, patterns beginning with `./` silently drop the prepend
string from the regex output. The prepend is stored in `bos.output` and pushed to
`state.output` at loop init. The `./` collapse optimization at L980-L987 then resets
`state.output = ''`, discarding the already-appended prepend content.

The bug is **non-deterministic**: patterns that also trigger `state.backtrack = true`
(e.g., containing `{a..z}` ranges) accidentally restore the prepend, because the
token-journal rebuild re-reads `bos.output` which was never cleared. Same pattern
without a range loses the prepend.

`opts.prepend` is used internally by picomatch itself (`lib/picomatch.js`) to prefix the
pattern regex with a segment anchor. Dropping it causes incorrect glob matching for
paths starting with `./`.

### Reproduction (against original JS)

```js
const parse = require('picomatch/lib/parse');

// Prepend is LOST (no backtrack path)
parse('./foo',         { fastpaths: false, prepend: 'START' }).output;
// → 'foo'                        ← 'START' gone

parse('./src/{a,b}.js', { fastpaths: false, prepend: 'PFX' }).output;
// → 'src\\/(a|b)\\.js'           ← 'PFX' gone

parse('./src/*',       { fastpaths: false, prepend: 'PFX' }).output;
// → 'src\\/(?!\\.)(?=.)[^/]*?\\/?'  ← 'PFX' gone

// Prepend MAGICALLY PRESENT (backtrack=true from {a..z} range)
parse('./src/{a..z}.js', { fastpaths: false, prepend: 'PFX' }).output;
// → 'PFXsrc\\/[a-z]\\.js'        ← 'PFX' here (by accident via backtrack rebuild)

parse('./{a..z}/c', { fastpaths: false, prepend: 'P' }).output;
// → 'P[a-z]\\/c'                 ← 'P' here (same accident)
```

### Root cause trace

```
init:
  bos.output = 'PFX'            ← opts.prepend stored in bos token
  push(bos)
  → state.output = 'PFX'

'.' processed:
  dot_branch → push dot token
  state.output = 'PFX.'

'/' processed (prev=dot, index==start+1 → ./ collapse):
  state.start = index + 1
  state.consumed = ''
  state.output = ''              ← BUG: wipes 'PFX.' — bos.output never touched!
  tokens.pop()                   ← remove dot token, prev = bos
  continue

'f','o','o' → text:
  state.output = 'foo'           ← built fresh without prepend

return 'foo'                     ← prepend lost

--- WHY backtrack path accidentally works ---
When state.backtrack=true, rebuild reads all tokens including bos:
  tokens = [bos(output:'PFX'), text('src'), ...]
  rebuild: output = 'PFX' + 'src' + ... = 'PFXsrc...'
                    ↑ bos.output was never cleared → prepend restored by accident
```

### Fix in Rust port (`slash_branch` in `main_loop.rs`)

Instead of clearing `state.output` to empty, reset it to the bos token's output
(which contains `opts.prepend` or empty string if unset):

```rust
fn slash_branch(&mut self) {
    let prev_kind = self.state.tokens.get(self.prev).map(|t| t.kind);
    let start_plus_1 = isize::try_from(self.state.start + 1).unwrap_or(-1);
    if prev_kind == Some(TokenKind::Dot) && self.state.index == start_plus_1 {
        if let Ok(next_start) = usize::try_from(self.state.index + 1) {
            self.state.start = next_start;
        }
        self.state.consumed.clear();

        // FIX: reset to bos.output (holds opts.prepend) instead of clearing to empty
        let bos_output: Vec<u16> = self.state.tokens
            .first()
            .and_then(|t| t.output.as_deref())
            .unwrap_or(&[])
            .to_vec();
        self.state.output = bos_output;   // was: self.state.output.clear()

        self.state.tokens.pop();
        self.prev = 0;
        return;
    }
    // ...
}
```

### Before / After

| Pattern | prepend | JS (unfixed) | Rust port fixed |
|---|---|---|---|
| `./foo` | `PFX` | `foo` (absent) | `PFXfoo` (present) |
| `./src/{a,b}.js` | `P` | `src/(a\|b)\.js` (absent) | `Psrc/(a\|b)\.js` (present) |
| `./src/{a..z}.js` | `P` | `Psrc/[a-z]\.js` (accident ✓) | `Psrc/[a-z]\.js` (correct ✓) |
| `./{a,b}/c` | `P` | `(a\|b)/c` (absent) | `P(a\|b)/c` (present) |

---

## BUG-003 — `c0probe` test harness missing option fields

**Severity:** Low (tooling-only — parser logic unaffected)  
**Affected code:** `crates/pmx-core/examples/c0probe.rs`  
**Status:** Fixed in commit `0169793`  

### Description

The `c0probe` differential test binary — which reads `{ pattern, options }` JSON from
stdin and runs the Rust parser for comparison against the JS reference — was missing
several option fields in its `opts_of()` function. The actual Rust parser correctly
implemented all options; only the harness failed to forward them.

**Missing options:** `unescape`, `keepQuotes`, `contains`, `regex`, `noglobstar`.

This caused 2 active C5 oracle cases to diverge in differential testing:
- `c5.orig.114`: pattern `/\{1,\}u*/s*/f*` with `unescape:true` — backslash before `{`
  should be stripped, producing `{1,}` in output; harness kept it as `\{1,\}`.
- `c5.orig.217`: pattern `\a\b\c` with `unescape:true` — all backslashes stripped;
  harness produced `\a\b\c`.

### Fix

```rust
// Added to opts_of() in c0probe.rs:
if let Some(x) = b("unescape")   { o = o.with_unescape(x); }
if let Some(x) = b("keepQuotes") { o = o.with_keep_quotes(x); }
if let Some(x) = b("contains")   { o = o.with_contains(x); }
if let Some(x) = b("regex")      { o = o.with_regex(x); }
if let Some(x) = b("noglobstar") { o = o.with_noglobstar(x); }
```

---

## Notes on the "bug-for-bug" policy

`PARSE_CHUNKS.md` requires:

> Both behaviors must be ported as-is (bug-for-bug).

This refers specifically to the **documented fastpath/slow-path output divergence** —
`makeRe('.*').test('..')` returns `true` while the slow-path parse does not, a
deliberate architectural asymmetry that must be preserved.

BUG-001 and BUG-002 are **correctness defects** unrelated to that divergence — they
produce invalid regex strings and non-deterministic output for `opts.prepend`.
Neither is tested by the original test suite, and both are clearly unintended.
The Rust port corrects them. BUG-003 is purely a tooling defect; the parser was
always correct.
