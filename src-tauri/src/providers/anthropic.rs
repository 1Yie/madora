use async_trait::async_trait;
use reqwest::{Client, RequestBuilder};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_anthropic_compatible, PromptManager},
    providers::{
        common::{
            build_prompt_context, detect_error_payload, join_url, parse_success_json,
            read_error_body, resolve_api_key, send_with_status_retries, stream_sse_response,
            summarize_error_body, CompletionParams, OpenEndedStop, NON_STREAM_REQUEST_TIMEOUT,
        },
        default_api_url, default_model, resolve_api_url, resolve_model, CompletionProvider,
    },
};

const ANTHROPIC_API_VERSION: &str = "2023-06-01";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AnthropicAuthMode {
    Bearer,
    XApiKey,
}

#[derive(Deserialize)]
struct AnthropicTextBlock {
    text: Option<String>,
    /// `text`, `thinking`, `tool_use`, ... Only text blocks are completion
    /// output.
    #[serde(rename = "type")]
    block_type: Option<String>,
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
        request_anthropic_compatible_fim_stream(client, prompt_manager, config, request, on_chunk)
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
    let prompt_profile = prompt_profile_for_anthropic_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload = build_anthropic_compatible_payload(
        provider,
        model,
        system_prompt,
        user_prompt,
        params,
        false,
    );

    let response = send_with_status_retries(|| {
        apply_anthropic_auth(
            client
                .post(join_url(&api_url, "/v1/messages"))
                .header("anthropic-version", ANTHROPIC_API_VERSION)
                .timeout(NON_STREAM_REQUEST_TIMEOUT)
                .json(&payload),
            auth_mode_for_provider(provider),
            api_key,
        )
    })
    .await
    .map_err(|error| {
        let err = error.to_string();
        i18n::tf(
            "ai.provider.request_failed",
            &[("provider", provider.display_name()), ("error", &err)],
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = read_error_body(response).await;

        let status_str = status.as_u16().to_string();
        return Err(i18n::tf(
            "ai.provider.api_error",
            &[
                ("provider", provider.display_name()),
                ("status", &status_str),
                ("body", &summarize_error_body(&body)),
            ],
        ));
    }

    let payload =
        parse_success_json::<AnthropicMessageResponse>(provider.display_name(), response).await?;

    Ok(take_anthropic_text(payload))
}

/// Joins every text block of a response. Models that think first (MiniMax,
/// Qwen and other Anthropic-compatible endpoints) put a `thinking` block ahead
/// of the answer, and an answer may be split across several text blocks, so
/// taking only the first block would return nothing or a fragment.
fn take_anthropic_text(payload: AnthropicMessageResponse) -> String {
    payload
        .content
        .unwrap_or_default()
        .into_iter()
        .filter(|block| matches!(block.block_type.as_deref(), None | Some("text")))
        .filter_map(|block| block.text)
        .collect()
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
    let prompt_profile = prompt_profile_for_anthropic_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload = build_anthropic_compatible_payload(
        provider,
        model,
        system_prompt,
        user_prompt,
        params,
        true,
    );

    let response = send_with_status_retries(|| {
        apply_anthropic_auth(
            client
                .post(join_url(&api_url, "/v1/messages"))
                .header("anthropic-version", ANTHROPIC_API_VERSION)
                .json(&payload),
            auth_mode_for_provider(provider),
            api_key,
        )
    })
    .await
    .map_err(|error| {
        let err = error.to_string();
        i18n::tf(
            "ai.provider.request_stream_failed",
            &[("provider", provider.display_name()), ("error", &err)],
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = read_error_body(response).await;

        let status_str = status.as_u16().to_string();
        return Err(i18n::tf(
            "ai.provider.stream_api_error",
            &[
                ("provider", provider.display_name()),
                ("status", &status_str),
                ("body", &summarize_error_body(&body)),
            ],
        ));
    }

    let mut completion = String::new();
    stream_sse_response(response, |event| {
        if let Some(message) = detect_error_payload(&event.data) {
            return Err(i18n::tf(
                "ai.provider.stream_api_error",
                &[
                    ("provider", provider.display_name()),
                    ("status", "200"),
                    ("body", &message),
                ],
            ));
        }

        let payload = serde_json::from_str::<AnthropicMessageStreamResponse>(&event.data).map_err(
            |error| {
                let err = error.to_string();
                i18n::tf(
                    "ai.provider.parse_stream_response_failed",
                    &[("provider", provider.display_name()), ("error", &err)],
                )
            },
        )?;
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

fn auth_mode_for_provider(provider: AiProvider) -> AnthropicAuthMode {
    match provider {
        AiProvider::MiniMax | AiProvider::MiniMaxCoding => AnthropicAuthMode::Bearer,
        _ => AnthropicAuthMode::XApiKey,
    }
}

fn apply_anthropic_auth(
    request: RequestBuilder,
    auth_mode: AnthropicAuthMode,
    api_key: &str,
) -> RequestBuilder {
    match auth_mode {
        AnthropicAuthMode::Bearer => request.bearer_auth(api_key),
        AnthropicAuthMode::XApiKey => request.header("x-api-key", api_key),
    }
}

fn build_anthropic_compatible_payload(
    provider: AiProvider,
    model: &str,
    system_prompt: String,
    user_prompt: String,
    params: CompletionParams,
    stream: bool,
) -> Value {
    let mut payload = json!({
        "model": model,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": user_prompt,
            }
        ],
        "max_tokens": params.max_tokens,
        "temperature": params.temperature,
        "stop_sequences": params.stop,
    });

    if let Some(object) = payload.as_object_mut() {
        if stream {
            object.insert("stream".to_string(), json!(true));
        }

        // Native Anthropic requests are thinking-off by omission, but some
        // Anthropic-compatible Qwen endpoints default to thinking-on unless the
        // request explicitly disables it.
        let lower_model = model.to_ascii_lowercase();
        if should_disable_anthropic_thinking(provider, &lower_model) {
            object.insert("thinking".to_string(), json!({ "type": "disabled" }));
        }
    }

    payload
}

fn should_disable_anthropic_thinking(provider: AiProvider, lower_model: &str) -> bool {
    !matches!(provider, AiProvider::Anthropic) && lower_model.starts_with("qwen")
}

#[cfg(test)]
mod tests {
    use super::{
        auth_mode_for_provider, build_anthropic_compatible_payload,
        should_disable_anthropic_thinking, AnthropicAuthMode,
    };
    use crate::models::ai::AiProvider;
    use crate::providers::common::{CompletionParams, STOP_SEQUENCES};
    use serde_json::json;

    #[test]
    fn uses_bearer_auth_for_minimax_compatible_providers() {
        assert_eq!(
            auth_mode_for_provider(AiProvider::MiniMax),
            AnthropicAuthMode::Bearer
        );
        assert_eq!(
            auth_mode_for_provider(AiProvider::MiniMaxCoding),
            AnthropicAuthMode::Bearer
        );
        assert_eq!(
            auth_mode_for_provider(AiProvider::Anthropic),
            AnthropicAuthMode::XApiKey
        );
    }

    #[test]
    fn disables_qwen_thinking_for_anthropic_compatibility() {
        assert!(should_disable_anthropic_thinking(
            AiProvider::OpenCodeGo,
            "qwen3.7-max"
        ));
        assert!(should_disable_anthropic_thinking(
            AiProvider::Custom,
            "qwen3.6-plus"
        ));
        assert!(!should_disable_anthropic_thinking(
            AiProvider::Anthropic,
            "claude-sonnet-4-5"
        ));
    }

    #[test]
    fn adds_explicit_thinking_disable_to_qwen_payload() {
        let payload = build_anthropic_compatible_payload(
            AiProvider::OpenCodeZen,
            "qwen3.7-max",
            "system".to_string(),
            "user".to_string(),
            CompletionParams {
                max_tokens: 64,
                temperature: 0.2,
                stop: STOP_SEQUENCES,
            },
            true,
        );

        assert_eq!(payload["thinking"], json!({ "type": "disabled" }));
        assert_eq!(payload["stream"], json!(true));
    }

    #[test]
    fn leaves_claude_payload_without_explicit_thinking_override() {
        let payload = build_anthropic_compatible_payload(
            AiProvider::Anthropic,
            "claude-3-5-sonnet-latest",
            "system".to_string(),
            "user".to_string(),
            CompletionParams {
                max_tokens: 64,
                temperature: 0.2,
                stop: STOP_SEQUENCES,
            },
            false,
        );

        assert!(payload.get("thinking").is_none());
    }

    #[test]
    fn payload_carries_the_shared_completion_params() {
        let params = CompletionParams {
            max_tokens: 123,
            temperature: 0.5,
            stop: &["X", "Y"],
        };
        let payload = build_anthropic_compatible_payload(
            AiProvider::Anthropic,
            "claude-sonnet-4-6",
            "system".to_string(),
            "user".to_string(),
            params,
            false,
        );

        assert_eq!(payload["max_tokens"], json!(123));
        assert_eq!(payload["temperature"], json!(0.5));
        assert_eq!(payload["stop_sequences"], json!(["X", "Y"]));
    }

    // ─── end to end against a scripted local server ─────────────────

    use crate::models::ai::{AiCompletionConfig, CompletionRequest};
    use crate::prompt::PromptManager;
    use crate::providers::test_support::{MockServer, ScriptedResponse};
    use reqwest::Client;

    fn e2e_config(server: &MockServer, provider: AiProvider, model: &str) -> AiCompletionConfig {
        AiCompletionConfig {
            api_key: "sk-test-key".into(),
            api_url: Some(server.base_url.clone()),
            model: Some(model.into()),
            provider: Some(provider),
            use_ssl: false,
            ..Default::default()
        }
    }

    fn e2e_request(suffix: Option<&str>) -> CompletionRequest {
        CompletionRequest {
            title: Some("Notes".into()),
            prefix: "Hello, wor".into(),
            suffix: suffix.map(str::to_string),
        }
    }

    async fn anthropic_complete(
        server: &MockServer,
        provider: AiProvider,
        suffix: Option<&str>,
    ) -> Result<String, String> {
        super::request_anthropic_compatible_fim(
            &Client::new(),
            &PromptManager::from_user_root(None),
            &e2e_config(server, provider, "claude-test"),
            &e2e_request(suffix),
        )
        .await
    }

    async fn anthropic_stream(
        server: &MockServer,
        provider: AiProvider,
    ) -> (Result<String, String>, Vec<String>) {
        let mut chunks = Vec::new();
        let result = super::request_anthropic_compatible_fim_stream(
            &Client::new(),
            &PromptManager::from_user_root(None),
            &e2e_config(server, provider, "claude-test"),
            &e2e_request(None),
            &mut |chunk| {
                chunks.push(chunk);
                Ok(())
            },
        )
        .await;

        (result, chunks)
    }

    const MESSAGE_OK: &str =
        r#"{"content":[{"type":"text","text":"ld"},{"type":"text","text":"!"}]}"#;

    #[tokio::test]
    async fn anthropic_authenticates_with_x_api_key_and_a_version_header() {
        let server = MockServer::start(vec![ScriptedResponse::json(200, MESSAGE_OK)]).await;

        let text = anthropic_complete(&server, AiProvider::Anthropic, None).await;

        assert_eq!(text.as_deref(), Ok("ld!"));
        let sent = &server.requests()[0];
        assert_eq!(sent.path, "/v1/messages");
        assert_eq!(sent.header("x-api-key"), Some("sk-test-key"));
        assert_eq!(sent.header("anthropic-version"), Some("2023-06-01"));
        assert_eq!(sent.header("authorization"), None);
        let body = sent.json();
        assert!(body["system"].as_str().is_some());
        assert_eq!(body["messages"][0]["role"], json!("user"));
    }

    #[tokio::test]
    async fn minimax_uses_bearer_auth_on_the_anthropic_protocol() {
        for provider in [AiProvider::MiniMax, AiProvider::MiniMaxCoding] {
            let server = MockServer::start(vec![ScriptedResponse::json(200, MESSAGE_OK)]).await;

            let text = anthropic_complete(&server, provider, None).await;

            assert_eq!(text.as_deref(), Ok("ld!"), "{provider:?}");
            let sent = &server.requests()[0];
            assert_eq!(sent.header("authorization"), Some("Bearer sk-test-key"));
            assert_eq!(sent.header("x-api-key"), None);
        }
    }

    #[tokio::test]
    async fn anthropic_streams_text_deltas_and_ignores_other_events() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"m\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"ld\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"!\"}}\n\n",
            "event: ping\ndata: {\"type\":\"ping\"}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        ])])
        .await;

        let (result, chunks) = anthropic_stream(&server, AiProvider::Anthropic).await;

        assert_eq!(result.as_deref(), Ok("ld!"));
        assert_eq!(chunks, vec!["ld", "!"]);
        assert_eq!(server.requests()[0].json()["stream"], json!(true));
    }

    #[tokio::test]
    async fn anthropic_stream_error_event_fails_the_request() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"part\"}}\n\n",
            "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n",
        ])])
        .await;

        let (result, chunks) = anthropic_stream(&server, AiProvider::Anthropic).await;

        assert!(result.unwrap_err().contains("Overloaded"));
        assert_eq!(chunks, vec!["part"]);
    }

    #[tokio::test]
    async fn anthropic_http_error_and_retry_behave_like_the_others() {
        let failing = MockServer::start(vec![ScriptedResponse::json(
            401,
            r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#,
        )])
        .await;
        let error = anthropic_complete(&failing, AiProvider::Anthropic, None)
            .await
            .unwrap_err();
        assert!(error.contains("invalid x-api-key"), "{error}");
        assert!(!error.contains("sk-test-key"));
        assert_eq!(failing.request_count(), 1);

        let flaky = MockServer::start(vec![
            ScriptedResponse::json(503, r#"{"error":{"message":"busy"}}"#)
                .with_header("retry-after", "0"),
            ScriptedResponse::json(200, MESSAGE_OK),
        ])
        .await;
        assert_eq!(
            anthropic_complete(&flaky, AiProvider::Anthropic, None)
                .await
                .as_deref(),
            Ok("ld!")
        );
        assert_eq!(flaky.request_count(), 2);
    }

    #[tokio::test]
    async fn anthropic_http_200_carrying_an_error_is_an_error() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            200,
            r#"{"type":"error","error":{"type":"api_error","message":"internal"}}"#,
        )])
        .await;

        let error = anthropic_complete(&server, AiProvider::Anthropic, None)
            .await
            .unwrap_err();

        assert!(error.contains("internal"), "{error}");
    }

    #[tokio::test]
    async fn anthropic_skips_thinking_blocks_and_joins_text_blocks() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            200,
            r#"{"content":[{"type":"thinking","thinking":"let me think","signature":"x"},{"type":"text","text":"ld"},{"type":"text","text":"!"}]}"#,
        )])
        .await;

        let text = anthropic_complete(&server, AiProvider::MiniMax, None).await;

        assert_eq!(text.as_deref(), Ok("ld!"));
    }

    #[tokio::test]
    async fn anthropic_ignores_tool_use_blocks() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            200,
            r#"{"content":[{"type":"text","text":"ok"},{"type":"tool_use","id":"t","name":"n","input":{}}]}"#,
        )])
        .await;

        let text = anthropic_complete(&server, AiProvider::Anthropic, None).await;

        assert_eq!(text.as_deref(), Ok("ok"));
    }
}
