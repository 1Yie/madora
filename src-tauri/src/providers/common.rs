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

pub fn trim_trailing_slash(url: &str) -> &str {
    url.trim_end_matches('/')
}

pub fn resolve_api_key(config: &AiCompletionConfig) -> Result<&str, String> {
    let api_key = config.api_key.trim();

    if api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
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

    Ok(trim_trailing_slash(api_url).to_string())
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
