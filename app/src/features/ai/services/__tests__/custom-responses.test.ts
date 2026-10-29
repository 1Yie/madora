import { describe, expect, test } from 'bun:test';
import { generateCompletion, streamCompletion } from '../completion-service';
import { responsesUrl } from '../openai-responses';
import type { AiCompletionConfig, AiCompletionRequest } from '../../types';

const request: AiCompletionRequest = {
	prefix: 'Hello',
	suffix: ' end',
	title: 'Test note',
};
const config: AiCompletionConfig = {
	apiKey: 'test-secret',
	apiUrl: 'https://api.example.test/proxy/v1',
	customProtocol: 'openai-responses',
	model: 'gpt-4.1',
	provider: 'custom',
	useSsl: true,
};
const codex = { ...config, customProtocol: 'openai-codex' } as const;
const completed = {
	type: 'response.completed',
	response: {
		status: 'completed',
		output: [
			{
				type: 'message',
				content: [{ type: 'output_text', text: 'hello world' }],
			},
		],
	},
};
const delta = (text: string) => ({
	type: 'response.output_text.delta',
	delta: text,
});

function signalAbortedDuringRegistration() {
	let aborted = false;
	return {
		get aborted() {
			return aborted;
		},
		addEventListener() {
			aborted = true;
		},
		removeEventListener() {},
	} as unknown as AbortSignal;
}

async function mockFetch(
	handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
	run: () => Promise<void>
) {
	const original = globalThis.fetch;
	globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
		Promise.resolve(handler(String(input), init))) as typeof fetch;
	try {
		await run();
	} finally {
		globalThis.fetch = original;
	}
}

function sse(events: unknown[]) {
	return new Response(
		events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''),
		{ headers: { 'Content-Type': 'text/event-stream' } }
	);
}

class MockSocket {
	static instances: MockSocket[] = [];
	static script: (socket: MockSocket) => void = () => {};
	static constructError: string | null = null;
	static sendError: string | null = null;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;
	sent: Record<string, unknown>[] = [];
	closed = false;
	constructor(
		readonly url: string,
		readonly protocols: string[],
		readonly options: { headers: Record<string, string> }
	) {
		if (MockSocket.constructError) throw new Error(MockSocket.constructError);
		MockSocket.instances.push(this);
		queueMicrotask(() => {
			this.onopen?.();
			MockSocket.script(this);
		});
	}
	send(frame: string) {
		if (MockSocket.sendError) throw new Error(MockSocket.sendError);
		this.sent.push(JSON.parse(frame));
	}
	emit(event: unknown) {
		this.onmessage?.({ data: JSON.stringify(event) });
	}
	close() {
		this.closed = true;
		this.onclose?.();
	}
}

async function mockWebSocket(
	script: (socket: MockSocket) => void,
	run: () => Promise<void>,
	native = true
) {
	const originalSocket = globalThis.WebSocket;
	const originalNavigator = Object.getOwnPropertyDescriptor(
		globalThis,
		'navigator'
	);
	MockSocket.instances = [];
	MockSocket.script = script;
	MockSocket.constructError = null;
	MockSocket.sendError = null;
	globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: { product: native ? 'ReactNative' : 'Gecko' },
	});
	try {
		await run();
	} finally {
		globalThis.WebSocket = originalSocket;
		if (originalNavigator) {
			Object.defineProperty(globalThis, 'navigator', originalNavigator);
		} else {
			Reflect.deleteProperty(globalThis, 'navigator');
		}
	}
}

describe('custom Responses URLs', () => {
	for (const [base, expected] of [
		['https://host.test', 'https://host.test/v1/responses'],
		['https://host.test/v1/', 'https://host.test/v1/responses'],
		['https://host.test/proxy', 'https://host.test/proxy/v1/responses'],
		['https://host.test/proxy/v1', 'https://host.test/proxy/v1/responses'],
		[
			'https://host.test/proxy/v1/responses/',
			'https://host.test/proxy/v1/responses',
		],
	]) {
		test(`retains proxy prefix without duplicating version: ${base}`, () => {
			expect(responsesUrl(base, false)).toBe(expected);
			expect(responsesUrl(base, true)).toBe(expected.replace('https:', 'wss:'));
		});
	}
	test('supports explicit native WebSocket URLs and configured local HTTP', () => {
		expect(responsesUrl('wss://host.test/base/v1/responses', true)).toBe(
			'wss://host.test/base/v1/responses'
		);
		expect(responsesUrl('http://localhost:8080/proxy', true)).toBe(
			'ws://localhost:8080/proxy/v1/responses'
		);
	});
	for (const host of [
		'localhost',
		'app.localhost',
		'device.local',
		'server.lan',
		'127.0.0.1',
		'10.0.0.5',
		'172.16.0.1',
		'172.31.255.254',
		'192.168.2.1',
		'169.254.1.1',
		'[::1]',
		'[fc00::1]',
		'[fdff::1]',
		'[fe80::1]',
		'[febf::1]',
		'[::ffff:192.168.1.1]',
	]) {
		test(`permits private HTTP/WS host ${host}`, () => {
			expect(responsesUrl(`http://${host}/proxy`, false)).toBe(
				`http://${host === '[::ffff:192.168.1.1]' ? '[::ffff:c0a8:101]' : host}/proxy/v1/responses`
			);
			expect(responsesUrl(`ws://${host}/proxy`, true).startsWith('ws://')).toBe(
				true
			);
		});
	}
	for (const host of [
		'api.openai.com',
		'example.com',
		'8.8.8.8',
		'172.15.1.1',
		'172.32.1.1',
		'192.169.1.1',
		'100.64.0.1',
		'[2001:4860:4860::8888]',
		'[fec0::1]',
		'[::ffff:8.8.8.8]',
		'localhost.evil.test',
	]) {
		test(`rejects public plaintext HTTP/WS host ${host}`, () => {
			expect(() => responsesUrl(`http://${host}`, false)).toThrow(
				'Unencrypted'
			);
			expect(() => responsesUrl(`ws://${host}`, true)).toThrow('Unencrypted');
		});
	}
	test('HTTP protocol never silently converts WS schemes', () => {
		for (const scheme of ['ws', 'wss']) {
			expect(() => responsesUrl(`${scheme}://localhost`, false)).toThrow(
				'HTTP(S)'
			);
		}
	});
	for (const url of [
		'https://key@host.test',
		'https://host.test?api_key=secret',
		'https://host.test#secret',
		'ftp://host.test',
	]) {
		test(`rejects unsafe endpoint ${url}`, () => {
			expect(() => responsesUrl(url, true)).toThrow();
		});
	}
});

describe('custom Responses HTTP', () => {
	test('observes cancellation that races with abort listener registration', async () => {
		await mockFetch(
			(_, init) => {
				expect(init?.signal?.aborted).toBe(true);
				return Promise.reject(init?.signal?.reason);
			},
			async () => {
				await expect(
					generateCompletion({
						config,
						request,
						signal: signalAbortedDuringRegistration(),
					})
				).rejects.toThrow('aborted');
			}
		);
	});
	test('rejects oversized UTF-8 requests before fetch', async () => {
		await mockFetch(
			() => {
				throw new Error('must not fetch');
			},
			async () => {
				await expect(
					generateCompletion({
						config,
						request: { ...request, title: '界'.repeat(360_000) },
					})
				).rejects.toThrow('1 MiB');
			}
		);
	});
	test('rejects oversized HTTP JSON and SSE buffers before parsing', async () => {
		for (const stream of [true, false]) {
			await mockFetch(
				() => new Response('界'.repeat(360_000)),
				async () => {
					await expect(
						stream
							? streamCompletion({ config, request, onChunk: () => {} })
							: generateCompletion({ config, request })
					).rejects.toThrow('1 MiB');
				}
			);
		}
	});
	test('caps cumulative SSE output in UTF-8 bytes', async () => {
		await mockFetch(
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							for (let i = 0; i < 4; i++) {
								controller.enqueue(
									new TextEncoder().encode(
										`data: ${JSON.stringify(delta('界'.repeat(100_000)))}\n\n`
									)
								);
							}
							controller.close();
						},
					})
				),
			async () => {
				await expect(
					streamCompletion({ config, request, onChunk: () => {} })
				).rejects.toThrow('1 MiB');
			}
		);
	});
	test('works without TextEncoder/TextDecoder and validates text fallback size', async () => {
		const encoder = globalThis.TextEncoder;
		const decoder = globalThis.TextDecoder;
		try {
			// Body.text is the RN fallback, with no streaming reader.
			Reflect.deleteProperty(globalThis, 'TextEncoder');
			Reflect.deleteProperty(globalThis, 'TextDecoder');
			for (const text of [
				`data: ${JSON.stringify(completed)}\n\n`,
				'界'.repeat(360_000),
			]) {
				await mockFetch(
					() =>
						({
							ok: true,
							headers: new Headers(),
							body: null,
							text: async () => text,
						}) as Response,
					async () => {
						if (text.startsWith('data:')) {
							let output = '';
							await streamCompletion({
								config,
								request,
								onChunk: (x) => {
									output += x;
								},
							});
							expect(output).toBe('hello world');
						} else {
							await expect(
								streamCompletion({ config, request, onChunk: () => {} })
							).rejects.toThrow('1 MiB');
						}
					}
				);
			}
		} finally {
			globalThis.TextEncoder = encoder;
			globalThis.TextDecoder = decoder;
		}
	});
	test('supports Hermes AbortSignal without throwIfAborted or reason', async () => {
		const signal = {
			aborted: true,
			addEventListener() {},
			removeEventListener() {},
		} as unknown as AbortSignal;
		await expect(
			generateCompletion({ config, request, signal })
		).rejects.toThrow('aborted');
	});
	for (const model of [
		'gpt-5.1-codex',
		'gpt-5.2-codex',
		'gpt-5.3-codex-spark',
	]) {
		test(`HTTP omits temperature for ${model}`, async () => {
			await mockFetch(
				(_, init) => {
					const payload = JSON.parse(String(init?.body));
					expect(payload.temperature).toBeUndefined();
					expect(payload.reasoning).toEqual({ effort: 'low' });
					expect(payload.max_output_tokens).toBeGreaterThanOrEqual(512);
					return Response.json(completed.response);
				},
				async () => {
					await generateCompletion({
						config: { ...config, model },
						request: { ...request, suffix: null },
					});
				}
			);
		});
	}
	test('non-stream request uses Responses JSON, prompts and Bearer auth', async () => {
		await mockFetch(
			(url, init) => {
				expect(url).toBe('https://api.example.test/proxy/v1/responses');
				expect(url).not.toContain(config.apiKey);
				expect(init?.headers).toMatchObject({
					Authorization: 'Bearer test-secret',
					Accept: 'application/json',
				});
				const payload = JSON.parse(String(init?.body));
				expect(payload).toMatchObject({
					model: 'gpt-4.1',
					max_output_tokens: 512,
					stream: false,
					store: false,
				});
				expect(payload.instructions).toEqual(expect.any(String));
				expect(payload.input).toContain('Test note');
				expect(payload.messages).toBeUndefined();
				return Response.json(completed.response);
			},
			async () => {
				expect(await generateCompletion({ config, request })).toBe(
					'hello world'
				);
			}
		);
	});

	test('streams deltas, ignores reasoning and cancels a live body at completed', async () => {
		let cancelled = false;
		const chunks: string[] = [];
		await mockFetch(
			(_, init) => {
				expect(JSON.parse(String(init?.body)).stream).toBe(true);
				return new Response(
					new ReadableStream({
						start(controller) {
							const data = [
								{ type: 'response.reasoning_text.delta', delta: 'private' },
								delta('hello '),
								delta('world'),
								completed,
							]
								.map((event) => `data: ${JSON.stringify(event)}\n\n`)
								.join('');
							// Exercise split SSE frames, including split UTF-8.
							const encoded = new TextEncoder().encode(data);
							for (const byte of encoded)
								controller.enqueue(new Uint8Array([byte]));
							// Deliberately keep the stream open: completed is sufficient.
						},
						cancel() {
							cancelled = true;
						},
					})
				);
			},
			async () => {
				await streamCompletion({
					config,
					request,
					onChunk: (x) => chunks.push(x),
				});
			}
		);
		expect(chunks).toEqual(['hello ', 'world']);
		expect(cancelled).toBe(true);
	});

	for (const status of ['failed', 'incomplete', 'queued', 'in_progress']) {
		test(`rejects non-stream ${status} rather than returning partial output`, async () => {
			await mockFetch(
				() =>
					Response.json({
						...completed.response,
						status,
						error: { message: 'permission denied' },
					}),
				async () => {
					await expect(generateCompletion({ config, request })).rejects.toThrow(
						'permission denied'
					);
				}
			);
		});
	}
	test('accepts compatible non-stream responses without a status field', async () => {
		await mockFetch(
			() => Response.json({ output_text: 'compatible response' }),
			async () => {
				expect(await generateCompletion({ config, request })).toBe(
					'compatible response'
				);
			}
		);
	});
	for (const payload of [
		null,
		{ status: 'completed', error: { message: 'denied' } },
		{
			status: 'completed',
			incomplete_details: { reason: 'max_output_tokens' },
		},
	]) {
		test('rejects invalid or contradictory non-stream responses', async () => {
			await mockFetch(
				() => Response.json(payload),
				async () => {
					await expect(
						generateCompletion({ config, request })
					).rejects.toThrow();
				}
			);
		});
	}
	for (const event of [
		{ type: 'response.failed', response: { error: { message: 'denied' } } },
		{
			type: 'response.incomplete',
			response: { incomplete_details: { reason: 'max_output_tokens' } },
		},
		{ type: 'response.cancelled', response: { status: 'cancelled' } },
		{
			type: 'response.completed',
			response: { status: 'completed', error: { message: 'denied' } },
		},
		{ type: 'error', error: { message: 'bad request' } },
	]) {
		test(`rejects SSE ${event.type} after partial deltas`, async () => {
			await mockFetch(
				() => sse([delta('partial'), event]),
				async () => {
					await expect(
						streamCompletion({ config, request, onChunk: () => {} })
					).rejects.toThrow();
				}
			);
		});
	}
	test('EOF without terminal event is not successful', async () => {
		await mockFetch(
			() => sse([delta('partial')]),
			async () => {
				await expect(
					streamCompletion({ config, request, onChunk: () => {} })
				).rejects.toThrow('before response.completed');
			}
		);
	});
	test('HTTP permission errors are surfaced', async () => {
		await mockFetch(
			() => new Response('model access denied', { status: 403 }),
			async () => {
				await expect(generateCompletion({ config, request })).rejects.toThrow(
					'HTTP 403'
				);
			}
		);
	});
	test('does not issue a request without key, URL, model, or after cancellation', async () => {
		await mockFetch(
			() => {
				throw new Error('must not fetch');
			},
			async () => {
				for (const patch of [
					{ apiKey: ' ' },
					{ apiUrl: null },
					{ model: null },
				]) {
					await expect(
						generateCompletion({ config: { ...config, ...patch }, request })
					).rejects.toThrow(/Please/);
				}
				const controller = new AbortController();
				controller.abort(new Error('cancelled'));
				await expect(
					generateCompletion({ config, request, signal: controller.signal })
				).rejects.toThrow('cancelled');
			}
		);
	});
	test('propagates HTTP cancellation to fetch', async () => {
		const controller = new AbortController();
		await mockFetch(
			(_, init) =>
				new Promise((_, reject) => {
					init?.signal?.addEventListener('abort', () =>
						reject(init.signal?.reason)
					);
					controller.abort(new Error('cancelled HTTP'));
				}),
			async () => {
				await expect(
					generateCompletion({ config, request, signal: controller.signal })
				).rejects.toThrow('cancelled HTTP');
			}
		);
	});
});

describe('custom Codex WebSocket', () => {
	test('cancellation during listener registration never opens a socket', async () => {
		await mockWebSocket(
			() => {},
			async () => {
				await expect(
					generateCompletion({
						config: codex,
						request,
						signal: signalAbortedDuringRegistration(),
					})
				).rejects.toThrow('aborted');
				expect(MockSocket.instances).toHaveLength(0);
			}
		);
	});
	test('redacts native constructor and send failures that contain secrets', async () => {
		for (const phase of ['constructError', 'sendError'] as const) {
			await mockWebSocket(
				() => {},
				async () => {
					MockSocket[phase] = `Authorization: Bearer ${config.apiKey}`;
					let message = '';
					try {
						await generateCompletion({ config: codex, request });
					} catch (error) {
						message = String(error);
					}
					expect(message).toContain('WebSocket could not');
					expect(message).not.toContain(config.apiKey);
					if (phase === 'sendError')
						expect(MockSocket.instances[0].closed).toBe(true);
				}
			);
		}
	});
	test('rejects oversized requests before opening a socket', async () => {
		await mockWebSocket(
			() => {},
			async () => {
				await expect(
					generateCompletion({
						config: codex,
						request: { ...request, title: '界'.repeat(360_000) },
					})
				).rejects.toThrow('1 MiB');
				expect(MockSocket.instances).toHaveLength(0);
			}
		);
	});
	test('rejects oversized WebSocket messages before JSON parsing', async () => {
		await mockWebSocket(
			(socket) => socket.onmessage?.({ data: '界'.repeat(360_000) }),
			async () => {
				await expect(
					generateCompletion({ config: codex, request })
				).rejects.toThrow('1 MiB');
				expect(MockSocket.instances[0].closed).toBe(true);
			}
		);
	});
	test('caps cumulative WebSocket output in UTF-8 bytes', async () => {
		await mockWebSocket(
			(socket) => {
				for (let i = 0; i < 4; i++) socket.emit(delta('界'.repeat(100_000)));
			},
			async () => {
				await expect(
					generateCompletion({ config: codex, request })
				).rejects.toThrow('1 MiB');
				expect(MockSocket.instances[0].closed).toBe(true);
			}
		);
	});
	for (const model of [
		'gpt-5.1-codex',
		'gpt-5.2-codex',
		'gpt-5.3-codex-spark',
	]) {
		test(`WS omits temperature for ${model}`, async () => {
			await mockWebSocket(
				(socket) => socket.emit(completed),
				async () => {
					await generateCompletion({
						config: { ...codex, model },
						request: { ...request, suffix: null },
					});
					const payload = MockSocket.instances[0].sent[0];
					expect(payload.temperature).toBeUndefined();
					expect(payload.reasoning).toEqual({ effort: 'low' });
					expect(payload.max_output_tokens).toBeGreaterThanOrEqual(512);
				}
			);
		});
	}
	test('uses native handshake Bearer and top-level response.create, then closes', async () => {
		await mockWebSocket(
			(socket) => {
				socket.emit(delta('hello '));
				socket.emit(delta('world'));
				socket.emit(completed);
			},
			async () => {
				const chunks: string[] = [];
				await streamCompletion({
					config: codex,
					request,
					onChunk: (x) => chunks.push(x),
				});
				expect(chunks).toEqual(['hello ', 'world']);
				const [socket] = MockSocket.instances;
				expect(socket.url).toBe('wss://api.example.test/proxy/v1/responses');
				expect(socket.url).not.toContain(config.apiKey);
				expect(socket.protocols).toEqual([]);
				expect(socket.options.headers).toEqual({
					Authorization: 'Bearer test-secret',
				});
				expect(socket.sent).toHaveLength(1);
				expect(socket.sent[0]).toMatchObject({
					type: 'response.create',
					model: 'gpt-4.1',
					store: false,
				});
				expect(socket.sent[0].input).toEqual(expect.any(String));
				expect(socket.sent[0].instructions).toEqual(expect.any(String));
				for (const field of ['stream', 'background', 'response', 'api_key']) {
					expect(socket.sent[0][field]).toBeUndefined();
				}
				expect(socket.closed).toBe(true);
				expect(socket.onmessage).toBeNull();
			}
		);
	});
	test('non-stream aggregates the same protocol and falls back to completed output', async () => {
		await mockWebSocket(
			(socket) => socket.emit(completed),
			async () => {
				expect(await generateCompletion({ config: codex, request })).toBe(
					'hello world'
				);
				expect(MockSocket.instances[0].sent[0].stream).toBeUndefined();
			}
		);
	});
	for (const event of [
		{
			type: 'response.failed',
			response: { error: { message: 'model access denied' } },
		},
		{
			type: 'response.incomplete',
			response: { incomplete_details: { reason: 'max_output_tokens' } },
		},
		{
			type: 'error',
			error: { code: 'invalid_api_key', message: 'Invalid API key' },
		},
	]) {
		test(`rejects ${event.type} and closes the session`, async () => {
			await mockWebSocket(
				(socket) => {
					socket.emit(delta('partial'));
					socket.emit(event);
				},
				async () => {
					await expect(
						generateCompletion({ config: codex, request })
					).rejects.toThrow();
					expect(MockSocket.instances[0].closed).toBe(true);
				}
			);
		});
	}
	test('premature disconnect is an error, not partial success', async () => {
		await mockWebSocket(
			(socket) => {
				socket.emit(delta('partial'));
				socket.onclose?.();
			},
			async () => {
				await expect(
					generateCompletion({ config: codex, request })
				).rejects.toThrow('before response.completed');
				expect(MockSocket.instances[0].closed).toBe(true);
			}
		);
	});
	test('invalid JSON and handshake/network errors reject and clean up', async () => {
		for (const script of [
			(socket: MockSocket) => socket.onmessage?.({ data: '{invalid' }),
			(socket: MockSocket) => socket.onerror?.(),
		]) {
			await mockWebSocket(script, async () => {
				await expect(
					generateCompletion({ config: codex, request })
				).rejects.toThrow();
				expect(MockSocket.instances[0].closed).toBe(true);
				expect(MockSocket.instances[0].onerror).toBeNull();
			});
		}
	});
	test('browser explicitly refuses insecure auth before opening a socket', async () => {
		await mockWebSocket(
			() => {
				throw new Error('must not connect');
			},
			async () => {
				await expect(
					generateCompletion({ config: codex, request })
				).rejects.toThrow('not supported on Web');
				expect(MockSocket.instances).toHaveLength(0);
			},
			false
		);
	});
	test('cancellation closes the isolated socket, never sends response.cancel', async () => {
		const controller = new AbortController();
		await mockWebSocket(
			(socket) => socket.emit(delta('partial')),
			async () => {
				await expect(
					streamCompletion({
						config: codex,
						request,
						signal: controller.signal,
						onChunk: () => controller.abort(new Error('cancelled WS')),
					})
				).rejects.toThrow('cancelled WS');
				expect(MockSocket.instances[0].closed).toBe(true);
				expect(MockSocket.instances[0].sent.map((x) => x.type)).toEqual([
					'response.create',
				]);
			}
		);
	});
	test('identical concurrent requests own independent sessions', async () => {
		await mockWebSocket(
			(socket) => socket.emit(completed),
			async () => {
				expect(
					await Promise.all([
						generateCompletion({ config: codex, request }),
						generateCompletion({ config: codex, request }),
					])
				).toEqual(['hello world', 'hello world']);
				expect(MockSocket.instances).toHaveLength(2);
				expect(MockSocket.instances.every((socket) => socket.closed)).toBe(
					true
				);
			}
		);
	});
	test('timeout releases a stalled socket and rejects', async () => {
		const original = globalThis.setTimeout;
		globalThis.setTimeout = ((
			handler: TimerHandler,
			ms?: number,
			...args: unknown[]
		) =>
			original(handler, ms === 60_000 ? 1 : ms, ...args)) as typeof setTimeout;
		try {
			await mockWebSocket(
				() => {},
				async () => {
					await expect(
						generateCompletion({ config: codex, request })
					).rejects.toThrow('timed out');
					expect(MockSocket.instances[0].closed).toBe(true);
				}
			);
		} finally {
			globalThis.setTimeout = original;
		}
	});
});
