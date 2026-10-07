//! Storing and deleting credentials in the OS keyring.
//!
//! The keyring calls block (and may prompt), so every command here hands them
//! to the blocking pool. The in-process key cache lives in `services::api_keys`
//! and is updated only after the keyring accepted the change.

use crate::models::ai::AiProvider;
use crate::services::api_keys;

#[tauri::command]
pub async fn store_ai_api_key(provider: AiProvider, api_key: String) -> Result<(), String> {
    let cached_api_key = api_key.clone();

    let stored = tauri::async_runtime::spawn_blocking(move || api_keys::store(provider, &api_key))
        .await
        .map_err(|error| error.to_string())?;

    // Only after the keyring write succeeded, so a failed write cannot leave
    // the cache holding a value the keyring never accepted.
    if stored.is_ok() {
        api_keys::remember(provider, &cached_api_key);
    }

    stored
}

#[tauri::command]
pub async fn has_ai_api_key(provider: AiProvider) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || api_keys::has(provider))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_ai_api_key(provider: AiProvider) -> Result<(), String> {
    let deleted = tauri::async_runtime::spawn_blocking(move || api_keys::delete(provider))
        .await
        .map_err(|error| error.to_string())?;

    if deleted.is_ok() {
        api_keys::forget(provider);
    }

    deleted
}
