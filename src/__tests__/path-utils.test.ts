import { describe, it, expect } from 'vitest';
import {
	normalizeExplorerPath,
	isSameOrDescendantPath,
	getParentPath,
	joinExplorerPath,
	getPathName,
	replacePathBaseName,
	remapPathPrefix,
} from '@/lib/path-utils';

describe('normalizeExplorerPath', () => {
	it('normalizes unix path', () => {
		expect(normalizeExplorerPath('/home/user/docs')).toBe('/home/user/docs');
	});

	it('removes trailing slash', () => {
		expect(normalizeExplorerPath('/home/user/')).toBe('/home/user');
	});

	it('keeps root slash', () => {
		expect(normalizeExplorerPath('/')).toBe('/');
	});

	it('converts backslashes to forward slashes', () => {
		expect(normalizeExplorerPath('C:\\Users\\test')).toBe('C:/Users/test');
	});

	it('keeps windows drive root', () => {
		expect(normalizeExplorerPath('C:/')).toBe('C:/');
	});
});

describe('isSameOrDescendantPath', () => {
	it('returns true for same path', () => {
		expect(isSameOrDescendantPath('/a/b', '/a/b')).toBe(true);
	});

	it('returns true for descendant', () => {
		expect(isSameOrDescendantPath('/a/b/c', '/a/b')).toBe(true);
	});

	it('returns false for sibling', () => {
		expect(isSameOrDescendantPath('/a/c', '/a/b')).toBe(false);
	});

	it('returns false for unrelated path', () => {
		expect(isSameOrDescendantPath('/x/y', '/a/b')).toBe(false);
	});

	it('handles trailing slashes', () => {
		expect(isSameOrDescendantPath('/a/b/', '/a/b')).toBe(true);
	});
});

describe('getParentPath', () => {
	it('returns parent for child path', () => {
		expect(getParentPath('/a/b/c')).toBe('/a/b');
	});

	it('returns null for root', () => {
		expect(getParentPath('/')).toBeNull();
	});

	it('returns null for single segment', () => {
		expect(getParentPath('file')).toBeNull();
	});

	it('handles windows drive root', () => {
		expect(getParentPath('C:/')).toBeNull();
	});

	it('handles trailing slash', () => {
		expect(getParentPath('/a/b/')).toBe('/a');
	});

	it('returns root slash for top-level path', () => {
		const parent = getParentPath('/a');
		expect(parent).toBe('/');
	});
});

describe('joinExplorerPath', () => {
	it('joins with slash separator', () => {
		expect(joinExplorerPath('/home/user', 'docs')).toBe('/home/user/docs');
	});

	it('handles trailing slash on parent', () => {
		expect(joinExplorerPath('/home/user/', 'docs')).toBe('/home/user/docs');
	});

	it('handles root path', () => {
		expect(joinExplorerPath('/', 'home')).toBe('/home');
	});
});

describe('getPathName', () => {
	it('returns file name from path', () => {
		expect(getPathName('/a/b/file.txt')).toBe('file.txt');
	});

	it('returns path for root', () => {
		expect(getPathName('/')).toBe('');
	});

	it('handles trailing slash', () => {
		expect(getPathName('/a/b/')).toBe('b');
	});
});

describe('replacePathBaseName', () => {
	it('replaces base name', () => {
		expect(replacePathBaseName('/a/b/old.txt', 'new.txt')).toBe('/a/b/new.txt');
	});

	it('handles single segment', () => {
		expect(replacePathBaseName('old.txt', 'new.txt')).toBe('new.txt');
	});
});

describe('remapPathPrefix', () => {
	it('remaps prefix correctly', () => {
		expect(remapPathPrefix('/old/a/b', '/old', '/new')).toBe('/new/a/b');
	});

	it('returns null when toPath is null', () => {
		expect(remapPathPrefix('/old/a', '/old', null)).toBeNull();
	});

	it('returns original path for unrelated path', () => {
		expect(remapPathPrefix('/other/a', '/old', '/new')).toBe('/other/a');
	});

	it('returns toPath when path equals fromPath', () => {
		expect(remapPathPrefix('/old', '/old', '/new')).toBe('/new');
	});
});
