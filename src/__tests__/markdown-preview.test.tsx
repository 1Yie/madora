import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/invoke/opener', () => ({
	openUrl: vi.fn(),
}));

import { MarkdownPreview } from '@/components/explorer/markdown/markdown-preview';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('MarkdownPreview', () => {
	it('resolves relative local image paths to madora:// URLs', () => {
		render(
			<MarkdownPreview
				content="![图片](./img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg)"
				filePath="/home/ichiyo/Workspace/md/my-post/post.md"
				rootPath="/home/ichiyo/Workspace/md/my-post"
			/>
		);

		const image = screen.getByAltText('图片');
		expect(image).toHaveAttribute(
			'src',
			'madora://localhost/home/ichiyo/Workspace/md/my-post/img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg'
		);
	});

	it('resolves workspace-root image paths that start with a slash', () => {
		render(
			<MarkdownPreview
				content="![图片](/img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg)"
				filePath="/home/ichiyo/Workspace/md/my-post/post.md"
				rootPath="/home/ichiyo/Workspace/md/my-post"
			/>
		);

		const image = screen.getByAltText('图片');
		expect(image).toHaveAttribute(
			'src',
			'madora://localhost/home/ichiyo/Workspace/md/my-post/img/cbfc037700ccd0adb6cccd31c2d12ea6.jpg'
		);
	});

	it('leaves http URLs unchanged', () => {
		render(
			<MarkdownPreview
				content="![图片](https://example.com/image.png)"
				filePath="/workspace/doc.md"
				rootPath="/workspace"
			/>
		);

		const image = screen.getByAltText('图片');
		expect(image).toHaveAttribute('src', 'https://example.com/image.png');
	});

	it('resolves parent-relative paths correctly', () => {
		render(
			<MarkdownPreview
				content="![图片](../images/banner.png)"
				filePath="/home/user/project/docs/doc.md"
				rootPath="/home/user/project"
			/>
		);

		const image = screen.getByAltText('图片');
		expect(image).toHaveAttribute(
			'src',
			'madora://localhost/home/user/project/images/banner.png'
		);
	});

	it('resolves same-directory relative paths correctly', () => {
		render(
			<MarkdownPreview
				content="![图片](./icon.svg)"
				filePath="/home/user/project/readme.md"
				rootPath="/home/user/project"
			/>
		);

		const image = screen.getByAltText('图片');
		expect(image).toHaveAttribute(
			'src',
			'madora://localhost/home/user/project/icon.svg'
		);
	});

	// ── Whitespace indentation — rendering integration ─────────

	it('renders tab-indented text as paragraph not code block', () => {
		render(
			<MarkdownPreview
				content={'\t\t这是一个段落开头空两格的示例。\n\n普通段落。'}
				filePath="/workspace/doc.md"
				rootPath="/workspace"
			/>
		);

		const bodyText = document.body.textContent ?? '';
		expect(bodyText).toContain('这是一个段落开头空两格的示例');
		expect(bodyText).toContain('普通段落。');

		// No <pre> should contain the indented text
		for (const pre of document.querySelectorAll('pre')) {
			expect(pre.textContent).not.toContain('这是一个段落开头空两格的示例');
		}
	});

	it('renders space-indented text as paragraph not code block', () => {
		render(
			<MarkdownPreview
				content={'    这是四个空格缩进的示例。\n\n普通段落。'}
				filePath="/workspace/doc.md"
				rootPath="/workspace"
			/>
		);

		const bodyText = document.body.textContent ?? '';
		expect(bodyText).toContain('这是四个空格缩进的示例');
		expect(bodyText).toContain('普通段落。');

		for (const pre of document.querySelectorAll('pre')) {
			expect(pre.textContent).not.toContain('这是四个空格缩进的示例');
		}
	});

	it('leaves fenced code blocks intact', () => {
		render(
			<MarkdownPreview
				content={'```\nconst x = 1;\nconsole.log(x);\n```'}
				filePath="/workspace/doc.md"
				rootPath="/workspace"
			/>
		);

		expect(document.body.textContent).toContain('const x = 1;');
		expect(document.body.textContent).toContain('console.log(x);');
	});
});
