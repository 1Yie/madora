use reqwest::Client;
use serde_json::json;

use crate::models::ai::{
    AiCompletionConfig, CompletionMode, CompletionRequest, CompletionResult, CompletionResultMode,
    DeepSeekChatCompletionResponse, DeepSeekTextCompletionResponse,
};

const DEFAULT_API_URL: &str = "https://api.deepseek.com";
const DEFAULT_MODEL: &str = "deepseek-v4-pro";
const MAX_COMPLETION_TOKENS: usize = 512;
const STOP_SEQUENCES: &[&str] = &["\n\n\n", "\n# ", "\n## "];
const CHAT_PREFIX_SYSTEM_PROMPT: &str = "You are a professional writer continuing a markdown article. Match the existing voice, tone, and formatting exactly. Maintain any frontmatter, heading hierarchy, list styles, code blocks, or tables present. Output ONLY raw continuation text - no explanations, no meta-commentary, no prefixes like 'Here is the continuation:'. Stop naturally at a paragraph or section boundary.";

fn trim_trailing_slash(url: &str) -> &str {
    url.trim_end_matches('/')
}

fn resolve_api_url(api_url: Option<&str>) -> String {
    let normalized = api_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_API_URL);

    trim_trailing_slash(normalized).to_string()
}

fn resolve_beta_api_url(api_url: Option<&str>) -> String {
    let base_url = resolve_api_url(api_url);

    if base_url.ends_with("/beta") {
        return base_url;
    }

    format!("{base_url}/beta")
}

fn resolve_model(model: Option<&str>) -> &str {
    model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL)
}

fn ensure_api_key(config: &AiCompletionConfig) -> Result<&str, String> {
    let trimmed_api_key = config.api_key.trim();

    if trimmed_api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }

    Ok(trimmed_api_key)
}

fn has_suffix(request: &CompletionRequest) -> bool {
    request
        .suffix
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}

fn build_suffix_hint(suffix: Option<&str>) -> String {
    let trimmed_suffix = suffix.map(str::trim).unwrap_or_default();

    if trimmed_suffix.is_empty() {
        return String::new();
    }

    format!(
        "\n\nThe following text appears AFTER the cursor. Your continuation must connect naturally to it without repeating it:\n\n{trimmed_suffix}\n\nGenerate only the missing content between the cursor and the text above."
    )
}

async fn request_fim_completion(
    client: &Client,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let api_key = ensure_api_key(config)?;
    let api_url = resolve_beta_api_url(config.api_url.as_deref());
    let response = client
        .post(format!("{api_url}/completions"))
        .bearer_auth(api_key)
        .json(&json!({
            "model": resolve_model(config.model.as_deref()),
            "prompt": request.prefix.as_str(),
            "suffix": request.suffix.as_deref(),
            "max_tokens": MAX_COMPLETION_TOKENS,
            "temperature": 0.3,
            "frequency_penalty": 0.3,
            "presence_penalty": 0.1,
            "stop": STOP_SEQUENCES,
        }))
        .send()
        .await
        .map_err(|error| format!("调用 FIM completion 失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误详情".to_string());

        return Err(format!("FIM completion API error ({status}): {body}"));
    }

    let payload = response
        .json::<DeepSeekTextCompletionResponse>()
        .await
        .map_err(|error| format!("解析 FIM completion 响应失败: {error}"))?;

    Ok(payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.text)
        .unwrap_or_default())
}

async fn request_chat_prefix_completion(
    client: &Client,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let api_key = ensure_api_key(config)?;
    let api_url = resolve_beta_api_url(config.api_url.as_deref());
    let title = request.title.as_deref().unwrap_or("Untitled");
    let user_content = format!(
        "Title: {title}\n\nCurrent article:\n{}\n\n⟐ Continue writing from the cursor. Flow naturally into the next sentence. Do not repeat existing content.{}",
        request.prefix,
        build_suffix_hint(request.suffix.as_deref())
    );

    let response = client
        .post(format!("{api_url}/chat/completions"))
        .bearer_auth(api_key)
        .json(&json!({
            "model": resolve_model(config.model.as_deref()),
            "messages": [
                {
                    "role": "system",
                    "content": CHAT_PREFIX_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_content,
                },
                {
                    "role": "assistant",
                    "content": "",
                    "prefix": true,
                }
            ],
            "max_tokens": MAX_COMPLETION_TOKENS,
            "temperature": 0.5,
            "frequency_penalty": 0.3,
            "presence_penalty": 0.2,
            "stop": STOP_SEQUENCES,
        }))
        .send()
        .await
        .map_err(|error| format!("调用 chat-prefix completion 失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误详情".to_string());

        return Err(format!("Chat prefix completion API error ({status}): {body}"));
    }

    let payload = response
        .json::<DeepSeekChatCompletionResponse>()
        .await
        .map_err(|error| format!("解析 chat-prefix 响应失败: {error}"))?;

    Ok(payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .unwrap_or_default())
}

pub async fn generate_completion(
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<CompletionResult, String> {
    let client = Client::new();

    match request.mode.unwrap_or(CompletionMode::Auto) {
        CompletionMode::Fim => {
            if !config.fim_enabled {
                return Err("FIM 补全已在 AI 设置中关闭".to_string());
            }

            let text = request_fim_completion(&client, config, request).await?;

            Ok(CompletionResult {
                mode: CompletionResultMode::Fim,
                text,
            })
        }
        CompletionMode::ChatPrefix => {
            let text = request_chat_prefix_completion(&client, config, request).await?;

            Ok(CompletionResult {
                mode: CompletionResultMode::ChatPrefix,
                text,
            })
        }
        CompletionMode::Auto => {
            if has_suffix(request) && config.fim_enabled {
                let text = request_fim_completion(&client, config, request).await?;

                return Ok(CompletionResult {
                    mode: CompletionResultMode::Fim,
                    text,
                });
            }

            let text = request_chat_prefix_completion(&client, config, request).await?;

            Ok(CompletionResult {
                mode: CompletionResultMode::ChatPrefix,
                text,
            })
        }
    }
}
