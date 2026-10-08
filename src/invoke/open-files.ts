import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const OPEN_FILES_EVENT = 'madora-open-files';

/**
 * Markdown files the OS asked Madora to open ("Open with", a double-click once
 * Madora is the default, `madora note.md`). Each file is returned once.
 */
export async function takePendingOpenFiles(): Promise<string[]> {
	const files = await invoke<string[] | undefined>('take_pending_open_files');
	return Array.isArray(files) ? files : [];
}

/**
 * Calls `handler` whenever new files were queued while the app is running.
 * Returns an unlisten function.
 */
export async function onOpenFilesQueued(
	handler: () => void
): Promise<() => void> {
	return listen(OPEN_FILES_EVENT, () => handler());
}
