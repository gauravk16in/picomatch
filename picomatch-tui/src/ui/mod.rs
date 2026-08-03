pub mod ast;
pub mod benchmark;
pub mod braces;
pub mod matcher;
pub mod presets;
pub mod tree;

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Tabs, Wrap},
    Frame,
};

use crate::app::{App, Tab};

pub fn draw(f: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Top ASCII Header & Theme Status
            Constraint::Length(3), // Tab Bar
            Constraint::Min(12),   // Main Tab Content View
            Constraint::Length(2), // Bottom Keyboard Shortcuts Legend
        ])
        .split(f.area());

    // 1. Top Header Banner
    let header_block = Block::default()
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let header_title = Line::from(vec![
        Span::styled(" ⚡ PICOMATCH RUST v0.1.0 ", app.theme.title_style()),
        Span::styled(
            " │ High-Performance ECMAScript Glob Engine ",
            Style::default().fg(app.theme.text),
        ),
        Span::styled(" │ Theme: ", Style::default().fg(app.theme.muted)),
        Span::styled(
            app.theme.kind.name(),
            Style::default()
                .fg(app.theme.accent)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            " [Press 't' to change] ",
            Style::default().fg(app.theme.muted),
        ),
    ]);

    let header_p = Paragraph::new(header_title).block(header_block);
    f.render_widget(header_p, chunks[0]);

    // 2. Tab Navigation Bar
    let tab_titles: Vec<Line> = Tab::ALL
        .iter()
        .map(|t| {
            Line::from(vec![
                Span::styled(
                    format!("[{}] ", t.shortcut()),
                    Style::default().fg(app.theme.accent),
                ),
                Span::raw(t.title()),
            ])
        })
        .collect();

    let tab_index = Tab::ALL
        .iter()
        .position(|t| *t == app.active_tab)
        .unwrap_or(0);

    let tabs = Tabs::new(tab_titles)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(app.theme.border_style()),
        )
        .select(tab_index)
        .style(app.theme.inactive_tab_style())
        .highlight_style(app.theme.active_tab_style());

    f.render_widget(tabs, chunks[1]);

    // 3. Render Active Tab View
    match app.active_tab {
        Tab::LiveMatcher => matcher::render_matcher_tab(f, app, chunks[2]),
        Tab::FileExplorer => tree::render_tree_tab(f, app, chunks[2]),
        Tab::BraceStudio => braces::render_braces_tab(f, app, chunks[2]),
        Tab::AstInspector => ast::render_ast_tab(f, app, chunks[2]),
        Tab::BenchmarkArena => benchmark::render_benchmark_tab(f, app, chunks[2]),
        Tab::Presets => presets::render_presets_tab(f, app, chunks[2]),
    }

    // 4. Bottom Keyboard Shortcuts Legend
    let legend_line = Line::from(vec![
        Span::styled(
            " Shortcuts: ",
            Style::default()
                .fg(app.theme.primary)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled("1-6", Style::default().fg(app.theme.accent)),
        Span::styled(" Switch Tab  │  ", Style::default().fg(app.theme.muted)),
        Span::styled("Tab/Shift+Tab", Style::default().fg(app.theme.accent)),
        Span::styled(" Nav  │  ", Style::default().fg(app.theme.muted)),
        Span::styled("t", Style::default().fg(app.theme.accent)),
        Span::styled(" Cycle Theme  │  ", Style::default().fg(app.theme.muted)),
        Span::styled("b", Style::default().fg(app.theme.accent)),
        Span::styled(
            " Toggle Benchmark  │  ",
            Style::default().fg(app.theme.muted),
        ),
        Span::styled("?", Style::default().fg(app.theme.accent)),
        Span::styled(" Help Overlay  │  ", Style::default().fg(app.theme.muted)),
        Span::styled("q / Esc", Style::default().fg(app.theme.error)),
        Span::styled(" Quit", Style::default().fg(app.theme.muted)),
    ]);

    let legend_p = Paragraph::new(legend_line);
    f.render_widget(legend_p, chunks[3]);

    // 5. Render Help Modal overlay if requested
    if app.show_help {
        render_help_modal(f, app, f.area());
    }
}

fn render_help_modal(f: &mut Frame, app: &App, area: Rect) {
    let popup_area = Rect {
        x: area.width / 6,
        y: area.height / 6,
        width: (area.width * 2) / 3,
        height: (area.height * 2) / 3,
    };

    f.render_widget(Clear, popup_area);

    let modal_block = Block::default()
        .title(Span::styled(
            " ❓ Picomatch TUI Help & Keybindings [Press Esc/? to Close] ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.active_border_style());

    let help_text = vec![
        Line::from(vec![Span::styled(
            "Navigation Controls:",
            Style::default()
                .fg(app.theme.secondary)
                .add_modifier(Modifier::BOLD),
        )]),
        Line::from("  • 1 - 6 or Left/Right Arrows : Switch active feature tab"),
        Line::from("  • Tab / Shift+Tab           : Cycle through interactive controls"),
        Line::from("  • Up / Down Arrows          : Navigate candidate list / preset selection"),
        Line::from("  • Enter                     : Load selected preset into Live Matcher"),
        Line::from("  • Space                     : Toggle option checkbox or benchmark runner"),
        Line::from("  • t                         : Cycle between 4 decorative color themes"),
        Line::from("  • q / Esc                   : Exit application"),
        Line::from(""),
        Line::from(vec![Span::styled(
            "Library Overview (`picomatch-rust`):",
            Style::default()
                .fg(app.theme.secondary)
                .add_modifier(Modifier::BOLD),
        )]),
        Line::from("  • pmx-core  : Pure-Rust state machine compiler for glob patterns"),
        Line::from("  • pmx-exec  : ECMAScript UTF-16 regex execution layer using regress"),
        Line::from("  • pmx-cli   : Subprocess & napi-rs transport adapter layer"),
    ];

    let help_p = Paragraph::new(help_text)
        .block(modal_block)
        .wrap(Wrap { trim: false });

    f.render_widget(help_p, popup_area);
}
