//! pmx-node — the napi-rs binding (ADAPTER_PLAN B3). One synchronous op
//! dispatcher so the napi transport answers exactly like `pmx --serve`.
//!
//! NOTE: this is the TEST ADAPTER per the constitution (`../agents.md` §2) —
//! `pmx-core`/`pmx-exec`/`pmx-cli` carry `#![forbid(unsafe_code)]` and this
//! crate alone may use the napi framework (which generates unsafe wrappers).
//! That exclusion is recorded in DECISIONS.md D-019.
#![allow(clippy::missing_safety_doc)]

use napi_derive::napi;

/// One JSON request object in, one JSON answer object out — the same
/// `pmx_cli::dispatch` the `--serve` transport uses.
#[napi]
pub fn bridge_op(payload: String) -> napi::Result<String> {
    Ok(pmx_cli::dispatch::dispatch_str(&payload))
}

#[napi]
pub fn bridge_version() -> String {
    pmx_cli::dispatch::VERSION.to_string()
}
