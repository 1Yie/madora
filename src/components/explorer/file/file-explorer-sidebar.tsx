import {
  ChevronRight,
  Clipboard,
  FileImage,
  FilePenLine,
  FileText,
  Folder,
  FolderPlus,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenuPopup,
  ContextMenuRoot,
  ContextMenuTrigger,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  NativeDialog,
  NativeDialogClose,
  NativeDialogDescription,
  NativeDialogFooter,
  NativeDialogHeader,
  NativeDialogPanel,
  NativeDialogTitle,
} from "@/components/ui/native-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { showErrorToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import type { GitStatus } from "../git/git-types";
import { GitPanel } from "../git/git-panel";
import {
  explorerSidebarStatusBarClassName,
  explorerTopSectionHeightClassName,
} from "../layout";
import {
  getParentPath,
  getPathName,
  isSameOrDescendantPath,
  joinExplorerPath,
  normalizeExplorerPath,
} from "../../../lib/path-utils";
import type { ExplorerClipboardItem, ExplorerNode } from "../types";

type WorkspaceOperation = "create" | "rename" | "delete" | "move" | null;

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
    mode: "cut";
  } | null;
  loadingPaths: Set<string>;
  onCreateMarkdown: (fileName: string, targetPath: string | null) => Promise<void>;
  onCreateDirectory: (directoryName: string, targetPath: string | null) => Promise<void>;
  onCutNode: (node: ExplorerNode) => void;
  onDeleteNode: (targetPath: string) => Promise<void>;
  onRestoreDeletedNode: (targetPath: string) => Promise<void>;
  onOpenFolder: () => void;
  onPasteNode: (destinationPath: string | null) => Promise<void>;
  onRefresh: () => void;
  onGitRefresh: () => Promise<void>;
  onGitRefreshWorkspace: () => Promise<void>;
  onGitStatusChange: (status: GitStatus) => void;
  onRenameNode: (targetPath: string, newName: string) => Promise<void>;
  onExpandDirectory: (node: ExplorerNode) => void;
  onSelectNode: (node: ExplorerNode) => void;
};

type PendingAction =
  | { type: "createMarkdown"; targetPath: string | null }
  | { type: "createDirectory"; node: ExplorerNode | null; targetPath: string | null }
  | { type: "rename"; node: ExplorerNode }
  | { type: "delete"; node: ExplorerNode }
  | { type: "restoreDeleted"; node: ExplorerNode }
  | null;

type GitFileEntry = NonNullable<GitStatus["files"]>[number];

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
    case "modified":
      return file.staged && !file.unstaged ? "S" : "M";
    case "untracked":
      return "N";
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "conflicted":
      return "!";
    case "renamed":
      return "R";
    case "typechange":
      return "T";
    default:
      return "";
  }
}

function getGitBadgeClassName(file: GitFileEntry): string {
  const baseClassName = "min-w-[1ch] text-center";

  switch (file.status) {
    case "conflicted":
      return `${baseClassName} text-destructive`;
    case "modified":
      // Show modified files as warning (yellow) when not staged, similar to VS Code.
      if (file.staged && file.unstaged) {
        return `${baseClassName} text-warning`;
      }

      return file.staged ? `${baseClassName} text-success` : `${baseClassName} text-warning`;
    case "untracked":
    case "added":
      return `${baseClassName} text-success`;
    case "deleted":
      return `${baseClassName} text-destructive`;
    case "renamed":
    case "typechange":
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
      return left.kind === "directory" ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

function buildGitStatusMap(status: GitStatus | null): Map<string, GitFileEntry> {
  const nextMap = new Map<string, GitFileEntry>();

  for (const file of status?.files ?? []) {
    nextMap.set(normalizeExplorerPath(file.path), file);
  }

  return nextMap;
}

function getAggregatedDirectoryGitState(
  node: ExplorerNode,
  gitStatusMap: Map<string, GitFileEntry>,
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

function buildSyntheticDeletedNode(rootPath: string, deletedPath: string): ExplorerNode {
  const fileName = getPathName(deletedPath);
  const normalizedRootPath = normalizeExplorerPath(rootPath);
  const normalizedDeletedPath = normalizeExplorerPath(deletedPath);

  return {
    children: [],
    fileKind: null,
    hasChildren: false,
    isMissing: true,
    kind: "file",
    loaded: true,
    name: fileName,
    path: deletedPath,
    relativePath:
      normalizedDeletedPath === normalizedRootPath
        ? ""
        : normalizedDeletedPath.slice(normalizedRootPath.length + 1),
  };
}

function buildSyntheticDeletedDirectoryNode(rootPath: string, directoryPath: string): ExplorerNode {
  const fileName = getPathName(directoryPath);
  const normalizedRootPath = normalizeExplorerPath(rootPath);
  const normalizedDirectoryPath = normalizeExplorerPath(directoryPath);

  return {
    children: [],
    fileKind: null,
    hasChildren: false,
    isMissing: true,
    kind: "directory",
    loaded: true,
    name: fileName,
    path: directoryPath,
    relativePath:
      normalizedDirectoryPath === normalizedRootPath
        ? ""
        : normalizedDirectoryPath.slice(normalizedRootPath.length + 1),
  };
}

function mergeDeletedGitNodes(root: ExplorerNode, gitStatusMap: Map<string, GitFileEntry>): ExplorerNode {
  const deletedEntries = [...gitStatusMap.entries()].filter(([, file]) => file.status === "deleted");

  if (deletedEntries.length === 0) {
    return root;
  }

  const insertDeletedPath = (node: ExplorerNode, deletedPath: string): ExplorerNode => {
    if (node.kind === "file" || !isSameOrDescendantPath(deletedPath, node.path)) {
      return node;
    }

    const normalizedNodePath = normalizeExplorerPath(node.path);
    const normalizedDeletedPath = normalizeExplorerPath(deletedPath);

    if (normalizedNodePath === normalizedDeletedPath) {
      return node;
    }

    const relativeSegments = normalizedDeletedPath
      .slice(normalizedNodePath.length + 1)
      .split("/")
      .filter(Boolean);

    if (relativeSegments.length === 0) {
      return node;
    }

    const [nextSegment, ...remainingSegments] = relativeSegments;
    const childPath = joinExplorerPath(node.path, nextSegment);
    const normalizedChildPath = normalizeExplorerPath(childPath);
    const nextChildren = [...node.children];
    const existingChildIndex = nextChildren.findIndex(
      (child) => normalizeExplorerPath(child.path) === normalizedChildPath,
    );

    if (remainingSegments.length === 0) {
      if (existingChildIndex === -1) {
        nextChildren.push(buildSyntheticDeletedNode(root.path, deletedPath));
      }

      return {
        ...node,
        children: sortExplorerChildren(nextChildren),
        hasChildren: nextChildren.length > 0,
      };
    }

    const currentChild =
      existingChildIndex >= 0
        ? nextChildren[existingChildIndex]
        : buildSyntheticDeletedDirectoryNode(root.path, childPath);

    if (currentChild.kind === "file") {
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
      children: sortExplorerChildren(nextChildren),
      hasChildren: nextChildren.length > 0,
    };
  };

  return deletedEntries.reduce(
    (nextRoot, [filePath]) => insertDeletedPath(nextRoot, filePath),
    root,
  );
}

function collectAncestorPaths(root: ExplorerNode, targetPath: string): string[] {
  const ancestors: string[] = [];

  function walk(node: ExplorerNode, lineage: string[]) {
    if (node.path === targetPath) {
      ancestors.push(...lineage);
      return true;
    }

    for (const child of node.children) {
      if (walk(child, node.kind === "directory" ? [...lineage, node.path] : lineage)) {
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

    if (child.kind === "directory") {
      const match = findNodeByPath(child, path);

      if (match) {
        return match;
      }
    }
  }

  return null;
}

function resolveCreateTargetNode(root: ExplorerNode | null, selectedPath: string | null) {
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

  if (selectedNode.kind === "directory") {
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
  clipboard: FileExplorerSidebarProps["clipboard"];
  includeNodeActions?: boolean;
  isDeletedGitEntry?: boolean;
  onAction: (
    action:
      | "createMarkdown"
      | "createDirectory"
      | "cut"
      | "delete"
      | "rename"
      | "paste"
      | "restoreDeleted",
  ) => void;
  pasteDisabled: boolean;
  target: ExplorerNode | null;
}) {
  const canCreateDirectory = target === null || target.kind === "directory";

  return (
    <ContextMenuPopup align="start" sideOffset={6}>
      {target && includeNodeActions ? (
        isDeletedGitEntry ? (
          <MenuItem onClick={() => onAction("restoreDeleted")}>
            <RotateCcw />
            恢复文件
          </MenuItem>
        ) : (
          <>
            <MenuItem onClick={() => onAction("createMarkdown")}>
              <FileText />
              新建 Markdown 文档
            </MenuItem>
            {canCreateDirectory ? (
              <MenuItem onClick={() => onAction("createDirectory")}>
                <FolderPlus />
                新建文件夹
              </MenuItem>
            ) : null}
            <MenuItem onClick={() => onAction("rename")}>
              <FilePenLine />
              重命名
            </MenuItem>
            <MenuItem onClick={() => onAction("cut")}>
              <Scissors />
              剪切
            </MenuItem>
            <MenuItem disabled={pasteDisabled} onClick={() => onAction("paste")}>
              <Clipboard />
              粘贴到此处
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => onAction("delete")} variant="destructive">
              <Trash2 />
              删除
            </MenuItem>
          </>
        )
      ) : (
        <>
          <MenuItem onClick={() => onAction("createMarkdown")}>
            <FileText />
            新建 Markdown 文档
          </MenuItem>
          <MenuItem onClick={() => onAction("createDirectory")}>
            <FolderPlus />
            新建文件夹
          </MenuItem>
          <MenuItem disabled={pasteDisabled} onClick={() => onAction("paste")}>
            <Clipboard />
            粘贴到当前目录
          </MenuItem>
        </>
      )}
      {clipboard ? (
        <div className="px-2 py-1.5 text-muted-foreground text-xs">
          已剪切: {clipboard.item.name}
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
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setFileName("");
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
      showErrorToast("创建失败", "请输入文件名");
      return;
    }

    try {
      await onCreateMarkdown(trimmedFileName);
      handleOpenChange(false);
    } catch {}
  };

  return (
    <>
      <NativeDialog onOpenChange={handleOpenChange} open={open}>
        <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
          <NativeDialogClose
            className="absolute end-2 top-2"
            onClick={() => handleOpenChange(false)}
          />
          <NativeDialogHeader>
            <NativeDialogTitle>新建 Markdown 文档</NativeDialogTitle>
            <NativeDialogDescription>
              默认创建在目标目录内；如果目标是文件，则创建在它的同级目录；如果没有目标节点，则创建到工作区根目录。
            </NativeDialogDescription>
          </NativeDialogHeader>
          <NativeDialogPanel>
            <div className="space-y-3">
              <Input
                autoFocus
                nativeInput
                onChange={(event) => setFileName(event.target.value)}
                placeholder="untitled.md"
                value={fileName}
              />
            </div>
          </NativeDialogPanel>
          <NativeDialogFooter>
            <Button disabled={busy} onClick={() => handleOpenChange(false)} variant="outline">
              取消
            </Button>
            <Button loading={busy} type="submit">
              创建
            </Button>
          </NativeDialogFooter>
        </form>
      </NativeDialog>
    </>
  );
}

function CreateEntryMenu({
  busy,
  disabled,
  onCreateDirectory,
  onCreateMarkdown,
}: {
  busy: boolean;
  disabled: boolean;
  onCreateDirectory: () => void;
  onCreateMarkdown: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label="新建" size="icon-sm" variant="ghost" />}
        disabled={disabled}
      >
        <Plus className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={6}>
        <DropdownMenuItem disabled={busy} onClick={onCreateMarkdown}>
          <FileText />
          新建 Markdown 文档
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={onCreateDirectory}>
          <FolderPlus />
          新建文件夹
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [directoryName, setDirectoryName] = useState("");

  useEffect(() => {
    setDirectoryName("");
  }, [node]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedDirectoryName = directoryName.trim();

    if (!trimmedDirectoryName) {
      showErrorToast("创建失败", "请输入文件夹名称");
      return;
    }

    try {
      await onConfirm(trimmedDirectoryName);
      onClose();
    } catch {}
  };

  return (
    <NativeDialog onOpenChange={(open) => !open && onClose()} open={node !== undefined}>
      <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
        <NativeDialogClose className="absolute end-2 top-2" onClick={onClose} />
        <NativeDialogHeader>
          <NativeDialogTitle>新建文件夹</NativeDialogTitle>
          <NativeDialogDescription>
            默认创建在目标目录内；如果目标是文件，则创建在它的同级目录；如果没有目标节点，则创建到工作区根目录。
          </NativeDialogDescription>
        </NativeDialogHeader>
        <NativeDialogPanel>
          <div className="space-y-3">
            <Input
              autoFocus
              nativeInput
              onChange={(event) => setDirectoryName(event.target.value)}
              placeholder="new-folder"
              value={directoryName}
            />
          </div>
        </NativeDialogPanel>
        <NativeDialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            取消
          </Button>
          <Button loading={busy} type="submit">
            创建
          </Button>
        </NativeDialogFooter>
      </form>
    </NativeDialog>
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
  const [name, setName] = useState("");

  useEffect(() => {
    setName(node?.name ?? "");
  }, [node]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      showErrorToast("重命名失败", "请输入名称");
      return;
    }

    try {
      await onConfirm(trimmedName);
      onClose();
    } catch {}
  };

  return (
    <NativeDialog onOpenChange={(open) => !open && onClose()} open={Boolean(node)}>
      <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
        <NativeDialogClose className="absolute end-2 top-2" onClick={onClose} />
        <NativeDialogHeader>
          <NativeDialogTitle>重命名</NativeDialogTitle>
          <NativeDialogDescription>
            {node?.kind === "directory" ? "输入新的文件夹名称。" : "输入新的文件名称。"}
          </NativeDialogDescription>
        </NativeDialogHeader>
        <NativeDialogPanel>
          <div className="space-y-3">
            <Input
              autoFocus
              nativeInput
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
        </NativeDialogPanel>
        <NativeDialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            取消
          </Button>
          <Button loading={busy} type="submit">
            保存
          </Button>
        </NativeDialogFooter>
      </form>
    </NativeDialog>
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
  return (
    <NativeDialog onOpenChange={(open) => !open && onClose()} open={Boolean(node)}>
      <div className="flex min-h-0 flex-col">
        <NativeDialogClose className="absolute end-2 top-2" onClick={onClose} />
        <NativeDialogHeader>
          <NativeDialogTitle>确认删除</NativeDialogTitle>
          <NativeDialogDescription>
            {node?.kind === "directory"
              ? `删除文件夹 “${node?.name ?? ""}” 以及其中的所有内容？`
              : `删除文件 “${node?.name ?? ""}”？`}
          </NativeDialogDescription>
        </NativeDialogHeader>
        <NativeDialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            取消
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              void onConfirm().catch(() => {});
            }}
            variant="destructive"
          >
            删除
          </Button>
        </NativeDialogFooter>
      </div>
    </NativeDialog>
  );
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
  onSelectNode,
  selectedPath,
  toggleDirectory,
}: {
  clipboard: FileExplorerSidebarProps["clipboard"];
  depth: number;
  expandedPaths: Set<string>;
  gitStatusMap: Map<string, GitFileEntry>;
  loadingPaths: Set<string>;
  node: ExplorerNode;
  onContextAction: (
    action:
      | "createMarkdown"
      | "createDirectory"
      | "cut"
      | "delete"
      | "rename"
      | "paste"
      | "restoreDeleted",
    node: ExplorerNode,
  ) => void;
  onExpandDirectory: (node: ExplorerNode) => void;
  onSelectNode: (node: ExplorerNode) => void;
  selectedPath: string | null;
  toggleDirectory: (path: string) => void;
}) {
  const isDirectory = node.kind === "directory";
  const isSelected = selectedPath === node.path;
  const isExpanded = isDirectory && expandedPaths.has(node.path);
  const pasteDisabled = !clipboard || clipboard.item.path === node.path;
  const gitState = isDirectory
    ? getAggregatedDirectoryGitState(node, gitStatusMap)
    : (gitStatusMap.get(normalizeExplorerPath(node.path)) ?? null);
  const isDeletedGitEntry = !isDirectory && gitState?.status === "deleted";

  if (isDirectory) {
    const isLoading = loadingPaths.has(node.path);

    return (
      <div className="py-0.5">
        <ContextMenuRoot>
          <ContextMenuTrigger>
            <div className="flex w-full items-center gap-1" style={{ paddingLeft: `${depth * 14 + 8}px` }}>
              <button
                aria-label={isExpanded ? `收起 ${node.name}` : `展开 ${node.name}`}
                type="button"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors",
                  isSelected
                    ? "text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                onClick={() => {
                  const nextExpanded = !isExpanded;
                  toggleDirectory(node.path);

                  if (nextExpanded && !node.loaded && !isLoading) {
                    onExpandDirectory(node);
                  }
                }}
              >
                <ChevronRight
                  className={cn("size-4 shrink-0 transition-transform", isExpanded && "rotate-90")}
                />
              </button>
              <button
                type="button"
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-sidebar-accent/70 text-sidebar-accent-foreground ring-1 ring-inset ring-sidebar-border"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                onClick={() => onSelectNode(node)}
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
                      "ml-auto shrink-0 font-mono text-[11px] font-semibold uppercase",
                      // Always use the standard git badge style so selection doesn't add a
                      // background; this keeps the badge color consistent like VS Code.
                      getGitBadgeClassName(gitState),
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
        {isExpanded && (
          <div>
            {node.loaded ? (
              node.children.length > 0 ? (
                node.children.map((child) => (
                    <FileTreeNode
                      clipboard={clipboard}
                      depth={depth + 1}
                      expandedPaths={expandedPaths}
                      gitStatusMap={gitStatusMap}
                      key={child.path}
                      loadingPaths={loadingPaths}
                    node={child}
                    onContextAction={onContextAction}
                    onExpandDirectory={onExpandDirectory}
                    onSelectNode={onSelectNode}
                    selectedPath={selectedPath}
                    toggleDirectory={toggleDirectory}
                  />
                ))
              ) : (
                <div
                  className="rounded-md px-2 py-3 text-muted-foreground text-xs"
                  style={{ paddingLeft: `${depth * 14 + 44}px` }}
                >
                  未找到文件
                </div>
              )
            ) : (
              <div className="px-2 py-1.5" style={{ paddingLeft: `${depth * 14 + 44}px` }}>
                <div className="space-y-2 py-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-36" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const Icon = node.fileKind === "image" ? FileImage : FileText;

  return (
    <div className="py-0.5">
      <ContextMenuRoot>
        <ContextMenuTrigger>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              isSelected
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            onClick={() => void onSelectNode(node)}
            style={{ paddingLeft: `${depth * 14 + 32}px` }}
          >
            <Icon className="size-4 shrink-0" />
            <span className={cn("truncate", isDeletedGitEntry && "line-through")}>{node.name}</span>
            {gitState ? (
              <span
                className={cn(
                  "ml-auto shrink-0 font-mono text-[11px] font-semibold uppercase",
                  // Keep badge appearance unchanged on selection (no added bg).
                  getGitBadgeClassName(gitState),
                )}
              >
                {getGitBadgeText(gitState)}
              </span>
            ) : null}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent
          clipboard={clipboard}
          isDeletedGitEntry={isDeletedGitEntry}
          onAction={(action) => onContextAction(action, node)}
          pasteDisabled={!clipboard}
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
  onCutNode,
  onDeleteNode,
  onRestoreDeletedNode,
  onOpenFolder,
  onPasteNode,
  onRefresh,
  onGitRefresh,
  onGitRefreshWorkspace,
  onGitStatusChange,
  onRenameNode,
  onExpandDirectory,
  onSelectNode,
}: FileExplorerSidebarProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const createTargetNode = resolveCreateTargetNode(root, selectedPath);
  const gitStatusMap = useMemo(() => buildGitStatusMap(gitStatus), [gitStatus]);
  const mergedRoot = useMemo(
    () => (root ? mergeDeletedGitNodes(root, gitStatusMap) : null),
    [gitStatusMap, root],
  );

  useEffect(() => {
    if (!mergedRoot) {
      setExpandedPaths(new Set());
      return;
    }

    setExpandedPaths((currentPaths) => {
        const nextPaths = new Set<string>(currentPaths.size > 0 ? currentPaths : [mergedRoot.path]);

      nextPaths.add(mergedRoot.path);

      if (selectedPath) {
        for (const ancestor of collectAncestorPaths(mergedRoot, selectedPath)) {
          nextPaths.add(ancestor);
        }
      }

      return nextPaths;
    });
  }, [mergedRoot, selectedPath]);

  useEffect(() => {
    if (!mergedRoot) {
      return;
    }

    // Refresh rebuilds directory nodes as unloaded placeholders; hydrate expanded folders again.
    for (const path of expandedPaths) {
      const node = findNodeByPath(mergedRoot, path);

      if (!node || node.kind !== "directory" || node.loaded || loadingPaths.has(path)) {
        continue;
      }

      void onExpandDirectory(node);
    }
  }, [expandedPaths, loadingPaths, mergedRoot, onExpandDirectory]);

  const toggleDirectory = (path: string) => {
    setExpandedPaths((currentPaths) => {
      const nextPaths = new Set(currentPaths);

      if (nextPaths.has(path)) {
        nextPaths.delete(path);
      } else {
        nextPaths.add(path);
      }

      return nextPaths;
    });
  };

  const canPasteToRoot = useMemo(() => Boolean(root && clipboard), [clipboard, root]);

  const handleContextAction = async (
    action:
      | "createMarkdown"
      | "createDirectory"
      | "cut"
      | "delete"
      | "rename"
      | "paste"
      | "restoreDeleted",
    node: ExplorerNode | null,
  ) => {
    if (!node && action !== "createMarkdown" && action !== "createDirectory" && action !== "paste") {
      return;
    }

    if (action === "createMarkdown") {
      setPendingAction({
        targetPath: node?.path ?? null,
        type: "createMarkdown",
      });
      return;
    }

    if (action === "createDirectory") {
      setPendingAction({
        node: node?.kind === "directory" ? node : null,
        targetPath: node?.kind === "directory" ? node.path : null,
        type: "createDirectory",
      });
      return;
    }

    if (action === "cut" && node) {
      onCutNode(node);
      return;
    }

    if (action === "rename" && node) {
      setPendingAction({ node, type: "rename" });
      return;
    }

    if (action === "delete" && node) {
      setPendingAction({ node, type: "delete" });
      return;
    }

    if (action === "restoreDeleted" && node) {
      setPendingAction({ node, type: "restoreDeleted" });
      return;
    }

    try {
      await onPasteNode(node?.path ?? null);
    } catch {}
  };

  return (
    <>
      <aside className="flex min-w-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b border-sidebar-border px-4",
            explorerTopSectionHeightClassName,
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {root ? root.path : "选择一个文件夹开始浏览"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button loading={busy} onClick={onOpenFolder} size="sm" variant="outline">
              <Folder className="size-4" />
            </Button>
            <CreateEntryMenu
              busy={createBusy}
              disabled={!root || busy || createBusy || operationBusy !== null}
              onCreateDirectory={() =>
                setPendingAction({
                  node: createTargetNode,
                  targetPath: selectedPath,
                  type: "createDirectory",
                })
              }
              onCreateMarkdown={() =>
                setPendingAction({
                  targetPath: selectedPath,
                  type: "createMarkdown",
                })
              }
            />
            <Button
              aria-label="刷新当前文件夹"
              disabled={!root || busy || createBusy || operationBusy !== null}
              onClick={onRefresh}
              size="icon-sm"
              variant="ghost"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>

        <ContextMenuRoot>
          <ContextMenuTrigger className="min-h-0 flex flex-1">
            <div
              className="min-h-0 h-full flex-1 overflow-auto px-2 pb-3"
              data-native-dialog-scroll-lock
            >
              {mergedRoot ? (
                <div className="space-y-1 py-2">
                  <FileTreeNode
                    clipboard={clipboard}
                    depth={0}
                    expandedPaths={expandedPaths}
                    gitStatusMap={gitStatusMap}
                    loadingPaths={loadingPaths}
                    node={mergedRoot}
                    onContextAction={(action, node) => {
                      void handleContextAction(action, node);
                    }}
                   onExpandDirectory={onExpandDirectory}
                   onSelectNode={onSelectNode}
                   selectedPath={selectedPath}
                   toggleDirectory={toggleDirectory}
                 />
                </div>
              ) : (
                <Empty className="px-4 py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Folder className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle className="text-base">打开一个本地文件夹</EmptyTitle>
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
        busy={operationBusy === "rename"}
        node={pendingAction?.type === "rename" ? pendingAction.node : null}
        onClose={() => setPendingAction(null)}
        onConfirm={async (newName) => {
          if (pendingAction?.type !== "rename") {
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
          if (pendingAction?.type !== "createMarkdown") {
            return;
          }

          await onCreateMarkdown(fileName, pendingAction.targetPath);
        }}
        open={pendingAction?.type === "createMarkdown"}
      />

      <CreateDirectoryDialog
        busy={createBusy}
        node={pendingAction?.type === "createDirectory" ? pendingAction.node : undefined}
        onClose={() => setPendingAction(null)}
        onConfirm={async (directoryName) => {
          if (pendingAction?.type !== "createDirectory") {
            return;
          }

          const targetNode = pendingAction.node;

          if (targetNode) {
            setExpandedPaths((currentPaths) => new Set(currentPaths).add(targetNode.path));
          }

          await onCreateDirectory(directoryName, pendingAction.targetPath);
        }}
      />

      <DeleteNodeDialog
        busy={operationBusy === "delete"}
        node={pendingAction?.type === "delete" ? pendingAction.node : null}
        onClose={() => setPendingAction(null)}
        onConfirm={async () => {
          if (pendingAction?.type !== "delete") {
            return;
          }

          await onDeleteNode(pendingAction.node.path);
          setPendingAction(null);
        }}
      />

      <NativeDialog
        onOpenChange={(open) => !open && setPendingAction(null)}
        open={pendingAction?.type === "restoreDeleted"}
      >
        <div className="flex min-h-0 flex-col">
          <NativeDialogClose className="absolute end-2 top-2" onClick={() => setPendingAction(null)} />
          <NativeDialogHeader>
            <NativeDialogTitle>恢复已删除文件</NativeDialogTitle>
            <NativeDialogDescription>
              确认从 Git 恢复文件 “{pendingAction?.type === "restoreDeleted" ? pendingAction.node.name : ""}”？
            </NativeDialogDescription>
          </NativeDialogHeader>
          <NativeDialogFooter>
            <Button disabled={operationBusy === "delete" || operationBusy === "move" || operationBusy === "rename"} onClick={() => setPendingAction(null)} variant="outline">
              取消
            </Button>
            <Button
              disabled={operationBusy !== null}
              onClick={() => {
                if (pendingAction?.type !== "restoreDeleted") {
                  return;
                }

                void onRestoreDeletedNode(pendingAction.node.path)
                  .then(() => {
                    setPendingAction(null);
                  })
                  .catch(() => {});
              }}
            >
              恢复
            </Button>
          </NativeDialogFooter>
        </div>
      </NativeDialog>
    </>
  );
}
