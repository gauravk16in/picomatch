use std::time::Instant;

use pmx_core::{Options, ParseState, ScanOptions, ScanState};
use pmx_exec::ExecFlags;

use crate::theme::{Theme, ThemeKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tab {
    LiveMatcher,
    FileExplorer,
    BraceStudio,
    AstInspector,
    BenchmarkArena,
    Presets,
}

impl Tab {
    pub const ALL: [Tab; 6] = [
        Tab::LiveMatcher,
        Tab::FileExplorer,
        Tab::BraceStudio,
        Tab::AstInspector,
        Tab::BenchmarkArena,
        Tab::Presets,
    ];

    pub fn title(&self) -> &'static str {
        match self {
            Tab::LiveMatcher => "🎯 Live Matcher",
            Tab::FileExplorer => "🌳 File Explorer",
            Tab::BraceStudio => "⚡ Brace Studio",
            Tab::AstInspector => "🔬 AST Inspector",
            Tab::BenchmarkArena => "🚀 Benchmark Arena",
            Tab::Presets => "🎨 Presets & Cheatsheet",
        }
    }

    pub fn shortcut(&self) -> &'static str {
        match self {
            Tab::LiveMatcher => "1",
            Tab::FileExplorer => "2",
            Tab::BraceStudio => "3",
            Tab::AstInspector => "4",
            Tab::BenchmarkArena => "5",
            Tab::Presets => "6",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct OptionsState {
    pub nocase: bool,
    pub dot: bool,
    pub bash: bool,
    pub nonegate: bool,
    pub noextglob: bool,
    pub contains: bool,
    pub windows: bool,
}

impl OptionsState {
    pub fn to_pmx_options(&self) -> Options {
        let mut o = Options::default();
        o.nocase = Some(self.nocase);
        o = o.with_dot(self.dot);
        o = o.with_bash(self.bash);
        o = o.with_nonegate(self.nonegate);
        o = o.with_noextglob(self.noextglob);
        o = o.with_contains(self.contains);
        o = o.with_windows(self.windows);
        o
    }
}

#[derive(Debug, Clone)]
pub struct PresetItem {
    pub category: &'static str,
    pub name: &'static str,
    pub glob: &'static str,
    pub description: &'static str,
}

#[derive(Debug, Clone)]
pub struct PathMatchResult {
    pub path: String,
    pub is_match: bool,
    pub nanos: u128,
}

#[derive(Debug, Clone, Default)]
pub struct BenchmarkStats {
    pub active: bool,
    pub total_ops: u64,
    pub matched_ops: u64,
    pub min_nanos: Option<u128>,
    pub max_nanos: u128,
    pub total_nanos: u128,
    pub ops_history: Vec<u64>,
}

impl BenchmarkStats {
    pub fn avg_nanos(&self) -> u128 {
        if self.total_ops == 0 {
            0
        } else {
            self.total_nanos / self.total_ops as u128
        }
    }

    pub fn ops_per_sec(&self) -> u64 {
        if self.total_nanos == 0 {
            0
        } else {
            ((self.total_ops as u128 * 1_000_000_000) / self.total_nanos) as u64
        }
    }
}

pub struct App {
    pub active_tab: Tab,
    pub theme: Theme,
    pub pattern_input: String,
    pub cursor_position: usize,
    pub options: OptionsState,
    pub active_option_index: usize,

    pub candidate_paths: Vec<String>,
    pub selected_path_index: usize,

    pub brace_input: String,
    pub brace_cursor: usize,

    pub tree_paths: Vec<String>,

    pub preset_list: Vec<PresetItem>,
    pub selected_preset_index: usize,

    pub selected_token_index: usize,
    pub token_count: usize,

    pub benchmark_stats: BenchmarkStats,

    pub show_help: bool,
    pub tick_count: u64,
    pub status_message: String,
}

impl App {
    pub fn new() -> Self {
        let candidate_paths = vec![
            "src/lib.rs".to_string(),
            "src/parse.rs".to_string(),
            "src/scan.rs".to_string(),
            "src/options.rs".to_string(),
            "src/utils/helpers.rs".to_string(),
            "crates/pmx-core/Cargo.toml".to_string(),
            "crates/pmx-exec/src/lib.rs".to_string(),
            "crates/pmx-cli/src/main.rs".to_string(),
            "crates/pmx-node/src/lib.rs".to_string(),
            "tests/parity/c0_test.rs".to_string(),
            "tests/parity/c1_test.rs".to_string(),
            "tests/fixtures/scan_oracle.json".to_string(),
            "docs/design/c0-foundation.md".to_string(),
            "docs/design/state-machine.md".to_string(),
            "docs/api.md".to_string(),
            "docs/benchmarks.md".to_string(),
            "package.json".to_string(),
            "package-lock.json".to_string(),
            "tsconfig.json".to_string(),
            "node_modules/picomatch/index.js".to_string(),
            "node_modules/picomatch/lib/parse.js".to_string(),
            "node_modules/picomatch/lib/scan.js".to_string(),
            ".github/workflows/ci.yml".to_string(),
            ".gitignore".to_string(),
            ".gitattributes".to_string(),
            ".env.local".to_string(),
            "README.md".to_string(),
            "LICENSE".to_string(),
            "Makefile".to_string(),
            "target/debug/pmx".to_string(),
            "target/release/libpmx_node.dylib".to_string(),
            "benchmarks/run-benchmarks.js".to_string(),
            "benchmarks/parity.json".to_string(),
            "fixtures/c5_oracle.json".to_string(),
            "fixtures/c7_oracle.json".to_string(),
            "web/components/Button.tsx".to_string(),
            "web/components/Card.jsx".to_string(),
            "web/styles/global.css".to_string(),
            "web/pages/api/v1/health.ts".to_string(),
            "web/public/favicon.ico".to_string(),
            "web/public/logo.png".to_string(),
            "scripts/build-wasm.sh".to_string(),
            "scripts/publish.py".to_string(),
            "scripts/deploy.js".to_string(),
            "vendor/posix/regex.c".to_string(),
            "vendor/posix/regex.h".to_string(),
        ];

        let tree_paths = candidate_paths.clone();

        let preset_list = vec![
            PresetItem {
                category: "Rust Workspaces",
                name: "All Rust Source Files",
                glob: "**/*.rs",
                description: "Matches any .rs file in any subdirectory",
            },
            PresetItem {
                category: "Rust Workspaces",
                name: "Crates & Manifests",
                glob: "{crates,picomatch-tui}/**/Cargo.toml",
                description: "Matches Cargo.toml inside crate subdirectories",
            },
            PresetItem {
                category: "Web & Config",
                name: "TypeScript & JavaScript",
                glob: "**/*.{js,jsx,ts,tsx}",
                description: "Matches JS/TS frontend and backend files",
            },
            PresetItem {
                category: "Negation & Exclusion",
                name: "Ignore Node Modules & Target",
                glob: "!(node_modules|target)/**",
                description: "Extglob negation matching outside build/dep dirs",
            },
            PresetItem {
                category: "Brace & Extglob",
                name: "Extglob Option Choice",
                glob: "src/@(lib|parse|scan).rs",
                description: "Extglob matching specific core modules",
            },
            PresetItem {
                category: "Brace & Range",
                name: "Numeric Range Braces",
                glob: "tests/parity/c{0..9}_test.rs",
                description: "Expands numeric sequence c0 through c9",
            },
            PresetItem {
                category: "Dot Files & Git",
                name: "Hidden Dot Files",
                glob: ".*",
                description: "Matches hidden configuration files like .gitignore",
            },
            PresetItem {
                category: "Documentation",
                name: "All Markdown Docs",
                glob: "docs/**/*.md",
                description: "Matches markdown files recursively inside docs/",
            },
        ];

        Self {
            active_tab: Tab::LiveMatcher,
            theme: Theme::from_kind(ThemeKind::Cyberpunk),
            pattern_input: "src/**/*.rs".to_string(),
            cursor_position: "src/**/*.rs".len(),
            options: OptionsState::default(),
            active_option_index: 0,
            candidate_paths,
            selected_path_index: 0,
            brace_input: "src/{components,utils}/*.{js,ts}".to_string(),
            brace_cursor: "src/{components,utils}/*.{js,ts}".len(),
            tree_paths,
            preset_list,
            selected_preset_index: 0,
            selected_token_index: 0,
            token_count: 0,
            benchmark_stats: BenchmarkStats::default(),
            show_help: false,
            tick_count: 0,
            status_message: "Ready — Press '?' or 'h' for help".to_string(),
        }
    }

    pub fn next_tab(&mut self) {
        let tabs = Tab::ALL;
        let pos = tabs.iter().position(|t| *t == self.active_tab).unwrap_or(0);
        self.active_tab = tabs[(pos + 1) % tabs.len()];
    }

    pub fn prev_tab(&mut self) {
        let tabs = Tab::ALL;
        let pos = tabs.iter().position(|t| *t == self.active_tab).unwrap_or(0);
        self.active_tab = tabs[(pos + tabs.len() - 1) % tabs.len()];
    }

    pub fn next_theme(&mut self) {
        self.theme = Theme::from_kind(self.theme.kind.next());
        self.status_message = format!("Theme changed to {}", self.theme.kind.name());
    }

    pub fn toggle_active_option(&mut self) {
        match self.active_option_index {
            0 => self.options.nocase = !self.options.nocase,
            1 => self.options.dot = !self.options.dot,
            2 => self.options.bash = !self.options.bash,
            3 => self.options.nonegate = !self.options.nonegate,
            4 => self.options.noextglob = !self.options.noextglob,
            5 => self.options.contains = !self.options.contains,
            6 => self.options.windows = !self.options.windows,
            _ => {}
        }
    }

    pub fn next_option(&mut self) {
        self.active_option_index = (self.active_option_index + 1) % 7;
    }

    pub fn prev_option(&mut self) {
        self.active_option_index = (self.active_option_index + 6) % 7;
    }

    pub fn load_preset(&mut self) {
        if let Some(preset) = self.preset_list.get(self.selected_preset_index) {
            self.pattern_input = preset.glob.to_string();
            self.cursor_position = self.pattern_input.len();
            self.active_tab = Tab::LiveMatcher;
            self.status_message = format!("Loaded preset: {}", preset.name);
        }
    }

    pub fn evaluate_current_pattern(&self) -> (Result<ParseState, String>, Vec<PathMatchResult>) {
        let pmx_opts = self.options.to_pmx_options();
        match pmx_core::parse(&self.pattern_input, &pmx_opts) {
            Ok(parsed) => {
                let flags = ExecFlags {
                    nocase: self.options.nocase,
                };
                let regex_source = parsed.output.clone();

                let results: Vec<PathMatchResult> = self
                    .candidate_paths
                    .iter()
                    .map(|path| {
                        let start = Instant::now();
                        let input_units: Vec<u16> = path.encode_utf16().collect();
                        let is_match =
                            pmx_exec::is_match(&regex_source, &input_units, flags).unwrap_or(false);
                        let elapsed = start.elapsed().as_nanos();
                        PathMatchResult {
                            path: path.clone(),
                            is_match,
                            nanos: elapsed,
                        }
                    })
                    .collect();

                (Ok(parsed), results)
            }
            Err(e) => (Err(format!("{e}")), Vec::new()),
        }
    }

    pub fn evaluate_scan(&self) -> ScanState {
        let scan_opts = ScanOptions::default().with_parts(true).with_tokens(true);
        pmx_core::scan(&self.pattern_input, &scan_opts)
    }

    pub fn run_benchmark_step(&mut self) {
        if !self.benchmark_stats.active {
            return;
        }

        let pmx_opts = self.options.to_pmx_options();
        let flags = ExecFlags {
            nocase: self.options.nocase,
        };

        if let Ok(parsed) = pmx_core::parse(&self.pattern_input, &pmx_opts) {
            let regex_source = parsed.output;
            let sample_paths = &self.candidate_paths;

            let mut batch_ops = 0;
            let mut batch_matched = 0;
            let mut batch_nanos = 0;

            for path in sample_paths {
                let start = Instant::now();
                let input_units: Vec<u16> = path.encode_utf16().collect();
                let m = pmx_exec::is_match(&regex_source, &input_units, flags).unwrap_or(false);
                let elapsed = start.elapsed().as_nanos();

                batch_ops += 1;
                if m {
                    batch_matched += 1;
                }
                batch_nanos += elapsed;

                if self.benchmark_stats.min_nanos.is_none()
                    || elapsed < self.benchmark_stats.min_nanos.unwrap()
                {
                    self.benchmark_stats.min_nanos = Some(elapsed);
                }
                if elapsed > self.benchmark_stats.max_nanos {
                    self.benchmark_stats.max_nanos = elapsed;
                }
            }

            self.benchmark_stats.total_ops += batch_ops;
            self.benchmark_stats.matched_ops += batch_matched;
            self.benchmark_stats.total_nanos += batch_nanos;

            let current_ops_sec = if batch_nanos > 0 {
                ((batch_ops as u128 * 1_000_000_000) / batch_nanos) as u64
            } else {
                0
            };

            self.benchmark_stats.ops_history.push(current_ops_sec);
            if self.benchmark_stats.ops_history.len() > 30 {
                self.benchmark_stats.ops_history.remove(0);
            }
        }
    }

    pub fn tick(&mut self) {
        self.tick_count += 1;
        if self.benchmark_stats.active {
            self.run_benchmark_step();
        }
    }
}
