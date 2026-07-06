import { describe, expect, test } from 'bun:test';

import {
	DEFAULT_PROVIDER,
	createProviderConfigMap,
	getDefaultProviderConfig,
	getProviderDefinition,
	getProviderKeys,
	isCustomProviderProtocol,
	isProvider,
} from '../provider-definitions';

describe('AI provider definitions', () => {
	test('default provider is a known provider', () => {
		expect(isProvider(DEFAULT_PROVIDER)).toBe(true);
	});

	test('provider keys are unique and include custom provider', () => {
		const keys = getProviderKeys();

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.includes('custom')).toBe(true);
	});

	test('validates provider and custom protocol inputs', () => {
		expect(isProvider('openai')).toBe(true);
		expect(isProvider('missing')).toBe(false);
		expect(isProvider(null)).toBe(false);

		expect(isCustomProviderProtocol('openai')).toBe(true);
		expect(isCustomProviderProtocol('anthropic')).toBe(true);
		expect(isCustomProviderProtocol('google')).toBe(true);
		expect(isCustomProviderProtocol('deepseek')).toBe(false);
		expect(isCustomProviderProtocol(null)).toBe(false);
	});

	test('builds default config from provider definition', () => {
		const definition = getProviderDefinition('openai');
		const config = getDefaultProviderConfig('openai');

		expect(config).toEqual({
			apiUrl: definition.defaultApiUrl,
			customProtocol: 'openai',
			model: definition.defaultModel,
			useSsl: true,
		});
	});

	test('anthropic defaults to anthropic protocol and custom has empty endpoint', () => {
		expect(getDefaultProviderConfig('anthropic').customProtocol).toBe(
			'anthropic'
		);
		expect(getDefaultProviderConfig('custom')).toEqual({
			apiUrl: '',
			customProtocol: 'openai',
			model: '',
			useSsl: true,
		});
	});

	test('config map has an entry for every provider key', () => {
		const map = createProviderConfigMap();

		expect(Object.keys(map).sort()).toEqual(getProviderKeys().sort());
	});
});
