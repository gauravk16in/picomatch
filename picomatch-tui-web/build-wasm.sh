#!/usr/bin/env bash
set -euo pipefail

echo "⚡ Building Picomatch Rust WebAssembly & Static Web Assets..."

# 1. Compile pmx-core & pmx-exec to wasm32-unknown-unknown if target installed
if command -v wasm-pack &> /dev/null; then
    echo "📦 Compiling Rust crate to WASM via wasm-pack..."
    wasm-pack build --target web --out-dir ./pkg
else
    echo "ℹ️  wasm-pack not found in PATH; using static browser bundle."
fi

echo "✅ Web static assets ready in picomatch-tui-web!"
echo "🚀 To deploy to Vercel (100% free static hosting):"
echo "   npx vercel ./picomatch-tui-web --prod"
