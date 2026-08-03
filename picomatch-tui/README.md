# ⚡ Picomatch Rust TUI Demo (`picomatch-tui`)

An insanely decorative, feature-rich interactive Terminal User Interface (TUI) built in Rust to demonstrate the power, performance, and features of the [`picomatch-rust`](../README.md) library (`pmx-core`, `pmx-exec`, `pmx-cli`).

![Picomatch TUI Demo](https://github.com/user-attachments/assets/6b3fc102-2377-429c-9c31-aa76630013fe)

---

## 🌟 Features & Highlights

- **🎯 Tab 1: Live Pattern Matcher & Real-Time Tester**
  - Type glob patterns live and watch 50+ candidate file paths evaluate instantly.
  - Interactive compiler options checkboxes (`nocase`, `dot`, `bash`, `nonegate`, `noextglob`, `contains`, `windows`).
  - Microsecond latency timing per path evaluation.
  - Live preview of compiled ECMAScript UTF-16 Regex source emitted by `pmx_core::parse`.

- **🌳 Tab 2: Interactive Workspace Directory Explorer**
  - Directory tree view with real-time glob filtering overlay.
  - Matching files glow with emerald/gold badges while mismatched files dim out.

- **⚡ Tab 3: Brace & Extglob Studio**
  - Real-time brace expansion preview (`{a,b,{1..3}}`, `src/{core,exec}/*.rs`).
  - Extglob pattern state machine playground (`@(foo|bar)`, `!(build|dist)`).
  - Quick reference guide for POSIX character classes and extglobs.

- **🔬 Tab 4: AST & Parser Inspector**
  - Full state machine inspection (`pmx_core::ParseState` & `pmx_core::ScanState`).
  - Displays token positions, consumed token counts, globstar flags, and parsed token stream table.

- **🚀 Tab 5: Micro-Benchmark Arena**
  - Animated throughput gauges and Ops/sec counters processing thousands of matches in background loops.
  - Min/Max/Avg nanosecond latency distribution sparklines.

- **🎨 Tab 6: Preset Gallery & Glob Cheat Sheet**
  - Curated gallery of popular real-world globs (Gitignore patterns, Monorepo filters, Next.js page routes, Cargo targets).
  - One-key (`<Enter>`) instant loading into the Live Matcher.

---

## 🎨 Themes

Supports 4 custom curated color themes:
- **Neon Cyberpunk ⚡** (Electric Cyan, Neon Magenta, Bright Yellow)
- **Tokyo Night 🌃** (Deep Slate, Pastel Lavender, Soft Coral)
- **Dracula 🧛** (Vibrant Purple, Pink, Mint Green)
- **Monokai Pro 🎨** (Monokai Gold, Lime Green, Bright Red)

Press `t` anytime while running to cycle themes!

---

## 🚀 Getting Started & Running

```bash
# Build and run the TUI demo from the workspace root:
cargo run -p picomatch-tui

# Or inside the picomatch-tui folder:
cd picomatch-tui
cargo run
```

---

## ⌨️ Keybindings

| Key | Action |
| --- | --- |
| `1` - `6` | Jump to Tab 1-6 |
| `Tab` / `Shift+Tab` / `←` / `→` | Navigate tabs / controls |
| `↑` / `↓` | Navigate candidate paths or preset list |
| `Space` | Toggle option checkbox or benchmark runner |
| `Enter` | Load selected preset pattern |
| `t` | Cycle color theme |
| `b` | Toggle live performance benchmark loop |
| `?` / `h` | Show/hide Help Modal |
| `q` / `Esc` | Quit application |

---

## 🛠️ Architecture

- **Rendering Engine**: [`ratatui`](https://crates.io/crates/ratatui) 0.29
- **Terminal Backend**: [`crossterm`](https://crates.io/crates/crossterm) 0.28
- **Core Glob Logic**: `pmx-core` & `pmx-exec`
