# Licensing and Attribution

Status: compliant by design (spec §19, NFR-050). Verified from local `LICENSE` and registry pages (knowledge/source-ledger.md §license notes).

## Upstream obligations

- picomatch is **MIT** licensed, © 2017–present Jon Schlinkert (local `LICENSE`, read 2026-07-31).
- MIT requires preserving the copyright + permission notice in copies/substantial portions. Actions:
  1. Keep `LICENSE` verbatim in the repo root (present).
  2. Add attribution in the port README: "Port of [picomatch](https://github.com/micromatch/picomatch) 4.0.5, © Jon Schlinkert and micromatch contributors, MIT License."
  3. The Rust crate ships under MIT as well (same license, simplest compliance; repo is public per event rule).
- Transliteration note: a faithful port is a derivative work of an MIT project — permitted; attribution is the obligation. This file records that reasoning for judges.

## Dependency licenses (candidates; re-verified at adoption — D-005)

| Crate | License | Status |
|---|---|---|
| regex 1.12.x | MIT or Apache-2.0 | compatible |
| regex-automata 0.4.x | MIT or Apache-2.0 | compatible |
| fancy-regex 0.17.x | MIT or Apache-2.0 | compatible |
| proptest | MIT/Apache | dev-only, compatible |
| criterion | MIT/Apache | dev-only, compatible |
| libfuzzer-sys / cargo-fuzz | MIT/Apache/NCSA | dev-only (Linux CI), compatible |
| serde / serde_json | MIT or Apache-2.0 | dev/tooling, compatible |
| napi-rs (stretch only) | MIT | stretch gate |

Policy: MIT/Apache/BSD/ISC/CC0 only; each adoption records version + license + `cargo audit` result in `knowledge/dependency-evaluation.md`; a `LICENSES-THIRD-PARTY.md` is generated at submission (`cargo license` or manual table) — Phase 11 checklist item.

## Content provenance

- Documentation quotations kept to short attributed excerpts (source-ledger).
- No code copied from prior ports (D-010; knowledge/prior-art.md).
- Upstream JS files remain unmodified in-repo (oracle); any necessary adapter executes them as-is.
