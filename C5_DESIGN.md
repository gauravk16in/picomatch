# C5_DESIGN.md — Braces: alternation, ranges, `expandRange`

Scope locked by PARSE_CHUNKS.md C5:
- `{`/`}` frames and comma alternation (`lib/parse.js:L881-L940`, `L958-L969`)
- Dot-dot range assembly with token-list surgery (`lib/parse.js:L907-L923`, `L997-L1006`)
- The `expandRange` helper including custom-callback path (`lib/parse.js:L22-L38`)

## 1. How this section works

C5 implements brace expressions, comma alternation within braces, dot-dot sequence range expansion (`{a..z}`, `{1..10}`), and custom range expansion callbacks.

### A. Option Coercion & Stack Invariants
- `opts.nobrace`: `opts.nobrace === true`. When enabled, `{` and `}` are emitted as literal text tokens `{ type: 'text', value: '{' }` and `{ type: 'text', value: '}' }`.
- `braces` Counter: `increment('braces')` on valid `{`, `decrement('braces')` on matching `}`.
- Stack tracking: `stack` array pushes `'braces'` when entering braces so comma branch (`L963`) can verify `stack[stack.length - 1] === 'braces'`.

### B. Frame Object (`BraceFrame`)
Each open `{` creates a frame:
- `output_index`: `state.output.len()` at frame creation.
- `tokens_index`: `state.tokens.len()` at frame creation.
- `dots`: boolean flag, set to `true` when a `..` token sequence is formed inside this brace.
- `comma`: boolean flag, set to `true` when a `,` token is processed while this brace is the active innermost construct on `stack`.

### C. Open Brace `{` (`L881-L895`)
1. Increment `state.braces` and push `CounterKind::Braces` to `stack`.
2. Push `BraceFrame` to `self.braces` stack.
3. Push token `TokenKind::Brace` with `value = "{"`, `output = "("`.

### D. Comma `,` (`L958-L969`)
1. Default `output = ","`.
2. If `braces` stack is non-empty and `self.stack.last() == Some(&CounterKind::Braces)`:
   - Set active `brace.comma = true`.
   - Change `output = "|"`.
3. Push token `TokenKind::Comma` with `value = ","`, `output = output`.

### E. Dot Hook inside Braces (`L998-L1006`)
In `dot_branch()` when `value == '.'`:
1. If `state.braces > 0` and `prev.kind == TokenKind::Dot`:
   - If `prev.value == "."`, set `prev.output = "\\."`.
   - Update `prev.kind = TokenKind::Dots`.
   - Append `.` to `prev.output` and `prev.value`.
   - Set active `brace.dots = true`.
   - Return (skip pushing new token).

### F. Close Brace `}` (`L897-L940`)
1. Pop `brace` frame from `self.braces`.
2. If `opts.nobrace == true` or `brace` is `None`:
   - Push `TokenKind::Text` with `value = "}"`, `output = "}"`.
   - Return.
3. If `brace.dots == true`:
   - Pop tokens from `state.tokens` backwards down to (and including) the opening `TokenKind::Brace`.
   - Collect values of non-`Dots` tokens into `range`.
   - Reverse `range` to preserve order.
   - Run `output = expand_range(&range, &self.opts)`.
   - Set `state.backtrack = true`.
4. If `!brace.comma && !brace.dots`:
   - Re-slice `state.output` back to `brace.output_index`.
   - Mutate opening token at `brace.tokens_index` to `value = "\\{"`, `output = "\\{"`.
   - Mutate closing token values/output to `'\\}'`.
   - Re-append outputs of all tokens in `state.tokens[brace.tokens_index..]`.
5. Push token `TokenKind::Brace` with `value = value`, `output = output`.
6. Decrement `state.braces` and pop `stack`.

### G. Range Expansion (`expandRange`, `L22-L38`)
1. If `options.expand_range` custom callback is set: call `f(&args, options)`.
2. Otherwise:
   - Sort `args` lexicographically by UTF-16 code unit values.
   - Form `value = format!("[{}]", args.join("-"))`.
   - Validate JS RegExp syntax compatibility for `value` (valid range bounds & non-escaping trailing backslash).
   - If valid, return `value`.
   - If invalid, return `args.map(|v| utils::escape_regex(v)).join("..")`.

## 2. Why the JS is written this way

- JS uses shared object references so mutating `brace.dots = true` or `brace.comma = true` updates the frame in both `braces` array and `state.tokens`.
- In Rust, `BraceFrame` indices into `state.tokens` allow mutating the open brace token at `brace.tokens_index` during close brace processing.
- Setting `state.backtrack = true` on range expansion triggers full output rebuild in `finish()`, ensuring token stream surgery is reflected in `state.output`.

## 3. Every JS semantic that matters

1. **`nobrace` Option**: Disables brace syntax entirely, keeping `{` and `}` as plain literal text.
2. **Inner construct stack check**: `,` only converts to `|` when innermost construct on stack is `braces` (e.g. `{a,b}` -> `(a|b)`, but `{ [a,b] }` -> comma inside bracket remains `,`).
3. **Dot range assembly**: `{a..z}` converts to range regex `[a-z]`. Invalid ranges (e.g. `{foo..bar}`) hit the escaped fallback `bar..foo`.
4. **No-comma/no-dots literal fallback**: `{abc}` has neither `,` nor `..`, so it escapes to `\\{abc\\}`.

## 4. Rust implementation plan

- Update `crates/pmx-core/src/options.rs` with `nobrace` and `expand_range` option fields.
- Update `crates/pmx-core/src/utils.rs` with `escape_regex` helper.
- Update `crates/pmx-core/src/parse/parser.rs` with `BraceFrame` stack and frame management.
- Update `crates/pmx-core/src/parse/main_loop.rs` with brace open `{`, brace close `}`, comma `,`, and dot hook.
- Extract C5 oracle fixtures (`fixtures/extract-c5.js`, `fixtures/c5_oracle.json`).
- Verify C5 oracle fixtures (`fixtures/verify-c5.js`).
- Run differential attack tests (`fixtures/attack-c5.js`).
