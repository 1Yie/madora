import { FileImage, FileText, FolderOpen, ScrollText } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { CodeBlock } from "./code-block";
import { explorerTopSectionHeightClassName } from "./layout";
import { MarkdownWorkspace } from "./markdown-workspace";
import type { ExplorerNode, FilePreview as FilePreviewData } from "./types";

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
  error: string | null;
  loading: boolean;
  onOpenFolder: () => void;
  preview: FilePreviewData | null;
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

function renderPreviewBody(selectedFile: ExplorerNode, preview: FilePreviewData) {
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

  if (preview.fileKind === "markdown") {
    return <MarkdownWorkspace content={preview.content ?? ""} filePath={selectedFile.path} />;
  }

  return (
    <CodeBlock
      code={preview.content ?? ""}
      language={inferLanguage(selectedFile.name)}
      wrapLongLines
    />
  );
}

function PreviewHeader({
  preview,
  selectedFile,
}: {
  preview: FilePreviewData | null;
  selectedFile: ExplorerNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        <CardTitle className="truncate text-xl" title={selectedFile.name}>
          {selectedFile.name}
        </CardTitle>
        <Badge variant="outline">{selectedFile.fileKind}</Badge>
        {preview && <Badge variant="secondary">{formatSize(preview.size)}</Badge>}
        {preview?.truncated && <Badge variant="warning">已截断预览</Badge>}
      </div>
    </div>
  );
}

function PreviewState({
  error,
  loading,
  preview,
  selectedFile,
}: {
  error: string | null;
  loading: boolean;
  preview: FilePreviewData | null;
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

  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollText className="size-4" />
          </EmptyMedia>
          <EmptyTitle>文件读取失败</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (preview) {
    if (preview.fileKind === "markdown") {
      return renderPreviewBody(selectedFile, preview);
    }

    return (
      <ScrollArea className="h-full" scrollFade>
        {renderPreviewBody(selectedFile, preview)}
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
  error,
  loading,
  onOpenFolder,
  preview,
  selectedFile,
  workspaceOpen,
}: FilePreviewProps) {
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
      <div
        className={cn(
          "flex flex-col justify-center border-b border-border px-2",
          explorerTopSectionHeightClassName,
        )}
      >
        <PreviewHeader preview={preview} selectedFile={selectedFile} />
        <CardDescription
          className="truncate font-mono text-xs"
          title={selectedFile.relativePath || selectedFile.path}
        >
          {selectedFile.relativePath || selectedFile.path}
        </CardDescription>
      </div>
      <div className="min-h-0 flex-1">
        <PreviewState
          error={error}
          loading={loading}
          preview={preview}
          selectedFile={selectedFile}
        />
      </div>
    </div>
  );
}
