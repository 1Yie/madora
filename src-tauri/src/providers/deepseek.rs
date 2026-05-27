use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        common::{
            join_url, resolve_api_key, resolve_model, take_text_completion,
            stream_sse_response, TextCompletionResponse, MAX_COMPLETION_TOKENS,
            STOP_SEQUENCES,
        },
        CompletionProvider,
    },
};

const DEFAULT_API_URL: &str = "https://api.deepseek.com";
const DEFAULT_MODEL: &str = "deepseek-v4-flash";

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
        let has_suffix = request.suffix.as_deref().is_some_and(|s| !s.trim().is_empty());
        let (max_tokens, stop, temperature) = if has_suffix {
            (MAX_COMPLETION_TOKENS, STOP_SEQUENCES, 0.3)
        } else {
            (64usize, &["\n\n", "\n", "。", ".", "！", "?", "!"] as &[&str], 0.2)
        };

        let response = client
            .post(join_url(&api_url, "/completions"))
            .bearer_auth(api_key)
            .json(&json!({
                "model": model,
                "prompt": request.prefix.as_str(),
                "suffix": request.suffix.as_deref(),
                "max_tokens": max_tokens,
                "temperature": temperature,
                "frequency_penalty": 0.3,
                "presence_penalty": 0.1,
                "stop": stop,
                "thinking": { "type": "disabled" },
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

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        _prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        let api_key = resolve_api_key(config)?;
        let api_url = resolve_beta_api_url(config)?;
        let model = resolve_model(config, DEFAULT_MODEL)?;
        let has_suffix = request.suffix.as_deref().is_some_and(|s| !s.trim().is_empty());
        let (max_tokens, stop, temperature) = if has_suffix {
            (MAX_COMPLETION_TOKENS, STOP_SEQUENCES, 0.3)
        } else {
            (64usize, &["\n\n", "\n", "。", ".", "！", "?", "!"] as &[&str], 0.2)
        };

        let response = client
            .post(join_url(&api_url, "/completions"))
            .bearer_auth(api_key)
            .json(&json!({
                "model": model,
                "prompt": request.prefix.as_str(),
                "suffix": request.suffix.as_deref(),
                "max_tokens": max_tokens,
                "temperature": temperature,
                "frequency_penalty": 0.3,
                "presence_penalty": 0.1,
                "stop": stop,
                "thinking": { "type": "disabled" },
                "stream": true,
            }))
            .send()
            .await
            .map_err(|error| format!("调用流式 FIM completion 失败: {error}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "无法读取错误详情".to_string());

            return Err(format!("流式 FIM completion API error ({status}): {body}"));
        }

        let mut completion = String::new();
        stream_sse_response(response, |event| {
            if event.data == "[DONE]" {
                return Ok(());
            }

            let payload = serde_json::from_str::<TextCompletionResponse>(&event.data)
                .map_err(|error| format!("解析流式 FIM 响应失败: {error}"))?;
            let chunk = take_text_completion(payload);
            if chunk.is_empty() {
                return Ok(());
            }

            completion.push_str(&chunk);
            on_chunk(chunk)
        })
        .await?;

        Ok(completion)
    }
}

fn resolve_beta_api_url(config: &AiCompletionConfig) -> Result<String, String> {
    let base_url = crate::providers::resolve_api_url(config, DEFAULT_API_URL)?;

    if base_url.ends_with("/beta") {
        return Ok(base_url);
    }

    Ok(format!("{base_url}/beta"))
}
