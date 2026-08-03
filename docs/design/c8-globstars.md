# C8_DESIGN.md — Globstar Machinery and Push Demotion

Scope locked by PARSE_CHUNKS.md C8:
- Globstar demotion block in `push()` (`lib/parse.js:L493-L505`)
- Star / Globstar branch machine (`lib/parse.js:L1128-L1244`)
- Globstar fragment generator `globstar(opts)` from `fragments.rs`

## 1. How this section works

C8 implements double-star `**` globstar handling, context-dependent regex fragment construction, `push()` demotion, consecutive `/**/` stripping, `bash` empty-output star semantics, and `noglobstar` absorption.

### A. `push()` Demotion (`L493-L505`)
When `push(tok)` is called and the previous token `prev` is `TokenKind::Globstar`:
- Check if `tok` is a protected construct:
  - `isBrace`: `state.braces > 0 && (tok.kind == Comma || tok.kind == Brace)`
  - `isExtglob`: `tok.extglob || (extglobs.len() > 0 && (tok.kind == Pipe || tok.kind == Paren))`
- If `tok.kind != Slash && tok.kind != Paren && !isBrace && !isExtglob`:
  - Demote `prev` from `Globstar` to `Star`: `prev.kind = TokenKind::Star`, `prev.value = vec![STAR]`, `prev.output = Some(fragments.star)`.
  - Slice `state.output` to strip `prev`'s prior globstar output and append `fragments.star`.

### B. Loop Level Star-Run Collapse (`L1128-L1137`)
When `value == STAR` and `prev` was already `TokenKind::Globstar` or `prev.star == true`:
- `prev.kind = TokenKind::Star`, `prev.star = true`, `prev.value.push(STAR)`, `prev.output = Some(fragments.star)`.
- `state.backtrack = true`, `state.globstar = true`.
- Advance input index and `continue`.

### C. Globstar Second-Star Context Branches (`L1145-L1244`)
When `value == STAR` and `prev.kind == TokenKind::Star`:
1. **`noglobstar === true`**: Advance input and `continue`.
2. **`bash === true`**: If not at segment start (`!isStart`) or followed by non-slash character, push `{ type: Star, value: '*', output: '' }` and `continue`.
3. **Mid-segment / non-start demotion**: If `!isStart && prior.kind != Paren && !isBrace && !isExtglob`, push `{ type: Star, value: '*', output: '' }` and `continue`.
4. **Consecutive `/**/` stripping**: `while rest.starts_with("/**")`, if the character after `/**` is not `/`, strip `/**` from input.
5. **`prior.kind == Bos && eos()`**:
   - `prev.kind = Globstar`, `prev.output = globstar(opts)`, `state.output = prev.output`, `state.globstar = true`.
6. **`prior.kind == Slash && prior.prev != Bos && !afterStar && eos()`**:
   - Wrap `prior.output` in `(?:...`.
   - `prev.kind = Globstar`, `prev.output = globstar(opts) + (if strictSlashes { ")" } else { "|$)" })`.
   - Update `state.output` and `state.globstar = true`.
7. **`prior.kind == Slash && prior.prev != Bos && rest[0] == '/'`**:
   - Wrap `prior.output` in `(?:...`.
   - `prev.kind = Globstar`, `prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})``.
   - Consume `/`, push `{ type: Slash, value: '/', output: '' }`.
8. **`prior.kind == Bos && rest[0] == '/'`**:
   - `prev.kind = Globstar`, `prev.output = "(?:^|" + SLASH_LITERAL + "|" + globstar(opts) + SLASH_LITERAL + ")"`.
   - Consume `/`, push `{ type: Slash, value: '/', output: '' }`.
9. **Default Globstar**:
   - Replace `prev.output` in `state.output` with `globstar(opts)`.
   - `prev.kind = Globstar`, `state.globstar = true`.
