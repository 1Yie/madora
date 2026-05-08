use serde::Serialize;

#[derive(Serialize)]
pub struct SystemTheme {
    /// "light" or "dark"
    pub scheme: String,
    /// Optional accent color in hex like "#RRGGBB" when available
    pub accent: Option<String>,
}

// Implement minimal cross-platform logic to detect light/dark preference
// and attempt to read accent color on supported platforms.

#[tauri::command]
pub fn get_system_theme() -> SystemTheme {
    #[cfg(target_os = "windows")]
    fn detect() -> SystemTheme {
        use std::io::Error;
        // On Windows registry: HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize -> AppsUseLightTheme
        // 1 = light, 0 = dark
        let scheme = match winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
            .and_then(|k| k.get_value::<u32, &str>("AppsUseLightTheme"))
        {
            Ok(val) => if val == 0 { "dark" } else { "light" }.to_string(),
            Err(_e) => {
                // fallback to light
                "light".to_string()
            }
        };

        // Accent color read via registry: HKCU\Software\Microsoft\Windows\DWM -> AccentColor
        let accent = match winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\DWM")
            .and_then(|k| k.get_value::<u32, &str>("AccentColor"))
        {
            Ok(val) => {
                // AccentColor is in ABGR (DWORD). Convert to RRGGBB hex.
                let b = (val & 0xFF) as u8;
                let g = ((val >> 8) & 0xFF) as u8;
                let r = ((val >> 16) & 0xFF) as u8;
                Some(format!("#{:02X}{:02X}{:02X}", r, g, b))
            }
            Err(_e) => None,
        };

        SystemTheme { scheme, accent }
    }

    #[cfg(target_os = "macos")]
    fn detect() -> SystemTheme {
        use std::process::Command;
        // macOS: AppleInterfaceStyle = "Dark" when dark mode enabled
        let scheme = match Command::new("defaults").arg("read").arg("-g").arg("AppleInterfaceStyle").output() {
            Ok(output) => {
                if output.status.success() {
                    let s = String::from_utf8_lossy(&output.stdout).to_lowercase();
                    if s.contains("dark") { "dark" } else { "light" }.to_string()
                } else {
                    "light".to_string()
                }
            }
            Err(_) => "light".to_string(),
        };

        // macOS accent color is more involved; skip for now.
        SystemTheme { scheme, accent: None }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    fn detect() -> SystemTheme {
        use std::process::Command;
        use std::path::Path;

        let mut scheme = "light".to_string();
        let mut accent: Option<String> = None;

        // GNOME: 先尝试 color-scheme（更准确），再 fallback 到 gtk-theme
        let gnome_color_scheme = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "color-scheme"])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase());

        let gnome_gtk_theme = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase());

        if gnome_color_scheme.as_deref().is_some_and(|s| s.contains("dark") || s.contains("prefer-dark"))
            || gnome_gtk_theme.as_deref().is_some_and(|s| s.contains("dark"))
        {
            scheme = "dark".to_string();
        }

        // GNOME accent color（GNOME 42+ 支持）
        if accent.is_none() {
            if let Some(raw) = Command::new("gsettings")
                .args(["get", "org.gnome.desktop.interface", "accent-color"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().trim_matches('\'').to_lowercase())
            {
                // gsettings 返回的是颜色名称字符串，转换为 hex
                accent = match raw.as_str() {
                    "blue"   => Some("#3584E4".to_string()),
                    "teal"   => Some("#2190A4".to_string()),
                    "green"  => Some("#3A944A".to_string()),
                    "yellow" => Some("#C88800".to_string()),
                    "orange" => Some("#E66100".to_string()),
                    "red"    => Some("#E62D42".to_string()),
                    "pink"   => Some("#D56199".to_string()),
                    "purple" => Some("#9141AC".to_string()),
                    "slate"  => Some("#6F8396".to_string()),
                    _        => None,
                };
            }
        }

        // KDE: ~/.config/kdeglobals
        if let Some(home) = std::env::var_os("HOME") {
            let kdeglobals = Path::new(&home).join(".config").join("kdeglobals");
            if let Ok(contents) = std::fs::read_to_string(&kdeglobals) {
                // 检测深色主题
                if scheme == "light" {
                    let lower = contents.to_lowercase();
                    if lower.contains("colorscheme") && lower.contains("dark") {
                        scheme = "dark".to_string();
                    }
                }

                // 读取 KDE accent color：[Colors:Button] 区块下的 ForegroundActive 或 [General] 下的 AccentColor
                // KDE 5.x: [Colors:Button] -> ForegroundActive = r,g,b
                // KDE 6.x: [General] -> AccentColor = r,g,b
                if accent.is_none() {
                    accent = parse_kde_accent(&contents);
                }
            }
        }

        SystemTheme { scheme, accent }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    fn parse_kde_accent(contents: &str) -> Option<String> {
        // KDE 6: [General] 区块下的 AccentColor
        // KDE 5: [Colors:Button] 区块下的 ForegroundActive
        let mut current_section = "";
        let mut kde6_accent: Option<(u8, u8, u8)> = None;
        let mut kde5_accent: Option<(u8, u8, u8)> = None;

        for line in contents.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                current_section = trimmed;
                continue;
            }
            if let Some((key, val)) = trimmed.split_once('=') {
                let key = key.trim();
                let val = val.trim();
                if current_section == "[General]" && key == "AccentColor" {
                    kde6_accent = parse_kde_rgb(val);
                }
                if current_section == "[Colors:Button]" && key == "ForegroundActive" {
                    kde5_accent = parse_kde_rgb(val);
                }
            }
        }

        kde6_accent.or(kde5_accent).map(|(r, g, b)| format!("#{:02X}{:02X}{:02X}", r, g, b))
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    fn parse_kde_rgb(val: &str) -> Option<(u8, u8, u8)> {
        // 格式：r,g,b（如 "61,174,233"）
        let parts: Vec<&str> = val.split(',').collect();
        if parts.len() >= 3 {
            let r = parts[0].trim().parse::<u8>().ok()?;
            let g = parts[1].trim().parse::<u8>().ok()?;
            let b = parts[2].trim().parse::<u8>().ok()?;
            return Some((r, g, b));
        }
        None
    }

    detect()
}
