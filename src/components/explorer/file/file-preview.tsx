import {
	Eye,
	EyeOff,
	FileImage,
	FileX,
	FolderOpen,
	Info,
	Pencil,
} from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

import { CodeBlock } from '../code-block';
import { ConflictEditor } from '../git/conflict-editor';
import { explorerTopSectionHeightClassName } from '../layout';
import { MarkdownWorkspace } from '../markdown/markdown-workspace';
import { normalizeExplorerPath } from '../../../lib/path-utils';
import type { ExplorerNode, FilePreview as FilePreviewData } from '../types';
import { TextWorkspace } from '../workspace/text-workspace';

function inferLanguage(fileName: string): string | undefined {
	const extension = fileName.split('.').pop()?.toLowerCase();
	switch (extension) {
		case 'rs':
			return 'rust';
		case 'ts':
		case 'tsx':
			return 'typescript';
		case 'js':
		case 'jsx':
			return 'javascript';
		case 'json':
			return 'json';
		case 'md':
		case 'markdown':
		case 'mdx':
			return 'markdown';
		case 'css':
			return 'css';
		case 'html':
			return 'html';
		case 'toml':
			return 'toml';
		case 'yaml':
		case 'yml':
			return 'yaml';
		case 'sh':
		case 'zsh':
			return 'bash';
		case 'sql':
			return 'sql';
		case 'txt':
		case 'log':
			return 'text';
		default:
			return 'text';
	}
}

// function formatSize(size: number): string {
// 	if (size < 1024) return `${size} B`;
// 	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
// 	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
// }

type EditorMode = 'edit' | 'preview';

type FilePreviewProps = {
	conflictedFilePaths: string[];
	loading: boolean;
	onOpenFolder: () => void;
	preview: FilePreviewData | null;
	rootPath: string | null;
	selectedFile: ExplorerNode | null;
	workspaceOpen: boolean;
};

function EmptyIcon({ children }: { children: React.ReactNode }) {
	return (
		<EmptyMedia variant="icon" className="mb-3 [&>div]:size-14 [&_svg]:size-7">
			{children}
		</EmptyMedia>
	);
}

function renderPreviewBody(
	selectedFile: ExplorerNode,
	preview: FilePreviewData,
	isConflicted: boolean,
	markdownMode: EditorMode,
	rootPath: string | null
) {
	if (preview.fileKind === 'image' && preview.imageDataUrl) {
		return (
			<div className="flex min-h-full items-center justify-center p-6">
				<img
					alt={selectedFile.name}
					className="max-h-[70vh] max-w-full rounded-xl border border-border
						bg-background object-contain shadow-sm"
					src={preview.imageDataUrl}
				/>
			</div>
		);
	}

	const content = preview.content ?? '';
	const hasConflictMarkers = content.includes('<<<<<<<');

	if (
		isConflicted &&
		hasConflictMarkers &&
		rootPath &&
		preview.fileKind === 'markdown'
	) {
		return (
			<div className="flex h-full flex-col">
				<div className="min-h-0 flex-1 overflow-hidden border-b border-border">
					<TextWorkspace
						key={selectedFile.path + '-preview'}
						content={content}
						encoding={preview.encoding}
						filePath={selectedFile.path}
						mode={markdownMode}
					/>
				</div>
				<div className="flex min-h-0 max-h-1/2 flex-col">
					<div className="min-h-0 flex-1">
						<ConflictEditor
							content={content}
							filePath={selectedFile.path}
							key={selectedFile.path + '-conflict'}
							rootPath={rootPath}
						/>
					</div>
				</div>
			</div>
		);
	}

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

	const body =
		preview.fileKind === 'markdown' ? (
			<MarkdownWorkspace
				key={selectedFile.path}
				content={content}
				encoding={preview.encoding}
				filePath={selectedFile.path}
				mode={markdownMode}
			/>
		) : (
			<CodeBlock
				code={content}
				language={inferLanguage(selectedFile.name)}
				wrapLongLines
			/>
		);

	if (!isConflicted || hasConflictMarkers) {
		return body;
	}

	return (
		<div className="flex h-full flex-col">
			<Alert className="rounded-none border-x-0 border-t-0" variant="warning">
				<Info />
				<AlertTitle>这个冲突没有内联冲突标记</AlertTitle>
				<AlertDescription>
					这通常是修改/删除、删除/修改这类索引冲突。请先检查当前工作区版本；
					<br />
					如果要保留当前内容，可直接在提交面板暂存来标记冲突已解决。
				</AlertDescription>
			</Alert>
			<div className="min-h-0 flex-1">{body}</div>
		</div>
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
		<div className="flex min-w-0 items-center gap-3 overflow-hidden">
			<CardTitle className="truncate text-xl" title={selectedFile.name}>
				{selectedFile.name}
			</CardTitle>
			{/* <Badge variant="outline">
				{selectedFile.isMissing ? 'deleted' : selectedFile.fileKind}
			</Badge>
			{preview && <Badge variant="secondary">{formatSize(preview.size)}</Badge>} */}
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
					<EmptyIcon>
						<FileX className="size-4" />
					</EmptyIcon>
					<EmptyTitle>该文件已从工作区删除</EmptyTitle>
					<EmptyDescription className="">
						文件仍保留在 Git 变更列表中。可在左侧右键菜单选择「恢复文件」。
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	if (preview) {
		return renderPreviewBody(
			selectedFile,
			preview,
			isConflicted,
			markdownMode,
			rootPath
		);
	}

	return (
		<Empty>
			<EmptyHeader>
				<EmptyIcon>
					{selectedFile.fileKind === 'image' ? (
						<FileImage className="size-4" />
					) : (
						<EyeOff className="size-4" />
					)}
				</EmptyIcon>
				<EmptyTitle>暂无可用预览</EmptyTitle>
				<EmptyDescription>
					该文件类型暂不支持预览，或文件内容为空。
				</EmptyDescription>
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
	const [markdownMode, setMarkdownMode] = useState<EditorMode>('edit');

	const content = preview?.content ?? '';
	const hasConflictMarkers = content.includes('<<<<<<<');

	const isConflictedByIndex =
		selectedFile !== null &&
		conflictedFilePaths.some((conflictedPath) =>
			normalizeExplorerPath(selectedFile.path).endsWith(
				normalizeExplorerPath(conflictedPath)
			)
		);

	const isConflicted = isConflictedByIndex || hasConflictMarkers;

	if (!selectedFile) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyIcon>
						<FolderOpen className="size-4" />
					</EmptyIcon>
					<EmptyTitle>
						{workspaceOpen ? '从左侧选择一个文件' : '还没有打开任何文件夹'}
					</EmptyTitle>
					<EmptyDescription>
						{workspaceOpen
							? '展开文件夹后点击任意文件，内容会在这里预览。'
							: '选择本地目录后，Markdown、图片和文本文件会自动列出并可在此预览。'}
					</EmptyDescription>
				</EmptyHeader>
				{!workspaceOpen && (
					<EmptyContent>
						<Button onClick={onOpenFolder} variant="outline">
							<FolderOpen className="mr-1.5 size-4" />
							打开文件夹
						</Button>
					</EmptyContent>
				)}
			</Empty>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				className={cn(
					'border-b border-border px-4',
					explorerTopSectionHeightClassName
				)}
			>
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

					{selectedFile.fileKind === 'markdown' && !isConflicted && (
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
								<Pencil className="size-3.5 shrink-0" />
							</ToggleGroupItem>
							<ToggleGroupItem className="gap-1.5 px-3" value="preview">
								<Eye className="size-4 shrink-0" />
							</ToggleGroupItem>
						</ToggleGroup>
					)}
				</div>
			</div>

			<div className="min-h-0 flex-1 flex flex-col">
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
