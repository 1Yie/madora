import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

import { FileExplorerSidebar } from "@/components/explorer/file-explorer-sidebar";
import { FilePreview } from "@/components/explorer/file-preview";
import { showErrorToast } from "@/components/ui/toast";

import {
  getParentPath,
  joinExplorerPath,
  remapPathPrefix,
  replacePathBaseName,
} from "./path-utils";
import type {
  ExplorerClipboardItem,
  ExplorerNode,
  FilePreview as FilePreviewData,
} from "./types";

const WORKSPACE_ROOT_STORAGE_KEY = "madora-workspace-root-path";
const SIDEBAR_WIDTH_STORAGE_KEY = "madora-workspace-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 560;

type ClipboardMode = "cut";
type WorkspaceOperation = "create" | "rename" | "delete" | "move" | null;

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
  if (node.kind === "file") {
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

  if (node.kind === "file") {
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

function findFileByPath(node: ExplorerNode, path: string): ExplorerNode | null {
  const match = findNodeByPath(node, path);

  return match?.kind === "file" ? match : null;
}

function replaceDirectoryChildren(
  node: ExplorerNode,
  directoryPath: string,
  children: ExplorerNode[],
): ExplorerNode {
  if (node.kind === "directory" && node.path === directoryPath) {
    return {
      ...node,
      children,
      hasChildren: children.length > 0,
      loaded: true,
    };
  }

  if (node.kind === "file") {
    return node;
  }

  return {
    ...node,
    children: node.children.map((child) =>
      replaceDirectoryChildren(child, directoryPath, children),
    ),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "发生了未知错误";
}

export function WorkspaceBrowser() {
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [root, setRoot] = useState<ExplorerNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<ExplorerNode | null>(null);
  const [preview, setPreview] = useState<FilePreviewData | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sidebarBusy, setSidebarBusy] = useState(false);
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

  const clearPreviewState = () => {
    previewRequestId.current += 1;
    setSelectedFile(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!sidebarError) {
      return;
    }

    showErrorToast("工作区操作失败", sidebarError);
  }, [sidebarError]);

  useEffect(() => {
    if (!previewError) {
      return;
    }

    showErrorToast("文件读取失败", previewError);
  }, [previewError]);

  const handleSidebarResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartWidthRef.current = sidebarWidth;

    const startX = event.clientX;
    const pointerId = event.pointerId;
    const target = event.currentTarget;

    target.setPointerCapture(pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, dragStartWidthRef.current + moveEvent.clientX - startX),
      );

      setSidebarWidth(clampSidebarWidth(nextWidth));
    };

    const cleanup = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    const handlePointerUp = () => {
      cleanup();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const syncSelectionWithRoot = async (
    nextRoot: ExplorerNode,
    preferredSelectedPath: string | null,
  ) => {
    const nextSelectedFile = preferredSelectedPath
      ? findFileByPath(nextRoot, preferredSelectedPath)
      : null;

    if (nextSelectedFile) {
      await loadPreview(nextSelectedFile);
      return;
    }

    clearPreviewState();
  };

  const loadPreview = async (file: ExplorerNode) => {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setSelectedFile(file);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      const nextPreview = await invoke<FilePreviewData>("read_workspace_file", {
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

  const resolveDestinationDirectory = (targetPath: string | null): string | null => {
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

    if (targetNode.kind === "directory") {
      return targetNode.path;
    }

    return getParentPath(targetNode.path) ?? root.path;
  };

  const openFolder = async () => {
    setSidebarBusy(true);
    setSidebarError(null);

    try {
      const nextRoot = await invoke<ExplorerNode | null>("pick_workspace_folder");

      if (!nextRoot) {
        return;
      }

      setLoadingPaths(new Set());
      setRoot(nextRoot);
      setClipboard(null);
      window.localStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, nextRoot.path);

      const firstFile = findFirstFile(nextRoot);

      if (firstFile) {
        void loadPreview(firstFile);
      } else {
        clearPreviewState();
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
      const nextRoot = await invoke<ExplorerNode>("scan_workspace_folder", {
        rootPath: root.path,
      });

      setLoadingPaths(new Set());
      setRoot(nextRoot);
      setSidebarError(null);
      window.localStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, nextRoot.path);
      void syncSelectionWithRoot(nextRoot, selectedFile?.path ?? null);
    } catch (error) {
      setSidebarError(getErrorMessage(error));
    } finally {
      setSidebarBusy(false);
    }
  };

  const createMarkdownDocument = async (fileName: string) => {
    if (!root) {
      return;
    }

    const rootPath = root.path;
    const destinationDirectory = resolveDestinationDirectory(selectedFile?.path ?? null) ?? rootPath;
    const trimmedFileName = fileName.trim();
    const createdPath = joinExplorerPath(
      destinationDirectory,
      trimmedFileName.toLowerCase().endsWith(".md") ? trimmedFileName : `${trimmedFileName}.md`,
    );

    setCreateBusy(true);
    setSidebarError(null);

    try {
      await invoke<ExplorerNode>("create_markdown_file", {
        fileName,
        rootPath,
        selectedPath: selectedFile?.path ?? null,
      });
      const nextRoot = await invoke<ExplorerNode>("scan_workspace_folder", {
        rootPath,
      });

      setLoadingPaths(new Set());
      setRoot(nextRoot);
      await syncSelectionWithRoot(nextRoot, createdPath);
    } catch (error) {
      const message = getErrorMessage(error);

      setSidebarError(message);
      throw new Error(message);
    } finally {
      setCreateBusy(false);
    }
  };

  const renameNode = async (targetPath: string, newName: string) => {
    if (!root) {
      return;
    }

    const renamedPath = replacePathBaseName(targetPath, newName.trim());
    const nextSelectedPath = remapPathPrefix(selectedFile?.path ?? null, targetPath, renamedPath);
    const nextClipboardPath = remapPathPrefix(clipboard?.item.path ?? null, targetPath, renamedPath);

    setOperationBusy("rename");
    setSidebarError(null);

    try {
      await invoke("rename_workspace_node", {
        newName,
        rootPath: root.path,
        targetPath,
      });

      const nextRoot = await invoke<ExplorerNode>("scan_workspace_folder", {
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

      await syncSelectionWithRoot(nextRoot, nextSelectedPath);
    } catch (error) {
      const message = getErrorMessage(error);

      setSidebarError(message);
      throw new Error(message);
    } finally {
      setOperationBusy(null);
    }
  };

  const deleteNode = async (targetPath: string) => {
    if (!root) {
      return;
    }

    const nextSelectedPath = remapPathPrefix(selectedFile?.path ?? null, targetPath, null);
    const nextClipboardPath = remapPathPrefix(clipboard?.item.path ?? null, targetPath, null);

    setOperationBusy("delete");
    setSidebarError(null);

    try {
      await invoke("delete_workspace_node", {
        rootPath: root.path,
        targetPath,
      });

      const nextRoot = await invoke<ExplorerNode>("scan_workspace_folder", {
        rootPath: root.path,
      });

      setLoadingPaths(new Set());
      setRoot(nextRoot);

      if (clipboard && nextClipboardPath === null) {
        setClipboard(null);
      }

      await syncSelectionWithRoot(nextRoot, nextSelectedPath);
    } catch (error) {
      const message = getErrorMessage(error);

      setSidebarError(message);
      throw new Error(message);
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
      mode: "cut",
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

    const movedPath = joinExplorerPath(destinationDirectory, clipboard.item.name);
    const nextSelectedPath = remapPathPrefix(
      selectedFile?.path ?? null,
      clipboard.item.path,
      movedPath,
    );

    setOperationBusy("move");
    setSidebarError(null);

    try {
      await invoke("move_workspace_node", {
        destinationDirectory,
        rootPath: root.path,
        sourcePath: clipboard.item.path,
      });

      const nextRoot = await invoke<ExplorerNode>("scan_workspace_folder", {
        rootPath: root.path,
      });

      setLoadingPaths(new Set());
      setRoot(nextRoot);
      setClipboard(null);
      await syncSelectionWithRoot(nextRoot, nextSelectedPath);
    } catch (error) {
      const message = getErrorMessage(error);

      setSidebarError(message);
      throw new Error(message);
    } finally {
      setOperationBusy(null);
    }
  };

  const expandDirectory = async (directory: ExplorerNode) => {
    if (!root || directory.kind !== "directory" || directory.loaded) {
      return;
    }

    if (loadingPaths.has(directory.path)) {
      return;
    }

    const workspaceRootPath = root.path;

    setLoadingPaths((currentPaths) => new Set(currentPaths).add(directory.path));

    try {
      const children = await invoke<ExplorerNode[]>("read_workspace_directory", {
        rootPath: workspaceRootPath,
        directoryPath: directory.path,
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
    const savedRootPath = window.localStorage.getItem(WORKSPACE_ROOT_STORAGE_KEY);

    if (!savedRootPath) {
      return;
    }

    let active = true;

    const restoreWorkspace = async () => {
      setSidebarBusy(true);
      setSidebarError(null);

      try {
        const nextRoot = await invoke<ExplorerNode>("scan_workspace_folder", {
          rootPath: savedRootPath,
        });

        if (!active) {
          return;
        }

        setLoadingPaths(new Set());
        setRoot(nextRoot);
        setClipboard(null);
        window.localStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, nextRoot.path);

        const firstFile = findFirstFile(nextRoot);

        if (firstFile) {
          void loadPreview(firstFile);
        } else {
          clearPreviewState();
        }
      } catch (error) {
        if (!active) {
          return;
        }

        window.localStorage.removeItem(WORKSPACE_ROOT_STORAGE_KEY);
        setRoot(null);
        setClipboard(null);
        clearPreviewState();
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
  }, []);

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <div className="relative flex h-full min-h-0 shrink-0" style={{ width: `${sidebarWidth}px` }}>
        <FileExplorerSidebar
          key={root?.path ?? "empty"}
          busy={sidebarBusy}
          clipboard={clipboard}
          createBusy={createBusy}
          loadingPaths={loadingPaths}
          onCreateMarkdown={createMarkdownDocument}
          onCutNode={cutNode}
          onDeleteNode={deleteNode}
          onOpenFolder={openFolder}
          onPasteNode={pasteNode}
          onRefresh={refreshFolder}
          onRenameNode={renameNode}
          onExpandDirectory={expandDirectory}
          onSelectFile={loadPreview}
          operationBusy={operationBusy}
          root={root}
          selectedPath={selectedFile?.path ?? null}
        />
        <div
          aria-label="调整侧边栏宽度"
          className="group absolute inset-y-0 right-0 z-10 w-3 translate-x-1/2 cursor-col-resize bg-transparent"
          onPointerDown={handleSidebarResizeStart}
          role="separator"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary group-active:bg-primary" />
        </div>
      </div>
      <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <FilePreview
          loading={previewLoading}
          onOpenFolder={openFolder}
          preview={preview}
          selectedFile={selectedFile}
          workspaceOpen={Boolean(root)}
        />
      </main>
    </div>
  );
}
