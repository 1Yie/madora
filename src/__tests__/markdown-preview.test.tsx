import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';

vi.mock('@/invoke/opener', () => ({
	openUrl: vi.fn(),
}));

vi.mock('@/invoke/system', () => ({
	absolutePathExists: vi.fn(async () => true),
}));

import { MarkdownPreview } from '@/components/explorer/markdown/markdown-preview';
import { fromMadoraUrl, toMadoraUrl } from '@/lib/madora-url';
import i18n from '@/i18n';

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
	it('renders YAML front matter as a key/value table', () => {
		render(
			<MarkdownPreview
				content={
					'---\nname: minimalist-paper-cover-illustration\nlicense: MIT\ntags:\n  - 插画\n  - 封面\n---\n\n正文段落。'
				}
				filePath="/workspace/skill.md"
				rootPath="/workspace"
			/>
		);

		expect(screen.getByRole('rowheader', { name: 'name' })).toBeInTheDocument();
		expect(
			screen.getByRole('rowheader', { name: 'license' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('cell', {
				name: 'minimalist-paper-cover-illustration',
			})
		).toBeInTheDocument();
		expect(
			screen.getByRole('cell', { name: '插画, 封面' })
		).toBeInTheDocument();
		expect(screen.getByText('正文段落。')).toBeInTheDocument();

		// The fences are consumed by the metadata block, not rendered.
		expect(document.querySelector('hr')).toBeNull();
		expect(document.body.textContent).not.toContain('---');
	});

	it('keeps a leading block that is not metadata as markdown', () => {
		render(
			<MarkdownPreview
				content={'---\nJust a sentence, not key/value pairs\n---\n\n正文。'}
				filePath="/workspace/doc.md"
				rootPath="/workspace"
			/>
		);

		expect(
			screen.getByText('Just a sentence, not key/value pairs')
		).toBeInTheDocument();
		expect(document.querySelector('table')).toBeNull();
	});

	it('only reads front matter at the start of the document', () => {
		render(
			<MarkdownPreview
				content={'段落。\n\n---\nname: x\n---\n'}
				filePath="/workspace/doc.md"
				rootPath="/workspace"
			/>
		);

		expect(document.querySelector('table')).toBeNull();
		expect(document.body.textContent).toContain('name: x');
	});
});

describe('without a folder open (a document session)', () => {
	const externalTitle = () => i18n.t('markdownPreview.externalTitle');

	it('resolves a leading-slash image against the document itself', () => {
		render(
			<MarkdownPreview
				content="![图](/img/pic.png)"
				filePath="/tmp/docs/note.md"
				rootPath={null}
			/>
		);

		expect(screen.getByAltText('图')).toHaveAttribute(
			'src',
			'madora://localhost/tmp/docs/img/pic.png'
		);
	});

	it('follows a link next to the document without asking', async () => {
		const navigate = vi.fn();
		window.addEventListener('madora-navigate-file', navigate);

		render(
			<MarkdownPreview
				content="[另一篇](./other.md)"
				filePath="/tmp/docs/note.md"
				rootPath={null}
			/>
		);
		fireEvent.click(screen.getByText('另一篇'));

		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(navigate.mock.calls[0][0].detail.filePath).toBe(
			'/tmp/docs/other.md'
		);
		// The document's own folder is not "outside" anything.
		expect(screen.queryByText(externalTitle())).toBeNull();

		window.removeEventListener('madora-navigate-file', navigate);
	});

	it('still asks before a link that only leaves the document folder', async () => {
		const navigate = vi.fn();
		window.addEventListener('madora-navigate-file', navigate);

		render(
			<MarkdownPreview
				content="[另一篇](../elsewhere/other.md)"
				filePath="/tmp/docs/note.md"
				rootPath={null}
			/>
		);
		fireEvent.click(screen.getByText('另一篇'));

		await screen.findByText(externalTitle());
		expect(navigate).not.toHaveBeenCalled();

		window.removeEventListener('madora-navigate-file', navigate);
	});

	it('still asks before a folder that only shares a prefix with the workspace', async () => {
		const navigate = vi.fn();
		window.addEventListener('madora-navigate-file', navigate);

		render(
			<MarkdownPreview
				content="[另一篇](../work2/other.md)"
				filePath="/tmp/work/note.md"
				rootPath="/tmp/work"
			/>
		);
		fireEvent.click(screen.getByText('另一篇'));

		await screen.findByText(externalTitle());
		expect(navigate).not.toHaveBeenCalled();

		window.removeEventListener('madora-navigate-file', navigate);
	});
});

describe('madora:// URLs', () => {
	it('percent-encodes each path segment', () => {
		expect(toMadoraUrl('/home/u/my docs/a#b?c%d.png')).toBe(
			'madora://localhost/home/u/my%20docs/a%23b%3Fc%25d.png'
		);
		expect(toMadoraUrl('/home/u/测试.png')).toBe(
			`madora://localhost/home/u/${encodeURIComponent('测试.png')}`
		);
	});

	it('keeps plain ASCII paths readable', () => {
		expect(toMadoraUrl('/home/u/project/img/a-b_c.png')).toBe(
			'madora://localhost/home/u/project/img/a-b_c.png'
		);
	});

	it('gives a Windows drive path a leading slash and keeps the colon', () => {
		expect(toMadoraUrl('C:\\Users\\me\\a b.png')).toBe(
			'madora://localhost/C:/Users/me/a%20b.png'
		);
	});

	it('round-trips unusual paths', () => {
		for (const path of [
			'/home/u/my docs/a#b?c%d.png',
			'/home/u/测试/图 1.png',
			'C:/Users/me/a b.png',
		]) {
			expect(fromMadoraUrl(toMadoraUrl(path))).toBe(path);
		}
	});

	it('encodes file names with spaces and non-ASCII characters in images', () => {
		render(
			<MarkdownPreview
				content="![图](./my%20docs/%E6%B5%8B%E8%AF%95.png)"
				filePath="/home/u/project/post.md"
				rootPath="/home/u/project"
			/>
		);

		expect(screen.getByAltText('图')).toHaveAttribute(
			'src',
			`madora://localhost/home/u/project/my%20docs/${encodeURIComponent('测试.png')}`
		);
	});
});
