# Prior Art and Plagiarism-Risk Register

**Eligibility vs clean-room (2026-07-31):** `micromatch/picomatch` is **pool-listed** by the organizers for JavaScript → Go,Rust (`https://coderesurrection.com/2026/repo-pool`, fetched 2026-07-31) — the existence of prior ports does NOT affect eligibility (the BYO "not already ported" clause applies only to non-pool repos, and this repo is on the pool). This register remains a **clean-room control**: no code from the projects below is read or copied; checks are metadata/provenance-only.

Hackathon rule (verified, coderesurrection.com/2026 §11 rule 04 + Devfolio rules): "Pre-existing partial ports of your chosen repo are not [fair game]" and "Plagiarism or submission of pre-existing ports may result in disqualification."

**Team policy (binding):** All port code must be written in the 72-hour window by the team. Prior art below may be read ONLY to (a) establish provenance that we are not them, (b) understand high-level approaches, and (c) serve as differential comparators. **No file, function, regex string, or test may be copied from any of these.** Any accidental convergence with an existing port must be documented in DECISIONS.md with independent-derivation evidence (our spec + our test corpus produce the same output because the JS source dictates it).

## Confirmed pre-existing Picomatch→Rust ports (DO NOT COPY)

| Project | What it is | Evidence (accessed 2026-07-31) | Risk | Policy |
|---|---|---|---|---|
| `Maidang1/picomatch-rs` (crates.io `picomatch-rs`, npm `@maidang1/picomatch-rs`) | Rust matcher core (`crates/picomatch-rs/`) + napi Node binding; exposes callable matcher factory + named helpers; ships compatibility shims for `./lib/picomatch`, `./posix`, `./lib/scan`; Node smoke + parity tests; tag v0.1.0 | crates.io page (published 2026-03-19); docs.rs picomatch-rs | HIGH — same project, same target language, API-compatible ambitions | Provenance documented. Do not read its Rust source files. Independent implementation from the JS oracle only. |
| `satch` crate 0.1.0 | "A high-performance Rust implementation of picomatch/micromatch pattern matching"; MIT; 899 SLoC; 2021 edition; ~390 all-time downloads; updated ~9 months ago | crates.io/keywords/picomatch listing + crate page | MEDIUM-HIGH — claims picomatch-compatible semantics | Same policy. Note it exists in submission docs to preempt plagiarism confusion. |

## Related glob libraries in Rust (comparators/references only, not picomatch-compatible)

| Project | Semantics vs picomatch | Use |
|---|---|---|
| `devongovett/glob-match` | wildcards, character classes, brace expansion (nesting ≤10), captures; NO extglob/POSIX classes; in-place matching, no regex | benchmark comparator; fuzzing cross-check for the common subset |
| `oxc-project/fast-glob` | glob-match fork with multi-pattern support; documents glob-match brace limitations | comparator |
| `globset` (ripgrep) | gitignore-style sets, literal_separator, case-insensitive option; no extglob/braces | comparator |
| `glob` (rust-lang-nursery) | classic unix shell patterns; MatchOptions (case_sensitive, require_literal_separator, require_literal_leading_dot); ASCII-only case-insensitivity | comparator |

## Unverified lead

- "zeromatch" (mentioned in the bootstrap prompt's lead list): no project found via Search MCP search 2026-07-31 (#30). Status: **unconfirmed**; if it surfaces later, apply the same do-not-copy policy.

## Independent-derivation evidence we maintain

1. `spec.md` derives every behavior from local JS source files or the JS test suite (see requirement source references).
2. `tests/corpus` JSONL is generated from OUR oracle runner executing the cloned JS, with hashes recorded.
3. Commit history on branch `chirag` shows incremental development from Phase 0 onward.
4. DECISIONS.md records architecture rationale in our own words, tied to our spec sections.
