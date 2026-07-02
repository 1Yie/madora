import type {
	AiProvider,
	CustomProviderProtocol,
	ProviderConfig,
	ProviderDefinition,
} from '../types';

export const DEFAULT_PROVIDER: AiProvider = 'deepseek';

export const PROVIDERS: ProviderDefinition[] = [
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

export function getProviderDefinitions() {
	return PROVIDERS;
}

export function getProviderKeys(): AiProvider[] {
	return PROVIDERS.map((provider) => provider.key);
}

export function isProvider(value: string | null): value is AiProvider {
	return PROVIDERS.some((provider) => provider.key === value);
}

export function isCustomProviderProtocol(
	value: string | null
): value is CustomProviderProtocol {
	return value === 'anthropic' || value === 'google' || value === 'openai';
}

export function getProviderDefinition(
	provider: AiProvider
): ProviderDefinition {
	return PROVIDERS.find((item) => item.key === provider) ?? PROVIDERS[0];
}

export function getDefaultProviderConfig(provider: AiProvider): ProviderConfig {
	const definition = getProviderDefinition(provider);

	return {
		apiUrl: definition.defaultApiUrl,
		customProtocol: provider === 'anthropic' ? 'anthropic' : 'openai',
		model: definition.defaultModel,
		useSsl: true,
	};
}

export function createProviderConfigMap(): Record<AiProvider, ProviderConfig> {
	return Object.fromEntries(
		PROVIDERS.map((provider) => [
			provider.key,
			getDefaultProviderConfig(provider.key),
		])
	) as Record<AiProvider, ProviderConfig>;
}
