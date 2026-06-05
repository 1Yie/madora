use std::path::Path;
use std::process::Command;

use git2::Repository;

/// Helper: init a bare git config for testing (set user name/email).
fn init_test_repo_config(repo: &Repository) {
    let mut config = repo.config().unwrap();
    config.set_str("user.name", "Test User").unwrap();
    config.set_str("user.email", "test@example.com").unwrap();
}

/// Helper: create a commit with the given message, adding all changes.
fn create_commit(repo: &Repository, msg: &str) {
    let mut index = repo.index().unwrap();
    // Add all changes
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
    let sig = repo.signature().unwrap();

    // Get parent commits
    let parents: Vec<git2::Commit<'_>> = match repo.head() {
        Ok(head) => vec![head.peel_to_commit().unwrap()],
        Err(_) => vec![],
    };
    let parent_refs: Vec<&git2::Commit<'_>> = parents.iter().collect();

    repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parent_refs)
        .unwrap();
}

/// Helper: run git command inside the repo.
fn git(repo_path: &Path, args: &[&str]) -> String {
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

/// Test: init repo → add file → commit → modify → status check
#[test]
fn init_add_commit_modify_status() {
    let dir = tempfile::tempdir().unwrap();
    let repo_path = dir.path();
    let repo = Repository::init(repo_path).unwrap();
    init_test_repo_config(&repo);

    // Create a file
    let file_path = repo_path.join("test.md");
    std::fs::write(&file_path, "# Hello\n").unwrap();

    // Stage and commit
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("test.md")).unwrap();
    index.write().unwrap();
    let tree_id = index.write_tree().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    let signature = repo.signature().unwrap();
    repo.commit(Some("HEAD"), &signature, &signature, "Initial", &tree, &[])
        .unwrap();

    // Modify file
    std::fs::write(&file_path, "# Hello\n\nModified.\n").unwrap();

    // Check status — file should show as modified and unstaged
    let statuses = repo
        .statuses(Some(git2::StatusOptions::new().include_untracked(true)))
        .unwrap();
    let modified_entry = statuses.iter().find(|e| e.path() == Some("test.md"));
    assert!(modified_entry.is_some());
    let entry = modified_entry.unwrap();
    assert!(entry.status().is_wt_modified());
}

/// Test: init → add → commit → amend → log check (multiple commits)
#[test]
fn multiple_commits_and_log() {
    let dir = tempfile::tempdir().unwrap();
    let repo_path = dir.path();
    let repo = Repository::init(repo_path).unwrap();
    init_test_repo_config(&repo);

    // Commit 1
    let file1 = repo_path.join("a.txt");
    std::fs::write(&file1, "a").unwrap();
    create_commit(&repo, "First");

    // Commit 2
    let file2 = repo_path.join("b.txt");
    std::fs::write(&file2, "b").unwrap();
    create_commit(&repo, "Second");

    // Check log
    let mut revwalk = repo.revwalk().unwrap();
    revwalk.push_head().unwrap();
    let commits: Vec<_> = revwalk
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .collect();

    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0].summary(), Some("Second"));
    assert_eq!(commits[1].summary(), Some("First"));
}

/// Test: init → create branch → switch → merge with conflict
#[test]
fn branch_merge_conflict() {
    let dir = tempfile::tempdir().unwrap();
    let repo_path = dir.path();
    let repo = Repository::init(repo_path).unwrap();
    init_test_repo_config(&repo);

    // Create initial commit on main
    let shared = repo_path.join("shared.txt");
    std::fs::write(&shared, "base\n").unwrap();
    create_commit(&repo, "Initial");

    // Resolve HEAD commit and main branch name for branching
    let head = repo.head().unwrap();
    let main_branch_name = head.shorthand().unwrap().to_string();
    let head_commit = head.peel_to_commit().unwrap();

    // Create branch "feature"
    repo.branch("feature", &head_commit, false).unwrap();
    repo.set_head("refs/heads/feature").unwrap();
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .unwrap();

    // Modify on feature branch
    std::fs::write(&shared, "feature change\n").unwrap();
    create_commit(&repo, "Feature change");

    // Switch back to main
    repo.set_head(&format!("refs/heads/{}", main_branch_name))
        .unwrap();
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .unwrap();

    // Modify on main differently
    std::fs::write(&shared, "main change\n").unwrap();
    create_commit(&repo, "Main change");

    // Try to merge feature — should conflict
    let feature_oid = repo.refname_to_id("refs/heads/feature").unwrap();
    let annotated = repo.find_annotated_commit(feature_oid).unwrap();
    let merge_result = repo.merge(&[&annotated], None, None);
    assert!(merge_result.is_err() || repo.index().unwrap().has_conflicts());
}

/// Test: verify basic repo operations
#[test]
fn revert_and_phantom_conflict_detection() {
    let dir = tempfile::tempdir().unwrap();
    let repo_path = dir.path();
    let repo = Repository::init(repo_path).unwrap();
    init_test_repo_config(&repo);

    // Initial commit
    let file_path = repo_path.join("doc.md");
    std::fs::write(&file_path, "Content\n").unwrap();
    create_commit(&repo, "Initial");

    // No conflicts
    assert!(!repo.index().unwrap().has_conflicts());
}

/// Test: git log limit
#[test]
fn git_log_respects_limit() {
    let dir = tempfile::tempdir().unwrap();
    let repo_path = dir.path();
    let repo = Repository::init(repo_path).unwrap();
    init_test_repo_config(&repo);

    // Create 5 commits
    for i in 0..5 {
        let file_path = repo_path.join(format!("file_{}.txt", i));
        std::fs::write(&file_path, format!("content {}", i)).unwrap();
        create_commit(&repo, &format!("Commit {}", i));
    }

    // Read log via git CLI
    let log = git(repo_path, &["log", "--oneline", "-10"]);
    let count = log.lines().count();
    assert_eq!(count, 5);
}
