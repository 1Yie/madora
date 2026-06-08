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

vi.mock('@/components/system/ai-settings-provider', () => ({
	useAiSettings: () => ({ showHiddenFiles: false }),
}));

vi.mock('@/components/explorer/file/file-preview', () => ({
	FilePreview: () => null,
}));

vi.mock('@/components/explorer/workspace/tab-bar', () => ({
	TabBar: (props: {
		tabs: Array<{ id: string; node: { path: string } }>;
		activeTabId: string | null;
		tabBarMode: 'scroll' | 'wrap';
	}) => {
		const activePath =
			props.tabs.find((tab) => tab.id === props.activeTabId)?.node.path ??
			'none';

		return (
			<div>
				<div>{`tabs:${props.tabs.map((tab) => tab.node.path).join('|')}`}</div>
				<div>{`active:${activePath}`}</div>
				<div>{`mode:${props.tabBarMode}`}</div>
			</div>
		);
	},
}));

vi.mock('@/components/ui/toast', () => ({
	showErrorToast: vi.fn(),
}));

vi.mock('@/components/explorer/file/file-explorer-sidebar', () => ({
	FileExplorerSidebar: (props: {
		clipboard: { mode: 'copy' | 'cut' } | null;
		onCopyNode: (node: ExplorerNode) => void;
		onPasteNode: (destinationPath: string | null) => Promise<void>;
	}) => (
		<div>
			<div>
				{props.clipboard
					? `clipboard:${props.clipboard.mode}`
					: 'clipboard:empty'}
			</div>
			<button
				type="button"
				onClick={() => props.onCopyNode(rootNode.children[0])}
			>
				copy-node
			</button>
			<button
				type="button"
				onClick={() => void props.onPasteNode('/workspace/docs')}
			>
				paste-node
			</button>
		</div>
	),
}));

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

	it('reads tab bar mode from workspace state', async () => {
		workspaceState.tabBarMode = 'wrap';

		render(<WorkspaceBrowser />);

		await waitFor(() => {
			expect(screen.getAllByText('mode:wrap').length).toBeGreaterThan(0);
		});
	});
});
