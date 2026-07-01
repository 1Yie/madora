import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { generateCompletion } from '@/features/ai/completion-service';
import { useAiSettings } from '@/features/ai/settings-provider';
import {
	DEFAULT_LOCAL_DOCUMENT_ID,
	initializeDatabase,
	MADORA_SYNC_DB_NAME,
	readDocuments,
	readSettings,
	upsertDocument,
	writeSetting,
} from './database';
import {
	parsePairingPayload,
	type PairingPayload,
	type ServerMessage,
	type ExplorerNode,
} from './protocol';
import { SyncClient } from './sync-client';
import type {
	AiCompletionResult,
	PairedHost,
	PendingUpdate,
	StorageStats,
	SyncConnectionState,
	SyncDocument,
	TrustedDevice,
} from './types';

const LOCAL_DEVICE_ID = 'device-mobile-local';
const LOCAL_DEVICE_NAME = 'Madora Phone';

const INITIAL_AI_RESULT: AiCompletionResult = {
	status: 'idle',
	completion: '',
	model: 'Local provider',
	message: 'Ready',
	requestedAt: null,
};

interface MadoraSyncContextValue {
	ready: boolean;
	connectionState: SyncConnectionState;
	pairedHost: PairedHost | null;
	documents: SyncDocument[];
	selectedDocument: SyncDocument | null;
	selectedDocumentId: string | null;
	fileTree: ExplorerNode[];
	trustedDevices: TrustedDevice[];
	pendingUpdates: PendingUpdate[];
	aiResult: AiCompletionResult;
	lastSyncAt: number | null;
	errorMessage: string | null;
	storageStats: StorageStats;
	pairFromQrPayload: (raw: string) => Promise<boolean>;
	pairWithPayload: (payload: PairingPayload) => Promise<boolean>;
	disconnect: () => void;
	selectDocument: (documentId: string) => void;
	updateSelectedDocumentContent: (content: string) => void;
	requestAiCompletion: (prompt: string) => Promise<void>;
	insertAiCompletion: () => void;
	refreshFileTree: () => Promise<void>;
	requestInlineCompletion: (
		fullText: string,
		cursorPos: number
	) => Promise<string>;
}

const MadoraSyncContext = createContext<MadoraSyncContextValue | null>(null);

function createId(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Flatten the explorer tree into a list of markdown/text files. */
function flattenFiles(
	nodes: ExplorerNode[],
	acc: SyncDocument[] = []
): SyncDocument[] {
	for (const node of nodes) {
		if (
			node.kind === 'file' &&
			(node.fileKind === 'markdown' || node.fileKind === 'text')
		) {
			acc.push({
				id: node.path,
				title: node.name,
				path: node.path,
				content: '',
				updatedAt: Date.now(),
			});
		}
		if (node.children.length > 0) {
			flattenFiles(node.children, acc);
		}
	}
	return acc;
}

export function MadoraSyncProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const aiSettings = useAiSettings();
	const [ready, setReady] = useState(false);
	const [db, setDb] = useState<SQLiteDatabase | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [connectionState, setConnectionState] =
		useState<SyncConnectionState>('disconnected');
	const [pairedHost, setPairedHost] = useState<PairedHost | null>(null);
	const [fileTree, setFileTree] = useState<ExplorerNode[]>([]);
	const [documents, setDocuments] = useState<SyncDocument[]>([]);
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
		null
	);
	const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
	const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
	const [aiResult, setAiResult] =
		useState<AiCompletionResult>(INITIAL_AI_RESULT);
	const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

	const clientRef = useRef<SyncClient | null>(null);

	const selectedDocument = useMemo(
		() =>
			documents.find((document) => document.id === selectedDocumentId) ?? null,
		[documents, selectedDocumentId]
	);

	const storageStats = useMemo<StorageStats>(
		() => ({
			documents: documents.length,
			pendingUpdates: pendingUpdates.filter((u) => u.syncState === 'pending')
				.length,
			trustedDevices: trustedDevices.length,
		}),
		[documents.length, pendingUpdates, trustedDevices.length]
	);

	// ── Database setup ──────────────────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;

		async function setupDatabase() {
			try {
				const database = await SQLite.openDatabaseAsync(MADORA_SYNC_DB_NAME);
				await initializeDatabase(database);
				if (cancelled) return;

				const settings = await readSettings(database);

				// Restore a previously paired host.
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

				const storedDocuments = await readDocuments(database);
				setDocuments(storedDocuments);
				setSelectedDocumentId(
					settings.selected_document_id &&
						storedDocuments.some(
							(doc) => doc.id === settings.selected_document_id
						)
						? settings.selected_document_id
						: (storedDocuments[0]?.id ?? DEFAULT_LOCAL_DOCUMENT_ID)
				);

				setDb(database);
				setReady(true);
			} catch (error) {
				if (cancelled) return;
				setErrorMessage(
					error instanceof Error
						? error.message
						: 'Failed to open local database'
				);
			}
		}

		void setupDatabase();
		return () => {
			cancelled = true;
		};
	}, []);

	// ── Sync client lifecycle ───────────────────────────────────────────────
	const handleServerMessage = useCallback(
		(message: ServerMessage) => {
			if (message.type === 'file_list_result') {
				setFileTree(message.tree);
				const files = flattenFiles(message.tree);
				setDocuments((current) => {
					// Preserve content for files we already loaded.
					const merged = files.map((file) => {
						const existing = current.find(
							(document) => document.id === file.id
						);
						return existing ? { ...file, content: existing.content } : file;
					});
					return merged;
				});
				setSelectedDocumentId((currentId) => {
					if (currentId && files.some((file) => file.id === currentId)) {
						return currentId;
					}

					const nextId = files[0]?.id ?? currentId;
					if (nextId && db) {
						void writeSetting(db, 'selected_document_id', nextId);
					}
					return nextId;
				});
			}
		},
		[db]
	);

	const connectToHost = useCallback(
		(host: PairedHost) => {
			// Tear down any previous client.
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
					// Pull the file tree immediately on connect.
					void client
						.request({ type: 'file_list' }, 'file_list:')
						.then((response) => {
							if (response.type === 'file_list_result') {
								handleServerMessage(response);
							}
						})
						.catch(() => {});
				}
			});

			client.onMessage(handleServerMessage);

			const payload: PairingPayload = {
				host: host.host,
				port: host.port,
				pairingId: host.pairingId,
				pairingToken: host.pairingToken,
				code: host.code,
				deviceName: host.name,
				expiresAt: new Date(host.pairedAt + 10 * 60 * 1000).toISOString(),
			};

			client.connect(payload);
		},
		[handleServerMessage]
	);

	// Reconnect automatically when a host was restored from storage.
	useEffect(() => {
		if (!ready || !pairedHost || clientRef.current) {
			return;
		}
		connectToHost(pairedHost);
	}, [ready, pairedHost, connectToHost]);

	// Cleanup on unmount.
	useEffect(() => {
		return () => {
			clientRef.current?.disconnect();
			clientRef.current = null;
		};
	}, []);

	// ── Pairing ─────────────────────────────────────────────────────────────
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
				id: `${payload.host}:${payload.port}`,
				name: payload.deviceName,
				host: payload.host,
				port: payload.port,
				pairingToken: payload.pairingToken,
				pairingId: payload.pairingId,
				code: payload.code,
				pairedAt: Date.now(),
			};

			setPairedHost(host);
			setTrustedDevices((current) => {
				const next = current.filter((device) => device.id !== host.id);
				return [
					{
						id: host.id,
						name: host.name,
						kind: 'desktop' as const,
						lastSeen: Date.now(),
						trusted: true,
						token: host.pairingToken,
						address: `${host.host}:${host.port}`,
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
		void persistPairedHost(null);
	}, [persistPairedHost]);

	// ── Document operations ─────────────────────────────────────────────────
	const selectDocument = useCallback(
		async (documentId: string) => {
			setSelectedDocumentId(documentId);
			if (db) {
				void writeSetting(db, 'selected_document_id', documentId);
			}

			// Lazy-load content from the desktop if we don't have it yet.
			const client = clientRef.current;
			if (!client || !client.isConnected) return;

			const existing = documents.find((document) => document.id === documentId);
			if (existing && existing.content) return;

			try {
				const response = await client.request(
					{ type: 'file_read', path: documentId },
					`file_read:${documentId}`
				);
				if (response.type === 'file_read_result' && response.content != null) {
					setDocuments((current) =>
						current.map((document) =>
							document.id === documentId
								? {
										...document,
										content: response.content!,
										updatedAt: Date.now(),
									}
								: document
						)
					);
				}
			} catch {
				// leave content empty on error
			}
		},
		[db, documents]
	);

	const updateSelectedDocumentContent = useCallback(
		(content: string) => {
			if (!selectedDocumentId) return;

			const now = Date.now();
			const updateId = createId('update');

			setDocuments((current) =>
				current.map((document) =>
					document.id === selectedDocumentId
						? { ...document, content, updatedAt: now }
						: document
				)
			);

			setPendingUpdates((current) => [
				{
					id: updateId,
					docId: selectedDocumentId,
					createdAt: now,
					syncState: 'pending',
					bytes: content.length,
				},
				...current,
			]);

			// Fire-and-forget the write to the desktop.
			const client = clientRef.current;
			if (client && client.isConnected) {
				client
					.request(
						{ type: 'file_write', path: selectedDocumentId, content },
						`file_write:${selectedDocumentId}`
					)
					.then((response) => {
						if (response.type === 'file_write_result' && response.ok) {
							const syncedAt = Date.now();
							setPendingUpdates((current) =>
								current.map((item) =>
									item.id === updateId
										? { ...item, syncState: 'synced' as const }
										: item
								)
							);
							setLastSyncAt(syncedAt);
							if (db) {
								void writeSetting(db, 'last_sync_at', String(syncedAt));
							}
						}
					})
					.catch(() => {});
			}

			if (db) {
				const document = documents.find(
					(item) => item.id === selectedDocumentId
				);
				void upsertDocument(db, {
					content,
					id: selectedDocumentId,
					path: document?.path ?? `local://${selectedDocumentId}.md`,
					title: document?.title ?? 'Untitled.md',
					updatedAt: now,
				});
			}
		},
		[db, documents, selectedDocumentId]
	);

	// ── AI completion ───────────────────────────────────────────────────────
	const requestAiCompletion = useCallback(
		async (prompt: string) => {
			if (!selectedDocument) {
				setAiResult({
					status: 'error',
					completion: '',
					model: 'Local provider',
					message: 'Open or create a document first.',
					requestedAt: Date.now(),
				});
				return;
			}

			const docId = selectedDocument.id;
			const prefix = prompt || selectedDocument.content;
			const suffix = '';
			const localConfig = await aiSettings.getCompletionConfig();

			setAiResult({
				status: 'requesting',
				completion: '',
				model: localConfig?.model ?? aiSettings.model,
				message: localConfig
					? `${aiSettings.provider} is generating completion`
					: `${pairedHost?.name ?? 'Desktop'} is generating completion`,
				requestedAt: Date.now(),
			});

			try {
				if (localConfig) {
					const completion = await generateCompletion({
						config: localConfig,
						request: {
							prefix,
							suffix,
							title: selectedDocument.title,
						},
					});
					setAiResult({
						status: 'ready',
						completion,
						model: localConfig.model ?? aiSettings.model,
						message: `Delivered by ${aiSettings.provider}`,
						requestedAt: Date.now(),
					});
					return;
				}

				const client = clientRef.current;
				if (!client || !client.isConnected) {
					setAiResult({
						status: 'error',
						completion: '',
						model: aiSettings.model,
						message: 'Configure an AI provider or pair a desktop host first.',
						requestedAt: Date.now(),
					});
					return;
				}

				const response = await client.request(
					{
						type: 'ai_complete',
						docId,
						title: selectedDocument.title,
						prefix,
						suffix,
					},
					`ai:${docId}`
				);

				if (response.type === 'ai_result') {
					if (response.error) {
						setAiResult({
							status: 'error',
							completion: '',
							model: 'Desktop relay',
							message: response.error,
							requestedAt: Date.now(),
						});
					} else {
						setAiResult({
							status: 'ready',
							completion: response.completion,
							model: 'Desktop relay',
							message: `Delivered by ${pairedHost?.name ?? 'desktop'}`,
							requestedAt: Date.now(),
						});
					}
				} else if (response.type === 'error') {
					setAiResult({
						status: 'error',
						completion: '',
						model: 'Desktop relay',
						message: response.message,
						requestedAt: Date.now(),
					});
				}
			} catch (error) {
				setAiResult({
					status: 'error',
					completion: '',
					model: 'Desktop relay',
					message: error instanceof Error ? error.message : 'Request failed',
					requestedAt: Date.now(),
				});
			}
		},
		[aiSettings, pairedHost, selectedDocument]
	);

	const insertAiCompletion = useCallback(() => {
		if (
			!selectedDocument ||
			aiResult.status !== 'ready' ||
			aiResult.completion.length === 0
		) {
			return;
		}
		updateSelectedDocumentContent(
			`${selectedDocument.content}${aiResult.completion}`
		);
		setAiResult(INITIAL_AI_RESULT);
	}, [aiResult, selectedDocument, updateSelectedDocumentContent]);

	const refreshFileTree = useCallback(async () => {
		const client = clientRef.current;
		if (!client || !client.isConnected) return;
		try {
			const response = await client.request(
				{ type: 'file_list' },
				'file_list:'
			);
			if (response.type === 'file_list_result') {
				handleServerMessage(response);
			}
		} catch {
			// ignore
		}
	}, [handleServerMessage]);

	/**
	 * Inline AI completion for the editor ghost-text flow.
	 * Returns a plain completion string (no UI state), or '' on failure.
	 */
	const requestInlineCompletion = useCallback(
		async (fullText: string, cursorPos: number): Promise<string> => {
			if (!selectedDocument) return '';

			const prefix = fullText.slice(Math.max(0, cursorPos - 12000), cursorPos);
			const suffix = fullText.slice(cursorPos, cursorPos + 4000);

			try {
				const localConfig = await aiSettings.getCompletionConfig();
				if (localConfig) {
					return await generateCompletion({
						config: localConfig,
						request: {
							prefix,
							suffix: suffix.length > 0 ? suffix : null,
							title: selectedDocument.title,
						},
					});
				}

				const client = clientRef.current;
				if (!client || !client.isConnected) return '';

				// Use a unique correlation key per request to avoid stale responses.
				const requestKey = `ai:${selectedDocument.id}:${Date.now()}`;
				const response = await client.request(
					{
						type: 'ai_complete',
						docId: selectedDocument.id,
						title: selectedDocument.title,
						prefix,
						suffix,
					},
					requestKey
				);

				if (response.type === 'ai_result' && !response.error) {
					return response.completion;
				}
				return '';
			} catch {
				return '';
			}
		},
		[aiSettings, selectedDocument]
	);

	const value = useMemo<MadoraSyncContextValue>(
		() => ({
			ready,
			connectionState,
			pairedHost,
			documents,
			selectedDocument,
			selectedDocumentId,
			fileTree,
			trustedDevices,
			pendingUpdates,
			aiResult,
			lastSyncAt,
			errorMessage,
			storageStats,
			pairFromQrPayload,
			pairWithPayload,
			disconnect,
			selectDocument,
			updateSelectedDocumentContent,
			requestAiCompletion,
			insertAiCompletion,
			refreshFileTree,
			requestInlineCompletion,
		}),
		[
			ready,
			connectionState,
			pairedHost,
			documents,
			selectedDocument,
			selectedDocumentId,
			fileTree,
			trustedDevices,
			pendingUpdates,
			aiResult,
			lastSyncAt,
			errorMessage,
			storageStats,
			pairFromQrPayload,
			pairWithPayload,
			disconnect,
			selectDocument,
			updateSelectedDocumentContent,
			requestAiCompletion,
			insertAiCompletion,
			refreshFileTree,
			requestInlineCompletion,
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
