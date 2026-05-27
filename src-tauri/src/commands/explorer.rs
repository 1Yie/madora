use std::path::PathBuf;

use crate::models::explorer::{ExplorerNode, FilePreview};
use crate::services::explorer;

#[tauri::command]
pub async fn pick_workspace_folder(show_hidden_files: Option<bool>) -> Result<Option<ExplorerNode>, String> {
    let show_hidden_files = show_hidden_files.unwrap_or(false);
    let selected_directory =
        tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
            .await
            .map_err(|error| error.to_string())?;

    let Some(path) = selected_directory else {
        return Ok(None);
    };

    let root = tauri::async_runtime::spawn_blocking(move || {
        explorer::build_workspace_root(&path, show_hidden_files)
    })
    .await
    .map_err(|error| error.to_string())??;

    Ok(Some(root))
}

#[tauri::command]
pub async fn scan_workspace_folder(
    root_path: String,
    show_hidden_files: Option<bool>,
) -> Result<ExplorerNode, String> {
    let root_path = PathBuf::from(root_path);
    let show_hidden_files = show_hidden_files.unwrap_or(false);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::build_workspace_root(&root_path, show_hidden_files)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_workspace_directory(
    root_path: String,
    directory_path: String,
    show_hidden_files: Option<bool>,
) -> Result<Vec<ExplorerNode>, String> {
    let root_path = PathBuf::from(root_path);
    let directory_path = PathBuf::from(directory_path);
    let show_hidden_files = show_hidden_files.unwrap_or(false);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::read_directory_children(&root_path, &directory_path, show_hidden_files)
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
pub async fn create_workspace_directory(
    root_path: String,
    selected_path: Option<String>,
    directory_name: String,
) -> Result<ExplorerNode, String> {
    let root_path = PathBuf::from(root_path);
    let selected_path = selected_path.map(PathBuf::from);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::create_workspace_directory(&root_path, selected_path.as_deref(), &directory_name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn write_workspace_file(path: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || explorer::write_workspace_file(&file_path, &content))
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn rename_workspace_node(
    root_path: String,
    target_path: String,
    new_name: String,
) -> Result<(), String> {
    let root_path = PathBuf::from(root_path);
    let target_path = PathBuf::from(target_path);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::rename_workspace_node(&root_path, &target_path, &new_name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_workspace_node(root_path: String, target_path: String) -> Result<(), String> {
    let root_path = PathBuf::from(root_path);
    let target_path = PathBuf::from(target_path);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::delete_workspace_node(&root_path, &target_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn move_workspace_node(
    root_path: String,
    source_path: String,
    destination_directory: String,
) -> Result<(), String> {
    let root_path = PathBuf::from(root_path);
    let source_path = PathBuf::from(source_path);
    let destination_directory = PathBuf::from(destination_directory);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::move_workspace_node(&root_path, &source_path, &destination_directory)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn copy_workspace_node(
    root_path: String,
    source_path: String,
    destination_directory: String,
) -> Result<(), String> {
    let root_path = PathBuf::from(root_path);
    let source_path = PathBuf::from(source_path);
    let destination_directory = PathBuf::from(destination_directory);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::copy_workspace_node(&root_path, &source_path, &destination_directory)
    })
    .await
    .map_err(|error| error.to_string())?
}
