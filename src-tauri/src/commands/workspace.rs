use crate::models::workspace::WorkspaceState;
use crate::protocol::MadoraProtocolState;
use crate::services::workspace::WorkspaceStore;
use tauri::State;

#[tauri::command]
pub async fn get_workspace_state(
    store: State<'_, WorkspaceStore>,
) -> Result<WorkspaceState, String> {
    store.get_state()
}

#[tauri::command]
pub async fn set_workspace_root(
    store: State<'_, WorkspaceStore>,
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: Option<String>,
) -> Result<(), String> {
    // Sync the workspace root into the protocol handler state
    protocol_state.set_workspace_root(root_path.as_ref().map(std::path::PathBuf::from));
    store.set_root_path(root_path)
}

#[tauri::command]
pub async fn add_tab(store: State<'_, WorkspaceStore>, file_path: String) -> Result<(), String> {
    store.add_tab(&file_path)
}

#[tauri::command]
pub async fn close_tab(store: State<'_, WorkspaceStore>, file_path: String) -> Result<(), String> {
    store.close_tab(&file_path)
}

#[tauri::command]
pub async fn close_tabs(
    store: State<'_, WorkspaceStore>,
    file_paths: Vec<String>,
) -> Result<(), String> {
    store.close_tabs(&file_paths)
}

#[tauri::command]
pub async fn set_active_tab(
    store: State<'_, WorkspaceStore>,
    file_path: Option<String>,
) -> Result<(), String> {
    store.set_active_tab(file_path.as_deref())
}

#[tauri::command]
pub async fn set_sidebar_width(store: State<'_, WorkspaceStore>, width: u32) -> Result<(), String> {
    store.set_sidebar_width(width)
}

#[tauri::command]
pub async fn set_tab_bar_mode(
    store: State<'_, WorkspaceStore>,
    mode: String,
) -> Result<(), String> {
    store.set_tab_bar_mode(&mode)
}

#[tauri::command]
pub async fn set_zoom_level(
    store: State<'_, WorkspaceStore>,
    zoom_level: f64,
) -> Result<(), String> {
    store.set_zoom_level(zoom_level)
}

#[tauri::command]
pub async fn set_open_tab_paths(
    store: State<'_, WorkspaceStore>,
    paths: Vec<String>,
) -> Result<(), String> {
    store.set_open_tab_paths(&paths)
}

#[tauri::command]
pub async fn clear_workspace_state(store: State<'_, WorkspaceStore>) -> Result<(), String> {
    store.clear()
}

/// Resolve a markdown image source to an absolute filesystem path.
///
/// The frontend should call `convertFileSrc()` on the returned path
/// to obtain a Tauri asset protocol URL.
#[tauri::command]
pub async fn resolve_image_src(
    src: String,
    file_path: String,
    root_path: Option<String>,
) -> Result<String, String> {
    Ok(crate::services::workspace::resolve_image_src(
        &src,
        &file_path,
        root_path.as_deref(),
    ))
}
