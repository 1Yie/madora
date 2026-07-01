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
	pairingId: string;
	pairingToken: string;
	code: string;
	deviceName: string;
	expiresAt: string;
}

const PAIRING_SCHEME = 'madora-sync://pair?';

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

	return { host, port, pairingId, pairingToken, code, deviceName, expiresAt };
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

export type ClientMessage =
	| AuthMessage
	| FileListMessage
	| FileReadMessage
	| FileWriteMessage
	| AiCompleteMessage;

// ─── Host → Client messages ──────────────────────────────────────────────

export interface AuthOkMessage {
	type: 'auth_ok';
	deviceName: string;
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
