import { invoke } from '@tauri-apps/api/core';
import type { ExplorerNode, FilePreview } from '@/components/explorer/types';

/** Opens a native folder picker and scans the selected workspace. */
export async function pickWorkspaceFolder(opts: {
	showHiddenFiles: boolean;
	sort?: boolean;
}): Promise<ExplorerNode | null> {
	return invoke<ExplorerNode | null>('pick_workspace_folder', {
		showHiddenFiles: opts.showHiddenFiles,
		sort: opts.sort ?? true,
	});
}

/** Scans a workspace folder into the explorer tree. */
export async function scanWorkspaceFolder(opts: {
	rootPath: string;
	showHiddenFiles?: boolean;
	sort?: boolean;
}): Promise<ExplorerNode> {
	return invoke<ExplorerNode>('scan_workspace_folder', {
		rootPath: opts.rootPath,
		showHiddenFiles: opts.showHiddenFiles ?? false,
		sort: opts.sort ?? true,
	});
}

/** Reads the children of a directory node. */
export async function readWorkspaceDirectory(opts: {
	directoryPath: string;
	rootPath: string;
	showHiddenFiles: boolean;
	sort?: boolean;
}): Promise<ExplorerNode[]> {
	return invoke<ExplorerNode[]>('read_workspace_directory', {
		directoryPath: opts.directoryPath,
		rootPath: opts.rootPath,
		showHiddenFiles: opts.showHiddenFiles,
		sort: opts.sort ?? true,
	});
}

/** Reads a workspace file with encoding detection. */
export async function readWorkspaceFile(opts: {
	path: string;
}): Promise<FilePreview> {
	return invoke<FilePreview>('read_workspace_file', {
		path: opts.path,
	});
}

/** Creates a new markdown file in the workspace. */
export async function createMarkdownFile(opts: {
	fileName: string;
	rootPath: string;
	selectedPath: string | null;
}): Promise<ExplorerNode> {
	return invoke<ExplorerNode>('create_markdown_file', {
		fileName: opts.fileName,
		rootPath: opts.rootPath,
		selectedPath: opts.selectedPath,
	});
}

/** Creates a new directory in the workspace. */
export async function createWorkspaceDirectory(opts: {
	directoryName: string;
	rootPath: string;
	selectedPath: string | null;
}): Promise<ExplorerNode> {
	return invoke<ExplorerNode>('create_workspace_directory', {
		directoryName: opts.directoryName,
		rootPath: opts.rootPath,
		selectedPath: opts.selectedPath,
	});
}

/** Writes content to a workspace file. */
export async function writeWorkspaceFile(opts: {
	content: string;
	path: string;
}): Promise<void> {
	return invoke('write_workspace_file', {
		content: opts.content,
		path: opts.path,
	});
}

/** Renames a file or directory in the workspace. */
export async function renameWorkspaceNode(opts: {
	newName: string;
	rootPath: string;
	targetPath: string;
}): Promise<void> {
	return invoke('rename_workspace_node', {
		newName: opts.newName,
		rootPath: opts.rootPath,
		targetPath: opts.targetPath,
	});
}

/** Deletes a file or directory from the workspace. */
export async function deleteWorkspaceNode(opts: {
	rootPath: string;
	targetPath: string;
}): Promise<void> {
	return invoke('delete_workspace_node', {
		rootPath: opts.rootPath,
		targetPath: opts.targetPath,
	});
}

/** Copies a file or directory within the workspace. */
export async function copyWorkspaceNode(opts: {
	destinationDirectory: string;
	rootPath: string;
	sourcePath: string;
}): Promise<void> {
	return invoke('copy_workspace_node', {
		destinationDirectory: opts.destinationDirectory,
		rootPath: opts.rootPath,
		sourcePath: opts.sourcePath,
	});
}

/** Moves a file or directory within the workspace. */
export async function moveWorkspaceNode(opts: {
	destinationDirectory: string;
	rootPath: string;
	sourcePath: string;
}): Promise<void> {
	return invoke('move_workspace_node', {
		destinationDirectory: opts.destinationDirectory,
		rootPath: opts.rootPath,
		sourcePath: opts.sourcePath,
	});
}
