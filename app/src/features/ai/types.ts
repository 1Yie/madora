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

export type ProviderConfig = {
	apiUrl: string;
	customProtocol: CustomProviderProtocol;
	model: string;
	useSsl: boolean;
};

export type ProviderDefinition = {
	defaultApiUrl: string;
	defaultModel: string;
	key: AiProvider;
	label: string;
};

export type AiCompletionConfig = {
	apiKey: string;
	apiUrl: string | null;
	customProtocol: CustomProviderProtocol | null;
	model: string | null;
	provider: AiProvider;
	useSsl: boolean;
};

export type AiCompletionRequest = {
	prefix: string;
	suffix: string | null;
	title: string | null;
};
