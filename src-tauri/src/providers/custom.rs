//! The user-configured provider: the endpoint and model are entered by hand
//! and the protocol is chosen in the settings.

use crate::models::ai::{AiCompletionConfig, CustomProviderProtocol};

use super::Protocol;

pub(crate) fn protocol(config: &AiCompletionConfig) -> Result<Protocol, String> {
    Ok(match config.custom_protocol.unwrap_or_default() {
        CustomProviderProtocol::Anthropic => Protocol::AnthropicMessages,
        CustomProviderProtocol::Google => Protocol::GoogleGenerate,
        CustomProviderProtocol::OpenAi => Protocol::OpenAiChat,
        CustomProviderProtocol::OpenAiResponses => Protocol::OpenAiResponses,
        CustomProviderProtocol::OpenAiCodex => Protocol::OpenAiCodex,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::AiCompletionConfig;
    use crate::{
        models::ai::{AiProvider, CompletionRequest},
        prompt::PromptManager,
        providers::test_support::{MockServer, ScriptedResponse},
    };
    use reqwest::Client;
    use serde_json::json;

    #[test]
    fn stable_wire_values_preserve_legacy_protocols() {
        for (value, protocol) in [
            ("openai", CustomProviderProtocol::OpenAi),
            ("anthropic", CustomProviderProtocol::Anthropic),
            ("google", CustomProviderProtocol::Google),
            ("openai-responses", CustomProviderProtocol::OpenAiResponses),
            ("openai-codex", CustomProviderProtocol::OpenAiCodex),
        ] {
            assert_eq!(serde_json::to_value(protocol).unwrap(), json!(value));
            assert_eq!(
                serde_json::from_value::<CustomProviderProtocol>(json!(value)).unwrap(),
                protocol
            );
            let config: AiCompletionConfig = serde_json::from_value(json!({
                "provider": "custom", "customProtocol": value
            }))
            .unwrap();
            assert_eq!(config.custom_protocol, Some(protocol));
        }
        assert!(
            serde_json::from_value::<CustomProviderProtocol>(json!("openai_responses")).is_err()
        );
        assert!(serde_json::from_value::<CustomProviderProtocol>(json!("openai_codex")).is_err());
    }

    fn responses_config(base: String) -> AiCompletionConfig {
        AiCompletionConfig {
            provider: Some(AiProvider::Custom),
            api_key: "test-only-key".into(),
            api_url: Some(base),
            model: Some("my-custom-model".into()),
            custom_protocol: Some(CustomProviderProtocol::OpenAiResponses),
            ..Default::default()
        }
    }

    fn request() -> CompletionRequest {
        CompletionRequest {
            title: Some("Note".into()),
            prefix: "hello".into(),
            suffix: Some("world".into()),
        }
    }

    #[tokio::test]
    async fn responses_http_uses_custom_model_prompts_auth_and_proxy_path() {
        for (base, expected) in [
            ("", "/v1/responses"),
            ("/v1", "/v1/responses"),
            ("/proxy/openai", "/proxy/openai/v1/responses"),
            ("/proxy/v1", "/proxy/v1/responses"),
            ("/proxy/v1/responses", "/proxy/v1/responses"),
        ] {
            let server = MockServer::start(vec![ScriptedResponse::json(200,
                r#"{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"answer"}]}]}"#)]).await;
            let config = responses_config(format!("{}{base}", server.base_url));
            let text = crate::providers::Protocol::OpenAiResponses
                .complete(
                    &Client::new(),
                    &PromptManager::from_user_root(None),
                    &config,
                    &request(),
                )
                .await
                .unwrap();
            assert_eq!(text, "answer");
            let recorded = &server.requests()[0];
            assert_eq!(recorded.path, expected);
            assert_eq!(recorded.method, "POST");
            assert_eq!(
                recorded.header("authorization"),
                Some("Bearer test-only-key")
            );
            assert!(!recorded.path.contains("test-only-key"));
            let body = recorded.json();
            assert_eq!(body["model"], "my-custom-model");
            assert_eq!(body["store"], false);
            assert_eq!(body["stream"], false);
            assert!(body["input"].as_str().unwrap().contains("hello"));
            assert!(body["instructions"]
                .as_str()
                .is_some_and(|text| !text.is_empty()));
            assert!(body.get("stop").is_none());
        }
    }

    #[tokio::test]
    async fn responses_http_streams_deltas_and_completed_fallback_without_duplicates() {
        for (events, expected_chunks) in [
            (vec![
                "data: {\"type\":\"response.output_text.delta\",\"delta\":\"你\"}\n\n",
                "data: {\"type\":\"response.output_text.delta\",\"delta\":\"好\"}\n\n",
                "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output_text\":\"你好\"}}\n\n",
            ], vec!["你", "好"]),
            (vec![
                "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output_text\":\"你好\"}}\n\n",
            ], vec!["你好"]),
        ] {
            let server = MockServer::start(vec![ScriptedResponse::sse(&events)]).await;
            let mut chunks = Vec::new();
            let text = crate::providers::Protocol::OpenAiResponses.complete_stream(
                &Client::new(), &PromptManager::from_user_root(None),
                &responses_config(server.base_url.clone()), &request(),
                &mut |text| { chunks.push(text); Ok(()) },
            ).await.unwrap();
            assert_eq!(text, "你好");
            assert_eq!(chunks, expected_chunks);
            assert_eq!(server.requests()[0].json()["stream"], true);
        }
    }

    #[tokio::test]
    async fn responses_http_rejects_partial_failures_and_premature_eof() {
        for response in [
            ScriptedResponse::sse(&["data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n"]),
            ScriptedResponse::sse(&["data: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"message\":\"denied\"}}}\n\n"]),
            ScriptedResponse::sse(&["data: {\"type\":\"response.incomplete\",\"response\":{\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"max_output_tokens\"}}}\n\n"]),
            ScriptedResponse::sse(&["data: {\"type\":\"error\",\"error\":{\"message\":\"denied\"}}\n\n"]),
            ScriptedResponse::sse(&["data: not-json\n\n"]),
        ] {
            let server = MockServer::start(vec![response]).await;
            assert!(crate::providers::Protocol::OpenAiResponses.complete_stream(
                &Client::new(), &PromptManager::from_user_root(None),
                &responses_config(server.base_url.clone()), &request(), &mut |_| Ok(()),
            ).await.is_err());
        }
        for response in [
            ScriptedResponse::json(401, r#"{"error":{"message":"denied"}}"#),
            ScriptedResponse::json(200, r#"{"status":"incomplete","output_text":"partial"}"#),
            ScriptedResponse::json(200, r#"{"status":"failed","error":{"message":"denied"}}"#),
            ScriptedResponse::json(200, r#"{"status":"in_progress","output_text":"partial"}"#),
            ScriptedResponse::json(200, r#"{"status":"queued","output_text":"partial"}"#),
            ScriptedResponse::json(
                200,
                r#"{"incomplete_details":{"reason":"max_output_tokens"},"output_text":"partial"}"#,
            ),
        ] {
            let server = MockServer::start(vec![response]).await;
            assert!(crate::providers::Protocol::OpenAiResponses
                .complete(
                    &Client::new(),
                    &PromptManager::from_user_root(None),
                    &responses_config(server.base_url.clone()),
                    &request(),
                )
                .await
                .is_err());
        }
    }

    #[tokio::test]
    async fn responses_http_caps_accumulated_stream_output() {
        let event = format!(
            "data: {}\n\n",
            json!({
                "type": "response.output_text.delta",
                "delta": "x".repeat(600_000)
            })
        );
        let server = MockServer::start(vec![ScriptedResponse::sse(&[&event, &event])]).await;
        let mut received = 0;
        let error = crate::providers::Protocol::OpenAiResponses
            .complete_stream(
                &Client::new(),
                &PromptManager::from_user_root(None),
                &responses_config(server.base_url.clone()),
                &request(),
                &mut |chunk| {
                    received += chunk.len();
                    Ok(())
                },
            )
            .await
            .unwrap_err();

        assert!(error.contains("1 MiB"));
        assert!(received <= 1024 * 1024);
    }

    #[tokio::test]
    async fn responses_http_rejects_credentials_in_urls_before_connecting() {
        let server = MockServer::start(vec![ScriptedResponse::json(200, "{}")]).await;
        for base in [
            server
                .base_url
                .replacen("http://", "http://secret:password@", 1),
            format!("{}?api_key=secret", server.base_url),
            format!("{}#secret", server.base_url),
        ] {
            assert!(crate::providers::Protocol::OpenAiResponses
                .complete(
                    &Client::new(),
                    &PromptManager::from_user_root(None),
                    &responses_config(base),
                    &request(),
                )
                .await
                .is_err());
        }
        assert_eq!(server.request_count(), 0);
    }

    #[test]
    fn defaults_to_the_openai_chat_protocol() {
        assert_eq!(
            protocol(&AiCompletionConfig::default()).unwrap(),
            Protocol::OpenAiChat
        );
    }

    #[test]
    fn follows_the_configured_protocol() {
        for (selected, expected) in [
            (
                CustomProviderProtocol::Anthropic,
                Protocol::AnthropicMessages,
            ),
            (CustomProviderProtocol::Google, Protocol::GoogleGenerate),
            (CustomProviderProtocol::OpenAi, Protocol::OpenAiChat),
            (
                CustomProviderProtocol::OpenAiResponses,
                Protocol::OpenAiResponses,
            ),
            (CustomProviderProtocol::OpenAiCodex, Protocol::OpenAiCodex),
        ] {
            let config = AiCompletionConfig {
                custom_protocol: Some(selected),
                ..Default::default()
            };

            assert_eq!(protocol(&config).unwrap(), expected, "{selected:?}");
        }
    }
}
