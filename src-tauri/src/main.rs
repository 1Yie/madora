// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// 在 GTK/WebKitGTK 初始化前固定 Linux 渲染环境(参考 agent-rs app-tauri)。
///
/// - Wayland + NVIDIA 下 WebKitGTK 的 dmabuf/explicit-sync 会触发
///   `Gdk-Message: Error 71 (协议错误) dispatching to Wayland display`,
///   关闭 NVIDIA explicit sync 可避免。
/// - X11 + NVIDIA 下 dmabuf 的 GBM 分配会 EINVAL,退回非 dmabuf 渲染。
/// - 所有变量仅在用户未设置时写入,可用 `.env`/shell 覆盖。
/// - `appmenu-gtk-module`(KDE 全局菜单)对无菜单栏的窗口无用,仅在本进程剔除。
#[cfg(target_os = "linux")]
fn pin_linux_rendering_env() {
    fn set_default(key: &str, value: &str) {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }

    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE").is_ok_and(|v| v == "wayland");
    let nvidia = std::fs::read_dir("/sys/class/drm").is_ok_and(|entries| {
        entries.flatten().any(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            name.starts_with("card")
                && !name.contains('-')
                && std::fs::read_to_string(e.path().join("device/vendor"))
                    .is_ok_and(|v| v.trim() == "0x10de")
        })
    });

    set_default("GDK_BACKEND", if wayland { "wayland" } else { "x11" });

    if nvidia {
        set_default("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
        if wayland {
            set_default("__NV_DISABLE_EXPLICIT_SYNC", "1");
        } else {
            set_default("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    if let Ok(modules) = std::env::var("GTK_MODULES") {
        let filtered = modules
            .split(':')
            .filter(|m| !m.is_empty() && *m != "appmenu-gtk-module")
            .collect::<Vec<_>>()
            .join(":");
        std::env::set_var("GTK_MODULES", filtered);
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    pin_linux_rendering_env();
    madora_lib::run()
}
