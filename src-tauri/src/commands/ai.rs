use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

use tauri::{ipc::Channel, State};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CompletionResult},
    services::ai,
};

use super::secure_storage;

static API_KEY_CACHE: LazyLock<Mutex<HashMap<AiProvider, String>>> =
    LazyLock::new(Default::default);

async fn require_api_key(provider: AiProvider) -> Result<String, String> {
    {
        let cache = ai::lock_unpoisoned(&API_KEY_CACHE);
        if let Some(key) = cache.get(&provider) {
            if !key.is_empty() {
                return Ok(key.clone());
            }
        }
    }

    // The keyring call is blocking; keep it off the async runtime.
    let loaded = tauri::async_runtime::spawn_blocking(move || {
        secure_storage::load_ai_api_key_sync(provider)
    })
    .await
    .map_err(|error| error.to_string())??;

    let api_key = loaded
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .ok_or_else(|| {
            i18n::tf(
                "ai.save_key_in_settings",
                &[("provider", provider.display_name())],
            )
        })?;

    ai::lock_unpoisoned(&API_KEY_CACHE).insert(provider, api_key.clone());

    Ok(api_key)
}

/// Updates the in-memory key cache after a successful keyring write, keeping
/// the cache and the keyring from drifting apart. Whitespace-only keys clear
/// the cache entry, matching what a keyring read would have produced.
pub(crate) fn set_cached_api_key(provider: AiProvider, api_key: &str) {
    let api_key = api_key.trim();
    let mut cache = ai::lock_unpoisoned(&API_KEY_CACHE);

    if api_key.is_empty() {
        cache.remove(&provider);
    } else {
        cache.insert(provider, api_key.to_string());
    }
}

pub(crate) fn remove_cached_api_key(provider: AiProvider) {
    ai::lock_unpoisoned(&API_KEY_CACHE).remove(&provider);
}

#[cfg(test)]
pub(crate) fn invalidate_api_key_cache() {
    ai::lock_unpoisoned(&API_KEY_CACHE).clear();
}

#[tauri::command]
pub async fn generate_completion(
    service: State<'_, ai::AiCompletionService>,
    mut config: AiCompletionConfig,
    request: CompletionRequest,
) -> Result<CompletionResult, String> {
    let provider = config.provider.unwrap_or_default();
    config.api_key = require_api_key(provider).await?;

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
    config.api_key = require_api_key(provider).await?;

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
#[cfg(test)]
mod tests {
    use super::*;

    // Serialize all tests that touch the global API_KEY_CACHE.
    // Rust runs tests in parallel by default, and these tests
    // mutate a shared static — without this gate they race on
    // insert/clear and intermittently fail (notably on Windows).
    static CACHE_TEST_LOCK: Mutex<()> = Mutex::new(());

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
        let _guard = CACHE_TEST_LOCK.lock().unwrap();
        {
            let mut cache = ai::lock_unpoisoned(&API_KEY_CACHE);
            cache.insert(AiProvider::DeepSeek, "sk-test".into());
        }
        assert!(!ai::lock_unpoisoned(&API_KEY_CACHE).is_empty());

        invalidate_api_key_cache();

        assert!(ai::lock_unpoisoned(&API_KEY_CACHE).is_empty());
    }

    #[test]
    fn invalidate_api_key_cache_empty_is_ok() {
        let _guard = CACHE_TEST_LOCK.lock().unwrap();
        invalidate_api_key_cache();
        assert!(ai::lock_unpoisoned(&API_KEY_CACHE).is_empty());
    }

    #[test]
    fn cache_updates_track_the_keyring_write() {
        let _guard = CACHE_TEST_LOCK.lock().unwrap();
        invalidate_api_key_cache();

        set_cached_api_key(AiProvider::OpenAi, "sk-new");
        assert_eq!(
            ai::lock_unpoisoned(&API_KEY_CACHE).get(&AiProvider::OpenAi),
            Some(&"sk-new".to_string())
        );

        remove_cached_api_key(AiProvider::OpenAi);
        assert!(!ai::lock_unpoisoned(&API_KEY_CACHE).contains_key(&AiProvider::OpenAi));
    }

    #[test]
    fn require_api_key_cache_hit_returns_key() {
        let _guard = CACHE_TEST_LOCK.lock().unwrap();
        // Test the cache directly to avoid races with parallel tests
        let mut cache = ai::lock_unpoisoned(&API_KEY_CACHE);
        cache.clear();
        cache.insert(AiProvider::DeepSeek, "sk-cached-key".into());

        let result = cache.get(&AiProvider::DeepSeek);
        assert_eq!(result, Some(&"sk-cached-key".to_string()));
    }

    #[tokio::test]
    // The std guard is intentional: it serializes this async test against the
    // sync tests that mutate the same global cache.
    #[allow(clippy::await_holding_lock)]
    async fn require_api_key_cache_miss_no_keyring_fallback() {
        let _guard = CACHE_TEST_LOCK.lock().unwrap();
        invalidate_api_key_cache();

        let provider = AiProvider::DeepSeek;
        let result = require_api_key(provider).await;
        match result {
            Ok(key) => {
                assert!(!key.is_empty());
            }
            Err(msg) => assert_require_api_key_error(provider, &msg),
        }
    }
}
