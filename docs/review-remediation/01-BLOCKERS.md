# Review Remediation — BLOCKER Behavioral Divergences (B1–B4)

This document details the root causes, JS reference comparisons, Rust implementations, and verification evidence for the 4 BLOCKER behavioral findings identified in the General Deep Review.

---

## 1. Finding F-1 (B1): BUG-001 Escape-Char Reversion

### Problem Description
The project previously contained an attempt to "fix" upstream bug BUG-001 inside `crates/pmx-core/src/parse/parser.rs`. In JavaScript (`lib/parse.js` L1298), brace-open emits `(` as regex output. When an unclosed brace is encountered (e.g. `{abc`), the end-of-input recovery loop calls `utils.escapeLast(state.output, '{')`. Since `state.output` contains `(` and not `{`, `escapeLast` finds nothing and returns `"(abc"`. This invalid regex string triggers the fallback in `toRegex` (`picomatch.js` L344-L346) which evaluates to `/$^/` (matching nothing).

The Rust port replaced `'}'` with `'('` in the recovery tuple at `parser.rs:310`. This repaired the output string to `"\\(abc"`, turning invalid regex into valid regex `^(?:\(abc)$`. As a result, `pm('{abc')('(abc')` returned `true` in Rust while JS returned `false`. This constituted a direct violation of constitution §1 ("bug-for-bug parity").

### Fix Implementation
Reverted the recovery opener character in `crates/pmx-core/src/parse/parser.rs` from `'('` back to `'{'`.

```diff
--- a/crates/pmx-core/src/parse/parser.rs
+++ b/crates/pmx-core/src/parse/parser.rs
@@ -307,7 +307,7 @@ impl Parser {
         for (kind, opener, closer) in [
             (CounterKind::Brackets, '[', ']'),
             (CounterKind::Parens, '(', ')'),
-            (CounterKind::Braces, '(', '}'), // BUG-001: brace open emits '(' as output, not '{'
+            (CounterKind::Braces, '{', '}'), // JS L1298: escapeLast(output, '{') — no-ops because output has '(' not '{'; bug-for-bug per constitution §1
         ] {
             while self.counter(kind) > 0 {
```

### Verification
- **Output string**: `parse('{abc', {fastpaths: false}).output` yields `"(abc"` (unit-tested in `test_bug001_unclosed_brace_recovery`).
- **Matching behavior**: `makeRe('{abc').source` yields `"$^"`, and `pm('{abc')('(abc')` yields `false` on both JS and Rust sides.

---

## 2. Finding F-2 (B2): extglobClose Rest-Test Mistranslation

### Problem Description
In `crates/pmx-core/src/parse/extglob.rs` (lines 562-564), the `extglobClose` logic tested the remaining pattern input using:
```rust
if rem_str.starts_with('.') && !rem_str.contains('/') && !rem_str.contains('\\')
```
This was a mistranslation of JS `lib/parse.js` L582:
```javascript
if (/^\.[^\\/.]+$/.test(rest))
```
The JS regular expression requires:
1. Pattern starts with `.`
2. Total remaining length is $\ge 2$ characters
3. Remainder contains **no backslashes, no forward slashes, and no additional dots**.

The Rust implementation missed constraints (2) and (3), allowing pattern rests like `.b.c` or `.` to be absorbed into the negative lookahead block. For example:
- Pattern `x!(*a).b.c` produced `(?!(?:[^/]*?a)\.b\.c)` instead of `(?!(?:[^/]*?a))`
- Pattern `x!(*a).` produced `(?!(?:[^/]*?a)\.)` instead of `(?!(?:[^/]*?a))`

This mistranslation was also identified as the root cause of upstream issue BUG-006.

### Fix Implementation
Replaced `rem_str` String conversion and substring checks with exact `u16` slice inspection in `crates/pmx-core/src/parse/extglob.rs`.

```diff
--- a/crates/pmx-core/src/parse/extglob.rs
+++ b/crates/pmx-core/src/parse/extglob.rs
@@ -562,8 +562,11 @@ impl Parser {
             if token.inner.contains(&STAR) {
-                let rem_str = String::from_utf16_lossy(remaining_units);
-                if rem_str.starts_with('.') && !rem_str.contains('/') && !rem_str.contains('\\') {
+                // JS L582: /^\.[^\\/\.]+$/.test(rest) — starts with '.', >=2 chars total,
+                // and NO backslash, forward-slash, or additional dot in the remainder.
+                let rem = remaining_units;
+                if rem.len() >= 2
+                    && rem[0] == DOT
+                    && rem[1..].iter().all(|&u| u != BS && u != FSLASH && u != DOT)
+                {
+                    let rem_str = String::from_utf16_lossy(rem);
```

### Verification
- Unit test `test_f2_extglob_rest_dotted` asserts that `x!(*a).b.c` and `x!(*a).` produce regexes where `.b.c` and `.` remain outside the negative lookahead assertion.
- BUG-006 test suite rows now pass completely.

---

## 3. Finding F-3 (B3): Brace Literal-Close JS Truthiness for Empty Output

### Problem Description
In `crates/pmx-core/src/parse/main_loop.rs` (lines 467-469), literal brace close rebuild processed token output using:
```rust
let piece = t.output.as_deref().unwrap_or(&t.value);
```
In JavaScript (`lib/parse.js` L931), the rebuild executes `state.output += (t.output || t.value)`. In JS, the empty string `""` is **falsy**.

When an `@` extglob token is pushed inside a non-empty `state.output` context (`extglob.rs` L451-L455), its token output is initialized to `Some(vec![])` (empty). Inside a literalized brace (such as `{a@(bc)}`), Rust's `unwrap_or` saw `Some([])` and emitted `""`, dropping `@` from the output string. This produced `\{a(bc)\}` instead of `\{a@(bc)\}`, causing a boolean match flip (`pm('{a@(bc)}')('{abc}')` returned `true` in Rust vs `false` in JS).

### Fix Implementation
Updated the token output extraction in `crates/pmx-core/src/parse/main_loop.rs` to treat empty `Vec<u16>` as falsy, matching JS `(t.output || t.value)` semantics.

```diff
--- a/crates/pmx-core/src/parse/main_loop.rs
+++ b/crates/pmx-core/src/parse/main_loop.rs
@@ -467,3 +467,7 @@ impl Parser {
             for t in &toks {
-                let piece = t.output.as_deref().unwrap_or(&t.value);
+                // JS L931: `state.output += (t.output || t.value)` — '' is falsy in JS.
+                let piece = match t.output.as_deref() {
+                    Some(o) if !o.is_empty() => o,
+                    _ => &t.value,
+                };
                 self.state.output.extend_from_slice(piece);
```

*(Note: The backtrack rebuild in `parser.rs:293` was deliberately kept as a null-check `unwrap_or`, as JS `lib/parse.js` L1313 uses `token.output != null ? token.output : token.value` where `"" != null` is `true`.)*

### Verification
- Unit test `test_f3_brace_literal_close_empty_output` verifies that `parse('{a@(bc)}')` outputs `\\{a@(bc)\\}` with `@` intact.
- Matching behavior `pm('{a@(bc)}')('{abc}')` returns `false` on both sides.

---

## 4. Finding F-6 (B4): Negate Lookahead Guard (`peek(3)`)

### Problem Description
In `crates/pmx-core/src/parse/main_loop.rs` (lines 694-702), the `negate()` while-loop condition was:
```rust
while self.peek(1) == Some(EXCLAMATION)
    && (self.peek(2) != Some(LPAREN)
        || self.peek(3).is_some_and(|u| {
            u == EXCLAMATION || u == b'=' as u16 || u == b'<' as u16 || u == COLON || u == b'?' as u16
        }))
```
This was a porting error where lookahead characters from the `extglobOpen` guard (`lib/parse.js` L1055) were accidentally transplanted into `negate()` (`lib/parse.js` L460). JS L460 reads strictly:
```javascript
while (peek() === '!' && (peek(2) !== '(' || peek(3) === '?'))
```

Because of the extra lookahead checks, inputs like `!!(!a)` or `!!(=a)` failed to recognize `!(` as an extglob open, leading Rust to treat `!(!a)` as plain text rather than a negated extglob pattern (`negated=false` instead of `negated=true`).

### Fix Implementation
Corrected the while-loop condition and doc comment in `crates/pmx-core/src/parse/main_loop.rs`.

```diff
--- a/crates/pmx-core/src/parse/main_loop.rs
+++ b/crates/pmx-core/src/parse/main_loop.rs
@@ -689,2 +689,2 @@ impl Parser {
-    ///   `peek(2) === '(' && peek(3) !== '?' / '!' / '=' / '<' / ':'`
+    ///   `peek(2) === '(' && peek(3) !== '?'`  (parse.js L460; the `!=<:` set belongs to extglobOpen L1055)
     fn negate(&mut self) {
@@ -694,9 +694,2 @@ impl Parser {
         while self.peek(1) == Some(EXCLAMATION)
-            && (self.peek(2) != Some(LPAREN)
-                || self.peek(3).is_some_and(|u| {
-                    u == EXCLAMATION
-                        || u == b'=' as u16
-                        || u == b'<' as u16
-                        || u == COLON
-                        || u == b'?' as u16
-                }))
+            && (self.peek(2) != Some(LPAREN) || self.peek(3) == Some(b'?' as u16))
```

### Verification
- Unit test `test_f6_negate_peek3_only_question` asserts that `!!(!a)` and `!!(=a)` set `negated = true`.
