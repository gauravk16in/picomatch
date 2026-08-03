use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Row, Table},
    Frame,
};

use crate::app::App;

pub fn render_ast_tab(f: &mut Frame, app: &mut App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5), // Scan State Banner
            Constraint::Min(10),   // Parse State & Token Stream split
        ])
        .split(area);

    let scan_state = app.evaluate_scan();

    // 1. Scan State Banner
    let scan_block = Block::default()
        .title(Span::styled(" 🔍 Scanner Output (`pmx_core::scan`) ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.active_border_style());

    let scan_lines = vec![
        Line::from(vec![
            Span::styled("Pattern Base: ", Style::default().fg(app.theme.muted)),
            Span::styled(format!("{:?}", scan_state.base), Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
            Span::styled("  │  Glob Part: ", Style::default().fg(app.theme.muted)),
            Span::styled(format!("{:?}", scan_state.glob), Style::default().fg(app.theme.accent).add_modifier(Modifier::BOLD)),
            Span::styled("  │  Prefix: ", Style::default().fg(app.theme.muted)),
            Span::styled(format!("{:?}", scan_state.prefix), Style::default().fg(app.theme.secondary)),
        ]),
        Line::from(vec![
            Span::styled("Flags: ", Style::default().fg(app.theme.muted)),
            Span::styled(format!("is_glob={} ", scan_state.is_glob), if scan_state.is_glob { Style::default().fg(app.theme.success) } else { Style::default().fg(app.theme.muted) }),
            Span::styled(format!("is_extglob={} ", scan_state.is_extglob), if scan_state.is_extglob { Style::default().fg(app.theme.warning) } else { Style::default().fg(app.theme.muted) }),
            Span::styled(format!("is_brace={} ", scan_state.is_brace), if scan_state.is_brace { Style::default().fg(app.theme.primary) } else { Style::default().fg(app.theme.muted) }),
            Span::styled(format!("is_bracket={} ", scan_state.is_bracket), if scan_state.is_bracket { Style::default().fg(app.theme.secondary) } else { Style::default().fg(app.theme.muted) }),
            Span::styled(format!("is_globstar={} ", scan_state.is_globstar), if scan_state.is_globstar { Style::default().fg(app.theme.accent) } else { Style::default().fg(app.theme.muted) }),
        ]),
    ];

    let scan_p = ratatui::widgets::Paragraph::new(scan_lines).block(scan_block);
    f.render_widget(scan_p, chunks[0]);

    // 2. Parse State & Tokens Split
    let main_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(40), Constraint::Percentage(60)])
        .split(chunks[1]);

    let pmx_opts = app.options.to_pmx_options();
    let parse_res = pmx_core::parse(&app.pattern_input, &pmx_opts);

    // Left: Parse State metrics
    let parse_block = Block::default()
        .title(Span::styled(" 📊 Parser State (`pmx_core::ParseState`) ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let state_rows = match &parse_res {
        Ok(p) => vec![
            Row::new(vec!["Input String".to_string(), p.input.clone()]),
            Row::new(vec!["Current Index".to_string(), format!("{}", p.index)]),
            Row::new(vec!["Start Pos".to_string(), format!("{}", p.start)]),
            Row::new(vec!["Dot Flag".to_string(), format!("{}", p.dot)]),
            Row::new(vec!["Consumed Units".to_string(), String::from_utf16_lossy(&p.consumed)]),
            Row::new(vec!["Backtrack Count".to_string(), format!("{}", p.backtrack)]),
            Row::new(vec!["Negated Flag".to_string(), format!("{}", p.negated)]),
            Row::new(vec!["Brackets Depth".to_string(), format!("{}", p.brackets)]),
            Row::new(vec!["Braces Depth".to_string(), format!("{}", p.braces)]),
            Row::new(vec!["Parens Depth".to_string(), format!("{}", p.parens)]),
            Row::new(vec!["Quotes Flag".to_string(), format!("{}", p.quotes)]),
            Row::new(vec!["Globstar Flag".to_string(), format!("{}", p.globstar)]),
            Row::new(vec!["Negated Extglob".to_string(), format!("{}", p.negated_extglob)]),
        ],
        Err(_) => vec![Row::new(vec!["Status".to_string(), "Parse Error".to_string()])],
    };

    let parse_table = Table::new(
        state_rows,
        [Constraint::Percentage(45), Constraint::Percentage(55)],
    )
    .header(Row::new(vec![
        Span::styled("PROPERTY", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        Span::styled("VALUE", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
    ]))
    .block(parse_block);

    f.render_widget(parse_table, main_chunks[0]);

    // Right: Token Stream Table
    let tokens_block = Block::default()
        .title(Span::styled(" 🔤 Parsed Token Stream ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let token_rows = match &parse_res {
        Ok(p) => p
            .tokens
            .iter()
            .enumerate()
            .map(|(idx, tok)| {
                let kind_str = tok.kind.to_js_str();
                let is_sel = idx == app.selected_token_index;
                let mut style = Style::default();
                if is_sel {
                    style = style.bg(app.theme.surface);
                }

                let val_str = String::from_utf16_lossy(&tok.value);
                let out_str = tok
                    .output
                    .as_ref()
                    .map(|o| String::from_utf16_lossy(o))
                    .unwrap_or_else(|| "<same>".to_string());

                Row::new(vec![
                    Span::styled(format!("{:02}", idx + 1), Style::default().fg(app.theme.muted)),
                    Span::styled(kind_str, Style::default().fg(app.theme.secondary).add_modifier(Modifier::BOLD)),
                    Span::styled(val_str, Style::default().fg(app.theme.accent)),
                    Span::styled(out_str, Style::default().fg(app.theme.text)),
                ])
                .style(style)
            })
            .collect(),
        Err(_) => vec![],
    };

    let token_table = Table::new(
        token_rows,
        [
            Constraint::Length(4),
            Constraint::Length(16),
            Constraint::Length(16),
            Constraint::Min(20),
        ],
    )
    .header(Row::new(vec![
        Span::styled("#", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        Span::styled("TOKEN KIND", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        Span::styled("VALUE", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        Span::styled("REGEX UNITS OUTPUT", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
    ]))
    .block(tokens_block);

    f.render_widget(token_table, main_chunks[1]);
}
