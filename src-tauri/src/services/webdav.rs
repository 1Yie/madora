use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;

use crate::i18n;
use crate::models::webdav::{
    ConflictStrategy, SyncBaselineEntry, WebDavConfig, WebDavConnectionTest, WebDavFileEntry,
    WebDavSyncResult,
};

/// Maximum directory depth walked during a local scan (guards against symlink cycles).
const MAX_SCAN_DEPTH: usize = 64;

/// Default maximum size for a single downloaded file (100 MiB).
pub const DEFAULT_MAX_DOWNLOAD_BYTES: u64 = 100 * 1024 * 1024;

/// Build an HTTP client with connect + total timeouts.
/// `timeout_secs` is the total request budget (large for file transfers, short for probing).
pub fn build_http_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

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

/// FNV-1a 64-bit hash rendered as hex. Deterministic across processes so it can
/// be persisted in the sync baseline.
fn hash_bytes(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Local state of a single syncable file.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct LocalFileState {
    /// ISO-8601 mtime.
    pub mtime: Option<String>,
    /// FNV-1a hex hash of the file content.
    pub hash: Option<String>,
}

/// Percent-decode a remote href/path. Decodes twice (bounded) so that
/// double-encoded traversal such as `%252e%252e` is normalized before validation.
fn decode_remote_path(raw: &str) -> String {
    let once = urlencoding::decode(raw)
        .map(|c| c.into_owned())
        .unwrap_or_else(|_| raw.to_string());
    urlencoding::decode(&once)
        .map(|c| c.into_owned())
        .unwrap_or(once)
}

/// Validate a decoded remote path and return it as a relative `PathBuf`.
///
/// Rejects absolute paths, drive/UNC prefixes, `..` parents, NUL bytes and empty
/// paths. Backslashes are treated as separators first so Windows-style traversal
/// (`..\..\x`) is caught on every platform.
fn safe_relative_path(decoded: &str) -> Option<PathBuf> {
    if decoded.is_empty() || decoded.contains('\0') {
        return None;
    }
    let normalized = decoded.replace('\\', "/");
    if normalized.starts_with('/') {
        return None;
    }
    let mut out = PathBuf::new();
    let mut first = true;
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => {
                let s = part.to_string_lossy();
                if s.is_empty() {
                    return None;
                }
                // Reject Windows drive/ADS style first segment (e.g. `C:`).
                if first && s.contains(':') {
                    return None;
                }
                first = false;
                out.push(part);
            }
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) | Component::ParentDir => return None,
        }
    }
    if out.as_os_str().is_empty() {
        return None;
    }
    Some(out)
}

/// Ensure `candidate` cannot escape `root` through an existing symlink.
/// Canonicalizes the deepest existing ancestor (and the candidate itself when it
/// exists) and requires the result to stay under the canonicalized root.
fn ensure_within_root(root: &Path, candidate: &Path) -> Result<(), String> {
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("无法解析同步根目录: {e}"))?;
    let mut existing = candidate.to_path_buf();
    loop {
        if existing.exists() || existing.symlink_metadata().is_ok() {
            break;
        }
        match existing.parent() {
            Some(parent) => existing = parent.to_path_buf(),
            None => break,
        }
    }
    if existing.as_os_str().is_empty() {
        return Err("目标路径无效".to_string());
    }
    let existing_canon = existing
        .canonicalize()
        .map_err(|e| format!("无法解析目标目录: {e}"))?;
    if !existing_canon.starts_with(&root_canon) {
        return Err("拒绝写入工作区之外的路径".to_string());
    }
    Ok(())
}

/// Render a relative path with `/` separators regardless of platform.
fn path_to_slash(path: &Path) -> String {
    path.components()
        .filter_map(|c| match c {
            Component::Normal(part) => Some(part.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Reject a download early when the server declares an oversized body.
fn check_content_length(len: Option<u64>, max_bytes: u64) -> Result<(), String> {
    if let Some(len) = len {
        if len > max_bytes {
            return Err(format!("文件超过大小上限 {max_bytes} 字节"));
        }
    }
    Ok(())
}

/// Running byte counter used to abort a stream once a size limit is exceeded.
#[derive(Debug)]
pub(crate) struct ByteBudget {
    limit: u64,
    seen: u64,
}

impl ByteBudget {
    pub(crate) fn new(limit: u64) -> Self {
        Self { limit, seen: 0 }
    }

    /// Record `n` more bytes; returns `Err` once the limit is exceeded.
    pub(crate) fn add(&mut self, n: usize) -> Result<(), String> {
        self.seen = self.seen.saturating_add(n as u64);
        if self.seen > self.limit {
            return Err(format!("文件超过大小上限 {} 字节", self.limit));
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub(crate) fn seen(&self) -> u64 {
        self.seen
    }
}

/// Walk a directory collecting syncable files with mtime + content hash.
/// Does not follow symlinks and stops at `MAX_SCAN_DEPTH`.
fn scan_syncable_states(dir: &Path, base: &Path) -> HashMap<String, LocalFileState> {
    fn walk(dir: &Path, base: &Path, depth: usize, out: &mut HashMap<String, LocalFileState>) {
        if depth > MAX_SCAN_DEPTH {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name_str = entry.file_name().to_string_lossy().to_string();

            // Skip common dirs that shouldn't be synced
            if name_str == ".git" || name_str == "node_modules" || name_str == "target" {
                continue;
            }

            // Do not follow symlinks: prevents cycles (stack overflow) and symlink escape.
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }

            if file_type.is_dir() {
                walk(&path, base, depth + 1, out);
            } else if file_type.is_file() && is_syncable(&path) {
                let mtime = std::fs::metadata(&path)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .and_then(|d| {
                        chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                    });
                let hash = std::fs::read(&path).ok().map(|b| hash_bytes(&b));
                if let Ok(rel) = path.strip_prefix(base) {
                    let rel = path_to_slash(rel);
                    if !rel.is_empty() {
                        out.insert(rel, LocalFileState { mtime, hash });
                    }
                }
            }
        }
    }

    let mut files = HashMap::new();
    if dir.is_dir() {
        walk(dir, base, 0, &mut files);
    }
    files
}

/// Recursively scan a directory for .md/.mdx/image files, returning relative paths → ISO-8601 mtime.
/// Skips `.git`, `node_modules`, `target` directories and does not follow symlinks.
fn scan_syncable_files(dir: &Path, base: &Path) -> HashMap<String, String> {
    scan_syncable_states(dir, base)
        .into_iter()
        .filter_map(|(rel, state)| state.mtime.map(|mtime| (rel, mtime)))
        .collect()
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
        let mut url = reqwest::Url::parse(base)
            .map_err(|e| i18n::tf("webdav.invalid_url", &[("error", &e.to_string())]))?;
        // Ensure the base path ends with /
        if !url.path().ends_with('/') {
            url.set_path(&format!("{}/", url.path()));
        }
        // Join relative path, trimming leading slash from path to avoid
        // replacing the base path
        let clean_path = path.trim_start_matches('/');
        let joined = url
            .join(clean_path)
            .map_err(|e| i18n::tf("webdav.invalid_path", &[("error", &e.to_string())]))?;
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
                    .map_err(|_| i18n::t("webdav.cannot_encode_auth"))?,
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
                    error: Some(i18n::tf(
                        "webdav.connect_failed",
                        &[("error", &e.to_string())],
                    )),
                }
            }
        };

        let status = response.status();
        if !status.is_success() {
            return WebDavConnectionTest {
                success: false,
                server_name: None,
                error: Some(i18n::tf(
                    "webdav.server_returned",
                    &[("status", &status.to_string())],
                )),
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
            .map_err(|e| i18n::tf("webdav.propfind_failed", &[("error", &e.to_string())]))?;

        let status = response.status();
        if !status.is_success() {
            return Err(i18n::tf(
                "webdav.propfind_failed",
                &[("error", &status.to_string())],
            ));
        }

        let body = response
            .text()
            .await
            .map_err(|e| i18n::tf("webdav.read_response_failed", &[("error", &e.to_string())]))?;
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
                Err(e) => {
                    return Err(i18n::tf(
                        "webdav.xml_parse_error",
                        &[("error", &e.to_string())],
                    ))
                }
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
                    let decoded_href = decode_remote_path(&entry.href);

                    let mut sub_path = decoded_href.trim_matches('/').to_string();

                    // Strip the base URL path prefix if present (e.g. /remote.php/dav/files/user/)
                    if let Some(ref base) = strip_base {
                        if !base.is_empty() && sub_path.starts_with(base) {
                            sub_path = sub_path[base.len()..].trim_matches('/').to_string();
                        }
                    }

                    // Reject traversal / absolute hrefs so we never queue an unsafe remote path.
                    let Some(safe) = safe_relative_path(&sub_path) else {
                        continue;
                    };
                    let sub_path = path_to_slash(&safe);

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

    /// Download a file from the WebDAV server (bounded by [`DEFAULT_MAX_DOWNLOAD_BYTES`]).
    pub async fn get_file(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
    ) -> Result<Vec<u8>, String> {
        self.get_file_limited(config, remote_path, DEFAULT_MAX_DOWNLOAD_BYTES)
            .await
    }

    /// Download a file from the WebDAV server, rejecting anything larger than `max_bytes`.
    /// Checks `Content-Length` first, then aborts while streaming if the budget is exceeded.
    pub async fn get_file_limited(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
        max_bytes: u64,
    ) -> Result<Vec<u8>, String> {
        let url = self.build_url(config.url.as_deref().unwrap_or(""), remote_path)?;
        let headers = self.auth_headers(config)?;

        let response = self
            .client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| i18n::tf("webdav.download_failed", &[("error", &e.to_string())]))?;

        let status = response.status();
        if !status.is_success() {
            return Err(i18n::tf(
                "webdav.download_failed",
                &[("error", &status.to_string())],
            ));
        }

        check_content_length(response.content_length(), max_bytes)?;

        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut budget = ByteBudget::new(max_bytes);
        let mut out: Vec<u8> = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|e| i18n::tf("webdav.read_data_failed", &[("error", &e.to_string())]))?;
            budget.add(chunk.len())?;
            out.extend_from_slice(&chunk);
        }
        Ok(out)
    }

    // ── DELETE (remove remote file) ────────────────────────

    /// Delete a file on the WebDAV server. A 404 is treated as success (already gone).
    pub async fn delete_file(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
    ) -> Result<(), String> {
        let url = self.build_url(config.url.as_deref().unwrap_or(""), remote_path)?;
        let headers = self.auth_headers(config)?;

        let response = self
            .client
            .delete(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("删除远端文件失败: {e}"))?;

        let status = response.status();
        if !status.is_success() && status.as_u16() != 404 {
            return Err(format!("删除远端文件失败: {status}"));
        }
        Ok(())
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
            .map_err(|e| i18n::tf("webdav.upload_failed", &[("error", &e.to_string())]))?;

        let status = response.status();
        if !status.is_success() {
            return Err(i18n::tf(
                "webdav.upload_failed",
                &[("error", &status.to_string())],
            ));
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
            .map_err(|e| i18n::tf("webdav.create_dir_failed", &[("error", &e.to_string())]))?;

        let status = response.status();
        // 201 Created or 405 Method Not Allowed (already exists) or 409 Conflict
        if status.as_u16() == 405 || status.as_u16() == 409 {
            // Directory might already exist — that's fine for sync
            return Ok(());
        }
        if !status.is_success() {
            return Err(i18n::tf(
                "webdav.create_dir_failed",
                &[("error", &status.to_string())],
            ));
        }

        Ok(())
    }
}

/// Sync orchestrator: compares local and remote file trees, executes sync.
/// What to do with a single file during a sync pass.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SyncAction {
    /// Both sides unchanged since the baseline.
    UpToDate,
    /// Push local content to the remote.
    Upload,
    /// Pull remote content to local.
    Download,
    /// Local file was deleted; propagate the deletion to the remote.
    DeleteRemote,
    /// Back up the local file, then download the remote one (KeepBoth).
    BackupAndDownload,
}

/// Compare the local side against the baseline. Falls back to mtime when no hash is
/// recorded; treats an unknown baseline as "changed" so nothing is silently skipped.
fn local_changed(baseline: &SyncBaselineEntry, local: &LocalFileState) -> bool {
    match (&baseline.local_hash, &local.hash) {
        (Some(base), Some(current)) => base != current,
        _ => match (&baseline.local_mtime, &local.mtime) {
            (Some(base), Some(current)) => base != current,
            _ => true,
        },
    }
}

/// Compare the remote side against the baseline using the ETag, falling back to the
/// last-modified time when no ETag is available.
fn remote_changed(baseline: &SyncBaselineEntry, remote: &WebDavFileEntry) -> bool {
    match (&baseline.remote_etag, remote.etag.as_ref()) {
        (Some(base), Some(current)) => base != current,
        _ => {
            let current = remote
                .last_modified
                .as_deref()
                .and_then(SyncOrchestrator::parse_http_date)
                .map(|dt| dt.to_rfc3339());
            match (&baseline.remote_mtime, current) {
                (Some(base), Some(current)) => *base != current,
                _ => true,
            }
        }
    }
}

fn local_mtime_secs(local: &LocalFileState) -> Option<i64> {
    local
        .mtime
        .as_deref()
        .and_then(|m| chrono::DateTime::parse_from_rfc3339(m).ok())
        .map(|dt| dt.timestamp())
}

fn remote_mtime_secs(remote: &WebDavFileEntry) -> Option<i64> {
    remote
        .last_modified
        .as_deref()
        .and_then(SyncOrchestrator::parse_http_date)
        .map(|dt| dt.timestamp())
}

fn resolve_conflict(strategy: &ConflictStrategy) -> SyncAction {
    match strategy {
        ConflictStrategy::LocalFirst => SyncAction::Upload,
        ConflictStrategy::RemoteFirst => SyncAction::Download,
        ConflictStrategy::KeepBoth => SyncAction::BackupAndDownload,
    }
}

/// Pure decision: given the baseline and the current local/remote state, decide what
/// to do with one file. Existence on each side is expressed as `Option`.
///
/// * both unchanged → skip
/// * only local changed → upload
/// * only remote changed → download
/// * both changed → `conflict_strategy`
/// * local deleted + remote unchanged → delete remote (propagate deletion)
/// * local deleted + remote changed → download (never lose remote data)
/// * remote deleted → never delete local; re-upload it
pub(crate) fn decide_sync_action(
    strategy: &ConflictStrategy,
    baseline: Option<&SyncBaselineEntry>,
    local: Option<&LocalFileState>,
    remote: Option<&WebDavFileEntry>,
) -> SyncAction {
    match (baseline, local, remote) {
        (Some(base), Some(l), Some(r)) => {
            let local_differs = local_changed(base, l);
            let remote_differs = remote_changed(base, r);
            match (local_differs, remote_differs) {
                (false, false) => SyncAction::UpToDate,
                (true, false) => SyncAction::Upload,
                (false, true) => SyncAction::Download,
                (true, true) => resolve_conflict(strategy),
            }
        }
        (Some(base), None, Some(r)) => {
            if remote_changed(base, r) {
                // Remote moved on; restore the local copy instead of deleting data.
                SyncAction::Download
            } else {
                // Local deletion propagates: remove the untouched remote copy.
                SyncAction::DeleteRemote
            }
        }
        // Remote gone: keep the local file and re-upload it on the next pass.
        (Some(_), Some(_), None) => SyncAction::Upload,
        (Some(_), None, None) => SyncAction::UpToDate,
        (None, Some(_), None) => SyncAction::Upload,
        (None, None, Some(_)) => SyncAction::Download,
        (None, Some(l), Some(r)) => match (local_mtime_secs(l), remote_mtime_secs(r)) {
            (Some(ls), Some(rs)) if rs > ls => SyncAction::Download,
            (Some(ls), Some(rs)) if ls > rs => SyncAction::Upload,
            (Some(_), Some(_)) => SyncAction::UpToDate,
            _ => resolve_conflict(strategy),
        },
        (None, None, None) => SyncAction::UpToDate,
    }
}

/// Derive the URL base path from the configured server URL.
fn remote_base_path(config: &WebDavConfig) -> Option<String> {
    config.url.as_deref().and_then(|url| {
        reqwest::Url::parse(url)
            .ok()
            .map(|u| u.path().trim_matches('/').to_string())
    })
}

/// Map a PROPFIND href to a workspace-relative `/`-joined path. Decodes (twice),
/// strips the URL base path and `remote_subdir`, then validates the result.
fn remote_href_to_relative(
    href: &str,
    base_path: Option<&str>,
    remote_subdir: &str,
) -> Option<String> {
    let decoded = decode_remote_path(href);
    let mut path = decoded.trim_matches('/').to_string();

    if let Some(base) = base_path {
        let base = base.trim_matches('/');
        if !base.is_empty() {
            if path == base {
                return None;
            }
            if let Some(rest) = path.strip_prefix(base) {
                path = rest.trim_start_matches('/').to_string();
            }
        }
    }

    let sub = remote_subdir.trim_matches('/');
    if !sub.is_empty() {
        if path == sub {
            return None;
        }
        if let Some(rest) = path.strip_prefix(sub) {
            path = rest.trim_start_matches('/').to_string();
        }
    }

    let safe = safe_relative_path(&path)?;
    let rel = path_to_slash(&safe);
    if rel.is_empty() {
        None
    } else {
        Some(rel)
    }
}

/// Return a backup path inside `dir` that does not already exist. Adds a numeric
/// suffix when the timestamped name collides (second-resolution timestamps can).
fn unique_backup_path(dir: &Path, rel_path: &str) -> PathBuf {
    let source = Path::new(rel_path);
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("backup");
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let mut candidate = dir.join(format!("{stem}.remote-{timestamp}{ext}"));
    let mut counter = 1;
    while candidate.exists() && counter <= 10_000 {
        candidate = dir.join(format!("{stem}.remote-{timestamp}-{counter}{ext}"));
        counter += 1;
    }
    candidate
}

/// Move `local_path` to a unique backup next to it. Returns the backup path on
/// success; on failure the caller must skip the download to avoid data loss.
fn backup_local_file(local_path: &Path, dir: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let backup = unique_backup_path(dir, rel_path);
    std::fs::rename(local_path, &backup).map_err(|e| e.to_string())?;
    Ok(backup)
}

/// Convert a baseline map into the legacy mtime-only snapshot (`sync_files`).
pub fn baselines_to_mtime_map(
    baselines: &HashMap<String, SyncBaselineEntry>,
) -> HashMap<String, String> {
    baselines
        .iter()
        .filter_map(|(rel, entry)| entry.local_mtime.clone().map(|mtime| (rel.clone(), mtime)))
        .collect()
}

/// Result of a sync pass: counters plus the updated per-file baseline.
pub struct SyncOutcome {
    pub result: WebDavSyncResult,
    pub baselines: HashMap<String, SyncBaselineEntry>,
}

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

    /// Build a baseline entry from the current local/remote state.
    fn baseline_entry(
        local: Option<&LocalFileState>,
        remote: Option<&WebDavFileEntry>,
    ) -> SyncBaselineEntry {
        SyncBaselineEntry {
            local_mtime: local.and_then(|l| l.mtime.clone()),
            local_hash: local.and_then(|l| l.hash.clone()),
            remote_etag: remote.and_then(|r| r.etag.clone()),
            remote_mtime: remote
                .and_then(|r| r.last_modified.as_deref())
                .and_then(Self::parse_http_date)
                .map(|dt| dt.to_rfc3339()),
        }
    }

    /// Create the remote parent collection for a file path (no-op at the root).
    async fn ensure_remote_parent(
        &self,
        config: &WebDavConfig,
        remote_path: &str,
    ) -> Result<(), String> {
        match Path::new(remote_path).parent() {
            Some(parent) if !parent.as_os_str().is_empty() => {
                self.webdav
                    .create_collection(config, &path_to_slash(parent))
                    .await
            }
            _ => Ok(()),
        }
    }

    /// Perform a full sync: scan remote, scan local, diff, execute.
    pub async fn sync(
        &self,
        config: &WebDavConfig,
        workspace_root: &Path,
    ) -> Result<SyncOutcome, String> {
        let remote_subdir = config.remote_subdir.as_deref().unwrap_or("");
        let local_subdir = config.local_subdir.as_deref().unwrap_or("");

        let local_dir = workspace_root.join(local_subdir);
        if !local_dir.exists() {
            std::fs::create_dir_all(&local_dir)
                .map_err(|e| i18n::tf("webdav.create_dir_failed", &[("error", &e.to_string())]))?;
        }

        // Ensure remote dir exists
        self.webdav.create_collection(config, remote_subdir).await?;

        // Scan remote files (recursive to get all subdirectory entries)
        let remote_entries = self
            .webdav
            .list_files_recursive(config, remote_subdir)
            .await?;

        // Scan local files with content hashes for incremental decisions
        let local_states = scan_syncable_states(&local_dir, &local_dir);

        let base_path = remote_base_path(config);
        let mut remote_map: HashMap<String, WebDavFileEntry> = HashMap::new();
        let mut result = WebDavSyncResult::default();
        for entry in &remote_entries {
            if entry.is_collection {
                continue;
            }
            match remote_href_to_relative(&entry.href, base_path.as_deref(), remote_subdir) {
                Some(rel) => {
                    remote_map.insert(rel, entry.clone());
                }
                // Malformed/malicious href: skip this entry, keep syncing the rest.
                None => result
                    .errors
                    .push(format!("跳过非法的远端路径: {}", entry.href)),
            }
        }

        // Start from the previous baseline so skipped/failed files keep their entry.
        let mut baselines = config.sync_baselines.clone();

        let mut keys: Vec<String> = local_states
            .keys()
            .chain(remote_map.keys())
            .chain(baselines.keys())
            .cloned()
            .collect();
        keys.sort();
        keys.dedup();

        for rel_path in keys {
            let local = local_states.get(&rel_path);
            let remote = remote_map.get(&rel_path);
            let baseline = baselines.get(&rel_path).cloned();
            let action =
                decide_sync_action(&config.conflict_strategy, baseline.as_ref(), local, remote);

            let remote_path = if remote_subdir.is_empty() {
                rel_path.clone()
            } else {
                format!("{}/{}", remote_subdir.trim_matches('/'), rel_path)
            };

            match action {
                SyncAction::UpToDate => {
                    if let (Some(l), Some(r)) = (local, remote) {
                        // Refresh the baseline so legacy entries gain etag/hash metadata.
                        baselines.insert(rel_path.clone(), Self::baseline_entry(Some(l), Some(r)));
                    } else if local.is_none() && remote.is_none() {
                        baselines.remove(&rel_path);
                    }
                }
                SyncAction::Upload => {
                    let Some(l) = local else { continue };
                    if let Err(e) = self.ensure_remote_parent(config, &remote_path).await {
                        result
                            .errors
                            .push(format!("创建远端目录失败 ({rel_path}): {e}"));
                        continue;
                    }
                    match std::fs::read(local_dir.join(&rel_path)) {
                        Ok(content) => {
                            match self.webdav.put_file(config, &remote_path, content).await {
                                Ok(()) => {
                                    result.files_uploaded += 1;
                                    baselines.insert(
                                        rel_path.clone(),
                                        Self::baseline_entry(Some(l), remote),
                                    );
                                }
                                Err(e) => result.errors.push(i18n::tf(
                                    "webdav.upload_file_failed",
                                    &[("path", &rel_path), ("error", &e.to_string())],
                                )),
                            }
                        }
                        Err(e) => result.errors.push(i18n::tf(
                            "webdav.read_file_failed",
                            &[("path", &rel_path), ("error", &e.to_string())],
                        )),
                    }
                }
                SyncAction::Download | SyncAction::BackupAndDownload => {
                    let Some(rel) = safe_relative_path(&rel_path) else {
                        result.errors.push(format!("跳过非法路径: {rel_path}"));
                        continue;
                    };
                    let local_path = local_dir.join(&rel);

                    if action == SyncAction::BackupAndDownload {
                        match backup_local_file(&local_path, &local_dir, &rel_path) {
                            Ok(_) => result.conflicts_resolved += 1,
                            Err(e) => {
                                // Never overwrite the local file when the backup failed.
                                result
                                    .errors
                                    .push(format!("备份本地文件失败,已跳过 {rel_path}: {e}"));
                                continue;
                            }
                        }
                    }

                    // Reject paths that would escape the sync root (e.g. via symlinks).
                    if let Err(e) = ensure_within_root(&local_dir, &local_path) {
                        result.errors.push(format!("拒绝写入 {rel_path}: {e}"));
                        continue;
                    }
                    if let Some(parent) = local_path.parent() {
                        if let Err(e) = std::fs::create_dir_all(parent) {
                            result
                                .errors
                                .push(format!("创建目录失败 ({rel_path}): {e}"));
                            continue;
                        }
                    }

                    match self.webdav.get_file(config, &remote_path).await {
                        Ok(data) => match std::fs::write(&local_path, &data) {
                            Ok(()) => {
                                result.files_downloaded += 1;
                                let new_local = LocalFileState {
                                    mtime: std::fs::metadata(&local_path)
                                        .ok()
                                        .and_then(|m| m.modified().ok())
                                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                        .and_then(|d| {
                                            chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                                        })
                                        .map(|dt| dt.to_rfc3339()),
                                    hash: Some(hash_bytes(&data)),
                                };
                                baselines.insert(
                                    rel_path.clone(),
                                    Self::baseline_entry(Some(&new_local), remote),
                                );
                            }
                            Err(e) => result.errors.push(format!("写入 {rel_path} 失败: {e}")),
                        },
                        Err(e) => result.errors.push(format!("下载 {rel_path} 失败: {e}")),
                    }
                }
                SyncAction::DeleteRemote => {
                    match self.webdav.delete_file(config, &remote_path).await {
                        Ok(()) => {
                            // Local file intentionally absent and remote untouched:
                            // propagate the deletion to the server. Local files are
                            // never deleted by sync.
                            baselines.remove(&rel_path);
                        }
                        Err(e) => result.errors.push(format!("删除远端 {rel_path} 失败: {e}")),
                    }
                }
            }
        }

        Ok(SyncOutcome { result, baselines })
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::webdav::ConflictStrategy;
    use SyncAction::*;

    fn local(mtime: &str, hash: &str) -> LocalFileState {
        LocalFileState {
            mtime: Some(mtime.to_string()),
            hash: Some(hash.to_string()),
        }
    }

    fn remote(etag: &str) -> WebDavFileEntry {
        WebDavFileEntry {
            href: "/a.md".to_string(),
            display_name: "a.md".to_string(),
            content_length: 0,
            is_collection: false,
            last_modified: None,
            etag: Some(etag.to_string()),
        }
    }

    fn baseline(mtime: &str, hash: &str, etag: &str) -> SyncBaselineEntry {
        SyncBaselineEntry {
            local_mtime: Some(mtime.to_string()),
            local_hash: Some(hash.to_string()),
            remote_etag: Some(etag.to_string()),
            remote_mtime: None,
        }
    }

    #[test]
    fn safe_relative_path_accepts_normal_paths() {
        assert_eq!(
            safe_relative_path("readme.md"),
            Some(PathBuf::from("readme.md"))
        );
        assert_eq!(
            safe_relative_path("docs/a/b.md"),
            Some(PathBuf::from("docs/a/b.md"))
        );
        assert_eq!(
            safe_relative_path("a/./b.md"),
            Some(PathBuf::from("a/b.md"))
        );
    }

    #[test]
    fn safe_relative_path_rejects_traversal_and_absolute() {
        let bad = [
            "",
            "..",
            "../a.md",
            "..\\..\\a.md",
            "a/../b.md",
            "/etc/passwd",
            "C:\\x",
            "\\\\server\\share",
            "a\0b",
        ];
        for path in bad {
            assert!(safe_relative_path(path).is_none(), "should reject {path:?}");
        }
    }

    #[test]
    fn decode_remote_path_defeats_double_encoding() {
        assert_eq!(decode_remote_path("%2e%2e/a"), "../a");
        assert_eq!(decode_remote_path("%252e%252e/a"), "../a");
        assert_eq!(decode_remote_path("a%2Fb"), "a/b");
        // Decoded traversal must still be rejected by the path guard.
        assert!(safe_relative_path(&decode_remote_path("%2e%2e%2f%2e%2e%2fbashrc")).is_none());
        assert!(safe_relative_path(&decode_remote_path("%2Fetc%2Fpasswd")).is_none());
    }

    #[test]
    fn href_relative_paths_are_sanitized() {
        let base = "remote.php/dav/files/u";
        assert_eq!(
            remote_href_to_relative("/remote.php/dav/files/u/docs/a.md", Some(base), ""),
            Some("docs/a.md".to_string())
        );
        assert_eq!(
            remote_href_to_relative("/remote.php/dav/files/u/sub/a.md", Some(base), "sub"),
            Some("a.md".to_string())
        );
        assert_eq!(
            remote_href_to_relative("/remote.php/dav/files/u/%2e%2e/secret", Some(base), ""),
            None
        );
        // Backslash traversal in the href is normalized and rejected.
        assert_eq!(
            remote_href_to_relative("/remote.php/dav/files/u/..\\secret", Some(base), ""),
            None
        );
    }

    #[test]
    fn ensure_within_root_accepts_paths_inside_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root");
        std::fs::create_dir_all(&root).unwrap();
        assert!(ensure_within_root(&root, &root.join("sub").join("ok.md")).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn ensure_within_root_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root");
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join("link")).unwrap();
        assert!(ensure_within_root(&root, &root.join("link").join("evil.md")).is_err());
    }

    #[test]
    fn unique_backup_path_avoids_collisions() {
        let tmp = tempfile::tempdir().unwrap();
        let first = unique_backup_path(tmp.path(), "note.md");
        std::fs::write(&first, b"x").unwrap();
        let second = unique_backup_path(tmp.path(), "note.md");
        assert_ne!(first, second);
        assert!(second
            .file_name()
            .unwrap()
            .to_string_lossy()
            .contains("note.remote-"));
        assert_eq!(second.extension().and_then(|e| e.to_str()), Some("md"));
    }

    #[test]
    fn backup_local_file_reports_failure_instead_of_dropping_data() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("missing.md");
        // A missing source makes the rename fail; the caller must see an error.
        assert!(backup_local_file(&missing, tmp.path(), "missing.md").is_err());

        // A successful backup leaves the source gone and the backup present.
        let source = tmp.path().join("note.md");
        std::fs::write(&source, b"content").unwrap();
        let backup = backup_local_file(&source, tmp.path(), "note.md").unwrap();
        assert!(!source.exists());
        assert!(backup.exists());
    }

    #[test]
    fn decide_sync_action_table() {
        let base = baseline("2024-01-01T00:00:00+00:00", "hash-old", "\"etag-old\"");
        let l_same = local("2024-01-01T00:00:00+00:00", "hash-old");
        let l_new = local("2024-01-02T00:00:00+00:00", "hash-new");
        let r_same = remote("\"etag-old\"");
        let r_new = remote("\"etag-new\"");

        // (strategy, baseline, local, remote, expected)
        let cases = vec![
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                Some(&l_same),
                Some(&r_same),
                UpToDate,
            ),
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                Some(&l_new),
                Some(&r_same),
                Upload,
            ),
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                Some(&l_same),
                Some(&r_new),
                Download,
            ),
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                Some(&l_new),
                Some(&r_new),
                Upload,
            ),
            (
                ConflictStrategy::RemoteFirst,
                Some(&base),
                Some(&l_new),
                Some(&r_new),
                Download,
            ),
            (
                ConflictStrategy::KeepBoth,
                Some(&base),
                Some(&l_new),
                Some(&r_new),
                BackupAndDownload,
            ),
            // Local deleted + remote unchanged → propagate deletion.
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                None,
                Some(&r_same),
                DeleteRemote,
            ),
            // Local deleted + remote changed → restore instead of losing remote data.
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                None,
                Some(&r_new),
                Download,
            ),
            // Remote deleted → re-upload, never delete local.
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                Some(&l_same),
                None,
                Upload,
            ),
            (
                ConflictStrategy::LocalFirst,
                Some(&base),
                None,
                None,
                UpToDate,
            ),
            // No baseline (first sync).
            (
                ConflictStrategy::LocalFirst,
                None,
                Some(&l_same),
                None,
                Upload,
            ),
            (
                ConflictStrategy::LocalFirst,
                None,
                None,
                Some(&r_same),
                Download,
            ),
        ];

        for (strategy, base, local, remote, expected) in cases {
            assert_eq!(
                decide_sync_action(&strategy, base, local, remote),
                expected,
                "strategy={strategy:?} local={} remote={}",
                local.is_some(),
                remote.is_some()
            );
        }
    }

    #[test]
    fn remote_change_falls_back_to_mtime_without_etag() {
        let mut base = baseline("2024-01-01T00:00:00+00:00", "hash-old", "\"etag-old\"");
        base.remote_etag = None;
        base.remote_mtime = Some("2024-01-01T00:00:00+00:00".to_string());
        let l_same = local("2024-01-01T00:00:00+00:00", "hash-old");

        let mut r = remote("\"unused\"");
        r.etag = None;
        r.last_modified = Some("Mon, 01 Jan 2024 00:00:00 GMT".to_string());
        assert_eq!(
            decide_sync_action(
                &ConflictStrategy::LocalFirst,
                Some(&base),
                Some(&l_same),
                Some(&r)
            ),
            UpToDate
        );

        r.last_modified = Some("Tue, 02 Jan 2024 00:00:00 GMT".to_string());
        assert_eq!(
            decide_sync_action(
                &ConflictStrategy::LocalFirst,
                Some(&base),
                Some(&l_same),
                Some(&r)
            ),
            Download
        );
    }

    #[test]
    fn content_length_limit_is_enforced() {
        assert!(check_content_length(Some(101), 100).is_err());
        assert!(check_content_length(Some(100), 100).is_ok());
        assert!(check_content_length(None, 100).is_ok());
    }

    #[test]
    fn byte_budget_aborts_over_limit() {
        let mut budget = ByteBudget::new(10);
        assert!(budget.add(6).is_ok());
        assert!(budget.add(4).is_ok());
        assert_eq!(budget.seen(), 10);
        assert!(budget.add(1).is_err());
    }

    #[test]
    fn hash_bytes_is_stable() {
        assert_eq!(hash_bytes(b"hello"), hash_bytes(b"hello"));
        assert_ne!(hash_bytes(b"hello"), hash_bytes(b"world"));
    }

    #[test]
    fn scan_skips_symlinked_directories() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let tmp = tempfile::tempdir().unwrap();
            let root = tmp.path().join("root");
            std::fs::create_dir_all(&root).unwrap();
            std::fs::write(root.join("a.md"), b"a").unwrap();
            symlink(&root, root.join("loop")).unwrap();
            let files = scan_syncable_states(&root, &root);
            assert!(files.contains_key("a.md"));
            // The symlink loop must not be traversed (no hang / no extra entries).
            assert_eq!(files.len(), 1);
        }
    }

    #[test]
    fn baselines_to_mtime_map_keeps_only_mtimes() {
        let mut map = HashMap::new();
        map.insert(
            "a.md".to_string(),
            SyncBaselineEntry {
                local_mtime: Some("2024-01-01T00:00:00+00:00".to_string()),
                ..Default::default()
            },
        );
        map.insert("b.md".to_string(), SyncBaselineEntry::default());
        let mtimes = baselines_to_mtime_map(&map);
        assert_eq!(mtimes.len(), 1);
        assert_eq!(
            mtimes.get("a.md").map(String::as_str),
            Some("2024-01-01T00:00:00+00:00")
        );
    }

    #[test]
    fn legacy_persisted_config_still_deserializes() {
        // Old configs predate `has_password` / `sync_baselines`; both are `#[serde(default)]`.
        let json = r#"{"url":"https://dav.example.com/","username":"u","sync_files":{"a.md":"2024-01-01T00:00:00+00:00"}}"#;
        let config: WebDavConfig = serde_json::from_str(json).unwrap();
        assert!(config.sync_baselines.is_empty());
        assert!(!config.has_password);
        assert_eq!(config.sync_files.len(), 1);
        assert_eq!(config.conflict_strategy, ConflictStrategy::LocalFirst);
    }
}
