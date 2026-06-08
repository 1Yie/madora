use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    /// Path to the workspace root directory.
    pub root_path: Option<String>,
    /// Ordered list of open tab file paths.
    pub open_tab_paths: Vec<String>,
    /// Path of the last active (focused) file.
    pub last_active_file_path: Option<String>,
    /// Saved sidebar width in pixels.
    pub sidebar_width: Option<u32>,
    /// Whether file sorting is enabled.
    pub sort_enabled: Option<bool>,
    /// Whether hidden files are shown.
    pub show_hidden_files: Option<bool>,
    /// Tab bar display mode ("scroll" or "wrap").
    pub tab_bar_mode: Option<String>,
}
