use std::path::PathBuf;

use tauri::State;

use crate::models::explorer::{ExplorerNode, FilePreview};
use crate::protocol::MadoraProtocolState;
use crate::services::explorer;

#[tauri::command]
pub async fn pick_workspace_folder(
    protocol_state: State<'_, MadoraProtocolState>,
    show_hidden_files: Option<bool>,
    sort: Option<bool>,
) -> Result<Option<ExplorerNode>, String> {
    let show_hidden_files = show_hidden_files.unwrap_or(false);
    let sort = sort.unwrap_or(true);
    let selected_directory =
        tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
            .await
            .map_err(|error| error.to_string())?;

    let Some(path) = selected_directory else {
        return Ok(None);
    };

    let root = tauri::async_runtime::spawn_blocking(move || {
        explorer::build_workspace_root(&path, show_hidden_files, sort)
    })
    .await
    .map_err(|error| error.to_string())??;

    // The native picker is the one trusted source of a new workspace root.
    protocol_state.set_workspace_root(Some(PathBuf::from(&root.path)));

    Ok(Some(root))
}

#[tauri::command]
pub async fn scan_workspace_folder(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    show_hidden_files: Option<bool>,
    sort: Option<bool>,
) -> Result<ExplorerNode, String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let show_hidden_files = show_hidden_files.unwrap_or(false);
    let sort = sort.unwrap_or(true);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::build_workspace_root(&root_path, show_hidden_files, sort)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_workspace_directory(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    directory_path: String,
    show_hidden_files: Option<bool>,
    sort: Option<bool>,
) -> Result<Vec<ExplorerNode>, String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let directory_path = PathBuf::from(directory_path);
    let show_hidden_files = show_hidden_files.unwrap_or(false);
    let sort = sort.unwrap_or(true);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::read_directory_children(&root_path, &directory_path, show_hidden_files, sort)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn read_workspace_file(
    protocol_state: State<'_, MadoraProtocolState>,
    path: String,
) -> Result<FilePreview, String> {
    let root = protocol_state.get_workspace_root();
    let requested = PathBuf::from(path);

    let document_dir = tauri::async_runtime::spawn_blocking(move || {
        let file_path = explorer::authorize_file_access(root.as_deref(), &requested, false)?;
        let preview = explorer::read_workspace_file(&file_path)?;

        Ok::<_, String>((
            preview,
            explorer::external_document_dir(root.as_deref(), &file_path),
        ))
    })
    .await
    .map_err(|error| error.to_string())??;

    // A Markdown file from outside the workspace (opened from the OS, followed
    // from a link, restored from a previous session) shows the images next to
    // it. The directory is derived from the path the backend just authorised,
    // so it cannot reach an image this command would not read anyway.
    let (preview, document_dir) = document_dir;
    if let Some(dir) = document_dir {
        protocol_state.allow_document_dir(dir);
    }

    Ok(preview)
}

#[tauri::command]
pub async fn create_markdown_file(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    selected_path: Option<String>,
    file_name: String,
) -> Result<ExplorerNode, String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let selected_path = selected_path.map(PathBuf::from);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::create_markdown_file(&root_path, selected_path.as_deref(), &file_name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn create_workspace_directory(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    selected_path: Option<String>,
    directory_name: String,
) -> Result<ExplorerNode, String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let selected_path = selected_path.map(PathBuf::from);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::create_workspace_directory(&root_path, selected_path.as_deref(), &directory_name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn write_workspace_file(
    protocol_state: State<'_, MadoraProtocolState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let root = protocol_state.get_workspace_root();
    let requested = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || {
        let file_path = explorer::authorize_file_access(root.as_deref(), &requested, true)?;
        explorer::write_workspace_file(&file_path, &content)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn rename_workspace_node(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    target_path: String,
    new_name: String,
) -> Result<(), String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let target_path = PathBuf::from(target_path);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::rename_workspace_node(&root_path, &target_path, &new_name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_workspace_node(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    target_path: String,
) -> Result<(), String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let target_path = PathBuf::from(target_path);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::delete_workspace_node(&root_path, &target_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn move_workspace_node(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    source_path: String,
    destination_directory: String,
) -> Result<(), String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let source_path = PathBuf::from(source_path);
    let destination_directory = PathBuf::from(destination_directory);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::move_workspace_node(&root_path, &source_path, &destination_directory)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn import_external_files(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    destination_directory: String,
    source_paths: Vec<String>,
) -> Result<Vec<ExplorerNode>, String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let destination_directory = PathBuf::from(destination_directory);

    tauri::async_runtime::spawn_blocking(move || {
        let mut imported_nodes = Vec::new();
        let mut _skipped_count = 0u32;

        for source_path_str in source_paths {
            let source_path = PathBuf::from(source_path_str);

            match explorer::import_external_file(&root_path, &destination_directory, &source_path) {
                Ok(node) => imported_nodes.push(node),
                Err(_) => _skipped_count += 1,
            }
        }

        Ok(imported_nodes)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn copy_workspace_node(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    source_path: String,
    destination_directory: String,
) -> Result<(), String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let source_path = PathBuf::from(source_path);
    let destination_directory = PathBuf::from(destination_directory);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::copy_workspace_node(&root_path, &source_path, &destination_directory)
    })
    .await
    .map_err(|error| error.to_string())?
}
