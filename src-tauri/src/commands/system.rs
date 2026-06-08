use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[tauri::command]
pub async fn show_window(window: tauri::Window) {
    window.show().unwrap();
}

// 通过 which/where 查找命令行工具
fn which_in_path(name: &str) -> Option<PathBuf> {
    let output = if cfg!(target_os = "windows") {
        Command::new("where").arg(name).output().ok()?
    } else {
        Command::new("which").arg(name).output().ok()?
    };
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()?
            .trim()
            .to_string();
        let p = PathBuf::from(&path);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// 查找 CLI 二进制文件路径
fn find_cli_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    // 1. 优先检查 PATH
    if let Some(p) = which_in_path("mado") {
        return Some(p);
    }

    // 2. 同目录下查找（开发时 Tauri app 和 CLI 在同一 target/debug/ 目录）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("mado");
            if candidate.exists() {
                return Some(candidate);
            }
            #[cfg(target_os = "windows")]
            {
                let candidate_exe = dir.join("mado.exe");
                if candidate_exe.exists() {
                    return Some(candidate_exe);
                }
            }

            // 开发环境：检查 target 兄弟目录
            if let Some(target_dir) = dir.parent() {
                if let Some(target_name) = dir.file_name() {
                    let check = target_dir
                        .parent()
                        .map(|p| p.join(target_name).join("mado"))
                        .filter(|p| p.exists());
                    if let Some(p) = check {
                        return Some(p);
                    }
                }
            }
        }
    }

    // 3. App 内嵌资源（生产环境：.app/.deb/.AppImage 内打包的 mado）
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("binaries/mado");
        if bundled.exists() {
            return Some(bundled);
        }
    }

    // 4. 检查 ~/.local/bin/mado（之前安装的 symlink 目标）
    if let Ok(home) = std::env::var("HOME") {
        let local_mado = PathBuf::from(&home).join(".local/bin/mado");
        if local_mado.exists() {
            if let Ok(target) = std::fs::read_link(&local_mado) {
                if target.exists() || target.is_symlink() {
                    return Some(target);
                }
            } else {
                return Some(local_mado);
            }
        }
    }

    None
}

// 获取 CLI 安装状态
#[tauri::command]
pub async fn get_cli_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let binary = find_cli_binary(&app);
    let available = binary.is_some() || which_in_path("mado").is_some();

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法获取 HOME 目录".to_string())?;
    let symlink_path = PathBuf::from(&home).join(".local/bin/mado");

    let symlink_exists = symlink_path.exists();
    let symlink_ok = if symlink_exists {
        if let Ok(target) = std::fs::read_link(&symlink_path) {
            target.exists()
        } else {
            true
        }
    } else {
        false
    };

    let in_path = which_in_path("mado").is_some();

    Ok(serde_json::json!({
        "available": available,
        "in_path": in_path,
        "symlink_exists": symlink_exists,
        "symlink_ok": symlink_ok,
        "binary_path": binary.as_ref().map(|p| p.to_string_lossy().to_string()),
        "symlink_path": symlink_path.to_string_lossy().to_string(),
    }))
}

// 安装 CLI：创建 symlink（开发）或复制（生产内嵌资源）到 ~/.local/bin/mado
#[tauri::command]
pub async fn install_cli(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    if which_in_path("mado").is_some() {
        return Ok(serde_json::json!({
            "success": true,
            "message": "mado 已在 PATH 中，无需安装"
        }));
    }

    let binary = find_cli_binary(&app).ok_or_else(|| {
        format!(
            "未找到 mado 二进制文件。\n\
			 请先运行 cargo build -p madora-cli 构建 CLI 工具，\n\
			 或安装 Madora 桌面版（内嵌 CLI 二进制）。"
        )
    })?;

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法获取 HOME 目录".to_string())?;
    let bin_dir = PathBuf::from(&home).join(".local/bin");
    let dest = bin_dir.join("mado");

    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("创建 {} 失败: {e}", bin_dir.display()))?;

    let _ = std::fs::remove_file(&dest);

    // 如果来源是 app 内嵌资源（只读），使用复制；否则 symlink
    let is_bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|d| d.join("binaries/mado"))
        .is_some_and(|p| p == binary);

    if is_bundled {
        std::fs::copy(&binary, &dest).map_err(|e| format!("复制 CLI 二进制失败: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&dest)
                .map_err(|e| format!("获取文件属性失败: {e}"))?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&dest, perms).map_err(|e| format!("设置权限失败: {e}"))?;
        }
    } else {
        #[cfg(target_os = "windows")]
        {
            std::os::windows::fs::symlink_file(&binary, &dest)
                .map_err(|e| format!("创建 symlink 失败: {e}"))?;
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::os::unix::fs::symlink(&binary, &dest)
                .map_err(|e| format!("创建 symlink 失败: {e}"))?;
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "dest": dest.to_string_lossy().to_string(),
        "source": binary.to_string_lossy().to_string(),
        "bundled": is_bundled,
    }))
}

// 卸载 CLI（移除 mado symlink）
#[tauri::command]
pub async fn uninstall_cli() -> Result<serde_json::Value, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法获取 HOME 目录".to_string())?;
    let dest = PathBuf::from(&home).join(".local/bin/mado");

    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|e| format!("移除失败: {e}"))?;
    }

    Ok(serde_json::json!({
        "success": true,
        "removed": dest.to_string_lossy().to_string(),
    }))
}
