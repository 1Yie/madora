import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import i18n from '@/i18n';
import {
	createProviderConfigMap,
	DEFAULT_PROVIDER,
	getDefaultProviderConfig,
	getProviderKeys,
	isCustomProviderProtocol,
	isProvider,
} from '../lib/provider-definitions';
import type {
	AiCompletionConfig,
	AiProvider,
	CustomProviderProtocol,
	ProviderConfig,
} from '../types';

type ApiKeyAvailability = Record<AiProvider, boolean>;

type AiSettingsContextValue = ProviderConfig & {
	enabled: boolean;
	hasApiKey: boolean;
	provider: AiProvider;
	ready: boolean;
	apiKeyAvailability: ApiKeyAvailability;
	deleteApiKey: () => Promise<void>;
	getCompletionConfig: () => Promise<AiCompletionConfig | null>;
	saveApiKey: (apiKey: string) => Promise<void>;
	setApiUrl: (apiUrl: string) => void;
	setCustomProtocol: (protocol: CustomProviderProtocol) => void;
	setEnabled: (enabled: boolean) => void;
	setModel: (model: string) => void;
	setProvider: (provider: AiProvider) => void;
	setUseSsl: (useSsl: boolean) => void;
};

const SETTINGS_PREFIX = 'madora-ai';
const ENABLED_KEY = `${SETTINGS_PREFIX}.enabled`;
const PROVIDER_KEY = `${SETTINGS_PREFIX}.provider`;
const API_KEY_PREFIX = `${SETTINGS_PREFIX}.apiKey`;
const API_URL_PREFIX = `${SETTINGS_PREFIX}.apiUrl`;
const CUSTOM_PROTOCOL_PREFIX = `${SETTINGS_PREFIX}.customProtocol`;
const MODEL_PREFIX = `${SETTINGS_PREFIX}.model`;
const USE_SSL_PREFIX = `${SETTINGS_PREFIX}.useSsl`;

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

function createApiKeyAvailability(initialValue = false): ApiKeyAvailability {
	return Object.fromEntries(
		getProviderKeys().map((provider) => [provider, initialValue])
	) as ApiKeyAvailability;
}

function keyFor(prefix: string, provider: AiProvider) {
	return `${prefix}.${provider}`;
}

async function getStoredValue(key: string) {
	try {
		return await SecureStore.getItemAsync(key);
	} catch {
		return null;
	}
}

async function setStoredValue(key: string, value: string) {
	try {
		await SecureStore.setItemAsync(key, value);
	} catch {
		// Persisting settings should not make editing unusable.
	}
}

async function deleteStoredValue(key: string) {
	try {
		await SecureStore.deleteItemAsync(key);
	} catch {
		// ignore
	}
}

export function AiSettingsProvider({ children }: { children: ReactNode }) {
	const [ready, setReady] = useState(false);
	const [enabled, setEnabledState] = useState(true);
	const [provider, setProviderState] = useState<AiProvider>(DEFAULT_PROVIDER);
	const [providerConfigs, setProviderConfigs] = useState<
		Record<AiProvider, ProviderConfig>
	>(createProviderConfigMap);
	const [apiKeyAvailability, setApiKeyAvailability] =
		useState<ApiKeyAvailability>(createApiKeyAvailability);

	useEffect(() => {
		let cancelled = false;

		async function hydrate() {
			const secureStoreAvailable = await SecureStore.isAvailableAsync().catch(
				() => false
			);
			if (!secureStoreAvailable || cancelled) {
				setReady(true);
				return;
			}

			const storedEnabled = await getStoredValue(ENABLED_KEY);
			const storedProvider = await getStoredValue(PROVIDER_KEY);
			const nextProvider = isProvider(storedProvider)
				? storedProvider
				: DEFAULT_PROVIDER;
			const nextConfigs = createProviderConfigMap();
			const nextApiKeyAvailability = createApiKeyAvailability();

			for (const providerKey of getProviderKeys()) {
				const defaultConfig = getDefaultProviderConfig(providerKey);
				const [apiUrl, customProtocol, model, useSsl, apiKey] =
					await Promise.all([
						getStoredValue(keyFor(API_URL_PREFIX, providerKey)),
						getStoredValue(keyFor(CUSTOM_PROTOCOL_PREFIX, providerKey)),
						getStoredValue(keyFor(MODEL_PREFIX, providerKey)),
						getStoredValue(keyFor(USE_SSL_PREFIX, providerKey)),
						getStoredValue(keyFor(API_KEY_PREFIX, providerKey)),
					]);

				nextConfigs[providerKey] = {
					apiUrl: apiUrl ?? defaultConfig.apiUrl,
					customProtocol: isCustomProviderProtocol(customProtocol)
						? customProtocol
						: defaultConfig.customProtocol,
					model: model ?? defaultConfig.model,
					useSsl: useSsl === null ? defaultConfig.useSsl : useSsl === 'true',
				};
				nextApiKeyAvailability[providerKey] = Boolean(
					apiKey && apiKey.trim().length > 0
				);
			}

			if (cancelled) return;
			setEnabledState(storedEnabled === null ? true : storedEnabled === 'true');
			setProviderState(nextProvider);
			setProviderConfigs(nextConfigs);
			setApiKeyAvailability(nextApiKeyAvailability);
			setReady(true);
		}

		void hydrate();
		return () => {
			cancelled = true;
		};
	}, []);

	const currentConfig = providerConfigs[provider];
	const hasApiKey = apiKeyAvailability[provider];

	const setEnabled = useCallback((nextEnabled: boolean) => {
		setEnabledState(nextEnabled);
		void setStoredValue(ENABLED_KEY, String(nextEnabled));
	}, []);

	const setProvider = useCallback((nextProvider: AiProvider) => {
		setProviderState(nextProvider);
		void setStoredValue(PROVIDER_KEY, nextProvider);
	}, []);

	const updateCurrentProviderConfig = useCallback(
		(patch: Partial<ProviderConfig>) => {
			setProviderConfigs((current) => ({
				...current,
				[provider]: {
					...current[provider],
					...patch,
				},
			}));
		},
		[provider]
	);

	const setApiUrl = useCallback(
		(apiUrl: string) => {
			updateCurrentProviderConfig({ apiUrl });
			void setStoredValue(keyFor(API_URL_PREFIX, provider), apiUrl);
		},
		[provider, updateCurrentProviderConfig]
	);

	const setCustomProtocol = useCallback(
		(customProtocol: CustomProviderProtocol) => {
			updateCurrentProviderConfig({ customProtocol });
			void setStoredValue(
				keyFor(CUSTOM_PROTOCOL_PREFIX, provider),
				customProtocol
			);
		},
		[provider, updateCurrentProviderConfig]
	);

	const setModel = useCallback(
		(model: string) => {
			updateCurrentProviderConfig({ model });
			void setStoredValue(keyFor(MODEL_PREFIX, provider), model);
		},
		[provider, updateCurrentProviderConfig]
	);

	const setUseSsl = useCallback(
		(useSsl: boolean) => {
			updateCurrentProviderConfig({ useSsl });
			void setStoredValue(keyFor(USE_SSL_PREFIX, provider), String(useSsl));
		},
		[provider, updateCurrentProviderConfig]
	);

	const saveApiKey = useCallback(
		async (apiKey: string) => {
			const trimmedApiKey = apiKey.trim();
			if (trimmedApiKey.length === 0) {
				throw new Error(i18n.t('settings.editor.toasts.apiKeyRequired'));
			}
			await SecureStore.setItemAsync(
				keyFor(API_KEY_PREFIX, provider),
				trimmedApiKey
			);
			setApiKeyAvailability((current) => ({ ...current, [provider]: true }));
		},
		[provider]
	);

	const deleteApiKey = useCallback(async () => {
		await deleteStoredValue(keyFor(API_KEY_PREFIX, provider));
		setApiKeyAvailability((current) => ({ ...current, [provider]: false }));
	}, [provider]);

	const getCompletionConfig =
		useCallback(async (): Promise<AiCompletionConfig | null> => {
			if (!enabled) return null;
			const config = providerConfigs[provider];
			const apiKey = await getStoredValue(keyFor(API_KEY_PREFIX, provider));
			if (!apiKey || apiKey.trim().length === 0) return null;

			return {
				apiKey,
				apiUrl: config.apiUrl.trim().length > 0 ? config.apiUrl : null,
				customProtocol: provider === 'custom' ? config.customProtocol : null,
				model: config.model.trim().length > 0 ? config.model : null,
				provider,
				useSsl: config.useSsl,
			};
		}, [enabled, provider, providerConfigs]);

	const value = useMemo<AiSettingsContextValue>(
		() => ({
			...currentConfig,
			apiKeyAvailability,
			deleteApiKey,
			enabled,
			getCompletionConfig,
			hasApiKey,
			provider,
			ready,
			saveApiKey,
			setApiUrl,
			setCustomProtocol,
			setEnabled,
			setModel,
			setProvider,
			setUseSsl,
		}),
		[
			apiKeyAvailability,
			currentConfig,
			deleteApiKey,
			enabled,
			getCompletionConfig,
			hasApiKey,
			provider,
			ready,
			saveApiKey,
			setApiUrl,
			setCustomProtocol,
			setEnabled,
			setModel,
			setProvider,
			setUseSsl,
		]
	);

	return (
		<AiSettingsContext.Provider value={value}>
			{children}
		</AiSettingsContext.Provider>
	);
}

export function useAiSettings() {
	const value = useContext(AiSettingsContext);
	if (!value) {
		throw new Error('useAiSettings must be used within AiSettingsProvider');
	}
	return value;
}
