import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { convertFileSrcMock } = vi.hoisted(() => ({
	convertFileSrcMock: vi.fn(
		(path: string) => `asset://localhost/${encodeURIComponent(path)}`
	),
}));

vi.mock('@tauri-apps/api/core', () => ({
	convertFileSrc: convertFileSrcMock,
}));

vi.mock('@/invoke/opener', () => ({
	openUrl: vi.fn(),
}));

import { MarkdownPreview } from '@/components/explorer/markdown/markdown-preview';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('MarkdownPreview', () => {
	it('resolves relative local image paths against the markdown file directory', () => {
		render(
			<MarkdownPreview
				content="![图片](./img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg)"
				filePath="/home/ichiyo/Workspace/md/my-post/post.md"
				rootPath="/home/ichiyo/Workspace/md/my-post"
			/>
		);

		expect(convertFileSrcMock).toHaveBeenCalledWith(
			'/home/ichiyo/Workspace/md/my-post/img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg'
		);

		const image = screen.getByAltText('图片');
		expect(image).toHaveAttribute(
			'src',
			'asset://localhost/%2Fhome%2Fichiyo%2FWorkspace%2Fmd%2Fmy-post%2Fimg%2Fcbfc037700ccd0adb6cccd31c2d12ea6.jpg'
		);
		expect(image).not.toHaveAttribute('node');
	});

	it('resolves workspace-root image paths that start with a slash', () => {
		render(
			<MarkdownPreview
				content="![图片](/img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg)"
				filePath="/home/ichiyo/Workspace/md/my-post/post.md"
				rootPath="/home/ichiyo/Workspace/md/my-post"
			/>
		);

		expect(convertFileSrcMock).toHaveBeenCalledWith(
			'/home/ichiyo/Workspace/md/my-post/img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg'
		);
	});
});
