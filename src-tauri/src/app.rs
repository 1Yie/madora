use std::env;

use crate::commands::{ai, explorer, project, utility};

pub fn run() {
    #[cfg(target_os = "linux")]
    {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            utility::greet,
            explorer::pick_workspace_folder,
            explorer::scan_workspace_folder,
            explorer::read_workspace_directory,
            explorer::read_workspace_file,
            explorer::create_markdown_file,
            explorer::write_workspace_file,
            ai::generate_completion,
            project::read_file_content,
            project::scan_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
