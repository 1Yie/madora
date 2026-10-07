use tauri::{ipc::Channel, State};

use crate::{
    models::ai::{AiCompletionConfig, CompletionRequest, CompletionResult},
    services::{ai, api_keys},
};

#[tauri::command]
pub async fn generate_completion(
    service: State<'_, ai::AiCompletionService>,
    mut config: AiCompletionConfig,
    request: CompletionRequest,
) -> Result<CompletionResult, String> {
    let provider = config.provider.unwrap_or_default();
    config.api_key = api_keys::require_async(provider).await?;

    ai::generate_completion(service.inner(), &config, &request).await
}

#[tauri::command]
pub async fn generate_completion_stream(
    service: State<'_, ai::AiCompletionService>,
    mut config: AiCompletionConfig,
    request: CompletionRequest,
    request_id: Option<String>,
    channel: Channel<String>,
) -> Result<Option<String>, String> {
    let provider = config.provider.unwrap_or_default();
    config.api_key = api_keys::require_async(provider).await?;

    // Chunks arrive on `channel` as the provider produces them; the return
    // value is the final post-processed text (`None` when cancelled).
    ai::generate_completion_stream(service.inner(), &config, &request, request_id, channel).await
}

#[tauri::command]
pub async fn cancel_completion_stream(
    service: State<'_, ai::AiCompletionService>,
    request_id: String,
) -> Result<(), String> {
    service.inner().cancel_completion_stream(&request_id);

    Ok(())
}
