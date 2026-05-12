use tauri::State;

use crate::{
    models::ai::{AiCompletionConfig, CompletionRequest, CompletionResult},
    services::ai,
};

use super::secure_storage;

fn require_api_key(provider: crate::models::ai::AiProvider) -> Result<String, String> {
    secure_storage::load_ai_api_key_sync(provider)?
        .map(|api_key| api_key.trim().to_string())
        .filter(|api_key| !api_key.is_empty())
        .ok_or_else(|| format!("请先在设置中保存 {} API Key", provider.display_name()))
}

#[tauri::command]
pub async fn generate_completion(
    service: State<'_, ai::AiCompletionService>,
    mut config: AiCompletionConfig,
    request: CompletionRequest,
) -> Result<CompletionResult, String> {
    let provider = config.provider.unwrap_or_default();
    config.api_key = require_api_key(provider)?;

    ai::generate_completion(service.inner(), &config, &request).await
}
