# tests/ — Test Harness and Frozen Upstream Suite

## Directory Layout

```
tests/
├── index.js              # Root-level shim loader for the adapter
├── lib/
│   ├── scan.js           # Shim: adapter/lib/scan.js surface
│   └── utils.js          # Shim: adapter/lib/utils.js surface
├── posix.js              # Shim: adapter/posix.js surface
└── original/             # Byte-frozen copy of the upstream JS test suite
    ├── HASHES.txt        # SHA-256 hash of each file — never modify
    ├── api.picomatch.js
    ├── api.scan.js
    ├── ... (full suite)
    └── support/match.js
```

## `tests/original/` — Frozen Upstream Test Suite

`tests/original/` is a **byte-exact copy** of the `test/` directory from
[micromatch/picomatch](https://github.com/micromatch/picomatch) at v4.0.5
(commit `00cf02c251c3bcd498448e7c313e5eaf8e27d8f2`).

### Critical Rules

1. **Never edit any file under `tests/original/`.** These files are used as the
   oracle for differential parity testing. Any modification invalidates the
   comparison.

2. **Hash verification.** `tests/original/HASHES.txt` contains the SHA-256
   hash of each file. The integrated harness (`fixtures/run-integrated.js`)
   verifies the hash pin at step 8/8 (test-hash gate). A hash mismatch is a
   hard failure.

3. **No expected-fail markers.** If a test cannot pass in the current
   implementation state, it must be covered by a corpus chunk boundary
   (`chunk: N` in the oracle JSON), not by an `expect` or `.skip` wrapper in
   the test file.

### How Parity Is Measured

The original tests run through the Rust adapter (`adapter/`) instead of the
original JavaScript implementation. The adapter shims the `require('picomatch')`
surface and dispatches to the Rust `pmx-cli` binary via JSONL IPC or the
`pmx-node` NAPI bridge.

```bash
# Run via mocha (requires Main node_modules for mocha):
export PICOMATCH_REF="$(cd ../Main && pwd)"
npx --prefix ../Main mocha tests/original/api.scan.js --reporter dot

# Or use the integrated harness (includes all gates):
node fixtures/run-integrated.js
```

Current parity: **1977/1977** tests pass through the adapter (100.00%).

### Shim Files

The files at the root of `tests/` (`index.js`, `lib/scan.js`, `lib/utils.js`,
`posix.js`) are adapter shims. When the original test files call
`require('..')`, `require('../lib/scan')`, etc., these shims redirect to the
Rust adapter in `adapter/`. **These files may be edited** to improve shim
fidelity, but must never introduce incorrect behavior relative to the
JavaScript oracle.
