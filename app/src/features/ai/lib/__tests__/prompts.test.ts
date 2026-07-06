import { describe, expect, test } from 'bun:test';

import {
	buildPromptContext,
	promptProfileForAnthropicCompatible,
	promptProfileForGoogleCompatible,
	promptProfileForOpenAiCompatible,
	renderPrompt,
} from '../prompts';

describe('AI prompts', () => {
	test('buildPromptContext uses defaults and omits suffix hint for blank suffix', () => {
		const context = buildPromptContext({
			prefix: 'prefix',
			suffix: '   ',
			title: null,
		});

		expect(context).toEqual({
			prefix: 'prefix',
			suffix: '   ',
			suffix_hint: '',
			title: 'Untitled',
		});
	});

	test('buildPromptContext keeps last prefix chars and first suffix chars', () => {
		const prefix = `${'a'.repeat(4_000)}tail`;
		const suffix = `head${'b'.repeat(1_500)}`;
		const context = buildPromptContext({
			prefix,
			suffix,
			title: 'Long note',
		});

		expect(context.prefix.length).toBe(4_000);
		expect(context.prefix.startsWith('aaaa')).toBe(true);
		expect(context.prefix.endsWith('tail')).toBe(true);
		expect(context.suffix.length).toBe(1_500);
		expect(context.suffix.startsWith('head')).toBe(true);
		expect(context.suffix.endsWith('bbbb')).toBe(true);
		expect(context.title).toBe('Long note');
	});

	test('suffix hint includes trimmed suffix without repeating blank padding', () => {
		const context = buildPromptContext({
			prefix: 'hello',
			suffix: '  world  ',
			title: 'Greeting',
		});

		expect(context.suffix).toBe('  world  ');
		expect(context.suffix_hint.includes('world')).toBe(true);
		expect(context.suffix_hint.includes('  world  ')).toBe(false);
	});

	test('renderPrompt replaces every placeholder for custom prompt', () => {
		const context = buildPromptContext({
			prefix: 'before',
			suffix: 'after',
			title: 'Doc',
		});
		const prompt = renderPrompt('custom', 'fim_user', context);

		expect(prompt.includes('{{')).toBe(false);
		expect(prompt.includes('Doc')).toBe(true);
		expect(prompt.includes('before')).toBe(true);
		expect(prompt.includes('after')).toBe(true);
	});

	test('routes OpenAI-compatible prompt profiles by provider and model', () => {
		expect(promptProfileForOpenAiCompatible('deepseek', 'ignored')).toBe(
			'deepseek'
		);
		expect(promptProfileForOpenAiCompatible('kimi', 'ignored')).toBe('kimi');
		expect(promptProfileForOpenAiCompatible('mimo-coding', 'ignored')).toBe(
			'mimo'
		);
		expect(promptProfileForOpenAiCompatible('opencode-go', 'gemini-pro')).toBe(
			'google'
		);
		expect(promptProfileForOpenAiCompatible('opencode-go', 'unknown')).toBe(
			'openai'
		);
	});

	test('routes Anthropic and Google-compatible prompt profiles', () => {
		expect(
			promptProfileForAnthropicCompatible('minimax-coding', 'ignored')
		).toBe('minimax');
		expect(
			promptProfileForAnthropicCompatible('opencode-zen', 'qwen3-coder')
		).toBe('anthropic');
		expect(promptProfileForGoogleCompatible('google', 'ignored')).toBe(
			'google'
		);
		expect(promptProfileForGoogleCompatible('custom', 'gemini-3')).toBe(
			'custom'
		);
	});
});
