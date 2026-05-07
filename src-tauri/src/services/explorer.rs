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

pub fn read_directory_children(root: &Path, directory: &Path) -> Result<Vec<ExplorerNode>, String> {
    let entries = sorted_directory_entries(directory)?;
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
