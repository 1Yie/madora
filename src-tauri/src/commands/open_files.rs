//! Hands the files the OS asked Madora to open over to the webview.

use tauri::State;

use crate::services::open_files::PendingOpenFiles;

/// Event the backend emits when new files were queued while the app runs.
pub const OPEN_FILES_EVENT: &str = "madora-open-files";

/// Returns the queued files, each exactly once. Every path was checked to be
/// an existing Markdown file when it was queued.
#[tauri::command]
pub async fn take_pending_open_files(
    pending: State<'_, PendingOpenFiles>,
) -> Result<Vec<String>, String> {
    Ok(pending
        .take()
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect())
}
