use std::fs;
use std::path::PathBuf;

use crate::models::explorer::{ExplorerNode, FilePreview};
use crate::services::explorer;

#[tauri::command]
pub async fn pick_workspace_folder() -> Result<Option<ExplorerNode>, String> {
    let selected_directory =
        tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
            .await
            .map_err(|error| error.to_string())?;

    let Some(path) = selected_directory else {
        return Ok(None);
    };

    let root = tauri::async_runtime::spawn_blocking(move || explorer::build_workspace_root(&path))
        .await
        .map_err(|error| error.to_string())??;

    Ok(Some(root))
}

#[tauri::command]
pub async fn scan_workspace_folder(root_path: String) -> Result<ExplorerNode, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || explorer::build_workspace_root(&root_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_workspace_directory(
    root_path: String,
    directory_path: String,
) -> Result<Vec<ExplorerNode>, String> {
    let root_path = PathBuf::from(root_path);
    let directory_path = PathBuf::from(directory_path);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::read_directory_children(&root_path, &directory_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_workspace_file(path: String) -> Result<FilePreview, String> {
    let file_path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || explorer::read_workspace_file(&file_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn create_markdown_file(
    root_path: String,
    selected_path: Option<String>,
    file_name: String,
) -> Result<ExplorerNode, String> {
    let root_path = PathBuf::from(root_path);
    let selected_path = selected_path.map(PathBuf::from);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::create_markdown_file(&root_path, selected_path.as_deref(), &file_name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn write_workspace_file(path: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || {
        fs::write(file_path, content).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
