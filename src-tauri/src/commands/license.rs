use tauri::State;

use crate::services::license::{LicenseService, LicenseStatus};

#[tauri::command]
pub async fn get_license_status(
    service: State<'_, LicenseService>,
) -> Result<LicenseStatus, String> {
    service.get_status()
}

#[tauri::command]
pub async fn activate_license(
    key: String,
    service: State<'_, LicenseService>,
) -> Result<LicenseStatus, String> {
    service.activate(&key).await
}

#[tauri::command]
pub async fn verify_license(service: State<'_, LicenseService>) -> Result<LicenseStatus, String> {
    service.verify().await
}

#[tauri::command]
pub async fn force_verify_license(
    service: State<'_, LicenseService>,
) -> Result<LicenseStatus, String> {
    service.force_verify().await
}

#[tauri::command]
pub async fn deactivate_license(service: State<'_, LicenseService>) -> Result<(), String> {
    service.deactivate().await
}
