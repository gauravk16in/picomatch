# API Reference

Full API documentation for `pmx` — the Rust port of picomatch v4.0.5.

---

## Core Functions

### `parse(pattern, options)`

Compiles a glob pattern into an unanchored ECMAScript regex source string (`Vec<u16>`) and a detailed `ParseState`.

```rust
pub fn parse(input: &str, options: &Options) -> Result<ParseState, PmxError>
```

#### Example:
```rust
use pmx_core::{parse, Options};

let opts = Options::default();
let state = parse("foo/{a,b}/*.js", &opts).unwrap();

println!("Substituted input: {}", state.input);
println!("Prefix: {}", state.prefix);
println!("Regex source (UTF-16 units): {:?}", state.output);
```

---

### `scan(input, scan_options)`

Analyzes a glob pattern **without compiling a regular expression**, returning path metadata (`prefix`, `base`, `glob`), token streams, path slashes, parts, and depth attributes.

```rust
pub fn scan(input: &str, opts: &ScanOptions) -> ScanState
pub fn scan_utf16(units: &[u16], opts: &ScanOptions) -> ScanState
```

#### Example:
```rust
use pmx_core::{scan, ScanOptions};

let opts = ScanOptions::default().with_parts(true).with_tokens(true);
let state = scan("./src/@(components)/**/*.tsx", &opts);

assert_eq!(state.prefix, "./");
assert_eq!(state.base, "src");
assert_eq!(state.glob, "@(components)/**/*.tsx");
assert!(state.is_extglob);
assert!(state.is_globstar);
assert_eq!(state.max_depth, Some(f64::INFINITY));
```

---

### `fastpaths(input, options)`

Attempts to compile the pattern using a closed-form template engine for common glob patterns (`*`, `.*`, `*.*`, `*/*`, `**`, `**/*`, `**/*.*`, `**/.*`, and extension chains like `*.rs`, `*.tar.gz`). Returns `Some(String)` if claimed, or `None` if the pattern must fall back to `parse()`.

```rust
pub fn fastpaths(input: &str, options: &Options) -> Result<Option<String>, PmxError>
```

---

### `is_match` & `exec_captures`

Executes emitted regex source unit buffers against target string unit buffers under ECMAScript regex semantics.

```rust
pub fn is_match(
    source_units: &[u16],
    input_units: &[u16],
    flags: ExecFlags
) -> Result<bool, ExecError>

pub fn exec_captures(
    source_units: &[u16],
    input_units: &[u16],
    flags: ExecFlags
) -> Result<Option<Vec<GroupRange>>, ExecError>
```

---

### `dispatch`

IPC JSON protocol engine used by `pmx --serve` and `pmx-node` to process JSON request objects.

Supported operations: `parse`, `scan`, `regexTest`, `regexExec`, `makeRe`, `compileRe`.

```rust
pub fn dispatch(req: &serde_json::Value) -> serde_json::Value
pub fn dispatch_str(line: &str) -> String
```

#### Example (JSONL over `pmx --serve`):
```bash
echo '{"op":"parse","pattern":"*.js","options":{}}' | cargo run -p pmx-cli -- --serve
```

---

## Options

Options are built using a chainable builder pattern on `Options`:

```rust
use pmx_core::Options;

let opts = Options::default()
    .with_dot(true)
    .with_windows(true)
    .with_bash(true)
    .with_strict_brackets(true);
```

### Parse Options

| Field | Method | Type | Default | Description |
|---|---|---|---|---|
| `dot` | `with_dot(bool)` | `Option<bool>` | `false` | Allows patterns to match leading dots (e.g. `.gitignore`) |
| `windows` | `with_windows(bool)` | `Option<bool>` | `false` | Enables Windows path separator rules (treats `\` as `/`) |
| `bash` | `with_bash(bool)` | `Option<bool>` | `false` | Enables Bash-specific star matching semantics |
| `capture` | `with_capture(bool)` | `Option<bool>` | `false` | Wraps star and extglob outputs in capturing parens `(...)` |
| `contains` | `with_contains(bool)` | `Option<bool>` | `false` | Omits `^` and `$` regex anchors |
| `fastpaths` | `with_fastpaths(bool)` | `Option<bool>` | `true` | Enables fastpath template engine |
| `noext` / `noextglob` | `with_noextglob(bool)` | `Option<bool>` | `false` | Disables extglob expansion (`@(..)`, `+(..)`, etc.) |
| `nonegate` | `with_nonegate(bool)` | `Option<bool>` | `false` | Disables leading `!` pattern negation |
| `nobrace` | `with_nobrace(bool)` | `Option<bool>` | `false` | Disables `{a,b}` brace expansion |
| `nobracket` | `with_nobracket(bool)` | `Option<bool>` | `false` | Disables `[...]` character classes |
| `strict_brackets` | `with_strict_brackets(bool)` | `Option<bool>` | `false` | Returns `PmxError` on unclosed brackets or parens |
| `strict_slashes` | `with_strict_slashes(bool)` | `Option<bool>` | `false` | Omits trailing optional slash `\/?` |
| `literal_brackets` | `with_literal_brackets(bool)` | `Option<bool>` | `None` | Controls bracket literalization (3-way alternation when `None`) |
| `keep_quotes` | `with_keep_quotes(bool)` | `Option<bool>` | `false` | Retains double quotes in emitted output |
| `unescape` | `with_unescape(bool)` | `Option<bool>` | `false` | Removes backslashes from unescaped metacharacters |
| `prepend` | `with_prepend(&str)` | `Option<String>` | `None` | Prepends custom prefix string to regex output |
| `max_length` | `with_max_length(f64)` | `Option<f64>` | `65536.0` | Maximum pattern length limit before throwing `InputTooLong` |
| `max_extglob_recursion` | `with_max_extglob_recursion(...)` | `ExtglobRecursion` | `Limit(3.0)` | Max recursion depth for nested extglobs |
| `expand_range` | `with_expand_range(closure)` | `Option<ExpandRangeFn>` | `None` | Custom range expansion callback |

### Scan Options

| Field | Method | Type | Default | Description |
|---|---|---|---|---|
| `tokens` | `with_tokens(bool)` | `bool` | `false` | Include token array in scan result |
| `parts` | `with_parts(bool)` | `bool` | `false` | Include parts array (auto-enabled when `tokens` is true) |

---

## Globbing Syntax

### Basic Wildcards

- `*`: Matches 0 or more characters within a single path segment.
- `?`: Matches exactly 1 character within a single path segment.
- `.*`: Matches dotfiles or hidden files at the start of a segment.

### Globstars (`**`)

- `**`: Matches 0 or more directories recursively.
- `a/**/b`: Matches `a/b`, `a/x/b`, `a/x/y/b`.
- `/**/a`: Matches `/a`, `/x/a`, `/x/y/a`.

### Brace Expansion (`{a,b}`, `{1..10}`)

- Alternation: `src/{components,utils}/*.rs` expands to `src/components/*.rs` and `src/utils/*.rs`.
- Numeric Ranges: `{1..5}` expands to `[1-5]`.
- Character Ranges: `{a..z}` expands to `[a-z]`.
- Custom Closures: Register custom expansion behavior via `opts.with_expand_range(...)`.

### Extended Globs / Extglobs

| Pattern | Description |
|---|---|
| `@(pattern)` | Matches **exactly one** of the given patterns |
| `+(pattern)` | Matches **one or more** of the given patterns |
| `*(pattern)` | Matches **zero or more** of the given patterns |
| `?(pattern)` | Matches **zero or one** of the given patterns |
| `!(pattern)` | Matches **anything except** the given patterns |

### POSIX Character Classes

Inside `[...]` character brackets, `pmx` supports all 14 standard POSIX classes:

```
[[:alnum:]]  [[:alpha:]]  [[:ascii:]]  [[:blank:]]  [[:cntrl:]]
[[:digit:]]  [[:graph:]]  [[:lower:]]  [[:print:]]  [[:punct:]]
[[:space:]]  [[:upper:]]  [[:word:]]   [[:xdigit:]]
```

### Negation (`!pattern`)

- `!foo.js`: Matches any path except `foo.js`.
- `!!foo.js`: Double negation cancels out, matching `foo.js`.
- `!(foo)`: Extglob negation (matches anything except `foo`).

### Windows Path Normalization

When `opts.with_windows(true)` is set:
- Backslashes (`\`) are treated as path separators alongside `/`.
- Drive letters (e.g. `C:\Users\foo\*.rs`) convert separators smoothly while preserving escaped globs.

### Escaping Metacharacters

To match literal glob characters, precede them with a backslash:
- `\*` matches literal `*`
- `\?` matches literal `?`
- `\[` matches literal `[`
- `\{` matches literal `{`

---

## State Structs

### `ParseState`

The `parse()` function produces a `ParseState` struct:

```rust
pub struct ParseState {
    pub input: String,          // Substituted pattern string
    pub index: isize,           // Terminal cursor position (-1 basis)
    pub start: usize,           // Logical pattern start index
    pub dot: bool,              // Effective dot option
    pub consumed: Vec<u16>,     // Raw consumed UTF-16 units
    pub output: Vec<u16>,       // Unanchored ECMAScript regex source
    pub prefix: String,         // Stripped leading './' prefix
    pub backtrack: bool,        // Backtrack rebuild flag
    pub negated: bool,          // Pattern negation status
    pub brackets: i32,          // Open bracket counter
    pub braces: i32,            // Open brace counter
    pub parens: i32,            // Open paren counter
    pub quotes: i32,            // Quote state counter
    pub globstar: bool,         // Globstar presence flag
    pub negated_extglob: bool,  // Negated extglob presence flag
    pub tokens: Vec<Token>,     // Arena-linked token journal
}
```

### `ScanState`

The `scan()` function produces a `ScanState` struct:

```rust
pub struct ScanState {
    pub prefix: String,
    pub input: String,
    pub start: usize,
    pub base: String,
    pub glob: String,
    pub is_brace: bool,
    pub is_bracket: bool,
    pub is_glob: bool,
    pub is_extglob: bool,
    pub is_globstar: bool,
    pub negated: bool,
    pub negated_extglob: bool,
    pub slashes: Option<Vec<usize>>,
    pub parts: Option<Vec<String>>,
    pub tokens: Option<Vec<ScanToken>>,
    pub max_depth: Option<f64>,
}
```
