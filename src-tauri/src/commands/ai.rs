use tauri::State;

use crate::{
    models::ai::{AiCompletionConfig, CompletionRequest, CompletionResult},
    services::ai,
};

#[tauri::command]
pub async fn generate_completion(
    service: State<'_, ai::AiCompletionService>,
    config: AiCompletionConfig,
    request: CompletionRequest,
) -> Result<CompletionResult, String> {
    ai::generate_completion(service.inner(), &config, &request).await
}
