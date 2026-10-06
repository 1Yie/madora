use std::path::Path;

use git2::{BranchType, FetchOptions, PushOptions, Repository};

use crate::i18n;
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
            message: i18n::t("git.already_up_to_date"),
        });
    }

    if analysis.is_fast_forward() || analysis.is_unborn() {
        fast_forward(&repo, &fetch_commit, &branch)?;
        return Ok(GitSyncResult {
            branch: repository::head_branch_name(&repo),
            conflicts: Vec::new(),
            message: i18n::t("git.pull_ff_success"),
        });
    }

    if analysis.is_normal() {
        return normal_merge(&repo, &fetch_commit, author_name, author_email);
    }

    Err(GitServiceError::message(i18n::t("git.cannot_auto_pull")))
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
        message: i18n::t("git.push_success"),
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
            .ok_or_else(|| GitServiceError::message(i18n::t("git.no_local_branch"))),
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
            .ok_or_else(|| GitServiceError::message(i18n::t("git.cannot_resolve_branch_ref")))?
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

    // Check the target tree out *before* moving any reference. A safe checkout
    // refuses to overwrite local modifications, and because the branch has not
    // moved yet a refusal leaves the repository exactly as it was.
    let target = repo.find_object(fetch_commit.id(), None)?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_tree(&target, Some(&mut checkout))
        .map_err(|error| match error.code() {
            git2::ErrorCode::Conflict => {
                GitServiceError::message(i18n::t("git.pull_local_changes"))
            }
            _ => GitServiceError::from(error),
        })?;

    match repo.find_reference(&refname) {
        Ok(mut reference) => {
            reference.set_target(fetch_commit.id(), &message)?;
        }
        Err(_) => {
            repo.reference(&refname, fetch_commit.id(), true, &message)?;
        }
    }
    repo.set_head(&refname)?;
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
            message: i18n::t("git.pull_conflicts"),
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
        message: i18n::t("git.pull_merge_success"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn init_repo(path: &Path) -> Repository {
        let repo = Repository::init(path).unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        let _ = config.set_bool("core.autocrlf", false);
        repo
    }

    fn commit_file(repo: &Repository, name: &str, content: &str, message: &str) -> git2::Oid {
        std::fs::write(repo.workdir().unwrap().join(name), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let signature = repo.signature().unwrap();
        let parents: Vec<git2::Commit<'_>> = match repo.head() {
            Ok(head) => vec![head.peel_to_commit().unwrap()],
            Err(_) => Vec::new(),
        };
        let parent_refs: Vec<&git2::Commit<'_>> = parents.iter().collect();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parent_refs,
        )
        .unwrap()
    }

    /// A repository one commit behind `origin/<branch>`, with `notes.md`
    /// tracked at the old commit.
    fn behind_remote(dir: &Path) -> (Repository, git2::Oid, String) {
        let repo = init_repo(dir);
        let old = commit_file(&repo, "notes.md", "base\n", "base");
        let branch = repository::head_branch_name(&repo).unwrap();
        let new = commit_file(&repo, "notes.md", "from remote\n", "remote change");

        repo.reference(
            &format!("refs/remotes/origin/{branch}"),
            new,
            true,
            "test remote",
        )
        .unwrap();
        repo.reset(
            &repo.find_object(old, None).unwrap(),
            git2::ResetType::Hard,
            None,
        )
        .unwrap();

        (repo, old, branch)
    }

    fn annotated<'a>(repo: &'a Repository, branch: &str) -> git2::AnnotatedCommit<'a> {
        let reference = repo
            .find_reference(&format!("refs/remotes/origin/{branch}"))
            .unwrap();
        repo.reference_to_annotated_commit(&reference).unwrap()
    }

    #[test]
    fn fast_forward_keeps_uncommitted_local_changes() {
        let dir = tempfile::tempdir().unwrap();
        let (repo, old, branch) = behind_remote(dir.path());
        std::fs::write(dir.path().join("notes.md"), "my unsaved work\n").unwrap();

        let result = fast_forward(&repo, &annotated(&repo, &branch), &branch);

        assert!(result.is_err(), "a dirty tree must block the fast-forward");
        assert_eq!(
            std::fs::read_to_string(dir.path().join("notes.md")).unwrap(),
            "my unsaved work\n",
            "local edits must survive"
        );
        assert_eq!(
            repo.head().unwrap().peel_to_commit().unwrap().id(),
            old,
            "the branch must not move when the checkout was refused"
        );
    }

    #[test]
    fn fast_forward_updates_a_clean_tree() {
        let dir = tempfile::tempdir().unwrap();
        let (repo, _old, branch) = behind_remote(dir.path());
        let target = annotated(&repo, &branch).id();

        fast_forward(&repo, &annotated(&repo, &branch), &branch).unwrap();

        assert_eq!(
            std::fs::read_to_string(dir.path().join("notes.md")).unwrap(),
            "from remote\n"
        );
        assert_eq!(repo.head().unwrap().peel_to_commit().unwrap().id(), target);
    }

    #[test]
    fn fast_forward_allows_unrelated_local_changes() {
        let dir = tempfile::tempdir().unwrap();
        let (repo, _old, branch) = behind_remote(dir.path());
        std::fs::write(dir.path().join("scratch.md"), "untracked\n").unwrap();

        fast_forward(&repo, &annotated(&repo, &branch), &branch).unwrap();

        assert_eq!(
            std::fs::read_to_string(dir.path().join("scratch.md")).unwrap(),
            "untracked\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("notes.md")).unwrap(),
            "from remote\n"
        );
    }
}
