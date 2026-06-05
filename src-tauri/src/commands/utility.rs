use std::path::PathBuf;

use crate::services::explorer;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn path_exists(root_path: String, path: String) -> Result<bool, String> {
    let root_path = PathBuf::from(root_path);
    let path = PathBuf::from(path);

    explorer::ensure_within_root(&root_path, &path)?;

    path.try_exists().map_err(|e| e.to_string())
}
