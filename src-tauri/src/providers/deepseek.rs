use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        common::{
            build_prompt_context, join_url, resolve_api_key, resolve_model, take_chat_completion,
            take_text_completion, ChatCompletionResponse, TextCompletionResponse,
            MAX_COMPLETION_TOKENS, STOP_SEQUENCES,
        },
        CompletionProvider,
    },
};

const DEFAULT_API_URL: &str = "https://api.deepseek.com";
const DEFAULT_MODEL: &str = "deepseek-v4-pro";

pub struct DeepSeekProvider;

#[async_trait]
impl CompletionProvider for DeepSeekProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::DeepSeek
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        _prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        let api_key = resolve_api_key(config)?;
        let api_url = resolve_beta_api_url(config)?;
        let model = resolve_model(config, DEFAULT_MODEL)?;
        let response = client
            .post(join_url(&api_url, "/completions"))
            .bearer_auth(api_key)
            .json(&json!({
                "model": model,
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
            .json::<TextCompletionResponse>()
            .await
            .map_err(|error| format!("解析 FIM completion 响应失败: {error}"))?;

        Ok(take_text_completion(payload))
    }

    async fn request_chat_prefix_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        let api_key = resolve_api_key(config)?;
        let api_url = resolve_beta_api_url(config)?;
        let model = resolve_model(config, DEFAULT_MODEL)?;
        let prompt_context = build_prompt_context(request);
        let system_prompt =
            prompt_manager.render_prompt(self.provider(), "chat_prefix_system", &prompt_context);
        let user_prompt =
            prompt_manager.render_prompt(self.provider(), "chat_prefix_user", &prompt_context);
        let response = client
            .post(join_url(&api_url, "/chat/completions"))
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
            .json::<ChatCompletionResponse>()
            .await
            .map_err(|error| format!("解析 chat-prefix 响应失败: {error}"))?;

        Ok(take_chat_completion(payload))
    }
}

fn resolve_beta_api_url(config: &AiCompletionConfig) -> Result<String, String> {
    let base_url = crate::providers::resolve_api_url(config, DEFAULT_API_URL)?;

    if base_url.ends_with("/beta") {
        return Ok(base_url);
    }

    Ok(format!("{base_url}/beta"))
}
