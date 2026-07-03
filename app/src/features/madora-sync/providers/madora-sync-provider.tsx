import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useErrorToast } from '@/components/ui/toast';

import {
	initializeDatabase,
	MADORA_SYNC_DB_NAME,
	readSettings,
	writeSetting,
} from '../services/database';
import {
	parsePairingPayload,
	type ExplorerNode,
	type PairingPayload,
	type ServerMessage,
} from '../lib/protocol';
import { SyncClient } from '../services/sync-client';
import type {
	PairedHost,
	StorageStats,
	SyncConnectionState,
	TrustedDevice,
} from '../types';

const LOCAL_DEVICE_ID = 'device-mobile-local';
const LOCAL_DEVICE_NAME = 'Madora Phone';

interface MadoraSyncContextValue {
	connectionState: SyncConnectionState;
	errorMessage: string | null;
	lastSyncAt: number | null;
	pairedHost: PairedHost | null;
	pairFromQrPayload: (raw: string) => Promise<boolean>;
	pairWithPayload: (payload: PairingPayload) => Promise<boolean>;
	reconnect: () => void;
	disconnect: () => void;
	ready: boolean;
	refreshRemoteFileTree: (path?: string) => Promise<ExplorerNode[]>;
	readRemoteFile: (path: string) => Promise<{
		content: string | null;
		encoding: string | null;
		truncated: boolean;
	}>;
	writeRemoteFile: (path: string, content: string) => Promise<boolean>;
	storageStats: StorageStats;
	trustedDevices: TrustedDevice[];
	removeTrustedDevice: (id: string) => Promise<void>;
}

const MadoraSyncContext = createContext<MadoraSyncContextValue | null>(null);

export function MadoraSyncProvider({ children }: { children: ReactNode }) {
	const showErrorToast = useErrorToast();
	const [ready, setReady] = useState(false);
	const [db, setDb] = useState<SQLiteDatabase | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [connectionState, setConnectionState] =
		useState<SyncConnectionState>('disconnected');
	const [pairedHost, setPairedHost] = useState<PairedHost | null>(null);
	const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
	const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

	const clientRef = useRef<SyncClient | null>(null);

	const storageStats = useMemo<StorageStats>(
		() => ({
			trustedDevices: trustedDevices.length,
		}),
		[trustedDevices.length]
	);

	useEffect(() => {
		if (!errorMessage) return;
		showErrorToast(errorMessage);
	}, [errorMessage, showErrorToast]);

	useEffect(() => {
		let cancelled = false;

		async function setupDatabase() {
			try {
				const database = await SQLite.openDatabaseAsync(MADORA_SYNC_DB_NAME);
				await initializeDatabase(database);
				if (cancelled) return;

				const settings = await readSettings(database);

				if (settings.paired_host_json) {
					try {
						const stored = JSON.parse(settings.paired_host_json) as PairedHost;
						setPairedHost(stored);
					} catch {
						// ignore corrupt entry
					}
				}

				if (settings.last_sync_at) {
					setLastSyncAt(Number(settings.last_sync_at));
				}

				const devices = await database.getAllAsync<{
					address: string;
					id: string;
					kind: 'desktop' | 'mobile';
					last_seen: number;
					name: string;
					token: string;
					trusted: number;
				}>(
					'SELECT id, name, kind, last_seen, trusted, token, address FROM devices ORDER BY last_seen DESC'
				);
				setTrustedDevices(
					devices.map((device) => ({
						address: device.address,
						id: device.id,
						kind: device.kind,
						lastSeen: device.last_seen,
						name: device.name,
						token: device.token,
						trusted: device.trusted === 1,
					}))
				);

				setDb(database);
				setReady(true);
			} catch (error) {
				if (cancelled) return;
				setErrorMessage(
					error instanceof Error
						? error.message
						: 'Failed to open sync database'
				);
			}
		}

		void setupDatabase();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleServerMessage = useCallback(
		(message: ServerMessage) => {
			if (message.type === 'file_list_result') {
				const syncedAt = Date.now();
				setLastSyncAt(syncedAt);
				if (db) {
					void writeSetting(db, 'last_sync_at', String(syncedAt));
				}
				return;
			}

			if (message.type === 'error') {
				setErrorMessage(message.message);
				return;
			}

			if (message.type === 'auth_error') {
				setErrorMessage(message.message);
			}
		},
		[db]
	);

	const connectToHost = useCallback(
		(host: PairedHost) => {
			clientRef.current?.disconnect();

			const client = new SyncClient({
				deviceId: LOCAL_DEVICE_ID,
				deviceName: LOCAL_DEVICE_NAME,
			});
			clientRef.current = client;

			client.onStateChange((state) => {
				setConnectionState(state);
				if (state === 'connected') {
					setErrorMessage(null);
				}
			});

			client.onMessage(handleServerMessage);

			client.connect({
				code: host.code,
				deviceName: host.name,
				expiresAt: new Date(host.pairedAt + 10 * 60 * 1000).toISOString(),
				host: host.host,
				pairingId: host.pairingId,
				pairingToken: host.pairingToken,
				port: host.port,
			});
		},
		[handleServerMessage]
	);

	useEffect(() => {
		if (!ready || !pairedHost || clientRef.current) {
			return;
		}
		connectToHost(pairedHost);
	}, [connectToHost, pairedHost, ready]);

	useEffect(() => {
		return () => {
			clientRef.current?.disconnect();
			clientRef.current = null;
		};
	}, []);

	const persistPairedHost = useCallback(
		async (host: PairedHost | null) => {
			if (!db) return;
			await writeSetting(db, 'paired_host_id', host?.id ?? '');
			await writeSetting(
				db,
				'paired_host_json',
				host ? JSON.stringify(host) : ''
			);
		},
		[db]
	);

	const pairWithPayload = useCallback(
		async (payload: PairingPayload): Promise<boolean> => {
			const host: PairedHost = {
				code: payload.code,
				host: payload.host,
				id: `${payload.host}:${payload.port}`,
				name: payload.deviceName,
				pairedAt: Date.now(),
				pairingId: payload.pairingId,
				pairingToken: payload.pairingToken,
				port: payload.port,
			};

			setPairedHost(host);
			setTrustedDevices((current) => {
				const next = current.filter((device) => device.id !== host.id);
				return [
					{
						address: `${host.host}:${host.port}`,
						id: host.id,
						kind: 'desktop' as const,
						lastSeen: Date.now(),
						name: host.name,
						token: host.pairingToken,
						trusted: true,
					},
					...next,
				];
			});

			if (db) {
				const now = Date.now();
				await db.runAsync(
					'INSERT INTO devices (id, name, kind, last_seen, trusted, token, address) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen, trusted = excluded.trusted, token = excluded.token, address = excluded.address',
					host.id,
					host.name,
					'desktop',
					now,
					1,
					host.pairingToken,
					`${host.host}:${host.port}`
				);
			}

			await persistPairedHost(host);
			connectToHost(host);
			return true;
		},
		[connectToHost, db, persistPairedHost]
	);

	const pairFromQrPayload = useCallback(
		async (raw: string): Promise<boolean> => {
			const parsed = parsePairingPayload(raw);
			if (!parsed) {
				setErrorMessage('Invalid pairing QR code');
				return false;
			}

			setErrorMessage(null);
			return pairWithPayload(parsed);
		},
		[pairWithPayload]
	);

	const disconnect = useCallback(() => {
		clientRef.current?.disconnect();
		clientRef.current = null;
		setPairedHost(null);
		setConnectionState('disconnected');
		setErrorMessage(null);
		void persistPairedHost(null);
	}, [persistPairedHost]);

	const reconnect = useCallback(() => {
		if (!pairedHost) return;
		setErrorMessage(null);
		connectToHost(pairedHost);
	}, [connectToHost, pairedHost]);

	const removeTrustedDevice = useCallback(
		async (id: string) => {
			if (!db) return;
			try {
				await db.runAsync('DELETE FROM devices WHERE id = ?', id);
				setTrustedDevices((current) => current.filter((d) => d.id !== id));
				if (pairedHost?.id === id) {
					clientRef.current?.disconnect();
					clientRef.current = null;
					setPairedHost(null);
					setConnectionState('disconnected');
					setErrorMessage(null);
					await persistPairedHost(null);
				}
			} catch (error) {
				showErrorToast(
					error instanceof Error
						? error.message
						: 'Failed to remove trusted device'
				);
			}
		},
		[db, pairedHost?.id, persistPairedHost, showErrorToast]
	);

	const refreshRemoteFileTree = useCallback(
		async (path?: string) => {
			const client = clientRef.current;
			if (!client || !client.isConnected) {
				const message = 'Not connected';
				setErrorMessage(message);
				throw new Error(message);
			}

			try {
				const reqPath = path ?? '';
				const response = await client.request(
					{ type: 'file_list', path: reqPath },
					`file_list:${reqPath}`
				);
				if (response.type !== 'file_list_result') {
					if (response.type === 'error' || response.type === 'auth_error') {
						setErrorMessage(response.message);
						throw new Error(response.message);
					}
					throw new Error('Unexpected response type');
				}

				handleServerMessage(response);
				return response.tree;
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Failed to refresh files';
				setErrorMessage(message);
				throw new Error(message);
			}
		},
		[handleServerMessage]
	);

	const readRemoteFile = useCallback(async (path: string) => {
		const client = clientRef.current;
		if (!client || !client.isConnected) throw new Error('Not connected');

		const response = await client.request(
			{ type: 'file_read', path },
			`file_read:${path}`
		);

		if (response.type !== 'file_read_result') {
			if (response.type === 'error') {
				throw new Error(response.message);
			}
			throw new Error('Unexpected response type');
		}

		return {
			content: response.content,
			encoding: response.encoding,
			truncated: response.truncated,
		};
	}, []);

	const writeRemoteFile = useCallback(async (path: string, content: string) => {
		const client = clientRef.current;
		if (!client || !client.isConnected) throw new Error('Not connected');

		const response = await client.request(
			{ type: 'file_write', path, content },
			`file_write:${path}`
		);

		if (response.type !== 'file_write_result') {
			if (response.type === 'error') {
				throw new Error(response.message);
			}
			throw new Error('Unexpected response type');
		}

		if (!response.ok) {
			throw new Error(response.error ?? 'Write failed');
		}

		return true;
	}, []);

	const value = useMemo<MadoraSyncContextValue>(
		() => ({
			connectionState,
			errorMessage,
			lastSyncAt,
			pairedHost,
			pairFromQrPayload,
			pairWithPayload,
			reconnect,
			disconnect,
			ready,
			refreshRemoteFileTree,
			readRemoteFile,
			writeRemoteFile,
			storageStats,
			trustedDevices,
			removeTrustedDevice,
		}),
		[
			connectionState,
			errorMessage,
			lastSyncAt,
			pairedHost,
			pairFromQrPayload,
			pairWithPayload,
			reconnect,
			disconnect,
			ready,
			refreshRemoteFileTree,
			readRemoteFile,
			writeRemoteFile,
			storageStats,
			trustedDevices,
			removeTrustedDevice,
		]
	);

	return (
		<MadoraSyncContext.Provider value={value}>
			{children}
		</MadoraSyncContext.Provider>
	);
}

export function useMadoraSync() {
	const value = useContext(MadoraSyncContext);
	if (!value) {
		throw new Error('useMadoraSync must be used within MadoraSyncProvider');
	}
	return value;
}
