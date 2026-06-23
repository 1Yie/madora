import { invoke } from '@tauri-apps/api/core';
import type { AppLocale } from '@/i18n/locale';

/** Checks whether a file or directory exists on the filesystem. */
export async function pathExists(
	rootPath: string,
	path: string
): Promise<boolean> {
	return invoke<boolean>('path_exists', { rootPath, path });
}

/** Checks whether an absolute path exists on the filesystem (no workspace root required). */
export async function absolutePathExists(path: string): Promise<boolean> {
	return invoke<boolean>('absolute_path_exists', { path });
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

/** Hides the main application window while keeping the app running. */
export async function hideWindow(): Promise<void> {
	return invoke('hide_window');
}

/** Quits the whole application process. */
export async function quitApp(): Promise<void> {
	return invoke('quit_app');
}

/** Updates the backend locale used for Rust-side messages. */
export async function setAppLocale(locale: AppLocale): Promise<void> {
	return invoke('set_app_locale', { locale });
}
