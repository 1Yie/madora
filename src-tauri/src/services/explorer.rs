use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chardetng::EncodingDetector;
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};

use crate::models::explorer::{ExplorerFileKind, ExplorerNode, ExplorerNodeKind, FilePreview};

const MAX_TEXT_PREVIEW_BYTES: usize = 512 * 1024;

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

fn sorted_directory_entries(directory: &Path, show_hidden_files: bool) -> Result<Vec<fs::DirEntry>, String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if !show_hidden_files {
        entries.retain(|entry| {
            !entry
                .file_name()
                .to_string_lossy()
                .starts_with('.')
        });
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

        right_is_dir.cmp(&left_is_dir).then_with(|| {
            left.file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .cmp(&right.file_name().to_string_lossy().to_ascii_lowercase())
        })
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

fn encode_text_content(
    content: &str,
    detected: Option<&DetectedTextEncoding>,
) -> Result<Vec<u8>, String> {
    let Some(detected) = detected else {
        return Ok(content.as_bytes().to_vec());
    };

    let (encoded, _, had_errors) = detected.encoding.encode(content);

    if had_errors {
        return Err(format!(
            "当前内容无法按 {} 编码保存",
            detected.encoding.name()
        ));
    }

    let mut bytes = Vec::new();

    if detected.has_bom {
        if let Some(bom) = bom_bytes_for_encoding(detected.encoding) {
            bytes.extend_from_slice(bom);
        }
    }

    bytes.extend_from_slice(encoded.as_ref());
    Ok(bytes)
}

fn read_text_preview(path: &Path) -> Result<(String, bool, String), String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
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
    let detected = if file_path.exists() {
        let bytes = fs::read(file_path).map_err(|error| error.to_string())?;
        Some(detect_text_encoding(&bytes))
    } else {
        None
    };

    let encoded = encode_text_content(content, detected.as_ref())?;

    fs::write(file_path, encoded).map_err(|error| error.to_string())
}

fn normalize_markdown_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_file_name = file_name.trim();

    if trimmed_file_name.is_empty() {
        return Err("请输入文件名".to_string());
    }

    if trimmed_file_name.contains('/') || trimmed_file_name.contains('\\') {
        return Err("文件名不能包含路径分隔符".to_string());
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
        return Err("请输入文件夹名称".to_string());
    }

    if trimmed_directory_name.contains('/') || trimmed_directory_name.contains('\\') {
        return Err("文件夹名称不能包含路径分隔符".to_string());
    }

    Ok(trimmed_directory_name.to_string())
}

fn resolve_create_directory(root: &Path, selected_path: Option<&Path>) -> Result<PathBuf, String> {
    let candidate_directory = match selected_path {
        Some(path) if path.is_dir() => path.to_path_buf(),
        Some(path) => path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "无法确定新文档的目标目录".to_string())?,
        None => root.to_path_buf(),
    };

    if !candidate_directory.is_dir() {
        return Err("目标目录不存在".to_string());
    }

    Ok(candidate_directory)
}

pub fn read_directory_children(
    root: &Path,
    directory: &Path,
    show_hidden_files: bool,
) -> Result<Vec<ExplorerNode>, String> {
    let entries = sorted_directory_entries(directory, show_hidden_files)?;
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

pub fn build_workspace_root(root: &Path, show_hidden_files: bool) -> Result<ExplorerNode, String> {
    if !root.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let children = read_directory_children(root, root, show_hidden_files)?;

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

    Err(format!("路径不存在: {}", path.display()))
}

fn ensure_within_root(root_path: &Path, path: &Path) -> Result<(), String> {
    if path == root_path || path.starts_with(root_path) {
        return Ok(());
    }

    Err("不能操作工作区之外的文件或文件夹".to_string())
}

fn ensure_parent_exists(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err("无法确定目标目录".to_string());
    };

    if parent.is_dir() {
        return Ok(());
    }

    Err("目标目录不存在".to_string())
}

fn ensure_target_available(target_path: &Path) -> Result<(), String> {
    if !target_path.exists() {
        return Ok(());
    }

    Err(format!("目标已存在: {}", target_path.display()))
}

fn copy_workspace_node_recursive(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    let source_metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;

    if source_metadata.is_dir() {
        fs::create_dir_all(destination_path).map_err(|error| error.to_string())?;

        for entry in fs::read_dir(source_path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
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
    ensure_within_root(root_path, target_path)?;
    ensure_existing_path(target_path)?;

    let trimmed_name = new_name.trim();

    if trimmed_name.is_empty() {
        return Err("请输入名称".to_string());
    }

    if trimmed_name.contains('/') || trimmed_name.contains('\\') {
        return Err("名称不能包含路径分隔符".to_string());
    }

    let Some(parent) = target_path.parent() else {
        return Err("无法重命名工作区根目录".to_string());
    };

    let next_path = parent.join(trimmed_name);

    if next_path == target_path {
        return Ok(());
    }

    ensure_target_available(&next_path)?;
    fs::rename(target_path, next_path).map_err(|error| error.to_string())
}

pub fn delete_workspace_node(root_path: &Path, target_path: &Path) -> Result<(), String> {
    ensure_within_root(root_path, target_path)?;
    ensure_existing_path(target_path)?;

    if target_path == root_path {
        return Err("不能删除工作区根目录".to_string());
    }

    let metadata = fs::metadata(target_path).map_err(|error| error.to_string())?;

    if metadata.is_dir() {
        fs::remove_dir_all(target_path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(target_path).map_err(|error| error.to_string())
    }
}

pub fn move_workspace_node(
    root_path: &Path,
    source_path: &Path,
    destination_directory: &Path,
) -> Result<(), String> {
    ensure_within_root(root_path, source_path)?;
    ensure_within_root(root_path, destination_directory)?;
    ensure_existing_path(source_path)?;
    ensure_existing_path(destination_directory)?;

    if !destination_directory.is_dir() {
        return Err("粘贴目标必须是文件夹".to_string());
    }

    if source_path == root_path {
        return Err("不能移动工作区根目录".to_string());
    }

    if destination_directory == source_path {
        return Err("不能移动到自身".to_string());
    }

    if source_path.starts_with(destination_directory) {
        let source_parent = source_path.parent();

        if source_parent.is_some_and(|parent| parent == destination_directory) {
            return Ok(());
        }
    }

    let source_metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;

    if source_metadata.is_dir() && destination_directory.starts_with(source_path) {
        return Err("不能将文件夹移动到它自己的子目录中".to_string());
    }

    let file_name = source_path
        .file_name()
        .ok_or_else(|| "无法确定源文件名".to_string())?;
    let destination_path = destination_directory.join(file_name);

    if destination_path == source_path {
        return Ok(());
    }

    ensure_parent_exists(&destination_path)?;
    ensure_target_available(&destination_path)?;

    fs::rename(source_path, destination_path).map_err(|error| error.to_string())
}

pub fn copy_workspace_node(
    root_path: &Path,
    source_path: &Path,
    destination_directory: &Path,
) -> Result<(), String> {
    ensure_within_root(root_path, source_path)?;
    ensure_within_root(root_path, destination_directory)?;
    ensure_existing_path(source_path)?;
    ensure_existing_path(destination_directory)?;

    if !destination_directory.is_dir() {
        return Err("粘贴目标必须是文件夹".to_string());
    }

    if source_path == root_path {
        return Err("不能复制工作区根目录".to_string());
    }

    let source_metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;

    if source_metadata.is_dir() && destination_directory.starts_with(source_path) {
        return Err("不能将文件夹复制到它自己的子目录中".to_string());
    }

    let file_name = source_path
        .file_name()
        .ok_or_else(|| "无法确定源文件名".to_string())?;
    let destination_path = destination_directory.join(file_name);

    ensure_parent_exists(&destination_path)?;
    ensure_target_available(&destination_path)?;

    copy_workspace_node_recursive(source_path, &destination_path)
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
        assert_eq!(std::fs::read_to_string(&destination_file).unwrap(), "hello copy");
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
}
