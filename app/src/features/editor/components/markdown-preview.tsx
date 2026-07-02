import { useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import katex from 'katex';
import { marked } from 'marked';
import type { ResolvedThemePreference } from '@/features/settings';

type MarkdownPreviewProps = {
	content: string;
	contentBottomPadding?: number;
	contentTopPadding?: number;
	theme?: ResolvedThemePreference;
};

type MathToken = {
	html: string;
	token: string;
};

marked.use({
	gfm: true,
});

export function MarkdownPreview({
	content,
	contentBottomPadding = 0,
	contentTopPadding = 0,
	theme = 'light',
}: MarkdownPreviewProps) {
	const backgroundColor = theme === 'dark' ? '#0a0a0a' : '#ffffff';
	const html = useMemo(
		() =>
			buildPreviewHtml(
				content,
				Math.max(0, contentTopPadding),
				Math.max(0, contentBottomPadding),
				theme
			),
		[content, contentBottomPadding, contentTopPadding, theme]
	);

	return (
		<View style={[styles.container, { backgroundColor }]}>
			<WebView
				javaScriptEnabled={false}
				originWhitelist={['*']}
				setSupportMultipleWindows={false}
				source={{ html }}
				style={[styles.webview, { backgroundColor }]}
				onShouldStartLoadWithRequest={(request) => {
					if (request.url === 'about:blank') return true;
					if (
						request.url.startsWith('http://') ||
						request.url.startsWith('https://')
					) {
						void Linking.openURL(request.url);
						return false;
					}
					return true;
				}}
			/>
		</View>
	);
}

function buildPreviewHtml(
	content: string,
	contentTopPadding: number,
	contentBottomPadding: number,
	theme: ResolvedThemePreference
) {
	const normalized = normalizeLeadingWhitespace(content);
	const { markdown, mathTokens } = protectMath(normalized);
	const parsed = marked.parse(markdown, { async: false }) as string;
	const withMath = mathTokens.reduce(
		(html, item) => html.replaceAll(item.token, item.html),
		parsed
	);
	const safeHtml = sanitizeHtml(withMath);

	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>${previewCss(contentTopPadding, contentBottomPadding, theme)}</style>
  </head>
  <body>
    <main class="prose">${safeHtml}</main>
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
    pre {
      background: ${preBackground};
      border-radius: 8px;
      color: ${preForeground};
      overflow-x: auto;
      padding: 14px;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      white-space: pre;
    }
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
