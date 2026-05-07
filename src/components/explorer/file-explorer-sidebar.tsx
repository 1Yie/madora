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

import { explorerTopSectionHeightClassName } from "./layout";
import { getParentPath } from "./path-utils";
import type { ExplorerClipboardItem, ExplorerNode } from "./types";

type WorkspaceOperation = "create" | "rename" | "delete" | "move" | null;

type FileExplorerSidebarProps = {
  root: ExplorerNode | null;
  selectedPath: string | null;
  busy: boolean;
  createBusy: boolean;
  operationBusy: WorkspaceOperation;
  clipboard: {
    item: ExplorerClipboardItem;
    mode: "cut";
  } | null;
  loadingPaths: Set<string>;
  onCreateMarkdown: (fileName: string) => Promise<void>;
  onCreateDirectory: (directoryName: string, targetPath: string | null) => Promise<void>;
  onCutNode: (node: ExplorerNode) => void;
  onDeleteNode: (targetPath: string) => Promise<void>;
  onOpenFolder: () => void;
  onPasteNode: (destinationPath: string | null) => Promise<void>;
  onRefresh: () => void;
  onRenameNode: (targetPath: string, newName: string) => Promise<void>;
  onExpandDirectory: (node: ExplorerNode) => void;
  onSelectNode: (node: ExplorerNode) => void;
};

type PendingAction =
  | { type: "createDirectory"; node: ExplorerNode | null; targetPath: string | null }
  | { type: "rename"; node: ExplorerNode }
  | { type: "delete"; node: ExplorerNode }
  | null;

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
  onAction,
  pasteDisabled,
  target,
}: {
  clipboard: FileExplorerSidebarProps["clipboard"];
  includeNodeActions?: boolean;
  onAction: (action: "createDirectory" | "cut" | "delete" | "rename" | "paste") => void;
  pasteDisabled: boolean;
  target: ExplorerNode | null;
}) {
  const canCreateDirectory = target === null || target.kind === "directory";

  return (
    <ContextMenuPopup align="start" sideOffset={6}>
      {target && includeNodeActions ? (
        <>
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
      ) : (
        <>
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
              默认创建在当前选中目录内；如果当前选中的是文件，则创建在它的同级目录；如果还没有选中节点，则创建到工作区根目录。
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
            默认创建在当前选中目录内；如果当前选中的是文件，则创建在它的同级目录；如果还没有选中节点，则创建到工作区根目录。
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
  loadingPaths: Set<string>;
  node: ExplorerNode;
  onContextAction: (
    action: "createDirectory" | "cut" | "delete" | "rename" | "paste",
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

  if (isDirectory) {
    const isLoading = loadingPaths.has(node.path);

    return (
      <div>
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
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent
            clipboard={clipboard}
            includeNodeActions={depth > 0}
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
          onClick={() => onSelectNode(node)}
          style={{ paddingLeft: `${depth * 14 + 32}px` }}
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent
        clipboard={clipboard}
        onAction={(action) => onContextAction(action, node)}
        pasteDisabled={!clipboard}
        target={node}
      />
    </ContextMenuRoot>
  );
}

export function FileExplorerSidebar({
  root,
  selectedPath,
  busy,
  createBusy,
  operationBusy,
  clipboard,
  loadingPaths,
  onCreateMarkdown,
  onCreateDirectory,
  onCutNode,
  onDeleteNode,
  onOpenFolder,
  onPasteNode,
  onRefresh,
  onRenameNode,
  onExpandDirectory,
  onSelectNode,
}: FileExplorerSidebarProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [createMarkdownDialogOpen, setCreateMarkdownDialogOpen] = useState(false);
  const createTargetNode = resolveCreateTargetNode(root, selectedPath);

  useEffect(() => {
    if (!root) {
      setExpandedPaths(new Set());
      return;
    }

    setExpandedPaths((currentPaths) => {
      const nextPaths = new Set<string>(currentPaths.size > 0 ? currentPaths : [root.path]);

      nextPaths.add(root.path);

      if (selectedPath) {
        for (const ancestor of collectAncestorPaths(root, selectedPath)) {
          nextPaths.add(ancestor);
        }
      }

      return nextPaths;
    });
  }, [root, selectedPath]);

  useEffect(() => {
    if (!root) {
      return;
    }

    // Refresh rebuilds directory nodes as unloaded placeholders; hydrate expanded folders again.
    for (const path of expandedPaths) {
      const node = findNodeByPath(root, path);

      if (!node || node.kind !== "directory" || node.loaded || loadingPaths.has(path)) {
        continue;
      }

      void onExpandDirectory(node);
    }
  }, [expandedPaths, loadingPaths, onExpandDirectory, root]);

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
    action: "createDirectory" | "cut" | "delete" | "rename" | "paste",
    node: ExplorerNode | null,
  ) => {
    if (!node && action !== "createDirectory" && action !== "paste") {
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
              onCreateMarkdown={() => setCreateMarkdownDialogOpen(true)}
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
              {root ? (
                <div className="space-y-1 py-2">
                  <FileTreeNode
                    clipboard={clipboard}
                    depth={0}
                    expandedPaths={expandedPaths}
                    loadingPaths={loadingPaths}
                    node={root}
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
                      左侧导航会按目录结构展示可预览文件，交互方式接近 VS Code 的资源管理器。
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
        onOpenChange={setCreateMarkdownDialogOpen}
        onCreateMarkdown={onCreateMarkdown}
        open={createMarkdownDialogOpen}
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
    </>
  );
}
