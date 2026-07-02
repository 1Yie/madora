import { Directory, File, Paths } from 'expo-file-system';

import type { EditorDocument, EditorFileKind, EditorNode } from '../types';

const TEXT_MIME_TYPES = [
	'text/*',
	'text/markdown',
	'application/json',
	'application/xml',
	'application/yaml',
	'application/x-yaml',
];

const MAX_DIRECTORY_DEPTH = 4;
const MAX_DIRECTORY_ENTRIES = 400;

const TEXT_EXTENSIONS = new Set([
	'.c',
	'.cpp',
	'.css',
	'.csv',
	'.go',
	'.h',
	'.html',
	'.ini',
	'.java',
	'.js',
	'.json',
	'.jsx',
	'.log',
	'.md',
	'.mdx',
	'.py',
	'.rs',
	'.sh',
	'.sql',
	'.svg',
	'.toml',
	'.ts',
	'.tsx',
	'.txt',
	'.xml',
	'.yaml',
	'.yml',
]);

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);
const IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

export async function pickLocalFile(): Promise<EditorDocument | null> {
	const result = await File.pickFileAsync({
		mimeTypes: TEXT_MIME_TYPES,
		multipleFiles: false,
	});

	if (result.canceled) return null;
	return readLocalFile(result.result);
}

export async function pickLocalDirectory(): Promise<{
	root: EditorNode;
	uri: string;
} | null> {
	const directory = await Directory.pickDirectoryAsync();
	return readLocalDirectory(directory);
}

export function readLocalDirectory(directoryOrUri: Directory | string): {
	root: EditorNode;
	uri: string;
} {
	const directory =
		typeof directoryOrUri === 'string'
			? new Directory(directoryOrUri)
			: directoryOrUri;
	const root = buildDirectoryNode(directory, directory.uri, 0, {
		count: 0,
	});

	return {
		root,
		uri: directory.uri,
	};
}

export async function createLocalMarkdownFile(
	directoryUri: string
): Promise<EditorDocument> {
	const directory = new Directory(directoryUri);
	const title = getAvailableUntitledName(directory);
	const file = directory.createFile(title, 'text/markdown');
	const heading = title.replace(/\.md$/i, '');
	file.write(`# ${heading}\n\n`, { append: false });

	return readLocalFile(file);
}

export async function readLocalFile(fileOrUri: File | string) {
	const file = typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;
	const content = await file.text();
	const title = file.name || Paths.basename(file.uri);
	const fileKind = getFileKind(title);

	return {
		content,
		fileKind,
		id: file.uri,
		path: file.uri,
		readOnly: false,
		title,
		updatedAt: Date.now(),
	} satisfies EditorDocument;
}

export function writeLocalFile(uri: string, content: string) {
	const file = new File(uri);
	file.write(content, { append: false });
}

function buildDirectoryNode(
	directory: Directory,
	rootUri: string,
	depth: number,
	state: { count: number }
): EditorNode {
	let children: EditorNode[] = [];

	if (depth < MAX_DIRECTORY_DEPTH && state.count < MAX_DIRECTORY_ENTRIES) {
		try {
			children = directory
				.list()
				.sort(compareDirectoryItems)
				.flatMap((item) => {
					if (state.count >= MAX_DIRECTORY_ENTRIES) return [];
					state.count += 1;

					if (item instanceof Directory) {
						return [buildDirectoryNode(item, rootUri, depth + 1, state)];
					}

					return [createFileNode(item, rootUri)];
				});
		} catch {
			children = [];
		}
	}

	return {
		children,
		fileKind: null,
		hasChildren: children.length > 0,
		id: directory.uri,
		kind: 'directory',
		loaded: true,
		name: directory.name || Paths.basename(directory.uri) || 'Folder',
		path: directory.uri,
		relativePath: getRelativePath(rootUri, directory.uri),
	};
}

function createFileNode(file: File, rootUri: string): EditorNode {
	const name = file.name || Paths.basename(file.uri);

	return {
		children: [],
		fileKind: getFileKind(name),
		hasChildren: false,
		id: file.uri,
		kind: 'file',
		loaded: true,
		name,
		path: file.uri,
		relativePath: getRelativePath(rootUri, file.uri),
	};
}

function compareDirectoryItems(a: Directory | File, b: Directory | File) {
	const aDirectory = a instanceof Directory;
	const bDirectory = b instanceof Directory;

	if (aDirectory !== bDirectory) {
		return aDirectory ? -1 : 1;
	}

	return a.name.localeCompare(b.name);
}

function getFileKind(name: string): EditorFileKind {
	const extension = getLowerExtension(name);

	if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
	if (IMAGE_EXTENSIONS.has(extension)) return 'image';
	if (TEXT_EXTENSIONS.has(extension)) return 'text';
	return 'other';
}

function getLowerExtension(name: string) {
	const index = name.lastIndexOf('.');
	if (index < 0) return '';
	return name.slice(index).toLowerCase();
}

function getRelativePath(rootUri: string, uri: string) {
	if (uri === rootUri) return '';

	const normalizedRoot = rootUri.endsWith('/') ? rootUri : `${rootUri}/`;
	if (uri.startsWith(normalizedRoot)) {
		return uri.slice(normalizedRoot.length);
	}

	return Paths.basename(uri);
}

function getAvailableUntitledName(directory: Directory) {
	for (let index = 1; index < 1000; index += 1) {
		const title = index === 1 ? 'Untitled.md' : `Untitled ${index}.md`;
		const file = new File(directory, title);
		if (!file.exists) return title;
	}

	return `Untitled ${Date.now()}.md`;
}
