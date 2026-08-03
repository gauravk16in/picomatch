#![forbid(unsafe_code)]

mod app;
mod theme;
mod ui;

use std::{
    io,
    panic,
    time::{Duration, Instant},
};

use crossterm::{
    event::{self, Event, KeyCode, KeyModifiers},
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

fn main() -> Result<(), Box<dyn std::error::Error>> {
    install_panic_hook();

    let mut terminal = setup_terminal()?;
    let mut app = App::new();

    let tick_rate = Duration::from_millis(50);
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| ui::draw(f, &mut app))?;

        let timeout = tick_rate.saturating_sub(last_tick.elapsed());
        if crossterm::event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                // If help modal is active, Esc / '?' closes it
                if app.show_help {
                    match key.code {
                        KeyCode::Esc | KeyCode::Char('?') | KeyCode::Char('q') => {
                            app.show_help = false;
                        }
                        _ => {}
                    }
                    continue;
                }

                match (key.code, key.modifiers) {
                    // Global quit shortcuts
                    (KeyCode::Char('c'), KeyModifiers::CONTROL) | (KeyCode::Char('q'), _) => {
                        break;
                    }
                    (KeyCode::Esc, _) => {
                        break;
                    }

                    // Help modal toggle
                    (KeyCode::Char('?'), _) | (KeyCode::Char('h'), _) => {
                        app.show_help = true;
                    }

                    // Theme switching
                    (KeyCode::Char('t'), _) => {
                        app.next_theme();
                    }

                    // Benchmark toggle
                    (KeyCode::Char('b'), _) => {
                        app.benchmark_stats.active = !app.benchmark_stats.active;
                        app.status_message = if app.benchmark_stats.active {
                            "Benchmark started!".to_string()
                        } else {
                            "Benchmark paused".to_string()
                        };
                    }

                    // Tab navigation
                    (KeyCode::Char('1'), _) => app.active_tab = Tab::LiveMatcher,
                    (KeyCode::Char('2'), _) => app.active_tab = Tab::FileExplorer,
                    (KeyCode::Char('3'), _) => app.active_tab = Tab::BraceStudio,
                    (KeyCode::Char('4'), _) => app.active_tab = Tab::AstInspector,
                    (KeyCode::Char('5'), _) => app.active_tab = Tab::BenchmarkArena,
                    (KeyCode::Char('6'), _) => app.active_tab = Tab::Presets,
                    (KeyCode::Right, _) | (KeyCode::Tab, KeyModifiers::NONE) => app.next_tab(),
                    (KeyCode::Left, _) | (KeyCode::BackTab, _) => app.prev_tab(),

                    // Tab specific key events
                    (code, _) => match app.active_tab {
                        Tab::LiveMatcher => match code {
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
                                app.pattern_input.insert(app.cursor_position, c);
                                app.cursor_position += 1;
                            }
                            KeyCode::Backspace => {
                                if app.cursor_position > 0 {
                                    app.cursor_position -= 1;
                                    app.pattern_input.remove(app.cursor_position);
                                }
                            }
                            _ => {}
                        },
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
                        Tab::BraceStudio => match code {
                            KeyCode::Char(c) => {
                                app.brace_input.insert(app.brace_cursor, c);
                                app.brace_cursor += 1;
                            }
                            KeyCode::Backspace => {
                                if app.brace_cursor > 0 {
                                    app.brace_cursor -= 1;
                                    app.brace_input.remove(app.brace_cursor);
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
                                app.selected_token_index += 1;
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
                    },
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            app.tick();
            last_tick = Instant::now();
        }
    }

    restore_terminal(&mut terminal)?;
    println!("Thank you for exploring picomatch-rust TUI! 🦀⚡");
    Ok(())
}
