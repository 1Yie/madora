use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        common::{
            build_prompt_context, join_url, resolve_api_key, take_chat_completion,
            ChatCompletionResponse, MAX_COMPLETION_TOKENS, STOP_SEQUENCES,
        },
        default_api_url, default_model, resolve_api_url, resolve_model, CompletionProvider,
    },
};

pub struct OpenAiProvider;

#[async_trait]
impl CompletionProvider for OpenAiProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::OpenAi
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        request_openai_compatible_fim(client, prompt_manager, config, request).await
    }
}

pub(crate) async fn request_openai_compatible_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::OpenAi);
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
        .post(join_url(&api_url, "/v1/chat/completions"))
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stop": STOP_SEQUENCES,
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
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|error| format!("解析 {} 响应失败: {error}", provider.display_name()))?;

    Ok(take_chat_completion(payload))
}
