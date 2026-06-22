use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use crate::i18n;

use git2::{ErrorCode, Index, Repository, Status, StatusEntry, StatusOptions};

use crate::models::git::{GitFileState, GitFileStatus, GitRepositoryState, GitStatus};

use super::{
    error::{GitResult, GitServiceError},
    repository,
};

const MAX_CONFLICT_MARKER_FILE_BYTES: u64 = 1024 * 1024;
const CONFLICT_MARKER_SCAN_BYTES: usize = 8 * 1024;

pub(crate) fn read_status_or_empty(root_path: &Path) -> GitResult<GitStatus> {
    match repository::open_repo(root_path) {
        Ok(repo) if !repository::is_editor_managed_repo(&repo) => Ok(GitStatus {
            has_git_directory: true,
            ..repository::empty_status()
        }),
        Ok(repo) => Ok(GitStatus {
            has_git_directory: true,
            ..read_repo_status(&repo)?
        }),
        Err(error) if error.code() == Some(ErrorCode::NotFound) => Ok(repository::empty_status()),
        Err(error) => Err(error),
    }
}

pub(crate) fn read_status(root_path: &Path) -> GitResult<GitStatus> {
    let repo = repository::open_managed_repo(root_path)?;
    read_repo_status(&repo)
}

pub(crate) fn read_repo_status(repo: &Repository) -> GitResult<GitStatus> {
    let conflicted_files = clear_resolved_conflicts(repo)?;
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
    let workdir = repo.workdir().map(Path::to_path_buf);

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

        let relative_path = extract_entry_path(&entry);
        let path = relative_path
            .as_deref()
            .map(|value| {
                let absolute_path = workdir
                    .as_ref()
                    .map(|workdir| workdir.join(value))
                    .unwrap_or_else(|| value.to_path_buf());
                repository::normalize_repo_path(&absolute_path)
            })
            .unwrap_or_default();
        let has_conflict_markers = status.is_conflicted()
            && relative_path
                .as_deref()
                .map(|value| worktree_has_conflict_markers(repo, value))
                .transpose()?
                .unwrap_or(false);

        files.push(GitFileStatus {
            path,
            staged,
            unstaged,
            status: map_file_state(status, staged),
            has_conflict_markers,
        });
    }

    Ok(GitStatus {
        branch: repository::current_branch_status(repo)?,
        conflicted_files,
        has_repository: true,
        has_git_directory: true,
        has_staged_changes: staged_count > 0,
        has_unstaged_changes: unstaged_count > 0,
        has_untracked_files,
        is_merging: repo.state() == git2::RepositoryState::Merge,
        remotes: repository::collect_remotes(repo)?,
        repository_state: map_repository_state(repo.state()),
        staged_count,
        total_changed_count: files.len(),
        unstaged_count,
        files,
    })
}

pub(crate) fn map_file_state(status: Status, staged: bool) -> GitFileState {
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

pub(crate) fn clear_resolved_conflicts(repo: &Repository) -> GitResult<Vec<String>> {
    let mut index = repo.index()?;
    if !index.has_conflicts() {
        return Ok(Vec::new());
    }

    let conflict_paths = conflict_paths_from_index(&index)?;
    let mut unresolved = Vec::new();
    let mut removed_any = false;

    for path in conflict_paths {
        let relative_path = Path::new(&path);
        if index.get_path(relative_path, 0).is_some() {
            index.conflict_remove(relative_path)?;
            removed_any = true;
        } else {
            unresolved.push(path);
        }
    }

    if removed_any {
        index.write()?;
    }

    unresolved.sort();
    unresolved.dedup();
    Ok(unresolved)
}

pub(crate) fn collect_conflicts(repo: &Repository) -> GitResult<Vec<String>> {
    let index = repo.index()?;
    conflict_paths_from_index(&index)
}

fn conflict_paths_from_index(index: &Index) -> GitResult<Vec<String>> {
    if !index.has_conflicts() {
        return Ok(Vec::new());
    }

    let mut conflicts = Vec::new();
    for conflict in index.conflicts()?.flatten() {
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

    conflicts.sort();
    conflicts.dedup();
    Ok(conflicts)
}

fn extract_entry_path(entry: &StatusEntry<'_>) -> Option<PathBuf> {
    entry
        .head_to_index()
        .and_then(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
        .or_else(|| {
            entry
                .index_to_workdir()
                .and_then(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
        })
        .map(Path::to_path_buf)
}

fn worktree_has_conflict_markers(repo: &Repository, relative_path: &Path) -> GitResult<bool> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitServiceError::message(i18n::t("git.no_workdir")))?;
    let full_path = workdir.join(relative_path);
    let metadata = match std::fs::metadata(&full_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.into()),
    };

    if !metadata.is_file() || metadata.len() > MAX_CONFLICT_MARKER_FILE_BYTES {
        return Ok(false);
    }

    let mut file = File::open(full_path)?;
    let mut buffer = vec![0; CONFLICT_MARKER_SCAN_BYTES];
    let read = file.read(&mut buffer)?;
    buffer.truncate(read);
    Ok(String::from_utf8_lossy(&buffer).contains("<<<<<<<"))
}

fn map_repository_state(state: git2::RepositoryState) -> GitRepositoryState {
    match state {
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::git::repository;
    use std::process::{Command, Stdio};

    fn init_test_repo(root_path: &Path) -> Repository {
        let repo = Repository::init(root_path).unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        repo
    }

    fn commit_file(repo: &Repository, path: &str, content: &str, message: &str) {
        std::fs::write(repo.workdir().unwrap().join(path), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(path)).unwrap();
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

    fn run_git(repo_path: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command failed");
        String::from_utf8_lossy(if output.status.success() {
            &output.stdout
        } else {
            &output.stderr
        })
        .to_string()
    }

    fn run_git_with_stdin(repo_path: &Path, args: &[&str], stdin: &str) {
        let mut child = Command::new("git")
            .args(args)
            .current_dir(repo_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("git command failed");
        {
            use std::io::Write;
            child
                .stdin
                .as_mut()
                .expect("missing stdin")
                .write_all(stdin.as_bytes())
                .expect("write stdin failed");
        }
        let output = child.wait_with_output().expect("wait failed");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn map_file_state_conflicted() {
        let status = git2::Status::from_bits_truncate(32768);
        assert_eq!(map_file_state(status, false), GitFileState::Conflicted);
        assert_eq!(map_file_state(status, true), GitFileState::Conflicted);
    }

    #[test]
    fn map_file_state_index_new_staged() {
        let status = git2::Status::from_bits_truncate(1);
        assert_eq!(map_file_state(status, true), GitFileState::Added);
    }

    #[test]
    fn map_file_state_index_deleted_staged() {
        let status = git2::Status::from_bits_truncate(4);
        assert_eq!(map_file_state(status, true), GitFileState::Deleted);
    }

    #[test]
    fn map_file_state_index_renamed_staged() {
        let status = git2::Status::from_bits_truncate(8);
        assert_eq!(map_file_state(status, true), GitFileState::Renamed);
    }

    #[test]
    fn map_file_state_index_typechange_staged() {
        let status = git2::Status::from_bits_truncate(16);
        assert_eq!(map_file_state(status, true), GitFileState::Typechange);
    }

    #[test]
    fn map_file_state_wt_new_unstaged() {
        let status = git2::Status::from_bits_truncate(128);
        assert_eq!(map_file_state(status, false), GitFileState::Untracked);
    }

    #[test]
    fn map_file_state_wt_deleted_unstaged() {
        let status = git2::Status::from_bits_truncate(512);
        assert_eq!(map_file_state(status, false), GitFileState::Deleted);
    }

    #[test]
    fn map_file_state_wt_typechange_unstaged() {
        let status = git2::Status::from_bits_truncate(1024);
        assert_eq!(map_file_state(status, false), GitFileState::Typechange);
    }

    #[test]
    fn map_file_state_wt_renamed_unstaged() {
        let status = git2::Status::from_bits_truncate(2048);
        assert_eq!(map_file_state(status, false), GitFileState::Renamed);
    }

    #[test]
    fn map_file_state_modified_fallback() {
        let status = git2::Status::from_bits_truncate(256);
        assert_eq!(map_file_state(status, false), GitFileState::Modified);
    }

    #[test]
    fn map_file_state_index_modified_staged() {
        let status = git2::Status::from_bits_truncate(2);
        assert_eq!(map_file_state(status, true), GitFileState::Modified);
    }

    #[test]
    fn read_status_or_empty_does_not_discover_parent_repo() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let repo = Repository::init(root).unwrap();
        repository::write_editor_managed_marker(&repo).unwrap();
        let nested = root.join("apps/editor");
        std::fs::create_dir_all(&nested).unwrap();

        let status = read_status_or_empty(&nested).unwrap();
        assert!(!status.has_repository);
    }

    #[test]
    fn clear_resolved_conflicts_removes_stage_zero_phantoms() {
        let dir = tempfile::tempdir().unwrap();
        let repo = init_test_repo(dir.path());
        commit_file(&repo, "shared.txt", "base\n", "Initial");
        let initial_branch = repository::head_branch_name(&repo).unwrap();

        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head_commit, false).unwrap();
        repo.set_head("refs/heads/feature").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();
        commit_file(&repo, "shared.txt", "feature\n", "Feature");

        repo.set_head(&format!("refs/heads/{initial_branch}"))
            .unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();
        commit_file(&repo, "shared.txt", "main\n", "Main");

        let merge_output = run_git(dir.path(), &["merge", "feature"]);
        let merged_repo = Repository::open(dir.path()).unwrap();
        assert!(merge_output.contains("CONFLICT") || merged_repo.index().unwrap().has_conflicts());

        let conflict_lines = run_git(dir.path(), &["ls-files", "-u", "shared.txt"]);
        assert!(!conflict_lines.trim().is_empty());

        let resolved_blob = repo.blob(b"resolved\n").unwrap();
        let index_info = format!(
			"0 0000000000000000000000000000000000000000\tshared.txt\n100644 {resolved_blob} 0\tshared.txt\n{conflict_lines}"
		);
        run_git_with_stdin(dir.path(), &["update-index", "--index-info"], &index_info);

        let reopened = Repository::open(dir.path()).unwrap();
        let index = reopened.index().unwrap();
        assert!(index.has_conflicts());
        assert!(index.get_path(Path::new("shared.txt"), 0).is_some());

        let refreshed_repo = Repository::open(dir.path()).unwrap();
        let unresolved = clear_resolved_conflicts(&refreshed_repo).unwrap();
        assert!(unresolved.is_empty());
        let reopened = Repository::open(dir.path()).unwrap();
        let index = reopened.index().unwrap();
        assert!(!index.has_conflicts());
        assert!(index.get_path(Path::new("shared.txt"), 0).is_some());
    }

    #[test]
    fn read_status_reports_markerless_revert_conflicts() {
        let dir = tempfile::tempdir().unwrap();
        let repo = init_test_repo(dir.path());
        repository::write_editor_managed_marker(&repo).unwrap();
        commit_file(&repo, "conflict.txt", "base\n", "Initial");
        commit_file(&repo, "conflict.txt", "changed\n", "Change");

        run_git(dir.path(), &["rm", "conflict.txt"]);
        run_git(dir.path(), &["commit", "-m", "Delete"]);
        run_git(dir.path(), &["revert", "HEAD~1", "--no-edit"]);

        let reverted_repo = Repository::open(dir.path()).unwrap();
        assert!(reverted_repo.index().unwrap().has_conflicts());

        let status = read_status(dir.path()).unwrap();
        assert_eq!(status.conflicted_files, vec!["conflict.txt"]);

        let conflict_file = status
            .files
            .iter()
            .find(|file| file.path.ends_with("/conflict.txt"))
            .expect("conflicted file missing from status");
        assert_eq!(conflict_file.status, GitFileState::Conflicted);
        assert!(!conflict_file.has_conflict_markers);
    }
}
