//! pmx-node — the napi-rs binding: one synchronous op dispatcher shared with
//! `pmx --serve`, plus `bridge_op_expand` for `options.expandRange` JS callbacks
//! (BUG-005's adapter-boundary fix).
//!
//! NOTE: this is the TEST ADAPTER per the constitution (`../agents.md` §2) —
//! `pmx-core`/`pmx-exec`/`pmx-cli` carry `#![forbid(unsafe_code)]` and this
//! crate alone may use the napi framework (which generates unsafe wrappers).
//! That exclusion is recorded in DECISIONS.md D-019/D-025 (+ D-026 for the
//! boxed Send/Sync holder below, whose lifetime is bounded to one export frame).
#![allow(clippy::missing_safety_doc)]

use napi::{Env, JsFunction, JsString, JsUnknown};
use napi_derive::napi;
use pmx_core::options::Options;

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

/// Send/Sync holder for a JS callback + its Env handle. SAFE ONLY because the
/// enclosing export frame is synchronous and nested: the Arc'd holder is
/// created, used via ExpandRangeFn, and dropped strictly within ONE
/// `bridge_op_expand` frame; it never crosses threads, never outlives the
/// frame. Recorded as DECISIONS.md D-026.
struct HoldingEnv {
    env: Env,
    holder: JsFunction,
}

/// napi Env/JsFunction are thread-scoped by design; this wrapper exists solely
/// to satisfy `Options.expand_range: Arc<dyn Fn + Send + Sync>` inside ONE
/// synchronous napi-export frame. No value of this type ever crosses a thread
/// boundary in practice — the closure is invoked inline by parse during the
/// same export call.
unsafe impl Send for HoldingEnv {}
unsafe impl Sync for HoldingEnv {}

/// bridge_op with a synchronous `expandRange` JS callback shipped around the
/// parser's brace-range expansion (parse.js:L22-L38). Dispatch happens on this
/// thread; the callback runs back into JS from inside the same frame.
#[napi]
pub fn bridge_op_expand(env: Env, payload: String, expand_fn: JsFunction) -> napi::Result<String> {
    let holder = std::sync::Arc::new(HoldingEnv {
        env,
        holder: expand_fn,
    });
    let expander: pmx_core::options::ExpandRangeFn =
        std::sync::Arc::new(move |args: &[String], _: &Options| -> String {
            let holder = std::sync::Arc::clone(&holder);
            call_js_expand(&holder, args)
        });
    let req: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|e| napi::Error::from_reason(format!("invalid payload JSON: {e}")))?;
    Ok(pmx_cli::dispatch::dispatch_with_expansion(&req, expander).to_string())
}

fn call_js_expand(holder: &std::sync::Arc<HoldingEnv>, args: &[String]) -> String {
    // Synchronous round-trip: JsFunction::call on this thread inside the frame.
    // args[2] per reference: (left, right, options)
    let mut items: Vec<JsUnknown> = Vec::with_capacity(args.len() + 1);
    for arg in args {
        let s: JsString = holder
            .env
            .create_string(arg)
            .expect("napi create_string failed");
        items.push(s.into_unknown());
    }
    items.push(
        holder
            .env
            .get_undefined()
            .expect("get_undefined")
            .into_unknown(),
    );
    let result = holder
        .holder
        .call(None, &items)
        .expect("expandRange js call failed");
    let s = result
        .coerce_to_string()
        .expect("expandRange returned non-string");
    s.into_utf8()
        .expect("utf8")
        .as_str()
        .expect("str")
        .to_owned()
}
