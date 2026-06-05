use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
    providers::{
        openai::{request_openai_compatible_fim, request_openai_compatible_fim_stream},
        CompletionProvider,
    },
};

pub struct MiniMaxProvider;

#[async_trait]
impl CompletionProvider for MiniMaxProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::MiniMax
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
