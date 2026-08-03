use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};

use crate::app::App;

const MAX_EXPANSION: usize = 200;

/// Find the index of the matching closing brace, handling nesting.
fn find_matching_close(s: &str, open: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 0usize;
    for (i, &byte) in bytes.iter().enumerate().skip(open) {
        match byte {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

pub fn expand_braces_demo(pattern: &str) -> (Vec<String>, bool) {
    let results = expand_braces_limited(pattern, MAX_EXPANSION);
    let truncated = results.len() >= MAX_EXPANSION;
    (results, truncated)
}

fn expand_braces_limited(pattern: &str, limit: usize) -> Vec<String> {
    if limit == 0 {
        return vec![pattern.to_string()];
    }

    if let Some(start) = pattern.find('{') {
        if let Some(end) = find_matching_close(pattern, start) {
            let prefix = &pattern[..start];
            let suffix = &pattern[end + 1..];
            let inner = &pattern[start + 1..end];

            // Try numeric range: {1..5} or {01..05}
            if let Some((a, b)) = inner.split_once("..") {
                if let (Ok(start_num), Ok(end_num)) = (a.parse::<i32>(), b.parse::<i32>()) {
                    // Determine zero-padding width from the wider bound string
                    let pad_width = a.len().max(b.len());
                    let needs_pad =
                        a.len() > 1 && a.starts_with('0') || b.len() > 1 && b.starts_with('0');
                    let step = if start_num <= end_num { 1 } else { -1 };
                    let mut results = Vec::new();
                    let mut current = start_num;
                    loop {
                        if needs_pad {
                            results.push(format!(
                                "{prefix}{:0width$}{suffix}",
                                current,
                                width = pad_width
                            ));
                        } else {
                            results.push(format!("{prefix}{current}{suffix}"));
                        }
                        if results.len() >= limit {
                            break;
                        }
                        if current == end_num {
                            break;
                        }
                        current += step;
                    }
                    return results;
                }

                // Try character range: {a..z}
                let a_chars: Vec<char> = a.chars().collect();
                let b_chars: Vec<char> = b.chars().collect();
                if a_chars.len() == 1 && b_chars.len() == 1 {
                    let start_ch = a_chars[0] as u32;
                    let end_ch = b_chars[0] as u32;
                    let step: i64 = if start_ch <= end_ch { 1 } else { -1 };
                    let mut results = Vec::new();
                    let mut current = start_ch as i64;
                    loop {
                        if let Some(ch) = char::from_u32(current as u32) {
                            results.push(format!("{prefix}{ch}{suffix}"));
                        }
                        if results.len() >= limit {
                            break;
                        }
                        if current == end_ch as i64 {
                            break;
                        }
                        current += step;
                    }
                    return results;
                }
            }

            // Comma-separated: {a,b,c}
            let options: Vec<&str> = inner.split(',').collect();
            let mut results = Vec::new();
            for opt in options {
                if results.len() >= limit {
                    break;
                }
                let expanded_sub = format!("{prefix}{opt}{suffix}");
                let budget = limit.saturating_sub(results.len());
                let sub_expanded = expand_braces_limited(&expanded_sub, budget);
                results.extend(sub_expanded);
            }
            results
        } else {
            vec![pattern.to_string()]
        }
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
        .title(Span::styled(
            " ⚡ Brace & Extglob Expansion Studio ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.active_border_style());

    let input_lines = vec![
        Line::from(vec![
            Span::styled(
                "Brace Expression: ",
                Style::default()
                    .fg(app.theme.primary)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                &app.brace_input,
                Style::default()
                    .fg(app.theme.text)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled("█", Style::default().fg(app.theme.accent)),
        ]),
        Line::from(vec![
            Span::styled("Examples: ", Style::default().fg(app.theme.muted)),
            Span::styled(
                "{a,b,{1..3}}  |  src/{core,exec}/*.rs  |  c{0..5}_test.rs",
                Style::default().fg(app.theme.secondary),
            ),
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
    let (expanded_list, truncated) = expand_braces_demo(&app.brace_input);

    let title = if truncated {
        format!(
            " 📦 Expanded Patterns ({}) [TRUNCATED at {}] ",
            expanded_list.len(),
            MAX_EXPANSION
        )
    } else {
        format!(" 📦 Expanded Patterns ({}) ", expanded_list.len())
    };

    let list_block = Block::default()
        .title(Span::styled(title, app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let list_items: Vec<ListItem> = expanded_list
        .iter()
        .enumerate()
        .map(|(idx, exp)| {
            let line = Line::from(vec![
                Span::styled(
                    format!(" {:02}. ", idx + 1),
                    Style::default().fg(app.theme.muted),
                ),
                Span::styled(
                    exp,
                    Style::default()
                        .fg(app.theme.accent)
                        .add_modifier(Modifier::BOLD),
                ),
            ]);
            ListItem::new(line)
        })
        .collect();

    let list_w = List::new(list_items).block(list_block);
    f.render_widget(list_w, content_chunks[0]);

    // Right: Extglob & Brace Reference Card
    let guide_block = Block::default()
        .title(Span::styled(
            " 📚 Extglob & Brace Pattern Guide ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let guide_text = vec![
        Line::from(vec![Span::styled(
            "Picomatch Extglob Syntax Rules:",
            Style::default()
                .fg(app.theme.secondary)
                .add_modifier(Modifier::BOLD),
        )]),
        Line::from(""),
        Line::from(vec![
            Span::styled(" @(pattern) ", app.theme.match_badge()),
            Span::styled(
                " Matches EXACTLY ONE of given patterns",
                Style::default().fg(app.theme.text),
            ),
        ]),
        Line::from(vec![
            Span::styled(" !(pattern) ", app.theme.mismatch_badge()),
            Span::styled(
                " Matches ANYTHING EXCEPT given patterns",
                Style::default().fg(app.theme.text),
            ),
        ]),
        Line::from(vec![
            Span::styled(
                " ?(pattern) ",
                Style::default()
                    .fg(app.theme.background)
                    .bg(app.theme.warning)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                " Matches ZERO OR ONE of given patterns",
                Style::default().fg(app.theme.text),
            ),
        ]),
        Line::from(vec![
            Span::styled(
                " *(pattern) ",
                Style::default()
                    .fg(app.theme.background)
                    .bg(app.theme.primary)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                " Matches ZERO OR MORE of given patterns",
                Style::default().fg(app.theme.text),
            ),
        ]),
        Line::from(vec![
            Span::styled(
                " +(pattern) ",
                Style::default()
                    .fg(app.theme.background)
                    .bg(app.theme.accent)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                " Matches ONE OR MORE of given patterns",
                Style::default().fg(app.theme.text),
            ),
        ]),
        Line::from(""),
        Line::from(vec![Span::styled(
            "Brace Sequences:",
            Style::default()
                .fg(app.theme.secondary)
                .add_modifier(Modifier::BOLD),
        )]),
        Line::from(vec![
            Span::styled(" {a..z} ", Style::default().fg(app.theme.primary)),
            Span::styled(
                " Character sequence ranges",
                Style::default().fg(app.theme.text),
            ),
        ]),
        Line::from(vec![
            Span::styled(" {1..100} ", Style::default().fg(app.theme.accent)),
            Span::styled(
                " Numeric sequence ranges",
                Style::default().fg(app.theme.text),
            ),
        ]),
    ];

    let guide_p = Paragraph::new(guide_text)
        .block(guide_block)
        .wrap(Wrap { trim: false });
    f.render_widget(guide_p, content_chunks[1]);
}
