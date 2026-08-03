use ratatui::style::{Color, Modifier, Style};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeKind {
    Cyberpunk,
    TokyoNight,
    Dracula,
    Monokai,
}

impl ThemeKind {
    pub fn name(&self) -> &'static str {
        match self {
            ThemeKind::Cyberpunk => "Neon Cyberpunk ⚡",
            ThemeKind::TokyoNight => "Tokyo Night 🌃",
            ThemeKind::Dracula => "Dracula 🧛",
            ThemeKind::Monokai => "Monokai Pro 🎨",
        }
    }

    pub fn next(&self) -> Self {
        match self {
            ThemeKind::Cyberpunk => ThemeKind::TokyoNight,
            ThemeKind::TokyoNight => ThemeKind::Dracula,
            ThemeKind::Dracula => ThemeKind::Monokai,
            ThemeKind::Monokai => ThemeKind::Cyberpunk,
        }
    }
}

pub struct Theme {
    pub kind: ThemeKind,
    pub primary: Color,
    pub secondary: Color,
    pub accent: Color,
    pub background: Color,
    pub surface: Color,
    pub text: Color,
    pub muted: Color,
    pub success: Color,
    pub error: Color,
    pub warning: Color,
}

impl Theme {
    pub fn from_kind(kind: ThemeKind) -> Self {
        match kind {
            ThemeKind::Cyberpunk => Theme {
                kind,
                primary: Color::Rgb(0, 245, 255),    // Bright Cyan
                secondary: Color::Rgb(255, 0, 127),  // Neon Pink
                accent: Color::Rgb(255, 230, 0),     // Neon Yellow
                background: Color::Rgb(10, 10, 20),
                surface: Color::Rgb(20, 20, 40),
                text: Color::Rgb(240, 240, 255),
                muted: Color::Rgb(100, 110, 140),
                success: Color::Rgb(50, 255, 126),  // Neon Green
                error: Color::Rgb(255, 75, 75),    // Neon Red
                warning: Color::Rgb(255, 153, 0),
            },
            ThemeKind::TokyoNight => Theme {
                kind,
                primary: Color::Rgb(122, 162, 247),   // Soft Blue
                secondary: Color::Rgb(187, 154, 247), // Soft Lavender
                accent: Color::Rgb(224, 175, 104),    // Warm Amber
                background: Color::Rgb(26, 27, 38),
                surface: Color::Rgb(36, 40, 59),
                text: Color::Rgb(192, 202, 245),
                muted: Color::Rgb(86, 95, 137),
                success: Color::Rgb(158, 206, 106),  // Pastel Green
                error: Color::Rgb(247, 118, 142),    // Pastel Coral
                warning: Color::Rgb(224, 175, 104),
            },
            ThemeKind::Dracula => Theme {
                kind,
                primary: Color::Rgb(189, 147, 249),  // Purple
                secondary: Color::Rgb(255, 121, 198),// Pink
                accent: Color::Rgb(139, 233, 253),   // Cyan
                background: Color::Rgb(40, 42, 54),
                surface: Color::Rgb(68, 71, 90),
                text: Color::Rgb(248, 248, 242),
                muted: Color::Rgb(98, 114, 164),
                success: Color::Rgb(80, 250, 123),   // Mint Green
                error: Color::Rgb(255, 85, 85),     // Red
                warning: Color::Rgb(241, 250, 140),  // Yellow
            },
            ThemeKind::Monokai => Theme {
                kind,
                primary: Color::Rgb(255, 216, 102),  // Monokai Gold
                secondary: Color::Rgb(166, 226, 46), // Monokai Lime Green
                accent: Color::Rgb(102, 217, 239),  // Light Blue
                background: Color::Rgb(39, 40, 34),
                surface: Color::Rgb(62, 62, 54),
                text: Color::Rgb(248, 248, 242),
                muted: Color::Rgb(117, 113, 94),
                success: Color::Rgb(166, 226, 46),
                error: Color::Rgb(249, 38, 114),    // Magenta
                warning: Color::Rgb(253, 151, 31),   // Orange
            },
        }
    }

    pub fn title_style(&self) -> Style {
        Style::default()
            .fg(self.primary)
            .add_modifier(Modifier::BOLD)
    }

    pub fn active_tab_style(&self) -> Style {
        Style::default()
            .fg(self.background)
            .bg(self.primary)
            .add_modifier(Modifier::BOLD)
    }

    pub fn inactive_tab_style(&self) -> Style {
        Style::default().fg(self.muted)
    }

    pub fn block_title_style(&self) -> Style {
        Style::default()
            .fg(self.secondary)
            .add_modifier(Modifier::BOLD)
    }

    pub fn border_style(&self) -> Style {
        Style::default().fg(self.muted)
    }

    pub fn active_border_style(&self) -> Style {
        Style::default().fg(self.primary)
    }

    pub fn match_badge(&self) -> Style {
        Style::default()
            .fg(self.background)
            .bg(self.success)
            .add_modifier(Modifier::BOLD)
    }

    pub fn mismatch_badge(&self) -> Style {
        Style::default()
            .fg(self.background)
            .bg(self.error)
            .add_modifier(Modifier::BOLD)
    }
}
