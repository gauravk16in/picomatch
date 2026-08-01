//! fastpath.rs — port: lib/parse.js:L1324-L1414 (`parse.fastpaths`).
//!
//! Closed-form template engine for common glob patterns (`*`, `.*`, `*.*`,
//! `*/*`, `**`, `**/*`, `**/*.*`, `**/.*` and extension chains `*.js`, `*.tar.gz`).
//!
//! Behaviorally load-bearing (D-03): outputs intentionally differ from the
//! main loop parser and are pinned by original picomatch tests.

use crate::constants::{self, PlatformChars};
use crate::error::PmxError;
use crate::options::Options;
use crate::utils;

/// port: lib/parse.js:L1330 — `parse.fastpaths(input, options)`.
pub fn fastpaths(input: &str, options: &Options) -> Result<Option<String>, PmxError> {
    let len = input.encode_utf16().count();
    let max = options.max_length();
    if (len as f64) > max {
        return Err(PmxError::InputTooLong {
            len,
            max: max.into(),
        });
    }

    let substituted = constants::replacement(input);
    let chars = constants::glob_chars(options.windows());

    let nodot = if options.dot() {
        chars.no_dots
    } else {
        chars.no_dot
    };

    let slash_dot = if options.dot() {
        chars.no_dots_slash
    } else {
        chars.no_dot
    };

    let capture = if options.capture() { "" } else { "?:" };

    let star_base = if options.bash() { ".*?" } else { chars.star };

    let star = if options.capture() {
        format!("({star_base})")
    } else {
        star_base.to_string()
    };

    let globstar = || -> String {
        if options.noglobstar() {
            star.clone()
        } else {
            let dot_part = if options.dot() {
                chars.dots_slash
            } else {
                chars.dot_literal
            };
            format!("({capture}(?:(?!{}{dot_part}).)*?)", chars.start_anchor)
        }
    };

    let (_, output) = utils::remove_prefix(substituted);

    let mut source = create(output, nodot, slash_dot, &star, &globstar, chars);

    if let Some(ref mut s) = source {
        if !options.strict_slashes() {
            s.push_str(chars.slash_literal);
            s.push('?');
        }
    }

    Ok(source)
}

fn create(
    str: &str,
    nodot: &str,
    slash_dot: &str,
    star: &str,
    globstar: &dyn Fn() -> String,
    chars: &PlatformChars,
) -> Option<String> {
    match str {
        "*" => Some(format!("{nodot}{}{star}", chars.one_char)),
        ".*" => Some(format!("{}{}{star}", chars.dot_literal, chars.one_char)),
        "*.*" => Some(format!(
            "{nodot}{star}{}{}{star}",
            chars.dot_literal, chars.one_char
        )),
        "*/*" => Some(format!(
            "{nodot}{star}{}{}{slash_dot}{star}",
            chars.slash_literal, chars.one_char
        )),
        "**" => Some(format!("{nodot}{}", globstar())),
        "**/*" => Some(format!(
            "(?:{nodot}{}{})?{slash_dot}{}{star}",
            globstar(),
            chars.slash_literal,
            chars.one_char
        )),
        "**/*.*" => Some(format!(
            "(?:{nodot}{}{})?{slash_dot}{star}{}{}{star}",
            globstar(),
            chars.slash_literal,
            chars.dot_literal,
            chars.one_char
        )),
        "**/.*" => Some(format!(
            "(?:{nodot}{}{})?{}{}{star}",
            globstar(),
            chars.slash_literal,
            chars.dot_literal,
            chars.one_char
        )),
        _ => {
            if let Some(dot_idx) = str.rfind('.') {
                let prefix = &str[..dot_idx];
                let suffix = &str[dot_idx + 1..];
                if !suffix.is_empty()
                    && suffix
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_')
                {
                    if let Some(source) = create(prefix, nodot, slash_dot, star, globstar, chars) {
                        return Some(format!("{source}{}{suffix}", chars.dot_literal));
                    }
                }
            }
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fastpaths_templates_posix() {
        let opts = Options::default();

        assert_eq!(
            fastpaths("*", &opts).unwrap(),
            Some(r"(?!\.)(?=.)[^/]*?\/?".to_string())
        );

        assert_eq!(
            fastpaths(".*", &opts).unwrap(),
            Some(r"\.(?=.)[^/]*?\/?".to_string())
        );

        assert_eq!(
            fastpaths("*.*", &opts).unwrap(),
            Some(r"(?!\.)[^/]*?\.(?=.)[^/]*?\/?".to_string())
        );

        assert_eq!(
            fastpaths("*/*", &opts).unwrap(),
            Some(r"(?!\.)[^/]*?\/(?=.)(?!\.)[^/]*?\/?".to_string())
        );

        assert_eq!(
            fastpaths("**", &opts).unwrap(),
            Some(r"(?!\.)(?:(?:(?!(?:^|\/)\.).)*?)\/?".to_string())
        );

        assert_eq!(
            fastpaths("**/*", &opts).unwrap(),
            Some(r"(?:(?!\.)(?:(?:(?!(?:^|\/)\.).)*?)\/)?(?!\.)(?=.)[^/]*?\/?".to_string())
        );

        assert_eq!(
            fastpaths("**/*.*", &opts).unwrap(),
            Some(r"(?:(?!\.)(?:(?:(?!(?:^|\/)\.).)*?)\/)?(?!\.)[^/]*?\.(?=.)[^/]*?\/?".to_string())
        );

        assert_eq!(
            fastpaths("**/.*", &opts).unwrap(),
            Some(r"(?:(?!\.)(?:(?:(?!(?:^|\/)\.).)*?)\/)?\.(?=.)[^/]*?\/?".to_string())
        );
    }

    #[test]
    fn test_fastpaths_extension_chain() {
        let opts = Options::default();

        assert_eq!(
            fastpaths("*.js", &opts).unwrap(),
            Some(r"(?!\.)(?=.)[^/]*?\.js\/?".to_string())
        );

        assert_eq!(
            fastpaths("*.tar.gz", &opts).unwrap(),
            Some(r"(?!\.)(?=.)[^/]*?\.tar\.gz\/?".to_string())
        );

        // Non-matching fallback
        assert_eq!(fastpaths("foo.js", &opts).unwrap(), None);
        assert_eq!(fastpaths("*.js/bar", &opts).unwrap(), None);
    }

    #[test]
    fn test_fastpaths_options() {
        // Strict slashes omits trailing \/?
        let opts_strict = Options::default().with_strict_slashes(true);
        assert_eq!(
            fastpaths("*.js", &opts_strict).unwrap(),
            Some(r"(?!\.)(?=.)[^/]*?\.js".to_string())
        );

        // Windows platform
        let opts_win = Options::default().with_windows(true);
        assert_eq!(
            fastpaths("*.js", &opts_win).unwrap(),
            Some(r"(?!\.)(?=.)[^\\/]*?\.js[\\/]?".to_string())
        );

        // Dot option
        let opts_dot = Options::default().with_dot(true);
        assert_eq!(
            fastpaths(".*", &opts_dot).unwrap(),
            Some(r"\.(?=.)[^/]*?\/?".to_string())
        );

        // Noglobstar option
        let opts_noglobstar = Options::default().with_noglobstar(true);
        assert_eq!(
            fastpaths("**", &opts_noglobstar).unwrap(),
            Some(r"(?!\.)[^/]*?\/?".to_string())
        );
    }
}
