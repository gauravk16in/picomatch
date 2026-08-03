# Review Remediation — Cleanup, CI & Fuzzing Infrastructure (M3–M4, MINORS)

This document covers cross-platform benchmark verification repairs, git binary tracking cleanup, GitHub Actions CI workflow creation, and cargo-fuzz harness integration.

---

## 1. Finding M4: Cross-Platform Benchmark Artifact Verification

### Problem Description
`benchmarks/verify-artifacts.js` failed when executed on non-Windows platforms (e.g. macOS arm64):
1. **Path separator mismatch**: `provenance.corpus_path` contained Windows backslashes (`"benchmarks\\scenarios.json"`). Calling `path.join(ROOT, raw.provenance.corpus_path)` on macOS produced an invalid path containing literal `\` characters (`Referenced corpus not found`).
2. **Floating-point ULP drift**: Recomputing summary metrics from raw measurements using `stats.js` compared committed vs recomputed numbers via `JSON.stringify(committed) === JSON.stringify(recomputed)`. V8 floating-point math across different operating systems (Windows Node v26 vs macOS Node v26) produced sub-ULP differences in bootstrap 95% confidence interval boundaries (`1.352012092410661` vs `1.3520120924106607`), failing verification.

### Fix Implementation
Updated [benchmarks/verify-artifacts.js](file:///Users/abhinav/Projects/pico-big/picomatch-rust/benchmarks/verify-artifacts.js):
1. Normalized path separators before joining:
```javascript
const rawCorpus = (raw.provenance.corpus_path || '').replace(/[\\/]/g, path.sep);
const corpusPath = path.join(ROOT, rawCorpus);
```
2. Replaced exact JSON string matching with a float-tolerant object comparison helper (`summaryRowsMatch` with `1e-8` relative/absolute epsilon):
```javascript
function summaryRowsMatch(a, b) {
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number') {
    return Math.abs(a - b) <= 1e-8 || (Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))) <= 1e-8;
  }
  ...
}
```

### Verification
`node benchmarks/verify-artifacts.js benchmarks/results` now outputs:
`All final artifacts verified (1 final set: raw + summary + schedule + sidecars + independent summary recomputation; 2 legacy set(s) skipped as superseded).`

---

## 2. Binary Artifact & Git Tracking Cleanup

### Problem Description
A compiled Mach-O arm64 binary (`adapter/native/pmx_node.node`, 3.8 MB) was committed in the git repository.

### Fix Implementation
1. Added `adapter/native/*.node` to [.gitignore](file:///Users/abhinav/Projects/pico-big/picomatch-rust/.gitignore).
2. Removed the binary from git tracking: `git rm --cached adapter/native/pmx_node.node`.

---

## 3. Continuous Integration Workflow (.github/workflows/ci.yml)

### Implementation
Created [.github/workflows/ci.yml](file:///Users/abhinav/Projects/pico-big/picomatch-rust/.github/workflows/ci.yml) to automate quality gates on push and pull requests targeting `rust-port` or `review-remediation`:

```yaml
name: CI

on:
  push:
    branches: [rust-port, review-remediation]
  pull_request:
    branches: [rust-port]

jobs:
  check:
    name: Rust checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - name: Format check
        run: cargo fmt --check
      - name: Clippy
        run: cargo clippy --workspace --all-targets -- -D warnings
      - name: Tests
        run: cargo test --workspace

  adapter-parity:
    name: Adapter parity (Node.js)
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Build pmx-cli
        run: cargo build --release -p pmx-cli
      - name: Install Node dependencies
        run: npm ci || npm install
      - name: Run corpus verification
        run: |
          for f in fixtures/verify-c*.js; do
            node "$f"
          done
      - name: Run benchmark canaries
        run: node benchmarks/bench-canaries.js
```

---

## 4. Finding M3: Fuzzing Harness Scaffolding (Rulebook §7)

### Implementation
Created cargo-fuzz scaffolding under `fuzz/`:
- **`fuzz/Cargo.toml`**: Configures `libfuzzer-sys` dependency and `parse_differential` binary target.
- **`fuzz/fuzz_targets/parse_differential.rs`**: Target harness that feeds random UTF-8 data to `pmx_core::parse` under both fastpath and slow-path option configurations, verifying crash-freedom.
- **`fuzz/README.md`**: Guide for running `cargo +nightly fuzz run parse_differential`, populating seed corpora, and minimizing crash artifacts.
