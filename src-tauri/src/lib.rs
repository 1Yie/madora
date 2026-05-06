use std::env;
use std::fs;
use ignore::WalkBuilder;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
            read_file_content,
            scan_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}