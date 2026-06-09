import { useCallback, useState, type ComponentProps } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Plugin } from 'unified';
import { openUrl } from '@/invoke/opener';

import { cn } from '@/lib/utils';
import {
	Dialog,
	DialogPopup,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HighlightedCodeBlock } from './code-block-highlight';

type MarkdownPreviewProps = {
	className?: string;
	content: string;
	/** Filesystem path of the markdown file, used to resolve relative image paths. */
	filePath: string;
	/** Workspace root path, used to resolve absolute image paths (`/img/...`). */
	rootPath: string | null;
};

/**
 * Normalise a filesystem path (remove `.`, resolve `..`, replace `\\` with `/`).
 * Returns the normalised absolute path.
 */
function normaliseFilePath(path: string): string {
	const normalised = path.replace(/\\/g, '/');
	const driveMatch = normalised.match(/^[A-Za-z]:/);
	const hasLeadingSlash = normalised.startsWith('/');
	const offset = driveMatch ? driveMatch[0].length : hasLeadingSlash ? 1 : 0;
	const segments = normalised.slice(offset).split('/');
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
 * Safely URL-decode a string. If decoding fails (malformed encoding),
 * returns the original string unchanged.
 */
function tryDecodeURI(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Resolve a markdown image / link source to a `madora://` URL.
 *
 * - URLs (http/https/data/asset/madora) are returned unchanged.
 * - Absolute paths (`/img/...`) are resolved against the workspace root.
 * - Relative paths (`./img.png`, `../img.png`) are resolved against the
 *   markdown file's parent directory.
 *
 * The returned `madora://` URL is handled by the Tauri backend custom
 * protocol, which validates the path is within the workspace and serves
 * the file.
 */
function resolveToMadoraUrl(
	src: string | undefined,
	filePath: string,
	rootPath: string | null
): string | undefined {
	if (!src) return undefined;

	// Decode URL-encoded characters (e.g. %E6%B5%8B → 测)
	// so Chinese / non-ASCII filenames resolve correctly.
	const decoded = tryDecodeURI(src);

	// Already a protocol URL we can use directly
	if (
		decoded.startsWith('http://') ||
		decoded.startsWith('https://') ||
		decoded.startsWith('data:') ||
		decoded.startsWith('asset://') ||
		decoded.startsWith('madora://')
	) {
		return decoded;
	}

	let absolutePath: string;

	if (decoded.startsWith('/')) {
		// Absolute path in markdown — resolve against workspace root
		if (!rootPath) {
			return decoded;
		}

		const trimmedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
		const relativeSrc = decoded.replace(/^\/+/, '');
		absolutePath = normaliseFilePath(`${trimmedRoot}/${relativeSrc}`);
	} else {
		// Relative path — resolve against the markdown file's directory
		const fileDir = filePath.replace(/\\/g, '/');
		const lastSlash = fileDir.lastIndexOf('/');

		if (lastSlash < 0) {
			return decoded;
		}

		const basePath = fileDir.slice(0, lastSlash);
		absolutePath = normaliseFilePath(`${basePath}/${decoded}`);
	}

	return `madora://localhost${absolutePath}`;
}

// ─── Standalone image component with `madora://` resolution ──────────────

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
	const resolvedSrc = resolveToMadoraUrl(src, filePath, rootPath);

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

// ─── Link handler for internal file navigation ───────────────────────────

/**
 * Track which external directories the user has trusted for the session.
 * Once trusted, files under that directory open without prompting again.
 */
const trustedExternalRoots = new Set<string>();

function MarkdownLink({
	href,
	children,
	filePath,
	rootPath,
	onExternalFile,
	...props
}: {
	href?: string;
	children?: React.ReactNode;
	filePath: string;
	rootPath: string | null;
	onExternalFile: (path: string) => void;
	[key: string]: unknown;
}) {
	const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
		if (!href) return;

		// ── http/https: open in the system browser ──────────
		if (href.startsWith('http://') || href.startsWith('https://')) {
			event.preventDefault();
			void openUrl(href);
			return;
		}

		// ── Resolve the link to an absolute filesystem path ──
		const resolved = resolveToMadoraUrl(href, filePath, rootPath);

		if (!resolved) return;

		// ── madora://localhost: internal file navigation ────
		if (resolved.startsWith('madora://localhost')) {
			event.preventDefault();

			const absolutePath = resolved.slice('madora://localhost'.length);

			const isMarkdown = /\.(md|markdown|mdx)$/i.test(absolutePath);

			// Determine if the file is within the workspace root
			const isWithinWorkspace =
				rootPath !== null &&
				absolutePath.startsWith(rootPath.replace(/\\/g, '/'));

			if (isMarkdown) {
				if (isWithinWorkspace) {
					// Directly navigate — same workspace
					window.dispatchEvent(
						new CustomEvent('madora-navigate-file', {
							detail: { filePath: absolutePath },
						})
					);
				} else if (rootPath && trustedExternalRoots.has(rootPath)) {
					// Already trusted this workspace root
					window.dispatchEvent(
						new CustomEvent('madora-navigate-file', {
							detail: { filePath: absolutePath },
						})
					);
				} else {
					// External markdown — delegate to the parent for trust dialog
					onExternalFile(absolutePath);
				}
			} else {
				// Non-markdown file — load via protocol in a new window
				window.open(resolved, '_blank');
			}
		}
	};

	return (
		<a
			{...props}
			href={href}
			onClick={handleClick}
			draggable={false}
			onDragStart={(e) => e.preventDefault()}
		>
			{children}
		</a>
	);
}

// ─── Components factory ─────────────────────────────────────────────────

const components = (
	filePath: string,
	rootPath: string | null,
	onExternalFile: (path: string) => void
): ComponentProps<typeof Markdown>['components'] => ({
	a: ({ href, children }) => (
		<MarkdownLink
			href={href}
			filePath={filePath}
			rootPath={rootPath}
			onExternalFile={onExternalFile}
		>
			{children}
		</MarkdownLink>
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
		// Indented code block or inline code — strip `node` from props
		// to avoid `node="[object Object]"` leaking to the DOM.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { node: _node, ...rest } = props;
		return (
			<code
				className={className}
				{...rest}
				style={{
					whiteSpace: 'pre-wrap',
					wordBreak: 'break-word',
				}}
			>
				{children}
			</code>
		);
	},
	pre: ({ children }) => {
		// HighlightedCodeBlock renders a <div> (for fenced blocks with a
		// language).  Everything else inside <pre> is a plain code block
		// (fenced without language, or legacy indented) — render as-is.
		const child = Array.isArray(children) ? children[0] : children;
		const isFencedWithLang =
			child !== null &&
			child !== undefined &&
			typeof child === 'object' &&
			'type' in child &&
			(child as React.ReactElement).type !== 'code';

		if (isFencedWithLang) {
			return <div>{children}</div>;
		}

		// Plain code block — render as <pre> without special indented styling
		return (
			<pre
				style={{
					whiteSpace: 'pre-wrap',
					wordBreak: 'break-word',
				}}
			>
				{children}
			</pre>
		);
	},
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

/**
 * Remark plugin that disables CommonMark indented code block parsing.
 * Lines that start with 4+ spaces or a tab are treated as regular
 * paragraph content instead of indented code blocks.
 *
 * Fenced code blocks (```) are NOT affected.
 */
const remarkDisableIndentedCode: Plugin = function () {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const data = this.data() as any;
	(data.micromarkExtensions ??= []).push({
		disable: { null: ['codeIndented'] },
	});
};
export function MarkdownPreview({
	className,
	content,
	filePath,
	rootPath,
}: MarkdownPreviewProps) {
	// Normalize leading whitespace: each indent unit (tab or 4 consecutive
	// spaces) produces the same visual width — 4 em-spaces (\u2003).
	// Leftover 1-3 spaces become NBSP (\u00A0) so they aren't collapsed.
	const displayContent = content.replace(/^([ \t]+)/gm, (match) => {
		// Normalize: treat each \t as 4 spaces, then produce 1 em-space per
		// indent unit (tab or 4-space group).  This way pressing Tab twice
		// yields \t\t → 2 em-spaces, the standard Chinese paragraph indent.
		// Leftover 1-3 spaces become NBSP so they aren't collapsed.
		const normalized = match.replace(/\t/g, '    ');
		const groups = Math.floor(normalized.length / 4);
		const remainder = normalized.length % 4;
		return (
			'\u2003'.repeat(groups * 2) + // each indent unit → 2 em-spaces
			'\u00A0'.repeat(remainder) // leftover spaces → NBSP
		);
	});

	// ── External file trust dialog state ────────────────────
	const [pendingExternalPath, setPendingExternalPath] = useState<string | null>(
		null
	);

	const handleExternalFile = useCallback(
		(path: string) => {
			if (rootPath && trustedExternalRoots.has(rootPath)) {
				// Already trusted — navigate directly
				window.dispatchEvent(
					new CustomEvent('madora-navigate-file', {
						detail: { filePath: path },
					})
				);
			} else {
				// New external path — show trust dialog
				setPendingExternalPath(path);
			}
		},
		[rootPath]
	);

	const handleConfirmTrust = useCallback(() => {
		if (!pendingExternalPath || !rootPath) return;

		trustedExternalRoots.add(rootPath);

		window.dispatchEvent(
			new CustomEvent('madora-navigate-file', {
				detail: { filePath: pendingExternalPath },
			})
		);

		setPendingExternalPath(null);
	}, [pendingExternalPath, rootPath]);

	return (
		<div
			className={cn(
				'overflow-auto size-full min-h-0 h-full animate-in fade-in duration-300',
				className
			)}
			data-os-scroll
			draggable={false}
			onDragStart={(e) => e.preventDefault()}
		>
			<div className="prose-custom p-6">
				<Markdown
					components={components(filePath, rootPath, handleExternalFile)}
					remarkPlugins={[remarkDisableIndentedCode, remarkMath, remarkGfm]}
					rehypePlugins={[rehypeKatex]}
				>
					{displayContent}
				</Markdown>
			</div>

			<Dialog
				open={pendingExternalPath !== null}
				onOpenChange={(open: boolean) => {
					if (!open) setPendingExternalPath(null);
				}}
			>
				<DialogPopup showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>允许打开外部文件？</DialogTitle>
						<DialogDescription>
							此链接指向当前工作区以外的位置，打开后将允许读取该目录下的文件。
							<code
								className="mt-2 block break-all rounded bg-muted px-2 py-1.5
									text-base text-muted-foreground"
							>
								{pendingExternalPath}
							</code>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setPendingExternalPath(null)}
						>
							取消
						</Button>
						<Button onClick={handleConfirmTrust}>允许访问</Button>
					</DialogFooter>
				</DialogPopup>
			</Dialog>
		</div>
	);
}
