use serde::{Deserialize, Serialize};

/// Conflict resolution strategy for sync.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStrategy {
    /// Local file wins over remote.
    #[default]
    LocalFirst,
    /// Remote file wins over local.
    RemoteFirst,
    /// Keep both with timestamp suffix on the loser.
    KeepBoth,
}

/// Persisted WebDAV configuration (stored as JSON in app_data_dir).
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct WebDavConfig {
    /// WebDAV server URL (e.g. https://dav.example.com/remote.php/dav/files/user/).
    pub url: Option<String>,
    /// Username for basic/digest auth.
    pub username: Option<String>,
    /// Conflict strategy.
    #[serde(default)]
    pub conflict_strategy: ConflictStrategy,
    /// Subdirectory within the WebDAV root to sync into.
    #[serde(default)]
    pub remote_subdir: Option<String>,
    /// Local workspace subdirectory to sync from (relative to workspace root).
    #[serde(default)]
    pub local_subdir: Option<String>,
    /// ISO-8601 timestamp of last successful sync.
    #[serde(default)]
    pub last_sync_at: Option<String>,
    /// Password (in-memory only — never serialized, stored in OS keychain).
    #[serde(skip)]
    pub password: Option<String>,
    /// Snapshot of file mtimes after last successful sync (relative path → ISO-8601 mtime).
    #[serde(default)]
    pub sync_files: std::collections::HashMap<String, String>,
}

/// Result of a test-connection operation.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WebDavConnectionTest {
    pub success: bool,
    pub server_name: Option<String>,
    pub error: Option<String>,
}

/// A single file entry from a PROPFIND response.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WebDavFileEntry {
    /// Absolute path on the server.
    pub href: String,
    /// Display name (last path segment).
    pub display_name: String,
    /// Content length in bytes (0 for directories/collections).
    pub content_length: u64,
    /// Whether this entry is a collection (directory).
    pub is_collection: bool,
    /// ISO-8601 last-modified timestamp from server.
    pub last_modified: Option<String>,
    /// ETag if provided.
    pub etag: Option<String>,
}

/// Summary of a sync operation.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct WebDavSyncResult {
    pub files_uploaded: usize,
    pub files_downloaded: usize,
    pub conflicts_resolved: usize,
    pub errors: Vec<String>,
}

/// Sync status of a single local file.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WebDavFileSyncStatus {
    /// Synced and unchanged since last sync.
    Synced,
    /// Modified locally since last sync.
    Modified,
    /// New file not yet synced.
    New,
    /// File was deleted locally since last sync.
    Deleted,
    /// File exists locally but needs initial sync.
    Unsynced,
}

/// A file entry with sync status for the file tree.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WebDavSyncFileEntry {
    pub relative_path: String,
    pub status: WebDavFileSyncStatus,
}

/// Result of webdav_get_status.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct WebDavSyncStatusResult {
    pub files: Vec<WebDavSyncFileEntry>,
}
