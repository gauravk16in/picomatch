# pmx — Makefile for common development workflows
# Run `make help` to see available targets.
#
# NOTE: This Makefile uses bash features. On Windows, run commands directly.

.PHONY: help check test verify verify-parity bench bench-canaries verify-artifacts clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

check: ## Run format check + clippy (no tests)
	cargo fmt --check
	cargo clippy --workspace --all-targets -- -D warnings

test: ## Run all Rust tests
	cargo test --workspace

verify: check test ## Rust-only gate: format + clippy + tests (no Node.js required)
	@echo ""
	@echo "=== Rust gates passed ==="
	@echo ""
	@echo "For differential parity testing (requires Node.js + PICOMATCH_REF):"
	@echo "  export PICOMATCH_REF=\$$(cd ../Main && pwd)"
	@echo "  make verify-parity"

verify-parity: ## Full parity gate: build binaries, run integrated + canaries (requires PICOMATCH_REF)
	@if [ -z "$$PICOMATCH_REF" ]; then \
		echo "ERROR: PICOMATCH_REF is not set."; \
		echo "  export PICOMATCH_REF=/path/to/picomatch-v4.0.5"; \
		echo "  or: git clone --branch 4.0.5 --depth 1 https://github.com/micromatch/picomatch.git ../Main"; \
		echo "      export PICOMATCH_REF=\$$(cd ../Main && pwd)"; \
		exit 1; \
	fi
	cargo build --release -p pmx-cli
	cargo build --release --example scanbench
	node fixtures/run-integrated.js
	node benchmarks/bench-canaries.js

bench-canaries: ## Run benchmark canaries (builds scanbench if needed)
	cargo build --release --example scanbench
	node benchmarks/bench-canaries.js

bench: bench-canaries ## Alias for bench-canaries

verify-artifacts: ## Verify committed benchmark artifact set without rerunning benchmarks
	node benchmarks/verify-artifacts.js benchmarks/results

clean: ## Clean Rust build artifacts
	cargo clean
