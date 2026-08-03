# C6_DESIGN.md — Brackets and POSIX classes

Scope locked by PARSE_CHUNKS.md C6:
- `[]` character classes: open/close branches (`lib/parse.js:L814-L875`)
- In-class character accumulation and POSIX class expansion (`lib/parse.js:L718-L758`)
- `bos.output = ONE_CHAR` upgrade when POSIX class is the first token (`lib/parse.js:L734-L736`)

## 1. How this section works

C6 implements character classes (`[...]`), POSIX bracket classes (`[:alnum:]`, `[:digit:]`, etc.), negative character classes (`[^...]`, `[!...]`), strict bracket validation, and `literalBrackets` output modes.

### A. Option Coercion & Stack Invariants
- `opts.nobracket`: `opts.nobracket === true`. When true, `[` and `]` are treated as literal text.
- `opts.strictBrackets`: `opts.strictBrackets === true`. When true, unclosed `[` or unmatched `]` throws `SyntaxError`.
- `opts.posix`: Checked asymmetrically:
  - `opts.posix !== false` allows POSIX expansion (`[:name:]`).
  - `opts.posix === true` converts leading `!` in `[!...]` to `^`.
- `opts.literalBrackets`: 3-way enum/state: `Some(true)` (escaped literal string), `Some(false)` (regex character class), or `None` (3-way alternation `(capture\\[...\\]|[...])`).

### B. Open Bracket `[` (`L814-L827`)
1. If `opts.nobracket === true` or `!remaining().contains(']')`:
   - If `opts.nobracket !== true` and `opts.strictBrackets === true`: throw `SyntaxError("Unclosed [")`.
   - Set `value = "\\["`.
2. Else:
   - Increment `state.brackets`.
3. Push `TokenKind::Bracket` with `value = value`.

### C. In-Class Character Accumulation (`L718-L758`)
Triggered when `state.brackets > 0 && (value != ']' || prev.value == "[" || prev.value == "[^")`:

1. **POSIX Class Expansion (`L719-L741`)**:
   - If `opts.posix !== false && value == ':'`:
     - Slice `inner = prev.value[1..]`.
     - If `inner` contains `'['`:
       - Mark `prev.posix = true`.
       - If `inner` contains `':'`:
         - Find `idx = prev.value.rfind('[')`.
         - Get `rest = prev.value[idx + 2..]`.
         - Look up `rest` in `POSIX_REGEX_SOURCE`.
         - If found:
           - Replace `prev.value` with `pre + posix_source`.
           - Set `state.backtrack = true`.
           - Advance input index (skip closing `:`).
           - If `!bos.output && tokens.indexOf(prev) == 1`: set `bos.output = ONE_CHAR`.
           - `continue`.

2. **In-Class Escaping & Replacements (`L743-L753`)**:
   - If `(value == '[' && peek() != ':') || (value == '-' && peek() == ']')`: `value = "\\${value}"`.
   - If `value == ']' && (prev.value == "[" || prev.value == "[^")`: `value = "\\${value}"`.
   - If `opts.posix === true && value == '!' && prev.value == "["`: `value = "^"`.

3. **Append to Bracket Token (`L755-L757`)**:
   - `prev.value += value`.
   - `append({ value })`.

### D. Close Bracket `]` (`L829-L875`)
1. If `opts.nobracket === true` or `prev.kind == TokenKind::Bracket && prev.value.len() == 1`:
   - Push `TokenKind::Text` with `value = "]"`, `output = "\\]"`.
   - `continue`.
2. If `state.brackets == 0`:
   - If `opts.strictBrackets === true`: throw `SyntaxError("Unclosed [")`.
   - Push `TokenKind::Text` with `value = "]"`, `output = "\\]"`.
   - `continue`.
3. Decrement `state.brackets`.
4. Slice `prev_val = prev.value[1..]`.
5. If `!prev.posix && prev_val.starts_with('^') && !prev_val.contains('/')`:
   - `value = "/]"`.
6. Append `value` to `prev.value` and `append({ value })`.
7. **Literal Brackets 3-Way Handling (`L854-L874`)**:
   - If `opts.literalBrackets == Some(false)` or `utils::has_regex_chars(prev_val)`:
     - `continue`.
   - Compute `escaped = utils::escape_regex(&prev.value)`.
   - Re-slice `state.output = state.output[..state.output.len() - prev.value.len()]`.
   - If `opts.literalBrackets == Some(true)`:
     - `state.output += escaped`.
     - `prev.value = escaped`.
     - `continue`.
   - Else (`literalBrackets` unset):
     - `prev.value = format!("({capture}{escaped}|{})", prev.value)`.
     - `state.output += prev.value`.
     - `continue`.

## 2. POSIX Regex Source Table
The 14 standard POSIX class names mapped in `POSIX_REGEX_SOURCE`:
- `alnum`: `"a-zA-Z0-9"`
- `alpha`: `"a-zA-Z"`
- `ascii`: `"\\x00-\\x7F"`
- `blank`: `" \\t"`
- `cntrl`: `"\\x00-\\x1F\\x7F"`
- `digit`: `"0-9"`
- `graph`: `"\\x21-\\x7E"`
- `lower`: `"a-z"`
- `print`: `"\\x20-\\x7E "`
- `punct`: `"\\-!\"#$%&'()*+,./:;<=>?@[\\]^_`{|}~"`
- `space`: `" \\t\\r\\n\\v\\f"`
- `upper`: `"A-Z"`
- `word`: `"A-Za-z0-9_"`
- `xdigit`: `"A-Fa-f0-9"`

## 3. Key Behavioral Parity Directives
1. **`[!...]` literal `!` default**: Unless `opts.posix === true`, `[!...]` treats `!` as a literal character, NOT negation (`^`).
2. **`[^...]` slash injection**: On close bracket, if class starts with `^` and contains no `/` (and is not POSIX), `]` becomes `/]`.
3. **`literalBrackets` 3-Way**:
   - `false`: emits regex character class verbatim.
   - `true`: escapes brackets to literal string match.
   - Unset (`None`): emits 3-way regex alternation `(capture\\escaped|class)` when class contains no regex special characters.
