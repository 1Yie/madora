import { invoke } from "@tauri-apps/api/core";

type EditorEntry = {
  id: string;
  filePath?: string | null;
  isDirty: () => boolean;
  save: (options?: { immediate?: boolean }) => Promise<void>;
};

export const MARKDOWN_DRAFT_STORAGE_KEY_PREFIX = "madora-markdown-draft:";

export type StoredMarkdownDraft = {
  key: string;
  filePath: string;
  content: string;
};

const editors = new Map<string, EditorEntry>();

function getRegisteredEditorFilePaths(): Set<string> {
  return new Set(
    Array.from(editors.values())
      .map((editor) => editor.filePath)
      .filter((filePath): filePath is string => Boolean(filePath)),
  );
}

export function getStoredMarkdownDrafts(): StoredMarkdownDraft[] {
  const drafts: StoredMarkdownDraft[] = [];

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

    drafts.push({ key, filePath, content });
  }

  return drafts;
}

export function clearStoredMarkdownDrafts() {
  for (const draft of getStoredMarkdownDrafts()) {
    window.localStorage.removeItem(draft.key);
  }
}

export function registerEditor(id: string, entry: Omit<EditorEntry, "id">) {
  editors.set(id, { id, ...entry });
}

export function unregisterEditor(id: string) {
  editors.delete(id);
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

  return getStoredMarkdownDrafts().some((draft) => !registeredFilePaths.has(draft.filePath));
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
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
          ]);

          await race;
        } else {
          await savePromise;
        }

        return { id: e.id, filePath: e.filePath ?? null, ok: true };
      } catch (error) {
        return { id: e.id, filePath: e.filePath ?? null, ok: false, error };
      }
    }),
  );

  const registeredFilePaths = getRegisteredEditorFilePaths();
  const draftsToSave = getStoredMarkdownDrafts().filter(
    (draft) => !registeredFilePaths.has(draft.filePath),
  );

  const draftResults = await Promise.all(
    draftsToSave.map(async (draft) => {
      try {
        const savePromise = invoke("write_workspace_file", {
          content: draft.content,
          path: draft.filePath,
        });

        if (timeoutMs > 0) {
          const race = Promise.race([
            savePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
          ]);

          await race;
        } else {
          await savePromise;
        }

        window.localStorage.removeItem(draft.key);
        window.dispatchEvent(
          new CustomEvent("workspace-file-saved", {
            detail: { filePath: draft.filePath },
          }),
        );

        return { id: `draft:${draft.filePath}`, filePath: draft.filePath, ok: true };
      } catch (error) {
        return { id: `draft:${draft.filePath}`, filePath: draft.filePath, ok: false, error };
      }
    }),
  );

  return [...results, ...draftResults];
}
