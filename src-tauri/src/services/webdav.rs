use std::collections::{HashSet, VecDeque};
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;

use crate::models::webdav::{
    ConflictStrategy, WebDavConfig, WebDavConnectionTest, WebDavFileEntry, WebDavSyncResult,
};

/// Recursively scan a directory for .md/.mdx/image files, returning relative paths → ISO-8601 mtime.
/// Skips `.git`, `node_modules`, `target` directories.
fn scan_syncable_files(dir: &Path, base: &Path) -> std::collections::HashMap<String, String> {
    use std::collections::HashMap;

    fn is_image_ext(ext: &str) -> bool {
        matches!(
            ext,
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tiff" | "tif"
        )
    }

    fn is_syncable(path: &Path) -> bool {
        match path.extension().and_then(|e| e.to_str()) {
            Some(ext) if ext.eq_ignore_ascii_case("md") => true,
            Some(ext) if ext.eq_ignore_ascii_case("mdx") => true,
            Some(ext) if is_image_ext(ext) => true,
            _ => false,
        }
    }

    let mut files = HashMap::new();
    if !dir.is_dir() {
        return files;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name_str = entry.file_name().to_string_lossy().to_string();

            // Skip common dirs that shouldn't be synced
            if name_str == ".git" || name_str == "node_modules" || name_str == "target" {
                continue;
            }

            if path.is_dir() {
                let sub = scan_syncable_files(&path, base);
                files.extend(sub);
            } else if path.is_file() && is_syncable(&path) {
                if let Ok(metadata) = path.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                            if let Some(dt) =
                                chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0)
                            {
                                let rel = path
                                    .strip_prefix(base)
                                    .unwrap_or(&path)
                                    .to_string_lossy()
                                    .to_string();
                                files.insert(rel, dt.to_rfc3339());
                            }
                        }
                    }
                }
            }
        }
    }
    files
}

/// WebDAV HTTP client.
pub struct WebDavClient {
    client: Client,
}

impl WebDavClient {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    // ── Helpers ───────────────────────────────────────────

    fn build_url(&self, base: &str, path: &str) -> Result<String, String> {
        let mut url = reqwest::Url::parse(base).map_err(|e| format!("无效的 WebDAV URL: {e}"))?;
        // Ensure the base path ends with /
        if !url.path().ends_with('/') {
            url.set_path(&format!("{}/", url.path()));
        }
        // Join relative path, trimming leading slash from path to avoid
        // replacing the base path
        let clean_path = path.trim_start_matches('/');
        let joined = url
            .join(clean_path)
            .map_err(|e| format!("无效的路径: {e}"))?;
        Ok(joined.to_string())
    }

    fn auth_headers(&self, config: &WebDavConfig) -> Result<reqwest::header::HeaderMap, String> {
        let mut headers = reqwest::header::HeaderMap::new();

        if let (Some(username), Some(pw)) = (&config.username, &config.password) {
            let credentials = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{username}:{pw}"),
            );
            let auth_value = format!("Basic {credentials}");
            headers.insert(
                reqwest::header::AUTHORIZATION,
                reqwest::header::HeaderValue::from_str(&auth_value)
                    .map_err(|_| "无法编码认证头".to_string())?,
            );
        }

        Ok(headers)
    }

    // ── Test Connection ────────────────────────────────────

    /// PROPFIND depth=0 to verify URL + credentials.
    pub async fn test_connection(&self, config: &WebDavConfig) -> WebDavConnectionTest {
        let url = match self.build_url(config.url.as_deref().unwrap_or(""), "/") {
            Ok(u) => u,
            Err(e) => {
                return WebDavConnectionTest {
                    success: false,
                    server_name: None,
                    error: Some(e),
                }
            }
        };

        let headers = match self.auth_headers(config) {
            Ok(h) => h,
            Err(e) => {
                return WebDavConnectionTest {
                    success: false,
                    server_name: None,
                    error: Some(e),
                }
            }
        };

        let response = match self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .headers(headers)
            .header("Depth", "0")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return WebDavConnectionTest {
                    success: false,
                    server_name: None,
                    error: Some(format!("连接失败: {e}")),
                }
            }
        };

        let status = response.status();
        if !status.is_success() {
            return WebDavConnectionTest {
                success: false,
                server_name: None,
                error: Some(format!("服务器返回 {status}")),
            };
        }

        // Try to extract server info from response headers
        let server_name = response
            .headers()
            .get("Server")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
            .or_else(|| {
                response
                    .headers()
                    .get("X-WebDAV-Status")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string())
            });

        WebDavConnectionTest {
            success: true,
            server_name,
            error: None,
        }
    }

    // ── PROPFIND (list directory) ──────────────────────────

    /// List files at the given path on the WebDAV server.
    /// Returns entries excluding the directory itself (depth=1).
    pub async fn list_files(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
    ) -> Result<Vec<WebDavFileEntry>, String> {
        let url = self.build_url(config.url.as_deref().unwrap_or(""), remote_path)?;
        let headers = self.auth_headers(config)?;

        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .headers(headers)
            .header("Depth", "1")
            .send()
            .await
            .map_err(|e| format!("PROPFIND 请求失败: {e}"))?;

        let status = response.status();
        if !status.is_success() {
            return Err(format!("PROPFIND 返回 {status}"));
        }

        let body = response
            .text()
            .await
            .map_err(|e| format!("读取响应失败: {e}"))?;
        Self::parse_propfind_response(&body, remote_path)
    }

    /// Parse a PROPFIND XML response into file entries.
    fn parse_propfind_response(xml: &str, base_path: &str) -> Result<Vec<WebDavFileEntry>, String> {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);

        let mut entries = Vec::new();
        let mut current_entry: Option<WebDavFileEntry> = None;
        // Track the XML element path to know which property we are filling.
        // The stack stores local element names (without namespace prefix).
        let mut element_stack: Vec<String> = Vec::new();
        let mut buf = Vec::new();

        // Normalize base path (should end with /)
        let base = if base_path.ends_with('/') {
            base_path.to_string()
        } else {
            format!("{base_path}/")
        };

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let local_name = name.split(':').next_back().unwrap_or(&name).to_string();
                    element_stack.push(local_name.clone());

                    if local_name == "response" {
                        current_entry = Some(WebDavFileEntry {
                            href: String::new(),
                            display_name: String::new(),
                            content_length: 0,
                            is_collection: false,
                            last_modified: None,
                            etag: None,
                        });
                    }
                }
                Ok(Event::Empty(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let local_name = name.split(':').next_back().unwrap_or(&name).to_string();

                    // A self-closing <D:collection/> inside <D:resourcetype> means
                    // this entry IS a collection.
                    if local_name == "collection" && current_entry.is_some() {
                        if let Some(ref mut entry) = current_entry {
                            entry.is_collection = true;
                        }
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let local_name = name.split(':').next_back().unwrap_or(&name).to_string();

                    // Pop the stack on close, then check for response end
                    element_stack.pop();

                    if local_name == "response" {
                        if let Some(entry) = current_entry.take() {
                            // Skip the base directory entry itself
                            let href_normalized = entry.href.trim_end_matches('/');
                            let base_normalized = base.trim_end_matches('/');
                            if href_normalized != base_normalized {
                                entries.push(entry);
                            }
                        }
                    }
                }
                Ok(Event::Text(ref e)) => {
                    if let Ok(text) = e.unescape() {
                        let text = text.trim().to_string();
                        if text.is_empty() {
                            continue;
                        }

                        if let Some(ref mut entry) = current_entry {
                            // Determine the current element from the stack
                            if let Some(el) = element_stack.last() {
                                match el.as_str() {
                                    "href" => entry.href = text,
                                    "displayname" => entry.display_name = text,
                                    "getcontentlength" => {
                                        entry.content_length = text.parse().unwrap_or(0)
                                    }
                                    "getlastmodified" => entry.last_modified = Some(text),
                                    "getetag" => entry.etag = Some(text),
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(format!("XML 解析错误: {e}")),
                _ => {}
            }
        }

        Ok(entries)
    }

    // ── Recursive PROPFIND ─────────────────────────────────────

    /// Non-recursive BFS scan of all files under remote_path.
    /// Uses a VecDeque queue instead of async recursion to avoid stack overflow from deeply nested futures.
    pub async fn list_files_recursive(
        &self,
        config: &WebDavConfig,
        root_remote_path: &str,
    ) -> Result<Vec<WebDavFileEntry>, String> {
        let mut all_files = Vec::new();
        let mut queue = VecDeque::new();
        queue.push_back(root_remote_path.to_string());
        let mut visited = HashSet::new();

        let strip_base = config.url.as_deref().and_then(|url| {
            reqwest::Url::parse(url)
                .ok()
                .map(|u| u.path().trim_matches('/').to_string())
        });

        while let Some(current_dir) = queue.pop_front() {
            let normalized = current_dir.trim_matches('/').to_string();
            if !visited.insert(normalized.clone()) {
                continue;
            }

            let entries = match self.list_files(config, &current_dir).await {
                Ok(e) => e,
                Err(err) => {
                    eprintln!("警告: 无法扫描 WebDAV 目录 '{current_dir}': {err}");
                    continue;
                }
            };

            for entry in entries {
                if entry.is_collection {
                    let decoded_href = urlencoding::decode(&entry.href)
                        .map(|c| c.to_string())
                        .unwrap_or_else(|_| entry.href.clone());

                    let mut sub_path = decoded_href.trim_matches('/').to_string();

                    // Strip the base URL path prefix if present (e.g. /remote.php/dav/files/user/)
                    if let Some(ref base) = strip_base {
                        if !base.is_empty() && sub_path.starts_with(base) {
                            sub_path = sub_path[base.len()..].trim_matches('/').to_string();
                        }
                    }

                    if sub_path == normalized || sub_path.is_empty() {
                        continue;
                    }

                    queue.push_back(sub_path);
                } else {
                    all_files.push(entry);
                }
            }
        }

        Ok(all_files)
    }

    // ── GET (download file) ────────────────────────────────

    /// Download a file from the WebDAV server.
    pub async fn get_file(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
    ) -> Result<Vec<u8>, String> {
        let url = self.build_url(config.url.as_deref().unwrap_or(""), remote_path)?;
        let headers = self.auth_headers(config)?;

        let response = self
            .client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("下载失败: {e}"))?;

        let status = response.status();
        if !status.is_success() {
            return Err(format!("下载返回 {status}"));
        }

        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("读取数据失败: {e}"))
    }

    // ── PUT (upload file) ──────────────────────────────────

    /// Upload a file to the WebDAV server.
    pub async fn put_file(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
        content: Vec<u8>,
    ) -> Result<(), String> {
        let url = self.build_url(config.url.as_deref().unwrap_or(""), remote_path)?;
        let headers = self.auth_headers(config)?;

        let response = self
            .client
            .put(&url)
            .headers(headers)
            .body(content)
            .send()
            .await
            .map_err(|e| format!("上传失败: {e}"))?;

        let status = response.status();
        if !status.is_success() {
            return Err(format!("上传返回 {status}"));
        }

        Ok(())
    }

    // ── MKCOL (create directory) ───────────────────────────

    /// Create a directory (collection) on the WebDAV server.
    pub async fn create_collection(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
    ) -> Result<(), String> {
        let url = self.build_url(config.url.as_deref().unwrap_or(""), remote_path)?;
        let headers = self.auth_headers(config)?;

        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;

        let status = response.status();
        // 201 Created or 405 Method Not Allowed (already exists) or 409 Conflict
        if status.as_u16() == 405 || status.as_u16() == 409 {
            // Directory might already exist — that's fine for sync
            return Ok(());
        }
        if !status.is_success() {
            return Err(format!("创建目录返回 {status}"));
        }

        Ok(())
    }
}

/// Sync orchestrator: compares local and remote file trees, executes sync.
pub struct SyncOrchestrator {
    webdav: WebDavClient,
}

impl SyncOrchestrator {
    pub fn new(client: Client) -> Self {
        Self {
            webdav: WebDavClient::new(client),
        }
    }

    /// Compute a snapshot of current local file mtimes (relative path → ISO-8601).
    pub fn snapshot_local_files(
        &self,
        workspace_root: &Path,
        config: &WebDavConfig,
    ) -> std::collections::HashMap<String, String> {
        let local_subdir = config.local_subdir.as_deref().unwrap_or("");
        let local_dir = workspace_root.join(local_subdir);
        scan_syncable_files(&local_dir, &local_dir)
    }

    /// Compute sync status for each local .md file by comparing with a stored snapshot.
    pub fn compute_sync_status(
        &self,
        workspace_root: &Path,
        config: &WebDavConfig,
    ) -> Vec<(String, crate::models::webdav::WebDavFileSyncStatus)> {
        use crate::models::webdav::WebDavFileSyncStatus;
        let local_subdir = config.local_subdir.as_deref().unwrap_or("");
        let local_dir = workspace_root.join(local_subdir);
        let current_local = scan_syncable_files(&local_dir, &local_dir);
        let snapshot = &config.sync_files;
        let mut results = Vec::new();

        for (rel_path, snap_mtime) in snapshot {
            match current_local.get(rel_path) {
                Some(current_mtime) if current_mtime == snap_mtime => {
                    results.push((rel_path.clone(), WebDavFileSyncStatus::Synced));
                }
                Some(_) => {
                    results.push((rel_path.clone(), WebDavFileSyncStatus::Modified));
                }
                None => {
                    results.push((rel_path.clone(), WebDavFileSyncStatus::Deleted));
                }
            }
        }
        for rel_path in current_local.keys() {
            if !snapshot.contains_key(rel_path) {
                results.push((rel_path.clone(), WebDavFileSyncStatus::New));
            }
        }

        results.sort_by(|a, b| a.0.cmp(&b.0));
        results
    }

    /// Perform a full sync: scan remote, scan local, diff, execute.
    pub async fn sync(
        &self,
        config: &WebDavConfig,
        workspace_root: &Path,
    ) -> Result<WebDavSyncResult, String> {
        let remote_subdir = config.remote_subdir.as_deref().unwrap_or("");
        let local_subdir = config.local_subdir.as_deref().unwrap_or("");

        let local_dir = workspace_root.join(local_subdir);
        if !local_dir.exists() {
            std::fs::create_dir_all(&local_dir).map_err(|e| format!("创建本地目录失败: {e}"))?;
        }

        // Ensure remote dir exists
        self.webdav.create_collection(config, remote_subdir).await?;

        // Scan remote files (recursive to get all subdirectory entries)
        let remote_entries = self
            .webdav
            .list_files_recursive(config, remote_subdir)
            .await?;

        // Scan local .md files
        let local_files = self.scan_local_md_files(&local_dir);

        let conflict_strategy = &config.conflict_strategy;

        let mut result = WebDavSyncResult::default();

        // ── Upload local files not on remote, or newer locally ──
        for (local_rel_path, local_mtime) in &local_files {
            let remote_path = if remote_subdir.is_empty() {
                local_rel_path.clone()
            } else {
                format!("{remote_subdir}/{local_rel_path}")
            };

            let remote_entry = remote_entries
                .iter()
                .find(|e| e.href.trim_end_matches('/').ends_with(local_rel_path));

            let should_upload = match remote_entry {
                None => true, // file doesn't exist on remote
                Some(remote) => {
                    // Compare mtime — local newer → upload
                    let remote_mtime = remote
                        .last_modified
                        .as_deref()
                        .and_then(Self::parse_http_date);

                    match (local_mtime, remote_mtime) {
                        (Some(local), Some(remote)) => {
                            let local_dt = chrono::DateTime::parse_from_rfc3339(local)
                                .ok()
                                .map(|dt| dt.timestamp());
                            match local_dt {
                                Some(local_ts) if local_ts > remote.timestamp() => true,
                                _ => false,
                            }
                        }
                        _ => false,
                    }
                }
            };

            if should_upload {
                let content = std::fs::read(local_dir.join(local_rel_path))
                    .map_err(|e| format!("读取 {local_rel_path} 失败: {e}"))?;

                // Ensure parent directory exists on remote before uploading
                if let Some(parent) = std::path::Path::new(&remote_path).parent() {
                    if !parent.as_os_str().is_empty() {
                        if let Err(e) = self
                            .webdav
                            .create_collection(config, &parent.to_string_lossy())
                            .await
                        {
                            result.errors.push(format!("创建目录 {parent:?} 失败: {e}"));
                            continue;
                        }
                    }
                }

                match self.webdav.put_file(config, &remote_path, content).await {
                    Ok(_) => result.files_uploaded += 1,
                    Err(e) => result
                        .errors
                        .push(format!("上传 {local_rel_path} 失败: {e}")),
                }
            }
        }

        // ── Download remote files not on local, or newer remotely ──
        for entry in &remote_entries {
            let display_name = &entry.display_name;
            if display_name.is_empty() || entry.is_collection {
                continue;
            }

            // Compute relative path from href by stripping remote_subdir prefix
            let rel_path = {
                let href = entry.href.trim_end_matches('/');
                if remote_subdir.is_empty() {
                    // href is like /filename.md → strip leading /
                    href.trim_start_matches('/').to_string()
                } else if let Some(rest) = href.strip_suffix(display_name) {
                    // href is like /remote_subdir/filename.md or /remote_subdir/sub/filename.md
                    // rest is /remote_subdir/ or /remote_subdir/sub/
                    // We want the relative path from remote_subdir
                    let trimmed = rest.trim_start_matches('/');
                    if let Some(remote_path) = trimmed.strip_prefix(remote_subdir) {
                        format!("{}{}", remote_path.trim_start_matches('/'), display_name)
                    } else {
                        display_name.clone()
                    }
                } else {
                    display_name.clone()
                }
            };

            // URL-decode the path (href from server may have %20 etc.)
            let decoded_path = urlencoding::decode(&rel_path)
                .map(|c| c.to_string())
                .unwrap_or(rel_path.clone());
            let local_path = local_dir.join(&decoded_path);
            let local_exists = local_path.exists();

            let should_download = if !local_exists {
                true
            } else {
                let local_metadata = std::fs::metadata(&local_path).ok();
                let local_modified = local_metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| {
                        let duration = t.duration_since(std::time::UNIX_EPOCH).ok()?;
                        Some(duration.as_secs() as i64)
                    });

                let remote_mtime = entry
                    .last_modified
                    .as_deref()
                    .and_then(Self::parse_http_date)
                    .map(|dt| dt.timestamp());

                match (local_modified, remote_mtime) {
                    (Some(local_ts), Some(remote_ts)) if remote_ts > local_ts => {
                        match conflict_strategy {
                            ConflictStrategy::RemoteFirst => true,
                            ConflictStrategy::KeepBoth => {
                                let stem = std::path::Path::new(&rel_path)
                                    .file_stem()
                                    .unwrap_or_default()
                                    .to_str()
                                    .unwrap_or(&rel_path);
                                let ext = std::path::Path::new(&rel_path)
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| format!(".{e}"))
                                    .unwrap_or_default();
                                let backup_name = format!(
                                    "{stem}.remote-{}{ext}",
                                    chrono::Utc::now().format("%Y%m%d-%H%M%S")
                                );
                                let _ = std::fs::rename(&local_path, local_dir.join(&backup_name));
                                result.conflicts_resolved += 1;
                                true
                            }
                            ConflictStrategy::LocalFirst => false,
                        }
                    }
                    _ => false,
                }
            };

            if should_download {
                // Ensure parent directory exists locally
                if let Some(parent) = local_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }

                let remote_path = if remote_subdir.is_empty() {
                    rel_path.clone()
                } else {
                    format!("{remote_subdir}/{rel_path}")
                };

                match self.webdav.get_file(config, &remote_path).await {
                    Ok(data) => {
                        if let Err(e) = std::fs::write(&local_path, &data) {
                            result.errors.push(format!("写入 {rel_path} 失败: {e}"));
                        } else {
                            result.files_downloaded += 1;
                        }
                    }
                    Err(e) => result.errors.push(format!("下载 {display_name} 失败: {e}")),
                }
            }
        }

        Ok(result)
    }

    /// Scan local directory recursively for all files, returning relative paths + mtimes.
    fn scan_local_md_files(&self, dir: &Path) -> Vec<(String, Option<String>)> {
        let map = scan_syncable_files(dir, dir);
        let mut files: Vec<(String, Option<String>)> =
            map.into_iter().map(|(k, v)| (k, Some(v))).collect();
        files.sort_by(|a, b| a.0.cmp(&b.0));
        files
    }

    /// Parse an HTTP-date (RFC 2822 / IMF-fixdate) into chrono::DateTime<Utc>.
    fn parse_http_date(date_str: &str) -> Option<chrono::DateTime<chrono::Utc>> {
        // Try RFC 2822 first (most common in WebDAV)
        chrono::DateTime::parse_from_rfc2822(date_str)
            .ok()
            .map(|dt| dt.to_utc())
            .or_else(|| {
                // Try ISO 8601 fallback
                chrono::DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.to_utc())
            })
    }
}

// ── WebDavStore: persistent config store ───────────────────────────

use std::path::PathBuf;
use std::sync::Mutex;

const CONFIG_FILE_NAME: &str = "webdav_config.json";

pub struct WebDavStore {
    config: Mutex<WebDavConfig>,
    app_data_dir: PathBuf,
}

impl WebDavStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let config = Self::load_config(&app_data_dir);
        Self {
            config: Mutex::new(config),
            app_data_dir,
        }
    }

    fn config_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join(CONFIG_FILE_NAME)
    }

    fn load_config(app_data_dir: &PathBuf) -> WebDavConfig {
        let path = Self::config_path(app_data_dir);
        if !path.exists() {
            return WebDavConfig::default();
        }
        match std::fs::read_to_string(&path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => WebDavConfig::default(),
        }
    }

    fn save_config_inner(app_data_dir: &PathBuf, config: &WebDavConfig) {
        let path = Self::config_path(app_data_dir);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(config) {
            let _ = std::fs::write(&path, json);
        }
    }

    pub fn get_config(&self) -> Result<WebDavConfig, String> {
        self.config
            .lock()
            .map(|guard| guard.clone())
            .map_err(|e| e.to_string())
    }

    pub fn set_config(&self, new_config: WebDavConfig) -> Result<(), String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        *guard = new_config.clone();
        Self::save_config_inner(&self.app_data_dir, &new_config);
        Ok(())
    }
}
