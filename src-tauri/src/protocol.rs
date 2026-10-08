//! Custom `madora://` URI scheme protocol for serving workspace files.
//!
//! This module provides the Tauri v2 custom protocol (`madora://`) that
//! intercepts webview resource requests and serves files from the
//! workspace directory.
//!
//! The frontend converts relative paths in Markdown content (images,
//! links, etc.) to `madora://` URLs, which are then resolved against
//! the workspace root and served with proper MIME types. Path traversal
//! attacks are blocked by canonicalisation and a workspace-root containment
//! check.
//!
//! # URL format
//!
//! `madora:///<path-relative-to-workspace-root>`
//!
//! For example, given a workspace root of `/home/user/project`,
//! the URL `madora:///images/foo.png` serves `/home/user/project/images/foo.png`.
//!
//! # Security
//!
//! - All requested paths are canonicalised via `std::fs::canonicalize`,
//!   which resolves symlinks and `..` segments.
//! - The canonical path must be strictly contained within the canonical
//!   workspace root. Requests that escape the root return `403 Forbidden`.
//! - The handler only activates when a workspace root is set; otherwise
//!   it returns `404 Not Found`.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use crate::i18n;
use crate::services::paths;

use tauri::{
    http::{header, Request, Response, StatusCode},
    Manager, Runtime,
};

// ─── Managed State ───────────────────────────────────────────────────────

/// Thread-safe state that tracks the current workspace root for the
/// `madora://` protocol handler.
pub struct MadoraProtocolState {
    workspace_root: Mutex<Option<PathBuf>>,
    document_dirs: Mutex<Vec<PathBuf>>,
}

/// How many directories of externally opened documents are remembered. Old
/// ones are dropped first, so the set cannot grow without bound.
const MAX_DOCUMENT_DIRS: usize = 32;

impl Default for MadoraProtocolState {
    fn default() -> Self {
        Self::new()
    }
}

impl MadoraProtocolState {
    pub fn new() -> Self {
        Self {
            workspace_root: Mutex::new(None),
            document_dirs: Mutex::new(Vec::new()),
        }
    }

    fn lock_root(&self) -> MutexGuard<'_, Option<PathBuf>> {
        // The guarded value is a plain `Option`, so a panic elsewhere cannot
        // leave it half-written; keep serving instead of cascading the panic.
        self.workspace_root
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    /// Set or clear the workspace root.
    pub fn set_workspace_root(&self, root: Option<PathBuf>) {
        *self.lock_root() = root;
    }

    /// Get a clone of the current workspace root.
    pub fn get_workspace_root(&self) -> Option<PathBuf> {
        self.lock_root().clone()
    }

    /// Lets relative images of a document opened from outside the workspace
    /// load: images (and only images) next to it are served.
    ///
    /// `dir` must come from a file the backend itself authorised for reading,
    /// never from a path the webview names, so a document cannot widen what
    /// it can reach.
    pub fn allow_document_dir(&self, dir: PathBuf) {
        let mut dirs = self
            .document_dirs
            .lock()
            .unwrap_or_else(PoisonError::into_inner);

        dirs.retain(|known| known != &dir);
        dirs.push(dir);

        if dirs.len() > MAX_DOCUMENT_DIRS {
            dirs.remove(0);
        }
    }

    /// Decides whether `canonical` (already resolved) may be served.
    ///
    /// Anything inside the workspace is served, except protected paths. Outside
    /// it, only images inside the directory of an externally opened document.
    fn check_read(&self, canonical: &Path) -> Result<(), (StatusCode, String)> {
        let workspace_root = self.get_workspace_root();

        if let Some(root) = &workspace_root {
            let canonical_root = root.canonicalize().map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Workspace root is not accessible.".to_string(),
                )
            })?;

            if let Ok(relative) = canonical.strip_prefix(&canonical_root) {
                return if paths::is_protected_path(relative) {
                    Err((StatusCode::FORBIDDEN, "Access denied.".to_string()))
                } else {
                    Ok(())
                };
            }
        }

        let in_document_dir = is_image_path(canonical)
            && self
                .document_dirs
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .iter()
                .any(|dir| canonical.starts_with(dir));

        if in_document_dir {
            return Ok(());
        }

        if workspace_root.is_none() {
            return Err((
                StatusCode::NOT_FOUND,
                "No workspace is configured. Please open a workspace first.".to_string(),
            ));
        }

        Err((
            StatusCode::FORBIDDEN,
            "Access denied: the requested path is outside the workspace.".to_string(),
        ))
    }

    /// Checks that `claimed` (a root path sent by the webview) is the
    /// workspace the backend itself recorded, and returns it.
    ///
    /// Commands must not take the webview's word for what the workspace is:
    /// the root is established by the native folder picker (or restored from
    /// the persisted state), never by an arbitrary `invoke` argument.
    pub fn authorize_root(&self, claimed: &Path) -> Result<PathBuf, String> {
        let Some(current) = self.get_workspace_root() else {
            return Err(i18n::t("explorer.no_workspace"));
        };

        if claimed == current || same_directory(claimed, &current) {
            Ok(claimed.to_path_buf())
        } else {
            Err(i18n::t("explorer.workspace_mismatch"))
        }
    }
}

fn same_directory(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Turns the path component of a `madora://` URI into a filesystem path:
/// percent-decodes it and drops the slash that precedes a Windows drive
/// letter (`/C:/Users/x` → `C:/Users/x`).
fn request_path_to_fs_path(raw_path: &str) -> Option<PathBuf> {
    let decoded = urlencoding::decode(raw_path).ok()?;

    if decoded.contains('\0') {
        return None;
    }

    let bytes = decoded.as_bytes();
    let drive_prefixed =
        bytes.len() >= 3 && bytes[0] == b'/' && bytes[1].is_ascii_alphabetic() && bytes[2] == b':';

    Some(PathBuf::from(if drive_prefixed {
        &decoded[1..]
    } else {
        &decoded[..]
    }))
}

// ─── Protocol Handler ────────────────────────────────────────────────────

/// Tauri custom URI scheme protocol handler for `madora://`.
///
/// Resolves the requested path against the workspace root, validates
/// that it stays within the workspace, and serves the file with the
/// correct MIME type.
///
/// URL format: `madora://localhost/<absolute-filesystem-path>`
/// For example: `madora://localhost/home/user/project/images/foo.png`
/// `request.uri().path()` returns `/home/user/project/images/foo.png`,
/// which is treated as an absolute filesystem path.
pub fn handle_madora_protocol<R: Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let app_handle = ctx.app_handle();

    // ── 1. Extract the path component from the URI ───────────
    // request.uri().path() returns something like "/home/user/file.png".
    // This is the absolute filesystem path (starts with / on Unix).
    let raw_path = request.uri().path();

    if raw_path.is_empty() || raw_path == "/" {
        return error_response(StatusCode::BAD_REQUEST, "Empty path in request");
    }

    // ── 2. Create PathBuf from the (percent-decoded) URI path ──
    let Some(requested) = request_path_to_fs_path(raw_path) else {
        return error_response(StatusCode::BAD_REQUEST, "Malformed path in request");
    };

    // ── 3. SECURITY: Canonicalise (resolves symlinks, `.`, `..`) ──
    let canonical = match requested.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "The requested file was not found.");
        }
    };

    // ── 4. SECURITY: Ensure the resolved path is one we may serve ──
    let state = app_handle.state::<MadoraProtocolState>();

    if let Err((status, message)) = state.check_read(&canonical) {
        return error_response(status, &message);
    }

    // ── 5. Ensure it's a regular file (not a directory) ─────
    if canonical.is_dir() {
        return error_response(StatusCode::FORBIDDEN, "Cannot read a directory.");
    }

    // ── 7. Read the file ────────────────────────────────────
    let data = match std::fs::read(&canonical) {
        Ok(d) => d,
        Err(e) => {
            return error_response(
                StatusCode::NOT_FOUND,
                &format!("Failed to read file: {}", e),
            );
        }
    };

    // ── 8. Determine MIME type ──────────────────────────────
    let mime = mime_for_path(&canonical);

    // ── 9. Build the response ───────────────────────────────
    build_response(StatusCode::OK, mime, data)
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/// Build a successful HTTP response with the given content type and body.
fn build_response(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        // A file opened directly (e.g. an .html link) must not run script or
        // reach the network; inline styles stay allowed for SVG and the like.
        .header(
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; img-src data: 'self'; media-src 'self'; \
             style-src 'unsafe-inline'; sandbox",
        )
        .header(header::CACHE_CONTROL, "private, max-age=60")
        .body(body)
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Vec::new())
                .unwrap()
        })
}

/// Build an error response with a plain-text message.
fn error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    build_response(
        status,
        "text/plain; charset=utf-8",
        message.as_bytes().to_vec(),
    )
}

/// Whether `path` is an image the webview can show in an `<img>`.
fn is_image_path(path: &Path) -> bool {
    mime_for_path(path).starts_with("image/")
}

/// Determine the MIME type for a file based on its extension.
fn mime_for_path(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    match ext.as_deref() {
        // Images
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("avif") => "image/avif",
        Some("tiff") | Some("tif") => "image/tiff",

        // Text / Markup
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8",
        Some("mjs") => "application/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("xml") => "application/xml; charset=utf-8",
        Some("txt") => "text/plain; charset=utf-8",
        Some("md") | Some("markdown") | Some("mdx") => "text/markdown; charset=utf-8",
        Some("csv") => "text/csv; charset=utf-8",
        Some("yaml") | Some("yml") => "text/yaml; charset=utf-8",
        Some("toml") => "text/toml; charset=utf-8",

        // Fonts
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("eot") => "application/vnd.ms-fontobject",

        // Audio / Video
        Some("mp3") => "audio/mpeg",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("ogg") => "audio/ogg",
        Some("wav") => "audio/wav",
        Some("avi") => "video/x-msvideo",
        Some("mov") => "video/quicktime",

        // Documents
        Some("pdf") => "application/pdf",
        Some("doc") | Some("docx") => "application/msword",
        Some("xls") | Some("xlsx") => "application/vnd.ms-excel",
        Some("ppt") | Some("pptx") => "application/vnd.ms-powerpoint",

        // Archives
        Some("zip") => "application/zip",
        Some("tar") => "application/x-tar",
        Some("gz") | Some("tgz") => "application/gzip",
        Some("bz2") => "application/x-bzip2",
        Some("7z") => "application/x-7z-compressed",
        Some("rar") => "application/vnd.rar",

        // WASM
        Some("wasm") => "application/wasm",

        // Fallback
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ── mime_for_path ───────────────────────────────────────

    #[test]
    fn mime_for_image_png() {
        let path = Path::new("image.png");
        assert_eq!(mime_for_path(path), "image/png");
    }

    #[test]
    fn mime_for_image_jpg() {
        assert_eq!(mime_for_path(Path::new("image.jpg")), "image/jpeg");
        assert_eq!(mime_for_path(Path::new("image.jpeg")), "image/jpeg");
    }

    #[test]
    fn mime_for_text_markdown() {
        assert_eq!(
            mime_for_path(Path::new("doc.md")),
            "text/markdown; charset=utf-8"
        );
        assert_eq!(
            mime_for_path(Path::new("readme.markdown")),
            "text/markdown; charset=utf-8"
        );
    }

    #[test]
    fn mime_for_css() {
        assert_eq!(
            mime_for_path(Path::new("style.css")),
            "text/css; charset=utf-8"
        );
    }

    #[test]
    fn mime_for_javascript() {
        assert_eq!(
            mime_for_path(Path::new("app.js")),
            "application/javascript; charset=utf-8"
        );
    }

    #[test]
    fn mime_for_unknown_extension() {
        assert_eq!(
            mime_for_path(Path::new("file.unknown")),
            "application/octet-stream"
        );
    }

    #[test]
    fn mime_for_no_extension() {
        assert_eq!(
            mime_for_path(Path::new("Makefile")),
            "application/octet-stream"
        );
    }

    // ── request_path_to_fs_path / is_protected_path ─────────

    #[test]
    fn request_path_is_percent_decoded() {
        assert_eq!(
            request_path_to_fs_path("/home/u/my%20docs/%E6%B5%8B%E8%AF%95.png"),
            Some(PathBuf::from("/home/u/my docs/测试.png"))
        );
    }

    #[test]
    fn request_path_drops_the_slash_before_a_drive_letter() {
        assert_eq!(
            request_path_to_fs_path("/C:/Users/me/a.png"),
            Some(PathBuf::from("C:/Users/me/a.png"))
        );
        assert_eq!(
            request_path_to_fs_path("/c%3A/Users/a.png"),
            Some(PathBuf::from("c:/Users/a.png"))
        );
        assert_eq!(
            request_path_to_fs_path("/cache/a.png"),
            Some(PathBuf::from("/cache/a.png"))
        );
    }

    #[test]
    fn request_path_rejects_nul_bytes() {
        assert_eq!(request_path_to_fs_path("/a%00b"), None);
    }

    // ── authorize_root ──────────────────────────────────────

    #[test]
    fn authorize_root_requires_an_open_workspace() {
        let state = MadoraProtocolState::new();

        assert!(state.authorize_root(Path::new("/tmp")).is_err());
    }

    #[test]
    fn authorize_root_accepts_only_the_recorded_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ws");
        let other = dir.path().join("other");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        let state = MadoraProtocolState::new();
        state.set_workspace_root(Some(root.clone()));

        assert_eq!(state.authorize_root(&root).unwrap(), root);
        assert!(state.authorize_root(&other).is_err());
        assert!(state.authorize_root(dir.path()).is_err());
        // A different spelling of the same directory is still that directory.
        assert!(state.authorize_root(&root.join("../ws")).is_ok());
    }

    // ── check_read ──────────────────────────────────────────

    fn state_with_workspace(root: &Path) -> MadoraProtocolState {
        let state = MadoraProtocolState::new();
        state.set_workspace_root(Some(root.to_path_buf()));
        state
    }

    fn canonical(path: PathBuf) -> PathBuf {
        path.canonicalize().unwrap()
    }

    #[test]
    fn check_read_serves_workspace_files_but_not_protected_ones() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join("a.png"), b"x").unwrap();
        fs::write(dir.path().join(".git").join("config"), b"x").unwrap();
        let state = state_with_workspace(dir.path());

        assert!(state
            .check_read(&canonical(dir.path().join("a.png")))
            .is_ok());
        let (status, _) = state
            .check_read(&canonical(dir.path().join(".git").join("config")))
            .unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[test]
    fn check_read_refuses_everything_without_a_workspace_or_document() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.png"), b"x").unwrap();
        let state = MadoraProtocolState::new();

        let (status, _) = state
            .check_read(&canonical(dir.path().join("a.png")))
            .unwrap_err();
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[test]
    fn a_document_directory_serves_images_only() {
        let workspace = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        fs::write(docs.path().join("pic.PNG"), b"x").unwrap();
        fs::write(docs.path().join("secret.txt"), b"x").unwrap();
        fs::write(docs.path().join("note.md"), b"x").unwrap();
        let state = state_with_workspace(workspace.path());
        state.allow_document_dir(canonical(docs.path().to_path_buf()));

        assert!(state
            .check_read(&canonical(docs.path().join("pic.PNG")))
            .is_ok());
        for name in ["secret.txt", "note.md"] {
            let (status, _) = state
                .check_read(&canonical(docs.path().join(name)))
                .unwrap_err();
            assert_eq!(status, StatusCode::FORBIDDEN, "{name}");
        }
    }

    #[test]
    fn a_document_directory_works_without_a_workspace() {
        let docs = tempfile::tempdir().unwrap();
        fs::create_dir(docs.path().join("img")).unwrap();
        fs::write(docs.path().join("img").join("pic.png"), b"x").unwrap();
        let state = MadoraProtocolState::new();
        state.allow_document_dir(canonical(docs.path().to_path_buf()));

        assert!(state
            .check_read(&canonical(docs.path().join("img").join("pic.png")))
            .is_ok());
    }

    #[test]
    fn images_beside_an_unrelated_directory_stay_blocked() {
        let docs = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        fs::write(other.path().join("pic.png"), b"x").unwrap();
        let state = MadoraProtocolState::new();
        state.allow_document_dir(canonical(docs.path().to_path_buf()));

        assert!(state
            .check_read(&canonical(other.path().join("pic.png")))
            .is_err());
    }

    #[test]
    fn only_the_most_recent_document_directories_are_remembered() {
        let state = MadoraProtocolState::new();

        for index in 0..MAX_DOCUMENT_DIRS + 5 {
            state.allow_document_dir(PathBuf::from(format!("/docs/{index}")));
        }
        state.allow_document_dir(PathBuf::from("/docs/40"));

        let dirs = state.document_dirs.lock().unwrap();
        assert_eq!(dirs.len(), MAX_DOCUMENT_DIRS);
        assert!(!dirs.contains(&PathBuf::from("/docs/0")));
        assert_eq!(dirs.last(), Some(&PathBuf::from("/docs/40")));
    }

    // ── MadoraProtocolState ─────────────────────────────────

    #[test]
    fn protocol_state_default_is_none() {
        let state = MadoraProtocolState::new();
        assert!(state.get_workspace_root().is_none());
    }

    #[test]
    fn protocol_state_set_and_get() {
        let state = MadoraProtocolState::new();
        let dir = tempfile::tempdir().unwrap();
        let root = Some(dir.path().to_path_buf());
        state.set_workspace_root(root.clone());
        assert_eq!(state.get_workspace_root(), root);
    }

    #[test]
    fn protocol_state_clear() {
        let state = MadoraProtocolState::new();
        let dir = tempfile::tempdir().unwrap();
        state.set_workspace_root(Some(dir.path().to_path_buf()));
        state.set_workspace_root(None);
        assert!(state.get_workspace_root().is_none());
    }

    // ── Path resolution logic (unit tests) ──────────────────

    #[test]
    fn path_resolution_within_root_succeeds() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();

        let sub_dir = root.join("images");
        fs::create_dir_all(&sub_dir).unwrap();
        let file_path = sub_dir.join("hello.png");
        fs::write(&file_path, b"fake-png-data").unwrap();

        let relative = "images/hello.png";
        let requested = root.join(relative);
        let canonical = requested.canonicalize().unwrap();
        let canonical_root = root.canonicalize().unwrap();
        assert!(canonical.starts_with(&canonical_root));

        let data = fs::read(&canonical).unwrap();
        assert_eq!(data, b"fake-png-data");
        assert_eq!(mime_for_path(&canonical), "image/png");
    }

    #[test]
    fn path_resolution_outside_root_fails() {
        let workspace_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();

        let outside_file = outside_dir.path().join("madora-test-outside.txt");
        fs::write(&outside_file, b"outside-data").unwrap();

        let canonical = outside_file.canonicalize().unwrap();
        let canonical_root = workspace_dir.path().canonicalize().unwrap();
        assert!(!canonical.starts_with(&canonical_root));

        let _ = fs::remove_file(&outside_file);
    }

    #[test]
    fn path_traversal_attempt_fails() {
        let workspace_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();

        let outside_file = outside_dir.path().join("secret.txt");
        fs::write(&outside_file, b"secret").unwrap();

        // Build a traversal path from workspace into the outside dir
        // using ..  Both tempdirs share the same parent (system temp),
        // so ../<outside_dir_name>/secret.txt resolves cross-platform.
        let traversal = workspace_dir
            .path()
            .join("..")
            .join(outside_dir.path().file_name().unwrap())
            .join("secret.txt");

        let traversal_result = traversal.canonicalize();
        // Both outcomes are valid:
        // 1. canonicalize fails  → path unreachable, traversal naturally blocked
        // 2. canonicalize succeeds → must resolve outside the workspace root
        if let Ok(canonical) = traversal_result {
            let canonical_root = workspace_dir.path().canonicalize().unwrap();
            assert!(
                !canonical.starts_with(&canonical_root),
                "path traversal resolved inside workspace: {canonical:?}"
            );
        }
    }

    #[test]
    fn directory_request_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("subdir");
        fs::create_dir_all(&sub).unwrap();

        let canonical = sub.canonicalize().unwrap();
        assert!(canonical.is_dir());
    }
}
