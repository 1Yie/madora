/**
 * Helpers for the `madora://` scheme the backend serves workspace files on.
 *
 * The backend percent-decodes the path it receives, so every segment must be
 * encoded here or names containing `#`, `?`, `%` or spaces would be cut short
 * or misread.
 */

/** Decodes URL escapes, leaving malformed input untouched. */
function tryDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Builds a `madora://` URL for an absolute path. Every segment is
 * percent-encoded (so spaces, `#`, `?` and `%` in file names survive the URL
 * round trip) and a Windows drive path gets the leading slash a URL path
 * needs.
 */
export function toMadoraUrl(absolutePath: string): string {
	const normalised = absolutePath.replace(/\\/g, '/');
	const rooted = /^[A-Za-z]:/.test(normalised) ? `/${normalised}` : normalised;
	const encoded = rooted
		.split('/')
		.map((segment, index) =>
			index === 1 && /^[A-Za-z]:$/.test(segment)
				? segment
				: encodeURIComponent(segment)
		)
		.join('/');

	return `madora://localhost${encoded}`;
}

/** Inverse of {@link toMadoraUrl}: the filesystem path a `madora://` URL names. */
export function fromMadoraUrl(url: string): string {
	const path = url.slice('madora://localhost'.length);
	const decoded = tryDecode(path);

	return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded;
}
