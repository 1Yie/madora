use super::Protocol;
use crate::i18n;

/// The protocol this model is served over.
pub(crate) fn protocol_for_model(model: &str) -> Result<Protocol, String> {
    let normalized = model.trim().to_ascii_lowercase();

    if matches_responses_route(&normalized) {
        return Ok(Protocol::OpenAiResponses);
    }

    if matches_anthropic_route(&normalized) {
        return Ok(Protocol::AnthropicMessages);
    }

    if matches_google_route(&normalized) {
        return Ok(Protocol::GoogleGenerate);
    }

    if matches_chat_completions_route(&normalized) {
        return Ok(Protocol::OpenAiChat);
    }

    Err(i18n::tf(
        "ai.provider.unsupported_model",
        &[("provider", "OpenCode Zen"), ("model", model)],
    ))
}

fn matches_responses_route(model: &str) -> bool {
    model.starts_with("gpt-")
        || model.starts_with("muse-")
        || (model.starts_with("grok-") && model != "grok-code")
}

fn matches_anthropic_route(model: &str) -> bool {
    model.starts_with("claude-")
        || (model.starts_with("qwen") && !matches!(model, "qwen3.8-max" | "qwen3-coder"))
        || matches!(
            model,
            "minimax-m2.1-free" | "minimax-m2.5-free" | "minimax-m3-free"
        )
}

fn matches_google_route(model: &str) -> bool {
    model.starts_with("gemini-")
}

fn matches_chat_completions_route(model: &str) -> bool {
    matches!(model, "qwen3.8-max" | "qwen3-coder")
        || model.starts_with("deepseek-")
        || model.starts_with("minimax-")
        || model.starts_with("glm-")
        || model.starts_with("kimi-")
        || model.starts_with("grok-")
        || model == "big-pickle"
        || model.starts_with("mimo-")
        || model.starts_with("north-mini-code-")
        || model.starts_with("nemotron-")
        || model.starts_with("flint-")
        || model.starts_with("mistral-")
        || model.starts_with("ling-")
        || model.starts_with("longcat-")
        || model.starts_with("step-")
        || model.starts_with("hy3")
        || model.starts_with("hy4-")
        || model.starts_with("trinity-")
        || model.starts_with("laguna-")
        || model.starts_with("ring-")
        || matches!(
            model,
            "beam-free"
                | "cat-jam-free"
                | "space-bunny-free"
                | "exo-free"
                | "fledge-alpha-free"
                | "ll-alpha-free"
                | "x-preview-f-free"
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::{AiCompletionConfig, AiProvider};
    use serde_json::json;

    #[test]
    fn routes_responses_models() {
        assert_eq!(
            protocol_for_model("gpt-5.5").unwrap(),
            Protocol::OpenAiResponses
        );
        assert_eq!(
            protocol_for_model("gpt-5.1-codex-max").unwrap(),
            Protocol::OpenAiResponses
        );
        for model in [
            "grok-4.7",
            "grok-4.6",
            "grok-4.5",
            "grok-build-0.1",
            "muse-wonder-1.0",
            "muse-spark-1.2",
            "muse-spark-1.3-contributor-free",
        ] {
            assert_eq!(
                protocol_for_model(model).unwrap(),
                Protocol::OpenAiResponses,
                "{model}"
            );
        }
    }

    #[test]
    fn routes_chat_completion_models() {
        assert_eq!(
            protocol_for_model("deepseek-v4-pro").unwrap(),
            Protocol::OpenAiChat
        );
        assert_eq!(
            protocol_for_model("big-pickle").unwrap(),
            Protocol::OpenAiChat
        );
        for model in [
            "flint-40b-free",
            "beam-free",
            "mistral-large-4",
            "ling-3.1-flash-free",
            "longcat-2.0-free",
            "step-5-preview-free",
            "hy3-free",
            "trinity-large-preview-free",
            "laguna-s-2.1-free",
            "ring-2.6-1t-free",
            "exo-free",
            "fledge-alpha-free",
            "ll-alpha-free",
            "x-preview-f-free",
            "cat-jam-free",
            "space-bunny-free",
            "grok-code",
            "qwen3.8-max",
            "qwen3-coder",
        ] {
            assert_eq!(
                protocol_for_model(model).unwrap(),
                Protocol::OpenAiChat,
                "{model}"
            );
        }
    }

    #[test]
    fn routes_anthropic_models() {
        assert_eq!(
            protocol_for_model("claude-sonnet-4-6").unwrap(),
            Protocol::AnthropicMessages
        );
        assert_eq!(
            protocol_for_model("qwen3.7-max").unwrap(),
            Protocol::AnthropicMessages
        );
        for model in [
            "qwen3.8-flash",
            "qwen3.6-plus",
            "qwen3.5-plus",
            "minimax-m2.1-free",
            "minimax-m2.5-free",
            "minimax-m3-free",
        ] {
            assert_eq!(
                protocol_for_model(model).unwrap(),
                Protocol::AnthropicMessages,
                "{model}"
            );
        }
    }

    #[test]
    fn routes_google_models() {
        assert_eq!(
            protocol_for_model("gemini-3.1-pro").unwrap(),
            Protocol::GoogleGenerate
        );
    }

    #[test]
    fn rejects_unroutable_models() {
        let error = protocol_for_model("unknown-model").unwrap_err();
        assert!(error.contains("unknown-model"), "{error}");
    }

    // ─── end to end against a scripted local server ─────────────────

    use crate::models::ai::CompletionRequest;
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

    async fn zen_complete(server: &MockServer, model: &str) -> Result<String, String> {
        let config = e2e_config(server, AiProvider::OpenCodeZen, model);

        super::protocol_for_model(model)?
            .complete(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &config,
                &e2e_request(Some("after")),
            )
            .await
    }

    async fn zen_stream(server: &MockServer, model: &str) -> (Result<String, String>, Vec<String>) {
        let mut chunks = Vec::new();
        let config = e2e_config(server, AiProvider::OpenCodeZen, model);
        let result = match super::protocol_for_model(model) {
            Ok(protocol) => {
                protocol
                    .complete_stream(
                        &Client::new(),
                        &PromptManager::from_user_root(None),
                        &config,
                        &e2e_request(None),
                        &mut |chunk| {
                            chunks.push(chunk);
                            Ok(())
                        },
                    )
                    .await
            }
            Err(error) => Err(error),
        };

        (result, chunks)
    }

    #[tokio::test]
    async fn zen_routes_each_model_family_to_its_own_endpoint() {
        let cases = [
            ("gpt-5.5", "/v1/responses", r#"{"output_text":"ld!"}"#),
            ("grok-4.7", "/v1/responses", r#"{"output_text":"ld!"}"#),
            (
                "muse-wonder-1.0",
                "/v1/responses",
                r#"{"output_text":"ld!"}"#,
            ),
            (
                "muse-spark-1.3",
                "/v1/responses",
                r#"{"output_text":"ld!"}"#,
            ),
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
        assert_eq!(body["temperature"], json!(0.3_f32));
        assert_eq!(body["max_output_tokens"], json!(512));
        assert!(body.get("reasoning").is_none());
    }

    #[tokio::test]
    async fn zen_latest_text_models_use_chat_completions() {
        for model in ["flint-40b-free", "beam-free", "mistral-large-4"] {
            let server = MockServer::start(vec![ScriptedResponse::json(
                200,
                r#"{"choices":[{"message":{"content":"ok"}}]}"#,
            )])
            .await;
            assert_eq!(zen_complete(&server, model).await.as_deref(), Ok("ok"));
            let sent = &server.requests()[0];
            assert_eq!(sent.path, "/v1/chat/completions", "{model}");
            assert_eq!(sent.json()["model"], model);
            assert_eq!(sent.header("authorization"), Some("Bearer sk-test-key"));
        }
    }

    #[tokio::test]
    async fn zen_gpt_responses_use_supported_reasoning_and_token_budgets() {
        for (model, effort) in [
            ("gpt-5.6-luna", "none"),
            ("gpt-5.6-sol", "none"),
            ("gpt-5.6-terra", "none"),
            ("gpt-6.1-terra", "none"),
            ("gpt-6-sol", "none"),
            ("gpt-6-luna", "none"),
            ("gpt-6-luna-2026-06-01", "none"),
            ("gpt-6.1-sol", "low"),
            ("gpt-6-astra", "low"),
            ("gpt-5.1-codex", "low"),
            ("gpt-5.3-codex-spark", "low"),
        ] {
            let server =
                MockServer::start(vec![ScriptedResponse::json(200, r#"{"output_text":"ok"}"#)])
                    .await;
            assert_eq!(zen_complete(&server, model).await.as_deref(), Ok("ok"));
            let sent = &server.requests()[0];
            assert_eq!(sent.path, "/v1/responses");
            let payload = sent.json();
            assert_eq!(payload["model"], model);
            assert_eq!(payload["reasoning"], json!({ "effort": effort }));
            assert_eq!(payload["max_output_tokens"], 512);
            assert_eq!(payload["store"], false);
            assert_eq!(payload["stream"], false);
            if effort == "low" {
                assert!(payload.get("temperature").is_none(), "{model}: {payload}");
            } else {
                assert_eq!(payload["temperature"], json!(0.3_f32), "{model}");
            }
            assert!(payload.get("stop").is_none());
            assert!(payload.get("max_tokens").is_none());
            assert!(payload.get("reasoning_effort").is_none());
        }
    }

    #[tokio::test]
    async fn zen_gpt6_streaming_reserves_tokens_for_reasoning_without_a_suffix() {
        let server = MockServer::start(vec![ScriptedResponse::sse(&[
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}\n\n",
        ])])
        .await;
        let (result, chunks) = zen_stream(&server, "gpt-6.1-sol").await;
        assert_eq!(result.as_deref(), Ok("ok"));
        assert_eq!(chunks, vec!["ok"]);
        let payload = server.requests()[0].json();
        assert_eq!(payload["reasoning"], json!({ "effort": "low" }));
        assert_eq!(payload["max_output_tokens"], 512);
        assert_eq!(payload["stream"], true);
        assert!(payload.get("temperature").is_none());
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
