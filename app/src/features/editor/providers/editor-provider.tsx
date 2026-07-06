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
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import i18n from '@/i18n';
import { generateCompletion, useAiSettings } from '@/features/ai';
import { useAppSettings } from '@/features/settings';
import { useMadoraSync } from '@/features/madora-sync';
import type { ExplorerNode } from '@/features/madora-sync/lib/protocol';
import { useErrorToast } from '@/components/ui/toast';
import {
	copyLocalFileToDirectory,
	createLocalDirectory,
	createLocalMarkdownFile,
	deleteLocalEntry,
	getParentDirectoryUriForFile,
	pickLocalDirectory,
	pickLocalFile,
	readLocalDirectory,
	readLocalDirectoryChildren,
	readLocalFile,
	renameLocalFile,
	writeLocalFile,
} from '../services/local-file-system';
import {
	discardDocumentChanges,
	getDirtyDocuments,
	hasDirtyDocuments,
	isDocumentDirty,
	markDocumentSaved,
	updateDocumentContent,
} from '../lib/editor-document-state';
import type {
	EditorDocument,
	EditorNode,
	EditorWorkspaceSource,
} from '../types';

type EditorContextValue = {
	activeDocumentDirty: boolean;
	bookmarkedDocumentIds: string[];
	cancelCopiedFile: () => void;
	copySelectedFile: () => Promise<boolean>;
	copyState: {
		documentId: string;
		title: string;
	} | null;
	createLocalDirectory: (directoryName: string) => Promise<boolean>;
	createLocalFile: (fileName: string) => Promise<boolean>;
	deleteSelectedEntry: () => Promise<boolean>;
	discardUnsavedDocuments: () => void;
	documents: EditorDocument[];
	errorMessage: string | null;
	expandedDirectoryPaths: Set<string>;
	fileTree: EditorNode[];
	focusedTreeNode: EditorNode | null;
	hasUnsavedDocuments: boolean;
	isFocusedTreeNodeBookmarked: boolean;
	isSavingActiveDocument: boolean;
	openLocalFile: () => Promise<boolean>;
	openLocalFolder: () => Promise<boolean>;
	openRemoteWorkspace: () => Promise<boolean>;
	pasteCopiedFile: () => Promise<boolean>;
	requestInlineCompletion: (
		fullText: string,
		cursorPos: number
	) => Promise<string>;
	locateSelectedDocumentInTree: () => boolean;
	renameSelectedFile: (nextName: string) => Promise<boolean>;
	refreshFileTree: () => Promise<boolean>;
	saveActiveDocument: () => Promise<boolean>;
	saveAllUnsavedDocuments: () => Promise<boolean>;
	selectDocument: (documentId: string) => Promise<void>;
	selectTreeNode: (nodePath: string) => void;
	selectedDocument: EditorDocument | null;
	selectedDocumentId: string | null;
	selectedTreeNodePath: string | null;
	toggleBookmark: () => Promise<void>;
	toggleDirectoryExpanded: (directoryPath: string) => void;
	updateSelectedDocumentContent: (
		content: string,
		options?: { markSaved?: boolean; skipRemoteWrite?: boolean }
	) => void;
	workspaceSource: EditorWorkspaceSource;
	workspaceMode: 'local' | 'remote';
	switchWorkspaceMode: (mode: 'local' | 'remote') => Promise<void>;
};

const EditorContext = createContext<EditorContextValue | null>(null);

const BOOKMARKS_KEY = 'madora-mobile.editor.bookmarks';
const LAST_WORKSPACE_KEY = 'madora-mobile.editor.last-workspace';
const EXPANDED_DIRECTORIES_KEY = 'madora-mobile.editor.expanded-directories';

type PersistedWorkspace =
	| {
			kind: 'file';
			uri: string;
			selectedTreeNodePath: string | null;
	  }
	| {
			kind: 'directory';
			uri: string;
			selectedDocumentId: string | null;
			selectedTreeNodePath: string | null;
	  };

export function EditorProvider({ children }: { children: ReactNode }) {
	const {
		refreshRemoteFileTree,
		readRemoteFile,
		writeRemoteFile,
		pairedHost,
		connectionState,
	} = useMadoraSync();
	const aiSettings = useAiSettings();
	const showErrorToast = useErrorToast();
	const { saveMode } = useAppSettings();
	const [documents, setDocuments] = useState<EditorDocument[]>([]);
	const [copyState, setCopyState] = useState<{
		documentId: string;
		title: string;
	} | null>(null);
	const [bookmarkedDocumentIds, setBookmarkedDocumentIds] = useState<string[]>(
		[]
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<
		Set<string>
	>(() => new Set());
	const [fileTree, setFileTree] = useState<EditorNode[]>([]);
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
		null
	);
	const [selectedTreeNodePath, setSelectedTreeNodePath] = useState<
		string | null
	>(null);
	const [workspaceMode, setWorkspaceMode] = useState<'local' | 'remote'>(
		'local'
	);
	const [workspaceSource, setWorkspaceSource] = useState<EditorWorkspaceSource>(
		{
			kind: 'empty',
		}
	);
	const [didHydrateWorkspace, setDidHydrateWorkspace] = useState(false);
	const [isSavingActiveDocument, setIsSavingActiveDocument] = useState(false);
	const loadingDirectoryPathsRef = useRef(new Set<string>());
	const rememberedExpandedDirectoryPathsRef = useRef<{
		local: Set<string>;
		remote: Set<string>;
	}>({
		local: new Set(),
		remote: new Set(),
	});
	/**
	 * Per-document write serialization. On Android (SAF content URIs) writes are
	 * fully async via NativeFileSystem.writeFile; if we fire them
	 * fire-and-forget on every keystroke, out-of-order completion leaves an
	 * intermediate snapshot on disk — e.g. the user clears all text, but an
	 * earlier in-flight write of a partial state lands last. Chaining each
	 * document's writes onto this promise map guarantees the LAST edit wins.
	 */
	const writeQueueRef = useRef<Map<string, Promise<unknown>>>(new Map());

	const selectedDocument = useMemo(
		() =>
			documents.find((document) => document.id === selectedDocumentId) ?? null,
		[documents, selectedDocumentId]
	);

	const focusedTreeNode = useMemo(
		() => findNodeByPath(fileTree, selectedTreeNodePath),
		[fileTree, selectedTreeNodePath]
	);

	const activeFileTarget = useMemo(() => {
		if (focusedTreeNode?.kind === 'file') {
			return {
				documentId: focusedTreeNode.path,
				title:
					documents.find((document) => document.id === focusedTreeNode.path)
						?.title ?? focusedTreeNode.name,
			};
		}

		if (selectedDocument) {
			return {
				documentId: selectedDocument.id,
				title: selectedDocument.title,
			};
		}

		return null;
	}, [documents, focusedTreeNode, selectedDocument]);

	const isFocusedTreeNodeBookmarked = Boolean(
		focusedTreeNode?.kind === 'file' &&
		bookmarkedDocumentIds.includes(focusedTreeNode.path)
	);

	const activeDocumentDirty = useMemo(() => {
		return isDocumentDirty(selectedDocument);
	}, [selectedDocument]);

	const hasUnsavedDocuments = useMemo(
		() => hasDirtyDocuments(documents),
		[documents]
	);

	const persistWorkspace = useCallback(
		async (workspace: PersistedWorkspace | null) => {
			try {
				if (!workspace) {
					await SecureStore.deleteItemAsync(LAST_WORKSPACE_KEY);
					return;
				}

				await SecureStore.setItemAsync(
					LAST_WORKSPACE_KEY,
					JSON.stringify(workspace)
				);
			} catch {
				// ignore persistence failure for this session
			}
		},
		[]
	);

	const persistBookmarks = useCallback(async (nextBookmarks: string[]) => {
		try {
			await SecureStore.setItemAsync(
				BOOKMARKS_KEY,
				JSON.stringify(nextBookmarks)
			);
		} catch {
			// ignore persistence failure for this session
		}
	}, []);

	const getRememberedExpandedDirectoryPaths = useCallback(
		(mode: 'local' | 'remote', rootPath: string) => {
			const remembered = rememberedExpandedDirectoryPathsRef.current[mode];
			if (remembered.has(rootPath)) {
				return new Set(remembered);
			}

			return new Set([rootPath]);
		},
		[]
	);

	const rememberExpandedDirectoryPaths = useCallback(
		(mode: 'local' | 'remote', paths: Set<string>) => {
			rememberedExpandedDirectoryPathsRef.current[mode] = new Set(paths);
		},
		[]
	);

	/**
	 * Lazily load the immediate children of a directory and merge them into the
	 * tree (targeted patch). The root directory (depth 0) is loaded by
	 * `readLocalDirectory`; deeper directories load on demand here.
	 */
	const loadDirectoryIntoTree = useCallback(
		async (directoryPath: string, rootUri: string) => {
			if (loadingDirectoryPathsRef.current.has(directoryPath)) return;

			loadingDirectoryPathsRef.current.add(directoryPath);
			try {
				let children: EditorNode[];
				if (workspaceSource.kind === 'remote') {
					const remoteNodes = await refreshRemoteFileTree(directoryPath);
					children = mapRemoteExplorerNodes(remoteNodes);
				} else {
					const localResult = await readLocalDirectoryChildren(
						directoryPath,
						rootUri
					);
					children = localResult.children;
				}

				setFileTree((current) =>
					updateNodeInTree(current, directoryPath, (node) => ({
						...node,
						children,
						hasChildren: children.length > 0,
						loaded: true,
					}))
				);
			} catch (error) {
				setFileTree((current) =>
					updateNodeInTree(current, directoryPath, (node) => ({
						...node,
						children: [],
						hasChildren: false,
						loaded: true,
					}))
				);
				setErrorMessage(getLocalizedEditorError(error, 'openFolderFailed'));
			} finally {
				loadingDirectoryPathsRef.current.delete(directoryPath);
			}
		},
		[refreshRemoteFileTree, workspaceSource]
	);

	/**
	 * Targeted refresh: re-read a single directory's immediate children and
	 * patch only that node, preserving the loaded state of every other branch.
	 */
	const refreshDirectoryInTree = useCallback(
		async (directoryPath: string, rootUri: string) => {
			let children: EditorNode[];
			if (workspaceSource.kind === 'remote') {
				const remoteNodes = await refreshRemoteFileTree(directoryPath);
				children = mapRemoteExplorerNodes(remoteNodes);
			} else {
				const localResult = await readLocalDirectoryChildren(
					directoryPath,
					rootUri
				);
				children = localResult.children;
			}
			setFileTree((current) =>
				updateNodeInTree(current, directoryPath, (node) => ({
					...node,
					children,
					hasChildren: children.length > 0,
					loaded: true,
				}))
			);
		},
		[refreshRemoteFileTree, workspaceSource]
	);

	const persistDirectoryWorkspace = useCallback(
		async ({
			nextSelectedDocumentId,
			nextSelectedTreeNodePath,
		}: {
			nextSelectedDocumentId?: string | null;
			nextSelectedTreeNodePath?: string | null;
		} = {}) => {
			if (workspaceSource.kind !== 'directory') return;

			await persistWorkspace({
				kind: 'directory',
				uri: workspaceSource.uri,
				selectedDocumentId:
					nextSelectedDocumentId === undefined
						? selectedDocumentId
						: nextSelectedDocumentId,
				selectedTreeNodePath:
					nextSelectedTreeNodePath === undefined
						? selectedTreeNodePath
						: nextSelectedTreeNodePath,
			});
		},
		[
			persistWorkspace,
			selectedDocumentId,
			selectedTreeNodePath,
			workspaceSource,
		]
	);

	const getCurrentTargetDirectoryUri = useCallback(() => {
		if (workspaceSource.kind !== 'directory') {
			return null;
		}

		if (focusedTreeNode?.kind === 'directory') {
			return focusedTreeNode.path;
		}

		if (focusedTreeNode?.kind === 'file') {
			return (
				getParentDirectoryUriForFile(fileTree, focusedTreeNode.path) ??
				workspaceSource.uri
			);
		}

		return workspaceSource.uri;
	}, [fileTree, focusedTreeNode, workspaceSource]);

	const createLocalFile = useCallback(
		async (fileName: string) => {
			try {
				if (workspaceSource.kind !== 'directory') {
					setErrorMessage(editorError('localFolderRequiredForFiles'));
					return false;
				}

				const directoryUri = getCurrentTargetDirectoryUri();
				if (!directoryUri) return false;
				const document = await createLocalMarkdownFile(
					directoryUri,
					fileName,
					workspaceSource.uri
				);

				setDocuments((current) => [
					document,
					...current.filter((item) => item.id !== document.id),
				]);
				setSelectedTreeNodePath(document.id);

				await refreshDirectoryInTree(directoryUri, workspaceSource.uri);
				await persistDirectoryWorkspace({
					nextSelectedTreeNodePath: document.id,
				});

				setErrorMessage(null);
				return true;
			} catch (error) {
				setErrorMessage(getLocalizedEditorError(error, 'createFileFailed'));
				return false;
			}
		},
		[
			getCurrentTargetDirectoryUri,
			persistDirectoryWorkspace,
			refreshDirectoryInTree,
			workspaceSource,
		]
	);

	const createDirectoryInWorkspace = useCallback(
		async (directoryName: string) => {
			try {
				if (workspaceSource.kind !== 'directory') {
					setErrorMessage(editorError('localFolderRequiredForFolders'));
					return false;
				}

				const directoryUri = getCurrentTargetDirectoryUri();
				if (!directoryUri) return false;

				const createdDirectoryUri = await createLocalDirectory(
					directoryUri,
					directoryName
				);
				setSelectedTreeNodePath(createdDirectoryUri);
				await refreshDirectoryInTree(directoryUri, workspaceSource.uri);
				await persistDirectoryWorkspace({
					nextSelectedTreeNodePath: createdDirectoryUri,
				});
				setErrorMessage(null);
				return true;
			} catch (error) {
				setErrorMessage(getLocalizedEditorError(error, 'createFolderFailed'));
				return false;
			}
		},
		[
			getCurrentTargetDirectoryUri,
			persistDirectoryWorkspace,
			refreshDirectoryInTree,
			workspaceSource,
		]
	);

	const openLocalFile = useCallback(async () => {
		try {
			const document = await pickLocalFile();
			if (!document) {
				setErrorMessage(null);
				return false;
			}

			setDocuments([document]);
			setFileTree([]);
			setSelectedDocumentId(document.id);
			setSelectedTreeNodePath(document.id);
			setWorkspaceSource({
				kind: 'file',
				name: document.title,
				uri: document.path,
			});
			await persistWorkspace({
				kind: 'file',
				uri: document.path,
				selectedTreeNodePath: document.id,
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			if (isPickerCancel(error)) {
				setErrorMessage(null);
				return false;
			}
			setErrorMessage(getLocalizedEditorError(error, 'openLocalFileFailed'));
			return false;
		}
	}, [persistWorkspace]);

	const openLocalFolder = useCallback(async () => {
		try {
			const result = await pickLocalDirectory();
			if (!result) {
				setErrorMessage(null);
				return false;
			}

			setDocuments([]);
			setFileTree([result.root]);
			const expanded = getRememberedExpandedDirectoryPaths(
				'local',
				result.root.path
			);
			setExpandedDirectoryPaths(expanded);
			rememberExpandedDirectoryPaths('local', expanded);
			setSelectedDocumentId(null);
			setSelectedTreeNodePath(result.root.path);
			setWorkspaceSource({
				kind: 'directory',
				name: result.root.name,
				uri: result.uri,
			});
			await persistWorkspace({
				kind: 'directory',
				uri: result.uri,
				selectedDocumentId: null,
				selectedTreeNodePath: result.root.path,
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			if (isPickerCancel(error)) {
				setErrorMessage(null);
				return false;
			}
			setErrorMessage(getLocalizedEditorError(error, 'openLocalFolderFailed'));
			return false;
		}
	}, [
		getRememberedExpandedDirectoryPaths,
		persistWorkspace,
		rememberExpandedDirectoryPaths,
	]);

	const showRemoteDisconnectedWorkspace = useCallback(() => {
		const remoteName =
			pairedHost?.name ?? i18n.t('workspace.remoteFallbackName');

		setDocuments((current) => (current.length === 0 ? current : []));
		setFileTree((current) => (current.length === 0 ? current : []));
		setExpandedDirectoryPaths((current) =>
			current.size === 0 ? current : new Set()
		);
		setSelectedDocumentId(null);
		setSelectedTreeNodePath(null);
		setWorkspaceSource({
			kind: 'remote',
			name: remoteName,
			uri: remoteName,
		});
		setWorkspaceMode('remote');
		setErrorMessage(null);
	}, [pairedHost?.name]);

	const openRemoteWorkspace = useCallback(async () => {
		if (connectionState !== 'connected') {
			showRemoteDisconnectedWorkspace();
			return true;
		}

		try {
			const tree = await refreshRemoteFileTree();
			if (tree.length === 0) {
				setErrorMessage(editorError('remoteNoFiles'));
				return false;
			}

			const mappedTree = mapRemoteExplorerNodes(tree);
			const rootNode = mappedTree[0];
			if (!rootNode) {
				setErrorMessage(editorError('remoteNoRoot'));
				return false;
			}

			setDocuments([]);
			setFileTree(mappedTree);
			setExpandedDirectoryPaths(
				getRememberedExpandedDirectoryPaths('remote', rootNode.path)
			);
			setSelectedDocumentId(null);
			setSelectedTreeNodePath(rootNode.path);
			setWorkspaceSource({
				kind: 'remote',
				name: pairedHost?.name ?? i18n.t('workspace.remoteFallbackName'),
				uri: rootNode.path,
			});
			setWorkspaceMode('remote');
			// Wait until Phase 2 for persistence of remote workspace
			setErrorMessage(null);
			return true;
		} catch (error) {
			const message = getErrorMessage(error, '');
			if (isRemoteConnectionUnavailableMessage(message)) {
				showRemoteDisconnectedWorkspace();
				return true;
			}

			setErrorMessage(
				getLocalizedEditorError(error, 'openRemoteWorkspaceFailed')
			);
			return false;
		}
	}, [
		connectionState,
		getRememberedExpandedDirectoryPaths,
		pairedHost,
		refreshRemoteFileTree,
		showRemoteDisconnectedWorkspace,
	]);

	const switchWorkspaceMode = useCallback(
		async (mode: 'local' | 'remote') => {
			rememberExpandedDirectoryPaths(workspaceMode, expandedDirectoryPaths);

			if (mode === 'remote') {
				const opened = await openRemoteWorkspace();
				if (opened) {
					setWorkspaceMode('remote');
				}
			} else {
				setWorkspaceMode('local');
				// load local
				try {
					const stored = await SecureStore.getItemAsync(LAST_WORKSPACE_KEY);
					if (!stored) {
						setWorkspaceSource({ kind: 'empty' });
						setFileTree([]);
						setDocuments([]);
						setSelectedDocumentId(null);
						setSelectedTreeNodePath(null);
						return;
					}
					const parsed = JSON.parse(stored) as PersistedWorkspace;
					if (parsed.kind === 'file') {
						const document = await readLocalFile(parsed.uri);
						setDocuments([document]);
						setFileTree([]);
						setSelectedDocumentId(document.id);
						setSelectedTreeNodePath(parsed.selectedTreeNodePath ?? document.id);
						setWorkspaceSource({
							kind: 'file',
							name: document.title,
							uri: document.path,
						});
						return;
					}

					const result = await readLocalDirectory(parsed.uri);
					const rootUri = result.uri;
					const { children } = await readLocalDirectoryChildren(
						rootUri,
						rootUri
					);
					const rootNode = {
						...result.root,
						children,
						hasChildren: children.length > 0,
						loaded: true,
					};
					setDocuments([]);
					setFileTree([rootNode]);
					const expanded = getRememberedExpandedDirectoryPaths(
						'local',
						rootUri
					);
					setExpandedDirectoryPaths(expanded);
					rememberExpandedDirectoryPaths('local', expanded);
					setWorkspaceSource({
						kind: 'directory',
						name: result.root.name,
						uri: result.uri,
					});
					setSelectedDocumentId(parsed.selectedDocumentId ?? null);
					setSelectedTreeNodePath(
						parsed.selectedTreeNodePath ?? result.root.path
					);

					if (parsed.selectedDocumentId) {
						try {
							const document = await readLocalFile(
								parsed.selectedDocumentId,
								result.uri
							);
							setDocuments([document]);
						} catch {
							setSelectedDocumentId(null);
						}
					}
				} catch {
					setWorkspaceSource({ kind: 'empty' });
					setFileTree([]);
					setDocuments([]);
				}
			}
		},
		[
			expandedDirectoryPaths,
			getRememberedExpandedDirectoryPaths,
			openRemoteWorkspace,
			rememberExpandedDirectoryPaths,
			workspaceMode,
		]
	);

	const selectDocument = useCallback(
		async (documentId: string) => {
			setSelectedDocumentId(documentId);
			if (workspaceSource.kind !== 'file') {
				setSelectedTreeNodePath(documentId);
			}

			if (workspaceSource.kind === 'directory') {
				void persistDirectoryWorkspace({
					nextSelectedDocumentId: documentId,
				});
			} else if (workspaceSource.kind === 'file') {
				void persistWorkspace({
					kind: 'file',
					uri: documentId,
					selectedTreeNodePath: documentId,
				});
			}

			const existing = documents.find((document) => document.id === documentId);
			if (existing && existing.content.length > 0) {
				return;
			}

			try {
				let document: EditorDocument;
				if (workspaceSource.kind === 'remote') {
					const remoteFile = await readRemoteFile(documentId);
					const node = findNodeByPath(fileTree, documentId);
					document = {
						content: remoteFile.content || '',
						fileKind: node?.fileKind ?? 'text',
						id: documentId,
						lastSavedContent: remoteFile.content || '',
						path: documentId,
						readOnly: false,
						relativePath:
							node?.relativePath ?? documentId.split('/').pop() ?? documentId,
						title: node?.name ?? documentId.split('/').pop() ?? documentId,
						updatedAt: Date.now(),
					};
				} else {
					document = await readLocalFile(
						documentId,
						workspaceSource.kind === 'directory' ? workspaceSource.uri : null
					);
				}
				setDocuments((current) => {
					const exists = current.some((item) => item.id === document.id);
					if (!exists) return [document, ...current];
					return current.map((item) =>
						item.id === document.id ? document : item
					);
				});
				setErrorMessage(null);
			} catch (error) {
				setErrorMessage(getLocalizedEditorError(error, 'readFileFailed'));
			}
		},
		[
			documents,
			fileTree,
			persistDirectoryWorkspace,
			persistWorkspace,
			readRemoteFile,
			workspaceSource,
		]
	);

	const selectTreeNode = useCallback(
		(nodePath: string) => {
			setSelectedTreeNodePath(nodePath);

			if (workspaceSource.kind === 'directory') {
				void persistDirectoryWorkspace({
					nextSelectedTreeNodePath: nodePath,
				});
			} else if (workspaceSource.kind === 'file') {
				void persistWorkspace({
					kind: 'file',
					uri: workspaceSource.uri,
					selectedTreeNodePath: nodePath,
				});
			}
		},
		[persistDirectoryWorkspace, persistWorkspace, workspaceSource]
	);

	const toggleDirectoryExpanded = useCallback(
		(directoryPath: string) => {
			setExpandedDirectoryPaths((current) => {
				const next = new Set(current);
				if (next.has(directoryPath)) {
					next.delete(directoryPath);
				} else {
					next.add(directoryPath);
				}
				rememberExpandedDirectoryPaths(workspaceMode, next);
				return next;
			});
		},
		[rememberExpandedDirectoryPaths, workspaceMode]
	);

	useEffect(() => {
		if (
			workspaceSource.kind !== 'directory' &&
			workspaceSource.kind !== 'remote'
		)
			return;

		for (const directoryPath of expandedDirectoryPaths) {
			const node = findNodeByPath(fileTree, directoryPath);
			if (
				node?.kind === 'directory' &&
				!node.loaded &&
				!loadingDirectoryPathsRef.current.has(directoryPath)
			) {
				void loadDirectoryIntoTree(directoryPath, workspaceSource.uri);
			}
		}
	}, [
		expandedDirectoryPaths,
		fileTree,
		loadDirectoryIntoTree,
		workspaceSource,
	]);

	useEffect(() => {
		if (!didHydrateWorkspace || workspaceSource.kind !== 'directory') return;
		void SecureStore.setItemAsync(
			EXPANDED_DIRECTORIES_KEY,
			JSON.stringify([...expandedDirectoryPaths])
		);
	}, [didHydrateWorkspace, expandedDirectoryPaths, workspaceSource.kind]);

	useEffect(() => {
		if (!errorMessage) return;
		showErrorToast(errorMessage);

		const timeoutId = setTimeout(() => {
			setErrorMessage(null);
		}, 0);

		return () => clearTimeout(timeoutId);
	}, [errorMessage, showErrorToast]);

	/**
	 * Write a single document's content and mark its `lastSavedContent` snapshot
	 * so dirty-state tracking resets. Writes for the same document are serialized
	 * so the most recent edit is always the last one to land.
	 * Errors surface via `errorMessage`.
	 */
	const persistDocumentContent = useCallback(
		(documentId: string, content: string): Promise<boolean> => {
			const isRemoteDocument = workspaceSource.kind === 'remote';

			const run = async (): Promise<boolean> => {
				try {
					if (isRemoteDocument) {
						await writeRemoteFile(documentId, content);
					} else {
						await writeLocalFile(documentId, content);
					}
					setDocuments((current) =>
						markDocumentSaved(current, documentId, content)
					);
					setErrorMessage(null);
					return true;
				} catch (error) {
					setErrorMessage(getLocalizedEditorError(error, 'saveFileFailed'));
					return false;
				}
			};

			const previous =
				writeQueueRef.current.get(documentId) ?? Promise.resolve();
			const next = previous.then(run, run);
			writeQueueRef.current.set(documentId, next);
			// Drop the entry once settled so the map doesn't grow unbounded.
			next.finally(() => {
				if (writeQueueRef.current.get(documentId) === next) {
					writeQueueRef.current.delete(documentId);
				}
			});
			return next;
		},
		[workspaceSource.kind, writeRemoteFile]
	);

	const saveActiveDocument = useCallback(async (): Promise<boolean> => {
		if (!selectedDocument) return false;
		if (!activeDocumentDirty) return true;

		setIsSavingActiveDocument(true);
		try {
			return await persistDocumentContent(
				selectedDocument.id,
				selectedDocument.content
			);
		} finally {
			setIsSavingActiveDocument(false);
		}
	}, [activeDocumentDirty, persistDocumentContent, selectedDocument]);

	const saveAllUnsavedDocuments = useCallback(async (): Promise<boolean> => {
		const dirtyDocuments = getDirtyDocuments(documents);

		let allSucceeded = true;
		for (const document of dirtyDocuments) {
			const succeeded = await persistDocumentContent(
				document.id,
				document.content
			);
			if (!succeeded) allSucceeded = false;
		}
		return allSucceeded;
	}, [documents, persistDocumentContent]);

	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextState) => {
			if (nextState === 'active' || saveMode !== 'auto') return;

			for (const document of getDirtyDocuments(documents)) {
				void persistDocumentContent(document.id, document.content);
			}
		});

		return () => subscription.remove();
	}, [documents, persistDocumentContent, saveMode]);

	/**
	 * Drop dirty flags so unsaved-changes guards stop firing. Used when the user
	 * chooses "discard" on the exit-confirmation dialog.
	 */
	const discardUnsavedDocuments = useCallback(() => {
		setDocuments((current) => discardDocumentChanges(current, Date.now()));
	}, []);

	const updateSelectedDocumentContent = useCallback(
		(
			content: string,
			options?: { markSaved?: boolean; skipRemoteWrite?: boolean }
		) => {
			if (!selectedDocumentId) return;

			const now = Date.now();
			// Update React state. `lastSavedContent` is intentionally left alone
			// here — it is only mutated by `persistDocumentContent` on a successful
			// disk write, so dirty tracking reflects what is actually on disk.
			setDocuments((current) =>
				updateDocumentContent(
					current,
					selectedDocumentId,
					content,
					now,
					options
				)
			);

			// Auto-save mode: write to disk immediately on every edit. We do NOT
			// debounce — on mobile the app can be killed at any moment, and any
			// pending debounce timer would be dropped, losing the user's edits.
			// writeLocalFile awaits the native write so errors are surfaced.
			if (saveMode !== 'auto' || options?.skipRemoteWrite) {
				return;
			}

			void persistDocumentContent(selectedDocumentId, content);
		},
		[persistDocumentContent, saveMode, selectedDocumentId]
	);

	const renameSelectedFile = useCallback(
		async (nextName: string) => {
			if (!activeFileTarget) return false;

			try {
				const renamedFile = await renameLocalFile(
					activeFileTarget.documentId,
					nextName,
					workspaceSource.kind === 'directory' ? workspaceSource.uri : null
				);
				const rootUri =
					workspaceSource.kind === 'directory' ? workspaceSource.uri : null;
				const renamedDocument = await readLocalFile(renamedFile.path, rootUri);

				setDocuments((current) => [
					renamedDocument,
					...current.filter(
						(document) => document.id !== activeFileTarget.documentId
					),
				]);
				setSelectedDocumentId(renamedDocument.id);
				setSelectedTreeNodePath(renamedDocument.id);

				if (workspaceSource.kind === 'directory') {
					const parentDirectoryUri =
						getParentDirectoryUriForFile(
							fileTree,
							activeFileTarget.documentId
						) ?? workspaceSource.uri;
					await refreshDirectoryInTree(parentDirectoryUri, workspaceSource.uri);
					await persistDirectoryWorkspace({
						nextSelectedDocumentId: renamedDocument.id,
						nextSelectedTreeNodePath: renamedDocument.id,
					});
				} else {
					setWorkspaceSource({
						kind: 'file',
						name: renamedDocument.title,
						uri: renamedDocument.path,
					});
					await persistWorkspace({
						kind: 'file',
						uri: renamedDocument.path,
						selectedTreeNodePath: renamedDocument.id,
					});
				}

				if (copyState?.documentId === activeFileTarget.documentId) {
					setCopyState({
						documentId: renamedDocument.id,
						title: renamedDocument.title,
					});
				}

				if (bookmarkedDocumentIds.includes(activeFileTarget.documentId)) {
					const nextBookmarks = bookmarkedDocumentIds.map((item) =>
						item === activeFileTarget.documentId ? renamedDocument.id : item
					);
					setBookmarkedDocumentIds(nextBookmarks);
					await persistBookmarks(nextBookmarks);
				}

				setErrorMessage(null);
				return true;
			} catch (error) {
				setErrorMessage(getLocalizedEditorError(error, 'renameFileFailed'));
				return false;
			}
		},
		[
			activeFileTarget,
			bookmarkedDocumentIds,
			copyState,
			fileTree,
			persistBookmarks,
			persistDirectoryWorkspace,
			persistWorkspace,
			refreshDirectoryInTree,
			workspaceSource,
		]
	);

	const copySelectedFile = useCallback(async () => {
		if (!activeFileTarget) return false;

		setCopyState({
			documentId: activeFileTarget.documentId,
			title: activeFileTarget.title,
		});
		setErrorMessage(null);
		return true;
	}, [activeFileTarget]);

	const cancelCopiedFile = useCallback(() => {
		setCopyState(null);
		setErrorMessage(null);
	}, []);

	const pasteCopiedFile = useCallback(async () => {
		if (!copyState || workspaceSource.kind !== 'directory') {
			return false;
		}

		try {
			const targetDirectoryUri =
				getCurrentTargetDirectoryUri() ?? workspaceSource.uri;
			const pastedFile = await copyLocalFileToDirectory(
				copyState.documentId,
				targetDirectoryUri,
				workspaceSource.uri
			);
			const pastedDocument = await readLocalFile(
				pastedFile.path,
				workspaceSource.uri
			);

			setDocuments((current) => [
				pastedDocument,
				...current.filter((document) => document.id !== pastedDocument.id),
			]);
			setSelectedDocumentId(pastedDocument.id);
			setSelectedTreeNodePath(pastedDocument.id);
			setCopyState(null);
			await refreshDirectoryInTree(targetDirectoryUri, workspaceSource.uri);
			await persistDirectoryWorkspace({
				nextSelectedDocumentId: pastedDocument.id,
				nextSelectedTreeNodePath: pastedDocument.id,
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			setErrorMessage(getLocalizedEditorError(error, 'pasteFileFailed'));
			return false;
		}
	}, [
		copyState,
		getCurrentTargetDirectoryUri,
		persistDirectoryWorkspace,
		refreshDirectoryInTree,
		workspaceSource,
	]);

	const refreshFileTree = useCallback(async () => {
		try {
			if (workspaceSource.kind === 'empty') return false;

			if (workspaceSource.kind === 'file') {
				const document = await readLocalFile(workspaceSource.uri);
				setDocuments([document]);
				setSelectedDocumentId(document.id);
				setSelectedTreeNodePath(document.id);
				await persistWorkspace({
					kind: 'file',
					uri: document.path,
					selectedTreeNodePath: document.id,
				});
				setErrorMessage(null);
				return true;
			}

			if (workspaceSource.kind === 'remote') {
				const tree = await refreshRemoteFileTree();
				const mappedTree = mapRemoteExplorerNodes(tree);
				const rootNode = mappedTree[0];
				if (!rootNode) {
					setFileTree([]);
					setExpandedDirectoryPaths(new Set());
					setSelectedDocumentId(null);
					setSelectedTreeNodePath(null);
					setErrorMessage(null);
					return true;
				}

				setDocuments([]);
				setFileTree(mappedTree);
				setExpandedDirectoryPaths(
					getRememberedExpandedDirectoryPaths('remote', rootNode.path)
				);
				setSelectedDocumentId(null);
				setSelectedTreeNodePath(rootNode.path);
				setWorkspaceSource({
					kind: 'remote',
					name: workspaceSource.name,
					uri: rootNode.path,
				});
				setWorkspaceMode('remote');
				setErrorMessage(null);
				return true;
			}

			if (selectedDocumentId) {
				try {
					const localDoc = await readLocalFile(selectedDocumentId);
					const updatedContent = localDoc.content;
					if (updatedContent !== null) {
						setDocuments((current) =>
							current.map((doc) =>
								doc.id === selectedDocumentId
									? {
											...doc,
											content: updatedContent,
											lastSavedContent: updatedContent,
										}
									: doc
							)
						);
					}
				} catch {
					// silently ignore if we can't refresh the document content
				}
			}

			const targetDirectoryUri =
				focusedTreeNode?.kind === 'directory'
					? focusedTreeNode.path
					: focusedTreeNode?.kind === 'file'
						? (getParentDirectoryUriForFile(fileTree, focusedTreeNode.path) ??
							workspaceSource.uri)
						: selectedDocumentId
							? (getParentDirectoryUriForFile(fileTree, selectedDocumentId) ??
								workspaceSource.uri)
							: workspaceSource.uri;

			await refreshDirectoryInTree(targetDirectoryUri, workspaceSource.uri);
			setExpandedDirectoryPaths((current) => {
				if (current.has(targetDirectoryUri)) return current;
				const next = new Set(current);
				next.add(targetDirectoryUri);
				return next;
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			const message = getErrorMessage(error, '');
			if (
				workspaceSource.kind === 'remote' &&
				isRemoteConnectionUnavailableMessage(message)
			) {
				showRemoteDisconnectedWorkspace();
				return true;
			}
			setErrorMessage(getLocalizedEditorError(error, 'refreshFilesFailed'));
			return false;
		}
	}, [
		fileTree,
		focusedTreeNode,
		getRememberedExpandedDirectoryPaths,
		persistWorkspace,
		refreshRemoteFileTree,
		refreshDirectoryInTree,
		selectedDocumentId,
		showRemoteDisconnectedWorkspace,
		workspaceSource,
	]);

	const locateSelectedDocumentInTree = useCallback(() => {
		if (!selectedDocumentId) return false;

		setSelectedTreeNodePath(selectedDocumentId);

		if (workspaceSource.kind === 'directory') {
			const ancestorDirectoryPaths = findAncestorDirectoryPaths(
				fileTree,
				selectedDocumentId
			);
			if (!ancestorDirectoryPaths) return false;

			setExpandedDirectoryPaths((current) => {
				const next = new Set(current);
				for (const path of ancestorDirectoryPaths) {
					next.add(path);
				}
				return next;
			});
			void persistDirectoryWorkspace({
				nextSelectedDocumentId: selectedDocumentId,
				nextSelectedTreeNodePath: selectedDocumentId,
			});
			return true;
		}

		if (workspaceSource.kind === 'file') {
			void persistWorkspace({
				kind: 'file',
				uri: workspaceSource.uri,
				selectedTreeNodePath: selectedDocumentId,
			});
			return true;
		}

		return fileTree.length === 0;
	}, [
		fileTree,
		persistDirectoryWorkspace,
		persistWorkspace,
		selectedDocumentId,
		workspaceSource,
	]);

	const deleteSelectedEntry = useCallback(async () => {
		if (!focusedTreeNode || workspaceSource.kind !== 'directory') return false;

		try {
			await deleteLocalEntry(focusedTreeNode.path, focusedTreeNode.kind);

			if (focusedTreeNode.kind === 'directory') {
				setExpandedDirectoryPaths((current) => {
					if (!current.has(focusedTreeNode.path)) return current;
					const next = new Set(current);
					next.delete(focusedTreeNode.path);
					return next;
				});
			}

			const parentDirectoryUri =
				focusedTreeNode.path === workspaceSource.uri
					? workspaceSource.uri
					: (getParentDirectoryUriForFile(fileTree, focusedTreeNode.path) ??
						workspaceSource.uri);
			await refreshDirectoryInTree(parentDirectoryUri, workspaceSource.uri);

			if (focusedTreeNode.kind === 'file') {
				setDocuments((current) =>
					current.filter((document) => document.id !== focusedTreeNode.path)
				);
				if (selectedDocumentId === focusedTreeNode.path) {
					setSelectedDocumentId(null);
				}
				if (copyState?.documentId === focusedTreeNode.path) {
					setCopyState(null);
				}
				if (bookmarkedDocumentIds.includes(focusedTreeNode.path)) {
					const nextBookmarks = bookmarkedDocumentIds.filter(
						(item) => item !== focusedTreeNode.path
					);
					setBookmarkedDocumentIds(nextBookmarks);
					await persistBookmarks(nextBookmarks);
				}
			}

			const nextSelectedDocumentId =
				selectedDocumentId === focusedTreeNode.path ? null : selectedDocumentId;
			const nextSelectedTreeNodePath =
				focusedTreeNode.path === workspaceSource.uri
					? workspaceSource.uri
					: parentDirectoryUri;

			setSelectedDocumentId(nextSelectedDocumentId);
			setSelectedTreeNodePath(nextSelectedTreeNodePath);
			await persistDirectoryWorkspace({
				nextSelectedDocumentId,
				nextSelectedTreeNodePath,
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			setErrorMessage(getLocalizedEditorError(error, 'deleteItemFailed'));
			return false;
		}
	}, [
		bookmarkedDocumentIds,
		copyState,
		fileTree,
		focusedTreeNode,
		persistBookmarks,
		persistDirectoryWorkspace,
		refreshDirectoryInTree,
		selectedDocumentId,
		workspaceSource,
	]);

	const toggleBookmark = useCallback(async () => {
		if (focusedTreeNode?.kind !== 'file') return;

		const nextBookmarks = bookmarkedDocumentIds.includes(focusedTreeNode.path)
			? bookmarkedDocumentIds.filter((item) => item !== focusedTreeNode.path)
			: [...bookmarkedDocumentIds, focusedTreeNode.path];
		setBookmarkedDocumentIds(nextBookmarks);
		await persistBookmarks(nextBookmarks);
	}, [bookmarkedDocumentIds, focusedTreeNode, persistBookmarks]);

	const requestInlineCompletion = useCallback(
		async (fullText: string, cursorPos: number): Promise<string> => {
			if (!selectedDocument) return '';

			const prefix = fullText.slice(Math.max(0, cursorPos - 12000), cursorPos);
			const suffix = fullText.slice(cursorPos, cursorPos + 4000);

			try {
				const localConfig = await aiSettings.getCompletionConfig();
				if (!localConfig) return '';

				return await generateCompletion({
					config: localConfig,
					request: {
						prefix,
						suffix: suffix.length > 0 ? suffix : null,
						title: selectedDocument.title,
					},
				});
			} catch {
				return '';
			}
		},
		[aiSettings, selectedDocument]
	);

	useEffect(() => {
		let cancelled = false;

		async function hydrateWorkspace() {
			try {
				const [storedWorkspace, storedBookmarks, storedExpanded] =
					await Promise.all([
						SecureStore.getItemAsync(LAST_WORKSPACE_KEY),
						SecureStore.getItemAsync(BOOKMARKS_KEY),
						SecureStore.getItemAsync(EXPANDED_DIRECTORIES_KEY),
					]);
				if (!cancelled && storedBookmarks) {
					const parsedBookmarks = JSON.parse(storedBookmarks);
					if (Array.isArray(parsedBookmarks)) {
						setBookmarkedDocumentIds(
							parsedBookmarks.filter(
								(item): item is string => typeof item === 'string'
							)
						);
					}
				}

				const stored = storedWorkspace;
				if (!stored || cancelled) {
					setDidHydrateWorkspace(true);
					return;
				}

				const parsed = JSON.parse(stored) as PersistedWorkspace;

				if (parsed.kind === 'file') {
					const document = await readLocalFile(parsed.uri);
					if (cancelled) return;

					setDocuments([document]);
					setFileTree([]);
					setSelectedDocumentId(document.id);
					setSelectedTreeNodePath(parsed.selectedTreeNodePath ?? document.id);
					setWorkspaceSource({
						kind: 'file',
						name: document.title,
						uri: document.path,
					});
					setErrorMessage(null);
					setDidHydrateWorkspace(true);
					return;
				}

				const result = await readLocalDirectory(parsed.uri);
				if (cancelled) return;

				const rootUri = result.uri;
				const expanded = new Set<string>([result.root.path]);
				if (storedExpanded) {
					const parsedExpanded = JSON.parse(storedExpanded);
					if (Array.isArray(parsedExpanded)) {
						for (const item of parsedExpanded) {
							if (typeof item === 'string') expanded.add(item);
						}
					}
				}

				let restoredTree: EditorNode[] = [result.root];
				const expandedExceptRoot = [...expanded]
					.filter((path) => path !== rootUri)
					.sort((a, b) => a.split('/').length - b.split('/').length);
				for (const directoryPath of expandedExceptRoot) {
					if (cancelled) return;
					try {
						const { children } = await readLocalDirectoryChildren(
							directoryPath,
							rootUri
						);
						restoredTree = updateNodeInTree(
							restoredTree,
							directoryPath,
							(node) => ({
								...node,
								children,
								hasChildren: children.length > 0,
								loaded: true,
							})
						);
					} catch {
						expanded.delete(directoryPath);
					}
				}

				setDocuments([]);
				setFileTree(restoredTree);
				setExpandedDirectoryPaths(expanded);
				rememberedExpandedDirectoryPathsRef.current.local = new Set(expanded);
				setWorkspaceSource({
					kind: 'directory',
					name: result.root.name,
					uri: result.uri,
				});
				setSelectedDocumentId(parsed.selectedDocumentId);
				setSelectedTreeNodePath(
					parsed.selectedTreeNodePath ?? result.root.path
				);

				if (parsed.selectedDocumentId) {
					try {
						const document = await readLocalFile(
							parsed.selectedDocumentId,
							result.uri
						);
						if (cancelled) return;
						setDocuments([document]);
					} catch {
						setSelectedDocumentId(null);
					}
				}
				setErrorMessage(null);
			} catch {
				// ignore invalid persisted workspace
			} finally {
				if (!cancelled) {
					setDidHydrateWorkspace(true);
				}
			}
		}

		void hydrateWorkspace();

		return () => {
			cancelled = true;
		};
	}, []);

	const value = useMemo<EditorContextValue>(
		() => ({
			activeDocumentDirty,
			bookmarkedDocumentIds,
			cancelCopiedFile,
			copySelectedFile,
			copyState,
			createLocalDirectory: createDirectoryInWorkspace,
			createLocalFile,
			deleteSelectedEntry,
			discardUnsavedDocuments,
			documents,
			errorMessage,
			expandedDirectoryPaths,
			fileTree,
			focusedTreeNode,
			hasUnsavedDocuments,
			isFocusedTreeNodeBookmarked,
			isSavingActiveDocument,
			openLocalFile,
			openLocalFolder,
			openRemoteWorkspace,
			pasteCopiedFile,
			requestInlineCompletion,
			locateSelectedDocumentInTree,
			renameSelectedFile,
			refreshFileTree,
			saveActiveDocument,
			saveAllUnsavedDocuments,
			selectDocument,
			selectTreeNode,
			selectedDocument,
			selectedDocumentId,
			selectedTreeNodePath,
			toggleBookmark,
			toggleDirectoryExpanded,
			updateSelectedDocumentContent,
			workspaceSource,
			workspaceMode,
			switchWorkspaceMode,
		}),
		[
			activeDocumentDirty,
			bookmarkedDocumentIds,
			cancelCopiedFile,
			copySelectedFile,
			copyState,
			createDirectoryInWorkspace,
			createLocalFile,
			deleteSelectedEntry,
			discardUnsavedDocuments,
			documents,
			errorMessage,
			expandedDirectoryPaths,
			fileTree,
			focusedTreeNode,
			hasUnsavedDocuments,
			isFocusedTreeNodeBookmarked,
			isSavingActiveDocument,
			openLocalFile,
			openLocalFolder,
			openRemoteWorkspace,
			pasteCopiedFile,
			requestInlineCompletion,
			locateSelectedDocumentInTree,
			renameSelectedFile,
			refreshFileTree,
			saveActiveDocument,
			saveAllUnsavedDocuments,
			selectDocument,
			selectTreeNode,
			selectedDocument,
			selectedDocumentId,
			selectedTreeNodePath,
			toggleBookmark,
			toggleDirectoryExpanded,
			updateSelectedDocumentContent,
			workspaceSource,
			workspaceMode,
			switchWorkspaceMode,
		]
	);

	if (!didHydrateWorkspace) {
		return null;
	}

	return (
		<EditorContext.Provider value={value}>{children}</EditorContext.Provider>
	);
}

export function useEditorWorkspace() {
	const value = useContext(EditorContext);
	if (!value) {
		throw new Error('useEditorWorkspace must be used within EditorProvider');
	}
	return value;
}

function getErrorMessage(error: unknown, fallback: string) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === 'string' && error.length > 0) return error;
	return fallback;
}

type EditorErrorKey =
	| 'cannotResolveParentDirectory'
	| 'createFileFailed'
	| 'createFolderFailed'
	| 'deleteItemFailed'
	| 'emptyFileName'
	| 'fileAlreadyExists'
	| 'localFolderRequiredForFiles'
	| 'localFolderRequiredForFolders'
	| 'notConnected'
	| 'openFolderFailed'
	| 'openLocalFileFailed'
	| 'openLocalFolderFailed'
	| 'openRemoteWorkspaceFailed'
	| 'pasteFileFailed'
	| 'readFileFailed'
	| 'refreshFilesFailed'
	| 'remoteNoFiles'
	| 'remoteNoRoot'
	| 'remoteWorkspaceRequired'
	| 'renameFileFailed'
	| 'saveFileFailed'
	| 'singlePathSegment'
	| 'unexpectedResponse'
	| 'writeFailed';

const EDITOR_ERROR_MESSAGE_KEYS: Record<string, EditorErrorKey> = {
	'A file with that name already exists.': 'fileAlreadyExists',
	'Cannot resolve parent directory for file.': 'cannotResolveParentDirectory',
	'File name cannot be empty.': 'emptyFileName',
	'File name must be a single path segment.': 'singlePathSegment',
	'No workspace open on the desktop': 'remoteWorkspaceRequired',
	'Not connected': 'notConnected',
	'Unexpected response type': 'unexpectedResponse',
	'Write failed': 'writeFailed',
};

function editorError(key: EditorErrorKey) {
	return i18n.t(`editor.errors.${key}`);
}

function getLocalizedEditorError(error: unknown, fallbackKey: EditorErrorKey) {
	const message = getErrorMessage(error, '');
	const mappedKey = EDITOR_ERROR_MESSAGE_KEYS[message];
	if (mappedKey) return editorError(mappedKey);
	return editorError(fallbackKey);
}

function isPickerCancel(error: unknown) {
	const message = getErrorMessage(error, '').toLowerCase();
	return (
		message.includes('cancel') ||
		message.includes('canceled') ||
		message.includes('cancelled') ||
		message.includes('user did not select')
	);
}

function isRemoteConnectionUnavailableMessage(message: string) {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('not connected') ||
		normalized.includes('connection closed') ||
		normalized.includes('connection reset')
	);
}

function mapRemoteExplorerNodes(nodes: ExplorerNode[]): EditorNode[] {
	return nodes.map((node) => ({
		...node,
		id: node.path,
		children: mapRemoteExplorerNodes(node.children),
	}));
}

function findNodeByPath(
	nodes: EditorNode[],
	path: string | null
): EditorNode | null {
	if (!path) return null;

	for (const node of nodes) {
		if (node.path === path) {
			return node;
		}

		if (node.kind === 'directory') {
			const nestedNode = findNodeByPath(node.children, path);
			if (nestedNode) return nestedNode;
		}
	}

	return null;
}

function findAncestorDirectoryPaths(
	nodes: EditorNode[],
	targetPath: string,
	ancestors: string[] = []
): string[] | null {
	for (const node of nodes) {
		if (node.path === targetPath) {
			return ancestors;
		}

		if (node.kind === 'directory') {
			const nestedAncestors = findAncestorDirectoryPaths(
				node.children,
				targetPath,
				[...ancestors, node.path]
			);
			if (nestedAncestors) return nestedAncestors;
		}
	}

	return null;
}

/**
 * Immutable depth-first update: locate the directory node matching `targetPath`
 * and return a new tree with `updater` applied to it. Nodes along the matched
 * path are shallow-copied so React sees a new reference chain; untouched
 * branches keep their original references.
 */
function updateNodeInTree(
	nodes: EditorNode[],
	targetPath: string,
	updater: (node: EditorNode) => EditorNode
): EditorNode[] {
	let mutated = false;
	const nextNodes = nodes.map((node) => {
		if (node.path === targetPath) {
			mutated = true;
			return updater(node);
		}

		if (node.kind === 'directory' && node.children.length > 0) {
			const nextChildren = updateNodeInTree(node.children, targetPath, updater);
			if (nextChildren !== node.children) {
				mutated = true;
				return { ...node, children: nextChildren };
			}
		}

		return node;
	});

	return mutated ? nextNodes : nodes;
}
