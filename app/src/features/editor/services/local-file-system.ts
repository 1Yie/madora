import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
	AndroidScoped,
	FileSystem as NativeFileSystem,
} from 'react-native-file-access';

import type { EditorDocument, EditorFileKind, EditorNode } from '../types';

const TEXT_MIME_TYPES = [
	'text/*',
	'text/markdown',
	'application/json',
	'application/xml',
	'application/yaml',
	'application/x-yaml',
];

const MAX_DIRECTORY_ENTRIES = 400;
const MARKDOWN_MIME = 'text/markdown';

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

type LocalDirectorySelection = {
	root: EditorNode;
	uri: string;
};

export async function pickLocalFile(): Promise<EditorDocument | null> {
	const result = await File.pickFileAsync({
		mimeTypes: TEXT_MIME_TYPES,
		multipleFiles: false,
	});

	if (result.canceled) return null;
	return readLocalFile(result.result);
}

export async function pickLocalDirectory(): Promise<LocalDirectorySelection | null> {
	const directory = await Directory.pickDirectoryAsync();
	return readLocalDirectory(directory);
}

export async function readLocalDirectory(
	directoryOrUri: Directory | string
): Promise<LocalDirectorySelection> {
	const directory =
		typeof directoryOrUri === 'string'
			? new Directory(directoryOrUri)
			: directoryOrUri;
	const directoryUri = normalizeScopedUri(directory.uri);
	const normalizedDirectory =
		typeof directoryOrUri === 'string' && directoryOrUri !== directoryUri
			? new Directory(directoryUri)
			: directory;

	const name =
		Platform.OS === 'android' && isContentUri(directoryUri)
			? getContentUriName(directoryUri) ||
				Paths.basename(directoryUri) ||
				'Untitled'
			: getItemDisplayName(normalizedDirectory);
	const children = await readLocalDirectoryChildren(
		Platform.OS === 'android' && isContentUri(directoryUri)
			? directoryUri
			: normalizedDirectory,
		directoryUri
	);

	const root: EditorNode = {
		children: children.children,
		fileKind: null,
		hasChildren: children.children.length > 0,
		id: directoryUri,
		kind: 'directory',
		loaded: true,
		name,
		path: directoryUri,
		relativePath: '',
	};

	return {
		root,
		uri: directoryUri,
	};
}

/**
 * Lazily load a single level of a directory's immediate children.
 * Sub-directories are returned as placeholders (loaded:false, hasChildren:true)
 * so the tree does not recurse into them until expanded.
 */
export async function readLocalDirectoryChildren(
	directoryOrUri: Directory | string,
	rootUri?: string
): Promise<{ children: EditorNode[]; loaded: true }> {
	const directoryUri =
		typeof directoryOrUri === 'string'
			? normalizeScopedUri(directoryOrUri)
			: normalizeScopedUri(directoryOrUri.uri);
	const resolvedRootUri = rootUri ?? directoryUri;
	const effectiveRootUri = normalizeScopedUri(resolvedRootUri);

	if (Platform.OS === 'android' && isContentUri(directoryUri)) {
		return {
			children: await listScopedChildren(directoryUri, effectiveRootUri),
			loaded: true,
		};
	}

	const directory =
		typeof directoryOrUri === 'string'
			? new Directory(directoryOrUri)
			: directoryOrUri;
	return {
		children: listExpoChildren(directory, effectiveRootUri),
		loaded: true,
	};
}

export async function createLocalMarkdownFile(
	directoryUri: string,
	fileName: string,
	rootUri: string = directoryUri
): Promise<EditorDocument> {
	const title = normalizeMarkdownFileName(fileName);

	if (Platform.OS === 'android' && isContentUri(directoryUri)) {
		const previousEntries = await listScopedDirectoryEntries(directoryUri);
		const requestUri = appendScopedPath(directoryUri, title);
		const documentUri =
			getScopedChildDocumentUri(directoryUri, title, rootUri) ?? requestUri;
		await NativeFileSystem.writeFile(requestUri, '');
		const createdUri =
			(await resolveScopedEntryUri(
				directoryUri,
				title,
				previousEntries,
				documentUri
			)) ?? documentUri;
		return readLocalFile(createdUri, rootUri);
	}

	const directory = new Directory(directoryUri);
	const file = directory.createFile(title, MARKDOWN_MIME);
	file.write('', { append: false });

	return readLocalFile(file, rootUri);
}

export async function createLocalDirectory(
	directoryUri: string,
	directoryName: string
): Promise<string> {
	const title = normalizeDirectoryName(directoryName);

	if (Platform.OS === 'android' && isContentUri(directoryUri)) {
		const targetUri = appendScopedPath(directoryUri, title);
		return NativeFileSystem.mkdir(targetUri);
	}

	const directory = new Directory(directoryUri);
	const createdDirectory = directory.createDirectory(title);

	return createdDirectory.uri;
}

export async function readLocalFile(
	fileOrUri: File | string,
	rootUri?: string | null
): Promise<EditorDocument> {
	const fileUri = typeof fileOrUri === 'string' ? fileOrUri : fileOrUri.uri;

	if (Platform.OS === 'android' && isContentUri(fileUri)) {
		const stat = await NativeFileSystem.stat(fileUri).catch(() => null);
		const content = await NativeFileSystem.readFile(fileUri);
		const title =
			stat?.filename ||
			getContentUriName(fileUri) ||
			(typeof fileOrUri === 'string'
				? Paths.basename(fileUri)
				: fileOrUri.name || Paths.basename(fileUri));

		return {
			content,
			fileKind: getFileKind(title),
			id: fileUri,
			path: fileUri,
			readOnly: false,
			relativePath: getRelativePath(rootUri ?? null, fileUri),
			title,
			updatedAt: Date.now(),
		} satisfies EditorDocument;
	}

	const file = typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;
	const content = await file.text();
	const title = file.name || Paths.basename(file.uri);

	return {
		content,
		fileKind: getFileKind(title),
		id: file.uri,
		path: file.uri,
		readOnly: false,
		relativePath: getRelativePath(rootUri ?? null, file.uri),
		title,
		updatedAt: Date.now(),
	} satisfies EditorDocument;
}

export async function writeLocalFile(uri: string, content: string) {
	if (Platform.OS === 'android' && isContentUri(uri)) {
		await NativeFileSystem.writeFile(uri, content);
		return;
	}

	const file = new File(uri);
	file.write(content, { append: false });
}

export async function renameLocalFile(
	fileUri: string,
	newName: string,
	rootUri?: string | null
): Promise<EditorDocument> {
	const trimmedName = newName.trim();
	if (!trimmedName) {
		throw new Error('File name cannot be empty.');
	}

	if (Platform.OS === 'android' && isContentUri(fileUri)) {
		const targetName = normalizeFileNameForRename(fileUri, trimmedName);
		const parentUri = getScopedParentDirectoryUri(fileUri, rootUri ?? null);
		if (!parentUri) {
			throw new Error('Cannot resolve parent directory for file.');
		}
		const previousEntries = await listScopedDirectoryEntries(parentUri);
		const normalizedFileUri = normalizeScopedUri(fileUri);
		const currentEntry = previousEntries.find(
			(entry) => normalizeScopedUri(entry.path) === normalizedFileUri
		);
		const currentName = currentEntry?.filename ?? getContentUriName(fileUri);
		if (currentName === targetName) {
			return readLocalFile(fileUri, rootUri ?? null);
		}

		const existingTarget = previousEntries.find(
			(entry) =>
				entry.filename === targetName &&
				normalizeScopedUri(entry.path) !== normalizedFileUri
		);
		if (existingTarget) {
			throw new Error('A file with that name already exists.');
		}

		const requestUri = appendScopedPath(parentUri, targetName);
		const documentUri =
			getScopedChildDocumentUri(parentUri, targetName, rootUri ?? parentUri) ??
			requestUri;
		let renamedUri: string | null = null;

		try {
			await NativeFileSystem.mv(fileUri, targetName);
			renamedUri = await resolveScopedEntryUri(
				parentUri,
				targetName,
				previousEntries,
				documentUri
			);
		} catch {
			await NativeFileSystem.cp(fileUri, requestUri);
			renamedUri =
				(await resolveScopedEntryUri(
					parentUri,
					targetName,
					previousEntries,
					documentUri
				)) ?? documentUri;
			await NativeFileSystem.stat(renamedUri);
			await NativeFileSystem.unlink(fileUri);
		}

		return readLocalFile(renamedUri ?? documentUri, rootUri ?? null);
	}

	const file = new File(fileUri);
	file.rename(trimmedName);
	return readLocalFile(file, rootUri ?? null);
}

export async function copyLocalFileToDirectory(
	fileUri: string,
	directoryUri: string,
	rootUri: string = directoryUri
): Promise<EditorDocument> {
	if (Platform.OS === 'android' && isContentUri(directoryUri)) {
		const previousEntries = await listScopedDirectoryEntries(directoryUri);
		const sourceStat = await NativeFileSystem.stat(fileUri).catch(() => null);
		const sourceName =
			sourceStat?.filename ||
			getContentUriName(fileUri) ||
			Paths.basename(fileUri) ||
			'Untitled.md';
		const targetName = await getAvailableCopyNameForUri(
			directoryUri,
			sourceName
		);
		const requestUri = appendScopedPath(directoryUri, targetName);
		const documentUri =
			getScopedChildDocumentUri(directoryUri, targetName, rootUri) ??
			requestUri;

		await NativeFileSystem.cp(fileUri, requestUri);
		const copiedUri =
			(await resolveScopedEntryUri(
				directoryUri,
				targetName,
				previousEntries,
				documentUri
			)) ?? documentUri;
		return readLocalFile(copiedUri, rootUri);
	}

	const sourceFile = new File(fileUri);
	const targetDirectory = new Directory(directoryUri);
	const targetName = await getAvailableCopyName(
		targetDirectory,
		getItemDisplayName(sourceFile)
	);
	const targetFile = new File(targetDirectory, targetName);

	await sourceFile.copy(targetFile);
	return readLocalFile(targetFile, rootUri);
}

export async function deleteLocalEntry(
	entryUri: string,
	kind: 'directory' | 'file'
): Promise<void> {
	if (Platform.OS === 'android' && isContentUri(entryUri)) {
		if (kind === 'directory') {
			await deleteScopedDirectory(entryUri);
			return;
		}

		await NativeFileSystem.unlink(entryUri);
		return;
	}

	if (kind === 'directory') {
		new Directory(entryUri).delete();
		return;
	}

	new File(entryUri).delete();
}

function listExpoChildren(directory: Directory, rootUri: string): EditorNode[] {
	try {
		return directory
			.list()
			.sort(compareDirectoryItems)
			.flatMap((item) => {
				if (item instanceof Directory) {
					return [createExpoDirectoryPlaceholderNode(item, rootUri)];
				}

				return [createExpoFileNode(item, rootUri)];
			})
			.slice(0, MAX_DIRECTORY_ENTRIES);
	} catch {
		return [];
	}
}

async function listScopedChildren(
	directoryUri: string,
	rootUri: string
): Promise<EditorNode[]> {
	try {
		const entries = (await NativeFileSystem.statDir(directoryUri)).sort(
			compareScopedEntries
		);
		const nextChildren: EditorNode[] = [];

		for (const entry of entries) {
			if (nextChildren.length >= MAX_DIRECTORY_ENTRIES) break;

			if (entry.type === 'directory') {
				nextChildren.push(
					createScopedDirectoryPlaceholderNode(
						entry.path,
						rootUri,
						entry.filename
					)
				);
				continue;
			}

			nextChildren.push(
				createScopedFileNode(entry.path, rootUri, entry.filename)
			);
		}

		return nextChildren;
	} catch {
		return [];
	}
}

function createExpoDirectoryPlaceholderNode(
	directory: Directory,
	rootUri: string
): EditorNode {
	return {
		children: [],
		fileKind: null,
		hasChildren: true,
		id: directory.uri,
		kind: 'directory',
		loaded: false,
		name: getItemDisplayName(directory),
		path: directory.uri,
		relativePath: getRelativePath(rootUri, directory.uri),
	};
}

function createScopedDirectoryPlaceholderNode(
	directoryUri: string,
	rootUri: string,
	name: string
): EditorNode {
	return {
		children: [],
		fileKind: null,
		hasChildren: true,
		id: directoryUri,
		kind: 'directory',
		loaded: false,
		name:
			name ||
			getContentUriName(directoryUri) ||
			Paths.basename(directoryUri) ||
			'Untitled',
		path: directoryUri,
		relativePath: getRelativePath(rootUri, directoryUri),
	};
}

function createExpoFileNode(file: File, rootUri: string): EditorNode {
	const name = getItemDisplayName(file);

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

function createScopedFileNode(
	fileUri: string,
	rootUri: string,
	name: string
): EditorNode {
	return {
		children: [],
		fileKind: getFileKind(name),
		hasChildren: false,
		id: fileUri,
		kind: 'file',
		loaded: true,
		name,
		path: fileUri,
		relativePath: getRelativePath(rootUri, fileUri),
	};
}

function compareDirectoryItems(a: Directory | File, b: Directory | File) {
	const aDirectory = a instanceof Directory;
	const bDirectory = b instanceof Directory;

	if (aDirectory !== bDirectory) {
		return aDirectory ? -1 : 1;
	}

	return getItemDisplayName(a).localeCompare(getItemDisplayName(b));
}

function compareScopedEntries(
	a: Awaited<ReturnType<typeof NativeFileSystem.statDir>>[number],
	b: Awaited<ReturnType<typeof NativeFileSystem.statDir>>[number]
) {
	if (a.type !== b.type) {
		return a.type === 'directory' ? -1 : 1;
	}

	return a.filename.localeCompare(b.filename);
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

function getRelativePath(rootUri: string | null, uri: string) {
	if (!rootUri || uri === rootUri) return '';

	if (isContentUri(rootUri) && isContentUri(uri)) {
		const rootSegments = getContentUriSegments(rootUri);
		const itemSegments = getContentUriSegments(uri);
		if (rootSegments.length === 0 || itemSegments.length === 0) return '';
		if (itemSegments.length <= rootSegments.length) return '';
		return itemSegments.slice(rootSegments.length).join('/');
	}

	const normalizedRoot = rootUri.endsWith('/') ? rootUri : `${rootUri}/`;
	if (uri.startsWith(normalizedRoot)) {
		return uri.slice(normalizedRoot.length);
	}

	return Paths.basename(uri);
}

function getContentUriSegments(uri: string) {
	const decoded = decodeRepeatedly(uri).replace(/\/+$/, '');
	const matches = Array.from(
		decoded.matchAll(
			/\/(?:tree|document)\/([^?#]+?)(?=\/(?:tree|document)\/|$|\?)/g
		)
	);
	const lastMatch =
		matches.length > 0 ? matches[matches.length - 1]?.[1] : null;
	if (!lastMatch) return [];

	const value = lastMatch.includes(':')
		? lastMatch.slice(lastMatch.indexOf(':') + 1)
		: lastMatch;

	return value
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function getContentUriName(uri: string) {
	const segments = getContentUriSegments(uri);
	return segments.length > 0 ? segments[segments.length - 1] : null;
}

function decodeRepeatedly(value: string) {
	let current = value;

	for (let index = 0; index < 3; index += 1) {
		try {
			const next = decodeURIComponent(current);
			if (next === current) break;
			current = next;
		} catch {
			break;
		}
	}

	return current;
}

function isContentUri(path: string) {
	return path.startsWith('content://');
}

function normalizeScopedUri(uri: string) {
	if (!isContentUri(uri)) return uri;
	return uri.replace(/\/+$/, '');
}

function appendScopedPath(baseUri: string, segment: string) {
	return AndroidScoped.appendPath(normalizeScopedUri(baseUri), segment);
}

function getScopedChildDocumentUri(
	parentUri: string,
	childName: string,
	rootUri: string | null
) {
	if (!rootUri || !isContentUri(parentUri) || !isContentUri(rootUri)) {
		return null;
	}

	const rootSegments = getContentUriSegments(rootUri);
	const parentSegments = getContentUriSegments(parentUri);
	if (rootSegments.length === 0 || parentSegments.length === 0) return null;
	if (
		!rootSegments.every((segment, index) => parentSegments[index] === segment)
	) {
		return null;
	}

	const childSegments = [
		...parentSegments.slice(rootSegments.length),
		childName,
	];
	const rootDocumentId = getContentUriDocumentId(rootUri);
	if (!rootDocumentId) return null;

	const childDocumentId =
		childSegments.length > 0
			? `${rootDocumentId}/${childSegments.map(encodePathSegment).join('/')}`
			: rootDocumentId;

	return `${normalizeScopedUri(rootUri)}/document/${encodeURIComponent(
		childDocumentId
	)}`;
}

function getScopedParentDirectoryUri(fileUri: string, rootUri: string | null) {
	if (!rootUri) return null;

	const fileSegments = getContentUriSegments(fileUri);
	if (fileSegments.length <= 1) return rootUri;

	const parentRelativeSegments = fileSegments.slice(0, -1);
	const rootSegments = isContentUri(rootUri)
		? getContentUriSegments(rootUri)
		: [];
	const childSegments =
		rootSegments.length > 0 &&
		parentRelativeSegments
			.slice(0, rootSegments.length)
			.every((segment, index) => segment === rootSegments[index])
			? parentRelativeSegments.slice(rootSegments.length)
			: parentRelativeSegments;

	return childSegments.reduce(
		(currentUri, segment) => appendScopedPath(currentUri, segment),
		rootUri ?? ''
	);
}

function getContentUriDocumentId(uri: string) {
	const decoded = decodeRepeatedly(uri).replace(/\/+$/, '');
	const matches = Array.from(
		decoded.matchAll(
			/\/(?:tree|document)\/([^?#]+?)(?=\/(?:tree|document)\/|$|\?)/g
		)
	);
	const firstMatch = matches[0]?.[1];
	return firstMatch || null;
}

function encodePathSegment(segment: string) {
	return segment.replaceAll('/', '%2F');
}

async function deleteScopedDirectory(directoryUri: string) {
	let entries: Awaited<ReturnType<typeof NativeFileSystem.statDir>> = [];

	try {
		entries = await NativeFileSystem.statDir(directoryUri);
	} catch {
		entries = [];
	}

	for (const entry of entries) {
		if (entry.type === 'directory') {
			await deleteScopedDirectory(entry.path);
			continue;
		}

		await NativeFileSystem.unlink(entry.path);
	}

	await NativeFileSystem.unlink(directoryUri);
}

function getItemDisplayName(item: Directory | File) {
	if (isContentUri(item.uri)) {
		return (
			getContentUriName(item.uri) ||
			item.name ||
			Paths.basename(item.uri) ||
			'Untitled'
		);
	}

	return item.name || Paths.basename(item.uri) || 'Untitled';
}

async function getAvailableCopyName(directory: Directory, sourceName: string) {
	let existingNames = new Set<string>();

	try {
		existingNames = new Set(
			directory.list().map((item) => getItemDisplayName(item))
		);
	} catch {
		existingNames = new Set();
	}

	const extension = getLowerExtension(sourceName);
	const baseName = extension
		? sourceName.slice(0, -extension.length)
		: sourceName;

	for (let index = 1; index < 1000; index += 1) {
		const title =
			index === 1
				? `${baseName} Copy${extension}`
				: `${baseName} Copy ${index}${extension}`;
		if (!existingNames.has(title)) return title;
	}

	return `${baseName} Copy ${Date.now()}${extension}`;
}

async function getAvailableCopyNameForUri(
	directoryUri: string,
	sourceName: string
) {
	let existingNames = new Set<string>();

	try {
		existingNames = new Set(
			(await NativeFileSystem.statDir(directoryUri)).map(
				(item) => item.filename
			)
		);
	} catch {
		existingNames = new Set();
	}

	const extension = getLowerExtension(sourceName);
	const baseName = extension
		? sourceName.slice(0, -extension.length)
		: sourceName;

	for (let index = 1; index < 1000; index += 1) {
		const title =
			index === 1
				? `${baseName} Copy${extension}`
				: `${baseName} Copy ${index}${extension}`;
		if (!existingNames.has(title)) return title;
	}

	return `${baseName} Copy ${Date.now()}${extension}`;
}

async function listScopedDirectoryEntries(directoryUri: string) {
	try {
		return await NativeFileSystem.statDir(directoryUri);
	} catch {
		return [];
	}
}

async function resolveScopedEntryUri(
	directoryUri: string,
	fileName: string,
	previousEntries: Awaited<ReturnType<typeof NativeFileSystem.statDir>>,
	fallbackUri?: string | null
) {
	const nextEntries = await listScopedDirectoryEntries(directoryUri);
	const previousPaths = new Set(previousEntries.map((entry) => entry.path));
	const createdEntry =
		nextEntries.find(
			(entry) => entry.filename === fileName && !previousPaths.has(entry.path)
		) ?? nextEntries.find((entry) => entry.filename === fileName);

	return createdEntry?.path ?? fallbackUri ?? null;
}

function normalizeMarkdownFileName(fileName: string) {
	const trimmedName = normalizeDirectoryName(fileName);

	return getLowerExtension(trimmedName) ? trimmedName : `${trimmedName}.md`;
}

function normalizeFileNameForRename(fileUri: string, fileName: string) {
	const trimmedName = normalizeDirectoryName(fileName);
	const originalExtension = getLowerExtension(
		getContentUriName(fileUri) || Paths.basename(fileUri)
	);

	return getLowerExtension(trimmedName)
		? trimmedName
		: `${trimmedName}${originalExtension}`;
}

function normalizeDirectoryName(directoryName: string) {
	const trimmedName = directoryName.trim();
	if (!trimmedName) {
		throw new Error('File name cannot be empty.');
	}

	if (trimmedName.includes('/') || trimmedName.includes('\\')) {
		throw new Error('File name must be a single path segment.');
	}

	return trimmedName;
}

export function getParentDirectoryUriForFile(
	rootNodes: EditorNode[],
	fileUri: string
) {
	return findParentDirectoryUri(rootNodes, fileUri);
}

function findParentDirectoryUri(
	nodes: EditorNode[],
	fileUri: string
): string | null {
	for (const node of nodes) {
		if (node.kind === 'directory') {
			if (node.children.some((child) => child.path === fileUri)) {
				return node.path;
			}

			const nestedResult = findParentDirectoryUri(node.children, fileUri);
			if (nestedResult) return nestedResult;
		}
	}

	return null;
}
