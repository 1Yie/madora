use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use ignore::WalkBuilder;
use serde::Serialize;

const MAX_TEXT_PREVIEW_BYTES: usize = 512 * 1024;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
enum ExplorerNodeKind {
    Directory,
    File,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
enum ExplorerFileKind {
    Image,
    Markdown,
    Text,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplorerNode {
    name: String,
    path: String,
    relative_path: String,
    kind: ExplorerNodeKind,
    file_kind: Option<ExplorerFileKind>,
    has_children: bool,
    loaded: bool,
    children: Vec<ExplorerNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FilePreview {
    file_kind: ExplorerFileKind,
    content: Option<String>,
    image_data_url: Option<String>,
    size: u64,
    truncated: bool,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => {
            Some(ExplorerFileKind::Image)
        }
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
        let left_is_dir = left.file_type().map(|value| value.is_dir()).unwrap_or(false);
        let right_is_dir = right.file_type().map(|value| value.is_dir()).unwrap_or(false);

        right_is_dir
            .cmp(&left_is_dir)
            .then_with(|| {
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

fn read_directory_children(root: &Path, directory: &Path) -> Result<Vec<ExplorerNode>, String> {
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

fn build_workspace_root(root: &Path) -> Result<ExplorerNode, String> {
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

fn read_text_preview(path: &Path) -> Result<(String, bool), String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let truncated = bytes.len() > MAX_TEXT_PREVIEW_BYTES;
    let preview_bytes = if truncated {
        &bytes[..MAX_TEXT_PREVIEW_BYTES]
    } else {
        &bytes[..]
    };

    Ok((String::from_utf8_lossy(preview_bytes).into_owned(), truncated))
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

#[tauri::command]
async fn pick_workspace_folder() -> Result<Option<ExplorerNode>, String> {
    let selected_directory = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|error| error.to_string())?;

    let Some(path) = selected_directory else {
        return Ok(None);
    };

    let root = tauri::async_runtime::spawn_blocking(move || build_workspace_root(&path))
        .await
        .map_err(|error| error.to_string())??;

    Ok(Some(root))
}

#[tauri::command]
async fn scan_workspace_folder(root_path: String) -> Result<ExplorerNode, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || build_workspace_root(&root_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_workspace_directory(root_path: String, directory_path: String) -> Result<Vec<ExplorerNode>, String> {
    let root_path = PathBuf::from(root_path);
    let directory_path = PathBuf::from(directory_path);

    tauri::async_runtime::spawn_blocking(move || read_directory_children(&root_path, &directory_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_workspace_file(path: String) -> Result<FilePreview, String> {
    let file_path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || {
        let metadata = fs::metadata(&file_path).map_err(|error| error.to_string())?;
        let file_kind = classify_file_kind(&file_path)
            .ok_or_else(|| "Unsupported file type".to_string())?;

        match file_kind {
            ExplorerFileKind::Image => {
                let bytes = fs::read(&file_path).map_err(|error| error.to_string())?;

                Ok(FilePreview {
                    file_kind,
                    content: None,
                    image_data_url: Some(format!(
                        "data:{};base64,{}",
                        image_mime_type(&file_path),
                        STANDARD.encode(bytes)
                    )),
                    size: metadata.len(),
                    truncated: false,
                })
            }
            ExplorerFileKind::Markdown | ExplorerFileKind::Text => {
                let (content, truncated) = read_text_preview(&file_path)?;

                Ok(FilePreview {
                    file_kind,
                    content: Some(content),
                    image_data_url: None,
                    size: metadata.len(),
                    truncated,
                })
            }
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn create_markdown_file(
    root_path: String,
    selected_path: Option<String>,
    file_name: String,
) -> Result<ExplorerNode, String> {
    let root_path = PathBuf::from(root_path);
    let selected_path = selected_path.map(PathBuf::from);

    tauri::async_runtime::spawn_blocking(move || {
        let target_directory = resolve_create_directory(&root_path, selected_path.as_deref())?;
        let normalized_file_name = normalize_markdown_file_name(&file_name)?;
        let file_path = target_directory.join(normalized_file_name);

        fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&file_path)
            .map_err(|error| error.to_string())?;

        Ok(build_file_node(&root_path, &file_path, ExplorerFileKind::Markdown))
    })
    .await
    .map_err(|error| error.to_string())?
}

// 指令：读取单个文件内容
#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

// 指令：扫描项目目录（自动过滤 gitignore 里的文件）
#[tauri::command]
async fn scan_project(root: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    // WalkBuilder 会自动处理 .gitignore
    for entry in WalkBuilder::new(root).build() {
        match entry {
            Ok(e) => {
                if e.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                    files.push(e.path().display().to_string());
                }
            }
            Err(err) => return Err(err.to_string()),
        }
    }
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            pick_workspace_folder,
            scan_workspace_folder,
            read_workspace_directory,
            read_workspace_file,
            create_markdown_file,
            read_file_content,
            scan_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
