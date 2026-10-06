use tauri::State;

use crate::i18n;
use crate::models::webdav::{
    WebDavConfig, WebDavConnectionTest, WebDavSyncFileEntry, WebDavSyncResult,
    WebDavSyncStatusResult,
};
use crate::services::webdav::{
    baselines_to_mtime_map, build_http_client, SyncOrchestrator, WebDavClient, WebDavStore,
};

// ── Keyring helpers (sync/blocking) ────────────────────────────

const KEYRING_SERVICE: &str = "madora.webdav";
const KEYRING_PASSWORD_KEY: &str = "password";

fn ensure_store() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let use_secret_service = true;
    #[cfg(not(target_os = "linux"))]
    let use_secret_service = false;

    keyring::use_native_store(use_secret_service)
        .map_err(|e| i18n::tf("webdav.keyring_access_failed", &[("error", &e.to_string())]))
}

fn load_password_sync() -> Result<Option<String>, String> {
    ensure_store()?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, KEYRING_PASSWORD_KEY).map_err(|e| {
        i18n::tf(
            "webdav.keyring_entry_init_failed",
            &[("error", &e.to_string())],
        )
    })?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(i18n::tf(
            "webdav.read_password_failed",
            &[("error", &e.to_string())],
        )),
    }
}

/// Run the blocking keyring read off the async runtime.
async fn load_password() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(load_password_sync)
        .await
        .map_err(|e| e.to_string())?
}

fn store_password_sync(password: String) -> Result<(), String> {
    ensure_store()?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, KEYRING_PASSWORD_KEY).map_err(|e| {
        i18n::tf(
            "webdav.keyring_entry_init_failed",
            &[("error", &e.to_string())],
        )
    })?;
    entry
        .set_password(&password)
        .map_err(|e| i18n::tf("webdav.save_password_failed", &[("error", &e.to_string())]))
}

fn delete_password_sync() -> Result<(), String> {
    ensure_store()?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, KEYRING_PASSWORD_KEY).map_err(|e| {
        i18n::tf(
            "webdav.keyring_entry_init_failed",
            &[("error", &e.to_string())],
        )
    })?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(e) => Err(i18n::tf(
            "webdav.delete_password_failed",
            &[("error", &e.to_string())],
        )),
    }
}

// ── Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn webdav_get_config(store: State<'_, WebDavStore>) -> Result<WebDavConfig, String> {
    let mut config = store.get_config()?;
    // Never return the plaintext password to the webview; only whether one is stored.
    let has_password = load_password().await?.is_some();
    config.password = None;
    config.has_password = has_password;
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
    clean.has_password = false;
    store.set_config(clean)
}

#[tauri::command]
pub async fn webdav_delete_config(store: State<'_, WebDavStore>) -> Result<(), String> {
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
    let pw = match password {
        Some(pw) => Some(pw),
        None => load_password().await?,
    };
    let config = WebDavConfig {
        url: url.or(stored.url),
        username: username.or(stored.username),
        password: pw.or(stored.password),
        ..Default::default()
    };
    let client = build_http_client(30)?;
    let webdav = WebDavClient::new(client);
    Ok(webdav.test_connection(&config).await)
}

/// Perform a full sync, then persist the updated per-file baseline.
#[tauri::command]
pub async fn webdav_sync(
    store: State<'_, WebDavStore>,
    workspace_root: String,
) -> Result<WebDavSyncResult, String> {
    let config = store.get_config()?;
    let password = load_password().await?;
    let auth_config = WebDavConfig { password, ..config };

    let client = build_http_client(300)?;
    let orchestrator = SyncOrchestrator::new(client);

    let outcome = orchestrator
        .sync(&auth_config, std::path::Path::new(&workspace_root))
        .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut updated_config = store.get_config()?;
    // Only successfully synced (or confirmed identical) files advance the baseline;
    // failed/skipped files keep their previous entry.
    updated_config.sync_files = baselines_to_mtime_map(&outcome.baselines);
    updated_config.sync_baselines = outcome.baselines;
    updated_config.last_sync_at = Some(now);
    store.set_config(updated_config)?;

    Ok(outcome.result)
}

/// Get sync status for all tracked files (file tree decoration).
#[tauri::command]
pub async fn webdav_get_status(
    store: State<'_, WebDavStore>,
    workspace_root: String,
) -> Result<WebDavSyncStatusResult, String> {
    let config = store.get_config()?;
    let client = build_http_client(60)?;
    let orchestrator = SyncOrchestrator::new(client);

    let raw = orchestrator.compute_sync_status(std::path::Path::new(&workspace_root), &config);

    let files = raw
        .into_iter()
        .map(|(relative_path, status)| WebDavSyncFileEntry {
            relative_path,
            status,
        })
        .collect();

    Ok(WebDavSyncStatusResult { files })
}
