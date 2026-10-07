use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_openai_compatible, PromptManager},
    providers::{
        anthropic::{request_anthropic_compatible_fim, request_anthropic_compatible_fim_stream},
        common::{
            join_url, parse_stream_event, parse_success_json, send_request, stream_completion,
            CompletionKind, CompletionParams, OpenEndedStop, PreparedCompletion,
        },
        default_model,
        google::{request_google_compatible_fim, request_google_compatible_fim_stream},
        openai::{request_openai_compatible_fim, request_openai_compatible_fim_stream},
        resolve_model, CompletionProvider,
    },
};

pub struct OpenCodeZenProvider;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OpenCodeZenRoute {
    Anthropic,
    Google,
    ChatCompletions,
    Responses,
}

#[derive(Deserialize)]
struct ResponsesApiOutputContent {
    text: Option<String>,
    #[serde(rename = "type")]
    type_name: Option<String>,
}

#[derive(Deserialize)]
struct ResponsesApiOutputItem {
    content: Option<Vec<ResponsesApiOutputContent>>,
    #[serde(rename = "type")]
    type_name: Option<String>,
}

#[derive(Deserialize)]
struct ResponsesApiResponse {
    output: Option<Vec<ResponsesApiOutputItem>>,
    output_text: Option<String>,
}

#[derive(Deserialize)]
struct ResponsesApiStreamEvent {
    delta: Option<String>,
    response: Option<ResponsesApiResponse>,
    text: Option<String>,
    #[serde(rename = "type")]
    type_name: Option<String>,
}

#[async_trait]
impl CompletionProvider for OpenCodeZenProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::OpenCodeZen
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        match resolve_route(config)? {
            OpenCodeZenRoute::Anthropic => {
                request_anthropic_compatible_fim(client, prompt_manager, config, request).await
            }
            OpenCodeZenRoute::Google => {
                request_google_compatible_fim(client, prompt_manager, config, request).await
            }
            OpenCodeZenRoute::ChatCompletions => {
                request_openai_compatible_fim(client, prompt_manager, config, request).await
            }
            OpenCodeZenRoute::Responses => {
                request_openai_responses_fim(client, prompt_manager, config, request).await
            }
        }
    }

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        match resolve_route(config)? {
            OpenCodeZenRoute::Anthropic => {
                request_anthropic_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            OpenCodeZenRoute::Google => {
                request_google_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            OpenCodeZenRoute::ChatCompletions => {
                request_openai_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            OpenCodeZenRoute::Responses => {
                request_openai_responses_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
        }
    }
}

fn resolve_route(config: &AiCompletionConfig) -> Result<OpenCodeZenRoute, String> {
    let model = resolve_model(
        config,
        default_model(AiProvider::OpenCodeZen).unwrap_or_default(),
    )?;
    let normalized = model.trim().to_ascii_lowercase();

    if matches_responses_route(&normalized) {
        return Ok(OpenCodeZenRoute::Responses);
    }

    if matches_anthropic_route(&normalized) {
        return Ok(OpenCodeZenRoute::Anthropic);
    }

    if matches_google_route(&normalized) {
        return Ok(OpenCodeZenRoute::Google);
    }

    if matches_chat_completions_route(&normalized) {
        return Ok(OpenCodeZenRoute::ChatCompletions);
    }

    Err(format!(
        "OpenCode Zen model '{model}' could not be routed to an API endpoint."
    ))
}

fn matches_responses_route(model: &str) -> bool {
    model.starts_with("gpt-")
}

fn matches_anthropic_route(model: &str) -> bool {
    model.starts_with("claude-") || model.starts_with("qwen")
}

fn matches_google_route(model: &str) -> bool {
    model.starts_with("gemini-")
}

fn matches_chat_completions_route(model: &str) -> bool {
    model.starts_with("deepseek-")
        || model.starts_with("minimax-")
        || model.starts_with("glm-")
        || model.starts_with("kimi-")
        || model.starts_with("grok-")
        || model == "big-pickle"
        || model.starts_with("mimo-")
        || model.starts_with("north-mini-code-")
        || model.starts_with("nemotron-")
}

async fn request_openai_responses_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let PreparedCompletion {
        connection,
        system_prompt,
        user_prompt,
    } = PreparedCompletion::prepare(
        prompt_manager,
        config,
        request,
        prompt_profile_for_openai_compatible,
        AiProvider::OpenCodeZen,
        OpenEndedStop::Structural,
    )?;
    let provider = connection.provider;
    let payload = build_responses_payload(
        &connection.model,
        system_prompt,
        user_prompt,
        connection.params,
        false,
    );

    let response = send_request(CompletionKind::Whole, provider, || {
        client
            .post(join_url(&connection.api_url, "/v1/responses"))
            .bearer_auth(&connection.api_key)
            .json(&payload)
    })
    .await?;

    let payload =
        parse_success_json::<ResponsesApiResponse>(provider.display_name(), response).await?;

    Ok(take_responses_output_text(payload))
}

async fn request_openai_responses_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let PreparedCompletion {
        connection,
        system_prompt,
        user_prompt,
    } = PreparedCompletion::prepare(
        prompt_manager,
        config,
        request,
        prompt_profile_for_openai_compatible,
        AiProvider::OpenCodeZen,
        OpenEndedStop::Structural,
    )?;
    let provider = connection.provider;
    let payload = build_responses_payload(
        &connection.model,
        system_prompt,
        user_prompt,
        connection.params,
        true,
    );

    let response = send_request(CompletionKind::Stream, provider, || {
        client
            .post(join_url(&connection.api_url, "/v1/responses"))
            .bearer_auth(&connection.api_key)
            .json(&payload)
    })
    .await?;

    stream_completion(
        CompletionKind::Stream,
        provider,
        response,
        |event, accumulated| {
            let payload = parse_stream_event::<ResponsesApiStreamEvent>(provider, event)?;
            // Only fall back to the completed event's full text when nothing
            // streamed, or the answer would be emitted twice.
            let chunk = take_responses_stream_text(payload, accumulated.is_empty());

            Ok(Some(chunk).filter(|text| !text.is_empty()))
        },
        on_chunk,
    )
    .await
}

fn build_responses_payload(
    model: &str,
    system_prompt: String,
    user_prompt: String,
    params: CompletionParams,
    stream: bool,
) -> Value {
    // The Responses API has no stop-sequence parameter, so only the budget and
    // temperature carry over.
    json!({
        "model": model,
        "input": user_prompt,
        "instructions": system_prompt,
        "max_output_tokens": params.max_tokens,
        "temperature": params.temperature,
        "store": false,
        "stream": stream,
    })
}

fn take_responses_output_text(payload: ResponsesApiResponse) -> String {
    payload.output_text.unwrap_or_else(|| {
        payload
            .output
            .unwrap_or_default()
            .into_iter()
            .filter(|item| item.type_name.as_deref() == Some("message"))
            .flat_map(|item| item.content.unwrap_or_default().into_iter())
            .filter(|content| content.type_name.as_deref() == Some("output_text"))
            .filter_map(|content| content.text)
            .collect::<Vec<_>>()
            .join("")
    })
}

fn take_responses_stream_text(
    payload: ResponsesApiStreamEvent,
    allow_completion_fallback: bool,
) -> String {
    match payload.type_name.as_deref() {
        Some("response.output_text.delta") => payload.delta.or(payload.text).unwrap_or_default(),
        Some("response.completed") if allow_completion_fallback => payload
            .response
            .map(take_responses_output_text)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::AiCompletionConfig;

    fn config_with_model(model: &str) -> AiCompletionConfig {
        AiCompletionConfig {
            model: Some(model.to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn resolves_responses_models() {
        let route = resolve_route(&config_with_model("gpt-5.5")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Responses);

        let route = resolve_route(&config_with_model("gpt-5.1-codex-max")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Responses);
    }

    #[test]
    fn resolves_chat_completion_models() {
        let route = resolve_route(&config_with_model("deepseek-v4-pro")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::ChatCompletions);

        let route = resolve_route(&config_with_model("big-pickle")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::ChatCompletions);
    }

    #[test]
    fn resolves_anthropic_models() {
        let route = resolve_route(&config_with_model("claude-sonnet-4-6")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Anthropic);

        let route = resolve_route(&config_with_model("qwen3.5-plus")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Anthropic);
    }

    #[test]
    fn resolves_google_models() {
        let route = resolve_route(&config_with_model("gemini-3.1-pro")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Google);
    }

    #[test]
    fn extracts_response_output_text() {
        let text = take_responses_output_text(ResponsesApiResponse {
            output: Some(vec![ResponsesApiOutputItem {
                content: Some(vec![ResponsesApiOutputContent {
                    text: Some("hello".to_string()),
                    type_name: Some("output_text".to_string()),
                }]),
                type_name: Some("message".to_string()),
            }]),
            output_text: None,
        });

        assert_eq!(text, "hello");
    }

    #[test]
    fn returns_route_error_for_unmatched_models() {
        let error = resolve_route(&config_with_model("unknown-model")).unwrap_err();
        assert!(error.contains("could not be routed"));
    }

    // ─── end to end against a scripted local server ─────────────────

    use crate::models::ai::CompletionRequest;
    use crate::prompt::PromptManager;
    use crate::providers::test_support::{MockServer, ScriptedResponse};
    use crate::providers::CompletionProvider;
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

    async fn zen_complete(server: &MockServer, model: &str) -> Result<String, String> {
        super::OpenCodeZenProvider
            .request_fim_completion(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &e2e_config(server, AiProvider::OpenCodeZen, model),
                &e2e_request(Some("after")),
            )
            .await
    }

    async fn zen_stream(server: &MockServer, model: &str) -> (Result<String, String>, Vec<String>) {
        let mut chunks = Vec::new();
        let result = super::OpenCodeZenProvider
            .request_fim_completion_stream(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &e2e_config(server, AiProvider::OpenCodeZen, model),
                &e2e_request(None),
                &mut |chunk| {
                    chunks.push(chunk);
                    Ok(())
                },
            )
            .await;

        (result, chunks)
    }

    #[tokio::test]
    async fn zen_routes_each_model_family_to_its_own_endpoint() {
        let cases: [(&str, &str, &str); 4] = [
            ("gpt-5.5", "/v1/responses", r#"{"output_text":"ld!"}"#),
            (
                "claude-sonnet-4-6",
                "/v1/messages",
                r#"{"content":[{"type":"text","text":"ld!"}]}"#,
            ),
            (
                "gemini-3.1-pro",
                "/v1/models/gemini-3.1-pro:generateContent",
                r#"{"candidates":[{"content":{"parts":[{"text":"ld!"}]}}]}"#,
            ),
            (
                "deepseek-v4-pro",
                "/v1/chat/completions",
                r#"{"choices":[{"message":{"content":"ld!"}}]}"#,
            ),
        ];

        for (model, path, body) in cases {
            let server = MockServer::start(vec![ScriptedResponse::json(200, body)]).await;

            let text = zen_complete(&server, model).await;

            assert_eq!(text.as_deref(), Ok("ld!"), "{model}");
            assert_eq!(server.requests()[0].path, path, "{model}");
        }
    }

    #[tokio::test]
    async fn zen_responses_request_is_stateless_and_has_no_stop_parameter() {
        let server =
            MockServer::start(vec![ScriptedResponse::json(200, r#"{"output_text":"ok"}"#)]).await;

        zen_complete(&server, "gpt-5.5").await.unwrap();

        let sent = &server.requests()[0];
        assert_eq!(sent.header("authorization"), Some("Bearer sk-test-key"));
        let body = sent.json();
        assert_eq!(
            body["store"],
            json!(false),
            "completions must not be stored upstream"
        );
        assert!(body.get("stop").is_none());
        assert!(body["input"].as_str().unwrap().contains("Hello, wor"));
    }

    #[tokio::test]
    async fn zen_responses_extracts_text_from_output_items() {
        let server = MockServer::start(vec![ScriptedResponse::json(
            200,
            r#"{"output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":"ld"},{"type":"output_text","text":"!"}]}]}"#,
        )])
        .await;

        let text = zen_complete(&server, "gpt-5.5").await;

        assert_eq!(text.as_deref(), Ok("ld!"));
    }

    #[tokio::test]
    async fn zen_responses_streams_output_text_deltas() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            "event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
            "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"ld\"}\n\n",
            "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"!\"}\n\n",
            "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"output_text\":\"ld!\"}}\n\n",
        ])])
        .await;

        let (result, chunks) = zen_stream(&server, "gpt-5.5").await;

        assert_eq!(result.as_deref(), Ok("ld!"));
        assert_eq!(
            chunks,
            vec!["ld", "!"],
            "the completed event must not repeat text that already streamed"
        );
    }

    #[tokio::test]
    async fn zen_responses_falls_back_to_the_completed_event_when_nothing_streamed() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"output_text\":\"whole\"}}\n\n",
        ])])
        .await;

        let (result, chunks) = zen_stream(&server, "gpt-5.5").await;

        assert_eq!(result.as_deref(), Ok("whole"));
        assert_eq!(chunks, vec!["whole"]);
    }

    #[tokio::test]
    async fn zen_responses_error_event_and_http_error_are_reported() {
        let in_stream = MockServer::start(vec![ScriptedResponse::sse(&[
            "data: {\"error\":{\"message\":\"model overloaded\"}}\n\n",
        ])])
        .await;
        let (result, _) = zen_stream(&in_stream, "gpt-5.5").await;
        assert!(result.unwrap_err().contains("model overloaded"));

        let http = MockServer::start(vec![ScriptedResponse::json(
            429,
            r#"{"error":{"message":"rate limited"}}"#,
        )
        .with_header("retry-after", "0")])
        .await;
        let error = zen_complete(&http, "gpt-5.5").await.unwrap_err();
        assert!(error.contains("rate limited"), "{error}");
        assert_eq!(http.request_count(), 3);
    }

    #[tokio::test]
    async fn zen_refuses_an_unroutable_model_before_connecting() {
        let server = MockServer::start(vec![ScriptedResponse::json(200, "{}")]).await;

        let error = zen_complete(&server, "totally-unknown").await.unwrap_err();

        assert!(error.contains("totally-unknown"), "{error}");
        assert_eq!(server.request_count(), 0);
    }
}
