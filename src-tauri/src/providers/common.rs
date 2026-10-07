use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{Response, Url};
use serde::{de::DeserializeOwned, Deserialize};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, CompletionRequest},
    prompt::PromptContext,
};

pub const MAX_COMPLETION_TOKENS: usize = 512;
/// Budget for a completion with nothing after the cursor: just finish the
/// current thought.
pub const MAX_OPEN_ENDED_TOKENS: usize = 64;
pub const MAX_CHAT_PREFIX_CHARS: usize = 4_000;
pub const MAX_CHAT_SUFFIX_CHARS: usize = 1_500;
pub const STOP_SEQUENCES: &[&str] = &["\n\n\n", "\n# ", "\n## "];
/// Stops used by DeepSeek's raw `/completions` endpoint when there is no
/// suffix. That endpoint continues the text like a base model and would
/// otherwise run on to the token limit, so it is cut at the first line or
/// sentence end.
pub const OPEN_ENDED_SENTENCE_STOPS: &[&str] = &["\n\n", "\n", "。", ".", "！", "?", "!"];

/// Sampling settings for one completion. Every provider translates these into
/// its own field names (`max_tokens`, `maxOutputTokens`, `stop_sequences`, ...)
/// instead of choosing values itself, so a completion behaves the same way no
/// matter which backend serves it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CompletionParams {
    pub max_tokens: usize,
    pub temperature: f32,
    pub stop: &'static [&'static str],
}

/// How an endpoint should be stopped when the cursor has no text after it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OpenEndedStop {
    /// Chat-style models are instructed to finish the local thought, so the
    /// shared structural stops are enough.
    Structural,
    /// Raw text-completion endpoints need an explicit sentence-level stop.
    Sentence,
}

impl CompletionParams {
    pub fn for_request(request: &CompletionRequest, open_ended_stop: OpenEndedStop) -> Self {
        let has_suffix = request
            .suffix
            .as_deref()
            .is_some_and(|suffix| !suffix.trim().is_empty());

        if has_suffix {
            return Self {
                max_tokens: MAX_COMPLETION_TOKENS,
                temperature: 0.3,
                stop: STOP_SEQUENCES,
            };
        }

        Self {
            max_tokens: MAX_OPEN_ENDED_TOKENS,
            temperature: 0.2,
            stop: match open_ended_stop {
                OpenEndedStop::Structural => STOP_SEQUENCES,
                OpenEndedStop::Sentence => OPEN_ENDED_SENTENCE_STOPS,
            },
        }
    }
}

/// Upper bound for a non-streaming provider response body (4 MiB).
pub const MAX_RESPONSE_BODY_BYTES: usize = 4 * 1024 * 1024;
/// Upper bound for the buffered SSE payload while waiting for a `\n\n` separator (1 MiB).
pub const MAX_SSE_BUFFER_BYTES: usize = 1024 * 1024;
/// Total timeout used for the non-streaming request path only. Streaming uses
/// the client-level connect/read timeouts instead of a wall-clock cap.
pub const NON_STREAM_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

const MAX_SEND_RETRIES: usize = 2;
const RETRY_AFTER_CAP: Duration = Duration::from_secs(5);
const RETRY_BACKOFFS: [Duration; MAX_SEND_RETRIES] =
    [Duration::from_millis(250), Duration::from_secs(1)];

/// Extracts a readable message from a provider error body.
///
/// Provider error payloads are usually JSON like
/// `{"error": {"message": "..."}}` (OpenAI/Anthropic/Google). Pull out
/// `error.message` (or a top-level `message` / string `error`) instead of
/// dumping the raw JSON into the toast. Non-JSON bodies fall back to the
/// truncated raw text so HTML error pages can't flood the UI.
pub(crate) fn summarize_error_body(body: &str) -> String {
    const MAX_LEN: usize = 300;

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        for path in ["/error/message", "/message", "/error"] {
            if let Some(msg) = value.pointer(path).and_then(|v| v.as_str()) {
                return msg.to_string();
            }
        }
    }

    let trimmed = body.trim();
    if trimmed.chars().count() > MAX_LEN {
        let mut s: String = trimmed.chars().take(MAX_LEN).collect();
        s.push('…');
        s
    } else {
        trimmed.to_string()
    }
}

/// Recognizes a provider error payload smuggled inside an otherwise successful
/// (HTTP 200) response or SSE event, and returns the upstream message.
///
/// Handles Anthropic stream errors (`{"type":"error","error":{...}}`),
/// OpenAI/DeepSeek/Google errors (`{"error":{"message":"..."}}` or a string
/// `error`). Returns `None` for ordinary payloads so callers can keep parsing.
pub fn detect_error_payload(data: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(data).ok()?;

    if value.get("type").and_then(|v| v.as_str()) == Some("error") {
        return Some(summarize_error_body(data));
    }

    let error = value.get("error").filter(|value| !value.is_null())?;

    error
        .get("message")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| error.as_str().map(str::to_string))
        .or_else(|| Some(summarize_error_body(data)))
}

pub fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 502 | 503 | 504)
}

/// Parses a `Retry-After` header in its integer-seconds form.
pub fn parse_retry_after(headers: &reqwest::header::HeaderMap) -> Option<Duration> {
    let value = headers
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim();
    let seconds = value.parse::<u64>().ok()?;
    Some(Duration::from_secs(seconds))
}

/// Exponential backoff for the given zero-based retry attempt, honoring a
/// server-provided `Retry-After` (capped at 5 seconds) when present.
pub fn retry_backoff(attempt: usize, retry_after: Option<Duration>) -> Duration {
    let base = RETRY_BACKOFFS
        .get(attempt)
        .copied()
        .unwrap_or_else(|| *RETRY_BACKOFFS.last().expect("backoff table is non-empty"));

    match retry_after {
        Some(retry_after) => retry_after.min(RETRY_AFTER_CAP).max(base),
        None => base,
    }
}

/// Sends a request, retrying rate-limit and transient gateway failures up to
/// twice with backoff. The request is rebuilt on every attempt so no body is
/// consumed twice. Callers only retry before any chunk reaches the frontend,
/// and dropping the surrounding future cancels a pending backoff.
pub async fn send_with_status_retries<F>(mut build: F) -> Result<Response, reqwest::Error>
where
    F: FnMut() -> reqwest::RequestBuilder,
{
    let mut attempt = 0;

    loop {
        let response = build().send().await?;

        if attempt >= MAX_SEND_RETRIES || !is_retryable_status(response.status()) {
            return Ok(response);
        }

        let retry_after = parse_retry_after(response.headers());
        tokio::time::sleep(retry_backoff(attempt, retry_after)).await;
        attempt += 1;
    }
}

/// Reads a (non-streaming) response body with a hard size cap.
pub async fn read_response_text_limited(response: Response) -> Result<String, String> {
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|error| i18n::tf("ai.read_stream_failed", &[("error", &error.to_string())]))?;

        if buffer.len() + chunk.len() > MAX_RESPONSE_BODY_BYTES {
            return Err(i18n::t("ai.read_error_details_failed").to_string());
        }

        buffer.extend_from_slice(&chunk);
    }

    String::from_utf8(buffer)
        .map_err(|error| i18n::tf("ai.parse_stream_failed", &[("error", &error.to_string())]))
}

/// Reads an error response body, falling back to a localized placeholder when
/// the body cannot be read within the size cap.
pub async fn read_error_body(response: Response) -> String {
    read_response_text_limited(response)
        .await
        .unwrap_or_else(|_| i18n::t("ai.read_error_details_failed").to_string())
}

/// Parses a successful non-streaming JSON body, surfacing an embedded error
/// payload (HTTP 200 with `{"error": ...}`) as a real error.
pub async fn parse_success_json<T: DeserializeOwned>(
    provider: &str,
    response: Response,
) -> Result<T, String> {
    let body = read_response_text_limited(response).await?;

    if let Some(message) = detect_error_payload(&body) {
        return Err(i18n::tf(
            "ai.provider.api_error",
            &[
                ("provider", provider),
                ("status", "200"),
                ("body", &message),
            ],
        ));
    }

    serde_json::from_str(&body).map_err(|error| {
        i18n::tf(
            "ai.provider.parse_response_failed",
            &[("provider", provider), ("error", &error.to_string())],
        )
    })
}

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
        return Err(i18n::t("ai.api_key_required").to_string());
    }

    Ok(api_key)
}

pub fn resolve_api_url(
    config: &AiCompletionConfig,
    default_api_url: &str,
) -> Result<String, String> {
    let api_url = config
        .api_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_api_url);

    if api_url.is_empty() {
        return Err(i18n::t("ai.api_url_required").to_string());
    }

    let api_url = trim_trailing_slash(api_url).to_string();

    // Auto-prepend https:// (or http:// when use_ssl is false) if no scheme present
    let api_url = if !api_url.starts_with("http://") && !api_url.starts_with("https://") {
        let scheme = if config.use_ssl {
            "https://"
        } else {
            "http://"
        };
        format!("{scheme}{api_url}")
    } else {
        api_url
    };

    validate_api_url(&api_url)?;

    Ok(api_url)
}

/// Rejects plaintext `http://` endpoints unless the host is loopback, a private
/// network address, or a `.local`/`.lan` name. This prevents an API key from
/// being sent in clear text to an arbitrary remote host. HTTPS is unrestricted.
pub fn validate_api_url(url: &str) -> Result<(), String> {
    let parsed = Url::parse(url).map_err(|error| format!("invalid API URL: {error}"))?;

    match parsed.scheme() {
        "https" => Ok(()),
        "http" => validate_insecure_host(&parsed),
        scheme => Err(format!(
            "unsupported API URL scheme '{scheme}'; use https://"
        )),
    }
}

fn validate_insecure_host(url: &Url) -> Result<(), String> {
    let host = url
        .host_str()
        .ok_or_else(|| "API URL is missing a host".to_string())?;

    // `host_str` keeps the brackets around IPv6 literals; strip them so the
    // address can be parsed (and use the unbracketed form for domain checks).
    let host_for_ip = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);

    let allowed = match host_for_ip.parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
        Ok(std::net::IpAddr::V6(ip)) => ip.is_loopback() || (ip.segments()[0] & 0xfe00) == 0xfc00,
        Err(_) => {
            let lower = host.to_ascii_lowercase();
            lower == "localhost"
                || lower.ends_with(".localhost")
                || lower.ends_with(".local")
                || lower.ends_with(".lan")
        }
    };

    if allowed {
        Ok(())
    } else {
        Err(format!(
            "insecure http:// endpoint '{host}' is not allowed; use https:// or a loopback/private address"
        ))
    }
}

pub fn resolve_model<'a>(
    config: &'a AiCompletionConfig,
    default_model: &'a str,
) -> Result<&'a str, String> {
    let model = config
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_model);

    if model.is_empty() {
        return Err(i18n::t("ai.model_required").to_string());
    }

    Ok(model)
}

pub fn join_url(base_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        trim_trailing_slash(base_url),
        path.trim_start_matches('/')
    )
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

/// Guards the SSE buffering path against a malicious or broken server that
/// never emits an event separator, which would otherwise grow `buffer` forever.
fn ensure_sse_buffer_size(buffer_len: usize) -> Result<(), String> {
    if buffer_len > MAX_SSE_BUFFER_BYTES {
        return Err(i18n::t("ai.read_error_details_failed").to_string());
    }

    Ok(())
}

/// Append one stream chunk to `buffer`.
///
/// A chunk may end in the middle of a multi-byte sequence. Incomplete trailing
/// bytes stay in `pending_bytes` until a later chunk finishes the character,
/// so a split character is never decoded as replacement text.
fn append_stream_chunk(
    buffer: &mut String,
    pending_bytes: &mut Vec<u8>,
    chunk: &[u8],
) -> Result<(), String> {
    pending_bytes.extend_from_slice(chunk);

    match std::str::from_utf8(pending_bytes) {
        Ok(text) => {
            buffer.push_str(text);
            pending_bytes.clear();
        }
        Err(error) if error.error_len().is_none() => {
            let valid_up_to = error.valid_up_to();
            if valid_up_to > 0 {
                let valid_text =
                    std::str::from_utf8(&pending_bytes[..valid_up_to]).map_err(|parse_error| {
                        i18n::tf(
                            "ai.parse_stream_failed",
                            &[("error", &parse_error.to_string())],
                        )
                    })?;
                buffer.push_str(valid_text);
                pending_bytes.drain(..valid_up_to);
            }
        }
        Err(error) => {
            return Err(i18n::tf(
                "ai.parse_stream_failed",
                &[("error", &error.to_string())],
            ));
        }
    }

    Ok(())
}

pub async fn stream_sse_response(
    response: Response,
    mut on_event: impl FnMut(SseEvent) -> Result<(), String>,
) -> Result<(), String> {
    let mut buffer = String::new();
    let mut pending_bytes = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let error_text = chunk.as_ref().err().map(|error| error.to_string());
        let chunk = chunk.map_err(|_| {
            i18n::tf(
                "ai.read_stream_failed",
                &[("error", error_text.as_deref().unwrap_or_default())],
            )
        })?;
        append_stream_chunk(&mut buffer, &mut pending_bytes, &chunk)?;
        ensure_sse_buffer_size(buffer.len())?;

        while let Some(raw_event) = take_next_sse_block(&mut buffer) {
            if let Some(event) = parse_sse_event(&raw_event) {
                on_event(event)?;
            }
        }
    }

    if !pending_bytes.is_empty() {
        let text = std::str::from_utf8(&pending_bytes).map_err(|error| {
            i18n::tf("ai.parse_stream_failed", &[("error", &error.to_string())])
        })?;
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

    // ─── summarize_error_body ────────────────────────────────────────

    #[test]
    fn summarize_error_body_openai_error_message() {
        let body = r#"{"error": {"message": "Incorrect API key provided.", "type": "invalid_request_error", "code": "invalid_api_key"}}"#;
        assert_eq!(summarize_error_body(body), "Incorrect API key provided.");
    }

    #[test]
    fn summarize_error_body_anthropic_style() {
        let body = r#"{"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}"#;
        assert_eq!(summarize_error_body(body), "invalid x-api-key");
    }

    #[test]
    fn summarize_error_body_google_style() {
        let body = r#"{"error": {"code": 401, "message": "API key not valid.", "status": "UNAUTHENTICATED"}}"#;
        assert_eq!(summarize_error_body(body), "API key not valid.");
    }

    #[test]
    fn summarize_error_body_top_level_message() {
        let body = r#"{"message": "model not found"}"#;
        assert_eq!(summarize_error_body(body), "model not found");
    }

    #[test]
    fn summarize_error_body_string_error() {
        let body = r#"{"error": "rate limited"}"#;
        assert_eq!(summarize_error_body(body), "rate limited");
    }

    #[test]
    fn summarize_error_body_plain_text_passthrough() {
        assert_eq!(summarize_error_body("  Bad Gateway  "), "Bad Gateway");
    }

    #[test]
    fn summarize_error_body_truncates_long_body() {
        let body = "x".repeat(500);
        let out = summarize_error_body(&body);
        assert_eq!(out.chars().count(), 301);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn summarize_error_body_json_without_message_falls_back() {
        let body = r#"{"status": 500}"#;
        assert_eq!(summarize_error_body(body), body);
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
        assert_eq!(
            resolve_model(&config, "default-model").unwrap(),
            "default-model"
        );
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
        assert_eq!(
            trim_trailing_slash("https://api.example.com/"),
            "https://api.example.com"
        );
    }

    #[test]
    fn trim_trailing_slash_no_slash() {
        assert_eq!(
            trim_trailing_slash("https://api.example.com"),
            "https://api.example.com"
        );
    }

    #[test]
    fn trim_trailing_slash_multiple() {
        assert_eq!(trim_trailing_slash("a///"), "a");
    }

    #[test]
    fn join_url_basic() {
        assert_eq!(
            join_url("https://api.com", "/v1/chat"),
            "https://api.com/v1/chat"
        );
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
        let resp = TextCompletionResponse {
            choices: Some(vec![]),
        };
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
        let resp = ChatCompletionResponse {
            choices: Some(vec![]),
        };
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

        assert_eq!(
            take_next_sse_block(&mut buffer),
            Some("data: first".to_string())
        );
        assert_eq!(
            take_next_sse_block(&mut buffer),
            Some("data: second".to_string())
        );
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

    // ─── append_stream_chunk ──────────────────────────────────────

    #[test]
    fn append_stream_chunk_appends_complete_utf8() {
        let mut buffer = String::new();
        let mut pending = Vec::new();

        append_stream_chunk(&mut buffer, &mut pending, b"data: hi").unwrap();

        assert_eq!(buffer, "data: hi");
        assert!(pending.is_empty());
    }

    #[test]
    fn append_stream_chunk_reassembles_split_multibyte_char() {
        let mut buffer = String::new();
        let mut pending = Vec::new();
        let bytes = "你好".as_bytes();

        // Split inside the first character's three bytes.
        append_stream_chunk(&mut buffer, &mut pending, &bytes[..2]).unwrap();
        assert_eq!(buffer, "");
        assert_eq!(pending.len(), 2);

        append_stream_chunk(&mut buffer, &mut pending, &bytes[2..]).unwrap();

        assert_eq!(buffer, "你好");
        assert!(pending.is_empty());
    }

    #[test]
    fn append_stream_chunk_rejects_invalid_utf8() {
        let mut buffer = String::new();
        let mut pending = Vec::new();

        assert!(append_stream_chunk(&mut buffer, &mut pending, &[0xFF, 0xFE, 0xFD]).is_err());
    }

    // ─── detect_error_payload ────────────────────────────────────

    #[test]
    fn detect_error_payload_openai_style() {
        let data = r#"{"error":{"message":"rate limited","type":"rate_limit_error"}}"#;
        assert_eq!(detect_error_payload(data).as_deref(), Some("rate limited"));
    }

    #[test]
    fn detect_error_payload_anthropic_stream_style() {
        let data = r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#;
        assert_eq!(detect_error_payload(data).as_deref(), Some("Overloaded"));
    }

    #[test]
    fn detect_error_payload_string_error() {
        assert_eq!(
            detect_error_payload(r#"{"error":"quota exceeded"}"#).as_deref(),
            Some("quota exceeded")
        );
    }

    #[test]
    fn detect_error_payload_ignores_normal_payloads() {
        assert_eq!(
            detect_error_payload(r#"{"choices":[{"delta":{"content":"hi"}}]}"#),
            None
        );
        assert_eq!(detect_error_payload("[DONE]"), None);
        assert_eq!(detect_error_payload(r#"{"error":null}"#), None);
    }

    // ─── retry helpers ───────────────────────────────────────────

    #[test]
    fn retry_backoff_uses_exponential_table() {
        assert_eq!(retry_backoff(0, None), Duration::from_millis(250));
        assert_eq!(retry_backoff(1, None), Duration::from_secs(1));
    }

    #[test]
    fn retry_backoff_honors_retry_after_and_caps_it() {
        assert_eq!(
            retry_backoff(0, Some(Duration::from_secs(2))),
            Duration::from_secs(2)
        );
        assert_eq!(
            retry_backoff(0, Some(Duration::from_secs(30))),
            Duration::from_secs(5)
        );
    }

    #[test]
    fn parse_retry_after_reads_seconds() {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(reqwest::header::RETRY_AFTER, "3".parse().unwrap());
        assert_eq!(parse_retry_after(&headers), Some(Duration::from_secs(3)));

        let mut invalid = reqwest::header::HeaderMap::new();
        invalid.insert(
            reqwest::header::RETRY_AFTER,
            "Wed, 21 Oct 2015 07:28:00 GMT".parse().unwrap(),
        );
        assert_eq!(parse_retry_after(&invalid), None);
    }

    #[test]
    fn retryable_statuses_match_rate_limit_and_gateway_errors() {
        for status in [429u16, 502, 503, 504] {
            assert!(is_retryable_status(
                reqwest::StatusCode::from_u16(status).unwrap()
            ));
        }
        for status in [400u16, 401, 404, 500, 501] {
            assert!(!is_retryable_status(
                reqwest::StatusCode::from_u16(status).unwrap()
            ));
        }
    }

    // ─── ensure_sse_buffer_size ──────────────────────────────────

    #[test]
    fn sse_buffer_cap_rejects_oversized_payload() {
        assert!(ensure_sse_buffer_size(MAX_SSE_BUFFER_BYTES).is_ok());
        assert!(ensure_sse_buffer_size(MAX_SSE_BUFFER_BYTES + 1).is_err());
    }

    // ─── validate_api_url ────────────────────────────────────────

    #[test]
    fn validate_api_url_allows_https_anywhere() {
        assert!(validate_api_url("https://api.example.com/v1").is_ok());
        assert!(validate_api_url("https://evil.example.com").is_ok());
    }

    #[test]
    fn validate_api_url_allows_loopback_and_private_http() {
        for url in [
            "http://localhost:8080/v1",
            "http://127.0.0.1:1234",
            "http://127.5.5.5",
            "http://10.0.0.8",
            "http://172.16.4.1",
            "http://192.168.1.20",
            "http://[::1]:8080",
            "http://[fc00::1]:8080",
            "http://box.local/v1",
            "http://server.lan",
        ] {
            assert!(
                validate_api_url(url).is_ok(),
                "expected {url} to be allowed"
            );
        }
    }

    #[test]
    fn validate_api_url_rejects_public_http_and_spoofed_hosts() {
        for url in [
            "http://api.example.com",
            "http://8.8.8.8",
            "http://172.32.0.1",
            "http://192.169.1.1",
            "http://localhost.evil.com",
            "http://127.0.0.1.evil.com",
            "http://localhost@evil.com",
            "http://10.0.0.1.evil.com",
            "http://evil.com.local.evil.com",
        ] {
            assert!(
                validate_api_url(url).is_err(),
                "expected {url} to be rejected"
            );
        }
    }

    #[test]
    fn validate_api_url_rejects_non_http_schemes() {
        assert!(validate_api_url("ftp://example.com").is_err());
    }

    // ─── CompletionParams ────────────────────────────────────────────

    fn request_with_suffix(suffix: Option<&str>) -> CompletionRequest {
        CompletionRequest {
            title: None,
            prefix: "prefix".to_string(),
            suffix: suffix.map(str::to_string),
        }
    }

    #[test]
    fn params_with_a_suffix_get_the_full_budget_and_structural_stops() {
        for style in [OpenEndedStop::Structural, OpenEndedStop::Sentence] {
            let params = CompletionParams::for_request(&request_with_suffix(Some("after")), style);

            assert_eq!(params.max_tokens, MAX_COMPLETION_TOKENS);
            assert_eq!(params.temperature, 0.3);
            assert_eq!(params.stop, STOP_SEQUENCES);
        }
    }

    #[test]
    fn params_without_a_suffix_use_the_open_ended_budget() {
        for suffix in [None, Some(""), Some("   \n\t ")] {
            let params = CompletionParams::for_request(
                &request_with_suffix(suffix),
                OpenEndedStop::Structural,
            );

            assert_eq!(
                params.max_tokens, MAX_OPEN_ENDED_TOKENS,
                "suffix {suffix:?}"
            );
            assert_eq!(params.temperature, 0.2);
            assert_eq!(params.stop, STOP_SEQUENCES);
        }
    }

    #[test]
    fn raw_completion_endpoints_stop_at_sentence_ends_without_a_suffix() {
        let params =
            CompletionParams::for_request(&request_with_suffix(None), OpenEndedStop::Sentence);

        assert_eq!(params.stop, OPEN_ENDED_SENTENCE_STOPS);
        assert!(params.stop.contains(&"\n"));
        assert!(params.stop.contains(&"。"));
    }

    // Checked at compile time: both are constants.
    const _: () = assert!(MAX_OPEN_ENDED_TOKENS < MAX_COMPLETION_TOKENS);
}
