use std::env;

use crate::{
    commands::{ai, explorer, git, project, secure_storage, system, utility},
    services::ai::AiCompletionService,
};
use tauri::Manager;
use tauri_plugin_prevent_default::Flags;
#[cfg(target_os = "windows")]
use tauri_plugin_prevent_default::PlatformOptions;
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin({
            let builder = tauri_plugin_prevent_default::Builder::new().with_flags(Flags::all());
            #[cfg(target_os = "windows")]
            let builder = builder.platform(
                PlatformOptions::new()
                    .browser_accelerator_keys(false)
                    .default_context_menus(false)
                    .default_script_dialogs(false)
                    .dev_tools(false)
                    .built_in_error_page(false)
                    .general_autofill(false)
                    .password_autosave(false)
                    .pinch_zoom(false)
                    .swipe_navigation(false)
                    .zoom_control(false),
            );
            builder.build()
        })
        .setup(|_app| {
            #[cfg(target_os = "windows")]
            configure_windows_webview(_app);

            Ok(())
        })
        .manage(AiCompletionService::new())
        .invoke_handler(tauri::generate_handler![
            utility::greet,
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

/// Disable WebView2 status bar (link hover URL tooltip) and other
/// unwanted browser-level UI on Windows.
#[cfg(target_os = "windows")]
fn configure_windows_webview(app: &tauri::App) {
    use tauri::webview::WebviewExtWindows;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let webview = window.as_ref();

    let Ok(controller) = webview.controller() else {
        return;
    };
    let Ok(core) = controller.CoreWebView2() else {
        return;
    };
    let Ok(settings) = core.Settings() else {
        return;
    };

    // Disable the URL tooltip on link hover (the main complaint)
    let _ = settings.SetIsStatusBarEnabled(false);
}
