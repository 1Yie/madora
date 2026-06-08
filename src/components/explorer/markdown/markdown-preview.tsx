import { convertFileSrc } from '@tauri-apps/api/core';
import { useEffect, useState, type ComponentProps } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { openUrl } from '@/invoke/opener';
import { resolveImageSrc as resolveImageSrcBackend } from '@/invoke/workspace';

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

/** Normalize a filesystem path while preserving its absolute root or drive.
 *  (Used only for the final convertFileSrc call on the returned path.) */
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

/**
 * Synchronous fallback for image resolution (used for initial render
 * before the async backend call completes).
 */
function resolveImageSrcSync(
	src: string | undefined,
	filePath: string,
	rootPath: string | null
): string | undefined {
	if (!src) return undefined;

	if (
		src.startsWith('http://') ||
		src.startsWith('https://') ||
		src.startsWith('data:') ||
		src.startsWith('asset://')
	) {
		return src;
	}

	if (src.startsWith('/') && rootPath) {
		const trimmedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
		const relativeSrc = src.replace(/^\/+/, '');
		const absolutePath = normalizeFileSystemPath(
			`${trimmedRoot}/${relativeSrc}`
		);
		try {
			return convertFileSrc(absolutePath);
		} catch {
			return src;
		}
	}

	// Relative path — resolve relative to the markdown file's directory
	const fileDir = filePath.replace(/\\/g, '/');
	const lastSlash = fileDir.lastIndexOf('/');
	if (lastSlash >= 0) {
		const basePath = fileDir.slice(0, lastSlash);
		const absolutePath = normalizeFileSystemPath(`${basePath}/${src}`);
		try {
			return convertFileSrc(absolutePath);
		} catch {
			return src;
		}
	}

	return src;
}

/**
 * Async image resolution via backend, with synchronous fallback.
 * The backend is the single source of truth for file path resolution.
 */
async function resolveImageSrc(
	src: string | undefined,
	filePath: string,
	rootPath: string | null
): Promise<string | undefined> {
	if (!src) return undefined;

	if (
		src.startsWith('http://') ||
		src.startsWith('https://') ||
		src.startsWith('data:') ||
		src.startsWith('asset://')
	) {
		return src;
	}

	try {
		const result = await resolveImageSrcBackend(src, filePath, rootPath);

		// The backend returns a data URL when the file was read successfully,
		// or the resolved absolute path as fallback.
		if (result.startsWith('data:')) {
			return result;
		}

		// Fallback: convert the filesystem path to a Tauri asset URL
		try {
			return convertFileSrc(result);
		} catch {
			return result;
		}
	} catch {
		// Fallback to synchronous resolution
		return resolveImageSrcSync(src, filePath, rootPath);
	}
}

// ─── Standalone image component with async resolution ─────────────

function MarkdownImage({
	src,
	alt,
	filePath,
	rootPath,
	// react-markdown passes a `node` prop (the MDAST AST node object).
	// It would serialize as [object Object] on the DOM element, so we
	// explicitly discard it and spread only valid HTML attributes.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	node: _node,
	...rest
}: {
	src?: string;
	alt?: string;
	filePath: string;
	rootPath: string | null;
	node?: unknown;
	[key: string]: unknown;
}) {
	const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(() =>
		resolveImageSrcSync(src, filePath, rootPath)
	);

	useEffect(() => {
		let cancelled = false;

		void resolveImageSrc(src, filePath, rootPath).then((result) => {
			if (!cancelled) {
				setResolvedSrc(result);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [src, filePath, rootPath]);

	return (
		<img
			{...rest}
			src={resolvedSrc}
			alt={alt}
			loading="lazy"
			draggable={false}
			onDragStart={(e) => e.preventDefault()}
			style={
				{
					...(rest.style as React.CSSProperties),
					WebkitUserDrag: 'none',
					userSelect: 'none',
				} as React.CSSProperties
			}
		/>
	);
}

// ─── Components factory ─────────────────────────────────────────

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
	img: (props) => (
		<MarkdownImage {...props} filePath={filePath} rootPath={rootPath} />
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
