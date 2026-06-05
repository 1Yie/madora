use std::path::PathBuf;

use crate::{
    models::git::{GitAuth, GitBranchInfo, GitCredentials, GitLogEntry, GitStatus, GitSyncResult},
    services::git as git_service,
};

#[tauri::command]
pub async fn git_status(root_path: String) -> Result<GitStatus, String> {
    git_service::status(PathBuf::from(root_path)).await
}

#[tauri::command]
pub async fn git_init(root_path: String) -> Result<GitStatus, String> {
    git_service::init_repository(PathBuf::from(root_path)).await
}

#[tauri::command]
pub async fn git_set_remote(
    root_path: String,
    remote_name: String,
    remote_url: String,
) -> Result<GitStatus, String> {
    git_service::set_remote(PathBuf::from(root_path), remote_name, remote_url).await
}

#[tauri::command]
pub async fn git_commit_all(
    root_path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    git_service::commit_all(PathBuf::from(root_path), message, author_name, author_email).await
}

#[tauri::command]
pub async fn git_pull(
    root_path: String,
    remote_name: Option<String>,
    branch_name: Option<String>,
    author_name: Option<String>,
    author_email: Option<String>,
    auth: Option<GitAuth>,
) -> Result<GitSyncResult, String> {
    git_service::pull(
        PathBuf::from(root_path),
        remote_name.unwrap_or_else(|| "origin".to_string()),
        branch_name,
        author_name,
        author_email,
        auth,
    )
    .await
}

#[tauri::command]
pub async fn git_fetch(
    root_path: String,
    remote_name: Option<String>,
    auth: Option<GitAuth>,
) -> Result<GitStatus, String> {
    git_service::fetch(
        PathBuf::from(root_path),
        remote_name.unwrap_or_else(|| "origin".to_string()),
        auth,
    )
    .await
}

#[tauri::command]
pub async fn git_commit(
    root_path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    git_service::commit(PathBuf::from(root_path), message, author_name, author_email).await
}

#[tauri::command]
pub async fn git_push(
    root_path: String,
    remote_name: Option<String>,
    branch_name: Option<String>,
    auth: Option<GitAuth>,
) -> Result<GitSyncResult, String> {
    git_service::push(
        PathBuf::from(root_path),
        remote_name.unwrap_or_else(|| "origin".to_string()),
        branch_name,
        auth,
    )
    .await
}

#[tauri::command]
pub async fn git_stage_file(root_path: String, path: String) -> Result<GitStatus, String> {
    git_service::stage_file(PathBuf::from(root_path), PathBuf::from(path)).await
}

#[tauri::command]
pub async fn git_unstage_file(root_path: String, path: String) -> Result<GitStatus, String> {
    git_service::unstage_file(PathBuf::from(root_path), PathBuf::from(path)).await
}

#[tauri::command]
pub async fn git_restore_file(root_path: String, path: String) -> Result<GitStatus, String> {
    git_service::restore_file(PathBuf::from(root_path), PathBuf::from(path)).await
}

#[tauri::command]
pub async fn git_log(root_path: String, limit: Option<usize>) -> Result<Vec<GitLogEntry>, String> {
    git_service::read_log(PathBuf::from(root_path), limit.unwrap_or(usize::MAX)).await
}

#[tauri::command]
pub async fn git_pick_ssh_private_key_file() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("选择 SSH 私钥文件")
            .pick_file()
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn git_undo_last_commit(root_path: String) -> Result<GitSyncResult, String> {
    git_service::undo_last_commit(PathBuf::from(root_path)).await
}

#[tauri::command]
pub async fn git_revert_commit(
    root_path: String,
    commit_id: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    git_service::revert_commit(
        PathBuf::from(root_path),
        commit_id,
        author_name,
        author_email,
    )
    .await
}

#[tauri::command]
pub async fn git_list_branches(root_path: String) -> Result<Vec<GitBranchInfo>, String> {
    git_service::list_branches(PathBuf::from(root_path)).await
}

#[tauri::command]
pub async fn git_create_branch(
    root_path: String,
    branch_name: String,
) -> Result<GitStatus, String> {
    git_service::create_branch(PathBuf::from(root_path), branch_name).await
}

#[tauri::command]
pub async fn git_switch_branch(
    root_path: String,
    branch_name: String,
) -> Result<GitStatus, String> {
    git_service::switch_branch(PathBuf::from(root_path), branch_name).await
}

#[tauri::command]
pub async fn git_store_credentials(
    app_handle: tauri::AppHandle,
    credentials: GitCredentials,
) -> Result<(), String> {
    git_service::store_credentials(app_handle, credentials).await
}

#[tauri::command]
pub async fn git_load_credentials(app_handle: tauri::AppHandle) -> Result<GitCredentials, String> {
    git_service::load_credentials(app_handle).await
}
