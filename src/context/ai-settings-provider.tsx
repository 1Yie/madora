import create from 'zustand';
import { useEffect, useMemo, type ReactNode } from 'react';
import { deleteAiApiKey, hasAiApiKey, storeAiApiKey } from '@/invoke/ai';

import { showErrorToast } from '@/components/ui/toast';
import i18n from '@/i18n';

export type AiProvider =
	| 'anthropic'
	| 'custom'
	| 'deepseek'
	| 'google'
	| 'kimi'
	| 'minimax'
	| 'minimax-coding'
	| 'mimo'
	| 'mimo-coding'
	| 'openai'
	| 'opencode-go'
	| 'opencode-zen'
	| 'zhipu'
	| 'zhipu-coding';

export type CustomProviderProtocol = 'anthropic' | 'google' | 'openai';

type ProviderConfig = {
	apiUrl: string;
	customProtocol: CustomProviderProtocol;
	model: string;
	useSsl: boolean;
};

type ProviderApiKeyAvailability = Record<AiProvider, boolean>;

export type AiSettingsContextValue = ProviderConfig & {
	enabled: boolean;
	hasApiKey: boolean;
	provider: AiProvider;

	deleteApiKey: () => Promise<void>;
	saveApiKey: (apiKey: string) => Promise<void>;
	setApiUrl: (apiUrl: string) => void;
	setCustomProtocol: (protocol: CustomProviderProtocol) => void;
	setEnabled: (enabled: boolean) => void;
	setModel: (model: string) => void;
	setProvider: (provider: AiProvider) => void;
	setUseSsl: (useSsl: boolean) => void;
};

type ProviderDefinition = {
	defaultApiUrl: string;
	defaultModel: string;
	key: AiProvider;
	label: string;
};

const PROVIDERS: ProviderDefinition[] = [
	{
		defaultApiUrl: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-pro',
		key: 'deepseek',
		label: 'DeepSeek',
	},
	{
		defaultApiUrl: 'https://api.openai.com',
		defaultModel: 'gpt-4o-mini',
		key: 'openai',
		label: 'OpenAI',
	},
	{
		defaultApiUrl: 'https://api.anthropic.com',
		defaultModel: 'claude-sonnet-4-6',
		key: 'anthropic',
		label: 'Anthropic',
	},
	{
		defaultApiUrl: 'https://generativelanguage.googleapis.com',
		defaultModel: 'gemini-2.5-flash',
		key: 'google',
		label: 'Google Gemini',
	},
	{
		defaultApiUrl: 'https://api.moonshot.cn',
		defaultModel: 'kimi-k2.7-code',
		key: 'kimi',
		label: 'Kimi',
	},
	{
		defaultApiUrl: 'https://api.minimaxi.com/anthropic',
		defaultModel: 'MiniMax-M3',
		key: 'minimax',
		label: 'MiniMax',
	},
	{
		defaultApiUrl: 'https://api.minimaxi.com/anthropic',
		defaultModel: 'MiniMax-M3',
		key: 'minimax-coding',
		label: 'MiniMax Coding Plan',
	},
	{
		defaultApiUrl: 'https://api.xiaomimimo.com',
		defaultModel: 'mimo-v2.5-pro',
		key: 'mimo',
		label: 'Xiaomi MiMo',
	},
	{
		defaultApiUrl: 'https://token-plan-cn.xiaomimimo.com',
		defaultModel: 'mimo-v2.5-pro',
		key: 'mimo-coding',
		label: 'Xiaomi MiMo Coding Plan',
	},
	{
		defaultApiUrl: 'https://open.bigmodel.cn/api/paas/v4',
		defaultModel: 'glm-5.2',
		key: 'zhipu',
		label: 'Zhipu GLM',
	},
	{
		defaultApiUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
		defaultModel: 'glm-5.2',
		key: 'zhipu-coding',
		label: 'Zhipu GLM Coding Plan',
	},
	{
		defaultApiUrl: 'https://opencode.ai/zen/go',
		defaultModel: 'deepseek-v4-pro',
		key: 'opencode-go',
		label: 'OpenCode Go',
	},
	{
		defaultApiUrl: 'https://opencode.ai/zen',
		defaultModel: 'claude-sonnet-4.6',
		key: 'opencode-zen',
		label: 'OpenCode Zen',
	},

	{
		defaultApiUrl: '',
		defaultModel: '',
		key: 'custom',
		label: 'Custom',
	},
];

const DEFAULT_PROVIDER: AiProvider = 'deepseek';
const AI_COMPLETION_ENABLED_STORAGE_KEY = 'madora-ai-completion-enabled';
const AI_COMPLETION_PROVIDER_STORAGE_KEY = 'madora-ai-provider';
const AI_COMPLETION_API_KEY_STORAGE_KEY = 'madora-ai-completion-api-key';
const AI_COMPLETION_API_URL_STORAGE_KEY = 'madora-ai-completion-api-url';
const AI_COMPLETION_CUSTOM_PROTOCOL_STORAGE_KEY =
	'madora-ai-completion-custom-protocol';
const AI_COMPLETION_MODEL_STORAGE_KEY = 'madora-ai-completion-model';
const AI_COMPLETION_USE_SSL_STORAGE_KEY = 'madora-ai-completion-use-ssl';

export function getProviderDefinitions() {
	return PROVIDERS;
}

function isProvider(value: string | null): value is AiProvider {
	return PROVIDERS.some((provider) => provider.key === value);
}

function getProviderDefinition(provider: AiProvider): ProviderDefinition {
	return PROVIDERS.find((item) => item.key === provider) ?? PROVIDERS[0];
}

function getProviderStorageKey(baseKey: string, provider: AiProvider) {
	return `${baseKey}:${provider}`;
}

function isCustomProviderProtocol(
	value: string | null
): value is CustomProviderProtocol {
	return value === 'anthropic' || value === 'google' || value === 'openai';
}

function getProviderKeys(): AiProvider[] {
	return PROVIDERS.map((provider) => provider.key);
}

function createProviderApiKeyAvailability(
	initialValue = false
): ProviderApiKeyAvailability {
	return {
		anthropic: initialValue,
		custom: initialValue,
		deepseek: initialValue,
		google: initialValue,
		kimi: initialValue,
		minimax: initialValue,
		'minimax-coding': initialValue,
		mimo: initialValue,
		'mimo-coding': initialValue,
		openai: initialValue,
		'opencode-go': initialValue,
		'opencode-zen': initialValue,
		zhipu: initialValue,
		'zhipu-coding': initialValue,
	};
}

function getStoredValue(key: string): string | null {
	if (typeof window === 'undefined') {
		return null;
	}

	return window.localStorage.getItem(key);
}

function setStoredValue(key: string, value: string) {
	window.localStorage.setItem(key, value);
}

function removeStoredValue(key: string) {
	window.localStorage.removeItem(key);
}

function getDefaultProviderConfig(provider: AiProvider): ProviderConfig {
	const definition = getProviderDefinition(provider);

	return {
		apiUrl: definition.defaultApiUrl,
		customProtocol: provider === 'anthropic' ? 'anthropic' : 'openai',
		model: definition.defaultModel,
		useSsl: true,
	};
}

function readProviderConfig(provider: AiProvider): ProviderConfig {
	if (typeof window === 'undefined') {
		return getDefaultProviderConfig(provider);
	}

	const defaultConfig = getDefaultProviderConfig(provider);

	return {
		apiUrl:
			getStoredValue(
				getProviderStorageKey(AI_COMPLETION_API_URL_STORAGE_KEY, provider)
			) ?? defaultConfig.apiUrl,
		customProtocol: (() => {
			const storedValue = getStoredValue(
				getProviderStorageKey(
					AI_COMPLETION_CUSTOM_PROTOCOL_STORAGE_KEY,
					provider
				)
			);

			return isCustomProviderProtocol(storedValue)
				? storedValue
				: defaultConfig.customProtocol;
		})(),
		model:
			getStoredValue(
				getProviderStorageKey(AI_COMPLETION_MODEL_STORAGE_KEY, provider)
			) ?? defaultConfig.model,
		useSsl: (() => {
			const storedValue = getStoredValue(
				getProviderStorageKey(AI_COMPLETION_USE_SSL_STORAGE_KEY, provider)
			);
			return storedValue === null
				? defaultConfig.useSsl
				: storedValue === 'true';
		})(),
	};
}

function readInitialProviderConfigs(): Record<AiProvider, ProviderConfig> {
	return {
		anthropic: readProviderConfig('anthropic'),
		custom: readProviderConfig('custom'),
		deepseek: readProviderConfig('deepseek'),
		google: readProviderConfig('google'),
		kimi: readProviderConfig('kimi'),
		minimax: readProviderConfig('minimax'),
		'minimax-coding': readProviderConfig('minimax-coding'),
		mimo: readProviderConfig('mimo'),
		'mimo-coding': readProviderConfig('mimo-coding'),
		openai: readProviderConfig('openai'),
		'opencode-go': readProviderConfig('opencode-go'),
		'opencode-zen': readProviderConfig('opencode-zen'),
		zhipu: readProviderConfig('zhipu'),
		'zhipu-coding': readProviderConfig('zhipu-coding'),
	};
}

function readInitialEnabled(): boolean {
	if (typeof window === 'undefined') return true;
	const storedValue = getStoredValue(AI_COMPLETION_ENABLED_STORAGE_KEY);
	return storedValue === null ? true : storedValue === 'true';
}

function readInitialProvider(): AiProvider {
	if (typeof window === 'undefined') return DEFAULT_PROVIDER;
	const storedValue = getStoredValue(AI_COMPLETION_PROVIDER_STORAGE_KEY);
	return isProvider(storedValue) ? storedValue : DEFAULT_PROVIDER;
}

type AiSettingsState = {
	enabled: boolean;
	provider: AiProvider;
	providerConfigs: Record<AiProvider, ProviderConfig>;
	providerApiKeyAvailability: ProviderApiKeyAvailability;
};

type AiSettingsActions = {
	setEnabled: (enabled: boolean) => void;
	setProvider: (provider: AiProvider) => void;
	setApiUrl: (apiUrl: string) => void;
	setCustomProtocol: (protocol: CustomProviderProtocol) => void;
	setModel: (model: string) => void;
	setUseSsl: (useSsl: boolean) => void;
	deleteApiKey: () => Promise<void>;
	saveApiKey: (apiKey: string) => Promise<void>;
	/** Initialize API key availability from secure storage. Called once by provider. */
	initApiKeys: () => Promise<void>;
};

type AiSettingsStore = AiSettingsState & AiSettingsActions;

const useAiSettingsStore = create<AiSettingsStore>((set, get) => ({
	enabled: readInitialEnabled(),
	provider: readInitialProvider(),
	providerConfigs: readInitialProviderConfigs(),
	providerApiKeyAvailability: createProviderApiKeyAvailability(),

	setEnabled: (enabled) => {
		set({ enabled });
		try {
			window.localStorage.setItem(
				AI_COMPLETION_ENABLED_STORAGE_KEY,
				String(enabled)
			);
		} catch {
			/* ignore */
		}
	},

	setProvider: (provider) => {
		set({ provider });
		try {
			window.localStorage.setItem(AI_COMPLETION_PROVIDER_STORAGE_KEY, provider);
		} catch {
			/* ignore */
		}
	},

	setApiUrl: (apiUrl) => {
		const { provider } = get();
		set((state) => ({
			providerConfigs: {
				...state.providerConfigs,
				[provider]: { ...state.providerConfigs[provider], apiUrl },
			},
		}));
		try {
			setStoredValue(
				getProviderStorageKey(AI_COMPLETION_API_URL_STORAGE_KEY, provider),
				apiUrl
			);
		} catch {
			/* ignore */
		}
	},

	setCustomProtocol: (customProtocol) => {
		const { provider } = get();
		set((state) => ({
			providerConfigs: {
				...state.providerConfigs,
				[provider]: { ...state.providerConfigs[provider], customProtocol },
			},
		}));
		try {
			setStoredValue(
				getProviderStorageKey(
					AI_COMPLETION_CUSTOM_PROTOCOL_STORAGE_KEY,
					provider
				),
				customProtocol
			);
		} catch {
			/* ignore */
		}
	},

	setModel: (model) => {
		const { provider } = get();
		set((state) => ({
			providerConfigs: {
				...state.providerConfigs,
				[provider]: { ...state.providerConfigs[provider], model },
			},
		}));
		try {
			setStoredValue(
				getProviderStorageKey(AI_COMPLETION_MODEL_STORAGE_KEY, provider),
				model
			);
		} catch {
			/* ignore */
		}
	},

	setUseSsl: (useSsl) => {
		const { provider } = get();
		set((state) => ({
			providerConfigs: {
				...state.providerConfigs,
				[provider]: { ...state.providerConfigs[provider], useSsl },
			},
		}));
		try {
			setStoredValue(
				getProviderStorageKey(AI_COMPLETION_USE_SSL_STORAGE_KEY, provider),
				String(useSsl)
			);
		} catch {
			/* ignore */
		}
	},

	deleteApiKey: async () => {
		const provider = get().provider;
		await deleteAiApiKey({ provider });
		set((state) => ({
			providerApiKeyAvailability: {
				...state.providerApiKeyAvailability,
				[provider]: false,
			},
		}));
		try {
			removeStoredValue(
				getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, provider)
			);
		} catch {
			/* ignore */
		}
	},

	saveApiKey: async (apiKey) => {
		const trimmedApiKey = apiKey.trim();

		if (trimmedApiKey.length === 0) {
			throw new Error(i18n.t('ai.apiKeyRequired'));
		}

		const provider = get().provider;
		await storeAiApiKey({ apiKey: trimmedApiKey, provider });
		set((state) => ({
			providerApiKeyAvailability: {
				...state.providerApiKeyAvailability,
				[provider]: true,
			},
		}));
		try {
			removeStoredValue(
				getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, provider)
			);
		} catch {
			/* ignore */
		}
	},

	initApiKeys: async () => {
		const { providerConfigs } = get();
		const apiKeyAvailability = createProviderApiKeyAvailability();
		const errors: string[] = [];

		for (const provider of getProviderKeys()) {
			const storageKey = getProviderStorageKey(
				AI_COMPLETION_API_KEY_STORAGE_KEY,
				provider
			);
			const legacyApiKey = getStoredValue(storageKey);

			try {
				const hasSecureApiKey = await hasAiApiKey({ provider });

				if (hasSecureApiKey) {
					apiKeyAvailability[provider] = true;

					if (legacyApiKey !== null) {
						removeStoredValue(storageKey);
					}

					continue;
				}

				if (legacyApiKey === null) {
					continue;
				}

				if (legacyApiKey.trim().length === 0) {
					removeStoredValue(storageKey);
					continue;
				}

				await storeAiApiKey({ apiKey: legacyApiKey, provider });
				removeStoredValue(storageKey);
				apiKeyAvailability[provider] = true;
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
			}
		}

		set({ providerApiKeyAvailability: apiKeyAvailability, providerConfigs });

		if (errors.length > 0) {
			const uniqueErrors = [...new Set(errors)];
			showErrorToast(
				i18n.t('aiSettingsProvider.keychainAccessFailed'),
				uniqueErrors.join('\n')
			);
		}
	},
}));

export { useAiSettingsStore };

export function AiSettingsProvider({ children }: { children: ReactNode }) {
	// Run API key migration once on mount
	useEffect(() => {
		void useAiSettingsStore.getState().initApiKeys();
	}, []);

	return <>{children}</>;
}

export function useAiSettings(): AiSettingsContextValue {
	const enabled = useAiSettingsStore((s) => s.enabled);
	const provider = useAiSettingsStore((s) => s.provider);
	const providerConfigs = useAiSettingsStore((s) => s.providerConfigs);
	const providerApiKeyAvailability = useAiSettingsStore(
		(s) => s.providerApiKeyAvailability
	);

	const currentConfig = providerConfigs[provider];
	const hasApiKey = providerApiKeyAvailability[provider];

	const {
		deleteApiKey,
		saveApiKey,
		setApiUrl,
		setCustomProtocol,
		setEnabled,
		setModel,
		setProvider,
		setUseSsl,
	} = useAiSettingsStore.getState();

	return useMemo(
		() => ({
			apiUrl: currentConfig.apiUrl,
			customProtocol: currentConfig.customProtocol,
			deleteApiKey,
			enabled,
			hasApiKey,
			model: currentConfig.model,
			provider,
			saveApiKey,
			setApiUrl,
			setCustomProtocol,
			setEnabled,
			setModel,
			setProvider,
			setUseSsl,
			useSsl: currentConfig.useSsl,
		}),
		[
			currentConfig.apiUrl,
			currentConfig.customProtocol,
			currentConfig.model,
			currentConfig.useSsl,
			deleteApiKey,
			enabled,
			hasApiKey,
			provider,
			saveApiKey,
			setApiUrl,
			setCustomProtocol,
			setEnabled,
			setModel,
			setProvider,
			setUseSsl,
		]
	);
}
