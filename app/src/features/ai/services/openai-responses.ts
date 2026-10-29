// Responses WebSocket is the public API-key API, not ChatGPT subscription OAuth.
// See app/docs/openai-responses.md for the wire contract and platform boundary.
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_BYTES = 1024 * 1024;

function byteLength(text: string) {
	// A JS string longer than the byte ceiling is necessarily too large.
	if (text.length > MAX_BYTES) throw sizeError();
	let bytes = 0;
	for (const char of text) {
		const code = char.codePointAt(0)!;
		bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
		if (bytes > MAX_BYTES) throw sizeError();
	}
	return bytes;
}

function sizeError() {
	return new Error(
		'OpenAI Responses request, message or output exceeds the 1 MiB limit.'
	);
}

function checkSize(bytes: number) {
	if (bytes > MAX_BYTES) throw sizeError();
}

function serialize(value: unknown) {
	const text = JSON.stringify(value);
	checkSize(byteLength(text));
	return text;
}

type ResponsePayload = {
	error?: { code?: string; message?: string };
	incomplete_details?: { reason?: string };
	output?: {
		type?: string;
		content?: { type?: string; text?: string }[];
	}[];
	output_text?: string;
	status?: string;
};

type ResponseEvent = {
	type?: string;
	delta?: string;
	error?: ResponsePayload['error'];
	response?: ResponsePayload;
};

type RequestOptions = {
	apiKey: string;
	apiUrl: string;
	onChunk: (chunk: string) => void;
	payload: Record<string, unknown>;
	signal?: AbortSignal;
	stream: boolean;
	websocket: boolean;
};

function abortReason(signal?: AbortSignal) {
	return signal?.reason ?? new Error('OpenAI Responses request aborted.');
}

export function responsesUrl(base: string, websocket: boolean) {
	const url = new URL(base);
	const protocols = websocket
		? ['https:', 'http:', 'wss:', 'ws:']
		: ['https:', 'http:'];
	if (!protocols.includes(url.protocol)) {
		throw new Error(
			websocket
				? 'OpenAI Codex URL must use HTTP(S) or WS(S).'
				: 'OpenAI Responses HTTP URL must use HTTP(S), not WebSocket.'
		);
	}
	// Authentication belongs only in headers; reject ambiguous/credential URLs.
	if (url.username || url.password || url.search || url.hash) {
		throw new Error(
			'Responses API URL must not contain credentials, query parameters or fragments.'
		);
	}
	if (
		(url.protocol === 'http:' || url.protocol === 'ws:') &&
		!isLocalHost(url.hostname)
	) {
		throw new Error(
			'Unencrypted HTTP/WS is allowed only for loopback or private local networks. Use HTTPS/WSS for public endpoints.'
		);
	}
	const path = url.pathname.replace(/\/+$/, '');
	url.pathname = path.endsWith('/responses')
		? path
		: `${path}${path.endsWith('/v1') ? '' : '/v1'}/responses`;
	url.protocol = websocket
		? url.protocol === 'http:' || url.protocol === 'ws:'
			? 'ws:'
			: 'wss:'
		: url.protocol === 'ws:' || url.protocol === 'http:'
			? 'http:'
			: 'https:';
	return url.toString();
}

function isLocalHost(value: string) {
	const hostname = value
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	if (
		hostname === 'localhost' ||
		['.localhost', '.local', '.lan'].some((suffix) => hostname.endsWith(suffix))
	) {
		return true;
	}
	if (hostname.includes(':')) {
		if (hostname === '::1') return true;
		if (/^(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(hostname)) return true;
		// WHATWG URL canonicalizes IPv4-mapped IPv6 to two hexadecimal groups.
		const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(hostname);
		if (!mapped) return false;
		const high = parseInt(mapped[1], 16);
		const low = parseInt(mapped[2], 16);
		return isLocalHost(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
	}
	const parts = hostname.split('.');
	if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part)))
		return false;
	const octets = parts.map(Number);
	if (octets.some((part) => part < 0 || part > 255)) return false;
	const [a, b] = octets;
	return (
		a === 127 ||
		a === 10 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 169 && b === 254)
	);
}

export function assertNativeWebSocket() {
	// RN explicitly supports the third constructor argument (headers). Browsers
	// silently ignore it, so never attempt the handshake outside the RN runtime.
	if (typeof navigator === 'undefined' || navigator.product !== 'ReactNative') {
		throw new Error(
			'OpenAI Codex (WebSocket) requires native React Native handshake headers. ' +
				'It is not supported on Web; use OpenAI Responses (HTTP) instead. ' +
				'API keys are never sent in URLs or WebSocket subprotocols.'
		);
	}
	if (typeof WebSocket === 'undefined') {
		throw new Error('WebSocket is not available in this runtime.');
	}
}

export async function requestResponses(opts: RequestOptions): Promise<string> {
	const url = responsesUrl(opts.apiUrl, opts.websocket);
	if (!opts.apiKey.trim()) throw new Error('Please save the API key first.');
	if (opts.signal?.aborted) throw abortReason(opts.signal);
	if (opts.websocket) {
		assertNativeWebSocket();
		return requestWebSocket(url, opts);
	}
	return requestHttp(url, opts);
}

function outputText(payload: ResponsePayload) {
	return (
		payload.output_text ??
		payload.output
			?.filter((item) => item.type === 'message')
			.flatMap((item) => item.content ?? [])
			.filter((item) => item.type === 'output_text')
			.map((item) => item.text ?? '')
			.join('') ??
		''
	);
}

function responseError(payload: ResponsePayload, fallback: string) {
	const detail =
		payload.error?.message ??
		payload.error?.code ??
		payload.incomplete_details?.reason ??
		payload.status;
	return new Error(
		`OpenAI Responses ${fallback}${detail ? `: ${detail}` : ''}`
	);
}

function assertCompleted(payload: ResponsePayload) {
	if (
		payload.error ||
		payload.incomplete_details ||
		(payload.status && payload.status !== 'completed')
	) {
		throw responseError(payload, 'did not complete');
	}
}

function createAccumulator(onChunk: RequestOptions['onChunk']) {
	let text = '';
	let outputBytes = 0;
	let completed = false;
	return {
		get completed() {
			return completed;
		},
		get text() {
			return text;
		},
		accept(value: unknown) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) {
				throw new Error('OpenAI Responses returned an invalid event.');
			}
			if (completed) return;
			const event = value as ResponseEvent;
			switch (event.type) {
				case 'error':
					throw responseError({ error: event.error }, 'error');
				case 'response.failed':
				case 'response.incomplete':
				case 'response.cancelled':
					throw responseError(event.response ?? {}, event.type);
				case 'response.output_text.delta':
					if (typeof event.delta !== 'string') {
						throw new Error('OpenAI Responses returned an invalid text delta.');
					}
					outputBytes += byteLength(event.delta);
					checkSize(outputBytes);
					text += event.delta;
					onChunk(event.delta);
					break;
				case 'response.completed': {
					const response = event.response ?? {};
					assertCompleted(response);
					if (!text) {
						const chunk = outputText(response);
						checkSize(byteLength(chunk));
						text = chunk;
						if (chunk) onChunk(chunk);
					}
					completed = true;
					break;
				}
			}
		},
	};
}

async function requestHttp(url: string, opts: RequestOptions) {
	const body = serialize({ ...opts.payload, stream: opts.stream });
	const controller = new AbortController();
	const abort = () => controller.abort(abortReason(opts.signal));
	opts.signal?.addEventListener('abort', abort, { once: true });
	if (opts.signal?.aborted) abort();
	const timer = setTimeout(
		() => controller.abort(new Error('OpenAI Responses request timed out.')),
		REQUEST_TIMEOUT_MS
	);
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${opts.apiKey.trim()}`,
				'Content-Type': 'application/json',
				Accept: opts.stream ? 'text/event-stream' : 'application/json',
			},
			body,
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(
				`OpenAI Responses API error (HTTP ${response.status}): ${await readBoundedText(response)}`
			);
		}
		if (!opts.stream) {
			const value: unknown = JSON.parse(await readBoundedText(response));
			if (!value || typeof value !== 'object' || Array.isArray(value)) {
				throw new Error('OpenAI Responses returned an invalid response.');
			}
			const payload = value as ResponsePayload;
			assertCompleted(payload);
			const text = outputText(payload);
			checkSize(byteLength(text));
			if (text) opts.onChunk(text);
			return text;
		}

		const accumulator = createAccumulator(opts.onChunk);
		await readSse(response, (data) => {
			if (data === '[DONE]') return accumulator.completed;
			accumulator.accept(JSON.parse(data));
			return accumulator.completed;
		});
		if (!accumulator.completed) {
			throw new Error(
				'OpenAI Responses stream closed before response.completed.'
			);
		}
		return accumulator.text;
	} finally {
		clearTimeout(timer);
		opts.signal?.removeEventListener('abort', abort);
	}
}

async function readBoundedText(response: Response) {
	checkSize(Number(response.headers.get('content-length') ?? 0));
	const reader =
		typeof TextDecoder === 'undefined' ? undefined : response.body?.getReader();
	if (!reader) {
		const text = await response.text();
		checkSize(byteLength(text));
		return text;
	}
	let bytes = 0;
	let text = '';
	const decoder = new TextDecoder();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return text + decoder.decode();
			bytes += value.byteLength;
			checkSize(bytes);
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

async function readSse(response: Response, onData: (data: string) => boolean) {
	let buffer = '';
	const drain = (final = false) => {
		// Normalize CRLF after buffering: separators can be split across chunks.
		buffer = buffer.replace(/\r\n/g, '\n');
		let index: number;
		while ((index = buffer.indexOf('\n\n')) >= 0 || (final && buffer)) {
			const block = index >= 0 ? buffer.slice(0, index) : buffer;
			buffer = index >= 0 ? buffer.slice(index + 2) : '';
			const data = block
				.split('\n')
				.filter((line) => line.startsWith('data:'))
				.map((line) => line.slice(5).trimStart())
				.join('\n');
			if (data.trim() && onData(data)) return true;
		}
		return false;
	};
	const reader =
		typeof TextDecoder === 'undefined' ? undefined : response.body?.getReader();
	if (!reader) {
		buffer = await readBoundedText(response);
		drain(true);
		return;
	}
	try {
		const decoder = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			checkSize(byteLength(buffer) + (value?.byteLength ?? 0));
			buffer += done
				? decoder.decode()
				: decoder.decode(value, { stream: true });
			checkSize(byteLength(buffer));
			if (drain(done) || done) return;
		}
	} finally {
		// Also release a live SSE body at the terminal event, not just at EOF.
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

function requestWebSocket(url: string, opts: RequestOptions): Promise<string> {
	const frame = serialize({ ...opts.payload, type: 'response.create' });
	return new Promise((resolve, reject) => {
		let socket: WebSocket | undefined;
		let settled = false;
		const accumulator = createAccumulator(opts.onChunk);
		const finish = (error?: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			opts.signal?.removeEventListener('abort', abort);
			if (socket) {
				socket.onopen = null;
				socket.onmessage = null;
				socket.onerror = null;
				socket.onclose = null;
				// No response.cancel frame: closing the isolated session is the
				// cancellation boundary supported by Responses WebSocket.
				try {
					socket.close();
				} catch {
					// Do not mask the response/transport error with close failures.
				}
			}
			if (error) reject(error);
			else resolve(accumulator.text);
		};
		const abort = () => finish(abortReason(opts.signal));
		const timer = setTimeout(
			() => finish(new Error('OpenAI Responses WebSocket request timed out.')),
			REQUEST_TIMEOUT_MS
		);
		opts.signal?.addEventListener('abort', abort, { once: true });
		if (opts.signal?.aborted) {
			abort();
			return;
		}
		try {
			// DOM typings omit RN's supported third argument.
			const NativeSocket = WebSocket as unknown as new (
				url: string,
				protocols: string[],
				options: { headers: Record<string, string> }
			) => WebSocket;
			socket = new NativeSocket(url, [], {
				headers: { Authorization: `Bearer ${opts.apiKey.trim()}` },
			});
			if (settled) {
				socket.close();
				return;
			}
			socket.onopen = () => {
				try {
					// No nested "response", stream, background, or credentials.
					socket!.send(frame);
				} catch {
					finish(
						new Error('OpenAI Responses WebSocket could not send the request.')
					);
				}
			};
			socket.onmessage = (event) => {
				try {
					if (typeof event.data !== 'string') {
						throw new Error('OpenAI Responses expected a JSON text frame.');
					}
					checkSize(byteLength(event.data));
					accumulator.accept(JSON.parse(event.data));
					if (accumulator.completed) finish();
				} catch (error) {
					finish(error);
				}
			};
			socket.onerror = () =>
				finish(
					new Error(
						'OpenAI Responses WebSocket connection failed. Check API key permissions, endpoint and network.'
					)
				);
			socket.onclose = () =>
				finish(
					new Error(
						'OpenAI Responses WebSocket closed before response.completed.'
					)
				);
		} catch {
			finish(
				new Error('OpenAI Responses WebSocket could not open the connection.')
			);
		}
	});
}
