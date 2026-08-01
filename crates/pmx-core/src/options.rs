//! Options — the option struct for the whole pipeline.
//!
//! Fields are declared up front (one per picomatch option mirroring the
//! ARCHITECTURE.md §5 coercion table); **accessors land per chunk with
//! citations** — this file implements only what C0 consumes:
//! windows/dot/bash/capture/prepend/max_length/strict_brackets/strict_slashes,
//! plus the `noext`→`noextglob` alias fold (all chunks read through it).

use crate::constants::MAX_LENGTH;

/// JS `typeof opts.maxExtglobRecursion === 'number'` vs `=== false`
/// (parse.js:L288-L295). Typed now so C7 doesn't re-shape Options.
#[derive(Debug, Clone, Copy, Default)]
pub enum ExtglobRecursion {
    #[default]
    Unset,
    Disabled, // options.maxExtglobRecursion === false
    Limit(f64),
}

/// One `Option<T>` per JS option, mirroring "field present vs unset"
/// (JS `undefined`), so coercions like `opts.x === true` vs `x !== false`
/// stay distinguishable (BEHAVIORAL_ORACLE.md §8; ARCHITECTURE.md §5 table).
#[derive(Debug, Clone, Default)]
pub struct Options {
    pub windows: Option<bool>,
    pub dot: Option<bool>,
    pub bash: Option<bool>,
    pub capture: Option<bool>,
    pub contains: Option<bool>,
    pub fastpaths: Option<bool>,
    pub noext: Option<bool>,
    pub noextglob: Option<bool>,
    pub nonegate: Option<bool>,
    pub unescape: Option<bool>,
    pub posix: Option<bool>,
    pub nobrace: Option<bool>,
    pub nobracket: Option<bool>,
    pub noparen: Option<bool>,
    pub noglobstar: Option<bool>,
    pub strict_brackets: Option<bool>,  // JS: strictBrackets
    pub strict_slashes: Option<bool>,   // JS: strictSlashes
    pub literal_brackets: Option<bool>, // JS: literalBrackets
    pub keep_quotes: Option<bool>,      // JS: keepQuotes
    pub regex: Option<bool>,
    pub nocase: Option<bool>,
    pub flags: Option<String>,
    pub debug: Option<bool>,
    pub match_base: Option<bool>, // JS: matchBase
    pub basename: Option<bool>,
    pub ignore: Option<String>,
    pub prepend: Option<String>,
    pub max_length: Option<f64>, // JS: maxLength — number coercion, floats allowed
    pub max_extglob_recursion: ExtglobRecursion,
}

impl Options {
    // ---------- C0 accessors (cite the original coercion) ----------

    /// parse.js:L416 — `opts.dot === true`.
    pub fn dot(&self) -> bool {
        self.dot == Some(true)
    }

    /// parse.js:L401 — `opts.bash === true`.
    pub fn bash(&self) -> bool {
        self.bash == Some(true)
    }

    /// parse.js:L374 — `opts.capture ? '' : '?:'` (JS truthiness on a bool).
    pub fn capture(&self) -> bool {
        matches!(self.capture, Some(true))
    }

    /// constants.js:L181-L183 — `globChars(win32)` identity via `win32 === true`.
    pub fn windows(&self) -> bool {
        self.windows == Some(true)
    }

    /// parse.js:L371 — `opts.prepend || ''`. Empty string is falsy ⇒ collapses
    /// to `''` (identical result), so only non-empty strings matter.
    pub fn prepend(&self) -> &str {
        match &self.prepend {
            Some(s) if !s.is_empty() => s.as_str(),
            _ => "",
        }
    }

    /// parse.js:L364 — `typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, n) : MAX_LENGTH`.
    /// NaN passthrough: JS `Math.min(65536, NaN)` is NaN and `len > NaN` is
    /// false, i.e. NaN disables the guard. Mirror that exactly.
    pub fn max_length(&self) -> f64 {
        match self.max_length {
            Some(m) if m.is_nan() => f64::NAN,
            Some(m) => (MAX_LENGTH as f64).min(m),
            None => MAX_LENGTH as f64,
        }
    }

    /// parse.js:L1287/L1293/L1299 — `opts.strictBrackets === true`.
    pub fn strict_brackets(&self) -> bool {
        self.strict_brackets == Some(true)
    }

    /// parse.js:L1304 — `opts.strictSlashes !== true` ⇒ loose when unset/false.
    pub fn strict_slashes(&self) -> bool {
        self.strict_slashes == Some(true)
    }

    // ---------- C1 accessors ----------

    /// parse.js:L606 — `opts.fastpaths !== false` (undefined ⇒ enabled).
    pub fn fastpaths(&self) -> bool {
        self.fastpaths != Some(false)
    }

    /// parse.js:L639/L701 — `opts.unescape === true`.
    pub fn unescape(&self) -> bool {
        self.unescape == Some(true)
    }

    /// parse.js:L778 — `opts.keepQuotes === true`.
    pub fn keep_quotes(&self) -> bool {
        self.keep_quotes == Some(true)
    }

    /// utils.js:L53-L54 — `opts.contains ? '' : '^'` (truthy on a bool).
    pub fn contains(&self) -> bool {
        matches!(self.contains, Some(true))
    }

    /// minimatch alias fold (parse.js:L408-L410):
    /// `typeof opts.noext === 'boolean' ⇒ opts.noextglob = opts.noext`.
    /// `noextglob` itself is read as `!== true` downstream, so a false value
    /// here means "extglobs enabled".
    pub fn noextglob(&self) -> bool {
        match self.noext {
            Some(b) => b,
            None => self.noextglob == Some(true),
        }
    }

    // ---------- builder (tests + adapters; one knob per field) ----------

    pub fn with_windows(mut self, v: bool) -> Self {
        self.windows = Some(v);
        self
    }
    pub fn with_dot(mut self, v: bool) -> Self {
        self.dot = Some(v);
        self
    }
    pub fn with_bash(mut self, v: bool) -> Self {
        self.bash = Some(v);
        self
    }
    pub fn with_capture(mut self, v: bool) -> Self {
        self.capture = Some(v);
        self
    }
    pub fn with_fastpaths(mut self, v: bool) -> Self {
        self.fastpaths = Some(v);
        self
    }
    pub fn with_strict_brackets(mut self, v: bool) -> Self {
        self.strict_brackets = Some(v);
        self
    }
    pub fn with_strict_slashes(mut self, v: bool) -> Self {
        self.strict_slashes = Some(v);
        self
    }
    pub fn with_prepend<S: Into<String>>(mut self, v: S) -> Self {
        self.prepend = Some(v.into());
        self
    }
    pub fn with_max_length(mut self, v: f64) -> Self {
        self.max_length = Some(v);
        self
    }
    pub fn with_unescape(mut self, v: bool) -> Self {
        self.unescape = Some(v);
        self
    }
    pub fn with_keep_quotes(mut self, v: bool) -> Self {
        self.keep_quotes = Some(v);
        self
    }
    pub fn with_contains(mut self, v: bool) -> Self {
        self.contains = Some(v);
        self
    }
}
