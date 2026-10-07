use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_openai_compatible, PromptManager},
    providers::{
        common::{
            build_prompt_context, detect_error_payload, join_url, parse_success_json,
            read_error_body, resolve_api_key, send_with_status_retries, stream_sse_response,
            summarize_error_body, take_chat_completion, ChatCompletionMessage,
            ChatCompletionResponse, CompletionParams, OpenEndedStop, NON_STREAM_REQUEST_TIMEOUT,
        },
        default_api_url, default_model, resolve_api_url, resolve_model, CompletionProvider,
    },
};

#[derive(Deserialize)]
struct ChatCompletionDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct StreamingChatCompletionChoice {
    delta: Option<ChatCompletionDelta>,
    message: Option<ChatCompletionMessage>,
    text: Option<String>,
}

#[derive(Deserialize)]
struct StreamingChatCompletionResponse {
    choices: Option<Vec<StreamingChatCompletionChoice>>,
}

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

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        request_openai_compatible_fim_stream(client, prompt_manager, config, request, on_chunk)
            .await
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
    let prompt_profile = prompt_profile_for_openai_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload =
        build_openai_compatible_payload(provider, model, system_prompt, user_prompt, params, false);

    let response = send_with_status_retries(|| {
        client
            .post(join_url(&api_url, "/v1/chat/completions"))
            .bearer_auth(api_key)
            .timeout(NON_STREAM_REQUEST_TIMEOUT)
            .json(&payload)
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
        parse_success_json::<ChatCompletionResponse>(provider.display_name(), response).await?;

    Ok(take_chat_completion(payload))
}

pub(crate) async fn request_openai_compatible_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::OpenAi);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_openai_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload =
        build_openai_compatible_payload(provider, model, system_prompt, user_prompt, params, true);

    let response = send_with_status_retries(|| {
        client
            .post(join_url(&api_url, "/v1/chat/completions"))
            .bearer_auth(api_key)
            .json(&payload)
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
        if event.data == "[DONE]" {
            return Ok(());
        }

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

        let payload = serde_json::from_str::<StreamingChatCompletionResponse>(&event.data)
            .map_err(|error| {
                let err = error.to_string();
                i18n::tf(
                    "ai.provider.parse_stream_response_failed",
                    &[("provider", provider.display_name()), ("error", &err)],
                )
            })?;
        let chunk = take_stream_chat_completion(payload);
        if chunk.is_empty() {
            return Ok(());
        }

        completion.push_str(&chunk);
        on_chunk(chunk)
    })
    .await?;

    Ok(completion)
}

fn take_stream_chat_completion(payload: StreamingChatCompletionResponse) -> String {
    payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| {
            choice
                .delta
                .and_then(|delta| delta.content)
                .or(choice.text)
                .or(choice.message.and_then(|message| message.content))
        })
        .unwrap_or_default()
}

fn build_openai_compatible_payload(
    provider: AiProvider,
    model: &str,
    system_prompt: String,
    user_prompt: String,
    params: CompletionParams,
    stream: bool,
) -> Value {
    let mut payload = json!({
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
        "max_tokens": params.max_tokens,
        "temperature": params.temperature,
        "stop": params.stop,
    });

    if let Some(object) = payload.as_object_mut() {
        if stream {
            object.insert("stream".to_string(), json!(true));
        }

        // Some OpenAI-compatible reasoning models default to thinking-on and can
        // spend the entire completion budget on hidden reasoning. Explicitly turn
        // that off for providers/models that document a compatibility switch.
        let lower_model = model.to_ascii_lowercase();
        if lower_model.starts_with("qwen") {
            object.insert("enable_thinking".to_string(), json!(false));
        } else if should_disable_structured_thinking(provider, &lower_model) {
            object.insert("thinking".to_string(), json!({ "type": "disabled" }));
        }
    }

    payload
}

fn should_disable_structured_thinking(provider: AiProvider, lower_model: &str) -> bool {
    matches!(
        provider,
        AiProvider::DeepSeek | AiProvider::Kimi | AiProvider::Zhipu | AiProvider::ZhipuCoding
    ) || lower_model.starts_with("deepseek-")
        || lower_model.starts_with("glm-")
        || lower_model.starts_with("kimi-")
}

#[cfg(test)]
mod tests {
    use super::{build_openai_compatible_payload, should_disable_structured_thinking};
    use crate::{
        models::ai::AiProvider,
        providers::common::{CompletionParams, STOP_SEQUENCES},
    };
    use serde_json::json;

    #[test]
    fn disables_structured_thinking_for_known_openai_compatible_reasoners() {
        assert!(should_disable_structured_thinking(
            AiProvider::DeepSeek,
            "deepseek-v4-pro"
        ));
        assert!(should_disable_structured_thinking(
            AiProvider::Zhipu,
            "glm-5.2"
        ));
        assert!(should_disable_structured_thinking(
            AiProvider::Kimi,
            "kimi-k2.6"
        ));
        assert!(!should_disable_structured_thinking(
            AiProvider::OpenAi,
            "gpt-4o-mini"
        ));
    }

    #[test]
    fn adds_qwen_thinking_override_to_payload() {
        let payload = build_openai_compatible_payload(
            AiProvider::Custom,
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

        assert_eq!(payload["enable_thinking"], json!(false));
        assert_eq!(payload["stream"], json!(true));
        assert_eq!(payload["stop"], json!(STOP_SEQUENCES));
    }

    #[test]
    fn adds_structured_thinking_override_to_payload() {
        let payload = build_openai_compatible_payload(
            AiProvider::OpenCodeZen,
            "deepseek-v4-pro",
            "system".to_string(),
            "user".to_string(),
            CompletionParams {
                max_tokens: 64,
                temperature: 0.2,
                stop: STOP_SEQUENCES,
            },
            false,
        );

        assert_eq!(payload["thinking"], json!({ "type": "disabled" }));
        assert!(payload.get("stream").is_none());
    }

    #[test]
    fn payload_carries_the_shared_completion_params() {
        let params = CompletionParams {
            max_tokens: 123,
            temperature: 0.5,
            stop: &["X", "Y"],
        };
        let payload = build_openai_compatible_payload(
            AiProvider::OpenAi,
            "gpt-4o-mini",
            "system".to_string(),
            "user".to_string(),
            params,
            false,
        );

        assert_eq!(payload["max_tokens"], json!(123));
        assert_eq!(payload["temperature"], json!(0.5));
        assert_eq!(payload["stop"], json!(["X", "Y"]));
    }

    // ─── end to end against a scripted local server ─────────────────

    use crate::models::ai::{AiCompletionConfig, CompletionRequest};
    use crate::prompt::PromptManager;
    use crate::providers::test_support::{MockServer, ScriptedResponse};
    use crate::providers::CompletionProvider;
    use reqwest::Client;

    fn config(server: &MockServer, provider: AiProvider) -> AiCompletionConfig {
        AiCompletionConfig {
            api_key: "sk-test-key".into(),
            api_url: Some(server.base_url.clone()),
            model: Some("test-model".into()),
            provider: Some(provider),
            use_ssl: false,
            ..Default::default()
        }
    }

    fn request(suffix: Option<&str>) -> CompletionRequest {
        CompletionRequest {
            title: Some("Notes".into()),
            prefix: "Hello, wor".into(),
            suffix: suffix.map(str::to_string),
        }
    }

    async fn complete(
        server: &MockServer,
        provider: AiProvider,
        suffix: Option<&str>,
    ) -> Result<String, String> {
        super::OpenAiProvider
            .request_fim_completion(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &config(server, provider),
                &request(suffix),
            )
            .await
    }

    async fn stream(
        server: &MockServer,
        provider: AiProvider,
        suffix: Option<&str>,
    ) -> (Result<String, String>, Vec<String>) {
        let mut chunks = Vec::new();
        let result = super::OpenAiProvider
            .request_fim_completion_stream(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &config(server, provider),
                &request(suffix),
                &mut |chunk| {
                    chunks.push(chunk);
                    Ok(())
                },
            )
            .await;

        (result, chunks)
    }

    const CHAT_OK: &str = r#"{"choices":[{"message":{"content":"ld!"}}]}"#;

    #[tokio::test]
    async fn openai_sends_an_authenticated_chat_request_and_returns_the_text() {
        let server = MockServer::start(vec![ScriptedResponse::json(200, CHAT_OK)]).await;

        let text = complete(&server, AiProvider::OpenAi, Some(" and more")).await;

        assert_eq!(text.as_deref(), Ok("ld!"));
        let sent = &server.requests()[0];
        assert_eq!(sent.method, "POST");
        assert_eq!(sent.path, "/v1/chat/completions");
        assert_eq!(sent.header("authorization"), Some("Bearer sk-test-key"));
        let body = sent.json();
        assert_eq!(body["model"], json!("test-model"));
        assert_eq!(body["messages"][0]["role"], json!("system"));
        assert!(body["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("Hello, wor"));
        assert!(body.get("stream").is_none());
    }

    #[tokio::test]
    async fn openai_streams_deltas_in_order_and_joins_them() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            "data: {\"choices\":[{\"delta\":{\"content\":\"ld\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"!\"}}]}\n\n",
            "data: [DONE]\n\n",
        ])])
        .await;

        let (result, chunks) = stream(&server, AiProvider::OpenAi, None).await;

        assert_eq!(result.as_deref(), Ok("ld!"));
        assert_eq!(chunks, vec!["ld", "!"]);
        assert_eq!(server.requests()[0].json()["stream"], json!(true));
    }

    #[tokio::test]
    async fn openai_stream_reassembles_events_and_characters_split_across_reads() {
        let event = "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n".as_bytes();
        // Cut inside the multi-byte character and inside the event separator.
        let cut_in_char = event.iter().position(|byte| *byte == 0xE4).unwrap() + 1;
        let pieces = vec![
            event[..cut_in_char].to_vec(),
            event[cut_in_char..event.len() - 1].to_vec(),
            event[event.len() - 1..].to_vec(),
            b"data: [DONE]\n\n".to_vec(),
        ];
        let server = MockServer::start(vec![ScriptedResponse::sse_bytes(pieces)]).await;

        let (result, chunks) = stream(&server, AiProvider::OpenAi, None).await;

        assert_eq!(result.as_deref(), Ok("你好"));
        assert_eq!(chunks, vec!["你好"]);
    }

    #[tokio::test]
    async fn openai_stream_tolerates_comments_and_crlf_framing() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            ": keep-alive\r\n\r\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\r\n\r\n",
            "data: [DONE]\r\n\r\n",
        ])])
        .await;

        let (result, chunks) = stream(&server, AiProvider::OpenAi, None).await;

        assert_eq!(result.as_deref(), Ok("ok"));
        assert_eq!(chunks, vec!["ok"]);
    }

    #[tokio::test]
    async fn openai_http_error_surfaces_the_upstream_message() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            401,
            r#"{"error":{"message":"Incorrect API key provided."}}"#,
        )])
        .await;

        let error = complete(&server, AiProvider::OpenAi, None)
            .await
            .unwrap_err();

        assert!(error.contains("Incorrect API key provided."), "{error}");
        assert!(error.contains("401"), "{error}");
        assert!(
            !error.contains("sk-test-key"),
            "the key must never be echoed"
        );
        assert_eq!(server.request_count(), 1, "401 is not retried");
    }

    #[tokio::test]
    async fn openai_stream_http_error_surfaces_the_upstream_message() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            400,
            r#"{"error":{"message":"bad model"}}"#,
        )])
        .await;

        let (result, chunks) = stream(&server, AiProvider::OpenAi, None).await;

        assert!(result.unwrap_err().contains("bad model"));
        assert!(chunks.is_empty());
    }

    #[tokio::test]
    async fn openai_http_200_carrying_an_error_is_an_error() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            200,
            r#"{"error":{"message":"quota exceeded"}}"#,
        )])
        .await;

        let error = complete(&server, AiProvider::OpenAi, None)
            .await
            .unwrap_err();

        assert!(error.contains("quota exceeded"), "{error}");
    }

    #[tokio::test]
    async fn openai_stream_error_event_after_some_text_fails_the_request() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
            "data: {\"error\":{\"message\":\"upstream died\"}}\n\n",
        ])])
        .await;

        let (result, chunks) = stream(&server, AiProvider::OpenAi, None).await;

        assert!(result.unwrap_err().contains("upstream died"));
        assert_eq!(
            chunks,
            vec!["partial"],
            "text already delivered stays delivered"
        );
    }

    #[tokio::test]
    async fn openai_retries_rate_limits_then_succeeds() {
        let server = MockServer::start(vec![
            ScriptedResponse::json(429, r#"{"error":{"message":"slow down"}}"#)
                .with_header("retry-after", "0"),
            ScriptedResponse::json(200, CHAT_OK),
        ])
        .await;

        let text = complete(&server, AiProvider::OpenAi, None).await;

        assert_eq!(text.as_deref(), Ok("ld!"));
        assert_eq!(server.request_count(), 2);
    }

    #[tokio::test]
    async fn openai_gives_up_after_the_retry_budget() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            503,
            r#"{"error":{"message":"overloaded"}}"#,
        )
        .with_header("retry-after", "0")])
        .await;

        let error = complete(&server, AiProvider::OpenAi, None)
            .await
            .unwrap_err();

        assert!(error.contains("overloaded"), "{error}");
        assert_eq!(server.request_count(), 3, "one attempt plus two retries");
    }

    #[tokio::test]
    async fn openai_without_an_api_key_never_sends_a_request() {
        let server = MockServer::start(vec![ScriptedResponse::json(200, CHAT_OK)]).await;
        let mut config = config(&server, AiProvider::OpenAi);
        config.api_key = "  ".into();

        let result = super::OpenAiProvider
            .request_fim_completion(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &config,
                &request(None),
            )
            .await;

        assert!(result.is_err());
        assert_eq!(server.request_count(), 0);
    }

    #[tokio::test]
    async fn openai_compatible_providers_share_the_wire_format() {
        // Kimi, Zhipu, MiMo and the rest all reuse this implementation; a
        // request for each must hit the same path with its own prompt profile.
        for provider in [
            AiProvider::Kimi,
            AiProvider::Zhipu,
            AiProvider::ZhipuCoding,
            AiProvider::MiMo,
            AiProvider::MiMoCoding,
            AiProvider::OpenAi,
        ] {
            let server = MockServer::start(vec![ScriptedResponse::json(200, CHAT_OK)]).await;

            let text = super::request_openai_compatible_fim(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &config(&server, provider),
                &request(None),
            )
            .await;

            assert_eq!(text.as_deref(), Ok("ld!"), "{provider:?}");
            assert_eq!(
                server.requests()[0].path,
                "/v1/chat/completions",
                "{provider:?}"
            );
        }
    }

    #[tokio::test]
    async fn openai_rejects_plaintext_endpoints_on_public_hosts_without_connecting() {
        let server = MockServer::start(vec![ScriptedResponse::json(200, CHAT_OK)]).await;
        let mut config = config(&server, AiProvider::Custom);
        config.api_url = Some("http://api.example.com".into());

        let result = super::request_openai_compatible_fim(
            &Client::new(),
            &PromptManager::from_user_root(None),
            &config,
            &request(None),
        )
        .await;

        assert!(result.unwrap_err().contains("insecure"));
        assert_eq!(server.request_count(), 0);
    }
}
