use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        build_prompt_context,
        common::{
            detect_error_payload, join_url, parse_success_json, read_error_body, resolve_api_key,
            resolve_model, send_with_status_retries, stream_sse_response, summarize_error_body,
            take_text_completion, CompletionParams, OpenEndedStop, TextCompletionResponse,
            NON_STREAM_REQUEST_TIMEOUT,
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
        let payload = build_payload(model, request, false);

        let response = send_with_status_retries(|| {
            client
                .post(join_url(&api_url, "/completions"))
                .bearer_auth(api_key)
                .timeout(NON_STREAM_REQUEST_TIMEOUT)
                .json(&payload)
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
        let payload = build_payload(model, request, true);

        let response = send_with_status_retries(|| {
            client
                .post(join_url(&api_url, "/completions"))
                .bearer_auth(api_key)
                .json(&payload)
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

/// Request body for DeepSeek's raw `/completions` endpoint.
///
/// The text comes from the same bounded `build_prompt_context` every other
/// provider uses, so the completion cache key (derived from it too) always
/// describes what was actually sent.
fn build_payload(model: &str, request: &CompletionRequest, stream: bool) -> serde_json::Value {
    let params = CompletionParams::for_request(request, OpenEndedStop::Sentence);
    let context = build_prompt_context(request);
    let suffix = (!context.suffix.is_empty()).then_some(context.suffix.as_str());

    let mut payload = json!({
        "model": model,
        "prompt": context.prefix,
        "suffix": suffix,
        "max_tokens": params.max_tokens,
        "temperature": params.temperature,
        "frequency_penalty": 0.3,
        "presence_penalty": 0.1,
        "stop": params.stop,
        "thinking": { "type": "disabled" },
    });

    if stream {
        payload["stream"] = json!(true);
    }

    payload
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

    use crate::providers::common::{
        MAX_CHAT_PREFIX_CHARS, MAX_CHAT_SUFFIX_CHARS, MAX_COMPLETION_TOKENS, MAX_OPEN_ENDED_TOKENS,
    };

    fn request(prefix: String, suffix: Option<String>) -> CompletionRequest {
        CompletionRequest {
            title: None,
            prefix,
            suffix,
        }
    }

    #[test]
    fn payload_sends_only_the_bounded_context() {
        let long_prefix = format!("{}{}", "H".repeat(500), "p".repeat(MAX_CHAT_PREFIX_CHARS));
        let long_suffix = format!("{}{}", "s".repeat(MAX_CHAT_SUFFIX_CHARS), "T".repeat(500));

        let payload = build_payload("m", &request(long_prefix, Some(long_suffix)), false);

        let prompt = payload["prompt"].as_str().unwrap();
        let suffix = payload["suffix"].as_str().unwrap();
        assert_eq!(prompt.chars().count(), MAX_CHAT_PREFIX_CHARS);
        assert!(
            !prompt.contains('H'),
            "the start of an over-long prefix is dropped"
        );
        assert_eq!(suffix.chars().count(), MAX_CHAT_SUFFIX_CHARS);
        assert!(
            !suffix.contains('T'),
            "the end of an over-long suffix is dropped"
        );
    }

    #[test]
    fn payload_omits_an_empty_suffix_and_stops_at_sentence_ends() {
        for suffix in [None, Some(String::new())] {
            let payload = build_payload("m", &request("hello".into(), suffix), false);

            assert!(payload["suffix"].is_null());
            assert_eq!(payload["max_tokens"], json!(MAX_OPEN_ENDED_TOKENS));
            assert!(payload["stop"].as_array().unwrap().contains(&json!("\n")));
        }
    }

    #[test]
    fn payload_with_a_suffix_uses_the_shared_budget_and_stops() {
        let payload = build_payload("m", &request("a".into(), Some("b".into())), false);

        assert_eq!(payload["max_tokens"], json!(MAX_COMPLETION_TOKENS));
        assert_eq!(
            payload["stop"],
            json!(crate::providers::common::STOP_SEQUENCES)
        );
    }

    #[test]
    fn only_the_streaming_payload_sets_stream() {
        let plain = build_payload("m", &request("a".into(), None), false);
        let streaming = build_payload("m", &request("a".into(), None), true);

        assert!(plain.get("stream").is_none());
        assert_eq!(streaming["stream"], json!(true));
    }
}
