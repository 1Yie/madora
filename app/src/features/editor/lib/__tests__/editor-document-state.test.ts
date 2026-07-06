import { describe, expect, test } from 'bun:test';

import type { EditorDocument } from '../../types';
import {
	discardDocumentChanges,
	getDirtyDocuments,
	hasDirtyDocuments,
	isDocumentDirty,
	markDocumentSaved,
	updateDocumentContent,
} from '../editor-document-state';

function createDocument(
	overrides: Partial<EditorDocument> = {}
): EditorDocument {
	return {
		content: 'saved',
		fileKind: 'markdown',
		id: 'doc.md',
		lastSavedContent: 'saved',
		path: 'doc.md',
		readOnly: false,
		relativePath: 'doc.md',
		title: 'doc.md',
		updatedAt: 1,
		...overrides,
	};
}

describe('editor document state', () => {
	test('detects dirty documents only when a saved snapshot exists and changed', () => {
		expect(isDocumentDirty(null)).toBe(false);
		expect(isDocumentDirty(createDocument())).toBe(false);
		expect(isDocumentDirty(createDocument({ content: 'draft' }))).toBe(true);
		expect(
			isDocumentDirty(
				createDocument({
					content: 'draft',
					lastSavedContent: undefined,
				})
			)
		).toBe(false);
	});

	test('finds dirty documents across a workspace', () => {
		const clean = createDocument({ id: 'clean.md' });
		const dirty = createDocument({ content: 'draft', id: 'dirty.md' });
		const transient = createDocument({
			content: 'draft',
			id: 'transient.md',
			lastSavedContent: undefined,
		});

		expect(hasDirtyDocuments([clean, dirty, transient])).toBe(true);
		expect(getDirtyDocuments([clean, dirty, transient])).toEqual([dirty]);
	});

	test('editing preserves last saved content unless marked saved', () => {
		const document = createDocument();
		const edited = updateDocumentContent([document], document.id, 'draft', 2);

		expect(edited[0]).toMatchObject({
			content: 'draft',
			lastSavedContent: 'saved',
			updatedAt: 2,
		});
		expect(isDocumentDirty(edited[0])).toBe(true);

		const markedSaved = updateDocumentContent(
			edited,
			document.id,
			'remote draft',
			3,
			{ markSaved: true }
		);
		expect(markedSaved[0]).toMatchObject({
			content: 'remote draft',
			lastSavedContent: 'remote draft',
			updatedAt: 3,
		});
		expect(isDocumentDirty(markedSaved[0])).toBe(false);
	});

	test('manual save updates the saved snapshot', () => {
		const edited = createDocument({ content: 'draft' });
		const saved = markDocumentSaved([edited], edited.id, edited.content);

		expect(saved[0].lastSavedContent).toBe('draft');
		expect(isDocumentDirty(saved[0])).toBe(false);
	});

	test('discard restores dirty documents without touching unsaved-only documents', () => {
		const dirty = createDocument({ content: 'draft', id: 'dirty.md' });
		const transient = createDocument({
			content: 'draft',
			id: 'transient.md',
			lastSavedContent: undefined,
		});

		const discarded = discardDocumentChanges([dirty, transient], 9);

		expect(discarded[0]).toMatchObject({
			content: 'saved',
			updatedAt: 9,
		});
		expect(discarded[1]).toBe(transient);
	});
});
