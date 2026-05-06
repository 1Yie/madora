import {
  ChevronRight,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  NativeDialog,
  NativeDialogClose,
  NativeDialogDescription,
  NativeDialogFooter,
  NativeDialogHeader,
  NativeDialogPanel,
  NativeDialogTitle,
} from "@/components/ui/native-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { explorerTopSectionHeightClassName } from "./layout";
import type { ExplorerNode } from "./types";

type FileExplorerSidebarProps = {
  root: ExplorerNode | null;
  selectedPath: string | null;
  busy: boolean;
  createBusy: boolean;
  loadingPaths: Set<string>;
  onCreateMarkdown: (fileName: string) => Promise<void>;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onExpandDirectory: (node: ExplorerNode) => void;
  onSelectFile: (node: ExplorerNode) => void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "发生了未知错误";
}

function CreateMarkdownDialog({
  busy,
  disabled,
  onCreateMarkdown,
}: {
  busy: boolean;
  disabled: boolean;
  onCreateMarkdown: (fileName: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setFileName("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      reset();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedFileName = fileName.trim();

    if (!trimmedFileName) {
      setError("请输入文件名");
      return;
    }

    setError(null);

    try {
      await onCreateMarkdown(trimmedFileName);
      handleOpenChange(false);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  return (
    <>
      <Button
        aria-label="新建 Markdown 文档"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
        size="icon-sm"
        variant="ghost"
      >
        <Plus className="size-4" />
      </Button>
      <NativeDialog onOpenChange={handleOpenChange} open={open}>
        <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
          <NativeDialogClose
            className="absolute end-2 top-2"
            onClick={() => handleOpenChange(false)}
          />
          <NativeDialogHeader>
            <NativeDialogTitle>新建 Markdown 文档</NativeDialogTitle>
            <NativeDialogDescription>
              默认创建在当前选中文件的同级目录；如果还没选中文件，则创建到工作区根目录。
            </NativeDialogDescription>
          </NativeDialogHeader>
          <NativeDialogPanel>
            <div className="space-y-3">
              <Input
                autoFocus
                nativeInput
                onChange={(event) => {
                  setError(null);
                  setFileName(event.target.value);
                }}
                placeholder="untitled.md"
                value={fileName}
              />
              <p className="text-xs text-muted-foreground">
                不带 `.md` 也可以，创建时会自动补上。
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </NativeDialogPanel>
          <NativeDialogFooter>
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
          </NativeDialogFooter>
        </form>
      </NativeDialog>
    </>
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

function FileTreeNode({
  depth,
  expandedPaths,
  loadingPaths,
  node,
  selectedPath,
  toggleDirectory,
  onExpandDirectory,
  onSelectFile,
}: {
  depth: number;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  node: ExplorerNode;
  selectedPath: string | null;
  toggleDirectory: (path: string) => void;
  onExpandDirectory: (node: ExplorerNode) => void;
  onSelectFile: (node: ExplorerNode) => void;
}) {
  const isDirectory = node.kind === "directory";
  const isExpanded = isDirectory && expandedPaths.has(node.path);

  if (isDirectory) {
    const isLoading = loadingPaths.has(node.path);
    const canExpand = node.hasChildren;

    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => {
            if (!canExpand) {
              return;
            }

            const nextExpanded = !isExpanded;
            toggleDirectory(node.path);

            if (nextExpanded && !node.loaded && !isLoading) {
              onExpandDirectory(node);
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
          {canExpand ? (
            <ChevronRight
              className={cn("size-4 shrink-0 transition-transform", isExpanded && "rotate-90")}
            />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          {isLoading ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin" />
          ) : isExpanded ? (
            <FolderOpen className="size-4 shrink-0" />
          ) : (
            <Folder className="size-4 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && (
          <div>
            {node.loaded ? (
              node.children.map((child) => (
                <FileTreeNode
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  loadingPaths={loadingPaths}
                  key={child.path}
                  node={child}
                  selectedPath={selectedPath}
                  toggleDirectory={toggleDirectory}
                  onExpandDirectory={onExpandDirectory}
                  onSelectFile={onSelectFile}
                />
              ))
            ) : (
              <div
                className="px-2 py-1.5"
                style={{ paddingLeft: `${depth * 14 + 44}px` }}
              >
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

  const isSelected = selectedPath === node.path;
  const icon = node.fileKind === "image" ? FileImage : FileText;
  const Icon = icon;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        isSelected
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      onClick={() => onSelectFile(node)}
      style={{ paddingLeft: `${depth * 14 + 32}px` }}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileExplorerSidebar({
  root,
  selectedPath,
  busy,
  createBusy,
  loadingPaths,
  onCreateMarkdown,
  onOpenFolder,
  onRefresh,
  onExpandDirectory,
  onSelectFile,
}: FileExplorerSidebarProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

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

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
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
          <CreateMarkdownDialog
            busy={createBusy}
            disabled={!root}
            onCreateMarkdown={onCreateMarkdown}
          />
          <Button
            aria-label="刷新当前文件夹"
            disabled={!root || busy || createBusy}
            onClick={onRefresh}
            size="icon-sm"
            variant="ghost"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3" data-sidebar-scroll>
        {root ? (
          root.children.length > 0 ? (
            <div className="space-y-1 py-2">
              <FileTreeNode
                depth={0}
                expandedPaths={expandedPaths}
                loadingPaths={loadingPaths}
                node={root}
                selectedPath={selectedPath}
                toggleDirectory={toggleDirectory}
                onExpandDirectory={onExpandDirectory}
                onSelectFile={onSelectFile}
              />
            </div>
          ) : (
            <Empty className="px-4 py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Folder className="size-4" />
                </EmptyMedia>
                <EmptyTitle className="text-base">当前文件夹没有可预览文件</EmptyTitle>
                <EmptyDescription>目前只展示图片、Markdown 和 txt 文件。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
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
    </aside>
  );
}
