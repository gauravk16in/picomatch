# fixtures/ — Oracle Corpora and Differential Harnesses

## Purpose

This directory contains:

1. **Extractor scripts** (`extract-cN.js`) — generate oracle JSON from the JS reference.
2. **Oracle corpora** (`cN_oracle.json`, `scan_oracle.json`) — committed ground-truth for Rust tests.
3. **Verifier scripts** (`verify-cN.js`, `verify-scan.js`) — replay the oracle against the Rust port.
4. **Attack harnesses** (`attack-*.js`) — adversarial differential testing.
5. **Integration harnesses** (`run-integrated.js`, `attack-integrated.js`, etc.) — orchestrate multi-step gates.
6. **Smoke tests** (`a1-smoke.js`, `a2-smoke.js`, etc.) — per-adapter-step verification.

## `PICOMATCH_REF` Environment Variable

All scripts that need the upstream picomatch v4.0.5 reference read the path
from the `PICOMATCH_REF` environment variable:

```bash
# Preferred: set once for the session
export PICOMATCH_REF="$(cd ../Main && pwd)"

# Or for a one-off run:
PICOMATCH_REF=/path/to/picomatch-4.0.5 node fixtures/run-integrated.js
```

If `PICOMATCH_REF` is not set, scripts fall back to `../Main` (relative to
the repository root) for backwards compatibility.

## Oracle Generation Policy

Oracle corpora are **generated files** that are committed to the repository.
They are generated from the JavaScript reference and verified against the Rust
port. The correct lifecycle is:

```bash
# Step 1: regenerate (requires PICOMATCH_REF)
node fixtures/extract-c0.js

# Step 2: verify (always run immediately after regeneration)
node fixtures/verify-c0.js
```

**Both steps are mandatory.** Never skip the verify step after regeneration.
Never add `expected-fail` markers to corpora — use `chunk: N` staging instead.

## Committed Corpora Policy

The `*_oracle.json` files are committed because:

- They enable Rust tests (`cargo test`) to run without Node.js or the upstream reference.
- They provide a stable, reproducible baseline that can be hash-verified.
- Regeneration requires the upstream picomatch source and should be explicit.

To verify that committed corpora are up-to-date:

```bash
export PICOMATCH_REF="$(cd ../Main && pwd)"
node fixtures/extract-c0.js   # regenerate
git diff fixtures/c0_oracle.json  # should be empty if nothing changed
```

## Integrated Harness

`fixtures/run-integrated.js` runs 16 steps that together constitute the full
parity gate. Pass all 16 to claim parity:

```bash
export PICOMATCH_REF="$(cd ../Main && pwd)"
node fixtures/run-integrated.js
# Expected: INTEGRATED VALIDATION PASSED: all 16 steps green.
```
