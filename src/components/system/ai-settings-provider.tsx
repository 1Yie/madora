import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';
import { deleteAiApiKey, hasAiApiKey, storeAiApiKey } from '@/invoke/ai';

import { showErrorToast } from '@/components/ui/toast';

export type SaveMode = 'auto' | 'manual';
export type AiProvider =
	| 'anthropic'
	| 'custom'
	| 'deepseek'
	| 'kimi'
	| 'minimax'
	| 'mimo'
	| 'mimo-coding'
	| 'openai';

export type CustomProviderProtocol = 'anthropic' | 'openai';

type ProviderConfig = {
	apiUrl: string;
	customProtocol: CustomProviderProtocol;
	model: string;
	useSsl: boolean;
};

type ProviderApiKeyAvailability = Record<AiProvider, boolean>;

type AiSettingsContextValue = ProviderConfig & {
	enabled: boolean;
	hasApiKey: boolean;
	provider: AiProvider;
	saveMode: SaveMode;
	showHiddenFiles: boolean;

	deleteApiKey: () => Promise<void>;
	saveApiKey: (apiKey: string) => Promise<void>;
	setApiUrl: (apiUrl: string) => void;
	setCustomProtocol: (protocol: CustomProviderProtocol) => void;
	setEnabled: (enabled: boolean) => void;
	setModel: (model: string) => void;
	setProvider: (provider: AiProvider) => void;
	setSaveMode: (saveMode: SaveMode) => void;
	setShowHiddenFiles: (showHiddenFiles: boolean) => void;
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
		defaultApiUrl: 'https://api.moonshot.cn',
		defaultModel: 'moonshot-v1-8k',
		key: 'kimi',
		label: 'Kimi',
	},
	{
		defaultApiUrl: 'https://api.minimax.io',
		defaultModel: 'MiniMax-M2.7',
		key: 'minimax',
		label: 'MiniMax',
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
const EDITOR_SAVE_MODE_STORAGE_KEY = 'madora-editor-save-mode';
const AI_COMPLETION_USE_SSL_STORAGE_KEY = 'madora-ai-completion-use-ssl';
const EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY =
	'madora-explorer-show-hidden-files';

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

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
	return value === 'anthropic' || value === 'openai';
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
		kimi: initialValue,
		minimax: initialValue,
		mimo: initialValue,
		'mimo-coding': initialValue,
		openai: initialValue,
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

function getInitialEnabled(): boolean {
	const storedValue = getStoredValue(AI_COMPLETION_ENABLED_STORAGE_KEY);

	if (storedValue === null) {
		return true;
	}

	return storedValue === 'true';
}

function getInitialProvider(): AiProvider {
	const storedValue = getStoredValue(AI_COMPLETION_PROVIDER_STORAGE_KEY);

	if (isProvider(storedValue)) {
		return storedValue;
	}

	return DEFAULT_PROVIDER;
}

function getInitialSaveMode(): SaveMode {
	const storedValue = getStoredValue(EDITOR_SAVE_MODE_STORAGE_KEY);

	return storedValue === 'manual' ? 'manual' : 'auto';
}

function getInitialShowHiddenFiles(): boolean {
	const storedValue = getStoredValue(EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY);

	if (storedValue === null) {
		return false;
	}

	return storedValue === 'true';
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
		kimi: readProviderConfig('kimi'),
		minimax: readProviderConfig('minimax'),
		mimo: readProviderConfig('mimo'),
		'mimo-coding': readProviderConfig('mimo-coding'),
		openai: readProviderConfig('openai'),
	};
}

function migrateLegacyDeepSeekSettings() {
	if (typeof window === 'undefined') {
		return;
	}

	const legacyApiKey = getStoredValue(AI_COMPLETION_API_KEY_STORAGE_KEY);
	const legacyApiUrl = getStoredValue(AI_COMPLETION_API_URL_STORAGE_KEY);
	const legacyModel = getStoredValue(AI_COMPLETION_MODEL_STORAGE_KEY);

	if (legacyApiKey !== null) {
		setStoredValue(
			getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, 'deepseek'),
			legacyApiKey
		);
		removeStoredValue(AI_COMPLETION_API_KEY_STORAGE_KEY);
	}

	if (legacyApiUrl !== null) {
		setStoredValue(
			getProviderStorageKey(AI_COMPLETION_API_URL_STORAGE_KEY, 'deepseek'),
			legacyApiUrl
		);
		removeStoredValue(AI_COMPLETION_API_URL_STORAGE_KEY);
	}

	if (legacyModel !== null) {
		setStoredValue(
			getProviderStorageKey(AI_COMPLETION_MODEL_STORAGE_KEY, 'deepseek'),
			legacyModel
		);
		removeStoredValue(AI_COMPLETION_MODEL_STORAGE_KEY);
	}
}

async function loadSecureApiKey(provider: AiProvider) {
	return hasAiApiKey({ provider });
}

async function storeSecureApiKey(provider: AiProvider, apiKey: string) {
	await storeAiApiKey({ apiKey, provider });
}

async function deleteSecureApiKey(provider: AiProvider) {
	await deleteAiApiKey({ provider });
}

async function syncProviderApiKey(provider: AiProvider, apiKey: string) {
	if (apiKey.trim().length === 0) {
		await deleteSecureApiKey(provider);
		return;
	}

	await storeSecureApiKey(provider, apiKey);
}

async function loadProviderApiKeys() {
	const apiKeyAvailability = createProviderApiKeyAvailability();
	const errors: string[] = [];

	for (const provider of getProviderKeys()) {
		const storageKey = getProviderStorageKey(
			AI_COMPLETION_API_KEY_STORAGE_KEY,
			provider
		);
		const legacyApiKey = getStoredValue(storageKey);

		try {
			const hasSecureApiKey = await loadSecureApiKey(provider);

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

			await syncProviderApiKey(provider, legacyApiKey);
			removeStoredValue(storageKey);
			apiKeyAvailability[provider] = true;
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}

	return { apiKeyAvailability, errors };
}

export function AiSettingsProvider({ children }: { children: ReactNode }) {
	const [enabled, setEnabled] = useState<boolean>(getInitialEnabled);
	const [provider, setProvider] = useState<AiProvider>(getInitialProvider);
	const [providerConfigs, setProviderConfigs] = useState<
		Record<AiProvider, ProviderConfig>
	>(readInitialProviderConfigs);
	const [providerApiKeyAvailability, setProviderApiKeyAvailability] =
		useState<ProviderApiKeyAvailability>(createProviderApiKeyAvailability);
	const [saveMode, setSaveMode] = useState<SaveMode>(getInitialSaveMode);
	const [showHiddenFiles, setShowHiddenFiles] = useState<boolean>(
		getInitialShowHiddenFiles
	);

	useEffect(() => {
		let cancelled = false;

		const initializeProviderConfigs = async () => {
			migrateLegacyDeepSeekSettings();
			const initialConfigs = readInitialProviderConfigs();
			if (!cancelled) {
				setProviderConfigs(initialConfigs);
			}

			const { apiKeyAvailability, errors } = await loadProviderApiKeys();
			if (cancelled) return;

			setProviderApiKeyAvailability(apiKeyAvailability);

			if (errors.length > 0) {
				const uniqueErrors = [...new Set(errors)];
				showErrorToast('无法访问系统密钥存储', uniqueErrors.join('\n'));
			}
		};

		void initializeProviderConfigs();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		window.localStorage.setItem(
			AI_COMPLETION_ENABLED_STORAGE_KEY,
			String(enabled)
		);
	}, [enabled]);

	useEffect(() => {
		window.localStorage.setItem(AI_COMPLETION_PROVIDER_STORAGE_KEY, provider);
	}, [provider]);

	useEffect(() => {
		for (const providerKey of Object.keys(providerConfigs) as AiProvider[]) {
			const config = providerConfigs[providerKey];
			window.localStorage.setItem(
				getProviderStorageKey(AI_COMPLETION_API_URL_STORAGE_KEY, providerKey),
				config.apiUrl
			);
			window.localStorage.setItem(
				getProviderStorageKey(
					AI_COMPLETION_CUSTOM_PROTOCOL_STORAGE_KEY,
					providerKey
				),
				config.customProtocol
			);
			window.localStorage.setItem(
				getProviderStorageKey(AI_COMPLETION_MODEL_STORAGE_KEY, providerKey),
				config.model
			);
			window.localStorage.setItem(
				getProviderStorageKey(AI_COMPLETION_USE_SSL_STORAGE_KEY, providerKey),
				String(config.useSsl)
			);
		}
	}, [providerConfigs]);

	useEffect(() => {
		window.localStorage.setItem(EDITOR_SAVE_MODE_STORAGE_KEY, saveMode);
	}, [saveMode]);

	useEffect(() => {
		window.localStorage.setItem(
			EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY,
			String(showHiddenFiles)
		);
	}, [showHiddenFiles]);

	const currentConfig = providerConfigs[provider];
	const hasApiKey = providerApiKeyAvailability[provider];

	const value = useMemo<AiSettingsContextValue>(
		() => ({
			apiUrl: currentConfig.apiUrl,
			customProtocol: currentConfig.customProtocol,
			deleteApiKey: async () => {
				await deleteSecureApiKey(provider);
				setProviderApiKeyAvailability((prev) => ({
					...prev,
					[provider]: false,
				}));
				removeStoredValue(
					getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, provider)
				);
			},
			enabled,
			hasApiKey,
			model: currentConfig.model,
			provider,
			saveApiKey: async (apiKey) => {
				const trimmedApiKey = apiKey.trim();

				if (trimmedApiKey.length === 0) {
					throw new Error('请先填写 API Key');
				}

				await storeSecureApiKey(provider, trimmedApiKey);
				setProviderApiKeyAvailability((prev) => ({
					...prev,
					[provider]: true,
				}));
				removeStoredValue(
					getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, provider)
				);
			},
			saveMode,
			showHiddenFiles,
			useSsl: currentConfig.useSsl,

			setApiUrl: (apiUrl) => {
				setProviderConfigs((prev) => ({
					...prev,
					[provider]: { ...prev[provider], apiUrl },
				}));
			},
			setCustomProtocol: (customProtocol) => {
				setProviderConfigs((prev) => ({
					...prev,
					[provider]: { ...prev[provider], customProtocol },
				}));
			},
			setEnabled,
			setModel: (model) => {
				setProviderConfigs((prev) => ({
					...prev,
					[provider]: { ...prev[provider], model },
				}));
			},
			setProvider,
			setSaveMode,
			setShowHiddenFiles,
			setUseSsl: (useSsl) => {
				setProviderConfigs((prev) => ({
					...prev,
					[provider]: { ...prev[provider], useSsl },
				}));
			},
		}),
		[
			currentConfig.apiUrl,
			currentConfig.customProtocol,
			currentConfig.model,
			currentConfig.useSsl,
			hasApiKey,
			enabled,
			provider,
			saveMode,
			showHiddenFiles,
		]
	);

	return (
		<AiSettingsContext.Provider value={value}>
			{children}
		</AiSettingsContext.Provider>
	);
}

export function useAiSettings() {
	const context = useContext(AiSettingsContext);

	if (!context) {
		throw new Error('useAiSettings must be used within AiSettingsProvider');
	}

	return context;
}
