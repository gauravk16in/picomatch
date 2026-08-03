use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};

use crate::app::App;

pub fn expand_braces_demo(pattern: &str) -> Vec<String> {
    // Simple demo expansion for common patterns like {a,b} and {1..5}
    if let (Some(start), Some(end)) = (pattern.find('{'), pattern.find('}')) {
        let prefix = &pattern[..start];
        let suffix = &pattern[end + 1..];
        let inner = &pattern[start + 1..end];

        if let Some((a, b)) = inner.split_once("..") {
            if let (Ok(start_num), Ok(end_num)) = (a.parse::<i32>(), b.parse::<i32>()) {
                let step = if start_num <= end_num { 1 } else { -1 };
                let mut results = Vec::new();
                let mut current = start_num;
                loop {
                    results.push(format!("{prefix}{current}{suffix}"));
                    if current == end_num {
                        break;
                    }
                    current += step;
                }
                return results;
            }
        }

        let options: Vec<&str> = inner.split(',').collect();
        let mut results = Vec::new();
        for opt in options {
            let expanded_sub = format!("{prefix}{opt}{suffix}");
            let sub_expanded = expand_braces_demo(&expanded_sub);
            results.extend(sub_expanded);
        }
        results
    } else {
        vec![pattern.to_string()]
    }
}

pub fn render_braces_tab(f: &mut Frame, app: &mut App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5), // Input & Control Box
            Constraint::Min(10),   // Expansion List (Left) & Extglob Syntax Guide (Right)
        ])
        .split(area);

    // 1. Input Box
    let input_block = Block::default()
        .title(Span::styled(" ⚡ Brace & Extglob Expansion Studio ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.active_border_style());

    let input_lines = vec![
        Line::from(vec![
            Span::styled("Brace Expression: ", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
            Span::styled(&app.brace_input, Style::default().fg(app.theme.text).add_modifier(Modifier::BOLD)),
            Span::styled("█", Style::default().fg(app.theme.accent)),
        ]),
        Line::from(vec![
            Span::styled("Examples: ", Style::default().fg(app.theme.muted)),
            Span::styled("{a,b,{1..3}}  |  src/{core,exec}/*.rs  |  c{0..5}_test.rs", Style::default().fg(app.theme.secondary)),
        ]),
    ];

    let input_p = Paragraph::new(input_lines).block(input_block);
    f.render_widget(input_p, chunks[0]);

    // 2. Main Content Split
    let content_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(55), Constraint::Percentage(45)])
        .split(chunks[1]);

    // Left: Expansion Outputs List
    let expanded_list = expand_braces_demo(&app.brace_input);

    let list_block = Block::default()
        .title(Span::styled(format!(" 📦 Expanded Patterns ({}) ", expanded_list.len()), app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let list_items: Vec<ListItem> = expanded_list
        .iter()
        .enumerate()
        .map(|(idx, exp)| {
            let line = Line::from(vec![
                Span::styled(format!(" {:02}. ", idx + 1), Style::default().fg(app.theme.muted)),
                Span::styled(exp, Style::default().fg(app.theme.accent).add_modifier(Modifier::BOLD)),
            ]);
            ListItem::new(line)
        })
        .collect();

    let list_w = List::new(list_items).block(list_block);
    f.render_widget(list_w, content_chunks[0]);

    // Right: Extglob & Brace Reference Card
    let guide_block = Block::default()
        .title(Span::styled(" 📚 Extglob & Brace Pattern Guide ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let guide_text = vec![
        Line::from(vec![
            Span::styled("Picomatch Extglob Syntax Rules:", Style::default().fg(app.theme.secondary).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(" @(pattern) ", app.theme.match_badge()),
            Span::styled(" Matches EXACTLY ONE of given patterns", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" !(pattern) ", app.theme.mismatch_badge()),
            Span::styled(" Matches ANYTHING EXCEPT given patterns", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" ?(pattern) ", Style::default().fg(app.theme.background).bg(app.theme.warning).add_modifier(Modifier::BOLD)),
            Span::styled(" Matches ZERO OR ONE of given patterns", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" *(pattern) ", Style::default().fg(app.theme.background).bg(app.theme.primary).add_modifier(Modifier::BOLD)),
            Span::styled(" Matches ZERO OR MORE of given patterns", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" +(pattern) ", Style::default().fg(app.theme.background).bg(app.theme.accent).add_modifier(Modifier::BOLD)),
            Span::styled(" Matches ONE OR MORE of given patterns", Style::default().fg(app.theme.text)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Brace Sequences:", Style::default().fg(app.theme.secondary).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(vec![
            Span::styled(" {a..z} ", Style::default().fg(app.theme.primary)),
            Span::styled(" Character sequence ranges", Style::default().fg(app.theme.text)),
        ]),
        Line::from(vec![
            Span::styled(" {1..100} ", Style::default().fg(app.theme.accent)),
            Span::styled(" Numeric sequence ranges", Style::default().fg(app.theme.text)),
        ]),
    ];

    let guide_p = Paragraph::new(guide_text)
        .block(guide_block)
        .wrap(Wrap { trim: false });
    f.render_widget(guide_p, content_chunks[1]);
}
