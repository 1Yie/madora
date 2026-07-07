use serde::Serialize;
use tauri::State;

use crate::models::madora_sync::{
    MadoraSyncAiCompletionConfig, MadoraSyncConfig, MadoraSyncPairDeviceInput,
    MadoraSyncPairDeviceResult, MadoraSyncPairingCode, MadoraSyncPairingQr,
    MadoraSyncSettingsInput,
};
use crate::models::sync_server::EditorStateInput;
use crate::services::madora_sync::MadoraSyncStore;
use crate::services::sync_server;

#[tauri::command]
pub async fn madora_sync_get_config(
    store: State<'_, MadoraSyncStore>,
) -> Result<MadoraSyncConfig, String> {
    store.get_config()
}

#[tauri::command]
pub async fn madora_sync_save_settings(
    store: State<'_, MadoraSyncStore>,
    settings: MadoraSyncSettingsInput,
) -> Result<MadoraSyncConfig, String> {
    store.save_settings(settings)
}

#[tauri::command]
pub async fn madora_sync_save_ai_completion_config(
    store: State<'_, MadoraSyncStore>,
    config: MadoraSyncAiCompletionConfig,
) -> Result<MadoraSyncConfig, String> {
    store.save_ai_completion_config(config)
}

#[tauri::command]
pub async fn madora_sync_issue_pairing_code(
    store: State<'_, MadoraSyncStore>,
) -> Result<MadoraSyncPairingCode, String> {
    store.issue_pairing_code()
}

#[tauri::command]
pub async fn madora_sync_get_pairing_qr(
    store: State<'_, MadoraSyncStore>,
) -> Result<MadoraSyncPairingQr, String> {
    store.get_pairing_qr()
}

#[tauri::command]
pub async fn madora_sync_clear_pairing_code(
    store: State<'_, MadoraSyncStore>,
) -> Result<MadoraSyncConfig, String> {
    store.clear_pairing_code()
}

#[tauri::command]
pub async fn madora_sync_remove_paired_device(
    store: State<'_, MadoraSyncStore>,
    device_id: String,
) -> Result<MadoraSyncConfig, String> {
    store.remove_paired_device(&device_id)
}

#[tauri::command]
pub async fn madora_sync_pair_device(
    store: State<'_, MadoraSyncStore>,
    request: MadoraSyncPairDeviceInput,
) -> Result<MadoraSyncPairDeviceResult, String> {
    store.pair_device(request)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncServerStatus {
    pub enabled: bool,
    pub auto_start: bool,
    pub port: u16,
}

/// Returns the current sync-server configuration so the UI can show whether
/// the host listener is expected to be running.
#[tauri::command]
pub async fn madora_sync_server_status(
    store: State<'_, MadoraSyncStore>,
) -> Result<SyncServerStatus, String> {
    let config = store.get_config()?;
    Ok(SyncServerStatus {
        enabled: config.enabled,
        auto_start: config.auto_start_server,
        port: config.port,
    })
}

/// Restart the WebSocket sync server (e.g. after changing the port or
/// toggling `enabled`). Stops any existing listener, then spawns a new one
/// if the config allows it.
#[tauri::command]
pub async fn madora_sync_restart_server<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> Result<bool, String> {
    sync_server::stop();
    // Give the accept loop a moment to observe the shutdown flag.
    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    sync_server::spawn(app_handle);
    Ok(true)
}

#[tauri::command]
pub async fn madora_sync_publish_editor_state<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    state: EditorStateInput,
) -> Result<bool, String> {
    sync_server::publish_desktop_editor_state(&app_handle, state)?;
    Ok(true)
}
