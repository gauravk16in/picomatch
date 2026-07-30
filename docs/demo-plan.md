# Demo Video Plan (5 minutes, live)

Status: plan ready; recording Phase 11. Requirement: "5-minute demo video showing the original test suite passing live against your port" `(verified: coderesurrection.com/2026 §04 deliverable 07)`.

## Narrative arc (target ≈ 5:00)

| Time | Segment | What the viewer sees |
|---|---|---|
| 0:00–0:30 | Hook | Repo page; one-liner: "picomatch 4.0.5 ported to Rust, original suite unmodified." Show `git log -1` and the 4.0.5 tag. |
| 0:30–1:10 | One-command build | Fresh terminal: `cargo build --release` completes; show the produced CLI artifact. |
| 1:10–2:20 | Original suite, live | `node test/adapter/run-mocha.js` streaming the ORIGINAL mocha dot output against the Rust artifact → `1977 passing`. Call out: "files hashed at kickoff, untouched." |
| 2:20–3:00 | Differential proof | `fuzz/log.txt` tail: 60s+ zero-divergence differential fuzz; a few corpus mismatches-that-aren't (parade of tricky patterns: `**/!(*.d).ts`, `+(a|aa)` literalized, `[[:alpha:]]`). |
| 3:00–3:45 | Benchmarks | bench/results.json rendered: p50/p99/RSS/startup table JS vs Rust; honest comment on any slower cell. |
| 3:45–4:30 | Engineering artifacts | DECISIONS.md highlights (D-002 source-parity boundary, D-011 issue #175), unsafe count = 0, MIT attribution, `grep -rn unsafe crates/*/src` → empty. |
| 4:30–5:00 | Close | Where things stand: compatibility-matrix summary, known limitations, repo link. |

## Recording environment

- Clean VM/container (Docker image from docs/build-and-ci.md) so the run is reproducible; terminal + editor side by side; 1080p; no secrets in env (`env | grep -i token` checked empty before recording); narrated or captioned.
- Pre-flight: `cargo clean` is NOT needed — show real incremental build once, then note clean-build time from CI logs if asked.

## Fallback

If the live environment fails on recording day: pre-recorded container run of the same commands (timestamps visible) + a short live re-run of the adapter on the presenter machine. The claim "passing live" must remain literally true in at least one take — never edit output to look green.

## Retakes checklist

- [ ] `1977 passing` (or the honest named subset with matrix reference) visible in one continuous shot
- [ ] corpus manifest hash matches the hash shown in the parity report
- [ ] fuzz log duration ≥ 60s visible
- [ ] no hidden terminal scrollback containing secrets
