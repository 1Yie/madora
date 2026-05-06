use crate::{
    models::ai::{AiCompletionConfig, CompletionRequest, CompletionResult},
    services::ai,
};

#[tauri::command]
pub async fn generate_completion(
    config: AiCompletionConfig,
    request: CompletionRequest,
) -> Result<CompletionResult, String> {
    ai::generate_completion(&config, &request).await
}
