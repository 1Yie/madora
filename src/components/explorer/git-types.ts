export type GitAuth = {
  username: string | null;
  password: string | null;
  sshUsername: string | null;
  sshPrivateKeyPath: string | null;
  sshPassphrase: string | null;
};

export type GitBranchStatus = {
  name: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
};

export type GitRemoteInfo = {
  name: string;
  url: string | null;
};

export type GitFileState =
  | "added"
  | "conflicted"
  | "deleted"
  | "modified"
  | "renamed"
  | "typechange"
  | "untracked";

export type GitFileStatus = {
  path: string;
  staged: boolean;
  unstaged: boolean;
  status: GitFileState;
};

export type GitStatus = {
  branch: GitBranchStatus | null;
  conflictedFiles: string[];
  hasRepository: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  hasUntrackedFiles: boolean;
  isMerging: boolean;
  remotes: GitRemoteInfo[];
  stagedCount: number;
  totalChangedCount: number;
  unstagedCount: number;
  files: GitFileStatus[];
};

export type GitLogEntry = {
  id: string;
  summary: string;
  authorName: string;
  committedAt: string;
};

export type GitSyncResult = {
  branch: string | null;
  conflicts: string[];
  message: string;
};
