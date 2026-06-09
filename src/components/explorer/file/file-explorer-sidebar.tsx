import {
	ArrowUpDown,
	Bookmark,
	BookmarkX,
	ChevronRight,
	Clipboard,
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
} from 'lucide-react';
import {
	type FormEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
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
import { useVirtualizer } from '@tanstack/react-virtual';

import { cn } from '@/lib/utils';

import type { GitStatus } from '../git/git-types';
import { GitPanel } from '../git/git-panel';
import {
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

type WorkspaceOperation = 'create' | 'rename' | 'delete' | 'move' | null;

type FileExplorerSidebarProps = {
	root: ExplorerNode | null;
	selectedPath: string | null;
	busy: boolean;
	createBusy: boolean;
	gitBusy: boolean;
	gitStatus: GitStatus | null;
	operationBusy: WorkspaceOperation;
	clipboard: {
		item: ExplorerClipboardItem;
		mode: 'copy' | 'cut';
	} | null;
	loadingPaths: Set<string>;
	onCreateMarkdown: (
		fileName: string,
		targetPath: string | null
	) => Promise<void>;
	onCreateDirectory: (
		directoryName: string,
		targetPath: string | null
	) => Promise<void>;
	onCopyNode: (node: ExplorerNode) => void;
	onCutNode: (node: ExplorerNode) => void;
	onDeleteNode: (targetPath: string) => Promise<void>;
	onRestoreDeletedNode: (targetPath: string) => Promise<void>;
	onOpenFolder: () => void;
	onPasteNode: (destinationPath: string | null) => Promise<void>;
	onImportExternalFiles?: (
		sourcePaths: string[],
		destinationPath: string | null
	) => Promise<void>;
	onRefresh: () => void;
	sortEnabled: boolean;
	onSortToggle: () => void;
	onGitRefresh: () => Promise<void>;
	onGitRefreshWorkspace: () => Promise<void>;
	onGitStatusChange: (status: GitStatus) => void;
	onRenameNode: (targetPath: string, newName: string) => Promise<void>;
	onExpandDirectory: (node: ExplorerNode) => void;
	onSelectNode: (node: ExplorerNode) => void;
	onClearClipboard: () => void;
};

type PendingAction =
	| { type: 'createMarkdown'; targetPath: string | null }
	| {
			type: 'createDirectory';
			node: ExplorerNode | null;
			targetPath: string | null;
	  }
	| { type: 'rename'; node: ExplorerNode }
	| { type: 'delete'; node: ExplorerNode }
	| { type: 'restoreDeleted'; node: ExplorerNode }
	| null;

type ExplorerExpansionState = {
	rootPath: string | null;
	expandedPaths: Set<string>;
	collapsedPaths: Set<string>;
};

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
	clipboard: FileExplorerSidebarProps['clipboard'];
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
	const canCreateDirectory = target === null || target.kind === 'directory';
	const canCreateDocument = canCreateDirectory;

	return (
		<ContextMenuPopup align="start" sideOffset={6}>
			{target && includeNodeActions ? (
				isDeletedGitEntry ? (
					<MenuItem onClick={() => onAction('restoreDeleted')}>
						<RotateCcw />
						恢复文件
					</MenuItem>
				) : (
					<>
						{canCreateDocument ? (
							<MenuItem onClick={() => onAction('createMarkdown')}>
								<FileText />
								新建文档
							</MenuItem>
						) : null}
						{canCreateDirectory ? (
							<MenuItem onClick={() => onAction('createDirectory')}>
								<FolderPlus />
								新建文件夹
							</MenuItem>
						) : null}
						<MenuItem onClick={() => onAction('rename')}>
							<FilePenLine />
							重命名
						</MenuItem>
						<MenuItem onClick={() => onAction('copy')}>
							<Copy />
							复制
						</MenuItem>
						<MenuItem onClick={() => onAction('cut')}>
							<Scissors />
							剪切
						</MenuItem>
						{clipboard ? (
							<MenuItem
								disabled={pasteDisabled}
								onClick={() => onAction('paste')}
							>
								<Clipboard />
								粘贴到此处
							</MenuItem>
						) : null}
						<MenuSeparator />
						<MenuItem onClick={() => onAction('delete')} variant="destructive">
							<Trash2 />
							删除
						</MenuItem>
					</>
				)
			) : (
				<>
					<MenuItem onClick={() => onAction('createMarkdown')}>
						<FileText />
						新建文档
					</MenuItem>
					<MenuItem onClick={() => onAction('createDirectory')}>
						<FolderPlus />
						新建文件夹
					</MenuItem>
					{clipboard ? (
						<MenuItem
							disabled={pasteDisabled}
							onClick={() => onAction('paste')}
						>
							<Clipboard />
							粘贴到当前目录
						</MenuItem>
					) : null}
				</>
			)}
			{clipboard ? (
				<div className="px-2 py-1.5 text-muted-foreground text-xs">
					{clipboard.mode === 'copy' ? '已复制' : '已剪切'}:{' '}
					{clipboard.item.name}
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
			showErrorToast('创建失败', '请输入文件名');
			return;
		}

		const lowerName = trimmedFileName.toLowerCase();
		if (
			lowerName.includes('.') &&
			!lowerName.endsWith('.md') &&
			!lowerName.endsWith('.mdx')
		) {
			showErrorToast('创建失败', '文件名只能以 .md 或 .mdx 结尾');
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
			description="默认创建在目标目录内；如果目标是文件，则创建在它的同级目录；如果没有目标节点，则创建到工作区根目录。"
			footer={
				<>
					<Button
						disabled={busy}
						onClick={() => handleOpenChange(false)}
						variant="outline"
					>
						取消
					</Button>
					<Button loading={busy} type="submit">
						创建
					</Button>
				</>
			}
			onOpenChange={handleOpenChange}
			onSubmit={handleSubmit}
			open={open}
			title="新建文档"
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
	const open = node !== undefined;

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);
		const trimmedDirectoryName = String(
			formData.get('directoryName') ?? ''
		).trim();

		if (!trimmedDirectoryName) {
			showErrorToast('创建失败', '请输入文件夹名称');
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
			description="默认创建在目标目录内；如果目标是文件，则创建在它的同级目录；如果没有目标节点，则创建到工作区根目录。"
			footer={
				<>
					<Button disabled={busy} onClick={onClose} variant="outline">
						取消
					</Button>
					<Button loading={busy} type="submit">
						创建
					</Button>
				</>
			}
			onOpenChange={(open) => !open && onClose()}
			onSubmit={handleSubmit}
			open={open}
			title="新建文件夹"
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
	const open = Boolean(node);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);
		const trimmedName = String(formData.get('name') ?? '').trim();

		if (!trimmedName) {
			showErrorToast('重命名失败', '请输入名称');
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
					? '输入新的文件夹名称。'
					: '输入新的文件名称。'
			}
			footer={
				<>
					<Button disabled={busy} onClick={onClose} variant="outline">
						取消
					</Button>
					<Button loading={busy} type="submit">
						保存
					</Button>
				</>
			}
			onOpenChange={(open) => !open && onClose()}
			onSubmit={handleSubmit}
			open={open}
			title="重命名"
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
	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void onConfirm().catch(() => {});
	};

	return (
		<ExplorerDialogForm
			description={
				node?.kind === 'directory'
					? `删除文件夹 “${node?.name ?? ''}” 以及其中的所有内容？`
					: `删除文件 “${node?.name ?? ''}”？`
			}
			footer={
				<>
					<Button disabled={busy} onClick={onClose} variant="outline">
						取消
					</Button>
					<Button type="submit" loading={busy} variant="destructive">
						删除
					</Button>
				</>
			}
			onOpenChange={(open) => !open && onClose()}
			onSubmit={handleSubmit}
			open={Boolean(node)}
			title="确认删除"
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

function FileTreeNode({
	clipboard,
	depth,
	expandedPaths,
	gitStatusMap,
	loadingPaths,
	node,
	onContextAction,
	onExpandDirectory,
	onHoverNode,
	onSelectNode,
	selectedPath,
	toggleDirectory,
}: {
	clipboard: FileExplorerSidebarProps['clipboard'];
	depth: number;
	expandedPaths: Set<string>;
	gitStatusMap: Map<string, GitFileEntry>;
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
	onSelectNode: (node: ExplorerNode) => void;
	selectedPath: string | null;
	toggleDirectory: (path: string) => void;
}) {
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	const chevronRef = useRef<SVGSVGElement>(null);
	const userToggledRef = useRef(false);
	const isDirectory = node.kind === 'directory';
	const isActuallySelected = selectedPath === node.path;
	const isSelected = isActuallySelected || contextMenuOpen;
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
	const gitState = isDirectory
		? getAggregatedDirectoryGitState(node, gitStatusMap)
		: (gitStatusMap.get(normalizeExplorerPath(node.path)) ?? null);
	const isDeletedGitEntry = !isDirectory && gitState?.status === 'deleted';

	if (isDirectory) {
		const isLoading = loadingPaths.has(node.path);

		return (
			<div
				className={cn(
					'py-0.5',
					isCopied && 'border-l-2 border-primary/40',
					isCut && 'border-l-2 border-destructive/40 opacity-50'
				)}
				onMouseEnter={() => onHoverNode(node)}
			>
				<ContextMenuRoot onOpenChange={setContextMenuOpen}>
					<ContextMenuTrigger>
						<div
							className="flex w-full items-center gap-1"
							style={{ paddingLeft: `${depth * 14 + 8}px` }}
						>
							<button
								aria-label={
									isExpanded ? `收起 ${node.name}` : `展开 ${node.name}`
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
								onClick={() => {
									userToggledRef.current = true;
									const nextExpanded = !isExpanded;
									toggleDirectory(node.path);
									onSelectNode(node);

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
				'py-0.5',
				isCopied && 'border-l-2 border-primary/40',
				isCut && 'border-l-2 border-destructive/40 opacity-50'
			)}
			onMouseEnter={() => onHoverNode(node)}
		>
			<ContextMenuRoot onOpenChange={setContextMenuOpen}>
				<ContextMenuTrigger>
					<button
						type="button"
						className={cn(
							`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left
							text-sm transition-colors`,
							isActuallySelected
								? 'bg-sidebar-primary text-sidebar-primary-foreground'
								: contextMenuOpen
									? 'bg-sidebar-accent text-sidebar-accent-foreground'
									: `text-sidebar-foreground hover:bg-sidebar-accent
										hover:text-sidebar-accent-foreground`
						)}
						onClick={() => void onSelectNode(node)}
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
}

export function FileExplorerSidebar({
	root,
	selectedPath,
	busy,
	createBusy,
	gitBusy,
	gitStatus,
	operationBusy,
	clipboard,
	loadingPaths,
	onCreateMarkdown,
	onCreateDirectory,
	onCopyNode,
	onCutNode,
	onDeleteNode,
	onRestoreDeletedNode,
	sortEnabled,
	onSortToggle,
	onOpenFolder,
	onRefresh,
	onPasteNode,
	onImportExternalFiles,
	onGitRefresh,
	onGitRefreshWorkspace,
	onGitStatusChange,
	onRenameNode,
	onExpandDirectory,
	onSelectNode,
	onClearClipboard,
}: FileExplorerSidebarProps) {
	const sidebarRef = useRef<HTMLElement>(null);
	const [expansionState, setExpansionState] = useState<ExplorerExpansionState>({
		collapsedPaths: new Set(),
		expandedPaths: new Set(),
		rootPath: null,
	});
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
				showErrorToast('无法读取拖放的文件路径');
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
	const gitStatusMap = useMemo(() => buildGitStatusMap(gitStatus), [gitStatus]);
	const mergedRoot = useMemo(
		() => (root ? mergeDeletedGitNodes(root, gitStatusMap) : null),
		[gitStatusMap, root]
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

		const isCurrentRoot = expansionState.rootPath === expansionRootPath;
		const collapsedPaths = isCurrentRoot
			? expansionState.collapsedPaths
			: new Set<string>();
		const nextPaths = new Set(
			isCurrentRoot ? expansionState.expandedPaths : []
		);

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
	}, [expansionRootPath, expansionState, mergedRoot, selectedPath]);

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

	const toggleDirectory = (path: string) => {
		const isExpanded = resolvedExpandedPaths.has(path);

		setExpansionState((currentState) => {
			const isCurrentRoot = currentState.rootPath === expansionRootPath;
			const nextExpandedPaths = new Set(
				isCurrentRoot ? currentState.expandedPaths : []
			);
			const nextCollapsedPaths = new Set(
				isCurrentRoot ? currentState.collapsedPaths : []
			);

			if (isExpanded) {
				nextExpandedPaths.delete(path);
				nextCollapsedPaths.add(path);
			} else {
				nextExpandedPaths.add(path);
				nextCollapsedPaths.delete(path);
			}

			return {
				collapsedPaths: nextCollapsedPaths,
				expandedPaths: nextExpandedPaths,
				rootPath: expansionRootPath,
			};
		});
	};

	const hoveredNodeRef = useRef<ExplorerNode | null>(null);
	const viewportRef = useRef<HTMLDivElement>(null);

	const flatItems = useMemo(() => {
		if (!mergedRoot) return [];
		return flattenTree(mergedRoot, resolvedExpandedPaths, sortEnabled);
	}, [mergedRoot, resolvedExpandedPaths, sortEnabled]);

	const virtualizer = useVirtualizer({
		count: flatItems.length,
		getItemKey: (index) => {
			const item = flatItems[index];
			return item ? getFlatItemKey(item, index) : index;
		},
		getScrollElement: () => {
			const el = viewportRef.current;
			if (!el) return null;
			const osRoot = el.closest('[data-overlayscrollbars]');
			if (osRoot) {
				return (osRoot.querySelector('[data-overlayscrollbars-viewport]') ??
					el) as HTMLElement;
			}
			return el;
		},
		estimateSize: () => 36,
		overscan: 20,
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
			showSuccessToast(`已创建文件 "${trimmed}"`);
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
				showSuccessToast(`已复制 "${node.name}"`);
			} else if (mod && e.key === 'x' && node) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				onCutNode(node);
				showSuccessToast(`已剪切 "${node.name}"`);
			} else if (mod && e.key === 'v' && clipboard) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				void onPasteNode(node?.path ?? null);
				showSuccessToast(`已粘贴 "${clipboard.item.name}"`);
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
			} else if (e.key === 'Delete' && node) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				setPendingAction({ node, type: 'delete' });
			} else if (e.key === 'F2' && node) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				setPendingAction({ node, type: 'rename' });
			} else if (e.key === 'Escape' && clipboard) {
				if ((e.target as HTMLElement).isContentEditable) return;
				e.preventDefault();
				onClearClipboard();
				showSuccessToast('已取消剪贴板操作');
			}
		}
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [
		clipboard,
		mergedRoot,
		onClearClipboard,
		onCopyNode,
		onCutNode,
		onPasteNode,
		pendingAction,
		selectedPath,
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

				if (
					filePaths.length === 0 &&
					onImportExternalFiles &&
					maybePath.length > 10
				) {
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

	const handleContextAction = async (
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
	};

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
			setExpansionState((currentState) => ({
				collapsedPaths: new Set(
					allDirPaths.filter((p) => p !== mergedRoot.path)
				),
				expandedPaths: new Set([mergedRoot.path]),
				rootPath: currentState.rootPath,
			}));
		} else {
			setExpansionState(() => ({
				collapsedPaths: new Set(),
				expandedPaths: new Set(allDirPaths),
				rootPath: expansionRootPath,
			}));
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

		setExpansionState((currentState) => {
			const isCurrentRoot = currentState.rootPath === expansionRootPath;
			const nextExpanded = new Set(
				isCurrentRoot ? currentState.expandedPaths : []
			);
			const nextCollapsed = new Set(
				isCurrentRoot ? currentState.collapsedPaths : []
			);

			for (const ancestor of ancestors) {
				nextExpanded.add(ancestor);
				nextCollapsed.delete(ancestor);
			}

			return {
				collapsedPaths: nextCollapsed,
				expandedPaths: nextExpanded,
				rootPath: expansionRootPath,
			};
		});

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
									{root ? root.path : '选择一个文件夹开始浏览'}
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
									aria-label="新建文件夹"
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
							<TooltipContent side="bottom">新建文件夹</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label="新建文档"
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
							<TooltipContent side="bottom">新建文档</TooltipContent>
						</Tooltip>

						<div className="mx-1 h-4 w-px shrink-0 bg-border" />

						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label="排序切换"
									onClick={toggleSort}
									size="icon-sm"
									variant={sortEnabled ? 'default' : 'ghost'}
								>
									<ArrowUpDown className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{sortEnabled ? '排序中' : '未排序'}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label="全部展开或折叠"
									onClick={handleExpandCollapseToggle}
									size="icon-sm"
									variant="ghost"
								>
									<ListCollapse className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">全部展开或折叠</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label="在树中显示当前文件"
									disabled={!selectedPath}
									onClick={showCurrentFileInTree}
									size="icon-sm"
									variant="ghost"
								>
									<FileUp className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">在树中显示当前文件</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label={
										selectedPath && isBookmarked(selectedPath)
											? '取消书签'
											: '添加书签'
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
									? '取消书签'
									: '添加书签'}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger render={<span />}>
								<Button
									aria-label="刷新文件树"
									disabled={!root || busy || operationBusy !== null}
									onClick={onRefresh}
									size="icon-sm"
									variant="ghost"
								>
									<RotateCcw className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">刷新文件树</TooltipContent>
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
								<span className="font-medium">书签</span>
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
													aria-label={`删除书签 ${name}`}
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
													<div
														className="px-2 py-1.5"
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
												) : item.type === 'empty' ? (
													<div
														className="rounded-md px-2 py-3
															text-muted-foreground text-xs"
														style={{
															paddingLeft: `${item.depth * 14 + 44}px`,
														}}
													>
														未找到文件
													</div>
												) : (
													<FileTreeNode
														clipboard={clipboard}
														depth={item.depth}
														expandedPaths={resolvedExpandedPaths}
														gitStatusMap={gitStatusMap}
														loadingPaths={loadingPaths}
														node={item.node}
														onContextAction={(action, node) => {
															void handleContextAction(action, node);
														}}
														onExpandDirectory={onExpandDirectory}
														onHoverNode={(node) =>
															(hoveredNodeRef.current = node)
														}
														onSelectNode={onSelectNode}
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
											打开一个本地文件夹
										</EmptyTitle>
										<EmptyDescription>
											左侧导航会按目录结构展示可预览文件。
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

				<div className={explorerSidebarStatusBarClassName}>
					<GitPanel
						busy={gitBusy}
						disabled={!root || busy || createBusy || operationBusy !== null}
						onRefresh={onGitRefresh}
						onRefreshWorkspace={onGitRefreshWorkspace}
						onStatusChange={onGitStatusChange}
						rootPath={root?.path ?? null}
						status={gitStatus}
					/>
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
						setExpansionState((currentState) => {
							const isCurrentRoot = currentState.rootPath === expansionRootPath;
							const nextExpandedPaths = new Set(
								isCurrentRoot ? currentState.expandedPaths : []
							);
							const nextCollapsedPaths = new Set(
								isCurrentRoot ? currentState.collapsedPaths : []
							);

							nextExpandedPaths.add(targetNode.path);
							nextCollapsedPaths.delete(targetNode.path);

							return {
								collapsedPaths: nextCollapsedPaths,
								expandedPaths: nextExpandedPaths,
								rootPath: expansionRootPath,
							};
						});
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

			<ExplorerDialogForm
				description={
					<>
						确认从 Git 恢复文件 “
						{pendingAction?.type === 'restoreDeleted'
							? pendingAction.node.name
							: ''}
						”？
					</>
				}
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
							取消
						</Button>
						<Button disabled={operationBusy !== null} type="submit">
							恢复
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
				title="恢复已删除文件"
			/>
		</>
	);
}
