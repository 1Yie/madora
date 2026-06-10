import {
	createMarkdownFile,
	createWorkspaceDirectory,
	copyWorkspaceNode,
	deleteWorkspaceNode,
	importExternalFiles,
	moveWorkspaceNode,
	pickWorkspaceFolder,
	readWorkspaceDirectory,
	readWorkspaceFile,
	renameWorkspaceNode,
	scanWorkspaceFolder,
} from '@/invoke/explorer';
import {
	getWorkspaceState,
	setWorkspaceRoot,
	addTab as addTabBackend,
	closeTab as closeTabBackend,
	closeTabs as closeTabsBackend,
	setActiveTab as setActiveTabBackend,
	setSidebarWidth as setSidebarWidthBackend,
	setOpenTabPaths as setOpenTabPathsBackend,
	clearWorkspaceState,
} from '@/invoke/workspace';
import { gitRestoreFile, gitStatus as fetchGitStatus } from '@/invoke/git';
import create from 'zustand';
import { useEffect, type ReactNode } from 'react';

import { useAppSettingsStore } from '@/context/app-settings-provider';
import { isEditorDirty } from '@/lib/unsaved-registry';
import type { TabEntry } from '@/components/explorer/workspace/tab-bar';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';

import {
	getParentPath,
	isSameOrDescendantPath,
	joinExplorerPath,
	normalizeExplorerPath,
	remapPathPrefix,
	replacePathBaseName,
} from '@/lib/path-utils';
import type {
	ExplorerClipboardItem,
	ExplorerNode,
	FilePreview as FilePreviewData,
} from '@/components/explorer/types';
import type { GitStatus } from '@/components/explorer/git/git-types';

// ─── Constants ─────────────────────────────────────────────────────

const MARKDOWN_DRAFT_KEY_PREFIX = 'madora-markdown-draft:';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 560;
const TAB_BAR_MODE_KEY = 'madora-tab-bar-mode';

// ─── Internal Types ────────────────────────────────────────────────

type ClipboardMode = 'copy' | 'cut';
type WorkspaceOperation = 'create' | 'rename' | 'delete' | 'move' | null;

type InitialWorkspaceState = {
	rootPath: string | null;
	openTabPaths: string[];
	lastActiveFilePath: string | null;
	sidebarWidth: number;
	tabBarMode: 'scroll' | 'wrap';
};

// ─── Module-level refs ─────────────────────────────────────────────

let tabIdCounter = 0;
let previewRequestIdCounter = 0;
let tabsPersistenceReady = false;

// ─── Exported Types ────────────────────────────────────────────────

export type WorkspaceContextValue = {
	/* ── File tree ── */
	root: ExplorerNode | null;
	initialised: boolean;
	loadingPaths: Set<string>;
	expandDirectory: (node: ExplorerNode) => void;

	/* ── Tab bar ── */
	tabs: TabEntry[];
	activeTabId: string | null;
	selectTab: (tabId: string) => void;
	closeTabAction: (tabId: string) => void;
	closeTabsAction: (tabIds: string[]) => void;
	reorderTabs: (fromIndex: number, toIndex: number) => void;
	tabBarMode: 'scroll' | 'wrap';

	/* ── Selection & preview ── */
	selectedFile: ExplorerNode | null;
	selectedNodePath: string | null;
	preview: FilePreviewData | null;
	previewLoading: boolean;
	selectNode: (node: ExplorerNode) => void;

	/* ── Sidebar state ── */
	sidebarWidth: number;
	sidebarBusy: boolean;
	operationBusy: 'create' | 'rename' | 'delete' | 'move' | null;
	createBusy: boolean;
	sortEnabled: boolean;
	sidebarError: string | null;
	setSidebarWidth: (w: number) => void;

	/* ── Clipboard ── */
	clipboard: {
		item: ExplorerClipboardItem;
		mode: 'copy' | 'cut';
	} | null;
	copyNode: (node: ExplorerNode) => void;
	cutNode: (node: ExplorerNode) => void;
	pasteNode: (destinationPath: string | null) => Promise<void>;
	clearClipboard: () => void;

	/* ── Git ── */
	gitStatus: GitStatus | null;
	gitBusy: boolean;
	refreshGitStatus: (targetRootPath?: string | null) => Promise<void>;

	/* ── Expansion state ── */
	expandedPaths: Set<string>;
	collapsedPaths: Set<string>;
	expansionRootPath: string | null;
	toggleDirectory: (
		path: string,
		rootPath: string | null,
		isCurrentlyExpanded: boolean
	) => void;
	/** Replace the entire expansion state (used by sidebar for batch operations). */
	setExpansionState: (
		expandedPaths: Set<string>,
		collapsedPaths: Set<string>,
		rootPath: string | null
	) => void;
	/** Directly update git status (used by GitPanel callbacks). */
	updateGitStatus: (status: GitStatus) => void;

	/* ── Operations ── */
	createMarkdownDocument: (
		fileName: string,
		targetPath: string | null
	) => Promise<void>;
	createDirectory: (
		directoryName: string,
		targetPath: string | null
	) => Promise<void>;
	renameNode: (targetPath: string, newName: string) => Promise<void>;
	deleteNode: (targetPath: string) => Promise<void>;
	restoreDeletedNode: (targetPath: string) => Promise<void>;
	importExternalFilesHandler: (
		sourcePaths: string[],
		destinationPath: string | null
	) => Promise<void>;
	openFolder: () => Promise<void>;
	refreshFolder: () => Promise<void>;
	toggleSort: () => Promise<void>;
	gitRefresh: () => Promise<void>;
	gitRefreshWorkspace: () => Promise<void>;
};

// ─── Module-level Helpers ──────────────────────────────────────────

function isOutsideWorkspace(path: string, workspaceRoot: string): boolean {
	return !isSameOrDescendantPath(path, workspaceRoot);
}

function clampSidebarWidth(width: number): number {
	return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

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

function findFirstFile(node: ExplorerNode): ExplorerNode | null {
	if (node.kind === 'file') return node;
	for (const child of node.children) {
		const firstFile = findFirstFile(child);
		if (firstFile) return firstFile;
	}
	return null;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return '发生了未知错误';
}

function findNodeByPath(node: ExplorerNode, path: string): ExplorerNode | null {
	if (node.path === path) return node;
	if (node.kind === 'file') return null;
	for (const child of node.children) {
		const match = findNodeByPath(child, path);
		if (match) return match;
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
	if (node.kind === 'file') return node;
	return {
		...node,
		children: node.children.map((child) =>
			replaceDirectoryChildren(child, directoryPath, children)
		),
	};
}

function getPathDepth(path: string): number {
	return path.replace(/\\/g, '/').split('/').filter(Boolean).length;
}

function getAncestorDirectoryPaths(
	rootPath: string,
	targetPath: string
): string[] {
	if (!isSameOrDescendantPath(targetPath, rootPath)) return [];
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

function readExpansionState(): {
	expandedPaths: Set<string>;
	collapsedPaths: Set<string>;
	rootPath: string | null;
} {
	try {
		const raw = window.localStorage.getItem('madora-tree-expansion');
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				expandedPaths: new Set<string>(parsed.expandedPaths ?? []),
				collapsedPaths: new Set<string>(parsed.collapsedPaths ?? []),
				rootPath: parsed.rootPath ?? null,
			};
		}
	} catch {
		/* ignore */
	}
	return {
		expandedPaths: new Set<string>(),
		collapsedPaths: new Set<string>(),
		rootPath: null,
	};
}

function persistExpansionState(
	expandedPaths: Set<string>,
	collapsedPaths: Set<string>,
	rootPath: string | null
): void {
	try {
		window.localStorage.setItem(
			'madora-tree-expansion',
			JSON.stringify({
				expandedPaths: [...expandedPaths],
				collapsedPaths: [...collapsedPaths],
				rootPath,
			})
		);
	} catch {
		/* ignore */
	}
}

function readTabBarModeFromLocalStorage(): 'scroll' | 'wrap' {
	try {
		const stored = window.localStorage.getItem(TAB_BAR_MODE_KEY);
		return stored === 'wrap' ? 'wrap' : 'scroll';
	} catch {
		return 'scroll';
	}
}

async function fetchInitialState(): Promise<InitialWorkspaceState> {
	const stored = readTabBarModeFromLocalStorage();
	try {
		const state = await getWorkspaceState();
		return {
			rootPath: state.rootPath,
			openTabPaths: state.openTabPaths,
			lastActiveFilePath: state.lastActiveFilePath,
			sidebarWidth: state.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
			tabBarMode:
				state.tabBarMode === 'wrap' || state.tabBarMode === 'scroll'
					? state.tabBarMode
					: stored,
		};
	} catch {
		return {
			rootPath: null,
			openTabPaths: [],
			lastActiveFilePath: null,
			sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
			tabBarMode: stored,
		};
	}
}

function createExternalNode(path: string): ExplorerNode {
	const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
	return {
		name,
		path,
		relativePath: path,
		kind: 'file',
		fileKind: /\.(md|markdown|mdx)$/i.test(path) ? 'markdown' : null,
		hasChildren: false,
		loaded: true,
		children: [],
	};
}

/**
 * Sync a tab's node with an updated workspace tree.
 *
 * - If the node is found in the tree, use the tree node.
 * - If the node is not found AND the file is outside the workspace,
 *   keep the tab unchanged — external files are not tree-managed.
 * - If the node is not found AND the file is inside the workspace,
 *   mark it as missing (the file was deleted/moved).
 */
function syncTabNode(tab: TabEntry, nextRoot: ExplorerNode): TabEntry {
	const node = findNodeByPath(nextRoot, tab.node.path);
	if (!node) {
		if (isOutsideWorkspace(tab.node.path, nextRoot.path)) {
			return tab;
		}
		return { ...tab, node: { ...tab.node, isMissing: true } };
	}
	return { ...tab, node };
}

function createTabEntry(node: ExplorerNode): TabEntry {
	const tabId = `tab-${++tabIdCounter}`;
	return {
		id: tabId,
		node,
		preview: null,
		previewLoading: false,
		previewError: null,
		previewRequestId: 0,
		unsaved: false,
	};
}

// ─── Store ─────────────────────────────────────────────────────────

type WorkspaceState = {
	root: ExplorerNode | null;
	initialised: boolean;
	loadingPaths: Set<string>;
	tabs: TabEntry[];
	activeTabId: string | null;
	tabBarMode: 'scroll' | 'wrap';
	selectedFile: ExplorerNode | null;
	selectedNodePath: string | null;
	preview: FilePreviewData | null;
	previewLoading: boolean;
	sidebarWidth: number;
	sidebarBusy: boolean;
	operationBusy: WorkspaceOperation;
	createBusy: boolean;
	sortEnabled: boolean;
	sidebarError: string | null;
	previewError: string | null;
	clipboard: {
		item: ExplorerClipboardItem;
		mode: ClipboardMode;
	} | null;
	gitStatus: GitStatus | null;
	gitBusy: boolean;
	expandedPaths: Set<string>;
	collapsedPaths: Set<string>;
	expansionRootPath: string | null;
};

type WorkspaceActions = {
	/* ── Internal init (called by provider) ── */
	initializeWorkspace: () => Promise<void>;

	/* ── File tree ── */
	expandDirectory: (node: ExplorerNode) => Promise<void>;

	/* ── Tab bar ── */
	selectTab: (tabId: string) => void;
	closeTabAction: (tabId: string) => void;
	closeTabsAction: (tabIds: string[]) => void;
	reorderTabs: (fromIndex: number, toIndex: number) => void;

	/* ── Selection & preview ── */
	selectNode: (node: ExplorerNode) => Promise<void>;

	/* ── Sidebar ── */
	setSidebarWidth: (w: number) => void;

	/* ── Clipboard ── */
	copyNode: (node: ExplorerNode) => void;
	cutNode: (node: ExplorerNode) => void;
	pasteNode: (destinationPath: string | null) => Promise<void>;
	clearClipboard: () => void;

	/* ── Git ── */
	refreshGitStatus: (targetRootPath?: string | null) => Promise<void>;
	updateGitStatus: (status: GitStatus) => void;

	/* ── Operations ── */
	createMarkdownDocument: (
		fileName: string,
		targetPath: string | null
	) => Promise<void>;
	createDirectory: (
		directoryName: string,
		targetPath: string | null
	) => Promise<void>;
	renameNode: (targetPath: string, newName: string) => Promise<void>;
	deleteNode: (targetPath: string) => Promise<void>;
	restoreDeletedNode: (targetPath: string) => Promise<void>;
	importExternalFilesHandler: (
		sourcePaths: string[],
		destinationPath: string | null
	) => Promise<void>;
	openFolder: () => Promise<void>;
	refreshFolder: () => Promise<void>;
	toggleSort: () => Promise<void>;
	gitRefresh: () => Promise<void>;
	gitRefreshWorkspace: () => Promise<void>;

	/* ── Expansion state ── */
	toggleDirectory: (
		path: string,
		rootPath: string | null,
		isCurrentlyExpanded: boolean
	) => void;
	setExpansionState: (
		expandedPaths: Set<string>,
		collapsedPaths: Set<string>,
		rootPath: string | null
	) => void;

	/* ── Internal helpers (used by provider effects) ── */
	loadPreview: (file: ExplorerNode) => Promise<void>;
};

type WorkspaceStore = WorkspaceState & WorkspaceActions;

const ALLOWED_IMPORT_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'svg',
	'md',
	'markdown',
	'mdx',
]);

async function resolveNodeFromPath(
	nextRoot: ExplorerNode,
	targetPath: string | null
): Promise<{ node: ExplorerNode | null; root: ExplorerNode }> {
	if (!targetPath || !isSameOrDescendantPath(targetPath, nextRoot.path)) {
		return { node: null, root: nextRoot };
	}
	let resolvedRoot = nextRoot;
	const { showHiddenFiles } = useAppSettingsStore.getState();
	const { sortEnabled: storeSortEnabled } = useWorkspaceStore.getState();

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
			sort: storeSortEnabled,
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
}

const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
	// ── State ──
	root: null,
	initialised: false,
	loadingPaths: new Set<string>(),
	tabs: [],
	activeTabId: null,
	tabBarMode: 'scroll' as const,
	selectedFile: null,
	selectedNodePath: null,
	preview: null,
	previewLoading: false,
	sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
	sidebarBusy: false,
	operationBusy: null,
	createBusy: false,
	sortEnabled: true,
	sidebarError: null,
	previewError: null,
	clipboard: null,
	gitStatus: null,
	gitBusy: false,

	// ── Expansion state (persisted to localStorage) ──
	expansionRootPath: readExpansionState().rootPath,
	expandedPaths: readExpansionState().expandedPaths,
	collapsedPaths: readExpansionState().collapsedPaths,

	// ── Internal init ──

	initializeWorkspace: async () => {
		const { showHiddenFiles } = useAppSettingsStore.getState();

		set({ sidebarBusy: true, sidebarError: null });

		try {
			const initialState = await fetchInitialState();

			set({
				sidebarWidth: clampSidebarWidth(initialState.sidebarWidth),
				tabBarMode: initialState.tabBarMode,
			});

			if (!initialState.rootPath) {
				tabsPersistenceReady = true;
				set({ initialised: true, sidebarBusy: false });
				// Clear selection
				return;
			}

			const nextRoot = await scanWorkspaceFolder({
				rootPath: initialState.rootPath,
				showHiddenFiles,
				sort: get().sortEnabled,
			});

			set({ loadingPaths: new Set(), clipboard: null });

			const fileToOpen = initialState.lastActiveFilePath
				? null
				: findFirstFile(nextRoot);

			const { node: nextSelectedFile, root: resolvedRoot } =
				await resolveNodeFromPath(nextRoot, initialState.lastActiveFilePath);

			const resolvedFileToOpen =
				nextSelectedFile?.kind === 'file' ? nextSelectedFile : fileToOpen;

			// restoreTabs inline
			let restoredRoot = resolvedRoot;
			const restoredTabs: TabEntry[] = [];
			const tabPaths =
				initialState.openTabPaths.length > 0
					? initialState.openTabPaths
					: resolvedFileToOpen
						? [resolvedFileToOpen.path]
						: [];

			for (const path of tabPaths) {
				let fileNode: ExplorerNode | null = null;
				let resolvedRootForPath = restoredRoot;

				const { node, root: nextResolved } = await resolveNodeFromPath(
					restoredRoot,
					path
				);

				if (node) {
					fileNode = node;
					resolvedRootForPath = nextResolved;
				} else if (isOutsideWorkspace(path, restoredRoot.path)) {
					fileNode = createExternalNode(path);
				}

				restoredRoot = resolvedRootForPath;
				if (fileNode?.kind !== 'file') continue;
				const normalizedPath = normalizeExplorerPath(fileNode.path);
				if (
					restoredTabs.some(
						(tab) => normalizeExplorerPath(tab.node.path) === normalizedPath
					)
				) {
					continue;
				}
				restoredTabs.push(createTabEntry(fileNode));
			}

			const preferredPath = initialState.lastActiveFilePath
				? normalizeExplorerPath(initialState.lastActiveFilePath)
				: resolvedFileToOpen
					? normalizeExplorerPath(resolvedFileToOpen.path)
					: null;

			const activeTab = preferredPath
				? restoredTabs.find(
						(tab) => normalizeExplorerPath(tab.node.path) === preferredPath
					)
				: (restoredTabs[0] ?? null);

			const activeNode = activeTab?.node ?? null;

			tabsPersistenceReady = true;

			set({
				root: restoredRoot,
				tabs: restoredTabs,
				activeTabId: activeTab?.id ?? null,
				initialised: true,
				sidebarBusy: false,
			});

			void setWorkspaceRoot(restoredRoot.path).catch(() => {});

			if (activeNode) {
				void get().loadPreview(activeNode);
			}
		} catch (error) {
			void clearWorkspaceState().catch(() => {});
			tabsPersistenceReady = true;
			set({
				root: null,
				clipboard: null,
				tabs: [],
				activeTabId: null,
				selectedFile: null,
				selectedNodePath: null,
				preview: null,
				previewLoading: false,
				sidebarError: getErrorMessage(error),
				initialised: true,
				sidebarBusy: false,
			});
		}
	},

	// ── Helpers exposed for provider effects ──

	loadPreview: async (file) => {
		const requestId = ++previewRequestIdCounter;
		set({
			selectedNodePath: file.path,
			selectedFile: file,
			preview: null,
			previewError: null,
			previewLoading: true,
		});
		try {
			const nextPreview = await readWorkspaceFile({ path: file.path });
			if (previewRequestIdCounter !== requestId) return;
			set({ preview: nextPreview });
		} catch (error) {
			if (previewRequestIdCounter !== requestId) return;
			set({ previewError: getErrorMessage(error) });
		} finally {
			if (previewRequestIdCounter === requestId) {
				set({ previewLoading: false });
			}
		}
	},

	// ── selectNode ──

	selectNode: async (node) => {
		const state = get();
		if (state.selectedNodePath === node.path) return;

		if (node.kind === 'directory') {
			set({
				selectedNodePath: node.path,
				selectedFile: null,
				preview: null,
				previewError: null,
				previewLoading: false,
			});
			return;
		}

		const normalizedPath = normalizeExplorerPath(node.path);
		const existingTab = state.tabs.find(
			(t) => normalizeExplorerPath(t.node.path) === normalizedPath
		);

		if (existingTab) {
			set({ activeTabId: existingTab.id });
		} else {
			const newTab = createTabEntry(node);
			set((s) => ({
				tabs: [...s.tabs, newTab],
				activeTabId: newTab.id,
			}));
		}

		void addTabBackend(node.path).catch(() => {});
		void setActiveTabBackend(node.path).catch(() => {});

		if (node.isMissing) {
			set({
				selectedNodePath: node.path,
				selectedFile: node,
				preview: null,
				previewError: null,
				previewLoading: false,
			});
			return;
		}

		await get().loadPreview(node);
	},

	// ── Tab actions ──

	selectTab: (tabId) => {
		const state = get();
		const tab = state.tabs.find((t) => t.id === tabId);
		if (!tab) return;

		if (state.root && !findNodeByPath(state.root, tab.node.path)) {
			if (isOutsideWorkspace(tab.node.path, state.root.path)) {
				if (tab.id !== state.activeTabId) {
					set({ activeTabId: tabId });
					void get().loadPreview(tab.node);
					void addTabBackend(tab.node.path).catch(() => {});
					void setActiveTabBackend(tab.node.path).catch(() => {});
				}
				return;
			}
		}

		if (tab.id !== state.activeTabId) {
			void get().selectNode(tab.node);
		}
	},

	closeTabAction: (tabId) => {
		const state = get();
		const wasActive = state.activeTabId === tabId;
		const tab = state.tabs.find((t) => t.id === tabId);
		const newTabs = state.tabs.filter((t) => t.id !== tabId);

		set({ tabs: newTabs });

		if (tab) void closeTabBackend(tab.node.path).catch(() => {});

		if (wasActive) {
			if (newTabs.length > 0) {
				const idx = state.tabs.findIndex((t) => t.id === tabId);
				const next = newTabs[Math.min(idx, newTabs.length - 1)];
				set({ activeTabId: next.id });
				void get().selectNode(next.node);
			} else {
				set({ activeTabId: null });
				void setActiveTabBackend(null).catch(() => {});
				get(); // ensure latest state
			}
		}
	},

	closeTabsAction: (tabIds) => {
		const state = get();
		const wasActive = state.activeTabId
			? tabIds.includes(state.activeTabId)
			: false;
		const closedPaths = tabIds
			.map((id) => state.tabs.find((t) => t.id === id)?.node.path)
			.filter(Boolean) as string[];
		const newTabs = state.tabs.filter((t) => !tabIds.includes(t.id));

		set({ tabs: newTabs });

		if (closedPaths.length > 0) {
			void closeTabsBackend(closedPaths).catch(() => {});
		}

		if (wasActive) {
			if (newTabs.length > 0) {
				const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
				const next = newTabs[Math.min(idx, newTabs.length - 1)];
				set({ activeTabId: next.id });
				void get().selectNode(next.node);
			} else {
				set({ activeTabId: null });
				void setActiveTabBackend(null).catch(() => {});
			}
		}
	},

	reorderTabs: (fromIndex, toIndex) => {
		set((state) => {
			const next = [...state.tabs];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			void setOpenTabPathsBackend(next.map((t) => t.node.path)).catch(() => {});
			return { tabs: next };
		});
	},

	// ── Sidebar ──

	setSidebarWidth: (w) => {
		set({ sidebarWidth: clampSidebarWidth(w) });
	},

	// ── Clipboard ──

	copyNode: (node) => {
		set({
			clipboard: {
				item: {
					name: node.name,
					nodeKind: node.kind,
					path: node.path,
				},
				mode: 'copy',
			},
		});
	},

	cutNode: (node) => {
		set({
			clipboard: {
				item: {
					name: node.name,
					nodeKind: node.kind,
					path: node.path,
				},
				mode: 'cut',
			},
		});
	},

	clearClipboard: () => {
		set({ clipboard: null });
	},

	pasteNode: async (destinationPath) => {
		const state = get();
		if (!state.root || !state.clipboard) return;

		const destinationDirectory = (() => {
			if (!state.root) return null;
			if (!destinationPath) return state.root.path;
			const targetNode = findNodeByPath(state.root, destinationPath);
			if (!targetNode) return state.root.path;
			if (targetNode.kind === 'directory') return targetNode.path;
			return getParentPath(targetNode.path) ?? state.root.path;
		})();

		if (!destinationDirectory) return;

		const movedPath = joinExplorerPath(
			destinationDirectory,
			state.clipboard.item.name
		);
		const nextSelectedPath = remapPathPrefix(
			state.selectedNodePath,
			state.clipboard.item.path,
			movedPath
		);

		set({ operationBusy: 'move', sidebarError: null });

		try {
			if (state.clipboard.mode === 'copy') {
				await copyWorkspaceNode({
					destinationDirectory,
					rootPath: state.root.path,
					sourcePath: state.clipboard.item.path,
				});
			} else {
				await moveWorkspaceNode({
					destinationDirectory,
					rootPath: state.root.path,
					sourcePath: state.clipboard.item.path,
				});
			}

			const { showHiddenFiles } = useAppSettingsStore.getState();
			const nextRoot = await scanWorkspaceFolder({
				rootPath: state.root.path,
				showHiddenFiles,
				sort: get().sortEnabled,
			});

			set({ loadingPaths: new Set(), root: nextRoot, clipboard: null });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			if (nextSelectedPath) {
				void setActiveTabBackend(nextSelectedPath).catch(() => {});
			} else {
				void setActiveTabBackend(null).catch(() => {});
			}

			await syncSelectionWithRootStore(nextRoot, nextSelectedPath);
			void get().refreshGitStatus(nextRoot.path);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
			throwWithCause(getErrorMessage(error), error);
		} finally {
			set({ operationBusy: null });
		}
	},

	// ── Git ──

	refreshGitStatus: async (targetRootPath?: string | null) => {
		const nextRootPath = targetRootPath ?? get().root?.path ?? null;
		if (!nextRootPath) {
			set({ gitStatus: null });
			return;
		}
		set({ gitBusy: true });
		try {
			const nextStatus = await fetchGitStatus({ rootPath: nextRootPath });
			set({ gitStatus: nextStatus });
		} catch (error) {
			set({ gitStatus: null });
			showErrorToast('Git 状态读取失败', getErrorMessage(error));
		} finally {
			set({ gitBusy: false });
		}
	},

	updateGitStatus: (status) => {
		set({ gitStatus: status });
	},

	// ── Operations ──

	createMarkdownDocument: async (fileName, targetPath) => {
		const state = get();
		if (!state.root) return;

		const rootPath = state.root.path;
		const destinationDirectory = (() => {
			if (!state.root) return rootPath;
			if (!targetPath) return state.root.path;
			const targetNode = findNodeByPath(state.root, targetPath);
			if (!targetNode) return state.root.path;
			if (targetNode.kind === 'directory') return targetNode.path;
			return getParentPath(targetNode.path) ?? state.root.path;
		})();

		set({ createBusy: true, sidebarError: null });

		try {
			await createMarkdownFile({
				fileName,
				rootPath,
				selectedPath: targetPath,
			});

			const trimmedFileName = fileName.trim();
			const createdPath = joinExplorerPath(
				destinationDirectory,
				trimmedFileName.toLowerCase().endsWith('.md')
					? trimmedFileName
					: `${trimmedFileName}.md`
			);
			removeMarkdownDraftsFor(createdPath);

			const { showHiddenFiles } = useAppSettingsStore.getState();
			const nextRoot = await scanWorkspaceFolder({
				rootPath,
				showHiddenFiles,
				sort: state.sortEnabled,
			});

			set({ loadingPaths: new Set(), root: nextRoot });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			await syncSelectionWithRootStore(nextRoot, createdPath);
			void get().refreshGitStatus(nextRoot.path);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
			throwWithCause(getErrorMessage(error), error);
		} finally {
			set({ createBusy: false });
		}
	},

	createDirectory: async (directoryName, targetPath) => {
		const state = get();
		if (!state.root) return;

		const rootPath = state.root.path;
		const destinationDirectory = (() => {
			if (!state.root) return rootPath;
			if (!targetPath) return state.root.path;
			const targetNode = findNodeByPath(state.root, targetPath);
			if (!targetNode) return state.root.path;
			if (targetNode.kind === 'directory') return targetNode.path;
			return getParentPath(targetNode.path) ?? state.root.path;
		})();

		set({ createBusy: true, sidebarError: null });

		try {
			await createWorkspaceDirectory({
				directoryName,
				rootPath,
				selectedPath: destinationDirectory,
			});

			const { showHiddenFiles } = useAppSettingsStore.getState();
			const nextRoot = await scanWorkspaceFolder({
				rootPath,
				showHiddenFiles,
				sort: state.sortEnabled,
			});

			set({ loadingPaths: new Set(), root: nextRoot });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			await syncSelectionWithRootStore(nextRoot, state.selectedNodePath);
			void get().refreshGitStatus(nextRoot.path);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
			throwWithCause(getErrorMessage(error), error);
		} finally {
			set({ createBusy: false });
		}
	},

	renameNode: async (targetPath, newName) => {
		const state = get();
		if (!state.root) return;

		const renamedPath = replacePathBaseName(targetPath, newName.trim());
		const nextSelectedPath = remapPathPrefix(
			state.selectedNodePath,
			targetPath,
			renamedPath
		);
		const nextClipboardPath = remapPathPrefix(
			state.clipboard?.item.path ?? null,
			targetPath,
			renamedPath
		);

		set({ operationBusy: 'rename', sidebarError: null });

		try {
			await renameWorkspaceNode({
				newName,
				rootPath: state.root.path,
				targetPath,
			});

			removeMarkdownDraftsFor(targetPath);
			removeMarkdownDraftsFor(renamedPath);

			const { showHiddenFiles } = useAppSettingsStore.getState();
			const nextRoot = await scanWorkspaceFolder({
				rootPath: state.root.path,
				showHiddenFiles,
				sort: state.sortEnabled,
			});

			set({ loadingPaths: new Set(), root: nextRoot });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			if (state.clipboard && nextClipboardPath) {
				set({
					clipboard: {
						...state.clipboard,
						item: {
							...state.clipboard.item,
							name: newName.trim(),
							path: nextClipboardPath,
						},
					},
				});
			}

			if (nextSelectedPath) {
				void setActiveTabBackend(nextSelectedPath).catch(() => {});
			} else {
				void setActiveTabBackend(null).catch(() => {});
			}

			await syncSelectionWithRootStore(nextRoot, nextSelectedPath);
			void get().refreshGitStatus(nextRoot.path);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
			throwWithCause(getErrorMessage(error), error);
		} finally {
			set({ operationBusy: null });
		}
	},

	deleteNode: async (targetPath) => {
		const state = get();
		if (!state.root) return;

		const parentDirectory = getParentPath(targetPath) ?? state.root.path;
		const nextSelectedPath = remapPathPrefix(
			state.selectedNodePath,
			targetPath,
			null
		);
		const nextClipboardPath = remapPathPrefix(
			state.clipboard?.item.path ?? null,
			targetPath,
			null
		);

		set({ operationBusy: 'delete', sidebarError: null });

		try {
			await deleteWorkspaceNode({
				rootPath: state.root.path,
				targetPath,
			});

			removeMarkdownDraftsFor(targetPath);

			const nextRoot = await refreshDirectoriesStore(state.root, [
				parentDirectory,
			]);

			set({ root: nextRoot });

			const normalizedTargetPath = normalizeExplorerPath(targetPath);

			// Close tabs for the deleted file and clip clipboard if needed
			set((s) => {
				const toClose = s.tabs.filter(
					(t) => normalizeExplorerPath(t.node.path) === normalizedTargetPath
				);
				for (const t of toClose) {
					void closeTabBackend(t.node.path).catch(() => {});
				}
				const newClipboard =
					s.clipboard && nextClipboardPath === null ? null : s.clipboard;
				return {
					tabs: s.tabs.filter(
						(t) => normalizeExplorerPath(t.node.path) !== normalizedTargetPath
					),
					clipboard: newClipboard,
				};
			});

			if (nextSelectedPath) {
				void setActiveTabBackend(nextSelectedPath).catch(() => {});
			} else {
				void setActiveTabBackend(null).catch(() => {});
			}

			await syncSelectionWithRootStore(nextRoot, nextSelectedPath);
			void get().refreshGitStatus(nextRoot.path);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
			throwWithCause(getErrorMessage(error), error);
		} finally {
			set({ operationBusy: null });
		}
	},

	restoreDeletedNode: async (targetPath) => {
		const state = get();
		if (!state.root) return;

		set({ operationBusy: 'move', sidebarError: null });

		try {
			const nextStatus = await gitRestoreFile({
				path: targetPath,
				rootPath: state.root.path,
			});

			const { showHiddenFiles } = useAppSettingsStore.getState();
			const nextRoot = await scanWorkspaceFolder({
				rootPath: state.root.path,
				showHiddenFiles,
				sort: state.sortEnabled,
			});

			set({ loadingPaths: new Set(), root: nextRoot, gitStatus: nextStatus });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			await syncSelectionWithRootStore(nextRoot, targetPath);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
			throwWithCause(getErrorMessage(error), error);
		} finally {
			set({ operationBusy: null });
		}
	},

	importExternalFilesHandler: async (sourcePaths, destinationPath) => {
		const state = get();
		if (!state.root) return;

		const destinationDirectory = (() => {
			if (!state.root) return null;
			if (!destinationPath) return state.root.path;
			const targetNode = findNodeByPath(state.root, destinationPath);
			if (!targetNode) return state.root.path;
			if (targetNode.kind === 'directory') return targetNode.path;
			return getParentPath(targetNode.path) ?? state.root.path;
		})();

		if (!destinationDirectory) return;

		const validPaths = sourcePaths.filter((p) => {
			const dot = p.lastIndexOf('.');
			if (dot === -1) return false;
			return ALLOWED_IMPORT_EXTENSIONS.has(p.slice(dot + 1).toLowerCase());
		});

		const skippedCount = sourcePaths.length - validPaths.length;

		if (validPaths.length === 0) {
			if (skippedCount > 0) showErrorToast('仅支持导入 .md/.mdx 文件和图片');
			return;
		}

		set({ operationBusy: 'move', sidebarError: null });

		try {
			const importedNodes = await importExternalFiles({
				destinationDirectory,
				rootPath: state.root.path,
				sourcePaths: validPaths,
			});

			const { showHiddenFiles } = useAppSettingsStore.getState();
			const nextRoot = await scanWorkspaceFolder({
				rootPath: state.root.path,
				showHiddenFiles,
				sort: state.sortEnabled,
			});

			set({ loadingPaths: new Set(), root: nextRoot });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			if (importedNodes.length > 0) {
				const firstNode = importedNodes[0];
				if (firstNode) {
					void setActiveTabBackend(firstNode.path).catch(() => {});
					await syncSelectionWithRootStore(nextRoot, firstNode.path);
				}
			}

			void get().refreshGitStatus(nextRoot.path);

			if (skippedCount > 0) {
				showSuccessToast(
					`已导入 ${importedNodes.length} 个文件，${skippedCount} 个跳过（仅支持 .md/.mdx 和图片）`
				);
			} else {
				showSuccessToast(`已导入 ${importedNodes.length} 个文件`);
			}
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
			throwWithCause(getErrorMessage(error), error);
		} finally {
			set({ operationBusy: null });
		}
	},

	openFolder: async () => {
		const { showHiddenFiles } = useAppSettingsStore.getState();
		set({ sidebarBusy: true, sidebarError: null });

		try {
			const nextRoot = await pickWorkspaceFolder({
				showHiddenFiles,
				sort: get().sortEnabled,
			});
			if (!nextRoot) return;

			set({ loadingPaths: new Set(), clipboard: null });

			const fileToOpen = findFirstFile(nextRoot);

			// restoreTabs inline (empty tabPaths = auto-open first file)
			const restoredTabs: TabEntry[] = [];
			let restoredRoot = nextRoot;
			const tabPaths = fileToOpen ? [fileToOpen.path] : [];

			for (const path of tabPaths) {
				const { node, root: nextResolved } = await resolveNodeFromPath(
					restoredRoot,
					path
				);
				restoredRoot = nextResolved;
				if (node?.kind !== 'file') continue;
				restoredTabs.push(createTabEntry(node));
			}

			const activeTab = restoredTabs[0] ?? null;
			const activeNode = activeTab?.node ?? null;

			tabsPersistenceReady = true;

			set({
				root: restoredRoot,
				tabs: restoredTabs,
				activeTabId: activeTab?.id ?? null,
				sidebarBusy: false,
			});

			void setWorkspaceRoot(restoredRoot.path).catch(() => {});

			if (activeNode) {
				void get().loadPreview(activeNode);
			}
		} catch (error) {
			set({ sidebarError: getErrorMessage(error), sidebarBusy: false });
		}
	},

	refreshFolder: async () => {
		const state = get();
		if (!state.root) return;

		const { showHiddenFiles } = useAppSettingsStore.getState();
		set({ sidebarBusy: true, sidebarError: null });

		try {
			const nextRoot = await scanWorkspaceFolder({
				rootPath: state.root.path,
				showHiddenFiles,
				sort: state.sortEnabled,
			});

			set({ loadingPaths: new Set(), root: nextRoot, sidebarBusy: false });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			set({ sidebarError: null });
			void setWorkspaceRoot(nextRoot.path).catch(() => {});
			await syncSelectionWithRootStore(nextRoot, state.selectedNodePath);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error), sidebarBusy: false });
		}
	},

	expandDirectory: async (directory) => {
		const state = get();
		if (!state.root || directory.kind !== 'directory' || directory.loaded)
			return;
		if (state.loadingPaths.has(directory.path)) return;

		const workspaceRootPath = state.root.path;
		const { showHiddenFiles } = useAppSettingsStore.getState();

		set((s) => ({
			loadingPaths: new Set(s.loadingPaths).add(directory.path),
		}));

		try {
			const children = await readWorkspaceDirectory({
				rootPath: workspaceRootPath,
				directoryPath: directory.path,
				showHiddenFiles,
				sort: state.sortEnabled,
			});

			set((s) => {
				if (!s.root || s.root.path !== workspaceRootPath)
					return { root: s.root };
				return {
					root: replaceDirectoryChildren(s.root, directory.path, children),
				};
			});
		} catch (error) {
			set({ sidebarError: getErrorMessage(error) });
		} finally {
			set((s) => {
				const next = new Set(s.loadingPaths);
				next.delete(directory.path);
				return { loadingPaths: next };
			});
		}
	},

	toggleSort: async () => {
		const state = get();
		const newSort = !state.sortEnabled;
		set({ sortEnabled: newSort });
		if (!state.root) return;

		const { showHiddenFiles } = useAppSettingsStore.getState();
		set({ sidebarBusy: true, sidebarError: null });

		try {
			const nextRoot = await scanWorkspaceFolder({
				rootPath: state.root.path,
				showHiddenFiles,
				sort: newSort,
			});

			set({ loadingPaths: new Set(), root: nextRoot, sidebarBusy: false });

			// sync tabs with tree
			set((s) => ({
				tabs: s.tabs.map((tab) => syncTabNode(tab, nextRoot)),
			}));

			set({ sidebarError: null });
			void setWorkspaceRoot(nextRoot.path).catch(() => {});
			await syncSelectionWithRootStore(nextRoot, state.selectedNodePath);
		} catch (error) {
			set({ sidebarError: getErrorMessage(error), sidebarBusy: false });
		}
	},

	gitRefresh: async () => {
		await get().refreshGitStatus();
		await get().refreshFolder();
	},

	gitRefreshWorkspace: async () => {
		clearAllMarkdownDrafts();
		await get().refreshGitStatus();
		await get().refreshFolder();
	},

	// ── Expansion state ──

	toggleDirectory: (path, rootPath, isCurrentlyExpanded) => {
		const state = get();
		const isCurrentRoot = state.expansionRootPath === rootPath;
		const nextExpanded = new Set(isCurrentRoot ? state.expandedPaths : []);
		const nextCollapsed = new Set(isCurrentRoot ? state.collapsedPaths : []);

		if (isCurrentlyExpanded) {
			// Was visually expanded — collapse it.
			nextExpanded.delete(path);
			nextCollapsed.add(path);
		} else {
			// Was visually collapsed — expand it.
			nextExpanded.add(path);
			nextCollapsed.delete(path);
		}

		persistExpansionState(nextExpanded, nextCollapsed, rootPath);
		set({
			expandedPaths: nextExpanded,
			collapsedPaths: nextCollapsed,
			expansionRootPath: rootPath,
		});
	},

	setExpansionState: (nextExpanded, nextCollapsed, rootPath) => {
		persistExpansionState(nextExpanded, nextCollapsed, rootPath);
		set({
			expandedPaths: nextExpanded,
			collapsedPaths: nextCollapsed,
			expansionRootPath: rootPath,
		});
	},
}));

export { useWorkspaceStore };

// ─── Re-usable helpers that call the store ─────────────────────────

async function syncSelectionWithRootStore(
	nextRoot: ExplorerNode,
	preferredSelectedPath: string | null
) {
	const { node: nextSelectedNode, root: resolvedRoot } =
		await resolveNodeFromPath(nextRoot, preferredSelectedPath);

	if (resolvedRoot !== nextRoot) {
		useWorkspaceStore.setState({ root: resolvedRoot });
	}

	if (!nextSelectedNode) {
		useWorkspaceStore.setState({
			selectedNodePath: null,
			selectedFile: null,
			preview: null,
			previewError: null,
			previewLoading: false,
		});
		return;
	}

	if (nextSelectedNode.kind === 'file') {
		const ws = useWorkspaceStore.getState();
		await ws.loadPreview(nextSelectedNode);
		return;
	}

	useWorkspaceStore.setState({
		selectedNodePath: nextSelectedNode.path,
		selectedFile: null,
		preview: null,
		previewError: null,
		previewLoading: false,
	});
}

async function refreshDirectoriesStore(
	currentRoot: ExplorerNode,
	directoryPaths: Array<string | null>
): Promise<ExplorerNode> {
	let nextRoot = currentRoot;
	const rootPath = currentRoot.path;
	const pathsToRefresh = [
		...new Set(directoryPaths.filter((path): path is string => Boolean(path))),
	].sort((left, right) => getPathDepth(left) - getPathDepth(right));

	const { showHiddenFiles } = useAppSettingsStore.getState();
	const { sortEnabled: effectiveSort } = useWorkspaceStore.getState();

	for (const directoryPath of pathsToRefresh) {
		const directoryNode = findNodeByPath(nextRoot, directoryPath);
		if (!directoryNode || directoryNode.kind !== 'directory') continue;
		const children = await readWorkspaceDirectory({
			directoryPath,
			rootPath,
			showHiddenFiles,
			sort: effectiveSort,
		});
		nextRoot = replaceDirectoryChildren(nextRoot, directoryPath, children);
	}
	return nextRoot;
}

// ─── WorkspaceProvider (effects & initialization) ──────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const showHiddenFiles = useAppSettingsStore((s) => s.showHiddenFiles);

	const initialised = useWorkspaceStore((s) => s.initialised);
	const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
	const sidebarError = useWorkspaceStore((s) => s.sidebarError);
	const previewError = useWorkspaceStore((s) => s.previewError);
	const tabs = useWorkspaceStore((s) => s.tabs);
	const root = useWorkspaceStore((s) => s.root);
	const selectedFile = useWorkspaceStore((s) => s.selectedFile);
	const gitStatus = useWorkspaceStore((s) => s.gitStatus);

	/* ── Initialisation ── */

	useEffect(() => {
		const ws = useWorkspaceStore.getState();
		void ws.initializeWorkspace();
	}, []);

	/* ── Persistence effects ── */

	useEffect(() => {
		if (!initialised) return;
		void setSidebarWidthBackend(sidebarWidth).catch(() => {});
	}, [sidebarWidth, initialised]);

	useEffect(() => {
		if (!initialised) return;
		void setActiveTabBackend(selectedFile?.path ?? null).catch(() => {});
	}, [selectedFile, initialised]);

	useEffect(() => {
		if (!tabsPersistenceReady || !initialised) return;
		const paths = tabs.map((t) => t.node.path);
		void setOpenTabPathsBackend(paths).catch(() => {});
	}, [tabs, initialised]);

	/* ── Toast effects ── */

	useEffect(() => {
		if (!sidebarError) return;
		showErrorToast('工作区操作失败', sidebarError);
	}, [sidebarError]);

	useEffect(() => {
		if (!previewError) return;
		showErrorToast('文件读取失败', previewError);
	}, [previewError]);

	/* ── re-scan on showHiddenFiles change ── */

	useEffect(() => {
		if (!root) return;
		const { sortEnabled: wsSortEnabled } = useWorkspaceStore.getState();
		const reScan = async () => {
			try {
				const nextRoot = await scanWorkspaceFolder({
					rootPath: root.path,
					showHiddenFiles,
					sort: wsSortEnabled,
				});
				useWorkspaceStore.setState({ root: nextRoot });
			} catch {
				// tree will stay stale but won't crash
			}
		};
		void reScan();
	}, [showHiddenFiles, root?.path]);

	/* ── Git status on mount / root change ── */

	useEffect(() => {
		if (!root?.path) {
			useWorkspaceStore.setState({ gitStatus: null });
			return;
		}
		const ws = useWorkspaceStore.getState();
		void ws.refreshGitStatus(root.path);
	}, [root?.path]);

	/* ── Event listeners ── */

	useEffect(() => {
		const handleDirtyChanged = (e: Event) => {
			const { filePath } =
				(e as CustomEvent<{ filePath?: string }>).detail ?? {};
			useWorkspaceStore.setState((prev) => ({
				tabs: prev.tabs.map((tab) => {
					if (
						filePath &&
						normalizeExplorerPath(tab.node.path) !==
							normalizeExplorerPath(filePath)
					)
						return tab;
					return { ...tab, unsaved: isEditorDirty(tab.node.path) };
				}),
			}));
		};

		const handleFileSaved = (e: Event) => {
			const { filePath } =
				(e as CustomEvent<{ filePath?: string }>).detail ?? {};
			if (filePath) {
				useWorkspaceStore.setState((prev) => ({
					tabs: prev.tabs.map((tab) =>
						normalizeExplorerPath(tab.node.path) ===
						normalizeExplorerPath(filePath)
							? { ...tab, unsaved: false }
							: tab
					),
				}));
			}
		};

		window.addEventListener('editor-dirty-changed', handleDirtyChanged);
		window.addEventListener('workspace-file-saved', handleFileSaved);
		return () => {
			window.removeEventListener('editor-dirty-changed', handleDirtyChanged);
			window.removeEventListener('workspace-file-saved', handleFileSaved);
		};
	}, []);

	useEffect(() => {
		const handleNavigateFile = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (!detail?.filePath) return;
			const filePath: string = detail.filePath;

			const node: ExplorerNode = {
				name: filePath.split('/').pop() ?? filePath,
				path: filePath,
				relativePath: filePath,
				kind: 'file',
				fileKind: /\.(md|markdown|mdx)$/i.test(filePath)
					? ('markdown' as const)
					: null,
				hasChildren: false,
				loaded: true,
				children: [],
			};

			void useWorkspaceStore.getState().selectNode(node);
		};

		window.addEventListener(
			'madora-navigate-file',
			handleNavigateFile as EventListener
		);
		return () =>
			window.removeEventListener(
				'madora-navigate-file',
				handleNavigateFile as EventListener
			);
	}, []);

	useEffect(() => {
		const handleWorkspaceFileSaved = (event: Event) => {
			const customEvent = event as CustomEvent<{
				filePath?: string;
				source?: string;
			}>;
			const { root: currentRoot } = useWorkspaceStore.getState();
			if (!currentRoot?.path) return;

			const savedPath = customEvent.detail?.filePath;
			if (!savedPath || !isSameOrDescendantPath(savedPath, currentRoot.path))
				return;

			const ws = useWorkspaceStore.getState();
			void ws.refreshGitStatus(currentRoot.path);

			if (customEvent.detail?.source === 'conflict-resolve') {
				const { selectedFile: currentFile } = useWorkspaceStore.getState();
				if (
					currentFile &&
					normalizeExplorerPath(currentFile.path) ===
						normalizeExplorerPath(savedPath)
				) {
					void ws.loadPreview(currentFile);
				}
			}
		};

		window.addEventListener(
			'workspace-file-saved',
			handleWorkspaceFileSaved as EventListener
		);
		return () =>
			window.removeEventListener(
				'workspace-file-saved',
				handleWorkspaceFileSaved as EventListener
			);
	}, []);

	useEffect(() => {
		if (!selectedFile?.isMissing) return;

		const normalizedSelectedPath = normalizeExplorerPath(selectedFile.path);
		const isStillDeleted = (gitStatus?.files ?? []).some(
			(file) =>
				file.status === 'deleted' &&
				normalizeExplorerPath(file.path) === normalizedSelectedPath
		);
		if (isStillDeleted) return;

		// The file is no longer git-deleted — clear isMissing on its tab.
		useWorkspaceStore.setState((prev) => ({
			tabs: prev.tabs.map((tab) =>
				normalizeExplorerPath(tab.node.path) === normalizedSelectedPath
					? { ...tab, node: { ...tab.node, isMissing: false } }
					: tab
			),
		}));

		void setActiveTabBackend(null).catch(() => {});
		if (!root) {
			useWorkspaceStore.setState({
				selectedNodePath: null,
				selectedFile: null,
				preview: null,
				previewError: null,
				previewLoading: false,
			});
			return;
		}
		queueMicrotask(() => {
			void syncSelectionWithRootStore(root, selectedFile.path);
		});
	}, [gitStatus, root, selectedFile]);

	useEffect(() => {
		const handleTabBarModeChange = (e: Event) => {
			const detail = (e as CustomEvent<'scroll' | 'wrap'>).detail;
			if (detail === 'scroll' || detail === 'wrap') {
				useWorkspaceStore.setState({ tabBarMode: detail });
			}
		};
		window.addEventListener(TAB_BAR_MODE_KEY, handleTabBarModeChange);
		return () =>
			window.removeEventListener(TAB_BAR_MODE_KEY, handleTabBarModeChange);
	}, []);

	return <>{children}</>;
}

// ─── useWorkspace Hook ─────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
	return useWorkspaceStore();
}
