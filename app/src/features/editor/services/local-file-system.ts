import { Directory, File, FileMode, Paths } from 'expo-file-system';
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
		const title =
			stat?.filename ||
			getContentUriName(fileUri) ||
			(typeof fileOrUri === 'string'
				? Paths.basename(fileUri)
				: fileOrUri.name || Paths.basename(fileUri));
		const fileKind = getFileKind(title);
		const content =
			fileKind === 'image' ? '' : await NativeFileSystem.readFile(fileUri);

		return {
			content,
			fileKind,
			id: fileUri,
			lastSavedContent: content,
			path: fileUri,
			readOnly: false,
			relativePath: getRelativePath(rootUri ?? null, fileUri),
			title,
			updatedAt: Date.now(),
		} satisfies EditorDocument;
	}

	const file = typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;
	const title = file.name || Paths.basename(file.uri);
	const fileKind = getFileKind(title);
	const content = fileKind === 'image' ? '' : await file.text();

	return {
		content,
		fileKind,
		id: file.uri,
		lastSavedContent: content,
		path: file.uri,
		readOnly: false,
		relativePath: getRelativePath(rootUri ?? null, file.uri),
		title,
		updatedAt: Date.now(),
	} satisfies EditorDocument;
}

export async function writeLocalFile(uri: string, content: string) {
	if (Platform.OS === 'android' && isContentUri(uri)) {
		const file = new File(uri);
		const handle = file.open(FileMode.Truncate);
		try {
			const bytes = new TextEncoder().encode(content);
			if (bytes.length > 0) {
				handle.writeBytes(bytes);
			}
		} finally {
			handle.close();
		}
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

/**
 * Resolve a markdown link/image reference to an absolute file URI.
 *
 * Supports:
 * - Absolute paths (`/img/...`) → resolved against workspace root URI
 * - Relative paths (`./img.png`, `../img.png`) → resolved against the
 *   markdown file's parent directory
 * - Android SAF content URIs and iOS `file://` URIs
 *
 * Returns `null` when the link is external (http/https/data) or cannot be
 * resolved (missing root/file context).
 */
export function resolveFilePath(
	link: string,
	currentFileUri: string | null,
	rootUri: string | null
): string | null {
	if (!link) return null;

	const decoded = tryDecodeURI(link).trim();
	if (!decoded || decoded.startsWith('#')) return null;

	const localPath = stripLinkTarget(decoded);
	if (!localPath) return null;

	const normalizedProtocolPath = localPath.toLowerCase();

	// External / protocol URLs are not local files
	if (
		normalizedProtocolPath.startsWith('http://') ||
		normalizedProtocolPath.startsWith('https://') ||
		normalizedProtocolPath.startsWith('data:') ||
		normalizedProtocolPath.startsWith('asset://') ||
		normalizedProtocolPath.startsWith('madora://') ||
		normalizedProtocolPath.startsWith('file:')
	) {
		return null;
	}

	let resolved: string | null;

	// Absolute path (`/foo/bar`) → resolve against workspace root
	if (localPath.startsWith('/')) {
		if (!rootUri) return null;
		const relativeSrc = localPath.replace(/^\/+/, '');
		resolved = appendRelativeSegments(rootUri, relativeSrc.split('/'));
	} else {
		// Relative path → resolve against the current file's directory
		if (!currentFileUri) return null;
		resolved = resolveRelativeToDirectory(currentFileUri, localPath, rootUri);
	}

	if (!resolved) return null;
	if (rootUri && !isUriWithinRoot(resolved, rootUri)) return null;
	return resolved;
}

/**
 * Check whether a resolved file URI exists.
 */
export async function localFileExists(uri: string): Promise<boolean> {
	try {
		await NativeFileSystem.stat(uri);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read a local image file and return it as a `data:` URI suitable for
 * embedding in an `<img>` tag inside the WebView.
 *
 * Returns `null` if the file cannot be read or is empty.
 */
export async function readLocalFileAsDataUri(
	uri: string
): Promise<string | null> {
	try {
		const base64 = await NativeFileSystem.readFile(uri, 'base64');
		if (!base64) return null;
		const name = getBaseNameForUri(uri);
		return `data:${getImageMimeType(name)};base64,${base64}`;
	} catch {
		return null;
	}
}

function resolveRelativeToDirectory(
	fileUri: string,
	relativePath: string,
	rootUri: string | null
): string | null {
	const segments = normalizeRelativeSegments(relativePath);
	if (segments.length === 0) return fileUri;

	if (isContentUri(fileUri)) {
		return resolveScopedRelativePath(fileUri, segments, rootUri);
	}

	// iOS / plain file:// path — standard filesystem join
	const fileDir = fileUri.replace(/\/+$/, '').split('/').slice(0, -1).join('/');
	const joined = [...fileDir.split('/'), ...segments].join('/');
	return normalisePosixPath(joined);
}

function resolveScopedRelativePath(
	fileUri: string,
	segments: string[],
	rootUri: string | null
): string | null {
	const fileSegments = getContentUriSegments(fileUri);
	if (fileSegments.length === 0) return null;

	const parentSegments = fileSegments.slice(0, -1);

	const resolvedSegments = applyRelativeSegments(parentSegments, segments);

	// Build from root URI if available so we get a valid document URI
	if (rootUri && isContentUri(rootUri)) {
		const rootSegments = getContentUriSegments(rootUri);
		if (rootSegments.length > 0) {
			if (!hasSegmentPrefix(resolvedSegments, rootSegments)) return null;
			const childSegments = resolvedSegments.slice(rootSegments.length);
			const rootDocumentId = getContentUriDocumentId(rootUri);
			if (!rootDocumentId) return null;

			const childDocumentId =
				childSegments.length > 0
					? `${rootDocumentId}/${childSegments
							.map(encodePathSegment)
							.join('/')}`
					: rootDocumentId;
			return `${normalizeScopedUri(rootUri)}/document/${encodeURIComponent(
				childDocumentId
			)}`;
		}
	}

	// Fallback: append resolved segments directly to the parent tree URI
	return segments.reduce(
		(currentUri, segment) => appendScopedPath(currentUri, segment),
		buildTreeUriFromSegments(fileUri)
	);
}

function buildTreeUriFromSegments(fileUri: string): string {
	const decoded = decodeRepeatedly(fileUri);
	const treeMatch = decoded.match(/^(.*?\/tree\/[^?#]+?)(?=\/document\/|$|\?)/);
	const base = treeMatch?.[1] ?? fileUri.split('/document/')[0];
	return normalizeScopedUri(base);
}

function appendRelativeSegments(
	baseUri: string,
	segments: string[]
): string | null {
	const normalized = segments
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0 && segment !== '.')
		.flatMap((segment) => segment.split('/'))
		.filter((segment) => segment.length > 0 && segment !== '.');

	if (normalized.length === 0) return baseUri;

	if (isContentUri(baseUri)) {
		const baseSegments = getContentUriSegments(baseUri);
		const resolvedSegments = applyRelativeSegments(baseSegments, normalized);
		if (!hasSegmentPrefix(resolvedSegments, baseSegments)) return null;
		return resolvedSegments
			.slice(baseSegments.length)
			.reduce(
				(currentUri, segment) => appendScopedPath(currentUri, segment),
				normalizeScopedUri(baseUri)
			);
	}

	const base = baseUri.replace(/\/+$/, '');
	return normalisePosixPath([...base.split('/'), ...normalized].join('/'));
}

function hasSegmentPrefix(segments: string[], prefix: string[]) {
	if (segments.length < prefix.length) return false;
	return prefix.every((segment, index) => segments[index] === segment);
}

function isUriWithinRoot(uri: string, rootUri: string): boolean {
	if (isContentUri(uri) || isContentUri(rootUri)) {
		if (!isContentUri(uri) || !isContentUri(rootUri)) return false;
		const uriSegments = getContentUriSegments(uri);
		const rootSegments = getContentUriSegments(rootUri);
		if (rootSegments.length === 0) return false;
		if (uriSegments.length < rootSegments.length) return false;
		return rootSegments.every(
			(segment, index) => uriSegments[index] === segment
		);
	}

	const normalizedUri = normalizeRootComparablePath(uri);
	const normalizedRoot = normalizeRootComparablePath(rootUri);
	if (normalizedUri === normalizedRoot) return true;
	return normalizedUri.startsWith(`${normalizedRoot}/`);
}

function normalizeRootComparablePath(uri: string) {
	const normalized = normalisePosixPath(uri.replace(/\\/g, '/'));
	return normalized.replace(/\/+$/, '');
}

function applyRelativeSegments(baseSegments: string[], segments: string[]) {
	const result = [...baseSegments];
	for (const segment of segments) {
		if (segment === '..') {
			if (result.length > 0) result.pop();
			continue;
		}
		if (segment === '.') continue;
		result.push(segment);
	}
	return result;
}

function stripLinkTarget(link: string) {
	const queryIndex = link.indexOf('?');
	const hashIndex = link.indexOf('#');
	const indexes = [queryIndex, hashIndex].filter((index) => index >= 0);
	if (indexes.length === 0) return link;
	return link.slice(0, Math.min(...indexes));
}

function normalizeRelativeSegments(relativePath: string): string[] {
	return relativePath
		.replace(/\\/g, '/')
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function normalisePosixPath(path: string): string {
	const segments = path.split('/');
	const result: string[] = [];
	for (const segment of segments) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			if (result.length > 0) result.pop();
			continue;
		}
		result.push(segment);
	}
	const prefix = path.startsWith('/') ? '/' : '';
	const suffix = path.endsWith('/') && result.length > 0 ? '/' : '';
	return prefix + result.join('/') + suffix;
}

function getBaseNameForUri(uri: string): string {
	if (isContentUri(uri)) {
		return getContentUriName(uri) ?? Paths.basename(uri) ?? '';
	}
	return Paths.basename(uri);
}

function getImageMimeType(name: string): string {
	const extension = getLowerExtension(name);
	switch (extension) {
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.gif':
			return 'image/gif';
		case '.webp':
			return 'image/webp';
		case '.svg':
			return 'image/svg+xml';
		case '.bmp':
			return 'image/bmp';
		default:
			return 'application/octet-stream';
	}
}

function tryDecodeURI(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
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
