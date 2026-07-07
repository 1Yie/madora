import type { SyncTransportProtocol } from '../lib/protocol';

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
	protocol?: SyncTransportProtocol;
	path?: string;
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

export interface ManualPairingInput {
	address: string;
	port?: number | null;
	code: string;
}
