import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

import { FileExplorerSidebar } from "@/components/explorer/file-explorer-sidebar";
import { FilePreview } from "@/components/explorer/file-preview";

import type { ExplorerNode, FilePreview as FilePreviewData } from "./types";

const WORKSPACE_ROOT_STORAGE_KEY = "madora-workspace-root-path";

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

function findFileByPath(node: ExplorerNode, path: string): ExplorerNode | null {
  if (node.path === path && node.kind === "file") {
    return node;
  }

  if (node.kind === "file") {
    return null;
  }

  for (const child of node.children) {
    const matchedFile = findFileByPath(child, path);

    if (matchedFile) {
      return matchedFile;
    }
  }

  return null;
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
  const [root, setRoot] = useState<ExplorerNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<ExplorerNode | null>(null);
  const [preview, setPreview] = useState<FilePreviewData | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sidebarBusy, setSidebarBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequestId = useRef(0);
  const restoredWorkspaceRef = useRef(false);

  const clearPreviewState = () => {
    previewRequestId.current += 1;
    setSelectedFile(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
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
      window.localStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, nextRoot.path);

      const firstFile = findFirstFile(nextRoot);

      if (firstFile) {
        await loadPreview(firstFile);
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

      if (selectedFile) {
        const nextSelectedFile = findFileByPath(nextRoot, selectedFile.path) ?? selectedFile;
        await loadPreview(nextSelectedFile);
      } else {
        const firstFile = findFirstFile(nextRoot);

        if (firstFile) {
          await loadPreview(firstFile);
        } else {
          clearPreviewState();
        }
      }
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

    setCreateBusy(true);
    setSidebarError(null);

    try {
      const createdFile = await invoke<ExplorerNode>("create_markdown_file", {
        fileName,
        rootPath,
        selectedPath: selectedFile?.path ?? null,
      });
      const nextRoot = await invoke<ExplorerNode>("scan_workspace_folder", {
        rootPath,
      });

      setLoadingPaths(new Set());
      setRoot(nextRoot);

      const nextSelectedFile = findFileByPath(nextRoot, createdFile.path) ?? createdFile;
      await loadPreview(nextSelectedFile);
    } catch (error) {
      const message = getErrorMessage(error);

      setSidebarError(message);
      throw new Error(message);
    } finally {
      setCreateBusy(false);
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
    if (restoredWorkspaceRef.current) {
      return;
    }

    restoredWorkspaceRef.current = true;

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
        window.localStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, nextRoot.path);

        const firstFile = findFirstFile(nextRoot);

        if (firstFile) {
          await loadPreview(firstFile);
        } else {
          clearPreviewState();
        }
      } catch (error) {
        if (!active) {
          return;
        }

        window.localStorage.removeItem(WORKSPACE_ROOT_STORAGE_KEY);
        setRoot(null);
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
      <FileExplorerSidebar
        key={root?.path ?? "empty"}
        busy={sidebarBusy}
        createBusy={createBusy}
        loadingPaths={loadingPaths}
        onCreateMarkdown={createMarkdownDocument}
        onOpenFolder={openFolder}
        onRefresh={refreshFolder}
        onExpandDirectory={expandDirectory}
        onSelectFile={loadPreview}
        root={root}
        selectedPath={selectedFile?.path ?? null}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {sidebarError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive-foreground">
            {sidebarError}
          </div>
        )}
        <FilePreview
          error={previewError}
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
