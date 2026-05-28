use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitAuth {
    pub username: Option<String>,
    pub password: Option<String>,
    pub ssh_username: Option<String>,
    pub ssh_private_key_path: Option<String>,
    pub ssh_passphrase: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchStatus {
    pub name: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteInfo {
    pub name: String,
    pub url: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitFileState {
    Added,
    Conflicted,
    Deleted,
    Modified,
    Renamed,
    Typechange,
    Untracked,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitRepositoryState {
    Clean,
    Merge,
    Revert,
    CherryPick,
    Bisect,
    Rebase,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub staged: bool,
    pub unstaged: bool,
    pub status: GitFileState,
    pub has_conflict_markers: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<GitBranchStatus>,
    pub conflicted_files: Vec<String>,
    pub has_repository: bool,
    pub has_git_directory: bool,
    pub has_staged_changes: bool,
    pub has_unstaged_changes: bool,
    pub has_untracked_files: bool,
    pub is_merging: bool,
    pub remotes: Vec<GitRemoteInfo>,
    pub repository_state: GitRepositoryState,
    pub staged_count: usize,
    pub total_changed_count: usize,
    pub unstaged_count: usize,
    pub files: Vec<GitFileStatus>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub id: String,
    pub summary: String,
    pub author_name: String,
    pub committed_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncResult {
    pub branch: Option<String>,
    pub conflicts: Vec<String>,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub name: String,
    pub is_head: bool,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCredentials {
    pub auth_username: String,
    pub auth_password: String,
    pub ssh_username: String,
    pub ssh_private_key_path: String,
    pub ssh_passphrase: String,
}
