use std::path::PathBuf;
use std::sync::Mutex;

use crate::models::workspace::WorkspaceState;

const STATE_FILE_NAME: &str = "workspace_state.json";

pub struct WorkspaceStore {
    state: Mutex<WorkspaceState>,
    app_data_dir: PathBuf,
}

impl WorkspaceStore {
    /// Create a new WorkspaceStore, loading persisted state from
    /// `app_data_dir/workspace_state.json` if it exists.
    pub fn new(app_data_dir: PathBuf) -> Self {
        let state = Self::load(&app_data_dir);
        Self {
            state: Mutex::new(state),
            app_data_dir,
        }
    }

    // ── Loading ─────────────────────────────────────────────

    fn load_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join(STATE_FILE_NAME)
    }

    fn load(app_data_dir: &PathBuf) -> WorkspaceState {
        let path = Self::load_path(app_data_dir);

        if !path.exists() {
            return WorkspaceState::default();
        }

        match std::fs::read_to_string(&path) {
            Ok(json) => match serde_json::from_str(&json) {
                Ok(state) => state,
                Err(error) => {
                    eprintln!("workspace state is unreadable ({error}); starting fresh");
                    WorkspaceState::default()
                }
            },
            Err(error) => {
                eprintln!("workspace state could not be read ({error}); starting fresh");
                WorkspaceState::default()
            }
        }
    }

    // ── Persistence ─────────────────────────────────────────

    fn save_inner(&self, state: &WorkspaceState) {
        let path = Self::load_path(&self.app_data_dir);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                eprintln!("could not create {}: {error}", parent.display());
                return;
            }
        }

        // A failed write only loses UI state, so it is logged rather than
        // surfaced; the write itself is atomic so a crash cannot leave a
        // half-written file that fails to parse on the next start.
        match serde_json::to_string_pretty(state) {
            Ok(json) => {
                if let Err(error) = crate::services::paths::atomic_write(&path, json.as_bytes()) {
                    eprintln!("could not save workspace state: {error}");
                }
            }
            Err(error) => eprintln!("could not serialize workspace state: {error}"),
        }
    }

    // ── Public API ──────────────────────────────────────────

    /// Get a snapshot of the current state.
    pub fn get_state(&self) -> Result<WorkspaceState, String> {
        self.state
            .lock()
            .map(|guard| guard.clone())
            .map_err(|e| e.to_string())
    }

    /// Replace the entire state and persist.
    pub fn set_state(&self, new_state: WorkspaceState) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        *guard = new_state.clone();
        self.save_inner(&new_state);
        Ok(())
    }

    /// Update the workspace root path, clearing dependent state
    /// when a different root is set.
    pub fn set_root_path(&self, root_path: Option<String>) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        let changed = guard.root_path.as_ref() != root_path.as_ref();

        guard.root_path = root_path;

        if changed {
            // When switching workspaces, clear tab/file state
            guard.open_tab_paths.clear();
            guard.last_active_file_path = None;
        }

        self.save_inner(&guard);
        Ok(())
    }

    /// Add a file path to the end of open tabs (no-op if already present).
    pub fn add_tab(&self, file_path: &str) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;

        if !guard.open_tab_paths.contains(&file_path.to_string()) {
            guard.open_tab_paths.push(file_path.to_string());
            self.save_inner(&guard);
        }

        Ok(())
    }

    /// Remove a file path from open tabs.
    pub fn close_tab(&self, file_path: &str) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;

        guard.open_tab_paths.retain(|p| p != file_path);

        if guard.last_active_file_path.as_deref() == Some(file_path) {
            guard.last_active_file_path = guard.open_tab_paths.last().cloned();
        }

        self.save_inner(&guard);
        Ok(())
    }

    /// Remove multiple file paths from open tabs.
    pub fn close_tabs(&self, file_paths: &[String]) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;

        for file_path in file_paths {
            guard.open_tab_paths.retain(|p| p != file_path);

            if guard.last_active_file_path.as_deref() == Some(file_path.as_str()) {
                guard.last_active_file_path = None;
            }
        }

        // If the active file was among the closed tabs, pick the last remaining tab
        if guard.last_active_file_path.is_none() && !guard.open_tab_paths.is_empty() {
            guard.last_active_file_path = guard.open_tab_paths.last().cloned();
        }

        self.save_inner(&guard);
        Ok(())
    }

    /// Set the last active file path (also ensures it's in open_tab_paths).
    pub fn set_active_tab(&self, file_path: Option<&str>) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;

        guard.last_active_file_path = file_path.map(|p| p.to_string());

        if let Some(path) = file_path {
            if !guard.open_tab_paths.contains(&path.to_string()) {
                guard.open_tab_paths.push(path.to_string());
            }
        }

        self.save_inner(&guard);
        Ok(())
    }

    /// Persist sidebar width.
    pub fn set_sidebar_width(&self, width: u32) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        guard.sidebar_width = Some(width);
        self.save_inner(&guard);
        Ok(())
    }

    /// Persist tab bar mode.
    pub fn set_tab_bar_mode(&self, mode: &str) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        guard.tab_bar_mode = Some(mode.to_string());
        self.save_inner(&guard);
        Ok(())
    }

    /// Persist webview zoom level.
    pub fn set_zoom_level(&self, zoom_level: f64) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        guard.zoom_level = Some(zoom_level);
        self.save_inner(&guard);
        Ok(())
    }

    /// Replace the open tab paths wholesale (used when restoring from a reorder).
    pub fn set_open_tab_paths(&self, paths: &[String]) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        guard.open_tab_paths = paths.to_vec();
        self.save_inner(&guard);
        Ok(())
    }

    /// Clear all persisted workspace state.
    pub fn clear(&self) -> Result<(), String> {
        self.set_state(WorkspaceState::default())
    }
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            root_path: None,
            open_tab_paths: Vec::new(),
            last_active_file_path: None,
            sidebar_width: Some(320),
            sort_enabled: Some(true),
            show_hidden_files: Some(false),
            tab_bar_mode: Some("scroll".to_string()),
            zoom_level: Some(1.0),
        }
    }
}
