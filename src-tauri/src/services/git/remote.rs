use std::path::Path;

use git2::{BranchType, FetchOptions, PushOptions, Repository};

use crate::models::git::{GitAuth, GitStatus, GitSyncResult};

use super::{
    auth,
    error::{GitResult, GitServiceError},
    repository, status,
};

pub(crate) fn set_remote(
    root_path: &Path,
    remote_name: &str,
    remote_url: &str,
) -> GitResult<GitStatus> {
    let repo = repository::open_managed_repo(root_path)?;
    ensure_remote(&repo, remote_name, remote_url)?;
    status::read_repo_status(&repo)
}

pub(crate) fn fetch(
    root_path: &Path,
    remote_name: &str,
    auth_config: Option<&GitAuth>,
) -> GitResult<GitStatus> {
    let repo = repository::open_managed_repo(root_path)?;
    let mut remote = repo.find_remote(remote_name)?;
    let callbacks = auth::build_remote_callbacks(&repo, auth_config);
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    remote.fetch(&[] as &[&str], Some(&mut fetch_options), None)?;
    status::read_repo_status(&repo)
}

pub(crate) fn pull(
    root_path: &Path,
    remote_name: &str,
    branch_name: Option<&str>,
    author_name: Option<&str>,
    author_email: Option<&str>,
    auth_config: Option<&GitAuth>,
) -> GitResult<GitSyncResult> {
    let repo = repository::open_managed_repo(root_path)?;
    let branch = resolve_branch_name(&repo, branch_name)?;

    let mut remote = repo.find_remote(remote_name)?;
    let callbacks = auth::build_remote_callbacks(&repo, auth_config);
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
            branch: repository::head_branch_name(&repo),
            conflicts: Vec::new(),
            message: "拉取成功，已快进更新".to_string(),
        });
    }

    if analysis.is_normal() {
        return normal_merge(&repo, &fetch_commit, author_name, author_email);
    }

    Err(GitServiceError::message("当前仓库状态不支持自动拉取"))
}

pub(crate) fn push(
    root_path: &Path,
    remote_name: &str,
    branch_name: Option<&str>,
    auth_config: Option<&GitAuth>,
) -> GitResult<GitSyncResult> {
    let repo = repository::open_managed_repo(root_path)?;
    let branch = resolve_branch_name(&repo, branch_name)?;

    let mut remote = repo.find_remote(remote_name)?;
    let callbacks = auth::build_remote_callbacks(&repo, auth_config);
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

fn ensure_remote(repo: &Repository, remote_name: &str, remote_url: &str) -> GitResult<()> {
    match repo.find_remote(remote_name) {
        Ok(_) => repo
            .remote_set_url(remote_name, remote_url)
            .map_err(Into::into),
        Err(error) if error.code() == git2::ErrorCode::NotFound => repo
            .remote(remote_name, remote_url)
            .map(|_| ())
            .map_err(Into::into),
        Err(error) => Err(error.into()),
    }
}

fn resolve_branch_name(repo: &Repository, branch_name: Option<&str>) -> GitResult<String> {
    match branch_name {
        Some(branch_name) => Ok(branch_name.to_string()),
        None => repository::current_branch_status(repo)?
            .and_then(|value| value.name)
            .ok_or_else(|| GitServiceError::message("当前没有可用的本地分支，无法继续远程操作")),
    }
}

fn fast_forward(
    repo: &Repository,
    fetch_commit: &git2::AnnotatedCommit<'_>,
    branch_name: &str,
) -> GitResult<()> {
    let refname = match repo.head() {
        Ok(head) => head
            .name()
            .ok_or_else(|| GitServiceError::message("无法解析当前分支引用"))?
            .to_string(),
        Err(error) if error.code() == git2::ErrorCode::UnbornBranch => {
            format!("refs/heads/{branch_name}")
        }
        Err(error) => return Err(error.into()),
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
) -> GitResult<GitSyncResult> {
    let head_commit = repo.reference_to_annotated_commit(&repo.head()?)?;
    let our_commit = repo.find_commit(head_commit.id())?;
    let their_commit = repo.find_commit(fetch_commit.id())?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout
        .allow_conflicts(true)
        .conflict_style_merge(true)
        .safe();
    repo.merge(&[fetch_commit], None, Some(&mut checkout))?;

    let unresolved_conflicts = status::clear_resolved_conflicts(repo)?;
    if !unresolved_conflicts.is_empty() {
        return Ok(GitSyncResult {
            branch: repository::head_branch_name(repo),
            conflicts: unresolved_conflicts,
            message: "拉取完成，但存在冲突，请先解决冲突后再提交".to_string(),
        });
    }

    let mut index = repo.index()?;
    let result_tree = repo.find_tree(index.write_tree_to(repo)?)?;
    let signature = repository::build_signature(repo, author_name, author_email)?;
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
    if repo.state() == git2::RepositoryState::Merge {
        repo.cleanup_state()?;
    }

    Ok(GitSyncResult {
        branch: repository::head_branch_name(repo),
        conflicts: Vec::new(),
        message: "拉取并合并成功".to_string(),
    })
}
