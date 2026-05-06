use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::models::explorer::{ExplorerFileKind, ExplorerNode, ExplorerNodeKind, FilePreview};

const MAX_TEXT_PREVIEW_BYTES: usize = 512 * 1024;

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

fn sorted_directory_entries(directory: &Path) -> Result<Vec<fs::DirEntry>, String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

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

fn directory_has_visible_entries(directory: &Path) -> Result<bool, String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let entry_type = entry.file_type().map_err(|error| error.to_string())?;

        if entry_type.is_dir() || classify_file_kind(&path).is_some() {
            return Ok(true);
        }
    }

    Ok(false)
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

fn read_text_preview(path: &Path) -> Result<(String, bool), String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let truncated = bytes.len() > MAX_TEXT_PREVIEW_BYTES;
    let preview_bytes = if truncated {
        &bytes[..MAX_TEXT_PREVIEW_BYTES]
    } else {
        &bytes[..]
    };

    Ok((
        String::from_utf8_lossy(preview_bytes).into_owned(),
        truncated,
    ))
}

fn normalize_markdown_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_file_name = file_name.trim();

    if trimmed_file_name.is_empty() {
        return Err("请输入文件名".to_string());
    }

    if trimmed_file_name.contains('/') || trimmed_file_name.contains('\\') {
        return Err("文件名不能包含路径分隔符".to_string());
    }

    if trimmed_file_name.to_ascii_lowercase().ends_with(".md") {
        return Ok(trimmed_file_name.to_string());
    }

    Ok(format!("{trimmed_file_name}.md"))
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

pub fn read_directory_children(root: &Path, directory: &Path) -> Result<Vec<ExplorerNode>, String> {
    let entries = sorted_directory_entries(directory)?;
    let mut children = Vec::new();

    for entry in entries {
        let path = entry.path();
        let entry_type = entry.file_type().map_err(|error| error.to_string())?;

        if entry_type.is_dir() {
            if directory_has_visible_entries(&path)? {
                children.push(ExplorerNode {
                    name: path_name(&path),
                    path: path.to_string_lossy().into_owned(),
                    relative_path: relative_path(root, &path),
                    kind: ExplorerNodeKind::Directory,
                    file_kind: None,
                    has_children: true,
                    loaded: false,
                    children: Vec::new(),
                });
            }

            continue;
        }

        if let Some(file_kind) = classify_file_kind(&path) {
            children.push(build_file_node(root, &path, file_kind));
        }
    }

    Ok(children)
}

pub fn build_workspace_root(root: &Path) -> Result<ExplorerNode, String> {
    if !root.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let children = read_directory_children(root, root)?;

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
            let (content, truncated) = read_text_preview(file_path)?;

            Ok(FilePreview {
                file_kind,
                content: Some(content),
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
