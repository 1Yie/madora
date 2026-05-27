use std::path::Path;

use git2::{BranchType, ErrorCode, Repository, StatusOptions};

use crate::models::git::{GitBranchInfo, GitStatus};

use super::{
	error::{GitResult, GitServiceError},
	repository,
	status,
};

pub(crate) fn stage_file(root_path: &Path, path: &Path) -> GitResult<GitStatus> {
	let repo = repository::open_managed_repo(root_path)?;
	let relative_path = repository::relative_repo_path(&repo, path)?;
	let worktree_path = repo
		.workdir()
		.ok_or_else(|| GitServiceError::message("当前仓库没有可用的工作区目录"))?
		.join(&relative_path);
	let mut index = repo.index()?;
	if worktree_path.exists() {
		index.add_path(&relative_path)?;
	} else {
		index.remove_path(&relative_path)?;
	}
	index.write()?;
	status::read_repo_status(&repo)
}

pub(crate) fn unstage_file(root_path: &Path, path: &Path) -> GitResult<GitStatus> {
	let repo = repository::open_managed_repo(root_path)?;
	let relative_path = repository::relative_repo_path(&repo, path)?;

	match repo.head() {
		Ok(head) => {
			let head_commit = head.peel_to_commit()?;
			let head_tree = head_commit.tree()?;
			if head_tree.get_path(&relative_path).is_ok() {
				repo.reset_default(Some(head_commit.as_object()), [relative_path.as_path()])?;
				repo.index()?.write()?;
			} else {
				let mut index = repo.index()?;
				index.remove_path(&relative_path)?;
				index.write()?;
			}
		}
		Err(error) if error.code() == ErrorCode::UnbornBranch => {
			let mut index = repo.index()?;
			index.remove_path(&relative_path)?;
			index.write()?;
		}
		Err(error) => return Err(error.into()),
	}

	status::read_repo_status(&repo)
}

pub(crate) fn restore_file(root_path: &Path, path: &Path) -> GitResult<GitStatus> {
	let repo = repository::open_managed_repo(root_path)?;
	let relative_path = repository::relative_repo_path(&repo, path)?;
	let head = repo.head().map_err(|error| {
		if error.code() == ErrorCode::UnbornBranch {
			GitServiceError::message("当前仓库还没有提交，无法恢复文件")
		} else {
			error.into()
		}
	})?;
	let head_commit = head.peel_to_commit()?;
	let head_tree = head_commit.tree()?;

	if head_tree.get_path(&relative_path).is_err() {
		let mut index = repo.index()?;
		index.remove_path(&relative_path)?;
		index.write()?;
		return status::read_repo_status(&repo);
	}

	repo.reset_default(Some(head_commit.as_object()), [relative_path.as_path()])?;
	let mut checkout = git2::build::CheckoutBuilder::new();
	checkout
		.force()
		.recreate_missing(true)
		.disable_pathspec_match(true)
		.path(&relative_path);
	repo.checkout_head(Some(&mut checkout))?;
	status::read_repo_status(&repo)
}

pub(crate) fn list_branches(root_path: &Path) -> GitResult<Vec<GitBranchInfo>> {
	let repo = repository::open_managed_repo(root_path)?;
	let head = repository::head_branch_name(&repo);
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
}

pub(crate) fn create_branch(root_path: &Path, branch_name: &str) -> GitResult<GitStatus> {
	let repo = repository::open_managed_repo(root_path)?;
	let head = match repo.head() {
		Ok(head) => head,
		Err(error) if error.code() == ErrorCode::UnbornBranch => {
			return Err(GitServiceError::message(
				"当前仓库还没有提交，请先提交后再创建分支",
			))
		}
		Err(error) => return Err(error.into()),
	};
	let head_commit = head.peel_to_commit()?;
	repo.branch(branch_name, &head_commit, false)?;
	status::read_repo_status(&repo)
}

pub(crate) fn switch_branch(root_path: &Path, branch_name: &str) -> GitResult<GitStatus> {
	let repo = repository::open_managed_repo(root_path)?;
	ensure_clean_for_branch_switch(&repo)?;

	let refname = format!("refs/heads/{branch_name}");
	repo.find_reference(&refname)
		.map_err(|_| GitServiceError::message(format!("未找到分支: {branch_name}")))?;

	repo.set_head(&refname)?;
	let mut checkout = git2::build::CheckoutBuilder::new();
	checkout.force().recreate_missing(true);
	repo.checkout_head(Some(&mut checkout))?;
	status::read_repo_status(&repo)
}

fn ensure_clean_for_branch_switch(repo: &Repository) -> GitResult<()> {
	let mut status_options = StatusOptions::new();
	status_options
		.include_untracked(true)
		.recurse_untracked_dirs(true)
		.include_ignored(false)
		.include_unmodified(false);

	if !repo.statuses(Some(&mut status_options))?.is_empty() {
		return Err(GitServiceError::message(
			"工作区有未提交的更改，请先提交或撤销更改后再切换分支",
		));
	}

	Ok(())
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
		repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &parent_refs)
			.unwrap();
	}

	#[test]
	fn switch_branch_updates_head_and_worktree() {
		let dir = tempfile::tempdir().unwrap();
		let repo = init_test_repo(dir.path());
		commit_file(&repo, "shared.txt", "main\n", "Initial");
		let initial_branch = repository::head_branch_name(&repo).unwrap();

		let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
		repo.branch("feature", &head_commit, false).unwrap();
		repo.set_head("refs/heads/feature").unwrap();
		repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
			.unwrap();
		commit_file(&repo, "shared.txt", "feature\n", "Feature");
 		repo.set_head(&format!("refs/heads/{initial_branch}")).unwrap();
		repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
			.unwrap();

		switch_branch(dir.path(), "feature").unwrap();

		let reopened = Repository::open(dir.path()).unwrap();
		assert_eq!(repository::head_branch_name(&reopened).as_deref(), Some("feature"));
		assert_eq!(
			std::fs::read_to_string(dir.path().join("shared.txt")).unwrap(),
			"feature\n"
		);
	}

	#[test]
	fn unstage_file_handles_unborn_branch() {
		let dir = tempfile::tempdir().unwrap();
		let repo = init_test_repo(dir.path());
		let file_path = dir.path().join("draft.md");
		std::fs::write(&file_path, "draft\n").unwrap();
		let mut index = repo.index().unwrap();
		index.add_path(Path::new("draft.md")).unwrap();
		index.write().unwrap();

		let status = unstage_file(dir.path(), &file_path).unwrap();
		let reopened = Repository::open(dir.path()).unwrap();
		assert!(!status.has_staged_changes);
		assert!(
			reopened
				.index()
				.unwrap()
				.get_path(Path::new("draft.md"), 0)
				.is_none()
		);
	}
}
