
use tauri::State;

use crate::models::webdav::{
    WebDavConfig, WebDavConnectionTest, WebDavSyncFileEntry,
    WebDavSyncResult, WebDavSyncStatusResult,
};
use crate::services::webdav::{SyncOrchestrator, WebDavClient, WebDavStore};

// ── Keyring helpers (sync/blocking) ────────────────────────────

const KEYRING_SERVICE: &str = "madora.webdav";
const KEYRING_PASSWORD_KEY: &str = "password";

fn ensure_store() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let use_secret_service = true;
    #[cfg(not(target_os = "linux"))]
    let use_secret_service = false;

    keyring::use_native_store(use_secret_service).map_err(|e| {
        format!("无法访问系统密钥存储: {e}")
    })
}

fn load_password_sync() -> Result<Option<String>, String> {
    ensure_store()?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, KEYRING_PASSWORD_KEY)
        .map_err(|e| format!("无法初始化密钥存储条目: {e}"))?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("读取密码失败: {e}")),
    }
}

fn store_password_sync(password: String) -> Result<(), String> {
    ensure_store()?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, KEYRING_PASSWORD_KEY)
        .map_err(|e| format!("无法初始化密钥存储条目: {e}"))?;
    entry.set_password(&password).map_err(|e| format!("保存密码失败: {e}"))
}

fn delete_password_sync() -> Result<(), String> {
    ensure_store()?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, KEYRING_PASSWORD_KEY)
        .map_err(|e| format!("无法初始化密钥存储条目: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("删除密码失败: {e}")),
    }
}

// ── Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn webdav_get_config(
    store: State<'_, WebDavStore>,
) -> Result<WebDavConfig, String> {
    let mut config = store.get_config()?;
    if let Ok(Some(password)) = load_password_sync() {
        config.password = Some(password);
    }
    Ok(config)
}

#[tauri::command]
pub async fn webdav_save_config(
    store: State<'_, WebDavStore>,
    config: WebDavConfig,
    password: Option<String>,
) -> Result<(), String> {
    if let Some(pw) = password {
        tauri::async_runtime::spawn_blocking(move || store_password_sync(pw))
            .await
            .map_err(|e| e.to_string())??;
    }
    let mut clean = config;
    clean.password = None;
    store.set_config(clean)
}

#[tauri::command]
pub async fn webdav_delete_config(
    store: State<'_, WebDavStore>,
) -> Result<(), String> {
    store.set_config(WebDavConfig::default())?;
    tauri::async_runtime::spawn_blocking(delete_password_sync)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn webdav_test_connection(
    store: State<'_, WebDavStore>,
    url: Option<String>,
    username: Option<String>,
    password: Option<String>,
) -> Result<WebDavConnectionTest, String> {
    let stored = store.get_config()?;
    let pw = password.or_else(|| load_password_sync().ok().flatten());
    let config = WebDavConfig {
        url: url.or(stored.url),
        username: username.or(stored.username),
        password: pw.or(stored.password),
        ..Default::default()
    };
    let client = reqwest::Client::new();
    let webdav = WebDavClient::new(client);
    Ok(webdav.test_connection(&config).await)
}

/// Perform a full sync, then save a snapshot of synced file mtimes.
#[tauri::command]
pub async fn webdav_sync(
    store: State<'_, WebDavStore>,
    workspace_root: String,
) -> Result<WebDavSyncResult, String> {
    let config = store.get_config()?;
    let password = load_password_sync()?.unwrap_or_default();
    let auth_config = WebDavConfig {
        password: Some(password),
        ..config
    };

    let client = reqwest::Client::new();
    let orchestrator = SyncOrchestrator::new(client);

    let result = orchestrator
        .sync(&auth_config, std::path::Path::new(&workspace_root))
        .await?;

    // Snapshot current file states as the new baseline
    let snapshot = orchestrator.snapshot_local_files(
        std::path::Path::new(&workspace_root),
        &auth_config,
    );

    let now = chrono::Utc::now().to_rfc3339();
    let mut updated_config = store.get_config()?;
    updated_config.sync_files = snapshot;
    updated_config.last_sync_at = Some(now);
    store.set_config(updated_config)?;

    Ok(result)
}

/// Get sync status for all tracked files (file tree decoration).
#[tauri::command]
pub async fn webdav_get_status(
    store: State<'_, WebDavStore>,
    workspace_root: String,
) -> Result<WebDavSyncStatusResult, String> {
    let config = store.get_config()?;
    let client = reqwest::Client::new();
    let orchestrator = SyncOrchestrator::new(client);

    let raw = orchestrator.compute_sync_status(
        std::path::Path::new(&workspace_root),
        &config,
    );

    let files = raw
        .into_iter()
        .map(|(relative_path, status)| WebDavSyncFileEntry {
            relative_path,
            status,
        })
        .collect();

    Ok(WebDavSyncStatusResult { files })
}
