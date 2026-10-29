import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CUSTOM_PROVIDER_PROTOCOLS,
	isCustomProviderProtocol,
} from '@/invoke/ai';

describe('custom AI protocols', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.resetModules();
	});

	it('offers the five supported protocols and rejects unknown values', () => {
		expect(CUSTOM_PROVIDER_PROTOCOLS).toEqual([
			'openai',
			'openai-responses',
			'openai-codex',
			'anthropic',
			'google',
		]);
		for (const protocol of CUSTOM_PROVIDER_PROTOCOLS) {
			expect(isCustomProviderProtocol(protocol)).toBe(true);
		}
		expect(isCustomProviderProtocol('unsupported')).toBe(false);
		expect(isCustomProviderProtocol(null)).toBe(false);
	});

	it.each(CUSTOM_PROVIDER_PROTOCOLS)(
		'persists and restores %s for the custom provider',
		async (protocol) => {
			const { useAiSettingsStore } =
				await import('@/context/ai-settings-provider');
			useAiSettingsStore.getState().setProvider('custom');
			useAiSettingsStore.getState().setCustomProtocol(protocol);
			expect(
				window.localStorage.getItem(
					'madora-ai-completion-custom-protocol:custom'
				)
			).toBe(protocol);

			vi.resetModules();
			const restored = await import('@/context/ai-settings-provider');
			expect(
				restored.useAiSettingsStore.getState().providerConfigs.custom
					.customProtocol
			).toBe(protocol);
		}
	);

	it('falls back to OpenAI Chat for an unknown stored protocol', async () => {
		window.localStorage.setItem(
			'madora-ai-completion-custom-protocol:custom',
			'unsupported'
		);
		const { useAiSettingsStore } =
			await import('@/context/ai-settings-provider');
		expect(
			useAiSettingsStore.getState().providerConfigs.custom.customProtocol
		).toBe('openai');
	});
});
