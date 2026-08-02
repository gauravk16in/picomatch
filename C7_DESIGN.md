# C7_DESIGN.md — Parens, Extglobs, ReDoS Triage, and Magic Suffix Recursion

Scope locked by PARSE_CHUNKS.md C7:
- Extglob subsystem: `extglobOpen` and `extglobClose` (`lib/parse.js:L523-L600`)
- Extglob openers: `?(` (L1023), `!(` (L1054), `+(` (L1072), `@(` (L1096), `*(` (L1140)
- Pipe `|` conditions accounting (`lib/parse.js:L946-L952`)
- Parentheses `(` / `)` handling (`lib/parse.js:L788-L808`)
- ReDoS triage static analysis helpers (`lib/parse.js:L48-L347`)

## 1. How this section works

C7 implements the entire extglob matching subsystem (`?(...)`, `!(...)`, `+(...)`, `@(...)`, `*(...)`), nested parenthesized groups, `|` condition counting, ReDoS vulnerability triage for repeated extglobs, and magic suffix recursive parsing.

### A. Option Coercion & Stack Invariants
- `opts.noext` / `opts.noextglob`: `opts.noextglob()`. When true, extglob openers are treated as plain literals.
- `opts.maxExtglobRecursion`: `ExtglobRecursion` enum:
  - `Unset`: default recursion limit (`DEFAULT_MAX_EXTGLOB_RECURSION = 0.0`).
  - `Disabled`: `maxExtglobRecursion === false` (disables ReDoS triage).
  - `Limit(f64)`: custom numeric threshold.
- `parens` Counter: `increment('parens')` on open paren / extglob, `decrement('parens')` on close paren.

### B. ReDoS Static Analysis (`L48-L347`)
1. `split_top_level`: Splits a pattern string by top-level `|` delimiters (respecting quotes, brackets, parens, escapes).
2. `is_plain_branch`: Checks if a branch string contains unescaped special characters.
3. `normalize_simple_branch`: Iteratively strips `@(...)` wrappers, verifies plainness, and unescapes `\(.)`.
4. `has_repeated_char_prefix_overlap`: Detects prefix overlap among single-char repeated branches.
5. `parse_repeated_extglob`: Matches leading `+(...)` or `*(...)` construct.
6. `get_star_extglob_sequence_chars`: Extracts single-character targets from `*(...)` sequences.
7. `build_char_class_star`: Formats single character or character-class star expressions (`a*` or `[ab]*`).
8. `repeated_extglob_recursion`: Measures nesting depth of repeated extglobs.
9. `analyze_repeated_extglob`: Evaluates whether a repeated extglob body is `risky` for catastrophic backtracking. Returns `{ risky: bool, safe_output: Option<Vec<u16>> }`.

### C. Extglob Opener Dispatch
When encountering `?`, `!`, `+`, `@`, `*` followed by `(`:
- If `!opts.noextglob()` and matching opener pattern:
  - `@(`: Pushes token `TokenKind::At` (`value = "@"`, `output = ""`, `extglob = true`), then next iteration handles `(`.
  - `?(`: Calls `extglobOpen("qmark", "?")`.
  - `!(`: Calls `extglobOpen("negate", "!")`.
  - `+(`: Calls `extglobOpen("plus", "+")`.
  - `*(`: Calls `extglobOpen("star", "*")`.

### D. `extglobOpen` (`L523-L537`)
1. Create `ExtglobFrame`:
   - `kind`: `"qmark" | "negate" | "plus" | "star" | "at"`
   - `open`, `close`: template strings from `EXTGLOB_CHARS`
   - `conditions`: 1
   - `inner`: `Vec::new()`
   - `prev`, `parens`, `output`, `start_index`, `tokens_index`
2. `output = (if capture { "(" } else { "" }) + open`
3. `increment('parens')`
4. `push(Token::units(kind, value, if state.output.is_empty() { Some(one_char) } else { Some(vec![]) }))`
5. `advance()` (consumes `(`)
6. `push(Token::units(TokenKind::Paren, "(", Some(output)))`
7. Push frame to `self.extglobs`.

### E. `extglobClose` (`L539-L600`)
1. Pop `token` frame from `self.extglobs`.
2. Extract `body` units from input slice `[token.start_index + 2..state.index]`.
3. Perform ReDoS analysis: `analyze_repeated_extglob(body, opts)`.
4. **Risky Triage Handling (`L544-L566`)**:
   - If `(kind == "plus" || kind == "star") && analysis.risky`:
     - Mutate opening token at `token.tokens_index` to `type = "text"`, `value = literal`, `output = safe_output || escape_regex(literal)`.
     - Blank out subsequent token values and outputs up to current `state.tokens.len()`.
     - Set `state.output = token.output + open.output` and `state.backtrack = true`.
     - Push closing `TokenKind::Paren` (`value = ")"`).
     - Decrement `parens`.
     - Return.
5. **Negate Close & Recursive Suffix Parse (`L571-L596`)**:
   - If `kind == "negate"`:
     - Select `extglob_star` (`star` vs `globstar(opts)` if `inner` has `/`).
     - If `extglob_star` changed, or `eos()`, or remainder matches `/^\)+$/`: `output = close = ")$))" + extglob_star`.
     - If `inner` contains `*` and remainder matches `/^\.[^\\/.]+$/`:
       - Run recursive parse: `expression = parse(rest, { ...options, fastpaths: false }).output`.
       - Set `close = ")" + expression + ")" + extglob_star + ")"`.
     - If `token.prev.kind == TokenKind::Bos`: set `state.negated_extglob = true`.
6. Push closing `TokenKind::Paren` (`value = ")"`).
7. Decrement `parens`.

### F. Parentheses Branch `(` / `)` (`L788-L808`)
- `(`: Increment `parens`, push `TokenKind::Paren` (`value = "("`).
- `)`:
  - If `state.parens == 0 && opts.strict_brackets()`: throw `SyntaxError("Unclosed (")`.
  - If `extglob` frame active on stack top and `state.parens == extglob.parens + 1`: call `extglobClose(extglobs.pop())`.
  - Else: push `TokenKind::Paren` (`value = ")"`, `output = if parens > 0 { ")" } else { "\\)" }`), decrement `parens`.
