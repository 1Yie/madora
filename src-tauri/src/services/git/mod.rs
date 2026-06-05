mod auth;
mod branch;
mod error;
mod history;
mod locking;
mod remote;
mod repository;
mod status;

use std::path::PathBuf;

use tauri::AppHandle;

use crate::models::git::{
    GitAuth, GitBranchInfo, GitCredentials, GitLogEntry, GitStatus, GitSyncResult,
};

use error::GitResult;

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> GitResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

async fn run_repo_task<T, F>(root_path: PathBuf, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf) -> GitResult<T> + Send + 'static,
{
    let _guard = locking::acquire_repo_lock(&root_path).await;
    run_blocking(move || task(root_path)).await
}

pub async fn status(root_path: PathBuf) -> Result<GitStatus, String> {
    run_repo_task(root_path, |root_path| {
        status::read_status_or_empty(&root_path)
    })
    .await
}

pub async fn init_repository(root_path: PathBuf) -> Result<GitStatus, String> {
    run_repo_task(root_path, |root_path| {
        let repo = git2::Repository::init(&root_path)?;
        repository::write_editor_managed_marker(&repo)?;
        status::read_repo_status(&repo)
    })
    .await
}

pub async fn set_remote(
    root_path: PathBuf,
    remote_name: String,
    remote_url: String,
) -> Result<GitStatus, String> {
    run_repo_task(root_path, move |root_path| {
        remote::set_remote(&root_path, &remote_name, &remote_url)
    })
    .await
}

pub async fn commit_all(
    root_path: PathBuf,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    run_repo_task(root_path, move |root_path| {
        history::commit_all(
            &root_path,
            &message,
            author_name.as_deref(),
            author_email.as_deref(),
        )
    })
    .await
}

pub async fn pull(
    root_path: PathBuf,
    remote_name: String,
    branch_name: Option<String>,
    author_name: Option<String>,
    author_email: Option<String>,
    auth_config: Option<GitAuth>,
) -> Result<GitSyncResult, String> {
    run_repo_task(root_path, move |root_path| {
        remote::pull(
            &root_path,
            &remote_name,
            branch_name.as_deref(),
            author_name.as_deref(),
            author_email.as_deref(),
            auth_config.as_ref(),
        )
    })
    .await
}

pub async fn fetch(
    root_path: PathBuf,
    remote_name: String,
    auth_config: Option<GitAuth>,
) -> Result<GitStatus, String> {
    run_repo_task(root_path, move |root_path| {
        remote::fetch(&root_path, &remote_name, auth_config.as_ref())
    })
    .await
}

pub async fn commit(
    root_path: PathBuf,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    run_repo_task(root_path, move |root_path| {
        history::commit(
            &root_path,
            &message,
            author_name.as_deref(),
            author_email.as_deref(),
        )
    })
    .await
}

pub async fn push(
    root_path: PathBuf,
    remote_name: String,
    branch_name: Option<String>,
    auth_config: Option<GitAuth>,
) -> Result<GitSyncResult, String> {
    run_repo_task(root_path, move |root_path| {
        remote::push(
            &root_path,
            &remote_name,
            branch_name.as_deref(),
            auth_config.as_ref(),
        )
    })
    .await
}

pub async fn stage_file(root_path: PathBuf, path: PathBuf) -> Result<GitStatus, String> {
    run_repo_task(root_path, move |root_path| {
        branch::stage_file(&root_path, &path)
    })
    .await
}

pub async fn unstage_file(root_path: PathBuf, path: PathBuf) -> Result<GitStatus, String> {
    run_repo_task(root_path, move |root_path| {
        branch::unstage_file(&root_path, &path)
    })
    .await
}

pub async fn restore_file(root_path: PathBuf, path: PathBuf) -> Result<GitStatus, String> {
    run_repo_task(root_path, move |root_path| {
        branch::restore_file(&root_path, &path)
    })
    .await
}

pub async fn read_log(root_path: PathBuf, limit: usize) -> Result<Vec<GitLogEntry>, String> {
    run_repo_task(root_path, move |root_path| {
        history::read_log(&root_path, limit)
    })
    .await
}

pub async fn undo_last_commit(root_path: PathBuf) -> Result<GitSyncResult, String> {
    run_repo_task(root_path, move |root_path| {
        history::undo_last_commit(&root_path)
    })
    .await
}

pub async fn revert_commit(
    root_path: PathBuf,
    commit_id: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    run_repo_task(root_path, move |root_path| {
        history::revert_commit(
            &root_path,
            &commit_id,
            author_name.as_deref(),
            author_email.as_deref(),
        )
    })
    .await
}

pub async fn list_branches(root_path: PathBuf) -> Result<Vec<GitBranchInfo>, String> {
    run_repo_task(root_path, move |root_path| {
        branch::list_branches(&root_path)
    })
    .await
}

pub async fn create_branch(root_path: PathBuf, branch_name: String) -> Result<GitStatus, String> {
    run_repo_task(root_path, move |root_path| {
        branch::create_branch(&root_path, &branch_name)
    })
    .await
}

pub async fn switch_branch(root_path: PathBuf, branch_name: String) -> Result<GitStatus, String> {
    run_repo_task(root_path, move |root_path| {
        branch::switch_branch(&root_path, &branch_name)
    })
    .await
}

pub async fn store_credentials(
    app_handle: AppHandle,
    credentials: GitCredentials,
) -> Result<(), String> {
    run_blocking(move || auth::store_credentials(&app_handle, &credentials)).await
}

pub async fn load_credentials(app_handle: AppHandle) -> Result<GitCredentials, String> {
    run_blocking(move || auth::load_credentials(&app_handle)).await
}
