# C3_DESIGN.md — Single wildcards: `?` and `*`, with BOS/dot guards

Scope locked by PARSE_CHUNKS.md C3:
- Question mark branch (`lib/parse.js:L1021-L1047`, excluding `extglobOpen('qmark')` which lands in C7)
- Plain star branch (`lib/parse.js:L1246-L1283`, excluding globstar and extglob openers which land in C8 and C7)

## 1. How this section works

C3 implements single wildcards (`?` and `*`) in `crates/pmx-core/src/parse/main_loop.rs`:

1. **Question mark branch (`?`, L1021-L1047)**:
   - Evaluates whether `prev.type === 'paren'`:
     - Checks regex group / lookaround conditions on `peek()` and `remaining()`:
       - `(prev.value === '(' && !/[!=<:]/.test(next))` or `(next === '<' && !/<([!=]|\w+>)/.test(remaining()))`.
       - If true, escapes `?` as `\?` and emits token with `kind: TokenKind::Text`.
     - Otherwise emits token with `kind: TokenKind::Text` and `output: "?"`.
   - Outside parens:
     - Checks if `opts.dot !== true && (prev.type === 'slash' || prev.type === 'bos')`.
     - If true: pushes `TokenKind::Qmark` with `output: QMARK_NO_DOT` (`[^./]` or Windows `[^.\\/]`).
     - Else: pushes `TokenKind::Qmark` with `output: QMARK` (`[^/]` or Windows `[^\\/]`).

2. **Plain star branch (`*`, L1246-L1283)**:
   - Initial token output set to `fragments.star`.
   - If `opts.bash === true`:
     - `token.output` becomes `.*?`.
     - If `prev.type === 'bos' || prev.type === 'slash'`, prepends `nodot` (`(?!\.)` when `!opts.dot`).
     - Pushes `TokenKind::Star` and returns.
   - If `(prev.type === 'bracket' || prev.type === 'paren') && opts.regex === true`:
     - `token.output` becomes raw `*`.
     - Pushes `TokenKind::Star` and returns.
   - Guard prefix selection:
     - Evaluates `state.index === state.start || prev.type === 'slash' || prev.type === 'dot'`:
       - If `prev.type === 'dot'`: prefix = `NO_DOT_SLASH` (`(?!\.{0,1}(?:\/|$))`).
       - Else if `opts.dot === true`: prefix = `NO_DOTS_SLASH` (`(?!\.{1,2}(?:\/|$))`).
       - Else: prefix = `nodot` (`(?!\.)` when `!opts.dot`).
       - If `peek() !== '*'`: appends `ONE_CHAR` (`(?=.)`).
     - Appends prefix to `state.output` AND mutates `prev.output`.
   - Pushes `TokenKind::Star`.

## 2. Why the JS is written this way

- `?` after `(` in JS regexes distinguishes regex group syntax (such as non-capturing groups `(?:...)` or lookaheads `(?=...)`) from literal wildcard `?`. When `(` is followed by `?` without lookaround/group syntax characters (`!`, `=`, `<`, `:`), JS treats `?` as literal regex `\?`.
- Wildcard guard prefixes (`nodot`, `NO_DOT_SLASH`, `NO_DOTS_SLASH`, `ONE_CHAR`) prevent single wildcards (`*`) at segment boundaries (BOS or after `/`) or after dots from matching hidden dotfiles or empty strings unless `opts.dot` explicitly allows dotfiles.

## 3. Every JS semantic that matters

1. **`prev.output` mutation**: Guard prefixes mutate both `state.output` and `prev.output` so that if backtracking or token journal rebuild occurs, token output strings contain the prefix.
2. **`peek() !== '*'` condition**: `ONE_CHAR` (`(?=.)`) is only appended if the character immediately following `*` is NOT `*`.
3. **`opts.bash` mode**: Star output switches to `.*?` with optional `nodot` prefix, bypassing regex-mode and normal guard prefix branches.
4. **`opts.regex` mode**: `*` following `[` or `(` in regex mode passes through as raw `*`.

## 4. Rust implementation plan

- Add `qmark_branch(&mut self)` and `star_branch(&mut self)` to `impl Parser` in `crates/pmx-core/src/parse/main_loop.rs`.
- Wire `QMARK` (`?`) and `STAR` (`*`) in `main_loop()` in source if-order.
- Create `fixtures/extract-c3.js`, `fixtures/c3_oracle.json`, `fixtures/verify-c3.js`.
- Activate chunk 3 rows across all oracle files.
- Verify zero regressions with `cargo test` and node verification scripts.
