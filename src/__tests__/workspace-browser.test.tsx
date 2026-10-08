import { StrictMode } from 'react';
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
	rootPath: '/workspace' as string | null,
	openTabPaths: [] as string[],
	lastActiveFilePath: null as string | null,
	sidebarWidth: 320,
	sortEnabled: true,
	showHiddenFiles: false,
	tabBarMode: 'scroll',
	zoomLevel: 1,
};

vi.mock('@/context/app-settings-provider', () => {
	const mockState = {
		showHiddenFiles: false,
		saveMode: 'auto' as const,
		editorFontSize: 14,
		setSaveMode: vi.fn(),
		setShowHiddenFiles: vi.fn(),
		setEditorFontSize: vi.fn(),
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

vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(async () => () => undefined),
}));

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
					<div>{`sidebar-busy:${ctx.sidebarBusy ? 'yes' : 'no'}`}</div>
					<button type="button" onClick={() => void ctx.openFolder()}>
						open-folder
					</button>
					<button
						type="button"
						onClick={() => void ctx.selectNode(rootNode.children[2])}
					>
						select-folder
					</button>
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
	let pickedFolderResult: ExplorerNode | null;
	let pendingOpenFiles: string[][];

	beforeEach(() => {
		window.localStorage.clear();
		workspaceState = { ...defaultWorkspaceState };
		pickedFolderResult = rootNode;
		// Each call hands out the next batch, then nothing, like the backend.
		pendingOpenFiles = [];

		mockInvoke.mockImplementation(async (command) => {
			switch (command) {
				case 'get_workspace_state':
					return workspaceState;
				case 'take_pending_open_files':
					return pendingOpenFiles.shift() ?? [];
				case 'pick_workspace_folder':
					return pickedFolderResult;
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
				case 'leave_workspace':
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

	it('clears sidebar busy when folder selection is cancelled', async () => {
		pickedFolderResult = null;
		render(<WorkspaceBrowser />);

		await screen.findByText('open-folder');
		fireEvent.click(screen.getByText('open-folder'));

		await waitFor(() => {
			expect(mockInvoke).toHaveBeenCalledWith(
				'pick_workspace_folder',
				expect.objectContaining({
					showHiddenFiles: false,
					sort: true,
				})
			);
			expect(screen.getByText('sidebar-busy:no')).toBeInTheDocument();
		});
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

	it('clears the active tab highlight when selecting a folder in the tree', async () => {
		workspaceState.lastActiveFilePath = '/workspace/readme.md';

		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(
				screen.getAllByText('active:/workspace/readme.md').length
			).toBeGreaterThan(0);
		});

		fireEvent.click(screen.getByText('select-folder'));

		await waitFor(() => {
			expect(screen.getAllByText('active:none').length).toBeGreaterThan(0);
			expect(screen.getAllByText('selected:none').length).toBeGreaterThan(0);
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

	describe('files opened from the OS', () => {
		const persistenceCommands = [
			'set_workspace_root',
			'set_open_tab_paths',
			'set_active_tab',
			'add_tab',
			'close_tab',
			'close_tabs',
		];
		const persistenceCalls = () =>
			mockInvoke.mock.calls.filter(([command]) =>
				persistenceCommands.includes(command)
			);

		// The store is a module-level singleton, so a session opened by one test
		// would otherwise still be there for the next.
		beforeEach(async () => {
			const { useWorkspaceStore } =
				await import('@/context/workspace-provider');
			useWorkspaceStore.setState({
				root: null,
				documentMode: false,
				initialised: false,
				tabs: [],
				activeTabId: null,
				selectedFile: null,
				selectedNodePath: null,
				preview: null,
			});
		});

		it('opens a document session without a file tree', async () => {
			workspaceState.rootPath = null;
			pendingOpenFiles = [['/elsewhere/note.md']];

			render(<WorkspaceBrowser />);

			await waitFor(() => {
				expect(
					screen.getAllByText('tabs:/elsewhere/note.md').length
				).toBeGreaterThan(0);
				expect(
					screen.getAllByText('active:/elsewhere/note.md').length
				).toBeGreaterThan(0);
			});
			expect(screen.queryByText('open-folder')).not.toBeInTheDocument();
			expect(mockInvoke).toHaveBeenCalledWith('read_workspace_file', {
				path: '/elsewhere/note.md',
			});
			// Serving the remembered workspace while a document session is open
			// would leave two answers to "which folder is open".
			expect(mockInvoke).toHaveBeenCalledWith('leave_workspace');
		});

		it('wins over the saved workspace and never overwrites it', async () => {
			workspaceState.lastActiveFilePath = '/workspace/readme.md';
			workspaceState.openTabPaths = ['/workspace/readme.md'];
			pendingOpenFiles = [['/elsewhere/note.md']];

			render(<WorkspaceBrowser />);

			await waitFor(() => {
				expect(
					screen.getAllByText('tabs:/elsewhere/note.md').length
				).toBeGreaterThan(0);
			});
			expect(screen.queryByText('open-folder')).not.toBeInTheDocument();
			expect(mockInvoke).not.toHaveBeenCalledWith(
				'scan_workspace_folder',
				expect.anything()
			);
			expect(persistenceCalls()).toEqual([]);
		});

		it('keeps the document session when StrictMode initialises twice', async () => {
			workspaceState.lastActiveFilePath = '/workspace/readme.md';
			workspaceState.openTabPaths = ['/workspace/readme.md'];
			pendingOpenFiles = [['/elsewhere/note.md']];

			render(
				<StrictMode>
					<WorkspaceBrowser />
				</StrictMode>
			);

			await waitFor(() => {
				expect(
					screen.getAllByText('tabs:/elsewhere/note.md').length
				).toBeGreaterThan(0);
			});
			const { useWorkspaceStore } =
				await import('@/context/workspace-provider');
			expect(useWorkspaceStore.getState().root).toBeNull();
			expect(mockInvoke).not.toHaveBeenCalledWith(
				'scan_workspace_folder',
				expect.anything()
			);
		});

		it('opens several files, the last one active, each once', async () => {
			workspaceState.rootPath = null;
			pendingOpenFiles = [['/a/one.md', '/b/two.md', '/a/one.md']];

			render(<WorkspaceBrowser />);

			await waitFor(() => {
				expect(
					screen.getAllByText('tabs:/a/one.md|/b/two.md').length
				).toBeGreaterThan(0);
				expect(screen.getAllByText('active:/b/two.md').length).toBeGreaterThan(
					0
				);
			});
		});

		it('adds files opened later as tabs next to the workspace files', async () => {
			workspaceState.lastActiveFilePath = '/workspace/readme.md';

			render(<WorkspaceBrowser />);
			await screen.findByText('open-folder');

			const { useWorkspaceStore } =
				await import('@/context/workspace-provider');
			await useWorkspaceStore.getState().openDocuments(['/elsewhere/note.md']);

			await waitFor(() => {
				expect(
					screen.getAllByText('tabs:/workspace/readme.md|/elsewhere/note.md')
						.length
				).toBeGreaterThan(0);
			});
			// The workspace stays: its tree is still there.
			expect(screen.getByText('open-folder')).toBeInTheDocument();
			expect(mockInvoke).not.toHaveBeenCalledWith('leave_workspace');
		});

		it('opens a workspace file as its tree node, not a second tab', async () => {
			workspaceState.lastActiveFilePath = '/workspace/notes.md';
			workspaceState.openTabPaths = [
				'/workspace/readme.md',
				'/workspace/notes.md',
			];

			render(<WorkspaceBrowser />);
			await waitFor(() => {
				expect(
					screen.getAllByText('active:/workspace/notes.md').length
				).toBeGreaterThan(0);
			});

			const { useWorkspaceStore } =
				await import('@/context/workspace-provider');
			await useWorkspaceStore
				.getState()
				.openDocuments(['/workspace/readme.md']);

			const { tabs, selectedFile } = useWorkspaceStore.getState();
			expect(tabs).toHaveLength(2);
			expect(tabs[0].node.relativePath).toBe('readme.md');
			expect(selectedFile?.path).toBe('/workspace/readme.md');
		});

		it('leaves the document session when a folder is opened', async () => {
			workspaceState.rootPath = null;
			pendingOpenFiles = [['/elsewhere/note.md']];

			render(<WorkspaceBrowser />);
			await waitFor(() => {
				expect(screen.queryByText('open-folder')).not.toBeInTheDocument();
			});

			const { useWorkspaceStore } =
				await import('@/context/workspace-provider');
			await useWorkspaceStore.getState().openFolder();

			await waitFor(() => {
				expect(screen.getByText('open-folder')).toBeInTheDocument();
			});
			expect(mockInvoke).toHaveBeenCalledWith('set_workspace_root', {
				rootPath: '/workspace',
			});
		});
	});

	it('keeps the remembered workspace when restoring it fails', async () => {
		const base = mockInvoke.getMockImplementation();
		mockInvoke.mockImplementation(async (command, args) => {
			if (command === 'scan_workspace_folder') {
				throw new Error('the folder is not reachable');
			}
			return base?.(command, args);
		});

		render(<WorkspaceBrowser />);

		const { useWorkspaceStore } = await import('@/context/workspace-provider');
		await waitFor(() => {
			expect(useWorkspaceStore.getState().sidebarError).toBeTruthy();
		});
		// The folder may come back — an unplugged drive, a share that is briefly
		// offline — so a failed restore must not forget it.
		expect(mockInvoke).not.toHaveBeenCalledWith('clear_workspace_state');
	});

	it('reads tab bar mode from workspace state', async () => {
		workspaceState.tabBarMode = 'wrap';

		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(screen.getAllByText('mode:wrap').length).toBeGreaterThan(0);
		});
	});
});
