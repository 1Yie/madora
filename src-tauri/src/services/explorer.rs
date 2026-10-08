use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chardetng::EncodingDetector;

use crate::i18n;
use crate::services::paths;
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};

use crate::models::explorer::{ExplorerFileKind, ExplorerNode, ExplorerNodeKind, FilePreview};

const MAX_TEXT_PREVIEW_BYTES: usize = 512 * 1024;
/// Images are inlined as base64 data URLs, so an unbounded file would be
/// held in memory twice and then shipped across the IPC bridge.
const MAX_IMAGE_PREVIEW_BYTES: u64 = 25 * 1024 * 1024;

struct DetectedTextEncoding {
    encoding: &'static Encoding,
    has_bom: bool,
}

fn path_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn classify_file_kind(path: &Path) -> Option<ExplorerFileKind> {
    let extension = path.extension()?.to_string_lossy().to_ascii_lowercase();

    match extension.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => Some(ExplorerFileKind::Image),
        "md" | "markdown" | "mdx" => Some(ExplorerFileKind::Markdown),
        "txt" => Some(ExplorerFileKind::Text),
        _ => None,
    }
}

fn image_mime_type(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn read_directory_entries(
    directory: &Path,
    show_hidden_files: bool,
    sort: bool,
) -> Result<Vec<fs::DirEntry>, String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if !show_hidden_files {
        entries.retain(|entry| !entry.file_name().to_string_lossy().starts_with('.'));
    }

    entries.sort_by(|left, right| {
        let left_is_dir = left
            .file_type()
            .map(|value| value.is_dir())
            .unwrap_or(false);
        let right_is_dir = right
            .file_type()
            .map(|value| value.is_dir())
            .unwrap_or(false);

        let dir_order = right_is_dir.cmp(&left_is_dir);
        if dir_order != std::cmp::Ordering::Equal || !sort {
            return dir_order;
        }

        left.file_name()
            .to_string_lossy()
            .to_ascii_lowercase()
            .cmp(&right.file_name().to_string_lossy().to_ascii_lowercase())
    });

    Ok(entries)
}

fn build_file_node(root: &Path, path: &Path, file_kind: ExplorerFileKind) -> ExplorerNode {
    ExplorerNode {
        name: path_name(path),
        path: path.to_string_lossy().into_owned(),
        relative_path: relative_path(root, path),
        kind: ExplorerNodeKind::File,
        file_kind: Some(file_kind),
        has_children: false,
        loaded: true,
        children: Vec::new(),
    }
}

fn bom_bytes_for_encoding(encoding: &'static Encoding) -> Option<&'static [u8]> {
    if encoding == UTF_8 {
        return Some(&[0xEF, 0xBB, 0xBF]);
    }

    if encoding == UTF_16LE {
        return Some(&[0xFF, 0xFE]);
    }

    if encoding == UTF_16BE {
        return Some(&[0xFE, 0xFF]);
    }

    None
}

fn detect_text_encoding(bytes: &[u8]) -> DetectedTextEncoding {
    if let Some((encoding, _bom_len)) = Encoding::for_bom(bytes) {
        return DetectedTextEncoding {
            encoding,
            has_bom: true,
        };
    }

    let mut detector = EncodingDetector::new();
    detector.feed(bytes, true);

    DetectedTextEncoding {
        encoding: detector.guess(None, true),
        has_bom: false,
    }
}

fn decode_text_bytes(bytes: &[u8], detected: &DetectedTextEncoding) -> String {
    let bom_len = if detected.has_bom {
        bom_bytes_for_encoding(detected.encoding)
            .map(|bom| bom.len())
            .unwrap_or_default()
    } else {
        0
    };
    let text_bytes = &bytes[bom_len.min(bytes.len())..];
    let (text, _, _) = detected.encoding.decode(text_bytes);

    text.into_owned()
}

/// Encode text as UTF-16 with the given byte order.
///
/// `encoding_rs` follows the WHATWG Encoding Standard, which defines no
/// UTF-16 *encoder*: `Encoding::encode` for UTF-16LE/BE emits UTF-8 bytes.
/// Writing those behind a UTF-16 BOM produces a file no reader can decode,
/// so UTF-16 is encoded directly from the code units instead.
fn encode_utf16(content: &str, big_endian: bool) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(content.len() * 2);

    for unit in content.encode_utf16() {
        let pair = if big_endian {
            unit.to_be_bytes()
        } else {
            unit.to_le_bytes()
        };
        bytes.extend_from_slice(&pair);
    }

    bytes
}

fn encode_text_content(
    content: &str,
    detected: Option<&DetectedTextEncoding>,
) -> Result<Vec<u8>, String> {
    let Some(detected) = detected else {
        return Ok(content.as_bytes().to_vec());
    };

    let encoded: std::borrow::Cow<'_, [u8]> =
        if detected.encoding == UTF_16LE || detected.encoding == UTF_16BE {
            std::borrow::Cow::Owned(encode_utf16(content, detected.encoding == UTF_16BE))
        } else {
            let (encoded, _, had_errors) = detected.encoding.encode(content);

            if had_errors {
                let enc_name = detected.encoding.name().to_string();
                return Err(i18n::tf(
                    "explorer.cannot_save_encoding",
                    &[("encoding", &enc_name)],
                ));
            }

            encoded
        };

    let mut bytes = Vec::new();

    if detected.has_bom {
        if let Some(bom) = bom_bytes_for_encoding(detected.encoding) {
            bytes.extend_from_slice(bom);
        }
    }

    bytes.extend_from_slice(encoded.as_ref());
    Ok(bytes)
}

/// Reads at most one byte more than the preview limit, so opening a huge file
/// never loads it whole.
fn read_prefix(path: &Path) -> Result<Vec<u8>, String> {
    use std::io::Read;

    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|error| error.to_string())?
        .take(MAX_TEXT_PREVIEW_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;

    Ok(bytes)
}

fn read_text_preview(path: &Path) -> Result<(String, bool, String), String> {
    let bytes = read_prefix(path)?;
    let detected = detect_text_encoding(&bytes);
    let truncated = bytes.len() > MAX_TEXT_PREVIEW_BYTES;
    let preview_bytes = if truncated {
        &bytes[..MAX_TEXT_PREVIEW_BYTES]
    } else {
        &bytes[..]
    };

    Ok((
        decode_text_bytes(preview_bytes, &detected),
        truncated,
        detected.encoding.name().to_string(),
    ))
}

pub fn write_workspace_file(file_path: &Path, content: &str) -> Result<(), String> {
    let existing = fs::metadata(file_path).ok().filter(fs::Metadata::is_file);

    // A file larger than the preview limit is only ever read as a prefix (and
    // shown read-only), so any write would silently destroy the remainder.
    // Callers must not save a document they could not read in full.
    if existing
        .as_ref()
        .is_some_and(|metadata| metadata.len() > MAX_TEXT_PREVIEW_BYTES as u64)
    {
        return Err(i18n::t("explorer.refuse_truncated_write"));
    }

    let detected = if existing.is_some() {
        Some(detect_text_encoding(&read_prefix(file_path)?))
    } else {
        None
    };

    let encoded = encode_text_content(content, detected.as_ref())?;

    paths::atomic_write(file_path, &encoded).map_err(|error| error.to_string())
}

/// A single path component supplied by the user: no separators, and not a
/// reference to the current or parent directory.
fn is_plain_entry_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', '\0'])
}

fn normalize_markdown_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_file_name = file_name.trim();

    if trimmed_file_name.is_empty() {
        return Err(i18n::t("explorer.enter_file_name"));
    }

    if trimmed_file_name.contains('/') || trimmed_file_name.contains('\\') {
        return Err(i18n::t("explorer.file_name_no_separator"));
    }
    if !is_plain_entry_name(trimmed_file_name) {
        return Err(i18n::t("explorer.invalid_name"));
    }
    if trimmed_file_name.to_ascii_lowercase().ends_with(".md")
        || trimmed_file_name.to_ascii_lowercase().ends_with(".mdx")
    {
        return Ok(trimmed_file_name.to_string());
    }

    Ok(format!("{trimmed_file_name}.md"))
}

fn normalize_directory_name(directory_name: &str) -> Result<String, String> {
    let trimmed_directory_name = directory_name.trim();

    if trimmed_directory_name.is_empty() {
        return Err(i18n::t("explorer.enter_directory_name"));
    }

    if trimmed_directory_name.contains('/') || trimmed_directory_name.contains('\\') {
        return Err(i18n::t("explorer.dir_name_no_separator"));
    }
    if !is_plain_entry_name(trimmed_directory_name) {
        return Err(i18n::t("explorer.invalid_name"));
    }

    Ok(trimmed_directory_name.to_string())
}

fn resolve_create_directory(root: &Path, selected_path: Option<&Path>) -> Result<PathBuf, String> {
    let candidate_directory = match selected_path {
        Some(path) if path.is_dir() => path.to_path_buf(),
        Some(path) => path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| i18n::t("explorer.cannot_determine_target_dir"))?,
        None => root.to_path_buf(),
    };

    // Validate against the resolved location, but hand back the directory in
    // the caller's own spelling: the tree and tabs key nodes by the path they
    // were opened with, and a symlinked workspace (or macOS's /var ->
    // /private/var, Windows' \\?\ prefix) would otherwise report new nodes
    // under a different path.
    paths::ensure_within(root, &candidate_directory)?;

    if !candidate_directory.is_dir() {
        return Err(i18n::t("explorer.target_dir_not_exist"));
    }

    Ok(candidate_directory)
}

pub fn read_directory_children(
    root: &Path,
    directory: &Path,
    show_hidden_files: bool,
    sort: bool,
) -> Result<Vec<ExplorerNode>, String> {
    paths::ensure_within(root, directory)?;

    let entries = read_directory_entries(directory, show_hidden_files, sort)?;
    let mut children = Vec::new();

    for entry in entries {
        let path = entry.path();
        let entry_type = entry.file_type().map_err(|error| error.to_string())?;

        if entry_type.is_dir() {
            let has_children = fs::read_dir(&path)
                .map_err(|error| error.to_string())?
                .next()
                .transpose()
                .map_err(|error| error.to_string())?
                .is_some();

            children.push(ExplorerNode {
                name: path_name(&path),
                path: path.to_string_lossy().into_owned(),
                relative_path: relative_path(root, &path),
                kind: ExplorerNodeKind::Directory,
                file_kind: None,
                has_children,
                loaded: false,
                children: Vec::new(),
            });

            continue;
        }

        if let Some(file_kind) = classify_file_kind(&path) {
            children.push(build_file_node(root, &path, file_kind));
        }
    }

    Ok(children)
}

pub fn build_workspace_root(
    root: &Path,
    show_hidden_files: bool,
    sort: bool,
) -> Result<ExplorerNode, String> {
    if !root.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let children = read_directory_children(root, root, show_hidden_files, sort)?;

    Ok(ExplorerNode {
        name: path_name(root),
        path: root.to_string_lossy().into_owned(),
        relative_path: String::new(),
        kind: ExplorerNodeKind::Directory,
        file_kind: None,
        has_children: !children.is_empty(),
        loaded: true,
        children,
    })
}

pub fn read_workspace_file(file_path: &Path) -> Result<FilePreview, String> {
    let metadata = fs::metadata(file_path).map_err(|error| error.to_string())?;
    let file_kind =
        classify_file_kind(file_path).ok_or_else(|| "Unsupported file type".to_string())?;

    match file_kind {
        ExplorerFileKind::Image => {
            if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
                return Err(i18n::tf(
                    "explorer.file_too_large",
                    &[
                        ("size", &(metadata.len() / (1024 * 1024)).to_string()),
                        (
                            "limit",
                            &(MAX_IMAGE_PREVIEW_BYTES / (1024 * 1024)).to_string(),
                        ),
                    ],
                ));
            }

            let bytes = fs::read(file_path).map_err(|error| error.to_string())?;

            Ok(FilePreview {
                file_kind,
                content: None,
                encoding: None,
                image_data_url: Some(format!(
                    "data:{};base64,{}",
                    image_mime_type(file_path),
                    STANDARD.encode(bytes)
                )),
                size: metadata.len(),
                truncated: false,
            })
        }
        ExplorerFileKind::Markdown | ExplorerFileKind::Text => {
            let (content, truncated, encoding) = read_text_preview(file_path)?;

            Ok(FilePreview {
                file_kind,
                content: Some(content),
                encoding: Some(encoding),
                image_data_url: None,
                size: metadata.len(),
                truncated,
            })
        }
    }
}

pub fn create_markdown_file(
    root_path: &Path,
    selected_path: Option<&Path>,
    file_name: &str,
) -> Result<ExplorerNode, String> {
    let target_directory = resolve_create_directory(root_path, selected_path)?;
    let normalized_file_name = normalize_markdown_file_name(file_name)?;
    let file_path = target_directory.join(normalized_file_name);

    fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&file_path)
        .map_err(|error| error.to_string())?;

    Ok(build_file_node(
        root_path,
        &file_path,
        ExplorerFileKind::Markdown,
    ))
}

pub fn create_workspace_directory(
    root_path: &Path,
    selected_path: Option<&Path>,
    directory_name: &str,
) -> Result<ExplorerNode, String> {
    let target_directory = resolve_create_directory(root_path, selected_path)?;
    let normalized_directory_name = normalize_directory_name(directory_name)?;
    let directory_path = target_directory.join(normalized_directory_name);

    fs::create_dir(&directory_path).map_err(|error| error.to_string())?;

    Ok(ExplorerNode {
        name: path_name(&directory_path),
        path: directory_path.to_string_lossy().into_owned(),
        relative_path: relative_path(root_path, &directory_path),
        kind: ExplorerNodeKind::Directory,
        file_kind: None,
        has_children: false,
        loaded: false,
        children: Vec::new(),
    })
}

fn ensure_existing_path(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    Err(i18n::tf(
        "explorer.path_not_exist",
        &[("path", &path.display().to_string())],
    ))
}

/// Decides whether the webview may read or write `path` through the file
/// commands, and returns the resolved path to use for the actual I/O.
///
/// Inside the workspace root any file is allowed, except version-control and
/// SSH internals (a rewritten `.git/config` or hook is code execution).
/// Outside it, only existing Markdown/text files may be written and only
/// Markdown, text and images may be read; that is what a link the user chose
/// to follow from a document needs, and nothing more.
pub fn authorize_file_access(
    root_path: Option<&Path>,
    path: &Path,
    write: bool,
) -> Result<PathBuf, String> {
    let resolved = paths::resolve_lenient(path)?;

    if let Some(canonical_root) = root_path.and_then(|root| root.canonicalize().ok()) {
        if let Ok(relative) = resolved.strip_prefix(&canonical_root) {
            return if paths::is_protected_path(relative) {
                Err(i18n::t("explorer.outside_workspace"))
            } else {
                Ok(resolved)
            };
        }
    }

    let allowed = match classify_file_kind(&resolved) {
        Some(ExplorerFileKind::Markdown | ExplorerFileKind::Text) => !write || resolved.is_file(),
        Some(ExplorerFileKind::Image) => !write,
        None => false,
    };

    if allowed {
        Ok(resolved)
    } else if write {
        Err(i18n::t("explorer.unsupported_write_type"))
    } else {
        Err(i18n::t("explorer.outside_workspace"))
    }
}

/// The directory of `file` when it is a Markdown document outside the
/// workspace. `file` must already be resolved by [`authorize_file_access`].
pub fn external_document_dir(root_path: Option<&Path>, file: &Path) -> Option<PathBuf> {
    if classify_file_kind(file) != Some(ExplorerFileKind::Markdown) {
        return None;
    }

    let inside_workspace = root_path
        .and_then(|root| root.canonicalize().ok())
        .is_some_and(|root| file.starts_with(root));

    if inside_workspace {
        None
    } else {
        file.parent().map(Path::to_path_buf)
    }
}

/// Fails unless `path` resolves (symlinks and `..` included) to the workspace
/// root or something inside it. Paths that do not exist yet are judged by
/// their nearest existing ancestor.
pub(crate) fn ensure_within_root(root_path: &Path, path: &Path) -> Result<(), String> {
    paths::ensure_within(root_path, path).map(|_| ())
}

fn ensure_parent_exists(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err(i18n::t("explorer.cannot_determine_target_dir"));
    };

    if parent.is_dir() {
        return Ok(());
    }

    Err(i18n::t("explorer.target_dir_not_exist"))
}

fn ensure_target_available(target_path: &Path) -> Result<(), String> {
    if !target_path.exists() {
        return Ok(());
    }

    Err(i18n::tf(
        "explorer.target_exists",
        &[("path", &target_path.display().to_string())],
    ))
}

/// If the target path already exists, resolve an available path by appending
/// ` (1)`, ` (2)`, etc. to the stem (same pattern as import external files).
/// Otherwise returns the original path unchanged.
fn resolve_available_path(target_path: &Path) -> PathBuf {
    if !target_path.exists() {
        return target_path.to_path_buf();
    }

    let parent = target_path.parent().unwrap_or(Path::new(""));
    let stem = target_path
        .file_stem()
        .map(|s| s.to_string_lossy())
        .unwrap_or_default()
        .to_string();
    let ext = target_path
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    let mut counter = 1;

    loop {
        let new_name = format!("{} ({}){}", stem, counter, ext);
        let new_path = parent.join(&new_name);

        if !new_path.exists() {
            break new_path;
        }

        counter += 1;
    }
}

fn copy_workspace_node_recursive(
    source_path: &Path,
    destination_path: &Path,
) -> Result<(), String> {
    let source_metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;

    if source_metadata.is_dir() {
        fs::create_dir_all(destination_path).map_err(|error| error.to_string())?;

        for entry in fs::read_dir(source_path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;

            // Links nested inside a copied folder are skipped: following them
            // could loop forever or pull in files from outside the workspace.
            if entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_symlink()
            {
                continue;
            }

            let child_source_path = entry.path();
            let child_destination_path = destination_path.join(entry.file_name());

            copy_workspace_node_recursive(&child_source_path, &child_destination_path)?;
        }

        return Ok(());
    }

    ensure_parent_exists(destination_path)?;
    fs::copy(source_path, destination_path).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn rename_workspace_node(
    root_path: &Path,
    target_path: &Path,
    new_name: &str,
) -> Result<(), String> {
    let target = paths::ensure_entry_within(root_path, target_path)?;
    ensure_existing_path(&target)?;

    let trimmed_name = new_name.trim();

    if trimmed_name.is_empty() {
        return Err(i18n::t("explorer.enter_name"));
    }

    if trimmed_name.contains('/') || trimmed_name.contains('\\') {
        return Err(i18n::t("explorer.name_no_separator"));
    }

    if !is_plain_entry_name(trimmed_name) {
        return Err(i18n::t("explorer.invalid_name"));
    }

    if target == paths::canonical_root_of(root_path)? {
        return Err(i18n::t("explorer.cannot_rename_root"));
    }

    let Some(parent) = target.parent() else {
        return Err(i18n::t("explorer.cannot_rename_root"));
    };

    let next_path = parent.join(trimmed_name);

    if next_path == target {
        return Ok(());
    }

    ensure_target_available(&next_path)?;
    fs::rename(target, next_path).map_err(|error| error.to_string())
}

pub fn delete_workspace_node(root_path: &Path, target_path: &Path) -> Result<(), String> {
    let target = paths::ensure_entry_within(root_path, target_path)?;

    if target == paths::canonical_root_of(root_path)? {
        return Err(i18n::t("explorer.cannot_delete_root"));
    }

    // `symlink_metadata` so a link is removed as a link and its target, which
    // may live outside the workspace, is never touched.
    let metadata = fs::symlink_metadata(&target).map_err(|_| {
        i18n::tf(
            "explorer.path_not_exist",
            &[("path", &target.display().to_string())],
        )
    })?;

    if metadata.is_dir() {
        fs::remove_dir_all(&target).map_err(|error| error.to_string())
    } else {
        fs::remove_file(&target)
            .or_else(|error| {
                // A directory symlink is removed with `remove_dir` on Windows.
                if metadata.file_type().is_symlink() {
                    fs::remove_dir(&target)
                } else {
                    Err(error)
                }
            })
            .map_err(|error| error.to_string())
    }
}

pub fn move_workspace_node(
    root_path: &Path,
    source_path: &Path,
    destination_directory: &Path,
) -> Result<(), String> {
    let source = paths::ensure_entry_within(root_path, source_path)?;
    let destination_directory = paths::ensure_within(root_path, destination_directory)?;
    ensure_existing_path(&source)?;
    ensure_existing_path(&destination_directory)?;

    if !destination_directory.is_dir() {
        return Err(i18n::t("explorer.paste_target_must_be_dir"));
    }

    if source == paths::canonical_root_of(root_path)? {
        return Err(i18n::t("explorer.cannot_move_root"));
    }

    if destination_directory == source {
        return Err(i18n::t("explorer.cannot_move_to_self"));
    }

    if source
        .parent()
        .is_some_and(|parent| parent == destination_directory)
    {
        return Ok(());
    }

    let source_is_dir = fs::symlink_metadata(&source)
        .map_err(|error| error.to_string())?
        .is_dir();

    if source_is_dir && destination_directory.starts_with(&source) {
        return Err(i18n::t("explorer.cannot_move_to_child"));
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| i18n::t("explorer.cannot_determine_source_name"))?;
    let destination_path = destination_directory.join(file_name);

    if destination_path == source {
        return Ok(());
    }

    ensure_parent_exists(&destination_path)?;
    ensure_target_available(&destination_path)?;

    fs::rename(source, destination_path).map_err(|error| error.to_string())
}

/// Allowed extensions for external file import (markdown & images only).
fn is_allowed_import_extension(path: &Path) -> bool {
    classify_file_kind(path)
        .is_some_and(|kind| matches!(kind, ExplorerFileKind::Markdown | ExplorerFileKind::Image))
}

pub fn import_external_file(
    root_path: &Path,
    destination_directory: &Path,
    source_path: &Path,
) -> Result<ExplorerNode, String> {
    if !source_path.exists() {
        return Err(i18n::tf(
            "explorer.source_not_exist",
            &[("path", &source_path.display().to_string())],
        ));
    }

    if !source_path.is_file() {
        return Err(i18n::tf(
            "explorer.only_import_files",
            &[("path", &source_path.display().to_string())],
        ));
    }

    if !is_allowed_import_extension(source_path) {
        return Err(i18n::tf(
            "explorer.unsupported_file_type",
            &[("path", &source_path.display().to_string())],
        ));
    }

    paths::ensure_within(root_path, destination_directory)?;

    if !destination_directory.is_dir() {
        return Err(i18n::t("explorer.target_dir_not_exist"));
    }

    let file_name = path_name(source_path);
    let dest_path = resolve_available_path(&destination_directory.join(&file_name));

    fs::copy(source_path, &dest_path).map_err(|error| {
        i18n::tf(
            "explorer.copy_file_failed",
            &[("error", &error.to_string())],
        )
    })?;

    let file_kind = classify_file_kind(&dest_path).unwrap_or(ExplorerFileKind::Text);

    Ok(build_file_node(root_path, &dest_path, file_kind))
}

pub fn copy_workspace_node(
    root_path: &Path,
    source_path: &Path,
    destination_directory: &Path,
) -> Result<(), String> {
    let source = paths::ensure_within(root_path, source_path)?;
    let destination_directory = paths::ensure_within(root_path, destination_directory)?;
    ensure_existing_path(&source)?;
    ensure_existing_path(&destination_directory)?;

    if !destination_directory.is_dir() {
        return Err(i18n::t("explorer.paste_target_must_be_dir"));
    }

    if source == paths::canonical_root_of(root_path)? {
        return Err(i18n::t("explorer.cannot_copy_root"));
    }

    let source_metadata = fs::metadata(&source).map_err(|error| error.to_string())?;

    if source_metadata.is_dir() && destination_directory.starts_with(&source) {
        return Err(i18n::t("explorer.cannot_copy_to_child"));
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| i18n::t("explorer.cannot_determine_source_name"))?;
    let destination_path = destination_directory.join(file_name);

    ensure_parent_exists(&destination_path)?;
    let resolved_path = resolve_available_path(&destination_path);

    copy_workspace_node_recursive(&source, &resolved_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── classify_file_kind ──────────────────────────────────────────

    #[test]
    fn classify_file_kind_image_png() {
        let result = classify_file_kind(Path::new("image.png"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    #[test]
    fn classify_file_kind_image_jpg() {
        let result = classify_file_kind(Path::new("photo.jpg"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    #[test]
    fn classify_file_kind_image_jpeg() {
        let result = classify_file_kind(Path::new("photo.jpeg"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    #[test]
    fn classify_file_kind_image_gif() {
        let result = classify_file_kind(Path::new("anim.gif"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    #[test]
    fn classify_file_kind_image_webp() {
        let result = classify_file_kind(Path::new("img.webp"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    #[test]
    fn classify_file_kind_image_bmp() {
        let result = classify_file_kind(Path::new("img.bmp"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    #[test]
    fn classify_file_kind_image_svg() {
        let result = classify_file_kind(Path::new("graphic.svg"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    #[test]
    fn classify_file_kind_markdown_md() {
        let result = classify_file_kind(Path::new("doc.md"));
        assert_eq!(result, Some(ExplorerFileKind::Markdown));
    }

    #[test]
    fn classify_file_kind_markdown_markdown() {
        let result = classify_file_kind(Path::new("doc.markdown"));
        assert_eq!(result, Some(ExplorerFileKind::Markdown));
    }

    #[test]
    fn classify_file_kind_markdown_mdx() {
        let result = classify_file_kind(Path::new("doc.mdx"));
        assert_eq!(result, Some(ExplorerFileKind::Markdown));
    }

    #[test]
    fn classify_file_kind_text_txt() {
        let result = classify_file_kind(Path::new("notes.txt"));
        assert_eq!(result, Some(ExplorerFileKind::Text));
    }

    #[test]
    fn classify_file_kind_unknown() {
        let result = classify_file_kind(Path::new("script.js"));
        assert_eq!(result, None);
    }

    #[test]
    fn classify_file_kind_no_extension() {
        let result = classify_file_kind(Path::new("Makefile"));
        assert_eq!(result, None);
    }

    #[test]
    fn classify_file_kind_case_insensitive() {
        let result = classify_file_kind(Path::new("Photo.PNG"));
        assert_eq!(result, Some(ExplorerFileKind::Image));
    }

    // ─── path_name ───────────────────────────────────────────────────

    #[test]
    fn path_name_normal() {
        assert_eq!(path_name(Path::new("/home/user/file.md")), "file.md");
    }

    #[test]
    fn path_name_root() {
        assert_eq!(path_name(Path::new("/")), "/");
    }

    #[test]
    fn path_name_no_parent() {
        assert_eq!(path_name(Path::new("file.txt")), "file.txt");
    }

    // ─── relative_path ───────────────────────────────────────────────

    #[test]
    fn relative_path_normal() {
        let root = Path::new("/workspace");
        let path = Path::new("/workspace/src/main.rs");
        assert_eq!(relative_path(root, path), "src/main.rs");
    }

    #[test]
    fn relative_path_same_as_root() {
        let root = Path::new("/workspace");
        assert_eq!(relative_path(root, root), "");
    }

    // ─── detect_text_encoding ────────────────────────────────────────

    #[test]
    fn detect_text_encoding_utf8_no_bom() {
        let bytes = b"hello world";
        let detected = detect_text_encoding(bytes);
        assert!(!detected.has_bom);
        assert_eq!(detected.encoding, UTF_8);
    }

    #[test]
    fn detect_text_encoding_utf8_with_bom() {
        let bytes = &[0xEF, 0xBB, 0xBF, b'h', b'i'];
        let detected = detect_text_encoding(bytes);
        assert!(detected.has_bom);
        assert_eq!(detected.encoding, UTF_8);
    }

    #[test]
    fn detect_text_encoding_utf16le_with_bom() {
        let bytes = &[0xFF, 0xFE, b'h', 0x00, b'i', 0x00];
        let detected = detect_text_encoding(bytes);
        assert!(detected.has_bom);
        assert_eq!(detected.encoding, UTF_16LE);
    }

    #[test]
    fn detect_text_encoding_utf16be_with_bom() {
        let bytes = &[0xFE, 0xFF, 0x00, b'h', 0x00, b'i'];
        let detected = detect_text_encoding(bytes);
        assert!(detected.has_bom);
        assert_eq!(detected.encoding, UTF_16BE);
    }

    #[test]
    fn detect_text_encoding_utf8_no_bom_ascii() {
        let bytes = b"Hello, \xe4\xbd\xa0\xe5\xa5\xbd"; // "你好" in UTF-8
        let detected = detect_text_encoding(bytes);
        assert!(!detected.has_bom);
        assert_eq!(detected.encoding, UTF_8);
    }

    // ─── encode_text_content ─────────────────────────────────────────

    #[test]
    fn encode_text_content_utf16le_round_trips() {
        let detected = DetectedTextEncoding {
            encoding: UTF_16LE,
            has_bom: true,
        };

        let bytes = encode_text_content("你好 hi", Some(&detected)).unwrap();

        assert_eq!(&bytes[..2], &[0xFF, 0xFE]);
        assert_eq!(decode_text_bytes(&bytes, &detected), "你好 hi");
    }

    #[test]
    fn encode_text_content_utf16be_round_trips() {
        let detected = DetectedTextEncoding {
            encoding: UTF_16BE,
            has_bom: true,
        };

        let bytes = encode_text_content("你好 hi", Some(&detected)).unwrap();

        assert_eq!(&bytes[..2], &[0xFE, 0xFF]);
        assert_eq!(decode_text_bytes(&bytes, &detected), "你好 hi");
    }

    #[test]
    fn encode_text_content_utf16le_writes_code_units_not_utf8() {
        let detected = DetectedTextEncoding {
            encoding: UTF_16LE,
            has_bom: false,
        };

        let bytes = encode_text_content("hi", Some(&detected)).unwrap();

        // encoding_rs has no UTF-16 encoder and would emit the UTF-8 bytes
        // [104, 105] here, corrupting the file behind its BOM.
        assert_eq!(bytes, vec![b'h', 0x00, b'i', 0x00]);
    }

    // ─── write_workspace_file ────────────────────────────────────────

    #[test]
    fn write_workspace_file_refuses_to_truncate_an_oversized_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.md");
        let full = "x".repeat(MAX_TEXT_PREVIEW_BYTES + 1024);
        std::fs::write(&path, &full).unwrap();

        // This is what saving a truncated preview would do.
        let result = write_workspace_file(&path, &full[..MAX_TEXT_PREVIEW_BYTES]);

        assert!(result.is_err());
        assert_eq!(
            std::fs::metadata(&path).unwrap().len(),
            full.len() as u64,
            "the oversized file must be left untouched"
        );
    }

    #[test]
    fn write_workspace_file_still_shrinks_small_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("small.md");
        std::fs::write(&path, b"hello world").unwrap();

        write_workspace_file(&path, "hi").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hi");
    }

    // ─── decode_text_bytes ───────────────────────────────────────────

    #[test]
    fn decode_text_bytes_utf8_no_bom() {
        let bytes = b"hello";
        let detected = DetectedTextEncoding {
            encoding: UTF_8,
            has_bom: false,
        };
        assert_eq!(decode_text_bytes(bytes, &detected), "hello");
    }

    #[test]
    fn decode_text_bytes_utf8_with_bom() {
        let bytes = &[0xEF, 0xBB, 0xBF, b'h', b'i'];
        let detected = DetectedTextEncoding {
            encoding: UTF_8,
            has_bom: true,
        };
        assert_eq!(decode_text_bytes(bytes, &detected), "hi");
    }

    #[test]
    fn decode_text_bytes_utf16le_with_bom() {
        // "hi" in UTF-16LE with BOM
        let bytes = &[0xFF, 0xFE, b'h', 0x00, b'i', 0x00];
        let detected = DetectedTextEncoding {
            encoding: UTF_16LE,
            has_bom: true,
        };
        assert_eq!(decode_text_bytes(bytes, &detected), "hi");
    }

    #[test]
    fn decode_text_bytes_utf16be_with_bom() {
        // "hi" in UTF-16BE with BOM
        let bytes = &[0xFE, 0xFF, 0x00, b'h', 0x00, b'i'];
        let detected = DetectedTextEncoding {
            encoding: UTF_16BE,
            has_bom: true,
        };
        assert_eq!(decode_text_bytes(bytes, &detected), "hi");
    }

    // ─── bom_bytes_for_encoding ──────────────────────────────────────

    #[test]
    fn bom_bytes_for_encoding_utf8() {
        assert_eq!(bom_bytes_for_encoding(UTF_8), Some(&[0xEF, 0xBB, 0xBF][..]));
    }

    #[test]
    fn bom_bytes_for_encoding_utf16le() {
        assert_eq!(bom_bytes_for_encoding(UTF_16LE), Some(&[0xFF, 0xFE][..]));
    }

    #[test]
    fn bom_bytes_for_encoding_utf16be() {
        assert_eq!(bom_bytes_for_encoding(UTF_16BE), Some(&[0xFE, 0xFF][..]));
    }

    // ─── read_text_preview ───────────────────────────────────────────

    #[test]
    fn read_text_preview_small_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, b"hello world").unwrap();

        let (content, truncated, encoding) = read_text_preview(&path).unwrap();
        assert_eq!(content, "hello world");
        assert!(!truncated);
        assert_eq!(encoding, "UTF-8");
    }

    #[test]
    fn read_text_preview_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty.txt");
        std::fs::write(&path, b"").unwrap();

        let (content, truncated, _encoding) = read_text_preview(&path).unwrap();
        assert_eq!(content, "");
        assert!(!truncated);
    }

    #[test]
    fn read_text_preview_missing_file() {
        let path = Path::new("/nonexistent/file.txt");
        let result = read_text_preview(path);
        assert!(result.is_err());
    }

    // ─── copy_workspace_node ────────────────────────────────────────

    #[test]
    fn copy_workspace_node_copies_file_and_keeps_source() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        let source_directory = root.join("src");
        let destination_directory = root.join("docs");
        let source_file = source_directory.join("readme.md");
        let destination_file = destination_directory.join("readme.md");

        std::fs::create_dir_all(&source_directory).unwrap();
        std::fs::create_dir_all(&destination_directory).unwrap();
        std::fs::write(&source_file, b"hello copy").unwrap();

        copy_workspace_node(&root, &source_file, &destination_directory).unwrap();

        assert!(source_file.exists());
        assert_eq!(
            std::fs::read_to_string(&destination_file).unwrap(),
            "hello copy"
        );
    }

    #[test]
    fn copy_workspace_node_copies_directory_recursively() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        let source_directory = root.join("assets/icons");
        let destination_directory = root.join("archive");
        let source_file = source_directory.join("logo.svg");
        let copied_file = destination_directory.join("assets/icons/logo.svg");

        std::fs::create_dir_all(&source_directory).unwrap();
        std::fs::create_dir_all(&destination_directory).unwrap();
        std::fs::write(&source_file, b"<svg />").unwrap();

        copy_workspace_node(&root, &root.join("assets"), &destination_directory).unwrap();

        assert!(root.join("assets").exists());
        assert_eq!(std::fs::read_to_string(&copied_file).unwrap(), "<svg />");
    }

    // ─── normalize_markdown_file_name ────────────────────────────────

    #[test]
    fn normalize_markdown_file_name_adds_extension() {
        let result = normalize_markdown_file_name("mydoc").unwrap();
        assert_eq!(result, "mydoc.md");
    }

    #[test]
    fn normalize_markdown_file_name_keeps_md() {
        let result = normalize_markdown_file_name("doc.md").unwrap();
        assert_eq!(result, "doc.md");
    }

    #[test]
    fn normalize_markdown_file_name_case_insensitive_md() {
        let result = normalize_markdown_file_name("doc.MD").unwrap();
        assert_eq!(result, "doc.MD");
    }

    #[test]
    fn normalize_markdown_file_name_trimmed() {
        let result = normalize_markdown_file_name("  mydoc  ").unwrap();
        assert_eq!(result, "mydoc.md");
    }

    #[test]
    fn normalize_markdown_file_name_empty() {
        let result = normalize_markdown_file_name("");
        assert!(result.is_err());
    }

    #[test]
    fn normalize_markdown_file_name_whitespace_only() {
        let result = normalize_markdown_file_name("   ");
        assert!(result.is_err());
    }

    #[test]
    fn normalize_markdown_file_name_contains_slash() {
        let result = normalize_markdown_file_name("a/b");
        assert!(result.is_err());
    }

    // ─── normalize_directory_name ────────────────────────────────────

    #[test]
    fn normalize_directory_name_normal() {
        let result = normalize_directory_name("mydir").unwrap();
        assert_eq!(result, "mydir");
    }

    #[test]
    fn normalize_directory_name_trimmed() {
        let result = normalize_directory_name("  mydir  ").unwrap();
        assert_eq!(result, "mydir");
    }

    #[test]
    fn normalize_directory_name_empty() {
        let result = normalize_directory_name("");
        assert!(result.is_err());
    }

    #[test]
    fn normalize_directory_name_contains_slash() {
        let result = normalize_directory_name("a/b");
        assert!(result.is_err());
    }

    // ─── image_mime_type ─────────────────────────────────────────────

    #[test]
    fn image_mime_type_png() {
        assert_eq!(image_mime_type(Path::new("img.png")), "image/png");
    }

    #[test]
    fn image_mime_type_jpg() {
        assert_eq!(image_mime_type(Path::new("img.jpg")), "image/jpeg");
    }

    #[test]
    fn image_mime_type_jpeg() {
        assert_eq!(image_mime_type(Path::new("img.jpeg")), "image/jpeg");
    }

    #[test]
    fn image_mime_type_gif() {
        assert_eq!(image_mime_type(Path::new("img.gif")), "image/gif");
    }

    #[test]
    fn image_mime_type_webp() {
        assert_eq!(image_mime_type(Path::new("img.webp")), "image/webp");
    }

    #[test]
    fn image_mime_type_bmp() {
        assert_eq!(image_mime_type(Path::new("img.bmp")), "image/bmp");
    }

    #[test]
    fn image_mime_type_svg() {
        assert_eq!(image_mime_type(Path::new("img.svg")), "image/svg+xml");
    }

    #[test]
    fn image_mime_type_unknown() {
        assert_eq!(
            image_mime_type(Path::new("img.unknown")),
            "application/octet-stream"
        );
    }

    #[test]
    fn image_mime_type_no_extension() {
        assert_eq!(
            image_mime_type(Path::new("Makefile")),
            "application/octet-stream"
        );
    }

    // ─── path containment ────────────────────────────────────────────

    fn workspace_with_outside() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ws");
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(root.join("sub")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        (dir, root, outside)
    }

    #[test]
    fn ensure_within_root_rejects_dot_dot_escapes() {
        let (_guard, root, _outside) = workspace_with_outside();

        assert!(ensure_within_root(&root, &root.join("sub/../../outside")).is_err());
        assert!(ensure_within_root(&root, &root.join("sub/../sub")).is_ok());
    }

    #[test]
    fn delete_refuses_the_workspace_root_however_it_is_spelled() {
        let (_guard, root, _outside) = workspace_with_outside();

        for spelling in [root.clone(), root.join("."), root.join("sub/..")] {
            let result = delete_workspace_node(&root, &spelling);

            assert!(result.is_err(), "{spelling:?} must not be deletable");
            assert!(root.join("sub").exists(), "workspace contents must survive");
        }
    }

    #[test]
    fn delete_refuses_paths_that_escape_through_dot_dot() {
        let (_guard, root, outside) = workspace_with_outside();
        std::fs::write(outside.join("keep.md"), b"x").unwrap();

        let result = delete_workspace_node(&root, &root.join("sub/../../outside/keep.md"));

        assert!(result.is_err());
        assert!(outside.join("keep.md").exists());
    }

    #[test]
    fn rename_and_move_and_copy_refuse_escapes() {
        let (_guard, root, outside) = workspace_with_outside();
        std::fs::write(root.join("a.md"), b"x").unwrap();
        std::fs::write(outside.join("b.md"), b"y").unwrap();
        let sneaky = root.join("sub/../../outside/b.md");

        assert!(rename_workspace_node(&root, &sneaky, "c.md").is_err());
        assert!(move_workspace_node(&root, &root.join("a.md"), &root.join("../outside")).is_err());
        assert!(move_workspace_node(&root, &sneaky, &root.join("sub")).is_err());
        assert!(copy_workspace_node(&root, &sneaky, &root.join("sub")).is_err());
        assert!(copy_workspace_node(&root, &root.join("a.md"), &root.join("../outside")).is_err());
        assert!(outside.join("b.md").exists());
        assert!(!outside.join("a.md").exists());
    }

    #[test]
    fn rename_rejects_dot_dot_as_a_new_name() {
        let (_guard, root, _outside) = workspace_with_outside();
        std::fs::write(root.join("a.md"), b"x").unwrap();

        assert!(rename_workspace_node(&root, &root.join("a.md"), "..").is_err());
        assert!(rename_workspace_node(&root, &root.join("a.md"), ".").is_err());
    }

    #[test]
    fn create_commands_refuse_a_selected_path_outside_the_root() {
        let (_guard, root, outside) = workspace_with_outside();

        assert!(create_markdown_file(&root, Some(&outside), "evil").is_err());
        assert!(create_workspace_directory(&root, Some(&outside), "evil").is_err());
        assert!(
            create_markdown_file(&root, Some(&root.join("sub/../../outside")), "evil").is_err()
        );
        assert!(!outside.join("evil.md").exists());
        assert!(!outside.join("evil").exists());
    }

    #[test]
    fn create_commands_work_inside_the_root() {
        let (_guard, root, _outside) = workspace_with_outside();

        create_markdown_file(&root, Some(&root.join("sub")), "note").unwrap();
        create_workspace_directory(&root, None, "dir").unwrap();

        assert!(root.join("sub/note.md").exists());
        assert!(root.join("dir").is_dir());
    }

    #[test]
    fn create_rejects_dot_names() {
        assert!(normalize_markdown_file_name("..").is_err());
        assert!(normalize_directory_name("..").is_err());
        assert!(normalize_directory_name(".").is_err());
    }

    #[test]
    fn read_directory_children_refuses_directories_outside_the_root() {
        let (_guard, root, outside) = workspace_with_outside();
        std::fs::write(outside.join("x.md"), b"x").unwrap();

        assert!(read_directory_children(&root, &outside, false, true).is_err());
        assert!(read_directory_children(&root, &root.join("sub"), false, true).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_inside_the_workspace_cannot_reach_outside() {
        let (_guard, root, outside) = workspace_with_outside();
        std::fs::write(outside.join("secret.md"), b"s").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();

        assert!(
            copy_workspace_node(&root, &root.join("link/secret.md"), &root.join("sub")).is_err()
        );
        assert!(delete_workspace_node(&root, &root.join("link/secret.md")).is_err());
        assert!(outside.join("secret.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn deleting_a_symlink_removes_the_link_not_its_target() {
        let (_guard, root, outside) = workspace_with_outside();
        std::fs::write(outside.join("keep.md"), b"s").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();

        delete_workspace_node(&root, &root.join("link")).unwrap();

        assert!(std::fs::symlink_metadata(root.join("link")).is_err());
        assert!(outside.join("keep.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn copying_a_directory_skips_nested_symlinks() {
        let (_guard, root, outside) = workspace_with_outside();
        std::fs::write(outside.join("secret.md"), b"s").unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/a.md"), b"a").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("src/link")).unwrap();
        // A link back to the parent would recurse forever if followed.
        std::os::unix::fs::symlink(root.join("src"), root.join("src/loop")).unwrap();

        copy_workspace_node(&root, &root.join("src"), &root.join("sub")).unwrap();

        assert!(root.join("sub/src/a.md").exists());
        assert!(!root.join("sub/src/link").exists());
        assert!(!root.join("sub/src/loop").exists());
    }

    // ─── authorize_file_access ───────────────────────────────────────

    #[test]
    fn file_access_inside_the_root_allows_any_extension_except_protected_dirs() {
        let (_guard, root, _outside) = workspace_with_outside();
        std::fs::create_dir_all(root.join(".git/hooks")).unwrap();

        assert!(authorize_file_access(Some(&root), &root.join("sub/new.json"), true).is_ok());
        assert!(
            authorize_file_access(Some(&root), &root.join(".git/hooks/pre-commit"), true).is_err()
        );
        assert!(authorize_file_access(Some(&root), &root.join(".git/config"), false).is_err());
    }

    #[test]
    fn only_markdown_outside_the_workspace_has_a_document_directory() {
        let (_guard, root, outside) = workspace_with_outside();
        for name in ["note.md", "pic.png", "plain.txt"] {
            std::fs::write(outside.join(name), b"x").unwrap();
        }
        std::fs::write(root.join("inside.md"), b"x").unwrap();
        let resolved = |path: PathBuf| path.canonicalize().unwrap();

        assert_eq!(
            external_document_dir(Some(&root), &resolved(outside.join("note.md"))),
            Some(resolved(outside.clone()))
        );
        // Without a workspace every Markdown file is external.
        assert!(external_document_dir(None, &resolved(outside.join("note.md"))).is_some());
        // Inside the workspace the workspace rules already apply.
        assert_eq!(
            external_document_dir(Some(&root), &resolved(root.join("inside.md"))),
            None
        );
        // Images and text are not documents that reference other files.
        assert_eq!(
            external_document_dir(Some(&root), &resolved(outside.join("pic.png"))),
            None
        );
        assert_eq!(
            external_document_dir(Some(&root), &resolved(outside.join("plain.txt"))),
            None
        );
    }

    #[test]
    fn file_access_outside_the_root_is_limited_to_documents() {
        let (_guard, root, outside) = workspace_with_outside();
        std::fs::write(outside.join("note.md"), b"n").unwrap();
        std::fs::write(outside.join("pic.png"), b"p").unwrap();
        std::fs::write(outside.join("id_rsa"), b"k").unwrap();
        std::fs::write(outside.join("config.json"), b"{}").unwrap();

        assert!(authorize_file_access(Some(&root), &outside.join("note.md"), false).is_ok());
        assert!(authorize_file_access(Some(&root), &outside.join("pic.png"), false).is_ok());
        assert!(authorize_file_access(Some(&root), &outside.join("id_rsa"), false).is_err());
        assert!(authorize_file_access(Some(&root), &outside.join("config.json"), false).is_err());

        // Existing documents may be saved; nothing else may be written.
        assert!(authorize_file_access(Some(&root), &outside.join("note.md"), true).is_ok());
        assert!(authorize_file_access(Some(&root), &outside.join("pic.png"), true).is_err());
        assert!(authorize_file_access(Some(&root), &outside.join("new.md"), true).is_err());
        assert!(authorize_file_access(Some(&root), &outside.join("id_rsa"), true).is_err());
    }

    #[test]
    fn file_access_without_a_workspace_is_document_only() {
        let (_guard, _root, outside) = workspace_with_outside();
        std::fs::write(outside.join("note.md"), b"n").unwrap();

        assert!(authorize_file_access(None, &outside.join("note.md"), false).is_ok());
        assert!(authorize_file_access(None, &outside.join("other"), false).is_err());
    }

    // ─── write_workspace_file / read prefix ──────────────────────────

    #[test]
    fn write_workspace_file_refuses_any_write_to_an_oversized_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.md");
        let full = "x".repeat(MAX_TEXT_PREVIEW_BYTES + 1024);
        std::fs::write(&path, &full).unwrap();

        // Even content as long as the original would destroy what the
        // editor never showed.
        let longer = "y".repeat(full.len() + 10);
        assert!(write_workspace_file(&path, &longer).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), full);
    }

    #[test]
    fn write_workspace_file_leaves_no_temp_files_and_keeps_utf16() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.md");
        std::fs::write(&path, [0xFF, 0xFE, b'h', 0x00]).unwrap();

        write_workspace_file(&path, "hi").unwrap();

        assert_eq!(
            std::fs::read(&path).unwrap(),
            vec![0xFF, 0xFE, b'h', 0x00, b'i', 0x00]
        );
        let names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name())
            .collect();
        assert_eq!(names.len(), 1, "unexpected files: {names:?}");
    }

    #[test]
    fn read_text_preview_reads_only_the_preview_window_of_a_huge_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("huge.txt");
        std::fs::write(&path, "a".repeat(MAX_TEXT_PREVIEW_BYTES * 3)).unwrap();

        let (content, truncated, _) = read_text_preview(&path).unwrap();

        assert!(truncated);
        assert_eq!(content.len(), MAX_TEXT_PREVIEW_BYTES);
    }

    #[test]
    fn oversized_images_are_refused_instead_of_inlined() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.png");
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_IMAGE_PREVIEW_BYTES + 1).unwrap();

        assert!(read_workspace_file(&path).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn created_nodes_keep_the_callers_spelling_of_the_root() {
        // A workspace opened through a symlink (or macOS's /var -> /private/var,
        // Windows' \\?\ prefix) must not have its new nodes reported under a
        // different spelling, or the tree and tab bookkeeping stops matching.
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real");
        let linked = dir.path().join("linked");
        std::fs::create_dir_all(real.join("sub")).unwrap();
        std::os::unix::fs::symlink(&real, &linked).unwrap();

        let file = create_markdown_file(&linked, Some(&linked.join("sub")), "note").unwrap();
        let folder = create_workspace_directory(&linked, None, "dir").unwrap();

        assert!(
            file.path.starts_with(linked.to_str().unwrap()),
            "{}",
            file.path
        );
        assert_eq!(file.relative_path, "sub/note.md");
        assert!(
            folder.path.starts_with(linked.to_str().unwrap()),
            "{}",
            folder.path
        );
        assert_eq!(folder.relative_path, "dir");
    }

    #[cfg(unix)]
    #[test]
    fn imported_nodes_keep_the_callers_spelling_of_the_root() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real");
        let linked = dir.path().join("linked");
        std::fs::create_dir_all(real.join("sub")).unwrap();
        std::os::unix::fs::symlink(&real, &linked).unwrap();
        let source = dir.path().join("pic.png");
        std::fs::write(&source, b"png").unwrap();

        let node = import_external_file(&linked, &linked.join("sub"), &source).unwrap();

        assert!(
            node.path.starts_with(linked.to_str().unwrap()),
            "{}",
            node.path
        );
        assert_eq!(node.relative_path, "sub/pic.png");
    }

    #[cfg(unix)]
    #[test]
    fn move_copy_rename_work_when_the_workspace_is_opened_through_a_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real");
        let linked = dir.path().join("linked");
        std::fs::create_dir_all(real.join("a")).unwrap();
        std::fs::create_dir_all(real.join("b")).unwrap();
        std::fs::write(real.join("a/x.md"), b"x").unwrap();
        std::os::unix::fs::symlink(&real, &linked).unwrap();

        copy_workspace_node(&linked, &linked.join("a/x.md"), &linked.join("b")).unwrap();
        rename_workspace_node(&linked, &linked.join("b/x.md"), "renamed.md").unwrap();
        move_workspace_node(&linked, &linked.join("a/x.md"), &linked.join("b")).unwrap();

        assert!(real.join("b/x.md").exists());
        assert!(real.join("b/renamed.md").exists());
        assert!(!real.join("a/x.md").exists());
        // The root itself is still protected under its symlinked spelling.
        assert!(delete_workspace_node(&linked, &linked).is_err());
        assert!(real.join("b").exists());
    }

    #[test]
    fn moving_a_folder_into_its_own_child_is_still_refused() {
        let (_guard, root, _outside) = workspace_with_outside();
        std::fs::create_dir_all(root.join("a/inner")).unwrap();

        assert!(move_workspace_node(&root, &root.join("a"), &root.join("a/inner")).is_err());
        assert!(copy_workspace_node(&root, &root.join("a"), &root.join("a/inner")).is_err());
        assert!(root.join("a/inner").is_dir());
    }

    #[test]
    fn moving_into_the_current_parent_is_a_no_op() {
        let (_guard, root, _outside) = workspace_with_outside();
        std::fs::write(root.join("sub/x.md"), b"x").unwrap();

        move_workspace_node(&root, &root.join("sub/x.md"), &root.join("sub")).unwrap();

        assert!(root.join("sub/x.md").exists());
    }
}
