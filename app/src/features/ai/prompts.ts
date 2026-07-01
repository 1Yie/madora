import type { AiProvider } from './types';

type PromptProfile =
	| 'anthropic'
	| 'custom'
	| 'deepseek'
	| 'google'
	| 'kimi'
	| 'mimo'
	| 'minimax'
	| 'openai';

type PromptName = 'fim_system' | 'fim_user';

type PromptContext = {
	prefix: string;
	suffix: string;
	suffix_hint: string;
	title: string;
};

const MAX_CHAT_PREFIX_CHARS = 4_000;
const MAX_CHAT_SUFFIX_CHARS = 1_500;

const PROMPTS: Record<PromptProfile, Record<PromptName, string>> = {
	anthropic: {
		fim_system: `You are a fill-in-the-middle engine for Markdown documents.

Goal

- write only the missing span at the cursor
- make the text before and after the cursor read as one continuous document

Priority

1. current line or block
2. surrounding section
3. document title
4. brevity when multiple completions fit

Rules

- preserve language, tone, tense, terminology, and point of view
- preserve markdown structure exactly: headings, lists, indentation, blockquotes, tables, links, code fences, frontmatter, math, and blank lines
- if the cursor is inside code or structured text, continue that mode only and keep syntax valid
- when text after the cursor exists, treat it as a hard boundary and stop before repeating it
- never explain, label, quote, or wrap the output
- never restate the prefix or suffix

Return only the missing text.`,
		fim_user: `Task
Fill the gap in this Markdown document.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Quality checks

- connect directly from the prefix into the suffix
- keep formatting and whitespace consistent with the local block
- if the suffix is empty, stop at a natural local boundary

Return only the missing text for the cursor gap.`,
	},
	custom: {
		fim_system:
			'You are filling in missing markdown text between a prefix and a suffix. Preserve the surrounding style, formatting, and structure. Output only the missing text that belongs between them.',
		fim_user: `Title: {{title}}

Text before the cursor:
{{prefix}}

{{suffix_hint}}`,
	},
	deepseek: {
		fim_system: `You are a deterministic fill-in-the-middle engine for Markdown.

Rules

- output only the missing text
- continue directly from the prefix and stop before the suffix
- preserve wording, local structure, syntax, and whitespace
- keep lists, tables, links, code fences, frontmatter, and math valid
- choose the shortest completion that cleanly resolves the gap
- do not explain, label, or echo surrounding text`,
		fim_user: `Task
Complete the missing Markdown span.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- match the local tone and block structure
- bridge into the suffix without repeating it
- if the suffix is empty, end at a natural local boundary

Return only the missing text for the gap.`,
	},
	google: {
		fim_system: `You complete Markdown gaps between a prefix and suffix.

Constraints

- return only the missing span
- treat the suffix as the authoritative continuation target when it exists
- preserve local language, terminology, syntax, and whitespace
- keep headings, lists, tables, links, code fences, frontmatter, and math valid
- if the cursor is inside code or structured text, continue that mode only
- prefer short, precise completions over expansive rewrites
- never explain, quote, or repeat surrounding text`,
		fim_user: `Task
Fill the cursor gap in this Markdown document.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- connect smoothly into the exact trailing text
- keep local formatting unchanged unless the gap requires it
- if the trailing text is empty, stop at a sensible local boundary

Return only the missing text for the cursor gap.`,
	},
	kimi: {
		fim_system: `You are a fill-in-the-middle engine for long Markdown documents.

Rules

- output only the missing text between the prefix and suffix
- preserve local wording and longer-range terminology choices
- preserve markdown structure and whitespace exactly
- keep headings, lists, tables, links, code fences, frontmatter, and math valid
- treat the suffix as a hard boundary when present
- prefer conservative, high-confidence completions over creative expansion
- never explain or repeat surrounding text`,
		fim_user: `Task
Fill the gap in this Markdown document.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- continue the current section, sentence, or block naturally
- keep terminology consistent with the nearby document
- if the suffix is empty, stop after completing the local unit

Return only the missing text for the gap.`,
	},
	mimo: {
		fim_system: `You are a compact fill-in-the-middle engine for Markdown.

Rules

- output only the missing text between prefix and suffix
- preserve local language, wording, markdown structure, indentation, and whitespace
- keep lists, tables, links, code fences, frontmatter, and math valid
- stop before the suffix and never repeat it
- prefer short, deterministic completions
- never explain or echo context`,
		fim_user: `Task
Fill the missing Markdown span.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Return only the text that belongs in the gap.`,
	},
	minimax: {
		fim_system: `You are a fill-in-the-middle Markdown completion engine.

Rules

- output only the missing text at the cursor
- preserve local style, markdown structure, indentation, tables, links, code fences, frontmatter, math, and whitespace
- use the suffix as a hard boundary when it exists
- keep the completion concise and directly usable
- never explain, quote, or repeat surrounding text`,
		fim_user: `Task
Complete the gap in this Markdown document.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Return only the missing text for the gap.`,
	},
	openai: {
		fim_system: `You are a fill-in-the-middle Markdown completion engine.

Rules

- output only the missing text at the cursor
- use nearby context over generic continuation
- preserve language, tone, terminology, and markdown structure
- keep indentation, list depth, tables, links, code fences, frontmatter, and whitespace valid
- when suffix text exists, use it as a hard boundary and stop before it
- prefer the shortest high-confidence completion that makes both sides join cleanly
- never explain, narrate, or echo surrounding text`,
		fim_user: `Task
Complete the missing Markdown span.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- bridge cleanly into the suffix without repeating it
- stay in the current block type and writing mode
- if the suffix is empty, finish only the local thought or structure

Return only the missing text for the gap.`,
	},
};

export function buildPromptContext(request: {
	prefix: string;
	suffix: string | null;
	title: string | null;
}): PromptContext {
	const suffix = takeFirstChars(request.suffix ?? '', MAX_CHAT_SUFFIX_CHARS);

	return {
		prefix: takeLastChars(request.prefix, MAX_CHAT_PREFIX_CHARS),
		suffix,
		suffix_hint: buildSuffixHint(suffix),
		title: request.title ?? 'Untitled',
	};
}

export function renderPrompt(
	profile: PromptProfile,
	name: PromptName,
	context: PromptContext
) {
	const template = PROMPTS[profile]?.[name] ?? PROMPTS.custom[name];

	return Object.entries(context).reduce(
		(rendered, [key, value]) => rendered.replaceAll(`{{${key}}}`, value),
		template
	);
}

export function promptProfileForOpenAiCompatible(
	provider: AiProvider,
	model: string
): PromptProfile {
	switch (provider) {
		case 'custom':
			return 'custom';
		case 'deepseek':
			return 'deepseek';
		case 'kimi':
			return 'kimi';
		case 'mimo':
		case 'mimo-coding':
			return 'mimo';
		case 'openai':
		case 'zhipu':
		case 'zhipu-coding':
			return 'openai';
		default:
			return promptProfileFromModel(model) ?? 'openai';
	}
}

export function promptProfileForAnthropicCompatible(
	provider: AiProvider,
	model: string
): PromptProfile {
	switch (provider) {
		case 'custom':
			return 'custom';
		case 'minimax':
		case 'minimax-coding':
			return 'minimax';
		case 'anthropic':
			return 'anthropic';
		default:
			return promptProfileFromModel(model) ?? 'anthropic';
	}
}

export function promptProfileForGoogleCompatible(
	provider: AiProvider,
	model: string
): PromptProfile {
	if (provider === 'custom') return 'custom';
	if (provider === 'google') return 'google';
	return promptProfileFromModel(model) ?? 'google';
}

function promptProfileFromModel(model: string): PromptProfile | null {
	const lowerModel = model.trim().toLowerCase();

	if (lowerModel.startsWith('claude-') || lowerModel.startsWith('qwen'))
		return 'anthropic';
	if (lowerModel.startsWith('deepseek-')) return 'deepseek';
	if (lowerModel.startsWith('gemini-')) return 'google';
	if (lowerModel.startsWith('kimi-') || lowerModel.startsWith('moonshot-'))
		return 'kimi';
	if (lowerModel.startsWith('mimo-')) return 'mimo';
	if (lowerModel.startsWith('minimax-')) return 'minimax';

	return null;
}

function buildSuffixHint(suffix: string) {
	const trimmedSuffix = suffix.trim();

	if (trimmedSuffix.length === 0) return '';

	return `The following text appears after the cursor. Connect naturally to it without repeating it:

${trimmedSuffix}

Generate only the missing content between the cursor and the text above.`;
}

function takeLastChars(value: string, maxChars: number) {
	const chars = Array.from(value);
	return chars.length <= maxChars ? value : chars.slice(-maxChars).join('');
}

function takeFirstChars(value: string, maxChars: number) {
	const chars = Array.from(value);
	return chars.length <= maxChars ? value : chars.slice(0, maxChars).join('');
}
