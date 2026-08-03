# C9_DESIGN.md — Pattern Negation (`!`) and `negate()`

Scope locked by PARSE_CHUNKS.md C9:
- `negate()` function (`lib/parse.js:L457-L473`)
- The `!` branch's non-extglob path (`lib/parse.js:L1061-L1065`)
- Verification that C7's `!(` opener ordering precedes the `negate()` call

## 1. What `negate()` does (lib/parse.js:L457-L473)

```js
const negate = () => {
  let count = 1;

  while (peek() === '!' && (peek(2) !== '(' || peek(3) === '?')) {
    advance();
    state.start++;
    count++;
  }

  if (count % 2 === 0) {
    return false;
  }

  state.negated = true;
  state.start++;
  return true;
};
```

Called only when `opts.nonegate !== true && state.index === 0` (the leading `!`).

### Algorithm

1. **Start**: `count = 1` (the first `!` has already been advanced to by the outer loop).
2. **While** `peek(1) === '!'` **and** `(peek(2) !== '(' || peek(3) === '?')`:
   - Advance the cursor (consumes the next `!`)
   - `state.start++`
   - `count++`
3. **Even parity** (`count % 2 === 0`): Return `false`. Do NOT set `negated`. Do NOT do final `start++`. The leading `!`s are all consumed but negation is cancelled (double-negation = positive match).
4. **Odd parity** (`count % 2 !== 0`): Set `state.negated = true`, do `state.start++`, return `true`.

### Key observations

- The outer `!` branch in the main loop **always calls `continue`** after calling `negate()`, regardless of return value. This means the leading `!` is unconditionally consumed.
- The `while` condition's paren guard `(peek(2) !== '(' || peek(3) === '?')` stops eating `!` chars when the next `!` opens an extglob (i.e., `!!(` would stop at the second `!` because peek(2) would be `(` and peek(3) would be something other than `?`).
- `state.start` accumulates the count of consumed `!` chars (minus the final one for even parity).

### Examples

| Pattern  | count | negated | start |
|----------|-------|---------|-------|
| `!a`     | 1     | true    | 1     |
| `!!a`    | 2     | false   | 1     |
| `!!!a`   | 3     | true    | 3     |
| `!!!!a`  | 4     | false   | 3     |
| `!!(a)`  | 1*    | true    | 1     |
| `!!!(a)` | 1*    | false†  | 1     |

\* `!!(` — after consuming first `!` at index=0, peek(1)=`!`, peek(2)=`(` — since peek(2) IS `(` and peek(3)!=`?`, the while condition fails. count stays 1. negated=true. start=1.

† `!!!(` — first `!` consumed, peek(1)=`!`, peek(2)=`!` ≠ `(` — condition holds, advance, start=1, count=2. Then peek(1)=`!`, peek(2)=`(` and peek(3)=`a`≠`?` — condition fails. count=2, even → return false. negated stays false. start=1.

## 2. Integration into exclamation_branch

The current Rust implementation (C7 stub) sets `self.state.negated = true` directly without parity counting. C9 replaces this with a proper `negate()` method.

### Order (matching source L1053-L1065)

```
if value == '!':
    1. if !noextglob && peek(1) == '(' && (peek(2) != '?' || peek(3) in special):
         extglobOpen("negate", '!')
         return   // ← C7 (already implemented)
    2. if !nonegate && state.index == 0:
         negate()  // ← C9: replaces direct set
         return   // (always continue, already handled by outer dispatch)
    3. else: fall through to text_branch
```

## 3. Implementation plan

### `negate()` in `parser.rs` or `main_loop.rs`

Add a `negate()` method on `Parser`:

```rust
/// L457-L473 — negate(): consume leading !s, set parity
/// Returns true if pattern is negated (odd count), false if even (positive).
/// The outer branch always continues regardless of return value.
fn negate(&mut self) {
    let mut count: u32 = 1;
    while self.peek(1) == Some(EXCLAMATION)
        && (self.peek(2) != Some(LPAREN)
            || self.peek(3).is_some_and(|u| u == EXCLAMATION
                || u == b'=' as u16
                || u == b'<' as u16
                || u == COLON))
    {
        self.advance();
        self.state.start += 1;
        count += 1;
    }
    if count % 2 == 0 {
        return; // even: not negated, final start++ omitted
    }
    self.state.negated = true;
    self.state.start += 1;
}
```

### Update `exclamation_branch()` in `main_loop.rs`

Replace `self.state.negated = true; return;` with `self.negate(); return;`.

## 4. Verification plan

- Create `C9_DESIGN.md` (this file).
- Record Decision D-08 in `DECISIONS.md`.
- Implement `negate()` method on `Parser`.
- Update `exclamation_branch` in `main_loop.rs`.
- Create `fixtures/extract-c9.js`, extract `fixtures/c9_oracle.json`, create `fixtures/verify-c9.js`, `fixtures/attack-c9.js`.
- Run `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`.
- Run `node fixtures/attack-c9.js`.
- Commit and push.
