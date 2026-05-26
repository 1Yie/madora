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

#[cfg(test)]
mod tests {
    use super::*;

    // ─── invalidate_api_key_cache ────────────────────────────────────

    #[test]
    fn invalidate_api_key_cache_clears_cache() {
        // Seed the cache with a value
        {
            let mut cache = API_KEY_CACHE.lock().unwrap();
            cache.insert(AiProvider::DeepSeek, "sk-test".into());
        }
        assert!(!API_KEY_CACHE.lock().unwrap().is_empty());

        invalidate_api_key_cache();

        assert!(API_KEY_CACHE.lock().unwrap().is_empty());
    }

    #[test]
    fn invalidate_api_key_cache_empty_is_ok() {
        // Should not panic on empty cache
        invalidate_api_key_cache();
        assert!(API_KEY_CACHE.lock().unwrap().is_empty());
    }

    // ─── require_api_key (cache hit) ─────────────────────────────────

    #[test]
    fn require_api_key_cache_hit_returns_key() {
        // Clear first
        invalidate_api_key_cache();

        // Insert into cache
        {
            let mut cache = API_KEY_CACHE.lock().unwrap();
            cache.insert(AiProvider::DeepSeek, "sk-cached-key".into());
        }

        let result = require_api_key(AiProvider::DeepSeek);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "sk-cached-key");
    }

    #[test]
    fn require_api_key_cache_miss_no_keyring_fallback() {
        // Clear cache
        invalidate_api_key_cache();

        // This will try to access the keyring, which may fail in CI/test environments.
        // We just verify the error message contains the expected pattern.
        let result = require_api_key(AiProvider::DeepSeek);
        match result {
            Ok(key) => {
                // In some environments the keyring might work
                assert!(!key.is_empty());
            }
            Err(msg) => {
                // Expected: keyring access error or "please configure" message
                assert!(msg.contains("API Key") || msg.contains("密钥存储"));
            }
        }
    }
}
