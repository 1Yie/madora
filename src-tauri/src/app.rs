use std::env;

use crate::{
    commands::{ai, explorer, git, project, secure_storage, utility, system},
    services::ai::AiCompletionService,
};
use tauri::Manager;

pub fn run() {
    #[cfg(target_os = "linux")]
    {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(AiCompletionService::new())
        .invoke_handler(tauri::generate_handler![
            utility::greet,
            // theme
            crate::commands::theme::get_system_theme,
            explorer::pick_workspace_folder,
            explorer::scan_workspace_folder,
            explorer::read_workspace_directory,
            explorer::read_workspace_file,
            explorer::create_markdown_file,
            explorer::create_workspace_directory,
            explorer::write_workspace_file,
            explorer::rename_workspace_node,
            explorer::delete_workspace_node,
            explorer::move_workspace_node,
            explorer::copy_workspace_node,
            git::git_status,
            git::git_init,
            git::git_set_remote,
            git::git_commit_all,
            git::git_commit,
            git::git_unstage_file,
            git::git_pull,
            git::git_push,
            git::git_fetch,
            git::git_stage_file,
            git::git_restore_file,
            git::git_log,
            git::git_pick_ssh_private_key_file,
            git::git_undo_last_commit,
            git::git_revert_commit,
            git::git_list_branches,
            git::git_create_branch,
            git::git_switch_branch,
            git::git_store_credentials,
            git::git_load_credentials,
            ai::generate_completion,
            ai::generate_completion_stream,
            secure_storage::has_ai_api_key,
            secure_storage::store_ai_api_key,
            secure_storage::delete_ai_api_key,
            project::read_file_content,
            project::scan_project,
            system::show_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
