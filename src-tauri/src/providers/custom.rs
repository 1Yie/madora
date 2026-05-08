use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{openai::request_openai_compatible_chat_completion, CompletionProvider},
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
        request_openai_compatible_chat_completion(
            self.provider(),
            client,
            prompt_manager,
            config,
            request,
            "fim_system",
            "fim_user",
            0.3,
        )
        .await
    }

    async fn request_chat_prefix_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        request_openai_compatible_chat_completion(
            self.provider(),
            client,
            prompt_manager,
            config,
            request,
            "chat_prefix_system",
            "chat_prefix_user",
            0.5,
        )
        .await
    }
}
