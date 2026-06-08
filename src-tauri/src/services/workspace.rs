use std::path::PathBuf;
use std::sync::Mutex;

use base64::Engine;

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
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => WorkspaceState::default(),
        }
    }

    // ── Persistence ─────────────────────────────────────────

    fn save_inner(&self, state: &WorkspaceState) {
        let path = Self::load_path(&self.app_data_dir);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if let Ok(json) = serde_json::to_string_pretty(state) {
            let _ = std::fs::write(&path, json);
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

/// MIME type map for common image extensions.
fn mime_for_extension(ext: &str) -> &str {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

/// Resolve a markdown image source to a data URL.
///
/// - URLs and existing data URIs are returned as-is.
/// - Absolute paths (`/...`) are resolved relative to the workspace root.
/// - Relative paths are resolved relative to the markdown file's directory.
///
/// The resolved image file is read and returned as a base64-encoded data URL
/// so the frontend can display it directly without going through Tauri's asset
/// protocol (which only serves bundled assets).
pub fn resolve_image_src(
    src: &str,
    file_path: &str,
    root_path: Option<&str>,
) -> String {
    // Leave URLs and data URIs untouched
    if src.starts_with("http://")
        || src.starts_with("https://")
        || src.starts_with("data:")
        || src.starts_with("asset://")
    {
        return src.to_string();
    }

    // Resolve to absolute filesystem path
    let abs = if src.starts_with('/') {
        if let Some(root) = root_path {
            let trimmed = root.trim_end_matches('/');
            normalize_path(&format!("{}{}", trimmed, src))
        } else {
            return src.to_string();
        }
    } else {
        // Relative path — resolve relative to the markdown file's directory
        if let Some(parent) = std::path::Path::new(file_path).parent() {
            let parent_str = parent.to_string_lossy();
            let base = parent_str.trim_end_matches('/');
            normalize_path(&format!("{}/{}", base, src))
        } else {
            return src.to_string();
        }
    };

    // Try to read the file and return a data URL
    match std::fs::read(&abs) {
        Ok(bytes) => {
            let ext = std::path::Path::new(&abs)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            let mime = mime_for_extension(ext);
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            format!("data:{};base64,{}", mime, b64)
        }
        Err(_) => {
            // File not found — return the path for the frontend to handle
            abs
        }
    }
}

/// Normalize a path (no `..` or `.` segments, forward slashes).
fn normalize_path(path: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();

    for segment in path.split('/') {
        match segment {
            "" | "." => continue,
            ".." => {
                segments.pop();
            }
            _ => segments.push(segment),
        }
    }

    if segments.is_empty() {
        return String::new();
    }

    // Detect Windows drive path: the first segment looks like "C:"
    let is_drive_path = segments[0].len() == 2
        && segments[0].as_bytes()[0].is_ascii_alphabetic()
        && segments[0].as_bytes()[1] == b':';

    if is_drive_path {
        // Windows drive letter is already in segments[0]
        if segments.len() == 1 {
            return format!("{}/", segments[0]);
        }
        return format!("{}/{}", segments[0], segments[1..].join("/"));
    }

    if path.starts_with('/') {
        format!("/{}", segments.join("/"))
    } else {
        segments.join("/")
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
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── resolve_image_src ───────────────────────────────────

    #[test]
    fn resolve_url_unchanged() {
        let result = resolve_image_src("https://example.com/img.png", "/doc.md", None);
        assert_eq!(result, "https://example.com/img.png");
    }

    #[test]
    fn resolve_data_uri_unchanged() {
        let result = resolve_image_src("data:image/png;base64,abc", "/doc.md", None);
        assert_eq!(result, "data:image/png;base64,abc");
    }

    #[test]
    fn resolve_absolute_with_root_file_not_found_returns_path() {
        // When the file doesn't exist, it returns the absolute path (fallback)
        let result = resolve_image_src(
            "/assets/img.png",
            "/workspace/doc.md",
            Some("/workspace"),
        );
        assert_eq!(result, "/workspace/assets/img.png");
    }

    #[test]
    fn resolve_relative_file_not_found_returns_path() {
        let result = resolve_image_src(
            "img.png",
            "/workspace/docs/doc.md",
            Some("/workspace"),
        );
        assert_eq!(result, "/workspace/docs/img.png");
    }

    #[test]
    fn resolve_relative_parent_file_not_found_returns_path() {
        let result = resolve_image_src(
            "../images/img.png",
            "/workspace/docs/doc.md",
            Some("/workspace"),
        );
        assert_eq!(result, "/workspace/images/img.png");
    }

    #[test]
    fn resolve_relative_same_dir_file_not_found_returns_path() {
        let result = resolve_image_src(
            "./img.png",
            "/workspace/doc.md",
            Some("/workspace"),
        );
        assert_eq!(result, "/workspace/img.png");
    }

    #[test]
    fn resolve_relative_to_data_url() {
        // Create a temporary PNG file
        let dir = std::env::temp_dir().join("madora-img-test");
        let _ = std::fs::create_dir_all(&dir);
        let img_path = dir.join("test.png");
        // Minimal valid PNG (1x1 pixel)
        let png_bytes: Vec<u8> = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x60, 0x00,
            0x00, 0x00, 0x04, 0x00, 0x01, 0x27, 0x34, 0x27,
            0x19, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&img_path, &png_bytes).unwrap();

        let md_path = dir.join("doc.md").to_string_lossy().to_string();

        let result = resolve_image_src(
            "test.png",
            &md_path,
            None,
        );

        let expected_b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        assert_eq!(result, format!("data:image/png;base64,{}", expected_b64));

        // Cleanup
        let _ = std::fs::remove_file(&img_path);
        let _ = std::fs::remove_dir(&dir);
    }

    // ── normalize_path ──────────────────────────────────────

    #[test]
    fn normalize_simple() {
        assert_eq!(normalize_path("/a/b/c"), "/a/b/c");
    }

    #[test]
    fn normalize_with_dotdot() {
        assert_eq!(normalize_path("/a/b/../c"), "/a/c");
    }

    #[test]
    fn normalize_with_dot() {
        assert_eq!(normalize_path("/a/b/./c"), "/a/b/c");
    }

    #[test]
    fn normalize_relative() {
        assert_eq!(normalize_path("a/b/c"), "a/b/c");
    }

    #[test]
    fn normalize_windows_drive() {
        assert_eq!(normalize_path("C:/a/b/c"), "C:/a/b/c");
    }
}
