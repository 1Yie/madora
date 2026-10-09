use tauri::State;

use crate::i18n;
use crate::services::launch_mode::LaunchMode;

/// Whether this process is the full app or a one-off document window, so the
/// webview can leave out what a document window does not run.
#[tauri::command]
pub async fn get_launch_mode(mode: State<'_, LaunchMode>) -> Result<LaunchMode, String> {
    Ok(*mode)
}

#[tauri::command]
pub async fn show_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn set_app_locale(app: tauri::AppHandle, locale: String) {
    i18n::set_locale(&locale);
    crate::app::refresh_tray_menu(&app);
}
