use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CustomProviderProtocol},
    prompt::PromptManager,
    providers::{
        anthropic::request_anthropic_compatible_fim,
        anthropic::request_anthropic_compatible_fim_stream,
        google::{request_google_compatible_fim, request_google_compatible_fim_stream},
        openai::request_openai_compatible_fim,
        openai::request_openai_compatible_fim_stream,
        CompletionProvider,
    },
};

pub struct CustomProvider;

#[async_trait]
impl CompletionProvider for CustomProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::Custom
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        match config.custom_protocol.unwrap_or_default() {
            CustomProviderProtocol::Anthropic => {
                request_anthropic_compatible_fim(client, prompt_manager, config, request).await
            }
            CustomProviderProtocol::Google => {
                request_google_compatible_fim(client, prompt_manager, config, request).await
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
        match config.custom_protocol.unwrap_or_default() {
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
                request_google_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
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
