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
	formatPairingEndpoint,
	parsePairingEndpoint,
	parsePairingPayload,
	type EditorStateMessage,
	type ExplorerNode,
	type PairingPayload,
	type ServerMessage,
} from '../lib/protocol';
import { SyncClient } from '../services/sync-client';
import type {
	ManualPairingInput,
	PairedHost,
	SyncConnectionState,
	TrustedDevice,
} from '../types';

interface MadoraSyncContextValue {
	connectionState: SyncConnectionState;
	errorMessage: string | null;
	lastSyncAt: number | null;
	localDeviceName: string;
	pairedHost: PairedHost | null;
	desktopAiCompletionAvailable: boolean;
	pairManually: (input: ManualPairingInput) => Promise<boolean>;
	pairFromQrPayload: (raw: string) => Promise<boolean>;
	pairWithPayload: (payload: PairingPayload) => Promise<boolean>;
	publishEditorState: (state: EditorStateInput) => void;
	setLocalDeviceName: (name: string) => Promise<void>;
	setSyncEnabled: (enabled: boolean) => Promise<void>;
	setUseDesktopAiCompletion: (enabled: boolean) => Promise<void>;
	reconnect: () => void;
	disconnect: () => void;
	ready: boolean;
	remoteEditorState: EditorStateMessage | null;
	refreshRemoteFileTree: (path?: string) => Promise<ExplorerNode[]>;
	readRemoteFile: (path: string) => Promise<{
		content: string | null;
		encoding: string | null;
		imageDataUrl: string | null;
		truncated: boolean;
	}>;
	requestRemoteCompletion: (request: {
		prefix: string;
		suffix: string | null;
		title: string | null;
	}) => Promise<string>;
	syncEnabled: boolean;
	useDesktopAiCompletion: boolean;
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
	| 'invalidManualPairing'
	| 'invalidQr'
	| 'manualPairingFailed'
	| 'notConnected'
	| 'openDatabaseFailed'
	| 'refreshFilesFailed'
	| 'removeTrustedFailed'
	| 'saveSettingsFailed'
	| 'serverError'
	| 'unexpectedResponse'
	| 'writeFailed';

const SYNC_ERROR_MESSAGE_KEYS: Record<string, SyncErrorKey> = {
	'Connection closed': 'connectionClosed',
	'Connection reset': 'connectionReset',
	'Invalid pairing QR code': 'invalidQr',
	'Manual pairing failed': 'manualPairingFailed',
	'Not connected': 'notConnected',
	'Unexpected response type': 'unexpectedResponse',
	'Write failed': 'writeFailed',
};

const MANUAL_PAIRING_TIMEOUT_MS = 15000;

function pairedHostAddress(host: PairedHost): string {
	return formatPairingEndpoint(host);
}

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
	const [desktopAiCompletionAvailable, setDesktopAiCompletionAvailable] =
		useState(false);
	const [syncEnabled, setSyncEnabledState] = useState(true);
	const [useDesktopAiCompletion, setUseDesktopAiCompletionState] =
		useState(false);
	const [remoteEditorState, setRemoteEditorState] =
		useState<EditorStateMessage | null>(null);
	const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
	const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
	const [localDeviceName, setLocalDeviceNameState] = useState(
		defaultLocalDeviceName
	);

	const clientRef = useRef<SyncClient | null>(null);
	const aiRequestSeqRef = useRef(0);
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
				setSyncEnabledState(settings.sync_enabled !== '0');
				setUseDesktopAiCompletionState(
					settings.use_desktop_ai_completion === '1'
				);

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
			if (message.type === 'auth_ok') {
				setDesktopAiCompletionAvailable(Boolean(message.shareAiCompletions));
				return;
			}

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
				setDesktopAiCompletionAvailable(false);
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
			setDesktopAiCompletionAvailable(false);

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
				if (state === 'disconnected') {
					setDesktopAiCompletionAvailable(false);
				}
			});

			client.onMessage(handleServerMessage);

			client.connect({
				code: host.code,
				deviceName: host.name,
				expiresAt: new Date(host.pairedAt + 10 * 60 * 1000).toISOString(),
				host: host.host,
				path: host.path,
				pairingId: host.pairingId,
				pairingToken: host.pairingToken,
				port: host.port,
				protocol: host.protocol,
			});

			return client;
		},
		[handleServerMessage, localDeviceName]
	);

	const setLocalDeviceName = useCallback(
		async (name: string) => {
			const nextName = name.trim() || defaultLocalDeviceName;
			setLocalDeviceNameState(nextName);
			try {
				if (db) {
					await writeSetting(db, 'local_device_name', nextName);
				}
			} catch (error) {
				setErrorMessage(getLocalizedSyncError(error, 'saveSettingsFailed'));
				return;
			}

			if (pairedHost && clientRef.current) {
				connectToHost(pairedHost, nextName);
			}
		},
		[
			connectToHost,
			db,
			defaultLocalDeviceName,
			getLocalizedSyncError,
			pairedHost,
		]
	);

	const setUseDesktopAiCompletion = useCallback(
		async (enabled: boolean) => {
			setUseDesktopAiCompletionState(enabled);
			try {
				if (db) {
					await writeSetting(
						db,
						'use_desktop_ai_completion',
						enabled ? '1' : '0'
					);
				}
			} catch (error) {
				setUseDesktopAiCompletionState(!enabled);
				setErrorMessage(getLocalizedSyncError(error, 'saveSettingsFailed'));
			}
		},
		[db, getLocalizedSyncError]
	);

	const setSyncEnabled = useCallback(
		async (enabled: boolean) => {
			setSyncEnabledState(enabled);
			try {
				if (db) {
					await writeSetting(db, 'sync_enabled', enabled ? '1' : '0');
				}
			} catch (error) {
				setSyncEnabledState(!enabled);
				setErrorMessage(getLocalizedSyncError(error, 'saveSettingsFailed'));
			}
		},
		[db, getLocalizedSyncError]
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

	const savePairedHost = useCallback(
		async (host: PairedHost) => {
			const address = pairedHostAddress(host);
			setPairedHost(host);
			setTrustedDevices((current) => {
				const next = current.filter((device) => device.id !== host.id);
				return [
					{
						address,
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
					address,
					id: host.id,
					kind: 'desktop',
					lastSeen: now,
					name: host.name,
					token: host.pairingToken,
					trusted: true,
				});
			}

			await persistPairedHost(host);
		},
		[db, persistPairedHost]
	);

	const pairWithPayload = useCallback(
		async (payload: PairingPayload): Promise<boolean> => {
			const host: PairedHost = {
				code: payload.code,
				host: payload.host,
				id: formatPairingEndpoint(payload),
				name: payload.deviceName,
				path: payload.path,
				pairedAt: Date.now(),
				pairingId: payload.pairingId,
				pairingToken: payload.pairingToken,
				port: payload.port,
				protocol: payload.protocol,
			};

			await savePairedHost(host);
			connectToHost(host);
			return true;
		},
		[connectToHost, savePairedHost]
	);

	const pairManually = useCallback(
		async (input: ManualPairingInput): Promise<boolean> => {
			const endpoint = parsePairingEndpoint(input.address, input.port);
			const code = input.code.trim();

			if (!endpoint || !code) {
				setErrorMessage(syncError('invalidManualPairing'));
				return false;
			}

			setErrorMessage(null);
			const address = formatPairingEndpoint(endpoint);
			const pendingHost: PairedHost = {
				code,
				host: endpoint.host,
				id: address,
				name: 'Madora Desktop',
				path: endpoint.path,
				pairedAt: Date.now(),
				pairingId: '',
				pairingToken: '',
				port: endpoint.port,
				protocol: endpoint.protocol,
			};
			const client = connectToHost(pendingHost);

			return new Promise<boolean>((resolve) => {
				let settled = false;
				let unsubscribeMessage: (() => void) | null = null;
				let unsubscribeState: (() => void) | null = null;
				let timeout: ReturnType<typeof setTimeout> | null = null;
				const settle = (ok: boolean, message?: string) => {
					if (settled) return;
					settled = true;
					if (timeout) {
						clearTimeout(timeout);
					}
					unsubscribeMessage?.();
					unsubscribeState?.();
					if (!ok) {
						client.disconnect();
						clientRef.current = null;
						setErrorMessage(message ?? syncError('manualPairingFailed'));
					}
					resolve(ok);
				};
				timeout = setTimeout(() => {
					settle(false, syncError('manualPairingFailed'));
				}, MANUAL_PAIRING_TIMEOUT_MS);

				unsubscribeMessage = client.onMessage((message) => {
					if (message.type === 'auth_ok') {
						const pairingToken = message.pairingToken?.trim();
						if (!pairingToken) {
							settle(false, syncError('manualPairingFailed'));
							return;
						}

						const pairedHost: PairedHost = {
							...pendingHost,
							name: message.hostDeviceName?.trim() || pendingHost.name,
							pairingToken,
						};
						client.updatePayload({
							code: pairedHost.code,
							deviceName: pairedHost.name,
							expiresAt: new Date(
								pairedHost.pairedAt + 10 * 60 * 1000
							).toISOString(),
							host: pairedHost.host,
							path: pairedHost.path,
							pairingId: pairedHost.pairingId,
							pairingToken: pairedHost.pairingToken,
							port: pairedHost.port,
							protocol: pairedHost.protocol,
						});

						void savePairedHost(pairedHost)
							.then(() => settle(true))
							.catch((error) => {
								settle(
									false,
									getLocalizedSyncError(error, 'manualPairingFailed')
								);
							});
						return;
					}

					if (message.type === 'auth_error' || message.type === 'error') {
						settle(
							false,
							getLocalizedSyncError(
								message.message,
								message.type === 'auth_error'
									? 'manualPairingFailed'
									: 'serverError'
							)
						);
					}
				});

				unsubscribeState = client.onStateChange((state) => {
					if (state === 'disconnected') {
						settle(false, syncError('manualPairingFailed'));
					}
				});
			});
		},
		[connectToHost, getLocalizedSyncError, savePairedHost, syncError]
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
		setDesktopAiCompletionAvailable(false);
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
					setDesktopAiCompletionAvailable(false);
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
				imageDataUrl: response.imageDataUrl,
				truncated: response.truncated,
			};
		},
		[getLocalizedSyncError, syncError]
	);

	const requestRemoteCompletion = useCallback(
		async (request: {
			prefix: string;
			suffix: string | null;
			title: string | null;
		}) => {
			const client = clientRef.current;
			if (!client || !client.isConnected) {
				throw new Error(syncError('notConnected'));
			}

			const docId = `app-ai-${Date.now()}-${aiRequestSeqRef.current++}`;
			const response = await client.request(
				{
					type: 'ai_complete',
					docId,
					prefix: request.prefix,
					suffix: request.suffix ?? undefined,
					title: request.title ?? undefined,
				},
				`ai:${docId}`
			);

			if (response.type !== 'ai_result') {
				if (response.type === 'error' || response.type === 'auth_error') {
					throw new Error(
						getLocalizedSyncError(
							response.message,
							response.type === 'auth_error' ? 'authError' : 'serverError'
						)
					);
				}
				throw new Error(syncError('unexpectedResponse'));
			}

			if (response.error) {
				throw new Error(response.error);
			}

			return response.completion;
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
			desktopAiCompletionAvailable,
			pairManually,
			pairFromQrPayload,
			pairWithPayload,
			publishEditorState,
			setLocalDeviceName,
			setSyncEnabled,
			setUseDesktopAiCompletion,
			reconnect,
			disconnect,
			ready,
			remoteEditorState,
			refreshRemoteFileTree,
			readRemoteFile,
			requestRemoteCompletion,
			syncEnabled,
			useDesktopAiCompletion,
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
			desktopAiCompletionAvailable,
			pairManually,
			pairFromQrPayload,
			pairWithPayload,
			publishEditorState,
			setLocalDeviceName,
			setSyncEnabled,
			setUseDesktopAiCompletion,
			reconnect,
			disconnect,
			ready,
			remoteEditorState,
			refreshRemoteFileTree,
			readRemoteFile,
			requestRemoteCompletion,
			syncEnabled,
			useDesktopAiCompletion,
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
