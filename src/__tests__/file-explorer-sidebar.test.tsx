import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';

vi.mock('@tanstack/react-virtual', () => ({
	useVirtualizer: ({
		count,
		estimateSize,
		getItemKey,
	}: {
		count: number;
		estimateSize: () => number;
		getItemKey?: (index: number) => string | number;
	}) => ({
		getTotalSize: () => count * estimateSize(),
		getVirtualItems: () =>
			Array.from({ length: count }, (_, index) => ({
				index,
				key: getItemKey?.(index) ?? index,
				start: index * estimateSize(),
				size: estimateSize(),
			})),
		measureElement: vi.fn(),
		scrollToIndex: vi.fn(),
	}),
}));

import { useWorkspaceStore } from '@/context/workspace-provider';
import { FileExplorerSidebar } from '@/components/explorer/file/file-explorer-sidebar';
import type { ExplorerNode } from '@/components/explorer/types';
import type { GitStatus } from '@/components/explorer/git/git-types';
import { pathExists } from '@/invoke/system';

vi.mock('@/invoke/system', () => ({
	pathExists: vi.fn(),
}));

vi.mock('@tauri-apps/api/webview', () => ({
	getCurrentWebview: () => ({
		onDragDropEvent: vi.fn(() => Promise.resolve(vi.fn())),
	}),
}));

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.clearAllMocks();
});

const emptyLoadingPaths = new Set<string>();

const rootNode: ExplorerNode = {
	name: 'workspace',
	path: '/workspace',
	relativePath: '',
	kind: 'directory',
	fileKind: null,
	hasChildren: true,
	loaded: true,
	children: [
		{
			name: 'readme.md',
			path: '/workspace/readme.md',
			relativePath: 'readme.md',
			kind: 'file',
			fileKind: 'markdown',
			hasChildren: false,
			loaded: true,
			children: [],
		},
		{
			name: 'notes.txt',
			path: '/workspace/notes.txt',
			relativePath: 'notes.txt',
			kind: 'file',
			fileKind: 'text',
			hasChildren: false,
			loaded: true,
			children: [],
		},
	],
};

const emptyStatus: GitStatus = {
	branch: null,
	conflictedFiles: [],
	hasRepository: false,
	hasGitDirectory: false,
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

function noop() {}
function asyncNoop() {
	return Promise.resolve();
}

interface SidebarTestOptions {
	root?: ExplorerNode;
	selectedPath?: string | null;
	busy?: boolean;
	createBusy?: boolean;
	gitBusy?: boolean;
	gitStatus?: GitStatus | null;
	operationBusy?: 'create' | 'rename' | 'delete' | 'move' | null;
	clipboard?: {
		item: { name: string; nodeKind: 'file' | 'directory'; path: string };
		mode: 'copy' | 'cut';
	} | null;
	loadingPaths?: Set<string>;
	onCopyNode?: (node: ExplorerNode) => void;
	onCreateMarkdown?: (
		fileName: string,
		targetPath: string | null
	) => Promise<void>;
	onCreateDirectory?: (
		directoryName: string,
		targetPath: string | null
	) => Promise<void>;
	onCutNode?: (node: ExplorerNode) => void;
	onDeleteNode?: (targetPath: string) => Promise<void>;
	onRestoreDeletedNode?: (targetPath: string) => Promise<void>;
	onOpenFolder?: () => void;
	onPasteNode?: (destinationPath: string | null) => Promise<void>;
	onRefresh?: () => void;
	sortEnabled?: boolean;
	onSortToggle?: () => void;
	onGitRefresh?: () => Promise<void>;
	onGitRefreshWorkspace?: () => Promise<void>;
	onGitStatusChange?: (status: GitStatus) => void;
	onRenameNode?: (targetPath: string, newName: string) => Promise<void>;
	onExpandDirectory?: (node: ExplorerNode) => void;
	onSelectNode?: (node: ExplorerNode) => void;
	onClearClipboard?: () => void;
}

function createContextValue(opts: SidebarTestOptions = {}) {
	const {
		root = rootNode,
		selectedPath = null,
		busy = false,
		createBusy = false,
		gitBusy = false,
		gitStatus = emptyStatus,
		operationBusy = null,
		clipboard = null,
		loadingPaths = emptyLoadingPaths,
		onCopyNode = noop,
		onCreateMarkdown = asyncNoop,
		onCreateDirectory = asyncNoop,
		onCutNode = noop,
		onDeleteNode = asyncNoop,
		onRestoreDeletedNode = asyncNoop,
		onOpenFolder = noop,
		onPasteNode = asyncNoop,
		onRefresh = noop,
		sortEnabled = true,
		onSortToggle = noop,
		onGitRefresh = asyncNoop,
		onGitRefreshWorkspace = asyncNoop,
		onGitStatusChange = noop,
		onRenameNode = asyncNoop,
		onExpandDirectory = noop,
		onSelectNode = noop,
		onClearClipboard = noop,
	} = opts;

	return {
		root,
		initialised: true,
		loadingPaths,
		expandDirectory: onExpandDirectory as (node: ExplorerNode) => Promise<void>,
		tabs: [],
		activeTabId: null,
		selectTab: noop,
		closeTabAction: noop,
		closeTabsAction: noop,
		reorderTabs: noop,
		tabBarMode: 'scroll' as const,
		selectedFile: selectedPath
			? (rootNode.children.find((child) => child.path === selectedPath) ?? null)
			: null,
		selectedNodePath: selectedPath,
		preview: null,
		previewLoading: false,
		selectNode: onSelectNode as (node: ExplorerNode) => Promise<void>,
		sidebarWidth: 320,
		sidebarBusy: busy,
		operationBusy,
		createBusy,
		sortEnabled,
		sidebarError: null,
		setSidebarWidth: noop,
		clipboard,
		copyNode: onCopyNode as (node: ExplorerNode) => void,
		cutNode: onCutNode as (node: ExplorerNode) => void,
		pasteNode: onPasteNode as (destinationPath: string | null) => Promise<void>,
		clearClipboard: onClearClipboard as () => void,
		gitStatus,
		gitBusy,
		refreshGitStatus: asyncNoop,
		updateGitStatus: onGitStatusChange as (status: GitStatus) => void,
		createMarkdownDocument: onCreateMarkdown as (
			fileName: string,
			targetPath: string | null
		) => Promise<void>,
		createDirectory: onCreateDirectory as (
			directoryName: string,
			targetPath: string | null
		) => Promise<void>,
		renameNode: onRenameNode as (
			targetPath: string,
			newName: string
		) => Promise<void>,
		deleteNode: onDeleteNode as (targetPath: string) => Promise<void>,
		restoreDeletedNode: onRestoreDeletedNode as (
			targetPath: string
		) => Promise<void>,
		importExternalFilesHandler: asyncNoop,
		openFolder: onOpenFolder as () => Promise<void>,
		refreshFolder: onRefresh as () => Promise<void>,
		toggleSort: onSortToggle as () => Promise<void>,
		gitRefresh: onGitRefresh as () => Promise<void>,
		gitRefreshWorkspace: onGitRefreshWorkspace as () => Promise<void>,
		expandedPaths: new Set<string>(),
		collapsedPaths: new Set<string>(),
		expansionRootPath: root?.path ?? null,
	};
}

function renderSidebar(opts: SidebarTestOptions = {}) {
	useWorkspaceStore.setState(createContextValue(opts));
	return render(<FileExplorerSidebar />);
}

describe('FileExplorerSidebar', () => {
	it('renders root node', () => {
		renderSidebar();
		expect(screen.getByText('workspace')).toBeInTheDocument();
	});

	it('renders file children', () => {
		renderSidebar();
		const readmeElements = screen.getAllByText(/readme\.md/);
		expect(readmeElements.length).toBeGreaterThan(0);
		const notesElements = screen.getAllByText(/notes\.txt/);
		expect(notesElements.length).toBeGreaterThan(0);
	});

	it('shows empty directory message when root has no children', () => {
		const emptyRoot: ExplorerNode = {
			name: 'empty',
			path: '/empty',
			relativePath: '',
			kind: 'directory',
			fileKind: null,
			hasChildren: false,
			loaded: true,
			children: [],
		};
		renderSidebar({ root: emptyRoot });
		expect(screen.getByText('未找到文件')).toBeInTheDocument();
	});

	it('allows collapsing the root directory even when a child is selected', () => {
		renderSidebar({ selectedPath: '/workspace/readme.md' });

		let collapsed = false;

		for (const button of screen.getAllByLabelText('收起 workspace')) {
			fireEvent.click(button);

			if (screen.queryAllByText('readme.md').length === 0) {
				collapsed = true;
				break;
			}
		}

		expect(collapsed).toBe(true);
		expect(screen.getAllByLabelText('展开 workspace').length).toBeGreaterThan(
			0
		);
		expect(screen.queryAllByText('readme.md')).toHaveLength(0);
		expect(screen.queryAllByText('notes.txt')).toHaveLength(0);
	});

	it('resets a reused directory row chevron when items above it change', () => {
		const initialRoot: ExplorerNode = {
			...rootNode,
			children: [
				{
					name: 'alpha',
					path: '/workspace/alpha',
					relativePath: 'alpha',
					kind: 'directory',
					fileKind: null,
					hasChildren: true,
					loaded: true,
					children: [
						{
							name: 'child.md',
							path: '/workspace/alpha/child.md',
							relativePath: 'alpha/child.md',
							kind: 'file',
							fileKind: 'markdown',
							hasChildren: false,
							loaded: true,
							children: [],
						},
					],
				},
				{
					name: 'beta',
					path: '/workspace/beta',
					relativePath: 'beta',
					kind: 'directory',
					fileKind: null,
					hasChildren: false,
					loaded: true,
					children: [],
				},
			],
		};

		const nextRoot: ExplorerNode = {
			...rootNode,
			children: [
				{
					name: 'gamma',
					path: '/workspace/gamma',
					relativePath: 'gamma',
					kind: 'directory',
					fileKind: null,
					hasChildren: false,
					loaded: true,
					children: [],
				},
				{
					name: 'beta',
					path: '/workspace/beta',
					relativePath: 'beta',
					kind: 'directory',
					fileKind: null,
					hasChildren: false,
					loaded: true,
					children: [],
				},
			],
		};

		const view = renderSidebar({ root: initialRoot });

		fireEvent.click(screen.getByLabelText('展开 alpha'));

		const expandedAlphaToggle = screen.getByLabelText('收起 alpha');
		expect(expandedAlphaToggle.querySelector('svg')).toHaveStyle({
			transform: 'rotate(90deg)',
		});

		useWorkspaceStore.setState(createContextValue({ root: nextRoot }));
		view.rerender(<FileExplorerSidebar />);

		const gammaToggle = screen.getByLabelText('展开 gamma');
		expect(gammaToggle.querySelector('svg')).toHaveStyle({
			transform: 'rotate(0deg)',
		});
	});

	it('shows bookmarks only on branches where the file exists', async () => {
		const bookmarkedPath = '/workspace/missing.md';
		window.localStorage.setItem(
			'madora-bookmarks',
			JSON.stringify([bookmarkedPath])
		);

		let bookmarkExists = true;
		vi.mocked(pathExists).mockImplementation(async () => bookmarkExists);

		const view = renderSidebar({
			gitStatus: {
				...emptyStatus,
				branch: { name: 'branch-a', upstream: null, ahead: 0, behind: 0 },
			},
		});

		await waitFor(() => {
			expect(screen.getByText('missing.md')).toBeInTheDocument();
		});

		bookmarkExists = false;
		useWorkspaceStore.setState(
			createContextValue({
				gitStatus: {
					...emptyStatus,
					branch: { name: 'branch-b', upstream: null, ahead: 0, behind: 0 },
				},
			})
		);
		view.rerender(<FileExplorerSidebar />);

		await waitFor(() => {
			expect(screen.queryByText('missing.md')).not.toBeInTheDocument();
		});

		bookmarkExists = true;
		useWorkspaceStore.setState(
			createContextValue({
				gitStatus: {
					...emptyStatus,
					branch: { name: 'branch-a', upstream: null, ahead: 0, behind: 0 },
				},
			})
		);
		view.rerender(<FileExplorerSidebar />);

		await waitFor(() => {
			expect(screen.getByText('missing.md')).toBeInTheDocument();
		});
	});

	it('hides paste action when clipboard is empty', async () => {
		renderSidebar();

		fireEvent.contextMenu(screen.getByRole('button', { name: 'readme.md' }));

		expect(await screen.findByText('复制')).toBeInTheDocument();
		expect(screen.getByText('剪切')).toBeInTheDocument();
		expect(screen.queryByText('粘贴到此处')).not.toBeInTheDocument();
	});

	it('shows paste action only after copy or cut', async () => {
		renderSidebar({
			clipboard: {
				item: {
					name: 'notes.txt',
					nodeKind: 'file',
					path: '/workspace/notes.txt',
				},
				mode: 'copy',
			},
		});

		fireEvent.contextMenu(screen.getByRole('button', { name: 'readme.md' }));

		expect(await screen.findByText('粘贴到此处')).toBeInTheDocument();
		expect(screen.getByText('已复制: notes.txt')).toBeInTheDocument();
	});

	describe('keyboard shortcuts', () => {
		it('Ctrl+C copies the selected node', () => {
			const onCopyNode = vi.fn();
			renderSidebar({
				selectedPath: '/workspace/readme.md',
				onCopyNode,
			});

			const button = screen.getByRole('button', { name: 'readme.md' });
			button.focus();
			fireEvent.keyDown(button, { key: 'c', ctrlKey: true });

			expect(onCopyNode).toHaveBeenCalledOnce();
			expect(onCopyNode).toHaveBeenCalledWith(
				expect.objectContaining({ path: '/workspace/readme.md' })
			);
		});

		it('Ctrl+X cuts the selected node', () => {
			const onCutNode = vi.fn();
			renderSidebar({
				selectedPath: '/workspace/readme.md',
				onCutNode,
			});

			const button = screen.getByRole('button', { name: 'readme.md' });
			button.focus();
			fireEvent.keyDown(button, { key: 'x', ctrlKey: true });

			expect(onCutNode).toHaveBeenCalledOnce();
			expect(onCutNode).toHaveBeenCalledWith(
				expect.objectContaining({ path: '/workspace/readme.md' })
			);
		});

		it('Ctrl+V pastes when clipboard has content', () => {
			const onPasteNode = vi.fn();
			renderSidebar({
				selectedPath: '/workspace/readme.md',
				clipboard: {
					item: {
						name: 'notes.txt',
						nodeKind: 'file',
						path: '/workspace/notes.txt',
					},
					mode: 'copy',
				},
				onPasteNode,
			});

			const button = screen.getByRole('button', { name: 'readme.md' });
			button.focus();
			fireEvent.keyDown(button, { key: 'v', ctrlKey: true });

			expect(onPasteNode).toHaveBeenCalledOnce();
			expect(onPasteNode).toHaveBeenCalledWith('/workspace/readme.md');
		});

		it('Ctrl+V does nothing when clipboard is empty', () => {
			const onPasteNode = vi.fn();
			renderSidebar({
				selectedPath: '/workspace/readme.md',
				clipboard: null,
				onPasteNode,
			});

			const button = screen.getByRole('button', { name: 'readme.md' });
			button.focus();
			fireEvent.keyDown(button, { key: 'v', ctrlKey: true });

			expect(onPasteNode).not.toHaveBeenCalled();
		});

		it('Delete key opens delete confirmation dialog', async () => {
			renderSidebar({ selectedPath: '/workspace/readme.md' });

			const button = screen.getByRole('button', { name: 'readme.md' });
			button.focus();
			fireEvent.keyDown(button, { key: 'Delete' });

			expect(await screen.findByText(/确认删除/)).toBeInTheDocument();
		});

		it('F2 key opens rename dialog', async () => {
			renderSidebar({ selectedPath: '/workspace/readme.md' });

			const button = screen.getByRole('button', { name: 'readme.md' });
			button.focus();
			fireEvent.keyDown(button, { key: 'F2' });

			expect(await screen.findByText(/重命名/)).toBeInTheDocument();
		});

		it('shortcuts do nothing when no node is selected', () => {
			const onCopyNode = vi.fn();
			const onCutNode = vi.fn();
			const onPasteNode = vi.fn();
			renderSidebar({
				selectedPath: null,
				clipboard: {
					item: {
						name: 'notes.txt',
						nodeKind: 'file',
						path: '/workspace/notes.txt',
					},
					mode: 'copy',
				},
				onCopyNode,
				onCutNode,
				onPasteNode,
			});

			const button = screen.getByRole('button', { name: 'readme.md' });
			button.focus();
			fireEvent.keyDown(button, { key: 'c', ctrlKey: true });
			fireEvent.keyDown(button, { key: 'x', ctrlKey: true });
			fireEvent.keyDown(button, { key: 'v', ctrlKey: true });

			expect(onCopyNode).not.toHaveBeenCalled();
			expect(onCutNode).not.toHaveBeenCalled();
			expect(onPasteNode).toHaveBeenCalledWith(null);
		});
	});
});
