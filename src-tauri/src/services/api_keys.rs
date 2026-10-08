//! API keys: the OS keyring plus a small in-process cache.
//!
//! The platform's secret service can take hundreds of milliseconds and may pop
//! a prompt on Linux, so a completion must not consult it on every keystroke.
//! The cache is refreshed whenever a key is stored or deleted, so it cannot
//! drift from what the keyring holds.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, OnceLock};

use keyring_core::{Entry, Error};

use super::mutex::lock_unpoisoned;
use crate::i18n;
use crate::models::ai::AiProvider;

const AI_KEY_SERVICE: &str = "madora.ai";

/// The outcome of initialising the platform store, computed once.
static SECURE_STORE_INIT: OnceLock<Result<(), String>> = OnceLock::new();
static CACHE: LazyLock<Mutex<KeyCache>> = LazyLock::new(Default::default);

/// The cached keys plus a counter that moves whenever one is written or
/// removed on purpose. A slow keyring read compares it before storing its
/// result, so it cannot overwrite a newer `store`/`delete` with the value it
/// read before that change.
#[derive(Default)]
struct KeyCache {
    keys: HashMap<AiProvider, String>,
    generation: u64,
}

fn ensure_secure_store() -> Result<(), String> {
    SECURE_STORE_INIT
        .get_or_init(|| {
            #[cfg(target_os = "linux")]
            let use_secret_service = true;
            #[cfg(not(target_os = "linux"))]
            let use_secret_service = false;

            keyring::use_native_store(use_secret_service).map_err(|error| {
                #[cfg(target_os = "linux")]
                {
                    i18n::tf(
                        "secure_storage.access_failed_linux",
                        &[("error", &error.to_string())],
                    )
                }
                #[cfg(not(target_os = "linux"))]
                {
                    i18n::tf(
                        "secure_storage.access_failed",
                        &[("error", &error.to_string())],
                    )
                }
            })
        })
        .clone()
}

fn api_key_entry(provider: AiProvider) -> Result<Entry, String> {
    ensure_secure_store()?;
    Entry::new(AI_KEY_SERVICE, provider.as_key()).map_err(|error| {
        i18n::tf(
            "secure_storage.init_entry_failed",
            &[("error", &error.to_string())],
        )
    })
}

/// The value as the keyring holds it, without consulting the cache. Blocking.
fn load_from_keyring(provider: AiProvider) -> Result<Option<String>, String> {
    let entry = api_key_entry(provider)?;

    match entry.get_password() {
        Ok(api_key) => Ok(Some(api_key)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(i18n::tf(
            "secure_storage.read_api_key_failed",
            &[
                ("provider", provider.display_name()),
                ("error", &error.to_string()),
            ],
        )),
    }
}

/// Trims a stored value and treats a blank one as "not configured".
fn normalise(stored: Option<String>) -> Option<String> {
    stored
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
}

fn cached(provider: AiProvider) -> Option<String> {
    lock_unpoisoned(&CACHE).keys.get(&provider).cloned()
}

fn generation() -> u64 {
    lock_unpoisoned(&CACHE).generation
}

fn lookup_with(
    provider: AiProvider,
    load: impl FnOnce() -> Result<Option<String>, String>,
) -> Result<Option<String>, String> {
    if let Some(key) = cached(provider) {
        return Ok(Some(key));
    }

    let generation_before = generation();
    let key = normalise(load()?);

    if let Some(key) = &key {
        let mut cache = lock_unpoisoned(&CACHE);

        // Skip the write if a store or delete landed while the keyring was
        // being read: that value is newer than what was just loaded.
        if cache.generation == generation_before {
            cache.keys.insert(provider, key.clone());
        }
    }

    Ok(key)
}

/// The key the user configured, if any. Blocking; the result is cached.
pub fn lookup(provider: AiProvider) -> Result<Option<String>, String> {
    lookup_with(provider, || load_from_keyring(provider))
}

/// The key, or the error telling the user where to save one.
///
/// A cache hit is returned without touching the blocking pool, because this
/// runs before every completion.
pub async fn require_async(provider: AiProvider) -> Result<String, String> {
    if let Some(key) = cached(provider) {
        return Ok(key);
    }

    let stored = tauri::async_runtime::spawn_blocking(move || lookup(provider))
        .await
        .map_err(|error| error.to_string())??;

    stored.ok_or_else(|| missing_key_error(provider))
}

/// The key for a paired device, which needs to tell "not configured apart"
/// from "the keyring is broken" to show the right message.
pub async fn lookup_async(provider: AiProvider) -> Result<Option<String>, String> {
    if let Some(key) = cached(provider) {
        return Ok(Some(key));
    }

    tauri::async_runtime::spawn_blocking(move || lookup(provider))
        .await
        .map_err(|error| error.to_string())?
}

fn missing_key_error(provider: AiProvider) -> String {
    i18n::tf(
        "ai.save_key_in_settings",
        &[("provider", provider.display_name())],
    )
}

/// Writes the key to the keyring. Blocking; the cache is not touched.
pub fn store(provider: AiProvider, api_key: &str) -> Result<(), String> {
    let entry = api_key_entry(provider)?;

    entry.set_password(api_key).map_err(|error| {
        i18n::tf(
            "secure_storage.save_api_key_failed",
            &[
                ("provider", provider.display_name()),
                ("error", &error.to_string()),
            ],
        )
    })
}

pub fn delete(provider: AiProvider) -> Result<(), String> {
    let entry = api_key_entry(provider)?;

    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(i18n::tf(
            "secure_storage.delete_api_key_failed",
            &[
                ("provider", provider.display_name()),
                ("error", &error.to_string()),
            ],
        )),
    }
}

/// Whether a usable key is configured. Blocking.
pub fn has(provider: AiProvider) -> Result<bool, String> {
    Ok(lookup(provider)?.is_some())
}

/// Points the cache at what was just written. A blank key clears the entry,
/// which is what a later keyring read would report.
pub fn remember(provider: AiProvider, api_key: &str) {
    let api_key = api_key.trim();
    let mut cache = lock_unpoisoned(&CACHE);

    cache.generation += 1;

    if api_key.is_empty() {
        cache.keys.remove(&provider);
    } else {
        cache.keys.insert(provider, api_key.to_string());
    }
}

pub fn forget(provider: AiProvider) {
    let mut cache = lock_unpoisoned(&CACHE);

    cache.generation += 1;
    cache.keys.remove(&provider);
}

#[cfg(test)]
pub fn clear_cache() {
    lock_unpoisoned(&CACHE).keys.clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    /// The cache is process-global, so tests that touch it take turns. The
    /// guard is poison-tolerant because a failing test must not block the
    /// others.
    static CACHE_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn exclusive_cache() -> MutexGuard<'static, ()> {
        let guard = CACHE_TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        clear_cache();
        guard
    }

    #[test]
    fn a_cached_key_wins_over_the_keyring() {
        let _lock = exclusive_cache();
        remember(AiProvider::OpenAi, "sk-cached");
        let mut keyring_read = false;

        let key = lookup_with(AiProvider::OpenAi, || {
            keyring_read = true;
            Ok(None)
        })
        .unwrap();

        assert_eq!(key.as_deref(), Some("sk-cached"));
        assert!(!keyring_read, "the keyring must not be read on a cache hit");
    }

    #[test]
    fn a_stored_key_is_trimmed_and_cached() {
        let _lock = exclusive_cache();

        let key = lookup_with(AiProvider::DeepSeek, || Ok(Some("  sk-key\n".into()))).unwrap();

        assert_eq!(key.as_deref(), Some("sk-key"));
        assert_eq!(cached(AiProvider::DeepSeek).as_deref(), Some("sk-key"));
    }

    #[test]
    fn blank_stored_values_count_as_not_configured() {
        let _lock = exclusive_cache();

        for stored in [None, Some(String::new()), Some("   \n\t".into())] {
            clear_cache();

            let key = lookup_with(AiProvider::Kimi, || Ok(stored.clone())).unwrap();

            assert_eq!(key, None, "stored: {stored:?}");
            assert!(cached(AiProvider::Kimi).is_none());
        }
    }

    #[test]
    fn a_keyring_failure_is_reported_instead_of_being_treated_as_missing() {
        let _lock = exclusive_cache();

        let error = lookup_with(AiProvider::Zhipu, || Err("keyring unavailable".into()))
            .expect_err("a failing keyring is not the same as no key");

        assert!(error.contains("keyring unavailable"), "{error}");
    }

    #[test]
    fn remember_and_forget_keep_the_cache_in_step() {
        let _lock = exclusive_cache();

        remember(AiProvider::OpenAi, "sk-new");
        assert_eq!(cached(AiProvider::OpenAi).as_deref(), Some("sk-new"));

        forget(AiProvider::OpenAi);
        assert!(cached(AiProvider::OpenAi).is_none());
    }

    #[test]
    fn remembering_a_blank_key_clears_the_entry() {
        let _lock = exclusive_cache();
        remember(AiProvider::OpenAi, "sk-new");

        for blank in ["", "   "] {
            remember(AiProvider::OpenAi, "sk-new");
            remember(AiProvider::OpenAi, blank);

            assert!(cached(AiProvider::OpenAi).is_none(), "blank: {blank:?}");
        }
    }

    #[test]
    fn a_store_during_a_keyring_read_is_not_overwritten() {
        let _lock = exclusive_cache();

        let key = lookup_with(AiProvider::OpenAi, || {
            remember(AiProvider::OpenAi, "sk-new");
            Ok(Some("sk-old".into()))
        })
        .unwrap();

        // The caller still gets what it read, but the cache keeps the newer key.
        assert_eq!(key.as_deref(), Some("sk-old"));
        assert_eq!(cached(AiProvider::OpenAi).as_deref(), Some("sk-new"));
    }

    #[test]
    fn a_delete_during_a_keyring_read_is_not_undone() {
        let _lock = exclusive_cache();

        lookup_with(AiProvider::OpenAi, || {
            forget(AiProvider::OpenAi);
            Ok(Some("sk-old".into()))
        })
        .unwrap();

        assert!(cached(AiProvider::OpenAi).is_none());
    }

    #[test]
    fn the_missing_key_error_names_the_provider() {
        let message = missing_key_error(AiProvider::MiMo);

        assert!(message.contains("MiMo"), "{message}");
    }
}
