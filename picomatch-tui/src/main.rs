#![forbid(unsafe_code)]

mod app;
mod theme;
mod ui;

use std::{
    io, panic,
    time::{Duration, Instant},
};

use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};

use app::{App, Tab};

fn setup_terminal() -> io::Result<Terminal<CrosstermBackend<io::Stdout>>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    Terminal::new(backend)
}

fn restore_terminal(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

fn install_panic_hook() {
    let original_hook = panic::take_hook();
    panic::set_hook(Box::new(move |panic_info| {
        let _ = disable_raw_mode();
        let _ = execute!(io::stdout(), LeaveAlternateScreen);
        original_hook(panic_info);
    }));
}

// helper: LiveMatcher editor key handling (UTF-8 boundary-aware)
fn handle_live_matcher_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Up => {
            if app.selected_path_index > 0 {
                app.selected_path_index -= 1;
            }
        }
        KeyCode::Down => {
            if app.selected_path_index + 1 < app.candidate_paths.len() {
                app.selected_path_index += 1;
            }
        }
        KeyCode::Left => app.prev_option(),
        KeyCode::Right => app.next_option(),
        KeyCode::Char(' ') => app.toggle_active_option(),
        KeyCode::Char(c) => {
            let byte_len = c.len_utf8();
            app.pattern_input.insert(app.cursor_position, c);
            app.cursor_position += byte_len;
        }
        KeyCode::Backspace => {
            if app.cursor_position > 0 {
                let prev = app.pattern_input[..app.cursor_position]
                    .char_indices()
                    .last()
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                app.cursor_position = prev;
                app.pattern_input.remove(app.cursor_position);
            }
        }
        _ => {}
    }
}

// helper: BraceStudio editor key handling (UTF-8 boundary-aware)
fn handle_brace_editor_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Char(c) => {
            let byte_len = c.len_utf8();
            app.brace_input.insert(app.brace_cursor, c);
            app.brace_cursor += byte_len;
        }
        KeyCode::Backspace => {
            if app.brace_cursor > 0 {
                let prev = app.brace_input[..app.brace_cursor]
                    .char_indices()
                    .last()
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                app.brace_cursor = prev;
                app.brace_input.remove(app.brace_cursor);
            }
        }
        _ => {}
    }
}

// helper: global shortcuts for non-editing tabs
fn handle_global_shortcuts(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Char('?') | KeyCode::Char('h') => {
            app.show_help = true;
        }
        KeyCode::Char('t') => {
            app.next_theme();
        }
        KeyCode::Char('b') => {
            app.benchmark_stats.active = !app.benchmark_stats.active;
            app.status_message = if app.benchmark_stats.active {
                "Benchmark started!".to_string()
            } else {
                "Benchmark paused".to_string()
            };
        }
        KeyCode::Char('1') => app.active_tab = Tab::LiveMatcher,
        KeyCode::Char('2') => app.active_tab = Tab::FileExplorer,
        KeyCode::Char('3') => app.active_tab = Tab::BraceStudio,
        KeyCode::Char('4') => app.active_tab = Tab::AstInspector,
        KeyCode::Char('5') => app.active_tab = Tab::BenchmarkArena,
        KeyCode::Char('6') => app.active_tab = Tab::Presets,
        _ => {}
    }
}

// helper: navigation keys for non-editing tabs
fn handle_nav_tab_key(app: &mut App, code: KeyCode) {
    match app.active_tab {
        Tab::FileExplorer => match code {
            KeyCode::Up => {
                if app.selected_path_index > 0 {
                    app.selected_path_index -= 1;
                }
            }
            KeyCode::Down => {
                if app.selected_path_index + 1 < app.tree_paths.len() {
                    app.selected_path_index += 1;
                }
            }
            _ => {}
        },
        Tab::AstInspector => match code {
            KeyCode::Up => {
                if app.selected_token_index > 0 {
                    app.selected_token_index -= 1;
                }
            }
            KeyCode::Down => {
                if app.token_count > 0 && app.selected_token_index + 1 < app.token_count {
                    app.selected_token_index += 1;
                }
            }
            _ => {}
        },
        Tab::Presets => match code {
            KeyCode::Up => {
                if app.selected_preset_index > 0 {
                    app.selected_preset_index -= 1;
                }
            }
            KeyCode::Down => {
                if app.selected_preset_index + 1 < app.preset_list.len() {
                    app.selected_preset_index += 1;
                }
            }
            KeyCode::Enter | KeyCode::Char('l') => {
                app.load_preset();
            }
            _ => {}
        },
        _ => {}
    }
}

// Event loop separated so terminal is always restored on error
fn run_app(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
) -> Result<(), Box<dyn std::error::Error>> {
    let tick_rate = Duration::from_millis(50);
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| ui::draw(f, app))?;

        let timeout = tick_rate.saturating_sub(last_tick.elapsed());
        if crossterm::event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                // Only handle key press events (fixes duplicate events on Windows)
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                // Help modal intercepts all keys
                if app.show_help {
                    match key.code {
                        KeyCode::Esc | KeyCode::Char('?') | KeyCode::Char('q') => {
                            app.show_help = false;
                        }
                        _ => {}
                    }
                    continue;
                }

                // Truly global shortcuts (always active, even on editing tabs)
                match (key.code, key.modifiers) {
                    (KeyCode::Char('c'), KeyModifiers::CONTROL) | (KeyCode::Char('q'), _) => {
                        return Ok(())
                    }
                    (KeyCode::Esc, _) => return Ok(()),
                    // Tab/BackTab are always global for tab navigation
                    (KeyCode::Tab, KeyModifiers::NONE) => {
                        app.next_tab();
                        continue;
                    }
                    (KeyCode::BackTab, _) => {
                        app.prev_tab();
                        continue;
                    }
                    _ => {}
                }

                // On text-editing tabs, route char keys to the editor first
                // so letters/digits can be typed instead of triggering shortcuts
                let is_editing = matches!(app.active_tab, Tab::LiveMatcher | Tab::BraceStudio);

                // Left/Right for tab nav only on non-editing tabs
                if !is_editing {
                    match key.code {
                        KeyCode::Right => {
                            app.next_tab();
                            continue;
                        }
                        KeyCode::Left => {
                            app.prev_tab();
                            continue;
                        }
                        _ => {}
                    }
                }

                if is_editing {
                    match app.active_tab {
                        Tab::LiveMatcher => handle_live_matcher_key(app, key.code),
                        Tab::BraceStudio => handle_brace_editor_key(app, key.code),
                        _ => {}
                    }
                } else {
                    // Non-editing tabs: global character shortcuts are safe
                    handle_global_shortcuts(app, key.code);
                    handle_nav_tab_key(app, key.code);
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            app.tick();
            last_tick = Instant::now();
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    install_panic_hook();

    let mut terminal = setup_terminal()?;
    let mut app = App::new();

    let result = run_app(&mut terminal, &mut app);

    // Always restore terminal, even on error
    restore_terminal(&mut terminal)?;
    println!("Thank you for exploring picomatch-rust TUI! \u{1f980}\u{26a1}");
    result
}
