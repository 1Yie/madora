import type { ComponentProps } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { openUrl } from '@tauri-apps/plugin-opener';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HighlightedCodeBlock } from './code-block-highlight';

type MarkdownPreviewProps = {
	className?: string;
	content: string;
};

const components: ComponentProps<typeof Markdown>['components'] = {
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
	img: ({ src, alt, ...props }) => (
		<img src={src} alt={alt} loading="lazy" {...props} />
	),
	details: ({ children, ...props }) => <details {...props}>{children}</details>,
	summary: ({ children, ...props }) => <summary {...props}>{children}</summary>,
};

export function MarkdownPreview({ className, content }: MarkdownPreviewProps) {
	return (
		<ScrollArea className={cn('h-full', className)}>
			<div className="prose-custom p-6">
				<Markdown
					components={components}
					remarkPlugins={[remarkMath, remarkGfm]}
					rehypePlugins={[rehypeKatex]}
				>
					{content}
				</Markdown>
			</div>
		</ScrollArea>
	);
}
