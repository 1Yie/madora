import { invoke } from '@tauri-apps/api/core';

/** Checks whether a file or directory exists on the filesystem. */
export async function pathExists(
	rootPath: string,
	path: string
): Promise<boolean> {
	return invoke<boolean>('path_exists', { rootPath, path });
}

/** Returns the current OS theme mode and system accent color. */
export async function getSystemTheme(): Promise<{
	scheme: string;
	accent?: string | null;
}> {
	return invoke<{ scheme: string; accent?: string | null }>('get_system_theme');
}

/** Shows the main application window (called once on startup). */
export async function showWindow(): Promise<void> {
	return invoke('show_window');
}
