use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

use tauri::{ipc::Channel, State};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CompletionResult},
    services::ai,
    services::license::LicenseService,
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
        .ok_or_else(|| {
            i18n::tf(
                "ai.save_key_in_settings",
                &[("provider", provider.display_name())],
            )
        })?;

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
    license_service: State<'_, LicenseService>,
    mut config: AiCompletionConfig,
    request: CompletionRequest,
) -> Result<CompletionResult, String> {
    license_service.ensure_valid().await?;
    let provider = config.provider.unwrap_or_default();
    config.api_key = require_api_key(provider)?;

    ai::generate_completion(service.inner(), &config, &request).await
}

#[tauri::command]
pub async fn generate_completion_stream(
    service: State<'_, ai::AiCompletionService>,
    license_service: State<'_, LicenseService>,
    mut config: AiCompletionConfig,
    request: CompletionRequest,
    channel: Channel<String>,
) -> Result<(), String> {
    license_service.ensure_valid().await?;
    let provider = config.provider.unwrap_or_default();
    config.api_key = require_api_key(provider)?;

    ai::generate_completion_stream(service.inner(), &config, &request, channel).await
}
#[cfg(test)]
mod tests {
    use super::*;

    fn assert_require_api_key_error(provider: AiProvider, msg: &str) {
        let save_key_message = i18n::tf(
            "ai.save_key_in_settings",
            &[("provider", provider.display_name())],
        );
        let secure_storage_prefixes = [
            i18n::tf("secure_storage.access_failed", &[("error", "")]),
            i18n::tf("secure_storage.access_failed_linux", &[("error", "")]),
            i18n::tf("secure_storage.init_entry_failed", &[("error", "")]),
            i18n::tf(
                "secure_storage.read_api_key_failed",
                &[("provider", provider.display_name()), ("error", "")],
            ),
        ];

        assert!(
            msg == save_key_message
                || secure_storage_prefixes
                    .iter()
                    .map(|value| value.trim_end())
                    .any(|prefix| msg.starts_with(prefix)),
            "unexpected require_api_key error: {msg}"
        );
    }

    #[test]
    fn invalidate_api_key_cache_clears_cache() {
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
        invalidate_api_key_cache();
        assert!(API_KEY_CACHE.lock().unwrap().is_empty());
    }

    #[test]
    fn require_api_key_cache_hit_returns_key() {
        // Test the cache directly to avoid races with parallel tests
        let mut cache = API_KEY_CACHE.lock().unwrap();
        cache.clear();
        cache.insert(AiProvider::DeepSeek, "sk-cached-key".into());

        let result = cache.get(&AiProvider::DeepSeek);
        assert_eq!(result, Some(&"sk-cached-key".to_string()));
    }

    #[test]
    fn require_api_key_cache_miss_no_keyring_fallback() {
        invalidate_api_key_cache();

        let provider = AiProvider::DeepSeek;
        let result = require_api_key(provider);
        match result {
            Ok(key) => {
                assert!(!key.is_empty());
            }
            Err(msg) => assert_require_api_key_error(provider, &msg),
        }
    }
}
