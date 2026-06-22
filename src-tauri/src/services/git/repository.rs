use std::path::{Path, PathBuf};

use git2::{BranchType, ErrorCode, Repository, Signature, StatusOptions};

use crate::i18n;
use crate::models::git::{GitBranchStatus, GitRemoteInfo, GitRepositoryState, GitStatus};

use super::error::{GitResult, GitServiceError};

pub(crate) fn empty_status() -> GitStatus {
    GitStatus {
        branch: None,
        conflicted_files: Vec::new(),
        has_repository: false,
        has_git_directory: false,
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

pub(crate) fn open_repo(root_path: &Path) -> GitResult<Repository> {
    Repository::open(root_path).map_err(Into::into)
}

pub(crate) fn open_managed_repo(root_path: &Path) -> GitResult<Repository> {
    let repo = open_repo(root_path)?;
    ensure_editor_managed_repo(&repo)?;
    Ok(repo)
}

pub(crate) fn ensure_editor_managed_repo(repo: &Repository) -> GitResult<()> {
    if is_editor_managed_repo(repo) {
        Ok(())
    } else {
        Err(GitServiceError::message(i18n::t("git.not_editor_managed")))
    }
}

pub(crate) fn is_editor_managed_repo(repo: &Repository) -> bool {
    repo.path().join("EDITOR_MANAGED").exists()
}

pub(crate) fn write_editor_managed_marker(repo: &Repository) -> GitResult<()> {
    std::fs::write(repo.path().join("EDITOR_MANAGED"), [])?;
    Ok(())
}

pub(crate) fn relative_repo_path(repo: &Repository, path: &Path) -> GitResult<PathBuf> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitServiceError::message(i18n::t("git.no_workdir")))?;

    // Try direct strip first (fast path)
    if let Ok(relative) = path.strip_prefix(workdir) {
        return Ok(relative.to_path_buf());
    }

    // If direct strip fails (e.g. macOS /var → /private/var symlink),
    // canonicalize both paths and retry.
    let canonical_workdir = std::fs::canonicalize(workdir).map_err(|error| {
        GitServiceError::message(i18n::tf(
            "git.cannot_resolve_workdir",
            &[("error", &error.to_string())],
        ))
    })?;
    let canonical_path = std::fs::canonicalize(path).map_err(|_| {
        GitServiceError::message(i18n::tf(
            "git.path_outside_workdir",
            &[("path", &path.display().to_string())],
        ))
    })?;

    canonical_path
        .strip_prefix(&canonical_workdir)
        .map(Path::to_path_buf)
        .map_err(|_| {
            GitServiceError::message(i18n::tf(
                "git.path_outside_workdir",
                &[("path", &path.display().to_string())],
            ))
        })
}

pub(crate) fn normalize_repo_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(crate) fn build_signature(
    repo: &Repository,
    author_name: Option<&str>,
    author_email: Option<&str>,
) -> GitResult<Signature<'static>> {
    match (author_name, author_email) {
        (Some(name), Some(email)) => Signature::now(name, email).map_err(Into::into),
        _ => repo.signature().map_err(Into::into),
    }
}

pub(crate) fn current_branch_status(repo: &Repository) -> GitResult<Option<GitBranchStatus>> {
    let head = match repo.head() {
        Ok(head) => head,
        Err(error) if error.code() == ErrorCode::UnbornBranch => return Ok(None),
        Err(error) => return Err(error.into()),
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

pub(crate) fn head_branch_name(repo: &Repository) -> Option<String> {
    repo.head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_string))
}

pub(crate) fn collect_remotes(repo: &Repository) -> GitResult<Vec<GitRemoteInfo>> {
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

pub(crate) fn ensure_clean_for_history_mutation(repo: &Repository) -> GitResult<()> {
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
        return Err(GitServiceError::message(i18n::t("git.uncommitted_changes")));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_repo_path_unix() {
        assert_eq!(
            normalize_repo_path(Path::new("/home/user/repo/file.md")),
            "/home/user/repo/file.md"
        );
    }

    #[test]
    fn normalize_repo_path_windows_backslash() {
        assert_eq!(
            normalize_repo_path(Path::new("C:\\Users\\user\\file.md")),
            "C:/Users/user/file.md"
        );
    }

    #[test]
    fn normalize_repo_path_mixed() {
        assert_eq!(
            normalize_repo_path(Path::new("repo\\dir/file.md")),
            "repo/dir/file.md"
        );
    }

    #[test]
    fn build_signature_with_name_and_email() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let signature = build_signature(&repo, Some("Test User"), Some("test@example.com"));
        assert!(signature.is_ok());
        let signature = signature.unwrap();
        assert_eq!(signature.name(), Some("Test User"));
        assert_eq!(signature.email(), Some("test@example.com"));
    }

    #[test]
    fn relative_repo_path_normal() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let workdir = repo.workdir().unwrap();
        let file_path = workdir.join("src/main.rs");
        std::fs::create_dir_all(workdir.join("src")).unwrap();
        std::fs::write(&file_path, "").unwrap();

        let relative = relative_repo_path(&repo, &file_path).unwrap();
        assert_eq!(relative, PathBuf::from("src/main.rs"));
    }

    #[test]
    fn relative_repo_path_out_of_workdir() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let outside = Path::new("/nonexistent/outside.txt");

        let result = relative_repo_path(&repo, &outside);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("不在仓库工作区内"));
    }

    #[test]
    fn empty_status_is_clean() {
        let status = empty_status();
        assert!(!status.has_repository);
        assert_eq!(status.staged_count, 0);
        assert_eq!(status.unstaged_count, 0);
        assert_eq!(status.total_changed_count, 0);
        assert!(status.files.is_empty());
    }

    #[test]
    fn is_editor_managed_repo_false_by_default() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        assert!(!is_editor_managed_repo(&repo));
    }

    #[test]
    fn is_editor_managed_repo_true_when_marker_exists() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        write_editor_managed_marker(&repo).unwrap();
        assert!(is_editor_managed_repo(&repo));
    }
}
