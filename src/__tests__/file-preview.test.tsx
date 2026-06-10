import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { useWorkspaceStore } from '@/context/workspace-provider';
import { FilePreview } from '@/components/explorer/file/file-preview';
import type {
	ExplorerNode,
	FilePreview as ExplorerFilePreview,
} from '@/components/explorer/types';

afterEach(() => {
	cleanup();
});

vi.mock('@/components/explorer/code-block', () => ({
	CodeBlock: ({ code }: { code: string }) => (
		<pre data-testid="code-block">{code}</pre>
	),
}));

vi.mock('@/components/explorer/git/conflict-editor', () => ({
	ConflictEditor: () => (
		<div data-testid="conflict-editor">conflict editor</div>
	),
}));

vi.mock('@/components/explorer/markdown/markdown-workspace', () => ({
	MarkdownWorkspace: ({ content }: { content: string }) => (
		<div data-testid="markdown-workspace">{content}</div>
	),
}));

vi.mock('@/components/explorer/workspace/text-workspace', () => ({
	TextWorkspace: ({ content }: { content: string }) => (
		<div data-testid="text-workspace">{content}</div>
	),
}));

const selectedFileNode: ExplorerNode = {
	name: 'conflict.txt',
	path: '/repo/conflict.txt',
	relativePath: 'conflict.txt',
	kind: 'file',
	fileKind: 'text',
	hasChildren: false,
	loaded: true,
	children: [],
};

function createMockContextValue(overrides?: Record<string, unknown>) {
	const noop = () => undefined;
	const asyncNoop = async () => {};
	return {
		root: {
			...selectedFileNode,
			name: 'repo',
			path: '/repo',
			kind: 'directory' as const,
			hasChildren: true,
			loaded: true,
			children: [selectedFileNode],
		},
		initialised: true,
		loadingPaths: new Set<string>(),
		expandDirectory: asyncNoop,
		tabs: [],
		activeTabId: null,
		selectTab: noop,
		closeTabAction: noop,
		closeTabsAction: noop,
		reorderTabs: noop,
		tabBarMode: 'scroll' as const,
		selectedFile: null,
		selectedNodePath: null,
		preview: null,
		previewLoading: false,
		selectNode: asyncNoop,
		sidebarWidth: 320,
		sidebarBusy: false,
		operationBusy: null,
		createBusy: false,
		sortEnabled: true,
		sidebarError: null,
		setSidebarWidth: noop,
		clipboard: null,
		copyNode: noop,
		cutNode: noop,
		pasteNode: asyncNoop,
		clearClipboard: noop,
		gitStatus: null,
		gitBusy: false,
		refreshGitStatus: asyncNoop,
		updateGitStatus: noop,
		createMarkdownDocument: asyncNoop,
		createDirectory: asyncNoop,
		renameNode: asyncNoop,
		deleteNode: asyncNoop,
		restoreDeletedNode: asyncNoop,
		importExternalFilesHandler: asyncNoop,
		openFolder: asyncNoop,
		refreshFolder: asyncNoop,
		toggleSort: asyncNoop,
		gitRefresh: asyncNoop,
		gitRefreshWorkspace: asyncNoop,
		...overrides,
	};
}

function renderPreview(
	preview: ExplorerFilePreview,
	conflictedFilePaths = ['conflict.txt']
) {
	const gitStatus = {
		branch: { name: 'main', upstream: null, ahead: 0, behind: 0 },
		conflictedFiles: conflictedFilePaths,
		hasRepository: true,
		hasGitDirectory: true,
		hasStagedChanges: false,
		hasUnstagedChanges: false,
		hasUntrackedFiles: false,
		isMerging: false,
		remotes: [],
		repositoryState: 'merge' as const,
		stagedCount: 0,
		totalChangedCount: 0,
		unstagedCount: 0,
		files: [],
	};
	useWorkspaceStore.setState(
		createMockContextValue({
			root: {
				name: 'repo',
				path: '/repo',
				relativePath: '',
				kind: 'directory',
				fileKind: null,
				hasChildren: true,
				loaded: true,
				children: [selectedFileNode],
			},
			selectedFile: selectedFileNode,
			preview,
			gitStatus,
		})
	);
	return render(<FilePreview />);
}

describe('FilePreview', () => {
	it('shows guidance for markerless index conflicts', () => {
		renderPreview({
			fileKind: 'text',
			content: 'resolved worktree content\n',
			encoding: 'utf-8',
			imageDataUrl: null,
			size: 24,
			truncated: false,
		});

		expect(screen.getByText('这个冲突没有内联冲突标记')).toBeInTheDocument();
		expect(screen.getByTestId('code-block')).toBeInTheDocument();
		expect(screen.queryByTestId('conflict-editor')).not.toBeInTheDocument();
	});

	it('opens the conflict editor when markers exist', () => {
		renderPreview({
			fileKind: 'text',
			content: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n',
			encoding: 'utf-8',
			imageDataUrl: null,
			size: 48,
			truncated: false,
		});

		expect(screen.getByTestId('conflict-editor')).toBeInTheDocument();
		expect(
			screen.queryByText('这个冲突没有内联冲突标记')
		).not.toBeInTheDocument();
	});
});
