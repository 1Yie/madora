import {
	getProviderDefinition,
	getProviderDefinitions,
} from './provider-definitions';
import {
	buildPromptContext,
	promptProfileForAnthropicCompatible,
	promptProfileForGoogleCompatible,
	promptProfileForOpenAiCompatible,
	renderPrompt,
} from './prompts';
import type {
	AiCompletionConfig,
	AiCompletionRequest,
	AiProvider,
} from './types';

const COMPLETION_CACHE_MAX_ENTRIES = 128;
const COMPLETION_CACHE_TTL_MS = 15_000;
const MAX_CACHE_PREFIX_CHARS = 1_000;
const MAX_COMPLETION_TOKENS = 512;
const STOP_SEQUENCES = ['\n\n\n', '\n# ', '\n## '];
const DEEPSEEK_NO_SUFFIX_STOP_SEQUENCES = [
	'\n\n',
	'\n',
	'。',
	'.',
	'！',
	'?',
	'!',
];
const ANTHROPIC_API_VERSION = '2023-06-01';

type CompletionCacheEntry = {
	expiresAt: number;
	lastAccessedAt: number;
	text: string;
};

type SseEvent = {
	data: string;
	event: string | null;
};

const completionCache = new Map<string, CompletionCacheEntry>();
const completionInFlight = new Map<string, Promise<string>>();

export async function generateCompletion(opts: {
	config: AiCompletionConfig;
	request: AiCompletionRequest;
}): Promise<string> {
	let completion = '';
	await streamCompletion({
		...opts,
		onChunk: (chunk) => {
			completion += chunk;
		},
	});
	return completion;
}

export async function streamCompletion(opts: {
	config: AiCompletionConfig;
	request: AiCompletionRequest;
	onChunk: (chunk: string) => void;
}): Promise<void> {
	const cacheKey = buildCompletionCacheKey(opts.config, opts.request);
	const cached = getCachedCompletion(cacheKey);

	if (cached !== null) {
		opts.onChunk(cached);
		return;
	}

	const existing = completionInFlight.get(cacheKey);
	if (existing) {
		const text = await existing;
		opts.onChunk(text);
		return;
	}

	const request = requestCompletionByProvider(
		opts.config,
		opts.request,
		opts.onChunk
	);
	completionInFlight.set(cacheKey, request);

	try {
		const text = await request;
		cacheCompletion(cacheKey, text);
	} finally {
		completionInFlight.delete(cacheKey);
	}
}

async function requestCompletionByProvider(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	switch (config.provider) {
		case 'deepseek':
			return requestDeepSeekFim(config, request, onChunk);
		case 'anthropic':
		case 'minimax':
		case 'minimax-coding':
			return requestAnthropicCompatibleFim(config, request, onChunk);
		case 'google':
			return requestGoogleCompatibleFim(config, request, onChunk);
		case 'custom':
			return requestCustomFim(config, request, onChunk);
		case 'opencode-go':
			return requestOpenCodeGoFim(config, request, onChunk);
		case 'opencode-zen':
			return requestOpenCodeZenFim(config, request, onChunk);
		case 'kimi':
		case 'mimo':
		case 'mimo-coding':
		case 'openai':
		case 'zhipu':
		case 'zhipu-coding':
			return requestOpenAiCompatibleFim(config, request, onChunk);
	}
}

async function requestCustomFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	switch (config.customProtocol ?? 'openai') {
		case 'anthropic':
			return requestAnthropicCompatibleFim(config, request, onChunk);
		case 'google':
			return requestGoogleCompatibleFim(config, request, onChunk);
		case 'openai':
			return requestOpenAiCompatibleFim(config, request, onChunk);
	}
}

async function requestOpenCodeGoFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	const model = resolveModel(config);
	const lowerModel = model.toLowerCase();
	if (
		lowerModel.startsWith('glm-') ||
		lowerModel.startsWith('kimi-') ||
		lowerModel.startsWith('deepseek-') ||
		lowerModel.startsWith('mimo-')
	) {
		return requestOpenAiCompatibleFim(config, request, onChunk);
	}

	if (lowerModel.startsWith('minimax-') || lowerModel.startsWith('qwen')) {
		return requestAnthropicCompatibleFim(config, request, onChunk);
	}

	throw new Error(
		`OpenCode Go model '${model}' is not currently supported in Madora.`
	);
}

async function requestOpenCodeZenFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	const model = resolveModel(config);
	const lowerModel = model.toLowerCase();

	if (lowerModel.startsWith('gpt-')) {
		return requestOpenAiResponsesFim(config, request, onChunk);
	}

	if (lowerModel.startsWith('claude-') || lowerModel.startsWith('qwen')) {
		return requestAnthropicCompatibleFim(config, request, onChunk);
	}

	if (lowerModel.startsWith('gemini-')) {
		return requestGoogleCompatibleFim(config, request, onChunk);
	}

	if (
		lowerModel.startsWith('deepseek-') ||
		lowerModel.startsWith('minimax-') ||
		lowerModel.startsWith('glm-') ||
		lowerModel.startsWith('kimi-') ||
		lowerModel.startsWith('grok-') ||
		lowerModel === 'big-pickle' ||
		lowerModel.startsWith('mimo-') ||
		lowerModel.startsWith('north-mini-code-') ||
		lowerModel.startsWith('nemotron-')
	) {
		return requestOpenAiCompatibleFim(config, request, onChunk);
	}

	throw new Error(
		`OpenCode Zen model '${model}' could not be routed to an API endpoint.`
	);
}

async function requestDeepSeekFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	const apiKey = resolveApiKey(config);
	const apiUrl = resolveDeepSeekBetaApiUrl(config);
	const model = resolveModel(config);
	const hasSuffix = hasMeaningfulSuffix(request);
	const maxTokens = hasSuffix ? MAX_COMPLETION_TOKENS : 64;
	const stop = hasSuffix ? STOP_SEQUENCES : DEEPSEEK_NO_SUFFIX_STOP_SEQUENCES;
	const temperature = hasSuffix ? 0.3 : 0.2;

	const response = await postJson(joinUrl(apiUrl, '/completions'), {
		apiKey,
		body: {
			model,
			prompt: request.prefix,
			suffix: request.suffix,
			max_tokens: maxTokens,
			temperature,
			frequency_penalty: 0.3,
			presence_penalty: 0.1,
			stop,
			thinking: { type: 'disabled' },
			stream: true,
		},
		provider: 'DeepSeek',
		stream: true,
	});

	let completion = '';
	await streamSseResponse(response, (event) => {
		if (event.data === '[DONE]') return;
		const payload = parseJson<TextCompletionResponse>(event.data, 'DeepSeek');
		const chunk = takeTextCompletion(payload);
		if (chunk.length === 0) return;
		completion += chunk;
		onChunk(chunk);
	});
	return completion;
}

async function requestOpenAiCompatibleFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	const provider = config.provider;
	const apiKey = resolveApiKey(config);
	const apiUrl = resolveApiUrl(config);
	const model = resolveModel(config);
	const promptContext = buildPromptContext(request);
	const promptProfile = promptProfileForOpenAiCompatible(provider, model);
	const systemPrompt = renderPrompt(promptProfile, 'fim_system', promptContext);
	const userPrompt = renderPrompt(promptProfile, 'fim_user', promptContext);
	const hasSuffix = hasMeaningfulSuffix(request);
	const maxTokens = hasSuffix ? MAX_COMPLETION_TOKENS : 64;
	const temperature = hasSuffix ? 0.3 : 0.2;

	const response = await postJson(joinUrl(apiUrl, '/v1/chat/completions'), {
		apiKey,
		body: buildOpenAiCompatiblePayload(
			provider,
			model,
			systemPrompt,
			userPrompt,
			maxTokens,
			temperature,
			true
		),
		provider: displayProviderName(provider),
		stream: true,
	});

	let completion = '';
	await streamSseResponse(response, (event) => {
		if (event.data === '[DONE]') return;
		const payload = parseJson<StreamingChatCompletionResponse>(
			event.data,
			displayProviderName(provider)
		);
		const chunk = takeStreamChatCompletion(payload);
		if (chunk.length === 0) return;
		completion += chunk;
		onChunk(chunk);
	});
	return completion;
}

async function requestAnthropicCompatibleFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	const provider = config.provider;
	const apiKey = resolveApiKey(config);
	const apiUrl = resolveApiUrl(config);
	const model = resolveModel(config);
	const promptContext = buildPromptContext(request);
	const promptProfile = promptProfileForAnthropicCompatible(provider, model);
	const systemPrompt = renderPrompt(promptProfile, 'fim_system', promptContext);
	const userPrompt = renderPrompt(promptProfile, 'fim_user', promptContext);
	const hasSuffix = hasMeaningfulSuffix(request);
	const maxTokens = hasSuffix ? MAX_COMPLETION_TOKENS : 64;
	const temperature = hasSuffix ? 0.3 : 0.2;

	const headers: Record<string, string> =
		provider === 'minimax' || provider === 'minimax-coding'
			? { Authorization: `Bearer ${apiKey}` }
			: { 'x-api-key': apiKey };

	const response = await postJson(joinUrl(apiUrl, '/v1/messages'), {
		body: buildAnthropicCompatiblePayload(
			provider,
			model,
			systemPrompt,
			userPrompt,
			maxTokens,
			temperature,
			true
		),
		headers: {
			...headers,
			'anthropic-version': ANTHROPIC_API_VERSION,
		},
		provider: displayProviderName(provider),
		stream: true,
	});

	let completion = '';
	await streamSseResponse(response, (event) => {
		const payload = parseJson<AnthropicMessageStreamResponse>(
			event.data,
			displayProviderName(provider)
		);
		const chunk = payload.delta?.text ?? payload.content_block?.text ?? '';
		if (chunk.length === 0) return;
		completion += chunk;
		onChunk(chunk);
	});
	return completion;
}

async function requestGoogleCompatibleFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	const provider = config.provider;
	const apiKey = resolveApiKey(config);
	const apiUrl = resolveApiUrl(config);
	const model = resolveModel(config);
	const promptContext = buildPromptContext(request);
	const promptProfile = promptProfileForGoogleCompatible(provider, model);
	const systemPrompt = renderPrompt(promptProfile, 'fim_system', promptContext);
	const userPrompt = renderPrompt(promptProfile, 'fim_user', promptContext);
	const hasSuffix = hasMeaningfulSuffix(request);
	const maxTokens = hasSuffix ? MAX_COMPLETION_TOKENS : 64;
	const temperature = hasSuffix ? 0.3 : 0.2;

	const response = await postJson(
		googleGenerateContentUrl(apiUrl, model, true),
		{
			body: buildGooglePayload(
				model,
				systemPrompt,
				userPrompt,
				maxTokens,
				temperature
			),
			headers: { 'x-goog-api-key': apiKey },
			provider: displayProviderName(provider),
			stream: true,
		}
	);

	let completion = '';
	await streamSseResponse(response, (event) => {
		if (event.data.trim().length === 0) return;
		const payload = parseJson<GoogleGenerateContentResponse>(
			event.data,
			displayProviderName(provider)
		);
		const chunk = takeGoogleText(payload);
		if (chunk.length === 0) return;
		completion += chunk;
		onChunk(chunk);
	});
	return completion;
}

async function requestOpenAiResponsesFim(
	config: AiCompletionConfig,
	request: AiCompletionRequest,
	onChunk: (chunk: string) => void
) {
	const provider = config.provider;
	const apiKey = resolveApiKey(config);
	const apiUrl = resolveApiUrl(config);
	const model = resolveModel(config);
	const promptContext = buildPromptContext(request);
	const promptProfile = promptProfileForOpenAiCompatible(provider, model);
	const systemPrompt = renderPrompt(promptProfile, 'fim_system', promptContext);
	const userPrompt = renderPrompt(promptProfile, 'fim_user', promptContext);
	const hasSuffix = hasMeaningfulSuffix(request);
	const maxTokens = hasSuffix ? MAX_COMPLETION_TOKENS : 64;
	const temperature = hasSuffix ? 0.3 : 0.2;

	const response = await postJson(joinUrl(apiUrl, '/v1/responses'), {
		apiKey,
		body: {
			model,
			input: userPrompt,
			instructions: systemPrompt,
			max_output_tokens: maxTokens,
			temperature,
			stream: true,
		},
		provider: displayProviderName(provider),
		stream: true,
	});

	let completion = '';
	await streamSseResponse(response, (event) => {
		if (event.data === '[DONE]' || event.data.trim().length === 0) return;
		const payload = parseJson<ResponsesApiStreamEvent>(
			event.data,
			displayProviderName(provider)
		);
		const chunk = takeResponsesStreamText(payload, completion.length === 0);
		if (chunk.length === 0) return;
		completion += chunk;
		onChunk(chunk);
	});
	return completion;
}

async function postJson(
	url: string,
	opts: {
		apiKey?: string;
		body: unknown;
		headers?: Record<string, string>;
		provider: string;
		stream: boolean;
	}
) {
	const response = await fetch(url, {
		body: JSON.stringify(opts.body),
		headers: {
			Accept: opts.stream ? 'text/event-stream' : 'application/json',
			'Content-Type': 'application/json',
			...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
			...opts.headers,
		},
		method: 'POST',
	}).catch((error: unknown) => {
		throw new Error(
			`${opts.provider} request failed: ${getErrorMessage(error)}`
		);
	});

	if (!response.ok) {
		const body = await response
			.text()
			.catch(() => 'Failed to read error details');
		throw new Error(
			`${opts.provider} API error (HTTP ${response.status}): ${body}`
		);
	}

	return response;
}

function buildOpenAiCompatiblePayload(
	provider: AiProvider,
	model: string,
	systemPrompt: string,
	userPrompt: string,
	maxTokens: number,
	temperature: number,
	stream: boolean
) {
	const payload: Record<string, unknown> = {
		model,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		max_tokens: maxTokens,
		temperature,
		stop: STOP_SEQUENCES,
	};

	if (stream) payload.stream = true;

	const lowerModel = model.toLowerCase();
	if (lowerModel.startsWith('qwen')) {
		payload.enable_thinking = false;
	} else if (shouldDisableStructuredThinking(provider, lowerModel)) {
		payload.thinking = { type: 'disabled' };
	}

	return payload;
}

function buildAnthropicCompatiblePayload(
	provider: AiProvider,
	model: string,
	systemPrompt: string,
	userPrompt: string,
	maxTokens: number,
	temperature: number,
	stream: boolean
) {
	const payload: Record<string, unknown> = {
		model,
		system: systemPrompt,
		messages: [{ role: 'user', content: userPrompt }],
		max_tokens: maxTokens,
		temperature,
		stop_sequences: STOP_SEQUENCES,
	};

	if (stream) payload.stream = true;

	if (provider !== 'anthropic' && model.toLowerCase().startsWith('qwen')) {
		payload.thinking = { type: 'disabled' };
	}

	return payload;
}

function buildGooglePayload(
	model: string,
	systemPrompt: string,
	userPrompt: string,
	maxTokens: number,
	temperature: number
) {
	const generationConfig: Record<string, unknown> = {
		maxOutputTokens: maxTokens,
		responseMimeType: 'text/plain',
		stopSequences: STOP_SEQUENCES,
		temperature,
	};
	const thinkingConfig = googleThinkingConfig(model.toLowerCase());
	if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

	return {
		contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
		generationConfig,
		store: false,
		systemInstruction: { parts: [{ text: systemPrompt }] },
	};
}

function googleGenerateContentUrl(
	apiUrl: string,
	model: string,
	stream: boolean
) {
	const suffix = stream ? ':streamGenerateContent?alt=sse' : ':generateContent';
	return joinUrl(apiUrl, `/v1/models/${model}${suffix}`);
}

function googleThinkingConfig(lowerModel: string) {
	if (lowerModel.startsWith('gemini-3.1-pro')) return { thinkingLevel: 'low' };
	if (lowerModel.startsWith('gemini-3')) return { thinkingLevel: 'minimal' };
	if (lowerModel.startsWith('gemini-2.5-pro')) return { thinkingBudget: 128 };
	if (lowerModel.startsWith('gemini-2.5-')) return { thinkingBudget: 0 };
	return null;
}

function shouldDisableStructuredThinking(
	provider: AiProvider,
	lowerModel: string
) {
	return (
		provider === 'deepseek' ||
		provider === 'kimi' ||
		provider === 'zhipu' ||
		provider === 'zhipu-coding' ||
		lowerModel.startsWith('deepseek-') ||
		lowerModel.startsWith('glm-') ||
		lowerModel.startsWith('kimi-')
	);
}

async function streamSseResponse(
	response: Response,
	onEvent: (event: SseEvent) => void
) {
	const body = response.body as
		| {
				getReader?: () => {
					read: () => Promise<{ done: boolean; value?: Uint8Array }>;
				};
		  }
		| null
		| undefined;
	const reader = body?.getReader?.();

	if (!reader || typeof TextDecoder === 'undefined') {
		parseSseText(await response.text(), onEvent);
		return;
	}

	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		buffer += decoder.decode(value, { stream: true });
		buffer = drainSseBuffer(buffer, onEvent);
	}

	buffer += decoder.decode();
	if (buffer.trim().length > 0) {
		const event = parseSseEvent(buffer);
		if (event) onEvent(event);
	}
}

function parseSseText(text: string, onEvent: (event: SseEvent) => void) {
	let buffer = text;
	buffer = drainSseBuffer(buffer, onEvent);
	if (buffer.trim().length > 0) {
		const event = parseSseEvent(buffer);
		if (event) onEvent(event);
	}
}

function drainSseBuffer(buffer: string, onEvent: (event: SseEvent) => void) {
	let nextBuffer = buffer;

	while (true) {
		const next = takeNextSseBlock(nextBuffer);
		if (!next) return nextBuffer;
		nextBuffer = next.rest;
		const event = parseSseEvent(next.rawEvent);
		if (event) onEvent(event);
	}
}

function takeNextSseBlock(buffer: string) {
	const separators = ['\r\n\r\n', '\n\n', '\r\r'];
	const next = separators
		.map((separator) => ({ index: buffer.indexOf(separator), separator }))
		.filter((candidate) => candidate.index >= 0)
		.sort((a, b) => a.index - b.index)[0];

	if (!next) return null;

	return {
		rawEvent: buffer.slice(0, next.index),
		rest: buffer.slice(next.index + next.separator.length),
	};
}

function parseSseEvent(rawEvent: string): SseEvent | null {
	const dataLines: string[] = [];
	let event: string | null = null;

	for (const line of rawEvent.split(/\r?\n/)) {
		if (line.startsWith(':')) continue;
		if (line.startsWith('event:')) {
			event = line.slice('event:'.length).trim();
			continue;
		}
		if (line.startsWith('data:')) {
			dataLines.push(line.slice('data:'.length).trimStart());
		}
	}

	if (dataLines.length === 0 && event === null) return null;
	return { data: dataLines.join('\n'), event };
}

function resolveApiKey(config: AiCompletionConfig) {
	const apiKey = config.apiKey.trim();
	if (apiKey.length === 0) throw new Error('Please save the API key first.');
	return apiKey;
}

function resolveApiUrl(config: AiCompletionConfig) {
	const defaultUrl = getProviderDefinition(config.provider).defaultApiUrl;
	const value = (config.apiUrl ?? '').trim() || defaultUrl;
	if (value.length === 0) throw new Error('Please enter the API URL first.');
	const trimmed = value.replace(/\/+$/, '');
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://'))
		return trimmed;
	return `${config.useSsl ? 'https' : 'http'}://${trimmed}`;
}

function resolveDeepSeekBetaApiUrl(config: AiCompletionConfig) {
	const apiUrl = resolveApiUrl(config);
	return apiUrl.endsWith('/beta') ? apiUrl : `${apiUrl}/beta`;
}

function resolveModel(config: AiCompletionConfig) {
	const defaultModel = getProviderDefinition(config.provider).defaultModel;
	const model = (config.model ?? '').trim() || defaultModel;
	if (model.length === 0) throw new Error('Please enter the model first.');
	return model;
}

function joinUrl(baseUrl: string, path: string) {
	return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function hasMeaningfulSuffix(request: AiCompletionRequest) {
	return (request.suffix ?? '').trim().length > 0;
}

function takeTextCompletion(payload: TextCompletionResponse) {
	return payload.choices?.[0]?.text ?? '';
}

function takeStreamChatCompletion(payload: StreamingChatCompletionResponse) {
	const choice = payload.choices?.[0];
	return (
		choice?.delta?.content ?? choice?.text ?? choice?.message?.content ?? ''
	);
}

function takeGoogleText(payload: GoogleGenerateContentResponse) {
	return (
		payload.candidates?.[0]?.content?.parts
			?.filter((part) => part.thought !== true)
			.map((part) => part.text ?? '')
			.join('') ?? ''
	);
}

function takeResponsesOutputText(payload: ResponsesApiResponse) {
	if (payload.output_text) return payload.output_text;

	return (
		payload.output
			?.filter((item) => item.type === 'message')
			.flatMap((item) => item.content ?? [])
			.filter((content) => content.type === 'output_text')
			.map((content) => content.text ?? '')
			.join('') ?? ''
	);
}

function takeResponsesStreamText(
	payload: ResponsesApiStreamEvent,
	allowCompletionFallback: boolean
) {
	if (payload.type === 'response.output_text.delta')
		return payload.delta ?? payload.text ?? '';
	if (payload.type === 'response.completed' && allowCompletionFallback) {
		return payload.response ? takeResponsesOutputText(payload.response) : '';
	}
	return '';
}

function parseJson<T>(value: string, provider: string): T {
	try {
		return JSON.parse(value) as T;
	} catch (error) {
		throw new Error(
			`${provider} streaming response parse failed: ${getErrorMessage(error)}`
		);
	}
}

function buildCompletionCacheKey(
	config: AiCompletionConfig,
	request: AiCompletionRequest
) {
	const provider = config.provider;
	const key = {
		apiUrl: resolveCacheApiUrl(config),
		customProtocol:
			provider === 'custom' ? (config.customProtocol ?? 'openai') : null,
		model: resolveCacheModel(config),
		prefix: takeLastChars(request.prefix, MAX_CACHE_PREFIX_CHARS),
		provider,
		suffix: request.suffix
			? takeLastChars(request.suffix, MAX_CACHE_PREFIX_CHARS)
			: null,
	};

	return JSON.stringify(key);
}

function resolveCacheApiUrl(config: AiCompletionConfig) {
	const apiUrl = resolveApiUrl(config);
	if (config.provider === 'deepseek' && !apiUrl.endsWith('/beta'))
		return `${apiUrl}/beta`;
	return apiUrl;
}

function resolveCacheModel(config: AiCompletionConfig) {
	return (
		(config.model ?? '').trim() ||
		getProviderDefinition(config.provider).defaultModel
	);
}

function getCachedCompletion(key: string) {
	cleanupCompletionCache();
	const entry = completionCache.get(key);
	if (!entry) return null;
	entry.lastAccessedAt = Date.now();
	return entry.text;
}

function cacheCompletion(key: string, text: string) {
	cleanupCompletionCache();
	const now = Date.now();
	completionCache.set(key, {
		expiresAt: now + COMPLETION_CACHE_TTL_MS,
		lastAccessedAt: now,
		text,
	});
	cleanupCompletionCache();
}

function cleanupCompletionCache() {
	const now = Date.now();

	for (const [key, entry] of completionCache.entries()) {
		if (entry.expiresAt <= now) completionCache.delete(key);
	}

	if (completionCache.size <= COMPLETION_CACHE_MAX_ENTRIES) return;

	const entries = [...completionCache.entries()].sort(
		(a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
	);
	const removeCount = completionCache.size - COMPLETION_CACHE_MAX_ENTRIES;
	for (const [key] of entries.slice(0, removeCount)) {
		completionCache.delete(key);
	}
}

function takeLastChars(value: string, maxChars: number) {
	const chars = Array.from(value);
	return chars.length <= maxChars ? value : chars.slice(-maxChars).join('');
}

function displayProviderName(provider: AiProvider) {
	return (
		getProviderDefinitions().find((item) => item.key === provider)?.label ??
		provider
	);
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

type TextCompletionResponse = {
	choices?: { text?: string }[];
};

type StreamingChatCompletionResponse = {
	choices?: {
		delta?: { content?: string };
		message?: { content?: string };
		text?: string;
	}[];
};

type AnthropicMessageStreamResponse = {
	content_block?: { text?: string };
	delta?: { text?: string };
};

type GoogleGenerateContentResponse = {
	candidates?: {
		content?: {
			parts?: {
				text?: string;
				thought?: boolean;
			}[];
		};
	}[];
};

type ResponsesApiResponse = {
	output?: {
		content?: {
			text?: string;
			type?: string;
		}[];
		type?: string;
	}[];
	output_text?: string;
};

type ResponsesApiStreamEvent = {
	delta?: string;
	response?: ResponsesApiResponse;
	text?: string;
	type?: string;
};
