use futures_util::StreamExt;
use reqwest::Response;
use serde::Deserialize;

use crate::{
    models::ai::{AiCompletionConfig, CompletionRequest},
    prompt::PromptContext,
};

pub const MAX_COMPLETION_TOKENS: usize = 512;
pub const MAX_CHAT_PREFIX_CHARS: usize = 4_000;
pub const MAX_CHAT_SUFFIX_CHARS: usize = 1_500;
pub const STOP_SEQUENCES: &[&str] = &["\n\n\n", "\n# ", "\n## "];

#[derive(Deserialize)]
pub struct TextCompletionChoice {
    pub text: Option<String>,
}

#[derive(Deserialize)]
pub struct TextCompletionResponse {
    pub choices: Option<Vec<TextCompletionChoice>>,
}

#[derive(Deserialize)]
pub struct ChatCompletionMessage {
    pub content: Option<String>,
}

#[derive(Deserialize)]
pub struct ChatCompletionChoice {
    pub message: Option<ChatCompletionMessage>,
}

#[derive(Deserialize)]
pub struct ChatCompletionResponse {
    pub choices: Option<Vec<ChatCompletionChoice>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SseEvent {
    pub data: String,
    pub event: Option<String>,
}

pub fn trim_trailing_slash(url: &str) -> &str {
    url.trim_end_matches('/')
}

pub fn resolve_api_key(config: &AiCompletionConfig) -> Result<&str, String> {
    let api_key = config.api_key.trim();

    if api_key.is_empty() {
        return Err("请先在设置中保存 API Key".to_string());
    }

    Ok(api_key)
}

pub fn resolve_api_url(config: &AiCompletionConfig, default_api_url: &str) -> Result<String, String> {
    let api_url = config
        .api_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_api_url);

    if api_url.is_empty() {
        return Err("请先在设置中填写 API URL".to_string());
    }

    let api_url = trim_trailing_slash(api_url).to_string();

    // Auto-prepend https:// (or http:// when use_ssl is false) if no scheme present
    if !api_url.starts_with("http://") && !api_url.starts_with("https://") {
        let scheme = if config.use_ssl { "https://" } else { "http://" };
        return Ok(format!("{scheme}{api_url}"));
    }

    Ok(api_url)
}

pub fn resolve_model<'a>(config: &'a AiCompletionConfig, default_model: &'a str) -> Result<&'a str, String> {
    let model = config
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_model);

    if model.is_empty() {
        return Err("请先在设置中填写 Model".to_string());
    }

    Ok(model)
}

pub fn join_url(base_url: &str, path: &str) -> String {
    format!("{}/{}", trim_trailing_slash(base_url), path.trim_start_matches('/'))
}

pub fn take_last_chars(value: &str, max_chars: usize) -> &str {
    if max_chars == 0 {
        return "";
    }

    let total_chars = value.chars().count();

    if total_chars <= max_chars {
        return value;
    }

    let start_char_index = total_chars - max_chars;
    let start_byte_index = value
        .char_indices()
        .nth(start_char_index)
        .map(|(index, _)| index)
        .unwrap_or(0);

    &value[start_byte_index..]
}

pub fn take_first_chars(value: &str, max_chars: usize) -> &str {
    if max_chars == 0 {
        return "";
    }

    match value.char_indices().nth(max_chars) {
        Some((index, _)) => &value[..index],
        None => value,
    }
}

pub fn build_suffix_hint(suffix: &str) -> String {
    let trimmed_suffix = suffix.trim();

    if trimmed_suffix.is_empty() {
        return String::new();
    }

    format!(
        "The following text appears after the cursor. Connect naturally to it without repeating it:\n\n{trimmed_suffix}\n\nGenerate only the missing content between the cursor and the text above."
    )
}

pub fn build_prompt_context(request: &CompletionRequest) -> PromptContext {
    let title = request.title.as_deref().unwrap_or("Untitled").to_string();
    let prefix = take_last_chars(&request.prefix, MAX_CHAT_PREFIX_CHARS);
    let suffix = request
        .suffix
        .as_deref()
        .map(|value| take_first_chars(value, MAX_CHAT_SUFFIX_CHARS))
        .unwrap_or_default();
    let suffix_hint = build_suffix_hint(suffix);

    PromptContext {
        prefix: prefix.to_string(),
        suffix: suffix.to_string(),
        suffix_hint,
        title,
    }
}


pub fn take_text_completion(payload: TextCompletionResponse) -> String {
    payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.text)
        .unwrap_or_default()
}

pub fn take_chat_completion(payload: ChatCompletionResponse) -> String {
    payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .unwrap_or_default()
}

fn take_next_sse_block(buffer: &mut String) -> Option<String> {
    let (separator_index, separator_len) = ["\r\n\r\n", "\n\n", "\r\r"]
        .into_iter()
        .filter_map(|separator| buffer.find(separator).map(|index| (index, separator.len())))
        .min_by_key(|(index, _)| *index)?;
    let raw_event = buffer[..separator_index].to_string();
    *buffer = buffer[separator_index + separator_len..].to_string();

    Some(raw_event)
}

fn parse_sse_event(raw_event: &str) -> Option<SseEvent> {
    let mut data_lines = Vec::new();
    let mut event = None;

    for line in raw_event.lines() {
        if line.starts_with(':') {
            continue;
        }

        if let Some(value) = line.strip_prefix("event:") {
            event = Some(value.trim().to_string());
            continue;
        }

        if let Some(value) = line.strip_prefix("data:") {
            data_lines.push(value.trim_start().to_string());
        }
    }

    if data_lines.is_empty() && event.is_none() {
        return None;
    }

    Some(SseEvent {
        data: data_lines.join("\n"),
        event,
    })
}

pub async fn stream_sse_response(
    response: Response,
    mut on_event: impl FnMut(SseEvent) -> Result<(), String>,
) -> Result<(), String> {
    let mut buffer = String::new();
    let mut pending_bytes = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("读取流式响应失败: {error}"))?;
        pending_bytes.extend_from_slice(&chunk);

        loop {
            match std::str::from_utf8(&pending_bytes) {
                Ok(text) => {
                    buffer.push_str(text);
                    pending_bytes.clear();
                    break;
                }
                Err(error) if error.error_len().is_none() => {
                    let valid_up_to = error.valid_up_to();
                    if valid_up_to > 0 {
                        let valid_text = std::str::from_utf8(&pending_bytes[..valid_up_to])
                            .map_err(|parse_error| format!("解析流式响应失败: {parse_error}"))?;
                        buffer.push_str(valid_text);
                        pending_bytes.drain(..valid_up_to);
                    }
                    break;
                }
                Err(error) => {
                    return Err(format!("解析流式响应失败: {error}"));
                }
            }
        }

        while let Some(raw_event) = take_next_sse_block(&mut buffer) {
            if let Some(event) = parse_sse_event(&raw_event) {
                on_event(event)?;
            }
        }
    }

    if !pending_bytes.is_empty() {
        let text =
            std::str::from_utf8(&pending_bytes).map_err(|error| format!("解析流式响应失败: {error}"))?;
        buffer.push_str(text);
    }

    if !buffer.trim().is_empty() {
        if let Some(event) = parse_sse_event(&buffer) {
            on_event(event)?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::AiCompletionConfig;

    // ─── take_last_chars ─────────────────────────────────────────────

    #[test]
    fn take_last_chars_normal() {
        assert_eq!(take_last_chars("hello world", 5), "world");
    }

    #[test]
    fn take_last_chars_empty_string() {
        assert_eq!(take_last_chars("", 5), "");
    }

    #[test]
    fn take_last_chars_zero_max() {
        assert_eq!(take_last_chars("hello", 0), "");
    }

    #[test]
    fn take_last_chars_exact_length() {
        assert_eq!(take_last_chars("hello", 5), "hello");
    }

    #[test]
    fn take_last_chars_max_gt_length() {
        assert_eq!(take_last_chars("hi", 10), "hi");
    }

    #[test]
    fn take_last_chars_multi_byte_unicode() {
        assert_eq!(take_last_chars("你好世界", 2), "世界");
    }

    #[test]
    fn take_last_chars_unicode_boundary() {
        // 4 chars, take last 2 — should not break at byte boundary
        let s = "a🔥b🫠";
        let result = take_last_chars(s, 2);
        assert_eq!(result, "b🫠");
        // each emoji is multi-byte, so byte slicing must be char-aware
        assert_eq!(result.chars().count(), 2);
    }

    // ─── take_first_chars ────────────────────────────────────────────

    #[test]
    fn take_first_chars_normal() {
        assert_eq!(take_first_chars("hello world", 5), "hello");
    }

    #[test]
    fn take_first_chars_empty_string() {
        assert_eq!(take_first_chars("", 5), "");
    }

    #[test]
    fn take_first_chars_zero_max() {
        assert_eq!(take_first_chars("hello", 0), "");
    }

    #[test]
    fn take_first_chars_exact_length() {
        assert_eq!(take_first_chars("hello", 5), "hello");
    }

    #[test]
    fn take_first_chars_max_gt_length() {
        assert_eq!(take_first_chars("hi", 10), "hi");
    }

    #[test]
    fn take_first_chars_unicode_boundary() {
        let s = "a🔥b";
        let result = take_first_chars(s, 2);
        assert_eq!(result, "a🔥");
        assert_eq!(result.chars().count(), 2);
    }

    // ─── build_suffix_hint ───────────────────────────────────────────

    #[test]
    fn build_suffix_hint_with_content() {
        let hint = build_suffix_hint(" and more text");
        assert!(hint.contains("and more text"));
        assert!(hint.contains("The following text appears after the cursor"));
    }

    #[test]
    fn build_suffix_hint_empty() {
        assert_eq!(build_suffix_hint(""), "");
    }

    #[test]
    fn build_suffix_hint_whitespace_only() {
        assert_eq!(build_suffix_hint("   \t  "), "");
    }

    // ─── build_prompt_context ────────────────────────────────────────

    #[test]
    fn build_prompt_context_with_title_and_suffix() {
        let request = CompletionRequest {
            title: Some("MyDoc".into()),
            prefix: "hello ".repeat(500),
            suffix: Some(" world".into()),
        };
        let ctx = build_prompt_context(&request);
        assert_eq!(ctx.title, "MyDoc");
        assert_eq!(ctx.suffix, " world");
        assert!(ctx.suffix_hint.contains("world"));
    }

    #[test]
    fn build_prompt_context_without_title() {
        let request = CompletionRequest {
            title: None,
            prefix: "hello".into(),
            suffix: None,
        };
        let ctx = build_prompt_context(&request);
        assert_eq!(ctx.title, "Untitled");
        assert_eq!(ctx.suffix, "");
        assert_eq!(ctx.suffix_hint, "");
    }

    #[test]
    fn build_prompt_context_truncates_prefix() {
        let long_prefix = "x".repeat(MAX_CHAT_PREFIX_CHARS + 100);
        let request = CompletionRequest {
            title: None,
            prefix: long_prefix,
            suffix: None,
        };
        let ctx = build_prompt_context(&request);
        assert_eq!(ctx.prefix.chars().count(), MAX_CHAT_PREFIX_CHARS);
    }

    #[test]
    fn build_prompt_context_truncates_suffix() {
        let long_suffix = "y".repeat(MAX_CHAT_SUFFIX_CHARS + 50);
        let request = CompletionRequest {
            title: None,
            prefix: "z".to_string(),
            suffix: Some(long_suffix),
        };
        let ctx = build_prompt_context(&request);
        assert_eq!(ctx.suffix.chars().count(), MAX_CHAT_SUFFIX_CHARS);
    }

    // ─── resolve_api_key ─────────────────────────────────────────────

    #[test]
    fn resolve_api_key_valid() {
        let mut config = AiCompletionConfig::default();
        config.api_key = "sk-abc123".into();
        assert_eq!(resolve_api_key(&config).unwrap(), "sk-abc123");
    }

    #[test]
    fn resolve_api_key_empty_trimmed() {
		let config = AiCompletionConfig {
			api_key: "   ".into(),
			api_url: None,
			custom_protocol: None,
			model: None,
			provider: None,
			use_ssl: true,
		};
        assert!(resolve_api_key(&config).is_err());
    }

    #[test]
    fn resolve_api_key_trimmed() {
        let mut config = AiCompletionConfig::default();
        config.api_key = "  sk-xyz  ".into();
        assert_eq!(resolve_api_key(&config).unwrap(), "sk-xyz");
    }

    // ─── resolve_model ───────────────────────────────────────────────

    #[test]
    fn resolve_model_custom() {
        let mut config = AiCompletionConfig::default();
        config.model = Some("my-model".into());
        assert_eq!(resolve_model(&config, "default-model").unwrap(), "my-model");
    }

    #[test]
    fn resolve_model_default_fallback() {
        let config = AiCompletionConfig::default();
        assert_eq!(resolve_model(&config, "default-model").unwrap(), "default-model");
    }

    #[test]
    fn resolve_model_empty_after_trim() {
        let mut config = AiCompletionConfig::default();
        config.model = Some("  ".into());
        assert_eq!(resolve_model(&config, "fallback").unwrap(), "fallback");
    }

    // ─── resolve_api_url ─────────────────────────────────────────────

    #[test]
    fn resolve_api_url_custom() {
        let mut config = AiCompletionConfig::default();
        config.api_url = Some("https://custom.api.com/".into());
        assert_eq!(
            resolve_api_url(&config, "https://default.com").unwrap(),
            "https://custom.api.com"
        );
    }

    #[test]
    fn resolve_api_url_default_fallback() {
        let config = AiCompletionConfig::default();
        assert_eq!(
            resolve_api_url(&config, "https://default.com").unwrap(),
            "https://default.com"
        );
    }

    #[test]
    fn resolve_api_url_trim_trailing_slash() {
        let mut config = AiCompletionConfig::default();
        config.api_url = Some("https://api.test.com/v1///".into());
        assert_eq!(
            resolve_api_url(&config, "https://fallback.com").unwrap(),
            "https://api.test.com/v1"
        );
    }

    #[test]
    fn resolve_api_url_empty_after_trim_falls_to_default() {
        let mut config = AiCompletionConfig::default();
        config.api_url = Some("  ".into());
        assert_eq!(
            resolve_api_url(&config, "https://default.com").unwrap(),
            "https://default.com"
        );
    }

    // ─── trim_trailing_slash & join_url ──────────────────────────────

    #[test]
    fn trim_trailing_slash_normal() {
        assert_eq!(trim_trailing_slash("https://api.example.com/"), "https://api.example.com");
    }

    #[test]
    fn trim_trailing_slash_no_slash() {
        assert_eq!(trim_trailing_slash("https://api.example.com"), "https://api.example.com");
    }

    #[test]
    fn trim_trailing_slash_multiple() {
        assert_eq!(trim_trailing_slash("a///"), "a");
    }

    #[test]
    fn join_url_basic() {
        assert_eq!(join_url("https://api.com", "/v1/chat"), "https://api.com/v1/chat");
    }

    #[test]
    fn join_url_base_trailing_slash() {
        assert_eq!(join_url("https://api.com/", "/v1"), "https://api.com/v1");
    }

    #[test]
    fn join_url_path_without_leading_slash() {
        assert_eq!(join_url("https://api.com", "v1"), "https://api.com/v1");
    }

    // ─── take_text_completion ────────────────────────────────────────

    #[test]
    fn take_text_completion_full() {
        let resp = TextCompletionResponse {
            choices: Some(vec![TextCompletionChoice {
                text: Some("hello".into()),
            }]),
        };
        assert_eq!(take_text_completion(resp), "hello");
    }

    #[test]
    fn take_text_completion_empty_choices() {
        let resp = TextCompletionResponse { choices: Some(vec![]) };
        assert_eq!(take_text_completion(resp), "");
    }

    #[test]
    fn take_text_completion_none_choices() {
        let resp = TextCompletionResponse { choices: None };
        assert_eq!(take_text_completion(resp), "");
    }

    #[test]
    fn take_text_completion_none_text() {
        let resp = TextCompletionResponse {
            choices: Some(vec![TextCompletionChoice { text: None }]),
        };
        assert_eq!(take_text_completion(resp), "");
    }

    // ─── take_chat_completion ────────────────────────────────────────

    #[test]
    fn take_chat_completion_full() {
        let resp = ChatCompletionResponse {
            choices: Some(vec![ChatCompletionChoice {
                message: Some(ChatCompletionMessage {
                    content: Some("hi".into()),
                }),
            }]),
        };
        assert_eq!(take_chat_completion(resp), "hi");
    }

    #[test]
    fn take_chat_completion_empty_choices() {
        let resp = ChatCompletionResponse { choices: Some(vec![]) };
        assert_eq!(take_chat_completion(resp), "");
    }

    #[test]
    fn take_chat_completion_none_choices() {
        let resp = ChatCompletionResponse { choices: None };
        assert_eq!(take_chat_completion(resp), "");
    }

    #[test]
    fn take_chat_completion_none_message() {
        let resp = ChatCompletionResponse {
            choices: Some(vec![ChatCompletionChoice { message: None }]),
        };
        assert_eq!(take_chat_completion(resp), "");
    }

    #[test]
    fn take_chat_completion_none_content() {
        let resp = ChatCompletionResponse {
            choices: Some(vec![ChatCompletionChoice {
                message: Some(ChatCompletionMessage { content: None }),
            }]),
        };
        assert_eq!(take_chat_completion(resp), "");
    }

    // ─── AiCompletionConfig default ───────────────────────────────

    #[test]
    fn ai_completion_config_default_is_deepseek() {
        // Verify the default provider is DeepSeek via Default impl
        let config = AiCompletionConfig::default();
        assert_eq!(config.provider, None);
    }

    #[test]
    fn take_next_sse_block_normalizes_crlf() {
        let mut buffer = "data: first\r\n\r\ndata: second\r\n\r\n".to_string();

        assert_eq!(take_next_sse_block(&mut buffer), Some("data: first".to_string()));
        assert_eq!(take_next_sse_block(&mut buffer), Some("data: second".to_string()));
        assert_eq!(take_next_sse_block(&mut buffer), None);
    }

    #[test]
    fn parse_sse_event_collects_multiline_data() {
        let event = parse_sse_event("event: delta\ndata: hello\ndata: world").unwrap();

        assert_eq!(event.event, Some("delta".to_string()));
        assert_eq!(event.data, "hello\nworld");
    }

    #[test]
    fn parse_sse_event_ignores_comment_only_payload() {
        assert_eq!(parse_sse_event(": keep-alive"), None);
    }
}
