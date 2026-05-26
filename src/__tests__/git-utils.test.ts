import { describe, it, expect } from 'vitest';

// Test the constants and patterns used across git-related components.

// statusLabels — from commit.tsx
const statusLabels: Record<string, string> = {
	added: 'A',
	conflicted: '!',
	deleted: 'D',
	modified: 'M',
	renamed: 'R',
	typechange: 'T',
	untracked: '?',
};

// statusColors — from commit.tsx
const statusColors: Record<string, string> = {
	added: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
	conflicted: 'bg-red-500/10 text-red-500 border-red-500/30',
	deleted: 'bg-red-500/10 text-red-500 border-red-500/30',
	modified: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
	renamed: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
	typechange: 'bg-violet-500/10 text-violet-500 border-violet-500/30',
	untracked: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
};

// gitFileStatePriority — from file-explorer-sidebar.tsx
const gitFileStatePriority: Record<string, number> = {
	conflicted: 7,
	modified: 6,
	untracked: 5,
	added: 4,
	deleted: 3,
	renamed: 2,
	typechange: 1,
};

type GitFileEntry = {
	path: string;
	staged: boolean;
	unstaged: boolean;
	status: string;
};

// getGitBadgeText — from file-explorer-sidebar.tsx:131
function getGitBadgeText(file: GitFileEntry): string {
	switch (file.status) {
		case 'modified':
			return file.staged && !file.unstaged ? 'S' : 'M';
		case 'untracked':
			return 'N';
		case 'added':
			return 'A';
		case 'deleted':
			return 'D';
		case 'conflicted':
			return '!';
		case 'renamed':
			return 'R';
		case 'typechange':
			return 'T';
		default:
			return '';
	}
}

// getGitBadgeClassName — from file-explorer-sidebar.tsx:152
function getGitBadgeClassName(file: GitFileEntry): string {
	const baseClassName = 'min-w-[1ch] text-center';

	switch (file.status) {
		case 'conflicted':
			return `${baseClassName} text-destructive`;
		case 'modified':
			if (file.staged && file.unstaged) {
				return `${baseClassName} text-warning`;
			}
			return file.staged
				? `${baseClassName} text-success`
				: `${baseClassName} text-warning`;
		case 'untracked':
		case 'added':
			return `${baseClassName} text-success`;
		case 'deleted':
			return `${baseClassName} text-destructive`;
		case 'renamed':
		case 'typechange':
			return `${baseClassName} text-info`;
		default:
			return `${baseClassName} text-muted-foreground`;
	}
}

// getGitFilePriority — from file-explorer-sidebar.tsx:180
function getGitFilePriority(file: GitFileEntry): number {
	return gitFileStatePriority[file.status] * 10 + Number(file.unstaged);
}

type GitBranchStatus = {
	name: string | null;
	upstream: string | null;
	ahead: number;
	behind: number;
};

type GitStatus = {
	branch: GitBranchStatus | null;
	conflictedFiles: string[];
	hasRepository: boolean;
	stagedCount: number;
	unstagedCount: number;
	totalChangedCount: number;
	files: GitFileEntry[];
	repositoryState: string;
};

// getBranchLabel — from git-panel.tsx:96
function getBranchLabel(status: GitStatus | null): string {
	if (!status?.branch?.name) {
		return '未初始化 Git';
	}
	return status.branch.name;
}

// getSummary — from git-panel.tsx:104
function getSummary(status: GitStatus | null): string {
	if (!status) {
		return '正在读取仓库状态';
	}

	if (!status.hasRepository) {
		return '当前工作区还不是 Git 仓库';
	}

	if (status.conflictedFiles.length > 0) {
		switch (status.repositoryState) {
			case 'revert':
				return `正在回滚，${status.conflictedFiles.length} 个冲突待解决`;
			case 'merge':
				return `正在合并，${status.conflictedFiles.length} 个冲突待解决`;
			case 'cherryPick':
				return `正在拣选，${status.conflictedFiles.length} 个冲突待解决`;
			case 'rebase':
				return `正在变基，${status.conflictedFiles.length} 个冲突待解决`;
			default:
				return `${status.conflictedFiles.length} 个冲突待解决`;
		}
	}

	const parts: string[] = [];

	if (status.branch?.ahead) {
		parts.push(`领先 ${status.branch.ahead}`);
	}

	if (status.branch?.behind) {
		parts.push(`落后 ${status.branch.behind}`);
	}

	if (status.totalChangedCount === 0) {
		return parts.length > 0
			? `工作区干净 · ${parts.join(' · ')}`
			: '工作区干净';
	}

	const changeInfo = `${status.stagedCount} 已暂存 / ${status.unstagedCount} 未暂存`;
	return parts.length > 0 ? `${changeInfo} · ${parts.join(' · ')}` : changeInfo;
}

// getCommitLabel — from commit.tsx:63
function getCommitLabel(status: GitStatus | null): string {
	if (status?.conflictedFiles.length) {
		switch (status.repositoryState) {
			case 'revert':
				return '正在回滚 · 提交解决结果';
			case 'merge':
				return '正在合并 · 提交解决结果';
			case 'cherryPick':
				return '正在拣选 · 提交解决结果';
			case 'rebase':
				return '正在变基 · 提交解决结果';
			default:
				return '提交解决冲突';
		}
	}

	return '提交已暂存更改';
}

describe('statusLabels', () => {
	it('has all required keys', () => {
		expect(statusLabels).toHaveProperty('added', 'A');
		expect(statusLabels).toHaveProperty('conflicted', '!');
		expect(statusLabels).toHaveProperty('deleted', 'D');
		expect(statusLabels).toHaveProperty('modified', 'M');
		expect(statusLabels).toHaveProperty('renamed', 'R');
		expect(statusLabels).toHaveProperty('typechange', 'T');
		expect(statusLabels).toHaveProperty('untracked', '?');
	});
});

describe('statusColors', () => {
	it('has all required keys', () => {
		expect(statusColors).toHaveProperty('added');
		expect(statusColors).toHaveProperty('conflicted');
		expect(statusColors).toHaveProperty('deleted');
		expect(statusColors).toHaveProperty('modified');
		expect(statusColors).toHaveProperty('renamed');
		expect(statusColors).toHaveProperty('typechange');
		expect(statusColors).toHaveProperty('untracked');
	});

	it('all values contain valid CSS classes', () => {
		for (const [, value] of Object.entries(statusColors)) {
			expect(value).toContain('bg-');
			expect(value).toContain('text-');
			expect(value).toContain('border-');
		}
	});

	it('conflicted and deleted use destructive styles', () => {
		expect(statusColors.conflicted).toContain('text-red-500');
		expect(statusColors.deleted).toContain('text-red-500');
	});

	it('added and untracked use success styles', () => {
		expect(statusColors.added).toContain('text-emerald-500');
		expect(statusColors.untracked).toContain('text-emerald-500');
	});

	it('modified uses amber styles', () => {
		expect(statusColors.modified).toContain('text-amber-500');
	});
});

describe('getGitBadgeText', () => {
	it('returns M for unstaged modified', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: true,
				status: 'modified',
			})
		).toBe('M');
	});

	it('returns S for staged-only modified', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: true,
				unstaged: false,
				status: 'modified',
			})
		).toBe('S');
	});

	it('returns M for both staged and unstaged modified', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: true,
				unstaged: true,
				status: 'modified',
			})
		).toBe('M');
	});

	it('returns N for untracked', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: false,
				status: 'untracked',
			})
		).toBe('N');
	});

	it('returns A for added', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: false,
				status: 'added',
			})
		).toBe('A');
	});

	it('returns D for deleted', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: false,
				status: 'deleted',
			})
		).toBe('D');
	});

	it('returns ! for conflicted', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: false,
				status: 'conflicted',
			})
		).toBe('!');
	});

	it('returns R for renamed', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: false,
				status: 'renamed',
			})
		).toBe('R');
	});

	it('returns T for typechange', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: false,
				status: 'typechange',
			})
		).toBe('T');
	});

	it('returns empty string for unknown status', () => {
		expect(
			getGitBadgeText({
				path: 'f.txt',
				staged: false,
				unstaged: false,
				status: 'unknown',
			})
		).toBe('');
	});
});

describe('getGitBadgeClassName', () => {
	it('uses destructive for conflicted', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: false,
			unstaged: false,
			status: 'conflicted',
		});
		expect(cls).toContain('text-destructive');
	});

	it('uses warning for unstaged modified', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: false,
			unstaged: true,
			status: 'modified',
		});
		expect(cls).toContain('text-warning');
	});

	it('uses success for staged-only modified', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: true,
			unstaged: false,
			status: 'modified',
		});
		expect(cls).toContain('text-success');
	});

	it('uses warning for both staged and unstaged modified', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: true,
			unstaged: true,
			status: 'modified',
		});
		expect(cls).toContain('text-warning');
	});

	it('uses success for added', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: false,
			unstaged: false,
			status: 'added',
		});
		expect(cls).toContain('text-success');
	});

	it('uses success for untracked', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: false,
			unstaged: false,
			status: 'untracked',
		});
		expect(cls).toContain('text-success');
	});

	it('uses destructive for deleted', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: false,
			unstaged: false,
			status: 'deleted',
		});
		expect(cls).toContain('text-destructive');
	});

	it('uses info for renamed', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: false,
			unstaged: false,
			status: 'renamed',
		});
		expect(cls).toContain('text-info');
	});

	it('uses info for typechange', () => {
		const cls = getGitBadgeClassName({
			path: 'f.txt',
			staged: false,
			unstaged: false,
			status: 'typechange',
		});
		expect(cls).toContain('text-info');
	});
});

describe('getGitFilePriority', () => {
	it('prioritizes conflicted over modified', () => {
		const conflicted: GitFileEntry = {
			path: 'a',
			staged: false,
			unstaged: false,
			status: 'conflicted',
		};
		const modified: GitFileEntry = {
			path: 'b',
			staged: false,
			unstaged: false,
			status: 'modified',
		};
		expect(getGitFilePriority(conflicted)).toBeGreaterThan(
			getGitFilePriority(modified)
		);
	});

	it('prioritizes unstaged files higher', () => {
		const unstaged: GitFileEntry = {
			path: 'a',
			staged: false,
			unstaged: true,
			status: 'modified',
		};
		const staged: GitFileEntry = {
			path: 'b',
			staged: true,
			unstaged: false,
			status: 'modified',
		};
		expect(getGitFilePriority(unstaged)).toBeGreaterThan(
			getGitFilePriority(staged)
		);
	});

	it('priority order: conflicted > modified > untracked > added > deleted > renamed > typechange', () => {
		const statuses = [
			'conflicted',
			'modified',
			'untracked',
			'added',
			'deleted',
			'renamed',
			'typechange',
		];
		const entries: GitFileEntry[] = statuses.map((s) => ({
			path: s,
			staged: false,
			unstaged: false,
			status: s,
		}));
		const priorities = entries.map(getGitFilePriority);
		for (let i = 1; i < priorities.length; i++) {
			expect(priorities[i - 1]).toBeGreaterThan(priorities[i]);
		}
	});
});

describe('getBranchLabel', () => {
	it('returns branch name when available', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 },
			conflictedFiles: [],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'clean',
		};
		expect(getBranchLabel(status)).toBe('main');
	});

	it('returns fallback for null status', () => {
		expect(getBranchLabel(null)).toBe('未初始化 Git');
	});

	it('returns fallback when branch name is missing', () => {
		const status: GitStatus = {
			branch: null,
			conflictedFiles: [],
			hasRepository: false,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'clean',
		};
		expect(getBranchLabel(status)).toBe('未初始化 Git');
	});
});

describe('getSummary', () => {
	it('returns loading message for null status', () => {
		expect(getSummary(null)).toBe('正在读取仓库状态');
	});

	it('returns not-a-repo message when no repository', () => {
		const status: GitStatus = {
			branch: null,
			conflictedFiles: [],
			hasRepository: false,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'clean',
		};
		expect(getSummary(status)).toBe('当前工作区还不是 Git 仓库');
	});

	it('reports revert conflict count', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: ['f1.txt', 'f2.txt'],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'revert',
		};
		expect(getSummary(status)).toBe('正在回滚，2 个冲突待解决');
	});

	it('reports merge conflict count', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: ['f1.txt'],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'merge',
		};
		expect(getSummary(status)).toBe('正在合并，1 个冲突待解决');
	});

	it('reports general conflict count for unknown state', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: ['f.txt'],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'bisect',
		};
		expect(getSummary(status)).toBe('1 个冲突待解决');
	});

	it('shows clean workspace', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: [],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'clean',
		};
		expect(getSummary(status)).toBe('工作区干净');
	});

	it('shows ahead/behind info', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 3, behind: 2 },
			conflictedFiles: [],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'clean',
		};
		expect(getSummary(status)).toContain('领先 3');
		expect(getSummary(status)).toContain('落后 2');
	});

	it('shows staged/unstaged counts', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: [],
			hasRepository: true,
			stagedCount: 2,
			unstagedCount: 3,
			totalChangedCount: 5,
			files: [],
			repositoryState: 'clean',
		};
		expect(getSummary(status)).toContain('2 已暂存');
		expect(getSummary(status)).toContain('3 未暂存');
	});
});

describe('getCommitLabel', () => {
	it('returns default commit message when no conflicts', () => {
		expect(getCommitLabel(null)).toBe('提交已暂存更改');
	});

	it('returns conflict resolve message for merge state', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: ['f.txt'],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'merge',
		};
		expect(getCommitLabel(status)).toBe('正在合并 · 提交解决结果');
	});

	it('returns conflict resolve message for revert state', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: ['f.txt'],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'revert',
		};
		expect(getCommitLabel(status)).toBe('正在回滚 · 提交解决结果');
	});

	it('returns generic conflict message for unknown state', () => {
		const status: GitStatus = {
			branch: { name: 'main', upstream: '', ahead: 0, behind: 0 },
			conflictedFiles: ['f.txt'],
			hasRepository: true,
			stagedCount: 0,
			unstagedCount: 0,
			totalChangedCount: 0,
			files: [],
			repositoryState: 'bisect',
		};
		expect(getCommitLabel(status)).toBe('提交解决冲突');
	});
});
