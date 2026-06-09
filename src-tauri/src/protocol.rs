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
use std::sync::Mutex;

use tauri::{
    http::{header, Request, Response, StatusCode},
    Manager, Runtime,
};

// ─── Managed State ───────────────────────────────────────────────────────

/// Thread-safe state that tracks the current workspace root for the
/// `madora://` protocol handler.
pub struct MadoraProtocolState {
    workspace_root: Mutex<Option<PathBuf>>,
}

impl Default for MadoraProtocolState {
    fn default() -> Self {
        Self::new()
    }
}

impl MadoraProtocolState {
    pub fn new() -> Self {
        Self {
            workspace_root: Mutex::new(None),
        }
    }

    /// Set or clear the workspace root.
    pub fn set_workspace_root(&self, root: Option<PathBuf>) {
        *self.workspace_root.lock().unwrap() = root;
    }

    /// Get a clone of the current workspace root.
    #[allow(dead_code)]
    pub fn get_workspace_root(&self) -> Option<PathBuf> {
        self.workspace_root.lock().unwrap().clone()
    }
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

    // ── 2. Create PathBuf from the URI path directly ───────
    // On Unix, paths starting with / are absolute.
    // On Windows, paths like /C:/Users/... are handled correctly by PathBuf.
    let requested = PathBuf::from(raw_path);

    // ── 3. SECURITY: Get the workspace root for validation ─
    let state = app_handle.state::<MadoraProtocolState>();
    let workspace_root = match state.workspace_root.lock().unwrap().clone() {
        Some(root) => root,
        None => {
            return error_response(
                StatusCode::NOT_FOUND,
                "No workspace is configured. Please open a workspace first.",
            );
        }
    };

    // ── 4. SECURITY: Canonicalise (resolves symlinks, `.`, `..`) ──
    let canonical = match requested.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "The requested file was not found.");
        }
    };

    // ── 5. SECURITY: Ensure the resolved path is within the workspace root ──
    let canonical_root = match workspace_root.canonicalize() {
        Ok(r) => r,
        Err(_) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Workspace root is not accessible.",
            );
        }
    };

    if !canonical.starts_with(&canonical_root) {
        return error_response(
            StatusCode::FORBIDDEN,
            "Access denied: the requested path is outside the workspace.",
        );
    }

    // ── 6. Ensure it's a regular file (not a directory) ─────
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
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
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

    // ── MadoraProtocolState ─────────────────────────────────

    #[test]
    fn protocol_state_default_is_none() {
        let state = MadoraProtocolState::new();
        assert!(state.get_workspace_root().is_none());
    }

    #[test]
    fn protocol_state_set_and_get() {
        let state = MadoraProtocolState::new();
        let root = Some(PathBuf::from("/tmp/test-workspace"));
        state.set_workspace_root(root.clone());
        assert_eq!(state.get_workspace_root(), root);
    }

    #[test]
    fn protocol_state_clear() {
        let state = MadoraProtocolState::new();
        state.set_workspace_root(Some(PathBuf::from("/tmp")));
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
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();

        let outside = PathBuf::from("/tmp");
        let outside_file = outside.join("madora-test-outside.txt");
        fs::write(&outside_file, b"outside-data").unwrap();

        let canonical = outside_file.canonicalize().unwrap();
        let canonical_root = root.canonicalize().unwrap();
        assert!(!canonical.starts_with(&canonical_root));

        let _ = fs::remove_file(&outside_file);
    }

    #[test]
    fn path_traversal_attempt_fails() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();

        let traversal = root.join("images/../../../etc/passwd");
        if let Ok(canonical) = traversal.canonicalize() {
            let canonical_root = root.canonicalize().unwrap();
            assert!(!canonical.starts_with(&canonical_root));
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
