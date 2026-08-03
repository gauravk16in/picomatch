# C4_DESIGN.md — Fastpath gallery (`parse.fastpaths`)

Scope locked by PARSE_CHUNKS.md C4:
- Fastpath template engine (`lib/parse.js:L1324-L1414`)
- Gate contract in `makeRe`: `input[0] === '.' || input[0] === '*'` (`lib/picomatch.js:L312-L314`)

## 1. How this section works

C4 implements the closed-form template engine `fastpaths(input, options)` in `crates/pmx-core/src/parse/fastpath.rs`:

1. **Option Coercion & Length Guard (`lib/parse.js:L1331-L1336`)**:
   - `max = options.max_length()`
   - Count UTF-16 code units `len = input.encode_utf16().count()`.
   - If `len as f64 > max`, return `Err(PmxError::InputTooLong { len, max: max.into() })`.

2. **Pre-substitution & Prefix Removal (`lib/parse.js:L1338, L1406`)**:
   - `substituted = constants::replacement(input)` (`"***"` -> `"*"`, `"**/**"` -> `"**"`, `"**/**/**"` -> `"**"`).
   - Strip leading `./` via `utils::remove_prefix(substituted)`.

3. **Platform Characters & Closures (`lib/parse.js:L1341-L1366`)**:
   - Platform tables `glob_chars(options.windows())`.
   - `nodot`: `if opts.dot { NO_DOTS } else { NO_DOT }`
   - `slashDot`: `if opts.dot { NO_DOTS_SLASH } else { NO_DOT }`
   - `capture`: `if opts.capture { "" } else { "?:" }`
   - `star`: `if opts.bash { ".*?" } else { STAR }`, wrapped in `(...)` if `opts.capture`.
   - `globstar`: `if opts.noglobstar { star } else { format!("({capture}(?:(?!{START_ANCHOR}{dot_part}).)*?)") }` where `dot_part = if opts.dot { DOTS_SLASH } else { DOT_LITERAL }`.

4. **Template Matching `create(str)` (`lib/parse.js:L1368-L1404`)**:
   - Fixed template cases:
     - `"*"` -> `${nodot}${ONE_CHAR}${star}`
     - `".*"` -> `${DOT_LITERAL}${ONE_CHAR}${star}`
     - `"*.*"` -> `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`
     - `"*/*"` -> `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`
     - `"**"` -> `${nodot}` + `globstar()`
     - `"**/*"` -> `(?:${nodot}${globstar()}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`
     - `"**/*.*"` -> `(?:${nodot}${globstar()}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`
     - `"**/.*"` -> `(?:${nodot}${globstar()}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`
   - Extension chain fallback (`/^(.*?)\.(\w+)$/`):
     - Locates last dot `str.rfind('.')`.
     - Validates non-empty `\w+` suffix (`[a-zA-Z0-9_]`).
     - Recursively invokes `create(prefix)` and appends `${DOT_LITERAL}${suffix}` if successful.
     - Returns `None` if pattern does not match any template.

5. **Strict Slashes Suffix (`lib/parse.js:L1409-L1411`)**:
   - If `source` is produced and `options.strict_slashes() != true`, appends `${SLASH_LITERAL}?`.

## 2. Why the JS is written this way

- Fastpaths provide a high-performance closed-form template expansion for the 8 most common glob patterns (and extension chains like `*.js`, `*.tar.gz`).
- Fastpaths intentionally produce byte-divergent output from the full tokenizing loop (e.g. fastpaths emit lookaheads and `\/?` suffixes differently).
- Tests in picomatch pin fastpath output byte-for-byte, so fastpaths must be preserved bug-for-bug (Decision D-03).

## 3. Every JS semantic that matters

1. **Option handling**: `opts.fastpaths !== false` gate in `makeRe` enables fastpaths by default.
2. **`noglobstar` fallback**: When `noglobstar === true`, `globstar()` returns `star` instead of regex lookahead.
3. **`strictSlashes !== true`**: Appends optional trailing slash `${SLASH_LITERAL}?` to every fastpath output.
4. **Recursive extension chain**: `*.js` matches via `create("*") + "\\.js"`. `*.tar.gz` matches via `create("*.tar") + "\\.gz"`.

## 4. Rust implementation plan

- Implement `fastpaths` in `crates/pmx-core/src/parse/fastpath.rs`.
- Re-export `fastpaths` from `crates/pmx-core/src/parse/mod.rs` and `src/lib.rs`.
- Add `with_noglobstar` and `noglobstar()` to `Options` in `crates/pmx-core/src/options.rs`.
- Extract C4 oracle fixtures into `fixtures/extract-c4.js`, `fixtures/c4_oracle.json`, `fixtures/verify-c4.js`.
- Add differential attack `fixtures/attack-c4.js` to probe fastpath output.
- Add unit tests in Rust asserting fastpath outputs and edge cases.
