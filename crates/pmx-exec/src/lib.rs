//! pmx-exec — the ECMAScript regex execution layer (ADAPTER_PLAN A3).
//!
//! Executes the regex **source strings** emitted by pmx-core under true JS
//! regex semantics via the `regress` engine (pure Rust). Decision record:
//! DECISIONS.md D-018.
//!
//! Units invariant (D-02): sources arrive as UTF-16 units and must decode to a
//! valid UTF-16 / UTF-8 round-trip. Ill-formed source (lone surrogates — see
//! the C1 `fp.astral` lineage) is reported, never silently lossy-ed.
#![forbid(unsafe_code)]

use thiserror::Error;

/// Flags accepted by `picomatch.toRegex(source, options)`: JS
/// `opts.flags || (opts.nocase ? 'i' : '')` (lib/picomatch.js:L343).
#[derive(Debug, Clone, Copy, Default)]
pub struct ExecFlags {
    pub nocase: bool,
}

#[derive(Debug, Error)]
pub enum ExecError {
    /// The regex source contains lone surrogates — a shape JS-RegExp accepts
    /// but `from_utf16` cannot represent. Currently unreachable from the
    /// adapter surface (its callers mirror JS inputs); kept honest.
    #[error("regex source is ill-formed UTF-16 (lone surrogates)")]
    IllFormedSource,

    /// The engine rejected the source (would map to V8's SyntaxError on
    /// `new RegExp`; toRegex's swallow-to-/$^/ behavior is a later layer).
    #[error("regex construction failed: {0}")]
    Construction(String),
}

/// JS `regex.test(input)`: true iff the source matches somewhere in the input
/// (anchors reside in the source itself).
pub fn is_match(
    source_units: &[u16],
    input_units: &[u16],
    flags: ExecFlags,
) -> Result<bool, ExecError> {
    let source = String::from_utf16(source_units).map_err(|_| ExecError::IllFormedSource)?;
    let rx = if flags.nocase {
        regress::Regex::with_flags(
            &source,
            regress::Flags {
                icase: true,
                ..regress::Flags::default()
            },
        )
        .map_err(|e| ExecError::Construction(format!("{e:?}")))?
    } else {
        regress::Regex::new(&source).map_err(|e| ExecError::Construction(format!("{e:?}")))?
    };
    // Input matched as raw UTF-16 units (feature "utf16"): identical index
    // semantics to JS strings — class marches like `[^/]` consume ONE unit,
    // not one scalar, so astral halves behave exactly as V8 does.
    Ok(rx.find_from_utf16(input_units, 0).next().is_some())
}

/// A capture-group range in UTF-16 units: `None` = group not present.
pub type GroupRange = Option<(usize, usize)>;

/// JS `regex.exec(input)` (first match, no /g), with capture groups as
/// [start,end] unit ranges — regress Match API groups[0] is the full match.
pub fn exec_captures(
    source_units: &[u16],
    input_units: &[u16],
    flags: ExecFlags,
) -> Result<Option<Vec<GroupRange>>, ExecError> {
    let source = String::from_utf16(source_units).map_err(|_| ExecError::IllFormedSource)?;
    let rx = if flags.nocase {
        regress::Regex::with_flags(
            &source,
            regress::Flags {
                icase: true,
                ..regress::Flags::default()
            },
        )
        .map_err(|e| ExecError::Construction(format!("{e:?}")))?
    } else {
        regress::Regex::new(&source).map_err(|e| ExecError::Construction(format!("{e:?}")))?
    };
    Ok(rx.find_from_utf16(input_units, 0).next().map(|m| {
        // group(0) is the full match; 1..=captures.len() are capture groups
        (0..=m.captures.len())
            .map(|i| m.group(i).map(|r| (r.start, r.end)))
            .collect()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn units(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    // The A3 engine boundary (DECISIONS.md D-018): regress 0.11.1's
    // `find_from_utf16` semantics match JS *exactly* except bracket-class
    // matches against astral inputs, where it consumes a surrogate pair as a
    // single logical character (V8 consumes ONE UTF-16 unit). Recoded here so
    // the day an engine upgrade fixes this class, this test flips and the
    // boundary disappears loudly instead of silently.
    #[test]
    fn engine_boundary_astral_class_is_documented() {
        let source = units("^(?:a[^/])$");
        let input = units("a\u{1F600}");
        let got = is_match(&source, &input, ExecFlags::default()).unwrap();
        // V8: false. regress 0.11.1: true (boundary).
        // Change expectation once a fixed engine lands.
        assert!(got, "expected current-documented regress behavior");
    }
}
