import {
	createMarkdownFile,
	createWorkspaceDirectory,
	copyWorkspaceNode,
	deleteWorkspaceNode,
	moveWorkspaceNode,
	pickWorkspaceFolder,
	readWorkspaceDirectory,
	readWorkspaceFile,
	renameWorkspaceNode,
	scanWorkspaceFolder,
} from '@/invoke/explorer';
import { gitRestoreFile, gitStatus as fetchGitStatus } from '@/invoke/git';
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';

import { useAiSettings } from '@/components/system/ai-settings-provider';
import { FileExplorerSidebar } from '@/components/explorer/file/file-explorer-sidebar';
import { FilePreview } from '@/components/explorer/file/file-preview';
import { TabBar } from '@/components/explorer/workspace/tab-bar';
import type { TabEntry } from '@/components/explorer/workspace/tab-bar';
import { showErrorToast } from '@/components/ui/toast';

import {
	getParentPath,
	isSameOrDescendantPath,
	joinExplorerPath,
	normalizeExplorerPath,
	remapPathPrefix,
	replacePathBaseName,
} from '../../../lib/path-utils';
import type {
	ExplorerClipboardItem,
	ExplorerNode,
	FilePreview as FilePreviewData,
} from '../types';
import type { GitStatus } from '../git/git-types';

const WORKSPACE_ROOT_STORAGE_KEY = 'madora-workspace-root-path';
const LAST_OPEN_FILE_STORAGE_KEY = 'madora-last-open-file-path';
const OPEN_TABS_STORAGE_KEY = 'madora-open-tab-paths';
const SIDEBAR_WIDTH_STORAGE_KEY = 'madora-workspace-sidebar-width';
const TAB_BAR_MODE_STORAGE_KEY = 'madora-tab-bar-mode';
const MARKDOWN_DRAFT_KEY_PREFIX = 'madora-markdown-draft:';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 560;

type ClipboardMode = 'copy' | 'cut';
type WorkspaceOperation = 'create' | 'rename' | 'delete' | 'move' | null;

function removeMarkdownDraftsFor(path: string): void {
	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);
		if (key?.startsWith(`${MARKDOWN_DRAFT_KEY_PREFIX}${path}/`)) {
			window.localStorage.removeItem(key);
		}
	}
}

function clearAllMarkdownDrafts(): void {
	const keysToRemove: string[] = [];
	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);

		if (key?.startsWith(MARKDOWN_DRAFT_KEY_PREFIX)) {
			keysToRemove.push(key);
		}
	}

	for (const key of keysToRemove) {
		window.localStorage.removeItem(key);
	}
}

function clampSidebarWidth(width: number): number {
	return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function subscribeToTabBarMode(callback: () => void): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handleChange = () => callback();
	window.addEventListener('storage', handleChange);

	return () => {
		window.removeEventListener('storage', handleChange);
	};
}

function getStoredTabBarMode(): 'scroll' | 'wrap' {
	if (typeof window === 'undefined') {
		return 'scroll';
	}

	return window.localStorage.getItem(TAB_BAR_MODE_STORAGE_KEY) === 'wrap'
		? 'wrap'
		: 'scroll';
}

function getServerTabBarModeSnapshot(): 'scroll' | 'wrap' {
	return 'scroll';
}

function getStoredOpenTabPaths(rootPath: string | null = null): string[] {
	try {
		const saved = window.localStorage.getItem(OPEN_TABS_STORAGE_KEY);

		if (!saved) {
			return [];
		}

		const parsed = JSON.parse(saved);

		if (!Array.isArray(parsed)) {
			return [];
		}

		const seen = new Set<string>();
		const paths: string[] = [];

		for (const value of parsed) {
			if (typeof value !== 'string') {
				continue;
			}

			const normalizedPath = normalizeExplorerPath(value);

			if (
				seen.has(normalizedPath) ||
				(rootPath !== null && !isSameOrDescendantPath(normalizedPath, rootPath))
			) {
				continue;
			}

			seen.add(normalizedPath);
			paths.push(value);
		}

		return paths;
	} catch {
		return [];
	}
}

function getInitialSidebarWidth(): number {
	const savedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);

	if (!savedWidth) {
		return DEFAULT_SIDEBAR_WIDTH;
	}

	const parsedWidth = Number(savedWidth);

	if (!Number.isFinite(parsedWidth)) {
		return DEFAULT_SIDEBAR_WIDTH;
	}

	return clampSidebarWidth(parsedWidth);
}

function findFirstFile(node: ExplorerNode): ExplorerNode | null {
	if (node.kind === 'file') {
		return node;
	}

	for (const child of node.children) {
		const firstFile = findFirstFile(child);

		if (firstFile) {
			return firstFile;
		}
	}

	return null;
}

function findNodeByPath(node: ExplorerNode, path: string): ExplorerNode | null {
	if (node.path === path) {
		return node;
	}

	if (node.kind === 'file') {
		return null;
	}

	for (const child of node.children) {
		const match = findNodeByPath(child, path);

		if (match) {
			return match;
		}
	}

	return null;
}

function replaceDirectoryChildren(
	node: ExplorerNode,
	directoryPath: string,
	children: ExplorerNode[]
): ExplorerNode {
	if (node.kind === 'directory' && node.path === directoryPath) {
		return {
			...node,
			children,
			hasChildren: children.length > 0,
			loaded: true,
		};
	}

	if (node.kind === 'file') {
		return node;
	}

	return {
		...node,
		children: node.children.map((child) =>
			replaceDirectoryChildren(child, directoryPath, children)
		),
	};
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return '发生了未知错误';
}

function getPathDepth(path: string): number {
	return path.replace(/\\/g, '/').split('/').filter(Boolean).length;
}

function getAncestorDirectoryPaths(
	rootPath: string,
	targetPath: string
): string[] {
	if (!isSameOrDescendantPath(targetPath, rootPath)) {
		return [];
	}

	const paths: string[] = [];
	let currentPath = getParentPath(targetPath);

	while (currentPath && currentPath !== rootPath) {
		paths.unshift(currentPath);
		currentPath = getParentPath(currentPath);
	}

	return paths;
}

function throwWithCause(message: string, cause: unknown): never {
	const error = new Error(message);
	(error as Error & { cause?: unknown }).cause = cause;
	throw error;
}

export function WorkspaceBrowser() {
	const tabBarMode = useSyncExternalStore(
		subscribeToTabBarMode,
		getStoredTabBarMode,
		getServerTabBarModeSnapshot
	);
	const { showHiddenFiles } = useAiSettings();
	const [sortEnabled, setSortEnabled] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
	const [root, setRoot] = useState<ExplorerNode | null>(null);
	const [selectedNodePath, setSelectedNodePath] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<ExplorerNode | null>(null);
	const [preview, setPreview] = useState<FilePreviewData | null>(null);
	const [sidebarError, setSidebarError] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [sidebarBusy, setSidebarBusy] = useState(false);
	const [gitBusy, setGitBusy] = useState(false);
	const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
	const [createBusy, setCreateBusy] = useState(false);
	const [operationBusy, setOperationBusy] = useState<WorkspaceOperation>(null);
	const [clipboard, setClipboard] = useState<{
		item: ExplorerClipboardItem;
		mode: ClipboardMode;
	} | null>(null);
	const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
	const [tabs, setTabs] = useState<TabEntry[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const tabIdCounter = useRef(0);
	const [previewLoading, setPreviewLoading] = useState(false);
	const previewRequestId = useRef(0);
	const dragStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
	const selectedFileRef = useRef<ExplorerNode | null>(null);
	const tabsPersistenceReadyRef = useRef(false);

	const clearPreviewState = useCallback(() => {
		previewRequestId.current += 1;
		setPreview(null);
		setPreviewError(null);
		setPreviewLoading(false);
		setSelectedFile(null);
	}, []);

	const clearSelectionAndPreview = useCallback(() => {
		setSelectedNodePath(null);
		clearPreviewState();
	}, [clearPreviewState]);

	useEffect(() => {
		window.localStorage.setItem(
			SIDEBAR_WIDTH_STORAGE_KEY,
			String(sidebarWidth)
		);
	}, [sidebarWidth]);

	useEffect(() => {
		selectedFileRef.current = selectedFile;

		if (selectedFile) {
			window.localStorage.setItem(
				LAST_OPEN_FILE_STORAGE_KEY,
				selectedFile.path
			);
		}
	}, [selectedFile]);

	useEffect(() => {
		if (!tabsPersistenceReadyRef.current) {
			return;
		}

		if (tabs.length === 0) {
			window.localStorage.removeItem(OPEN_TABS_STORAGE_KEY);
			return;
		}

		window.localStorage.setItem(
			OPEN_TABS_STORAGE_KEY,
			JSON.stringify(tabs.map((tab) => tab.node.path))
		);
	}, [tabs]);

	useEffect(() => {
		if (!sidebarError) {
			return;
		}

		showErrorToast('工作区操作失败', sidebarError);
	}, [sidebarError]);

	useEffect(() => {
		if (!previewError) {
			return;
		}

		showErrorToast('文件读取失败', previewError);
	}, [previewError]);

	const handleSidebarResizeStart = (
		event: React.PointerEvent<HTMLDivElement>
	) => {
		dragStartWidthRef.current = sidebarWidth;

		const startX = event.clientX;
		const pointerId = event.pointerId;
		const target = event.currentTarget;

		target.setPointerCapture(pointerId);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const nextWidth = Math.min(
				MAX_SIDEBAR_WIDTH,
				Math.max(
					MIN_SIDEBAR_WIDTH,
					dragStartWidthRef.current + moveEvent.clientX - startX
				)
			);

			setSidebarWidth(clampSidebarWidth(nextWidth));
		};

		const cleanup = () => {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
			window.removeEventListener('pointercancel', handlePointerUp);
		};

		const handlePointerUp = () => {
			cleanup();
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointercancel', handlePointerUp);
	};

	const resolveNodeFromPath = useCallback(
		async (
			nextRoot: ExplorerNode,
			targetPath: string | null
		): Promise<{ node: ExplorerNode | null; root: ExplorerNode }> => {
			if (!targetPath || !isSameOrDescendantPath(targetPath, nextRoot.path)) {
				return {
					node: null,
					root: nextRoot,
				};
			}

			let resolvedRoot = nextRoot;

			for (const directoryPath of getAncestorDirectoryPaths(
				nextRoot.path,
				targetPath
			)) {
				const directoryNode = findNodeByPath(resolvedRoot, directoryPath);

				if (
					!directoryNode ||
					directoryNode.kind !== 'directory' ||
					directoryNode.loaded
				) {
					continue;
				}

				const children = await readWorkspaceDirectory({
					directoryPath,
					rootPath: nextRoot.path,
					showHiddenFiles,
					sort: sortEnabled,
				});

				resolvedRoot = replaceDirectoryChildren(
					resolvedRoot,
					directoryPath,
					children
				);
			}

			return {
				node: findNodeByPath(resolvedRoot, targetPath),
				root: resolvedRoot,
			};
		},
		[showHiddenFiles]
	);

	const loadPreview = useCallback(async (file: ExplorerNode) => {
		const requestId = previewRequestId.current + 1;
		previewRequestId.current = requestId;
		setSelectedNodePath(file.path);
		setSelectedFile(file);
		setPreview(null);
		setPreviewError(null);
		setPreviewLoading(true);

		try {
			const nextPreview = await readWorkspaceFile({
				path: file.path,
			});

			if (previewRequestId.current !== requestId) {
				return;
			}

			setPreview(nextPreview);
		} catch (error) {
			if (previewRequestId.current !== requestId) {
				return;
			}

			setPreviewError(getErrorMessage(error));
		} finally {
			if (previewRequestId.current === requestId) {
				setPreviewLoading(false);
			}
		}
	}, []);

	const syncSelectionWithRoot = useCallback(
		async (nextRoot: ExplorerNode, preferredSelectedPath: string | null) => {
			const { node: nextSelectedNode, root: resolvedRoot } =
				await resolveNodeFromPath(nextRoot, preferredSelectedPath);

			if (resolvedRoot !== nextRoot) {
				setRoot(resolvedRoot);
			}

			if (!nextSelectedNode) {
				clearSelectionAndPreview();
				return;
			}

			if (nextSelectedNode.kind === 'file') {
				await loadPreview(nextSelectedNode);
				return;
			}

			setSelectedNodePath(nextSelectedNode.path);
			clearPreviewState();
		},
		[
			clearPreviewState,
			clearSelectionAndPreview,
			loadPreview,
			resolveNodeFromPath,
		]
	);

	const createTabEntry = useCallback((node: ExplorerNode): TabEntry => {
		const tabId = `tab-${++tabIdCounter.current}`;

		return {
			id: tabId,
			node,
			preview: null,
			previewLoading: false,
			previewError: null,
			previewRequestId: 0,
		};
	}, []);

	const restoreTabs = useCallback(
		async (nextRoot: ExplorerNode, fallbackFile: ExplorerNode | null) => {
			let resolvedRoot = nextRoot;
			const restoredTabs: TabEntry[] = [];
			const storedTabPaths = getStoredOpenTabPaths(nextRoot.path);
			const tabPaths =
				storedTabPaths.length > 0
					? storedTabPaths
					: fallbackFile
						? [fallbackFile.path]
						: [];

			for (const path of tabPaths) {
				const { node, root: nextResolvedRoot } = await resolveNodeFromPath(
					resolvedRoot,
					path
				);
				resolvedRoot = nextResolvedRoot;

				if (node?.kind !== 'file') {
					continue;
				}

				const normalizedPath = normalizeExplorerPath(node.path);

				if (
					restoredTabs.some(
						(tab) => normalizeExplorerPath(tab.node.path) === normalizedPath
					)
				) {
					continue;
				}

				restoredTabs.push(createTabEntry(node));
			}

			const preferredPath = fallbackFile
				? normalizeExplorerPath(fallbackFile.path)
				: null;
			const activeTab = preferredPath
				? restoredTabs.find(
						(tab) => normalizeExplorerPath(tab.node.path) === preferredPath
					)
				: (restoredTabs[0] ?? null);

			return {
				activeNode: activeTab?.node ?? null,
				activeTabId: activeTab?.id ?? null,
				root: resolvedRoot,
				tabs: restoredTabs,
			};
		},
		[createTabEntry, resolveNodeFromPath]
	);

	const selectNode = async (node: ExplorerNode) => {
		if (selectedNodePath === node.path) {
			return;
		}

		if (node.kind === 'directory') {
			setSelectedNodePath(node.path);
			clearPreviewState();
			return;
		}

		// Add or activate tab for this file
		const normalizedPath = normalizeExplorerPath(node.path);
		const existingTab = tabs.find(
			(t) => normalizeExplorerPath(t.node.path) === normalizedPath
		);

		if (existingTab) {
			setActiveTabId(existingTab.id);
		} else {
			const newTab = createTabEntry(node);
			setTabs((prev) => [...prev, newTab]);
			setActiveTabId(newTab.id);
		}

		if (node.isMissing) {
			setSelectedNodePath(node.path);
			setSelectedFile(node);
			setPreview(null);
			setPreviewError(null);
			setPreviewLoading(false);
			return;
		}

		await loadPreview(node);
	};

	const handleSelectTab = (tabId: string) => {
		const tab = tabs.find((t) => t.id === tabId);
		if (tab && tab.id !== activeTabId) {
			void selectNode(tab.node);
		}
	};

	const handleCloseTab = (tabId: string) => {
		const wasActive = activeTabId === tabId;
		const newTabs = tabs.filter((t) => t.id !== tabId);
		setTabs(newTabs);

		if (wasActive) {
			if (newTabs.length > 0) {
				const idx = tabs.findIndex((t) => t.id === tabId);
				const next = newTabs[Math.min(idx, newTabs.length - 1)];
				setActiveTabId(next.id);
				void selectNode(next.node);
			} else {
				setActiveTabId(null);
				clearSelectionAndPreview();
			}
		}
	};

	const handleCloseTabs = (tabIds: string[]) => {
		const wasActive = activeTabId ? tabIds.includes(activeTabId) : false;
		const newTabs = tabs.filter((t) => !tabIds.includes(t.id));
		setTabs(newTabs);

		if (wasActive) {
			if (newTabs.length > 0) {
				const idx = tabs.findIndex((t) => t.id === activeTabId);
				const next = newTabs[Math.min(idx, newTabs.length - 1)];
				setActiveTabId(next.id);
				void selectNode(next.node);
			} else {
				setActiveTabId(null);
				clearSelectionAndPreview();
			}
		}
	};

	const restoreDeletedNode = async (targetPath: string) => {
		if (!root) {
			return;
		}

		setOperationBusy('move');
		setSidebarError(null);

		try {
			const nextStatus = await gitRestoreFile({
				path: targetPath,
				rootPath: root.path,
			});
			const nextRoot = await scanWorkspaceFolder({
				rootPath: root.path,
				showHiddenFiles,
				sort: sortEnabled,
			});

			setLoadingPaths(new Set());
			setRoot(nextRoot);
			setGitStatus(nextStatus);
			await syncSelectionWithRoot(nextRoot, targetPath);
		} catch (error) {
			const message = getErrorMessage(error);

			setSidebarError(message);
			throwWithCause(message, error);
		} finally {
			setOperationBusy(null);
		}
	};

	const resolveDestinationDirectory = (
		targetPath: string | null
	): string | null => {
		if (!root) {
			return null;
		}

		if (!targetPath) {
			return root.path;
		}

		const targetNode = findNodeByPath(root, targetPath);

		if (!targetNode) {
			return root.path;
		}

		if (targetNode.kind === 'directory') {
			return targetNode.path;
		}

		return getParentPath(targetNode.path) ?? root.path;
	};

	const refreshDirectories = async (
		currentRoot: ExplorerNode,
		directoryPaths: Array<string | null>
	) => {
		let nextRoot = currentRoot;
		const rootPath = currentRoot.path;
		const pathsToRefresh = [
			...new Set(
				directoryPaths.filter((path): path is string => Boolean(path))
			),
		].sort((left, right) => getPathDepth(left) - getPathDepth(right));

		for (const directoryPath of pathsToRefresh) {
			const directoryNode = findNodeByPath(nextRoot, directoryPath);

			if (!directoryNode || directoryNode.kind !== 'directory') {
				continue;
			}

			const children = await readWorkspaceDirectory({
				directoryPath,
				rootPath,
				showHiddenFiles,
				sort: sortEnabled,
			});

			nextRoot = replaceDirectoryChildren(nextRoot, directoryPath, children);
		}

		return nextRoot;
	};

	const openFolder = async () => {
		setSidebarBusy(true);
		setSidebarError(null);

		try {
			const nextRoot = await pickWorkspaceFolder({
				showHiddenFiles,
				sort: sortEnabled,
			});

			if (!nextRoot) {
				return;
			}

			setLoadingPaths(new Set());
			setClipboard(null);

			const savedLastOpenFilePath = window.localStorage.getItem(
				LAST_OPEN_FILE_STORAGE_KEY
			);
			const { node: nextSelectedFile, root: resolvedRoot } =
				await resolveNodeFromPath(nextRoot, savedLastOpenFilePath);

			setRoot(resolvedRoot);
			queueMicrotask(() => setGitStatus(null));
			window.localStorage.setItem(
				WORKSPACE_ROOT_STORAGE_KEY,
				resolvedRoot.path
			);

			const fileToOpen =
				nextSelectedFile?.kind === 'file'
					? nextSelectedFile
					: findFirstFile(resolvedRoot);
			const {
				activeNode,
				activeTabId: restoredActiveTabId,
				root: rootWithTabs,
				tabs: restoredTabs,
			} = await restoreTabs(resolvedRoot, fileToOpen);

			tabsPersistenceReadyRef.current = true;
			setRoot(rootWithTabs);
			setTabs(restoredTabs);
			setActiveTabId(restoredActiveTabId);

			if (activeNode) {
				void loadPreview(activeNode);
			} else {
				queueMicrotask(() => clearSelectionAndPreview());
			}
		} catch (error) {
			setSidebarError(getErrorMessage(error));
		} finally {
			setSidebarBusy(false);
		}
	};

	const refreshFolder = async () => {
		if (!root) {
			return;
		}

		setSidebarBusy(true);
		setSidebarError(null);

		try {
			const nextRoot = await scanWorkspaceFolder({
				rootPath: root.path,
				showHiddenFiles,
				sort: sortEnabled,
			});

			setLoadingPaths(new Set());
			setRoot(nextRoot);
			setSidebarError(null);
			window.localStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, nextRoot.path);
			void syncSelectionWithRoot(nextRoot, selectedNodePath);
		} catch (error) {
			setSidebarError(getErrorMessage(error));
		} finally {
			setSidebarBusy(false);
		}
	};

	const createMarkdownDocument = async (
		fileName: string,
		targetPath: string | null
	) => {
		if (!root) {
			return;
		}

		const rootPath = root.path;
		const destinationDirectory =
			resolveDestinationDirectory(targetPath) ?? rootPath;
		const trimmedFileName = fileName.trim();
		const createdPath = joinExplorerPath(
			destinationDirectory,
			trimmedFileName.toLowerCase().endsWith('.md')
				? trimmedFileName
				: `${trimmedFileName}.md`
		);

		setCreateBusy(true);
		setSidebarError(null);

		try {
			await createMarkdownFile({
				fileName,
				rootPath,
				selectedPath: targetPath,
			});

			removeMarkdownDraftsFor(createdPath);

			// Re-scan the whole workspace to ensure the new file appears immediately.
			const nextRoot = await scanWorkspaceFolder({
				rootPath,
				sort: sortEnabled,
			});

			setLoadingPaths(new Set());
			setRoot(nextRoot);
			await syncSelectionWithRoot(nextRoot, createdPath);

			// Refresh git status after updating the tree so newly created files are
			// immediately reflected as untracked (N) in the git panel / badges.
			void refreshGitStatus(nextRoot.path);
		} catch (error) {
			const message = getErrorMessage(error);

			setSidebarError(message);
			throwWithCause(message, error);
		} finally {
			setCreateBusy(false);
		}
	};

	const createDirectory = async (
		directoryName: string,
		targetPath: string | null
	) => {
		if (!root) {
			return;
		}

		const rootPath = root.path;
		const destinationDirectory =
			resolveDestinationDirectory(targetPath) ?? rootPath;

		setCreateBusy(true);
		setSidebarError(null);

		try {
			await createWorkspaceDirectory({
				directoryName,
				rootPath,
				selectedPath: destinationDirectory,
			});

			// Re-scan the whole workspace to ensure the new directory appears immediately.
			const nextRoot = await scanWorkspaceFolder({
				rootPath,
				sort: sortEnabled,
			});

			setLoadingPaths(new Set());
			setRoot(nextRoot);
			await syncSelectionWithRoot(nextRoot, selectedNodePath);

			// Make sure git status is refreshed so the new directory shows up as
			// untracked (N) immediately.
			void refreshGitStatus(nextRoot.path);
		} catch (error) {
			const message = getErrorMessage(error);

			setSidebarError(message);
			throwWithCause(message, error);
		} finally {
			setCreateBusy(false);
		}
	};

	const renameNode = async (targetPath: string, newName: string) => {
		if (!root) {
			return;
		}

		const renamedPath = replacePathBaseName(targetPath, newName.trim());
		const nextSelectedPath = remapPathPrefix(
			selectedNodePath,
			targetPath,
			renamedPath
		);
		const nextClipboardPath = remapPathPrefix(
			clipboard?.item.path ?? null,
			targetPath,
			renamedPath
		);

		setOperationBusy('rename');
		setSidebarError(null);

		try {
			await renameWorkspaceNode({
				newName,
				rootPath: root.path,
				targetPath,
			});

			removeMarkdownDraftsFor(targetPath);
			removeMarkdownDraftsFor(renamedPath);

			const nextRoot = await scanWorkspaceFolder({
				rootPath: root.path,
				sort: sortEnabled,
			});

			setLoadingPaths(new Set());
			setRoot(nextRoot);

			if (clipboard && nextClipboardPath) {
				setClipboard({
					...clipboard,
					item: {
						...clipboard.item,
						name: newName.trim(),
						path: nextClipboardPath,
					},
				});
			}

			if (nextSelectedPath) {
				window.localStorage.setItem(
					LAST_OPEN_FILE_STORAGE_KEY,
					nextSelectedPath
				);
			} else {
				window.localStorage.removeItem(LAST_OPEN_FILE_STORAGE_KEY);
			}

			await syncSelectionWithRoot(nextRoot, nextSelectedPath);
			void refreshGitStatus(nextRoot.path);
		} catch (error) {
			const message = getErrorMessage(error);

			setSidebarError(message);
			throwWithCause(message, error);
		} finally {
			setOperationBusy(null);
		}
	};

	const deleteNode = async (targetPath: string) => {
		if (!root) {
			return;
		}

		const parentDirectory = getParentPath(targetPath) ?? root.path;
		const nextSelectedPath = remapPathPrefix(
			selectedNodePath,
			targetPath,
			null
		);
		const nextClipboardPath = remapPathPrefix(
			clipboard?.item.path ?? null,
			targetPath,
			null
		);

		setOperationBusy('delete');
		setSidebarError(null);

		try {
			await deleteWorkspaceNode({
				rootPath: root.path,
				targetPath,
			});

			removeMarkdownDraftsFor(targetPath);

			const nextRoot = await refreshDirectories(root, [parentDirectory]);

			setRoot(nextRoot);

			if (clipboard && nextClipboardPath === null) {
				setClipboard(null);
			}

			if (nextSelectedPath) {
				window.localStorage.setItem(
					LAST_OPEN_FILE_STORAGE_KEY,
					nextSelectedPath
				);
			} else {
				window.localStorage.removeItem(LAST_OPEN_FILE_STORAGE_KEY);
			}

			await syncSelectionWithRoot(nextRoot, nextSelectedPath);
			void refreshGitStatus(nextRoot.path);
		} catch (error) {
			const message = getErrorMessage(error);

			setSidebarError(message);
			throwWithCause(message, error);
		} finally {
			setOperationBusy(null);
		}
	};

	const cutNode = (node: ExplorerNode) => {
		setClipboard({
			item: {
				name: node.name,
				nodeKind: node.kind,
				path: node.path,
			},
			mode: 'cut',
		});
	};

	const copyNode = (node: ExplorerNode) => {
		setClipboard({
			item: {
				name: node.name,
				nodeKind: node.kind,
				path: node.path,
			},
			mode: 'copy',
		});
	};

	const pasteNode = async (destinationPath: string | null) => {
		if (!root || !clipboard) {
			return;
		}

		const destinationDirectory = resolveDestinationDirectory(destinationPath);

		if (!destinationDirectory) {
			return;
		}

		const movedPath = joinExplorerPath(
			destinationDirectory,
			clipboard.item.name
		);
		const nextSelectedPath = remapPathPrefix(
			selectedNodePath,
			clipboard.item.path,
			movedPath
		);

		setOperationBusy('move');
		setSidebarError(null);

		try {
			if (clipboard.mode === 'copy') {
				await copyWorkspaceNode({
					destinationDirectory,
					rootPath: root.path,
					sourcePath: clipboard.item.path,
				});
			} else {
				await moveWorkspaceNode({
					destinationDirectory,
					rootPath: root.path,
					sourcePath: clipboard.item.path,
				});
			}

			const nextRoot = await scanWorkspaceFolder({
				rootPath: root.path,
				sort: sortEnabled,
			});

			setLoadingPaths(new Set());
			setRoot(nextRoot);
			setClipboard(null);

			if (nextSelectedPath) {
				window.localStorage.setItem(
					LAST_OPEN_FILE_STORAGE_KEY,
					nextSelectedPath
				);
			} else {
				window.localStorage.removeItem(LAST_OPEN_FILE_STORAGE_KEY);
			}

			await syncSelectionWithRoot(nextRoot, nextSelectedPath);
			void refreshGitStatus(nextRoot.path);
		} catch (error) {
			const message = getErrorMessage(error);

			setSidebarError(message);
			throwWithCause(message, error);
		} finally {
			setOperationBusy(null);
		}
	};

	const expandDirectory = async (directory: ExplorerNode) => {
		if (!root || directory.kind !== 'directory' || directory.loaded) {
			return;
		}

		if (loadingPaths.has(directory.path)) {
			return;
		}

		const workspaceRootPath = root.path;

		setLoadingPaths((currentPaths) =>
			new Set(currentPaths).add(directory.path)
		);

		try {
			const children = await readWorkspaceDirectory({
				rootPath: workspaceRootPath,
				directoryPath: directory.path,
				showHiddenFiles,
				sort: sortEnabled,
			});

			setRoot((currentRoot) => {
				if (!currentRoot || currentRoot.path !== workspaceRootPath) {
					return currentRoot;
				}

				return replaceDirectoryChildren(currentRoot, directory.path, children);
			});
		} catch (error) {
			setSidebarError(getErrorMessage(error));
		} finally {
			setLoadingPaths((currentPaths) => {
				const nextPaths = new Set(currentPaths);
				nextPaths.delete(directory.path);
				return nextPaths;
			});
		}
	};

	useEffect(() => {
		const savedRootPath = window.localStorage.getItem(
			WORKSPACE_ROOT_STORAGE_KEY
		);
		const savedLastOpenFilePath = window.localStorage.getItem(
			LAST_OPEN_FILE_STORAGE_KEY
		);

		if (!savedRootPath) {
			return;
		}

		let active = true;

		const restoreWorkspace = async () => {
			setSidebarBusy(true);
			setSidebarError(null);

			try {
				const nextRoot = await scanWorkspaceFolder({
					rootPath: savedRootPath,
					showHiddenFiles,
					sort: sortEnabled,
				});

				if (!active) {
					return;
				}

				setLoadingPaths(new Set());
				setClipboard(null);
				const { node: nextSelectedFile, root: resolvedRoot } =
					await resolveNodeFromPath(nextRoot, savedLastOpenFilePath);

				if (!active) {
					return;
				}

				const fileToOpen =
					nextSelectedFile?.kind === 'file'
						? nextSelectedFile
						: findFirstFile(resolvedRoot);
				const {
					activeNode,
					activeTabId: restoredActiveTabId,
					root: rootWithTabs,
					tabs: restoredTabs,
				} = await restoreTabs(resolvedRoot, fileToOpen);

				tabsPersistenceReadyRef.current = true;
				setRoot(rootWithTabs);
				setTabs(restoredTabs);
				setActiveTabId(restoredActiveTabId);
				window.localStorage.setItem(
					WORKSPACE_ROOT_STORAGE_KEY,
					rootWithTabs.path
				);

				if (activeNode) {
					void loadPreview(activeNode);
				} else {
					clearSelectionAndPreview();
				}
			} catch (error) {
				if (!active) {
					return;
				}

				window.localStorage.removeItem(LAST_OPEN_FILE_STORAGE_KEY);
				window.localStorage.removeItem(OPEN_TABS_STORAGE_KEY);
				window.localStorage.removeItem(WORKSPACE_ROOT_STORAGE_KEY);
				tabsPersistenceReadyRef.current = true;
				setRoot(null);
				setClipboard(null);
				setTabs([]);
				setActiveTabId(null);
				clearSelectionAndPreview();
				setSidebarError(getErrorMessage(error));
			} finally {
				if (active) {
					setSidebarBusy(false);
				}
			}
		};

		void restoreWorkspace();

		return () => {
			active = false;
		};
	}, [
		clearSelectionAndPreview,
		resolveNodeFromPath,
		restoreTabs,
		showHiddenFiles,
	]);

	const refreshGitStatus = useCallback(
		async (targetRootPath?: string | null) => {
			const nextRootPath = targetRootPath ?? root?.path ?? null;

			if (!nextRootPath) {
				queueMicrotask(() => setGitStatus(null));
				return;
			}

			setGitBusy(true);

			try {
				const nextStatus = await fetchGitStatus({
					rootPath: nextRootPath,
				});
				setGitStatus(nextStatus);
			} catch (error) {
				queueMicrotask(() => setGitStatus(null));
				showErrorToast('Git 状态读取失败', getErrorMessage(error));
			} finally {
				setGitBusy(false);
			}
		},
		[root?.path]
	);

	useEffect(() => {
		if (!root?.path) {
			queueMicrotask(() => setGitStatus(null));
			return;
		}

		void refreshGitStatus(root.path);
	}, [refreshGitStatus, root?.path]);

	useEffect(() => {
		const handleWorkspaceFileSaved = (event: Event) => {
			const customEvent = event as CustomEvent<{
				filePath?: string;
				source?: string;
			}>;

			if (!root?.path) {
				return;
			}

			const savedPath = customEvent.detail?.filePath;

			if (!savedPath || !isSameOrDescendantPath(savedPath, root.path)) {
				return;
			}

			void refreshGitStatus(root.path);

			if (customEvent.detail?.source === 'conflict-resolve') {
				const currentFile = selectedFileRef.current;

				if (
					currentFile &&
					normalizeExplorerPath(currentFile.path) ===
						normalizeExplorerPath(savedPath)
				) {
					void loadPreview(currentFile);
				}
			}
		};

		window.addEventListener(
			'workspace-file-saved',
			handleWorkspaceFileSaved as EventListener
		);

		return () => {
			window.removeEventListener(
				'workspace-file-saved',
				handleWorkspaceFileSaved as EventListener
			);
		};
	}, [refreshGitStatus, root?.path]);

	useEffect(() => {
		if (!selectedFile?.isMissing) {
			return;
		}

		const normalizedSelectedPath = normalizeExplorerPath(selectedFile.path);
		const isStillDeleted = (gitStatus?.files ?? []).some(
			(file) =>
				file.status === 'deleted' &&
				normalizeExplorerPath(file.path) === normalizedSelectedPath
		);

		if (isStillDeleted) {
			return;
		}

		window.localStorage.removeItem(LAST_OPEN_FILE_STORAGE_KEY);

		if (!root) {
			queueMicrotask(() => clearSelectionAndPreview());
			return;
		}

		queueMicrotask(() => {
			void syncSelectionWithRoot(root, selectedFile.path);
		});
	}, [
		clearSelectionAndPreview,
		gitStatus,
		root,
		selectedFile,
		syncSelectionWithRoot,
	]);

	return (
		<div className="flex h-full min-h-0 bg-background text-foreground">
			<div
				className="relative flex h-full min-h-0 shrink-0"
				style={{ width: `${sidebarWidth}px` }}
			>
				<FileExplorerSidebar
					key={root?.path ?? 'empty'}
					busy={sidebarBusy}
					clipboard={clipboard}
					createBusy={createBusy}
					gitBusy={gitBusy}
					gitStatus={gitStatus}
					loadingPaths={loadingPaths}
					onCopyNode={copyNode}
					onCreateDirectory={createDirectory}
					onCreateMarkdown={createMarkdownDocument}
					onCutNode={cutNode}
					onDeleteNode={deleteNode}
					onRestoreDeletedNode={restoreDeletedNode}
					onOpenFolder={openFolder}
					onPasteNode={pasteNode}
					onRefresh={refreshFolder}
					sortEnabled={sortEnabled}
					onSortToggle={async () => {
						const newSort = !sortEnabled;
						setSortEnabled(newSort);
						if (!root) return;
						setSidebarBusy(true);
						setSidebarError(null);
						try {
							const nextRoot = await scanWorkspaceFolder({
								rootPath: root.path,
								showHiddenFiles,
								sort: newSort,
							});
							setLoadingPaths(new Set());
							setRoot(nextRoot);
							setSidebarError(null);
							window.localStorage.setItem(
								WORKSPACE_ROOT_STORAGE_KEY,
								nextRoot.path
							);
							void syncSelectionWithRoot(nextRoot, selectedNodePath);
						} catch (error) {
							setSidebarError(getErrorMessage(error));
						} finally {
							setSidebarBusy(false);
						}
					}}
					onGitRefresh={async () => {
						await refreshGitStatus();
						await refreshFolder();
					}}
					onGitRefreshWorkspace={async () => {
						clearAllMarkdownDrafts();
						await refreshGitStatus();
						await refreshFolder();
					}}
					onGitStatusChange={setGitStatus}
					onRenameNode={renameNode}
					onExpandDirectory={expandDirectory}
					onSelectNode={selectNode}
					onClearClipboard={() => setClipboard(null)}
					operationBusy={operationBusy}
					root={root}
					selectedPath={selectedNodePath}
				/>
				<div
					aria-label="调整侧边栏宽度"
					className="group absolute inset-y-0 right-0 z-10 w-3 translate-x-1/2
						cursor-col-resize bg-transparent"
					onPointerDown={handleSidebarResizeStart}
					role="separator"
				>
					<div
						className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2
							bg-border transition-colors group-hover:bg-primary
							group-active:bg-primary"
					/>
				</div>
			</div>
			<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
				{tabs.length > 0 && (
					<TabBar
						tabs={tabs}
						activeTabId={activeTabId}
						onSelectTab={handleSelectTab}
						onCloseTab={handleCloseTab}
						onCloseTabs={handleCloseTabs}
						tabBarMode={tabBarMode}
					/>
				)}
				<div
					className="flex min-h-0 flex-1 flex-col overflow-hidden"
					data-no-os
				>
					<FilePreview
						conflictedFilePaths={gitStatus?.conflictedFiles ?? []}
						loading={previewLoading}
						onOpenFolder={openFolder}
						preview={preview}
						rootPath={root?.path ?? null}
						selectedFile={selectedFile}
						workspaceOpen={Boolean(root)}
					/>
				</div>
			</main>
		</div>
	);
}
