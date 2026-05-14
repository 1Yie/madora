function isWindowsDriveRoot(path: string): boolean {
	return /^[A-Za-z]:[\\/]$/.test(path);
}

export function normalizeExplorerPath(path: string): string {
	let normalized = path.replace(/\\/g, '/');

	if (normalized !== '/' && !/^[A-Za-z]:\/$/.test(normalized)) {
		normalized = normalized.replace(/\/+$/, '');
	}

	return normalized;
}

export function isSameOrDescendantPath(
	path: string,
	ancestor: string
): boolean {
	const normalizedPath = normalizeExplorerPath(path);
	const normalizedAncestor = normalizeExplorerPath(ancestor);

	if (normalizedPath === normalizedAncestor) {
		return true;
	}

	const prefix = normalizedAncestor.endsWith('/')
		? normalizedAncestor
		: `${normalizedAncestor}/`;

	return normalizedPath.startsWith(prefix);
}

export function getPathName(path: string): string {
	const normalized = path.replace(/[\\/]+$/, '');
	const index = Math.max(
		normalized.lastIndexOf('/'),
		normalized.lastIndexOf('\\')
	);

	return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function getParentPath(path: string): string | null {
	const normalized = path.replace(/[\\/]+$/, '');
	const index = Math.max(
		normalized.lastIndexOf('/'),
		normalized.lastIndexOf('\\')
	);

	if (index < 0) {
		return null;
	}

	if (index === 0) {
		return normalized[0];
	}

	const drivePrefix = normalized.slice(0, index);

	if (/^[A-Za-z]:$/.test(drivePrefix)) {
		return `${drivePrefix}${normalized[index]}`;
	}

	return normalized.slice(0, index);
}

export function joinExplorerPath(directoryPath: string, name: string): string {
	const separator = directoryPath.includes('\\') ? '\\' : '/';
	const base =
		directoryPath === '/' || isWindowsDriveRoot(directoryPath)
			? directoryPath
			: directoryPath.replace(/[\\/]+$/, '');

	return base.endsWith(separator)
		? `${base}${name}`
		: `${base}${separator}${name}`;
}

export function replacePathBaseName(path: string, name: string): string {
	const parent = getParentPath(path);

	if (!parent) {
		return name;
	}

	return joinExplorerPath(parent, name);
}

export function remapPathPrefix(
	path: string | null,
	fromPath: string,
	toPath: string | null
): string | null {
	if (!path || !isSameOrDescendantPath(path, fromPath)) {
		return path;
	}

	if (toPath === null) {
		return null;
	}

	const normalizedPath = normalizeExplorerPath(path);
	const normalizedFromPath = normalizeExplorerPath(fromPath);
	const suffix =
		normalizedPath === normalizedFromPath
			? ''
			: normalizedPath.slice(normalizedFromPath.length + 1);
	const separator = toPath.includes('\\') || path.includes('\\') ? '\\' : '/';
	const normalizedToPath =
		toPath === '/' || isWindowsDriveRoot(toPath)
			? toPath
			: toPath.replace(/[\\/]+$/, '');

	if (!suffix) {
		return normalizedToPath;
	}

	return `${normalizedToPath}${separator}${suffix.split('/').join(separator)}`;
}
