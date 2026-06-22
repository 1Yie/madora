import {
	ArrowUpDown,
	Bookmark,
	BookmarkX,
	ChevronRight,
	Clipboard,
	CloudOff,
	Copy,
	FileImage,
	FilePenLine,
	FileText,
	FileUp,
	FilePlus,
	Folder,
	FolderPlus,
	FolderOpen,
	ListCollapse,
	LoaderCircle,
	RotateCcw,
	Scissors,
	Trash2,
	X,
} from 'lucide-react';
import {
	type FormEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	memo,
} from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { pathExists } from '@/invoke/system';
import { Button } from '@/components/ui/button';
import {
	ContextMenuPopup,
	ContextMenuRoot,
	ContextMenuTrigger,
	MenuItem,
	MenuSeparator,
} from '@/components/ui/context-menu';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import { webdavGetStatus, type WebDavSyncFileEntry } from '@/invoke/webdav';
import { useVirtualizer } from '@tanstack/react-virtual';

import { cn } from '@/lib/utils';

import { useWorkspace } from '@/context/workspace-provider';

import type { GitStatus } from '../git/git-types';
import { GitPanel } from '../git/git-panel';
import { WebDavPanel } from '../webdav/webdav-panel';
import {
	explorerBottomSectionHeightClassName,
	explorerSidebarStatusBarClassName,
	explorerTopSectionHeightClassName,
} from '../layout';
import {
	getParentPath,
	getPathName,
	isSameOrDescendantPath,
	joinExplorerPath,
	normalizeExplorerPath,
} from '../../../lib/path-utils';
import type { ExplorerClipboardItem, ExplorerNode } from '../types';

type PendingAction =
	| { type: 'createMarkdown'; targetPath: string | null }
	| {
			type: 'createDirectory';
			node: ExplorerNode | null;
			targetPath: string | null;
	  }
	| { type: 'rename'; node: ExplorerNode }
	| { type: 'delete'; node: ExplorerNode }
	| { type: 'batchDelete'; nodes: ExplorerNode[] }
	| { type: 'restoreDeleted'; node: ExplorerNode }
	| null;

type BookmarkVisibilityState = {
	scopeKey: string;
	entries: Map<string, boolean>;
};

type GitFileEntry = NonNullable<GitStatus['files']>[number];

const gitFileStatePriority = {
	conflicted: 7,
	modified: 6,
	untracked: 5,
	added: 4,
	deleted: 3,
	renamed: 2,
	typechange: 1,
} as const;

function getGitBadgeText(file: GitFileEntry): string {
	switch (file.status) {
		case 'modified':
			return file.staged && !file.unstaged ? 'S' : 'M';
		case 'untracked':
			return 'N';
		case 'added':
			return 'A';
		case 'deleted':
			return 'D';
		case 'conflicted':
			return '!';
		case 'renamed':
			return 'R';
		case 'typechange':
			return 'T';
		default:
			return '';
	}
}

function getGitBadgeClassName(file: GitFileEntry): string {
	const baseClassName = 'min-w-[1ch] text-center';

	switch (file.status) {
		case 'conflicted':
			return `${baseClassName} text-destructive`;
		case 'modified':
			// Show modified files as warning (yellow) when not staged, similar to VS Code.
			if (file.staged && file.unstaged) {
				return `${baseClassName} text-warning`;
			}

			return file.staged
				? `${baseClassName} text-success`
				: `${baseClassName} text-warning`;
		case 'untracked':
		case 'added':
			return `${baseClassName} text-success`;
		case 'deleted':
			return `${baseClassName} text-destructive`;
		case 'renamed':
		case 'typechange':
			return `${baseClassName} text-info`;
		default:
			return `${baseClassName} text-muted-foreground`;
	}
}

function getGitFilePriority(file: GitFileEntry): number {
	return gitFileStatePriority[file.status] * 10 + Number(file.unstaged);
}

function sortExplorerChildren(children: ExplorerNode[]): ExplorerNode[] {
	return [...children].sort((left, right) => {
		if (left.kind !== right.kind) {
			return left.kind === 'directory' ? -1 : 1;
		}

		return left.name.localeCompare(right.name, undefined, {
			sensitivity: 'base',
		});
	});
}

function collectAllDirectoryPaths(node: ExplorerNode): string[] {
	const paths: string[] = [];

	if (node.kind === 'directory') {
		paths.push(node.path);

		for (const child of node.children) {
			paths.push(...collectAllDirectoryPaths(child));
		}
	}

	return paths;
}

function buildGitStatusMap(
	status: GitStatus | null
): Map<string, GitFileEntry> {
	const nextMap = new Map<string, GitFileEntry>();

	for (const file of status?.files ?? []) {
		nextMap.set(normalizeExplorerPath(file.path), file);
	}

	return nextMap;
}

function getAggregatedDirectoryGitState(
	node: ExplorerNode,
	gitStatusMap: Map<string, GitFileEntry>
): GitFileEntry | null {
	// Aggregate git states for the given directory. We examine the git status map
	// for any entries that are equal to or are descendants of the directory's
	// path. This also covers cases where a tracked file has been deleted from
	// disk (so it no longer exists in the explorer tree) but still appears in
	// git status (e.g. deleted/ staged deletions). In that case we want the
	// directory to reflect the highest-priority git state found under it.
	let bestState: GitFileEntry | null = null;
	let bestPriority = -1;

	const nodePath = normalizeExplorerPath(node.path);

	for (const [filePath, fileState] of gitStatusMap.entries()) {
		// If filePath is the node itself or a descendant of the node path.
		if (filePath === nodePath || filePath.startsWith(`${nodePath}/`)) {
			const priority = getGitFilePriority(fileState);

			if (priority > bestPriority) {
				bestPriority = priority;
				bestState = fileState;
			}
		}
	}

	return bestState;
}

function buildSyntheticDeletedNode(
	rootPath: string,
	deletedPath: string
): ExplorerNode {
	const fileName = getPathName(deletedPath);
	const normalizedRootPath = normalizeExplorerPath(rootPath);
	const normalizedDeletedPath = normalizeExplorerPath(deletedPath);

	return {
		children: [],
		fileKind: null,
		hasChildren: false,
		isMissing: true,
		kind: 'file',
		loaded: true,
		name: fileName,
		path: deletedPath,
		relativePath:
			normalizedDeletedPath === normalizedRootPath
				? ''
				: normalizedDeletedPath.slice(normalizedRootPath.length + 1),
	};
}

function buildSyntheticDeletedDirectoryNode(
	rootPath: string,
	directoryPath: string
): ExplorerNode {
	const fileName = getPathName(directoryPath);
	const normalizedRootPath = normalizeExplorerPath(rootPath);
	const normalizedDirectoryPath = normalizeExplorerPath(directoryPath);

	return {
		children: [],
		fileKind: null,
		hasChildren: false,
		isMissing: true,
		kind: 'directory',
		loaded: true,
		name: fileName,
		path: directoryPath,
		relativePath:
			normalizedDirectoryPath === normalizedRootPath
				? ''
				: normalizedDirectoryPath.slice(normalizedRootPath.length + 1),
	};
}

function mergeDeletedGitNodes(
	root: ExplorerNode,
	gitStatusMap: Map<string, GitFileEntry>
): ExplorerNode {
	const deletedEntries = [...gitStatusMap.entries()].filter(
		([, file]) => file.status === 'deleted'
	);

	if (deletedEntries.length === 0) {
		return root;
	}

	const insertDeletedPath = (
		node: ExplorerNode,
		deletedPath: string
	): ExplorerNode => {
		if (
			node.kind === 'file' ||
			!isSameOrDescendantPath(deletedPath, node.path)
		) {
			return node;
		}

		const normalizedNodePath = normalizeExplorerPath(node.path);
		const normalizedDeletedPath = normalizeExplorerPath(deletedPath);

		if (normalizedNodePath === normalizedDeletedPath) {
			return node;
		}

		const relativeSegments = normalizedDeletedPath
			.slice(normalizedNodePath.length + 1)
			.split('/')
			.filter(Boolean);

		if (relativeSegments.length === 0) {
			return node;
		}

		const [nextSegment, ...remainingSegments] = relativeSegments;
		const childPath = joinExplorerPath(node.path, nextSegment);
		const normalizedChildPath = normalizeExplorerPath(childPath);
		const nextChildren = [...node.children];
		const existingChildIndex = nextChildren.findIndex(
			(child) => normalizeExplorerPath(child.path) === normalizedChildPath
		);

		if (remainingSegments.length === 0) {
			if (existingChildIndex === -1) {
				nextChildren.push(buildSyntheticDeletedNode(root.path, deletedPath));
			}

			return {
				...node,
				children: nextChildren,
				hasChildren: nextChildren.length > 0,
			};
		}

		const currentChild =
			existingChildIndex >= 0
				? nextChildren[existingChildIndex]
				: buildSyntheticDeletedDirectoryNode(root.path, childPath);

		if (currentChild.kind === 'file') {
			return node;
		}

		const nextChild = insertDeletedPath(currentChild, deletedPath);

		if (existingChildIndex >= 0) {
			nextChildren[existingChildIndex] = nextChild;
		} else {
			nextChildren.push(nextChild);
		}

		return {
			...node,
			children: nextChildren,
			hasChildren: nextChildren.length > 0,
		};
	};

	return deletedEntries.reduce(
		(nextRoot, [filePath]) => insertDeletedPath(nextRoot, filePath),
		root
	);
}

function collectAncestorPaths(
	root: ExplorerNode,
	targetPath: string
): string[] {
	const ancestors: string[] = [];

	function walk(node: ExplorerNode, lineage: string[]) {
		if (node.path === targetPath) {
			ancestors.push(...lineage);
			return true;
		}

		for (const child of node.children) {
			if (
				walk(
					child,
					node.kind === 'directory' ? [...lineage, node.path] : lineage
				)
			) {
				return true;
			}
		}

		return false;
	}

	walk(root, []);
	return ancestors;
}

function findNodeByPath(node: ExplorerNode, path: string): ExplorerNode | null {
	if (node.path === path) {
		return node;
	}

	for (const child of node.children) {
		if (child.path === path) {
			return child;
		}

		if (child.kind === 'directory') {
			const match = findNodeByPath(child, path);

			if (match) {
				return match;
			}
		}
	}

	return null;
}

function resolveCreateTargetNode(
	root: ExplorerNode | null,
	selectedPath: string | null
) {
	if (!root) {
		return null;
	}

	if (!selectedPath) {
		return root;
	}

	const selectedNode = findNodeByPath(root, selectedPath);

	if (!selectedNode) {
		return root;
	}

	if (selectedNode.kind === 'directory') {
		return selectedNode;
	}

	const parentPath = getParentPath(selectedNode.path);

	if (!parentPath) {
		return root;
	}

	return findNodeByPath(root, parentPath) ?? root;
}

function ContextMenuContent({
	clipboard,
	includeNodeActions = true,
	isDeletedGitEntry = false,
	onAction,
	pasteDisabled,
	target,
}: {
	clipboard: {
		item: ExplorerClipboardItem;
		mode: 'copy' | 'cut';
	} | null;
	includeNodeActions?: boolean;
	isDeletedGitEntry?: boolean;
	onAction: (
		action:
			| 'createMarkdown'
			| 'createDirectory'
			| 'copy'
			| 'cut'
			| 'delete'
			| 'rename'
			| 'paste'
			| 'restoreDeleted'
	) => void;
	pasteDisabled: boolean;
	target: ExplorerNode | null;
}) {
	const { t } = useTranslation();
	const canCreateDirectory = target === null || target.kind === 'directory';
	const canCreateDocument = canCreateDirectory;

	return (
		<ContextMenuPopup align="start" sideOffset={6}>
			{target && includeNodeActions ? (
				isDeletedGitEntry ? (
					<MenuItem onClick={() => onAction('restoreDeleted')}>
						<RotateCcw />
						{t('explorerPanel.restore')}
					</MenuItem>
				) : (
					<>
						{canCreateDocument ? (
							<MenuItem onClick={() => onAction('createMarkdown')}>
								<FileText />
								{t('explorerPanel.newDocument')}
							</MenuItem>
						) : null}
						{canCreateDirectory ? (
							<MenuItem onClick={() => onAction('createDirectory')}>
								<FolderPlus />
								{t('explorerPanel.newFolder')}
							</MenuItem>
						) : null}
						<MenuItem onClick={() => onAction('rename')}>
							<FilePenLine />
							{t('explorerPanel.rename')}
						</MenuItem>
						<MenuItem onClick={() => onAction('copy')}>
							<Copy />
							{t('explorerPanel.copy')}
						</MenuItem>
						<MenuItem onClick={() => onAction('cut')}>
							<Scissors />
							{t('explorerPanel.cut')}
						</MenuItem>
						{clipboard ? (
							<MenuItem
								disabled={pasteDisabled}
								onClick={() => onAction('paste')}
							>
								<Clipboard />
								{t('explorerPanel.pasteHere')}
							</MenuItem>
						) : null}
						<MenuSeparator />
						<MenuItem onClick={() => onAction('delete')} variant="destructive">
							<Trash2 />
							{t('explorerPanel.delete')}
						</MenuItem>
					</>
				)
			) : (
				<>
					<MenuItem onClick={() => onAction('createMarkdown')}>
						<FileText />
						{t('explorerPanel.newDocument')}
					</MenuItem>
					<MenuItem onClick={() => onAction('createDirectory')}>
						<FolderPlus />
						{t('explorerPanel.newFolder')}
					</MenuItem>
					{clipboard ? (
						<MenuItem
							disabled={pasteDisabled}
							onClick={() => onAction('paste')}
						>
							<Clipboard />
							{t('explorerPanel.pasteToDir')}
						</MenuItem>
					) : null}
				</>
			)}
			{clipboard ? (
				<div className="px-2 py-1.5 text-muted-foreground text-xs">
					{clipboard.mode === 'copy'
						? t('explorerPanel.copy')
						: t('explorerPanel.cut')}
					: {clipboard.item.name}
				</div>
			) : null}
		</ContextMenuPopup>
	);
}

function CreateMarkdownDialog({
	busy,
	onOpenChange,
	onCreateMarkdown,
	open,
}: {
	busy: boolean;
	onOpenChange: (open: boolean) => void;
	onCreateMarkdown: (fileName: string) => Promise<void>;
	open: boolean;
}) {
	const { t } = useTranslation();
	const [fileName, setFileName] = useState('');

	const reset = () => {
		setFileName('');
	};

	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);

		if (!nextOpen) {
			reset();
		}
	};
	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const trimmedFileName = fileName.trim();

		if (!trimmedFileName) {
			showErrorToast(
				t('explorerPanel.createFailed'),
				t('explorerPanel.enterFileName')
			);
			return;
		}

		const lowerName = trimmedFileName.toLowerCase();
		if (
			lowerName.includes('.') &&
			!lowerName.endsWith('.md') &&
			!lowerName.endsWith('.mdx')
		) {
			showErrorToast(
				t('explorerPanel.createFailed'),
				t('explorerPanel.invalidFileExtension')
			);
			return;
		}

		try {
			await onCreateMarkdown(trimmedFileName);
			handleOpenChange(false);
		} catch (error) {
			void error;
		}
	};

	return (
		<ExplorerDialogForm
			description={t('explorerPanel.createDescription')}
			footer={
				<>
					<Button
						disabled={busy}
						onClick={() => handleOpenChange(false)}
						variant="outline"
					>
						{t('common.actions.cancel')}
					</Button>
					<Button loading={busy} type="submit">
						{t('common.actions.create')}
					</Button>
				</>
			}
			onOpenChange={handleOpenChange}
			onSubmit={handleSubmit}
			open={open}
			title={t('explorerPanel.newDocument')}
		>
			<Input
				autoFocus
				nativeInput
				onChange={(event) => setFileName(event.target.value)}
				placeholder="untitled.md / untitled.mdx"
				value={fileName}
			/>
		</ExplorerDialogForm>
	);
}

function CreateDirectoryDialog({
	busy,
	node,
	onClose,
	onConfirm,
}: {
	busy: boolean;
	node: ExplorerNode | null | undefined;
	onClose: () => void;
	onConfirm: (directoryName: string) => Promise<void>;
}) {
	const { t } = useTranslation();
	const open = node !== undefined;

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);
		const trimmedDirectoryName = String(
			formData.get('directoryName') ?? ''
		).trim();

		if (!trimmedDirectoryName) {
			showErrorToast(
				t('explorerPanel.createFailed'),
				t('explorerPanel.enterFolderName')
			);
			return;
		}

		try {
			await onConfirm(trimmedDirectoryName);
			onClose();
		} catch (error) {
			void error;
		}
	};
	return (
		<ExplorerDialogForm
			description={t('explorerPanel.createDescription')}
			footer={
				<>
					<Button disabled={busy} onClick={onClose} variant="outline">
						{t('common.actions.cancel')}
					</Button>
					<Button loading={busy} type="submit">
						{t('common.actions.create')}
					</Button>
				</>
			}
			onOpenChange={(open) => !open && onClose()}
			onSubmit={handleSubmit}
			open={open}
			title={t('explorerPanel.newFolder')}
		>
			<Input
				autoFocus
				name="directoryName"
				nativeInput
				placeholder="new-folder"
			/>
		</ExplorerDialogForm>
	);
}

function RenameNodeDialog({
	busy,
	node,
	onClose,
	onConfirm,
}: {
	busy: boolean;
	node: ExplorerNode | null;
	onClose: () => void;
	onConfirm: (newName: string) => Promise<void>;
}) {
	const { t } = useTranslation();
	const open = Boolean(node);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);
		const trimmedName = String(formData.get('name') ?? '').trim();

		if (!trimmedName) {
			showErrorToast(
				t('explorerPanel.renameFailed'),
				t('explorerPanel.enterName')
			);
			return;
		}

		try {
			await onConfirm(trimmedName);
			onClose();
		} catch (error) {
			void error;
		}
	};
	return (
		<ExplorerDialogForm
			description={
				node?.kind === 'directory'
					? t('explorerPanel.renameFolderDescription')
					: t('explorerPanel.renameFileDescription')
			}
			footer={
				<>
					<Button disabled={busy} onClick={onClose} variant="outline">
						{t('common.actions.cancel')}
					</Button>
					<Button loading={busy} type="submit">
						{t('common.actions.save')}
					</Button>
				</>
			}
			onOpenChange={(open) => !open && onClose()}
			onSubmit={handleSubmit}
			open={open}
			title={t('explorerPanel.rename')}
		>
			<Input
				autoFocus
				defaultValue={node?.name ?? ''}
				name="name"
				nativeInput
			/>
		</ExplorerDialogForm>
	);
}

function DeleteNodeDialog({
	busy,
	node,
	onClose,
	onConfirm,
}: {
	busy: boolean;
	node: ExplorerNode | null;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const { t } = useTranslation();
	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void onConfirm().catch(() => {});
	};

	return (
		<ExplorerDialogForm
			description={
				node?.kind === 'directory'
					? t('explorerPanel.confirmDeleteFolder', { name: node?.name ?? '' })
					: t('explorerPanel.confirmDeleteFile', { name: node?.name ?? '' })
			}
			footer={
				<>
					<Button disabled={busy} onClick={onClose} variant="outline">
						{t('common.actions.cancel')}
					</Button>
					<Button type="submit" loading={busy} variant="destructive">
						{t('common.actions.delete')}
					</Button>
				</>
			}
			onOpenChange={(open) => !open && onClose()}
			onSubmit={handleSubmit}
			open={Boolean(node)}
			title={t('explorerPanel.confirmDeleteTitle')}
		/>
	);
}

function BatchDeleteNodeDialog({
	busy,
	nodes,
	onClose,
	onConfirm,
}: {
	busy: boolean;
	nodes: ExplorerNode[];
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const { t } = useTranslation();
	const fileCount = nodes.filter((n) => n.kind === 'file').length;
	const dirCount = nodes.filter((n) => n.kind === 'directory').length;

	const description = (() => {
		const parts: string[] = [];
		if (fileCount > 0)
			parts.push(t('explorerPanel.fileCount', { count: fileCount }));
		if (dirCount > 0)
			parts.push(t('explorerPanel.dirCount', { count: dirCount }));
		return t('explorerPanel.confirmBatchDelete', {
			items: parts.join(', '),
		});
	})();

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void onConfirm().catch(() => {});
	};

	return (
		<ExplorerDialogForm
			description={description}
			footer={
				<>
					<Button disabled={busy} onClick={onClose} variant="outline">
						{t('common.actions.cancel')}
					</Button>
					<Button type="submit" loading={busy} variant="destructive">
						{t('common.actions.delete')}
					</Button>
				</>
			}
			onOpenChange={(open) => !open && onClose()}
			onSubmit={handleSubmit}
			open={nodes.length > 0}
			title={t('explorerPanel.confirmBatchDeleteTitle')}
		/>
	);
}

function ExplorerDialogForm({
	children,
	description,
	footer,
	onOpenChange,
	onSubmit,
	open,
	title,
}: {
	children?: ReactNode;
	description: ReactNode;
	footer: ReactNode;
	onOpenChange: (open: boolean) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
	open: boolean;
	title: ReactNode;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogPopup showCloseButton={false}>
				<form className="flex min-h-0 flex-col" onSubmit={onSubmit}>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>
					{children ? (
						<DialogPanel>
							<div className="space-y-3 pt-4">{children}</div>
						</DialogPanel>
					) : null}
					<DialogFooter>{footer}</DialogFooter>
				</form>
			</DialogPopup>
		</Dialog>
	);
}

type FlatItem =
	| { type: 'node'; node: ExplorerNode; depth: number }
	| { type: 'loading'; depth: number }
	| { type: 'empty'; depth: number };

function getFlatItemKey(item: FlatItem, index: number): string {
	if (item.type === 'node') {
		return item.node.path;
	}

	return `${item.type}-${item.depth}-${index}`;
}

function flattenTree(
	node: ExplorerNode,
	expandedPaths: Set<string>,
	sortEnabled: boolean,
	depth = 0
): FlatItem[] {
	const items: FlatItem[] = [{ type: 'node', node, depth }];

	if (node.kind === 'directory' && expandedPaths.has(node.path)) {
		if (node.loaded) {
			if (node.children.length === 0) {
				items.push({ type: 'empty', depth: depth + 1 });
			} else {
				const children = sortEnabled
					? sortExplorerChildren(node.children)
					: node.children;

				for (const child of children) {
					items.push(
						...flattenTree(child, expandedPaths, sortEnabled, depth + 1)
					);
				}
			}
		} else {
			items.push({ type: 'loading', depth: depth + 1 });
		}
	}

	return items;
}

const FileTreeNode = memo(function FileTreeNode({
	clipboard,
	depth,
	expandedPaths,
	gitStatusMap,
	showStatus,
	isMultiSelected,
	loadingPaths,
	node,
	onContextAction,
	onExpandDirectory,
	onHoverNode,
	onSelectNode,
	selectedPath,
	toggleDirectory,
}: {
	clipboard: {
		item: ExplorerClipboardItem;
		mode: 'copy' | 'cut';
	} | null;
	depth: number;
	expandedPaths: Set<string>;
	gitStatusMap: Map<string, GitFileEntry>;
	showStatus: boolean;
	isMultiSelected: boolean;
	loadingPaths: Set<string>;
	node: ExplorerNode;
	onContextAction: (
		action:
			| 'createMarkdown'
			| 'createDirectory'
			| 'copy'
			| 'cut'
			| 'delete'
			| 'rename'
			| 'paste'
			| 'restoreDeleted',
		node: ExplorerNode
	) => void;
	onExpandDirectory: (node: ExplorerNode) => void;
	onHoverNode: (node: ExplorerNode | null) => void;
	onSelectNode: (node: ExplorerNode, e: React.MouseEvent) => void;
	selectedPath: string | null;
	toggleDirectory: (path: string) => void;
}) {
	const { t } = useTranslation();
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	const chevronRef = useRef<SVGSVGElement>(null);
	const userToggledRef = useRef(false);
	const isDirectory = node.kind === 'directory';
	const isPrimarySelected = selectedPath === node.path;
	const isSelected = isPrimarySelected || isMultiSelected || contextMenuOpen;
	const isExpanded = isDirectory && expandedPaths.has(node.path);

	// Keep chevron rotation in sync — animated on user click, instant otherwise.
	useEffect(() => {
		const el = chevronRef.current;
		if (!el) return;

		if (userToggledRef.current) {
			userToggledRef.current = false;
			// User click: animate smoothly
			el.style.transition = 'transform 150ms ease';
			el.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
			const timer = setTimeout(() => {
				el.style.transition = '';
			}, 200);
			return () => clearTimeout(timer);
		}

		// Virtual row reuse or programmatic change: jump to position, no animation.
		el.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
	}, [isExpanded]);

	const isCopied =
		clipboard?.mode === 'copy' && clipboard.item.path === node.path;
	const isCut = clipboard?.mode === 'cut' && clipboard.item.path === node.path;
	const pasteDisabled = !clipboard || clipboard.item.path === node.path;
	const gitState = showStatus
		? isDirectory
			? getAggregatedDirectoryGitState(node, gitStatusMap)
			: (gitStatusMap.get(normalizeExplorerPath(node.path)) ?? null)
		: null;
	const isDeletedGitEntry = !isDirectory && gitState?.status === 'deleted';

	if (isDirectory) {
		const isLoading = loadingPaths.has(node.path);

		return (
			<div
				className={cn(
					'relative py-0.5',
					isCopied && 'border-l-2 border-primary/40',
					isCut && 'border-l-2 border-destructive/40 opacity-50'
				)}
				onMouseEnter={() => onHoverNode(node)}
			>
				{/* Indentation guide lines for each ancestor depth */}
				{Array.from({ length: depth }, (_, i) => (
					<div
						key={`g-${i}`}
						className="absolute top-0 w-px bg-border/60 pointer-events-none z-0"
						style={{ left: `${i * 14 + 18}px`, height: '100%' }}
					/>
				))}
				<ContextMenuRoot onOpenChange={setContextMenuOpen}>
					<ContextMenuTrigger>
						<div
							className="flex w-full items-center gap-1 relative z-10"
							style={{ paddingLeft: `${depth * 14 + 8}px` }}
						>
							<button
								aria-label={
									isExpanded
										? t('explorerPanel.collapseWithName', { name: node.name })
										: t('explorerPanel.expandWithName', { name: node.name })
								}
								type="button"
								className={cn(
									`flex size-5 shrink-0 items-center justify-center rounded-sm
									transition-colors`,
									isSelected
										? `text-sidebar-accent-foreground
											hover:bg-sidebar-accent/80`
										: `text-sidebar-foreground hover:bg-sidebar-accent
											hover:text-sidebar-accent-foreground`
								)}
								onClick={() => {
									userToggledRef.current = true;
									const nextExpanded = !isExpanded;
									toggleDirectory(node.path);

									if (nextExpanded && !node.loaded && !isLoading) {
										onExpandDirectory(node);
									}
								}}
							>
								<ChevronRight ref={chevronRef} className="size-4 shrink-0" />
							</button>
							<button
								type="button"
								className={cn(
									`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5
									text-left text-sm transition-colors`,
									isSelected
										? `bg-sidebar-accent/70 text-sidebar-accent-foreground
											ring-1 ring-inset ring-sidebar-border`
										: `text-sidebar-foreground hover:bg-sidebar-accent
											hover:text-sidebar-accent-foreground`
								)}
								onClick={(e) => {
									userToggledRef.current = true;
									const nextExpanded = !isExpanded;
									toggleDirectory(node.path);
									onSelectNode(node, e);

									if (nextExpanded && !node.loaded && !isLoading) {
										onExpandDirectory(node);
									}
								}}
							>
								{isLoading ? (
									<LoaderCircle className="size-4 shrink-0 animate-spin" />
								) : isExpanded ? (
									<FolderOpen className="size-4 shrink-0" />
								) : (
									<Folder className="size-4 shrink-0" />
								)}
								<span className="truncate">{node.name}</span>
								{gitState ? (
									<span
										className={cn(
											`ml-auto shrink-0 font-mono text-[11px] font-semibold
												uppercase`,
											getGitBadgeClassName(gitState)
										)}
									>
										{getGitBadgeText(gitState)}
									</span>
								) : null}
							</button>
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent
						clipboard={clipboard}
						includeNodeActions={depth > 0 && !node.isMissing}
						isDeletedGitEntry={false}
						onAction={(action) => onContextAction(action, node)}
						pasteDisabled={pasteDisabled}
						target={node}
					/>
				</ContextMenuRoot>
			</div>
		);
	}

	const Icon = node.fileKind === 'image' ? FileImage : FileText;

	return (
		<div
			className={cn(
				'relative py-0.5',
				isCopied && 'border-l-2 border-primary/40',
				isCut && 'border-l-2 border-destructive/40 opacity-50'
			)}
			onMouseEnter={() => onHoverNode(node)}
		>
			{/* Indentation guide lines for each ancestor depth */}
			{Array.from({ length: depth }, (_, i) => (
				<div
					key={`g-${i}`}
					className="absolute top-0 w-px bg-border/60 pointer-events-none z-0"
					style={{ left: `${i * 14 + 18}px`, height: '100%' }}
				/>
			))}
			<ContextMenuRoot onOpenChange={setContextMenuOpen}>
				<ContextMenuTrigger>
					<button
						type="button"
						className={cn(
							`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left
							text-sm transition-colors relative z-10`,
							isPrimarySelected
								? 'bg-sidebar-primary text-sidebar-primary-foreground'
								: isMultiSelected
									? `bg-sidebar-accent/80 text-sidebar-accent-foreground ring-1
										ring-inset ring-sidebar-border`
									: contextMenuOpen
										? 'bg-sidebar-accent text-sidebar-accent-foreground'
										: `text-sidebar-foreground hover:bg-sidebar-accent
											hover:text-sidebar-accent-foreground`
						)}
						onClick={(e) => void onSelectNode(node, e)}
						style={{ paddingLeft: `${depth * 14 + 32}px` }}
					>
						<Icon className="size-4 shrink-0" />
						<span
							className={cn('truncate', isDeletedGitEntry && 'line-through')}
						>
							{node.name}
						</span>
						{gitState ? (
							<span
								className={cn(
									`ml-auto shrink-0 font-mono text-[11px] font-semibold
										uppercase`,
									getGitBadgeClassName(gitState)
								)}
							>
								{getGitBadgeText(gitState)}
							</span>
						) : null}
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent
					clipboard={clipboard}
					onAction={(action) => onContextAction(action, node)}
					pasteDisabled={!clipboard}
					isDeletedGitEntry={isDeletedGitEntry}
					target={node}
				/>
			</ContextMenuRoot>
		</div>
	);
});

export function FileExplorerSidebar() {
	const { t } = useTranslation();
	const ctx = useWorkspace();
	const {
		root,
		selectedNodePath: selectedPath,
		createBusy,
		gitBusy,
		gitStatus,
		operationBusy,
		clipboard,
		loadingPaths,
		createMarkdownDocument: onCreateMarkdown,
		createDirectory: onCreateDirectory,
		copyNode: onCopyNode,
		cutNode: onCutNode,
		deleteNode: onDeleteNode,
		restoreDeletedNode: onRestoreDeletedNode,
		sortEnabled,
		toggleSort: onSortToggle,
		openFolder: onOpenFolder,
		refreshFolder: onRefresh,
		pasteNode: onPasteNode,
		importExternalFilesHandler: onImportExternalFiles,
		initialised,
		gitRefresh: onGitRefresh,
		gitRefreshWorkspace: onGitRefreshWorkspace,
		updateGitStatus: onGitStatusChange,
		syncEnabled,
		syncMode,
		renameNode: onRenameNode,
		expandDirectory: onExpandDirectory,
		selectNode: onSelectNode,
		clearClipboard: onClearClipboard,
		sidebarBusy: busy,
	} = ctx;
	const sidebarRef = useRef<HTMLElement>(null);
	const [pendingAction, setPendingAction] = useState<PendingAction>(null);
	const [bookmarkPaths, setBookmarkPaths] = useState<string[]>(() => {
		try {
			const saved = window.localStorage.getItem('madora-bookmarks');
			return saved ? (JSON.parse(saved) as string[]) : [];
		} catch {
			return [];
		}
	});

	const [bookmarksExpanded, setBookmarksExpanded] = useState(true);
	const [pendingScrollToPath, setPendingScrollToPath] = useState<string | null>(
		null
	);
	const [isDragOver, setIsDragOver] = useState(false);

	// HTML5 dragover visual (always fires; Tauri handles actual drop data)
	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			if (!root) return;
			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = 'copy';
			setIsDragOver(true);
		},
		[root]
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			if (!root || !onImportExternalFiles) return;

			const sourcePaths: string[] = [];

			// 1. files[].path (Tauri webview extension on macOS)
			for (let i = 0; i < e.dataTransfer.files.length; i++) {
				const file = e.dataTransfer.files[i];
				const path = (file as unknown as { path?: string }).path;

				if (path) sourcePaths.push(path);
			}

			// 2. text/uri-list (always available for Finder drags)
			if (sourcePaths.length === 0) {
				const uriList = e.dataTransfer.getData('text/uri-list');

				if (uriList) {
					for (const uri of uriList.split('\n')) {
						const trimmed = uri.trim();

						if (trimmed.startsWith('file://')) {
							sourcePaths.push(decodeURI(trimmed.slice(7)));
						}
					}
				}
			}

			// 3. text/plain direct path fallback
			if (sourcePaths.length === 0) {
				const text = e.dataTransfer.getData('text/plain');

				if (text && text.trim().length > 5 && !text.includes('\n')) {
					sourcePaths.push(text.trim());
				}
			}

			if (sourcePaths.length === 0) {
				showErrorToast(t('explorerPanel.dropFailed'));
				return;
			}

			// Determine target directory
			const destNode = hoveredNodeRef.current ?? null;
			const destPath =
				destNode?.kind === 'directory'
					? destNode.path
					: destNode
						? getParentPath(destNode.path)
						: root.path;

			void onImportExternalFiles(sourcePaths, destPath);
		},
		[onImportExternalFiles, root]
	);
	const createTargetNode = resolveCreateTargetNode(root, selectedPath);
	// ── WebDAV file status (fetched on mount / after sync) ──
	const [webdavSyncFiles, setWebdavSyncFiles] = useState<
		WebDavSyncFileEntry[] | null
	>(null);
	const fetchWebDavStatus = useCallback(() => {
		if (!syncEnabled || syncMode !== 'webdav' || !root?.path) {
			setWebdavSyncFiles(null);
			return;
		}
		webdavGetStatus(root.path)
			.then((res) => setWebdavSyncFiles(res.files))
			.catch(() => setWebdavSyncFiles(null));
	}, [syncEnabled, syncMode, root?.path]);

	useEffect(() => {
		fetchWebDavStatus();
	}, [fetchWebDavStatus]);

	useEffect(() => {
		const handler = () => fetchWebDavStatus();
		window.addEventListener('webdav-sync-complete', handler);
		// Refresh WebDAV status after a file is saved, giving the sync
		// mechanism time to upload before we poll for updated status.
		const handleFileSave = () => {
			setTimeout(fetchWebDavStatus, 800);
		};
		window.addEventListener('workspace-file-saved', handleFileSave);
		return () => {
			window.removeEventListener('webdav-sync-complete', handler);
			window.removeEventListener('workspace-file-saved', handleFileSave);
		};
	}, [fetchWebDavStatus]);

	// ── Git status map ──
	const gitStatusMap = useMemo(() => buildGitStatusMap(gitStatus), [gitStatus]);

	// When in webdav mode, derive a compatible map from webdav sync status
	const effectiveGitStatusMap = useMemo(() => {
		if (
			!syncEnabled ||
			syncMode !== 'webdav' ||
			!webdavSyncFiles ||
			!root?.path
		) {
			return gitStatusMap;
		}
		const map = new Map<string, GitFileEntry>();
		for (const file of webdavSyncFiles) {
			if (file.status === 'synced') continue;
			const fullPath = normalizeExplorerPath(
				`${root.path}/${file.relative_path}`
			);
			const gitFileEntry: GitFileEntry = {
				staged: false,
				unstaged: true,
				status:
					file.status === 'new'
						? 'untracked'
						: file.status === 'deleted'
							? 'deleted'
							: 'modified',
				path: fullPath,
				hasConflictMarkers: false,
			};
			map.set(fullPath, gitFileEntry);
		}
		return map;
	}, [syncEnabled, syncMode, webdavSyncFiles, gitStatusMap, root?.path]);

	const mergedRoot = useMemo(
		() => (root ? mergeDeletedGitNodes(root, effectiveGitStatusMap) : null),
		[effectiveGitStatusMap, root]
	);
	const bookmarkVisibilityScopeKey = `${root?.path ?? ''}:${gitStatus?.branch?.name ?? ''}`;

	// Resolve bookmark visibility against the current branch/worktree only.
	const [bookmarkVisibility, setBookmarkVisibility] =
		useState<BookmarkVisibilityState>(() => ({
			scopeKey: '',
			entries: new Map(),
		}));
	useEffect(() => {
		if (!root?.path || bookmarkPaths.length === 0) {
			setBookmarkVisibility({
				scopeKey: bookmarkVisibilityScopeKey,
				entries: new Map(),
			});
			return;
		}

		let cancelled = false;
		(async () => {
			const entries = await Promise.all(
				bookmarkPaths.map(
					async (path) => [path, await pathExists(root.path, path)] as const
				)
			);

			if (!cancelled) {
				setBookmarkVisibility({
					scopeKey: bookmarkVisibilityScopeKey,
					entries: new Map(entries),
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [bookmarkPaths, bookmarkVisibilityScopeKey, mergedRoot, root?.path]);

	// Bookmarks whose file exists in the current branch (in tree or on disk)
	const visibleBookmarks = useMemo(
		() =>
			bookmarkPaths.filter((p) => {
				if (mergedRoot && findNodeByPath(mergedRoot, p)) return true;
				return (
					bookmarkVisibility.scopeKey === bookmarkVisibilityScopeKey &&
					bookmarkVisibility.entries.get(p) === true
				);
			}),
		[bookmarkPaths, bookmarkVisibility, bookmarkVisibilityScopeKey, mergedRoot]
	);

	const expansionRootPath = mergedRoot?.path ?? root?.path ?? null;

	const resolvedExpandedPaths = useMemo(() => {
		if (!mergedRoot) {
			return new Set<string>();
		}

		const isCurrentRoot = expansionRootPath === ctx.expansionRootPath;
		const collapsedPaths = isCurrentRoot
			? ctx.collapsedPaths
			: new Set<string>();
		const nextPaths = new Set(isCurrentRoot ? ctx.expandedPaths : []);

		// On initial load, default to root expanded unless the user explicitly collapsed it.
		if (!collapsedPaths.has(mergedRoot.path)) {
			nextPaths.add(mergedRoot.path);
		}

		if (selectedPath) {
			for (const ancestor of collectAncestorPaths(mergedRoot, selectedPath)) {
				if (!collapsedPaths.has(ancestor)) {
					nextPaths.add(ancestor);
				}
			}
		}

		return nextPaths;
	}, [
		expansionRootPath,
		ctx.expansionRootPath,
		ctx.collapsedPaths,
		ctx.expandedPaths,
		mergedRoot,
		selectedPath,
	]);

	useEffect(() => {
		if (!mergedRoot) {
			return;
		}

		// Refresh rebuilds directory nodes as unloaded placeholders; hydrate expanded folders again.
		for (const path of resolvedExpandedPaths) {
			const node = findNodeByPath(mergedRoot, path);

			if (
				!node ||
				node.kind !== 'directory' ||
				node.loaded ||
				loadingPaths.has(path)
			) {
				continue;
			}

			void onExpandDirectory(node);
		}
	}, [loadingPaths, mergedRoot, onExpandDirectory, resolvedExpandedPaths]);

	const toggleDirectory = useCallback(
		(path: string) => {
			const isExpanded = resolvedExpandedPaths.has(path);
			ctx.toggleDirectory(path, expansionRootPath, isExpanded);
		},
		[ctx, expansionRootPath, resolvedExpandedPaths]
	);

	const hoveredNodeRef = useRef<ExplorerNode | null>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	// Cache the OS viewport once found — avoids DOM queries on every
	// virtualizer scroll frame, which causes jank with many tree nodes.
	const scrollElementRef = useRef<HTMLElement | null>(null);

	const flatItems = useMemo(() => {
		if (!mergedRoot) return [];
		return flattenTree(mergedRoot, resolvedExpandedPaths, sortEnabled);
	}, [mergedRoot, resolvedExpandedPaths, sortEnabled]);

	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
		() => new Set()
	);
	const lastClickedPathRef = useRef<string | null>(null);
	const handleSelectNodeRef = useRef(onSelectNode);
	handleSelectNodeRef.current = onSelectNode;

	const handleSelectNode = useCallback(
		(node: ExplorerNode, e: React.MouseEvent) => {
			const mod = e.ctrlKey || e.metaKey;

			if (mod) {
				// Ctrl/Meta+click: toggle multi-selection, no file opening
				e.preventDefault();
				e.stopPropagation();
				setSelectedPaths((prev) => {
					const next = new Set(prev);
					if (next.has(node.path)) {
						next.delete(node.path);
					} else {
						next.add(node.path);
					}
					return next;
				});
				lastClickedPathRef.current = node.path;
				return;
			}

			if (e.shiftKey && lastClickedPathRef.current) {
				// Shift+click: range select within same parent directory
				e.preventDefault();
				e.stopPropagation();
				const parentPath = getParentPath(node.path);
				const lastParentPath = getParentPath(lastClickedPathRef.current);

				if (parentPath === lastParentPath && parentPath !== null) {
					const siblingPaths = flatItems
						.filter(
							(item) =>
								item.type === 'node' &&
								getParentPath(item.node.path) === parentPath
						)
						.map(
							(item) => (item as { type: 'node'; node: ExplorerNode }).node.path
						);

					const startIdx = siblingPaths.indexOf(lastClickedPathRef.current);
					const endIdx = siblingPaths.indexOf(node.path);

					if (startIdx >= 0 && endIdx >= 0) {
						const [from, to] =
							startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
						const range = siblingPaths.slice(from, to + 1);
						setSelectedPaths((prev) => {
							const next = new Set(prev);
							for (const path of range) {
								next.add(path);
							}
							return next;
						});
					}
				}
				lastClickedPathRef.current = node.path;
				return;
			}

			// Plain click: single select (clear multi, open file as normal)
			setSelectedPaths(new Set([node.path]));
			lastClickedPathRef.current = node.path;
			e.stopPropagation();
			handleSelectNodeRef.current(node);
		},
		[flatItems]
	);

	const virtualizer = useVirtualizer({
		count: flatItems.length,
		getItemKey: (index) => {
			const item = flatItems[index];
			return item ? getFlatItemKey(item, index) : index;
		},
		getScrollElement: () => {
			if (scrollElementRef.current) return scrollElementRef.current;

			const el = viewportRef.current;
			if (!el) return null;

			const osRoot = el.closest('[data-overlayscrollbars]');
			if (osRoot) {
				scrollElementRef.current = (osRoot.querySelector(
					'[data-overlayscrollbars-viewport]'
				) ?? el) as HTMLElement;
			} else {
				scrollElementRef.current = el;
			}

			return scrollElementRef.current;
		},
		estimateSize: () => 36,
		// Increased overscan to pre-render items outside the viewport,
		// reducing white flash during fast scrolling. The background on
		// each virtual item wrapper (bg-background) fills the gap while
		// the tree row content is being mounted.
		overscan: 10,
	});

	// Invalidate the cached scroll element when the OS structure may have
	// changed (e.g. re-initialization after React reconciliation).
	useEffect(() => {
		scrollElementRef.current = null;
	});

	useEffect(() => {
		if (!pendingScrollToPath || flatItems.length === 0) return;

		const idx = flatItems.findIndex(
			(item) => item.type === 'node' && item.node.path === pendingScrollToPath
		);

		if (idx >= 0) {
			virtualizer.scrollToIndex(idx, { align: 'center' });
			setPendingScrollToPath(null);
		}
	}, [pendingScrollToPath, flatItems, virtualizer]);

	// Shared helper: interpret clipboard text as file path(s) or file name
	async function handleClipboardText(
		text: string,
		destPath: string | null,
		doImport: typeof onImportExternalFiles,
		doCreateMarkdown: typeof onCreateMarkdown
	) {
		const trimmed = text.trim();

		if (!trimmed) return;

		// Long text (looks like a file path)
		if (trimmed.length > 10 && !trimmed.includes('\n')) {
			void doImport?.([trimmed], destPath);
			return;
		}

		// Short text (file name for quick creation)
		if (trimmed.length < 200 && !trimmed.includes('\n') && doCreateMarkdown) {
			void doCreateMarkdown(trimmed, destPath);
			showSuccessToast(t('explorerPanel.createSuccess', { name: trimmed }));
		}
	}

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (pendingAction !== null) return;

			// Only handle shortcuts when the event target is inside the sidebar
			if (!sidebarRef.current?.contains(e.target as Node)) return;

			// Never intercept inside native inputs (rename/create dialogs)
			const tag = (e.target as HTMLElement).tagName;

			if (tag === 'INPUT' || tag === 'TEXTAREA') return;

			// Prefer the node under the mouse cursor, fall back to selection
			const node =
				hoveredNodeRef.current ??
				(selectedPath && mergedRoot
					? findNodeByPath(mergedRoot, selectedPath)
					: null);
			const mod = e.ctrlKey || e.metaKey;

			if (mod && e.key === 'c' && node) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				onCopyNode(node);
				showSuccessToast(t('explorerPanel.copySuccess', { name: node.name }));
			} else if (mod && e.key === 'x' && node) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				onCutNode(node);
				showSuccessToast(t('explorerPanel.cutSuccess', { name: node.name }));
			} else if (mod && e.key === 'v' && clipboard) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				void onPasteNode(node?.path ?? null);
				showSuccessToast(
					t('explorerPanel.pasteSuccess', { name: clipboard.item.name })
				);
			} else if (mod && e.key === 'v' && !clipboard) {
				// System clipboard: read proactively via navigator.clipboard
				// (paste event may not fire when no editable element is focused)
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();

				const destNode = hoveredNodeRef.current ?? null;
				const destPath =
					destNode?.kind === 'directory'
						? destNode.path
						: destNode
							? getParentPath(destNode.path)
							: (root?.path ?? null);

				void (async () => {
					try {
						if (!navigator.clipboard?.read) {
							// Fall back to readText
							const text = await navigator.clipboard.readText();

							if (!text) return;
							await handleClipboardText(
								text,
								destPath,
								onImportExternalFiles,
								onCreateMarkdown
							);
							return;
						}

						const items = await navigator.clipboard.read();
						const filePaths: string[] = [];
						let text: string | null = null;

						for (const item of items) {
							if (item.types.includes('text/uri-list')) {
								const blob = await item.getType('text/uri-list');
								const content = await blob.text();

								for (const line of content.split('\n')) {
									const trimmed = line.trim();

									if (trimmed.startsWith('file://')) {
										filePaths.push(decodeURI(trimmed.slice(7)));
									}
								}
							}

							if (item.types.includes('text/plain') && !text) {
								const blob = await item.getType('text/plain');
								text = await blob.text();
							}
						}

						if (filePaths.length > 0) {
							void onImportExternalFiles?.(filePaths, destPath);
							return;
						}

						if (text != null) {
							await handleClipboardText(
								text,
								destPath,
								onImportExternalFiles,
								onCreateMarkdown
							);
						}
					} catch {
						try {
							// read() failed, try readText
							const text = await navigator.clipboard.readText();

							if (text) {
								await handleClipboardText(
									text,
									destPath,
									onImportExternalFiles,
									onCreateMarkdown
								);
							}
						} catch {
							// Clipboard API unavailable
						}
					}
				})();
			} else if (e.key === 'Delete' && (node || selectedPaths.size > 1)) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				if (selectedPaths.size > 1) {
					const nodes: ExplorerNode[] = [];
					for (const path of selectedPaths) {
						const n = mergedRoot ? findNodeByPath(mergedRoot, path) : null;
						if (n) nodes.push(n);
					}
					if (nodes.length > 0) {
						setPendingAction({ nodes, type: 'batchDelete' });
					}
				} else if (node) {
					setPendingAction({ node, type: 'delete' });
				}
			} else if (e.key === 'F2' && node) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				setPendingAction({ node, type: 'rename' });
			} else if (mod && e.key === 'a') {
				// Ctrl+A: Select all visible items at the current scope
				e.preventDefault();
				if (!mergedRoot) return;

				const anchorPath = selectedPath ?? mergedRoot.path;
				const scopePath = getParentPath(anchorPath) ?? anchorPath;

				const siblingPaths = flatItems
					.filter(
						(item) =>
							item.type === 'node' &&
							getParentPath(item.node.path) === scopePath
					)
					.map(
						(item) => (item as { type: 'node'; node: ExplorerNode }).node.path
					);

				setSelectedPaths(new Set(siblingPaths));
			} else if (e.key === 'Escape' && selectedPaths.size > 1) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				setSelectedPaths(new Set());
			} else if (e.key === 'Escape' && clipboard) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				onClearClipboard();
				showSuccessToast(t('explorerPanel.clearClipboard'));
			}
		}
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [
		clipboard,
		flatItems,
		mergedRoot,
		onClearClipboard,
		onCopyNode,
		onCutNode,
		onPasteNode,
		pendingAction,
		selectedPath,
		selectedPaths,
	]);

	// ── Tauri native drag-drop event (provides real file paths) ──────
	useEffect(() => {
		if (!root || !onImportExternalFiles) return;

		let unlistenDragDrop: (() => void) | null = null;

		void getCurrentWebview()
			.onDragDropEvent((event) => {
				const { type } = event.payload;

				if (type === 'over' || type === 'enter') {
					setIsDragOver(true);
				} else if (type === 'leave') {
					setIsDragOver(false);
				} else if (type === 'drop') {
					setIsDragOver(false);

					const sourcePaths = event.payload.paths;

					if (sourcePaths.length === 0) return;

					// Determine target directory
					const destNode =
						hoveredNodeRef.current ??
						(selectedPath && mergedRoot
							? findNodeByPath(mergedRoot, selectedPath)
							: null);
					const destPath =
						destNode?.kind === 'directory'
							? destNode.path
							: destNode
								? getParentPath(destNode.path)
								: root.path;

					void onImportExternalFiles(sourcePaths, destPath);
				}
			})
			.then((unlisten) => {
				unlistenDragDrop = unlisten;
			});

		return () => {
			setIsDragOver(false);
			unlistenDragDrop?.();
		};
	}, [mergedRoot, onImportExternalFiles, root, selectedPath]);

	// Fallback paste event listener
	useEffect(() => {
		function onPaste(e: ClipboardEvent) {
			// Only handle paste when the event target is inside the sidebar
			if (!sidebarRef.current?.contains(e.target as Node)) return;

			const target = e.target as HTMLElement | null;
			const tag = target?.tagName ?? '';

			if (tag === 'INPUT' || tag === 'TEXTAREA') return;

			if (clipboard || !root || (!onImportExternalFiles && !onCreateMarkdown))
				return;

			const data = e.clipboardData;

			if (!data) return;

			const filePaths: string[] = [];

			// 1. clipboardData.files (Tauri webview extension)
			for (let i = 0; i < data.files.length; i++) {
				const file = data.files[i];
				const path = (file as unknown as { path?: string }).path;

				if (path) filePaths.push(path);
			}

			// 2. text/uri-list for file:// URLs
			if (filePaths.length === 0) {
				const uriList = data.getData('text/uri-list');

				if (uriList) {
					for (const uri of uriList.split('\n')) {
						const trimmed = uri.trim();

						if (trimmed.startsWith('file://')) {
							filePaths.push(decodeURI(trimmed.slice(7)));
						}
					}
				}
			}

			// 3. text/plain — file path or new file name
			const text = data.getData('text/plain');

			if (text && text.trim().length > 0 && !text.includes('\n')) {
				// Could be a file path — try to import
				const maybePath = text.trim();

				if (filePaths.length === 0 && maybePath.length > 10) {
					filePaths.push(maybePath);
				}
			}

			const destNode =
				hoveredNodeRef.current ??
				(selectedPath && mergedRoot
					? findNodeByPath(mergedRoot, selectedPath)
					: null);
			const destPath =
				destNode?.kind === 'directory'
					? destNode.path
					: destNode
						? getParentPath(destNode.path)
						: (root?.path ?? null);

			if (filePaths.length > 0 && onImportExternalFiles) {
				e.preventDefault();
				void onImportExternalFiles(filePaths, destPath);
				return;
			}

			// 4. Short text — use as file name
			if (
				text &&
				onCreateMarkdown &&
				text.trim().length > 0 &&
				text.trim().length < 200 &&
				!text.includes('\n')
			) {
				e.preventDefault();
				void onCreateMarkdown(text.trim(), destPath);
			}
		}

		document.addEventListener('paste', onPaste);
		return () => document.removeEventListener('paste', onPaste);
	}, [
		clipboard,
		mergedRoot,
		onCreateMarkdown,
		onImportExternalFiles,
		root,
		selectedPath,
	]);

	const canPasteToRoot = useMemo(
		() => Boolean(root && clipboard),
		[clipboard, root]
	);

	const handleContextAction = useCallback(
		async (
			action:
				| 'createMarkdown'
				| 'createDirectory'
				| 'copy'
				| 'cut'
				| 'delete'
				| 'rename'
				| 'paste'
				| 'restoreDeleted',
			node: ExplorerNode | null
		) => {
			if (
				!node &&
				action !== 'createMarkdown' &&
				action !== 'createDirectory' &&
				action !== 'paste'
			) {
				return;
			}

			if (action === 'createMarkdown') {
				setPendingAction({
					targetPath: node?.path ?? null,
					type: 'createMarkdown',
				});
				return;
			}

			if (action === 'createDirectory') {
				setPendingAction({
					node: node?.kind === 'directory' ? node : null,
					targetPath: node?.kind === 'directory' ? node.path : null,
					type: 'createDirectory',
				});
				return;
			}

			if (action === 'copy' && node) {
				onCopyNode(node);
				return;
			}

			if (action === 'cut' && node) {
				onCutNode(node);
				return;
			}

			if (action === 'rename' && node) {
				setPendingAction({ node, type: 'rename' });
				return;
			}

			if (action === 'delete' && node) {
				setPendingAction({ node, type: 'delete' });
				return;
			}

			if (action === 'restoreDeleted' && node) {
				setPendingAction({ node, type: 'restoreDeleted' });
				return;
			}

			try {
				await onPasteNode(node?.path ?? null);
			} catch (error) {
				void error;
			}
		},
		[setPendingAction, onCopyNode, onCutNode, onPasteNode]
	);

	const toggleSort = () => {
		onSortToggle();
	};

	const handleExpandCollapseToggle = () => {
		if (!mergedRoot) return;

		const allDirPaths = collectAllDirectoryPaths(mergedRoot);
		const isAllExpanded = allDirPaths.every((p) =>
			resolvedExpandedPaths.has(p)
		);

		if (isAllExpanded) {
			ctx.setExpansionState(
				new Set([mergedRoot.path]),
				new Set(allDirPaths.filter((p) => p !== mergedRoot.path)),
				ctx.expansionRootPath
			);
		} else {
			ctx.setExpansionState(new Set(allDirPaths), new Set(), expansionRootPath);
		}
	};

	const showCurrentFileInTree = () => {
		if (!selectedPath || !mergedRoot) return;

		// Check if the file is already visible in the tree
		const alreadyVisible = flatItems.some(
			(item) => item.type === 'node' && item.node.path === selectedPath
		);

		if (alreadyVisible) {
			const idx = flatItems.findIndex(
				(item) => item.type === 'node' && item.node.path === selectedPath
			);

			if (idx >= 0) {
				virtualizer.scrollToIndex(idx, { align: 'center' });
			}

			return;
		}

		// Expand all ancestor directories so the file appears in flatItems
		const ancestors = collectAncestorPaths(mergedRoot, selectedPath);

		const isCurrentRoot = expansionRootPath === ctx.expansionRootPath;
		const nextExpanded = new Set(isCurrentRoot ? ctx.expandedPaths : []);
		const nextCollapsed = new Set(isCurrentRoot ? ctx.collapsedPaths : []);

		for (const ancestor of ancestors) {
			nextExpanded.add(ancestor);
			nextCollapsed.delete(ancestor);
		}

		ctx.setExpansionState(nextExpanded, nextCollapsed, expansionRootPath);

		// Scroll after re-render when flatItems includes the file
		setPendingScrollToPath(selectedPath);
	};

	const toggleBookmark = (path: string) => {
		setBookmarkPaths((prev) => {
			const next = prev.includes(path)
				? prev.filter((p) => p !== path)
				: [...prev, path];

			try {
				window.localStorage.setItem('madora-bookmarks', JSON.stringify(next));
			} catch {
				// localStorage may be full or unavailable
			}

			return next;
		});
	};

	const isBookmarked = (path: string) => bookmarkPaths.includes(path);

	const handleBookmarkClick = (path: string) => {
		if (!mergedRoot) return;

		const node = findNodeByPath(mergedRoot, path);

		if (node) {
			onSelectNode(node);
		}
	};

	const handleHoverNode = useCallback((node: ExplorerNode | null) => {
		hoveredNodeRef.current = node;
	}, []);

	const handleContextActionStable = useCallback(
		(
			action:
				| 'createMarkdown'
				| 'createDirectory'
				| 'copy'
				| 'cut'
				| 'delete'
				| 'rename'
				| 'paste'
				| 'restoreDeleted',
			node: ExplorerNode | null
		) => {
			void handleContextAction(action, node);
		},
		[handleContextAction]
	);

	return (
		<>
			<aside
				ref={sidebarRef}
				className="flex min-w-0 flex-1 flex-col bg-sidebar
					text-sidebar-foreground"
			>
				<div className="border-b border-sidebar-border">
					<div
						className={`flex items-center justify-between gap-3 px-4
							${explorerTopSectionHeightClassName}`}
					>
						<div className="min-w-0">
							<Tooltip>
								<TooltipTrigger
									className="block truncate text-xs text-muted-foreground
										text-left leading-normal"
									render={<span />}
								>
									{root ? root.path : t('explorerPanel.startBrowsing')}
								</TooltipTrigger>
								{root && (
									<TooltipContent side="bottom">{root.path}</TooltipContent>
								)}
							</Tooltip>
						</div>
						<Button
							loading={busy}
							onClick={onOpenFolder}
							size="sm"
							variant="outline"
						>
							<Folder className="size-4" />
						</Button>
					</div>
					<div
						className="flex items-center justify-center gap-1 border-t
							border-sidebar-border px-2 py-1.5"
					>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={t('explorerPanel.newFolder')}
									disabled={
										!root || busy || createBusy || operationBusy !== null
									}
									onClick={() =>
										setPendingAction({
											node: createTargetNode,
											targetPath: selectedPath,
											type: 'createDirectory',
										})
									}
									size="icon-sm"
									variant="ghost"
								>
									<FolderPlus className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{t('explorerPanel.newFolder')}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={t('explorerPanel.newDocument')}
									disabled={
										!root || busy || createBusy || operationBusy !== null
									}
									onClick={() =>
										setPendingAction({
											targetPath: selectedPath,
											type: 'createMarkdown',
										})
									}
									size="icon-sm"
									variant="ghost"
								>
									<FilePlus className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{t('explorerPanel.newDocument')}
							</TooltipContent>
						</Tooltip>

						<div className="mx-1 h-4 w-px shrink-0 bg-border" />

						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={t('explorerPanel.sortToggle')}
									onClick={toggleSort}
									size="icon-sm"
									variant={sortEnabled ? 'default' : 'ghost'}
								>
									<ArrowUpDown className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{sortEnabled
									? t('explorerPanel.sorted')
									: t('explorerPanel.unsorted')}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={t('explorerPanel.toggleExpand')}
									onClick={handleExpandCollapseToggle}
									size="icon-sm"
									variant="ghost"
								>
									<ListCollapse className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{t('explorerPanel.toggleExpand')}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={t('explorerPanel.showInTree')}
									disabled={!selectedPath}
									onClick={showCurrentFileInTree}
									size="icon-sm"
									variant="ghost"
								>
									<FileUp className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{t('explorerPanel.showInTree')}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={
										selectedPath && isBookmarked(selectedPath)
											? t('explorerPanel.removeBookmark')
											: t('explorerPanel.addBookmark')
									}
									disabled={!selectedPath}
									onClick={() => {
										if (selectedPath) {
											toggleBookmark(selectedPath);
										}
									}}
									size="icon-sm"
									variant={
										selectedPath && isBookmarked(selectedPath)
											? 'secondary'
											: 'ghost'
									}
								>
									<Bookmark
										className={`size-4 ${
											selectedPath && isBookmarked(selectedPath)
												? 'fill-current'
												: ''
											}`}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{selectedPath && isBookmarked(selectedPath)
									? t('explorerPanel.removeBookmark')
									: t('explorerPanel.addBookmark')}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={t('explorerPanel.refreshTree')}
									disabled={!root || busy || operationBusy !== null}
									onClick={onRefresh}
									size="icon-sm"
									variant="ghost"
								>
									<RotateCcw className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{t('explorerPanel.refreshTree')}
							</TooltipContent>
						</Tooltip>
					</div>

					{visibleBookmarks.length > 0 && (
						<div className="border-t border-sidebar-border px-2 py-1">
							<button
								className="flex w-full items-center gap-1.5 rounded px-1 py-1
									text-xs text-muted-foreground hover:bg-sidebar-accent"
								onClick={() => setBookmarksExpanded((prev) => !prev)}
								type="button"
							>
								<Bookmark className="size-3.5 shrink-0" />
								<span className="font-medium">
									{t('explorerPanel.bookmarks')}
								</span>
								<ChevronRight
									className={`size-3 transition-transform ${
										bookmarksExpanded ? 'rotate-90' : ''
									}`}
								/>
								<span className="ml-auto text-xs">
									{visibleBookmarks.length}
								</span>
							</button>

							{bookmarksExpanded && (
								<div className="mt-0.5 space-y-0.5">
									{visibleBookmarks.map((path) => {
										const name = getPathName(path);
										const isActive = selectedPath === path;

										return (
											<div
												key={path}
												className={`group flex cursor-pointer items-center gap-2
												rounded px-2 py-1 text-xs hover:bg-sidebar-accent
												${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`}
												onClick={() => handleBookmarkClick(path)}
												role="button"
												tabIndex={0}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														handleBookmarkClick(path);
													}
												}}
											>
												<span className="truncate">{name}</span>

												<button
													aria-label={t(
														'explorerPanel.deleteBookmarkWithName',
														{ name }
													)}
													className="ml-auto shrink-0 rounded p-0.5 opacity-0
														transition-opacity hover:bg-sidebar-accent/50
														group-hover:opacity-100"
													onClick={(e) => {
														e.stopPropagation();
														toggleBookmark(path);
													}}
													type="button"
												>
													<BookmarkX className="size-3.5" />
												</button>
											</div>
										);
									})}
								</div>
							)}
						</div>
					)}
				</div>

				<ContextMenuRoot>
					<ContextMenuTrigger className="min-h-0 flex flex-1">
						<div
							ref={viewportRef}
							className={`overflow-auto size-full min-h-0 px-2 transition-colors
								${isDragOver ? 'bg-sidebar-accent/40 ring-2 ring-primary/40 ring-inset' : ''}`}
							data-os-scroll
							data-native-dialog-scroll-lock
							onClick={(e) => {
								// Only clear multi-select when clicking the viewport itself
								// (not when a tree node button inside it was clicked)
								if (e.target === e.currentTarget) {
									setSelectedPaths(new Set());
								}
							}}
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
							onDrop={handleDrop}
						>
							{mergedRoot ? (
								<div
									style={{
										height: `${virtualizer.getTotalSize()}px`,
										position: 'relative',
									}}
								>
									{virtualizer.getVirtualItems().map((virtualItem) => {
										const item = flatItems[virtualItem.index];
										return (
											<div
												key={virtualItem.key}
												data-index={virtualItem.index}
												ref={virtualizer.measureElement}
												style={{
													position: 'absolute',
													top: 0,
													left: 0,
													width: '100%',
													transform: `translateY(${virtualItem.start}px)`,
												}}
											>
												{item.type === 'loading' ? (
													<div className="relative px-2 py-1.5">
														{/* Guide lines for ancestor depths */}
														{Array.from({ length: item.depth }, (_, i) => (
															<div
																key={`gl-${i}`}
																className="absolute top-0 w-px bg-border/60
																	pointer-events-none z-0"
																style={{
																	left: `${i * 14 + 18}px`,
																	height: '100%',
																}}
															/>
														))}
														<div
															className="relative z-10"
															style={{
																paddingLeft: `${item.depth * 14 + 44}px`,
															}}
														>
															<div className="space-y-2 py-1">
																<Skeleton className="h-4 w-40" />
																<Skeleton className="h-4 w-32" />
																<Skeleton className="h-4 w-36" />
															</div>
														</div>
													</div>
												) : item.type === 'empty' ? (
													<div className="relative rounded-md px-2 py-3">
														{/* Guide lines for ancestor depths */}
														{Array.from({ length: item.depth }, (_, i) => (
															<div
																key={`ge-${i}`}
																className="absolute top-0 w-px bg-border/60
																	pointer-events-none z-0"
																style={{
																	left: `${i * 14 + 18}px`,
																	height: '100%',
																}}
															/>
														))}
														<div
															className="text-muted-foreground text-xs relative
																z-10"
															style={{
																paddingLeft: `${item.depth * 14 + 44}px`,
															}}
														>
															{t('explorerPanel.noFilesFound')}
														</div>
													</div>
												) : (
													<FileTreeNode
														clipboard={clipboard}
														depth={item.depth}
														expandedPaths={resolvedExpandedPaths}
														gitStatusMap={effectiveGitStatusMap}
														showStatus={
															syncEnabled && !!gitStatus?.branch?.name
														}
														isMultiSelected={
															selectedPaths.has(item.node.path) &&
															selectedPaths.size > 1
														}
														loadingPaths={loadingPaths}
														node={item.node}
														onContextAction={handleContextActionStable}
														onExpandDirectory={onExpandDirectory}
														onHoverNode={handleHoverNode}
														onSelectNode={handleSelectNode}
														selectedPath={selectedPath}
														toggleDirectory={toggleDirectory}
													/>
												)}
											</div>
										);
									})}
								</div>
							) : (
								<Empty className="px-4 py-10">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<Folder className="size-4" />
										</EmptyMedia>
										<EmptyTitle className="text-base">
											{t('explorerPanel.selectFolder')}
										</EmptyTitle>
										<EmptyDescription>
											{t('explorerPanel.selectFolderDescription')}
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							)}
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent
						clipboard={clipboard}
						onAction={(action) => {
							void handleContextAction(action, null);
						}}
						pasteDisabled={!canPasteToRoot}
						target={null}
					/>
				</ContextMenuRoot>

				{selectedPaths.size > 1 && (
					<div
						className={`flex items-center justify-between gap-2 border-t
						border-sidebar-border bg-sidebar px-3 py-2 text-xs
						${explorerBottomSectionHeightClassName}`}
					>
						<span className="shrink-0 text-muted-foreground">
							{t('explorerPanel.itemsSelected', { count: selectedPaths.size })}
						</span>
						<div className="flex items-center gap-1">
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={() => {
									for (const path of selectedPaths) {
										const fileNode = mergedRoot
											? findNodeByPath(mergedRoot, path)
											: null;
										if (fileNode) onCopyNode(fileNode);
									}
									showSuccessToast(
										t('explorerPanel.itemsCopied', {
											count: selectedPaths.size,
										})
									);
								}}
							>
								<Copy className="size-3.5" />
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={() => {
									for (const path of selectedPaths) {
										const fileNode = mergedRoot
											? findNodeByPath(mergedRoot, path)
											: null;
										if (fileNode) onCutNode(fileNode);
									}
									showSuccessToast(
										t('explorerPanel.itemsCut', { count: selectedPaths.size })
									);
								}}
							>
								<Scissors className="size-3.5" />
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={() => {
									const nodes: ExplorerNode[] = [];
									for (const path of selectedPaths) {
										const node = mergedRoot
											? findNodeByPath(mergedRoot, path)
											: null;
										if (node) nodes.push(node);
									}
									if (nodes.length > 0) {
										setPendingAction({ nodes, type: 'batchDelete' });
									}
								}}
							>
								<Trash2 className="size-3.5" />
							</Button>
							<div className="mx-1 h-4 w-px shrink-0 bg-border" />
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={() => setSelectedPaths(new Set())}
							>
								<X className="size-3.5" />
							</Button>
						</div>
					</div>
				)}

				<div className={explorerSidebarStatusBarClassName}>
					{!initialised ? (
						<div className="flex w-full items-center justify-center gap-1.5">
							<div
								className="size-3 animate-pulse rounded-full
									bg-muted-foreground/30"
							/>
							<div
								className="h-2.5 w-16 animate-pulse rounded
									bg-muted-foreground/20"
							/>
						</div>
					) : syncEnabled && syncMode === 'git' ? (
						<GitPanel
							busy={gitBusy}
							disabled={!root || busy || createBusy || operationBusy !== null}
							onRefresh={onGitRefresh}
							onRefreshWorkspace={onGitRefreshWorkspace}
							onStatusChange={onGitStatusChange}
							rootPath={root?.path ?? null}
							status={gitStatus}
						/>
					) : syncEnabled && syncMode === 'webdav' ? (
						<WebDavPanel
							disabled={!root || busy || createBusy || operationBusy !== null}
							workspaceRoot={root?.path ?? null}
						/>
					) : (
						<div
							className="flex w-full items-center justify-center gap-1.5
								text-muted-foreground"
						>
							<CloudOff className="size-3" />
							<span>{t('explorerPanel.syncNotEnabled')}</span>
						</div>
					)}
				</div>
			</aside>

			<RenameNodeDialog
				busy={operationBusy === 'rename'}
				node={pendingAction?.type === 'rename' ? pendingAction.node : null}
				onClose={() => setPendingAction(null)}
				onConfirm={async (newName) => {
					if (pendingAction?.type !== 'rename') {
						return;
					}

					await onRenameNode(pendingAction.node.path, newName);
				}}
			/>

			<CreateMarkdownDialog
				busy={createBusy}
				onOpenChange={(open) => {
					if (!open) {
						setPendingAction(null);
					}
				}}
				onCreateMarkdown={async (fileName) => {
					if (pendingAction?.type !== 'createMarkdown') {
						return;
					}

					await onCreateMarkdown(fileName, pendingAction.targetPath);
				}}
				open={pendingAction?.type === 'createMarkdown'}
			/>

			<CreateDirectoryDialog
				busy={createBusy}
				node={
					pendingAction?.type === 'createDirectory'
						? pendingAction.node
						: undefined
				}
				onClose={() => setPendingAction(null)}
				onConfirm={async (directoryName) => {
					if (pendingAction?.type !== 'createDirectory') {
						return;
					}

					const targetNode = pendingAction.node;

					if (targetNode) {
						const isCurrentRoot = expansionRootPath === ctx.expansionRootPath;
						const nextExpandedPaths = new Set(
							isCurrentRoot ? ctx.expandedPaths : []
						);
						const nextCollapsedPaths = new Set(
							isCurrentRoot ? ctx.collapsedPaths : []
						);

						nextExpandedPaths.add(targetNode.path);
						nextCollapsedPaths.delete(targetNode.path);

						ctx.setExpansionState(
							nextExpandedPaths,
							nextCollapsedPaths,
							expansionRootPath
						);
					}

					await onCreateDirectory(directoryName, pendingAction.targetPath);
				}}
			/>

			<DeleteNodeDialog
				busy={operationBusy === 'delete'}
				node={pendingAction?.type === 'delete' ? pendingAction.node : null}
				onClose={() => setPendingAction(null)}
				onConfirm={async () => {
					if (pendingAction?.type !== 'delete') {
						return;
					}

					await onDeleteNode(pendingAction.node.path);
					setPendingAction(null);
				}}
			/>

			<BatchDeleteNodeDialog
				busy={operationBusy === 'delete'}
				nodes={pendingAction?.type === 'batchDelete' ? pendingAction.nodes : []}
				onClose={() => setPendingAction(null)}
				onConfirm={async () => {
					if (pendingAction?.type !== 'batchDelete') {
						return;
					}

					for (const node of pendingAction.nodes) {
						try {
							await onDeleteNode(node.path);
						} catch {
							// Continue with remaining nodes
						}
					}
					setSelectedPaths(new Set());
					setPendingAction(null);
				}}
			/>

			<ExplorerDialogForm
				description={t('explorerPanel.confirmRestoreFromGit', {
					name:
						pendingAction?.type === 'restoreDeleted'
							? pendingAction.node.name
							: '',
				})}
				footer={
					<>
						<Button
							disabled={
								operationBusy === 'delete' ||
								operationBusy === 'move' ||
								operationBusy === 'rename'
							}
							onClick={() => setPendingAction(null)}
							variant="outline"
						>
							{t('common.actions.cancel')}
						</Button>
						<Button disabled={operationBusy !== null} type="submit">
							{t('explorerPanel.restore')}
						</Button>
					</>
				}
				onOpenChange={(open) => !open && setPendingAction(null)}
				onSubmit={(event) => {
					event.preventDefault();

					if (pendingAction?.type !== 'restoreDeleted') {
						return;
					}

					void onRestoreDeletedNode(pendingAction.node.path)
						.then(() => setPendingAction(null))
						.catch(() => {});
				}}
				open={pendingAction?.type === 'restoreDeleted'}
				title={t('explorerPanel.confirmRestoreTitle')}
			/>
		</>
	);
}
