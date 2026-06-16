use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CliStatus {
    pub available: bool,
    pub installed: bool,
    pub in_path: bool,
    pub managed_dir_in_path: bool,
    pub needs_terminal_restart: bool,
    pub source_path: Option<String>,
    pub install_path: String,
    pub command_name: String,
    pub path_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliInstallResult {
    pub success: bool,
    pub source: String,
    pub dest: String,
    pub path_updated: bool,
    pub needs_terminal_restart: bool,
    pub path_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliUninstallResult {
    pub success: bool,
    pub removed: String,
    pub path_updated: bool,
}
