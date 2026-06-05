import { Channel, invoke } from '@tauri-apps/api/core';

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

/** Configuration for an AI completion request. */
export type AiCompletionConfig = {
	apiUrl: string | null;
	customProtocol: CustomProviderProtocol | null;
	model: string | null;
	provider: string;
	useSsl: boolean;
};

/** The FIM prefix/suffix payload for completion. */
export type AiCompletionRequest = {
	prefix: string;
	suffix: string | null;
	title: string | null;
};

/** Checks whether an API key is stored in the OS keyring. */
export async function hasAiApiKey(opts: {
	provider: AiProvider;
}): Promise<boolean> {
	return invoke<boolean>('has_ai_api_key', { provider: opts.provider });
}

/** Stores an API key in the OS keyring. */
export async function storeAiApiKey(opts: {
	apiKey: string;
	provider: AiProvider;
}): Promise<void> {
	return invoke('store_ai_api_key', {
		apiKey: opts.apiKey,
		provider: opts.provider,
	});
}

/** Removes an API key from the OS keyring. */
export async function deleteAiApiKey(opts: {
	provider: AiProvider;
}): Promise<void> {
	return invoke('delete_ai_api_key', { provider: opts.provider });
}

/** Streams an AI completion via a Tauri Channel. */
export async function generateCompletionStream(opts: {
	config: AiCompletionConfig;
	request: AiCompletionRequest;
	channel: Channel<string>;
}): Promise<void> {
	return invoke('generate_completion_stream', {
		config: opts.config,
		request: opts.request,
		channel: opts.channel,
	});
}

/** Streams an AI completion via a callback, hiding the Tauri Channel creation. */
export async function streamCompletion(opts: {
	config: AiCompletionConfig;
	request: AiCompletionRequest;
	onChunk: (chunk: string) => void;
}): Promise<void> {
	const channel = new Channel<string>((chunk) => {
		opts.onChunk(chunk);
	});
	return generateCompletionStream({
		config: opts.config,
		request: opts.request,
		channel,
	});
}
