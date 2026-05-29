import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAiSettings } from '@/components/system/ai-settings-provider';
import { FileExplorerSidebar } from '@/components/explorer/file/file-explorer-sidebar';
import { FilePreview } from '@/components/explorer/file/file-preview';
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
const SIDEBAR_WIDTH_STORAGE_KEY = 'madora-workspace-sidebar-width';
const MARKDOWN_DRAFT_KEY_PREFIX = 'madora-markdown-draft:';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 560;

type ClipboardMode = 'copy' | 'cut';
type WorkspaceOperation = 'create' | 'rename' | 'delete' | 'move' | null;

function removeMarkdownDraftsFor(path: string): void {
	window.localStorage.removeItem(`${MARKDOWN_DRAFT_KEY_PREFIX}${path}`);

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
	const { showHiddenFiles } = useAiSettings();
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
	const [previewLoading, setPreviewLoading] = useState(false);
	const previewRequestId = useRef(0);
	const dragStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
	const selectedFileRef = useRef<ExplorerNode | null>(null);

	const clearPreviewState = () => {
		previewRequestId.current += 1;
		setPreview(null);
		setPreviewError(null);
		setPreviewLoading(false);
		setSelectedFile(null);
	};

	const clearSelectionAndPreview = () => {
		setSelectedNodePath(null);
		clearPreviewState();
	};

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

	const syncSelectionWithRoot = async (
		nextRoot: ExplorerNode,
		preferredSelectedPath: string | null
	) => {
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
	};

	const resolveNodeFromPath = async (
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

			const children = await invoke<ExplorerNode[]>(
				'read_workspace_directory',
				{
					directoryPath,
					rootPath: nextRoot.path,
					showHiddenFiles,
				}
			);

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
	};

	const loadPreview = async (file: ExplorerNode) => {
		const requestId = previewRequestId.current + 1;
		previewRequestId.current = requestId;
		setSelectedNodePath(file.path);
		setSelectedFile(file);
		setPreview(null);
		setPreviewError(null);
		setPreviewLoading(true);

		try {
			const nextPreview = await invoke<FilePreviewData>('read_workspace_file', {
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
	};

	const selectNode = async (node: ExplorerNode) => {
		// Don't reload if already viewing this file
		if (selectedNodePath === node.path) {
			return;
		}

		if (node.kind === 'directory') {
			setSelectedNodePath(node.path);
			clearPreviewState();
			return;
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

	const restoreDeletedNode = async (targetPath: string) => {
		if (!root) {
			return;
		}

		setOperationBusy('move');
		setSidebarError(null);

		try {
			const nextStatus = await invoke<GitStatus>('git_restore_file', {
				path: targetPath,
				rootPath: root.path,
			});
			const nextRoot = await invoke<ExplorerNode>('scan_workspace_folder', {
				rootPath: root.path,
				showHiddenFiles,
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

			const children = await invoke<ExplorerNode[]>(
				'read_workspace_directory',
				{
					directoryPath,
					rootPath,
					showHiddenFiles,
				}
			);

			nextRoot = replaceDirectoryChildren(nextRoot, directoryPath, children);
		}

		return nextRoot;
	};

	const openFolder = async () => {
		setSidebarBusy(true);
		setSidebarError(null);

		try {
			const nextRoot = await invoke<ExplorerNode | null>(
				'pick_workspace_folder',
				{
					showHiddenFiles,
				}
			);

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

			if (fileToOpen) {
				void loadPreview(fileToOpen);
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
			const nextRoot = await invoke<ExplorerNode>('scan_workspace_folder', {
				rootPath: root.path,
				showHiddenFiles,
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
			await invoke<ExplorerNode>('create_markdown_file', {
				fileName,
				rootPath,
				selectedPath: targetPath,
			});

			removeMarkdownDraftsFor(createdPath);

			// Re-scan the whole workspace to ensure the new file appears immediately.
			const nextRoot = await invoke<ExplorerNode>('scan_workspace_folder', {
				rootPath,
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
			await invoke<ExplorerNode>('create_workspace_directory', {
				directoryName,
				rootPath,
				selectedPath: destinationDirectory,
			});

			// Re-scan the whole workspace to ensure the new directory appears immediately.
			const nextRoot = await invoke<ExplorerNode>('scan_workspace_folder', {
				rootPath,
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
			await invoke('rename_workspace_node', {
				newName,
				rootPath: root.path,
				targetPath,
			});

			removeMarkdownDraftsFor(targetPath);
			removeMarkdownDraftsFor(renamedPath);

			const nextRoot = await invoke<ExplorerNode>('scan_workspace_folder', {
				rootPath: root.path,
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
			await invoke('delete_workspace_node', {
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
			await invoke(
				clipboard.mode === 'copy'
					? 'copy_workspace_node'
					: 'move_workspace_node',
				{
					destinationDirectory,
					rootPath: root.path,
					sourcePath: clipboard.item.path,
				}
			);

			const nextRoot = await invoke<ExplorerNode>('scan_workspace_folder', {
				rootPath: root.path,
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
			const children = await invoke<ExplorerNode[]>(
				'read_workspace_directory',
				{
					rootPath: workspaceRootPath,
					directoryPath: directory.path,
					showHiddenFiles,
				}
			);

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
				const nextRoot = await invoke<ExplorerNode>('scan_workspace_folder', {
					rootPath: savedRootPath,
					showHiddenFiles,
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

				setRoot(resolvedRoot);
				window.localStorage.setItem(
					WORKSPACE_ROOT_STORAGE_KEY,
					resolvedRoot.path
				);

				const fileToOpen =
					nextSelectedFile?.kind === 'file'
						? nextSelectedFile
						: findFirstFile(resolvedRoot);

				if (fileToOpen) {
					void loadPreview(fileToOpen);
				} else {
					clearSelectionAndPreview();
				}
			} catch (error) {
				if (!active) {
					return;
				}

				window.localStorage.removeItem(LAST_OPEN_FILE_STORAGE_KEY);
				window.localStorage.removeItem(WORKSPACE_ROOT_STORAGE_KEY);
				setRoot(null);
				setClipboard(null);
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
	}, [showHiddenFiles]);

	const refreshGitStatus = useCallback(
		async (targetRootPath?: string | null) => {
			const nextRootPath = targetRootPath ?? root?.path ?? null;

			if (!nextRootPath) {
				queueMicrotask(() => setGitStatus(null));
				return;
			}

			setGitBusy(true);

			try {
				const nextStatus = await invoke<GitStatus>('git_status', {
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
	}, [root?.path]);

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
	}, [gitStatus, root, selectedFile]);

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
			<main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
				<FilePreview
					conflictedFilePaths={gitStatus?.conflictedFiles ?? []}
					loading={previewLoading}
					onOpenFolder={openFolder}
					preview={preview}
					rootPath={root?.path ?? null}
					selectedFile={selectedFile}
					workspaceOpen={Boolean(root)}
				/>
			</main>
		</div>
	);
}
