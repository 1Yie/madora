use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{openai::request_openai_compatible_fim, CompletionProvider},
};

pub struct KimiProvider;

#[async_trait]
impl CompletionProvider for KimiProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::Kimi
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
}
