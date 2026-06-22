use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CustomProviderProtocol},
    prompt::PromptManager,
    providers::{
        anthropic::request_anthropic_compatible_fim,
        anthropic::request_anthropic_compatible_fim_stream, default_model,
        openai::request_openai_compatible_fim, openai::request_openai_compatible_fim_stream,
        resolve_model, CompletionProvider,
    },
};

pub struct OpenCodeGoProvider;

#[async_trait]
impl CompletionProvider for OpenCodeGoProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::OpenCodeGo
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        match resolve_protocol(config)? {
            CustomProviderProtocol::Anthropic => {
                request_anthropic_compatible_fim(client, prompt_manager, config, request).await
            }
            CustomProviderProtocol::Google => {
                unreachable!("OpenCode Go does not route Google-compatible models")
            }
            CustomProviderProtocol::OpenAi => {
                request_openai_compatible_fim(client, prompt_manager, config, request).await
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
        match resolve_protocol(config)? {
            CustomProviderProtocol::Anthropic => {
                request_anthropic_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            CustomProviderProtocol::Google => {
                unreachable!("OpenCode Go does not route Google-compatible models")
            }
            CustomProviderProtocol::OpenAi => {
                request_openai_compatible_fim_stream(
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

fn resolve_protocol(config: &AiCompletionConfig) -> Result<CustomProviderProtocol, String> {
    let model = resolve_model(
        config,
        default_model(AiProvider::OpenCodeGo).unwrap_or_default(),
    )?;
    let normalized = model.trim().to_ascii_lowercase();

    if matches_openai_protocol(&normalized) {
        return Ok(CustomProviderProtocol::OpenAi);
    }

    if matches_anthropic_protocol(&normalized) {
        return Ok(CustomProviderProtocol::Anthropic);
    }

    Err(format!(
        "OpenCode Go model '{model}' is not currently supported in Madora."
    ))
}

fn matches_openai_protocol(model: &str) -> bool {
    model.starts_with("glm-")
        || model.starts_with("kimi-")
        || model.starts_with("deepseek-")
        || model.starts_with("mimo-")
}

fn matches_anthropic_protocol(model: &str) -> bool {
    model.starts_with("minimax-") || model.starts_with("qwen")
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
    fn resolves_openai_compatible_models() {
        let protocol = resolve_protocol(&config_with_model("deepseek-v4-pro")).unwrap();
        assert_eq!(protocol, CustomProviderProtocol::OpenAi);

        let protocol = resolve_protocol(&config_with_model("kimi-k2.7")).unwrap();
        assert_eq!(protocol, CustomProviderProtocol::OpenAi);
    }

    #[test]
    fn resolves_anthropic_compatible_models() {
        let protocol = resolve_protocol(&config_with_model("qwen3.7-plus")).unwrap();
        assert_eq!(protocol, CustomProviderProtocol::Anthropic);

        let protocol = resolve_protocol(&config_with_model("minimax-m3")).unwrap();
        assert_eq!(protocol, CustomProviderProtocol::Anthropic);
    }

    #[test]
    fn rejects_unknown_models() {
        let error = resolve_protocol(&config_with_model("gpt-5.5")).unwrap_err();
        assert!(error.contains("gpt-5.5"));
    }
}
