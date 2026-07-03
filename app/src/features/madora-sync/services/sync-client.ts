/**
 * WebSocket sync client for Madora.
 *
 * Manages the connection lifecycle to the desktop sync server: connect,
 * authenticate, send requests, receive responses, and reconnect with
 * exponential backoff on drop.
 */

import { Platform } from 'react-native';

import {
	parseServerMessage,
	type ClientMessage,
	type PairingPayload,
	type ServerMessage,
} from '../lib/protocol';
import type { SyncConnectionState } from '../types';

const BACKOFF_STEPS = [1000, 2000, 5000, 10000, 30000];
const REQUEST_TIMEOUT = 15000;

type ConnectionStateListener = (state: SyncConnectionState) => void;
type MessageListener = (message: ServerMessage) => void;
type DisconnectListener = () => void;

export interface SyncClientOptions {
	deviceId: string;
	deviceName: string;
}

export class SyncClient {
	private ws: WebSocket | null = null;
	private payload: PairingPayload | null = null;
	private options: SyncClientOptions;

	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private backoffIndex = 0;
	private intentionallyClosed = false;

	private stateListeners = new Set<ConnectionStateListener>();
	private messageListeners = new Set<MessageListener>();
	private disconnectListeners = new Set<DisconnectListener>();

	/** Pending request-response promises keyed by an id derived from message type+path. */
	private pending = new Map<
		string,
		{
			resolve: (m: ServerMessage) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

	private connectionState: SyncConnectionState = 'disconnected';

	constructor(options: SyncClientOptions) {
		this.options = options;
	}

	// ─── Public API ────────────────────────────────────────────────────────

	get state(): SyncConnectionState {
		return this.connectionState;
	}

	/** Pair + connect using a scanned QR payload. Replaces any active connection. */
	connect(payload: PairingPayload): void {
		this.payload = payload;
		this.intentionallyClosed = false;
		this.backoffIndex = 0;
		this.cleanupSocket();
		this.openSocket();
	}

	/** Disconnect and do not reconnect. */
	disconnect(): void {
		this.intentionallyClosed = true;
		this.clearReconnectTimer();
		this.cleanupSocket();
		this.setState('disconnected');
	}

	/** True when authenticated and ready to exchange messages. */
	get isConnected(): boolean {
		return this.connectionState === 'connected';
	}

	onStateChange(listener: ConnectionStateListener): () => void {
		this.stateListeners.add(listener);
		return () => this.stateListeners.delete(listener);
	}

	onMessage(listener: MessageListener): () => void {
		this.messageListeners.add(listener);
		return () => this.messageListeners.delete(listener);
	}

	onDisconnect(listener: DisconnectListener): () => void {
		this.disconnectListeners.add(listener);
		return () => this.disconnectListeners.delete(listener);
	}

	/** Send a message that does not expect a correlated response. */
	send(message: ClientMessage): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Send a request and await the correlated response.
	 * `correlationKey` identifies which inbound message resolves this promise.
	 */
	request(
		message: ClientMessage,
		correlationKey: string
	): Promise<ServerMessage> {
		return new Promise((resolve, reject) => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				reject(new Error('Not connected'));
				return;
			}

			const existing = this.pending.get(correlationKey);
			if (existing) {
				clearTimeout(existing.timer);
			}

			const timer = setTimeout(() => {
				this.pending.delete(correlationKey);
				reject(new Error('Request timed out'));
			}, REQUEST_TIMEOUT);

			this.pending.set(correlationKey, { resolve, timer });
			this.ws.send(JSON.stringify(message));
		});
	}

	/** Resolve a pending request from an inbound message. */
	resolvePending(correlationKey: string, message: ServerMessage): void {
		const entry = this.pending.get(correlationKey);
		if (entry) {
			clearTimeout(entry.timer);
			this.pending.delete(correlationKey);
			entry.resolve(message);
		}
	}

	resolveAllPending(message: ServerMessage): void {
		for (const [, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.resolve(message);
		}
		this.pending.clear();
	}

	// ─── Internal ──────────────────────────────────────────────────────────

	private openSocket(): void {
		const payload = this.payload;
		if (!payload) {
			return;
		}

		const url = `ws://${payload.host}:${payload.port}`;
		this.setState('connecting');

		let ws: WebSocket;
		try {
			ws = new WebSocket(url);
		} catch (error) {
			this.scheduleReconnect();
			return;
		}

		this.ws = ws;

		ws.onopen = () => {
			this.setState('authenticating');
			this.send({
				type: 'auth',
				pairingId: payload.pairingId,
				pairingToken: payload.pairingToken,
				code: payload.code,
				deviceId: this.options.deviceId,
				deviceName: this.options.deviceName,
				platform: Platform.OS,
			});
		};

		ws.onmessage = (event: WebSocketMessageEvent) => {
			const raw = typeof event.data === 'string' ? event.data : '';
			const message = parseServerMessage(raw);
			if (!message) {
				return;
			}

			// Auth handshake outcomes
			if (message.type === 'auth_ok') {
				this.backoffIndex = 0;
				this.setState('connected');
				this.emitMessage(message);
				return;
			}

			if (message.type === 'auth_error') {
				// Auth failed — do not reconnect (credentials are wrong, not a transient failure).
				this.intentionallyClosed = true;
				this.resolveAllPending(message);
				this.emitMessage(message);
				this.cleanupSocket();
				this.setState('disconnected');
				return;
			}

			if (message.type === 'error') {
				this.resolveAllPending(message);
				this.emitMessage(message);
				return;
			}

			// Correlate responses
			const key = correlationKeyFor(message);
			if (key) {
				this.resolvePending(key, message);
			}

			this.emitMessage(message);
		};

		ws.onerror = () => {
			// onclose will follow; handled there.
		};

		ws.onclose = () => {
			this.failAllPending('Connection closed');
			if (!this.intentionallyClosed) {
				this.setState('disconnected');
				this.emitDisconnect();
				this.scheduleReconnect();
			} else {
				this.setState('disconnected');
			}
		};
	}

	private scheduleReconnect(): void {
		if (this.intentionallyClosed) {
			return;
		}

		this.clearReconnectTimer();
		const delay =
			BACKOFF_STEPS[Math.min(this.backoffIndex, BACKOFF_STEPS.length - 1)];
		this.backoffIndex += 1;
		this.setState('discovering');
		this.reconnectTimer = setTimeout(() => {
			this.openSocket();
		}, delay);
	}

	private cleanupSocket(): void {
		if (this.ws) {
			this.ws.onopen = null;
			this.ws.onmessage = null;
			this.ws.onerror = null;
			this.ws.onclose = null;
			try {
				this.ws.close();
			} catch {
				// ignore
			}
			this.ws = null;
		}
		this.failAllPending('Connection reset');
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private failAllPending(reason: string): void {
		for (const [, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.resolve({
				type: 'error',
				message: reason,
			} as ServerMessage);
		}
		this.pending.clear();
	}

	private setState(state: SyncConnectionState): void {
		if (this.connectionState === state) {
			return;
		}
		this.connectionState = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	private emitMessage(message: ServerMessage): void {
		for (const listener of this.messageListeners) {
			listener(message);
		}
	}

	private emitDisconnect(): void {
		for (const listener of this.disconnectListeners) {
			listener();
		}
	}
}

/** Derive the correlation key for a response message so `request()` can resolve it. */
function correlationKeyFor(message: ServerMessage): string | null {
	switch (message.type) {
		case 'file_list_result':
			return `file_list:${message.path}`;
		case 'file_read_result':
			return `file_read:${message.path}`;
		case 'file_write_result':
			return `file_write:${message.path}`;
		case 'ai_result':
			return `ai:${message.docId}`;
		default:
			return null;
	}
}
