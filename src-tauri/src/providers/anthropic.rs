use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        common::{
            build_prompt_context, join_url, resolve_api_key, stream_sse_response,
            MAX_COMPLETION_TOKENS, STOP_SEQUENCES,
        },
        default_api_url, default_model, resolve_api_url, resolve_model, CompletionProvider,
    },
};

const ANTHROPIC_API_VERSION: &str = "2023-06-01";

#[derive(Deserialize)]
struct AnthropicTextBlock {
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicMessageResponse {
    content: Option<Vec<AnthropicTextBlock>>,
}

#[derive(Deserialize)]
struct AnthropicStreamDelta {
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicStreamContentBlock {
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicMessageStreamResponse {
    content_block: Option<AnthropicStreamContentBlock>,
    delta: Option<AnthropicStreamDelta>,
}

pub struct AnthropicProvider;

#[async_trait]
impl CompletionProvider for AnthropicProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::Anthropic
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        request_anthropic_compatible_fim(client, prompt_manager, config, request).await
    }

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        request_anthropic_compatible_fim_stream(
            client,
            prompt_manager,
            config,
            request,
            on_chunk,
        )
        .await
    }
}

pub(crate) async fn request_anthropic_compatible_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::Anthropic);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(provider, "fim_system", &prompt_context);
    let user_prompt =
        prompt_manager.render_prompt(provider, "fim_user", &prompt_context);

    let has_suffix = request.suffix.as_deref().is_some_and(|s| !s.trim().is_empty());
    let (max_tokens, temperature) = if has_suffix {
        (MAX_COMPLETION_TOKENS, 0.3)
    } else {
        (64usize, 0.2)
    };

    let response = client
        .post(join_url(&api_url, "/v1/messages"))
        .header("anthropic-version", ANTHROPIC_API_VERSION)
        .header("x-api-key", api_key)
        .json(&json!({
            "model": model,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stop_sequences": STOP_SEQUENCES,
        }))
        .send()
        .await
        .map_err(|error| format!("调用 {} completion 失败: {error}", provider.display_name()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误详情".to_string());

        return Err(format!(
            "{} completion API error ({status}): {body}",
            provider.display_name()
        ));
    }

    let payload = response
        .json::<AnthropicMessageResponse>()
        .await
        .map_err(|error| format!("解析 {} 响应失败: {error}", provider.display_name()))?;

    Ok(payload
        .content
        .and_then(|content| content.into_iter().next())
        .and_then(|block| block.text)
        .unwrap_or_default())
}

pub(crate) async fn request_anthropic_compatible_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::Anthropic);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_context = build_prompt_context(request);
    let system_prompt = prompt_manager.render_prompt(provider, "fim_system", &prompt_context);
    let user_prompt = prompt_manager.render_prompt(provider, "fim_user", &prompt_context);

    let has_suffix = request.suffix.as_deref().is_some_and(|s| !s.trim().is_empty());
    let (max_tokens, temperature) = if has_suffix {
        (MAX_COMPLETION_TOKENS, 0.3)
    } else {
        (64usize, 0.2)
    };

    let response = client
        .post(join_url(&api_url, "/v1/messages"))
        .header("anthropic-version", ANTHROPIC_API_VERSION)
        .header("x-api-key", api_key)
        .json(&json!({
            "model": model,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stop_sequences": STOP_SEQUENCES,
            "stream": true,
        }))
        .send()
        .await
        .map_err(|error| format!("调用 {} 流式 completion 失败: {error}", provider.display_name()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误详情".to_string());

        return Err(format!(
            "{} 流式 completion API error ({status}): {body}",
            provider.display_name()
        ));
    }

    let mut completion = String::new();
    stream_sse_response(response, |event| {
        let payload = serde_json::from_str::<AnthropicMessageStreamResponse>(&event.data)
            .map_err(|error| format!("解析 {} 流式响应失败: {error}", provider.display_name()))?;
        let chunk = take_anthropic_stream_text(payload);
        if chunk.is_empty() {
            return Ok(());
        }

        completion.push_str(&chunk);
        on_chunk(chunk)
    })
    .await?;

    Ok(completion)
}

fn take_anthropic_stream_text(payload: AnthropicMessageStreamResponse) -> String {
    payload
        .delta
        .and_then(|delta| delta.text)
        .or(payload.content_block.and_then(|block| block.text))
        .unwrap_or_default()
}
