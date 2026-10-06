use std::path::PathBuf;

use tauri::State;

use crate::protocol::MadoraProtocolState;
use crate::services::explorer;

#[tauri::command]
pub async fn path_exists(
    protocol_state: State<'_, MadoraProtocolState>,
    root_path: String,
    path: String,
) -> Result<bool, String> {
    let root_path = protocol_state.authorize_root(&PathBuf::from(root_path))?;
    let path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || {
        explorer::ensure_within_root(&root_path, &path)?;

        path.try_exists().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Checks whether a document the user followed a link to exists, whether or
/// not it lives inside the workspace.
///
/// Only paths a document can legitimately link to are answered; anything else
/// reports `false`, so the command cannot be used to probe the filesystem.
#[tauri::command]
pub async fn absolute_path_exists(
    protocol_state: State<'_, MadoraProtocolState>,
    path: String,
) -> Result<bool, String> {
    let root = protocol_state.get_workspace_root();
    let path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || {
        Ok(
            explorer::authorize_file_access(root.as_deref(), &path, false)
                .map(|resolved| resolved.is_file())
                .unwrap_or(false),
        )
    })
    .await
    .map_err(|error: tauri::Error| error.to_string())?
}
