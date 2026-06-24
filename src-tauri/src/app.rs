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
#[cfg(not(target_os = "linux"))]
use tauri::{
    image::Image,
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Runtime,
};
use tauri::{AppHandle, Manager};

#[cfg(not(target_os = "linux"))]
const TRAY_MENU_SHOW_WINDOW: &str = "tray_show_window";
#[cfg(not(target_os = "linux"))]
const TRAY_MENU_QUIT: &str = "tray_quit";
#[cfg(not(target_os = "linux"))]
const TRAY_MENU_ICON_SIZE: u32 = 16;
#[cfg(not(target_os = "linux"))]
const TRAY_MENU_SHOW_COLOR: [u8; 4] = [59, 130, 246, 255];
#[cfg(not(target_os = "linux"))]
const TRAY_MENU_SHOW_ACCENT: [u8; 4] = [59, 130, 246, 160];
#[cfg(not(target_os = "linux"))]
const TRAY_MENU_QUIT_COLOR: [u8; 4] = [239, 68, 68, 255];

#[cfg(not(target_os = "linux"))]
#[derive(Clone, Copy, Eq, PartialEq)]
enum TrayMenuTheme {
    Light,
    Dark,
}
#[cfg(not(debug_assertions))]
use tauri_plugin_prevent_default::Flags;
#[cfg(all(target_os = "windows", not(debug_assertions)))]
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

        setup_tray(app)?;

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
            workspace::set_zoom_level,
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
            system::hide_window,
            system::quit_app,
            system::set_app_locale,
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

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    {
        setup_linux_status_icon_tray(app)
    }

    #[cfg(not(target_os = "linux"))]
    {
        setup_tauri_tray(app)
    }
}

#[cfg(not(target_os = "linux"))]
fn build_tray_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<tauri::menu::Menu<R>> {
    let menu_theme = detect_tray_menu_theme();
    let show_window_label = crate::i18n::t("tray.show_window");
    let quit_label = crate::i18n::t("tray.quit");

    MenuBuilder::new(app)
        .icon(
            TRAY_MENU_SHOW_WINDOW,
            show_window_label,
            create_show_window_menu_icon(menu_theme),
        )
        .separator()
        .icon(
            TRAY_MENU_QUIT,
            quit_label,
            create_quit_menu_icon(menu_theme),
        )
        .build()
}

/// Rebuild the tray menu so its labels follow the current app locale.
///
/// The tray menu is built once at startup with the detected OS locale.
/// Call this after `i18n::set_locale` to refresh the labels when the
/// user changes the language in settings.
#[cfg(not(target_os = "linux"))]
pub fn refresh_tray_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    match build_tray_menu(app) {
        Ok(menu) => {
            if let Err(error) = tray.set_menu(Some(menu)) {
                eprintln!("failed to refresh tray menu: {error}");
            }
        }
        Err(error) => eprintln!("failed to rebuild tray menu: {error}"),
    }
}

#[cfg(target_os = "linux")]
pub fn refresh_tray_menu(_app: &AppHandle) {
    // Linux uses ksni, which re-reads labels via MadoraLinuxTray::menu()
    // (translated live with crate::i18n::t) — no explicit rebuild needed.
}

#[cfg(not(target_os = "linux"))]
fn setup_tauri_tray(app: &tauri::App) -> tauri::Result<()> {
    let tray_icon = app.default_window_icon().cloned();
    let menu = build_tray_menu(app)?;

    let mut tray_builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Madora")
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_SHOW_WINDOW => show_main_window(app),
            TRAY_MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = tray_icon {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;

    Ok(())
}

#[cfg(target_os = "linux")]
struct MadoraLinuxTray {
    app: AppHandle,
    icon: ksni::Icon,
}

#[cfg(target_os = "linux")]
impl ksni::Tray for MadoraLinuxTray {
    fn id(&self) -> String {
        "madora".into()
    }

    fn title(&self) -> String {
        "Madora".into()
    }

    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        vec![self.icon.clone()]
    }

    fn activate(&mut self, _x: i32, _y: i32) {
        show_main_window(&self.app);
    }

    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        use ksni::menu::*;

        vec![
            StandardItem {
                label: crate::i18n::t("tray.show_window"),
                activate: Box::new(|tray: &mut Self| show_main_window(&tray.app)),
                ..Default::default()
            }
            .into(),
            ksni::MenuItem::Separator,
            StandardItem {
                label: crate::i18n::t("tray.quit"),
                activate: Box::new(|tray: &mut Self| tray.app.exit(0)),
                ..Default::default()
            }
            .into(),
        ]
    }
}

#[cfg(target_os = "linux")]
fn setup_linux_status_icon_tray(app: &tauri::App) -> tauri::Result<()> {
    use ksni::TrayMethods;

    let tray = MadoraLinuxTray {
        app: app.app_handle().clone(),
        icon: load_linux_tray_icon()?,
    };

    tauri::async_runtime::spawn(async move {
        match tray.assume_sni_available(true).spawn().await {
            Ok(_handle) => std::future::pending::<()>().await,
            Err(error) => eprintln!("failed to create Linux tray icon: {error}"),
        }
    });

    Ok(())
}

#[cfg(target_os = "linux")]
fn load_linux_tray_icon() -> tauri::Result<ksni::Icon> {
    use image::GenericImageView;

    let image = image::load_from_memory_with_format(
        include_bytes!("../icons/32x32.png"),
        image::ImageFormat::Png,
    )
    .map_err(|error| tauri::Error::Io(std::io::Error::other(error.to_string())))?;
    let (width, height) = image.dimensions();
    let mut data = image.into_rgba8().into_vec();

    for pixel in data.chunks_exact_mut(4) {
        pixel.rotate_right(1);
    }

    Ok(ksni::Icon {
        width: width as i32,
        height: height as i32,
        data,
    })
}

#[cfg(not(target_os = "linux"))]
fn detect_tray_menu_theme() -> TrayMenuTheme {
    #[cfg(target_os = "windows")]
    {
        let scheme = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
            .and_then(|key| key.get_value::<u32, &str>("SystemUsesLightTheme"))
            .map(|value| if value == 0 { "dark" } else { "light" })
            .unwrap_or("light");

        match scheme {
            "dark" => TrayMenuTheme::Dark,
            _ => TrayMenuTheme::Light,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        match crate::commands::theme::get_system_theme().scheme.as_str() {
            "dark" => TrayMenuTheme::Dark,
            _ => TrayMenuTheme::Light,
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(not(target_os = "linux"))]
fn create_show_window_menu_icon(theme: TrayMenuTheme) -> Image<'static> {
    load_svg_tray_menu_icon(show_window_menu_svg(theme)).unwrap_or_else(|error| {
        eprintln!("failed to load tray menu icon '{TRAY_MENU_SHOW_WINDOW}': {error}");
        create_show_window_menu_icon_fallback()
    })
}

#[cfg(not(target_os = "linux"))]
fn create_quit_menu_icon(theme: TrayMenuTheme) -> Image<'static> {
    load_svg_tray_menu_icon(quit_menu_svg(theme)).unwrap_or_else(|error| {
        eprintln!("failed to load tray menu icon '{TRAY_MENU_QUIT}': {error}");
        create_quit_menu_icon_fallback()
    })
}

#[cfg(not(target_os = "linux"))]
fn show_window_menu_svg(theme: TrayMenuTheme) -> &'static [u8] {
    match theme {
        TrayMenuTheme::Light => include_bytes!("../icons/menu/windows-000.svg"),
        TrayMenuTheme::Dark => include_bytes!("../icons/menu/windows-fff.svg"),
    }
}

#[cfg(not(target_os = "linux"))]
fn quit_menu_svg(theme: TrayMenuTheme) -> &'static [u8] {
    match theme {
        TrayMenuTheme::Light => include_bytes!("../icons/menu/x-000.svg"),
        TrayMenuTheme::Dark => include_bytes!("../icons/menu/x-fff.svg"),
    }
}

#[cfg(not(target_os = "linux"))]
fn load_svg_tray_menu_icon(svg: &[u8]) -> Result<Image<'static>, String> {
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(svg, &options).map_err(|error| error.to_string())?;
    let svg_size = tree.size().to_int_size();
    let scale_x = TRAY_MENU_ICON_SIZE as f32 / svg_size.width() as f32;
    let scale_y = TRAY_MENU_ICON_SIZE as f32 / svg_size.height() as f32;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(TRAY_MENU_ICON_SIZE, TRAY_MENU_ICON_SIZE)
        .ok_or_else(|| "failed to allocate tray menu pixmap".to_string())?;

    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(scale_x, scale_y),
        &mut pixmap.as_mut(),
    );

    let mut rgba = pixmap.data().to_vec();
    unpremultiply_rgba(&mut rgba);

    Ok(Image::new_owned(
        rgba,
        TRAY_MENU_ICON_SIZE,
        TRAY_MENU_ICON_SIZE,
    ))
}

#[cfg(not(target_os = "linux"))]
fn unpremultiply_rgba(rgba: &mut [u8]) {
    for pixel in rgba.chunks_exact_mut(4) {
        let alpha = pixel[3] as u32;
        if alpha == 0 {
            pixel[0] = 0;
            pixel[1] = 0;
            pixel[2] = 0;
            continue;
        }

        pixel[0] = ((pixel[0] as u32 * 255 + alpha / 2) / alpha).min(255) as u8;
        pixel[1] = ((pixel[1] as u32 * 255 + alpha / 2) / alpha).min(255) as u8;
        pixel[2] = ((pixel[2] as u32 * 255 + alpha / 2) / alpha).min(255) as u8;
    }
}

#[cfg(not(target_os = "linux"))]
fn create_show_window_menu_icon_fallback() -> Image<'static> {
    let mut rgba = empty_tray_menu_icon();

    draw_rect_outline(&mut rgba, 5, 2, 7, 5, TRAY_MENU_SHOW_ACCENT);
    draw_rect_outline(&mut rgba, 2, 5, 9, 7, TRAY_MENU_SHOW_COLOR);
    draw_horizontal_line(&mut rgba, 3, 8, 7, TRAY_MENU_SHOW_COLOR);

    Image::new_owned(rgba, TRAY_MENU_ICON_SIZE, TRAY_MENU_ICON_SIZE)
}

#[cfg(not(target_os = "linux"))]
fn create_quit_menu_icon_fallback() -> Image<'static> {
    let mut rgba = empty_tray_menu_icon();

    draw_line(&mut rgba, 4, 4, 11, 11, TRAY_MENU_QUIT_COLOR);
    draw_line(&mut rgba, 5, 4, 11, 10, TRAY_MENU_QUIT_COLOR);
    draw_line(&mut rgba, 11, 4, 4, 11, TRAY_MENU_QUIT_COLOR);
    draw_line(&mut rgba, 10, 4, 4, 10, TRAY_MENU_QUIT_COLOR);

    Image::new_owned(rgba, TRAY_MENU_ICON_SIZE, TRAY_MENU_ICON_SIZE)
}

#[cfg(not(target_os = "linux"))]
fn empty_tray_menu_icon() -> Vec<u8> {
    vec![0; (TRAY_MENU_ICON_SIZE * TRAY_MENU_ICON_SIZE * 4) as usize]
}

#[cfg(not(target_os = "linux"))]
fn draw_rect_outline(rgba: &mut [u8], x: i32, y: i32, width: i32, height: i32, color: [u8; 4]) {
    draw_horizontal_line(rgba, x, x + width - 1, y, color);
    draw_horizontal_line(rgba, x, x + width - 1, y + height - 1, color);
    draw_vertical_line(rgba, x, y, y + height - 1, color);
    draw_vertical_line(rgba, x + width - 1, y, y + height - 1, color);
}

#[cfg(not(target_os = "linux"))]
fn draw_horizontal_line(rgba: &mut [u8], x1: i32, x2: i32, y: i32, color: [u8; 4]) {
    for x in x1..=x2 {
        paint_pixel(rgba, x, y, color);
    }
}

#[cfg(not(target_os = "linux"))]
fn draw_vertical_line(rgba: &mut [u8], x: i32, y1: i32, y2: i32, color: [u8; 4]) {
    for y in y1..=y2 {
        paint_pixel(rgba, x, y, color);
    }
}

#[cfg(not(target_os = "linux"))]
fn draw_line(rgba: &mut [u8], mut x0: i32, mut y0: i32, x1: i32, y1: i32, color: [u8; 4]) {
    let dx = (x1 - x0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let dy = -(y1 - y0).abs();
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut error = dx + dy;

    loop {
        paint_pixel(rgba, x0, y0, color);
        if x0 == x1 && y0 == y1 {
            break;
        }

        let twice_error = error * 2;
        if twice_error >= dy {
            error += dy;
            x0 += sx;
        }
        if twice_error <= dx {
            error += dx;
            y0 += sy;
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn paint_pixel(rgba: &mut [u8], x: i32, y: i32, color: [u8; 4]) {
    if x < 0 || y < 0 || x >= TRAY_MENU_ICON_SIZE as i32 || y >= TRAY_MENU_ICON_SIZE as i32 {
        return;
    }

    let index = ((y as u32 * TRAY_MENU_ICON_SIZE + x as u32) * 4) as usize;
    rgba[index..index + 4].copy_from_slice(&color);
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
