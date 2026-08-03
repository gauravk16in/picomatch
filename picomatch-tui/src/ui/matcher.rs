use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Row, Table, Wrap},
    Frame,
};

use crate::app::App;

pub fn render_matcher_tab(f: &mut Frame, app: &mut App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5), // Input & Options bar
            Constraint::Min(10),   // Matcher split (Table & Regex Box)
            Constraint::Length(3), // Quick Stats Footer
        ])
        .split(area);

    // 1. Input & Options Bar
    let input_options_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(55), Constraint::Percentage(45)])
        .split(chunks[0]);

    // Input Block
    let input_block = Block::default()
        .title(Span::styled(
            " 🎯 Enter Glob Pattern ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.active_border_style());

    let input_text = vec![
        Line::from(vec![
            Span::styled(
                "Pattern: ",
                Style::default()
                    .fg(app.theme.primary)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                &app.pattern_input,
                Style::default()
                    .fg(app.theme.text)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled("█", Style::default().fg(app.theme.accent)),
        ]),
        Line::from(vec![
            Span::styled(
                "Type to match in real-time | ",
                Style::default().fg(app.theme.muted),
            ),
            Span::styled(
                "Active Candidates: ",
                Style::default().fg(app.theme.secondary),
            ),
            Span::styled(
                format!("{}", app.candidate_paths.len()),
                Style::default().fg(app.theme.accent),
            ),
        ]),
    ];
    let input_p = Paragraph::new(input_text).block(input_block);
    f.render_widget(input_p, input_options_chunks[0]);

    // Options Checkbox Grid
    let opts_block = Block::default()
        .title(Span::styled(
            " ⚙️ Compiler Options [←/→/Space] ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let opt_style = |idx: usize, val: bool| {
        let is_selected = idx == app.active_option_index;
        let mut s = if val {
            Style::default()
                .fg(app.theme.success)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(app.theme.muted)
        };
        if is_selected {
            s = s.bg(app.theme.surface).add_modifier(Modifier::UNDERLINED);
        }
        s
    };

    let opt_checkbox = |name: &str, val: bool| {
        if val {
            format!("[✓] {name}  ")
        } else {
            format!("[ ] {name}  ")
        }
    };

    let opts_line1 = Line::from(vec![
        Span::styled(
            opt_checkbox("nocase", app.options.nocase),
            opt_style(0, app.options.nocase),
        ),
        Span::styled(
            opt_checkbox("dot", app.options.dot),
            opt_style(1, app.options.dot),
        ),
        Span::styled(
            opt_checkbox("bash", app.options.bash),
            opt_style(2, app.options.bash),
        ),
        Span::styled(
            opt_checkbox("nonegate", app.options.nonegate),
            opt_style(3, app.options.nonegate),
        ),
    ]);
    let opts_line2 = Line::from(vec![
        Span::styled(
            opt_checkbox("noextglob", app.options.noextglob),
            opt_style(4, app.options.noextglob),
        ),
        Span::styled(
            opt_checkbox("contains", app.options.contains),
            opt_style(5, app.options.contains),
        ),
        Span::styled(
            opt_checkbox("windows", app.options.windows),
            opt_style(6, app.options.windows),
        ),
    ]);

    let opts_p = Paragraph::new(vec![opts_line1, opts_line2]).block(opts_block);
    f.render_widget(opts_p, input_options_chunks[1]);

    // 2. Evaluation Results
    let (parse_res, match_results) = app.evaluate_current_pattern();

    let main_body_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(62), Constraint::Percentage(38)])
        .split(chunks[1]);

    // Left: Match Results Table
    let table_block = Block::default()
        .title(Span::styled(
            " 📄 Candidate File Matches [↑/↓ to scroll] ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let mut rows = Vec::new();
    let mut match_count = 0;
    let mut total_nanos: u128 = 0;

    for (idx, res) in match_results.iter().enumerate() {
        if res.is_match {
            match_count += 1;
        }
        total_nanos += res.nanos;

        let status_badge = if res.is_match {
            Span::styled(" MATCH ", app.theme.match_badge())
        } else {
            Span::styled(" MISS  ", app.theme.mismatch_badge())
        };

        let path_style = if res.is_match {
            Style::default()
                .fg(app.theme.text)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(app.theme.muted)
        };

        let is_selected = idx == app.selected_path_index;
        let mut row_style = Style::default();
        if is_selected {
            row_style = row_style.bg(app.theme.surface);
        }

        let micros = res.nanos as f64 / 1000.0;
        let time_str = format!("{micros:.2} µs");

        rows.push(
            Row::new(vec![
                status_badge,
                Span::styled(&res.path, path_style),
                Span::styled(time_str, Style::default().fg(app.theme.accent)),
            ])
            .style(row_style),
        );
    }

    let header_row = Row::new(vec![
        Span::styled(
            "STATUS",
            Style::default()
                .fg(app.theme.primary)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "PATH",
            Style::default()
                .fg(app.theme.primary)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "LATENCY",
            Style::default()
                .fg(app.theme.primary)
                .add_modifier(Modifier::BOLD),
        ),
    ])
    .bottom_margin(1);

    let table = Table::new(
        rows,
        [
            Constraint::Length(8),
            Constraint::Min(25),
            Constraint::Length(12),
        ],
    )
    .header(header_row)
    .block(table_block);

    f.render_widget(table, main_body_chunks[0]);

    // Right: Compiled Regex Preview & AST State
    let right_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(55), Constraint::Percentage(45)])
        .split(main_body_chunks[1]);

    // Compiled Regex Box
    let regex_block = Block::default()
        .title(Span::styled(
            " 🔬 Compiled JS-Regex Output ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let regex_content = match &parse_res {
        Ok(parsed) => {
            let regex_str = String::from_utf16_lossy(&parsed.output);
            vec![
                Line::from(vec![
                    Span::styled("Engine: ", Style::default().fg(app.theme.muted)),
                    Span::styled(
                        "regress (ECMAScript UTF-16)",
                        Style::default().fg(app.theme.primary),
                    ),
                ]),
                Line::from(""),
                Line::from(vec![Span::styled(
                    "Regex Source: ",
                    Style::default().fg(app.theme.secondary),
                )]),
                Line::from(vec![Span::styled(
                    regex_str,
                    Style::default()
                        .fg(app.theme.accent)
                        .add_modifier(Modifier::BOLD),
                )]),
                Line::from(""),
                Line::from(vec![
                    Span::styled("Consumed Units: ", Style::default().fg(app.theme.muted)),
                    Span::styled(
                        format!("{:?}", String::from_utf16_lossy(&parsed.consumed)),
                        Style::default().fg(app.theme.text),
                    ),
                    Span::styled(" | Backtrack: ", Style::default().fg(app.theme.muted)),
                    Span::styled(
                        format!("{}", parsed.backtrack),
                        Style::default().fg(app.theme.text),
                    ),
                ]),
            ]
        }
        Err(err) => vec![
            Line::from(vec![Span::styled(
                "Syntax/Parse Error: ",
                Style::default()
                    .fg(app.theme.error)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(vec![Span::styled(err, Style::default().fg(app.theme.text))]),
        ],
    };

    let regex_p = Paragraph::new(regex_content)
        .block(regex_block)
        .wrap(Wrap { trim: false });
    f.render_widget(regex_p, right_chunks[0]);

    // AST Quick Features Box
    let state_block = Block::default()
        .title(Span::styled(
            " 📊 Pattern State Flags ",
            app.theme.block_title_style(),
        ))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let state_lines = match &parse_res {
        Ok(p) => vec![
            Line::from(vec![
                Span::styled("Prefix: ", Style::default().fg(app.theme.secondary)),
                Span::styled(
                    format!("{:?}", p.prefix),
                    Style::default().fg(app.theme.text),
                ),
            ]),
            Line::from(vec![
                Span::styled("Negated: ", Style::default().fg(app.theme.muted)),
                Span::styled(
                    format!("{}", p.negated),
                    if p.negated {
                        Style::default().fg(app.theme.warning)
                    } else {
                        Style::default().fg(app.theme.text)
                    },
                ),
                Span::styled(" | Globstar: ", Style::default().fg(app.theme.muted)),
                Span::styled(
                    format!("{}", p.globstar),
                    if p.globstar {
                        Style::default().fg(app.theme.accent)
                    } else {
                        Style::default().fg(app.theme.text)
                    },
                ),
            ]),
            Line::from(vec![
                Span::styled("Braces Depth: ", Style::default().fg(app.theme.muted)),
                Span::styled(format!("{}", p.braces), Style::default().fg(app.theme.text)),
                Span::styled(" | Brackets: ", Style::default().fg(app.theme.muted)),
                Span::styled(
                    format!("{}", p.brackets),
                    Style::default().fg(app.theme.text),
                ),
            ]),
            Line::from(vec![
                Span::styled("Parens Depth: ", Style::default().fg(app.theme.muted)),
                Span::styled(format!("{}", p.parens), Style::default().fg(app.theme.text)),
                Span::styled(" | Neg Extglob: ", Style::default().fg(app.theme.muted)),
                Span::styled(
                    format!("{}", p.negated_extglob),
                    Style::default().fg(app.theme.success),
                ),
            ]),
        ],
        Err(_) => vec![Line::from(Span::styled(
            "No AST metrics available",
            Style::default().fg(app.theme.muted),
        ))],
    };

    let state_p = Paragraph::new(state_lines).block(state_block);
    f.render_widget(state_p, right_chunks[1]);

    // 3. Quick Stats Footer
    let stats_block = Block::default()
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let avg_micros = if match_results.is_empty() {
        0.0
    } else {
        (total_nanos as f64 / match_results.len() as f64) / 1000.0
    };

    let footer_line = Line::from(vec![
        Span::styled(
            " Summary: ",
            Style::default()
                .fg(app.theme.primary)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(format!("{match_count} Matches"), app.theme.match_badge()),
        Span::raw("  "),
        Span::styled(
            format!("{} Misses", match_results.len() - match_count),
            app.theme.mismatch_badge(),
        ),
        Span::raw("  │  "),
        Span::styled(
            "Avg Evaluation Time: ",
            Style::default().fg(app.theme.muted),
        ),
        Span::styled(
            format!("{avg_micros:.3} µs / path"),
            Style::default()
                .fg(app.theme.accent)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  │  "),
        Span::styled("Status: ", Style::default().fg(app.theme.muted)),
        Span::styled(&app.status_message, Style::default().fg(app.theme.text)),
    ]);

    let footer_p = Paragraph::new(footer_line).block(stats_block);
    f.render_widget(footer_p, chunks[2]);
}
