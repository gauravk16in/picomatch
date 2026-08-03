# pmx — Makefile for common development workflows
# Run `make help` to see available targets.

.PHONY: help check test verify bench clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

check: ## Run format check + clippy (no tests)
	cargo fmt --check
	cargo clippy --workspace --all-targets -- -D warnings

test: ## Run all Rust tests
	cargo test --workspace

verify: check test ## Full verification: format + clippy + tests
	@echo ""
	@echo "=== All Rust gates passed ==="
	@echo ""
	@echo "For differential parity testing (requires Node.js + ../Main):"
	@echo "  node fixtures/run-integrated.js"
	@echo "  node benchmarks/bench-canaries.js"

bench: ## Run benchmark canaries (requires Node.js)
	node benchmarks/bench-canaries.js

clean: ## Clean build artifacts
	cargo clean
