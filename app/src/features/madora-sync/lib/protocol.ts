/**
 * Madora sync protocol — shared message types and QR payload parsing.
 *
 * These mirror the Rust types in `src-tauri/src/models/sync_server.rs` and
 * `models/explorer.rs`. Keep both sides in sync when changing fields.
 */

// ─── QR payload ──────────────────────────────────────────────────────────

/**
 * Parsed `madora-sync://pair?...` QR payload.
 *
 * Format produced by the desktop's `MadoraSyncStore::build_pairing_payload`:
 *   madora-sync://pair?host={host}&port={port}&pairingId={pairingId}
 *     &pairingToken={pairingToken}&code={code}&deviceName={deviceName}
 *     &expiresAt={expiresAt}
 */
export interface PairingPayload {
	host: string;
	port: number;
	protocol?: SyncTransportProtocol;
	path?: string;
	pairingId: string;
	pairingToken: string;
	code: string;
	deviceName: string;
	expiresAt: string;
}

export type SyncTransportProtocol = 'ws' | 'wss';

export interface PairingEndpoint {
	host: string;
	port: number;
	protocol: SyncTransportProtocol;
	path: string;
}

const PAIRING_SCHEME = 'madora-sync://pair?';
const SUPPORTED_ENDPOINT_PROTOCOLS = new Set(['http:', 'https:']);

function protocolFromUrlProtocol(
	protocol: string
): SyncTransportProtocol | null {
	switch (protocol) {
		case 'http:':
			return 'ws';
		case 'https:':
			return 'wss';
		default:
			return null;
	}
}

function defaultPortForProtocol(protocol: SyncTransportProtocol): number {
	return protocol === 'wss' ? 443 : 80;
}

export function parsePairingEndpoint(
	rawAddress: string,
	fallbackPort?: number | null
): PairingEndpoint | null {
	const address = rawAddress.trim();
	if (!address) return null;

	const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(address);
	const candidate = hasProtocol ? address : `http://${address}`;

	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return null;
	}

	if (!SUPPORTED_ENDPOINT_PROTOCOLS.has(url.protocol)) {
		return null;
	}

	const protocol = protocolFromUrlProtocol(url.protocol);
	const host = url.hostname;
	if (!protocol || !host) return null;
	if (url.pathname !== '/' || url.search || url.hash) return null;

	const explicitPort = url.port ? Number(url.port) : null;
	const port = explicitPort ?? fallbackPort ?? null;
	const resolvedPort = port ?? defaultPortForProtocol(protocol);
	if (
		!Number.isInteger(resolvedPort) ||
		resolvedPort <= 0 ||
		resolvedPort > 65535
	) {
		return null;
	}

	return {
		host,
		path: '',
		port: resolvedPort,
		protocol,
	};
}

export function formatPairingEndpoint(endpoint: {
	host: string;
	path?: string | null;
	port: number;
	protocol?: SyncTransportProtocol | null;
}): string {
	const protocol = endpoint.protocol ?? 'ws';
	const displayProtocol = protocol === 'wss' ? 'https' : 'http';
	const host =
		endpoint.host.includes(':') && !endpoint.host.startsWith('[')
			? `[${endpoint.host}]`
			: endpoint.host;
	return `${displayProtocol}://${host}:${endpoint.port}`;
}

export function formatSyncDisplayAddress(address: string): string {
	return address
		.trim()
		.replace(/^wss:\/\//i, 'https://')
		.replace(/^ws:\/\//i, 'http://');
}

export function buildWebSocketUrl(payload: PairingPayload): string {
	const protocol = payload.protocol ?? 'ws';
	const host =
		payload.host.includes(':') && !payload.host.startsWith('[')
			? `[${payload.host}]`
			: payload.host;
	const path = payload.path ?? '';
	return `${protocol}://${host}:${payload.port}${path}`;
}

/** Parse a scanned QR string into a {@link PairingPayload}, or null if invalid. */
export function parsePairingPayload(raw: string): PairingPayload | null {
	const index = raw.indexOf(PAIRING_SCHEME);
	if (index < 0) {
		return null;
	}

	const query = raw.slice(index + PAIRING_SCHEME.length);
	const params = new URLSearchParams(query);

	const host = params.get('host');
	const port = Number(params.get('port'));
	const pairingId = params.get('pairingId');
	const pairingToken = params.get('pairingToken');
	const code = params.get('code');
	const deviceName = params.get('deviceName');
	const expiresAt = params.get('expiresAt');
	const rawProtocol = params.get('protocol');
	const protocol =
		rawProtocol === 'ws' || rawProtocol === 'wss' ? rawProtocol : undefined;
	const path = params.get('path') ?? undefined;

	if (
		!host ||
		!Number.isFinite(port) ||
		!pairingId ||
		!pairingToken ||
		!code ||
		!deviceName ||
		!expiresAt
	) {
		return null;
	}

	return {
		code,
		deviceName,
		expiresAt,
		host,
		pairingId,
		pairingToken,
		path,
		port,
		protocol,
	};
}

// ─── File tree (mirrors Rust ExplorerNode) ───────────────────────────────

export type ExplorerNodeKind = 'directory' | 'file';
export type ExplorerFileKind = 'image' | 'markdown' | 'text';

export interface ExplorerNode {
	name: string;
	path: string;
	relativePath: string;
	kind: ExplorerNodeKind;
	fileKind: ExplorerFileKind | null;
	hasChildren: boolean;
	loaded: boolean;
	children: ExplorerNode[];
}

// ─── Client → Host messages ──────────────────────────────────────────────

export interface AuthMessage {
	type: 'auth';
	pairingId: string;
	pairingToken: string;
	code: string;
	deviceId: string;
	deviceName: string;
	platform: string;
}

export interface FileListMessage {
	type: 'file_list';
	path?: string;
}

export interface FileReadMessage {
	type: 'file_read';
	path: string;
}

export interface FileWriteMessage {
	type: 'file_write';
	path: string;
	content: string;
}

export interface AiCompleteMessage {
	type: 'ai_complete';
	docId: string;
	title?: string;
	prefix: string;
	suffix?: string;
}

export interface EditorStateMessage {
	type: 'editor_state';
	deviceId: string;
	deviceName: string;
	source: 'app' | 'desktop' | string;
	filePath: string | null;
	title: string | null;
	content: string | null;
	contentHash: string | null;
	line: number | null;
	column: number | null;
	cursorIndex: number | null;
	editing: boolean;
	updatedAt: number;
}

export type ClientMessage =
	| AuthMessage
	| FileListMessage
	| FileReadMessage
	| FileWriteMessage
	| AiCompleteMessage
	| EditorStateMessage;

// ─── Host → Client messages ──────────────────────────────────────────────

export interface AuthOkMessage {
	type: 'auth_ok';
	deviceName: string;
	shareAiCompletions?: boolean;
	hostDeviceName?: string | null;
	pairingToken?: string | null;
}

export interface AuthErrorMessage {
	type: 'auth_error';
	message: string;
}

export interface FileListResultMessage {
	type: 'file_list_result';
	path: string;
	tree: ExplorerNode[];
}

export interface FileReadResultMessage {
	type: 'file_read_result';
	path: string;
	content: string | null;
	encoding: string | null;
	imageDataUrl: string | null;
	truncated: boolean;
}

export interface FileWriteResultMessage {
	type: 'file_write_result';
	path: string;
	ok: boolean;
	error?: string;
}

export interface AiResultMessage {
	type: 'ai_result';
	docId: string;
	completion: string;
	error?: string;
}

export interface ErrorMessage {
	type: 'error';
	message: string;
	code?: string;
}

export type ServerMessage =
	| AuthOkMessage
	| AuthErrorMessage
	| FileListResultMessage
	| FileReadResultMessage
	| FileWriteResultMessage
	| AiResultMessage
	| EditorStateMessage
	| ErrorMessage;

/** Type guard — safely parse an inbound JSON string into a ServerMessage. */
export function parseServerMessage(raw: string): ServerMessage | null {
	try {
		const parsed = JSON.parse(raw) as { type?: string };
		if (!parsed.type) {
			return null;
		}
		return parsed as ServerMessage;
	} catch {
		return null;
	}
}
