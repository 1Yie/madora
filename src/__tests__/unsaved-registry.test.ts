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

describe('unsaved-registry in a one-off document window', () => {
	const otherProcessDraft = 'C:/workspace/left-by-the-full-app.md';

	beforeEach(async () => {
		window.localStorage.clear();
		mockWriteWorkspaceFile.mockReset();
		mockWriteWorkspaceFile.mockResolvedValue(undefined);
		const { setLaunchMode } = await import('@/lib/launch-mode');
		setLaunchMode('document');
	});

	afterEach(async () => {
		const { setLaunchMode } = await import('@/lib/launch-mode');
		setLaunchMode('full');
		window.localStorage.clear();
	});

	it('does not claim drafts of files it does not have open', async () => {
		// localStorage is shared by every Madora process, so a draft the full
		// app left behind is not this window's unsaved work.
		window.localStorage.setItem(
			getMarkdownDraftStorageKey(otherProcessDraft),
			'unsaved elsewhere'
		);

		expect(hasUnsaved()).toBe(false);
		expect(await saveAll()).toEqual([]);
		expect(mockWriteWorkspaceFile).not.toHaveBeenCalled();
		expect(
			window.localStorage.getItem(getMarkdownDraftStorageKey(otherProcessDraft))
		).toBe('unsaved elsewhere');
	});

	it('discarding only drops the drafts of its own open files', async () => {
		const { clearStoredMarkdownDrafts } =
			await import('@/lib/unsaved-registry');
		const ownPath = 'C:/docs/own.md';
		window.localStorage.setItem(getMarkdownDraftStorageKey(ownPath), 'mine');
		window.localStorage.setItem(
			getMarkdownDraftStorageKey(otherProcessDraft),
			'unsaved elsewhere'
		);
		registerEditor('editor:own', {
			filePath: ownPath,
			isDirty: () => true,
			save: async () => undefined,
		});

		try {
			clearStoredMarkdownDrafts();
		} finally {
			unregisterEditor('editor:own');
		}

		expect(
			window.localStorage.getItem(getMarkdownDraftStorageKey(ownPath))
		).toBeNull();
		expect(
			window.localStorage.getItem(getMarkdownDraftStorageKey(otherProcessDraft))
		).toBe('unsaved elsewhere');
	});

	it('still reports its own dirty editors', () => {
		registerEditor('editor:dirty', {
			filePath: 'C:/docs/own.md',
			isDirty: () => true,
			save: async () => undefined,
		});

		try {
			expect(hasUnsaved()).toBe(true);
		} finally {
			unregisterEditor('editor:dirty');
		}
	});
});
