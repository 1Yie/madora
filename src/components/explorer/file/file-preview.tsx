import { Eye, FileImage, FileText, FolderOpen, Pencil } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { CodeBlock } from "../code-block";
import { ConflictEditor } from "../git/conflict-editor";
import { explorerTopSectionHeightClassName } from "../layout";
import { MarkdownWorkspace } from "../markdown/markdown-workspace";
import { normalizeExplorerPath } from "../../../lib/path-utils";
import type { ExplorerNode, FilePreview as FilePreviewData } from "../types";
import { TextWorkspace } from "../workspace/text-workspace";

function inferLanguage(fileName: string): string | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "rs":
      return "rust";

    case "ts":
    case "tsx":
      return "typescript";

    case "js":
    case "jsx":
      return "javascript";

    case "json":
      return "json";

    case "md":
    case "markdown":
    case "mdx":
      return "markdown";

    case "css":
      return "css";

    case "html":
      return "html";

    case "toml":
      return "toml";

    case "yaml":
    case "yml":
      return "yaml";

    case "sh":
    case "zsh":
      return "bash";

    case "sql":
      return "sql";

    case "txt":
    case "log":
      return "text";

    default:
      return "text";
  }
}

type FilePreviewProps = {
  conflictedFilePaths: string[];
  loading: boolean;
  onOpenFolder: () => void;
  preview: FilePreviewData | null;
  rootPath: string | null;
  selectedFile: ExplorerNode | null;
  workspaceOpen: boolean;
};

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type EditorMode = "edit" | "preview";

function renderPreviewBody(
  selectedFile: ExplorerNode,
  preview: FilePreviewData,
  isConflicted: boolean,
  markdownMode: EditorMode,
  rootPath: string | null,
) {
  if (preview.fileKind === "image" && preview.imageDataUrl) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <img
          alt={selectedFile.name}
          className="max-h-[70vh] max-w-full rounded-xl border border-border bg-background object-contain shadow-sm"
          src={preview.imageDataUrl}
        />
      </div>
    );
  }

  const content = preview.content ?? "";
  const hasConflictMarkers = content.includes("<<<<<<<");

  if (isConflicted && hasConflictMarkers && rootPath && preview.fileKind === "markdown") {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-hidden border-b border-border">
          <TextWorkspace
            key={selectedFile.path + "-preview"}
            content={content}
            filePath={selectedFile.path}
            mode={markdownMode}
          />
        </div>

        <div className="flex min-h-0 max-h-1/2 flex-col justify-end">
          <div className="overflow-auto">
            <ConflictEditor
              content={content}
              filePath={selectedFile.path}
              key={selectedFile.path + "-conflict"}
              rootPath={rootPath}
            />
          </div>
        </div>
      </div>
    );
  }

  // 纯冲突文件（非 markdown）
  if (isConflicted && hasConflictMarkers && rootPath) {
    return (
      <ConflictEditor
        content={content}
        filePath={selectedFile.path}
        key={selectedFile.path}
        rootPath={rootPath}
      />
    );
  }

  if (preview.fileKind === "markdown") {
    return (
      <MarkdownWorkspace
        key={selectedFile.path}
        content={content}
        filePath={selectedFile.path}
        mode={markdownMode}
      />
    );
  }

  return <CodeBlock code={content} language={inferLanguage(selectedFile.name)} wrapLongLines />;
}

function PreviewHeader({
  preview,
  selectedFile,
}: {
  preview: FilePreviewData | null;
  selectedFile: ExplorerNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
      <CardTitle className="truncate text-xl" title={selectedFile.name}>
        {selectedFile.name}
      </CardTitle>

      <Badge variant="outline">{selectedFile.isMissing ? "deleted" : selectedFile.fileKind}</Badge>

      {/* {isConflicted && <Badge variant="destructive">冲突</Badge>} */}

      {preview && <Badge variant="secondary">{formatSize(preview.size)}</Badge>}

      {preview?.truncated && <Badge variant="warning">已截断预览</Badge>}
    </div>
  );
}

function PreviewState({
  isConflicted,
  loading,
  markdownMode,
  preview,
  rootPath,
  selectedFile,
}: {
  isConflicted: boolean;
  loading: boolean;
  markdownMode: EditorMode;
  preview: FilePreviewData | null;
  rootPath: string | null;
  selectedFile: ExplorerNode;
}) {
  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/3 rounded-md" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (selectedFile.isMissing) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText className="size-4" />
          </EmptyMedia>

          <EmptyTitle>该文件已从工作区删除</EmptyTitle>

          <EmptyDescription>
            它仍保留在 Git 变更列表中。可在左侧右键选择"恢复文件"。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (preview) {
    if (preview.fileKind === "markdown") {
      return renderPreviewBody(selectedFile, preview, isConflicted, markdownMode, rootPath);
    }

    return (
      <ScrollArea className="h-full" scrollFade>
        {renderPreviewBody(selectedFile, preview, isConflicted, markdownMode, rootPath)}
      </ScrollArea>
    );
  }

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {selectedFile.fileKind === "image" ? (
            <FileImage className="size-4" />
          ) : (
            <FileText className="size-4" />
          )}
        </EmptyMedia>

        <EmptyTitle>还没有可用预览</EmptyTitle>

        <EmptyDescription>选择左侧文件即可在这里查看内容。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function FilePreview({
  conflictedFilePaths,
  loading,
  onOpenFolder,
  preview,
  rootPath,
  selectedFile,
  workspaceOpen,
}: FilePreviewProps) {
  const [markdownMode, setMarkdownMode] = useState<EditorMode>("edit");

  // 以文件内容为准：index 标记冲突 OR 文件里有冲突标记，任一满足即视为冲突。
  // 这样可以避免 index 状态已清但文件内容尚未解决时冲突标记消失的问题。
  const content = preview?.content ?? "";
  const hasConflictMarkers = content.includes("<<<<<<<");

  const isConflictedByIndex =
    selectedFile !== null &&
    conflictedFilePaths.some((conflictedPath) =>
      normalizeExplorerPath(selectedFile.path).endsWith(normalizeExplorerPath(conflictedPath)),
    );

  const isConflicted = isConflictedByIndex || hasConflictMarkers;

  if (!selectedFile) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpen className="size-4" />
          </EmptyMedia>

          <EmptyTitle>{workspaceOpen ? "从左侧选择一个文件" : "选择一个文件夹开始浏览"}</EmptyTitle>

          <EmptyDescription>
            {workspaceOpen
              ? "目录已经加载完成，展开左侧文件夹后点击文件即可预览内容。"
              : "打开本地目录后，只显示并预览图片、Markdown 和 txt 文件。"}
          </EmptyDescription>
        </EmptyHeader>

        {!workspaceOpen && (
          <Button onClick={onOpenFolder} variant="outline">
            打开文件夹
          </Button>
        )}
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn("border-b border-border px-2", explorerTopSectionHeightClassName)}>
        <div className="flex h-full items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <PreviewHeader preview={preview} selectedFile={selectedFile} />

            <CardDescription
              className="truncate font-mono text-xs"
              title={selectedFile.relativePath || selectedFile.path}
            >
              {selectedFile.relativePath || selectedFile.path}
            </CardDescription>
          </div>

          {selectedFile.fileKind === "markdown" && !isConflicted ? (
            <ToggleGroup
              className="shrink-0 gap-0"
              onValueChange={(values) => {
                if (values.length > 0) {
                  setMarkdownMode(values[0] as EditorMode);
                }
              }}
              size="sm"
              value={[markdownMode]}
              variant="outline"
            >
              <ToggleGroupItem className="gap-1.5 px-3" value="edit">
                <div className="flex gap-1.5 items-center">
                  <Pencil className="size-3.5 shrink-0" />
                </div>
              </ToggleGroupItem>

              <ToggleGroupItem className="gap-1.5 px-3" value="preview">
                <div className="flex gap-1.5 items-center">
                  <Eye className="size-4 shrink-0" />
                </div>
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <PreviewState
          isConflicted={isConflicted}
          loading={loading}
          markdownMode={markdownMode}
          preview={preview}
          rootPath={rootPath}
          selectedFile={selectedFile}
        />
      </div>
    </div>
  );
}
