import { useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import katex from 'katex';
import { marked } from 'marked';

type MarkdownPreviewProps = {
	content: string;
	contentTopPadding?: number;
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
	contentTopPadding = 0,
}: MarkdownPreviewProps) {
	const html = useMemo(
		() => buildPreviewHtml(content, Math.max(0, contentTopPadding)),
		[content, contentTopPadding]
	);

	return (
		<View style={styles.container}>
			<WebView
				javaScriptEnabled={false}
				originWhitelist={['*']}
				setSupportMultipleWindows={false}
				source={{ html }}
				style={styles.webview}
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

function buildPreviewHtml(content: string, contentTopPadding: number) {
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
    <style>${previewCss(contentTopPadding)}</style>
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

function previewCss(contentTopPadding: number) {
	return `
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.65;
      background: #fbfcff;
      color: #111827;
    }
    html,
    body {
      min-height: 100%;
      margin: 0;
      background: #fbfcff;
    }
    body {
      overflow-wrap: anywhere;
      -webkit-text-size-adjust: 100%;
    }
    .prose {
      box-sizing: border-box;
      min-height: 100vh;
      padding: ${contentTopPadding + 18}px 18px 120px;
    }
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      line-height: 1.25;
      margin: 1.35em 0 0.55em;
      color: #0f172a;
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
      color: #475569;
      padding-left: 12px;
    }
    code {
      background: rgba(15, 23, 42, 0.06);
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 0.9em;
      padding: 0.1em 0.3em;
    }
    pre {
      background: #0f172a;
      border-radius: 8px;
      color: #e5e7eb;
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
      border: 1px solid rgba(15, 23, 42, 0.14);
      padding: 8px 10px;
    }
    th {
      background: rgba(37, 99, 235, 0.08);
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
		backgroundColor: '#fbfcff',
		flex: 1,
	},
	webview: {
		backgroundColor: '#fbfcff',
		flex: 1,
	},
});
