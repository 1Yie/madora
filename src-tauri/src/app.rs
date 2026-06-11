use std::env;

use crate::{
    commands::{
        ai, explorer, git, license, project, secure_storage, system, utility, webdav, workspace,
    },
    protocol::MadoraProtocolState,
    services::{
        ai::AiCompletionService, license::LicenseService, webdav::WebDavStore,
        workspace::WorkspaceStore,
    },
};
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri_plugin_prevent_default::Flags;
#[cfg(target_os = "windows")]
use tauri_plugin_prevent_default::PlatformOptions;

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin({
            let mut builder = tauri_plugin_prevent_default::Builder::new().with_flags(Flags::all());

            #[cfg(target_os = "windows")]
            {
                builder = builder.platform(
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
            }

            builder.build()
        });
    }

    builder = builder.setup(|app| {
        #[cfg(all(target_os = "windows", not(debug_assertions)))]
        configure_windows_webview(app);

        app.manage(LicenseService::new());
        app.manage(MadoraProtocolState::new());

        // Initialize workspace store with app data directory for persistence
        let app_data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."));
        let workspace_store = WorkspaceStore::new(app_data_dir.clone());

        // Sync initial workspace root into the protocol state
        if let Ok(state) = workspace_store.get_state() {
            if let Some(root) = &state.root_path {
                app.state::<MadoraProtocolState>()
                    .set_workspace_root(Some(std::path::PathBuf::from(root)));
            }
        }

        app.manage(workspace_store);

        // Initialize WebDAV store
        let webdav_store = WebDavStore::new(app_data_dir.clone());
        app.manage(webdav_store);

        Ok(())
    });

    builder = builder.register_uri_scheme_protocol("madora", |ctx, request| {
        crate::protocol::handle_madora_protocol(ctx, request)
    });

    builder
        .manage(AiCompletionService::new())
        .invoke_handler(tauri::generate_handler![
            utility::greet,
            utility::path_exists,
            utility::absolute_path_exists,
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
            explorer::import_external_files,
            explorer::copy_workspace_node,
            workspace::get_workspace_state,
            workspace::set_workspace_root,
            workspace::add_tab,
            workspace::close_tab,
            workspace::close_tabs,
            workspace::set_active_tab,
            workspace::set_sidebar_width,
            workspace::set_tab_bar_mode,
            workspace::set_open_tab_paths,
            workspace::clear_workspace_state,
            workspace::resolve_image_src,
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
            system::show_window,
            system::get_cli_status,
            system::install_cli,
            system::uninstall_cli,
            license::get_license_status,
            license::activate_license,
            license::verify_license,
            license::force_verify_license,
            license::deactivate_license,
            webdav::webdav_get_config,
            webdav::webdav_save_config,
            webdav::webdav_delete_config,
            webdav::webdav_test_connection,
            webdav::webdav_sync,
            webdav::webdav_get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(target_os = "windows"))]
fn configure_windows_webview(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let _ = window.with_webview(|webview| {
        let controller = webview.controller();
        let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
            return;
        };
        let Ok(settings) = (unsafe { core.Settings() }) else {
            return;
        };
        let _ = unsafe { settings.SetIsStatusBarEnabled(false) };
    });
}
