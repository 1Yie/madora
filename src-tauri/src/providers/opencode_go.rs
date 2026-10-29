//! OpenCode Go fronts several vendors behind one endpoint, so the protocol
//! depends on which model the request names.

use crate::i18n;

use super::Protocol;

/// The protocol this model is served over.
pub(crate) fn protocol_for_model(model: &str) -> Result<Protocol, String> {
    let normalized = model.trim().to_ascii_lowercase();

    if normalized.starts_with("gpt-")
        || normalized.starts_with("grok-")
        || normalized.starts_with("muse-spark-")
    {
        return Ok(Protocol::OpenAiResponses);
    }
    if normalized.starts_with("gemini-") {
        return Ok(Protocol::GoogleGenerate);
    }

    if matches_openai_protocol(&normalized) {
        return Ok(Protocol::OpenAiChat);
    }

    if matches_anthropic_protocol(&normalized) {
        return Ok(Protocol::AnthropicMessages);
    }

    Err(i18n::tf(
        "ai.provider.unsupported_model",
        &[("provider", "OpenCode Go"), ("model", model)],
    ))
}

fn matches_openai_protocol(model: &str) -> bool {
    model.starts_with("glm-")
        || model.starts_with("kimi-")
        || model.starts_with("deepseek-")
        || model.starts_with("mimo-")
        || model.starts_with("step-")
        || model.starts_with("hy3")
        || model.starts_with("hy4-")
        || model.starts_with("longcat-")
        || model.starts_with("minimax-m3.1-flash")
        || matches!(
            model,
            "beam-free" | "iceman-contributor-free" | "cat-jam-free" | "space-bunny"
        )
}

fn matches_anthropic_protocol(model: &str) -> bool {
    model.starts_with("claude-") || model.starts_with("minimax-") || model.starts_with("qwen")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_openai_compatible_models() {
        for model in [
            "deepseek-v4-pro",
            "kimi-k2.7",
            "kimi-k2.7-code",
            "kimi-k3",
            "kimi-k3.1-pro",
            "step-5-preview",
            "hy4-preview",
            "hy3",
            "longcat-2.0",
            "beam-free",
            "iceman-contributor-free",
            "minimax-m3.1-flash",
            "minimax-m3.1-flash-free",
            "longcat-2.5-preview-free",
            "cat-jam-free",
            "space-bunny",
        ] {
            assert_eq!(
                protocol_for_model(model).unwrap(),
                Protocol::OpenAiChat,
                "{model}"
            );
        }
    }

    #[test]
    fn routes_gpt_to_responses_and_gemini_to_google() {
        for model in [
            "gpt-6-luna",
            "gpt-5.6-luna",
            " GPT-6-LUNA ",
            "grok-4.7",
            "muse-spark-1.2-contributor",
            "muse-spark-1.3-contributor",
        ] {
            assert_eq!(
                protocol_for_model(model).unwrap(),
                Protocol::OpenAiResponses
            );
        }
        for model in ["gemini-4-argon", " GEMINI-4-ARGON "] {
            assert_eq!(protocol_for_model(model).unwrap(), Protocol::GoogleGenerate);
        }
    }

    #[test]
    fn routes_anthropic_compatible_models() {
        assert_eq!(
            protocol_for_model("qwen3.7-plus").unwrap(),
            Protocol::AnthropicMessages
        );
        assert_eq!(
            protocol_for_model("minimax-m3").unwrap(),
            Protocol::AnthropicMessages
        );
        assert_eq!(
            protocol_for_model(" CLAUDE-HAIKU-5-5 ").unwrap(),
            Protocol::AnthropicMessages
        );
    }

    #[test]
    fn rejects_unknown_models() {
        for model in ["unknown-model", "beam-unlisted", "iceman-unlisted", ""] {
            let error = protocol_for_model(model).unwrap_err();
            assert!(error.contains(model), "{error}");
        }
    }

    use crate::{
        models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
        prompt::PromptManager,
        providers::test_support::{MockServer, ScriptedResponse},
    };
    use reqwest::Client;

    fn config(server: &MockServer, model: &str) -> AiCompletionConfig {
        AiCompletionConfig {
            api_key: "sk-test-key".into(),
            api_url: Some(server.base_url.clone()),
            model: Some(model.into()),
            provider: Some(AiProvider::OpenCodeGo),
            use_ssl: false,
            ..Default::default()
        }
    }

    fn request() -> CompletionRequest {
        CompletionRequest {
            title: Some("Notes".into()),
            prefix: "Hello".into(),
            suffix: Some("after".into()),
        }
    }

    #[tokio::test]
    async fn go_routes_new_models_to_their_protocol_endpoints() {
        for model in [
            "gpt-6-luna",
            "gemini-4-argon",
            "grok-4.7",
            "hy3",
            "muse-spark-1.3-contributor",
            "beam-free",
            "iceman-contributor-free",
            "minimax-m3.1-flash",
            "claude-haiku-5-5",
        ] {
            let protocol = protocol_for_model(model).unwrap();
            let (path, response) = match protocol {
                Protocol::AnthropicMessages => (
                    "/v1/messages",
                    r#"{"content":[{"type":"text","text":" world"}]}"#,
                ),
                Protocol::OpenAiResponses => ("/v1/responses", r#"{"output_text":" world"}"#),
                Protocol::GoogleGenerate => (
                    "/v1/models/gemini-4-argon:generateContent",
                    r#"{"candidates":[{"content":{"parts":[{"text":" world"}]}}]}"#,
                ),
                Protocol::OpenAiChat => (
                    "/v1/chat/completions",
                    r#"{"choices":[{"message":{"content":" world"}}]}"#,
                ),
                _ => panic!("unexpected Go protocol for {model}"),
            };
            let server = MockServer::start(vec![ScriptedResponse::json(200, response)]).await;
            let text = protocol
                .complete(
                    &Client::new(),
                    &PromptManager::from_user_root(None),
                    &config(&server, model),
                    &request(),
                )
                .await
                .unwrap();
            assert_eq!(text, " world", "{model}");
            let sent = &server.requests()[0];
            assert_eq!(sent.path, path, "{model}");
            if protocol != Protocol::GoogleGenerate {
                assert_eq!(sent.json()["model"], model);
            }
            if protocol == Protocol::AnthropicMessages {
                assert_eq!(sent.header("x-api-key"), Some("sk-test-key"));
                assert_eq!(sent.header("anthropic-version"), Some("2023-06-01"));
            } else if protocol == Protocol::GoogleGenerate {
                assert_eq!(sent.header("x-goog-api-key"), Some("sk-test-key"));
                assert!(sent.json()["contents"].is_array());
            } else {
                assert_eq!(sent.header("authorization"), Some("Bearer sk-test-key"));
            }
        }
    }

    #[tokio::test]
    async fn go_streams_each_supported_protocol() {
        for (model, event, path) in [
            (
                "beam-free",
                "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
                "/v1/chat/completions",
            ),
            (
                "claude-haiku-5-5",
                "data: {\"delta\":{\"text\":\" world\"}}\n\n",
                "/v1/messages",
            ),
            (
                "gpt-6-luna",
                "data: {\"type\":\"response.output_text.delta\",\"delta\":\" world\"}\n\n",
                "/v1/responses",
            ),
            (
                "gemini-4-argon",
                "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" world\"}]}}]}\n\n",
                "/v1/models/gemini-4-argon:streamGenerateContent?alt=sse",
            ),
        ] {
            let server = MockServer::start(vec![ScriptedResponse::sse(&[event])]).await;
            let mut chunks = Vec::new();
            let text = protocol_for_model(model)
                .unwrap()
                .complete_stream(
                    &Client::new(),
                    &PromptManager::from_user_root(None),
                    &config(&server, model),
                    &request(),
                    &mut |chunk| {
                        chunks.push(chunk);
                        Ok(())
                    },
                )
                .await
                .unwrap();
            assert_eq!(text, " world", "{model}");
            assert_eq!(chunks, vec![" world"], "{model}");
            assert_eq!(server.requests()[0].path, path);
            if model.starts_with("gemini-") {
                assert!(server.requests()[0].json().get("stream").is_none());
            } else {
                assert_eq!(server.requests()[0].json()["stream"], true);
            }
        }
    }
}
