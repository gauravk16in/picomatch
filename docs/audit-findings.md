## Audit Findings: Correctness Bugs in picomatch's C0-C5 Implementation

I have thoroughly audited the Rust port (`pmx-core`) against the `lib/parse.js` reference. The Rust port is an extremely accurate, bug-for-bug translation of the JS parser. However, because it is so accurate, it faithfully ports two severe logical correctness bugs present in the original JS code. 

Here are the detailed findings:

### 1. C0: Backtracking wipes out `escapeLast` recovery modifications

**Description:**
When the parser encounters an unbalanced construct (like an unclosed `[` or `{`) and reaches EOF, the `escapeLast` recovery loop correctly runs to escape the unclosed character (e.g., modifying `[` to `\[` in the output). However, `escapeLast` **only mutates the built `state.output` string** and leaves the original unescaped character sitting untouched in the token journal (`state.tokens`).

If `state.backtrack === true` was flagged during parsing (for example, by an unclosed POSIX class like `a[[:alpha:]`, or by brace range evaluation like `{1..3}`), the final step of the parser rebuilds `state.output` entirely from `state.tokens`. This completely obliterates the `escapeLast` fixes, emitting an unescaped, unclosed bracket. In picomatch, this compiles into an invalid RegExp string (like `a[a-zA-Z\/?`) which throws a `SyntaxError: Unterminated character class`, causing `makeRe` to silently fail and fall back to `/$^/`.

**Relevant JS Code (`lib/parse.js`):**
```javascript
  // L1286: Recovery modifies the string, but leaves tokens broken
  while (state.brackets > 0) {
    if (opts.strictBrackets === true) throw new SyntaxError(syntaxError('closing', ']'));
    state.output = utils.escapeLast(state.output, '['); 
    decrement('brackets');
  }

  // L1308: Rebuild blindly replays the broken tokens!
  if (state.backtrack === true) {
    state.output = '';
    for (const token of state.tokens) {
      state.output += token.output != null ? token.output : token.value; // Re-appends unescaped '['!
```

**Relevant Rust Code (`crates/pmx-core/src/parse/parser.rs`):**
```rust
        // L268: Modifies self.state.output
        for (kind, opener, closer) in [ ... ] {
            while self.counter(kind) > 0 {
                self.state.output = utils::escape_last(&self.state.output, opener, None);
                self.decrement(kind);
            }
        }
        
        // L250: Wipes output and restores the unescaped bracket
        if self.state.backtrack {
            self.state.output.clear();
            for token in &self.state.tokens {
                let piece = token.output.as_deref().unwrap_or(&token.value);
                self.state.output.extend_from_slice(piece); 
            }
        }
```

**Impact:**
Any pattern with an unclosed construct that *also* triggers a backtrack operation will compile into a silently broken, invalid regex instead of safely matching literal characters.

**Suggested Fix:**
Instead of `escapeLast` blindly doing string manipulation on `state.output`, the recovery loop must iterate backward through `state.tokens`, find the unclosed opener token, and mutate its `output` field to include the backslash. This persists the fix in the token journal so it survives a `backtrack` rebuild.

---

### 2. C2: Leading `./` collapse destroys `opts.prepend` (conditionally!)

**Description:**
When a pattern starts with `./` (e.g., `./src/*.js`), the C2 slash branch applies an optimization to collapse the prefix by popping the dot token and resetting `state.output = ''`. 

However, the first token in the stream is `bos` (Beginning of String), whose `output` contains `opts.prepend` (user-supplied prepended text). By executing a hard `state.output = ''`, the parser deletes the prepended text that the `bos` token had already pushed to the output string!

Ironically, because `bos.output` is never actually cleared, if a later chunk triggers `state.backtrack = true`, the output rebuilds from `state.tokens` and **magically restores `opts.prepend`**.

**Relevant JS Code (`lib/parse.js`):**
```javascript
      // L975: C2 slash branch
      if (prev.type === 'dot' && state.index === state.start + 1) {
        state.start = state.index + 1;
        state.consumed = '';
        state.output = ''; // BUG: Wipes out the `opts.prepend` emitted by `bos`
        tokens.pop();
        prev = bos; 
        continue;
      }
```

**Relevant Rust Code (`crates/pmx-core/src/parse/main_loop.rs`):**
```rust
        // L249
        if prev_kind == Some(TokenKind::Dot) && self.state.index == start_plus_1 {
            // ...
            self.state.consumed.clear();
            self.state.output.clear(); // BUG: Clears out `opts.prepend`
            self.state.tokens.pop();
            self.prev = 0; 
            return;
        }
```

**Impact:**
If a user relies on `options.prepend`, patterns starting with `./` will mysteriously drop the prepended text. This is highly non-deterministic: if the pattern contains `{a,b}`, it silently lacks the prefix, but if it contains a range like `{a..z}` (which sets `backtrack = true`), the prefix unexpectedly reappears at the end of the parse!

**Suggested Fix:**
Instead of `state.output = ''` (or `output.clear()`), the collapse logic should reset the output to whatever the `bos` token contains. 
In Rust:
```rust
            self.state.output.clear();
            if let Some(bos_tok) = self.state.tokens.first() {
                let piece = bos_tok.output.as_deref().unwrap_or(&bos_tok.value);
                self.state.output.extend_from_slice(piece);
            }
```

---

### Additional Notes on the Spec vs Rust Port
- **C1 `REGEX_SPECIAL_CHARS_BACKREF` engine simulation**: The custom loop in `fastpath.rs` correctly mirrors JS's regex engine greedy matching of `\\?` vs `\W` (falling back to treating the backslash as the non-word char if it can't match a word boundary). 
- **C5 `expandRange` validity probe**: Rust's `validate_js_range_class` behaves remarkably identically to the V8 JS engine logic (testing whether `last_a > first_b`), accurately simulating which ranges throw JS regex syntax errors.
- **C0 `push` text-merging & empty checks**: Using `Option::take()` with `is_empty()` fallbacks accurately replicates JS's evaluation of falsy strings `''`.
- **C5 Dots Hook**: It is placed correctly at the top of the C2 dot branch. The Rust port also accurately replicates the JS bug where `{a...b}` handles the third dot as a new token (instead of appending to `dots`), erroneously evaluating the third dot as a literal inside a range array. 
