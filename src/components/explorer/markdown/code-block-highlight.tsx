import { useEffect, useState, useMemo } from 'react';
import {
	codeToHtml,
	bundledLanguages,
	type BundledLanguage,
	type BundledTheme,
} from 'shiki';
import { useTheme } from '@/components/system/theme-provider';

type HighlightedCodeBlockProps = {
	lang: string;
	code: string;
};

function getShikiTheme(theme: 'light' | 'dark'): BundledTheme {
	return theme === 'dark' ? 'github-dark' : 'github-light';
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function plainTextBlock(code: string): string {
	const escaped = escapeHtml(code);
	return `<pre class="shiki"><code>${escaped}</code></pre>`;
}

function normalizeLanguage(lang: string): BundledLanguage | 'text' {
	if (!lang || lang === 'text') return 'text';

	if (lang in bundledLanguages) {
		return lang as BundledLanguage;
	}

	const lowerLang = lang.toLowerCase();

	const fallbackMap: Record<string, string> = {
		zsh: 'bash',
		shell: 'bash',
		yml: 'yaml',
		mdx: 'markdown',
	};

	if (fallbackMap[lowerLang]) {
		const fallback = fallbackMap[lowerLang];
		return fallback in bundledLanguages
			? (fallback as BundledLanguage)
			: 'text';
	}

	return 'text';
}

export function HighlightedCodeBlock({
	lang,
	code,
}: HighlightedCodeBlockProps) {
	const { resolvedTheme } = useTheme();
	const normalizedLang = useMemo(() => normalizeLanguage(lang), [lang]);

	const [highlightedHtml, setHighlightedHtml] = useState<string>('');

	useEffect(() => {
		if (normalizedLang === 'text') {
			return;
		}

		let cancelled = false;

		codeToHtml(code, {
			lang: normalizedLang,
			theme: getShikiTheme(resolvedTheme),
		})
			.then((result) => {
				if (!cancelled) {
					setHighlightedHtml(result);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setHighlightedHtml('');
				}
			});

		return () => {
			cancelled = true;
		};
	}, [code, normalizedLang, resolvedTheme]);

	const html =
		normalizedLang === 'text'
			? plainTextBlock(code)
			: highlightedHtml || plainTextBlock(code);

	return (
		<div
			className="overflow-auto size-full min-h-0 my-6 rounded-lg border
				border-border bg-muted [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:px-4
				[&_pre]:py-4 [&_code]:text-sm [&_code]:leading-relaxed"
		>
			<div className="min-w-fit" dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	);
}
