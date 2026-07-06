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
import { useTranslation } from 'react-i18next';
import { useErrorToast } from '@/components/ui/toast';

import {
	deleteTrustedDevice,
	initializeDatabase,
	listTrustedDevices,
	LOCAL_DEVICE_ID,
	MADORA_SYNC_DB_NAME,
	readSettings,
	upsertTrustedDevice,
	writeSetting,
} from '../services/database';
import {
	parsePairingPayload,
	type EditorStateMessage,
	type ExplorerNode,
	type PairingPayload,
	type ServerMessage,
} from '../lib/protocol';
import { SyncClient } from '../services/sync-client';
import type { PairedHost, SyncConnectionState, TrustedDevice } from '../types';

interface MadoraSyncContextValue {
	connectionState: SyncConnectionState;
	errorMessage: string | null;
	lastSyncAt: number | null;
	localDeviceName: string;
	pairedHost: PairedHost | null;
	pairFromQrPayload: (raw: string) => Promise<boolean>;
	pairWithPayload: (payload: PairingPayload) => Promise<boolean>;
	publishEditorState: (state: EditorStateInput) => void;
	setLocalDeviceName: (name: string) => Promise<void>;
	reconnect: () => void;
	disconnect: () => void;
	ready: boolean;
	remoteEditorState: EditorStateMessage | null;
	refreshRemoteFileTree: (path?: string) => Promise<ExplorerNode[]>;
	readRemoteFile: (path: string) => Promise<{
		content: string | null;
		encoding: string | null;
		truncated: boolean;
	}>;
	writeRemoteFile: (path: string, content: string) => Promise<boolean>;
	trustedDevices: TrustedDevice[];
	removeTrustedDevice: (id: string) => Promise<void>;
}

export type EditorStateInput = {
	filePath: string | null;
	title: string | null;
	content: string | null;
	contentHash: string | null;
	line: number | null;
	column: number | null;
	cursorIndex: number | null;
	editing: boolean;
};

const MadoraSyncContext = createContext<MadoraSyncContextValue | null>(null);

type SyncErrorKey =
	| 'authError'
	| 'connectionClosed'
	| 'connectionReset'
	| 'invalidQr'
	| 'notConnected'
	| 'openDatabaseFailed'
	| 'refreshFilesFailed'
	| 'removeTrustedFailed'
	| 'serverError'
	| 'unexpectedResponse'
	| 'writeFailed';

const SYNC_ERROR_MESSAGE_KEYS: Record<string, SyncErrorKey> = {
	'Connection closed': 'connectionClosed',
	'Connection reset': 'connectionReset',
	'Invalid pairing QR code': 'invalidQr',
	'Not connected': 'notConnected',
	'Unexpected response type': 'unexpectedResponse',
	'Write failed': 'writeFailed',
};

export function MadoraSyncProvider({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const showErrorToast = useErrorToast();
	const defaultLocalDeviceName = t('syncSettings.localDevice.defaultName');
	const [ready, setReady] = useState(false);
	const [db, setDb] = useState<SQLiteDatabase | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [connectionState, setConnectionState] =
		useState<SyncConnectionState>('disconnected');
	const [pairedHost, setPairedHost] = useState<PairedHost | null>(null);
	const [remoteEditorState, setRemoteEditorState] =
		useState<EditorStateMessage | null>(null);
	const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
	const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
	const [localDeviceName, setLocalDeviceNameState] = useState(
		defaultLocalDeviceName
	);

	const clientRef = useRef<SyncClient | null>(null);
	const syncError = useCallback(
		(key: SyncErrorKey) => t(`syncSettings.errors.${key}`),
		[t]
	);
	const getLocalizedSyncError = useCallback(
		(error: unknown, fallbackKey: SyncErrorKey) => {
			const message =
				error instanceof Error
					? error.message
					: typeof error === 'string'
						? error
						: '';
			return syncError(SYNC_ERROR_MESSAGE_KEYS[message] ?? fallbackKey);
		},
		[syncError]
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
				await initializeDatabase(database, defaultLocalDeviceName);
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
				if (settings.local_device_name?.trim()) {
					setLocalDeviceNameState(settings.local_device_name.trim());
				}

				const devices = await listTrustedDevices(database);
				setTrustedDevices(devices);

				setDb(database);
				setReady(true);
			} catch (error) {
				if (cancelled) return;
				setErrorMessage(getLocalizedSyncError(error, 'openDatabaseFailed'));
			}
		}

		void setupDatabase();
		return () => {
			cancelled = true;
		};
	}, [defaultLocalDeviceName, getLocalizedSyncError]);

	const handleServerMessage = useCallback(
		(message: ServerMessage) => {
			if (message.type === 'file_list_result') {
				const syncedAt = Date.now();
				setLastSyncAt(syncedAt);
				if (db) {
					void writeSetting(db, 'last_sync_at', String(syncedAt)).catch(
						() => undefined
					);
				}
				return;
			}

			if (message.type === 'error') {
				setErrorMessage(getLocalizedSyncError(message.message, 'serverError'));
				return;
			}

			if (message.type === 'auth_error') {
				setErrorMessage(getLocalizedSyncError(message.message, 'authError'));
				return;
			}

			if (message.type === 'editor_state') {
				if (message.deviceId === LOCAL_DEVICE_ID) {
					return;
				}
				setRemoteEditorState(message);
			}
		},
		[db, getLocalizedSyncError]
	);

	const connectToHost = useCallback(
		(host: PairedHost, deviceName = localDeviceName) => {
			clientRef.current?.disconnect();

			const client = new SyncClient({
				deviceId: LOCAL_DEVICE_ID,
				deviceName,
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
		[handleServerMessage, localDeviceName]
	);

	const setLocalDeviceName = useCallback(
		async (name: string) => {
			const nextName = name.trim() || defaultLocalDeviceName;
			setLocalDeviceNameState(nextName);
			if (db) {
				await writeSetting(db, 'local_device_name', nextName);
			}

			if (pairedHost && clientRef.current) {
				connectToHost(pairedHost, nextName);
			}
		},
		[connectToHost, db, defaultLocalDeviceName, pairedHost]
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
				await upsertTrustedDevice(db, {
					address: `${host.host}:${host.port}`,
					id: host.id,
					kind: 'desktop',
					lastSeen: now,
					name: host.name,
					token: host.pairingToken,
					trusted: true,
				});
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
				setErrorMessage(syncError('invalidQr'));
				return false;
			}

			setErrorMessage(null);
			return pairWithPayload(parsed);
		},
		[pairWithPayload, syncError]
	);

	const disconnect = useCallback(() => {
		clientRef.current?.disconnect();
		clientRef.current = null;
		setPairedHost(null);
		setConnectionState('disconnected');
		setRemoteEditorState(null);
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
				await deleteTrustedDevice(db, id);
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
				showErrorToast(getLocalizedSyncError(error, 'removeTrustedFailed'));
			}
		},
		[db, getLocalizedSyncError, pairedHost, persistPairedHost, showErrorToast]
	);

	const refreshRemoteFileTree = useCallback(
		async (path?: string) => {
			const client = clientRef.current;
			if (!client || !client.isConnected) {
				const message = syncError('notConnected');
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
						const message = getLocalizedSyncError(
							response.message,
							response.type === 'auth_error' ? 'authError' : 'serverError'
						);
						setErrorMessage(message);
						throw new Error(message);
					}
					throw new Error(syncError('unexpectedResponse'));
				}

				handleServerMessage(response);
				return response.tree;
			} catch (error) {
				const message = getLocalizedSyncError(error, 'refreshFilesFailed');
				setErrorMessage(message);
				throw new Error(message, { cause: error });
			}
		},
		[getLocalizedSyncError, handleServerMessage, syncError]
	);

	const readRemoteFile = useCallback(
		async (path: string) => {
			const client = clientRef.current;
			if (!client || !client.isConnected)
				throw new Error(syncError('notConnected'));

			const response = await client.request(
				{ type: 'file_read', path },
				`file_read:${path}`
			);

			if (response.type !== 'file_read_result') {
				if (response.type === 'error') {
					throw new Error(
						getLocalizedSyncError(response.message, 'serverError')
					);
				}
				throw new Error(syncError('unexpectedResponse'));
			}

			return {
				content: response.content,
				encoding: response.encoding,
				truncated: response.truncated,
			};
		},
		[getLocalizedSyncError, syncError]
	);

	const writeRemoteFile = useCallback(
		async (path: string, content: string) => {
			const client = clientRef.current;
			if (!client || !client.isConnected)
				throw new Error(syncError('notConnected'));

			const response = await client.request(
				{ type: 'file_write', path, content },
				`file_write:${path}`
			);

			if (response.type !== 'file_write_result') {
				if (response.type === 'error') {
					throw new Error(
						getLocalizedSyncError(response.message, 'serverError')
					);
				}
				throw new Error(syncError('unexpectedResponse'));
			}

			if (!response.ok) {
				throw new Error(
					response.error
						? getLocalizedSyncError(response.error, 'writeFailed')
						: syncError('writeFailed')
				);
			}

			return true;
		},
		[getLocalizedSyncError, syncError]
	);

	const publishEditorState = useCallback(
		(state: EditorStateInput) => {
			const client = clientRef.current;
			if (!client?.isConnected) return;

			client.send({
				type: 'editor_state',
				deviceId: LOCAL_DEVICE_ID,
				deviceName: localDeviceName,
				source: 'app',
				filePath: state.filePath,
				title: state.title,
				content: state.content,
				contentHash: state.contentHash,
				line: state.line,
				column: state.column,
				cursorIndex: state.cursorIndex,
				editing: state.editing,
				updatedAt: Date.now(),
			});
		},
		[localDeviceName]
	);

	const value = useMemo<MadoraSyncContextValue>(
		() => ({
			connectionState,
			errorMessage,
			lastSyncAt,
			localDeviceName,
			pairedHost,
			pairFromQrPayload,
			pairWithPayload,
			publishEditorState,
			setLocalDeviceName,
			reconnect,
			disconnect,
			ready,
			remoteEditorState,
			refreshRemoteFileTree,
			readRemoteFile,
			writeRemoteFile,
			trustedDevices,
			removeTrustedDevice,
		}),
		[
			connectionState,
			errorMessage,
			lastSyncAt,
			localDeviceName,
			pairedHost,
			pairFromQrPayload,
			pairWithPayload,
			publishEditorState,
			setLocalDeviceName,
			reconnect,
			disconnect,
			ready,
			remoteEditorState,
			refreshRemoteFileTree,
			readRemoteFile,
			writeRemoteFile,
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
