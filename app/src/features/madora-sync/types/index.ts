export type SyncConnectionState =
	| 'disconnected'
	| 'discovering'
	| 'connecting'
	| 'authenticating'
	| 'syncing'
	| 'connected';

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

export interface StorageStats {
	trustedDevices: number;
}
