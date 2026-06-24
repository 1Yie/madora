import { writeWorkspaceFile } from '@/invoke/explorer';
import { normalizeExplorerPath } from '@/lib/path-utils';

type EditorEntry = {
	id: string;
	filePath?: string | null;
	isDirty: () => boolean;
	save: (options?: { immediate?: boolean }) => Promise<void>;
};

export const MARKDOWN_DRAFT_STORAGE_KEY_PREFIX = 'madora-markdown-draft:';

export type StoredMarkdownDraft = {
	key: string;
	filePath: string;
	content: string;
};

const editors = new Map<string, EditorEntry>();

function normalizeDraftFilePath(filePath: string): string {
	return normalizeExplorerPath(filePath);
}

export function getMarkdownDraftStorageKey(filePath: string): string {
	return `${MARKDOWN_DRAFT_STORAGE_KEY_PREFIX}${normalizeDraftFilePath(filePath)}`;
}

function findStoredDraftKeys(filePath: string): string[] {
	const normalizedFilePath = normalizeDraftFilePath(filePath);
	const canonicalKey = getMarkdownDraftStorageKey(filePath);
	const matchingKeys = new Set<string>([canonicalKey]);

	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);
		if (!key?.startsWith(MARKDOWN_DRAFT_STORAGE_KEY_PREFIX)) {
			continue;
		}

		const storedFilePath = key.slice(MARKDOWN_DRAFT_STORAGE_KEY_PREFIX.length);
		if (!storedFilePath) {
			continue;
		}

		if (normalizeDraftFilePath(storedFilePath) === normalizedFilePath) {
			matchingKeys.add(key);
		}
	}

	return [
		canonicalKey,
		...Array.from(matchingKeys).filter((key) => key !== canonicalKey),
	];
}

export function getStoredMarkdownDraftContent(filePath: string): string | null {
	for (const key of findStoredDraftKeys(filePath)) {
		const content = window.localStorage.getItem(key);
		if (content !== null) {
			return content;
		}
	}

	return null;
}

export function removeStoredMarkdownDraft(filePath: string) {
	for (const key of findStoredDraftKeys(filePath)) {
		window.localStorage.removeItem(key);
	}
}

function getRegisteredEditorFilePaths(): Set<string> {
	return new Set(
		Array.from(editors.values())
			.map((editor) => editor.filePath)
			.filter((filePath): filePath is string => Boolean(filePath))
			.map((filePath) => normalizeDraftFilePath(filePath))
	);
}

export function getStoredMarkdownDrafts(): StoredMarkdownDraft[] {
	const drafts = new Map<string, StoredMarkdownDraft>();

	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);

		if (!key?.startsWith(MARKDOWN_DRAFT_STORAGE_KEY_PREFIX)) {
			continue;
		}

		const filePath = key.slice(MARKDOWN_DRAFT_STORAGE_KEY_PREFIX.length);
		const content = window.localStorage.getItem(key);

		if (!filePath || content === null) {
			continue;
		}

		const normalizedFilePath = normalizeDraftFilePath(filePath);
		const existing = drafts.get(normalizedFilePath);
		const draft = { key, filePath: normalizedFilePath, content };
		const canonicalKey = getMarkdownDraftStorageKey(normalizedFilePath);

		if (!existing || key === canonicalKey) {
			drafts.set(normalizedFilePath, draft);
		}
	}

	return [...drafts.values()];
}

export function clearStoredMarkdownDrafts() {
	for (const draft of getStoredMarkdownDrafts()) {
		removeStoredMarkdownDraft(draft.filePath);
	}
}

export function registerEditor(id: string, entry: Omit<EditorEntry, 'id'>) {
	editors.set(id, { id, ...entry });
}

export function unregisterEditor(id: string) {
	editors.delete(id);
}

export function isEditorDirty(filePath: string): boolean {
	for (const entry of editors.values()) {
		if (entry.filePath === filePath) {
			try {
				return entry.isDirty();
			} catch {
				return true;
			}
		}
	}

	return false;
}

export function hasUnsaved(): boolean {
	for (const entry of editors.values()) {
		try {
			if (entry.isDirty()) return true;
		} catch {
			return true;
		}
	}

	const registeredFilePaths = getRegisteredEditorFilePaths();

	return getStoredMarkdownDrafts().some(
		(draft) => !registeredFilePaths.has(draft.filePath)
	);
}

export async function saveAll(opts?: { timeoutMs?: number }) {
	const timeoutMs = opts?.timeoutMs ?? 10000;

	const dirty = Array.from(editors.values()).filter((e) => {
		try {
			return e.isDirty();
		} catch {
			return true;
		}
	});

	const results = await Promise.all(
		dirty.map(async (e) => {
			try {
				const savePromise = e.save({ immediate: true });

				if (timeoutMs > 0) {
					const race = Promise.race([
						savePromise,
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error('timeout')), timeoutMs)
						),
					]);

					await race;
				} else {
					await savePromise;
				}

				return { id: e.id, filePath: e.filePath ?? null, ok: true };
			} catch (error) {
				return { id: e.id, filePath: e.filePath ?? null, ok: false, error };
			}
		})
	);

	const registeredFilePaths = getRegisteredEditorFilePaths();
	const draftsToSave = getStoredMarkdownDrafts().filter(
		(draft) => !registeredFilePaths.has(draft.filePath)
	);

	const draftResults = await Promise.all(
		draftsToSave.map(async (draft) => {
			try {
				const savePromise = writeWorkspaceFile({
					content: draft.content,
					path: draft.filePath,
				});

				if (timeoutMs > 0) {
					const race = Promise.race([
						savePromise,
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error('timeout')), timeoutMs)
						),
					]);

					await race;
				} else {
					await savePromise;
				}

				removeStoredMarkdownDraft(draft.filePath);
				window.dispatchEvent(
					new CustomEvent('workspace-file-saved', {
						detail: { filePath: draft.filePath },
					})
				);

				return {
					id: `draft:${draft.filePath}`,
					filePath: draft.filePath,
					ok: true,
				};
			} catch (error) {
				return {
					id: `draft:${draft.filePath}`,
					filePath: draft.filePath,
					ok: false,
					error,
				};
			}
		})
	);

	return [...results, ...draftResults];
}
