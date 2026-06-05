use std::sync::OnceLock;

use keyring_core::{Entry, Error};

use crate::models::ai::AiProvider;

const AI_KEY_SERVICE: &str = "madora.ai";

static SECURE_STORE_INIT: OnceLock<Result<(), String>> = OnceLock::new();

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
                    format!("无法访问系统密钥存储，请确认 Secret Service / libsecret 可用: {error}")
                }
                #[cfg(not(target_os = "linux"))]
                {
                    format!("无法访问系统密钥存储: {error}")
                }
            })
        })
        .clone()
}

fn api_key_entry(provider: AiProvider) -> Result<Entry, String> {
    ensure_secure_store()?;
    Entry::new(AI_KEY_SERVICE, provider.as_key())
        .map_err(|error| format!("无法初始化系统密钥存储条目: {error}"))
}

pub(crate) fn load_ai_api_key_sync(provider: AiProvider) -> Result<Option<String>, String> {
    let entry = api_key_entry(provider)?;

    match entry.get_password() {
        Ok(api_key) => Ok(Some(api_key)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "读取 {} API Key 失败: {error}",
            provider.display_name()
        )),
    }
}

fn has_ai_api_key_sync(provider: AiProvider) -> Result<bool, String> {
    Ok(load_ai_api_key_sync(provider)?.is_some_and(|api_key| !api_key.trim().is_empty()))
}

fn store_ai_api_key_sync(provider: AiProvider, api_key: String) -> Result<(), String> {
    let entry = api_key_entry(provider)?;

    entry
        .set_password(&api_key)
        .map_err(|error| format!("保存 {} API Key 失败: {error}", provider.display_name()))
}

fn delete_ai_api_key_sync(provider: AiProvider) -> Result<(), String> {
    let entry = api_key_entry(provider)?;

    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "删除 {} API Key 失败: {error}",
            provider.display_name()
        )),
    }
}

#[tauri::command]
pub async fn store_ai_api_key(provider: AiProvider, api_key: String) -> Result<(), String> {
    super::ai::invalidate_api_key_cache();
    tauri::async_runtime::spawn_blocking(move || store_ai_api_key_sync(provider, api_key))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn has_ai_api_key(provider: AiProvider) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || has_ai_api_key_sync(provider))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_ai_api_key(provider: AiProvider) -> Result<(), String> {
    super::ai::invalidate_api_key_cache();
    tauri::async_runtime::spawn_blocking(move || delete_ai_api_key_sync(provider))
        .await
        .map_err(|error| error.to_string())?
}
