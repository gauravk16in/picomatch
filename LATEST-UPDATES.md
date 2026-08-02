# LATEST UPDATES — the picomatch → Rust port (pmx)

_A plain-English status note for teammates. Read this first. Deeper technical detail lives in the design docs named below._

## What we're building, in one paragraph

We're recreating the JavaScript glob library **picomatch** (version 4.0.5) in Rust, with a very specific goal: **byte-for-byte identical behavior, including its known bugs**. This is not a rewrite — it's a faithful port. The original library produces regular-expression *source strings* from glob patterns; that string is our exactness harness: if our string matches the JavaScript string character-for-character on every pattern we test, the port is proven equivalent.

**Why bug-for-bug?** The scoring is: the original, unmodified JavaScript test suite must pass against our port. picomatch has ~35 documented upstream bugs whose outcomes are baked into that suite. "Fixing" any of them breaks tests. So whenever Rust or common sense suggests a cleaner behavior, we reject it and record the decision in `DECISIONS.md`.

## The rules we play by

1. **The original repo is sacred.** `../picomatch/` (also reachable as `../Main/`, a symlink) is the reference. Nothing in it gets edited — its test files, its source, nothing. Our corpora read from it.
2. **One chunk at a time.** The parser is split into ten chunks, C0 through C9 (the plan is `PARSE_CHUNKS.md`). Only one is ever under construction.
3. **Design first, in writing.** Each chunk has a design doc (`C0_DESIGN.md` etc.) explaining exactly which JS lines it covers, which it doesn't, and its risks.
4. **Independent review before and after.** The person who writes code never reviews it. A fresh reviewer checks the *design* before implementation and the *code* after. C0 was rejected once and got better because of it; C3's design got rejected too, at the design stage — cheaply.
5. **The oracle is empirical, not remembered.** Expected outputs are *extracted from the running JavaScript implementation* into frozen corpus files (`fixtures/*_oracle.json`) and byte-compared. We never trust our own idea of what the output "should" be.
6. **Real output, not optimism.** Every loop ends with the formatter, linter-with-zero-warnings, and full test suite run, with the actual output as the report.

## The sequence, and why it's ordered this way

The ten chunks were ordered so each builds only on things already proven:

1. **C0 – Foundation.** State, guards, error messages, the token machinery, exit path. Nothing parses yet, but everything later compiles onto it.
2. **C1 – Text world.** The fast path for literal-heavy patterns, and NUL/escape/quote/plain-text handling in the slow path.
3. **C2 – Paths.** Slashes, the `./` normalization, and how a bare `.` differs from a merged dot.
4. **C3 – Single wildcards.** `?` and `*` with their position guards (leading-dot protection, slash adjacency, capture behavior).
5. **C4 – Fastpath gallery.** Pre-canned outputs for the most common patterns like `*.js` and `**`. Separate because the gallery provably *disagrees* with the slow path on some inputs — and tests pin the disagreement.
6. **C5 – Braces.** `{a,b}` alternation and `{a..z}` ranges.
7. **C6 – Brackets.** `[]` character classes and `[[:alpha:]]` POSIX classes.
8. **C7 – Parentheses & extglobs.** `?() *() +() @() !()` — the biggest single test mass in the suite (~68%).
9. **C8 – Globstars.** `**` — the context-rewriting state machine. Kept late because it's the hardest per line and everything it rewrites is done and tested by then.
10. **C9 – Negation.** Leading `!` — last because it interacts with extglobs and globstars.

Alongside: a teammate independently ported the smaller public API (`scan.js`, plus the shared constants/utilities) and merged it with its own oracle.

## Where we are right now (as of today)

### Finished and frozen (do not change without a chunk-level reason)

| Chunk | What it is | Proof |
|---|---|---|
| C0 Foundation | entry guards, UTF-16-safe storage, token arena, error messages identical to JS, recovery/rebuild | corpus 39 rows, 20k+ adversarial inputs, two review iterations, ACCEPT |
| C1 Text | inline fastpath, escapes, quotes, text merging | two corpora (39 + 55 rows), all gates green |
| C2 Slash/dot | slash handling, `./` collapse, dot vs text-dot distinction | merged + validated by 3 staged rows that were pre-armed for it |

Also merged, from a teammate: **scan.js port** (separate public API) with a 3,072-case oracle, DECISIONS.md with the first four recorded decisions, and audit trails in `audits/`.

### In progress: C3 (single wildcards) — where exactly it stands

- **Design** — written: `C3_DESIGN.md`.
- **Independent design review** — REJECTED initially with 1 blocker and 5 majors (all verified real, one revealed that a planned corpus activation would have broken the build). All 12 required amendments were applied.
- **Implementation** — done: `src/parse/wildcards.rs` (qmark + plain star, in exact JS branch order), dispatcher wiring, staging marker removed.
- **Oracle** — `fixtures/c3_oracle.json`: 35 case rows, byte-frozen and deterministic (`sha 7bc38bc1…`).
- **Verification** — `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` are all currently green: **53 unit tests + 2 corpus tests pass**, including all 35 C3 rows plus earlier corpora.
- **Not yet done for C3**: (a) the adversarial differential run (`fixtures/attack-c3.js`), (b) the independent **implementation** review, (c) the freeze. There is an open investigation on the attack harness: generating ~9k cases made the driver crawl (process-level slowness with output flushed only at the end — suspected buffering/scheduling, not a parser fault: direct corpus comparison and all tests are green). Do not treat C3 as accepted until those close.

## How we work — the loop every chunk follows

1. Re-read the JS for exactly this chunk.
2. Write/extend its DESIGN.md.
3. Independent design review. Amend until approved.
4. Implement ONLY this chunk (add code in its own module; leave comment hooks where future chunks belong).
5. Regenerate and verify the corpus(es) from the reference.
6. Compare Rust vs JavaScript byte-for-byte; run formatter, linter, tests.
7. Independent implementation review (fresh reviewer with ≥200 adversarial inputs). Fix, repeat until ACCEPT.
8. Freeze. Next chunk.

## What's left

- **C3** — close the three open items above.
- **C4** fastpath gallery (short, but devious: it must match the JS gallery byte-for-byte *and* stay deliberately different from the slow path).
- **C5 braces**, **C6 brackets/POSIX**, **C7 extglobs** (the biggest one; includes a ReDoS-risk triage subsystem and recursion), **C8 globstars** (the hardest per line), **C9 negation** (interacts with everything).
- Longer-term after the parser: compile/match orchestration (`makeRe`), the adapter and benchmark layers (see `../agents.md` for the full blueprint).

## Hard-won warnings worth repeating

- **Never fix the library's bugs.** Several look like bugs. They are the spec.
- **Byte-exact means the error *messages* too**, including how JavaScript prints odd numbers.
- **The fastpath and slow path intentionally disagree** on a few patterns. Reproduce both.
- **JavaScript strings are UTF-16 units**, so Rust's `String` can't represent some original outputs (astral chars get escaped half-by-half). Internally we carry code-unit vectors and the corpus encodes them explicitly.
- **A case that can't yet be fairly compared stays out of the corpus** until its chunk — never kept as an expected failure.
- **Reviewers get suspicious results when they attack.** That's working as intended; C0 and C3 both became much better because of it.

## Immediate next steps

1. Finish `fixtures/attack-c3.js` diagnosis (likely harness-side buffering — don't let it block review of the code itself).
2. Independent implementation review of C3 (`wildcards.rs`, dispatcher wiring, oracle rows).
3. Amend, re-run all gates, freeze C3.
4. Start C4 (fastpath gallery) with the same loop.
