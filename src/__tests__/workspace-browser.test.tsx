import { invoke } from '@tauri-apps/api/core';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceBrowser } from '@/components/explorer/workspace/workspace-browser';
import type { ExplorerNode } from '@/components/explorer/types';
import type { GitStatus } from '@/components/explorer/git/git-types';

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
			name: 'notes.md',
			path: '/workspace/notes.md',
			relativePath: 'notes.md',
			kind: 'file',
			fileKind: 'markdown',
			hasChildren: false,
			loaded: true,
			children: [],
		},
		{
			name: 'docs',
			path: '/workspace/docs',
			relativePath: 'docs',
			kind: 'directory',
			fileKind: null,
			hasChildren: true,
			loaded: true,
			children: [],
		},
	],
};

const pastedRootNode: ExplorerNode = {
	...rootNode,
	children: [
		rootNode.children[0],
		rootNode.children[1],
		{
			...rootNode.children[2],
			children: [
				{
					name: 'readme.md',
					path: '/workspace/docs/readme.md',
					relativePath: 'docs/readme.md',
					kind: 'file',
					fileKind: 'markdown',
					hasChildren: false,
					loaded: true,
					children: [],
				},
			],
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

const defaultWorkspaceState = {
	rootPath: '/workspace',
	openTabPaths: [] as string[],
	lastActiveFilePath: null as string | null,
	sidebarWidth: 320,
	sortEnabled: true,
	showHiddenFiles: false,
	tabBarMode: 'scroll',
};

vi.mock('@/context/app-settings-provider', () => {
	const mockState = {
		showHiddenFiles: false,
		saveMode: 'auto' as const,
		setSaveMode: vi.fn(),
		setShowHiddenFiles: vi.fn(),
	};
	return {
		useAppSettings: () => mockState,
		useAppSettingsStore: Object.assign(
			(selector?: (s: typeof mockState) => unknown) =>
				selector ? selector(mockState) : mockState,
			{ getState: () => mockState, setState: vi.fn() }
		),
	};
});

vi.mock('@/context/ai-settings-provider', () => ({
	useAiSettings: () => ({}),
}));

vi.mock('@/components/explorer/file/file-preview', () => ({
	FilePreview: () => null,
}));

vi.mock('@/components/explorer/workspace/tab-bar', async () => {
	const { useWorkspace } = await import('@/context/workspace-provider');
	return {
		TabBar: () => {
			const { tabs, activeTabId, tabBarMode } = useWorkspace();
			const safeTabs = (tabs ?? []) as Array<{
				id: string;
				node: { isMissing?: boolean; path: string };
			}>;
			const activePath =
				safeTabs.find(
					(tab: { id: string }) => tab.id === (activeTabId as string | null)
				)?.node.path ?? 'none';

			return (
				<div>
					<div>{`tabs:${safeTabs.map((tab) => tab.node.path).join('|')}`}</div>
					<div>{`tab-state:${safeTabs
						.map((tab) => (tab.node.isMissing ? 'missing' : 'present'))
						.join('|')}`}</div>
					<div>{`active:${activePath}`}</div>
					<div>{`mode:${tabBarMode as string}`}</div>
				</div>
			);
		},
	};
});

vi.mock('@/components/ui/toast', () => ({
	showErrorToast: vi.fn(),
}));

vi.mock('@/components/explorer/file/file-explorer-sidebar', async () => {
	const { useWorkspace } = await import('@/context/workspace-provider');
	return {
		FileExplorerSidebar: () => {
			const ctx = useWorkspace();
			const deletedStatus: GitStatus = {
				...emptyStatus,
				branch: { ahead: 0, behind: 0, name: 'main', upstream: null },
				hasGitDirectory: true,
				hasRepository: true,
				hasUnstagedChanges: true,
				unstagedCount: 1,
				totalChangedCount: 1,
				files: [
					{
						hasConflictMarkers: false,
						path: '/workspace/readme.md',
						staged: false,
						status: 'deleted',
						unstaged: true,
					},
				],
			};
			return (
				<div>
					<div>
						{ctx.clipboard
							? `clipboard:${ctx.clipboard.mode}`
							: 'clipboard:empty'}
					</div>
					<div>{`selected:${
						ctx.selectedFile
							? `${ctx.selectedFile.path}:${ctx.selectedFile.isMissing ? 'missing' : 'present'}`
							: 'none'
					}`}</div>
					<button
						type="button"
						onClick={() => ctx.copyNode(rootNode.children[0])}
					>
						copy-node
					</button>
					<button
						type="button"
						onClick={() => void ctx.pasteNode('/workspace/docs')}
					>
						paste-node
					</button>
					<button
						type="button"
						onClick={() => {
							ctx.updateGitStatus(deletedStatus);
							void ctx.selectNode({
								...rootNode.children[0],
								isMissing: true,
							});
						}}
					>
						select-deleted-readme
					</button>
					<button
						type="button"
						onClick={() => ctx.updateGitStatus(deletedStatus)}
					>
						mark-readme-deleted
					</button>
				</div>
			);
		},
	};
});

describe('WorkspaceBrowser', () => {
	const mockInvoke = vi.mocked(invoke);
	let workspaceState: typeof defaultWorkspaceState;

	beforeEach(() => {
		window.localStorage.clear();
		workspaceState = { ...defaultWorkspaceState };

		mockInvoke.mockImplementation(async (command) => {
			switch (command) {
				case 'get_workspace_state':
					return workspaceState;
				case 'scan_workspace_folder':
					return mockInvoke.mock.calls.filter(
						([calledCommand]) => calledCommand === 'copy_workspace_node'
					).length > 0
						? pastedRootNode
						: rootNode;
				case 'copy_workspace_node':
					return undefined;
				case 'git_status':
					return emptyStatus;
				case 'read_workspace_file':
					return {
						content: '# test',
						encoding: 'UTF-8',
						fileKind: 'markdown',
						imageDataUrl: null,
						size: 6,
						truncated: false,
					};
				case 'set_workspace_root':
				case 'set_open_tab_paths':
				case 'set_active_tab':
				case 'add_tab':
				case 'close_tab':
				case 'close_tabs':
				case 'set_sidebar_width':
				case 'set_tab_bar_mode':
				case 'clear_workspace_state':
					return undefined;
				default:
					return undefined;
			}
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		window.localStorage.clear();
	});

	it('clears clipboard after copy and paste completes', async () => {
		render(<WorkspaceBrowser />);

		await screen.findByText('copy-node');
		expect(screen.getByText('clipboard:empty')).toBeInTheDocument();

		fireEvent.click(screen.getByText('copy-node'));
		expect(screen.getByText('clipboard:copy')).toBeInTheDocument();

		fireEvent.click(screen.getByText('paste-node'));

		await waitFor(() => {
			expect(screen.getByText('clipboard:empty')).toBeInTheDocument();
		});
		expect(mockInvoke).toHaveBeenCalledWith(
			'copy_workspace_node',
			expect.objectContaining({
				destinationDirectory: '/workspace/docs',
				sourcePath: '/workspace/readme.md',
			})
		);
	});

	it('restores the last opened file into the tab bar on mount', async () => {
		// Simulate a restored state with an active file path
		workspaceState.lastActiveFilePath = '/workspace/readme.md';

		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(
				screen.getAllByText('tabs:/workspace/readme.md').length
			).toBeGreaterThan(0);
			expect(
				screen.getAllByText('active:/workspace/readme.md').length
			).toBeGreaterThan(0);
		});
	});

	it('restores multiple persisted tabs without clearing storage on boot', async () => {
		workspaceState.openTabPaths = [
			'/workspace/readme.md',
			'/workspace/notes.md',
		];
		workspaceState.lastActiveFilePath = '/workspace/readme.md';

		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(
				screen.getAllByText('tabs:/workspace/readme.md|/workspace/notes.md')
					.length
			).toBeGreaterThan(0);
			expect(
				screen.getAllByText('active:/workspace/readme.md').length
			).toBeGreaterThan(0);
		});
	});

	it('syncs the active tab when selecting a deleted tree node at the same path', async () => {
		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(screen.getAllByText('tab-state:present').length).toBeGreaterThan(
				0
			);
			expect(
				screen.getAllByText('selected:/workspace/readme.md:present').length
			).toBeGreaterThan(0);
		});

		fireEvent.click(screen.getByText('select-deleted-readme'));

		await waitFor(() => {
			expect(screen.getAllByText('tab-state:missing').length).toBeGreaterThan(
				0
			);
			expect(
				screen.getAllByText('selected:/workspace/readme.md:missing').length
			).toBeGreaterThan(0);
		});
	});

	it('marks open tabs and the selected file missing when git reports deletion', async () => {
		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(screen.getAllByText('tab-state:present').length).toBeGreaterThan(
				0
			);
			expect(
				screen.getAllByText('selected:/workspace/readme.md:present').length
			).toBeGreaterThan(0);
		});

		fireEvent.click(screen.getByText('mark-readme-deleted'));

		await waitFor(() => {
			expect(screen.getAllByText('tab-state:missing').length).toBeGreaterThan(
				0
			);
			expect(
				screen.getAllByText('selected:/workspace/readme.md:missing').length
			).toBeGreaterThan(0);
		});
	});

	it('reads tab bar mode from workspace state', async () => {
		workspaceState.tabBarMode = 'wrap';

		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(screen.getAllByText('mode:wrap').length).toBeGreaterThan(0);
		});
	});
});
