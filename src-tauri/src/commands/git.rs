use std::path::{Path, PathBuf};

use git2::{
    BranchType, Cred, Error, ErrorCode, FetchOptions, IndexAddOption, PushOptions, RemoteCallbacks,
    Repository, ResetType, Signature, Status, StatusOptions,
};
use tauri::Manager;

use crate::models::git::{
    GitAuth, GitBranchInfo, GitBranchStatus, GitCredentials, GitFileState, GitFileStatus,
    GitLogEntry, GitRemoteInfo, GitRepositoryState, GitStatus, GitSyncResult,
};

fn to_error_message(error: Error) -> String {
    error.message().to_string()
}

fn empty_git_status() -> GitStatus {
    GitStatus {
        branch: None,
        conflicted_files: Vec::new(),
        has_repository: false,
        has_staged_changes: false,
        has_unstaged_changes: false,
        has_untracked_files: false,
        is_merging: false,
        remotes: Vec::new(),
        repository_state: GitRepositoryState::Clean,
        staged_count: 0,
        total_changed_count: 0,
        unstaged_count: 0,
        files: Vec::new(),
    }
}

fn discover_repo(root_path: &Path) -> Result<Repository, Error> {
    Repository::discover(root_path)
}

fn is_editor_managed_repo(repo: &Repository) -> bool {
    repo.path().join("EDITOR_MANAGED").exists()
}

fn relative_repo_path(repo: &Repository, path: &Path) -> Result<PathBuf, String> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| "当前仓库没有可用的工作区目录".to_string())?;

    path.strip_prefix(workdir)
        .map(Path::to_path_buf)
        .map_err(|_| format!("路径不在仓库工作区内: {}", path.display()))
}

fn normalize_repo_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn build_remote_callbacks<'a>(
    repo: &'a Repository,
    auth: Option<&'a GitAuth>,
) -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();

    callbacks.credentials(move |url, username_from_url, allowed_types| {
        if allowed_types.is_ssh_key() {
            let ssh_username = auth
                .and_then(|value| value.ssh_username.as_deref())
                .or(username_from_url)
                .unwrap_or("git");

            if let Some(private_key_path) =
                auth.and_then(|value| value.ssh_private_key_path.as_deref())
            {
                return Cred::ssh_key(
                    ssh_username,
                    None,
                    Path::new(private_key_path),
                    auth.and_then(|value| value.ssh_passphrase.as_deref()),
                );
            }

            let has_ssh_sock = std::env::var("SSH_AUTH_SOCK")
                .map(|sock| Path::new(&sock).exists())
                .unwrap_or(false);

            if has_ssh_sock {
                if let Some(username) = username_from_url {
                    if let Ok(cred) = Cred::ssh_key_from_agent(username) {
                        return Ok(cred);
                    }
                }

                if let Ok(cred) = Cred::ssh_key_from_agent(ssh_username) {
                    return Ok(cred);
                }
            }
        }

        if allowed_types.is_user_pass_plaintext() {
            if let Some(auth) = auth {
                let password = auth.password.as_deref().unwrap_or_default();
                let username = auth
                    .username
                    .as_deref()
                    .or(username_from_url)
                    .unwrap_or("git");

                if !password.is_empty() {
                    return Cred::userpass_plaintext(username, password);
                }
            }

            if let Ok(config) = repo.config() {
                if let Ok(cred) = Cred::credential_helper(&config, url, username_from_url) {
                    return Ok(cred);
                }
            }
        }

        if allowed_types.is_username() {
            if let Some(username) = auth
                .and_then(|value| value.username.as_deref())
                .or(username_from_url)
            {
                return Cred::username(username);
            }
        }

        Err(Error::from_str(
            "认证失败：请在工作区底部的 SSH 设置中填写 SSH 私钥路径或用户名密码",
        ))
    });

    callbacks
}

fn build_signature(
    repo: &Repository,
    author_name: Option<&str>,
    author_email: Option<&str>,
) -> Result<Signature<'static>, Error> {
    match (author_name, author_email) {
        (Some(name), Some(email)) => Signature::now(name, email),
        _ => repo.signature(),
    }
}

fn current_branch_status(repo: &Repository) -> Result<Option<GitBranchStatus>, Error> {
    let head = match repo.head() {
        Ok(head) => head,
        Err(error) if error.code() == ErrorCode::UnbornBranch => return Ok(None),
        Err(error) => return Err(error),
    };

    if !head.is_branch() {
        return Ok(Some(GitBranchStatus {
            name: Some("HEAD".to_string()),
            upstream: None,
            ahead: 0,
            behind: 0,
        }));
    }

    let shorthand = head.shorthand().map(str::to_string);
    let mut ahead = 0;
    let mut behind = 0;
    let mut upstream = None;

    if let Some(branch_name) = shorthand.as_deref() {
        let branch = repo.find_branch(branch_name, BranchType::Local)?;

        if let Ok(upstream_branch) = branch.upstream() {
            upstream = upstream_branch.name()?.map(str::to_string);

            if let (Some(local_target), Some(upstream_target)) =
                (branch.get().target(), upstream_branch.get().target())
            {
                let (next_ahead, next_behind) =
                    repo.graph_ahead_behind(local_target, upstream_target)?;
                ahead = next_ahead;
                behind = next_behind;
            }
        }
    }

    Ok(Some(GitBranchStatus {
        name: shorthand,
        upstream,
        ahead,
        behind,
    }))
}

fn collect_remotes(repo: &Repository) -> Result<Vec<GitRemoteInfo>, Error> {
    let remotes = repo.remotes()?;
    let mut values = Vec::new();

    for name in remotes.iter().flatten() {
        let remote = repo.find_remote(name)?;
        values.push(GitRemoteInfo {
            name: name.to_string(),
            url: remote.url().map(str::to_string),
        });
    }

    Ok(values)
}

fn map_file_state(status: Status, staged: bool) -> GitFileState {
    if status.is_conflicted() {
        return GitFileState::Conflicted;
    }

    if staged {
        if status.is_index_new() {
            return GitFileState::Added;
        }

        if status.is_index_deleted() {
            return GitFileState::Deleted;
        }

        if status.is_index_renamed() {
            return GitFileState::Renamed;
        }

        if status.is_index_typechange() {
            return GitFileState::Typechange;
        }
    }

    if status.is_wt_new() {
        return GitFileState::Untracked;
    }

    if status.is_wt_deleted() {
        return GitFileState::Deleted;
    }

    if status.is_wt_typechange() {
        return GitFileState::Typechange;
    }

    if status.is_wt_renamed() {
        return GitFileState::Renamed;
    }

    if status.is_index_modified() || status.is_wt_modified() {
        return GitFileState::Modified;
    }

    GitFileState::Modified
}

fn collect_conflicts(repo: &Repository) -> Result<Vec<String>, Error> {
    let index = repo.index()?;

    if !index.has_conflicts() {
        return Ok(Vec::new());
    }

    let mut conflicts = Vec::new();

    if let Ok(iter) = index.conflicts() {
        for conflict in iter.flatten() {
            let path = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .and_then(|entry| std::str::from_utf8(&entry.path).ok())
                .map(str::to_string);

            if let Some(path) = path {
                conflicts.push(path);
            }
        }
    }

    conflicts.sort();
    conflicts.dedup();

    Ok(conflicts)
}

fn read_git_status(root_path: &Path) -> Result<GitStatus, Error> {
    let repo = discover_repo(root_path)?;
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_unmodified(false);

    let statuses = repo.statuses(Some(&mut options))?;
    let mut files = Vec::new();
    let mut staged_count = 0;
    let mut unstaged_count = 0;
    let mut has_untracked_files = false;

    for entry in statuses.iter() {
        let status = entry.status();

        if status.is_ignored() || status.is_empty() {
            continue;
        }

        let staged = status.is_index_new()
            || status.is_index_modified()
            || status.is_index_deleted()
            || status.is_index_renamed()
            || status.is_index_typechange();
        let unstaged = status.is_wt_new()
            || status.is_wt_modified()
            || status.is_wt_deleted()
            || status.is_wt_renamed()
            || status.is_wt_typechange();

        staged_count += usize::from(staged || status.is_conflicted());
        unstaged_count += usize::from(unstaged);
        has_untracked_files |= status.is_wt_new();

        let path = entry
            .head_to_index()
            .and_then(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
            .or_else(|| {
                entry
                    .index_to_workdir()
                    .and_then(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
            })
            .map(|value| {
                let absolute_path = repo
                    .workdir()
                    .map(|workdir| workdir.join(value))
                    .unwrap_or_else(|| value.to_path_buf());

                normalize_repo_path(&absolute_path)
            })
            .unwrap_or_else(String::new);

        let has_conflict_markers = if status.is_conflicted() {
            std::fs::read_to_string(&path)
                .map(|content| content.contains("<<<<<<<"))
                .unwrap_or(false)
        } else {
            false
        };

        files.push(GitFileStatus {
            path,
            staged,
            unstaged,
            status: map_file_state(status, staged),
            has_conflict_markers,
        });
    }

    let branch = current_branch_status(&repo)?;
    let conflicted_files = collect_conflicts(&repo)?;
    let remotes = collect_remotes(&repo)?;

    let repository_state = match repo.state() {
        git2::RepositoryState::Merge => GitRepositoryState::Merge,
        git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence => {
            GitRepositoryState::Revert
        }
        git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence => {
            GitRepositoryState::CherryPick
        }
        git2::RepositoryState::Bisect => GitRepositoryState::Bisect,
        git2::RepositoryState::Rebase
        | git2::RepositoryState::RebaseInteractive
        | git2::RepositoryState::RebaseMerge => GitRepositoryState::Rebase,
        _ => GitRepositoryState::Clean,
    };

    Ok(GitStatus {
        branch,
        conflicted_files: conflicted_files.clone(),
        has_repository: true,
        has_staged_changes: staged_count > 0,
        has_unstaged_changes: unstaged_count > 0,
        has_untracked_files,
        is_merging: repo.state() == git2::RepositoryState::Merge,
        remotes,
        repository_state,
        staged_count,
        total_changed_count: files.len(),
        unstaged_count,
        files,
    })
}

fn ensure_remote(repo: &Repository, remote_name: &str, remote_url: &str) -> Result<(), Error> {
    match repo.find_remote(remote_name) {
        Ok(_) => repo.remote_set_url(remote_name, remote_url),
        Err(error) if error.code() == ErrorCode::NotFound => {
            repo.remote(remote_name, remote_url).map(|_| ())
        }
        Err(error) => Err(error),
    }
}

fn fast_forward(
    repo: &Repository,
    fetch_commit: &git2::AnnotatedCommit<'_>,
    branch_name: &str,
) -> Result<(), Error> {
    let refname = match repo.head() {
        Ok(head) => head
            .name()
            .ok_or_else(|| Error::from_str("无法解析当前分支引用"))?
            .to_string(),
        Err(error) if error.code() == ErrorCode::UnbornBranch => {
            format!("refs/heads/{branch_name}")
        }
        Err(error) => return Err(error),
    };
    let message = format!(
        "Fast-Forward: Setting {} to id: {}",
        refname,
        fetch_commit.id()
    );
    let mut reference = match repo.find_reference(&refname) {
        Ok(reference) => reference,
        Err(_) => repo.reference(&refname, fetch_commit.id(), true, &message)?,
    };

    reference.set_target(fetch_commit.id(), &message)?;
    repo.set_head(&refname)?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force();
    repo.checkout_head(Some(&mut checkout))?;

    Ok(())
}

fn normal_merge(
    repo: &Repository,
    fetch_commit: &git2::AnnotatedCommit<'_>,
    author_name: Option<&str>,
    author_email: Option<&str>,
) -> Result<GitSyncResult, Error> {
    let head_commit = repo.reference_to_annotated_commit(&repo.head()?)?;
    let our_commit = repo.find_commit(head_commit.id())?;
    let their_commit = repo.find_commit(fetch_commit.id())?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout
        .allow_conflicts(true)
        .conflict_style_merge(true)
        .safe();
    repo.merge(&[fetch_commit], None, Some(&mut checkout))?;

    let mut index = repo.index()?;
    if index.has_conflicts() {
        index.write()?;
        let conflicts = collect_conflicts(repo)?;
        return Ok(GitSyncResult {
            branch: repo
                .head()
                .ok()
                .and_then(|head| head.shorthand().map(str::to_string)),
            conflicts,
            message: "拉取完成，但存在冲突，请先解决冲突后再提交".to_string(),
        });
    }

    let result_tree = repo.find_tree(index.write_tree_to(repo)?)?;
    let signature = build_signature(repo, author_name, author_email)?;
    let merge_message = repo
        .message()
        .unwrap_or_else(|_| format!("Merge commit '{}'", their_commit.id()));

    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &merge_message,
        &result_tree,
        &[&our_commit, &their_commit],
    )?;
    repo.checkout_head(None)?;
    repo.cleanup_state()?;

    Ok(GitSyncResult {
        branch: repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(str::to_string)),
        conflicts: Vec::new(),
        message: "拉取并合并成功".to_string(),
    })
}

fn pull_repo(
    root_path: &Path,
    remote_name: &str,
    branch_name: Option<&str>,
    author_name: Option<&str>,
    author_email: Option<&str>,
    auth: Option<&GitAuth>,
) -> Result<GitSyncResult, Error> {
    let repo = discover_repo(root_path)?;
    if !is_editor_managed_repo(&repo) {
        return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
    }
    let branch = match branch_name {
        Some(branch) => branch.to_string(),
        None => current_branch_status(&repo)?
            .and_then(|value| value.name)
            .ok_or_else(|| Error::from_str("当前没有可用的本地分支，无法拉取"))?,
    };

    let mut remote = repo.find_remote(remote_name)?;
    let callbacks = build_remote_callbacks(&repo, auth);
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    remote.fetch(&[] as &[&str], Some(&mut fetch_options), None)?;

    let fetch_head = repo.find_reference(&format!("refs/remotes/{remote_name}/{branch}"))?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;
    let (analysis, _) = repo.merge_analysis(&[&fetch_commit])?;

    if analysis.is_up_to_date() {
        return Ok(GitSyncResult {
            branch: Some(branch),
            conflicts: Vec::new(),
            message: "已经是最新版本".to_string(),
        });
    }

    if analysis.is_fast_forward() || analysis.is_unborn() {
        fast_forward(&repo, &fetch_commit, &branch)?;

        return Ok(GitSyncResult {
            branch: repo
                .head()
                .ok()
                .and_then(|head| head.shorthand().map(str::to_string)),
            conflicts: Vec::new(),
            message: "拉取成功，已快进更新".to_string(),
        });
    }

    if analysis.is_normal() {
        return normal_merge(&repo, &fetch_commit, author_name, author_email);
    }

    Err(Error::from_str("当前仓库状态不支持自动拉取"))
}

fn push_repo(
    root_path: &Path,
    remote_name: &str,
    branch_name: Option<&str>,
    auth: Option<&GitAuth>,
) -> Result<GitSyncResult, Error> {
    let repo = discover_repo(root_path)?;
    if !is_editor_managed_repo(&repo) {
        return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
    }
    let branch = match branch_name {
        Some(branch) => branch.to_string(),
        None => current_branch_status(&repo)?
            .and_then(|value| value.name)
            .ok_or_else(|| Error::from_str("当前没有可用的本地分支，无法推送"))?,
    };

    let mut remote = repo.find_remote(remote_name)?;
    let callbacks = build_remote_callbacks(&repo, auth);
    let mut push_options = PushOptions::new();
    push_options.remote_callbacks(callbacks);
    remote.push(
        &[format!("refs/heads/{branch}:refs/heads/{branch}")],
        Some(&mut push_options),
    )?;

    if let Ok(mut local_branch) = repo.find_branch(&branch, BranchType::Local) {
        let _ = local_branch.set_upstream(Some(&format!("{remote_name}/{branch}")));
    }

    Ok(GitSyncResult {
        branch: Some(branch),
        conflicts: Vec::new(),
        message: "推送成功".to_string(),
    })
}

fn read_git_log(root_path: &Path, limit: usize) -> Result<Vec<GitLogEntry>, Error> {
    let repo = discover_repo(root_path)?;
    if !is_editor_managed_repo(&repo) {
        return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
    }
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;

    let mut entries = Vec::new();

    for oid in revwalk.take(limit) {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;
        let committed_at =
            chrono::DateTime::<chrono::Utc>::from_timestamp(commit.time().seconds(), 0)
                .map(|value| {
                    value
                        .with_timezone(&chrono::Local)
                        .format("%Y-%m-%d %H:%M")
                        .to_string()
                })
                .unwrap_or_else(|| "未知时间".to_string());

        entries.push(GitLogEntry {
            id: oid.to_string(),
            summary: commit.summary().unwrap_or("无提交说明").to_string(),
            author_name: commit.author().name().unwrap_or("Unknown").to_string(),
            committed_at,
        });
    }

    Ok(entries)
}

fn ensure_clean_for_history_mutation(repo: &Repository) -> Result<(), Error> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_unmodified(false);

    let statuses = repo.statuses(Some(&mut options))?;

    if statuses
        .iter()
        .any(|entry| !entry.status().is_ignored() && !entry.status().is_empty())
    {
        return Err(Error::from_str(
            "当前工作区有未提交更改，请先提交、暂存或清理后再执行历史管理操作",
        ));
    }

    Ok(())
}

fn undo_last_commit(root_path: &Path) -> Result<GitSyncResult, Error> {
    let repo = discover_repo(root_path)?;
    if !is_editor_managed_repo(&repo) {
        return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
    }
    ensure_clean_for_history_mutation(&repo)?;

    let head = repo.head()?;
    let head_target = head
        .target()
        .ok_or_else(|| Error::from_str("当前 HEAD 没有指向有效提交"))?;
    let head_commit = repo.find_commit(head_target)?;

    let parent = head_commit
        .parent(0)
        .map_err(|_| Error::from_str("当前提交没有父提交，无法撤销最近一次提交"))?;
    let parent_object = repo.find_object(parent.id(), None)?;

    repo.reset(&parent_object, ResetType::Mixed, None)?;

    Ok(GitSyncResult {
        branch: repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(str::to_string)),
        conflicts: Vec::new(),
        message: format!("已撤销最近提交 {}，改动保留在工作区", head_commit.id()),
    })
}

fn revert_commit(
    root_path: &Path,
    commit_id: &str,
    author_name: Option<&str>,
    author_email: Option<&str>,
) -> Result<GitSyncResult, Error> {
    let repo = discover_repo(root_path)?;
    if !is_editor_managed_repo(&repo) {
        return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
    }
    ensure_clean_for_history_mutation(&repo)?;

    let oid = git2::Oid::from_str(commit_id)?;
    let commit_to_revert = repo.find_commit(oid)?;
    let signature = build_signature(&repo, author_name, author_email)?;

    let mut revert_options = git2::RevertOptions::new();
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout
        .allow_conflicts(true)
        .conflict_style_merge(true)
        .safe();
    revert_options.checkout_builder(checkout);
    repo.revert(&commit_to_revert, Some(&mut revert_options))?;

    let mut index = repo.index()?;
    if index.has_conflicts() {
        index.write()?;
        let conflicts = collect_conflicts(&repo)?;
        return Ok(GitSyncResult {
            branch: repo
                .head()
                .ok()
                .and_then(|head| head.shorthand().map(str::to_string)),
            conflicts,
            message: "回滚时产生冲突，请解决后提交".to_string(),
        });
    }

    let head_commit = repo.head()?.peel_to_commit()?;
    let revert_tree = repo.find_tree(index.write_tree_to(&repo)?)?;
    let message = format!(
        "Revert \"{}\"\n\nThis reverts commit {}.",
        commit_to_revert.summary().unwrap_or("无提交说明"),
        commit_to_revert.id()
    );

    let new_commit_id = repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &message,
        &revert_tree,
        &[&head_commit],
    )?;

    repo.checkout_head(None)?;
    if repo.state() != git2::RepositoryState::Clean {
        repo.cleanup_state()?;
    }

    Ok(GitSyncResult {
        branch: repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(str::to_string)),
        conflicts: Vec::new(),
        message: format!("已回滚提交 {commit_id}，新提交为 {new_commit_id}"),
    })
}

fn restore_file(root_path: &Path, path: &Path) -> Result<GitStatus, Error> {
    let repo = discover_repo(root_path)?;
    if !is_editor_managed_repo(&repo) {
        return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
    }
    let relative_path = relative_repo_path(&repo, path).map_err(|error| Error::from_str(&error))?;

    let head = repo.head()?;
    let head_commit = head.peel_to_commit()?;
    let head_tree = head_commit.tree()?;

    let tracked_in_head = head_tree.get_path(&relative_path).is_ok();

    if !tracked_in_head {
        let mut index = repo.index()?;
        index.remove_path(&relative_path)?;
        index.write()?;
        return read_git_status(root_path);
    }

    let head_object = head_commit.as_object();

    repo.reset_default(Some(head_object), [&relative_path])?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout
        .force()
        .recreate_missing(true)
        .disable_pathspec_match(true)
        .path(&relative_path);
    repo.checkout_head(Some(&mut checkout))?;

    read_git_status(root_path)
}

#[tauri::command]
pub async fn git_status(root_path: String) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || match discover_repo(&root_path) {
        Ok(repo) if !is_editor_managed_repo(&repo) => Ok(empty_git_status()),
        Ok(_) => read_git_status(&root_path),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(empty_git_status()),
        Err(error) => Err(error),
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_init(root_path: String) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::init(&root_path)?;
        std::fs::write(repo.path().join("EDITOR_MANAGED"), [] as [u8; 0])
            .map_err(|error| Error::from_str(&error.to_string()))?;
        read_git_status(&root_path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_set_remote(
    root_path: String,
    remote_name: String,
    remote_url: String,
) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }
        ensure_remote(&repo, &remote_name, &remote_url)?;
        read_git_status(&root_path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_commit_all(
    root_path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.update_all(["*"].iter(), None)?;
        index.write()?;

        if index.is_empty() {
            return Err(Error::from_str("没有可提交的更改"));
        }

        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        let signature = build_signature(&repo, author_name.as_deref(), author_email.as_deref())?;
        let parent_commit = repo
            .head()
            .ok()
            .and_then(|head| head.target())
            .and_then(|oid| repo.find_commit(oid).ok());

        if let Some(parent_commit) = parent_commit.as_ref() {
            if parent_commit.tree_id() == tree_id {
                return Err(Error::from_str("没有可提交的更改"));
            }
        }

        let merge_head_commit = repo
            .find_reference("MERGE_HEAD")
            .ok()
            .and_then(|reference| reference.target())
            .and_then(|oid| repo.find_commit(oid).ok());

        let commit_id = match (parent_commit.as_ref(), merge_head_commit.as_ref()) {
            (Some(parent_commit), Some(merge_parent)) => repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[parent_commit, merge_parent],
            )?,
            (Some(parent_commit), None) => repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[parent_commit],
            )?,
            (None, _) => repo.commit(Some("HEAD"), &signature, &signature, &message, &tree, &[])?,
        };

        if repo.state() == git2::RepositoryState::Merge {
            repo.cleanup_state()?;
        }

        Ok(GitSyncResult {
            branch: repo
                .head()
                .ok()
                .and_then(|head| head.shorthand().map(str::to_string)),
            conflicts: Vec::new(),
            message: format!("提交成功: {commit_id}"),
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
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
    let root_path = PathBuf::from(root_path);
    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());

    tauri::async_runtime::spawn_blocking(move || {
        pull_repo(
            &root_path,
            &remote_name,
            branch_name.as_deref(),
            author_name.as_deref(),
            author_email.as_deref(),
            auth.as_ref(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_fetch(
    root_path: String,
    remote_name: Option<String>,
    auth: Option<GitAuth>,
) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);
    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }
        let mut remote = repo.find_remote(&remote_name)?;
        let callbacks = build_remote_callbacks(&repo, auth.as_ref());
        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);
        remote
            .fetch(&[] as &[&str], Some(&mut fetch_options), None)?;
        read_git_status(&root_path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_commit(
    root_path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }
        let mut index = repo.index()?;
        index.write()?;

        if index.is_empty() {
            return Err(Error::from_str("暂存区为空，请先暂存文件"));
        }

        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        let signature = build_signature(&repo, author_name.as_deref(), author_email.as_deref())?;
        let parent_commit = repo
            .head()
            .ok()
            .and_then(|head| head.target())
            .and_then(|oid| repo.find_commit(oid).ok());

        if let Some(parent_commit) = parent_commit.as_ref() {
            if parent_commit.tree_id() == tree_id {
                return Err(Error::from_str("没有可提交的更改"));
            }
        }

        let merge_head_commit = repo
            .find_reference("MERGE_HEAD")
            .ok()
            .and_then(|reference| reference.target())
            .and_then(|oid| repo.find_commit(oid).ok());

        let commit_id = match (parent_commit.as_ref(), merge_head_commit.as_ref()) {
            (Some(parent_commit), Some(merge_parent)) => repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[parent_commit, merge_parent],
            )?,
            (Some(parent_commit), None) => repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[parent_commit],
            )?,
            (None, _) => repo.commit(Some("HEAD"), &signature, &signature, &message, &tree, &[])?,
        };

        if repo.state() == git2::RepositoryState::Merge {
            repo.cleanup_state()?;
        }

        Ok(GitSyncResult {
            branch: repo
                .head()
                .ok()
                .and_then(|head| head.shorthand().map(str::to_string)),
            conflicts: Vec::new(),
            message: format!("提交成功: {commit_id}"),
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_push(
    root_path: String,
    remote_name: Option<String>,
    branch_name: Option<String>,
    auth: Option<GitAuth>,
) -> Result<GitSyncResult, String> {
    let root_path = PathBuf::from(root_path);
    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());

    tauri::async_runtime::spawn_blocking(move || {
        push_repo(
            &root_path,
            &remote_name,
            branch_name.as_deref(),
            auth.as_ref(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_stage_file(root_path: String, path: String) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);
    let path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }
        let relative_path =
            relative_repo_path(&repo, &path).map_err(|error| Error::from_str(&error))?;
        let mut index = repo.index()?;
        if path.exists() {
            index.add_path(&relative_path)?;
        } else {
            index.remove_path(&relative_path)?;
        }
        index.write()?;
        read_git_status(&root_path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_unstage_file(root_path: String, path: String) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);
    let path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }
        let relative_path =
            relative_repo_path(&repo, &path).map_err(|error| Error::from_str(&error))?;

        let head = repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        if head_tree.get_path(&relative_path).is_ok() {
            let head_object = head_commit.as_object();
            let normalized = PathBuf::from(normalize_repo_path(&relative_path));
            repo.reset_default(Some(head_object), [&normalized])?;
            let mut index = repo.index()?;
            index.write()?;
        } else {
            let mut index = repo.index()?;
            index.remove_path(&relative_path)?;
            index.write()?;
        }
        read_git_status(&root_path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_restore_file(root_path: String, path: String) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);
    let path = PathBuf::from(path);

    tauri::async_runtime::spawn_blocking(move || restore_file(&root_path, &path))
        .await
        .map_err(|error| error.to_string())?
        .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_log(root_path: String, limit: Option<usize>) -> Result<Vec<GitLogEntry>, String> {
    let root_path = PathBuf::from(root_path);
    let limit = limit.unwrap_or(usize::MAX);

    tauri::async_runtime::spawn_blocking(move || read_git_log(&root_path, limit))
        .await
        .map_err(|error| error.to_string())?
        .map_err(to_error_message)
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
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || undo_last_commit(&root_path))
        .await
        .map_err(|error| error.to_string())?
        .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_revert_commit(
    root_path: String,
    commit_id: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitSyncResult, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        revert_commit(
            &root_path,
            &commit_id,
            author_name.as_deref(),
            author_email.as_deref(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_list_branches(root_path: String) -> Result<Vec<GitBranchInfo>, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }

        let head = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(str::to_string));
        let mut branches = Vec::new();

        for branch in repo.branches(Some(BranchType::Local))? {
            let (branch, _) = branch?;
            let name = branch.name()?.unwrap_or("").to_string();

            if !name.is_empty() {
                branches.push(GitBranchInfo {
                    name: name.clone(),
                    is_head: head.as_deref() == Some(&name),
                });
            }
        }

        Ok(branches)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_create_branch(
    root_path: String,
    branch_name: String,
) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }

        let head = match repo.head() {
            Ok(head) => head,
            Err(error) if error.code() == ErrorCode::UnbornBranch => {
                return Err(Error::from_str("当前仓库还没有提交，请先提交后再创建分支"));
            }
            Err(error) => return Err(error),
        };
        let head_commit = head.peel_to_commit()?;
        repo.branch(&branch_name, &head_commit, false)?;
        read_git_status(&root_path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

#[tauri::command]
pub async fn git_switch_branch(
    root_path: String,
    branch_name: String,
) -> Result<GitStatus, String> {
    let root_path = PathBuf::from(root_path);

    tauri::async_runtime::spawn_blocking(move || {
        let repo = discover_repo(&root_path)?;
        if !is_editor_managed_repo(&repo) {
            return Err(Error::from_str("当前目录不是由编辑器管理的 Git 仓库"));
        }

        let refname = format!("refs/heads/{}", branch_name);

        let mut status_opts = StatusOptions::new();
        status_opts
            .include_untracked(true)
            .include_ignored(false)
            .include_unmodified(false);
        let dirty = !repo.statuses(Some(&mut status_opts))?.is_empty();

        if dirty {
            return Err(Error::from_str(
                "工作区有未提交的更改，请先提交或撤销更改后再切换分支",
            ));
        }

        let branch_ref = repo
            .find_reference(&refname)
            .map_err(|_| Error::from_str(&format!("未找到分支: {}", branch_name)))?;
        let commit = branch_ref.peel_to_commit()?;
        let tree = commit.tree()?;

        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.recreate_missing(true);
        repo.checkout_tree(tree.as_object(), Some(&mut checkout))?;

        repo.set_head(&refname)?;

        read_git_status(&root_path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(to_error_message)
}

const CREDENTIALS_FILENAME: &str = "git_credentials.json";

fn credentials_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(data_dir.join(CREDENTIALS_FILENAME))
}

fn store_credentials(app_handle: &tauri::AppHandle, creds: &GitCredentials) -> Result<(), String> {
    let path = credentials_path(app_handle)?;
    let json = serde_json::to_string(creds).map_err(|e| format!("序列化凭证失败: {e}"))?;
    std::fs::write(&path, json.as_bytes()).map_err(|e| format!("写入凭证文件失败: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("设置凭证文件权限失败: {e}"))?;
    }

    #[cfg(windows)]
    {
        let mut perms = std::fs::metadata(&path)
            .map_err(|e| format!("读取凭证文件元数据失败: {e}"))?
            .permissions();
        perms.set_readonly(false);
        std::fs::set_permissions(&path, perms)
            .map_err(|e| format!("设置凭证文件权限失败: {e}"))?;
    }

    Ok(())
}

fn load_credentials(app_handle: &tauri::AppHandle) -> Result<GitCredentials, String> {
    let path = credentials_path(app_handle)?;
    match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).map_err(|e| format!("解析凭证文件失败: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(GitCredentials::default()),
        Err(e) => Err(format!("读取凭证文件失败: {e}")),
    }
}

#[tauri::command]
pub async fn git_store_credentials(
    app_handle: tauri::AppHandle,
    credentials: GitCredentials,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || store_credentials(&app_handle, &credentials))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_load_credentials(
    app_handle: tauri::AppHandle,
) -> Result<GitCredentials, String> {
    tauri::async_runtime::spawn_blocking(move || load_credentials(&app_handle))
        .await
        .map_err(|e| e.to_string())?
}
