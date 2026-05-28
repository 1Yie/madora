import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FileExplorerSidebar } from '@/components/explorer/file/file-explorer-sidebar';
import type { ExplorerNode } from '@/components/explorer/types';
import type { GitStatus } from '@/components/explorer/git/git-types';

afterEach(() => {
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

type SidebarProps = Partial<React.ComponentProps<typeof FileExplorerSidebar>>;

function renderSidebar(props: SidebarProps = {}) {
	return render(
		<FileExplorerSidebar
			root={rootNode}
			selectedPath={null}
			busy={false}
			createBusy={false}
			gitBusy={false}
			gitStatus={emptyStatus}
			operationBusy={null}
			clipboard={null}
			loadingPaths={emptyLoadingPaths}
			onCopyNode={vi.fn()}
			onCreateMarkdown={vi.fn()}
			onCreateDirectory={vi.fn()}
			onCutNode={vi.fn()}
			onDeleteNode={vi.fn()}
			onRestoreDeletedNode={vi.fn()}
			onOpenFolder={vi.fn()}
			onPasteNode={vi.fn()}
			onRefresh={vi.fn()}
			onGitRefresh={vi.fn()}
			onGitRefreshWorkspace={vi.fn()}
			onGitStatusChange={vi.fn()}
			onRenameNode={vi.fn()}
			onExpandDirectory={vi.fn()}
			onSelectNode={vi.fn()}
			{...props}
		/>
	);
}

describe('FileExplorerSidebar', () => {
	it('renders root node', () => {
		renderSidebar();
		expect(screen.getByText('workspace')).toBeInTheDocument();
	});

	it('renders file children', () => {
		renderSidebar();
		// Names appear both in sidebar list and aria labels —
		// getAllByText is acceptable when getByRole('treeitem', …) isn't
		// straightforward due to the custom tree structure.
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
});
