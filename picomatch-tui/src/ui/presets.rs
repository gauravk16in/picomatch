use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Row, Table, Wrap},
    Frame,
};

use crate::app::App;

pub fn render_presets_tab(f: &mut Frame, app: &mut App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(55), Constraint::Percentage(45)])
        .split(area);

    // Left: Presets Gallery Table
    let table_block = Block::default()
        .title(Span::styled(" 🎨 Preset Glob Gallery [Press ENTER to load into Live Matcher] ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.active_border_style());

    let rows: Vec<Row> = app
        .preset_list
        .iter()
        .enumerate()
        .map(|(idx, preset)| {
            let is_sel = idx == app.selected_preset_index;
            let mut style = Style::default();
            if is_sel {
                style = style.bg(app.theme.surface).add_modifier(Modifier::BOLD);
            }

            Row::new(vec![
                Span::styled(preset.category, Style::default().fg(app.theme.secondary)),
                Span::styled(preset.name, Style::default().fg(app.theme.primary)),
                Span::styled(preset.glob, Style::default().fg(app.theme.accent)),
            ])
            .style(style)
        })
        .collect();

    let table = Table::new(
        rows,
        [
            Constraint::Length(18),
            Constraint::Length(22),
            Constraint::Min(25),
        ],
    )
    .header(Row::new(vec![
        Span::styled("CATEGORY", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        Span::styled("NAME", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        Span::styled("GLOB PATTERN", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
    ]))
    .block(table_block);

    f.render_widget(table, chunks[0]);

    // Right: Glob Syntax Cheat Sheet
    let cheatsheet_block = Block::default()
        .title(Span::styled(" 📖 Picomatch Glob Cheat Sheet ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let sel_preset = app.preset_list.get(app.selected_preset_index);
    let desc_text = sel_preset
        .map(|p| format!("Selected Preset Info: {}\nGlob: {}\n\n{}", p.name, p.glob, p.description))
        .unwrap_or_default();

    let lines = vec![
        Line::from(vec![
            Span::styled("Preset Details:", Style::default().fg(app.theme.secondary).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(vec![
            Span::styled(desc_text, Style::default().fg(app.theme.text)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("───────────────────────────────────────", Style::default().fg(app.theme.muted)),
        ]),
        Line::from(vec![
            Span::styled("Glob Syntax Quick Reference:", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(" * ", app.theme.match_badge()),
            Span::styled(" Matches any number of characters except slash /", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" ** ", app.theme.match_badge()),
            Span::styled(" Matches any number of characters INCLUDING slash /", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" ? ", Style::default().fg(app.theme.background).bg(app.theme.accent).add_modifier(Modifier::BOLD)),
            Span::styled(" Matches single character except slash", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" [a-z] ", Style::default().fg(app.theme.background).bg(app.theme.warning).add_modifier(Modifier::BOLD)),
            Span::styled(" Character class matching", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" {a,b} ", Style::default().fg(app.theme.background).bg(app.theme.secondary).add_modifier(Modifier::BOLD)),
            Span::styled(" Brace expansion set", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" !pattern ", app.theme.mismatch_badge()),
            Span::styled(" Negated pattern match", Style::default().fg(app.theme.text)),
        ]),
    ];

    let cheat_p = Paragraph::new(lines)
        .block(cheatsheet_block)
        .wrap(Wrap { trim: false });
    f.render_widget(cheat_p, chunks[1]);
}
