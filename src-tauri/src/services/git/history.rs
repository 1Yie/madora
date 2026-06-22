use std::path::Path;

use git2::{ErrorCode, IndexAddOption, Repository, ResetType};

use crate::i18n;
use crate::models::git::{GitLogEntry, GitSyncResult};

use super::{
    error::{GitResult, GitServiceError},
    repository, status,
};

pub(crate) fn commit(
    root_path: &Path,
    message: &str,
    author_name: Option<&str>,
    author_email: Option<&str>,
) -> GitResult<GitSyncResult> {
    let repo = repository::open_managed_repo(root_path)?;
    create_commit(
        &repo,
        message,
        author_name,
        author_email,
        CommitMode::StagedOnly,
    )
}

pub(crate) fn commit_all(
    root_path: &Path,
    message: &str,
    author_name: Option<&str>,
    author_email: Option<&str>,
) -> GitResult<GitSyncResult> {
    let repo = repository::open_managed_repo(root_path)?;
    create_commit(
        &repo,
        message,
        author_name,
        author_email,
        CommitMode::AllChanges,
    )
}

pub(crate) fn read_log(root_path: &Path, limit: usize) -> GitResult<Vec<GitLogEntry>> {
    let repo = repository::open_managed_repo(root_path)?;
    if repo.is_empty()? {
        return Ok(Vec::new());
    }
    let mut revwalk = repo.revwalk()?;
    match revwalk.push_head() {
        Ok(()) => {}
        Err(error)
            if error.code() == ErrorCode::UnbornBranch || error.code() == ErrorCode::NotFound =>
        {
            return Ok(Vec::new());
        }
        Err(error) => return Err(error.into()),
    }

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
                .unwrap_or_else(|| i18n::t("git.unknown_time"));

        entries.push(GitLogEntry {
            id: oid.to_string(),
            summary: {
                let no_msg = i18n::t("git.no_commit_message");
                commit.summary().unwrap_or(&no_msg).to_string()
            },
            author_name: commit.author().name().unwrap_or("Unknown").to_string(),
            committed_at,
        });
    }

    Ok(entries)
}

pub(crate) fn undo_last_commit(root_path: &Path) -> GitResult<GitSyncResult> {
    let repo = repository::open_managed_repo(root_path)?;
    repository::ensure_clean_for_history_mutation(&repo)?;

    let head = repo.head()?;
    let head_target = head
        .target()
        .ok_or_else(|| GitServiceError::message(i18n::t("git.head_not_commit")))?;
    let head_commit = repo.find_commit(head_target)?;
    let parent = head_commit
        .parent(0)
        .map_err(|_| GitServiceError::message(i18n::t("git.no_parent_commit")))?;
    let parent_object = repo.find_object(parent.id(), None)?;

    repo.reset(&parent_object, ResetType::Mixed, None)?;

    Ok(GitSyncResult {
        branch: repository::head_branch_name(&repo),
        conflicts: Vec::new(),
        message: {
            let commit_id = head_commit.id().to_string();
            i18n::tf("git.undo_commit_success", &[("commit", &commit_id)])
        },
    })
}

pub(crate) fn revert_commit(
    root_path: &Path,
    commit_id: &str,
    author_name: Option<&str>,
    author_email: Option<&str>,
) -> GitResult<GitSyncResult> {
    let repo = repository::open_managed_repo(root_path)?;
    repository::ensure_clean_for_history_mutation(&repo)?;

    let oid = git2::Oid::from_str(commit_id)?;
    let commit_to_revert = repo.find_commit(oid)?;
    let signature = repository::build_signature(&repo, author_name, author_email)?;

    let mut revert_options = git2::RevertOptions::new();
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout
        .allow_conflicts(true)
        .conflict_style_merge(true)
        .safe();
    revert_options.checkout_builder(checkout);
    repo.revert(&commit_to_revert, Some(&mut revert_options))?;

    let unresolved_conflicts = status::clear_resolved_conflicts(&repo)?;
    if !unresolved_conflicts.is_empty() {
        return Ok(GitSyncResult {
            branch: repository::head_branch_name(&repo),
            conflicts: unresolved_conflicts,
            message: i18n::t("git.revert_conflict"),
        });
    }

    let mut index = repo.index()?;
    let head_commit = repo.head()?.peel_to_commit()?;
    let revert_tree = repo.find_tree(index.write_tree_to(&repo)?)?;
    let no_msg = i18n::t("git.no_commit_message");
    let message = format!(
        "Revert \"{}\"\n\nThis reverts commit {}.",
        commit_to_revert.summary().unwrap_or(&no_msg),
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
    if matches!(
        repo.state(),
        git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence
    ) {
        repo.cleanup_state()?;
    }

    Ok(GitSyncResult {
        branch: repository::head_branch_name(&repo),
        conflicts: Vec::new(),
        message: i18n::tf(
            "git.revert_success",
            &[
                ("commit_id", commit_id),
                ("new_commit_id", &new_commit_id.to_string()),
            ],
        ),
    })
}

enum CommitMode {
    StagedOnly,
    AllChanges,
}

impl CommitMode {
    fn empty_index_message(&self) -> String {
        match self {
            Self::StagedOnly => i18n::t("git.empty_staging"),
            Self::AllChanges => i18n::t("git.no_changes_to_commit"),
        }
    }

    fn should_stage_all(&self) -> bool {
        matches!(self, Self::AllChanges)
    }
}

fn create_commit(
    repo: &Repository,
    message: &str,
    author_name: Option<&str>,
    author_email: Option<&str>,
    mode: CommitMode,
) -> GitResult<GitSyncResult> {
    if mode.should_stage_all() {
        stage_all_changes(repo)?;
    }

    let unresolved_conflicts = status::clear_resolved_conflicts(repo)?;
    let mut index = repo.index()?;
    index.write()?;

    if index.is_empty() {
        return Err(GitServiceError::message(mode.empty_index_message()));
    }

    if index.has_conflicts() {
        let conflicts = if unresolved_conflicts.is_empty() {
            status::collect_conflicts(repo)?
        } else {
            unresolved_conflicts
        };
        return Err(GitServiceError::message(i18n::tf(
            "git.unresolved_conflicts",
            &[
                ("count", &conflicts.len().to_string()),
                ("files", &conflicts.join(", ")),
            ],
        )));
    }

    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let signature = repository::build_signature(repo, author_name, author_email)?;
    let parent_commit = current_head_commit(repo)?;

    if let Some(parent_commit) = parent_commit.as_ref() {
        if parent_commit.tree_id() == tree_id {
            return Err(GitServiceError::message(i18n::t(
                "git.no_changes_to_commit",
            )));
        }
    }

    let merge_parent_commit = merge_parent_commit(repo)?;
    let commit_id = match (parent_commit.as_ref(), merge_parent_commit.as_ref()) {
        (Some(parent_commit), Some(merge_parent_commit)) => repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[parent_commit, merge_parent_commit],
        )?,
        (Some(parent_commit), None) => repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[parent_commit],
        )?,
        (None, None) => repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &[])?,
        (None, Some(_)) => return Err(GitServiceError::message(i18n::t("git.no_merge_parent"))),
    };

    if repo.state() == git2::RepositoryState::Merge {
        repo.cleanup_state()?;
    }

    Ok(GitSyncResult {
        branch: repository::head_branch_name(repo),
        conflicts: Vec::new(),
        message: i18n::tf("git.commit_success", &[("commit", &commit_id.to_string())]),
    })
}

fn stage_all_changes(repo: &Repository) -> GitResult<()> {
    let mut index = repo.index()?;
    index.add_all(["."].iter(), IndexAddOption::DEFAULT, None)?;
    index.update_all(["."].iter(), None)?;
    index.write()?;
    Ok(())
}

fn current_head_commit(repo: &Repository) -> GitResult<Option<git2::Commit<'_>>> {
    match repo.head() {
        Ok(head) => Ok(head.target().and_then(|oid| repo.find_commit(oid).ok())),
        Err(error) if error.code() == ErrorCode::UnbornBranch => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn merge_parent_commit(repo: &Repository) -> GitResult<Option<git2::Commit<'_>>> {
    if repo.state() != git2::RepositoryState::Merge {
        return Ok(None);
    }

    let merge_head = repo
        .find_reference("MERGE_HEAD")
        .map_err(|_| GitServiceError::message(i18n::t("git.no_merge_head")))?;
    let merge_parent_id = merge_head
        .target()
        .ok_or_else(|| GitServiceError::message(i18n::t("git.merge_head_invalid")))?;
    repo.find_commit(merge_parent_id)
        .map(Some)
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn init_test_repo(root_path: &Path) -> Repository {
        let repo = Repository::init(root_path).unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        repository::write_editor_managed_marker(&repo).unwrap();
        repo
    }

    fn create_test_commit(repo: &Repository, message: &str) {
        let mut index = repo.index().unwrap();
        let statuses = repo
            .statuses(Some(git2::StatusOptions::new().include_untracked(true)))
            .unwrap();
        for entry in statuses.iter() {
            if let Some(path) = entry.path() {
                index.add_path(Path::new(path)).unwrap();
            }
        }
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
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
        .unwrap();
    }

    #[test]
    fn commit_all_stages_hidden_files_and_deletions() {
        let dir = tempfile::tempdir().unwrap();
        let repo = init_test_repo(dir.path());
        let tracked_file = dir.path().join("tracked.txt");
        std::fs::write(&tracked_file, "tracked\n").unwrap();
        create_test_commit(&repo, "Initial");

        std::fs::remove_file(&tracked_file).unwrap();
        std::fs::write(dir.path().join(".hidden"), "secret\n").unwrap();

        let result = commit_all(dir.path(), "Stage everything", None, None).unwrap();
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(
            result.message,
            i18n::tf(
                "git.commit_success",
                &[("commit", &head_commit.id().to_string())]
            )
        );

        let head_tree = head_commit.tree().unwrap();
        assert!(head_tree.get_path(Path::new("tracked.txt")).is_err());
        assert!(head_tree.get_path(Path::new(".hidden")).is_ok());
    }

    #[test]
    fn read_log_returns_empty_for_unborn_branch() {
        let dir = tempfile::tempdir().unwrap();
        init_test_repo(dir.path());

        let entries = read_log(dir.path(), 20).unwrap();
        assert!(entries.is_empty());
    }
}
