use std::{
    env,
    ffi::{OsStr, OsString},
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use tauri::{AppHandle, Manager};

use crate::models::cli::{CliInstallResult, CliStatus, CliUninstallResult};

const COMMAND_NAME: &str = "mado";

pub fn get_cli_status(app: &AppHandle) -> Result<CliStatus, String> {
    let install_path = managed_install_path()?;
    let install_dir = install_path
        .parent()
        .ok_or_else(|| "无法解析 CLI 安装目录".to_string())?
        .to_path_buf();
    let installed = is_usable_binary(&install_path);
    let command_path = find_command_in_path(COMMAND_NAME);
    let in_path = command_path.is_some();
    let source_path = discover_install_source(app, Some(&install_path));
    let managed_dir_in_path = is_install_dir_configured_in_path(&install_dir)?;
    let needs_terminal_restart = installed && managed_dir_in_path && !in_path;
    let path_hint = if in_path || managed_dir_in_path {
        None
    } else {
        build_path_hint(&install_dir)
    };

    Ok(CliStatus {
        available: installed || in_path || source_path.is_some(),
        installed,
        in_path,
        managed_dir_in_path,
        needs_terminal_restart,
        source_path: source_path.map(path_to_string),
        install_path: path_to_string(install_path),
        command_name: COMMAND_NAME.to_string(),
        path_hint,
    })
}

pub fn install_cli(app: &AppHandle) -> Result<CliInstallResult, String> {
    let install_path = managed_install_path()?;
    let install_dir = install_path
        .parent()
        .ok_or_else(|| "无法解析 CLI 安装目录".to_string())?
        .to_path_buf();
    let source_path = resolve_install_source(app, &install_path)?;

    if source_path != install_path {
        copy_executable(&source_path, &install_path)?;
    } else if !is_usable_binary(&install_path) {
        return Err("CLI 安装目标存在，但文件不可执行或为空".to_string());
    }

    let path_update = ensure_install_dir_on_path(&install_dir)?;
    let command_in_path = find_command_in_path(COMMAND_NAME).is_some();
    let needs_terminal_restart =
        is_usable_binary(&install_path) && path_update.configured && !command_in_path;

    Ok(CliInstallResult {
        success: true,
        source: path_to_string(source_path),
        dest: path_to_string(install_path),
        path_updated: path_update.updated,
        needs_terminal_restart,
        path_hint: if command_in_path || path_update.configured {
            None
        } else {
            build_path_hint(&install_dir)
        },
    })
}

fn resolve_install_source(app: &AppHandle, install_path: &Path) -> Result<PathBuf, String> {
    if let Some(source_path) = discover_install_source(app, Some(install_path)) {
        return Ok(source_path);
    }

    if try_build_development_cli()? {
        if let Some(source_path) = discover_install_source(app, Some(install_path)) {
            return Ok(source_path);
        }
    }

    Err(
        "未找到可安装的 mado 二进制文件。请先构建当前平台的 CLI，或确认桌面包内已附带 CLI。"
            .to_string(),
    )
}

pub fn uninstall_cli() -> Result<CliUninstallResult, String> {
    let install_path = managed_install_path()?;
    let install_dir = install_path
        .parent()
        .ok_or_else(|| "无法解析 CLI 安装目录".to_string())?
        .to_path_buf();

    if install_path.exists() {
        fs::remove_file(&install_path)
            .map_err(|e| format!("移除 CLI 失败 ({}): {e}", install_path.display()))?;
    }

    let path_updated = remove_install_dir_from_path(&install_dir)?;
    let _ = fs::remove_dir(&install_dir);

    Ok(CliUninstallResult {
        success: true,
        removed: path_to_string(install_path),
        path_updated,
    })
}

fn discover_install_source(app: &AppHandle, exclude: Option<&Path>) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join(binary_file_name()));
        candidates.push(resource_dir.join(binary_file_name()));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            candidates.push(dir.join(binary_file_name()));
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for profile in ["debug", "release"] {
        candidates.push(
            manifest_dir
                .join("target")
                .join(profile)
                .join(binary_file_name()),
        );
    }

    if let Some(path) = find_command_in_path(COMMAND_NAME) {
        candidates.push(path);
    }

    candidates.into_iter().find(|candidate| {
        is_usable_binary(candidate)
            && exclude
                .map(|excluded| !paths_equal(candidate, excluded))
                .unwrap_or(true)
    })
}

fn try_build_development_cli() -> Result<bool, String> {
    if !cfg!(debug_assertions) {
        return Ok(false);
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_manifest = manifest_dir.join("Cargo.toml");
    if !workspace_manifest.exists() {
        return Ok(false);
    }

    let output = Command::new("cargo")
        .arg("build")
        .arg("--manifest-path")
        .arg(&workspace_manifest)
        .arg("-p")
        .arg("madora-cli")
        .current_dir(&manifest_dir)
        .output()
        .map_err(|e| format!("自动构建 CLI 失败: {e}"))?;

    if output.status.success() {
        return Ok(true);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("exit code {:?}", output.status.code())
    };

    Err(format!("自动构建 CLI 失败: {detail}"))
}

fn binary_file_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "mado.exe"
    } else {
        "mado"
    }
}

fn managed_install_path() -> Result<PathBuf, String> {
    Ok(managed_install_dir()?.join(binary_file_name()))
}

fn managed_install_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let local_app_data = env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| {
                env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join("AppData/Local"))
            })
            .ok_or_else(|| "无法获取 LOCALAPPDATA 目录".to_string())?;
        return Ok(local_app_data.join("Madora").join("bin"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home = env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "无法获取 HOME 目录".to_string())?;
        let preferred = [home.join(".local/bin"), home.join("bin")];
        if let Some(dir) = preferred
            .iter()
            .find(|dir| current_process_path_contains(dir))
            .cloned()
        {
            return Ok(dir);
        }

        Ok(home.join(".local/bin"))
    }
}

fn copy_executable(source: &Path, dest: &Path) -> Result<(), String> {
    if !is_usable_binary(source) {
        return Err(format!("CLI 二进制无效或为空: {}", source.display()));
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 ({}): {e}", parent.display()))?;
    }

    if dest.exists() {
        fs::remove_file(dest).map_err(|e| format!("覆盖旧 CLI 失败 ({}): {e}", dest.display()))?;
    }

    fs::copy(source, dest).map_err(|e| {
        format!(
            "复制 CLI 失败 ({} -> {}): {e}",
            source.display(),
            dest.display()
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(dest)
            .map_err(|e| format!("读取 CLI 权限失败 ({}): {e}", dest.display()))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(dest, permissions)
            .map_err(|e| format!("设置 CLI 权限失败 ({}): {e}", dest.display()))?;
    }

    Ok(())
}

fn is_usable_binary(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.len() > 0)
        .unwrap_or(false)
}

fn find_command_in_path(command: &str) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        for name in lookup_names(command) {
            let candidate = dir.join(name);
            if is_usable_binary(&candidate) {
                return Some(candidate);
            }
        }
    }

    None
}

fn lookup_names(command: &str) -> Vec<OsString> {
    #[cfg(target_os = "windows")]
    {
        let command_path = Path::new(command);
        if command_path.extension().is_some() {
            return vec![OsString::from(command)];
        }

        let mut names = vec![OsString::from(command)];
        let path_ext =
            env::var_os("PATHEXT").unwrap_or_else(|| OsString::from(".COM;.EXE;.BAT;.CMD"));
        for ext in path_ext.to_string_lossy().split(';') {
            let ext = ext.trim();
            if ext.is_empty() {
                continue;
            }
            names.push(OsString::from(format!("{command}{ext}")));
        }
        names
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![OsString::from(command)]
    }
}

fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

fn current_process_path_contains(dir: &Path) -> bool {
    env::var_os("PATH")
        .map(|path_var| path_string_contains_dir(&path_var, dir))
        .unwrap_or(false)
}

fn path_string_contains_dir(path_value: &OsStr, dir: &Path) -> bool {
    env::split_paths(path_value).any(|entry| paths_equal(&entry, dir))
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    normalize_path(left) == normalize_path(right)
}

fn normalize_path(path: &Path) -> String {
    let mut normalized = path.to_string_lossy().replace('\\', "/");
    while normalized.ends_with('/') && normalized.len() > 1 {
        normalized.pop();
    }

    if cfg!(target_os = "windows") {
        normalized.make_ascii_lowercase();
    }

    normalized
}

fn build_path_hint(dir: &Path) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let _ = dir;
        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        Some(format!(
            "将 {} 加入 PATH，例如：export PATH=\"{}:$PATH\"",
            dir.display(),
            dir.display()
        ))
    }
}

struct PathUpdate {
    configured: bool,
    updated: bool,
}

fn ensure_install_dir_on_path(dir: &Path) -> Result<PathUpdate, String> {
    #[cfg(target_os = "windows")]
    {
        if windows_user_path_contains(dir)? {
            return Ok(PathUpdate {
                configured: true,
                updated: false,
            });
        }

        let updated = append_windows_user_path(dir)?;
        if updated {
            broadcast_windows_environment_change();
        }

        return Ok(PathUpdate {
            configured: true,
            updated,
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(PathUpdate {
            configured: current_process_path_contains(dir),
            updated: false,
        })
    }
}

fn is_install_dir_configured_in_path(dir: &Path) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        return windows_user_path_contains(dir)
            .map(|configured| configured || current_process_path_contains(dir));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(current_process_path_contains(dir))
    }
}

fn remove_install_dir_from_path(dir: &Path) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let removed = remove_windows_user_path(dir)?;
        if removed {
            broadcast_windows_environment_change();
        }
        return Ok(removed);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = dir;
        Ok(false)
    }
}

#[cfg(target_os = "windows")]
fn windows_user_path_contains(dir: &Path) -> Result<bool, String> {
    read_windows_user_path().map(|path| {
        path.as_deref()
            .map(|value| path_string_contains_dir(OsStr::new(value), dir))
            .unwrap_or(false)
    })
}

#[cfg(target_os = "windows")]
fn append_windows_user_path(dir: &Path) -> Result<bool, String> {
    let existing = read_windows_user_path()?.unwrap_or_default();
    let mut paths: Vec<PathBuf> = env::split_paths(OsStr::new(&existing)).collect();
    if paths.iter().any(|entry| paths_equal(entry, dir)) {
        return Ok(false);
    }

    paths.push(dir.to_path_buf());
    write_windows_user_path(&paths)?;
    Ok(true)
}

#[cfg(target_os = "windows")]
fn remove_windows_user_path(dir: &Path) -> Result<bool, String> {
    let existing = match read_windows_user_path()? {
        Some(path) => path,
        None => return Ok(false),
    };
    let mut changed = false;
    let filtered: Vec<PathBuf> = env::split_paths(OsStr::new(&existing))
        .filter(|entry| {
            let keep = !paths_equal(entry, dir);
            if !keep {
                changed = true;
            }
            keep
        })
        .collect();

    if !changed {
        return Ok(false);
    }

    write_windows_user_path(&filtered)?;
    Ok(true)
}

#[cfg(target_os = "windows")]
fn read_windows_user_path() -> Result<Option<String>, String> {
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_READ},
        RegKey,
    };

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env_key = hkcu
        .open_subkey_with_flags("Environment", KEY_READ)
        .map_err(|e| format!("读取 Windows PATH 失败: {e}"))?;

    match env_key.get_value::<String, _>("Path") {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("读取 Windows PATH 失败: {error}")),
    }
}

#[cfg(target_os = "windows")]
fn write_windows_user_path(paths: &[PathBuf]) -> Result<(), String> {
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_EXPAND_SZ},
        RegKey, RegValue,
    };

    let joined = env::join_paths(paths)
        .map_err(|e| format!("写入 Windows PATH 失败: {e}"))?
        .to_string_lossy()
        .to_string();
    let bytes = encode_windows_reg_string(&joined);
    let reg_value = RegValue {
        bytes,
        vtype: REG_EXPAND_SZ,
    };

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env_key = hkcu
        .open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| format!("打开 Windows PATH 失败: {e}"))?;
    env_key
        .set_raw_value("Path", &reg_value)
        .map_err(|e| format!("写入 Windows PATH 失败: {e}"))
}

#[cfg(target_os = "windows")]
fn encode_windows_reg_string(value: &str) -> Vec<u8> {
    value
        .encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(|unit| unit.to_le_bytes())
        .collect()
}

#[cfg(target_os = "windows")]
fn broadcast_windows_environment_change() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    let parameter: Vec<u16> = "Environment\0".encode_utf16().collect();
    unsafe {
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            parameter.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            5000,
            std::ptr::null_mut(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{build_path_hint, is_usable_binary, normalize_path};
    use std::{fs, path::Path};
    use tempfile::tempdir;

    #[test]
    fn zero_length_placeholder_is_not_treated_as_binary() {
        let dir = tempdir().expect("tempdir");
        let file = dir.path().join("mado");
        fs::write(&file, b"").expect("write placeholder");
        assert!(!is_usable_binary(&file));

        fs::write(&file, b"not empty").expect("write binary");
        assert!(is_usable_binary(&file));
    }

    #[test]
    fn normalize_path_drops_trailing_separators() {
        assert_eq!(normalize_path(Path::new("/tmp/demo/")), "/tmp/demo");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_path_hint_includes_export_command() {
        let hint = build_path_hint(Path::new("/tmp/madora/bin")).expect("hint");
        assert!(hint.contains("export PATH"));
        assert!(hint.contains("/tmp/madora/bin"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_normalize_path_is_case_insensitive() {
        assert_eq!(
            normalize_path(Path::new("C:\\Users\\Test\\")),
            "c:/users/test"
        );
    }
}
