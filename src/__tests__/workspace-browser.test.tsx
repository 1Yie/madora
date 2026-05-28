import { invoke } from '@tauri-apps/api/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
		{
			...rootNode.children[1],
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

vi.mock('@/components/system/ai-settings-provider', () => ({
	useAiSettings: () => ({ showHiddenFiles: false }),
}));

vi.mock('@/components/explorer/file/file-preview', () => ({
	FilePreview: () => null,
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

	beforeEach(() => {
		window.localStorage.clear();
		window.localStorage.setItem('madora-workspace-root-path', '/workspace');
		mockInvoke.mockImplementation(async (command) => {
			switch (command) {
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
				default:
					return undefined;
			}
		});
	});

	afterEach(() => {
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
});
