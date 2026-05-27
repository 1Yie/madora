import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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

const selectedFile: ExplorerNode = {
	name: 'conflict.txt',
	path: '/repo/conflict.txt',
	relativePath: 'conflict.txt',
	kind: 'file',
	fileKind: 'text',
	hasChildren: false,
	loaded: true,
	children: [],
};

function renderPreview(
	preview: ExplorerFilePreview,
	conflictedFilePaths = ['conflict.txt']
) {
	return render(
		<FilePreview
			conflictedFilePaths={conflictedFilePaths}
			loading={false}
			onOpenFolder={vi.fn()}
			preview={preview}
			rootPath="/repo"
			selectedFile={selectedFile}
			workspaceOpen
		/>
	);
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
