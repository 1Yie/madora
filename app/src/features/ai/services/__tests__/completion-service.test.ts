import { describe, expect, test } from 'bun:test';

import { generateCompletion } from '../completion-service';
import type { AiCompletionConfig, AiCompletionRequest } from '../../types';

type FetchCall = {
	init?: RequestInit;
	url: string;
};

type FetchHandler = (
	url: string,
	init: RequestInit | undefined,
	callIndex: number
) => Promise<Response> | Response;

let requestId = 0;

describe('AI completion service', () => {
	test('streams OpenAI-compatible completions and builds chat request', async () => {
		await withMockFetch(
			() =>
				sseResponse([
					jsonData({ choices: [{ delta: { content: ' world' } }] }),
					'[DONE]',
				]),
			async (calls) => {
				const completion = await generateCompletion({
					config: createConfig({
						apiUrl: 'api.example.test/base/',
						provider: 'custom',
					}),
					request: createRequest('openai-compatible'),
				});

				expect(completion).toBe(' world');
				expect(calls.length).toBe(1);
				expect(calls[0].url).toBe(
					'https://api.example.test/base/v1/chat/completions'
				);
				const body = parseBody(calls[0]);
				expect(body.model).toBe('test-model');
				expect(body.stream).toBe(true);
				expect(Array.isArray(body.messages)).toBe(true);
				expect(JSON.stringify(body.messages).includes('Test note')).toBe(true);
			}
		);
	});

	test('streams Google completions and filters thought parts', async () => {
		await withMockFetch(
			() =>
				sseResponse([
					jsonData({
						candidates: [
							{
								content: {
									parts: [
										{ text: 'hidden', thought: true },
										{ text: 'visible' },
									],
								},
							},
						],
					}),
				]),
			async (calls) => {
				const completion = await generateCompletion({
					config: createConfig({
						apiUrl: 'https://google.example.test',
						model: 'gemini-2.5-flash',
						provider: 'google',
					}),
					request: createRequest('google-compatible'),
				});

				expect(completion).toBe('visible');
				expect(calls.length).toBe(1);
				expect(calls[0].url).toBe(
					'https://google.example.test/v1/models/gemini-2.5-flash:streamGenerateContent?alt=sse'
				);
				const body = parseBody(calls[0]);
				expect(body.generationConfig.responseMimeType).toBe('text/plain');
			}
		);
	});

	test('streams Anthropic-compatible messages with required headers', async () => {
		await withMockFetch(
			() =>
				sseResponse([
					jsonData({ content_block: { text: 'first' } }),
					jsonData({ delta: { text: ' second' } }),
				]),
			async (calls) => {
				const completion = await generateCompletion({
					config: createConfig({
						apiUrl: 'https://anthropic.example.test',
						model: 'claude-sonnet-test',
						provider: 'anthropic',
					}),
					request: createRequest('anthropic'),
				});

				expect(completion).toBe('first second');
				expect(calls.length).toBe(1);
				expect(calls[0].url).toBe('https://anthropic.example.test/v1/messages');
				const headers = parseHeaders(calls[0]);
				expect(headers['x-api-key']).toBe('test-key');
				expect(headers['anthropic-version']).toBe('2023-06-01');
				expect(headers.Authorization).toBe(undefined);
				const body = parseBody(calls[0]);
				expect(body.model).toBe('claude-sonnet-test');
				expect(body.stream).toBe(true);
				expect(body.messages).toEqual([
					expect.objectContaining({ role: 'user' }),
				]);
			}
		);
	});

	test('routes DeepSeek FIM through beta completions with short no-suffix limits', async () => {
		await withMockFetch(
			() =>
				sseResponse([jsonData({ choices: [{ text: ' short' }] }), '[DONE]']),
			async (calls) => {
				const completion = await generateCompletion({
					config: createConfig({
						apiUrl: 'https://deepseek.example.test/',
						model: 'deepseek-v4-pro',
						provider: 'deepseek',
					}),
					request: createRequest('deepseek-no-suffix', { suffix: '   ' }),
				});

				expect(completion).toBe(' short');
				expect(calls.length).toBe(1);
				expect(calls[0].url).toBe(
					'https://deepseek.example.test/beta/completions'
				);
				const body = parseBody(calls[0]);
				expect(body.max_tokens).toBe(64);
				expect(body.temperature).toBe(0.2);
				expect(body.stop).toContain('\n');
				expect(body.stop).not.toContain('\n\n\n');
				expect(body.thinking).toEqual({ type: 'disabled' });
			}
		);
	});

	test('routes OpenCode Zen GPT models through OpenAI Responses API', async () => {
		await withMockFetch(
			() =>
				sseResponse([
					jsonData({
						response: { output_text: 'response text' },
						type: 'response.completed',
					}),
					'[DONE]',
				]),
			async (calls) => {
				const completion = await generateCompletion({
					config: createConfig({
						apiUrl: 'https://responses.example.test',
						model: 'gpt-5-mini',
						provider: 'opencode-zen',
					}),
					request: createRequest('responses'),
				});

				expect(completion).toBe('response text');
				expect(calls.length).toBe(1);
				expect(calls[0].url).toBe(
					'https://responses.example.test/v1/responses'
				);
				const body = parseBody(calls[0]);
				expect(body.input).toEqual(expect.any(String));
				expect(body.instructions).toEqual(expect.any(String));
				expect(body.max_output_tokens).toBe(512);
				expect(body.stream).toBe(true);
			}
		);
	});

	test('uses cache for identical completion requests', async () => {
		await withMockFetch(
			() =>
				sseResponse([
					jsonData({ choices: [{ delta: { content: ' cached' } }] }),
					'[DONE]',
				]),
			async (calls) => {
				const config = createConfig({
					apiUrl: 'https://cache.example.test',
					provider: 'custom',
				});
				const request = createRequest('cache');

				const first = await generateCompletion({ config, request });
				const second = await generateCompletion({ config, request });

				expect(first).toBe(' cached');
				expect(second).toBe(' cached');
				expect(calls.length).toBe(1);
			}
		);
	});

	test('deduplicates identical in-flight completion requests', async () => {
		const pending = createDeferred<Response>();

		await withMockFetch(
			() => pending.promise,
			async (calls) => {
				const config = createConfig({
					apiUrl: 'https://inflight.example.test',
					provider: 'custom',
				});
				const request = createRequest('inflight');

				const first = generateCompletion({ config, request });
				const second = generateCompletion({ config, request });
				pending.resolve(
					sseResponse([
						jsonData({ choices: [{ delta: { content: ' shared' } }] }),
						'[DONE]',
					])
				);

				expect(await first).toBe(' shared');
				expect(await second).toBe(' shared');
				expect(calls.length).toBe(1);
			}
		);
	});

	test('includes HTTP error details in completion failures', async () => {
		await withMockFetch(
			() => new Response('rate limited', { status: 429 }),
			async () => {
				let message = '';

				try {
					await generateCompletion({
						config: createConfig({
							apiUrl: 'https://error.example.test',
							provider: 'custom',
						}),
						request: createRequest('http-error'),
					});
				} catch (error) {
					message = error instanceof Error ? error.message : String(error);
				}

				expect(message.includes('HTTP 429')).toBe(true);
				expect(message.includes('rate limited')).toBe(true);
			}
		);
	});

	test('reports malformed streaming JSON with provider context', async () => {
		await withMockFetch(
			() => sseResponse(['{bad json']),
			async () => {
				let message = '';

				try {
					await generateCompletion({
						config: createConfig({
							apiUrl: 'https://parse.example.test',
							provider: 'custom',
						}),
						request: createRequest('bad-json'),
					});
				} catch (error) {
					message = error instanceof Error ? error.message : String(error);
				}

				expect(message.includes('Custom streaming response parse failed')).toBe(
					true
				);
			}
		);
	});

	test('rejects missing API key before issuing a request', async () => {
		await withMockFetch(
			() => {
				throw new Error('fetch should not be called');
			},
			async (calls) => {
				let message = '';

				try {
					await generateCompletion({
						config: createConfig({ apiKey: '', provider: 'custom' }),
						request: createRequest('missing-key'),
					});
				} catch (error) {
					message = error instanceof Error ? error.message : String(error);
				}

				expect(message.includes('API key')).toBe(true);
				expect(calls.length).toBe(0);
			}
		);
	});
});

function createConfig(
	overrides: Partial<AiCompletionConfig> = {}
): AiCompletionConfig {
	return {
		apiKey: 'test-key',
		apiUrl: 'https://completion.example.test',
		customProtocol: 'openai',
		model: 'test-model',
		provider: 'custom',
		useSsl: true,
		...overrides,
	};
}

function createRequest(
	label: string,
	overrides: Partial<AiCompletionRequest> = {}
): AiCompletionRequest {
	requestId += 1;
	return {
		prefix: `Prefix ${label} ${requestId}`,
		suffix: `Suffix ${label} ${requestId}`,
		title: 'Test note',
		...overrides,
	};
}

async function withMockFetch(
	handler: FetchHandler,
	run: (calls: FetchCall[]) => Promise<void>
) {
	const originalFetch = globalThis.fetch;
	const calls: FetchCall[] = [];

	globalThis.fetch = (async (input, init) => {
		const url = String(input);
		calls.push({ init, url });
		return handler(url, init, calls.length);
	}) as typeof fetch;

	try {
		await run(calls);
	} finally {
		globalThis.fetch = originalFetch;
	}
}

function sseResponse(dataEvents: string[]) {
	return new Response(dataEvents.map((data) => `data: ${data}\n\n`).join(''), {
		status: 200,
	});
}

function jsonData(value: unknown) {
	return JSON.stringify(value);
}

function parseBody(call: FetchCall) {
	return JSON.parse(String(call.init?.body)) as Record<string, any>;
}

function parseHeaders(call: FetchCall) {
	return call.init?.headers as Record<string, string | undefined>;
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});
	return { promise, resolve };
}
