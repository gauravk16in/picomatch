use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use pmx_exec::ExecFlags;

use crate::app::App;

pub fn render_tree_tab(f: &mut Frame, app: &mut App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Tree Header & Active Filter Pattern
            Constraint::Min(10),   // Split (Tree list left, File detail inspector right)
        ])
        .split(area);

    // 1. Header Bar
    let header_block = Block::default()
        .title(Span::styled(
            " 🌳 Interactive Workspace Directory Explorer ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let pmx_opts = app.options.to_pmx_options();
    let regex_res = pmx_core::parse(&app.pattern_input, &pmx_opts);

    let header_line = Line::from(vec![
        Span::styled(
            " Active Filter Glob: ",
            Style::default().fg(app.theme.muted),
        ),
        Span::styled(
            &app.pattern_input,
            Style::default()
                .fg(app.theme.primary)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  │  "),
        Span::styled(
            "Press 't' to change theme | Use ↑/↓ to navigate files",
            Style::default().fg(app.theme.muted),
        ),
    ]);
    let header_p = Paragraph::new(header_line).block(header_block);
    f.render_widget(header_p, chunks[0]);

    // 2. Tree & Detail Split
    let body_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(55), Constraint::Percentage(45)])
        .split(chunks[1]);

    // Left: File Tree List
    let tree_block = Block::default()
        .title(Span::styled(
            " 📁 Workspace Directory Structure ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.active_border_style());

    let flags = ExecFlags {
        nocase: app.options.nocase,
    };
    let regex_source = regex_res.as_ref().map(|p| p.output.clone()).ok();

    let mut list_items = Vec::new();
    let mut total_files = 0;
    let mut matched_files = 0;

    for (idx, path) in app.tree_paths.iter().enumerate() {
        total_files += 1;

        let is_matched = if let Some(ref src) = regex_source {
            let input_units: Vec<u16> = path.encode_utf16().collect();
            pmx_exec::is_match(src, &input_units, flags).unwrap_or(false)
        } else {
            false
        };

        if is_matched {
            matched_files += 1;
        }

        let icon = match () {
            _ if path.ends_with(".rs") => "🦀 ",
            _ if path.ends_with(".toml") => "⚙️ ",
            _ if path.ends_with(".json") => "📋 ",
            _ if path.ends_with(".md") => "📝 ",
            _ if path.ends_with(".js") || path.ends_with(".ts") => "⚡ ",
            _ if path.ends_with(".sh") || path.ends_with(".py") => "🛠️ ",
            _ if path.starts_with(".") => "🔒 ",
            _ => "📄 ",
        };

        let badge = if is_matched {
            Span::styled(" [MATCH] ", app.theme.match_badge())
        } else {
            Span::styled(" [....] ", Style::default().fg(app.theme.muted))
        };

        let text_style = if is_matched {
            Style::default()
                .fg(app.theme.text)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(app.theme.muted)
        };

        let is_selected = idx == app.selected_path_index;
        let mut row_style = Style::default();
        if is_selected {
            row_style = row_style
                .bg(app.theme.surface)
                .add_modifier(Modifier::UNDERLINED);
        }

        let line = Line::from(vec![
            badge,
            Span::raw(" "),
            Span::styled(icon, Style::default()),
            Span::styled(path, text_style),
        ]);

        list_items.push(ListItem::new(line).style(row_style));
    }

    let tree_list = List::new(list_items).block(tree_block);
    f.render_widget(tree_list, body_chunks[0]);

    // Right: Selected File Inspector
    let detail_block = Block::default()
        .title(Span::styled(
            " 🔍 File & Glob Highlight Inspector ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let selected_path = app
        .tree_paths
        .get(app.selected_path_index)
        .cloned()
        .unwrap_or_else(|| "None".to_string());

    let is_selected_matched = if let Some(ref src) = regex_source {
        let input_units: Vec<u16> = selected_path.encode_utf16().collect();
        pmx_exec::is_match(src, &input_units, flags).unwrap_or(false)
    } else {
        false
    };

    let detail_lines = vec![
        Line::from(vec![
            Span::styled("Selected File: ", Style::default().fg(app.theme.secondary)),
            Span::styled(
                &selected_path,
                Style::default()
                    .fg(app.theme.primary)
                    .add_modifier(Modifier::BOLD),
            ),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Glob Filter Result: ", Style::default().fg(app.theme.muted)),
            if is_selected_matched {
                Span::styled(" PASSED MATCH FILTER ", app.theme.match_badge())
            } else {
                Span::styled(" EXCLUDED BY GLOB ", app.theme.mismatch_badge())
            },
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(
                "Workspace Tree Coverage: ",
                Style::default().fg(app.theme.muted),
            ),
            Span::styled(
                if total_files == 0 {
                    format!("{matched_files} / {total_files} files matched (0.0%)")
                } else {
                    format!(
                        "{matched_files} / {total_files} files matched ({:.1}%)",
                        (matched_files as f64 / total_files as f64) * 100.0
                    )
                },
                Style::default()
                    .fg(app.theme.accent)
                    .add_modifier(Modifier::BOLD),
            ),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Directory Depth: ", Style::default().fg(app.theme.muted)),
            Span::styled(
                format!("{}", selected_path.split('/').count()),
                Style::default().fg(app.theme.text),
            ),
            Span::styled(" levels", Style::default().fg(app.theme.muted)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Base Name: ", Style::default().fg(app.theme.muted)),
            Span::styled(
                selected_path.split('/').last().unwrap_or(""),
                Style::default().fg(app.theme.text),
            ),
        ]),
    ];

    let detail_p = Paragraph::new(detail_lines).block(detail_block);
    f.render_widget(detail_p, body_chunks[1]);
}
