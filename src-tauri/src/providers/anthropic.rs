use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        common::{build_prompt_context, join_url, resolve_api_key, MAX_COMPLETION_TOKENS, STOP_SEQUENCES},
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
        request_anthropic_message_completion(
            self.provider(),
            client,
            prompt_manager,
            config,
            request,
            "fim_system",
            "fim_user",
            0.3,
        )
        .await
    }

    async fn request_chat_prefix_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        request_anthropic_message_completion(
            self.provider(),
            client,
            prompt_manager,
            config,
            request,
            "chat_prefix_system",
            "chat_prefix_user",
            0.5,
        )
        .await
    }
}

async fn request_anthropic_message_completion(
    provider: AiProvider,
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    system_prompt_name: &str,
    user_prompt_name: &str,
    temperature: f32,
) -> Result<String, String> {
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_context = build_prompt_context(request);
    let system_prompt = prompt_manager.render_prompt(provider, system_prompt_name, &prompt_context);
    let user_prompt = prompt_manager.render_prompt(provider, user_prompt_name, &prompt_context);
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
            "max_tokens": MAX_COMPLETION_TOKENS,
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
