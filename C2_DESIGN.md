# C2_DESIGN.md — Segment semantics: slash handling, dot handling, `./` collapse

Scope locked by PARSE_CHUNKS.md C2: slash branch (lib/parse.js:L975-L991) and dot branch (L997-L1015, excluding L998-L1006 brace `dots` hook which lands in C5).

## 1. How this section works

C2 implements the path separator (`/`) and dot (`.`) branches in `main_loop.rs`:

1. **Slash branch (`/`, L975-L991)**:
   - Checks leading `./` collapse condition: `prev.type === 'dot' && state.index === state.start + 1`.
   - If true: advances `state.start` to `state.index + 1`, clears `state.consumed` and `state.output`, pops the `dot` token from `state.tokens`, resets `prev` to `bos` (index 0), and continues loop.
   - If false: pushes token with `kind: TokenKind::Slash`, `value: '/'`, `output: platform.slash_literal`.

2. **Dot branch (`.`, L997-L1015)**:
   - (C5 brace range hook `state.braces > 0 && prev.type === 'dot'` is skipped when `state.braces == 0`).
   - Checks if dot is inside a text segment: `(state.braces + state.parens) === 0 && prev.type !== 'bos' && prev.type !== 'slash'`.
   - If true: pushes token with `kind: TokenKind::Text`, `value: '.'`, `output: platform.dot_literal`. `push()` merges this into the preceding `text` token if present.
   - If false: pushes token with `kind: TokenKind::Dot`, `value: '.'`, `output: platform.dot_literal`.

## 2. Why the JS is written this way

- Leading `./` collapse strips relative path prefixes during parsing so lookbehinds and BOS guards do not need to account for optional `./` prefixes when inspecting `prev.type`.
- Typing dots as `dot` vs `text`: dots adjacent to `bos` or `slash` (e.g. `.foo` or `a/.foo`) are typed `dot` because wildcard guard conditions (such as `nodot` / `no_dots`) specifically check `prev.type === 'dot'` to enforce dotfile privacy. Dots within text segments (e.g., `a.b`) are typed `text` so they merge into single text tokens for regex optimization.

## 3. Every JS semantic that matters

1. **Leading `./` collapse mutates 5 state components**: `state.start`, `state.consumed`, `state.output`, `state.tokens` (via `pop`), and `prev` (reset to `bos` / index 0).
2. **`state.index === state.start + 1` condition**: only collapses `./` when the `.` token was at index `state.start` and `/` is at `state.start + 1`. Mid-string `./` (e.g. `a/./b`) has `state.index > state.start + 1` and does NOT collapse.
3. **Dot token output is always `DOT_LITERAL` (`\.`)**: even when typed as `TokenKind::Text`, `output` is `platform.dot_literal`. When `push()` merges a `Text` token into a preceding `Text` token, `append_token` has ALREADY emitted `output` (`\.`) into `state.output`, while `push()` appends raw `value` (`.`) into the token's stored `output`/`value`.
4. **Escape branch interaction**: `\.` in non-bash mode drops `\` in `escape_branch` without consuming `.`. The next loop iteration processes `.` via `dot_branch()`, emitting `DOT_LITERAL` (`\.`) and typing it appropriately.

## 4. Rust implementation plan

- Add `slash_branch(&mut self)` and `dot_branch(&mut self)` to `impl Parser` in `crates/pmx-core/src/parse/main_loop.rs`.
- Wire `FSLASH` (`/`) and `DOT` (`.`) branches in `main_loop()` in source if-order (slash L975 before dot L997).
- Update `is_special` in `main_loop.rs` to stop literal runs at `/` and `.`.
- Extend `c0_foundation.rs` corpus runner to include `c2_oracle.json`.

## 5. Oracle and Verification Strategy

- Create `fixtures/extract-c2.js`, `fixtures/c2_oracle.json`, `fixtures/verify-c2.js`.
- Activate staged C2 rows in `c0_oracle.json` (`text.merge`) and `c1_oracle.json` (`sl.escape.dropdot`, `sl.text.astral-merge`) by setting threshold `chunk <= 2`.
- Run cargo test, verify zero regressions in C0 and C1, and 100% byte & state match in C2.
