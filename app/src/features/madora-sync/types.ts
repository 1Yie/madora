export type SyncConnectionState =
	| 'disconnected'
	| 'discovering'
	| 'connecting'
	| 'authenticating'
	| 'syncing'
	| 'connected';

/** A file from the paired desktop workspace. */
export interface SyncDocument {
	id: string;
	title: string;
	path: string;
	content: string;
	updatedAt: number;
}

export interface PendingUpdate {
	id: string;
	docId: string;
	createdAt: number;
	syncState: 'pending' | 'synced';
	bytes: number;
}

/** The paired desktop host (from QR payload). */
export interface PairedHost {
	id: string;
	name: string;
	host: string;
	port: number;
	/** Raw pairing token retained for reconnection. */
	pairingToken: string;
	pairingId: string;
	code: string;
	pairedAt: number;
}

export interface TrustedDevice {
	id: string;
	name: string;
	kind: 'desktop' | 'mobile';
	lastSeen: number;
	trusted: boolean;
	token: string;
	address: string;
}

export interface AiCompletionResult {
	status: 'idle' | 'requesting' | 'ready' | 'error';
	completion: string;
	model: string;
	message: string;
	requestedAt: number | null;
}

export interface StorageStats {
	documents: number;
	pendingUpdates: number;
	trustedDevices: number;
}
