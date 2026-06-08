use clap::Parser;
use madora_lib::{
    models::ai::CompletionRequest,
    prompt::PromptManager,
    providers::get_provider,
};
use reqwest::Client;

mod config;
mod diff;
mod tui;

use config::{build_completion_config, resolve_api_key, CustomCliProtocol, Provider};
use diff::compute_diff;

/// Madora CLI — AI-powered terminal completion for Markdown.
#[derive(Parser, Debug)]
#[command(
    name = "mado",
    version,
    about = "Madora CLI — AI-powered Markdown completion in the terminal.",
    long_about = "Reads a file, requests FIM (Fill-in-the-Middle) completion at a cursor position, shows a diff preview in the terminal, and lets you accept or reject the result."
)]
struct Cli {
    /// File to complete (use "-" for stdin)
    #[arg(value_name = "FILE")]
    file: Option<String>,

    /// Cursor position as LINE:COL (1-based)
    #[arg(value_name = "LINE:COL")]
    cursor: Option<String>,

    /// AI provider to use
    #[arg(long, value_name = "PROVIDER", required = true)]
    provider: Provider,

    /// Model identifier (e.g. "gpt-4o", "deepseek-v4-flash", "claude-sonnet-4-6")
    #[arg(long, value_name = "MODEL", required = true)]
    model: String,

    /// API key (overrides keyring and env var)
    #[arg(long, value_name = "KEY", env = "MADORA_API_KEY")]
    api_key: Option<String>,

    /// API base URL override
    #[arg(long, value_name = "URL")]
    api_base: Option<String>,

    /// Custom provider protocol (only used with --provider custom)
    #[arg(long, value_name = "PROTOCOL")]
    custom_protocol: Option<CustomCliProtocol>,

    /// Non-interactive mode: print completion to stdout, no TUI
    #[arg(long)]
    no_interactive: bool,

    /// Max tokens for completion
    #[arg(long, value_name = "COUNT")]
    max_tokens: Option<u16>,

    /// Temperature for completion
    #[arg(long, value_name = "FLOAT")]
    temperature: Option<f32>,
}

#[tokio::main]
async fn main() {
    let result = run().await;
    match result {
        Ok(json_line) => {
            if let Some(line) = json_line {
                println!("{line}");
            }
        }
        Err(e) => {
            let json_err = serde_json::json!({"status": "error", "message": e});
            eprintln!("{json_err}");
            std::process::exit(1);
        }
    }
}

async fn run() -> Result<Option<String>, String> {
    let cli = Cli::parse();

    // ── Resolve API key ──
    let api_key = resolve_api_key(cli.provider, cli.api_key.as_deref())?;

    // ── Read input ──
    let (file_path, content) = read_input(cli.file.as_deref())?;
    let content = content.strip_suffix('\n').unwrap_or(&content).to_string();

    if content.is_empty() {
        return Err("文件内容为空，无法进行 FIM 补全".to_string());
    }

    // ── Parse cursor ──
    let (line, col) = if let Some(ref cursor_str) = cli.cursor {
        parse_cursor(cursor_str)?
    } else {
        let lines: Vec<&str> = content.split('\n').collect();
        (lines.len(), 1)
    };

    let display_path = file_path.clone().unwrap_or("<stdin>".to_string());

    // ── Split at cursor ──
    let (prefix, suffix_str) = diff::split_at_cursor(&content, line, col);
    let suffix_opt: Option<String> = {
        if suffix_str.trim().is_empty() {
            None
        } else {
            Some(suffix_str.to_string())
        }
    };

    let cursor_display = format!("{line}:{col}");

    // ── Build completion config ──
    let completion_config = build_completion_config(
        cli.provider,
        api_key.clone(),
        cli.model.clone(),
        cli.api_base.clone(),
        cli.custom_protocol,
    );

    let request = CompletionRequest {
        title: display_path.to_string().into(),
        prefix,
        suffix: suffix_opt.as_ref().map(|s| s.to_string()),
    };

    // ── Send FIM completion via madora provider ──
    let client = Client::new();
    let provider = get_provider(cli.provider.to_ai_provider());
    let prompt_manager = PromptManager::new();
    let completion_result = provider
        .request_fim_completion(&client, &prompt_manager, &completion_config, &request)
        .await?;

    if completion_result.is_empty() {
        return Err("AI 返回了空内容".to_string());
    }

    // ── Build completed content ──
    let completed_content = match suffix_opt {
        Some(ref s) => request.prefix.clone() + &completion_result + s,
        None => request.prefix.clone() + &completion_result,
    };

    // ── no-interactive mode ──
    if cli.no_interactive {
        if let Some(ref path) = file_path {
            // File mode: show preview as JSON, then wait for y/n from stdin
            let preview_json = serde_json::json!({
                "status": "preview",
                "completion": completion_result,
                "completed_content": completed_content,
                "path": path,
            });
            println!("{preview_json}");

            eprint!("Apply? (y/N): ");
            std::io::Write::flush(&mut std::io::stderr())
                .map_err(|e| format!("刷新 stderr 失败: {e}"))?;

            let mut input = String::new();
            std::io::stdin()
                .read_line(&mut input)
                .map_err(|e| format!("读取确认失败: {e}"))?;

            if input.trim().eq_ignore_ascii_case("y") {
                std::fs::write(path, &completed_content)
                    .map_err(|e| format!("写入文件失败: {e}"))?;
                let result_json =
                    serde_json::json!({"status": "success", "path": path});
                return Ok(Some(result_json.to_string()));
            } else {
                let result_json = serde_json::json!({"status": "rejected"});
                eprintln!("{result_json}");
                std::process::exit(1);
            }
        } else {
            // Stdin mode: print completed content, then JSON
            println!("{completed_content}");
            let json = serde_json::json!({
                "status": "success",
                "completion": completion_result,
                "completed_content": completed_content,
                "path": file_path,
            });
            return Ok(Some(json.to_string()));
        }
    }

    // ── TUI diff preview ──
    let diff = compute_diff(&content, &completed_content);
    if diff.lines.is_empty() {
        let json = serde_json::json!({"status": "no_change"});
        eprintln!("{json}");
        return Ok(None);
    }

    match tui::run_tui(&diff, &display_path, &cursor_display, &completion_result) {
        Ok(tui::TuiResult::Continue) => {
            // run_tui() never returns Continue — it is only used internally by
            // run_tui_inner after editor suspend/resume without changes.
            unreachable!()
        }
        Ok(tui::TuiResult::Accept) => {
            if let Some(ref path) = file_path {
                std::fs::write(path, &completed_content)
                    .map_err(|e| format!("写入文件失败: {e}"))?;
            } else {
                println!("{completed_content}");
            }
            let json = serde_json::json!({
                "status": "success",
                "completion": completion_result,
                "completed_content": completed_content,
                "path": file_path,
            });
            Ok(Some(json.to_string()))
        }
        Ok(tui::TuiResult::Reject) => {
            let json = serde_json::json!({"status": "rejected"});
            eprintln!("{json}");
            std::process::exit(1);
        }
        Ok(tui::TuiResult::Edit(edited_text)) => {
            if edited_text.trim().is_empty() {
                let json = serde_json::json!({"status": "rejected"});
                eprintln!("{json}");
                return Ok(None);
            }
            let edited_content = match suffix_opt {
                Some(ref s) => request.prefix.clone() + &edited_text + s,
                None => request.prefix.clone() + &edited_text,
            };
            if let Some(ref path) = file_path {
                std::fs::write(path, &edited_content)
                    .map_err(|e| format!("写入文件失败: {e}"))?;
            } else {
                println!("{edited_content}");
            }
            let json = serde_json::json!({
                "status": "success",
                "completion": edited_text,
                "completed_content": edited_content,
                "path": file_path,
            });
            Ok(Some(json.to_string()))
        }
        Ok(tui::TuiResult::Quit) => {
            let json = serde_json::json!({"status": "quit"});
            eprintln!("{json}");
            std::process::exit(1);
        }
        Err(e) => Err(format!("TUI 错误: {e}")),
    }
}

/// Read file content from path or stdin.
fn read_input(file: Option<&str>) -> Result<(Option<String>, String), String> {
    match file {
        Some(f) if f == "-" => {
            let buf = std::io::read_to_string(std::io::stdin())
                .map_err(|e| format!("读取 stdin 失败: {e}"))?;
            Ok((None, buf))
        }
        Some(f) => {
            let path = std::path::Path::new(f);
            if !path.exists() {
                return Err(format!("文件不存在: {f}"));
            }
            let content =
                std::fs::read_to_string(path).map_err(|e| format!("读取文件失败: {e}"))?;
            Ok((Some(f.to_string()), content))
        }
        None => {
            let buf = std::io::read_to_string(std::io::stdin())
                .map_err(|e| format!("读取 stdin 失败: {e}"))?;
            if buf.is_empty() {
                return Err("stdin 内容为空".to_string());
            }
            Ok((None, buf))
        }
    }
}

/// Parse "LINE:COL" string into (line, col).
fn parse_cursor(s: &str) -> Result<(usize, usize), String> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return Err(format!(
            "无效的光标位置 '{s}'，格式应为 LINE:COL（例如 42:15）"
        ));
    }
    let line = parts[0]
        .parse::<usize>()
        .map_err(|_| format!("无效的行号 '{}'", parts[0]))?;
    let col = parts[1]
        .parse::<usize>()
        .map_err(|_| format!("无效的列号 '{}'", parts[1]))?;
    Ok((line, col))
}
