import { convertFileSrc } from '@tauri-apps/api/core';
import type { ComponentProps } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { openUrl } from '@/invoke/opener';
import { getParentPath, joinExplorerPath } from '@/lib/path-utils';

import { cn } from '@/lib/utils';
import { HighlightedCodeBlock } from './code-block-highlight';

type MarkdownPreviewProps = {
	className?: string;
	content: string;
	/** Filesystem path of the markdown file, used to resolve relative image paths. */
	filePath: string;
	/** Workspace root path, used to resolve absolute image paths (`/img/...`). */
	rootPath: string | null;
};

/** Normalize a filesystem path while preserving its absolute root or drive. */
function normalizeFileSystemPath(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const driveMatch = normalized.match(/^[A-Za-z]:/);
	const hasLeadingSlash = normalized.startsWith('/');
	const offset = driveMatch ? driveMatch[0].length : hasLeadingSlash ? 1 : 0;
	const segments = normalized.slice(offset).split('/');
	const result: string[] = [];

	for (const segment of segments) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			if (result.length > 0) {
				result.pop();
			}
			continue;
		}

		result.push(segment);
	}

	const suffix = result.join('/');

	if (driveMatch) {
		return suffix ? `${driveMatch[0]}/${suffix}` : `${driveMatch[0]}/`;
	}

	if (hasLeadingSlash) {
		return suffix ? `/${suffix}` : '/';
	}

	return suffix;
}

function resolveImageSrc(
	src: string | undefined,
	filePath: string,
	rootPath: string | null
): string | undefined {
	if (!src) return undefined;

	// Leave URLs and data URIs untouched
	if (
		src.startsWith('http://') ||
		src.startsWith('https://') ||
		src.startsWith('data:') ||
		src.startsWith('asset://')
	) {
		return src;
	}

	if (src.startsWith('/') && rootPath) {
		// Absolute path — resolve relative to workspace root
		const absolutePath = normalizeFileSystemPath(
			joinExplorerPath(rootPath, src.slice(1))
		);
		try {
			return convertFileSrc(absolutePath);
		} catch {
			return src;
		}
	}

	// Relative path — resolve relative to the markdown file's directory
	const fileDir = getParentPath(filePath);
	if (!fileDir) return src;
	const absolutePath = normalizeFileSystemPath(joinExplorerPath(fileDir, src));
	try {
		return convertFileSrc(absolutePath);
	} catch {
		return src;
	}
}

const components = (
	filePath: string,
	rootPath: string | null
): ComponentProps<typeof Markdown>['components'] => ({
	a: ({ href, children, ...props }) => (
		<a
			{...props}
			href={href}
			onClick={(event) => {
				event.preventDefault();
				if (href) openUrl(href);
			}}
		>
			{children}
		</a>
	),
	ol: ({ start, children, ...props }) => (
		<ol start={start} {...props}>
			{children}
		</ol>
	),
	ul: ({ children, ...props }) => <ul {...props}>{children}</ul>,
	li: ({ children, ...props }) => <li {...props}>{children}</li>,
	code: ({ className, children, ...props }) => {
		const match = /^language-(\w+)/.exec(className || '');
		if (match) {
			return (
				<HighlightedCodeBlock
					code={String(children).replace(/\n$/, '')}
					lang={match[1]}
				/>
			);
		}
		return (
			<code className={className} {...props}>
				{children}
			</code>
		);
	},
	pre: ({ children }) => <div>{children}</div>,
	table: ({ children }) => (
		<div className="overflow-x-auto my-6">
			<table className="my-0!">{children}</table>
		</div>
	),
	img: ({ src, alt, node, ...props }) => (
		<img
			src={resolveImageSrc(src, filePath, rootPath)}
			alt={alt}
			loading="lazy"
			{...props}
		/>
	),
	details: ({ children, ...props }) => <details {...props}>{children}</details>,
	summary: ({ children, ...props }) => <summary {...props}>{children}</summary>,
});

export function MarkdownPreview({
	className,
	content,
	filePath,
	rootPath,
}: MarkdownPreviewProps) {
	return (
		<div
			className={cn(
				'overflow-auto size-full min-h-0 h-full animate-in fade-in duration-300',
				className
			)}
			data-os-scroll
		>
			<div className="prose-custom p-6">
				<Markdown
					components={components(filePath, rootPath)}
					remarkPlugins={[remarkMath, remarkGfm]}
					rehypePlugins={[rehypeKatex]}
				>
					{content}
				</Markdown>
			</div>
		</div>
	);
}
