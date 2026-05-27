use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CustomProviderProtocol},
    prompt::PromptManager,
    providers::{
        anthropic::request_anthropic_compatible_fim,
        openai::request_openai_compatible_fim,
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
                request_anthropic_compatible_fim(client, prompt_manager, config, request)
                    .await
            }
            CustomProviderProtocol::OpenAi => {
                request_openai_compatible_fim(client, prompt_manager, config, request).await
            }
        }
    }
}
