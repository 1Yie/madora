use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        common::{
            detect_error_payload, join_url, parse_success_json, read_error_body, resolve_api_key,
            resolve_model, send_with_status_retries, stream_sse_response, summarize_error_body,
            take_text_completion, TextCompletionResponse, MAX_COMPLETION_TOKENS,
            NON_STREAM_REQUEST_TIMEOUT, STOP_SEQUENCES,
        },
        default_api_url, default_model, resolve_api_url, CompletionProvider,
    },
};

/// Defaults live in `providers::default_*` so the request and the completion
/// cache key can never resolve different values.
fn default_model_name() -> &'static str {
    default_model(AiProvider::DeepSeek).unwrap_or_default()
}

fn default_url() -> &'static str {
    default_api_url(AiProvider::DeepSeek).unwrap_or_default()
}

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
        let model = resolve_model(config, default_model_name())?;
        let has_suffix = request
            .suffix
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty());
        let (max_tokens, stop, temperature) = if has_suffix {
            (MAX_COMPLETION_TOKENS, STOP_SEQUENCES, 0.3)
        } else {
            (
                64usize,
                &["\n\n", "\n", "。", ".", "！", "?", "!"] as &[&str],
                0.2,
            )
        };

        let response = send_with_status_retries(|| {
            client
                .post(join_url(&api_url, "/completions"))
                .bearer_auth(api_key)
                .timeout(NON_STREAM_REQUEST_TIMEOUT)
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
        })
        .await
        .map_err(|error| {
            let err = error.to_string();
            i18n::tf(
                "ai.provider.request_failed",
                &[("provider", "DeepSeek"), ("error", &err)],
            )
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = read_error_body(response).await;

            let status_str = status.as_u16().to_string();
            return Err(i18n::tf(
                "ai.provider.api_error",
                &[
                    ("provider", "DeepSeek"),
                    ("status", &status_str),
                    ("body", &summarize_error_body(&body)),
                ],
            ));
        }

        let payload = parse_success_json::<TextCompletionResponse>("DeepSeek", response).await?;

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
        let model = resolve_model(config, default_model_name())?;
        let has_suffix = request
            .suffix
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty());
        let (max_tokens, stop, temperature) = if has_suffix {
            (MAX_COMPLETION_TOKENS, STOP_SEQUENCES, 0.3)
        } else {
            (
                64usize,
                &["\n\n", "\n", "。", ".", "！", "?", "!"] as &[&str],
                0.2,
            )
        };

        let response = send_with_status_retries(|| {
            client
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
        })
        .await
        .map_err(|error| {
            let err = error.to_string();
            i18n::tf(
                "ai.provider.request_stream_failed",
                &[("provider", "DeepSeek"), ("error", &err)],
            )
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = read_error_body(response).await;

            let status_str = status.as_u16().to_string();
            return Err(i18n::tf(
                "ai.provider.stream_api_error",
                &[
                    ("provider", "DeepSeek"),
                    ("status", &status_str),
                    ("body", &summarize_error_body(&body)),
                ],
            ));
        }

        let mut completion = String::new();
        stream_sse_response(response, |event| {
            if event.data == "[DONE]" {
                return Ok(());
            }

            if let Some(message) = detect_error_payload(&event.data) {
                return Err(i18n::tf(
                    "ai.provider.stream_api_error",
                    &[
                        ("provider", "DeepSeek"),
                        ("status", "200"),
                        ("body", &message),
                    ],
                ));
            }

            let payload =
                serde_json::from_str::<TextCompletionResponse>(&event.data).map_err(|error| {
                    let err = error.to_string();
                    i18n::tf(
                        "ai.provider.parse_stream_response_failed",
                        &[("provider", "DeepSeek"), ("error", &err)],
                    )
                })?;
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
    let base_url = resolve_api_url(config, default_url())?;

    if base_url.ends_with("/beta") {
        return Ok(base_url);
    }

    Ok(format!("{base_url}/beta"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The cache key resolves the model/URL through `providers::default_*`;
    /// the request must use the very same values or a cached completion could
    /// be served for a different model than the one actually asked.
    #[test]
    fn request_defaults_match_the_ones_the_cache_key_uses() {
        let config = AiCompletionConfig::default();

        assert_eq!(
            resolve_model(&config, default_model(AiProvider::DeepSeek).unwrap()).unwrap(),
            default_model(AiProvider::DeepSeek).unwrap()
        );
        assert_eq!(
            resolve_beta_api_url(&config).unwrap(),
            format!("{}/beta", default_api_url(AiProvider::DeepSeek).unwrap())
        );
    }
}
