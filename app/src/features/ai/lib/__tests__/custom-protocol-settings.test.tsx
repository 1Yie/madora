import { describe, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { CUSTOM_PROTOCOLS } from '../provider-definitions';
import en from '../../../../i18n/locales/en';
import ja from '../../../../i18n/locales/ja';
import ko from '../../../../i18n/locales/ko';
import zh from '../../../../i18n/locales/zh-CN';

const storage = new Map<string, string>();
mock.module('expo-secure-store', () => ({
	isAvailableAsync: async () => true,
	getItemAsync: async (key: string) => storage.get(key) ?? null,
	setItemAsync: async (key: string, value: string) => {
		storage.set(key, value);
	},
	deleteItemAsync: async (key: string) => {
		storage.delete(key);
	},
}));
const { AiSettingsProvider, useAiSettings } =
	await import('../../providers/settings-provider');

async function withSettings(
	storedProtocol: string | null,
	run: (current: () => ReturnType<typeof useAiSettings>) => Promise<void>
) {
	storage.clear();
	storage.set('madora-ai.provider', 'custom');
	storage.set('madora-ai.apiKey.custom', 'stored-key');
	if (storedProtocol !== null)
		storage.set('madora-ai.customProtocol.custom', storedProtocol);
	const window = new Window();
	const originals = new Map<string, PropertyDescriptor | undefined>();
	for (const [key, value] of Object.entries({
		window,
		document: window.document,
		navigator: window.navigator,
		IS_REACT_ACT_ENVIRONMENT: true,
	})) {
		originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Object.defineProperty(globalThis, key, {
			configurable: true,
			value,
			writable: true,
		});
	}
	let current!: ReturnType<typeof useAiSettings>;
	function Probe() {
		current = useAiSettings();
		return null;
	}
	const root = createRoot(
		window.document.createElement('div') as unknown as HTMLElement
	);
	try {
		await act(async () => {
			root.render(
				<AiSettingsProvider>
					<Probe />
				</AiSettingsProvider>
			);
		});
		expect(current.ready).toBe(true);
		await run(() => current);
	} finally {
		await act(async () => root.unmount());
		for (const [key, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
		await window.happyDOM.close();
	}
}

describe('mobile custom protocol settings', () => {
	for (const protocol of CUSTOM_PROTOCOLS) {
		test(`hydrates and saves exact protocol value ${protocol}`, async () => {
			await withSettings(protocol, async (current) => {
				expect(current().customProtocol).toBe(protocol);
				expect((await current().getCompletionConfig())?.customProtocol).toBe(
					protocol
				);
				await act(async () => current().setCustomProtocol('openai'));
				await act(async () => current().setCustomProtocol(protocol));
				expect(storage.get('madora-ai.customProtocol.custom')).toBe(protocol);
				expect((await current().getCompletionConfig())?.customProtocol).toBe(
					protocol
				);
			});
		});
	}
	for (const stored of [null, 'unknown-future-protocol']) {
		test(`old or unknown protocol ${stored} falls back to OpenAI Chat`, async () => {
			await withSettings(stored, async (current) => {
				expect(current().customProtocol).toBe('openai');
				expect((await current().getCompletionConfig())?.customProtocol).toBe(
					'openai'
				);
			});
		});
	}
	test('settings and first-run wizard share all five localized options', () => {
		expect(CUSTOM_PROTOCOLS.length).toBe(5);
		for (const locale of [en, ja, ko, zh]) {
			const options = locale.settings.editor.customProtocolOptions;
			for (const protocol of CUSTOM_PROTOCOLS) {
				expect(options[protocol].label.length > 0).toBe(true);
				expect(options[protocol].description.length > 0).toBe(true);
			}
			expect(options['openai-responses'].label).toBe('OpenAI Responses (HTTP)');
			expect(options['openai-codex'].label).toBe('OpenAI Codex (WebSocket)');
		}
		for (const path of [
			'../../screens/ai-settings-screen.tsx',
			'../../../onboarding/screens/onboarding-screen.tsx',
		]) {
			const source = readFileSync(new URL(path, import.meta.url), 'utf8');
			expect(source).toContain('CUSTOM_PROTOCOLS.map');
			expect(source).toContain('customProtocol}.description');
		}
	});
});
