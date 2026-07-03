import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';

import { generateCompletion, useAiSettings } from '@/features/ai';
import { useAppSettings } from '@/features/settings';
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
import type {
	EditorDocument,
	EditorNode,
	EditorWorkspaceSource,
} from '../types';

type EditorContextValue = {
	bookmarkedDocumentIds: string[];
	copySelectedFile: () => Promise<boolean>;
	copyState: {
		documentId: string;
		title: string;
	} | null;
	createLocalDirectory: (directoryName: string) => Promise<boolean>;
	createLocalFile: (fileName: string) => Promise<boolean>;
	deleteSelectedEntry: () => Promise<boolean>;
	documents: EditorDocument[];
	errorMessage: string | null;
	expandedDirectoryPaths: Set<string>;
	fileTree: EditorNode[];
	focusedTreeNode: EditorNode | null;
	isFocusedTreeNodeBookmarked: boolean;
	openLocalFile: () => Promise<boolean>;
	openLocalFolder: () => Promise<boolean>;
	pasteCopiedFile: () => Promise<boolean>;
	requestInlineCompletion: (
		fullText: string,
		cursorPos: number
	) => Promise<string>;
	renameSelectedFile: (nextName: string) => Promise<boolean>;
	selectDocument: (documentId: string) => Promise<void>;
	selectTreeNode: (nodePath: string) => void;
	selectedDocument: EditorDocument | null;
	selectedDocumentId: string | null;
	selectedTreeNodePath: string | null;
	toggleBookmark: () => Promise<void>;
	toggleDirectoryExpanded: (directoryPath: string) => void;
	updateSelectedDocumentContent: (content: string) => void;
	workspaceSource: EditorWorkspaceSource;
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
	const [workspaceSource, setWorkspaceSource] = useState<EditorWorkspaceSource>(
		{
			kind: 'empty',
		}
	);
	const [didHydrateWorkspace, setDidHydrateWorkspace] = useState(false);

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

	/**
	 * Lazily load the immediate children of a directory and merge them into the
	 * tree (targeted patch). The root directory (depth 0) is loaded by
	 * `readLocalDirectory`; deeper directories load on demand here.
	 */
	const loadDirectoryIntoTree = useCallback(
		async (directoryPath: string, rootUri: string) => {
			const { children } = await readLocalDirectoryChildren(
				directoryPath,
				rootUri
			);
			setFileTree((current) =>
				updateNodeInTree(current, directoryPath, (node) => ({
					...node,
					children,
					hasChildren: children.length > 0,
					loaded: true,
				}))
			);
		},
		[]
	);

	/**
	 * Targeted refresh: re-read a single directory's immediate children and
	 * patch only that node, preserving the loaded state of every other branch.
	 */
	const refreshDirectoryInTree = useCallback(
		async (directoryPath: string, rootUri: string) => {
			const { children } = await readLocalDirectoryChildren(
				directoryPath,
				rootUri
			);
			setFileTree((current) =>
				updateNodeInTree(current, directoryPath, (node) => ({
					...node,
					children,
					hasChildren: children.length > 0,
					loaded: true,
				}))
			);
		},
		[]
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
					setErrorMessage('Open a local folder before creating files here.');
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
				setErrorMessage(getErrorMessage(error, 'Failed to create local file'));
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
					setErrorMessage('Open a local folder before creating folders here.');
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
				setErrorMessage(getErrorMessage(error, 'Failed to create folder'));
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
			setErrorMessage(getErrorMessage(error, 'Failed to open local file'));
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
			setExpandedDirectoryPaths(new Set([result.root.path]));
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
			setErrorMessage(getErrorMessage(error, 'Failed to open local folder'));
			return false;
		}
	}, [persistWorkspace]);

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
				const document = await readLocalFile(
					documentId,
					workspaceSource.kind === 'directory' ? workspaceSource.uri : null
				);
				setDocuments((current) => {
					const exists = current.some((item) => item.id === document.id);
					if (!exists) return [document, ...current];
					return current.map((item) =>
						item.id === document.id ? document : item
					);
				});
				setErrorMessage(null);
			} catch (error) {
				setErrorMessage(getErrorMessage(error, 'Failed to read local file'));
			}
		},
		[documents, persistDirectoryWorkspace, persistWorkspace, workspaceSource]
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
			let willExpand = false;
			setExpandedDirectoryPaths((current) => {
				const next = new Set(current);
				if (next.has(directoryPath)) {
					next.delete(directoryPath);
				} else {
					next.add(directoryPath);
					willExpand = true;
				}
				return next;
			});

			if (
				willExpand &&
				workspaceSource.kind === 'directory' &&
				directoryPath !== workspaceSource.uri
			) {
				const node = findNodeByPath(fileTree, directoryPath);
				if (node?.kind === 'directory' && !node.loaded) {
					void loadDirectoryIntoTree(directoryPath, workspaceSource.uri);
				}
			}
		},
		[fileTree, loadDirectoryIntoTree, workspaceSource]
	);

	useEffect(() => {
		if (!didHydrateWorkspace) return;
		void SecureStore.setItemAsync(
			EXPANDED_DIRECTORIES_KEY,
			JSON.stringify([...expandedDirectoryPaths])
		);
	}, [didHydrateWorkspace, expandedDirectoryPaths]);

	useEffect(() => {
		if (!errorMessage) return;
		showErrorToast(errorMessage);

		const timeoutId = setTimeout(() => {
			setErrorMessage(null);
		}, 0);

		return () => clearTimeout(timeoutId);
	}, [errorMessage, showErrorToast]);

	const updateSelectedDocumentContent = useCallback(
		(content: string) => {
			if (!selectedDocumentId) return;

			const now = Date.now();
			setDocuments((current) =>
				current.map((document) =>
					document.id === selectedDocumentId
						? { ...document, content, updatedAt: now }
						: document
				)
			);

			if (saveMode === 'auto') {
				try {
					void writeLocalFile(selectedDocumentId, content);
					setErrorMessage(null);
				} catch (error) {
					setErrorMessage(getErrorMessage(error, 'Failed to save local file'));
				}
			}
		},
		[saveMode, selectedDocumentId]
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
				setErrorMessage(getErrorMessage(error, 'Failed to rename local file'));
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
			await refreshDirectoryInTree(targetDirectoryUri, workspaceSource.uri);
			await persistDirectoryWorkspace({
				nextSelectedDocumentId: pastedDocument.id,
				nextSelectedTreeNodePath: pastedDocument.id,
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			setErrorMessage(getErrorMessage(error, 'Failed to paste local file'));
			return false;
		}
	}, [
		copyState,
		getCurrentTargetDirectoryUri,
		persistDirectoryWorkspace,
		refreshDirectoryInTree,
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
			setErrorMessage(getErrorMessage(error, 'Failed to delete item'));
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
			bookmarkedDocumentIds,
			copySelectedFile,
			copyState,
			createLocalDirectory: createDirectoryInWorkspace,
			createLocalFile,
			deleteSelectedEntry,
			documents,
			errorMessage,
			expandedDirectoryPaths,
			fileTree,
			focusedTreeNode,
			isFocusedTreeNodeBookmarked,
			openLocalFile,
			openLocalFolder,
			pasteCopiedFile,
			requestInlineCompletion,
			renameSelectedFile,
			selectDocument,
			selectTreeNode,
			selectedDocument,
			selectedDocumentId,
			selectedTreeNodePath,
			toggleBookmark,
			toggleDirectoryExpanded,
			updateSelectedDocumentContent,
			workspaceSource,
		}),
		[
			bookmarkedDocumentIds,
			copySelectedFile,
			copyState,
			createDirectoryInWorkspace,
			createLocalFile,
			deleteSelectedEntry,
			documents,
			errorMessage,
			expandedDirectoryPaths,
			fileTree,
			focusedTreeNode,
			isFocusedTreeNodeBookmarked,
			openLocalFile,
			openLocalFolder,
			pasteCopiedFile,
			requestInlineCompletion,
			renameSelectedFile,
			selectDocument,
			selectTreeNode,
			selectedDocument,
			selectedDocumentId,
			selectedTreeNodePath,
			toggleBookmark,
			toggleDirectoryExpanded,
			updateSelectedDocumentContent,
			workspaceSource,
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

function isPickerCancel(error: unknown) {
	const message = getErrorMessage(error, '').toLowerCase();
	return (
		message.includes('cancel') ||
		message.includes('canceled') ||
		message.includes('cancelled') ||
		message.includes('user did not select')
	);
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
