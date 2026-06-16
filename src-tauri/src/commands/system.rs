use crate::{
    models::cli::{CliInstallResult, CliStatus, CliUninstallResult},
    services::cli,
};

#[tauri::command]
pub async fn show_window(window: tauri::Window) {
    window.show().unwrap();
}

#[tauri::command]
pub async fn get_cli_status(app: tauri::AppHandle) -> Result<CliStatus, String> {
    cli::get_cli_status(&app)
}

#[tauri::command]
pub async fn install_cli(app: tauri::AppHandle) -> Result<CliInstallResult, String> {
    cli::install_cli(&app)
}

#[tauri::command]
pub async fn uninstall_cli() -> Result<CliUninstallResult, String> {
    cli::uninstall_cli()
}
