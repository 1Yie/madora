use std::{collections::HashMap, sync::{LazyLock, Mutex}};

use tauri::State;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CompletionResult},
    services::ai,
};

use super::secure_storage;

static API_KEY_CACHE: LazyLock<Mutex<HashMap<AiProvider, String>>> =
    LazyLock::new(Default::default);

fn require_api_key(provider: AiProvider) -> Result<String, String> {
    {
        let cache = API_KEY_CACHE.lock().unwrap();
        if let Some(key) = cache.get(&provider) {
            if !key.is_empty() {
                return Ok(key.clone());
            }
        }
    }

    let api_key = secure_storage::load_ai_api_key_sync(provider)?
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .ok_or_else(|| format!("请先在设置中保存 {} API Key", provider.display_name()))?;

    {
        let mut cache = API_KEY_CACHE.lock().unwrap();
        cache.insert(provider, api_key.clone());
    }

    Ok(api_key)
}

pub(crate) fn invalidate_api_key_cache() {
    API_KEY_CACHE.lock().unwrap().clear();
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
