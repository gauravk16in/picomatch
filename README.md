# picomatch-rs (`pmx`)

[![Rust](https://img.shields.io/badge/rust-1.97.1+-blue.svg)](https://www.rust-lang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Parity: 100%](https://img.shields.io/badge/parity-picomatch%20v4.0.5-brightgreen.svg)](https://github.com/micromatch/picomatch)

A blazing fast and accurate pure-Rust port of [`micromatch/picomatch`](https://github.com/micromatch/picomatch) v4.0.5.

`pmx` provides exact behavioral parity with the original JavaScript implementation, supporting full standard and extended Bash glob features—including braces, extglobs, POSIX character classes, globstars, and regular expression execution—with **zero unsafe code** (`#![forbid(unsafe_code)]`).

---

## Features

- **100% Parity with `picomatch` v4.0.5:** Passed over 10,000 differential test cases against V8 / Node.js.
- **Pure Rust Core (`pmx-core`):** `#![forbid(unsafe_code)]` with zero C or V8 runtime dependencies.
- **Robust UTF-16 Engine:** Emitted regex sources and scan state use `Vec<u16>` code units, matching JavaScript string semantics and index drift without panics or surrogate errors.
- **Full Glob Grammar Support:**
  - Advanced Braces: `{a,b,c}`, `{1..10}`, `{a..z}` range expansions and custom expand handlers.
  - Extglobs: `@(a|b)`, `+(a|b)`, `*(a|b)`, `?(a|b)`, and `!(a|b)` with nested recursion limits and ReDoS protection.
  - POSIX Character Classes: `[[:alnum:]]`, `[[:digit:]]`, `[[:alpha:]]`, etc.
  - Globstars (`**`), Question marks (`?`), Single stars (`*`), Quotes (`"..."`), and Escapes (`\`).
- **Decoupled Architecture:**
  - `pmx-core`: Compiler core converting globs to unanchored ECMAScript regex source strings and parse state projections.
  - `pmx-exec`: Pure Rust regex executor running ECMAScript backreferences and lookarounds via `regress`.
  - `pmx-cli`: Executable binary (`pmx`) with `--serve` JSONL IPC transport for cross-language testing.
  - `pmx-node`: Optional NAPI-rs native Node.js addon binding.

---

## Workspace Structure

| Crate | Location | Description | Unsafe Code |
|---|---|---|---|
| **`pmx-core`** | `crates/pmx-core` | Core compiler, scanner (`scan`), fastpath engine (`fastpaths`), and parser (`parse`) | Forbidden |
| **`pmx-exec`** | `crates/pmx-exec` | ECMAScript regex execution layer using `regress` (`utf16` mode) | Forbidden |
| **`pmx-cli`** | `crates/pmx-cli` | CLI binary (`pmx`) and IPC dispatch library (`dispatch`) | Forbidden |
| **`pmx-node`** | `crates/pmx-node` | NAPI-rs binding for Node.js integration | NAPI-generated only |

---

## Installation

Add `pmx-core` to your `Cargo.toml`:

```toml
[dependencies]
pmx-core = { path = "crates/pmx-core" }
pmx-exec = { path = "crates/pmx-exec" }
```

---

## Quick Start

### 1. High-Level Glob Matching (`is_match`)

To test if a path matches a glob pattern:

```rust
use pmx_core::{parse, Options};
use pmx_exec::{is_match, ExecFlags};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = Options::default();
    
    // Compile glob pattern to regex source
    let state = parse("src/**/*.rs", &options)?;
    let input: Vec<u16> = "src/parse/main_loop.rs".encode_utf16().collect();
    
    // Execute match
    let matched = is_match(&state.output, &input, ExecFlags::default())?;
    assert!(matched);
    
    Ok(())
}
```

### 2. Scanning a Pattern (`scan`)

`scan()` inspects a pattern without compiling a regex, extracting `prefix`, `base`, `glob`, tokens, and depth metadata:

```rust
use pmx_core::{scan, ScanOptions};

fn main() {
    let opts = ScanOptions::default().with_parts(true);
    let state = scan("./src/@(foo)/**/*.rs", &opts);

    assert_eq!(state.prefix, "./");
    assert_eq!(state.base, "src");
    assert_eq!(state.glob, "@(foo)/**/*.rs");
    assert!(state.is_extglob);
    assert!(state.is_globstar);
    assert_eq!(state.parts.as_deref(), Some(&["src".to_string(), "@(foo)".to_string(), "**".to_string(), "*.rs".to_string()][..]));
}
```

### 3. Fastpath Matching (`fastpaths`)

For common globs (`*`, `.*`, `*.*`, `*/*`, `**`, `**/*`, `*.js`, `*.tar.gz`), `fastpaths` returns closed-form templates:

```rust
use pmx_core::{fastpaths, Options};

fn main() {
    let opts = Options::default();
    if let Some(regex_source) = fastpaths("*.rs", &opts).unwrap() {
        println!("Fastpath regex source: {regex_source}");
        // Emits: "(?!\\.)(?=.)[^/]*?\\.rs/?"
    }
}
```

---

## Options

`Options` configures parsing, compilation, and matching behavior:

```rust
use pmx_core::Options;

let opts = Options::default()
    .with_dot(true)             // Match leading dots (.)
    .with_windows(true)         // Allow backslashes (\) as path separators
    .with_bash(true)            // Enable Bash-specific star/globstar expansion
    .with_nocase(true)          // Case-insensitive matching
    .with_strict_slashes(true)  // Require strict trailing slashes
    .with_fastpaths(true);      // Enable closed-form template engine (default: true)
```

### Supported Options Table

| Option | Type | Default | Description |
|---|---|---|---|
| `dot` | `bool` | `false` | Allow patterns to match leading dots (e.g. `.gitignore`) |
| `windows` | `bool` | `false` | Treat `\` as path separator alongside `/` |
| `bash` | `bool` | `false` | Enable Bash-specific star matching rules |
| `contains` | `bool` | `false` | Omit `^` and `$` anchors in output regex |
| `fastpaths` | `bool` | `true` | Enable closed-form fastpath templates |
| `noextglob` | `bool` | `false` | Disable extglob syntax (`@(..)`, `+(..)`, etc.) |
| `nonegate` | `bool` | `false` | Disable leading `!` pattern negation |
| `nobrace` | `bool` | `false` | Disable `{a,b}` brace expansion |
| `nobracket` | `bool` | `false` | Disable `[...]` character classes |
| `strict_brackets` | `bool` | `false` | Throw `PmxError` on unclosed brackets or parens |
| `strict_slashes` | `bool` | `false` | Do not append optional trailing slash `\/?` |
| `max_length` | `f64` | `65536.0` | Maximum pattern character length limit |

---

## Supported Globbing Grammar

| Construct | Example | Description |
|---|---|---|
| **Single Star** | `*.js` | Matches zero or more characters within a path segment |
| **Globstar** | `**/*.rs` | Matches zero or more directories recursively |
| **Wildcard** | `file?.txt` | Matches exactly one character (excluding `/`) |
| **Braces** | `{src,tests}/*.rs` | Matches any alternative listed inside braces |
| **Range Braces** | `{1..10}`, `{a..z}` | Expands numeric or character sequences |
| **Extglobs** | `@(a\|b)` | Matches exactly one of the given patterns |
| | `+(a\|b)` | Matches one or more of the given patterns |
| | `*(a\|b)` | Matches zero or more of the given patterns |
| | `?(a\|b)` | Matches zero or one of the given patterns |
| | `!(a\|b)` | Matches anything except the given patterns |
| **POSIX Classes** | `[[:alnum:]]` | Matches POSIX character sets (`alnum`, `digit`, `alpha`, etc.) |
| **Negation** | `!src/*.rs` | Negates the pattern match |

---

## Building & Verification

### Gates (Format, Clippy, Tests)

```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test
```

### Differential Oracle Verification (Node.js)

To run differential acceptance tests against the reference JavaScript `picomatch` implementation:

```bash
# Regenerate and verify deterministic oracle corpora
node fixtures/extract-c0.js && node fixtures/verify-c0.js
node fixtures/extract-scan.js && node fixtures/verify-scan.js

# Run integrated test harness across all suites
node fixtures/run-integrated.js

# Run adversarial differential tests
node fixtures/attack-scan.js
node fixtures/attack-integrated.js
```

### Running Benchmarks

```bash
# Run fail-closed canary tests (69 scenarios)
node benchmarks/bench-canaries.js

# Run process-pair benchmark suite
node benchmarks/run-benchmarks.js

# Verify benchmark artifact provenance and stats
node benchmarks/verify-artifacts.js benchmarks/results
```

---

## License & Acknowledgments

This project is licensed under the [MIT License](LICENSE).

`pmx` is a Rust port of [`micromatch/picomatch`](https://github.com/micromatch/picomatch) created by Jon Schlinkert and contributors.
