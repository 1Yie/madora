use std::io;

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame, Terminal,
};

use crate::diff::{DiffLine, DiffLineKind, FileDiff};

/// Result of the TUI interaction.
#[derive(Debug, PartialEq)]
pub enum TuiResult {
    Accept,
    Reject,
    Edit(String),
    Continue,
    Quit,
}

/// Run the ratatui TUI to preview a completion diff.
/// Returns whether the user accepted, rejected, or wants to edit.
pub fn run_tui(
    diff: &FileDiff,
    file_path: &str,
    cursor_display: &str,
    completion_text: &str,
) -> io::Result<TuiResult> {
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;

    // Enter raw mode & alternate screen
    crossterm::terminal::enable_raw_mode()?;
    let mut stdout = io::stdout();
    crossterm::execute!(stdout, crossterm::terminal::EnterAlternateScreen)?;

    let result = run_tui_inner(&mut terminal, diff, file_path, cursor_display, completion_text);

    // Restore terminal
    crossterm::execute!(stdout, crossterm::terminal::LeaveAlternateScreen)?;
    crossterm::terminal::disable_raw_mode()?;

    result
}

fn run_tui_inner(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    diff: &FileDiff,
    file_path: &str,
    cursor_display: &str,
    completion_text: &str,
) -> io::Result<TuiResult> {
    let mut scroll_offset: usize = 0;
    let max_scroll = diff.lines.len().saturating_sub(1);

    loop {
        terminal.draw(|f| {
            draw_ui(f, diff, file_path, cursor_display, scroll_offset);
        })?;

        if let Event::Key(key) = event::read()? {
            if key.kind != KeyEventKind::Press {
                continue;
            }
            match key.code {
                KeyCode::Char('q') | KeyCode::Esc => return Ok(TuiResult::Quit),
                KeyCode::Char('y') | KeyCode::Enter => return Ok(TuiResult::Accept),
                KeyCode::Char('n') => return Ok(TuiResult::Reject),
                KeyCode::Char('j') | KeyCode::Down => {
                    scroll_offset = scroll_offset.saturating_add(1).min(max_scroll);
                }
                KeyCode::Char('k') | KeyCode::Up => {
                    scroll_offset = scroll_offset.saturating_sub(1);
                }
                KeyCode::Char('g') => {
                    scroll_offset = 0;
                }
                KeyCode::Char('G') => {
                    scroll_offset = max_scroll;
                }
                KeyCode::Char('e') => {
                    let result = handle_edit(terminal, completion_text);
                    match result {
                        Ok(TuiResult::Continue) => {
                            // Editor had no changes, go back to TUI
                            continue;
                        }
                        other => return other,
                    }
                }
                _ => {}
            }
        }
    }
}

/// Handle the "e" key: suspend TUI, open editor, resume TUI.
fn handle_edit(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    completion_text: &str,
) -> io::Result<TuiResult> {
    // Leave alternate screen and raw mode
    crossterm::execute!(io::stdout(), crossterm::terminal::LeaveAlternateScreen)?;
    crossterm::terminal::disable_raw_mode()?;

    let result = edit_completion(completion_text);

    // Re-enter raw mode and alternate screen
    crossterm::terminal::enable_raw_mode()?;
    crossterm::execute!(io::stdout(), crossterm::terminal::EnterAlternateScreen)?;

    // Force terminal to clear its buffer and reset state
    terminal.clear()?;

    match result {
        Ok(Some(text)) => Ok(TuiResult::Edit(text)),
        Ok(None) => Ok(TuiResult::Continue),
        Err(e) => Err(e),
    }
}

fn draw_ui(
    f: &mut Frame,
    diff: &FileDiff,
    file_path: &str,
    cursor_display: &str,
    scroll_offset: usize,
) {
    let area = f.area();

    let layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),   // main content
            Constraint::Length(3), // footer
        ])
        .split(area);

    // ── Header block ──
    let title = format!(" FIM Completion — {file_path}:{cursor_display} ");
    let main_block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

    let inner = main_block.inner(layout[0]);
    f.render_widget(main_block, layout[0]);

    // ── Diff content ──
    // inner is already the content area after border; use its full height
    let visible_height = inner.height as usize;
    let start = scroll_offset;
    let end = (start + visible_height).min(diff.lines.len());

    let lines_to_render: Vec<Line> = diff.lines[start..end]
        .iter()
        .map(|dl| line_for_diff_line(dl))
        .collect();

    let text = Text::from(lines_to_render);
    let paragraph = Paragraph::new(text).wrap(Wrap { trim: false });
    f.render_widget(paragraph, inner);

    // ── Footer ──
    let footer_text = Line::from(vec![
        Span::styled(" [y] Accept ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        Span::styled(" [n] Reject ", Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
        Span::styled(" [e] Edit ", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
        Span::styled(" [j/k] Scroll ", Style::default().fg(Color::White)),
        Span::styled(" [q] Quit ", Style::default().fg(Color::DarkGray)),
        Span::styled(
            format!(" [{}/{}] ", scroll_offset.saturating_add(1), diff.lines.len()),
            Style::default().fg(Color::DarkGray),
        ),
    ]);
    let footer = Paragraph::new(footer_text)
        .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));
    f.render_widget(footer, layout[1]);
}

fn line_for_diff_line(dl: &DiffLine) -> Line<'static> {
    let (prefix, style): (&str, Style) = match dl.kind {
        DiffLineKind::Equal => (" ", Style::default()),
        DiffLineKind::Insert => ("+", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        DiffLineKind::Delete => ("-", Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
    };

    let content = dl.content.trim_end_matches('\n').trim_end_matches('\r').to_string();

    // Truncate very long lines (safely at char boundary, not byte boundary)
    let display_content = if content.len() > 200 {
        let trunc_end = content.char_indices().nth(200).map(|(i, _)| i).unwrap_or(content.len());
        format!("{}… (truncated)", &content[..trunc_end])
    } else {
        content
    };

    Line::from(Span::styled(
        format!("{prefix} {display_content}"),
        style,
    ))
}

/// Open the completion text in $EDITOR and return the edited version.
fn edit_completion(current_text: &str) -> io::Result<Option<String>> {
    let editor = std::env::var("EDITOR")
        .or_else(|_| std::env::var("VISUAL"))
        .unwrap_or_else(|_| {
            if cfg!(target_os = "windows") {
                "notepad".to_string()
            } else {
                "vim".to_string()
            }
        });

    // Write to temp file (use pid to avoid conflicts between concurrent instances)
    let mut tmp = std::env::temp_dir();
    tmp.push(format!("madora_edit_{}.md", std::process::id()));
    std::fs::write(&tmp, current_text)?;

    let status = std::process::Command::new(&editor)
        .arg(&tmp)
        .status()
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("启动编辑器 {editor} 失败: {e}")))?;

    if !status.success() {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!("编辑器 {editor} 异常退出"),
        ));
    }

    let edited = std::fs::read_to_string(&tmp)?;
    let _ = std::fs::remove_file(&tmp);

    if edited == current_text {
        Ok(None) // no changes
    } else {
        Ok(Some(edited))
    }
}
