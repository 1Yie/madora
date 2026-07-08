import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import katex from 'katex';
import { marked } from 'marked';
import type { Tokens } from 'marked';
import type { ResolvedThemePreference } from '@/features/settings';
import {
	localFileExists,
	readLocalFileAsDataUri,
	resolveFilePath,
} from '../services/local-file-system';

type MarkdownPreviewProps = {
	content: string;
	contentBottomPadding?: number;
	contentTopPadding?: number;
	/** Absolute URI of the markdown file being previewed. */
	filePath?: string | null;
	/** Workspace root URI (folder) for resolving absolute (`/foo`) links. */
	rootUri?: string | null;
	/** Called when the user taps a link that resolves to another local file. */
	onNavigateFile?: (resolvedPath: string) => void;
	/**
	 * Optional resolver for remote (sync) images. Receives the raw markdown
	 * src and returns a `data:` URI or absolute URL that the WebView can load.
	 */
	resolveRemoteImage?: (src: string) => Promise<string | null>;
	theme?: ResolvedThemePreference;
};

type MathToken = {
	html: string;
	token: string;
};

type SyntaxTokenType =
	| 'attribute'
	| 'comment'
	| 'function'
	| 'keyword'
	| 'literal'
	| 'number'
	| 'operator'
	| 'string'
	| 'tag'
	| 'variable';

type SyntaxPattern = {
	source: string;
	type: SyntaxTokenType;
};

marked.use({
	gfm: true,
});

export function MarkdownPreview({
	content,
	contentBottomPadding = 0,
	contentTopPadding = 0,
	filePath = null,
	rootUri = null,
	onNavigateFile,
	resolveRemoteImage,
	theme = 'light',
}: MarkdownPreviewProps) {
	const backgroundColor = theme === 'dark' ? '#0a0a0a' : '#ffffff';
	const [html, setHtml] = useState(() =>
		buildPreviewHtml(
			content,
			Math.max(0, contentTopPadding),
			Math.max(0, contentBottomPadding),
			theme,
			null
		)
	);

	// Resolve local / remote images to data URIs, then rebuild the HTML so
	// the WebView can render them directly (no post-render JS needed).
	useEffect(() => {
		let cancelled = false;

		(async () => {
			const baseHtml = buildPreviewHtml(
				content,
				Math.max(0, contentTopPadding),
				Math.max(0, contentBottomPadding),
				theme,
				null
			);
			const sources = await resolveImageSources(
				baseHtml,
				filePath,
				rootUri,
				resolveRemoteImage
			);
			if (cancelled) return;

			const next =
				sources.size === 0
					? baseHtml
					: buildPreviewHtml(
							content,
							Math.max(0, contentTopPadding),
							Math.max(0, contentBottomPadding),
							theme,
							sources
						);
			if (!cancelled) setHtml(next);
		})();

		return () => {
			cancelled = true;
		};
	}, [
		content,
		contentBottomPadding,
		contentTopPadding,
		filePath,
		resolveRemoteImage,
		rootUri,
		theme,
	]);

	const handleMessage = useCallback(
		(event: WebViewMessageEvent) => {
			let data: { type?: string; href?: string };
			try {
				data = JSON.parse(event.nativeEvent.data);
			} catch {
				return;
			}
			if (data.type !== 'navigate' || !data.href) return;

			const resolved = resolveFilePath(data.href, filePath, rootUri);
			if (!resolved) {
				// Could not resolve as a local path — ignore silently.
				return;
			}
			onNavigateFile?.(resolved);
		},
		[filePath, onNavigateFile, rootUri]
	);

	const handleNavigationRequest = useCallback(
		(url: string) => {
			if (url === 'about:blank') return true;
			if (url.startsWith('http://') || url.startsWith('https://')) {
				void Linking.openURL(url);
				return false;
			}

			const href = getNavigationHrefFromUrl(url);
			if (href) {
				const resolved = resolveFilePath(href, filePath, rootUri);
				if (resolved) {
					onNavigateFile?.(resolved);
				}
				return false;
			}

			return false;
		},
		[filePath, onNavigateFile, rootUri]
	);

	return (
		<View style={[styles.container, { backgroundColor }]}>
			<WebView
				javaScriptEnabled
				originWhitelist={['*']}
				setSupportMultipleWindows={false}
				source={{ html }}
				style={[styles.webview, { backgroundColor }]}
				injectedJavaScript={LINK_INTERCEPTOR_SCRIPT}
				injectedJavaScriptBeforeContentLoaded={LINK_INTERCEPTOR_SCRIPT}
				onMessage={handleMessage}
				onShouldStartLoadWithRequest={(request: { url: string }) =>
					handleNavigationRequest(request.url)
				}
			/>
		</View>
	);
}

function buildPreviewHtml(
	content: string,
	contentTopPadding: number,
	contentBottomPadding: number,
	theme: ResolvedThemePreference,
	imageSources: Map<string, string> | null
) {
	const normalized = normalizeLeadingWhitespace(content);
	const { markdown, mathTokens } = protectMath(normalized);
	const parsed = marked.parse(markdown, {
		async: false,
		renderer: createPreviewRenderer(),
	}) as string;
	const withMath = mathTokens.reduce(
		(html, item) => html.replaceAll(item.token, item.html),
		parsed
	);
	const resolved = imageSources
		? replaceImageSrcs(withMath, imageSources)
		: withMath;
	const safeHtml = sanitizeHtml(resolved);

	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>${previewCss(contentTopPadding, contentBottomPadding, theme)}</style>
  </head>
  <body>
    <main class="prose">${safeHtml}</main>
    <script>${LINK_INTERCEPTOR_SCRIPT}</script>
  </body>
</html>`;
}

function normalizeLeadingWhitespace(content: string) {
	return content.replace(/^([ \t]+)/gm, (match) => {
		const normalized = match.replace(/\t/g, '    ');
		const groups = Math.floor(normalized.length / 4);
		const remainder = normalized.length % 4;
		return '\u2003'.repeat(groups * 2) + '\u00A0'.repeat(remainder);
	});
}

function protectMath(content: string) {
	const mathTokens: MathToken[] = [];
	let markdown = content;

	markdown = markdown.replace(/\$\$([\s\S]+?)\$\$/g, (_match, source: string) =>
		createMathToken(source, true, mathTokens)
	);
	markdown = markdown.replace(
		/(^|[^\\])\$([^\n$]+?)\$/g,
		(_match, prefix: string, source: string) =>
			`${prefix}${createMathToken(source, false, mathTokens)}`
	);

	return { markdown, mathTokens };
}

function createMathToken(
	source: string,
	displayMode: boolean,
	tokens: MathToken[]
) {
	const token = `@@MATH_${tokens.length}@@`;
	try {
		tokens.push({
			html: katex.renderToString(source.trim(), {
				displayMode,
				output: 'html',
				throwOnError: false,
			}),
			token,
		});
	} catch {
		tokens.push({ html: escapeHtml(source), token });
	}
	return token;
}

function sanitizeHtml(html: string) {
	return html
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
		.replace(/\son\w+="[^"]*"/gi, '')
		.replace(/\son\w+='[^']*'/gi, '')
		.replace(/\s(href|src)=["']javascript:[^"']*["']/gi, '');
}

function createPreviewRenderer() {
	const renderer = new marked.Renderer();

	renderer.code = ({ text, lang }: Tokens.Code) => {
		const language = normalizeCodeLanguage(lang);
		const languageClass = language ? ` language-${language}` : '';
		const languageLabel = language
			? `<span class="code-language">${escapeHtml(language)}</span>`
			: '';
		const code = highlightCode(text.replace(/\n$/, ''), language);
		const preClass = language
			? `code-block has-language${languageClass}`
			: 'code-block';

		return `<div class="code-frame">${languageLabel}<pre class="${preClass}"><code class="${languageClass.trim()}">${code}\n</code></pre></div>`;
	};

	// Give every <a> a data-href so the capture-phase click interceptor can
	// read the original value even after the WebView resolves it against the
	// about:blank origin.
	renderer.link = ({ href, text, tokens }) => {
		const rawHref = href || '';
		const anchorHref = isLocalFileHref(rawHref)
			? toNavigationUrl(rawHref)
			: rawHref;
		const textHtml = marked.Parser.parseInline(tokens);
		return `<a href="${escapeHtml(anchorHref)}" data-href="${escapeHtml(rawHref)}">${textHtml || escapeHtml(text || '')}</a>`;
	};

	return renderer;
}

function normalizeCodeLanguage(language: string | undefined) {
	const raw = (language ?? '').trim().split(/\s+/)[0]?.toLowerCase();
	if (!raw) return '';

	const normalized = raw.replace(/^language-/, '');
	const aliases: Record<string, string> = {
		cjs: 'javascript',
		cs: 'csharp',
		'c++': 'cpp',
		'c#': 'csharp',
		html: 'html',
		htm: 'html',
		js: 'javascript',
		jsx: 'jsx',
		json5: 'json',
		jsonc: 'json',
		kt: 'kotlin',
		mjs: 'javascript',
		py: 'python',
		rs: 'rust',
		sh: 'shell',
		ts: 'typescript',
		tsx: 'tsx',
		yml: 'yaml',
		zsh: 'shell',
	};

	return (aliases[normalized] ?? normalized).replace(/[^a-z0-9#+.-]/g, '');
}

function highlightCode(code: string, language: string) {
	const patterns = getSyntaxPatterns(language);
	if (patterns.length === 0) return escapeHtml(code);

	const matcher = new RegExp(
		patterns.map((pattern) => `(${pattern.source})`).join('|'),
		'gi'
	);
	let html = '';
	let cursor = 0;
	let match: RegExpExecArray | null;

	while ((match = matcher.exec(code))) {
		if (match.index > cursor) {
			html += escapeHtml(code.slice(cursor, match.index));
		}

		const value = match[0];
		const patternIndex = patterns.findIndex((_, index) => match?.[index + 1]);
		const type = patternIndex >= 0 ? patterns[patternIndex]?.type : undefined;
		html += type
			? `<span class="token-${type}">${escapeHtml(value)}</span>`
			: escapeHtml(value);
		cursor = match.index + value.length;

		if (value.length === 0) matcher.lastIndex += 1;
	}

	if (cursor < code.length) {
		html += escapeHtml(code.slice(cursor));
	}

	return html;
}

function getSyntaxPatterns(language: string): SyntaxPattern[] {
	if (isMarkupLanguage(language)) {
		return [
			{ source: '<!--[\\s\\S]*?-->', type: 'comment' },
			{ source: '<\\/?[a-z][\\w:-]*', type: 'tag' },
			{ source: '\\b[a-z_:][\\w:.-]*(?=\\s*=)', type: 'attribute' },
			{
				source: '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'',
				type: 'string',
			},
			{ source: '<\\/?|\\/?>', type: 'operator' },
		];
	}

	if (language === 'json') {
		return [
			{ source: '"(?:\\\\.|[^"\\\\])*"(?=\\s*:)', type: 'attribute' },
			{ source: '"(?:\\\\.|[^"\\\\])*"', type: 'string' },
			{ source: '\\b(?:true|false|null)\\b', type: 'literal' },
			{ source: '-?\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b', type: 'number' },
		];
	}

	if (language === 'css' || language === 'scss' || language === 'sass') {
		return [
			{ source: '\\/\\*[\\s\\S]*?\\*\\/', type: 'comment' },
			{
				source: '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'',
				type: 'string',
			},
			{ source: '@[\\w-]+', type: 'keyword' },
			{ source: '\\b[a-z-]+(?=\\s*:)', type: 'attribute' },
			{ source: '#[\\da-f]{3,8}\\b', type: 'number' },
			{
				source: '\\b\\d+(?:\\.\\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\\b',
				type: 'number',
			},
		];
	}

	if (language === 'shell' || language === 'bash') {
		return [
			{ source: '#[^\\n]*', type: 'comment' },
			{
				source:
					'"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`',
				type: 'string',
			},
			{ source: '\\$[a-z_][\\w]*|\\$\\{[^}]+\\}', type: 'variable' },
			{
				source: keywordSource([
					'case',
					'do',
					'done',
					'elif',
					'else',
					'esac',
					'fi',
					'for',
					'function',
					'if',
					'in',
					'then',
					'until',
					'while',
				]),
				type: 'keyword',
			},
		];
	}

	if (language === 'sql') {
		return [
			{ source: '--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', type: 'comment' },
			{
				source: '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'',
				type: 'string',
			},
			{
				source: keywordSource([
					'alter',
					'and',
					'as',
					'by',
					'case',
					'create',
					'delete',
					'desc',
					'distinct',
					'drop',
					'else',
					'end',
					'from',
					'group',
					'having',
					'in',
					'insert',
					'into',
					'is',
					'join',
					'left',
					'like',
					'limit',
					'not',
					'null',
					'on',
					'or',
					'order',
					'outer',
					'right',
					'select',
					'set',
					'table',
					'then',
					'update',
					'values',
					'when',
					'where',
				]),
				type: 'keyword',
			},
			{ source: '\\b\\d+(?:\\.\\d+)?\\b', type: 'number' },
		];
	}

	if (language === 'yaml') {
		return [
			{ source: '#[^\\n]*', type: 'comment' },
			{
				source: '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'',
				type: 'string',
			},
			{ source: '^\\s*[\\w.-]+(?=\\s*:)', type: 'attribute' },
			{ source: '\\b(?:true|false|null|yes|no|on|off)\\b', type: 'literal' },
			{ source: '\\b\\d+(?:\\.\\d+)?\\b', type: 'number' },
		];
	}

	return [
		{ source: '\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*', type: 'comment' },
		{ source: '#[^\\n]*', type: 'comment' },
		{
			source:
				'"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`',
			type: 'string',
		},
		{ source: keywordSource(getLanguageKeywords(language)), type: 'keyword' },
		{ source: '\\b(?:true|false|null|nil|none|undefined)\\b', type: 'literal' },
		{
			source: '\\b(?:0x[\\da-f]+|\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\b',
			type: 'number',
		},
		{ source: '\\b[a-z_$][\\w$]*(?=\\s*\\()', type: 'function' },
		{
			source: '=>|==={0,1}|!==?|<=|>=|&&|\\|\\||[+*/%=&|!<>-]',
			type: 'operator',
		},
	];
}

function isMarkupLanguage(language: string) {
	return ['html', 'xml', 'svg'].includes(language);
}

function keywordSource(keywords: string[]) {
	return `\\b(?:${keywords.join('|')})\\b`;
}

function getLanguageKeywords(language: string) {
	switch (language) {
		case 'python':
			return [
				'and',
				'as',
				'assert',
				'async',
				'await',
				'break',
				'class',
				'continue',
				'def',
				'del',
				'elif',
				'else',
				'except',
				'finally',
				'for',
				'from',
				'global',
				'if',
				'import',
				'in',
				'is',
				'lambda',
				'nonlocal',
				'not',
				'or',
				'pass',
				'raise',
				'return',
				'try',
				'while',
				'with',
				'yield',
			];
		case 'rust':
			return [
				'as',
				'async',
				'await',
				'break',
				'const',
				'continue',
				'crate',
				'dyn',
				'else',
				'enum',
				'extern',
				'false',
				'fn',
				'for',
				'if',
				'impl',
				'in',
				'let',
				'loop',
				'match',
				'mod',
				'move',
				'mut',
				'pub',
				'ref',
				'return',
				'self',
				'Self',
				'static',
				'struct',
				'super',
				'trait',
				'true',
				'type',
				'unsafe',
				'use',
				'where',
				'while',
			];
		case 'go':
			return [
				'break',
				'case',
				'chan',
				'const',
				'continue',
				'default',
				'defer',
				'else',
				'fallthrough',
				'for',
				'func',
				'go',
				'goto',
				'if',
				'import',
				'interface',
				'map',
				'package',
				'range',
				'return',
				'select',
				'struct',
				'switch',
				'type',
				'var',
			];
		case 'java':
		case 'kotlin':
			return [
				'abstract',
				'break',
				'case',
				'catch',
				'class',
				'const',
				'continue',
				'data',
				'default',
				'do',
				'else',
				'enum',
				'extends',
				'final',
				'finally',
				'for',
				'fun',
				'if',
				'implements',
				'import',
				'in',
				'interface',
				'new',
				'object',
				'override',
				'package',
				'private',
				'protected',
				'public',
				'return',
				'static',
				'super',
				'switch',
				'this',
				'throw',
				'try',
				'val',
				'var',
				'void',
				'when',
				'while',
			];
		case 'c':
		case 'cpp':
		case 'csharp':
			return [
				'auto',
				'bool',
				'break',
				'case',
				'catch',
				'char',
				'class',
				'const',
				'continue',
				'default',
				'delete',
				'do',
				'double',
				'else',
				'enum',
				'extern',
				'float',
				'for',
				'if',
				'include',
				'int',
				'long',
				'namespace',
				'new',
				'private',
				'protected',
				'public',
				'return',
				'short',
				'signed',
				'sizeof',
				'static',
				'struct',
				'switch',
				'template',
				'this',
				'throw',
				'try',
				'typedef',
				'typename',
				'unsigned',
				'using',
				'virtual',
				'void',
				'while',
			];
		default:
			return [
				'as',
				'async',
				'await',
				'break',
				'case',
				'catch',
				'class',
				'const',
				'continue',
				'default',
				'do',
				'else',
				'export',
				'extends',
				'finally',
				'for',
				'from',
				'function',
				'if',
				'import',
				'in',
				'instanceof',
				'interface',
				'let',
				'new',
				'of',
				'return',
				'switch',
				'throw',
				'try',
				'type',
				'typeof',
				'var',
				'void',
				'while',
				'yield',
			];
	}
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function previewCss(
	contentTopPadding: number,
	contentBottomPadding: number,
	theme: ResolvedThemePreference
) {
	const safePaddingBottom = Math.max(120, contentBottomPadding + 18);
	const isDark = theme === 'dark';
	const backgroundColor = isDark ? '#0a0a0a' : '#fbfcff';
	const foregroundColor = isDark ? '#f5f5f5' : '#111827';
	const headingColor = isDark ? '#fafafa' : '#0f172a';
	const blockquoteColor = isDark ? '#a3a3a3' : '#475569';
	const inlineCodeBackground = isDark
		? 'rgba(255, 255, 255, 0.08)'
		: 'rgba(15, 23, 42, 0.06)';
	const preBackground = isDark ? '#171717' : '#0f172a';
	const preForeground = isDark ? '#f3f4f6' : '#e5e7eb';
	const languageColor = isDark ? '#a3a3a3' : '#94a3b8';
	const tokenColors = isDark
		? {
				attribute: '#93c5fd',
				comment: '#737373',
				function: '#fde68a',
				keyword: '#c4b5fd',
				literal: '#fca5a5',
				number: '#fdba74',
				operator: '#d4d4d4',
				string: '#86efac',
				tag: '#fda4af',
				variable: '#67e8f9',
			}
		: {
				attribute: '#60a5fa',
				comment: '#94a3b8',
				function: '#fde68a',
				keyword: '#c4b5fd',
				literal: '#fca5a5',
				number: '#fdba74',
				operator: '#cbd5e1',
				string: '#86efac',
				tag: '#fda4af',
				variable: '#67e8f9',
			};
	const tableBorder = isDark
		? 'rgba(255, 255, 255, 0.12)'
		: 'rgba(15, 23, 42, 0.14)';
	const thBackground = isDark
		? 'rgba(37, 99, 235, 0.18)'
		: 'rgba(37, 99, 235, 0.08)';

	return `
    :root {
      color-scheme: ${theme};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.65;
      background: ${backgroundColor};
      color: ${foregroundColor};
    }
    html,
    body {
      min-height: 100%;
      margin: 0;
      background: ${backgroundColor};
    }
    body {
      overflow-wrap: anywhere;
      -webkit-text-size-adjust: 100%;
    }
    .prose {
      box-sizing: border-box;
      min-height: 100vh;
      padding: ${contentTopPadding + 18}px 18px ${safePaddingBottom}px;
    }
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      line-height: 1.25;
      margin: 1.35em 0 0.55em;
      color: ${headingColor};
    }
    h1 { font-size: 1.8rem; }
    h2 { font-size: 1.45rem; }
    h3 { font-size: 1.2rem; }
    p,
    ul,
    ol,
    blockquote,
    pre,
    .code-frame,
    table {
      margin: 0.9em 0;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
    blockquote {
      border-left: 3px solid rgba(37, 99, 235, 0.28);
      color: ${blockquoteColor};
      padding-left: 12px;
    }
    code {
      background: ${inlineCodeBackground};
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 0.9em;
      padding: 0.1em 0.3em;
    }
    .code-frame {
      background: ${preBackground};
      border-radius: 8px;
      color: ${preForeground};
      position: relative;
    }
    pre {
      background: transparent;
      border-radius: 8px;
      color: inherit;
      margin: 0;
      overflow-x: auto;
      padding: 14px;
    }
    .code-block.has-language {
      padding-top: 30px;
    }
    .code-language {
      color: ${languageColor};
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0;
      position: absolute;
      right: 12px;
      text-transform: uppercase;
      top: 8px;
      z-index: 1;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      white-space: pre;
    }
    .token-attribute { color: ${tokenColors.attribute}; }
    .token-comment {
      color: ${tokenColors.comment};
      font-style: italic;
    }
    .token-function { color: ${tokenColors.function}; }
    .token-keyword {
      color: ${tokenColors.keyword};
      font-weight: 650;
    }
    .token-literal { color: ${tokenColors.literal}; }
    .token-number { color: ${tokenColors.number}; }
    .token-operator { color: ${tokenColors.operator}; }
    .token-string { color: ${tokenColors.string}; }
    .token-tag { color: ${tokenColors.tag}; }
    .token-variable { color: ${tokenColors.variable}; }
    table {
      border-collapse: collapse;
      display: block;
      overflow-x: auto;
      width: 100%;
    }
    th,
    td {
      border: 1px solid ${tableBorder};
      padding: 8px 10px;
    }
    th {
      background: ${thBackground};
      font-weight: 700;
    }
    img {
      border-radius: 6px;
      display: block;
      height: auto;
      max-width: 100%;
    }
    .katex-display {
      display: block;
      overflow-x: auto;
      padding: 0.5em 0;
      text-align: center;
    }
    .katex {
      font-family: "Times New Roman", serif;
      font-size: 1.05em;
    }
  `;
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	webview: {
		flex: 1,
	},
});

// ─── Image source resolution & link interception ──────────────────────────

const IMAGE_SRC_PATTERN = /<img\b[^>]*\bsrc=("([^"]*)"|'([^']*)')[^>]*>/gi;
const NAVIGATION_URL_PREFIX = 'madora://navigate?href=';

function isLocalFileHref(href: string) {
	if (!href || href.startsWith('#') || href.startsWith('//')) return false;
	return !/^[a-z][a-z\d+.-]*:/i.test(href);
}

function toNavigationUrl(href: string) {
	return `${NAVIGATION_URL_PREFIX}${encodeURIComponent(href)}`;
}

function getNavigationHrefFromUrl(url: string) {
	if (!url.startsWith('madora://navigate')) return null;

	const queryIndex = url.indexOf('?');
	if (queryIndex < 0) return null;

	const query = url.slice(queryIndex + 1).split('#')[0];
	for (const part of query.split('&')) {
		const [key, value = ''] = part.split('=');
		if (key !== 'href') continue;
		try {
			return decodeURIComponent(value.replace(/\+/g, '%20'));
		} catch {
			return value;
		}
	}

	return null;
}

const LINK_INTERCEPTOR_SCRIPT = `
(function() {
  if (window.__madoraLinkInterceptorInstalled) return true;
  window.__madoraLinkInterceptorInstalled = true;
  document.addEventListener('click', function(event) {
    var target = event.target;
    while (target && target.tagName !== 'A') target = target.parentNode;
    if (!target || !target.getAttribute) return;
    // Prefer data-href (the original markdown href) over href, which may
    // have been resolved to an absolute about:blank URL by the browser.
    var href = target.getAttribute('data-href') || target.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (/^(https?:)?\/\//i.test(href)) return;
    event.preventDefault();
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'navigate', href: href }));
  }, true);
})();
true;
`;

/**
 * Parse the rendered HTML for every `<img>` and resolve each src:
 * - Remote URLs (http/https/data/asset/madora) are kept as-is.
 * - Relative / absolute local paths are resolved against the current
 *   markdown file (relative) or workspace root (absolute), read as base64,
 *   and stored as `data:` URIs so the WebView can render them.
 *
 * Returns a map of original src → resolved src.
 */
async function resolveImageSources(
	html: string,
	filePath: string | null,
	rootUri: string | null,
	resolveRemoteImage?: (src: string) => Promise<string | null>
): Promise<Map<string, string>> {
	const sources = extractImgSrcs(html);
	if (sources.length === 0) return new Map();

	const result = new Map<string, string>();
	await Promise.all(
		sources.map(async (src) => {
			const isRemote =
				src.startsWith('http://') ||
				src.startsWith('https://') ||
				src.startsWith('data:') ||
				src.startsWith('asset://') ||
				src.startsWith('madora://');

			if (isRemote) return;

			const resolvedUri = resolveFilePath(src, filePath, rootUri);
			if (!resolvedUri) return;

			const exists = await localFileExists(resolvedUri);
			if (!exists) {
				if (resolveRemoteImage) {
					const remoteDataUri = await resolveRemoteImage(src);
					if (remoteDataUri) result.set(src, remoteDataUri);
				}
				return;
			}

			const dataUri = await readLocalFileAsDataUri(resolvedUri);
			if (dataUri) result.set(src, dataUri);
		})
	);
	return result;
}

function extractImgSrcs(html: string): string[] {
	const sources: string[] = [];
	let match: RegExpExecArray | null;
	IMAGE_SRC_PATTERN.lastIndex = 0;
	while ((match = IMAGE_SRC_PATTERN.exec(html))) {
		const src = match[2] ?? match[3];
		if (src) sources.push(src);
	}
	return sources;
}

function replaceImageSrcs(html: string, resolved: Map<string, string>): string {
	if (resolved.size === 0) return html;
	return html.replace(
		IMAGE_SRC_PATTERN,
		(full, _quoted, doubleSrc, singleSrc) => {
			const src = doubleSrc ?? singleSrc ?? '';
			const replacement = resolved.get(src);
			if (!replacement) return full;
			return full.replace(src, replacement);
		}
	);
}
