import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWriteWorkspaceFile = vi.fn();

vi.mock('@/invoke/explorer', () => ({
	writeWorkspaceFile: (...args: unknown[]) => mockWriteWorkspaceFile(...args),
}));

import {
	getMarkdownDraftStorageKey,
	hasUnsaved,
	registerEditor,
	saveAll,
	unregisterEditor,
} from '@/lib/unsaved-registry';

describe('unsaved-registry', () => {
	beforeEach(() => {
		window.localStorage.clear();
		mockWriteWorkspaceFile.mockReset();
		mockWriteWorkspaceFile.mockResolvedValue(undefined);
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	it('does not treat a normalized draft for the same open file as orphaned unsaved work', () => {
		const filePath = 'C:\\workspace\\note.md';
		const editorId = 'editor:windows-path';

		window.localStorage.setItem(
			getMarkdownDraftStorageKey('C:/workspace/note.md'),
			'already-saved'
		);

		registerEditor(editorId, {
			filePath,
			isDirty: () => false,
			save: async () => undefined,
		});

		try {
			expect(hasUnsaved()).toBe(false);
		} finally {
			unregisterEditor(editorId);
		}
	});

	it('deduplicates legacy and normalized draft keys and clears both after saveAll', async () => {
		const rawPath = 'C:\\workspace\\note.md';
		const rawKey = `madora-markdown-draft:${rawPath}`;
		const normalizedKey = getMarkdownDraftStorageKey(rawPath);

		window.localStorage.setItem(rawKey, 'hello');
		window.localStorage.setItem(normalizedKey, 'hello');

		const results = await saveAll();

		expect(mockWriteWorkspaceFile).toHaveBeenCalledTimes(1);
		expect(mockWriteWorkspaceFile).toHaveBeenCalledWith({
			content: 'hello',
			path: 'C:/workspace/note.md',
		});
		expect(results).toEqual([
			{
				id: 'draft:C:/workspace/note.md',
				filePath: 'C:/workspace/note.md',
				ok: true,
			},
		]);
		expect(window.localStorage.getItem(rawKey)).toBeNull();
		expect(window.localStorage.getItem(normalizedKey)).toBeNull();
		expect(hasUnsaved()).toBe(false);
	});
});
