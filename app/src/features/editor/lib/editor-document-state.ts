import type { EditorDocument } from '../types';

export function isDocumentDirty(document: EditorDocument | null | undefined) {
	if (!document || document.lastSavedContent === undefined) return false;
	return document.content !== document.lastSavedContent;
}

export function getDirtyDocuments(documents: EditorDocument[]) {
	return documents.filter(isDocumentDirty);
}

export function hasDirtyDocuments(documents: EditorDocument[]) {
	return documents.some(isDocumentDirty);
}

export function markDocumentSaved(
	documents: EditorDocument[],
	documentId: string,
	content: string
) {
	return documents.map((document) =>
		document.id === documentId
			? { ...document, lastSavedContent: content }
			: document
	);
}

export function discardDocumentChanges(
	documents: EditorDocument[],
	updatedAt: number
) {
	return documents.map((document) =>
		document.lastSavedContent === undefined
			? document
			: {
					...document,
					content: document.lastSavedContent,
					updatedAt,
				}
	);
}

export function updateDocumentContent(
	documents: EditorDocument[],
	documentId: string | null,
	content: string,
	updatedAt: number,
	options?: { markSaved?: boolean }
) {
	if (!documentId) return documents;

	return documents.map((document) =>
		document.id === documentId
			? {
					...document,
					content,
					lastSavedContent: options?.markSaved
						? content
						: document.lastSavedContent,
					updatedAt,
				}
			: document
	);
}
