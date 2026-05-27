import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GitTabCommit } from '@/components/explorer/git/tab/commit';
import type { GitStatus } from '@/components/explorer/git/git-types';

afterEach(() => {
	vi.clearAllMocks();
});

const emptyStatus: GitStatus = {
	branch: null,
	conflictedFiles: [],
	hasRepository: true,
	hasStagedChanges: false,
	hasUnstagedChanges: false,
	hasUntrackedFiles: false,
	isMerging: false,
	remotes: [],
	repositoryState: 'clean',
	stagedCount: 0,
	totalChangedCount: 0,
	unstagedCount: 0,
	files: [],
};

const statusWithFiles: GitStatus = {
	...emptyStatus,
	totalChangedCount: 2,
	stagedCount: 0,
	unstagedCount: 2,
	files: [
		{
			path: 'src/file1.ts',
			staged: false,
			unstaged: true,
			status: 'modified',
			hasConflictMarkers: false,
		},
		{
			path: 'src/file2.ts',
			staged: false,
			unstaged: true,
			status: 'untracked',
			hasConflictMarkers: false,
		},
	],
};

const statusWithConflicts: GitStatus = {
	...emptyStatus,
	conflictedFiles: ['conflict.ts'],
	files: [
		{
			path: 'conflict.ts',
			staged: true,
			unstaged: true,
			status: 'conflicted',
			hasConflictMarkers: true,
		},
	],
};

const statusWithMarkerlessConflicts: GitStatus = {
	...emptyStatus,
	conflictedFiles: ['conflict.ts'],
	files: [
		{
			path: 'conflict.ts',
			staged: true,
			unstaged: true,
			status: 'conflicted',
			hasConflictMarkers: false,
		},
	],
};

const statusWithStaged: GitStatus = {
	...emptyStatus,
	totalChangedCount: 1,
	stagedCount: 1,
	unstagedCount: 0,
	files: [
		{
			path: 'src/staged.ts',
			staged: true,
			unstaged: false,
			status: 'modified',
			hasConflictMarkers: false,
		},
	],
};

function renderTab(props = {}) {
	return render(
		<GitTabCommit
			actionBusy={false}
			canOperate
			commitMessage=""
			status={emptyStatus}
			onCommit={vi.fn()}
			onCommitAll={vi.fn()}
			onCommitMessageChange={vi.fn()}
			onRefresh={vi.fn()}
			onStageFile={vi.fn()}
			onUnstageFile={vi.fn()}
			{...props}
		/>
	);
}

describe('GitTabCommit', () => {
	it('renders empty state with no changes message', () => {
		renderTab();
		expect(screen.getByText('没有更改需要提交。')).toBeInTheDocument();
	});

	it('shows unstaged files section', () => {
		renderTab({ status: statusWithFiles });
		expect(screen.getByText('更改')).toBeInTheDocument();
		expect(screen.getByText(/file1\.ts/)).toBeInTheDocument();
	});

	it('shows staged files section', () => {
		renderTab({ status: statusWithStaged });
		expect(screen.getByText('已暂存')).toBeInTheDocument();
		expect(screen.getByText(/staged\.ts/)).toBeInTheDocument();
	});

	it('shows conflicted files section', () => {
		renderTab({ status: statusWithConflicts });
		expect(screen.getByText('冲突')).toBeInTheDocument();
	});

	it('shows markerless conflict guidance', () => {
		renderTab({ status: statusWithMarkerlessConflicts });
		expect(
			screen.getByText('这些冲突没有内联标记；确认当前工作区版本后可直接暂存。')
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: '暂存并标记冲突已解决' })
		).toBeInTheDocument();
	});
});
