use std::path::PathBuf;

use crate::services::project;

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || project::read_file_content(&file_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn scan_project(root: String) -> Result<Vec<String>, String> {
    let root_path = PathBuf::from(root);

    tauri::async_runtime::spawn_blocking(move || project::scan_project(&root_path))
        .await
        .map_err(|error| error.to_string())?
}
