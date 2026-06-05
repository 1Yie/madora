import { invoke } from '@tauri-apps/api/core';
import type {
	GitAuth,
	GitBranchInfo,
	GitCredentials,
	GitLogEntry,
	GitStatus,
	GitSyncResult,
} from '@/components/explorer/git/git-types';

/** Stages a file in the git working tree. */
export async function gitStageFile(opts: {
	path: string;
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_stage_file', {
		path: opts.path,
		rootPath: opts.rootPath,
	});
}

/** Unstages a previously staged file. */
export async function gitUnstageFile(opts: {
	path: string;
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_unstage_file', {
		path: opts.path,
		rootPath: opts.rootPath,
	});
}

/** Restores a file from git (undo local changes). */
export async function gitRestoreFile(opts: {
	path: string;
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_restore_file', {
		path: opts.path,
		rootPath: opts.rootPath,
	});
}

/** Returns the git status for a workspace. */
export async function gitStatus(opts: {
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_status', {
		rootPath: opts.rootPath,
	});
}

/** Fetches the git commit log. */
export async function gitLog(opts: {
	limit: number | null;
	rootPath: string;
}): Promise<GitLogEntry[]> {
	return invoke<GitLogEntry[]>('git_log', {
		limit: opts.limit,
		rootPath: opts.rootPath,
	});
}

/** Lists all branches in the repository. */
export async function gitListBranches(opts: {
	rootPath: string;
}): Promise<GitBranchInfo[]> {
	return invoke<GitBranchInfo[]>('git_list_branches', {
		rootPath: opts.rootPath,
	});
}

/** Switches to the specified branch. */
export async function gitSwitchBranch(opts: {
	branchName: string;
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_switch_branch', {
		branchName: opts.branchName,
		rootPath: opts.rootPath,
	});
}

/** Creates and switches to a new branch. */
export async function gitCreateBranch(opts: {
	branchName: string;
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_create_branch', {
		branchName: opts.branchName,
		rootPath: opts.rootPath,
	});
}

/** Initializes a git repository in the workspace. */
export async function gitInit(opts: { rootPath: string }): Promise<GitStatus> {
	return invoke<GitStatus>('git_init', { rootPath: opts.rootPath });
}

/** Sets or updates a git remote. */
export async function gitSetRemote(opts: {
	remoteName: string;
	remoteUrl: string;
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_set_remote', {
		remoteName: opts.remoteName,
		remoteUrl: opts.remoteUrl,
		rootPath: opts.rootPath,
	});
}

/** Commits staged changes. */
export async function gitCommit(opts: {
	authorEmail: string | null;
	authorName: string | null;
	message: string;
	rootPath: string;
}): Promise<GitSyncResult> {
	return invoke<GitSyncResult>('git_commit', {
		authorEmail: opts.authorEmail,
		authorName: opts.authorName,
		message: opts.message,
		rootPath: opts.rootPath,
	});
}

/** Stages all changes and commits them. */
export async function gitCommitAll(opts: {
	authorEmail: string | null;
	authorName: string | null;
	message: string;
	rootPath: string;
}): Promise<GitSyncResult> {
	return invoke<GitSyncResult>('git_commit_all', {
		authorEmail: opts.authorEmail,
		authorName: opts.authorName,
		message: opts.message,
		rootPath: opts.rootPath,
	});
}

/** Pushes commits to a remote. */
export async function gitPush(opts: {
	auth: GitAuth | null;
	branchName: string | null;
	remoteName: string;
	rootPath: string;
}): Promise<GitSyncResult> {
	return invoke<GitSyncResult>('git_push', {
		auth: opts.auth,
		branchName: opts.branchName,
		remoteName: opts.remoteName,
		rootPath: opts.rootPath,
	});
}

/** Pulls commits from a remote. */
export async function gitPull(opts: {
	auth: GitAuth | null;
	authorEmail: string | null;
	authorName: string | null;
	branchName: string | null;
	remoteName: string;
	rootPath: string;
}): Promise<GitSyncResult> {
	return invoke<GitSyncResult>('git_pull', {
		auth: opts.auth,
		authorEmail: opts.authorEmail,
		authorName: opts.authorName,
		branchName: opts.branchName,
		remoteName: opts.remoteName,
		rootPath: opts.rootPath,
	});
}

/** Fetches updates from a remote. */
export async function gitFetch(opts: {
	auth: GitAuth | null;
	remoteName: string;
	rootPath: string;
}): Promise<GitStatus> {
	return invoke<GitStatus>('git_fetch', {
		auth: opts.auth,
		remoteName: opts.remoteName,
		rootPath: opts.rootPath,
	});
}

/** Opens a native file picker to select an SSH private key. */
export async function gitPickSshPrivateKeyFile(): Promise<string | null> {
	return invoke<string | null>('git_pick_ssh_private_key_file');
}

/** Undoes the most recent commit, keeping changes staged. */
export async function gitUndoLastCommit(opts: {
	rootPath: string;
}): Promise<GitSyncResult> {
	return invoke<GitSyncResult>('git_undo_last_commit', {
		rootPath: opts.rootPath,
	});
}

/** Reverts a specific commit by creating a new inverse commit. */
export async function gitRevertCommit(opts: {
	authorEmail: string | null;
	authorName: string | null;
	commitId: string;
	rootPath: string;
}): Promise<GitSyncResult> {
	return invoke<GitSyncResult>('git_revert_commit', {
		authorEmail: opts.authorEmail,
		authorName: opts.authorName,
		commitId: opts.commitId,
		rootPath: opts.rootPath,
	});
}

/** Persists git credentials (debounced). */
export async function gitStoreCredentials(opts: {
	credentials: GitCredentials;
}): Promise<void> {
	return invoke('git_store_credentials', {
		credentials: opts.credentials,
	});
}

/** Loads saved git credentials. */
export async function gitLoadCredentials(): Promise<GitCredentials> {
	return invoke<GitCredentials>('git_load_credentials');
}
