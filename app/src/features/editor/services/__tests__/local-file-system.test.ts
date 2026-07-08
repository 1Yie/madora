import { describe, expect, test } from 'bun:test';

const { mock } = (await import('bun:test')) as unknown as {
	mock: {
		module: (specifier: string, factory: () => unknown) => void;
	};
};

mock.module('expo-file-system', () => ({
	Directory: class Directory {
		uri: string;
		constructor(uri: string) {
			this.uri = uri;
		}
		static async pickDirectoryAsync() {
			return new Directory('');
		}
		create() {}
		delete() {}
		list() {
			return [];
		}
	},
	File: class File {
		uri: string;
		name: string;
		constructor(uri: string) {
			this.uri = uri;
			this.name = uri.split('/').filter(Boolean).at(-1) ?? '';
		}
		static async pickFileAsync() {
			return { canceled: true, result: null };
		}
		delete() {}
		text() {
			return '';
		}
	},
	FileMode: {},
	Paths: {
		basename(uri: string) {
			return uri.split('/').filter(Boolean).at(-1) ?? '';
		},
	},
}));

mock.module('react-native', () => ({
	Platform: {
		OS: 'ios',
		select<T>(values: { default?: T; ios?: T }) {
			return values.ios ?? values.default;
		},
	},
}));

mock.module('react-native-file-access', () => ({
	AndroidScoped: {
		appendPath(baseUri: string, segment: string) {
			return `${baseUri.replace(/\/+$/, '')}/document/${encodeURIComponent(segment)}`;
		},
	},
	FileSystem: {
		async mkdir() {},
		async readFile() {
			return '';
		},
		async stat() {
			throw new Error('not found');
		},
		async statDir() {
			return [];
		},
		async unlink() {},
	},
}));

const { resolveFilePath } = await import('../local-file-system');

const root = '/workspace';
const currentFile = '/workspace/docs/current.md';
const contentRoot =
	'content://com.android.externalstorage.documents/tree/primary%3Aworkspace';
const contentFile = `${contentRoot}/document/primary%3Aworkspace%2Fdocs%2Fcurrent.md`;

describe('resolveFilePath', () => {
	test('resolves normal relative links inside root', () => {
		expect(resolveFilePath('./next.md', currentFile, root)).toBe(
			'/workspace/docs/next.md'
		);
	});

	test('resolves parent directory links that stay inside root', () => {
		expect(resolveFilePath('../README.md', currentFile, root)).toBe(
			'/workspace/README.md'
		);
	});

	test('rejects relative traversal that escapes root', () => {
		expect(resolveFilePath('../../../secret.md', currentFile, root)).toBe(null);
	});

	test('resolves absolute-root links against root', () => {
		expect(resolveFilePath('/assets/image.png', currentFile, root)).toBe(
			'/workspace/assets/image.png'
		);
	});

	test('rejects absolute-root traversal that escapes root', () => {
		expect(resolveFilePath('/../../../secret.md', currentFile, root)).toBe(
			null
		);
	});

	test('rejects URI-encoded traversal that escapes root', () => {
		expect(resolveFilePath('%2e%2e/%2e%2e/secret.md', currentFile, root)).toBe(
			null
		);
	});

	test('ignores external URLs and app navigation fallback URLs', () => {
		expect(
			resolveFilePath('https://example.com/readme.md', currentFile, root)
		).toBe(null);
		expect(
			resolveFilePath('HTTPS://example.com/readme.md', currentFile, root)
		).toBe(null);
		expect(resolveFilePath('file:///etc/passwd', currentFile, root)).toBe(null);
		expect(resolveFilePath('FILE://etc/passwd', currentFile, root)).toBe(null);
		expect(
			resolveFilePath('madora://navigate?href=./next.md', currentFile, root)
		).toBe(null);
	});

	test('ignores same-document anchors', () => {
		expect(resolveFilePath('#section', currentFile, root)).toBe(null);
	});

	test('keeps Android SAF relative links inside root', () => {
		const resolved = resolveFilePath('../README.md', contentFile, contentRoot);

		expect(resolved).toBe(
			`${contentRoot}/document/primary%3Aworkspace%2FREADME.md`
		);
	});

	test('rejects Android SAF relative traversal that escapes root', () => {
		expect(
			resolveFilePath('../../../secret.md', contentFile, contentRoot)
		).toBe(null);
	});

	test('rejects Android SAF absolute-root traversal that escapes root', () => {
		expect(
			resolveFilePath('/../../../secret.md', contentFile, contentRoot)
		).toBe(null);
	});
});
