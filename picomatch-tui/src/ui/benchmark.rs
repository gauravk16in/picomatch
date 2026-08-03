use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Gauge, Paragraph, Sparkline},
    Frame,
};

use crate::app::App;

fn format_num(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let mut s = String::new();
    let mut count = 0;
    while n > 0 {
        if count > 0 && count % 3 == 0 {
            s.insert(0, ',');
        }
        s.insert(0, char::from_digit((n % 10) as u32, 10).unwrap());
        n /= 10;
        count += 1;
    }
    s
}

pub fn render_benchmark_tab(f: &mut Frame, app: &mut App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5),  // Status & Control Banner
            Constraint::Length(12), // Gauges & Throughput
            Constraint::Min(8),     // Sparkline & Latency Histogram
        ])
        .split(area);

    // 1. Control Banner
    let is_active = app.benchmark_stats.active;
    let status_style = if is_active {
        app.theme.match_badge()
    } else {
        app.theme.mismatch_badge()
    };

    let control_block = Block::default()
        .title(Span::styled(" 🚀 Micro-Benchmark Arena ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(if is_active { app.theme.active_border_style() } else { app.theme.border_style() });

    let control_lines = vec![
        Line::from(vec![
            Span::styled("Status: ", Style::default().fg(app.theme.muted)),
            if is_active {
                Span::styled(" RUNNING LIVE BENCHMARK ", status_style)
            } else {
                Span::styled(" PAUSED / IDLE ", status_style)
            },
            Span::styled("  │  Controls: ", Style::default().fg(app.theme.muted)),
            Span::styled("Press 'b' or 'Space' to toggle live benchmark", Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(vec![
            Span::styled("Benchmarking Pattern: ", Style::default().fg(app.theme.muted)),
            Span::styled(&app.pattern_input, Style::default().fg(app.theme.accent).add_modifier(Modifier::BOLD)),
            Span::styled(format!(" across {} sample candidate paths", app.candidate_paths.len()), Style::default().fg(app.theme.secondary)),
        ]),
    ];

    let control_p = Paragraph::new(control_lines).block(control_block);
    f.render_widget(control_p, chunks[0]);

    // 2. Gauges & Stats Grid
    let grid_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(chunks[1]);

    // Left: Throughput & Gauge
    let ops_sec = app.benchmark_stats.ops_per_sec();
    let gauge_ratio = ((ops_sec as f64 / 1_000_000.0).min(1.0)) as f64; // Max scaled at 1M ops/sec

    let gauge_block = Block::default()
        .title(Span::styled(" ⚡ Throughput Ops / Sec Gauge ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let gauge = Gauge::default()
        .block(gauge_block)
        .gauge_style(Style::default().fg(app.theme.primary).bg(app.theme.surface).add_modifier(Modifier::BOLD))
        .ratio(gauge_ratio)
        .label(format!("{} Ops/sec", format_num(ops_sec)));

    f.render_widget(gauge, grid_chunks[0]);

    // Right: Detailed Latency Stats Box
    let stats_block = Block::default()
        .title(Span::styled(" ⏱️ Latency Distribution ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let stats = &app.benchmark_stats;
    let stats_lines = vec![
        Line::from(vec![
            Span::styled("Total Operations: ", Style::default().fg(app.theme.muted)),
            Span::styled(format_num(stats.total_ops), Style::default().fg(app.theme.text).add_modifier(Modifier::BOLD)),
            Span::styled(" | Matched: ", Style::default().fg(app.theme.muted)),
            Span::styled(format_num(stats.matched_ops), Style::default().fg(app.theme.success)),
        ]),
        Line::from(vec![
            Span::styled("Minimum Latency: ", Style::default().fg(app.theme.muted)),
            Span::styled(format!("{:.3} µs", stats.min_nanos as f64 / 1000.0), Style::default().fg(app.theme.success).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(vec![
            Span::styled("Average Latency: ", Style::default().fg(app.theme.muted)),
            Span::styled(format!("{:.3} µs", stats.avg_nanos() as f64 / 1000.0), Style::default().fg(app.theme.primary).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(vec![
            Span::styled("Maximum Latency: ", Style::default().fg(app.theme.muted)),
            Span::styled(format!("{:.3} µs", stats.max_nanos as f64 / 1000.0), Style::default().fg(app.theme.error).add_modifier(Modifier::BOLD)),
        ]),
    ];

    let stats_p = Paragraph::new(stats_lines).block(stats_block);
    f.render_widget(stats_p, grid_chunks[1]);

    // 3. Throughput History Sparkline
    let sparkline_block = Block::default()
        .title(Span::styled(" 📈 Live Throughput History (Ops/sec over time) ", app.theme.block_title_style()))
        .borders(Borders::ALL)
        .border_style(app.theme.border_style());

    let spark_data = &app.benchmark_stats.ops_history;
    let sparkline = Sparkline::default()
        .block(sparkline_block)
        .data(spark_data)
        .style(Style::default().fg(app.theme.accent));

    f.render_widget(sparkline, chunks[2]);
}
