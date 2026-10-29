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
				expect(body.temperature).toBe(0.3);
				expect(body.reasoning).toBe(undefined);
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

	for (const [provider, models] of [
		[
			'opencode-go',
			[
				'glm-5.2',
				'kimi-k3',
				'kimi-k3.1-pro',
				'kimi-k2.7-code',
				'deepseek-v4-pro',
				'mimo-v2.5',
				'step-5-preview',
				'hy4-preview',
				'hy3',
				'longcat-2.0',
				'beam-free',
				'iceman-contributor-free',
				'minimax-m3.1-flash',
				'minimax-m3.1-flash-free',
				'cat-jam-free',
				'space-bunny',
			],
		],
		[
			'opencode-zen',
			[
				'deepseek-v4-pro',
				'big-pickle',
				'flint-40b-free',
				'beam-free',
				'qwen3.8-max',
				'qwen3-coder',
				'grok-code',
				'mistral-large-4',
				'ling-3.1-flash-free',
				'longcat-2.0-free',
				'step-5-preview-free',
				'hy3-free',
				'trinity-large-preview-free',
				'laguna-s-2.1-free',
				'ring-2.6-1t-free',
				'exo-free',
				'fledge-alpha-free',
				'll-alpha-free',
				'x-preview-f-free',
				'cat-jam-free',
				'space-bunny-free',
			],
		],
	] as const) {
		for (const model of models) {
			test(`${provider} routes ${model} through chat completions`, async () => {
				await withMockFetch(
					() =>
						sseResponse([
							jsonData({ choices: [{ delta: { content: 'ok' } }] }),
						]),
					async (calls) => {
						expect(
							await generateCompletion({
								config: createConfig({ model, provider }),
								request: createRequest(model),
							})
						).toBe('ok');
						expect(calls.length).toBe(1);
						expect(calls[0].url).toBe(
							'https://completion.example.test/v1/chat/completions'
						);
						expect(parseBody(calls[0])).toMatchObject({ model, stream: true });
						expect(parseHeaders(calls[0]).Authorization).toBe(
							'Bearer test-key'
						);
					}
				);
			});
		}
	}

	for (const [provider, model] of [
		['opencode-go', 'claude-haiku-5-5'],
		['opencode-go', 'minimax-m3'],
		['opencode-go', 'qwen3.7-plus'],
		['opencode-zen', 'claude-sonnet-4-6'],
		['opencode-zen', 'claude-haiku-5-5'],
		['opencode-zen', 'qwen3.7-max'],
		['opencode-zen', 'qwen3.8-flash'],
		['opencode-zen', 'qwen3.6-plus'],
		['opencode-zen', 'qwen3.5-plus'],
		['opencode-zen', 'minimax-m3-free'],
	] as const) {
		test(`${provider} keeps ${model} on Anthropic messages`, async () => {
			await withMockFetch(
				() => sseResponse([jsonData({ delta: { text: 'ok' } })]),
				async (calls) => {
					expect(
						await generateCompletion({
							config: createConfig({ model, provider }),
							request: createRequest(model),
						})
					).toBe('ok');
					expect(calls[0].url).toBe(
						'https://completion.example.test/v1/messages'
					);
					expect(parseBody(calls[0]).model).toBe(model);
					expect(parseHeaders(calls[0])['x-api-key']).toBe('test-key');
					expect(parseHeaders(calls[0])['anthropic-version']).toBe(
						'2023-06-01'
					);
					expect(parseHeaders(calls[0]).Authorization).toBe(undefined);
				}
			);
		});
	}

	test('Go sends an anonymous stable session across all protocols only', async () => {
		await withMockFetch(
			(url) =>
				sseResponse([
					jsonData(
						url.endsWith('/messages')
							? { delta: { text: 'ok' } }
							: url.endsWith('/responses')
								? { type: 'response.output_text.delta', delta: 'ok' }
								: url.includes(':streamGenerateContent')
									? { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }
									: { choices: [{ delta: { content: 'ok' } }] }
					),
				]),
			async (calls) => {
				for (const [provider, model] of [
					['opencode-go', 'beam-free'],
					['opencode-go', 'claude-haiku-5-5'],
					['opencode-go', 'gpt-6-luna'],
					['opencode-go', 'gemini-4-argon'],
					['opencode-zen', 'beam-free'],
					['custom', 'beam-free'],
					['anthropic', 'claude-haiku-5-5'],
				] as const) {
					await generateCompletion({
						config: createConfig({ model, provider }),
						request: createRequest(`session-${provider}-${model}`),
					});
				}

				expect(calls.length).toBe(7);
				const session = parseHeaders(calls[0])['x-opencode-session'];
				expect(/^madora-[a-z0-9]+$/.test(session ?? '')).toBe(true);
				expect(session).not.toContain('test-key');
				expect(session).not.toContain('Prefix');
				for (const call of calls.slice(0, 4)) {
					expect(parseHeaders(call)['x-opencode-session']).toBe(session);
					expect(parseHeaders(call)['User-Agent']).toBe('Madora');
				}
				for (const call of calls.slice(4)) {
					expect(parseHeaders(call)['x-opencode-session']).toBe(undefined);
					expect(parseHeaders(call)['User-Agent']).toBe(undefined);
				}
			}
		);
	});

	for (const provider of [
		'opencode-go',
		'opencode-zen',
		'openai',
		'custom',
	] as const) {
		for (const [model, effort] of [
			['gpt-5.6-luna', 'none'],
			['gpt-5.6-sol', 'none'],
			['gpt-5.6-terra', 'none'],
			['gpt-6.1-terra', 'none'],
			['gpt-6-sol', 'none'],
			['gpt-6-luna', 'none'],
			['gpt-6-luna-2026-06-01', 'none'],
			['gpt-6.1-sol', 'low'],
			['gpt-6-astra', 'low'],
		] as const) {
			test(`${provider} builds a compatible GPT payload for ${model}`, async () => {
				await withMockFetch(
					(url) =>
						sseResponse([
							jsonData(
								url.endsWith('/responses')
									? { type: 'response.output_text.delta', delta: 'ok' }
									: { choices: [{ delta: { content: 'ok' } }] }
							),
						]),
					async (calls) => {
						// Both normal FIM and open-ended 64-token completions need a reasoning budget.
						for (const suffix of ['after', '']) {
							expect(
								await generateCompletion({
									config: createConfig({ model, provider }),
									request: createRequest(`gpt6-${model}`, { suffix }),
								})
							).toBe('ok');
							const call = calls[calls.length - 1];
							const body = parseBody(call);
							const maxTokens = effort === 'low' ? 512 : suffix ? 512 : 64;
							expect(body.model).toBe(model);
							expect(body.stream).toBe(true);
							expect(body.stop).toBe(undefined);
							expect(body.max_tokens).toBe(undefined);
							if (provider === 'opencode-zen' || provider === 'opencode-go') {
								expect(call.url.endsWith('/v1/responses')).toBe(true);
								expect(body.reasoning).toEqual({ effort });
								expect(body.reasoning_effort).toBe(undefined);
								expect(body.max_output_tokens).toBe(maxTokens);
								expect(body.max_completion_tokens).toBe(undefined);
							} else {
								expect(call.url.endsWith('/v1/chat/completions')).toBe(true);
								expect(body.reasoning_effort).toBe(effort);
								expect(body.reasoning).toBe(undefined);
								expect(body.max_completion_tokens).toBe(maxTokens);
								expect(body.max_output_tokens).toBe(undefined);
							}
							if (effort === 'low') {
								expect(body.temperature).toBe(undefined);
							} else {
								expect(body.temperature).toBe(suffix ? 0.3 : 0.2);
							}
						}
					}
				);
			});
		}
	}

	for (const provider of [
		'kimi',
		'opencode-go',
		'opencode-zen',
		'custom',
	] as const) {
		for (const model of ['kimi-k3', 'kimi-k3.1-pro', 'kimi-k2.7-code']) {
			test(`${provider} respects mandatory reasoning for ${model}`, async () => {
				await withMockFetch(
					() =>
						sseResponse([
							jsonData({ choices: [{ delta: { content: 'ok' } }] }),
						]),
					async (calls) => {
						for (const suffix of ['after', '']) {
							await generateCompletion({
								config: createConfig({ model, provider }),
								request: createRequest(model, { suffix }),
							});
							const body = parseBody(calls[calls.length - 1]);
							expect(body.max_tokens).toBe(512);
							expect(body.temperature).toBe(undefined);
							expect(body.thinking).toBe(undefined);
							expect(body.reasoning_effort).toBe(
								model === 'kimi-k3' && provider === 'opencode-go'
									? 'max'
									: model.startsWith('kimi-k3')
										? 'low'
										: undefined
							);
						}
					}
				);
			});
		}
	}

	test('Go MiniMax M3.1 Flash uses low reasoning and a minimum 512-token chat budget', async () => {
		await withMockFetch(
			() =>
				sseResponse([jsonData({ choices: [{ delta: { content: 'ok' } }] })]),
			async (calls) => {
				await generateCompletion({
					config: createConfig({
						provider: 'opencode-go',
						model: 'minimax-m3.1-flash',
					}),
					request: createRequest('go-minimax-low', { suffix: '' }),
				});
				expect(calls[0].url.endsWith('/v1/chat/completions')).toBe(true);
				expect(parseBody(calls[0]).reasoning_effort).toBe('low');
				expect(parseBody(calls[0]).max_tokens).toBe(512);
				expect(parseBody(calls[0]).thinking).toBe(undefined);
				expect(parseBody(calls[0]).output_config).toBe(undefined);
			}
		);
	});

	for (const provider of ['google', 'opencode-zen', 'opencode-go'] as const) {
		for (const [model, thinkingLevel] of [
			['gemini-4-argon', 'low'],
			['gemini-3.8-flash', 'low'],
			['gemini-3.7-flash', 'low'],
			['gemini-3.1-pro', 'low'],
			['gemini-3-flash', 'minimal'],
		] as const) {
			test(`${provider} uses a supported thinking level for ${model}`, async () => {
				await withMockFetch(
					() =>
						sseResponse([
							jsonData({
								candidates: [{ content: { parts: [{ text: 'ok' }] } }],
							}),
						]),
					async (calls) => {
						expect(
							await generateCompletion({
								config: createConfig({ model, provider }),
								request: createRequest(model, { suffix: '' }),
							})
						).toBe('ok');
						expect(calls[0].url).toBe(
							`https://completion.example.test/v1/models/${model}:streamGenerateContent?alt=sse`
						);
						expect(parseBody(calls[0]).generationConfig.thinkingConfig).toEqual(
							{
								thinkingLevel,
							}
						);
						expect(parseHeaders(calls[0])['x-goog-api-key']).toBe('test-key');
						expect(parseBody(calls[0]).generationConfig.maxOutputTokens).toBe(
							thinkingLevel === 'low' ? 512 : 64
						);
					}
				);
			});
		}
	}

	for (const provider of ['opencode-go', 'opencode-zen'] as const) {
		test(`${provider} rejects unknown models before connecting`, async () => {
			await withMockFetch(
				() => {
					throw new Error('fetch should not be called');
				},
				async (calls) => {
					let message = '';
					try {
						await generateCompletion({
							config: createConfig({ model: 'unknown-model', provider }),
							request: createRequest('unknown'),
						});
					} catch (error) {
						message = error instanceof Error ? error.message : String(error);
					}
					expect(message.includes('unknown-model')).toBe(true);
					expect(calls.length).toBe(0);
				}
			);
		});
	}

	for (const [provider, model] of [
		['opencode-go', 'grok-4.7'],
		['opencode-go', 'muse-spark-1.2-contributor'],
		['opencode-go', 'muse-spark-1.3-contributor'],
		['opencode-zen', 'grok-4.7'],
		['opencode-zen', 'grok-4.6'],
		['opencode-zen', 'grok-build-0.1'],
		['opencode-zen', 'muse-wonder-1.0'],
		['opencode-zen', 'muse-spark-1.2'],
		['opencode-zen', 'muse-spark-1.3-contributor-free'],
	] as const) {
		test(`${provider} routes ${model} through Responses`, async () => {
			await withMockFetch(
				() =>
					sseResponse([
						jsonData({ type: 'response.output_text.delta', delta: 'ok' }),
					]),
				async (calls) => {
					expect(
						await generateCompletion({
							config: createConfig({ provider, model }),
							request: createRequest(model),
						})
					).toBe('ok');
					expect(calls[0].url).toBe(
						'https://completion.example.test/v1/responses'
					);
					expect(parseBody(calls[0])).toMatchObject({ model, stream: true });
					expect(parseBody(calls[0]).messages).toBe(undefined);
				}
			);
		});
	}

	for (const apiUrl of [
		'',
		'https://opencode.ai/zen/go',
		'https://opencode.ai/zen/go/',
	]) {
		test(`Go Gemini uses the current official Google endpoint for ${apiUrl || 'default base'}`, async () => {
			await withMockFetch(
				() =>
					sseResponse([
						jsonData({
							candidates: [{ content: { parts: [{ text: 'ok' }] } }],
						}),
					]),
				async (calls) => {
					expect(
						await generateCompletion({
							config: createConfig({
								apiUrl,
								provider: 'opencode-go',
								model: 'gemini-4-argon',
							}),
							request: createRequest('go-google-url'),
						})
					).toBe('ok');
					expect(calls[0].url).toBe(
						'https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse'
					);
					expect(parseBody(calls[0]).generationConfig.thinkingConfig).toEqual({
						thinkingLevel: 'low',
					});
					expect(parseHeaders(calls[0])['x-opencode-session']).toEqual(
						expect.any(String)
					);
				}
			);
		});
	}

	for (const provider of ['minimax', 'minimax-coding'] as const) {
		test(`${provider} uses low mandatory reasoning for M3.1 Flash`, async () => {
			await withMockFetch(
				() => sseResponse([jsonData({ delta: { text: 'ok' } })]),
				async (calls) => {
					for (const suffix of ['after', '']) {
						await generateCompletion({
							config: createConfig({ provider, model: 'MiniMax-M3.1-Flash' }),
							request: createRequest('minimax-reasoning', { suffix }),
						});
						const call = calls[calls.length - 1];
						expect(call.url.endsWith('/v1/messages')).toBe(true);
						expect(parseBody(call).output_config).toEqual({ effort: 'low' });
						expect(parseBody(call).max_tokens).toBe(512);
						expect(parseBody(call).thinking).toBe(undefined);
					}
					await generateCompletion({
						config: createConfig({ provider, model: 'MiniMax-M3' }),
						request: createRequest('minimax-old', { suffix: '' }),
					});
					expect(parseBody(calls[calls.length - 1]).output_config).toBe(
						undefined
					);
					expect(parseBody(calls[calls.length - 1]).max_tokens).toBe(64);
				}
			);
		});
	}

	for (const provider of [
		'anthropic',
		'opencode-go',
		'opencode-zen',
		'custom',
	] as const) {
		for (const [model, supportsTemperature] of [
			['claude-fable-5', false],
			['claude-fable-5-1', false],
			['claude-opus-5', false],
			['claude-opus-5-5', false],
			['claude-opus-4-7', false],
			['claude-opus-4-8', false],
			['claude-sonnet-5', false],
			['claude-sonnet-5-5', false],
			['claude-haiku-5-5', false],
			['claude-haiku-5-5-20260601', false],
			['claude-sonnet-4-6', true],
			['claude-opus-4-6', true],
			['claude-haiku-4-5', true],
		] as const) {
			test(`${provider} handles temperature compatibility for ${model}`, async () => {
				await withMockFetch(
					() => sseResponse([jsonData({ delta: { text: 'ok' } })]),
					async (calls) => {
						expect(
							await generateCompletion({
								config: createConfig({
									model,
									provider,
									customProtocol: 'anthropic',
								}),
								request: createRequest(model),
							})
						).toBe('ok');
						expect(calls[0].url.endsWith('/v1/messages')).toBe(true);
						const body = parseBody(calls[0]);
						expect(body.model).toBe(model);
						expect(body.max_tokens).toBe(512);
						expect(body.stream).toBe(true);
						expect(body.temperature).toBe(
							supportsTemperature ? 0.3 : undefined
						);
					}
				);
			});
		}
	}

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
